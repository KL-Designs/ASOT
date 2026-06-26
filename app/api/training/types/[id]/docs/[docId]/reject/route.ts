import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotification } from '@/lib/notifications'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, docId } = await params
    if (!ObjectId.isValid(id) || !ObjectId.isValid(docId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const doc = await Db.trainingTypeDocs.findOne({ _id: new ObjectId(docId), trainingTypeId: id, deletedAt: { $exists: false } })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (doc.approvalStatus !== 'pending') return NextResponse.json({ error: 'Document is not pending' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const rejectionNote = body.note?.trim() || undefined
    const now = new Date()

    await Db.trainingTypeDocs.updateOne(
        { _id: new ObjectId(docId) },
        { $set: { approvalStatus: 'rejected', rejectionNote, updatedAt: now } }
    )

    const type = await Db.trainingTypes.findOne({ _id: new ObjectId(id) })

    await createNotification({
        userId: doc.uploadedById,
        type: 'training_doc_rejected',
        title: 'Document Not Approved',
        body: rejectionNote
            ? `Your document "${doc.title}" for ${type?.name ?? 'a training course'} was not approved: ${rejectionNote}`
            : `Your document "${doc.title}" for ${type?.name ?? 'a training course'} was not approved.`,
        actionUrl: '/dashboard/unit/training-docs',
        relatedId: docId,
    }).catch(console.error)

    const updated = await Db.trainingTypeDocs.findOne({ _id: new ObjectId(docId) })
    return NextResponse.json(updated)
}
