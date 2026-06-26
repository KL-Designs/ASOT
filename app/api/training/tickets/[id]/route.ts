import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.trainer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const ticket = await Db.trainingTickets.findOne({ _id: new ObjectId(id) })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    if (!isJ3Lead && ticket.trainerId !== me.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    return NextResponse.json(ticket)
}

// Trainer updates notes / per-attendee pass status while ticket is pending or amendments_requested
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.trainer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const ticket = await Db.trainingTickets.findOne({ _id: new ObjectId(id) })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    if (!isJ3Lead && ticket.trainerId !== me.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (ticket.status !== 'pending' && ticket.status !== 'amendments_requested') {
        return NextResponse.json({ error: 'Only pending or amendments_requested tickets can be edited' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const updates: Partial<TrainingTicket> = { updatedAt: new Date() }

    if (body.trainerNotes !== undefined) updates.trainerNotes = body.trainerNotes?.trim() || undefined

    // Per-attendee updates: array of { memberId, passed, notes }
    if (Array.isArray(body.attendees)) {
        const patchMap = new Map<string, { passed?: boolean; notes?: string }>(
            body.attendees.map((a: { memberId: string; passed?: boolean; notes?: string }) => [a.memberId, a])
        )
        updates.attendees = ticket.attendees.map(a => {
            const patch = patchMap.get(a.memberId)
            if (!patch) return a
            return {
                ...a,
                ...(patch.passed !== undefined && { passed: patch.passed }),
                ...(patch.notes !== undefined && { notes: patch.notes }),
            }
        })
    }

    await Db.trainingTickets.updateOne({ _id: new ObjectId(id) }, { $set: updates })
    const updated = await Db.trainingTickets.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated)
}
