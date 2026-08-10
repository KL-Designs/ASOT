import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import path from 'path'
import fs from 'fs/promises'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'

const UPLOADS_DIR = path.join(process.cwd(), '..', '..', 'storage', 'uploads', 'ai-images')

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return new Response('Unauthorized', { status: 401 })
        if (!client.hasRoles(me, PERMISSIONS.ai.use)) return new Response('Forbidden', { status: 403 })

        const { id } = await params
        const image = await Db.aiGeneratedImages.findOne({ _id: new ObjectId(id), status: { $ne: 'deleted' } })
        if (!image) return new Response('Not found', { status: 404 })

        // Only owner or J2/J4 can view
        const canViewAll = await hasPermission(me, 'intel.viewAllImages')
        if (image.userId !== me.id && !canViewAll) return new Response('Forbidden', { status: 403 })

        const filePath = path.join(UPLOADS_DIR, image.imagePath)
        const buffer   = await fs.readFile(filePath)

        return new Response(buffer, {
            headers: {
                'Content-Type':  'image/png',
                'Cache-Control': 'private, max-age=3600',
            },
        })
    } catch (err) {
        console.error('[api/ai/images/[id]/file GET]', err)
        return new Response('Server error', { status: 500 })
    }
}
