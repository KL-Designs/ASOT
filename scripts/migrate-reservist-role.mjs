// One-off migration: seeds a system OrbatRole named "Reservist" (if it
// doesn't already exist — apps/web/app/api/admin/orbat/reservists/route.ts's
// ensureReservistRole() also lazily seeds it on the next reservist created,
// so this script and that code path can't race into duplicates), then sets
// roleId on every existing reservist position (category activeReservist/
// inactiveReservist) that's still null.
//
// Usage:
//   node --env-file=.env scripts/migrate-reservist-role.mjs            (dry run — reports only)
//   node --env-file=.env scripts/migrate-reservist-role.mjs --apply    (writes changes)

import { MongoClient, ObjectId } from 'mongodb'

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
    const roles = db.collection('orbat_roles')
    const positions = db.collection('orbat_positions')

    let roleId = null
    const existing = await roles.findOne({ name: 'Reservist' })
    if (existing) {
        roleId = existing._id
        console.log(`[skip] "Reservist" role already exists (${roleId})`)
    } else {
        roleId = new ObjectId()
        console.log(`[create] "Reservist" role (${roleId})`)
        if (APPLY) {
            await roles.insertOne({
                _id: roleId,
                name: 'Reservist',
                categories: [],
                tag: null,
                discordRoleIds: [],
                tsGroupIds: [],
                permissions: [],
                parentRoleId: null,
                parentGroupId: null,
                createdAt: new Date(),
                createdBy: 'migration-script',
                createdByName: 'Migration Script',
            })
        }
    }

    const unlinked = await positions.find({ category: { $in: RESERVIST_CATEGORIES }, roleId: null }).toArray()
    console.log(`Reservist positions with no roleId: ${unlinked.length}`)
    for (const pos of unlinked) {
        console.log(`[backfill] position ${pos._id} (${pos.category}, user ${pos.userId ?? 'vacant'}) -> roleId ${roleId}`)
    }
    if (APPLY && unlinked.length > 0) {
        await positions.updateMany(
            { category: { $in: RESERVIST_CATEGORIES }, roleId: null },
            { $set: { roleId } },
        )
    }

    console.log('')
    if (!APPLY) {
        console.log('DRY RUN — no changes written. Re-run with --apply to write them.')
    } else {
        console.log('Done.')
    }

    await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
