import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

function parseCSV(text: string): string[][] {
    const rows: string[][] = []
    const lines = text.split(/\r?\n/)
    for (const raw of lines) {
        if (!raw.trim()) continue
        const cells: string[] = []
        let cur = ''
        let inQuote = false
        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i]
            if (ch === '"') {
                if (inQuote && raw[i + 1] === '"') { cur += '"'; i++ }
                else inQuote = !inQuote
            } else if (ch === ',' && !inQuote) {
                cells.push(cur.trim())
                cur = ''
            } else {
                cur += ch
            }
        }
        cells.push(cur.trim())
        rows.push(cells)
    }
    return rows
}

function parseDateStr(s: string): number {
    if (!s) return 0
    const parts = s.split(/[\/\-]/)
    if (parts.length === 3) {
        const [a, b, c] = parts.map(Number)
        // DD/MM/YYYY
        if (a <= 31 && b <= 12) return new Date(c, b - 1, a).getTime() || 0
        // YYYY/MM/DD
        if (a > 31) return new Date(a, b - 1, c).getTime() || 0
    }
    return new Date(s).getTime() || 0
}

function sortRecords(records: LeavingHistoryRecord[], sortBy: string, sortDir: string) {
    const DATE_FIELDS = ['leavingDate']
    const mul = sortDir === 'asc' ? 1 : -1
    return [...records].sort((a, b) => {
        const av = (a as any)[sortBy] ?? ''
        const bv = (b as any)[sortBy] ?? ''
        if (DATE_FIELDS.includes(sortBy)) {
            return mul * (parseDateStr(String(av)) - parseDateStr(String(bv)))
        }
        return mul * String(av).localeCompare(String(bv), 'en', { sensitivity: 'base' })
    })
}

export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.view)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.toLowerCase() ?? ''
    const returnFilter = searchParams.get('return') ?? ''
    const typeFilter = searchParams.get('type') ?? ''
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const sortBy = searchParams.get('sortBy') ?? 'leavingDate'
    const sortDir = searchParams.get('sortDir') ?? 'asc'
    const limit = 100

    const query: Record<string, unknown> = {}
    if (search) query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { reason: { $regex: search, $options: 'i' } },
        { authorisedBy: { $regex: search, $options: 'i' } },
    ]
    if (returnFilter) query.return = returnFilter
    if (typeFilter) query.type = typeFilter

    const all = await Db.leavingHistory.find(query).toArray()
    const sorted = sortRecords(all, sortBy, sortDir)
    const total = sorted.length
    const records = sorted.slice((page - 1) * limit, page * limit)

    return NextResponse.json({ records, total, page, limit })
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.import)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let csvText: string
    try {
        const formData = await req.formData()
        const file = formData.get('file') as File | null
        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        csvText = await file.arrayBuffer().then(b => Buffer.from(b).toString('utf-8'))
    } catch {
        return NextResponse.json({ error: 'Failed to read file' }, { status: 400 })
    }

    const rows = parseCSV(csvText)
    const dataRows = rows.slice(1).filter(r => r[1]?.trim())

    const now = new Date()
    const docs: LeavingHistoryRecord[] = dataRows.map(r => ({
        _id: new ObjectId() as LeavingHistoryRecord['_id'],
        dischargeTicket: r[0] || undefined,
        name: r[1] ?? '',
        steamId: r[2] || undefined,
        discordId: r[3] || undefined,
        leavingDate: r[4] ?? '',
        grace: r[5] ?? '',
        type: (r[6]?.trim() ?? '') as LeavingHistoryRecord['type'],
        return: r[7]?.trim() ?? '',
        authorisedBy: r[8] ?? '',
        reason: r[9] ?? '',
        notes: r[10] || undefined,
        importedAt: now,
    }))

    await Db.leavingHistory.deleteMany({})
    if (docs.length > 0) await Db.leavingHistory.insertMany(docs as any)

    return NextResponse.json({ ok: true, imported: docs.length })
}
