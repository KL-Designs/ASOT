import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logAction'
import {
    parseCsvToSessions,
    normalizeTrainingType,
    getTypeAcronym,
    TYPE_ACRONYMS,
} from '@/lib/training/import-parser'

// ─── Per-type counters (keyed h_{ACRONYM}) ────────────────────────────────────
async function getNextTypeSeq(acronym: string, count: number): Promise<number> {
    const key = `h_${acronym}`
    const result = await Db.courseInstanceCounters.findOneAndUpdate(
        { _id: key } as Parameters<typeof Db.courseInstanceCounters.findOneAndUpdate>[0],
        { $inc: { seq: count } },
        { upsert: true, returnDocument: 'before' },
    )
    return (result?.seq ?? 0) + 1
}

function buildTypeRef(acronym: string, seq: number): string {
    return `${acronym}-${String(seq).padStart(3, '0')}`
}

// ─── POST: import CSV ─────────────────────────────────────────────────────────
// Accepts an optional typeMap (from the analyze → review UI) to override
// canonical names and acronyms. If not provided, auto-detection is used.
export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => null)
    if (!body?.csv || typeof body.csv !== 'string') {
        return NextResponse.json({ error: 'csv field required' }, { status: 400 })
    }

    const { sessions, skippedRows } = parseCsvToSessions(body.csv)

    // Build typeMap lookup: detectedName → { canonicalName, acronym, skip }
    interface TypeMapEntry { canonicalName: string; acronym: string; skip: boolean }
    const typeMapLookup = new Map<string, TypeMapEntry>()
    if (Array.isArray(body.typeMap)) {
        for (const entry of body.typeMap) {
            if (entry.detectedName && entry.canonicalName && entry.acronym) {
                typeMapLookup.set(entry.detectedName, {
                    canonicalName: entry.canonicalName,
                    acronym:       entry.acronym,
                    skip:          entry.skip ?? false,
                })
            }
        }
    }

    // Build per-session override lookup: rowStart → { canonicalName, acronym }
    const sessionOverrideLookup = new Map<number, { canonicalName: string; acronym: string }>()
    if (Array.isArray(body.sessionOverrides)) {
        for (const o of body.sessionOverrides) {
            if (typeof o.rowStart === 'number' && o.canonicalName) {
                sessionOverrideLookup.set(o.rowStart, {
                    canonicalName: o.canonicalName,
                    acronym:       o.acronym ?? getTypeAcronym(o.canonicalName),
                })
            }
        }
    }

    // Apply overrides: per-session first, then group typeMap
    interface ResolvedSession {
        date: Date
        trainees: string[]
        staff: string[]
        finalName: string
        acronym: string
        notes: string
        ticketRef: string
        rowStart: number
    }

    const resolved: ResolvedSession[] = []
    const userSkippedTypes = new Map<string, number>()

    for (const s of sessions) {
        const sessionOverride = sessionOverrideLookup.get(s.rowStart)
        if (sessionOverride) {
            resolved.push({
                date:      s.date,
                trainees:  s.trainees,
                staff:     s.staff,
                finalName: sessionOverride.canonicalName,
                acronym:   sessionOverride.acronym,
                notes:     s.notes,
                ticketRef: s.ticketRef,
                rowStart:  s.rowStart,
            })
            continue
        }
        const mapEntry = typeMapLookup.get(s.trainingTypeName)
        if (mapEntry?.skip) {
            userSkippedTypes.set(s.trainingTypeName, (userSkippedTypes.get(s.trainingTypeName) ?? 0) + 1)
            continue
        }
        resolved.push({
            date:      s.date,
            trainees:  s.trainees,
            staff:     s.staff,
            finalName: mapEntry?.canonicalName ?? s.trainingTypeName,
            acronym:   mapEntry?.acronym       ?? getTypeAcronym(s.trainingTypeName),
            notes:     s.notes,
            ticketRef: s.ticketRef,
            rowStart:  s.rowStart,
        })
    }

    const totalUserSkipped = Array.from(userSkippedTypes.values()).reduce((a, b) => a + b, 0)

    if (resolved.length === 0) {
        return NextResponse.json({
            imported:         0,
            skipped:          skippedRows.length + totalUserSkipped,
            parseSkippedRows: skippedRows,
            userSkippedTypes: Object.fromEntries(userSkippedTypes),
        })
    }

    const importedById   = me.id
    const importedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const now            = new Date()
    const batchId        = `csv_${Date.now()}`

    // Group by acronym, sort chronologically, allocate sequential refs per type
    const groupedByAcronym = new Map<string, ResolvedSession[]>()
    for (const s of resolved) {
        if (!groupedByAcronym.has(s.acronym)) groupedByAcronym.set(s.acronym, [])
        groupedByAcronym.get(s.acronym)!.push(s)
    }

    const toInsert: CourseInstance[] = []
    for (const [acronym, group] of groupedByAcronym) {
        group.sort((a, b) => a.date.getTime() - b.date.getTime())
        const startSeq = await getNextTypeSeq(acronym, group.length)
        for (let idx = 0; idx < group.length; idx++) {
            const s = group[idx]
            toInsert.push({
                trainingTypeId:     'historical',
                trainingTypeName:   s.finalName,
                courseType:         'historical',
                instanceNumber:     0,
                instanceRef:        buildTypeRef(acronym, startSeq + idx),
                status:             'completed',
                startDate:          s.date,
                leadInstructorName: s.staff[0] ?? undefined,
                candidateCount:     s.trainees.length,
                staffCount:         s.staff.length,
                passedCount:        0,
                failedCount:        0,
                withdrawnCount:     0,
                instructors:        s.staff.map(name => ({ userId: '', displayName: name, role: 'instructor' })),
                isLocked:           true,
                lockedAt:           now,
                lockedById:         importedById,
                lockedByName:       importedByName,
                notes:              s.notes || undefined,
                isHistoricalImport: true,
                importBatchId:      batchId,
                sourceSheetId:      'csv-import',
                sourceRowRange:     `csv-row-${s.rowStart}`,
                legacyTicketRef:    s.ticketRef || undefined,
                historicalTrainees: s.trainees,
                historicalStaff:    s.staff,
                createdById:        importedById,
                createdByName:      importedByName,
                createdAt:          now,
                updatedAt:          now,
            } as CourseInstance)
        }
    }

    await Db.courseInstances.insertMany(toInsert)

    const totalSkipped = skippedRows.length + totalUserSkipped
    await Db.trainingImportRecords.insertOne({
        batchId,
        source:        'csv-import',
        importedById,
        importedByName,
        imported:      toInsert.length,
        skipped:       totalSkipped,
        importedAt:    now,
    }).catch(() => {})

    logAction({
        action:          'training.import.csv',
        category:        'J3',
        performedBy:     importedById,
        performedByName: importedByName,
        department:      'J3',
        entityType:      'import_batch',
        entityId:        batchId,
        after:           { imported: toInsert.length, skipped: totalSkipped },
    }).catch(console.error)

    return NextResponse.json({
        imported:         toInsert.length,
        skipped:          totalSkipped,
        parseSkippedRows: skippedRows,
        userSkippedTypes: Object.fromEntries(userSkippedTypes),
    })
}

// ─── GET: list imported historical records ────────────────────────────────────
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '100', 10), 500)
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)

    const filter = { isHistoricalImport: true, deletedAt: { $exists: false } } as Parameters<typeof Db.courseInstances.find>[0]

    const [records, total] = await Promise.all([
        Db.courseInstances.find(filter).sort({ startDate: -1 }).skip(offset).limit(limit).toArray(),
        Db.courseInstances.countDocuments(filter),
    ])

    return NextResponse.json({ records, total })
}

// ─── PATCH: migrate legacy training_import_records into courseInstances ───────
export async function PATCH(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const legacy = await Db.trainingImportRecords
        .find({ source: { $ne: 'migrated' }, instanceRef: { $exists: false } } as Parameters<typeof Db.trainingImportRecords.find>[0])
        .toArray()

    if (legacy.length === 0) {
        return NextResponse.json({ migrated: 0, message: 'No legacy records to migrate' })
    }

    const importedById   = me.id
    const importedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const now            = new Date()
    const batchId        = `csv_migration_${Date.now()}`

    const grouped = new Map<string, typeof legacy>()
    for (const r of legacy) {
        const typeName = normalizeTrainingType((r as Record<string, unknown>).trainingTypeName as string ?? 'Unknown Training')
        const acronym  = getTypeAcronym(typeName)
        if (!grouped.has(acronym)) grouped.set(acronym, [])
        grouped.get(acronym)!.push(r)
    }

    const toInsert: CourseInstance[] = []
    for (const [acronym, group] of grouped) {
        const startSeq = await getNextTypeSeq(acronym, group.length)
        group.forEach((r: Record<string, unknown>, idx) => {
            const historicalTrainees = (r.traineeNames as string[] | undefined) ?? []
            const historicalStaff    = (r.staffNames   as string[] | undefined) ?? []
            const typeName           = normalizeTrainingType((r.trainingTypeName as string | undefined) ?? 'Unknown Training')
            toInsert.push({
                trainingTypeId:     'historical',
                trainingTypeName:   typeName,
                courseType:         'historical',
                instanceNumber:     0,
                instanceRef:        buildTypeRef(acronym, startSeq + idx),
                status:             'completed',
                startDate:          r.date instanceof Date ? r.date : new Date(r.date as string),
                leadInstructorName: historicalStaff[0] ?? undefined,
                candidateCount:     historicalTrainees.length,
                staffCount:         historicalStaff.length,
                passedCount:        0,
                failedCount:        0,
                withdrawnCount:     0,
                instructors:        historicalStaff.map((name: string) => ({ userId: '', displayName: name, role: 'instructor' })),
                isLocked:           true,
                lockedAt:           now,
                lockedById:         importedById,
                lockedByName:       importedByName,
                notes:              (r.notes as string | undefined) || undefined,
                isHistoricalImport: true,
                importBatchId:      batchId,
                sourceSheetId:      'csv-import',
                sourceRowRange:     `legacy-${(r._id as { toString(): string }).toString()}`,
                legacyTicketRef:    (r.ticketRef as string | undefined) || undefined,
                historicalTrainees,
                historicalStaff,
                createdById:        (r.importedById   as string | undefined) ?? importedById,
                createdByName:      (r.importedByName as string | undefined) ?? importedByName,
                createdAt:          r.importedAt instanceof Date ? r.importedAt : now,
                updatedAt:          now,
            } as CourseInstance)
        })
    }

    await Db.courseInstances.insertMany(toInsert)

    await Db.trainingImportRecords.updateMany(
        { source: { $ne: 'migrated' }, instanceRef: { $exists: false } } as Parameters<typeof Db.trainingImportRecords.updateMany>[0],
        { $set: { source: 'migrated', migratedAt: now } },
    )

    return NextResponse.json({ migrated: legacy.length })
}

// ─── DELETE: clear all historical records + reset per-type counters ───────────
export async function DELETE(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const result = await Db.courseInstances.deleteMany({
        isHistoricalImport: true,
    } as Parameters<typeof Db.courseInstances.deleteMany>[0])

    const counterKeys = ['hist', ...Object.values(TYPE_ACRONYMS).map(a => `h_${a}`)]
    await Promise.all(
        counterKeys.map(key =>
            Db.courseInstanceCounters.findOneAndUpdate(
                { _id: key } as Parameters<typeof Db.courseInstanceCounters.findOneAndUpdate>[0],
                { $set: { seq: 0 } },
                { upsert: false },
            )
        )
    )

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    logAction({
        action:          'training.import.clear',
        category:        'J3',
        performedBy:     me.id,
        performedByName: displayName,
        department:      'J3',
        entityType:      'import_batch',
        entityId:        'clear_all',
        after:           { deleted: result.deletedCount },
    }).catch(console.error)

    return NextResponse.json({ deleted: result.deletedCount })
}
