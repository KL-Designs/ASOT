import { NextResponse } from 'next/server'
import type { Filter } from 'mongodb'
import fs from 'fs'

import Db from '@/lib/mongo'
import { splitOperation } from '@/lib/gallery/naming'
import { wilsonScore } from '@/lib/gallery/ranking'

/**
 * The gallery, as one flat list.
 *
 * This route used to walk storage/gallery/content with readdirSync and return
 * years holding operations holding missions holding filenames — and the page
 * immediately flattened it, because filtering, counting and sorting all want
 * one list. The tree was the storage layer's shape, not the page's.
 *
 * Now that `gallery_media` is the index, the tree has nothing left to offer:
 * it cannot carry an author, a caption, tags or a score, and building it only
 * to have the client undo it was always waste. `scripts/index-gallery.mjs`
 * wrote a document for every file already on disk, so this returns strictly
 * more than the old route did, about exactly the same photographs.
 *
 * `featured` still comes off the filesystem. The featured strip is a folder of
 * hand-picked files that J5 manages through their own tab and it was never
 * part of the archive tree.
 */

/** The two storage trees, and which URL serves each. A legacy item keeps being
 *  served by the route that has always served it — its bytes never moved, and
 *  that route already sends immutable cache headers. */
function srcFor(m: GalleryMedia): string | null {
    if (!m.storageKey) return null

    if (m.storageKey.startsWith('legacy:')) {
        const [year, operation, mission, file] = m.storageKey.slice('legacy:'.length).split('/')
        const q = new URLSearchParams({ year, operation, stage: mission, img: file })
        return `/api/gallery/fetch?${q}`
    }

    return `/api/gallery/media/${m._id.toString()}`
}

/**
 * The public archive grid: live media that is not a featured/SOTM fixture.
 *
 * `scripts/index-gallery.mjs` writes a document for the 58 files in
 * `featured/` and the one in `sotm/` too, so J5's console can manage them by
 * id (spec §6.7). They are NOT archive items: they carry no year, no
 * operation, no author and no caption, and several are the same photograph a
 * visitor can already see — dated and attributed — in the archive itself.
 * Without this clause the migration adds 59 blank, undated, partly duplicate
 * tiles to the public grid.
 *
 * Excluded by storage key rather than by giving them a non-`live` status:
 * `isPublic()` gates `/api/gallery/media/[id]`, and spec §6.7/§6.8 have Plan B
 * serve both the featured rail and the screenshot of the month BY MEDIA ID
 * through that route. A non-live status would 404 the rail for every visitor
 * and leave Plan B's library having to special-case a status nothing else
 * uses.
 *
 * `$not` also matches a document with no `storageKey` at all, which is what an
 * embed is — those must stay in the grid.
 */
const ARCHIVE_FILTER: Filter<GalleryMedia> = { status: 'live', storageKey: { $not: /^(featured|sotm):/ } }

export async function GET() {
    const [docs, tags] = await Promise.all([
        Db.galleryMedia.find(ARCHIVE_FILTER).toArray(),
        Db.galleryTags.find({ retired: false }).sort({ order: 1 }).toArray(),
    ])

    const items: GalleryItemAPI[] = docs.map(m => ({
        id: m._id.toString(),
        kind: m.kind,
        source: m.source,

        src: srcFor(m),
        poster: m.posterKey ? `/api/gallery/media/${m._id.toString()}/poster` : null,

        embedId: m.embedId ?? null,
        embedKind: m.embedKind ?? null,
        embedUrl: m.embedUrl ?? null,

        year: m.year ?? null,
        operation: m.operation ?? null,
        opLabel: m.opLabel ?? null,
        opOrder: m.operation ? splitOperation(m.operation).order : Number.MAX_SAFE_INTEGER,
        mission: m.mission ?? null,
        takenAt: m.takenAt ? m.takenAt.toISOString() : null,

        authorId: m.authorId ?? null,
        authorName: m.authorName ?? null,
        caption: m.caption ?? null,
        tags: m.tags ?? [],

        width: m.width ?? null,
        height: m.height ?? null,
        durationSec: m.durationSec ?? null,

        up: m.up ?? 0,
        down: m.down ?? 0,
        // Precomputed here rather than in the browser: the Top rated sort would
        // otherwise run this over every item on every re-sort.
        score: wilsonScore(m.up ?? 0, m.down ?? 0),

        publishedAt: m.publishedAt ? m.publishedAt.toISOString() : null,
    }))

    let featured: string[] = []
    try {
        featured = fs.readdirSync('../../storage/gallery/featured')
    } catch {
        // An absent featured folder is a normal state on a fresh checkout; the
        // strip renders nothing rather than the page failing.
    }

    return NextResponse.json({
        info: 'Gallery API',
        updated: new Date().toISOString(),
        featured,
        items,
        tags: tags.map(t => ({ slug: t.slug, label: t.label })),
    } satisfies GalleryAPI)
}
