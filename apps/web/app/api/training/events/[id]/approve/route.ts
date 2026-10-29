import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { approveTrainingEvent } from '@/lib/training/approve'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const event = await Db.trainingEvents.findOne({ _id: new ObjectId(id), deletedAt: { $exists: false } })
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (event.approvalStatus !== 'pending') return NextResponse.json({ error: 'Event is not pending' }, { status: 400 })

    const approverName = me.guild?.displayName ?? me.username
    await approveTrainingEvent(event as TrainingEvent & { _id: ObjectId }, { id: me.id, name: approverName })

    const updated = await Db.trainingEvents.findOne({ _id: new ObjectId(id) })
    return NextResponse.json(updated)
}
