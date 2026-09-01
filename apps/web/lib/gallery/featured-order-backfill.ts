import { ObjectId } from 'mongodb'
import type { AnyBulkWriteOperation, Collection } from 'mongodb'

import { planFeaturedOrder } from './featured-order'
import type { ArchiveCandidate, FeaturedCandidate, FeaturedPlacement } from './featured-order'

/**
 * Running the featured-rail backfill against the database.
 *
 * Two callers, one implementation: `scripts/backfill-featured-order.ts` (the
 * migration menu) and `POST /api/admin/gallery/featured-order-backfill` (the
 * J4 console's Tools tab). They must not be able to disagree about the guard
 * below — a second implementation of "has somebody already curated the rail?"
 * is exactly the bug that would renumber a curated rotation.
 *
 * The split is the same one `featured-order.ts` already draws and this file
 * completes: that module decides, this one reads and writes, and the callers
 * only render. Nothing here prints; nothing here reads a file. Everything it
 * matches on is already in `gallery_media`, which is what makes a run cheap
 * enough to sit behind a button.
 *
 * See `featured-order.ts` for WHY the archive document gets the slot when one
 * can be identified, and why the criterion is bytes-plus-dimensions rather
 * than a content hash.
 */

/** The fields a match is made on, plus the key that says which side a document
 *  is on. Nothing else is read, and nothing else is ever written. */
const PROJECTION = { storageKey: 1, bytes: 1, width: 1, height: 1 }

export type FeaturedOrderBackfillResult =
    /**
     * Somebody has already decided the rail — this migration or a curator in
     * the Featured tab — and nothing was read or written.
     *
     * The signal is any document at all carrying `featuredOrder`, deliberately
     * NOT "any `featured:` document carrying one": a run whose matches all
     * landed on archive documents leaves no `featured:` document carrying
     * anything, and the narrower test would then happily run a second time
     * over a curated rail.
     */
    | { status: 'already-ordered', ordered: number }
    /** No live `featured:` documents exist, so there is no rail to order.
     *  `scripts/index-gallery.mjs` is what writes them. */
    | { status: 'no-featured' }
    | {
        status: 'ok'
        /** Live `featured:` documents — the files the rail is built from. */
        featuredCount: number
        /** Live `content:`/`legacy:` images they were matched against. */
        archiveCount: number
        /** `featured:` documents excluded for not being live. Worth reporting:
         *  nothing not-live can reach the rail, so these are files in the
         *  directory that will never appear. */
        notLive: number
        /** One per featured file, in rail order. */
        placements: FeaturedPlacement[]
        /**
         * Documents actually updated, or null for a dry run.
         *
         * A value below `placements.length` after an apply means the rail is
         * partially ordered — and the guard above will refuse another pass,
         * because the documents that did land now carry `featuredOrder`. The
         * repair is the J5 console's Featured tab, not a re-run. Callers are
         * expected to say so loudly.
         */
        modifiedCount: number | null
    }

/** The filename behind a `featured:` key. The rail's order is these, ascending
 *  — see planFeaturedOrder. */
function featuredFile(key: string): string {
    return key.slice('featured:'.length)
}

export async function backfillFeaturedOrder(
    media: Collection<GalleryMedia>,
    { apply }: { apply: boolean },
): Promise<FeaturedOrderBackfillResult> {
    /* Checked before anything is read, and it is what makes this safe to leave
       in the menu — and now on a button — forever. */
    const ordered = await media.countDocuments({ featuredOrder: { $exists: true } })
    if (ordered > 0) return { status: 'already-ordered', ordered }

    const [featuredDocs, archiveDocs, notLive] = await Promise.all([
        media.find({ status: 'live', storageKey: { $regex: '^featured:' } }, { projection: PROJECTION }).toArray(),
        /* Live images only. A non-live document given a featuredOrder would
           never reach the rail — its query filters on `status: 'live'` too — so
           it would look ordered in the database and show nothing, which is the
           state this migration exists to end. Videos are excluded because a
           still in `featured/` cannot be one, and matching a video on a
           poster's byte count would be a match on the wrong bytes. */
        media.find(
            { status: 'live', kind: 'image', storageKey: { $regex: '^(content|legacy):' } },
            { projection: PROJECTION },
        ).toArray(),
        media.countDocuments({ status: { $ne: 'live' }, storageKey: { $regex: '^featured:' } }),
    ])

    if (featuredDocs.length === 0) return { status: 'no-featured' }

    const featured: FeaturedCandidate[] = []
    for (const doc of featuredDocs) {
        if (typeof doc.storageKey !== 'string') continue
        featured.push({
            id: doc._id.toString(),
            file: featuredFile(doc.storageKey),
            bytes: doc.bytes,
            width: doc.width,
            height: doc.height,
        })
    }

    const archive: ArchiveCandidate[] = []
    for (const doc of archiveDocs) {
        if (typeof doc.storageKey !== 'string') continue
        archive.push({
            id: doc._id.toString(),
            key: doc.storageKey,
            bytes: doc.bytes,
            width: doc.width,
            height: doc.height,
        })
    }

    const { placements } = planFeaturedOrder(featured, archive)

    const base = {
        status: 'ok' as const,
        featuredCount: featured.length,
        archiveCount: archive.length,
        notLive,
        placements,
    }

    if (!apply) return { ...base, modifiedCount: null }

    const operations: AnyBulkWriteOperation<GalleryMedia>[] = placements.map(placement => ({
        updateOne: {
            // `$set`, emphatically. `$setOnInsert` on an existing document
            // writes nothing, which is the entire defect this repairs.
            filter: { _id: new ObjectId(placement.target === 'archive' ? placement.archiveId : placement.featuredId) },
            update: { $set: { featuredOrder: placement.order } },
        },
    }))

    const result = await media.bulkWrite(operations, { ordered: false })

    return { ...base, modifiedCount: result.modifiedCount }
}
