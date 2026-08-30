import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { createReadStream, statSync } from 'fs'
import { Readable } from 'stream'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { resolveStorageKey } from '@/lib/gallery/paths'
import { isPublic } from '@/lib/gallery/status'
import { parseRange } from '@/lib/gallery/range'

/**
 * Serving one piece of submitted media.
 *
 * Range support is the reason this is not four lines. A plain 200 with the
 * whole body makes video unscrubbable in every browser and unplayable in
 * Safari, which refuses to start a video the server will not serve a range of.
 * So a Range header gets a 206 and a slice, and everything advertises
 * Accept-Ranges so the browser knows it may ask. The parsing itself lives in
 * lib/gallery/range.ts — it is the error-prone part, so it is unit-tested on
 * its own rather than trusted inline here.
 *
 * The body is streamed rather than read into a Buffer: a 60MB clip read whole
 * is 60MB of heap per concurrent viewer, and the gallery is a public page.
 */

const CONTENT_TYPES: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4',
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ObjectId.isValid(id)) return new NextResponse('Not found', { status: 404 })

    const doc = await Db.galleryMedia.findOne({ _id: new ObjectId(id) })
    if (!doc?.storageKey) return new NextResponse('Not found', { status: 404 })

    /* Unpublished media is visible to its author and to whoever reviews it —
       the review tab cannot show a preview otherwise. Rejected and hidden are
       visible to nobody: one has had its bytes deleted, the other was pulled
       on purpose. 404 throughout, never 403 — a 403 would confirm the item
       exists. */
    if (!isPublic(doc.status)) {
        if (doc.status !== 'pending' && doc.status !== 'processing') return new NextResponse('Not found', { status: 404 })
        const me = await client.fetchMe().catch(() => null)
        const allowed = !!me && (me.id === doc.authorId || await hasPermission(me, 'gallery.review'))
        if (!allowed) return new NextResponse('Not found', { status: 404 })
    }

    const file = resolveStorageKey(doc.storageKey)
    if (!file) return new NextResponse('Not found', { status: 404 })

    let size: number
    let etag: string
    try {
        const stat = statSync(file)
        size = stat.size
        // Weak: byte-range responses below are not the full entity, so a
        // strong validator would be wrong on a 206.
        etag = `W/"${doc._id.toString()}-${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`
    } catch { return new NextResponse('Not found', { status: 404 }) }

    const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

    /* No `immutable`, deliberately. This URL is addressed by media id, not by
       content hash, so its bytes can be replaced by a re-process and can
       vanish entirely on a delete. `immutable` promised a year of never
       revalidating and delivered exactly that: a deleted image kept rendering
       through a force-refresh because the browser never asked again. An ETag
       over size and mtime gives the same saving on repeat views and self-heals
       in an hour when it doesn't. */
    const cacheControl = isPublic(doc.status)
        ? 'public, max-age=3600'
        : 'private, no-store'

    /* Only on a full request. A 304 to a ranged request would tell the player
       its cached copy of the whole file is current, which is not what it
       asked and not what it has. */
    if (!request.headers.get('range') && request.headers.get('if-none-match') === etag) {
        return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cacheControl } })
    }

    const result = parseRange(request.headers.get('range'), size)

    if (result.kind === 'unsatisfiable') {
        // The real size in Content-Range is how a player recovers rather than
        // failing outright — it can retry with a range that fits.
        return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }

    if (result.kind === 'range') {
        const { start, end } = result
        const stream = createReadStream(file, { start, end })

        return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
            status: 206,
            headers: {
                'Content-Type': contentType,
                'Content-Length': String(end - start + 1),
                'Content-Range': `bytes ${start}-${end}/${size}`,
                'Accept-Ranges': 'bytes',
                'Cache-Control': cacheControl,
                ETag: etag,
            },
        })
    }

    return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, {
        status: 200,
        headers: {
            'Content-Type': contentType,
            'Content-Length': String(size),
            // Advertised even on a full response, or the browser never asks
            // for a range in the first place.
            'Accept-Ranges': 'bytes',
            'Cache-Control': cacheControl,
            ETag: etag,
        },
    })
}
