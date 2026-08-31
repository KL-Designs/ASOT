import { NextRequest, NextResponse } from 'next/server'
import { createReadStream, statSync } from 'fs'
import { Readable } from 'stream'

import { resolveFeaturedImage } from '@/lib/gallery/featured-path'

/**
 * Serving one featured image by filename.
 *
 * The filename is user input on a public, unauthenticated endpoint, so it goes
 * through resolveFeaturedImage() rather than into a template string — see that
 * module for what happened when it didn't.
 *
 * Cache-Control carries no `immutable`. This URL is name-addressed, not
 * content-addressed: the bytes behind a given filename can be replaced, and
 * the file can be deleted outright. `immutable` told every browser not to
 * revalidate for a year, which is why a deleted image kept rendering through a
 * force-refresh. A weak ETag plus revalidation gives the same saving on
 * repeat views without the lie.
 */

const CONTENT_TYPES: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif',
}

export async function GET(request: NextRequest) {
    const img = new URL(request.url).searchParams.get('img')

    const file = resolveFeaturedImage(img)
    if (!file) return new NextResponse('Not found', { status: 404 })

    let stat: { size: number, mtimeMs: number }
    try { stat = statSync(file) } catch { return new NextResponse('Not found', { status: 404 }) }

    const etag = `W/"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`
    if (request.headers.get('if-none-match') === etag) {
        return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'public, max-age=3600' } })
    }

    const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()

    return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, {
        status: 200,
        headers: {
            'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
            'Content-Length': String(stat.size),
            ETag: etag,
            'Cache-Control': 'public, max-age=3600',
        },
    })
}
