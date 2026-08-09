import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logAction'
import { createNotificationForRole } from '@/lib/notifications'

const J3_LEAD_ROLES = ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer']

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

    const name = me.guild?.displayName ?? me.username
    const now = new Date()

    await Db.trainingTypeDocs.updateOne(
        { _id: new ObjectId(docId) },
        { $set: { deletedAt: now, deletedById: me.id, deletedByName: name } }
    )

    await logAction({
        action: 'training_doc.delete',
        category: 'training',
        department: 'j3',
        performedBy: me.id,
        performedByName: name,
        entityType: 'training_doc',
        entityId: docId,
    })

    // Notify J3 leads (only when a J3 lead deletes an approved doc — not when uploader withdraws)
    if (isJ3Lead) {
        const type = await Db.trainingTypes.findOne({ _id: new ObjectId(id) })
        const typeName = type?.name ?? 'a training course'
        await Promise.all(J3_LEAD_ROLES.map(role =>
            createNotificationForRole(role, {
                type: 'training_doc_deleted',
                title: 'Training Document Deleted',
                body: `${name} deleted "${doc.title}" from ${typeName}`,
                actionUrl: '/dashboard/unit/training-docs',
                relatedId: docId,
            })
        ))
    }

    return NextResponse.json({ ok: true })
}
