import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logAction'
import { notifyTicketDeptLeads } from '@/lib/ticketNotifications'

type User = Awaited<ReturnType<typeof client.fetchMe>>

function getLeadDepts(me: User): string[] {
    return Object.entries(PERMISSIONS.departmentLeads)
        .filter(([, roles]) => client.hasRoles(me, roles))
        .map(([dept]) => dept)
}

const VALID_DEPTS = new Set(Object.keys(PERMISSIONS.departments))


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    if (!isJ4 && !isLeadForTicket) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const { toDepartment, note } = body

    if (!toDepartment || typeof toDepartment !== 'string') {
        return NextResponse.json({ error: 'toDepartment is required' }, { status: 400 })
    }

    if (!VALID_DEPTS.has(toDepartment)) {
        return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
    }

    const now = new Date()
    const actorName = me.guild.displayName ?? me.username
    const fromDepts = ticketDepts

    const updatedDepts = Array.from(new Set([...ticketDepts, toDepartment]))

    const setFields: Record<string, unknown> = {
        departments: updatedDepts,
        updatedAt: now,
    }

    if (isJ4) {
        setFields.department = toDepartment
    }

    const activity: CommunityTicketActivity = {
        action: 'transferred',
        actorId: me.id,
        actorName,
        timestamp: now,
        oldValue: fromDepts.join(', '),
        newValue: toDepartment,
        ...(note && { prevContent: note }),
    }

    await Db.communityTickets.updateOne(
        { _id: new ObjectId(id) },
        {
            $set: setFields,
            $push: { activityLog: activity },
        }
    )

    await logAction({
        action: 'ticket.transfer',
        category: 'ticket',
        performedBy: me.id,
        performedByName: actorName,
        entityType: 'ticket',
        entityId: id,
        actionUrl: `/tickets/${id}`,
        target: `"${ticket.title}"`,
        before: fromDepts.join(', '),
        after: toDepartment,
    }).catch(() => {})

    await notifyTicketDeptLeads(toDepartment, {
        type: 'ticket_transferred',
        title: `Ticket transferred to your department`,
        body: `"${ticket.title}" has been transferred to your department by ${actorName}.`,
        actionUrl: `/tickets/${id}`,
        ticketId: id,
    }).catch(() => {})

    const updated = await Db.communityTickets.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated)
}
