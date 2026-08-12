// One-off migration: removes the now-redundant 'pages.member' permission
// string from the 7 department base DepartmentRoles and the seeded
// "Reservist" OrbatRole that scripts/migrate-pages-member-permission.mjs
// granted it to. Dashboard access is now implicit (hasDashboardAccess(),
// lib/orbat/hasDashboardAccess.ts — granted to anyone with any department
// membership, department sub-role, or ORBAT position role) rather than a
// per-role granted permission key, so this string sitting in those roles'
// permissions arrays is inert leftover data, not a live grant path.
//
// Usage:
//   node --env-file=.env scripts/migrate-pages-dashboard-cleanup.mjs            (dry run — reports only)
//   node --env-file=.env scripts/migrate-pages-dashboard-cleanup.mjs --apply    (writes changes)

import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const KEY = 'pages.member'

async function main() {
    if (!process.env.MONGO_URI || !process.env.MONGO_DB) {
        console.error('MONGO_URI and MONGO_DB must be set (run with --env-file=.env)')
        process.exit(1)
    }

    const client = new MongoClient(process.env.MONGO_URI)
    await client.connect()
    const db = client.db(process.env.MONGO_DB)
    const deptRoles = db.collection('department_roles')
    const orbatRoles = db.collection('orbat_roles')

    const baseRoles = await deptRoles.find({ isBase: true, permissions: KEY }).toArray()
    console.log(`Found ${baseRoles.length} department base role(s) with '${KEY}'.`)
    for (const role of baseRoles) {
        console.log(`[${APPLY ? 'remove' : 'would remove'}] ${role.department} base role "${role.name}"`)
        if (APPLY) {
            await deptRoles.updateOne({ _id: role._id }, { $pull: { permissions: KEY } })
        }
    }

    const reservistRole = await orbatRoles.findOne({ name: 'Reservist' })
    if (!reservistRole) {
        console.warn('WARNING: no "Reservist" OrbatRole found — nothing to clean up there.')
    } else if (!(reservistRole.permissions ?? []).includes(KEY)) {
        console.log(`[skip] Reservist role — does not have '${KEY}'`)
    } else {
        console.log(`[${APPLY ? 'remove' : 'would remove'}] Reservist role`)
        if (APPLY) {
            await orbatRoles.updateOne({ _id: reservistRole._id }, { $pull: { permissions: KEY } })
        }
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
