import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'fs'
import { randomBytes } from 'crypto'
import sharp from 'sharp'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { resolveStorageKey, THUMB_DIR } from '@/lib/gallery/paths'
import { isPublic } from '@/lib/gallery/status'
import { parseThumbWidth, THUMB_QUALITY, thumbFallbackUrl, thumbPath } from '@/lib/gallery/thumbs'

/**
 * One piece of media, small enough to put in a grid.
 *
 * The sibling route beside this one serves the original, which is what the
 * Media tab used to render in a 178px tile: sixty 3.8MB screenshots per page,
 * about 200MB, downscaled by the browser. This resizes once, caches the result
 * on disk, and serves that instead. See lib/gallery/thumbs.ts for the sizes and
 * format, and why they are what they are.
 *
 * `?w=` picks one of three widths and is an ALLOW-LIST, never a free integer:
 * every distinct width is a file written into storage/gallery/thumbs and kept,
 * so an arbitrary one would make this a resize-on-demand endpoint any anonymous
 * visitor could loop over to fill the volume. parseThumbWidth folds anything
 * unrecognised back to the default rather than erroring — see its comment.
 *
 * `sharp` is deliberately NOT added to next.config.ts's serverExternalPackages.
 * @napi-rs/canvas is there because webpack cannot bundle its .node binary;
 * sharp is already imported by lib/gallery/process.ts, which runs in this same
 * server bundle on every submission today, and Next handles it natively. Adding
 * it would be a change to a build-critical config for a problem this app has
 * already demonstrated it does not have.
 *
 * Access is the media route's rule verbatim, not a looser one: this is a second
 * URL for the same bytes, and a thumbnail of an unpublished image is still that
 * image. 404 rather than 403 throughout, because a 403 confirms the item exists.
 */

function notFound(): NextResponse {
    return new NextResponse('Not found', { status: 404 })
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ObjectId.isValid(id)) return notFound()

    // Parsed before the database is touched: an unknown width is not an error
    // here, it is simply the default, so there is nothing to fail early on.
    const width = parseThumbWidth(new URL(request.url).searchParams.get('w'))

    const doc = await Db.galleryMedia.findOne({ _id: new ObjectId(id) })
    if (!doc) return notFound()

    if (!isPublic(doc.status)) {
        if (doc.status !== 'pending' && doc.status !== 'processing') return notFound()
        const me = await client.fetchMe().catch(() => null)
        const allowed = !!me && (me.id === doc.authorId || await hasPermission(me, 'gallery.review'))
        if (!allowed) return notFound()
    }

    /* A video's thumbnail is its poster — the still frame the transcode already
       wrote, or the one fetched from YouTube/Twitch when an embed was accepted.
       No frame is extracted here: that would put ffmpeg on the path of a grid
       render, to reproduce a JPEG sitting on disk a directory away. An image has
       no posterKey, so this resolves to its own bytes. */
    const usingPoster = !!doc.posterKey
    const sourceKey = doc.posterKey ?? doc.storageKey
    if (!sourceKey) return notFound()

    const source = resolveStorageKey(sourceKey)
    if (!source) return notFound()

    let sourceStat: ReturnType<typeof statSync>
    try {
        sourceStat = statSync(source)
    } catch { return notFound() }

    /* Weak, and over the SOURCE's size and mtime rather than the thumbnail's,
       matching the two sibling routes. Weak because size+mtime honestly
       validates "the same representation", not a byte-exact one — a
       regeneration at the same settings is not guaranteed to be bit-identical.
       Over the source because that is what actually changed when a re-process
       replaces the bytes; the cache file's own mtime only says when this server
       last did the resize.

       No `immutable`, for the reason app/api/gallery/media/[id]/route.ts spells
       out at length: this URL is addressed by media id, not by content hash, so
       its bytes can be replaced and can vanish on a delete. `immutable` there
       kept a deleted image rendering through a force-refresh because the browser
       never revalidated. A thumbnail keyed by media id has exactly that problem.

       The `t` and the RESOLVED width are in the tag so that a client holding a
       400px thumbnail cannot be told its 800px request is unchanged — the
       source has not changed, so nothing else in this tag would have, and the
       featured rail and the J5 grid ask this same URL for different sizes of
       the same photograph. */
    const etag = `W/"t${width}-${doc._id.toString()}-${sourceStat.size.toString(36)}-${Math.floor(sourceStat.mtimeMs).toString(36)}"`
    const cacheControl = isPublic(doc.status) ? 'public, max-age=3600' : 'private, no-store'

    if (request.headers.get('if-none-match') === etag) {
        return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cacheControl } })
    }

    const cache = thumbPath(doc._id.toString(), width)
    if (!cache) return notFound()

    /* A cached file older than its source is a thumbnail of bytes that no longer
       exist — a re-processed video's new poster, a replaced still. Compared
       rather than trusted, because the alternative is a stale tile that only a
       manual cache wipe would ever correct. */
    let bytes: Buffer | null = null
    try {
        if (statSync(cache).mtimeMs >= sourceStat.mtimeMs) bytes = readFileSync(cache)
    } catch { /* no cache entry yet, or it was cleared by hand — generate one */ }

    if (!bytes) {
        try {
            mkdirSync(THUMB_DIR, { recursive: true })

            /* Written under a unique temporary name and renamed into place.
               Two reviewers opening the same page request the same thumbnail at
               the same moment, and sharp writing straight to `cache` would let
               one request read a half-written file and render a torn image.
               rename() within one directory is atomic, so a reader sees either
               the old complete file or the new one. */
            const temp = `${cache}.${process.pid.toString(36)}${randomBytes(6).toString('hex')}.tmp`
            try {
                await sharp(source, { limitInputPixels: 300_000_000 })
                    // EXIF orientation before the resize, matching processStill:
                    // a rotated phone photo resized first comes out sideways.
                    .rotate()
                    // No height and withoutEnlargement: the tile crops with
                    // object-fit, so the aspect ratio is the source's business,
                    // and a poster or a small legacy screenshot must not be
                    // blown up to the requested width only to be shown at 178.
                    // withoutEnlargement matters more at 1600 than it ever did
                    // at 400: most posters are narrower than that already.
                    .resize({ width, withoutEnlargement: true })
                    .webp({ quality: THUMB_QUALITY })
                    .toFile(temp)
                renameSync(temp, cache)
            } catch (err) {
                try { unlinkSync(temp) } catch { /* never written, or already gone */ }
                throw err
            }

            bytes = readFileSync(cache)
        } catch (err) {
            /* Degrade to slow, never to blank. A grid of grey boxes is worse
               than the full-size originals this route replaced, so an unreadable
               source, an unwritable cache directory or a format sharp refuses
               all end at the original instead. Logged, because a permanently
               failing pipeline is silent otherwise — every tile still shows a
               picture and only the bandwidth gives it away.

               A redirect rather than a copy of the media route's streaming and
               content-type handling: that route already serves exactly these
               bytes, and a second implementation of it here would be a second
               place for its Range and MIME rules to drift. 307, so it is not
               cached — the next request should try to resize again. */
            console.error('[gallery/thumb] could not resize', sourceKey, err)
            const fallback = thumbFallbackUrl(doc._id.toString(), usingPoster)
            if (!fallback) return notFound()
            return NextResponse.redirect(new URL(fallback, request.url), 307)
        }
    }

    return new NextResponse(new Uint8Array(bytes), {
        status: 200,
        headers: {
            'Content-Type': 'image/webp',
            'Content-Length': String(bytes.byteLength),
            'Cache-Control': cacheControl,
            ETag: etag,
        },
    })
}
