// One-off migration: grants Phase 2 Batch 1's 6 permission keys on one
// department base DepartmentRole each, per the design spec's mapping
// (docs/superpowers/specs/2026-08-11-permission-system-migration-phase2-batch1-design.md).
// HQ Staff/All Staff never carry forward as a grant path — these are the
// replacement grants for the *other* role each key used to also accept
// (or, for uploads.bio, a fresh decision since HQ Staff was the only role
// listed).
//
// Usage:
//   node --env-file=.env scripts/migrate-batch1-permissions.mjs            (dry run — reports only)
//   node --env-file=.env scripts/migrate-batch1-permissions.mjs --apply    (writes changes)

import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')

// key -> department whose base DepartmentRole should be granted this key
const GRANTS = {
    'optionals.manage': 'j4',
    'gallery.manage': 'j5',
    'auth.collab': 'j2',
    'intel.generateImages': 'j2',
    'intel.viewAllImages': 'j2',
    'uploads.bio': 'j4',
}

async function main() {
    if (!process.env.MONGO_URI || !process.env.MONGO_DB) {
        console.error('MONGO_URI and MONGO_DB must be set (run with --env-file=.env)')
        process.exit(1)
    }

    const client = new MongoClient(process.env.MONGO_URI)
    await client.connect()
    const db = client.db(process.env.MONGO_DB)
    const deptRoles = db.collection('department_roles')

    for (const [key, department] of Object.entries(GRANTS)) {
        const role = await deptRoles.findOne({ department, isBase: true })
        if (!role) {
            console.warn(`WARNING: no base role found for department "${department}" (key "${key}") — skipping`)
            continue
        }
        const already = (role.permissions ?? []).includes(key)
        console.log(`[${already ? 'skip' : 'grant'}] ${key} -> ${department} base role ("${role.name}")`)
        if (APPLY && !already) {
            await deptRoles.updateOne({ _id: role._id }, { $addToSet: { permissions: key } })
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
