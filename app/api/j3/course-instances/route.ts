import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { calculateSessionDates, SESSION_DEFS } from '@/lib/training/session-dates'
import { logAction } from '@/lib/logAction'

export const dynamic = 'force-dynamic'

const ACTIVE_STATUSES: CourseInstanceStatus[] = ['planning', 'active', 'in_progress']

export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const typeId = req.nextUrl.searchParams.get('trainingTypeId')
    if (!typeId) return NextResponse.json({ error: 'trainingTypeId required' }, { status: 400 })

    const includeDeleted = req.nextUrl.searchParams.get('includeDeleted') === 'true'
    const filter: Record<string, unknown> = { trainingTypeId: typeId }
    if (!includeDeleted) filter.deletedAt = { $exists: false }

    const instances = await Db.courseInstances.find(filter).sort({ instanceNumber: 1 }).toArray()
    return NextResponse.json({ instances })
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { trainingTypeId, session1Date: session1DateRaw } = body
    if (!trainingTypeId) return NextResponse.json({ error: 'trainingTypeId required' }, { status: 400 })

    let oid: ObjectId
    try { oid = new ObjectId(trainingTypeId) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const trainingType = await Db.trainingTypes.findOne({ _id: oid })
    if (!trainingType) return NextResponse.json({ error: 'Training type not found' }, { status: 404 })
    if (!trainingType.courseType) return NextResponse.json({ error: 'Not a course type' }, { status: 400 })

    const existing = await Db.courseInstances.findOne({
        trainingTypeId,
        status: { $in: ACTIVE_STATUSES },
        deletedAt: { $exists: false },
    })
    if (existing) return NextResponse.json({ error: 'An active course instance already exists for this type' }, { status: 409 })

    const counter = await Db.courseInstanceCounters.findOneAndUpdate(
        { _id: trainingTypeId },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
    )
    const seq = counter?.seq ?? 1
    const prefix = trainingType.courseType === 'selection' ? 'SEL' : 'RC'
    const instanceRef = `${prefix}-${String(seq).padStart(3, '0')}`

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const now = new Date()

    // Parse optional session 1 date and calculate all 6 session dates
    let sessionDates: Date[] | null = null
    let parsedSession1Date: Date | undefined
    if (session1DateRaw) {
        const d = new Date(session1DateRaw)
        if (!isNaN(d.getTime())) {
            parsedSession1Date = d
            sessionDates = calculateSessionDates(d)
        }
    }

    const status: CourseInstanceStatus = 'planning'

    const doc: Omit<CourseInstance, '_id'> = {
        trainingTypeId,
        trainingTypeName: trainingType.name,
        courseType: trainingType.courseType as CourseInstanceType,
        instanceNumber: seq,
        instanceRef,
        status,
        createdById: me.id,
        createdByName: name,
        createdAt: now,
        updatedAt: now,
        ...(parsedSession1Date ? {
            session1Date: parsedSession1Date,
            startDate: sessionDates![0],
            endDate: sessionDates![5],
        } : {}),
    }

    const result = await Db.courseInstances.insertOne(doc as CourseInstance)
    const instanceId = String(result.insertedId)

    await logAction({
        action: 'course.create',
        category: 'J3',
        performedBy: me.id,
        performedByName: name,
        department: 'J3',
        entityType: 'course_instance',
        entityId: instanceId,
        after: { instanceRef, courseType: trainingType.courseType, trainingTypeName: trainingType.name, status: 'planning' },
    })

    // Create 6 session documents if dates were provided
    if (sessionDates) {
        const sessionDocs = SESSION_DEFS.map((def, i) => ({
            courseInstanceId: instanceId,
            sessionNumber: def.sessionNumber,
            weekNumber: def.weekNumber,
            title: def.title,
            catchUp: def.catchUp,
            scheduledDate: sessionDates![i],
            createdAt: now,
            updatedAt: now,
        }))
        await Db.courseSessions.insertMany(sessionDocs as CourseSession[])

    // Create calendar events for each session (J3 + unit calendars)
    const courseLabel = trainingType.courseType === 'selection' ? 'Selection' : 'Reinforcement Cycle'
    const calendarDocs: Omit<CalendarEvent, '_id'>[] = []
    for (let i = 0; i < SESSION_DEFS.length; i++) {
        const def = SESSION_DEFS[i]
        const sessionDate = new Date(sessionDates![i])
        sessionDate.setHours(0, 0, 0, 0)
        const dayEnd = new Date(sessionDate)
        dayEnd.setHours(23, 59, 59, 999)
        const title = `${courseLabel} ${instanceRef} — Session ${def.sessionNumber}`
        const description = 'Status: Planning'
        const base = {
            title,
            description,
            start: sessionDate,
            end: dayEnd,
            allDay: true,
            courseInstanceId: instanceId,
            createdById: me.id,
            createdByName: name,
            createdAt: now,
        }
        calendarDocs.push({ ...base, department: 'j3' } as Omit<CalendarEvent, '_id'>)
        calendarDocs.push({ ...base, title: `[J3] ${title}`, department: 'unit' } as Omit<CalendarEvent, '_id'>)
    }
    const calResult = await Db.calendarEvents.insertMany(calendarDocs as CalendarEvent[])
    const calIds = Object.values(calResult.insertedIds).map(id => String(id))
    await Db.courseInstances.updateOne({ _id: result.insertedId }, { $set: { calendarEventIds: calIds } })
    }

    return NextResponse.json({ ...doc, _id: result.insertedId }, { status: 201 })
}
