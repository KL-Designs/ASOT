import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logAction'

type User = Awaited<ReturnType<typeof client.fetchMe>>

function getLeadDepts(me: User): string[] {
    return Object.entries(PERMISSIONS.departmentLeads)
        .filter(([, roles]) => client.hasRoles(me, roles))
        .map(([dept]) => dept)
}

// PATCH /api/community/tickets/[id]/tasks/[taskId] — update/complete a task
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, taskId } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)
    const leadDepts = getLeadDepts(me)

    const ticket = await Db.communityTickets.findOne({ _id: new ObjectId(id) })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ticketDepts = ticket.departments?.length ? ticket.departments : [ticket.department]
    const isLeadForTicket = leadDepts.some(d => ticketDepts.includes(d))
    if (!isJ4 && !isLeadForTicket) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const now = new Date()
    const actorName = me.guild.displayName ?? me.username

    const setFields: Record<string, unknown> = { updatedAt: now }

    if (body.status === 'completed') {
        setFields['tasks.$.status'] = 'completed'
        setFields['tasks.$.completedAt'] = now
        setFields['tasks.$.completedByName'] = actorName
    } else if (body.status === 'pending') {
        setFields['tasks.$.status'] = 'pending'
        setFields['tasks.$.completedAt'] = null
        setFields['tasks.$.completedByName'] = null
    }
    if (body.title?.trim()) setFields['tasks.$.title'] = body.title.trim()
    if (body.description !== undefined) setFields['tasks.$.description'] = body.description?.trim() ?? ''
    if (body.dueAt !== undefined) setFields['tasks.$.dueAt'] = body.dueAt ? new Date(body.dueAt) : null
    if (body.assignedToUserName !== undefined) setFields['tasks.$.assignedToUserName'] = body.assignedToUserName
    if (body.assignedToRole !== undefined) setFields['tasks.$.assignedToRole'] = body.assignedToRole

    await Db.communityTickets.updateOne(
        { _id: new ObjectId(id), 'tasks.id': taskId },
        { $set: setFields }
    )

    if (body.status === 'completed') {
        const task = ticket.tasks?.find(t => t.id === taskId)
        await logAction({
            action: 'ticket.task_complete',
            category: 'ticket',
            performedBy: me.id,
            performedByName: actorName,
            entityType: 'ticket',
            entityId: id,
            actionUrl: `/feedback/${id}`,
            target: `Task "${task?.title ?? taskId}" on "${ticket.title}"`,
        }).catch(() => {})
    }

    const updated = await Db.communityTickets.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated?.tasks?.find(t => t.id === taskId) ?? {})
}

// DELETE /api/community/tickets/[id]/tasks/[taskId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, taskId } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)
    const leadDepts = getLeadDepts(me)

    const ticket = await Db.communityTickets.findOne({ _id: new ObjectId(id) })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ticketDepts = ticket.departments?.length ? ticket.departments : [ticket.department]
    if (!isJ4 && !leadDepts.some(d => ticketDepts.includes(d))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await Db.communityTickets.updateOne(
        { _id: new ObjectId(id) },
        {
            $pull: { tasks: { id: taskId } as any },
            $set: { updatedAt: new Date() },
        }
    )

    return NextResponse.json({ ok: true })
}
