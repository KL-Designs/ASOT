import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { RANK_GROUPS } from '@/lib/ranks'
import { applyOrbatMove } from '@/lib/orbat-move'

// PATCH /api/admin/tickets/[id] — approve or reject a ticket
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    let objectId: ObjectId
    try {
        objectId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
    }

    const ticket = await Db.tickets.findOne({ _id: objectId })
    if (!ticket) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Auth check is ticket-department-aware
    const canAction =
        (ticket.department === 'j3' && client.hasRoles(me, PERMISSIONS.tickets.actionJ3)) ||
        (ticket.department === 'j4' && client.hasRoles(me, PERMISSIONS.tickets.actionJ4)) ||
        (ticket.department === 'allstaff' && (
            me.id === ticket.requiredApproverUserId ||
            client.hasRoles(me, PERMISSIONS.tickets.actionMoveRequest)
        ))
    if (!canAction) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

    // Approve — fork on ticket type
    if (ticket.type === 'j3-qualification') {
        const member = await Db.users.findOne({ id: ticket.targetUserId })
        if (!member) {
            return NextResponse.json({ error: 'Target member not found' }, { status: 404 })
        }

        const existing = member.milpac?.qualifications ?? []
        let updatedQuals: { date: string; qualification: string; issuedById?: string; issuedByName?: string }[]

        if (ticket.action === 'add') {
            const alreadyHas = existing.some(q => q.qualification === ticket.qualification)
            if (alreadyHas) {
                updatedQuals = existing
            } else {
                updatedQuals = [...existing, {
                    date: now.toISOString().split('T')[0],
                    qualification: ticket.qualification!,
                    issuedById: ticket.issuedById,
                    issuedByName: ticket.issuedByName,
                }]
            }
        } else {
            updatedQuals = existing.filter(q => q.qualification !== ticket.qualification)
        }

        await Db.users.updateOne({ id: ticket.targetUserId }, {
            $set: { 'milpac.qualifications': updatedQuals },
        })
    } else if (ticket.type === 'j4-award') {
        const member = await Db.users.findOne({ id: ticket.targetUserId })
        if (!member) {
            return NextResponse.json({ error: 'Target member not found' }, { status: 404 })
        }

        const existing = member.milpac?.awards ?? []
        const alreadyHas = existing.some(a => a.name === ticket.awardName)

        if (!alreadyHas) {
            await Db.users.updateOne({ id: ticket.targetUserId }, {
                $push: {
                    'milpac.awards': {
                        date: now.toISOString().split('T')[0],
                        name: ticket.awardName!,
                        type: ticket.awardType!,
                        issuedById: ticket.issuedById,
                        issuedByName: ticket.issuedByName,
                    } as any,
                },
            })
        }
    } else if (ticket.type === 'j3-promotion') {
        const member = await Db.users.findOne({ id: ticket.targetUserId })
        if (!member) {
            return NextResponse.json({ error: 'Target member not found' }, { status: 404 })
        }

        const allRanks = RANK_GROUPS.flatMap(g => g.ranks)
        const rankEntry = allRanks.find(r => r.name === ticket.proposedRank)
        const abbr = rankEntry?.abbr ?? ticket.proposedRank!

        await Db.users.updateOne({ id: ticket.targetUserId }, {
            $set: { 'milpac.currentRank': abbr },
            $push: {
                'milpac.promotions': {
                    date: now.toISOString().split('T')[0],
                    rank: ticket.proposedRank!,
                    role: '',
                    issuedById: ticket.issuedById,
                    issuedByName: ticket.issuedByName,
                } as any,
            },
        })
    } else if (ticket.type === 'move-request') {
        // Re-validate positions haven't shifted since submission
        const fromPos = await Db.orbatPositions.findOne({ _id: new ObjectId(ticket.fromPositionId!) })
        if (!fromPos || fromPos.userId !== ticket.targetUserId) {
            return NextResponse.json({ error: 'Source position has changed since request was submitted.' }, { status: 409 })
        }

        const toPos = (!ticket.toIsReservist && ticket.toPositionId)
            ? await Db.orbatPositions.findOne({ _id: new ObjectId(ticket.toPositionId) })
            : null
        if (!ticket.toIsReservist && (!toPos || toPos.userId !== null)) {
            return NextResponse.json({ error: 'Destination position is no longer vacant.' }, { status: 409 })
        }

        await applyOrbatMove({
            fromPos,
            toPos,
            toIsReservist: ticket.toIsReservist ?? false,
            targetUserId: ticket.targetUserId,
        })
    }

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
