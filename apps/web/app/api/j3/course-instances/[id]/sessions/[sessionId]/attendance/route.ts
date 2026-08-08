import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; sessionId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
    const { id, sessionId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const attendance = await Db.candidateAttendance.find({ courseInstanceId: id, courseSessionId: sessionId }).toArray()
    return NextResponse.json({ attendance })
}

export async function PATCH(req: NextRequest, { params }: Params) {
    const { id, sessionId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json()
    const { courseCandidateId, candidateNumber, status, notes } = body
    if (!courseCandidateId || !status) return NextResponse.json({ error: 'courseCandidateId and status required' }, { status: 400 })
    const now = new Date()
    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''

    const previous = await Db.candidateAttendance.findOne({ courseInstanceId: id, courseSessionId: sessionId, courseCandidateId })
    const previousStatus = previous?.status

    await Db.candidateAttendance.updateOne(
        { courseInstanceId: id, courseSessionId: sessionId, courseCandidateId },
        {
            $set: {
                courseInstanceId: id,
                courseSessionId: sessionId,
                courseCandidateId,
                candidateNumber: candidateNumber ?? previous?.candidateNumber ?? 0,
                status: status as AttendanceStatus,
                notes: notes ?? '',
                recordedById: me.id,
                recordedByName: name,
                updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
        },
        { upsert: true },
    )

    if (previousStatus !== status) {
        await Db.courseActivityLogs.insertOne({
            courseInstanceId: id,
            courseSessionId: sessionId,
            courseCandidateId,
            candidateNumber: candidateNumber ?? previous?.candidateNumber,
            action: 'attendance.change',
            fieldName: 'status',
            previousValue: previousStatus ?? '',
            newValue: status,
            performedById: me.id,
            performedByName: name,
            createdAt: now,
        } as CourseActivityLog)
    }

    const record = await Db.candidateAttendance.findOne({ courseInstanceId: id, courseSessionId: sessionId, courseCandidateId })
    return NextResponse.json({ attendance: record })
}
