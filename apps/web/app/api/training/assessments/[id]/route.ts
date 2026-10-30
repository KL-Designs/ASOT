import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { actorName } from '@/lib/operations/aar-context'
import { canRead, canReview, isOpenForTrainee, sanitiseAnswers, shapeFor } from '@/lib/training/orders-assessment'
import { assessmentStanding, logAssessment, notify, runSimilarity, writtenInCopy } from '@/lib/training/orders-assessment-db'
import { ORDERS_DOCUMENT_FIELD } from '@/lib/training/assessment-operation'

export const dynamic = 'force-dynamic'

type Doc = OrdersAssessment & { _id: ObjectId }

async function load(params: Promise<{ id: string }>) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    const { id } = await params
    if (!ObjectId.isValid(id)) return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }
    const doc = await Db.ordersAssessments.findOne({ _id: new ObjectId(id) }) as Doc | null
    if (!doc) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
    const standing = await assessmentStanding(me)
    if (!canRead(doc, me.id, standing)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    return { me, doc, standing }
}

/** Row 373: one assessment, shaped for the viewer. A trainee never receives similarity. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const l = await load(params)
    if ('error' in l) return l.error
    const { me, doc, standing } = l
    return NextResponse.json({
        assessment: shapeFor(doc, me.id, standing),
        canReview: canReview(doc, me.id, standing),
        isTrainee: doc.traineeId === me.id,
    })
}

/** The trainee saves a draft of their answers. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const l = await load(params)
    if ('error' in l) return l.error
    const { me, doc } = l
    if (doc.traineeId !== me.id) return NextResponse.json({ error: 'Only the trainee can write this assessment.' }, { status: 403 })
    if (!isOpenForTrainee(doc.status)) return NextResponse.json({ error: 'This assessment has been submitted.' }, { status: 409 })
    const body = await req.json().catch(() => ({})) as { answers?: unknown }
    const answers = sanitiseAnswers(body.answers, doc.template)
    const status = doc.status === 'assigned' ? 'in_progress' : doc.status
    await Db.ordersAssessments.updateOne({ _id: doc._id }, { $set: { answers, status, updatedAt: new Date() } })
    return NextResponse.json({ ok: true, status })
}

/** The trainee submits. The similarity check runs here and the trainer is told. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const l = await load(params)
    if ('error' in l) return l.error
    const { me, doc } = l
    if (doc.traineeId !== me.id) return NextResponse.json({ error: 'Only the trainee can submit this assessment.' }, { status: 403 })
    if (!isOpenForTrainee(doc.status)) return NextResponse.json({ error: 'This assessment has already been submitted.' }, { status: 409 })
    const body = await req.json().catch(() => ({})) as { answers?: unknown }
    // Written in their copy of the orders: what they wrote is taken from it now.
    const written = doc.operationId ? (await writtenInCopy(doc)).slice(0, 200_000) : ''
    const answers = doc.operationId
        ? (written.trim() ? { [ORDERS_DOCUMENT_FIELD]: written } : {})
        : body.answers !== undefined ? sanitiseAnswers(body.answers, doc.template) : doc.answers
    if (doc.operationId && !written.trim()) return NextResponse.json({ error: 'Your orders document has nothing in it beyond the orders you were given. Write your orders there first.' }, { status: 400 })
    if (!Object.keys(answers).length) return NextResponse.json({ error: 'Write your orders before submitting.' }, { status: 400 })

    const now = new Date()
    const name = actorName(me)
    const status = doc.attempts.length ? 'resubmitted' : 'submitted'
    await Db.ordersAssessments.updateOne({ _id: doc._id }, {
        $set: { answers, status, submittedAt: now, updatedAt: now },
        $push: { history: { at: now, status, byId: me.id, byName: name } },
    })
    // The check never blocks the submission.
    await runSimilarity({ ...doc, answers, status, submittedAt: now }).catch(() => null)

    const id = String(doc._id)
    await notify(doc.trainerId, `Orders submitted: ${doc.trainingTypeName}`, `${doc.traineeName} has ${status === 'resubmitted' ? 'resubmitted' : 'submitted'} their orders for ${doc.trainingTypeName}.`, `/dashboard/unit/training-hub/assessment/${doc.trainingTypeId}?review=${id}`, id)
    await logAssessment(status === 'resubmitted' ? 'resubmit' : 'submit', me, name, id, { course: doc.trainingTypeName })
    return NextResponse.json({ ok: true, status })
}
