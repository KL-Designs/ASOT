/**
 * Remove qualifications and awards that a milpac holds twice.
 *
 *   npm --prefix apps/web run dedupe:milpac            # dry run
 *   npm --prefix apps/web run dedupe:milpac -- --apply # writes
 *
 * Years of CSV imports appended rather than replaced, so members imported
 * twice hold every course twice. The TeamSpeak qualification import fixed this
 * for everyone it could match; this cleans up the members it could not.
 *
 * Promotions are deliberately not touched. A member can hold the same rank
 * twice — demoted and promoted again — so a repeat there is a service record,
 * not a duplicate.
 */
import { MongoClient, type Filter, type AnyBulkWriteOperation } from 'mongodb'
import { dedupeQualifications, dedupeAwards, repeatedAwards } from '@/lib/military/milpac-dedupe'

const apply = process.argv.slice(2).includes('--apply')

function die(message: string): never {
    console.error(`\n  ERROR  ${message}\n`)
    process.exit(1)
}

const { MONGO_URI, MONGO_DB } = process.env
if (!MONGO_URI || !MONGO_DB) die('MONGO_URI and MONGO_DB must be set')

async function main() {
    const client = new MongoClient(MONGO_URI!)
    await client.connect()
    try {
        const users = client.db(MONGO_DB!).collection<User>('users')
        const all = await users.find({}).toArray()

        const updates: AnyBulkWriteOperation<User>[] = []
        const qualLines: string[] = []
        const awardLines: string[] = []
        const repeatLines: string[] = []
        let qualsRemoved = 0
        let awardsRemoved = 0

        for (const user of all) {
            const who = String(user.name ?? user.username)
            const set: Record<string, unknown> = {}

            const quals = user.milpac?.qualifications ?? []
            const keptQuals = dedupeQualifications(quals)
            if (keptQuals.length !== quals.length) {
                set['milpac.qualifications'] = keptQuals
                qualsRemoved += quals.length - keptQuals.length
                qualLines.push(`${who.padEnd(22)} ${String(quals.length).padStart(2)} -> ${String(keptQuals.length).padStart(2)}  ${user.username}`)
            }

            const awards = user.milpac?.awards ?? []
            const keptAwards = dedupeAwards(awards)
            if (keptAwards.length !== awards.length) {
                set['milpac.awards'] = keptAwards
                awardsRemoved += awards.length - keptAwards.length
                awardLines.push(`${who.padEnd(22)} ${String(awards.length).padStart(2)} -> ${String(keptAwards.length).padStart(2)}  ${user.username}`)
            }

            // Reported against what will remain, so an exact repeat that has
            // just been removed does not also show up here.
            for (const repeat of repeatedAwards(keptAwards)) {
                repeatLines.push(`${who.padEnd(22)} ${repeat.name.padEnd(34)} ${repeat.dates.join('  |  ')}`)
            }

            if (Object.keys(set).length) {
                updates.push({ updateOne: { filter: { _id: user._id } as Filter<User>, update: { $set: set } } })
            }
        }

        console.log(`\nMILPAC DEDUPE — ${apply ? 'APPLYING' : 'DRY RUN (no changes written; pass --apply to write)'}\n`)
        console.log('Qualifications')
        console.log(`  ${String(qualLines.length).padStart(4)}  member(s) holding a course twice`)
        console.log(`  ${String(qualsRemoved).padStart(4)}  redundant record(s)`)
        for (const line of qualLines) console.log(`          ${line}`)
        console.log('\nAwards')
        console.log(`  ${String(awardLines.length).padStart(4)}  member(s) with an exact repeat (same award, same date)`)
        console.log(`  ${String(awardsRemoved).padStart(4)}  redundant record(s)`)
        for (const line of awardLines) console.log(`          ${line}`)
        console.log('\nSame award, different dates — left alone, decide by hand')
        console.log(`  ${String(repeatLines.length).padStart(4)}  case(s)`)
        for (const line of repeatLines) console.log(`          ${line}`)
        console.log(`\n  ${String(updates.length).padStart(4)}  member(s) to write\n`)

        if (!apply) {
            console.log('Dry run — nothing written. Re-run with --apply to apply.\n')
            return
        }

        if (updates.length === 0) {
            console.log('Nothing to write — no duplicates found.\n')
            return
        }

        const result = await users.bulkWrite(updates)
        console.log(`Wrote ${result.modifiedCount} member(s).\n`)
    } finally {
        await client.close()
    }
}

main().catch(err => die(err instanceof Error ? err.message : String(err)))
