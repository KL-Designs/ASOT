import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logAction'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, docId } = await params
    if (!ObjectId.isValid(id) || !ObjectId.isValid(docId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const doc = await Db.trainingTypeDocs.findOne({ _id: new ObjectId(docId), trainingTypeId: id, deletedAt: { $exists: true } })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const name = me.guild?.displayName ?? me.username
    const now = new Date()

    await Db.trainingTypeDocs.updateOne(
        { _id: new ObjectId(docId) },
        {
            $unset: { deletedAt: 1, deletedById: 1, deletedByName: 1 },
            $set: { updatedAt: now },
        }
    )

    await logAction({
        action: 'training_doc.restore',
        category: 'training',
        department: 'j3',
        performedBy: me.id,
        performedByName: name,
        entityType: 'training_doc',
        entityId: docId,
    })

    return NextResponse.json({ ok: true })
}
