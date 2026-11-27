import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

type Params = { params: Promise<{ id: string }> }

/** POST /api/training-docs/[id]/changes — add a change log entry. J3 manage only. */
export async function POST(req: NextRequest, { params }: Params) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingDocs.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const doc = await Db.trainingDocs.findOne({ _id: new ObjectId(id) })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (doc.type !== 'document') return NextResponse.json({ error: 'Cannot add change log to a folder' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const summary = typeof body.summary === 'string' ? body.summary.trim() : ''
    if (!summary) return NextResponse.json({ error: 'summary is required' }, { status: 400 })

    const requiresAck = body.requiresAck === true

    const actorName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const existing = doc.changeLog ?? []
    const nextVersion = existing.length > 0 ? Math.max(...existing.map(e => e.version)) + 1 : 1

    const entry: TrainingDocChangeEntry = {
        version: nextVersion,
        summary,
        addedAt: new Date(),
        addedById: me.id,
        addedByName: actorName,
        requiresAck,
    }

    await Db.trainingDocs.updateOne(
        { _id: new ObjectId(id) },
        { $push: { changeLog: entry as any } }
    )

    // Fan-out notifications to all active members when mandatory ack required
    if (requiresAck) {
        const members = await Db.users.find({ discharged: { $exists: false }, isSkeletonAccount: { $ne: true } }).project({ id: 1 }).toArray()
        if (members.length > 0) {
            const notifications = members.map(m => ({
                userId: m.id as string,
                type: 'task_assigned' as const,
                title: 'Training document updated',
                body: `"${doc.name}" has been updated (v${nextVersion}): ${summary.slice(0, 120)}`,
                actionUrl: `/dashboard/unit/training-docs/${id}` as string,
                relatedId: id,
                read: false,
                createdAt: new Date(),
            }))
            await Db.notifications.insertMany(notifications as any[])
        }
    }

    return NextResponse.json({ entry })
}
