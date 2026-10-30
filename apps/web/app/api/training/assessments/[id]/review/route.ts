import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { actorName } from '@/lib/operations/aar-context'
import { canReview, isAwaitingReview, nextVariant, STATUS_LABEL, usableVariants } from '@/lib/training/orders-assessment'
import { assessmentStanding, assessmentUrl, createOrdersCopy, loadConfig, logAssessment, notify } from '@/lib/training/orders-assessment-db'
import { ORDERS_DOCUMENT_TEMPLATE } from '@/lib/training/assessment-operation'

export const dynamic = 'force-dynamic'

type Outcome = 'passed' | 'failed' | 'reassessment_required'

/**
 * Row 373 (Part F): the trainer's decision. Pass and fail close it.
 * Reassessment keeps the attempt in `attempts`, issues a fresh copy of a
 * different variant from the current master, and reopens it for the
 * trainee.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    const doc = await Db.ordersAssessments.findOne({ _id: new ObjectId(id) })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const standing = await assessmentStanding(me)
    if (!canReview(doc, me.id, standing)) return NextResponse.json({ error: 'Only the assigned trainer or a J3 lead can review this.' }, { status: 403 })
    if (!isAwaitingReview(doc.status)) return NextResponse.json({ error: 'This assessment is not waiting for review.' }, { status: 409 })

    const body = await req.json().catch(() => ({})) as { outcome?: string; comment?: string }
    const outcome = (['passed', 'failed', 'reassessment_required'] as const).find(o => o === body.outcome) as Outcome | undefined
    if (!outcome) return NextResponse.json({ error: 'outcome must be passed, failed or reassessment_required' }, { status: 400 })
    const comment = String(body.comment ?? '').trim().slice(0, 4000)
    if (outcome !== 'passed' && !comment) return NextResponse.json({ error: 'Say what the trainee needs to fix.' }, { status: 400 })

    const now = new Date()
    const name = actorName(me)
    const review = { outcome, comment, byId: me.id, byName: name, at: now }
    const history = { at: now, status: outcome, byId: me.id, byName: name }

    if (outcome === 'reassessment_required') {
        const { config } = await loadConfig(doc.trainingTypeId)
        const used = [doc.variant, ...doc.attempts.map(a => a.variant)]
        const variant = nextVariant(usableVariants(config.orders), used) ?? doc.variant
        const orders = config.orders.find(o => o.variant === variant) ?? doc.orders
        // A fresh private copy for the rewrite; the old one stays, read-only, with the attempt.
        const operationId = orders.operationId ? await createOrdersCopy(orders, id, { id: doc.traineeId, name: doc.traineeName }, doc.trainingTypeId) : null
        await Db.ordersAssessments.updateOne({ _id: doc._id }, {
            $set: { variant, orders, operationId, template: orders.operationId ? ORDERS_DOCUMENT_TEMPLATE : config.template, answers: {}, status: 'reassessment_required', submittedAt: null, similarity: null, review: null, updatedAt: now },
            $push: {
                attempts: { variant: doc.variant, operationId: doc.operationId ?? null, template: doc.template, answers: doc.answers, submittedAt: doc.submittedAt ?? null, similarity: doc.similarity ?? null, review },
                history,
            },
        })
    } else {
        await Db.ordersAssessments.updateOne({ _id: doc._id }, { $set: { status: outcome, review, updatedAt: now }, $push: { history } })
    }

    await notify(doc.traineeId, `Orders assessment: ${STATUS_LABEL[outcome]}`,
        outcome === 'reassessment_required'
            ? `${name} has asked you to rewrite your orders for ${doc.trainingTypeName}. You have been given a new set of source orders.\n\n${comment}`
            : `${name} has marked your orders for ${doc.trainingTypeName} as ${STATUS_LABEL[outcome].toLowerCase()}.${comment ? `\n\n${comment}` : ''}`,
        assessmentUrl(id), id)
    await logAssessment('review', me, name, id, { course: doc.trainingTypeName, trainee: doc.traineeName, outcome })
    return NextResponse.json({ ok: true, status: outcome })
}
