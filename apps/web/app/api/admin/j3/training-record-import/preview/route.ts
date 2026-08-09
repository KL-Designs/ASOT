import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { fetchAndParseSheet, DEFAULT_SHEET_ID } from '../_parser'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const sheetId = body.sheetId ?? DEFAULT_SHEET_ID

    let records
    try {
        records = await fetchAndParseSheet(sheetId)
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 502 })
    }

    if (records.length === 0) {
        return NextResponse.json({ records: [], wouldImport: 0, wouldSkip: 0 })
    }

    // Check which records already exist (by sourceSheetId + sourceRowRange)
    const existingKeys = new Set(
        (await Db.courseInstances
            .find({ sourceSheetId: sheetId, isHistoricalImport: true } as Parameters<typeof Db.courseInstances.find>[0])
            .project<{ sourceRowRange: string }>({ sourceRowRange: 1 })
            .toArray()
        ).map(r => r.sourceRowRange)
    )

    const preview = records.map(r => ({
        date: r.date.toISOString(),
        trainees: r.trainees,
        staff: r.staff,
        trainingRun: r.trainingRun,
        notes: r.notes,
        ticketRef: r.ticketRef,
        sourceRowRange: r.sourceRowRange,
        status: existingKeys.has(r.sourceRowRange) ? 'skip' : 'import',
    }))

    const wouldImport = preview.filter(p => p.status === 'import').length
    const wouldSkip   = preview.filter(p => p.status === 'skip').length

    return NextResponse.json({ records: preview, wouldImport, wouldSkip })
}
