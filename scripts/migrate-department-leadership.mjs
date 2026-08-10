// One-off migration: links each department's 3 leadership slots (Leader/
// 2IC/3IC — see DEPT_LEADERSHIP_POSITIONS below) to a DepartmentRole,
// creating an empty-grant role for any slot with no existing name match,
// then backfills departmentRoleIds for every legacy teamLeadDepts/
// dept2icRoles/dept3icRoles holder onto their department's now-linked slot
// role.
//
// Mongo-only — does not call Discord or TeamSpeak (that needs the running
// app's bot token / TS connection, not available here). After running with
// --apply, use each department's "Sync Discord & TeamSpeak" button
// (POST /api/admin/members/sync-dept) to push the real grants for anyone
// migrated onto a slot role, same as any other role-membership change.
//
// Usage:
//   node --env-file=.env scripts/migrate-department-leadership.mjs            (dry run — reports only)
//   node --env-file=.env scripts/migrate-department-leadership.mjs --apply    (writes changes)

import { MongoClient, ObjectId } from 'mongodb'

const APPLY = process.argv.includes('--apply')

// Mirrors apps/web/lib/discord/dept-codes.ts's DEPT_LEADERSHIP_POSITIONS —
// duplicated here since this script runs standalone (no Next.js/TS import
// resolution available). Keep both in sync if the labels ever change.
const DEPT_LEADERSHIP_POSITIONS = {
    j1: ['Department Leader', 'Head Recruiter', 'Recruiter Trainer'],
    j2: ['Department Leader', 'Team Leader', 'Creator Trainer'],
    j3: ['Department Leader', 'Head Trainer', 'Assistant Head Trainer'],
    j4: ['Department Leader', '', ''],
    j5: ['Department Leader', 'Team Leader', 'Lead Content Creator'],
    j6: ['Department Leader', 'Team Leader', 'Assistant Team Leader'],
    j7: ['Department Leader', 'Team Leader', 'Assistant Team Leader'],
}

const SLOTS = ['leader', '2ic', '3ic']
const LEGACY_FIELD = { leader: 'teamLeadDepts', '2ic': 'dept2icRoles', '3ic': 'dept3icRoles' }

async function main() {
    if (!process.env.MONGO_URI || !process.env.MONGO_DB) {
        console.error('MONGO_URI and MONGO_DB must be set (run with --env-file=.env)')
        process.exit(1)
    }

    const client = new MongoClient(process.env.MONGO_URI)
    await client.connect()
    const db = client.db(process.env.MONGO_DB)
    const roles = db.collection('department_roles')
    const users = db.collection('users')

    let rolesLinked = 0
    let rolesCreated = 0
    let usersMigrated = 0

    for (const [dept, labels] of Object.entries(DEPT_LEADERSHIP_POSITIONS)) {
        for (let i = 0; i < SLOTS.length; i++) {
            const slot = SLOTS[i]
            const label = labels[i]
            if (!label) continue

            const alreadyLinked = await roles.findOne({ department: dept, linkedSlot: slot })
            let roleId = alreadyLinked?._id ?? null

            if (!roleId) {
                const nameMatch = await roles.findOne({ department: dept, isBase: false, name: label })
                if (nameMatch) {
                    roleId = nameMatch._id
                    console.log(`[link] ${dept} ${slot} -> existing role "${label}" (${roleId})`)
                    if (APPLY) await roles.updateOne({ _id: roleId }, { $set: { linkedSlot: slot } })
                    rolesLinked++
                } else {
                    roleId = new ObjectId()
                    console.log(`[create+link] ${dept} ${slot} -> new empty-grant role "${label}" (${roleId})`)
                    if (APPLY) {
                        await roles.insertOne({
                            _id: roleId,
                            department: dept,
                            name: label,
                            isBase: false,
                            linkedSlot: slot,
                            discordRoleIds: [],
                            tsGroupIds: [],
                            permissions: [],
                            createdAt: new Date(),
                            createdBy: 'migration-script',
                            createdByName: 'Migration Script',
                        })
                    }
                    rolesCreated++
                }
            } else {
                console.log(`[skip] ${dept} ${slot} already linked to "${alreadyLinked.name}"`)
            }

            const legacyField = LEGACY_FIELD[slot]
            const holders = await users.find({ [legacyField]: dept }).project({ id: 1, departmentRoleIds: 1 }).toArray()
            for (const holder of holders) {
                const alreadyHolds = (holder.departmentRoleIds ?? []).some(id => String(id) === String(roleId))
                if (alreadyHolds) continue
                console.log(`[backfill] ${holder.id} -> departmentRoleIds += ${dept} ${slot} role`)
                if (APPLY) {
                    await users.updateOne({ id: holder.id }, { $addToSet: { departmentRoleIds: roleId } })
                }
                usersMigrated++
            }
        }
    }

    console.log('')
    console.log(`Roles linked to existing name matches: ${rolesLinked}`)
    console.log(`New empty-grant roles created + linked: ${rolesCreated}`)
    console.log(`Users backfilled onto a slot role:       ${usersMigrated}`)
    if (!APPLY) {
        console.log('')
        console.log('DRY RUN — no changes written. Re-run with --apply to write them.')
    } else {
        console.log('')
        console.log('Done. Now run "Sync Discord & TeamSpeak" on each department\'s Members')
        console.log('page to push the real Discord/TeamSpeak grants for migrated roles.')
    }

    await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
