import { NextRequest, NextResponse } from 'next/server'
import { ObjectId, type Filter } from 'mongodb'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { resolveStorageKey } from '@/lib/gallery/paths'
import db from '@/lib/mongo'

const SOTM_DIR = path.resolve('../../storage/gallery/sotm')
const SETTING_ID = 'screenshotOfMonth'

// Matches the Media tab's own page size (lib/gallery/library-query.ts) so a
// "Load more" click behaves the same everywhere in the console, even though
// this route's browse view is a much smaller query than that one.
const LIBRARY_PAGE_SIZE = 60

async function checkAuth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    // Deliberately departmentLeads.j5, not gallery.manage — every other
    // gallery admin route uses gallery.manage, but this one has always
    // gated on the department-lead flag instead. That is a real
    // inconsistency, not a mistake to quietly fix here: widening who can
    // set the screenshot of the month is a chain-of-command decision, not a
    // refactor. See the task report for the consequence this has on the
    // library picker below.
    if (!(await hasPermission(me, 'departmentLeads.j5'))) return null
    return me
}

function str(v: unknown): string | null {
    return typeof v === 'string' ? v : null
}

/**
 * One tile for the library picker or the past-winners list. `sotmAt`/
 * `sotmCredit` are null for a plain browse tile and populated for a winner.
 */
function toTile(m: GalleryMedia): SotmMediaTileAPI {
    return {
        id: m._id.toString(),
        src: `/api/gallery/media/${m._id.toString()}`,
        caption: m.caption ?? null,
        opLabel: m.opLabel ?? null,
        sotmAt: m.sotmAt ? m.sotmAt.toISOString() : null,
        sotmCredit: m.sotmCredit ?? null,
    }
}

/**
 * GET — three things behind one verb, distinguished by `?view=`:
 *
 *  - (default) the current pick, exactly as before: the flat siteSettings
 *    document, or null. Unauthenticated — this has always been public, and
 *    still needs to be: Hero.tsx and the join page read the document
 *    straight out of Mongo rather than through this route, but
 *    useGalleryData.ts (the public gallery page) does go through it.
 *  - `history` — every media document that has ever carried an `sotmAt`,
 *    newest first, for the tab's past-winners list.
 *  - `library` — live, still images to choose from, for the "Replace from
 *    library" picker.
 *
 * The latter two are new, gallery.manage-gated data in every other tab
 * (admin/library, admin/facets) — but this route has never used that key,
 * and Step 1's note above is exactly why routing the picker through
 * gallery.manage would be wrong here: a department lead holding
 * departmentLeads.j5 without also holding gallery.manage would be able to
 * open this tab and then get a 403 from the one thing in it that does
 * something. Querying gallery_media directly, under this route's own
 * departmentLeads.j5 check, is what keeps the picker actually usable by
 * everyone who can reach the tab.
 */
export async function GET(request: NextRequest) {
    const view = new URL(request.url).searchParams.get('view')

    if (view === 'history') {
        if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const winners = await db.galleryMedia
            .find({ status: 'live', sotmAt: { $exists: true } })
            .sort({ sotmAt: -1 })
            .toArray()
        return NextResponse.json(winners.map(toTile))
    }

    if (view === 'library') {
        if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const pageParam = Number(new URL(request.url).searchParams.get('page'))
        const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 0

        // Stills only — the public pages this feeds (Hero, GalleryBanner, the
        // join masthead) all render it as a static <img> background, so a
        // video pick would just be a broken tile there.
        const filter: Filter<GalleryMedia> = { status: 'live', kind: 'image', source: 'upload' }
        const [items, total] = await Promise.all([
            db.galleryMedia.find(filter).sort({ up: -1, _id: 1 }).skip(page * LIBRARY_PAGE_SIZE).limit(LIBRARY_PAGE_SIZE).toArray(),
            db.galleryMedia.countDocuments(filter),
        ])
        return NextResponse.json({ items: items.map(toTile), total })
    }

    const doc = await db.siteSettings.findOne({ _id: SETTING_ID })
    if (!doc) return NextResponse.json(null)
    const { _id: _, ...sotm } = doc
    return NextResponse.json(sotm)
}

/**
 * PUT — replace the current pick with a media library item: `{ mediaId, credit }`.
 *
 * Writes `sotmAt`/`sotmCredit` onto the media document itself (what makes it
 * findable by the `history` view above and, per the brief, the one field the
 * migration deliberately never backfills for the file that came from
 * `sotm/`) and records the pointer in siteSettings.
 *
 * The siteSettings document is still written in the old flat shape —
 * `filename`, `dateTaken`, `operationTitle` and all — even though every one
 * of those is now derivable from the media document. Two different things
 * depend on that shape staying intact and neither goes through this route:
 * Hero.tsx / GalleryBanner.tsx / the join page read `dateTaken`/`credit`/
 * `operationTitle` straight off this document, and useGalleryData.ts (the
 * public gallery page, via the GET above) gates its whole SOTM column on
 * `filename` being truthy. `filename` here is no longer a path under
 * SOTM_DIR — see image/route.ts — it is the media's own readable filename,
 * kept purely as that truthy signal and as a download name.
 */
export async function PUT(request: NextRequest) {
    if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const mediaId = str(body?.mediaId)
    const credit = str(body?.credit)?.trim() ?? ''

    if (!mediaId || !ObjectId.isValid(mediaId)) return NextResponse.json({ error: 'mediaId is required' }, { status: 400 })
    if (!credit) return NextResponse.json({ error: 'credit is required' }, { status: 400 })

    const media = await db.galleryMedia.findOne({ _id: new ObjectId(mediaId), status: 'live' })
    if (!media?.storageKey) return NextResponse.json({ error: 'Media not found' }, { status: 404 })

    const resolved = resolveStorageKey(media.storageKey)
    if (!resolved) return NextResponse.json({ error: 'Media not found' }, { status: 404 })

    const me = await client.fetchMe().catch(() => null)
    const now = new Date()

    // Set on the media document first, siteSettings second — if the process
    // dies in between, the pointer either still names the old pick (whose
    // own sotmAt/sotmCredit are untouched) or names this one after it has
    // already gained sotmAt. Either way GET never resolves to a media
    // document that isn't actually marked as a winner.
    await db.galleryMedia.updateOne(
        { _id: media._id },
        { $set: { sotmAt: now, sotmCredit: credit } },
    )

    const record: Record<string, unknown> = {
        mediaId,
        filename: path.basename(resolved),
        credit,
        dateTaken: (media.takenAt ?? now).toISOString(),
        setAt: now.toISOString(),
        setBy: me?.id ?? 'unknown',
    }
    if (media.operationId) record.operationId = media.operationId.toString()
    if (media.opLabel) record.operationTitle = media.opLabel

    await db.siteSettings.updateOne(
        { _id: SETTING_ID },
        { $set: record },
        { upsert: true }
    )

    return NextResponse.json({ success: true })
}

/** DELETE — clear the current SOTM. */
export async function DELETE() {
    if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const existing = await db.siteSettings.findOne({ _id: SETTING_ID })
    if (existing) {
        const mediaId = str(existing.mediaId)
        const filename = str(existing.filename)

        // Only a legacy record (no mediaId) owns a dedicated file under
        // SOTM_DIR outright. A mediaId-based pick's `filename` is just a
        // display name (see the PUT handler's comment) — the bytes are a
        // library photograph that must survive clearing the pointer, not a
        // file this route is free to delete.
        if (!mediaId && filename) {
            const filePath = path.join(SOTM_DIR, filename)
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
        }
        await db.siteSettings.deleteOne({ _id: SETTING_ID })
    }

    return NextResponse.json({ success: true })
}
