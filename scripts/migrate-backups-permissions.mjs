#!/usr/bin/env node
// One-off migration: grant the new backup permission keys introduced by
// issue #55 requirement 4.
//
//   J4 base DepartmentRole            -> backups.manage
//   J4 leader / 2ic / 3ic slot roles  -> backups.manage, backups.restore
//
// MUST be applied before the code that uses these keys deploys. The routes
// previously accepted any J4 member via client.hasRoles(), which also honours
// the hardcoded J4-Administration bypass; hasPermission() does not. Without
// these grants, J4 loses access to backups entirely.
//
// Writes only department_roles.permissions, and is inert until the new gates
// exist — safe to run against production ahead of the deploy.
//
// Dry-run by default. Pass --apply to write changes.

import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const MONGO_URI = process.env.MONGO_URI
const MONGO_DB = process.env.MONGO_DB

if (!MONGO_URI || !MONGO_DB) {
    console.error('MONGO_URI and MONGO_DB env vars are required.')
    process.exit(1)
}

const MANAGE = 'backups.manage'
const RESTORE = 'backups.restore'

async function main() {
    const client = new MongoClient(MONGO_URI)
    await client.connect()
    const db = client.db(MONGO_DB)
    const departmentRoles = db.collection('department_roles')

    console.log(APPLY ? 'APPLY MODE — writing changes' : 'DRY RUN — no changes will be written (pass --apply to write)')
    console.log('')

    const updates = [] // { roleId, roleName, label, keys }

    const j4Base = await departmentRoles.findOne({ department: 'j4', isBase: true })
    if (!j4Base) {
        console.error('  [ERROR] No J4 base DepartmentRole found — cannot grant backups.manage. Aborting.')
        await client.close()
        process.exit(1)
    }
    updates.push({ roleId: j4Base._id, roleName: j4Base.name, label: 'j4/base', keys: [MANAGE] })

    for (const slot of ['leader', '2ic', '3ic']) {
        const role = await departmentRoles.findOne({ department: 'j4', linkedSlot: slot })
        if (!role) {
            console.warn(`  [WARN] j4/${slot}: no DepartmentRole has this slot linked yet — skipped. Link it via the Department Roles editor, then re-run this script.`)
            continue
        }
        updates.push({ roleId: role._id, roleName: role.name, label: `j4/${slot}`, keys: [MANAGE, RESTORE] })
    }

    for (const u of updates) {
        const role = await departmentRoles.findOne({ _id: u.roleId })
        const existing = role.permissions ?? []
        const missing = u.keys.filter(k => !existing.includes(k))

        if (missing.length === 0) {
            console.log(`  [SKIP] ${u.label} (${u.roleName}) — already holds ${u.keys.join(', ')}`)
            continue
        }

        console.log(`  [GRANT] ${u.label} (${u.roleName}) += ${missing.join(', ')}`)
        if (APPLY) {
            await departmentRoles.updateOne(
                { _id: u.roleId },
                { $addToSet: { permissions: { $each: missing } } },
            )
        }
    }

    console.log('')
    console.log(APPLY ? 'Done — changes written.' : 'Done — dry run, nothing written. Re-run with --apply.')
    await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
