import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const event = await Db.trainingEvents.findOne({ _id: new ObjectId(id), deletedAt: { $exists: false } })
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    const isOwnPending = event.trainerId === me.id && event.approvalStatus === 'pending'

    if (!isJ3Lead && !isOwnPending) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (event.status === 'Completed') return NextResponse.json({ error: 'Cannot edit a completed event' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const updates: Partial<TrainingEvent> = { updatedAt: new Date() }

    if (body.title?.trim()) updates.title = body.title.trim()
    if (body.description !== undefined) updates.description = body.description?.trim() || undefined
    if (body.location !== undefined) updates.location = body.location?.trim() || undefined
    if (body.durationMinutes !== undefined) updates.durationMinutes = Math.max(15, Math.floor(Number(body.durationMinutes)) || 60)
    if (body.server !== undefined) updates.server = body.server?.trim() || undefined
    if (body.requiredMods !== undefined) updates.requiredMods = Array.isArray(body.requiredMods) ? body.requiredMods.filter(Boolean) : undefined
    if (body.trainerSlots !== undefined) updates.trainerSlots = Math.max(1, Math.floor(Number(body.trainerSlots)) || 1)
    if (body.maxTraineeSlots !== undefined) updates.maxTraineeSlots = body.maxTraineeSlots ? Math.max(1, Math.floor(Number(body.maxTraineeSlots)) || 1) : undefined
    if (body.maxSitInSlots !== undefined) updates.maxSitInSlots = body.maxSitInSlots ? Math.max(1, Math.floor(Number(body.maxSitInSlots)) || 1) : undefined
    if (body.isJ3Training !== undefined) updates.isJ3Training = Boolean(body.isJ3Training)
    if (body.scheduledAt) {
        const d = new Date(body.scheduledAt)
        if (!isNaN(d.getTime())) updates.scheduledAt = d
    }
    if (body.trainingTypeId && ObjectId.isValid(body.trainingTypeId) && isOwnPending) {
        const t = await Db.trainingTypes.findOne({ _id: new ObjectId(body.trainingTypeId) })
        if (t) {
            updates.trainingTypeId = body.trainingTypeId.toString()
            updates.trainingTypeName = t.name
            updates.billetPointsAwarded = t.billetPoints
        }
    }

    await Db.trainingEvents.updateOne({ _id: new ObjectId(id) }, { $set: updates })
    const updated = await Db.trainingEvents.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const event = await Db.trainingEvents.findOne({ _id: new ObjectId(id), deletedAt: { $exists: false } })
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    const isOwner = event.trainerId === me.id

    if (!isJ3Lead && !isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (event.status === 'Completed') return NextResponse.json({ error: 'Cannot delete a completed event' }, { status: 400 })

    await Db.trainingEvents.updateOne({ _id: new ObjectId(id) }, { $set: { deletedAt: new Date() } })

    if (event.calendarEventId && ObjectId.isValid(event.calendarEventId)) {
        await Db.calendarEvents.deleteOne({ _id: new ObjectId(event.calendarEventId) })
    }

    return NextResponse.json({ success: true })
}
