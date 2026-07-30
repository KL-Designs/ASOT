import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

function parseOid(id: string) {
    try { return new ObjectId(id) } catch { return null }
}

function callerName(me: Awaited<ReturnType<typeof client.fetchMe>>) {
    return me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
}

export async function GET(_req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const oid = parseOid(id)
    if (!oid) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const isJ3 = client.hasRoles(me, PERMISSIONS.departments.j3)
    const guide = await Db.trainingGuides.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!guide) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (guide.status !== 'approved' && !isJ3) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    return NextResponse.json(guide)
}

export async function PUT(req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingGuides.write)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const oid = parseOid(id)
    if (!oid) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const existing = await Db.trainingGuides.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let body: Partial<TrainingGuide>
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    const name = callerName(me)
    const now = new Date()

    // Autosave does NOT bump the version — version only changes on approval
    const editEntry: TrainingGuideEditEntry = {
        at: now, byId: me.id, byName: name, type: 'edit',
    }

    await Db.trainingGuides.updateOne(
        { _id: oid },
        {
            $set: {
                title:                   body.title                   ?? existing.title,
                accentColor:             body.accentColor             ?? existing.accentColor,
                outlineColor:            (body as Partial<TrainingGuide>).outlineColor ?? existing.outlineColor,
                duration:                body.duration                ?? existing.duration,
                overview:                body.overview                ?? existing.overview,
                equipment:               body.equipment               ?? existing.equipment,
                trainingAreaDescription: body.trainingAreaDescription ?? existing.trainingAreaDescription,
                teachingPoints:          body.teachingPoints          ?? existing.teachingPoints,
                notes:                   body.notes                   ?? existing.notes,
                lastRevisedAt: now,
                updatedAt:     now,
                updatedById:   me.id,
                updatedByName: name,
            },
            $push: { editHistory: editEntry },
        },
    )

    return NextResponse.json({ ok: true, version: existing.version })
}

export async function PATCH(req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingGuides.write)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const oid = parseOid(id)
    if (!oid) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    let body: { trainingTypeId?: string | null }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    const now  = new Date()
    const meta = { updatedAt: now, updatedById: me.id, updatedByName: callerName(me) }

    const res = body.trainingTypeId === null
        ? await Db.trainingGuides.updateOne({ _id: oid, deletedAt: { $exists: false } }, { $unset: { trainingTypeId: 1 }, $set: meta })
        : await Db.trainingGuides.updateOne({ _id: oid, deletedAt: { $exists: false } }, { $set: { ...meta, trainingTypeId: body.trainingTypeId } })
    if (!res.matchedCount) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingGuides.delete)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const oid = parseOid(id)
    if (!oid) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const name = callerName(me)
    await Db.trainingGuides.updateOne(
        { _id: oid },
        { $set: { deletedAt: new Date(), deletedById: me.id, deletedByName: name } },
    )

    return NextResponse.json({ ok: true })
}
