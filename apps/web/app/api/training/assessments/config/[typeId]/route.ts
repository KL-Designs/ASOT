import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { actorName } from '@/lib/operations/aar-context'
import { sanitiseOrders, sanitiseTemplate } from '@/lib/training/orders-assessment'
import { assessmentStanding, loadConfig, logAssessment } from '@/lib/training/orders-assessment-db'

export const dynamic = 'force-dynamic'

/** Row 372 (Part B): a Leadership course's source orders and template. Training staff read; guide writers and leads edit. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ typeId: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const standing = await assessmentStanding(me)
    if (!standing.isTrainingStaff && !standing.canEditConfig) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { typeId } = await params
    const { type, config } = await loadConfig(typeId)
    if (!type) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ type: { _id: String(type._id), name: type.name, category: type.category }, config, standing })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ typeId: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await assessmentStanding(me)).canEditConfig) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { typeId } = await params
    const { type } = await loadConfig(typeId)
    if (!type) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => ({})) as { orders?: unknown; template?: unknown }
    const now = new Date()
    const name = actorName(me)
    const set: Partial<OrdersAssessmentConfig> = { trainingTypeName: type.name, updatedAt: now, updatedById: me.id, updatedByName: name }
    if (body.orders !== undefined) set.orders = sanitiseOrders(body.orders)
    if (body.template !== undefined) set.template = sanitiseTemplate(body.template)
    await Db.ordersAssessmentConfigs.updateOne({ _id: typeId }, { $set: set }, { upsert: true })
    await logAssessment('config', me, name, typeId, { course: type.name, orders: body.orders !== undefined, template: body.template !== undefined })
    return NextResponse.json((await loadConfig(typeId)).config)
}
