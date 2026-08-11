#!/usr/bin/env node
// One-off migration: enabled: null -> true, repeatRaw -> repeatLabel (best-effort
// conversion of the old "1h/2d" syntax into a display label).
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

const UNIT_LABELS = { m: 'minutes', h: 'hours', d: 'days', w: 'weeks' }

function repeatRawToLabel(raw) {
    if (!raw) return null
    const parts = raw.split('/').map(part => {
        const value = Number(part.slice(0, -1))
        const unit = part.slice(-1)
        if (isNaN(value) || !UNIT_LABELS[unit]) return null
        return `${value} ${UNIT_LABELS[unit]}`
    })
    if (parts.some(p => p === null)) return 'Custom'
    return `Every ${parts.reverse().join(', ')}`
}

async function main() {
    const client = new MongoClient(MONGO_URI)
    await client.connect()
    const db = client.db(MONGO_DB)
    const reminders = db.collection('reminders')

    console.log(APPLY ? 'APPLY MODE — writing changes' : 'DRY RUN — no changes will be written (pass --apply to write)')
    console.log('')

    const nullEnabled = await reminders.find({ enabled: null }).toArray()
    console.log(`Found ${nullEnabled.length} reminder(s) with enabled: null (will become enabled: true — this changes live scheduling, since processReminders.ts currently treats null the same as false):`)
    for (const r of nullEnabled) {
        console.log(`  - ${r._id} "${r.message}" (by ${r.by}, expected ${r.expected?.toISOString?.() ?? r.expected})`)
    }
    console.log('')

    const withRepeatRaw = await reminders.find({ repeatRaw: { $exists: true } }).toArray()
    console.log(`Found ${withRepeatRaw.length} reminder(s) with repeatRaw to convert to repeatLabel:`)
    for (const r of withRepeatRaw) {
        console.log(`  - ${r._id}: "${r.repeatRaw}" -> "${repeatRawToLabel(r.repeatRaw)}"`)
    }
    console.log('')

    if (!APPLY) {
        console.log('Dry run complete. Review the enabled:null list above with the reminder owners before applying — re-run with --apply to write these changes.')
        await client.close()
        return
    }

    if (nullEnabled.length > 0) {
        await reminders.updateMany({ enabled: null }, { $set: { enabled: true } })
    }
    for (const r of withRepeatRaw) {
        await reminders.updateOne(
            { _id: r._id },
            { $set: { repeatLabel: repeatRawToLabel(r.repeatRaw) }, $unset: { repeatRaw: '' } }
        )
    }
    console.log(`Applied: ${nullEnabled.length} enabled fix(es), ${withRepeatRaw.length} repeatLabel conversion(s).`)
    await client.close()
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
