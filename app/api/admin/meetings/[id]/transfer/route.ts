import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { initMeetingAttendance } from '@/lib/attendance/meeting-init'
import { logAction } from '@/lib/logAction'

const DEPT_NAMES: Record<string, string> = {
    j1: 'J1 Recruitment', j2: 'J2 Mission Making', j3: 'J3 Training',
    j4: 'J4 Administration', j5: 'J5 Media', j6: 'J6 Game Masters',
    j7: 'J7 Community Development',
}

// POST /api/admin/meetings/[id]/transfer
// Department leads and J4 can transfer meeting notes to another department.
// Creates a new meeting document in the target dept marked as transferred.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Must be a dept lead or J4
    const srcDeptKey = meeting.department as keyof typeof PERMISSIONS.departments
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)
    const isSrcLead = PERMISSIONS.departmentLeads[srcDeptKey as keyof typeof PERMISSIONS.departmentLeads]
        ? client.hasRoles(me, PERMISSIONS.departmentLeads[srcDeptKey as keyof typeof PERMISSIONS.departmentLeads])
        : false
    if (!isJ4 && !isSrcLead) return NextResponse.json({ error: 'Only department leads or J4 can transfer notes' }, { status: 403 })

    let body: { targetDepartment: MeetingDepartment }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const { targetDepartment } = body
    if (!targetDepartment || !PERMISSIONS.departments[targetDepartment as keyof typeof PERMISSIONS.departments]) {
        return NextResponse.json({ error: 'Invalid target department' }, { status: 400 })
    }
    if (targetDepartment === meeting.department) {
        return NextResponse.json({ error: 'Target must differ from source department' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    const now = new Date()

    const transferSource: MeetingTransferSource = {
        meetingId: id,
        department: meeting.department as MeetingDepartment,
        title: meeting.title,
        date: meeting.date,
        transferredBy: me.id,
        transferredByName: displayName,
        transferredAt: now,
    }

    const result = await Db.meetings.insertOne({
        department: targetDepartment,
        title: meeting.title,
        date: meeting.date,
        notes: meeting.notes,
        tasks: [],
        attachments: meeting.attachments ?? [],
        attendees: [],
        invitedUserIds: [],
        locked: false,
        isTransferred: true,
        transferredFrom: transferSource,
        notifyRoles: [],
        notifyUserIds: [],
        reminderSent: false,
        createdBy: me.id,
        createdByName: displayName,
        createdAt: now,
        updatedAt: now,
    })

    const newMeetingId = result.insertedId.toString()

    // Auto-init attendance for the target dept
    await initMeetingAttendance(newMeetingId, targetDepartment, [])
        .catch(err => console.error('[transfer] attendance init failed:', err))

    // Log the transfer
    await logAction({
        action: 'meeting.transfer',
        category: 'meeting',
        performedBy: me.id,
        performedByName: displayName,
        department: meeting.department,
        entityType: 'meeting',
        entityId: id,
        actionUrl: `/dashboard/meeting/${id}`,
        target: `"${meeting.title}" → ${DEPT_NAMES[targetDepartment] ?? targetDepartment}`,
        details: { sourceDept: meeting.department, targetDept: targetDepartment, newMeetingId },
    })

    return NextResponse.json({ ok: true, newMeetingId })
}
