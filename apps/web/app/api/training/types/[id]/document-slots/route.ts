import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { logAction } from '@/lib/logAction'
import { actorName } from '@/lib/operations/aar-context'
import { addSlot, sanitiseSlots, slotsFor } from '@/lib/training/document-slots'
import { assessmentStanding } from '@/lib/training/orders-assessment-db'

export const dynamic = 'force-dynamic'

/**
 * Row 372: a course's document slots. POST {name} adds one ("+ Add
 * Document"); PUT {slots} renames or reorders. J3 leads (and J4) only.
 */
async function gate(params: Promise<{ id: string }>) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!(await assessmentStanding(me)).isLead) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    const { id } = await params
    if (!ObjectId.isValid(id)) return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }
    const type = await Db.trainingTypes.findOne({ _id: new ObjectId(id) })
    if (!type) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
    return { me, type }
}

async function save(me: User, type: TrainingType & { _id: ObjectId }, slots: NonNullable<TrainingType['documentSlots']>, action: string) {
    await Db.trainingTypes.updateOne({ _id: type._id }, { $set: { documentSlots: slots, updatedAt: new Date() } })
    await logAction({
        action: `training.type.documents.${action}`, category: 'training',
        performedBy: me.id, performedByName: actorName(me),
        entityType: 'trainingType', entityId: String(type._id), actionUrl: '/dashboard/unit/training-hub',
        details: { name: type.name, slots: slots.map(s => s.name) },
    })
    return NextResponse.json({ slots })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const g = await gate(params)
    if ('error' in g) return g.error
    const body = await req.json().catch(() => ({})) as { name?: string }
    const next = addSlot(slotsFor(g.type), String(body.name ?? ''))
    if (!next) return NextResponse.json({ error: 'Give the document a name that is not already used.' }, { status: 400 })
    return save(g.me, g.type, next, 'add')
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const g = await gate(params)
    if ('error' in g) return g.error
    const body = await req.json().catch(() => ({})) as { slots?: unknown }
    const slots = sanitiseSlots(body.slots, g.type)
    if (!slots) return NextResponse.json({ error: 'slots must be a list' }, { status: 400 })
    return save(g.me, g.type, slots, 'edit')
}
