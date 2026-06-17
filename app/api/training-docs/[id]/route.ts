import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { deleteDocImages, sanitizeDocHtml } from '@/lib/training-docs/parse-gdocs-zip'

type Params = { params: Promise<{ id: string }> }

// GET /api/training-docs/[id]  — fetch full document (including htmlContent)
export async function GET(_req: NextRequest, { params }: Params) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const doc = await Db.trainingDocs.findOne({ _id: new ObjectId(id) })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(doc)
}

// PATCH /api/training-docs/[id]
// Accepts any combination of: { name, parentId, htmlContent, iconName, color }
export async function PATCH(req: NextRequest, { params }: Params) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingDocs.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const { name, parentId: parentIdRaw, htmlContent, iconName, color } = body

    const item = await Db.trainingDocs.findOne({ _id: new ObjectId(id) })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const actorName = me.guild?.displayName ?? me.username
    const updates: Partial<TrainingDocItem> & { updatedAt: Date; updatedByName: string } = {
        updatedAt:     new Date(),
        updatedByName: actorName,
    }

    if (name !== undefined) {
        if (!name?.trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
        updates.name = name.trim()
    }

    if (parentIdRaw !== undefined) {
        const newParentId = parentIdRaw === null ? null : new ObjectId(parentIdRaw)

        // Prevent moving into itself
        if (newParentId && newParentId.equals(new ObjectId(id))) {
            return NextResponse.json({ error: 'Cannot move item into itself' }, { status: 400 })
        }

        if (newParentId) {
            const parent = await Db.trainingDocs.findOne({ _id: newParentId })
            if (!parent || parent.type !== 'folder') {
                return NextResponse.json({ error: 'Target is not a folder' }, { status: 400 })
            }
        }

        updates.parentId = newParentId
    }

    if (htmlContent !== undefined) {
        if (item.type !== 'document') return NextResponse.json({ error: 'Cannot set content on a folder' }, { status: 400 })
        updates.htmlContent = sanitizeDocHtml(htmlContent)
    }

    if (iconName !== undefined) updates.iconName = iconName || undefined
    if (color    !== undefined) updates.color    = color    || undefined

    const result = await Db.trainingDocs.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updates },
        { returnDocument: 'after', projection: { htmlContent: 0, imageFiles: 0 } }
    )

    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(result)
}

// DELETE /api/training-docs/[id]  — delete item (recursive for folders)
export async function DELETE(_req: NextRequest, { params }: Params) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingDocs.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const item = await Db.trainingDocs.findOne({ _id: new ObjectId(id) })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (item.type === 'folder') {
        await deleteFolderRecursive(new ObjectId(id))
    } else {
        if (item.imageFiles?.length) deleteDocImages(item.imageFiles)
        await Db.trainingDocs.deleteOne({ _id: new ObjectId(id) })
    }

    return NextResponse.json({ ok: true })
}

async function deleteFolderRecursive(folderId: ObjectId) {
    const children = await Db.trainingDocs.find({ parentId: folderId }).toArray()
    for (const child of children) {
        if (child.type === 'folder') {
            await deleteFolderRecursive(child._id!)
        } else {
            if (child.imageFiles?.length) deleteDocImages(child.imageFiles)
            await Db.trainingDocs.deleteOne({ _id: child._id })
        }
    }
    await Db.trainingDocs.deleteOne({ _id: folderId })
}
