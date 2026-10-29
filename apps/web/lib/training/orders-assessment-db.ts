import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { createNotification } from '@/lib/notifications'
import { sendDM } from '@/lib/discord/bot'
import { logAction } from '@/lib/logAction'
import { DEFAULT_ORDERS, DEFAULT_TEMPLATE, answersText, templateStrip, type ReviewerStanding } from './orders-assessment'
import { compareSubmission, type SimilaritySource } from './similarity'

/**
 * Row 373: the Mongo half of orders assessments. Standing, the config with
 * its defaults, notifications, and the similarity check on submit.
 */

export async function assessmentStanding(me: User): Promise<ReviewerStanding & { canEditConfig: boolean }> {
    const isLead = client.hasRoles(me, PERMISSIONS.trainingGuides.delete)
        || client.hasRoles(me, PERMISSIONS.departments.j4)
        || await hasPermission(me, 'departmentLeads.j3')
    const isTrainingStaff = isLead || client.hasRoles(me, PERMISSIONS.training.manage)
    return { isLead, isTrainingStaff, canEditConfig: isLead || client.hasRoles(me, PERMISSIONS.trainingGuides.write) }
}

export async function loadConfig(typeId: string) {
    const [config, type] = await Promise.all([
        Db.ordersAssessmentConfigs.findOne({ _id: typeId }),
        ObjectId.isValid(typeId) ? Db.trainingTypes.findOne({ _id: new ObjectId(typeId) }, { projection: { name: 1, category: 1 } }) : null,
    ])
    return {
        type,
        config: config ?? { _id: typeId, trainingTypeName: type?.name ?? '', orders: DEFAULT_ORDERS, template: DEFAULT_TEMPLATE, updatedAt: null, updatedByName: null },
    }
}

/** Recent sessions of this course to file an assessment under: events and course instances. */
export async function sessionsFor(typeId: string) {
    const [events, instances] = await Promise.all([
        Db.trainingEvents.find({ trainingTypeId: typeId, deletedAt: { $exists: false } }, { projection: { title: 1, scheduledAt: 1 } }).sort({ scheduledAt: -1 }).limit(30).toArray(),
        Db.courseInstances.find({ trainingTypeId: typeId, deletedAt: { $exists: false } }, { projection: { instanceRef: 1, startDate: 1 } }).sort({ createdAt: -1 }).limit(20).toArray(),
    ])
    return [
        ...instances.map(i => ({ kind: 'instance' as const, id: String(i._id), label: i.instanceRef })),
        ...events.map(e => ({ kind: 'event' as const, id: String(e._id), label: `${e.title} · ${new Date(e.scheduledAt).toLocaleDateString('en-AU')}` })),
    ]
}

/** The trainees on a session: an event's attending trainees, or an instance's candidates. */
export async function sessionTrainees(kind: 'instance' | 'event', id: string): Promise<{ id: string; name: string }[]> {
    if (kind === 'event') {
        const rows = await Db.trainingAttendance.find({ eventId: id, slotType: 'trainee', rsvpStatus: 'attending' }).toArray()
        return rows.map(r => ({ id: r.memberId, name: r.memberName }))
    }
    const rows = await Db.courseCandidates.find({ courseInstanceId: id, userId: { $exists: true } }).toArray()
    return rows.filter(r => r.userId).map(r => ({ id: r.userId!, name: r.displayName }))
}

export function assessmentUrl(id: string) {
    return `/me/assessments/${id}`
}

/** Website notification plus a DM; a DM that cannot be delivered never stops the work. */
export async function notify(userId: string, title: string, body: string, actionUrl: string, relatedId: string) {
    await createNotification({ userId, type: 'orders_assessment', title, body, actionUrl, relatedId }).catch(() => null)
    const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
    await sendDM(userId, { embeds: [{ title, description: `${body}\n\n${base}${actionUrl}`, color: 0xdb001d }] }, 'orders_assessment').catch(() => null)
}

/**
 * Run the similarity check for a submission against every other submission
 * of the same course (this cohort and every earlier one) and the course's
 * source orders. Writes the result on this submission and the reverse match
 * on any submission it matched, so it does not matter who submitted first.
 */
export async function runSimilarity(doc: OrdersAssessment & { _id: ObjectId }) {
    const text = answersText(doc.template, doc.answers)
    const others = await Db.ordersAssessments.find({
        trainingTypeId: doc.trainingTypeId, _id: { $ne: doc._id }, submittedAt: { $ne: null },
    }).toArray()
    const config = await Db.ordersAssessmentConfigs.findOne({ _id: doc.trainingTypeId })
    const label = (o: OrdersAssessment) => `${o.traineeName} · ${o.session?.label ?? 'no session'} · ${o.submittedAt ? new Date(o.submittedAt).toLocaleDateString('en-AU') : ''}`
    const sources: SimilaritySource[] = [
        ...others.flatMap(o => {
            const list: SimilaritySource[] = [{ id: String(o._id), label: label(o), kind: 'submission', traineeName: o.traineeName, text: answersText(o.template, o.answers) }]
            // Earlier attempts count too: a reassessment must not copy the first try of someone else.
            for (const [i, a] of (o.attempts ?? []).entries()) {
                if (a.submittedAt) list.push({ id: `${o._id}#${i}`, label: `${label(o)} (attempt ${i + 1})`, kind: 'submission', traineeName: o.traineeName, text: answersText(a.template ?? o.template, a.answers) })
            }
            return list
        }),
        ...(config?.orders ?? []).filter(x => x.body.trim()).map(x => ({ id: `orders-${x.variant}`, label: `Source: ${x.title}`, kind: 'source' as const, text: x.body })),
    ]
    const result = compareSubmission(text, sources, templateStrip(doc.template))
    await Db.ordersAssessments.updateOne({ _id: doc._id }, { $set: { similarity: result } })

    // The reverse match on each submission this one matched.
    for (const m of result.matches.filter(x => x.kind === 'submission' && !x.sourceId.includes('#'))) {
        const other = others.find(o => String(o._id) === m.sourceId)
        if (!other?.similarity) continue
        const back = { sourceId: String(doc._id), label: label({ ...doc, submittedAt: new Date() }), kind: 'submission' as const, traineeName: doc.traineeName, score: m.score, passages: m.passages.map(p => ({ mine: p.theirs, theirs: p.mine })) }
        const matches = [...other.similarity.matches.filter(x => x.sourceId !== back.sourceId), back].sort((a, b) => b.score - a.score).slice(0, 8)
        const score = matches[0]?.score ?? 0
        await Db.ordersAssessments.updateOne({ _id: other._id }, { $set: { similarity: { ...other.similarity, matches, score: Math.max(other.similarity.score, score), level: other.similarity.score >= score ? other.similarity.level : result.level } } })
    }
    return result
}

export async function logAssessment(action: string, me: User, name: string, id: string, details: Record<string, unknown>) {
    await logAction({
        action: `training.assessment.${action}`,
        category: 'training',
        performedBy: me.id,
        performedByName: name,
        entityType: 'ordersAssessment',
        entityId: id,
        actionUrl: assessmentUrl(id),
        details,
    })
}
