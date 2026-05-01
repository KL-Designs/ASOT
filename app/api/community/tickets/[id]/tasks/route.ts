import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { randomUUID } from 'crypto'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logAction'
import { createNotification } from '@/lib/notifications'
import { sendMeetingDM } from '@/lib/discord/bot'

type User = Awaited<ReturnType<typeof client.fetchMe>>

function getLeadDepts(me: User): string[] {
    return Object.entries(PERMISSIONS.departmentLeads)
        .filter(([, roles]) => client.hasRoles(me, roles))
        .map(([dept]) => dept)
}

// POST /api/community/tickets/[id]/tasks — add a task
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)
    const leadDepts = getLeadDepts(me)

    const ticket = await Db.communityTickets.findOne({ _id: new ObjectId(id) })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ticketDepts = ticket.departments?.length ? ticket.departments : [ticket.department]
    const isLeadForTicket = leadDepts.some(d => ticketDepts.includes(d))
    if (!isJ4 && !isLeadForTicket) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => null)
    if (!body?.title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 })

    const actorName = me.guild.displayName ?? me.username
    const now = new Date()

    const task: CommunityTicketTask = {
        id: randomUUID(),
        title: body.title.trim(),
        status: 'pending',
        createdAt: now,
        createdByName: actorName,
        ...(body.description?.trim() && { description: body.description.trim() }),
        ...(body.assignedToUserId && { assignedToUserId: body.assignedToUserId }),
        ...(body.assignedToUserName && { assignedToUserName: body.assignedToUserName }),
        ...(body.assignedToRole && { assignedToRole: body.assignedToRole }),
        ...(body.dueAt && { dueAt: new Date(body.dueAt) }),
        ...(body.chaseUpAt && { chaseUpAt: new Date(body.chaseUpAt) }),
    }

    await Db.communityTickets.updateOne(
        { _id: new ObjectId(id) },
        {
            $push: { tasks: task as any },
            $set: { updatedAt: now },
        }
    )

    await logAction({
        action: 'ticket.task_create',
        category: 'ticket',
        performedBy: me.id,
        performedByName: actorName,
        entityType: 'ticket',
        entityId: id,
        actionUrl: `/community/tickets/${id}`,
        target: `Task "${task.title}" on "${ticket.title}"`,
        details: { taskId: task.id, departments: ticketDepts },
    }).catch(() => {})

    // Fire assignment notifications if someone was assigned
    if (task.assignedToUserId || task.assignedToRole) {
        const actionUrl = `/community/tickets/${id}`
        const fmtDate = (d: Date) => new Date(d).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        const notifTitle = `Task Assigned: "${task.title}"`
        const notifLines = [
            `You have been assigned a new task on ticket: "${ticket.title}"`,
            `Task: ${task.title}`,
            ...(task.description ? [`Details: ${task.description}`] : []),
            `Assigned by: ${actorName}`,
            ...(task.dueAt ? [`Due: ${fmtDate(task.dueAt)}`] : []),
            ...(task.chaseUpAt ? [`Reminder: ${fmtDate(task.chaseUpAt)}`] : []),
        ]
        const notifBody = notifLines.join('\n')

        // Notify specific assigned member
        if (task.assignedToUserId) {
            await createNotification({ userId: task.assignedToUserId, type: 'ticket_task_assigned', title: notifTitle, body: notifBody, actionUrl, relatedId: id }).catch(() => {})
            await sendMeetingDM(task.assignedToUserId, notifTitle, notifBody, actionUrl).catch(() => {})
        }

        // Notify all members with the assigned role
        if (task.assignedToRole) {
            const roleMembers = await Db.users
                .find({ 'guild.roles': task.assignedToRole, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } }, { projection: { _id: 1, id: 1 } })
                .toArray()
            await Promise.all(roleMembers.map(u => Promise.all([
                createNotification({ userId: u._id.toString(), type: 'ticket_task_assigned', title: notifTitle, body: notifBody, actionUrl, relatedId: id }).catch(() => {}),
                sendMeetingDM(u.id as string, notifTitle, notifBody, actionUrl).catch(() => {}),
            ])))
        }

        await logAction({
            action: 'ticket.task_assigned',
            category: 'ticket',
            performedBy: me.id,
            performedByName: actorName,
            entityType: 'ticket',
            entityId: id,
            actionUrl,
            target: `Task "${task.title}" on "${ticket.title}"`,
            details: {
                taskId: task.id,
                ...(task.assignedToUserId && { assignedToUserId: task.assignedToUserId }),
                ...(task.assignedToUserName && { assignedToUserName: task.assignedToUserName }),
                ...(task.assignedToRole && { assignedToRole: task.assignedToRole }),
            },
        }).catch(() => {})
    }

    return NextResponse.json(task, { status: 201 })
}
