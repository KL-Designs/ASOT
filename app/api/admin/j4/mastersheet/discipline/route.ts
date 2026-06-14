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
        if (a <= 31 && b <= 12) return new Date(c, b - 1, a).getTime() || 0
        if (a > 31) return new Date(a, b - 1, c).getTime() || 0
    }
    return new Date(s).getTime() || 0
}

function sortRecords(records: DisciplineRecord[], sortBy: string, sortDir: string) {
    const DATE_FIELDS = ['issued', 'expires']
    const mul = sortDir === 'asc' ? 1 : -1
    return [...records].sort((a, b) => {
        const av = (a as any)[sortBy] ?? ''
        const bv = (b as any)[sortBy] ?? ''
        if (DATE_FIELDS.includes(sortBy)) {
            return mul * (parseDateStr(String(av)) - parseDateStr(String(bv)))
        }
        if (sortBy === 'pointsRemoved') return mul * ((Number(av) || 0) - (Number(bv) || 0))
        if (sortBy === 'expired') return mul * (Number(av) - Number(bv))
        return mul * String(av).localeCompare(String(bv), 'en', { sensitivity: 'base' })
    })
}

export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.viewDiscipline)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.toLowerCase() ?? ''
    const levelFilter = searchParams.get('level') ?? ''
    const activeOnly = searchParams.get('active') === 'true'
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const sortBy = searchParams.get('sortBy') ?? 'issued'
    const sortDir = searchParams.get('sortDir') ?? 'asc'
    const limit = 100

    const query: Record<string, unknown> = {}
    if (search) query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { reason: { $regex: search, $options: 'i' } },
        { givenBy: { $regex: search, $options: 'i' } },
    ]
    if (levelFilter) query.disciplineLevel = levelFilter
    if (activeOnly) query.expired = false

    const all = await Db.disciplineRecords.find(query).toArray()
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

    let headerIdx = rows.findIndex(r => r[0]?.toLowerCase() === 'discipline level')
    if (headerIdx === -1) return NextResponse.json({ error: 'Could not find header row' }, { status: 400 })

    const dataRows = rows.slice(headerIdx + 2).filter(r => r[0]?.trim() && r[1]?.trim())

    const now = new Date()
    const docs: DisciplineRecord[] = dataRows.map(r => ({
        _id: new ObjectId() as DisciplineRecord['_id'],
        disciplineLevel: r[0] ?? '',
        name: r[1] ?? '',
        issued: r[2] ?? '',
        expires: r[3] ?? '',
        expired: r[4]?.trim().toUpperCase() === 'TRUE',
        givenBy: r[5] ?? '',
        authorisedBy: r[6] ?? '',
        pointsRemoved: r[7] ? (parseInt(r[7], 10) || undefined) : undefined,
        reason: r[8] ?? '',
        importedAt: now,
    }))

    await Db.disciplineRecords.deleteMany({})
    if (docs.length > 0) await Db.disciplineRecords.insertMany(docs as any)

    return NextResponse.json({ ok: true, imported: docs.length })
}
