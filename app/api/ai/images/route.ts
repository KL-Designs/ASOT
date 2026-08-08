import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import path from 'path'
import fs from 'fs/promises'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'ai-images')

export async function GET(req: Request) {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!client.hasRoles(me, PERMISSIONS.ai.use)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const { searchParams } = new URL(req.url)
        const scope  = searchParams.get('scope') ?? 'mine'  // 'mine' | 'all'
        const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
        const limit  = Math.min(50, parseInt(searchParams.get('limit') ?? '24', 10))
        const linked = searchParams.get('linkedOperationId')

        const canViewAll = client.hasRoles(me, PERMISSIONS.intel.viewAllImages)

        const filter: Record<string, unknown> = { status: { $ne: 'deleted' } }

        if (scope === 'all' && canViewAll) {
            // no userId filter — return all (optionally linked)
        } else {
            filter.userId = me.id
        }

        if (linked) filter.linkedOperationId = linked

        const [images, total] = await Promise.all([
            Db.aiGeneratedImages
                .find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .toArray(),
            Db.aiGeneratedImages.countDocuments(filter),
        ])

        return NextResponse.json({ images, total, page, limit, canViewAll })
    } catch (err) {
        console.error('[api/ai/images GET]', err)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function DELETE(req: Request) {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

        const image = await Db.aiGeneratedImages.findOne({ _id: new ObjectId(id) })
        if (!image) return NextResponse.json({ error: 'Not found' }, { status: 404 })

        // Only owner or J4 can delete
        const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)
        if (image.userId !== me.id && !isJ4) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Soft-delete in DB
        await Db.aiGeneratedImages.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: 'deleted', deletedAt: new Date() } }
        )

        // Delete files (best-effort — don't fail if missing)
        const imgFile = path.join(UPLOADS_DIR, image.imagePath)
        await fs.unlink(imgFile).catch(() => {})
        if (image.sourceImagePath) {
            await fs.unlink(path.join(UPLOADS_DIR, image.sourceImagePath)).catch(() => {})
        }

        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[api/ai/images DELETE]', err)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function PATCH(req: Request) {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json() as {
            id: string
            linkedOperationId?: string
            linkedIntelPackageId?: string
            overlayStyle?: AiCameraStyle
            status?: 'generated' | 'used'
        }
        if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

        const image = await Db.aiGeneratedImages.findOne({ _id: new ObjectId(body.id) })
        if (!image) return NextResponse.json({ error: 'Not found' }, { status: 404 })

        const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)
        if (image.userId !== me.id && !isJ4) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const update: Partial<AiGeneratedImage> = {}
        if (body.linkedOperationId    !== undefined) update.linkedOperationId    = body.linkedOperationId
        if (body.linkedIntelPackageId !== undefined) update.linkedIntelPackageId = body.linkedIntelPackageId
        if (body.overlayStyle         !== undefined) update.overlayStyle         = body.overlayStyle
        if (body.status               !== undefined) {
            update.status = body.status
            if (body.status === 'used') update.usedAt = new Date()
        }

        await Db.aiGeneratedImages.updateOne({ _id: new ObjectId(body.id) }, { $set: update })
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[api/ai/images PATCH]', err)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
