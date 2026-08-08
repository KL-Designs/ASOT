import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'

// POST /api/admin/meetings/[id]/complete
// Marks the meeting as completed and locks it. Lead only.
// Queues a 24-hour attendance confirmation reminder for the dept lead role.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (meeting.completed) return NextResponse.json({ error: 'Already completed' }, { status: 400 })

    const leadKey = meeting.department as keyof typeof PERMISSIONS.departmentLeads
    const leadRoles = PERMISSIONS.departmentLeads[leadKey]
    if (!leadRoles || !client.hasRoles(me, leadRoles)) {
        return NextResponse.json({ error: 'Only department leads can complete meetings' }, { status: 403 })
    }

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    const now = new Date()
    const deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    await Db.meetings.updateOne(
        { _id: new ObjectId(id) },
        {
            $set: {
                completed: true,
                completedAt: now,
                completedBy: me.id,
                completedByName: displayName,
                attendanceConfirmationDeadline: deadline,
                locked: true,
                lockedBy: me.id,
                lockedByName: displayName,
                lockedAt: now,
                updatedAt: now,
            },
        }
    )

    await logAction({
        action: 'meeting.complete',
        category: 'meeting',
        performedBy: me.id,
        performedByName: displayName,
        department: meeting.department,
        entityType: 'meeting',
        entityId: id,
        actionUrl: `/dashboard/meeting/${id}`,
        target: `"${meeting.title}"`,
    })

    // Queue attendance confirmation reminder — fires 24h after completion
    const actionUrl = `/admin/${meeting.department}`
    for (const role of leadRoles) {
        await Db.meetingNotifQueue.insertOne({
            meetingId: id,
            type: 'meeting_attendance_overdue',
            notifyTitle: 'Meeting attendance not confirmed',
            notifyBody: `Meeting attendance has not been confirmed. Please review and finalise attendance for "${meeting.title}".`,
            actionUrl,
            fireAt: deadline,
            recipientRole: role,
        })
    }

    return NextResponse.json({ ok: true })
}
