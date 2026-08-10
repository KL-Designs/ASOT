// One-off migration: seed orbat_roles from the distinct `role` strings
// currently in orbat_positions, then backfill roleId on every non-reservist
// position. Reservist positions (activeReservist / inactiveReservist) are
// intentionally skipped — they get their roleId via ensureReservistRole()
// elsewhere, not this script.
//
// Matching is name + category scoped, not name-only: several role names are
// reused across multiple catalog entries scoped to different categories
// (e.g. "Section Commander" has one INF-wide entry for platoon11/platoon12
// plus three separate "support"-category entries tagged ECHO/GOLF/MIKE).
// A name-only match would silently link a position to the wrong variant
// whenever more than one exists. When a name+category match is still
// ambiguous (multiple catalog entries share both), it's disambiguated by
// checking which entry's `tag` appears in the position's sectionTitle
// (support-category sections are titled like "1-3 ECHO - COMBAT ENGINEERS",
// which contains the tag word for exactly one of the tagged variants).
// Positions that still can't be resolved uniquely are reported, not guessed.
//
// Usage:
//   node --env-file=.env scripts/migrate-orbat-roles.mjs            (dry run — reports only)
//   node --env-file=.env scripts/migrate-orbat-roles.mjs --apply    (writes changes)

import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const RESERVIST_CATEGORIES = ['activeReservist', 'inactiveReservist']

/**
 * Resolve the single correct OrbatRole for a position out of every catalog
 * entry sharing its `role` name. Returns { role } on a unique match, or
 * { reason } explaining why it couldn't be resolved.
 */
function resolveRole(position, candidatesByName) {
    const candidates = candidatesByName.get(position.role) ?? []
    if (candidates.length === 0) return { reason: 'no catalog entry with this name' }

    // An empty `categories` array means "unscoped" (applies everywhere), not
    // "applies nowhere" — that's the shape every entry gets on creation
    // (both this script's seed step and the ORBAT Roles Manager UI default
    // to categories: [] until an admin explicitly scopes it), so treat it as
    // a wildcard rather than a restriction.
    const scoped = candidates.filter(r => {
        const cats = r.categories ?? []
        return cats.length === 0 || cats.includes(position.category)
    })
    if (scoped.length === 0) return { reason: `no catalog entry scoped to category "${position.category}"` }
    if (scoped.length === 1) return { role: scoped[0] }

    // Multiple catalog entries share this name AND this category — disambiguate
    // by tag against the section title (e.g. tag "ECHO" appearing in
    // "1-3 ECHO - COMBAT ENGINEERS").
    const byTag = scoped.filter(r => r.tag && (position.sectionTitle ?? '').toUpperCase().includes(r.tag.toUpperCase()))
    if (byTag.length === 1) return { role: byTag[0] }

    return { reason: `ambiguous — ${scoped.length} catalog entries match name+category, tag disambiguation found ${byTag.length}` }
}

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

    console.log(APPLY ? 'APPLY MODE — writing changes' : 'DRY RUN — no changes will be written (pass --apply to write)')
    console.log('')

    // ── Step 1: seed any role name with zero catalog entries at all ────────────
    const distinctNames = await positions.distinct('role', { category: { $nin: RESERVIST_CATEGORIES } })
    const existingRoles = await roles.find({}).toArray()
    const rolesByName = new Map()
    for (const r of existingRoles) {
        const list = rolesByName.get(r.name) ?? []
        list.push(r)
        rolesByName.set(r.name, list)
    }

    const unseededNames = distinctNames.filter(name => !rolesByName.has(name))
    console.log(`${distinctNames.length} distinct role names in use; ${unseededNames.length} have no catalog entry at all.`)
    if (unseededNames.length > 0) {
        console.log('  Would seed (generic, unscoped — categories: []):', unseededNames.sort())
    }

    if (APPLY) {
        for (const name of unseededNames) {
            const result = await roles.insertOne({
                name,
                categories: [],
                discordRoleIds: [],
                tsGroupIds: [],
                permissions: [],
                createdAt: new Date(),
                createdBy: 'migration-script',
                createdByName: 'Migration Script',
            })
            rolesByName.set(name, [{ _id: result.insertedId, name, categories: [] }])
        }
        if (unseededNames.length > 0) console.log(`Created ${unseededNames.length} new OrbatRole document(s).`)
    }
    console.log('')

    // ── Step 2: backfill roleId on every non-reservist position missing one ────
    const toBackfill = await positions.find({
        category: { $nin: RESERVIST_CATEGORIES },
        roleId: { $exists: false },
    }).toArray()

    const resolved = []   // { position, role }
    const unresolved = [] // { position, reason }
    for (const p of toBackfill) {
        const result = resolveRole(p, rolesByName)
        if (result.role) resolved.push({ position: p, role: result.role })
        else unresolved.push({ position: p, reason: result.reason })
    }

    console.log(`${toBackfill.length} position(s) currently have no roleId.`)
    console.log(`  ${resolved.length} resolve to exactly one catalog entry.`)
    console.log(`  ${unresolved.length} could not be resolved — these need manual attention, not guessed.`)
    console.log('')

    if (resolved.length > 0) {
        const grouped = new Map() // "role name (category/tag)" -> count
        for (const { role } of resolved) {
            const label = `${role.name} [${(role.categories ?? []).join(',')}${role.tag ? `, tag=${role.tag}` : ''}]`
            grouped.set(label, (grouped.get(label) ?? 0) + 1)
        }
        console.log('Would link (or linked, in --apply mode):')
        for (const [label, count] of [...grouped.entries()].sort()) {
            console.log(`  - ${label}: ${count} position(s)`)
        }
        console.log('')
    }

    if (unresolved.length > 0) {
        console.warn('Could NOT resolve — investigate before re-running (these will keep no roleId until fixed):')
        for (const { position, reason } of unresolved) {
            console.warn(`  [WARN] "${position.role}" in "${position.sectionTitle}" (${position.category}, _id=${position._id}): ${reason}`)
        }
        console.log('')
    }

    if (!APPLY) {
        console.log('Dry run complete. Re-run with --apply to write these changes.')
        await client.close()
        return
    }

    let backfilled = 0
    for (const { position, role } of resolved) {
        await positions.updateOne({ _id: position._id }, { $set: { roleId: role._id } })
        backfilled++
    }
    console.log(`Backfilled roleId on ${backfilled} position(s).`)

    await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
