import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; candidateId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
    const { id, candidateId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const feedback = await Db.candidateEventFeedback.find({ courseInstanceId: id, courseCandidateId: candidateId }).toArray()
    return NextResponse.json({ feedback })
}

export async function PATCH(req: NextRequest, { params }: Params) {
    const { id, candidateId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json()
    const { courseSessionId, candidateNumber, eventKey, field, value } = body
    if (!courseSessionId || !eventKey || !field || value === undefined) {
        return NextResponse.json({ error: 'courseSessionId, eventKey, field, value required' }, { status: 400 })
    }
    if (field !== 'positiveObservations' && field !== 'negativeObservations') {
        return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
    }
    const now = new Date()
    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''

    const previous = await Db.candidateEventFeedback.findOne({
        courseInstanceId: id,
        courseSessionId,
        courseCandidateId: candidateId,
        eventKey,
    })
    const previousValue = previous ? ((previous[field as keyof CandidateEventFeedback] as string) ?? '') : ''

    await Db.candidateEventFeedback.updateOne(
        { courseInstanceId: id, courseSessionId, courseCandidateId: candidateId, eventKey },
        {
            $set: {
                courseInstanceId: id,
                courseSessionId,
                courseCandidateId: candidateId,
                candidateNumber: candidateNumber ?? previous?.candidateNumber ?? 0,
                eventKey,
                [field]: value,
                lastEditedById: me.id,
                lastEditedByName: name,
                updatedAt: now,
            },
            $setOnInsert: {
                positiveObservations: field === 'positiveObservations' ? value : '',
                negativeObservations: field === 'negativeObservations' ? value : '',
                createdAt: now,
            },
        },
        { upsert: true },
    )

    if (previousValue !== value) {
        await Db.courseActivityLogs.insertOne({
            courseInstanceId: id,
            courseSessionId,
            courseCandidateId: candidateId,
            candidateNumber: candidateNumber ?? previous?.candidateNumber,
            eventKey,
            action: 'feedback.update',
            fieldName: field,
            previousValue,
            newValue: value,
            performedById: me.id,
            performedByName: name,
            createdAt: now,
        } as CourseActivityLog)
    }

    const record = await Db.candidateEventFeedback.findOne({
        courseInstanceId: id,
        courseSessionId,
        courseCandidateId: candidateId,
        eventKey,
    })
    return NextResponse.json({ feedback: record })
}
