/**
 * Sync every member's current rank to the ORBAT spreadsheet.
 *
 *   npm --prefix apps/web run sync:ranks -- <csv>           # dry run
 *   npm --prefix apps/web run sync:ranks -- <csv> --apply   # writes
 *
 * Dry run is the default. The report lists every rank it would change, every
 * name it could not resolve and every seat the sheet contradicts itself on —
 * read it before passing --apply.
 *
 * Writes `milpac.currentRank`, and repairs any `name` still carrying a rank
 * prefix (see repairedName). Nothing else is touched: seats, roles and ORBAT
 * positions are the mass-import's job, not this one.
 */
import { readFileSync } from 'fs'
import { MongoClient, type Filter, type AnyBulkWriteOperation } from 'mongodb'
import { orbatRanks, repairedName } from '@/lib/military/orbat-ranks'
import { resolveMembers, type MatchCandidate } from '@/lib/military/history-match'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const csvPath = args.find(a => !a.startsWith('--'))

function die(message: string): never {
    console.error(`\n  ERROR  ${message}\n`)
    process.exit(1)
}

if (!csvPath) die('usage: sync:ranks -- <path-to-orbat-csv> [--apply]')

const { MONGO_URI, MONGO_DB } = process.env
if (!MONGO_URI || !MONGO_DB) die('MONGO_URI and MONGO_DB must be set')

/**
 * Names the index cannot settle that the history import never had to face,
 * adjudicated against stored history and Discord nicknames.
 *
 * MEMBER_OVERRIDES in lib/military/history-match.ts still applies underneath
 * this — six of the ORBAT's contested names are already settled there.
 */
const ORBAT_OVERRIDES: Record<string, string> = {
    // "hackjack." also answers to Kyle through their Discord global name, and
    // they outrank the sheet's PTE Kyle at PTE(L) — matching the wrong one
    // would read as a demotion.
    Kyle: 'kyle11231',
    // "marshall_580" answers to Frog the same way; "billyfrog." is nicknamed
    // REC Frog in the guild, which is the seat the sheet is filling.
    Frog: 'billyfrog.',
}

async function main() {
    const text = readFileSync(csvPath!, 'utf-8')
    const { ranks, conflicts } = orbatRanks(text)
    if (ranks.size === 0) die('no ranked names found — is this the ORBAT export?')

    const client = new MongoClient(MONGO_URI!)
    await client.connect()
    try {
        const users = client.db(MONGO_DB!).collection<User>('users')
        const all = await users.find({}).toArray()
        const candidates: MatchCandidate[] = all.map(u => ({
            _id: u._id, username: u.username, name: u.name,
            globalName: u.globalName, nickname: u.guild?.nickname,
        }))

        const { resolved, unresolved, errors } = resolveMembers([...ranks.keys()], candidates, ORBAT_OVERRIDES)
        // Throws rather than die()ing: die() exits immediately and would skip
        // the finally block, leaving the Mongo client open.
        if (errors.length) throw new Error(`member resolution failed:\n         ${errors.join('\n         ')}`)

        const byId = new Map(all.map(u => [u._id, u]))
        const updates = new Map<string, Record<string, string>>()

        const changes: string[] = []
        let unchanged = 0
        for (const [orbatName, seat] of ranks) {
            const match = resolved.get(orbatName)
            if (!match) continue

            const member = byId.get(match._id)!
            const current = member.milpac?.currentRank
            if (current === seat.abbr) { unchanged++; continue }

            updates.set(member._id, { 'milpac.currentRank': seat.abbr })
            changes.push(`${orbatName.padEnd(18)} ${(current ?? '—').padEnd(8)} -> ${seat.abbr.padEnd(8)} ${member.username}`)
        }

        // Independent of the sheet: a stored name carrying a rank is wrong
        // whether or not that member is seated in this export.
        const repairs: string[] = []
        for (const member of all) {
            const fixed = member.name ? repairedName(member.name) : null
            if (!fixed) continue

            updates.set(member._id, { ...(updates.get(member._id) ?? {}), name: fixed })
            repairs.push(`${String(member.name).padEnd(18)} -> ${fixed.padEnd(18)} ${member.username}`)
        }

        console.log(`\nORBAT RANK SYNC — ${apply ? 'APPLYING' : 'DRY RUN (no changes written; pass --apply to write)'}\n`)
        console.log(`Source   ${csvPath}`)
        console.log(`Names    ${ranks.size} found in the sheet\n`)
        console.log('Members')
        console.log(`  ${String(resolved.size).padStart(4)}  resolved`)
        console.log(`  ${String(unresolved.length).padStart(4)}  unresolved — skipped`)
        for (const name of unresolved) console.log(`          ${name}  (no single member answers to this name)`)
        console.log('')
        console.log('Ranks')
        console.log(`  ${String(unchanged).padStart(4)}  already correct`)
        console.log(`  ${String(changes.length).padStart(4)}  changing`)
        for (const line of changes) console.log(`          ${line}`)
        console.log('')
        console.log('Names')
        console.log(`  ${String(repairs.length).padStart(4)}  carrying a rank prefix — repaired`)
        for (const line of repairs) console.log(`          ${line}`)
        console.log('')
        console.log('Sheet conflicts')
        console.log(`  ${String(conflicts.length).padStart(4)}  name(s) seated twice at different ranks — skipped`)
        for (const c of conflicts) {
            console.log(`          ${c.name}: ${c.seats.map(s => `${s.abbr} @ line ${s.line} col ${s.col}`).join('  vs  ')}`)
        }
        console.log(`\n  ${String(updates.size).padStart(4)}  member(s) to write\n`)

        if (!apply) {
            console.log('Dry run — nothing written. Re-run with --apply to apply.\n')
            return
        }

        if (updates.size === 0) {
            console.log('Nothing to write — every rank already matches.\n')
            return
        }

        const ops: AnyBulkWriteOperation<User>[] = [...updates].map(([_id, set]) => ({
            updateOne: { filter: { _id } as Filter<User>, update: { $set: set } },
        }))
        const result = await client.db(MONGO_DB!).collection<User>('users').bulkWrite(ops)
        console.log(`Wrote ${result.modifiedCount} member(s).\n`)
    } finally {
        await client.close()
    }
}

main().catch(err => die(err instanceof Error ? err.message : String(err)))
