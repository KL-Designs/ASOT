// One-off migration: seed orbat_roles from the distinct `role` strings
// currently in orbat_positions, then backfill roleId on every non-reservist
// position by exact-name match. Reservist positions (activeReservist /
// inactiveReservist) are intentionally skipped — they stay fixed labels.
//
// Usage:
//   node --env-file=.env scripts/migrate-orbat-roles.mjs            (dry run — reports only)
//   node --env-file=.env scripts/migrate-orbat-roles.mjs --apply    (writes changes)

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
    const roles = db.collection('orbat_roles')

    const distinctNames = await positions.distinct('role', { category: { $nin: RESERVIST_CATEGORIES } })
    console.log(`Found ${distinctNames.length} distinct role names to seed.`)

    if (!APPLY) {
        console.log('DRY RUN — no changes written. Names that would be seeded:')
        console.log(distinctNames.sort())
        await client.close()
        return
    }

    let created = 0
    const nameToId = new Map()
    for (const name of distinctNames) {
        const existing = await roles.findOne({ name })
        if (existing) {
            nameToId.set(name, existing._id)
            continue
        }
        const result = await roles.insertOne({
            name,
            categories: [],
            discordRoleIds: [],
            permissions: [],
            createdAt: new Date(),
            createdBy: 'migration-script',
            createdByName: 'Migration Script',
        })
        nameToId.set(name, result.insertedId)
        created++
    }
    console.log(`Created ${created} new OrbatRole documents (${distinctNames.length - created} already existed).`)

    let backfilled = 0
    for (const [name, roleId] of nameToId) {
        const result = await positions.updateMany(
            { role: name, category: { $nin: RESERVIST_CATEGORIES }, roleId: { $exists: false } },
            { $set: { roleId } }
        )
        backfilled += result.modifiedCount
    }
    console.log(`Backfilled roleId on ${backfilled} positions.`)

    const remaining = await positions.countDocuments({ category: { $nin: RESERVIST_CATEGORIES }, roleId: { $exists: false } })
    if (remaining > 0) {
        console.warn(`WARNING: ${remaining} non-reservist positions still have no roleId — investigate before relying on the new catalog for them.`)
    }

    await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
