import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, docId } = await params
    if (!ObjectId.isValid(id) || !ObjectId.isValid(docId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const doc = await Db.trainingTypeDocs.findOne({ _id: new ObjectId(docId), trainingTypeId: id, deletedAt: { $exists: false } })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    const isUploader = doc.uploadedById === me.id

    // J3 leads can delete any doc; uploaders can only withdraw pending/rejected submissions
    const canDelete = isJ3Lead || (isUploader && doc.approvalStatus !== 'approved')
    if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await Db.trainingTypeDocs.updateOne(
        { _id: new ObjectId(docId) },
        { $set: { deletedAt: new Date() } }
    )

    return NextResponse.json({ ok: true })
}
