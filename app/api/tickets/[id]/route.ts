import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logAction'
import { notifyTicketDeptLeads } from '@/lib/ticketNotifications'
import { sendFeedbackStatusDM } from '@/lib/discord/bot'
import { createNotification } from '@/lib/notifications'

type User = Awaited<ReturnType<typeof client.fetchMe>>

function getLeadDepts(me: User): string[] {
    return Object.entries(PERMISSIONS.departmentLeads)
        .filter(([, roles]) => client.hasRoles(me, roles))
        .map(([dept]) => dept)
}


export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)
    const leadDepts = getLeadDepts(me)

    const ticket = await Db.communityTickets.findOne({ _id: new ObjectId(id) })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (ticket.isDeleted && !isJ4) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ticketDepts = ticket.departments?.length ? ticket.departments : [ticket.department]
    const isLeadForTicket = leadDepts.some(d => ticketDepts.includes(d))

    if (ticket.visibility === 'private' && !isJ4 && !isLeadForTicket) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const commentFilter = isJ4
        ? { ticketId: new ObjectId(id) }
        : { ticketId: new ObjectId(id), isDeleted: { $ne: true } }

    const comments = await Db.communityTicketComments
        .find(commentFilter)
        .sort({ createdAt: 1 })
        .toArray()

    return NextResponse.json({
        ...ticket,
        comments,
        isJ4,
        isLeadForTicket,
        myId: me.id,
        myVote: ticket.upvotes.includes(me.id) ? 'up' : ticket.downvotes.includes(me.id) ? 'down' : null,
    })
}


export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)
    const leadDepts = getLeadDepts(me)

    const ticket = await Db.communityTickets.findOne({ _id: new ObjectId(id) })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.isDeleted && !isJ4) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ticketDepts = ticket.departments?.length ? ticket.departments : [ticket.department]
    const isLeadForTicket = leadDepts.some(d => ticketDepts.includes(d))

    const body = await req.json().catch(() => ({}))
    const now = new Date()
    const actorName = me.guild.displayName ?? me.username

    const updates: Partial<CommunityTicket> = { updatedAt: now }
    const newActivities: CommunityTicketActivity[] = []

    // Status change (J4 or dept lead for this ticket)
    if (body.status && (isJ4 || isLeadForTicket)) {
        newActivities.push({
            action: 'status_changed',
            actorId: me.id,
            actorName,
            timestamp: now,
            oldValue: ticket.status,
            newValue: body.status,
        })
        updates.status = body.status
    }

    // Department reassignment (J4 only)
    if (body.department && isJ4) {
        newActivities.push({
            action: 'reassigned',
            actorId: me.id,
            actorName,
            timestamp: now,
            oldValue: ticket.department,
            newValue: body.department,
        })
        updates.department = body.department
    }

    // Multi-dept update (J4 only)
    if (body.departments && Array.isArray(body.departments) && isJ4) {
        updates.departments = body.departments
        if (body.departments.length > 0 && !body.department) {
            updates.department = body.departments[0]
        }
    }

    // Tags update (J4 only)
    if (body.tags && Array.isArray(body.tags) && isJ4) {
        newActivities.push({
            action: 'tagged',
            actorId: me.id,
            actorName,
            timestamp: now,
            newValue: body.tags.join(', '),
        })
        updates.tags = body.tags
    }

    // Content edit (author or J4)
    const canEdit = ticket.authorId === me.id || isJ4
    if (!ticket.isDeleted && canEdit && (body.title || body.description)) {
        newActivities.push({
            action: 'edited',
            actorId: me.id,
            actorName,
            timestamp: now,
        })
        if (body.title) updates.title = body.title.trim()
        if (body.description) updates.description = body.description.trim()
    }

    // Restore (J4 only)
    if (body.restore && isJ4 && ticket.isDeleted) {
        newActivities.push({
            action: 'restored',
            actorId: me.id,
            actorName,
            timestamp: now,
        })
        updates.isDeleted = false
        delete updates.deletedAt
        delete updates.deletedById
        delete updates.deletedByName
    }

    // Ticket tags (multi-select sub-statuses) — J4 or dept lead
    if (body.ticketTags && Array.isArray(body.ticketTags) && (isJ4 || isLeadForTicket)) {
        updates.ticketTags = body.ticketTags as string[]
    }

    // Member visibility toggle (J4 or dept lead for this ticket)
    if (body.memberVisible !== undefined && (isJ4 || isLeadForTicket)) {
        updates.memberVisible = !!body.memberVisible
    }

    // Multi-status update (J4 or dept lead)
    if (body.statuses && Array.isArray(body.statuses) && (isJ4 || isLeadForTicket)) {
        updates.statuses = body.statuses as CommunityTicketStatus[]
        // Keep legacy status field in sync with first non-closed status, or closed if only closed
        const primary = (body.statuses as string[]).find(s => s !== 'closed') ?? body.statuses[0] ?? 'open'
        updates.status = primary as CommunityTicketStatus
        newActivities.push({
            action: 'status_changed',
            actorId: me.id,
            actorName,
            timestamp: now,
            oldValue: (ticket.statuses ?? [ticket.status]).join(', '),
            newValue: (body.statuses as string[]).join(', '),
        })
    }

    // Reopen (remove 'closed' from statuses) when not a full status update
    if (body.reopen && (isJ4 || isLeadForTicket) && !body.statuses) {
        const current = ticket.statuses ?? [ticket.status]
        const reopened = current.filter(s => s !== 'closed')
        updates.statuses = reopened.length > 0 ? reopened : ['open']
        updates.status = updates.statuses[0]
        newActivities.push({
            action: 'reopened',
            actorId: me.id,
            actorName,
            timestamp: now,
        })
    }

    if (Object.keys(updates).length <= 1 && newActivities.length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    await Db.communityTickets.updateOne(
        { _id: new ObjectId(id) },
        {
            $set: updates,
            ...(newActivities.length > 0 && { $push: { activityLog: { $each: newActivities } } }),
        }
    )

    // Fire log actions for significant changes
    const ticketDepts2 = ticketDepts
    if (updates.status) {
        await logAction({
            action: 'ticket.status_change',
            category: 'ticket',
            performedBy: me.id,
            performedByName: actorName,
            entityType: 'ticket',
            entityId: id,
            actionUrl: `/tickets/${id}`,
            target: `"${ticket.title}"`,
            before: ticket.status,
            after: updates.status,
            details: { departments: ticketDepts2 },
        }).catch(() => {})

        // Notify ticket author of status change (if not anonymous and not self-updating)
        if (!ticket.isAnonymous && ticket.authorId !== me.id) {
            const actionUrl = `/tickets/${id}`
            const notifTitle = `Ticket status updated: "${ticket.title}"`
            await createNotification({
                userId: ticket.authorId,
                type: 'ticket_status',
                title: notifTitle,
                body: `Your ticket status changed to ${updates.status}.`,
                actionUrl,
                relatedId: id,
            }).catch(() => {})
            await sendFeedbackStatusDM(ticket.authorId, ticket.title, updates.status, actionUrl).catch(() => {})
        }
    }
    if (updates.isDeleted === false) {
        await logAction({ action: 'ticket.restore', category: 'ticket', performedBy: me.id, performedByName: actorName, entityType: 'ticket', entityId: id, actionUrl: `/tickets/${id}`, target: `"${ticket.title}"`, details: { departments: ticketDepts2 } }).catch(() => {})
    }

    // Reopen notifications
    if (body.reopen) {
        const actionUrl = `/tickets/${id}`
        const notifTitle = `Ticket reopened: "${ticket.title}"`
        const notifBody = `${actorName} reopened a closed ticket.\nTicket: "${ticket.title}"\nLink: ${actionUrl}`

        // Notify ticket author (if not anonymous)
        if (!ticket.isAnonymous && ticket.authorId !== me.id) {
            await createNotification({ userId: ticket.authorId, type: 'ticket_reopened', title: notifTitle, body: notifBody, actionUrl, relatedId: id }).catch(() => {})
        }

        // Notify dept leads for all departments
        await Promise.all(ticketDepts2.map(dept =>
            notifyTicketDeptLeads(dept, { type: 'ticket_reopened', title: notifTitle, body: notifBody, actionUrl, ticketId: id })
                .catch(() => {})
        ))
    }
    if (updates.department && isJ4) {
        await logAction({ action: 'ticket.reassign', category: 'ticket', performedBy: me.id, performedByName: actorName, entityType: 'ticket', entityId: id, actionUrl: `/tickets/${id}`, target: `"${ticket.title}"`, before: ticket.department, after: updates.department }).catch(() => {})
    }

    const updated = await Db.communityTickets.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated)
}


export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)

    const ticket = await Db.communityTickets.findOne({ _id: new ObjectId(id) })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (ticket.authorId !== me.id && !isJ4) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date()
    const actorName = me.guild.displayName ?? me.username

    await Db.communityTickets.updateOne(
        { _id: new ObjectId(id) },
        {
            $set: {
                isDeleted: true,
                deletedAt: now,
                deletedById: me.id,
                deletedByName: actorName,
                updatedAt: now,
            },
            $push: {
                activityLog: {
                    action: 'deleted',
                    actorId: me.id,
                    actorName,
                    timestamp: now,
                } as CommunityTicketActivity,
            },
        }
    )

    await logAction({
        action: 'ticket.delete',
        category: 'ticket',
        performedBy: me.id,
        performedByName: actorName,
        entityType: 'ticket',
        entityId: id,
        target: `"${ticket.title}"`,
        details: { departments: ticket.departments ?? [ticket.department] },
    }).catch(() => {})

    return NextResponse.json({ success: true })
}
