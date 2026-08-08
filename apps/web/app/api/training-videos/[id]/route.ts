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

export async function GET(_req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const oid = parseOid(id)
    if (!oid) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const video = await Db.trainingTypeVideos.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(video)
}

/** Update checkpoints (J3 trainer only) */
export async function PUT(req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.trainer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const oid = parseOid(id)
    if (!oid) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    let body: { checkpoints?: TrainingVideoCheckpoint[]; sections?: TrainingVideoSection[]; title?: string; description?: string; duration?: number }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    const $set: Record<string, unknown> = { updatedAt: new Date() }
    if (body.checkpoints !== undefined) $set.checkpoints = body.checkpoints
    if (body.sections   !== undefined) $set.sections    = body.sections
    if (body.title      !== undefined) $set.title       = body.title
    if (body.description !== undefined) $set.description = body.description
    if (body.duration   !== undefined) $set.duration    = body.duration

    const res = await Db.trainingTypeVideos.updateOne({ _id: oid, deletedAt: { $exists: false } }, { $set })
    if (!res.matchedCount) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const oid = parseOid(id)
    if (!oid) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    await Db.trainingTypeVideos.updateOne({ _id: oid }, { $set: { deletedAt: new Date(), deletedById: me.id } })

    return NextResponse.json({ ok: true })
}
