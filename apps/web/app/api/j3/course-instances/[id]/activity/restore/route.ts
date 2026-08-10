import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasPermission(me, 'departmentLeads.j3'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { logId } = body
    if (!logId) return NextResponse.json({ error: 'logId required' }, { status: 400 })

    let logOid: ObjectId
    try { logOid = new ObjectId(logId) } catch { return NextResponse.json({ error: 'Invalid logId' }, { status: 400 }) }

    const log = await Db.courseActivityLogs.findOne({ _id: logOid, courseInstanceId: id })
    if (!log) return NextResponse.json({ error: 'Log entry not found' }, { status: 404 })

    if (log.action !== 'feedback.update' && log.action !== 'feedback.restore') {
        return NextResponse.json({ error: 'Only feedback entries can be restored' }, { status: 400 })
    }
    if (!log.courseCandidateId || !log.courseSessionId || !log.eventKey || !log.fieldName) {
        return NextResponse.json({ error: 'Log entry missing required fields for restore' }, { status: 400 })
    }
    if (log.fieldName !== 'positiveObservations' && log.fieldName !== 'negativeObservations') {
        return NextResponse.json({ error: 'Invalid field name' }, { status: 400 })
    }
    if (log.previousValue === undefined) {
        return NextResponse.json({ error: 'No previous value to restore' }, { status: 400 })
    }

    const restoreValue = log.previousValue
    const now = new Date()
    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''

    const existing = await Db.candidateEventFeedback.findOne({
        courseInstanceId: id,
        courseSessionId: log.courseSessionId,
        courseCandidateId: log.courseCandidateId,
        eventKey: log.eventKey,
    })
    const currentValue = existing ? ((existing[log.fieldName as keyof CandidateEventFeedback] as string) ?? '') : ''

    await Db.candidateEventFeedback.updateOne(
        {
            courseInstanceId: id,
            courseSessionId: log.courseSessionId,
            courseCandidateId: log.courseCandidateId,
            eventKey: log.eventKey,
        },
        {
            $set: {
                courseInstanceId: id,
                courseSessionId: log.courseSessionId,
                courseCandidateId: log.courseCandidateId,
                candidateNumber: log.candidateNumber ?? existing?.candidateNumber ?? 0,
                eventKey: log.eventKey,
                [log.fieldName]: restoreValue,
                lastEditedById: me.id,
                lastEditedByName: name,
                updatedAt: now,
            },
            $setOnInsert: {
                positiveObservations: log.fieldName === 'positiveObservations' ? restoreValue : '',
                negativeObservations: log.fieldName === 'negativeObservations' ? restoreValue : '',
                createdAt: now,
            },
        },
        { upsert: true },
    )

    await Db.courseActivityLogs.insertOne({
        courseInstanceId: id,
        courseSessionId: log.courseSessionId,
        courseCandidateId: log.courseCandidateId,
        candidateNumber: log.candidateNumber,
        eventKey: log.eventKey,
        action: 'feedback.restore',
        fieldName: log.fieldName,
        previousValue: currentValue,
        newValue: restoreValue,
        performedById: me.id,
        performedByName: name,
        createdAt: now,
    } as CourseActivityLog)

    return NextResponse.json({ ok: true, restoredValue: restoreValue })
}
