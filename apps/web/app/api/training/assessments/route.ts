import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { actorName } from '@/lib/operations/aar-context'
import { memberName } from '@/lib/military/award-postage-db'
import { assignVariants, canSeeSimilarity, usableVariants } from '@/lib/training/orders-assessment'
import { assessmentStanding, assessmentUrl, createOrdersCopy, loadConfig, logAssessment, notify } from '@/lib/training/orders-assessment-db'
import { ORDERS_DOCUMENT_TEMPLATE } from '@/lib/training/assessment-operation'

export const dynamic = 'force-dynamic'

/**
 * Row 373: the assessment list and assignment.
 *
 * GET ?mine=1 is a trainee's own list. Otherwise training staff see a
 * course's assessments (?typeId, optionally ?session=kind:id), and a
 * trainer sees the ones assigned to them. Similarity is a score only here,
 * and only for those entitled to it.
 */
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const standing = await assessmentStanding(me)
    const sp = req.nextUrl.searchParams

    const filter: Record<string, unknown> = {}
    if (sp.get('mine') === '1') filter.traineeId = me.id
    else {
        if (sp.get('typeId')) filter.trainingTypeId = sp.get('typeId')
        const session = sp.get('session')
        if (session) {
            const [kind, id] = session.split(':')
            filter['session.kind'] = kind
            filter['session.id'] = id
        }
        if (!standing.isTrainingStaff) filter.trainerId = me.id
    }

    const rows = await Db.ordersAssessments.find(filter, { projection: { answers: 0, 'orders.body': 0, template: 0, attempts: 0 } }).sort({ createdAt: -1 }).limit(300).toArray()
    return NextResponse.json({
        standing,
        assessments: rows.map(r => {
            const sim = canSeeSimilarity(r, me.id, standing) && r.similarity ? { score: r.similarity.score, level: r.similarity.level } : null
            return { ...r, similarity: sim, history: undefined }
        }),
    })
}

interface AssignBody {
    typeId?: string
    trainees?: { id?: string; name?: string }[]
    session?: { kind?: string; id?: string; label?: string } | null
    trainerId?: string
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const standing = await assessmentStanding(me)
    if (!standing.isTrainingStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({})) as AssignBody
    const typeId = String(body.typeId ?? '')
    const { type, config } = await loadConfig(typeId)
    if (!type) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const variants = usableVariants(config.orders)
    if (!variants.length) return NextResponse.json({ error: 'Write at least one set of source orders before assigning.' }, { status: 400 })

    const trainees = (body.trainees ?? []).filter(t => t.id && typeof t.id === 'string').slice(0, 60).map(t => ({ id: t.id!, name: String(t.name ?? '').slice(0, 80) }))
    if (!trainees.length) return NextResponse.json({ error: 'Choose at least one trainee.' }, { status: 400 })

    const session: OrdersAssessment['session'] = body.session && (body.session.kind === 'instance' || body.session.kind === 'event') && body.session.id
        ? { kind: body.session.kind as 'instance' | 'event', id: String(body.session.id), label: String(body.session.label ?? '').slice(0, 120) }
        : null

    // The trainer defaults to whoever assigns. A lead may name someone else.
    let trainer = { id: me.id, name: actorName(me) }
    if (body.trainerId && body.trainerId !== me.id) {
        if (!standing.isLead) return NextResponse.json({ error: 'Only a J3 lead can assign another trainer.' }, { status: 403 })
        const u = await Db.users.findOne({ id: body.trainerId })
        if (!u) return NextResponse.json({ error: 'Trainer not found' }, { status: 404 })
        trainer = { id: u.id, name: memberName(u) }
    }

    // Who already has one for this session (skipped) and which variants each has sat (spread away from).
    const existing = await Db.ordersAssessments.find({ trainingTypeId: typeId, traineeId: { $in: trainees.map(t => t.id) } }, { projection: { traineeId: 1, variant: 1, attempts: 1, session: 1 } }).toArray()
    const previous: Record<string, number[]> = {}
    const already = new Set<string>()
    for (const e of existing) {
        (previous[e.traineeId] ??= []).push(e.variant, ...(e.attempts ?? []).map(a => a.variant))
        if (session ? e.session?.kind === session.kind && e.session.id === session.id : !e.session) already.add(e.traineeId)
    }
    const fresh = trainees.filter(t => !already.has(t.id))
    if (!fresh.length) return NextResponse.json({ error: 'Every trainee chosen already has an assessment for this session.' }, { status: 400 })

    const names = new Map((await Db.users.find({ id: { $in: fresh.map(t => t.id) } }).toArray()).map(u => [u.id, memberName(u)]))
    const picks = assignVariants(variants, fresh.map(t => t.id), previous)
    const now = new Date()
    const docs: OrdersAssessment[] = fresh.map(t => ({
        trainingTypeId: typeId, trainingTypeName: type.name, session,
        traineeId: t.id, traineeName: names.get(t.id) || t.name || t.id,
        trainerId: trainer.id, trainerName: trainer.name,
        variant: picks[t.id],
        orders: config.orders.find(o => o.variant === picks[t.id])!,
        // Orders written in a copy of an operation are snapshotted into one field on submit.
        template: config.orders.find(o => o.variant === picks[t.id])!.operationId ? ORDERS_DOCUMENT_TEMPLATE : config.template,
        answers: {}, status: 'assigned', submittedAt: null, similarity: null, review: null,
        attempts: [], history: [{ at: now, status: 'assigned', byId: me.id, byName: actorName(me) }],
        createdAt: now, updatedAt: now,
    }))
    const res = await Db.ordersAssessments.insertMany(docs)

    await Promise.all(Object.values(res.insertedIds).map(async (oid, i) => {
        const id = String(oid as ObjectId)
        const d = docs[i]
        if (d.orders.operationId) {
            const operationId = await createOrdersCopy(d.orders, id, { id: d.traineeId, name: d.traineeName }, typeId)
            if (operationId) await Db.ordersAssessments.updateOne({ _id: oid as ObjectId }, { $set: { operationId } })
        }
        await notify(d.traineeId, `Orders assessment: ${type.name}`, `${trainer.name} has assigned you an orders-writing assessment for ${type.name}. Write your orders from the orders you have been given and submit them for review.`, assessmentUrl(id), id)
        await logAssessment('assign', me, actorName(me), id, { course: type.name, trainee: d.traineeName, variant: d.variant, session: session?.label ?? null })
    }))

    return NextResponse.json({ created: docs.length, skipped: trainees.length - fresh.length })
}
