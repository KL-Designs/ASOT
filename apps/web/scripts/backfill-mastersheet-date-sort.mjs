// One-off migration: compute the *Sort epoch-ms companion fields
// (leavingDateSort, dateSort, issuedSort, expiresSort) on Mastersheet history
// documents that predate their introduction, so MongoDB can sort/paginate
// these collections natively instead of the app loading every record into
// memory. Future CSV imports already write these fields themselves (see the
// three mastersheet route.ts POST handlers) — this script only backfills
// documents that already existed before that change shipped.
//
// Usage: run via the repo root's `npm run menu` (Migrations category — handles the
// dry-run/apply confirm flow), or directly from apps/web:
//   node scripts/backfill-mastersheet-date-sort.mjs              (dry run — reports only)
//   node scripts/backfill-mastersheet-date-sort.mjs --apply       (writes changes)

import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')

// Kept identical to parseDateStr() in the three mastersheet route.ts files —
// update all four together if the date-parsing heuristic ever changes.
function parseDateStr(s) {
    if (!s) return 0
    const parts = s.split(/[\/\-]/)
    if (parts.length === 3) {
        const [a, b, c] = parts.map(Number)
        // DD/MM/YYYY
        if (a <= 31 && b <= 12) return new Date(c, b - 1, a).getTime() || 0
        // YYYY/MM/DD
        if (a > 31) return new Date(a, b - 1, c).getTime() || 0
    }
    return new Date(s).getTime() || 0
}

const TARGETS = [
    { collection: 'leaving_history', fields: [['leavingDate', 'leavingDateSort']] },
    { collection: 'denied_applications_hq', fields: [['date', 'dateSort']] },
    { collection: 'discipline_records', fields: [['issued', 'issuedSort'], ['expires', 'expiresSort']] },
]

async function main() {
    if (!process.env.MONGO_URI || !process.env.MONGO_DB) {
        console.error('MONGO_URI and MONGO_DB must be set (run with --env-file=.env)')
        process.exit(1)
    }

    const client = new MongoClient(process.env.MONGO_URI)
    await client.connect()
    const db = client.db(process.env.MONGO_DB)

    for (const { collection, fields } of TARGETS) {
        const col = db.collection(collection)
        const missingFilter = { $or: fields.map(([, sortField]) => ({ [sortField]: { $exists: false } })) }
        const docs = await col.find(missingFilter).toArray()

        if (docs.length === 0) {
            console.log(`${collection}: nothing to backfill.`)
            continue
        }

        console.log(`${collection}: ${docs.length} document(s) missing a sort field.`)
        if (!APPLY) {
            console.log(`  DRY RUN — would set: ${fields.map(([src, dst]) => `${dst} (from ${src})`).join(', ')}`)
            continue
        }

        let updated = 0
        for (const doc of docs) {
            const set = {}
            for (const [sourceField, sortField] of fields) {
                set[sortField] = parseDateStr(doc[sourceField] ?? '')
            }
            const result = await col.updateOne({ _id: doc._id }, { $set: set })
            if (result.modifiedCount > 0) updated++
        }
        console.log(`  Backfilled ${updated} document(s).`)
    }

    if (!APPLY) console.log('\nDry run complete — re-run with --apply to write changes.')

    await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
