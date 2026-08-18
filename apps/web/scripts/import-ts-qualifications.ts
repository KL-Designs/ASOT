/**
 * Replace member qualifications with what the TeamSpeak server records, and
 * backfill the six-month Unit Proficiency award.
 *
 *   npm --prefix apps/web run import:quals            # dry run
 *   npm --prefix apps/web run import:quals -- --apply # writes
 *
 * Dry run is the default. Read the report before applying: it lists every
 * member whose qualifications would be cleared, every alt account collapsed,
 * and every TeamSpeak nickname that did not resolve.
 *
 * Only members that resolve to a TeamSpeak account are touched. Members with
 * no TeamSpeak presence keep the qualifications they have — the server is the
 * authority for the people it knows about, not for everyone.
 */
import { TeamSpeak, QueryProtocol } from 'ts3-nodejs-library'
import { MongoClient, type Filter, type AnyBulkWriteOperation } from 'mongodb'
import { CERTIFICATIONS } from '@/lib/military/certifications'
import { parseMilpacDate } from '@/lib/military/milpac-dates'
import {
    TS_GROUP_TO_QUALIFICATION, UNIT_PROFICIENCY,
    tsMatchName, collapseAlts, unitProficiencyDate, type TsAccount,
} from '@/lib/military/ts-qualifications'
import { resolveMembers, type MatchCandidate } from '@/lib/military/history-match'

const args = process.argv.slice(2)
const apply = args.includes('--apply')

function die(message: string): never {
    console.error(`\n  ERROR  ${message}\n`)
    process.exit(1)
}

const { MONGO_URI, MONGO_DB, TS_HOST, TS_SERVERADMIN_PASSWORD } = process.env
if (!MONGO_URI || !MONGO_DB) die('MONGO_URI and MONGO_DB must be set')
if (!TS_HOST || !TS_SERVERADMIN_PASSWORD) die('TS_HOST and TS_SERVERADMIN_PASSWORD must be set')

/**
 * TeamSpeak nicknames the index cannot settle, adjudicated by hand.
 *
 * MEMBER_OVERRIDES in lib/military/history-match.ts applies underneath this.
 * Keys are the rank-stripped, decoration-stripped name — what tsMatchName()
 * produces — not the raw nickname.
 */
const TS_OVERRIDES: Record<string, string> = {
    // Their TeamSpeak nickname carries something the member's own records do
    // not: a title, a rank the catalog has never had, an initial, or an
    // underscore where the guild has a space.
    'Miss Elvera': 'misselvera',   // guild nickname is "PTE(S) Elvera"
    Keegen:        'keegen751',    // "BSGT Keegen" — BSGT is not a catalog rank, so it never strips
    'L. Lest':     'lestza',       // "PTE(S) Lest"
    'Killed IRL':  'killed_irl',   // guild nickname is "Killed_IRL"

    // Contested names where the other claimant holds nothing. Each of these
    // would otherwise resolve to nobody and quietly keep a stale record.
    Zabn:  'zabn5438',    // over "Zabn Mobile"
    Shaw:  'shaw06812',   // over drumeo, who answers to Shaw but holds no qualifications
    Mo:    'mrmattymo',   // the only account actually nicknamed "Mo"
    Frog:  'billyfrog.',  // over marshall_580, who claims it via a Discord global name — same call the ORBAT sync made
    SaintRicey21: 'jpegricey',   // guild nickname is "Saint"
}

/** Qualifications in catalog order, so a member's list reads consistently. */
const CERT_ORDER = new Map<string, number>(CERTIFICATIONS.map((c, i) => [c.label, i]))

async function fetchTeamspeak(): Promise<{ accounts: TsAccount[]; qualsByCldbid: Map<number, Set<string>>; groupCounts: [string, number][] }> {
    const ts = await TeamSpeak.connect({
        host: TS_HOST!,
        queryport: Number(process.env.TS_QUERY_PORT ?? 10022),
        protocol: QueryProtocol.SSH,
        username: 'serveradmin',
        password: TS_SERVERADMIN_PASSWORD!,
        serverport: Number(process.env.TS_SERVER_PORT ?? 9987),
        nickname: 'ASOT-qual-import',
    })

    try {
        // The whole client database, paged. This is what reaches members who
        // are not currently connected — clientList() would only see who is
        // online right now.
        const clients: { cldbid: number; nickname: string; lastConnected: number }[] = []
        for (let start = 0; ; start += 200) {
            const page = await ts.clientDbList(start, 200)
            if (!page.length) break
            for (const c of page) {
                clients.push({
                    cldbid: Number(c.cldbid),
                    nickname: String(c.clientNickname ?? ''),
                    lastConnected: Number(c.clientLastconnected ?? 0),
                })
            }
            if (page.length < 200) break
        }

        const qualsByCldbid = new Map<number, Set<string>>()
        const groupCounts: [string, number][] = []
        for (const group of await ts.serverGroupList()) {
            const label = TS_GROUP_TO_QUALIFICATION[String(group.name).trim()]
            if (!label) continue

            const members = await ts.serverGroupClientList(group.sgid)
            groupCounts.push([label, members.length])
            for (const m of members) {
                const id = Number(m.cldbid)
                const held = qualsByCldbid.get(id) ?? new Set<string>()
                held.add(label)
                qualsByCldbid.set(id, held)
            }
        }

        const mapped = Object.keys(TS_GROUP_TO_QUALIFICATION).length
        if (groupCounts.length !== mapped) {
            throw new Error(`${mapped - groupCounts.length} mapped group(s) no longer exist on the server — TS_GROUP_TO_QUALIFICATION is stale`)
        }

        const accounts: TsAccount[] = clients.map(c => ({
            ...c,
            qualCount: qualsByCldbid.get(c.cldbid)?.size ?? 0,
        }))
        return { accounts, qualsByCldbid, groupCounts }
    } finally {
        await ts.quit()
    }
}

/** Awards ascending by date, undated last, ties keeping their existing order. */
function sortAwards<T extends { date?: string }>(awards: T[]): T[] {
    return awards
        .map((award, index) => {
            const at = parseMilpacDate(award.date)?.getTime()
            return { award, index, at: at ?? Infinity }
        })
        .sort((a, b) => (a.at - b.at) || (a.index - b.index))
        .map(entry => entry.award)
}

async function main() {
    const now = new Date()
    const { accounts, qualsByCldbid, groupCounts } = await fetchTeamspeak()
    const { chosen, discarded } = collapseAlts(accounts)

    const client = new MongoClient(MONGO_URI!)
    await client.connect()
    try {
        const users = client.db(MONGO_DB!).collection<User>('users')
        const everyone = await users.find({}).toArray()

        // Skeleton accounts are CSV-imported stubs never matched to a Discord
        // member, and the unit's duplicates are almost all of this shape: a
        // "PTE(S) Zabn" holding no guild roles and no qualifications shadowing
        // the real "Zabn" who holds ten. Left in the index the two contest
        // their own member's name and both lose, which is why 28 TeamSpeak
        // nicknames resolved to nobody before this filter. They are read-only
        // stubs everywhere else in the app too.
        const all = everyone.filter(u => !u.isSkeletonAccount)
        const skeletons = everyone.length - all.length

        const candidates: MatchCandidate[] = all.map(u => ({
            _id: u._id, username: u.username, name: u.name,
            globalName: u.globalName, nickname: u.guild?.nickname,
        }))

        // Only accounts that actually hold a course are worth matching — the
        // client database is full of visitors who never took one, and every
        // extra name is another chance to collide with a real member.
        const holders = [...chosen.values()].filter(a => a.qualCount > 0)
        const names = holders.map(a => tsMatchName(a.nickname))
        const byName = new Map(holders.map(a => [tsMatchName(a.nickname), a]))

        const { resolved, unresolved, errors } = resolveMembers(names, candidates, TS_OVERRIDES, { allowManyToOne: true })
        if (errors.length) throw new Error(`member resolution failed:\n         ${errors.join('\n         ')}`)

        // A member with two TeamSpeak accounts under two spellings — "Miss
        // Elvera" and "Elvera" — reaches here as two entries, because
        // collapseAlts keys on the nickname and those are different names.
        // Keep the account that records more courses, on the same reasoning
        // the alt rule uses.
        const best = new Map<string, string>()   // member id -> winning name
        const merged: string[] = []
        for (const [name, member] of resolved) {
            const held = byName.get(name)!.qualCount
            const incumbent = best.get(member._id)
            if (incumbent === undefined) { best.set(member._id, name); continue }

            const keep = held > byName.get(incumbent)!.qualCount ? name : incumbent
            const drop = keep === name ? incumbent : name
            best.set(member._id, keep)
            merged.push(`${member.username}: kept "${keep}" (${byName.get(keep)!.qualCount} quals), dropped "${drop}" (${byName.get(drop)!.qualCount})`)
        }

        const byId = new Map(all.map(u => [u._id, u]))
        const updates = new Map<string, Record<string, unknown>>()

        const changes: string[] = []
        let unchanged = 0
        for (const [name, member] of resolved) {
            if (best.get(member._id) !== name) continue
            const account = byName.get(name)!
            const held = [...(qualsByCldbid.get(account.cldbid) ?? [])]
                .sort((a, b) => (CERT_ORDER.get(a) ?? 99) - (CERT_ORDER.get(b) ?? 99))

            const user = byId.get(member._id)!
            const before = (user.milpac?.qualifications ?? []).map(q => q.qualification)
            if (before.length === held.length && before.every((q, i) => q === held[i])) { unchanged++; continue }

            updates.set(member._id, {
                'milpac.qualifications': held.map(qualification => ({ date: '', qualification })),
            })
            changes.push(`${name.padEnd(20)} ${String(before.length).padStart(2)} -> ${String(held.length).padStart(2)}  ${member.username}`)
        }

        // Independent of TeamSpeak: earned by serving six months, not by an
        // instructor remembering to grant the group.
        const awarded: string[] = []
        const badDates: string[] = []
        for (const user of all) {
            const enlisted = user.milpac?.enlistedDate
            if (enlisted && !parseMilpacDate(enlisted)) {
                badDates.push(`${String(user.name ?? user.username).padEnd(20)} enlistedDate ${JSON.stringify(enlisted)}`)
                continue
            }

            const earned = unitProficiencyDate(enlisted, now)
            if (!earned) continue

            const awards = [...(user.milpac?.awards ?? [])]
            const existing = awards.findIndex(a => a.name === UNIT_PROFICIENCY.name)
            if (existing >= 0) {
                if (awards[existing].date) continue          // already dated — leave it alone
                awards[existing] = { ...awards[existing], date: earned }
            } else {
                awards.push({ date: earned, name: UNIT_PROFICIENCY.name, type: UNIT_PROFICIENCY.type })
            }

            updates.set(user._id, { ...(updates.get(user._id) ?? {}), 'milpac.awards': sortAwards(awards) })
            awarded.push(`${String(user.name ?? user.username).padEnd(20)} ${earned}${existing >= 0 ? '  (dated an existing record)' : ''}`)
        }

        console.log(`\nTEAMSPEAK QUALIFICATION IMPORT — ${apply ? 'APPLYING' : 'DRY RUN (no changes written; pass --apply to write)'}\n`)
        console.log('TeamSpeak')
        console.log(`  ${String(accounts.length).padStart(4)}  client database entries`)
        console.log(`  ${String(holders.length).padStart(4)}  accounts holding at least one course, after collapsing alts`)
        console.log(`  ${String(discarded.length).padStart(4)}  name(s) with more than one account`)
        for (const d of discarded) {
            console.log(`          ${d.name}: kept "${d.kept.nickname}" (${d.kept.qualCount} quals), dropped ${d.dropped.map(a => `"${a.nickname}" (${a.qualCount})`).join(', ')}`)
        }
        console.log('\nGroups')
        for (const [label, count] of groupCounts.sort((a, b) => b[1] - a[1])) {
            console.log(`  ${String(count).padStart(4)}  ${label}`)
        }
        console.log('\nMembers')
        console.log(`  ${String(skeletons).padStart(4)}  skeleton account(s) excluded from matching`)
        console.log(`  ${String(resolved.size).padStart(4)}  resolved`)
        console.log(`  ${String(merged.length).padStart(4)}  merged — one member, two TeamSpeak names`)
        for (const line of merged) console.log(`          ${line}`)
        console.log(`  ${String(unresolved.length).padStart(4)}  unresolved — skipped, their qualifications are left alone`)
        for (const name of unresolved) console.log(`          ${name}`)
        console.log('\nQualifications')
        console.log(`  ${String(unchanged).padStart(4)}  already correct`)
        console.log(`  ${String(changes.length).padStart(4)}  changing`)
        for (const line of changes) console.log(`          ${line}`)
        console.log('\nUnit Proficiency')
        console.log(`  ${String(awarded.length).padStart(4)}  awarded (enlisted + 6 months)`)
        console.log(`  ${String(badDates.length).padStart(4)}  skipped — unreadable enlistedDate`)
        for (const line of badDates) console.log(`          ${line}`)
        console.log(`\n  ${String(updates.size).padStart(4)}  member(s) to write\n`)

        if (!apply) {
            console.log('Dry run — nothing written. Re-run with --apply to apply.\n')
            return
        }

        if (updates.size === 0) {
            console.log('Nothing to write.\n')
            return
        }

        const ops: AnyBulkWriteOperation<User>[] = [...updates].map(([_id, set]) => ({
            updateOne: { filter: { _id } as Filter<User>, update: { $set: set } },
        }))
        const result = await users.bulkWrite(ops)
        console.log(`Wrote ${result.modifiedCount} member(s).\n`)
    } finally {
        await client.close()
    }
}

main().catch(err => die(err instanceof Error ? err.message : String(err)))
