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
    if (!client.hasRoles(me, PERMISSIONS.trainingGuides.delete)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const guide = await Db.trainingGuides.findOne({ _id: oid, deletedAt: { $exists: true } })
    if (!guide) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''

    await Db.trainingGuides.updateOne(
        { _id: oid },
        { $unset: { deletedAt: 1, deletedById: 1, deletedByName: 1 } },
    )

    await logAction({
        action: 'training_guide.restore',
        category: 'training',
        department: 'j3',
        performedBy: me.id,
        performedByName: name,
        entityType: 'training_guide',
        entityId: id,
        after: JSON.stringify({ title: guide.title, docRef: guide.docRef }),
    })

    return NextResponse.json({ ok: true })
}
