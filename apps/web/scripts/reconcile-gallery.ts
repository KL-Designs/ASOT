/**
 * Make gallery_media and storage/gallery/content agree, by hand.
 *
 *   npm --prefix apps/web run reconcile:gallery -- --apply   # writes
 *   npm --prefix apps/web run reconcile:gallery              # dry run
 *
 * Normally run from the repo root's `npm start` menu (Migrations → Reconcile:
 * gallery disk), which does the dry-run-then-confirm flow for you.
 *
 * Until this existed, `reconcile()` had exactly two triggers, both inside
 * lib/backups.ts's restore paths. So between this branch merging and Plan B's
 * Health view shipping, the only way to heal a `storageKey` broken by a
 * hand-reorganised folder — or by anything else — was a full restic restore of
 * a tree that was not actually damaged. This is the smaller tool for that job.
 *
 * A TypeScript script under apps/web rather than a sibling .mjs in the repo
 * root's scripts/, unlike index-gallery.mjs and relocate-flat-media.mjs: those
 * two duplicate a handful of pure helpers, which is a cost worth paying, but
 * reconcile() is three hundred lines whose whole value is that ONE
 * implementation decides what matches what. A second copy in .mjs is the
 * defect this script exists to fix, written twice. tsx (already used by four
 * sibling scripts here) imports the real module instead.
 *
 * Nothing here deletes or inserts a gallery record — reconcile() does not, and
 * this adds nothing. `notIndexed` and `missingFiles` are reported for a human.
 */
import { MongoClient } from 'mongodb'
import type { Collection } from 'mongodb'

import { reconcile } from '@/lib/gallery/reconcile'
import type { ReconcileDeps } from '@/lib/gallery/reconcile'

const APPLY = process.argv.slice(2).includes('--apply')

const { MONGO_URI, MONGO_DB } = process.env
if (!MONGO_URI || !MONGO_DB) {
    console.error('MONGO_URI and MONGO_DB env vars are required.')
    process.exit(1)
}

/**
 * The media collection with its writes removed.
 *
 * reconcile() has no dry-run mode of its own and should not grow one — its two
 * restore call sites always write, and a mode flag threaded through it would
 * be a second code path nothing exercises. Withholding `updateOne` here gives
 * the same guarantee from outside: the walk, the matching and the report are
 * identical, and `relocated` lists exactly what an --apply run would write.
 */
function withoutWrites(media: Collection<GalleryMedia>): ReconcileDeps['media'] {
    return {
        find(filter, options) { return media.find(filter, options) },
        async updateOne() { return {} },
    }
}

function list(label: string, rows: string[], cap = 20): void {
    if (!rows.length) return
    console.log(`\n${label} (${rows.length}):`)
    for (const row of rows.slice(0, cap)) console.log(`  ${row}`)
    if (rows.length > cap) console.log(`  … and ${rows.length - cap} more`)
}

async function main(): Promise<void> {
    const client = new MongoClient(MONGO_URI!)
    await client.connect()
    try {
        const db = client.db(MONGO_DB!)
        const media: Collection<GalleryMedia> = db.collection('gallery_media')
        const operations: Collection<Operation> = db.collection('operations')

        const report = await reconcile({
            media: APPLY ? media : withoutWrites(media),
            operations,
        })

        console.log(
            `\nscanned: ${report.scanned}   matched by id: ${report.matchedById}   ` +
            `matched by path: ${report.matchedByPath}   unreadable: ${report.unreadable}`,
        )

        list(APPLY ? 'relocated' : 'would relocate', report.relocated.map(r => `${r.from || '(no key)'} -> ${r.to}`))
        // Reported, never inserted: a file with no record is a human's
        // decision, and Plan B's Health view is where that button will live.
        list('on disk but not indexed', report.notIndexed.map(n => n.path))
        // Reported, never deleted: a restore that failed partway leaves a tree
        // missing most of its files, and deleting the records for them would
        // destroy the index for the entire archive.
        list('indexed but no file on disk', report.missingFiles.map(m => `${m.storageKey}${m.caption ? ` — ${m.caption}` : ''}`))
        list('failed processing', report.failedProcessing.map(f => `${f.id}: ${f.error}`))

        if (APPLY) {
            // The Health view Plan B will add reads exactly this document.
            const health = db.collection('gallery_health')
            await health.replaceOne({}, report, { upsert: true })
            console.log('\nreport written to gallery_health')
        } else {
            console.log('\nDry run — nothing written. Re-run with --apply to write.')
        }
    } finally {
        await client.close()
    }
}

// Matching the sibling scripts here: a rejected promise must exit non-zero,
// or the start-menu's dry run would report success and offer to --apply a pass
// that never completed.
main().catch(err => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
})
