// One-off migration: grants 'pages.member' on all 7 departments' base
// DepartmentRoles and on the seeded "Reservist" OrbatRole (see
// scripts/migrate-reservist-role.mjs, which should be run — and --applied —
// before this script), so every current department member and every
// current reservist keeps dashboard access once app/dashboard/layout.tsx
// (and every other pages.member call site) starts checking hasPermission()
// instead of a raw Discord role.
//
// Also reports (does not attempt to fix) any active, non-discharged,
// non-skeleton user who is in no department AND holds no ORBAT position
// with a roleId — those users have no grant path to pages.member under
// the new check and need manual review before --apply.
//
// Usage:
//   node --env-file=.env scripts/migrate-pages-member-permission.mjs            (dry run — reports only)
//   node --env-file=.env scripts/migrate-pages-member-permission.mjs --apply    (writes changes)

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
    const users = db.collection('users')
    const positions = db.collection('orbat_positions')

    const baseRoles = await deptRoles.find({ isBase: true }).toArray()
    console.log(`Found ${baseRoles.length} department base roles.`)
    for (const role of baseRoles) {
        const already = (role.permissions ?? []).includes(KEY)
        console.log(`[${already ? 'skip' : 'grant'}] ${role.department} base role "${role.name}"`)
        if (APPLY && !already) {
            await deptRoles.updateOne({ _id: role._id }, { $addToSet: { permissions: KEY } })
        }
    }

    const reservistRole = await orbatRoles.findOne({ name: 'Reservist' })
    if (!reservistRole) {
        console.warn('WARNING: no "Reservist" OrbatRole found — run scripts/migrate-reservist-role.mjs --apply first.')
    } else {
        const already = (reservistRole.permissions ?? []).includes(KEY)
        console.log(`[${already ? 'skip' : 'grant'}] Reservist role`)
        if (APPLY && !already) {
            await orbatRoles.updateOne({ _id: reservistRole._id }, { $addToSet: { permissions: KEY } })
        }
    }

    // Report (never auto-fix) users with no grant path
    const activeUsers = await users
        .find({ isSkeletonAccount: { $ne: true }, discharged: { $exists: false } })
        .project({ id: 1, username: 1, departments: 1 })
        .toArray()
    const usersWithOrbatRole = new Set(
        (await positions.find({ roleId: { $ne: null } }).project({ userId: 1 }).toArray())
            .map(p => p.userId)
            .filter(Boolean),
    )

    const atRisk = activeUsers.filter(u => (u.departments ?? []).length === 0 && !usersWithOrbatRole.has(u.id))
    console.log('')
    console.log(`Active users with NO grant path to '${KEY}': ${atRisk.length}`)
    for (const u of atRisk) {
        console.log(`  - ${u.username ?? u.id} (id ${u.id}) — no department, no ORBAT position with a role`)
    }
    if (atRisk.length > 0) {
        console.log('Review the above before --apply — these users will lose dashboard access once pages.member call sites switch to hasPermission().')
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
