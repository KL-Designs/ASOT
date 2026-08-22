import { NextRequest, NextResponse } from "next/server"
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { BIO_PRESET, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, normaliseImage } from '@/lib/uploads/image'

import fs from 'fs'


export async function GET(request: NextRequest) {

    const { searchParams } = new URL(request.url)

    const id = searchParams.get('id')

    // A Discord snowflake and nothing else: `id` is interpolated straight into a
    // filesystem path, so without this `?id=../../../../etc/passwd` resolves.
    if (!id || !/^\d{5,25}$/.test(id)) return NextResponse.json('Media does not exist', { status: 404 })

    if (!fs.existsSync(`../../storage/uploads/bio/${id}.jpg`)) return NextResponse.json('Media does not exist', { status: 404 })
    const path = `../../storage/uploads/bio/${id}.jpg`
    const ext = path.split('.').pop()?.toString().toLowerCase()
    const output = fs.readFileSync(path)

    let contentType: string
    switch (ext) {
        case 'jpg':
        case 'jpeg': contentType = 'image/jpeg'; break
        case 'png': contentType = 'image/png'; break
        default: contentType = 'image/jpeg';
    }

    return new NextResponse(output as BodyInit, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable"
        }
    })
}


export async function POST(req: Request) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!(await hasPermission(me, 'uploads.bio'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) return NextResponse.json({ error: 'No File provided' }, { status: 401 })

    if (file.size > MAX_UPLOAD_BYTES)
        return NextResponse.json(
            { error: `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The largest bio photo you can upload is ${MAX_UPLOAD_MB}MB.` },
            { status: 413 },
        )

    const buffer = Buffer.from(await file.arrayBuffer())

    // Bounded and re-encoded like every other upload but the gallery. This
    // route previously wrote whatever bytes arrived, which is how a 13MB
    // 124-megapixel cover ended up live on the sister route and made /milpacs
    // unusable. BIO_PRESET flattens animation deliberately: the file is written
    // as `{id}.jpg` and served as `image/jpeg` unconditionally just below.
    const result = await normaliseImage(buffer, BIO_PRESET)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    fs.writeFileSync(`../../storage/uploads/bio/${me.id}.jpg`, result.image.buffer)

    return NextResponse.json({ success: true, width: result.image.width, height: result.image.height, bytes: result.image.buffer.length })
}