import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logAction'

// CSV columns: F | Date | Trainees | J3 Staff | Training Run | Notes | Ticket #
// "F" column appears to be a row flag/number; "Training Run" = training type name

function parseDate(raw: string): Date | null {
    if (!raw?.trim()) return null
    // Try DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, and natural formats
    const cleaned = raw.trim()
    const dmyMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
    if (dmyMatch) {
        const [, d, m, y] = dmyMatch
        const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y)
        const dt = new Date(year, parseInt(m) - 1, parseInt(d))
        return isNaN(dt.getTime()) ? null : dt
    }
    const dt = new Date(cleaned)
    return isNaN(dt.getTime()) ? null : dt
}

function parseCsvLine(line: string): string[] {
    const cols: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
            if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
            else inQuote = !inQuote
        } else if (ch === ',' && !inQuote) {
            cols.push(cur.trim())
            cur = ''
        } else {
            cur += ch
        }
    }
    cols.push(cur.trim())
    return cols
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => null)
    if (!body?.csv || typeof body.csv !== 'string') {
        return NextResponse.json({ error: 'csv field required' }, { status: 400 })
    }

    const lines = body.csv.split(/\r?\n/).filter(Boolean)
    if (lines.length < 2) return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 })

    // Detect header row (first line)
    const header = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim())

    // Map column indices
    const colIdx = {
        f:           header.findIndex(h => h === 'f' || h === '#' || h === 'flag'),
        date:        header.findIndex(h => h === 'date'),
        trainees:    header.findIndex(h => h.includes('trainee')),
        staff:       header.findIndex(h => h.includes('staff') || h.includes('trainer') || h.includes('j3 staff')),
        trainingRun: header.findIndex(h => h.includes('training run') || h.includes('training type') || h.includes('course')),
        notes:       header.findIndex(h => h === 'notes' || h === 'note'),
        ticketNum:   header.findIndex(h => h.includes('ticket')),
    }

    const importedById = me.id
    const importedByName = me.guild?.displayName ?? me.username
    const now = new Date()

    const importedRows: object[] = []
    const skipped: { row: number; reason: string }[] = []

    for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i])
        if (cols.every(c => !c)) continue // blank row

        const dateRaw = colIdx.date >= 0 ? cols[colIdx.date] : undefined
        const traineesRaw = colIdx.trainees >= 0 ? cols[colIdx.trainees] : undefined
        const staffRaw = colIdx.staff >= 0 ? cols[colIdx.staff] : undefined
        const trainingRunRaw = colIdx.trainingRun >= 0 ? cols[colIdx.trainingRun] : undefined
        const notesRaw = colIdx.notes >= 0 ? cols[colIdx.notes] : undefined
        const ticketNum = colIdx.ticketNum >= 0 ? cols[colIdx.ticketNum] : undefined

        const date = parseDate(dateRaw ?? '')
        if (!date) {
            skipped.push({ row: i + 1, reason: `Invalid or missing date: "${dateRaw}"` })
            continue
        }

        const trainingTypeName = trainingRunRaw?.trim() || 'Unknown Training'

        // Parse trainee list (comma or semicolon separated names in cell)
        const traineeNames = (traineesRaw ?? '')
            .split(/[;,\n]+/)
            .map(s => s.trim())
            .filter(Boolean)

        // Parse trainer/staff list
        const staffNames = (staffRaw ?? '')
            .split(/[;,\n]+/)
            .map(s => s.trim())
            .filter(Boolean)

        const record = {
            source: 'csv-import',
            importedById,
            importedByName,
            importedAt: now,
            date,
            trainingTypeName,
            traineeNames,
            staffNames,
            notes: notesRaw?.trim() || undefined,
            ticketRef: ticketNum?.trim() || undefined,
            // We don't link to a live TrainingEvent or TrainingTicket unless we can match
        }

        importedRows.push(record)
    }

    // Persist to training_import_records collection
    if (importedRows.length > 0) {
        await Db.trainingImportRecords.insertMany(importedRows)
    }

    logAction({
        action: 'training.import.csv',
        category: 'training',
        performedBy: importedById,
        performedByName: importedByName ?? importedById,
        department: 'j3',
        target: `CSV import: ${importedRows.length} records imported, ${skipped.length} skipped`,
        details: { imported: importedRows.length, skipped: skipped.length },
    }).catch(console.error)

    return NextResponse.json({
        imported: importedRows.length,
        skipped: skipped.length,
        skippedDetails: skipped,
    })
}

// GET: list previously imported records
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500)
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)

    const records = await Db.trainingImportRecords
        .find({})
        .sort({ date: -1 })
        .skip(offset)
        .limit(limit)
        .toArray()

    const total = await Db.trainingImportRecords.countDocuments()
    return NextResponse.json({ records, total })
}
