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
    const attendance = await Db.candidateAttendance.find({ courseInstanceId: id, courseCandidateId: candidateId }).toArray()
    return NextResponse.json({ attendance })
}

export async function PATCH(req: NextRequest, { params }: Params) {
    const { id, candidateId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { courseSessionId, candidateNumber, status, notes } = await req.json()
    if (!courseSessionId || !status) return NextResponse.json({ error: 'courseSessionId and status required' }, { status: 400 })
    const now = new Date()
    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const previous = await Db.candidateAttendance.findOne({ courseInstanceId: id, courseSessionId, courseCandidateId: candidateId })
    await Db.candidateAttendance.updateOne(
        { courseInstanceId: id, courseSessionId, courseCandidateId: candidateId },
        {
            $set: {
                courseInstanceId: id,
                courseSessionId,
                courseCandidateId: candidateId,
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
    if (previous?.status !== status) {
        await Db.courseActivityLogs.insertOne({
            courseInstanceId: id,
            courseSessionId,
            courseCandidateId: candidateId,
            candidateNumber: candidateNumber ?? previous?.candidateNumber,
            action: 'attendance.change',
            fieldName: 'status',
            previousValue: previous?.status ?? '',
            newValue: status,
            performedById: me.id,
            performedByName: name,
            createdAt: now,
        } as CourseActivityLog)
    }
    return NextResponse.json({ ok: true })
}
