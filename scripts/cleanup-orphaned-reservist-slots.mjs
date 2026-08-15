// One-off cleanup: deletes reservist positions (category activeReservist/
// inactiveReservist) with userId: null — orphaned "Unlinked slot" rows left
// behind by a bug in lib/orbat/move.ts's applyOrbatMove(), which used to
// null out a vacated reservist slot's userId instead of deleting the
// position outright whenever a reservist got assigned into a platoon
// position. That code path is now fixed to delete the slot directly, so
// this only needs to run once to clear out what already accumulated.
//
// Usage:
//   node --env-file=.env scripts/cleanup-orphaned-reservist-slots.mjs            (dry run — reports only)
//   node --env-file=.env scripts/cleanup-orphaned-reservist-slots.mjs --apply    (deletes)

import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const RESERVIST_CATEGORIES = ['activeReservist', 'inactiveReservist']

async function main() {
    if (!process.env.MONGO_URI || !process.env.MONGO_DB) {
        console.error('MONGO_URI and MONGO_DB must be set (run with --env-file=.env)')
        process.exit(1)
    }

    const client = new MongoClient(process.env.MONGO_URI)
    await client.connect()
    const db = client.db(process.env.MONGO_DB)
    const positions = db.collection('orbat_positions')

    const orphaned = await positions.find({ category: { $in: RESERVIST_CATEGORIES }, userId: null }).toArray()
    console.log(`Orphaned (userId: null) reservist positions: ${orphaned.length}`)
    for (const pos of orphaned) {
        console.log(`[delete] position ${pos._id} (${pos.category}, positionOrder ${pos.positionOrder})`)
    }

    if (APPLY && orphaned.length > 0) {
        const result = await positions.deleteMany({ category: { $in: RESERVIST_CATEGORIES }, userId: null })
        console.log(`Deleted ${result.deletedCount} position(s).`)
    }

    console.log('')
    if (!APPLY) {
        console.log('DRY RUN — no changes written. Re-run with --apply to delete them.')
    } else {
        console.log('Done.')
    }

    await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
