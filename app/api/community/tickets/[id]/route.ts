import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'


export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)

    const ticket = await Db.communityTickets.findOne({ _id: new ObjectId(id) })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (ticket.isDeleted && !isJ4) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.visibility === 'private' && !isJ4) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // J4 receives ALL comments (including soft-deleted) so the activity log can reconstruct them
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

    const ticket = await Db.communityTickets.findOne({ _id: new ObjectId(id) })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.isDeleted && !isJ4) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const now = new Date()
    const actorName = me.guild.displayName ?? me.username

    const updates: Partial<CommunityTicket> = { updatedAt: now }
    const newActivities: CommunityTicketActivity[] = []

    // Status change (J4 only)
    if (body.status && isJ4) {
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
        // Keep primary dept in sync
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

    return NextResponse.json({ success: true })
}
