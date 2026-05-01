import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { initMeetingAttendance } from '@/lib/meetingAttendanceInit'

function isInvited(meeting: { invitedUserIds?: string[] }, userId: string) {
    return (meeting.invitedUserIds ?? []).includes(userId)
}

function hasDeptAccess(me: User, deptKey: keyof typeof PERMISSIONS.departments) {
    return client.hasRoles(me, PERMISSIONS.departments[deptKey])
}

// POST /api/admin/meetings/[id]/attendance
// Syncs the attendee list (adds any new dept/J4/invited members not yet listed).
// Lead only — used for the manual "Sync members" button.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const deptKey = meeting.department as keyof typeof PERMISSIONS.departments
    if (!hasDeptAccess(me, deptKey)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { department } = await request.json().catch(() => ({ department: meeting.department }))

    const added = await initMeetingAttendance(id, department, meeting.invitedUserIds ?? [])
    return NextResponse.json({ ok: true, added })
}

// PATCH /api/admin/meetings/[id]/attendance
// Members (and invited guests) set their own status; leads confirm.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const deptKey = meeting.department as keyof typeof PERMISSIONS.departments
    const hasAccess = hasDeptAccess(me, deptKey) || isInvited(meeting, me.id)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { userId, status } = await request.json()
    if (!userId || !status) return NextResponse.json({ error: 'userId and status required' }, { status: 400 })

    const leadKey = meeting.department as keyof typeof PERMISSIONS.departmentLeads
    const isLead = PERMISSIONS.departmentLeads[leadKey]
        ? client.hasRoles(me, PERMISSIONS.departmentLeads[leadKey])
        : false
    const isSelf = me.id === userId

    const MEMBER_STATUSES = ['attending', 'not_attending', 'loa']
    const LEAD_ONLY_STATUSES = ['confirmed_attended', 'confirmed_absent']

    if (isSelf && !MEMBER_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Members can only RSVP (attending / not attending / LOA)' }, { status: 403 })
    }
    if (LEAD_ONLY_STATUSES.includes(status) && !isLead) {
        return NextResponse.json({ error: 'Only leads can confirm attendance' }, { status: 403 })
    }

    const attendee = (meeting.attendees ?? []).find((a: MeetingAttendee) => a.userId === userId)
    if (attendee?.status === 'loa' && LEAD_ONLY_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'LOA attendance cannot be confirmed' }, { status: 403 })
    }

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    const now = new Date()

    const update: Record<string, unknown> = {
        'attendees.$.status': status,
        'attendees.$.respondedAt': now,
        updatedAt: now,
    }
    if (status === 'confirmed_attended' || status === 'confirmed_absent') {
        update['attendees.$.confirmedBy'] = me.id
        update['attendees.$.confirmedByName'] = displayName
        update['attendees.$.confirmedAt'] = now
    }

    await Db.meetings.updateOne(
        { _id: new ObjectId(id), 'attendees.userId': userId },
        { $set: update }
    )

    return NextResponse.json({ ok: true })
}
