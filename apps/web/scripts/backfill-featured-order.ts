/**
 * Give the featured rail its order back.
 *
 *   npm --prefix apps/web run backfill:featured-order -- --apply   # writes
 *   npm --prefix apps/web run backfill:featured-order              # dry run
 *
 * Normally run from the repo root's `npm start` menu (Migrations -> Backfill:
 * featured rail order), which does the dry-run-then-confirm flow for you.
 *
 * WHY THIS EXISTS. `storage/gallery/featured` holds 58 photographs and the
 * public rail shows none of them. The rail's only input is `featuredOrder` on
 * `gallery_media` (`app/api/gallery/route.ts` queries
 * `featuredOrder: { $exists: true }`), and no document carries it.
 * `scripts/index-gallery.mjs` does compute one per featured file, but it hands
 * its facets to `$setOnInsert` — right for a caption or a tag, since a re-run
 * must not stomp a reviewer's edit, and fatal for this one: those documents
 * were inserted by an earlier run that did not carry `featuredOrder`, so every
 * run since has been a deliberate no-op on them. That is what this bridges, and
 * it is why the write below is `$set` and not `$setOnInsert`.
 *
 * WHAT IT WRITES. `featuredOrder`, on one document per featured file, and
 * nothing else. No document is created, deleted, merged or edited in any other
 * field — in particular a matched ARCHIVE document is touched only in
 * `featuredOrder`; its caption, tags, author, operation and storage key are
 * left exactly as they are.
 *
 * THE MATCHING, in one line: several featured files are the same photograph the
 * archive already holds — dated, attributed and captioned — and the rail slot
 * goes to the archive document when one can be identified beyond doubt, so the
 * tile carries its credit. `lib/gallery/featured-order.ts` is the whole of that
 * decision and documents the criterion (exact bytes + exact pixel dimensions,
 * off fields the indexer already wrote) and why it is not a content hash. The
 * dry run prints every one of the 58 with the bucket it fell into, because
 * whether that matching is trustworthy is a judgement for the operator, not
 * for this script.
 *
 * IDEMPOTENCE, and the one thing it must never do. Re-running it must not
 * renumber a rail J5 has since curated in the console's Featured tab. The
 * signal is any document at all carrying `featuredOrder`: the field exists
 * nowhere in the database today, `PUT /api/gallery/admin/featured/order` is the
 * only route that writes it, and a successful run of this migration also
 * leaves it set. So one occurrence anywhere means somebody — this script or a
 * curator — has already decided the rail, and this exits without writing.
 * Deliberately NOT "any `featured:` document carrying one", because a run whose
 * matches all landed on archive documents would leave no `featured:` document
 * carrying anything and would then happily run a second time over a curated
 * rail.
 *
 * It reads no files. Everything it matches on is already in `gallery_media`,
 * which is what makes a run cheap and what keeps it from depending on the
 * working directory the way the sibling gallery migrations do.
 */
import { MongoClient, ObjectId } from 'mongodb'
import type { AnyBulkWriteOperation, Collection } from 'mongodb'

import { planFeaturedOrder } from '@/lib/gallery/featured-order'
import type { ArchiveCandidate, FeaturedCandidate, FeaturedPlacement } from '@/lib/gallery/featured-order'

const APPLY = process.argv.slice(2).includes('--apply')

const { MONGO_URI, MONGO_DB } = process.env
if (!MONGO_URI || !MONGO_DB) {
    console.error('MONGO_URI and MONGO_DB env vars are required.')
    process.exit(1)
}

const PROJECTION = { storageKey: 1, bytes: 1, width: 1, height: 1 }

/** The filename behind a `featured:` key. The rail's order is these, ascending
 *  — see planFeaturedOrder. */
function featuredFile(key: string): string {
    return key.slice('featured:'.length)
}

function describe(placement: FeaturedPlacement): string {
    if (placement.target === 'archive') {
        return `  ${String(placement.order).padStart(2)}  ${placement.featuredFile}\n        -> archive ${placement.archiveKey}`
    }

    const detail = placement.candidates.length ? `\n        candidates: ${placement.candidates.join(', ')}` : ''
    return `  ${String(placement.order).padStart(2)}  ${placement.featuredFile}\n        -> itself (${placement.reason})${detail}`
}

async function main(): Promise<void> {
    const client = new MongoClient(MONGO_URI!)
    await client.connect()
    try {
        const db = client.db(MONGO_DB!)
        const media: Collection<GalleryMedia> = db.collection('gallery_media')

        /* Checked before anything is read, and it is the guard that makes this
           safe to leave in the migration menu forever. See IDEMPOTENCE above
           for why the test is "any document", not "any featured: document". */
        const alreadyOrdered = await media.countDocuments({ featuredOrder: { $exists: true } })
        if (alreadyOrdered > 0) {
            console.log(`${alreadyOrdered} document(s) already carry featuredOrder — the rail has an order.`)
            console.log('Nothing written. This migration only ever backfills an EMPTY rail; re-ordering is')
            console.log("the J5 console's Featured tab (PUT /api/gallery/admin/featured/order), which is the")
            console.log('only thing allowed to renumber a rotation somebody curated.')
            return
        }

        const [featuredDocs, archiveDocs, notLive] = await Promise.all([
            media.find({ status: 'live', storageKey: { $regex: '^featured:' } }, { projection: PROJECTION }).toArray(),
            /* Live images only. A non-live document given a featuredOrder would
               never reach the rail — its query filters on `status: 'live'` too —
               so it would look ordered in the database and show nothing, which
               is the state this migration exists to end. Videos are excluded
               because a still in `featured/` cannot be one, and matching a video
               on a poster's byte count would be a match on the wrong bytes. */
            media.find(
                { status: 'live', kind: 'image', storageKey: { $regex: '^(content|legacy):' } },
                { projection: PROJECTION },
            ).toArray(),
            media.countDocuments({ status: { $ne: 'live' }, storageKey: { $regex: '^featured:' } }),
        ])

        if (featuredDocs.length === 0) {
            console.error('No live documents with a `featured:` storage key.')
            console.error('Run Migrations -> Index: gallery media first; it is what writes them.')
            process.exitCode = 1
            return
        }

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

        const toArchive = placements.filter(p => p.target === 'archive')
        const toSelf = placements.filter(p => p.target !== 'archive')

        console.log(`\n${featured.length} featured file(s), matched against ${archive.length} archive image(s).`)
        if (notLive > 0) {
            console.warn(`${notLive} featured: document(s) are not live and were left out — nothing not-live can reach the rail.`)
        }

        /* Printed as two full lists rather than a pair of counts. Deciding
           whether the matching is trustworthy is the reason this runs dry
           first, and a reader cannot do that from "41 matched". */
        console.log(`\n${toArchive.length} handed to an archive original (the tile gets its caption and credit):`)
        for (const placement of toArchive) console.log(describe(placement))

        console.log(`\n${toSelf.length} kept their own tile:`)
        for (const placement of toSelf) console.log(describe(placement))

        if (!APPLY) {
            console.log(`\nDry run — nothing written. Would set featuredOrder on ${placements.length} document(s).`)
            console.log('Read the two lists above, then re-run with --apply to write.')
            return
        }

        const operations: AnyBulkWriteOperation<GalleryMedia>[] = []
        for (const placement of placements) {
            const id = placement.target === 'archive' ? placement.archiveId : placement.featuredId
            operations.push({
                updateOne: {
                    // `$set`, emphatically. `$setOnInsert` on an existing
                    // document writes nothing, which is the entire defect this
                    // migration exists to repair.
                    filter: { _id: new ObjectId(id) },
                    update: { $set: { featuredOrder: placement.order } },
                },
            })
        }

        const result = await media.bulkWrite(operations, { ordered: false })
        console.log(`\nset featuredOrder on ${result.modifiedCount} document(s).`)

        if (result.modifiedCount < operations.length) {
            /* Loud, and with the recovery named. A partial rail is a rail with
               holes in its sequence, and the guard at the top of this file
               would refuse a second run — so the operator has to know that the
               fix is the console's Featured tab, not another pass of this. */
            console.error(`\nonly ${result.modifiedCount} of ${operations.length} document(s) were updated.`)
            console.error('The rail is partially ordered. This migration will NOT run again (documents now')
            console.error("carry featuredOrder) — finish the rotation in the J5 console's Featured tab.")
            process.exitCode = 1
        }
    } finally {
        await client.close()
    }
}

// Matching the sibling gallery migrations: a rejected promise must exit
// non-zero, or the start menu reports the dry run as a success and offers to
// --apply a pass that never completed.
main().catch(err => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
})
