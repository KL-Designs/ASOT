import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const instance = await Db.courseInstances.findOne({ _id: oid, deletedAt: { $exists: true } })
    if (!instance) return NextResponse.json({ error: 'Not found or not deleted' }, { status: 404 })

    const conflict = await Db.courseInstances.findOne({
        trainingTypeId: instance.trainingTypeId,
        status: { $in: ['planning', 'active', 'in_progress'] },
        deletedAt: { $exists: false },
    })
    if (conflict) return NextResponse.json({ error: 'Cannot restore: an active instance already exists' }, { status: 409 })

    await Db.courseInstances.updateOne({ _id: oid }, {
        $unset: { deletedAt: '', deletedById: '', deletedByName: '' },
        $set: { updatedAt: new Date() },
    })
    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    await logAction({
        action: 'course.restore',
        category: 'J3',
        performedBy: me.id,
        performedByName: name,
        department: 'J3',
        entityType: 'course_instance',
        entityId: id,
        after: { instanceRef: instance.instanceRef },
    })
    return NextResponse.json({ ok: true })
}
