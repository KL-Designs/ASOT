/**
 * Give the featured rail its order back.
 *
 *   npm --prefix apps/web run backfill:featured-order -- --apply   # writes
 *   npm --prefix apps/web run backfill:featured-order              # dry run
 *
 * Normally run from the repo root's `npm start` menu (Migrations -> Backfill:
 * featured rail order), which does the dry-run-then-confirm flow for you. The
 * J4 console's Tools tab has a button that does the same thing through
 * `POST /api/admin/gallery/featured-order-backfill`; both go through
 * `lib/gallery/featured-order-backfill.ts`, so neither can drift from the
 * other's idea of when it is safe to write.
 *
 * WHY THIS EXISTS. `storage/gallery/featured` holds 58 photographs and the
 * public rail shows none of them. The rail's only input is `featuredOrder` on
 * `gallery_media` (`app/api/gallery/route.ts` queries
 * `featuredOrder: { $exists: true }`), and no document carries it.
 * `scripts/index-gallery.mjs` does compute one per featured file, but it hands
 * its facets to `$setOnInsert` — right for a caption or a tag, since a re-run
 * must not stomp a reviewer's edit, and fatal for this one: those documents
 * were inserted by an earlier run that did not carry `featuredOrder`, so every
 * run since has been a deliberate no-op on them.
 *
 * WHAT IT WRITES, THE MATCHING, and IDEMPOTENCE all live in
 * `lib/gallery/featured-order-backfill.ts` and `lib/gallery/featured-order.ts`
 * now. This file is the terminal half: it connects, calls, and prints. The dry
 * run prints every one of the 58 with the bucket it fell into, because whether
 * that matching is trustworthy is a judgement for the operator, not for this
 * script.
 */
import { MongoClient } from 'mongodb'
import type { Collection } from 'mongodb'

import { backfillFeaturedOrder } from '@/lib/gallery/featured-order-backfill'
import type { FeaturedPlacement } from '@/lib/gallery/featured-order'

const APPLY = process.argv.slice(2).includes('--apply')

const { MONGO_URI, MONGO_DB } = process.env
if (!MONGO_URI || !MONGO_DB) {
    console.error('MONGO_URI and MONGO_DB env vars are required.')
    process.exit(1)
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
        const media: Collection<GalleryMedia> = client.db(MONGO_DB!).collection('gallery_media')
        const result = await backfillFeaturedOrder(media, { apply: APPLY })

        if (result.status === 'already-ordered') {
            console.log(`${result.ordered} document(s) already carry featuredOrder — the rail has an order.`)
            console.log('Nothing written. This migration only ever backfills an EMPTY rail; re-ordering is')
            console.log("the J5 console's Featured tab (PUT /api/gallery/admin/featured/order), which is the")
            console.log('only thing allowed to renumber a rotation somebody curated.')
            return
        }

        if (result.status === 'no-featured') {
            console.error('No live documents with a `featured:` storage key.')
            console.error('Run Migrations -> Index: gallery media first; it is what writes them.')
            process.exitCode = 1
            return
        }

        const toArchive = result.placements.filter(p => p.target === 'archive')
        const toSelf = result.placements.filter(p => p.target !== 'archive')

        console.log(`\n${result.featuredCount} featured file(s), matched against ${result.archiveCount} archive image(s).`)
        if (result.notLive > 0) {
            console.warn(`${result.notLive} featured: document(s) are not live and were left out — nothing not-live can reach the rail.`)
        }

        /* Printed as two full lists rather than a pair of counts. Deciding
           whether the matching is trustworthy is the reason this runs dry
           first, and a reader cannot do that from "41 matched". */
        console.log(`\n${toArchive.length} handed to an archive original (the tile gets its caption and credit):`)
        for (const placement of toArchive) console.log(describe(placement))

        console.log(`\n${toSelf.length} kept their own tile:`)
        for (const placement of toSelf) console.log(describe(placement))

        if (result.modifiedCount === null) {
            console.log(`\nDry run — nothing written. Would set featuredOrder on ${result.placements.length} document(s).`)
            console.log('Read the two lists above, then re-run with --apply to write.')
            return
        }

        console.log(`\nset featuredOrder on ${result.modifiedCount} document(s).`)

        if (result.modifiedCount < result.placements.length) {
            /* Loud, and with the recovery named. A partial rail is a rail with
               holes in its sequence, and the guard would refuse a second run —
               so the operator has to know that the fix is the console's
               Featured tab, not another pass of this. */
            console.error(`\nonly ${result.modifiedCount} of ${result.placements.length} document(s) were updated.`)
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
