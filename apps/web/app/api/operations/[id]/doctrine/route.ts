import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { actorName } from '@/lib/operations/aar-context'
import { logDoctrine, operationDoctrine, resolve } from '@/lib/doctrine/db'
import { doctrineStanding } from '@/app/api/doctrines/gate'

/**
 * `/api/operations/{id}/doctrine` — the operation's Enemy Doctrine page
 * (`pageType: 'doctrine'`).
 *
 * GET: the doctrine in force for this operation, resolved Faction →
 * Campaign → Mission and, once the operation has happened, pinned to the
 * versions that were live on the night. Without one yet, the faction list
 * to start from.
 * POST `{ factionId }`: set it up. Inside a campaign this reuses (or makes)
 * the campaign's doctrine for that faction, so every mission in the campaign
 * inherits the same campaign changes.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const found = await operationDoctrine(id)
    const standing = await doctrineStanding(me, found?.doc ?? ({ level: 'mission', operationId: id } as Doctrine))
    if (!standing.canView) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    if (!found) {
        const factions = await Db.doctrines.find({ level: 'faction', deletedAt: null, publishedVersion: { $gt: 0 } }, { projection: { name: 1 } }).sort({ name: 1 }).toArray()
        return NextResponse.json({ standing, mission: null, factions: factions.map(f => ({ id: String(f._id), name: f.name })) })
    }
    const resolved = await resolve(found.doc, found.pinAt)
    return NextResponse.json({
        standing,
        mission: { id: String(found.doc._id), name: found.doc.name, publishedVersion: found.doc.publishedVersion, pending: !!found.doc.pending },
        pinnedAt: found.pinAt,
        chain: resolved.chain,
        values: resolved.values,
        sources: resolved.sources,
    })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const standing = await doctrineStanding(me, { level: 'mission', operationId: id } as Doctrine)
    if (!standing.canEdit) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    if (await operationDoctrine(id)) return NextResponse.json({ error: 'This operation already has a doctrine' }, { status: 409 })

    const body = await req.json().catch(() => null)
    const factionId = typeof body?.factionId === 'string' && ObjectId.isValid(body.factionId) ? new ObjectId(body.factionId) : null
    const faction = factionId ? await Db.doctrines.findOne({ _id: factionId, level: 'faction', deletedAt: null }) : null
    if (!faction) return NextResponse.json({ error: 'Pick a faction doctrine' }, { status: 400 })

    const op = await Db.operations.findOne({ _id: new ObjectId(id) }, { projection: { title: 1, campaignId: 1 } })
    if (!op) return NextResponse.json({ error: 'Operation not found' }, { status: 404 })
    const by = { id: me.id, name: actorName(me) }
    const now = new Date()
    const base = { draft: {}, publishedVersion: 0, baselineVersion: 0, pending: null, customOptions: [], createdAt: now, createdById: by.id, createdByName: by.name, deletedAt: null }

    let parentId = faction._id!
    const campaignId = op.campaignId ? String(op.campaignId) : null
    if (campaignId) {
        let campaignDoc = await Db.doctrines.findOne({ level: 'campaign', campaignId, parentId: faction._id, deletedAt: null })
        if (!campaignDoc) {
            const campaign = ObjectId.isValid(campaignId) ? await Db.operationCampaigns.findOne({ _id: new ObjectId(campaignId) }, { projection: { name: 1 } }) : null
            const doc: Doctrine = { ...base, level: 'campaign', name: `${faction.name} — ${campaign?.name ?? 'Campaign'}`, parentId: faction._id!, campaignId, operationId: null }
            const res = await Db.doctrines.insertOne(doc)
            campaignDoc = { ...doc, _id: res.insertedId }
            await logDoctrine('create', campaignDoc as Doctrine & { _id: ObjectId }, by)
        }
        parentId = campaignDoc._id!
    }
    const mission: Doctrine = { ...base, level: 'mission', name: `${faction.name} — ${op.title}`, parentId, campaignId, operationId: id }
    const res = await Db.doctrines.insertOne(mission)
    await logDoctrine('create', { ...mission, _id: res.insertedId }, by)
    return NextResponse.json({ ok: true, id: String(res.insertedId) })
}
