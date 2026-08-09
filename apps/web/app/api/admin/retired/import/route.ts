import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// Column indices (0-based)
const COL_TICKET   = 0
const COL_NAME     = 1
const COL_STEAM    = 2
const COL_DISCORD  = 3
const COL_DATE     = 4
// COL_GRACE       = 5  (stored but not used in display)
const COL_TYPE     = 6
const COL_RETURN   = 7
const COL_AUTH     = 8
const COL_REASON   = 9

const MONTH_MAP: Record<string, number> = {
    jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
    jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
}

function parseDate(raw: string): { isoDate: string | null; year: number | null } {
    const s = raw?.trim()
    if (!s || s === 'N/A' || s === '') return { isoDate: null, year: null }

    const pad = (n: number) => String(n).padStart(2, '0')
    const make = (y: number, m: number, d: number) => ({
        isoDate: `${y}-${pad(m)}-${pad(d)}`,
        year: y,
    })

    // "9-Oct-24" / "31-Oct-25" / "30-Mar-25"
    const m1 = s.match(/^(\d{1,2})-([A-Za-z]{3,})-(\d{2})$/)
    if (m1) {
        const mo = MONTH_MAP[m1[2].toLowerCase().slice(0, 3)]
        if (mo) return make(2000 + parseInt(m1[3]), mo, parseInt(m1[1]))
    }

    // "Aug 24, 2020" / "Sep 18, 2020"
    const m2 = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})$/)
    if (m2) {
        const mo = MONTH_MAP[m2[1].toLowerCase().slice(0, 3)]
        if (mo) return make(parseInt(m2[3]), mo, parseInt(m2[2]))
    }

    // " 14 Jan, 2024" / "21 Feb, 2026" (day first)
    const m3 = s.match(/^(\d{1,2})\s+([A-Za-z]{3,}),?\s*(\d{4})$/)
    if (m3) {
        const mo = MONTH_MAP[m3[2].toLowerCase().slice(0, 3)]
        if (mo) return make(parseInt(m3[3]), mo, parseInt(m3[1]))
    }

    // ISO "2024-01-14"
    const m4 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (m4) return make(parseInt(m4[1]), parseInt(m4[2]), parseInt(m4[3]))

    // Generic fallback
    const d = new Date(s)
    if (!isNaN(d.getTime())) return { isoDate: d.toISOString().split('T')[0], year: d.getFullYear() }

    return { isoDate: null, year: null }
}

function parseCsvLine(line: string): string[] {
    const fields: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (c === '"') {
            if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
            else inQ = !inQ
        } else if (c === ',' && !inQ) {
            fields.push(cur.trim())
            cur = ''
        } else {
            cur += c
        }
    }
    fields.push(cur.trim())
    return fields
}

function normalizeDiscordId(raw: string): string | undefined {
    const s = raw?.trim()
    if (!s || s === '0' || s === '') return undefined
    // Scientific notation → best-effort integer string (some precision lost from spreadsheet)
    const n = parseFloat(s)
    if (!isNaN(n) && n > 0) return Math.round(n).toString()
    return s || undefined
}

function normalizeSteamId(raw: string): string | undefined {
    const s = raw?.trim()
    if (!s || s === '0' || s.toLowerCase().includes('no id') || s === '????') return undefined
    // Extract numeric ID from URL
    if (s.startsWith('http')) {
        const m = s.match(/\/profiles\/(\d{10,})/)
        if (m) return m[1]
        const v = s.match(/\/(id|profiles)\/([^/?\s]+)/)
        if (v) return v[2]
        return s
    }
    return s || undefined
}

function normalizeType(raw: string): 'GD' | 'HD' | 'DD' {
    const t = raw?.trim().toUpperCase()
    if (t === 'HD') return 'HD'
    if (t === 'DD') return 'DD'
    return 'GD'
}

function normalizeReturn(raw: string): 'YES' | 'NO' | 'REVIEW' | undefined {
    const r = raw?.trim().toUpperCase()
    if (r === 'YES') return 'YES'
    if (r === 'NO') return 'NO'
    if (r === 'REVIEW') return 'REVIEW'
    return undefined
}

// PATCH /api/admin/retired/import — apply individual record fixes
// Body: JSON array of { find: Record, set: Partial<RetiredMember> }
//                  or { upsert: RetiredMember }  (insert/update by callsign+date)
export async function PATCH(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const isJ4     = client.hasRoles(me, PERMISSIONS.departments.j4)
    const isJ1Lead = client.hasRoles(me, PERMISSIONS.departmentLeads.j1)
    if (!isJ4 && !isJ1Lead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let patches: Array<
        | { find: Record<string, string>; set: Partial<RetiredMember> }
        | { upsert: Partial<RetiredMember> }
    >
    try {
        patches = await request.json()
        if (!Array.isArray(patches)) throw new Error()
    } catch {
        return NextResponse.json({ error: 'Body must be a JSON array of patch operations.' }, { status: 400 })
    }

    let patched = 0
    const errors: string[] = []

    for (const op of patches) {
        try {
            if ('upsert' in op) {
                const { createdAt: _c, ...setFields } = op.upsert as RetiredMember & { createdAt?: Date }
                const filter: Record<string, unknown> = { callsign: op.upsert.callsign }
                if (op.upsert.dischargeDate) filter.dischargeDate = op.upsert.dischargeDate
                await Db.retiredMembers.updateOne(
                    filter,
                    { $set: setFields, $setOnInsert: { createdAt: new Date() } },
                    { upsert: true }
                )
            } else {
                await Db.retiredMembers.updateOne(op.find, { $set: op.set })
            }
            patched++
        } catch (err) {
            errors.push(String(err))
        }
    }

    return NextResponse.json({ ok: true, patched, errors: errors.length ? errors : undefined })
}

// POST /api/admin/retired/import
// Body: raw CSV text (Content-Type: text/plain or text/csv)
// Also accepts JSON: { csv: string }
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Require J4 or J1 lead
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)
    const isJ1Lead = client.hasRoles(me, PERMISSIONS.departmentLeads.j1)
    if (!isJ4 && !isJ1Lead) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const contentType = request.headers.get('content-type') ?? ''
    let csvText: string

    if (contentType.includes('application/json')) {
        const body = await request.json()
        csvText = body.csv
    } else {
        csvText = await request.text()
    }

    if (!csvText?.trim()) {
        return NextResponse.json({ error: 'No CSV data provided.' }, { status: 400 })
    }

    const lines = csvText.split('\n').map(l => l.replace(/\r$/, ''))

    // Skip header row (first line contains "Discharge Ticket,NAME,...")
    const dataLines = lines.slice(1)

    const records: RetiredMember[] = []
    const skippedRows: { row: number; callsign: string; reason: string }[] = []

    for (const line of dataLines) {
        const rowNum = dataLines.indexOf(line) + 2  // +2: 1-based + header offset

        if (!line.trim()) continue

        const cols = parseCsvLine(line)
        const callsign = cols[COL_NAME]?.trim()

        if (!callsign || callsign === 'NAME' || callsign === '') {
            skippedRows.push({ row: rowNum, callsign: '(empty)', reason: 'No name in column B' })
            continue
        }
        if (cols[COL_STEAM]?.trim() === '0' && cols[COL_DISCORD]?.trim() === '0') {
            skippedRows.push({ row: rowNum, callsign, reason: 'Empty placeholder row (Steam and Discord both 0)' })
            continue
        }

        const { isoDate, year: dischargeYear } = parseDate(cols[COL_DATE] ?? '')
        const dischargeType = normalizeType(cols[COL_TYPE] ?? '')

        const record: RetiredMember = {
            callsign,
            steamId: normalizeSteamId(cols[COL_STEAM] ?? ''),
            discordId: normalizeDiscordId(cols[COL_DISCORD] ?? ''),
            dischargeDate: isoDate ?? undefined,
            dischargeYear: dischargeYear ?? undefined,
            dischargeType,
            returnStatus: normalizeReturn(cols[COL_RETURN] ?? ''),
            authorisedBy: cols[COL_AUTH]?.trim() || undefined,
            reason: cols[COL_REASON]?.trim() || undefined,
            ticketNumber: cols[COL_TICKET]?.trim() || undefined,
            graceDays: 60,
            importedFromCsv: true,
            createdAt: new Date(),
        }

        records.push(record)
    }

    if (records.length === 0) {
        return NextResponse.json({ error: 'No valid records found in CSV.', skipped: skippedRows.length, skippedRows }, { status: 400 })
    }

    // Upsert by callsign + dischargeDate (handle duplicates across import runs)
    let inserted = 0
    let updated = 0

    for (const rec of records) {
        const filter = {
            callsign: rec.callsign,
            ...(rec.dischargeDate ? { dischargeDate: rec.dischargeDate } : {}),
        }
        // Exclude createdAt from $set so it doesn't conflict with $setOnInsert
        const { createdAt: _c, ...setFields } = rec
        const result = await Db.retiredMembers.updateOne(
            filter,
            { $set: setFields, $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
        )
        if (result.upsertedCount) inserted++
        else if (result.modifiedCount) updated++
    }

    return NextResponse.json({ ok: true, inserted, updated, skipped: skippedRows.length, skippedRows, total: records.length })
}
