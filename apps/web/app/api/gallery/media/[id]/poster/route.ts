import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { readFileSync, statSync } from 'fs'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { resolveStorageKey } from '@/lib/gallery/paths'
import { isPublic } from '@/lib/gallery/status'

/** A video's or an embed's still frame. Always a small JPEG, so it is served
 *  whole — Range would be ceremony over a few dozen kilobytes. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    let bytes: Buffer
    let etag: string
    try {
        const stat = statSync(file)
        bytes = readFileSync(file)
        /* Weak, matching the two sibling routes: it validates "the same
           representation", not a byte-exact one, which is all size+mtime can
           honestly promise. */
        etag = `W/"${doc._id.toString()}-${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`
    } catch {
        return new NextResponse('Not found', { status: 404 })
    }

    /* No `immutable`, for exactly the reason app/api/gallery/media/[id] gives:
       this URL is addressed by media id, not by content hash, and the poster
       bytes behind it ARE replaced — fetchEmbedPoster() overwrites them when a
       submission is accepted, and re-processing a video writes a new frame.
       `immutable` promised a year of never revalidating and delivered it: the
       old still kept rendering through a force-refresh because the browser
       never asked again. The ETag gives the same saving on a repeat view and
       self-heals within the hour when it does not. */
    const cacheControl = isPublic(doc.status) ? 'public, max-age=3600' : 'private, no-store'

    if (request.headers.get('if-none-match') === etag) {
        return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cacheControl } })
    }

    return new NextResponse(bytes as BodyInit, {
        status: 200,
        headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': cacheControl,
            ETag: etag,
        },
    })
}
