import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { createNotificationForRole } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'
import { EMPTY_VALUES, type DoctrineValues } from './schema'
import {
    applyOverrides, changesBetween, diffOverrides, needsApproval, resolveChain, sourcesOf, versionAt,
    type DoctrineLevel, type DoctrineOverrides,
} from './values'

/**
 * Rows 334 and 335: the Mongo half of Enemy Doctrine — resolving a level
 * through its parents, publishing, and the J2 Lead approval round trip.
 */

/** The J2 Lead role tasks go to. */
export const J2_LEAD_ROLE = 'J2 - Department Leader'

type DoctrineDoc = Doctrine & { _id: ObjectId }

/** This doctrine and its parents, faction first. */
export async function loadChain(doctrine: DoctrineDoc): Promise<DoctrineDoc[]> {
    const chain: DoctrineDoc[] = [doctrine]
    let cur = doctrine
    while (cur.parentId && chain.length < 3) {
        const parent = await Db.doctrines.findOne({ _id: cur.parentId }) as DoctrineDoc | null
        if (!parent) break
        chain.unshift(parent)
        cur = parent
    }
    return chain
}

export interface ResolvedLevel { id: string; level: DoctrineLevel; name: string; version: number | null }

/**
 * The doctrine as it stands. `at` pins every level to the version in force
 * then (a historic operation); null takes the latest published. With
 * `draftOf`, that one level uses its unsaved draft instead (the builder).
 */
export async function resolve(doctrine: DoctrineDoc, at: Date | null, draftOf?: string) {
    const chain = await loadChain(doctrine)
    const versions = await Db.doctrineVersions.find({ doctrineId: { $in: chain.map(d => d._id) } }).toArray()
    const levels: { level: DoctrineLevel; overrides: DoctrineOverrides | null }[] = []
    const info: ResolvedLevel[] = []
    for (const d of chain) {
        const id = String(d._id)
        if (draftOf === id) {
            levels.push({ level: d.level, overrides: d.draft })
            info.push({ id, level: d.level, name: d.name, version: null })
            continue
        }
        const v = versionAt(versions.filter(x => String(x.doctrineId) === id), at)
        levels.push({ level: d.level, overrides: v?.overrides ?? null })
        info.push({ id, level: d.level, name: d.name, version: v?.version ?? null })
    }
    return { values: resolveChain(levels.map(l => l.overrides)), sources: sourcesOf(levels), chain: info, docs: chain }
}

/** The parent's published doctrine, which this level's overrides are measured against. */
export async function parentValues(doctrine: DoctrineDoc): Promise<DoctrineValues> {
    if (!doctrine.parentId) return EMPTY_VALUES
    const parent = await Db.doctrines.findOne({ _id: doctrine.parentId }) as DoctrineDoc | null
    return parent ? (await resolve(parent, null)).values : EMPTY_VALUES
}

async function versionOverrides(doctrineId: ObjectId, version: number): Promise<DoctrineOverrides | null> {
    if (!version) return null
    return (await Db.doctrineVersions.findOne({ doctrineId, version }))?.overrides ?? null
}

/** Save the builder's effective values as this level's draft. */
export async function saveDraft(doctrine: DoctrineDoc, edited: DoctrineValues, byName: string) {
    const draft = diffOverrides(await parentValues(doctrine), edited)
    await Db.doctrines.updateOne({ _id: doctrine._id }, { $set: { draft, draftUpdatedAt: new Date(), draftByName: byName } })
    return draft
}

async function writeVersion(doctrine: DoctrineDoc, overrides: DoctrineOverrides, by: { id: string; name: string }, opts: { reason?: string; approvedBy?: { id: string; name: string }; significant: boolean; rebaseline: boolean }) {
    const version = doctrine.publishedVersion + 1
    await Db.doctrineVersions.insertOne({
        doctrineId: doctrine._id, version, overrides, publishedAt: new Date(),
        publishedById: by.id, publishedByName: by.name, reason: opts.reason,
        approvedById: opts.approvedBy?.id ?? null, approvedByName: opts.approvedBy?.name ?? null, significant: opts.significant,
    })
    await Db.doctrines.updateOne({ _id: doctrine._id }, {
        $set: { publishedVersion: version, ...(opts.rebaseline ? { baselineVersion: version } : {}), pending: null },
    })
    return version
}

export type PublishResult =
    | { status: 'published'; version: number }
    | { status: 'pending'; reasons: string[]; taskId: string | null }
    | { status: 'needs-reason'; reasons: string[] }

/**
 * Publish the draft. A first publish, a minor change, or a J2 Lead
 * publishing goes live at once. A significant change (against the last
 * approved version) needs a reason and becomes a J2 Lead task; the live
 * version is unchanged until it is approved.
 */
export async function publish(doctrine: DoctrineDoc, by: { id: string; name: string }, reason: string, isApprover: boolean): Promise<PublishResult> {
    const parent = await parentValues(doctrine)
    const next = applyOverrides(parent, doctrine.draft)

    if (!doctrine.publishedVersion) {
        const version = await writeVersion(doctrine, doctrine.draft, by, { reason, significant: false, rebaseline: true })
        return { status: 'published', version }
    }

    const baseline = applyOverrides(parent, await versionOverrides(doctrine._id, doctrine.baselineVersion))
    const changes = changesBetween(baseline, next)
    const check = needsApproval(changes)

    if (!check.required) {
        const version = await writeVersion(doctrine, doctrine.draft, by, { reason, significant: false, rebaseline: false })
        return { status: 'published', version }
    }
    if (isApprover) {
        const version = await writeVersion(doctrine, doctrine.draft, by, { reason, significant: true, rebaseline: true, approvedBy: by })
        return { status: 'published', version }
    }
    if (!reason.trim()) return { status: 'needs-reason', reasons: check.reasons }

    const taskId = await createReviewTask(doctrine, by, `Doctrine change for approval: ${doctrine.name}`,
        `${by.name} proposed a significant change to the ${doctrine.level} doctrine "${doctrine.name}".\n\nReason: ${reason}\n\n${check.reasons.join('\n')}`,
        doctrine.pending?.taskId ?? null)
    await Db.doctrines.updateOne({ _id: doctrine._id }, {
        $set: {
            pending: {
                overrides: doctrine.draft, reason: reason.trim().slice(0, 2000), reasons: check.reasons, changes,
                proposedById: by.id, proposedByName: by.name, proposedAt: new Date(), taskId,
            },
        },
    })
    return { status: 'pending', reasons: check.reasons, taskId }
}

/** J2 Lead decision on a pending change. */
export async function reviewPending(doctrine: DoctrineDoc, by: { id: string; name: string }, decision: 'approve' | 'reject' | 'revise', note: string) {
    const pending = doctrine.pending
    if (!pending) return null
    let version: number | null = null
    if (decision === 'approve') {
        version = await writeVersion(doctrine, pending.overrides, { id: pending.proposedById, name: pending.proposedByName },
            { reason: pending.reason, approvedBy: by, significant: true, rebaseline: true })
    } else {
        await Db.doctrines.updateOne({ _id: doctrine._id }, { $set: { pending: null } })
    }
    if (pending.taskId && ObjectId.isValid(pending.taskId)) {
        await Db.tasks.updateOne({ _id: new ObjectId(pending.taskId) }, { $set: { status: 'completed', completedAt: new Date(), notes: `${decision}${note ? `: ${note}` : ''}` } })
    }
    return { version }
}

/** One J2 Lead task, reused if a previous one for this doctrine is still open. */
export async function createReviewTask(doctrine: DoctrineDoc, by: { id: string; name: string }, title: string, description: string, existing: string | null): Promise<string | null> {
    const actionUrl = `/dashboard/j2?tab=9&doctrine=${doctrine._id}`
    if (existing && ObjectId.isValid(existing)) {
        const open = await Db.tasks.findOne({ _id: new ObjectId(existing), status: { $ne: 'completed' } })
        if (open) {
            await Db.tasks.updateOne({ _id: open._id }, { $set: { title, description } })
            return existing
        }
    }
    try {
        const res = await Db.tasks.insertOne({
            title, description,
            assignedRole: J2_LEAD_ROLE,
            assignedBy: by.id, assignedByName: by.name,
            type: 'doctrine_review', department: 'j2', actionUrl, relatedId: String(doctrine._id),
            status: 'pending', createdAt: new Date(),
        } as Task)
        await createNotificationForRole(J2_LEAD_ROLE, {
            type: 'task_assigned', title, body: description.slice(0, 400), actionUrl, relatedId: String(res.insertedId),
        }).catch(() => null)
        return String(res.insertedId)
    } catch {
        return null
    }
}

/**
 * Custom options waiting for review get one J2 Lead task per doctrine,
 * raised when the doctrine is published (after the mission is written,
 * not on every keystroke).
 */
export async function raiseOptionsTask(doctrine: DoctrineDoc, by: { id: string; name: string }) {
    const pending = (doctrine.customOptions ?? []).filter(o => o.status === 'pending')
    if (!pending.length) return
    const taskId = await createReviewTask(doctrine, by, `Custom doctrine options to review: ${doctrine.name}`,
        `${pending.length} custom option${pending.length === 1 ? '' : 's'} added in "${doctrine.name}" are pending global review: ${pending.map(o => o.label).join(', ')}.`,
        doctrine.optionsTaskId ?? null)
    if (taskId) await Db.doctrines.updateOne({ _id: doctrine._id }, { $set: { optionsTaskId: taskId } })
}

/** Global options for every field: schema options are in the schema; these are the approved custom ones. */
export async function globalOptions(): Promise<Record<string, string[]>> {
    const rows = await Db.doctrineOptions.find({}).toArray()
    const out: Record<string, string[]> = {}
    for (const r of rows) (out[r.fieldKey] ??= []).push(r.label)
    return out
}

export async function logDoctrine(action: string, doctrine: DoctrineDoc, by: { id: string; name: string }, details: Record<string, unknown> = {}) {
    await logAction({
        action: `doctrine.${action}`,
        category: 'operation',
        performedBy: by.id,
        performedByName: by.name,
        entityType: 'doctrine',
        entityId: String(doctrine._id),
        actionUrl: doctrine.operationId ? `/operations/${doctrine.operationId}` : '/dashboard/j2?tab=9',
        details: { level: doctrine.level, name: doctrine.name, ...details },
    })
}

/**
 * The mission doctrine for one Enemy Doctrine page of an operation, if it has
 * one. Historic operations read every level as it stood on the night: the end
 * of the operation's day.
 *
 * An operation can have several doctrine pages, so each mission doctrine
 * carries the `pageId` it belongs to. One made before that has none: the
 * first page to ask for it takes it over.
 */
export async function operationDoctrine(operationId: string, pageId?: string | null) {
    let doc = pageId
        ? await Db.doctrines.findOne({ level: 'mission', operationId, pageId, deletedAt: null }) as DoctrineDoc | null
        : null
    if (!doc) {
        doc = await Db.doctrines.findOne({ level: 'mission', operationId, pageId: null, deletedAt: null }) as DoctrineDoc | null
        if (doc && pageId) {
            await Db.doctrines.updateOne({ _id: doc._id, pageId: null }, { $set: { pageId } })
            doc = { ...doc, pageId }
        }
    }
    if (!doc) return null
    const op = ObjectId.isValid(operationId) ? await Db.operations.findOne({ _id: new ObjectId(operationId) }, { projection: { date: 1 } }) : null
    const date = op?.date ? new Date(op.date) : null
    const pinAt = date && date.getTime() + 12 * 3600_000 < Date.now() ? new Date(date.getTime() + 12 * 3600_000) : null
    return { doc, pinAt }
}
