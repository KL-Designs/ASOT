import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// PATCH /api/admin/tickets/[id] — approve or reject a ticket
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.tickets.actionJ3)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let objectId: ObjectId
    try {
        objectId = new ObjectId(params.id)
    } catch {
        return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
    }

    const ticket = await Db.tickets.findOne({ _id: objectId })
    if (!ticket) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (ticket.status !== 'open') {
        return NextResponse.json({ error: 'Ticket already resolved' }, { status: 409 })
    }

    const body = await req.json()
    const { decision, actionNotes } = body

    if (decision !== 'approve' && decision !== 'reject') {
        return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const now = new Date()

    if (decision === 'reject') {
        await Db.tickets.updateOne({ _id: objectId }, {
            $set: {
                status: 'rejected',
                actionedById: me.id,
                actionedByName: displayName,
                actionedAt: now,
                actionNotes: actionNotes?.trim() || '',
            },
        })
        return NextResponse.json({ ok: true })
    }

    // Approve — apply the qualification change to the member
    const member = await Db.users.findOne({ id: ticket.targetUserId })
    if (!member) {
        return NextResponse.json({ error: 'Target member not found' }, { status: 404 })
    }

    const existing = member.milpac?.qualifications ?? []
    let updatedQuals: { date: string; qualification: string }[]

    if (ticket.action === 'add') {
        const alreadyHas = existing.some(q => q.qualification === ticket.qualification)
        if (alreadyHas) {
            updatedQuals = existing
        } else {
            updatedQuals = [...existing, {
                date: now.toISOString().split('T')[0],
                qualification: ticket.qualification,
            }]
        }
    } else {
        updatedQuals = existing.filter(q => q.qualification !== ticket.qualification)
    }

    await Db.users.updateOne({ id: ticket.targetUserId }, {
        $set: { 'milpac.qualifications': updatedQuals },
    })

    await Db.tickets.updateOne({ _id: objectId }, {
        $set: {
            status: 'actioned',
            actionedById: me.id,
            actionedByName: displayName,
            actionedAt: now,
            actionNotes: actionNotes?.trim() || '',
        },
    })

    return NextResponse.json({ ok: true })
}
