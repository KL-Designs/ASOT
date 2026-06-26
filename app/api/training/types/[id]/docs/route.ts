import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotificationForRole } from '@/lib/notifications'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    const isTrainer = client.hasRoles(me, PERMISSIONS.training.create)

    const base: Record<string, unknown> = { trainingTypeId: id, deletedAt: { $exists: false } }

    if (!isJ3Lead) {
        if (isTrainer) {
            // Trainers see approved docs + their own submissions (any status)
            base.$or = [{ approvalStatus: 'approved' }, { uploadedById: me.id }]
        } else {
            base.approvalStatus = 'approved'
        }
    }

    const docs = await Db.trainingTypeDocs.find(base).sort({ createdAt: 1 }).toArray()
    return NextResponse.json({ docs })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    const isTrainer = client.hasRoles(me, PERMISSIONS.training.create)
    if (!isJ3Lead && !isTrainer) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const type = await Db.trainingTypes.findOne({ _id: new ObjectId(id) })
    if (!type) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const { title, url, description } = body
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    if (!url?.trim()) return NextResponse.json({ error: 'URL is required' }, { status: 400 })

    const now = new Date()
    const uploaderName = me.guild?.displayName ?? me.username
    const approvalStatus = isJ3Lead ? 'approved' : 'pending'

    const result = await Db.trainingTypeDocs.insertOne({
        trainingTypeId: id,
        title: title.trim(),
        url: url.trim(),
        description: description?.trim() || undefined,
        approvalStatus,
        ...(isJ3Lead ? { approvedById: me.id, approvedByName: uploaderName, approvedAt: now } : {}),
        uploadedById: me.id,
        uploadedByName: uploaderName,
        createdAt: now,
        updatedAt: now,
    })

    // Notify J3 leads when a trainer submits (pending)
    if (!isJ3Lead) {
        const J3_LEAD_ROLES = ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer']
        await Promise.all(J3_LEAD_ROLES.map(role =>
            createNotificationForRole(role, {
                type: 'training_doc_submitted',
                title: 'Training Document Submitted',
                body: `${uploaderName} submitted a document for ${type.name}: "${title.trim()}"`,
                actionUrl: '/dashboard/unit/training-docs',
                relatedId: result.insertedId.toString(),
            })
        ))
    }

    const created = await Db.trainingTypeDocs.findOne({ _id: result.insertedId })
    return NextResponse.json(created, { status: 201 })
}
