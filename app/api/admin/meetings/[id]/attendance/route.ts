import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// POST /api/admin/meetings/[id]/attendance
// Initialises the attendee list from department members (lead only).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const deptKey = meeting.department as keyof typeof PERMISSIONS.departments
    if (!client.hasRoles(me, PERMISSIONS.departments[deptKey])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { department } = await request.json().catch(() => ({ department: meeting.department }))

    // Fetch all active members with the relevant department
    const users = await Db.users
        .find(
            { departments: department, isSkeletonAccount: { $ne: true }, discharged: { $exists: false } },
            { projection: { id: 1, name: 1, globalName: 1, username: 1, 'guild.nickname': 1 } }
        )
        .toArray()

    const existingIds = new Set((meeting.attendees ?? []).map((a: MeetingAttendee) => a.userId))

    const newAttendees: MeetingAttendee[] = users
        .filter(u => !existingIds.has(u.id))
        .map(u => {
            const nick = (u.guild?.nickname ?? '').replace(/\s*\[[^\]]*\]/g, '').trim()
            const nickParts = nick.split(' ')
            const name = u.name || (nickParts.length > 1 ? nickParts.slice(1).join(' ') : nick) || u.globalName || u.username || 'Unknown'
            return {
                userId: u.id,
                displayName: name.trim(),
                status: 'pending' as const,
            }
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName))

    await Db.meetings.updateOne(
        { _id: new ObjectId(id) },
        {
            $push: { attendees: { $each: newAttendees } } as Record<string, unknown>,
            $set: { updatedAt: new Date() },
        }
    )

    return NextResponse.json({ ok: true, added: newAttendees.length })
}

// PATCH /api/admin/meetings/[id]/attendance
// Update a specific attendee's status.
// Members can set their own status to: attending, not_attending, loa
// Leads can confirm (attending→confirmed_attended, not_attending→confirmed_absent)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const deptKey = meeting.department as keyof typeof PERMISSIONS.departments
    if (!client.hasRoles(me, PERMISSIONS.departments[deptKey])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { userId, status } = await request.json()
    if (!userId || !status) return NextResponse.json({ error: 'userId and status required' }, { status: 400 })

    const leadKey = meeting.department as keyof typeof PERMISSIONS.departmentLeads
    const isLead = PERMISSIONS.departmentLeads[leadKey]
        ? client.hasRoles(me, PERMISSIONS.departmentLeads[leadKey])
        : false
    const isSelf = me.id === userId

    const MEMBER_STATUSES = ['attending', 'not_attending', 'loa']
    const LEAD_ONLY_STATUSES = ['confirmed_attended', 'confirmed_absent']

    // Self: can only set attending/not_attending/loa
    if (isSelf && !MEMBER_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Members can only RSVP (attending / not attending / LOA)' }, { status: 403 })
    }
    // Lead-only: confirmed statuses
    if (LEAD_ONLY_STATUSES.includes(status) && !isLead) {
        return NextResponse.json({ error: 'Only leads can confirm attendance' }, { status: 403 })
    }
    // LOA cannot be confirmed — it stays as LOA
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
