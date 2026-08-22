import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import fs from 'fs'

import { MAX_COVER_BYTES } from '@/lib/military/milpac-cover'


/** GIF magic — "GIF87a" / "GIF89a". Covers are stored under a .png name
 *  whatever was uploaded, so the bytes are the only honest source. */
function isGif(buf: Buffer): boolean {
    return buf.subarray(0, 6).toString('latin1').startsWith('GIF8')
}

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

    const path = `../../storage/uploads/cover/${id}.png`
    if (!fs.existsSync(path)) return NextResponse.json('Not found', { status: 404 })

    const output = fs.readFileSync(path)
    const gif = isGif(output)

    if (gif && searchParams.get('still') && output.length <= MAX_COVER_BYTES) {
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
            // Sniffed, not assumed. This route claimed `image/png` for every
            // file it served, including the GIFs it demonstrably holds.
            'Content-Type': gif ? 'image/gif' : 'image/png',
            'Cache-Control': 'no-cache',
        },
    })
}


export async function POST(req: Request) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    fs.mkdirSync('../../storage/uploads/cover', { recursive: true })
    fs.writeFileSync(`../../storage/uploads/cover/${me.id}.png`, buffer)

    return NextResponse.json({ success: true })
}


export async function DELETE() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const path = `../../storage/uploads/cover/${me.id}.png`
    if (fs.existsSync(path)) fs.unlinkSync(path)

    return NextResponse.json({ success: true })
}
