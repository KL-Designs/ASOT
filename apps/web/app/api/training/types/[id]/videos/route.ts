import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

function callerName(me: Awaited<ReturnType<typeof client.fetchMe>>) {
    return me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
}

export async function GET(_req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const videos = await Db.trainingTypeVideos
        .find({ trainingTypeId: id, deletedAt: { $exists: false } })
        .sort({ createdAt: -1 })
        .toArray()

    return NextResponse.json({ videos })
}

export async function POST(req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.trainer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Check one-video-per-course limit
    const existing = await Db.trainingTypeVideos.findOne({ trainingTypeId: id, deletedAt: { $exists: false } })
    if (existing) return NextResponse.json({ error: 'A video already exists for this course. Remove it first.' }, { status: 409 })

    let body: { title?: string; url?: string; filename?: string; description?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    if (!body.title?.trim() || !body.url?.trim() || !body.filename?.trim()) {
        return NextResponse.json({ error: 'title, url and filename are required' }, { status: 400 })
    }

    const name = callerName(me)
    const now = new Date()

    const video: Omit<TrainingTypeVideo, '_id'> = {
        trainingTypeId: id,
        title: body.title.trim(),
        url: body.url.trim(),
        filename: body.filename.trim(),
        description: body.description?.trim() || undefined,
        checkpoints: [],
        addedById: me.id,
        addedByName: name,
        createdAt: now,
        updatedAt: now,
    }

    const result = await Db.trainingTypeVideos.insertOne(video as TrainingTypeVideo)
    return NextResponse.json({ _id: result.insertedId, ...video })
}

export async function DELETE(req: NextRequest, { params }: Params) {
    const { id: typeId } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body: { videoId?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    if (!body.videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

    let oid: ObjectId
    try { oid = new ObjectId(body.videoId) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    await Db.trainingTypeVideos.updateOne(
        { _id: oid, trainingTypeId: typeId },
        { $set: { deletedAt: new Date(), deletedById: me.id } },
    )

    return NextResponse.json({ ok: true })
}
