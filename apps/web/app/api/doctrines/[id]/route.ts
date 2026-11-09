import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { globalOptions, logDoctrine, resolve, saveDraft } from '@/lib/doctrine/db'
import { sanitiseValues } from '@/lib/doctrine/values'
import { doctrineGate } from '../gate'

/**
 * `/api/doctrines/{id}` — one doctrine level.
 *
 * GET: the published doctrine (resolved through its parents), the draft as
 * the builder edits it, the version list, any pending change, and the
 * options (approved globals plus this chain's custom ones).
 * PUT `{ values }`: save the builder's values as this level's draft; only
 * what differs from the parent is kept.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const gate = await doctrineGate(id)
    if ('error' in gate) return gate.error
    const { doctrine, standing } = gate

    const [published, draft, versions, globals] = await Promise.all([
        resolve(doctrine, null),
        standing.canEdit ? resolve(doctrine, null, id) : null,
        Db.doctrineVersions.find({ doctrineId: doctrine._id }, { projection: { overrides: 0 } }).sort({ version: -1 }).toArray(),
        globalOptions(),
    ])
    const customOptions = (published.docs ?? []).flatMap(d => (d.customOptions ?? []).filter(o => o.status !== 'merged'))

    return NextResponse.json({
        doctrine: {
            id, level: doctrine.level, name: doctrine.name, campaignId: doctrine.campaignId ?? null, operationId: doctrine.operationId ?? null,
            publishedVersion: doctrine.publishedVersion, baselineVersion: doctrine.baselineVersion,
            draftUpdatedAt: doctrine.draftUpdatedAt ?? null, draftByName: doctrine.draftByName ?? null,
            pending: doctrine.pending ? { reason: doctrine.pending.reason, reasons: doctrine.pending.reasons, changes: doctrine.pending.changes, proposedByName: doctrine.pending.proposedByName, proposedAt: doctrine.pending.proposedAt } : null,
        },
        standing,
        chain: published.chain,
        published: { values: published.values, sources: published.sources },
        draft: draft ? { values: draft.values, sources: draft.sources } : null,
        versions: versions.map(v => ({ version: v.version, publishedAt: v.publishedAt, publishedByName: v.publishedByName, reason: v.reason ?? '', approvedByName: v.approvedByName ?? null, significant: v.significant })),
        options: { global: globals, custom: customOptions },
    })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const gate = await doctrineGate(id)
    if ('error' in gate) return gate.error
    const { doctrine, standing, by } = gate
    if (!standing.canEdit) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await req.json().catch(() => null)
    if (!body?.values) return NextResponse.json({ error: 'Malformed body' }, { status: 400 })
    const draft = await saveDraft(doctrine, sanitiseValues(body.values), by.name)
    if (typeof body.name === 'string' && body.name.trim() && doctrine.level === 'faction') {
        await Db.doctrines.updateOne({ _id: doctrine._id }, { $set: { name: body.name.trim().slice(0, 120) } })
    }
    await logDoctrine('draft', doctrine, by, { keys: Object.keys(draft) })
    return NextResponse.json({ ok: true })
}
