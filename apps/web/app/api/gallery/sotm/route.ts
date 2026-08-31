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
 * Enter the outgoing pick into the past-winners record before the pointer
 * that names it is overwritten.
 *
 * Only a legacy record needs this. A library pick gained `sotmAt` the moment
 * it was set (see PUT below), but the file migrated from `storage/gallery/
 * sotm` never did — the migration deliberately left it unset because a file
 * mtime would have been a fabricated date. Its own `setAt` is not a
 * fabrication: it is when this application recorded the pick.
 *
 * Without this, the first library pick ever made deletes the previous
 * winner from history permanently — the pointer stops naming it, no media
 * document is flagged, and no UI anywhere can create the flag afterwards.
 * Spec 6.8 requires past winners to stay listed.
 */
async function stampOutgoingLegacyWinner(existing: Record<string, unknown> | null): Promise<void> {
    if (!existing) return
    // A mediaId-based record is already flagged on its own media document.
    if (str(existing.mediaId)) return

    const filename = str(existing.filename)
    if (!filename) return

    const setAt = str(existing.setAt)
    const stampedAt = setAt ? new Date(setAt) : null
    // No usable recorded date means there is nothing honest to write. Losing
    // the row is better than inventing the month it won.
    if (!stampedAt || Number.isNaN(stampedAt.getTime())) return

    await db.galleryMedia.updateOne(
        // `sotm:{file}` is the key the migration indexed this directory
        // under (scripts/index-gallery.mjs). basename() because the stored
        // string is a display name with no guarantee of being a bare one.
        // The `$exists: false` guard means a real recorded date is never
        // overwritten by this backfill.
        { storageKey: `sotm:${path.basename(filename)}`, sotmAt: { $exists: false } },
        { $set: { sotmAt: stampedAt, sotmCredit: str(existing.credit) ?? '' } },
    )
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
 * Records the pointer in siteSettings and writes `sotmAt`/`sotmCredit` onto
 * the media document itself (what makes it findable by the `history` view
 * above and, per the brief, the one field the migration deliberately never
 * backfills for the file that came from `sotm/` — which is why the outgoing
 * pick is stamped here too, see stampOutgoingLegacyWinner).
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

    // `kind`/`source` repeat the browse view's filter above rather than
    // trusting the picker to have applied it. Without them a curl PUT — or a
    // UI regression that widens the picker — can point SOTM at an mp4:
    // image/route.ts would then readFileSync the whole clip into heap on
    // every request and serve it as image/jpeg, and Hero.tsx,
    // GalleryBanner.tsx and the join page would each render it in an <img>.
    // One accepted write, three broken public mastheads.
    const media = await db.galleryMedia.findOne({ _id: new ObjectId(mediaId), status: 'live', kind: 'image', source: 'upload' })
    if (!media?.storageKey) return NextResponse.json({ error: 'Media not found' }, { status: 404 })

    const resolved = resolveStorageKey(media.storageKey)
    if (!resolved) return NextResponse.json({ error: 'Media not found' }, { status: 404 })

    const me = await client.fetchMe().catch(() => null)
    const now = new Date()

    // Read the outgoing pointer before it is overwritten — after the write
    // below there is no way left to find out what it named.
    const outgoing = await db.siteSettings.findOne({ _id: SETTING_ID })
    await stampOutgoingLegacyWinner(outgoing)

    const record: Record<string, unknown> = {
        mediaId,
        filename: path.basename(resolved),
        credit,
        setAt: now.toISOString(),
        setBy: me?.id ?? 'unknown',
    }
    const clear: Record<string, ''> = {}

    /* $unset rather than simply not $setting: this is an upsert onto the
       outgoing pick's own document, so a field the new pick has no value for
       would otherwise keep the previous winner's — the homepage would
       caption the new photograph with the old one's operation.

       dateTaken is omitted outright when takenAt is null (the normal state
       for an item whose operation is Unknown, and those are in the picker).
       Defaulting it to `now` publishes today's date under the label "Taken"
       on the homepage, the gallery banner and the lightbox for a screenshot
       that may be three years old — the same invention the brief refused for
       sotmAt, arrived at from the other direction. */
    const put = (key: string, value: string | null | undefined) => {
        if (value) record[key] = value
        else clear[key] = ''
    }
    put('dateTaken', media.takenAt?.toISOString())
    put('operationId', media.operationId?.toString())
    put('operationTitle', media.opLabel)

    // siteSettings first, the media flag second — the reverse of the order
    // this originally used, and deliberately so (the same choice
    // admin/featured/order/route.ts makes for the same reason).
    //
    // If the process dies between the two, a written pointer with an
    // unflagged media document means only "the current pick is missing from
    // Past Winners until the next write": invisible on every public page and
    // repaired by re-picking. The other order fails into a media document
    // flagged as a winner that was never displayed anywhere, and nothing in
    // this codebase ever $unsets sotmAt — DELETE deliberately does not — so
    // that phantom row is permanent and uncorrectable from the console.
    await db.siteSettings.updateOne(
        { _id: SETTING_ID },
        Object.keys(clear).length ? { $set: record, $unset: clear } : { $set: record },
        { upsert: true }
    )

    await db.galleryMedia.updateOne(
        { _id: media._id },
        { $set: { sotmAt: now, sotmCredit: credit } },
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
            // basename() plus the containment assertion, the same pair the
            // read side in image/route.ts uses. This is an unlinkSync on a
            // path assembled from a stored string: a `../` in that string
            // would delete a file outside SOTM_DIR entirely, and the only
            // writer that sanitised it (the removed POST) is gone.
            const filePath = path.join(SOTM_DIR, path.basename(filename))
            if (filePath.startsWith(SOTM_DIR + path.sep) && fs.existsSync(filePath)) fs.unlinkSync(filePath)
        }
        await db.siteSettings.deleteOne({ _id: SETTING_ID })
    }

    return NextResponse.json({ success: true })
}
