import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

function callerName(me: Awaited<ReturnType<typeof client.fetchMe>>) {
    return me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
}

/** Create a standalone training video (not yet linked to a training type) */
export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.trainer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body: { title?: string; url?: string; filename?: string; description?: string; trainingTypeId?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    if (!body.title?.trim() || !body.url?.trim()) {
        return NextResponse.json({ error: 'title and url are required' }, { status: 400 })
    }

    const name = callerName(me)
    const now  = new Date()

    const video: Omit<TrainingTypeVideo, '_id'> = {
        trainingTypeId: body.trainingTypeId ?? '',
        title: body.title.trim(),
        url: body.url.trim(),
        filename: body.filename?.trim() ?? '',
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
