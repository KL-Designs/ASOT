import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotification, createNotificationForRole } from '@/lib/notifications'

// POST /api/admin/meetings/[id]/tasks
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const deptKey = meeting.department as keyof typeof PERMISSIONS.departments
    if (!client.hasRoles(me, PERMISSIONS.departments[deptKey])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (meeting.locked) return NextResponse.json({ error: 'Meeting is locked' }, { status: 403 })

    let body: { title: string; description?: string; assignedTo?: string; assignedToName?: string; assignedRole?: string; reminderDate?: string }
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
        reminderDate: body.reminderDate ? new Date(body.reminderDate) : undefined,
        status: 'pending',
        createdBy: me.id,
        createdByName: displayName,
        createdAt: new Date(),
    }

    await Db.meetings.updateOne(
        { _id: new ObjectId(id) },
        { $push: { tasks: task }, $set: { updatedAt: new Date() } }
    )

    // Notify assignee or role
    const actionUrl = `/admin/${meeting.department}`
    if (body.assignedTo) {
        await createNotification({
            userId: body.assignedTo,
            type: 'meeting_task_assigned',
            title: 'Meeting task assigned to you',
            body: `${displayName} assigned you a task: "${task.title}" in ${meeting.title}`,
            actionUrl,
            relatedId: id,
        })
    } else if (body.assignedRole) {
        await createNotificationForRole(body.assignedRole, {
            type: 'meeting_task_assigned',
            title: 'Meeting task assigned to your role',
            body: `${displayName} assigned a task: "${task.title}" in ${meeting.title}`,
            actionUrl,
            relatedId: id,
        })
    }

    return NextResponse.json({ ok: true, taskId })
}
