import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { fetchAndParseSheet, DEFAULT_SHEET_ID, type ParsedImportRecord } from '../_parser'

export const dynamic = 'force-dynamic'

function buildImportRef(batchSeq: number): string {
    return `HIST-${String(batchSeq).padStart(3, '0')}`
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const sheetId = body.sheetId ?? DEFAULT_SHEET_ID

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const batchId = `batch_${Date.now()}`
    const now = new Date()

    await logAction({
        action: 'training_record.import_start',
        category: 'J3',
        performedBy: me.id,
        performedByName: displayName,
        department: 'J3',
        entityType: 'import_batch',
        entityId: batchId,
        after: { sheetId, batchId },
    })

    let records: ParsedImportRecord[]
    try {
        records = await fetchAndParseSheet(sheetId)
    } catch (err) {
        await logAction({
            action: 'training_record.import_fail',
            category: 'J3',
            performedBy: me.id,
            performedByName: displayName,
            department: 'J3',
            entityType: 'import_batch',
            entityId: batchId,
            after: { error: String(err) },
        })
        return NextResponse.json({ error: `Failed to fetch sheet: ${err}` }, { status: 502 })
    }

    if (records.length === 0) {
        return NextResponse.json({ imported: 0, skipped: 0, failed: 0, errors: [], batchId })
    }

    // Check which already exist
    const existingKeys = new Set(
        (await Db.courseInstances
            .find({ sourceSheetId: sheetId, isHistoricalImport: true } as Parameters<typeof Db.courseInstances.find>[0])
            .project<{ sourceRowRange: string }>({ sourceRowRange: 1 })
            .toArray()
        ).map(r => r.sourceRowRange)
    )

    // Get a batch sequence number from a counter (reuse course_instance_counters with key 'hist')
    const counterResult = await Db.courseInstanceCounters.findOneAndUpdate(
        { _id: 'hist' },
        { $inc: { seq: records.filter(r => !existingKeys.has(r.sourceRowRange)).length } },
        { upsert: true, returnDocument: 'before' },
    )
    let seq = (counterResult?.seq ?? 0) + 1

    let imported = 0
    let skipped = 0
    let failed = 0
    const errors: string[] = []

    for (const record of records) {
        if (existingKeys.has(record.sourceRowRange)) {
            skipped++
            continue
        }

        try {
            const instanceRef = buildImportRef(seq++)
            const doc: CourseInstance = {
                trainingTypeId: 'historical',
                trainingTypeName: record.trainingRun || 'Unknown Training',
                courseType: 'historical',
                instanceNumber: 0,
                instanceRef,
                status: 'completed',
                startDate: record.date,
                leadInstructorName: record.staff[0] ?? undefined,
                candidateCount: record.trainees.length,
                staffCount: record.staff.length,
                passedCount: 0,
                failedCount: 0,
                withdrawnCount: 0,
                instructors: record.staff.map(name => ({ userId: '', displayName: name, role: 'instructor' })),
                isLocked: true,
                lockedAt: now,
                lockedById: me.id,
                lockedByName: displayName,
                notes: record.notes || undefined,
                isHistoricalImport: true,
                importBatchId: batchId,
                sourceSheetId: sheetId,
                sourceRowRange: record.sourceRowRange,
                legacyTicketRef: record.ticketRef || undefined,
                historicalTrainees: record.trainees,
                historicalStaff: record.staff,
                createdById: me.id,
                createdByName: displayName,
                createdAt: now,
                updatedAt: now,
            }

            await Db.courseInstances.insertOne(doc)
            imported++
        } catch (err) {
            failed++
            errors.push(`Row ${record.sourceRowRange}: ${String(err)}`)
        }
    }

    await logAction({
        action: 'training_record.import_complete',
        category: 'J3',
        performedBy: me.id,
        performedByName: displayName,
        department: 'J3',
        entityType: 'import_batch',
        entityId: batchId,
        after: { imported, skipped, failed, sheetId },
    })

    // Record batch metadata in trainingImportRecords
    await Db.trainingImportRecords.insertOne({
        batchId,
        sheetId,
        importedBy: me.id,
        importedByName: displayName,
        imported,
        skipped,
        failed,
        errors,
        importedAt: now,
    }).catch(() => {})

    return NextResponse.json({ imported, skipped, failed, errors, batchId })
}
