import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { notifyMeetingUser, notifyMeetingRole } from '@/lib/notifications/meeting'

// POST /api/admin/meetings/[id]/tasks
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const deptKey = meeting.department as keyof typeof PERMISSIONS.departments
    const hasAccess = client.hasRoles(me, PERMISSIONS.departments[deptKey]) || (meeting.invitedUserIds ?? []).includes(me.id)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (meeting.locked) return NextResponse.json({ error: 'Meeting is locked' }, { status: 403 })

    let body: { title: string; description?: string; assignedTo?: string; assignedToName?: string; assignedRole?: string; dueDate?: string; chaseUpDate?: string }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    if (!body.title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 })

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    const taskId = crypto.randomUUID()

    const task: MeetingTask = {
        id: taskId,
        title: body.title.trim(),
        description: body.description?.trim() || undefined,
        assignedTo: body.assignedTo || undefined,
        assignedToName: body.assignedToName || undefined,
        assignedRole: body.assignedRole || undefined,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        chaseUpDate: body.chaseUpDate ? new Date(body.chaseUpDate) : undefined,
        status: 'pending',
        createdBy: me.id,
        createdByName: displayName,
        createdAt: new Date(),
    }

    await Db.meetings.updateOne(
        { _id: new ObjectId(id) },
        { $push: { tasks: task }, $set: { updatedAt: new Date() } }
    )

    const actionUrl = `/dashboard/meeting/${id}`

    // Fire task-assigned notification immediately (website + Discord DM)
    if (body.assignedTo) {
        await notifyMeetingUser(body.assignedTo, {
            type: 'meeting_task_assigned',
            title: 'Meeting task assigned to you',
            body: `${displayName} assigned you a task: "${task.title}" in "${meeting.title}"`,
            actionUrl,
            meetingId: id,
        })
    } else if (body.assignedRole) {
        await notifyMeetingRole(body.assignedRole, {
            type: 'meeting_task_assigned',
            title: 'Meeting task assigned to your role',
            body: `${displayName} assigned a task to ${body.assignedRole}: "${task.title}" in "${meeting.title}"`,
            actionUrl,
            meetingId: id,
        })
    }

    // Queue chase-up notification at chaseUpDate (time-delayed — handled by cron)
    if (task.chaseUpDate) {
        const chaseTitle = `Task chase-up: ${task.title}`
        const chaseBody = `Chase-up reminder: "${task.title}" in "${meeting.title}" needs follow-up.`
        if (body.assignedTo) {
            await Db.meetingNotifQueue.insertOne({ meetingId: id, taskId, type: 'meeting_task_chaseup', notifyTitle: chaseTitle, notifyBody: chaseBody, actionUrl, fireAt: task.chaseUpDate, recipientUserId: body.assignedTo })
        } else if (body.assignedRole) {
            await Db.meetingNotifQueue.insertOne({ meetingId: id, taskId, type: 'meeting_task_chaseup', notifyTitle: chaseTitle, notifyBody: chaseBody, actionUrl, fireAt: task.chaseUpDate, recipientRole: body.assignedRole })
        }
    }

    return NextResponse.json({ ok: true, taskId })
}
