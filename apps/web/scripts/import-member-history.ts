/**
 * One-off backfill: replace every covered member's promotion history and
 * awards with the record extracted from the unit's pre-website systems.
 *
 *   npm --prefix apps/web run import:history -- <csv>            # dry run
 *   npm --prefix apps/web run import:history -- <csv> --apply   # writes
 *
 * Dry run is the default because this is the most destructive operation in
 * the repo that is not a backup restore. Take a backup through the J4 backups
 * tab before running with --apply.
 *
 * See docs/superpowers/specs/2026-08-18-member-history-import-design.md.
 */
import { readFileSync } from 'fs'
import { MongoClient, type Filter, type AnyBulkWriteOperation } from 'mongodb'
import { parseHistoryCsv, buildHistory, ISSUER_WINDOWS } from '@/lib/military/history-import'
import { resolveMembers, type MatchCandidate } from '@/lib/military/history-match'
import { calculatePromotionPoints, type MilpacImportCounts } from '@/lib/military/points'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const csvPath = args.find(a => !a.startsWith('--'))

function die(message: string): never {
    console.error(`\n  ERROR  ${message}\n`)
    process.exit(1)
}

if (!csvPath) die('usage: import:history -- <path-to-csv> [--apply]')

const { MONGO_URI, MONGO_DB } = process.env
if (!MONGO_URI || !MONGO_DB) die('MONGO_URI and MONGO_DB must be set')

/**
 * The awards-only total, for members with no billetCounts.
 *
 * resolvePromotionPoints() recomputes live from billetCounts when it exists
 * and otherwise falls back to this stored scalar. 18 members have neither,
 * so without this they would import their awards and still display 0. Their
 * score is entirely awards, which is what zeroed counts produce.
 */
function awardsOnlyPoints(member: User, awards: { name: string }[]): number {
    const counts: MilpacImportCounts = {
        primaryNightOps: 0, secondaryNightOps: 0, primaryNightFTX: 0, secondaryNightFTX: 0,
        platoonTraining: 0, sectionTraining: 0, meetings: 0, campaignMedals: 0,
        j1Interviews: 0, j1InterviewBonus: 0, j2MissionsRun: 0, j3Bct12: 0,
        j3OtherTrainings: 0, j5ContentCreated: 0, j5MilpacsGenerated: 0, j5OfficialPR: 0,
        awards,
        qualifications: (member.milpac?.qualifications ?? []).map(q => ({ qualification: q.qualification })),
        j4Points: member.milpac?.j4Points ?? 0,
        disciplineDeductions: member.milpac?.disciplineDeductions ?? 0,
    }
    return calculatePromotionPoints(counts)
}

async function main() {
    const text = readFileSync(csvPath!, 'utf-8')
    const rows = parseHistoryCsv(text)

    // parseHistoryCsv drops a row whose Member Name cell is empty, and such a
    // row would be counted neither as written nor as skipped — the accounting
    // assertion below would pass while a record was silently missing. Compare
    // against the raw non-blank line count so that cannot happen quietly.
    const dataLines = text.replace(/^﻿/, '').split(/\r?\n/).slice(1).filter(l => l.trim()).length
    if (rows.length !== dataLines) {
        die(`${dataLines - rows.length} row(s) were dropped at parse time (empty member name?) — refusing to run`)
    }

    const { byMember, skipped, corrections } = buildHistory(rows)

    const client = new MongoClient(MONGO_URI!)
    await client.connect()
    try {
        const users = await client.db(MONGO_DB!).collection<User>('users').find({}).toArray()
        const candidates: MatchCandidate[] = users.map(u => ({
            _id: u._id, username: u.username, name: u.name,
            globalName: u.globalName, nickname: u.guild?.nickname,
        }))

        const { resolved, unresolved, errors } = resolveMembers([...byMember.keys()], candidates)
        // throw rather than die() here — die() calls process.exit() immediately,
        // which would skip the finally block below and leave the Mongo client
        // open. main().catch() reports the message and exits instead.
        if (errors.length) throw new Error(`member resolution failed:\n         ${errors.join('\n         ')}`)
        if (unresolved.length) throw new Error(`${unresolved.length} member(s) did not resolve: ${unresolved.join(', ')}\n         Add them to MEMBER_OVERRIDES in lib/military/history-match.ts.`)

        const byId = new Map(users.map(u => [u._id, u]))
        const written = [...byMember.values()].reduce((n, h) => n + h.promotions.length + h.awards.length, 0)

        // Nothing may be dropped silently. This is the guarantee, not a summary.
        if (written + skipped.length !== rows.length) {
            die(`accounting failed: ${written} written + ${skipped.length} skipped != ${rows.length} rows`)
        }

        const updates: AnyBulkWriteOperation<User>[] = []
        let pointsWritten = 0
        for (const [csvName, history] of byMember) {
            const member = byId.get(resolved.get(csvName)!._id)!
            const set: Record<string, unknown> = {
                'milpac.promotions': history.promotions,
                'milpac.awards': history.awards,
            }
            // Only when the live path cannot recompute — writing one otherwise
            // leaves a misleading number the site already ignores.
            if (!member.milpac?.billetCounts) {
                set['milpac.promotionPoints'] = awardsOnlyPoints(member, history.awards)
                pointsWritten++
            }
            updates.push({ updateOne: { filter: { _id: member._id } as Filter<User>, update: { $set: set } } })
        }

        const promotions = [...byMember.values()].reduce((n, h) => n + h.promotions.length, 0)
        const awards = [...byMember.values()].reduce((n, h) => n + h.awards.length, 0)

        console.log(`\nMEMBER HISTORY IMPORT — ${apply ? 'APPLYING' : 'DRY RUN (no changes written; pass --apply to write)'}\n`)
        console.log(`Source   ${csvPath}`)
        console.log(`Rows     ${rows.length} parsed\n`)
        console.log('Members')
        console.log(`  ${String(resolved.size).padStart(4)}  resolved`)
        console.log(`  ${String(unresolved.length).padStart(4)}  unresolved\n`)
        console.log('Records')
        console.log(`  ${String(promotions).padStart(4)}  promotions`)
        console.log(`  ${String(awards).padStart(4)}  awards`)
        console.log(`  ${String(skipped.length).padStart(4)}  rows skipped`)
        for (const s of skipped) console.log(`          line ${s.line}  ${s.member}  ${s.reason}`)
        console.log(`  ${String(written + skipped.length).padStart(4)}  accounted for   OK matches rows parsed\n`)
        console.log('Normalisation')
        console.log(`  ${String(corrections.rank).padStart(4)}  rank spellings corrected`)
        console.log(`  ${String(corrections.award).padStart(4)}  award spellings corrected`)
        console.log(`  ${String(corrections.role).padStart(4)}  role spellings corrected\n`)
        console.log('Issuers')
        for (const w of ISSUER_WINDOWS) {
            const n = [...byMember.values()]
                .flatMap(h => [...h.promotions, ...h.awards])
                .filter(r => r.issuedByName === w.issuer.issuedByName && r.issuedByRank === w.issuer.issuedByRank)
                .length
            console.log(`  ${String(n).padStart(4)}  ${w.issuer.issuedByName} (${w.issuer.issuedByRank})  until ${w.until ?? '—'}`)
        }
        console.log('\npromotionPoints')
        console.log(`  ${String(byMember.size - pointsWritten).padStart(4)}  recomputed live from billetCounts — not written`)
        console.log(`  ${String(pointsWritten).padStart(4)}  written (awards-only total; member has no billetCounts)\n`)

        if (!apply) {
            console.log('Dry run — nothing written. Re-run with --apply to apply.\n')
            return
        }

        if (updates.length === 0) die('no members resolved — nothing to write')

        const result = await client.db(MONGO_DB!).collection<User>('users').bulkWrite(updates)
        console.log(`Wrote ${result.modifiedCount} member(s).\n`)
    } finally {
        await client.close()
    }
}

main().catch(err => die(err instanceof Error ? err.message : String(err)))
