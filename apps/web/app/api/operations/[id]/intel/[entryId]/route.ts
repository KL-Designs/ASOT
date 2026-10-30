import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { actorName } from '@/lib/operations/aar-context'
import { loadEntryInScope } from '@/lib/intel/report-db'
import {
    ASSESSMENT_STATUSES, canEditEntry, changed, forViewer, hiddenUntil, sanitiseEntryInput, snapshotVersion, tallyVotes,
} from '@/lib/intel/report'
import { intelGate } from '../gate'

/**
 * `/api/operations/{id}/intel/{entryId}` — one Intelligence Report entry.
 *
 * GET: the entry, plus for staff its version history and staff comments.
 * PATCH `{ action }`: `edit` (keeps the old text as a version), `assess`,
 * `approve`, `release`, `hide`, `restore`. DELETE `{ reason }` soft-deletes
 * to the Recycle Bin. Every change is logged.
 */

type Params = { params: Promise<{ id: string; entryId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
    const { id, entryId } = await params
    const gate = await intelGate(id)
    if ('error' in gate) return gate.error
    const { me, ctx } = gate

    const entry = await loadEntryInScope(ctx, entryId)
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const votes = await Db.intelVotes.find({ entryId: entry._id }).toArray()
    const out = forViewer(entry, ctx.staff, tallyVotes(votes, me.id))
    if (!ctx.staff) return NextResponse.json({ entry: out })

    const comments = await Db.intelComments.find({ entryId: entry._id, deletedAt: null }).sort({ createdAt: 1 }).toArray()
    return NextResponse.json({
        entry: out,
        versions: (entry.versions ?? []).map(v => ({ ...v, at: new Date(v.at).toISOString() })).reverse(),
        comments: comments.map(c => ({ id: String(c._id), authorId: c.authorId, authorName: c.authorName, body: c.body, createdAt: new Date(c.createdAt).toISOString() })),
        canEdit: canEditEntry(entry, me.id, ctx.standing),
    })
}

export async function PATCH(req: NextRequest, { params }: Params) {
    const { id, entryId } = await params
    const gate = await intelGate(id)
    if ('error' in gate) return gate.error
    const { me, ctx } = gate
    if (!ctx.staff) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const entry = await loadEntryInScope(ctx, entryId)
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => null)
    const action = body?.action as string
    const now = new Date()
    const name = actorName(me)
    const s = ctx.standing
    const deny = () => NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    let set: Partial<IntelEntry> = {}
    let push: { versions: IntelVersion } | null = null
    let details: Record<string, unknown> = {}

    switch (action) {
        case 'edit': {
            if (!canEditEntry(entry, me.id, s) || entry.deletedAt) return deny()
            const input = sanitiseEntryInput(body)
            if (!input) return NextResponse.json({ error: 'An entry needs a title, a description or some evidence' }, { status: 400 })
            if (changed(entry, input)) {
                push = { versions: snapshotVersion(entry, { id: me.id, name }, now) }
                set = { ...input }
            }
            details = { title: input.title, changed: !!push }
            break
        }
        case 'assess': {
            if (!s.canAssess) return deny()
            const status = body?.status
            if (!ASSESSMENT_STATUSES.includes(status)) return NextResponse.json({ error: 'Unknown assessment' }, { status: 400 })
            set = {
                assessment: {
                    status,
                    comment: typeof body?.comment === 'string' ? body.comment.trim().slice(0, 2000) : '',
                    released: !!body?.released,
                    byId: me.id, byName: name, at: now,
                },
            }
            details = { status, released: !!body?.released }
            break
        }
        case 'approve':
            if (!s.canAssess) return deny()
            set = { publication: 'published' }
            break
        case 'release':
            if (!s.canAssess) return deny()
            set = { hiddenUntilSequence: null }
            break
        case 'hide': {
            if (!s.canAssess) return deny()
            const until = hiddenUntil(body?.hiddenUntil, entry.sourceSequence)
            set = { hiddenUntilSequence: until }
            details = { hiddenUntil: until }
            break
        }
        // Held back by hand, regardless of mission: for laying out a campaign's intel ahead of time.
        case 'conceal':
            if (!s.canAssess) return deny()
            set = { hidden: true }
            break
        case 'reveal':
            if (!s.canAssess) return deny()
            set = { hidden: false, hiddenUntilSequence: null }
            break
        case 'restore':
            if (!s.canManage) return deny()
            set = { deletedAt: null, deletedById: null, deletedByName: null, deleteReason: null }
            break
        default:
            return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    if (Object.keys(set).length || push) {
        await Db.intelEntries.updateOne(
            { _id: entry._id },
            { $set: { ...set, updatedAt: now }, ...(push ? { $push: push } : {}) },
        )
        await logAction({
            action: `intel.entry.${action}`,
            category: 'operation',
            performedBy: me.id,
            performedByName: name,
            entityType: 'intelEntry',
            entityId: entryId,
            actionUrl: `/operations/${id}`,
            details: { operationId: id, ...details },
        })
    }
    return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: Params) {
    const { id, entryId } = await params
    const gate = await intelGate(id)
    if ('error' in gate) return gate.error
    const { me, ctx } = gate

    const entry = await loadEntryInScope(ctx, entryId)
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!canEditEntry(entry, me.id, ctx.standing)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    if (entry.deletedAt) return NextResponse.json({ ok: true })

    const body = await req.json().catch(() => null)
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
    const name = actorName(me)
    await Db.intelEntries.updateOne({ _id: entry._id }, { $set: { deletedAt: new Date(), deletedById: me.id, deletedByName: name, deleteReason: reason || null } })
    await logAction({
        action: 'intel.entry.delete',
        category: 'operation',
        performedBy: me.id,
        performedByName: name,
        entityType: 'intelEntry',
        entityId: entryId,
        actionUrl: `/operations/${id}`,
        details: { operationId: id, title: entry.title, reason },
    })
    return NextResponse.json({ ok: true })
}
