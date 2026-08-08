import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingGuides.write)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const guide = await Db.trainingGuides.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!guide) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let body: { comments?: string; checkDate?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const now = new Date()
    const dueDate = body.checkDate ? new Date(body.checkDate) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const description = [
        body.comments?.trim() || '',
        '',
        `Guide: ${guide.docRef} — ${guide.title}`,
        `Current version: ${guide.version}`,
        `Submitted by: ${name}`,
    ].join('\n').trim()

    await Db.tasks.insertOne({
        title: `Review Training Guide: ${guide.title}`,
        description,
        assignedRole: 'J3 - Department Leader',
        assignedBy: me.id,
        assignedByName: name,
        dueDate,
        department: 'j3',
        type: 'manual' as TaskType,
        actionUrl: '/dashboard/j3',
        relatedId: String(guide._id),
        status: 'pending' as TaskStatus,
        createdAt: now,
    } as Task)

    return NextResponse.json({ ok: true })
}
