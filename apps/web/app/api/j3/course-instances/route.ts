import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { COURSE_PREFIX, courseTypeOf, nextCourseNumber } from '@/lib/training/course-type'
import { sanitiseSessionPlan, sessionTemplateFor, sessionTitle, suggestedSessionDates, weekOf } from '@/lib/training/course-sessions'
import { logAction } from '@/lib/logAction'
import { sanitiseOffsets } from '@/lib/training/reminder-offsets'
import { rescheduleCourseReminders } from '@/lib/training/scheduleReminders'

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
    // The number the next run of this course gets by default (001, 002, …), for the Add Training Event form.
    const counter = await Db.courseInstanceCounters.findOne({ _id: typeId })
    const type = ObjectId.isValid(typeId) ? await Db.trainingTypes.findOne({ _id: new ObjectId(typeId) }, { projection: { courseType: 1, category: 1, name: 1 } }) : null
    const courseType = type ? courseTypeOf(type) : undefined
    const all = includeDeleted ? instances : await Db.courseInstances.find({ trainingTypeId: typeId }, { projection: { instanceNumber: 1, instanceRef: 1 } }).toArray()
    return NextResponse.json({ instances, nextNumber: nextCourseNumber(counter?.seq, all), prefix: courseType ? COURSE_PREFIX[courseType] : null })
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
    const courseType = courseTypeOf(trainingType)
    if (!courseType) return NextResponse.json({ error: 'Not a course type' }, { status: 400 })

    const existing = await Db.courseInstances.findOne({
        trainingTypeId,
        status: { $in: ACTIVE_STATUSES },
        deletedAt: { $exists: false },
    })
    if (existing) return NextResponse.json({ error: 'An active course instance already exists for this type' }, { status: 409 })

    /*
     * The course number: the next after the highest used by default, or the
     * one J3 typed (to follow on from runs recorded before the site counted
     * them). Either way it must not already be taken, and the counter moves
     * up to it so the next default follows on.
     */
    const prefix = COURSE_PREFIX[courseType]
    const used = await Db.courseInstances.find({ trainingTypeId }, { projection: { instanceNumber: 1, instanceRef: 1, deletedAt: 1 } }).toArray()
    const counterNow = await Db.courseInstanceCounters.findOne({ _id: trainingTypeId })
    const requested = Number(body.instanceNumber)
    const seq = Number.isInteger(requested) && requested > 0 && requested < 10000 ? requested : nextCourseNumber(counterNow?.seq, used)
    const instanceRef = `${prefix}-${String(seq).padStart(3, '0')}`
    if (used.some(u => !u.deletedAt && (u.instanceRef === instanceRef || u.instanceNumber === seq))) {
        return NextResponse.json({ error: `${instanceRef} is already used. Choose another number.` }, { status: 409 })
    }
    await Db.courseInstanceCounters.updateOne({ _id: trainingTypeId }, { $max: { seq } }, { upsert: true })

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const now = new Date()

    /*
     * The sessions, each with its own date and time: as sent by the Add
     * Training Event or launch dialog (named, some perhaps removed), or, from
     * an older client that sends only Session 1, the course's sessions on the
     * suggested Wednesday/Saturday run.
     */
    let plan = sanitiseSessionPlan(body.sessions)
    if (!plan && session1DateRaw) {
        const d = new Date(session1DateRaw)
        if (!isNaN(d.getTime())) {
            const template = sessionTemplateFor({ ...trainingType, courseType })
            plan = suggestedSessionDates(d, template.length).map((start, i) => ({ name: template[i].name, start, durationMinutes: template[i].durationMinutes }))
        }
    }
    const parsedSession1Date = plan?.[0]?.start

    const status: CourseInstanceStatus = 'planning'
    const reminderOffsets = sanitiseOffsets(body.reminderOffsets) ?? undefined

    const doc: Omit<CourseInstance, '_id'> = {
        trainingTypeId,
        trainingTypeName: trainingType.name,
        courseType: courseType as CourseInstanceType,
        instanceNumber: seq,
        instanceRef,
        status,
        createdById: me.id,
        createdByName: name,
        createdAt: now,
        updatedAt: now,
        ...(reminderOffsets ? { reminderOffsets } : {}),
        ...(plan && parsedSession1Date ? {
            session1Date: parsedSession1Date,
            startDate: parsedSession1Date,
            endDate: plan[plan.length - 1].start,
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
        after: { instanceRef, courseType, trainingTypeName: trainingType.name, status: 'planning' },
    })

    // One session document and one pair of calendar events (J3 and unit) per session.
    if (plan && parsedSession1Date) {
        const sessionDocs = plan.map((p, i) => ({
            courseInstanceId: instanceId,
            sessionNumber: i + 1,
            weekNumber: weekOf(parsedSession1Date, p.start),
            title: sessionTitle(i + 1, p.name),
            catchUp: false,
            scheduledDate: p.start,
            ...(p.durationMinutes ? { durationMinutes: p.durationMinutes } : {}),
            createdAt: now,
            updatedAt: now,
        }))
        await Db.courseSessions.insertMany(sessionDocs as CourseSession[])

    const courseLabel = courseType === 'selection' ? 'Selection' : 'Reinforcement Cycle'
    const calendarDocs: Omit<CalendarEvent, '_id'>[] = []
    plan.forEach((p, i) => {
        const minutes = p.durationMinutes ?? trainingType.durationMinutes ?? 120
        const title = `${courseLabel} ${instanceRef} — ${sessionTitle(i + 1, p.name)}`
        const base = {
            title,
            description: 'Status: Planning',
            start: p.start,
            end: new Date(p.start.getTime() + minutes * 60_000),
            allDay: false,
            courseInstanceId: instanceId,
            createdById: me.id,
            createdByName: name,
            createdAt: now,
        }
        calendarDocs.push({ ...base, department: 'j3' } as Omit<CalendarEvent, '_id'>)
        calendarDocs.push({ ...base, title: `[J3] ${title}`, department: 'unit' } as Omit<CalendarEvent, '_id'>)
    })
    const calResult = await Db.calendarEvents.insertMany(calendarDocs as CalendarEvent[])
    const calIds = Object.values(calResult.insertedIds).map(id => String(id))
    await Db.courseInstances.updateOne({ _id: result.insertedId }, { $set: { calendarEventIds: calIds } })
    }

    rescheduleCourseReminders({ ...doc, _id: result.insertedId }).catch(console.error)

    return NextResponse.json({ ...doc, _id: result.insertedId }, { status: 201 })
}
