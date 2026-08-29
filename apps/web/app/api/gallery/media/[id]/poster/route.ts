import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { readFileSync } from 'fs'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { resolveStorageKey } from '@/lib/gallery/paths'
import { isPublic } from '@/lib/gallery/status'

/** A video's or an embed's still frame. Always a small JPEG, so it is served
 *  whole — Range would be ceremony over a few dozen kilobytes. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ObjectId.isValid(id)) return new NextResponse('Not found', { status: 404 })

    const doc = await Db.galleryMedia.findOne({ _id: new ObjectId(id) })
    if (!doc?.posterKey) return new NextResponse('Not found', { status: 404 })

    // Same access rule as the media route, and the same reason for 404 over
    // 403 throughout: see app/api/gallery/media/[id]/route.ts.
    if (!isPublic(doc.status)) {
        if (doc.status !== 'pending' && doc.status !== 'processing') return new NextResponse('Not found', { status: 404 })
        const me = await client.fetchMe().catch(() => null)
        const allowed = !!me && (me.id === doc.authorId || await hasPermission(me, 'gallery.review'))
        if (!allowed) return new NextResponse('Not found', { status: 404 })
    }

    const file = resolveStorageKey(doc.posterKey)
    if (!file) return new NextResponse('Not found', { status: 404 })

    try {
        return new NextResponse(readFileSync(file) as BodyInit, {
            status: 200,
            headers: {
                'Content-Type': 'image/jpeg',
                'Cache-Control': isPublic(doc.status) ? 'public, max-age=31536000, immutable' : 'private, no-store',
            },
        })
    } catch {
        return new NextResponse('Not found', { status: 404 })
    }
}
