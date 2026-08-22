import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import fs from 'fs'

import { MAX_COVER_BYTES } from '@/lib/military/milpac-cover'
import { COVER_PRESET, MAX_UPLOAD_BYTES, normaliseImage, sniffImageMime } from '@/lib/uploads/image'

const COVER_DIR = '../../storage/uploads/cover'

/**
 * Every cover is written as `{id}.png` whatever it actually is — a convention
 * `coverPath`/`coverIds`/`readCoverImage` all depend on, so the name stays and
 * the bytes are sniffed instead. After `normaliseImage` the content is JPEG for
 * a still and GIF for an animation; it is never actually a PNG.
 */
const coverFile = (id: string) => `${COVER_DIR}/${id}.png`

/**
 * A cover.
 *
 * `?still=1` returns the first frame of an animated cover as a real PNG. The
 * roster asks for that: 163 cards each repainting a full-size GIF forever is
 * the difference between a page that scrolls and one that doesn't, and
 * next/image is no help because it passes animated images through untouched.
 * The card holds the animation back until hover, and this is where it gets
 * something to show in the meantime. Non-animated covers ignore the flag and
 * take the normal path — no decode, no re-encode.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    // A Discord snowflake and nothing else. `id` is interpolated straight into
    // a filesystem path below, so an unchecked value here is a path traversal:
    // `?id=../../../../etc/passwd` resolved happily before this guard.
    if (!id || !/^\d{5,25}$/.test(id)) return NextResponse.json('Not found', { status: 404 })

    const path = coverFile(id)
    if (!fs.existsSync(path)) return NextResponse.json('Not found', { status: 404 })

    const output = fs.readFileSync(path)

    // Sniffed, not assumed. This route claimed `image/png` for every file it
    // served, including the GIFs and (since normaliseImage) JPEGs it holds.
    const mime = sniffImageMime(output) ?? 'application/octet-stream'

    if (mime === 'image/gif' && searchParams.get('still') && output.length <= MAX_COVER_BYTES) {
        try {
            // Imported here rather than at module scope so the ordinary path —
            // which is the overwhelming majority of requests — never pulls a
            // native binary in behind it.
            const { createCanvas, loadImage } = await import('@napi-rs/canvas')
            const image = await loadImage(output)

            const canvas = createCanvas(image.width, image.height)
            canvas.getContext('2d').drawImage(image, 0, 0)

            return new NextResponse(canvas.toBuffer('image/png') as BodyInit, {
                status: 200,
                headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
            })
        } catch {
            // A cover that will not decode falls through to the raw bytes
            // rather than 500ing the card it belongs to.
        }
    }

    return new NextResponse(output as BodyInit, {
        status: 200,
        headers: {
            'Content-Type': mime,
            'Cache-Control': 'no-cache',
        },
    })
}


/**
 * Replace the caller's own cover.
 *
 * This used to write whatever bytes arrived, unexamined — no type check, no
 * size cap, no resize. A member uploaded a 16320x7612 image at 13.2MB and the
 * /milpacs roster became unusable for everyone: 124 megapixels is around half a
 * gigabyte of bitmap, decoded in every visitor's browser. `normaliseImage`
 * bounds and re-encodes it; see that module for why the limit is on pixels and
 * not only on bytes, and why the decoder has to tolerate a corrupt JPEG.
 */
export async function POST(req: Request) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    // Checked against the multipart part's own size first, so an oversized
    // upload is refused without materialising it into a Buffer to measure.
    // 413 rather than 400: this one is about size, and the client says so.
    if (file.size > MAX_UPLOAD_BYTES)
        return NextResponse.json(
            { error: `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The largest cover photo you can upload is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.` },
            { status: 413 },
        )

    const buffer = Buffer.from(await file.arrayBuffer())

    const result = await normaliseImage(buffer, COVER_PRESET)
    // `result.error` is written to be read by the member who just picked the
    // file, so it is returned verbatim rather than replaced with a generic one.
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    fs.mkdirSync(COVER_DIR, { recursive: true })
    fs.writeFileSync(coverFile(me.id), result.image.buffer)

    return NextResponse.json({
        success: true,
        width: result.image.width,
        height: result.image.height,
        bytes: result.image.buffer.length,
        animated: result.image.animated,
    })
}


export async function DELETE() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const path = coverFile(me.id)
    if (fs.existsSync(path)) fs.unlinkSync(path)

    return NextResponse.json({ success: true })
}
