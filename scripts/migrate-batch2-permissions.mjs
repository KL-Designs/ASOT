#!/usr/bin/env node
// One-off migration: grant departmentLeads.j1-j7, quiz.assign/review/reviewEscalated,
// and meetings.lockJ1-lockJ7 on each department's leadership-slot DepartmentRoles,
// plus a J4 blanket grant on all of them.
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

const DEPARTMENTS = ['j1', 'j2', 'j3', 'j5', 'j6', 'j7']

/** Keys granted on every department's leadership slots (leader/2ic/3ic). */
function keysForDept(dept) {
    const keys = [`departmentLeads.${dept}`, `meetings.lockJ${dept.slice(1)}`]
    if (dept === 'j3') keys.push('quiz.assign', 'quiz.review', 'quiz.reviewEscalated')
    return keys
}

/** Every key this batch touches, for the J4 blanket grant. */
const ALL_KEYS = [
    ...DEPARTMENTS.flatMap(keysForDept),
    'departmentLeads.j4', 'meetings.lockJ4',
]

async function main() {
    const client = new MongoClient(MONGO_URI)
    await client.connect()
    const db = client.db(MONGO_DB)
    const departmentRoles = db.collection('department_roles')

    console.log(APPLY ? 'APPLY MODE — writing changes' : 'DRY RUN — no changes will be written (pass --apply to write)')
    console.log('')

    const updates = [] // { roleId, roleName, department, slot, keys }

    for (const dept of DEPARTMENTS) {
        const keys = keysForDept(dept)
        for (const slot of ['leader', '2ic', '3ic']) {
            const role = await departmentRoles.findOne({ department: dept, linkedSlot: slot })
            if (!role) {
                console.warn(`  [WARN] ${dept}/${slot}: no DepartmentRole has this slot linked yet — skipped. Link it via the Department Roles editor, then re-run this script.`)
                continue
            }
            updates.push({ roleId: role._id, roleName: role.name, department: dept, slot, keys })
        }
    }

    const j4Base = await departmentRoles.findOne({ department: 'j4', isBase: true })
    if (!j4Base) {
        console.error('  [ERROR] No J4 base DepartmentRole found — cannot apply the J4 blanket grant. Aborting.')
        await client.close()
        process.exit(1)
    }
    updates.push({ roleId: j4Base._id, roleName: j4Base.name, department: 'j4', slot: 'base', keys: ALL_KEYS })

    console.log(`Found ${updates.length} role(s) to update:`)
    for (const u of updates) {
        console.log(`  - ${u.department}/${u.slot} ("${u.roleName}"): +[${u.keys.join(', ')}]`)
    }
    console.log('')

    if (!APPLY) {
        console.log('Dry run complete. Re-run with --apply to write these changes.')
        await client.close()
        return
    }

    for (const u of updates) {
        await departmentRoles.updateOne(
            { _id: u.roleId },
            { $addToSet: { permissions: { $each: u.keys } } }
        )
    }
    console.log(`Applied ${updates.length} update(s).`)
    await client.close()
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
