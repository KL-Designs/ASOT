import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { actorName } from '@/lib/operations/aar-context'
import { logDoctrine } from '@/lib/doctrine/db'
import { doctrineStanding } from './gate'

/**
 * `/api/doctrines` — rows 334 and 335, the faction doctrine library.
 * GET lists faction doctrines (and, with `?pending=1`, everything waiting
 * on a J2 Lead). POST `{ name }` creates a faction doctrine.
 */
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const standing = await doctrineStanding(me)
    if (!standing.canView) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const factions = await Db.doctrines.find({ level: 'faction', deletedAt: null }).sort({ name: 1 }).toArray()
    const out: Record<string, unknown> = {
        standing,
        factions: factions.map(f => ({
            id: String(f._id), name: f.name, publishedVersion: f.publishedVersion,
            hasDraft: Object.keys(f.draft ?? {}).length > 0, pending: !!f.pending,
            pendingOptions: (f.customOptions ?? []).filter(o => o.status === 'pending').length,
        })),
    }
    if (req.nextUrl.searchParams.get('pending') === '1' && standing.canApprove) {
        const waiting = await Db.doctrines.find({ deletedAt: null, $or: [{ pending: { $ne: null } }, { 'customOptions.status': 'pending' }] }).toArray()
        out.pending = waiting.map(d => ({
            id: String(d._id), name: d.name, level: d.level, operationId: d.operationId ?? null,
            change: d.pending ? { reason: d.pending.reason, reasons: d.pending.reasons, proposedByName: d.pending.proposedByName, proposedAt: d.pending.proposedAt, changes: d.pending.changes } : null,
            options: (d.customOptions ?? []).filter(o => o.status === 'pending'),
        }))
    }
    return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const standing = await doctrineStanding(me, { level: 'faction' } as Doctrine)
    if (!standing.canEdit) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : ''
    if (!name) return NextResponse.json({ error: 'A faction doctrine needs a name' }, { status: 400 })

    const by = { id: me.id, name: actorName(me) }
    const doc: Doctrine = {
        level: 'faction', name, parentId: null, campaignId: null, operationId: null,
        draft: { fields: { 'identity.name': name } }, publishedVersion: 0, baselineVersion: 0, pending: null,
        customOptions: [], createdAt: new Date(), createdById: by.id, createdByName: by.name, deletedAt: null,
    }
    const res = await Db.doctrines.insertOne(doc)
    await logDoctrine('create', { ...doc, _id: res.insertedId as ObjectId }, by)
    return NextResponse.json({ ok: true, id: String(res.insertedId) })
}
