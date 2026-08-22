import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'


const FEATURED_BASE = path.resolve('../../storage/gallery/featured')
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

async function checkAuth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return false
    return await hasPermission(me, 'gallery.manage')
}


/** POST — upload images to the featured directory (multipart/form-data) */
export async function POST(request: NextRequest) {
    if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    if (!files.length) return NextResponse.json({ error: 'No files provided' }, { status: 400 })

    if (!fs.existsSync(FEATURED_BASE)) fs.mkdirSync(FEATURED_BASE, { recursive: true })

    const saved: string[] = []
    for (const file of files) {
        if (!ALLOWED_MIME.has(file.type)) continue
        const safeName = path.basename(file.name).replace(/[^\w.\-() ]/g, '_')
        if (!safeName) continue
        const dest = path.join(FEATURED_BASE, safeName)
        if (!dest.startsWith(FEATURED_BASE + path.sep) && dest !== FEATURED_BASE) continue
        // Stored exactly as uploaded, deliberately. Every other image upload on the
        // site is resized and re-encoded by `lib/uploads/image.ts`; the gallery is
        // the one place whose entire purpose is the picture itself, so it keeps the
        // full-resolution original. See GALLERY_IS_EXEMPT in lib/uploads/image-limits.
        fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()))
        saved.push(safeName)
    }

    return NextResponse.json({ success: true, saved })
}


/** DELETE — remove specific images from the featured directory */
export async function DELETE(request: NextRequest) {
    if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { images } = await request.json() as { images: string[] }
    if (!images?.length) return NextResponse.json({ error: 'No images specified' }, { status: 400 })

    for (const img of images) {
        const safeName = path.basename(img)
        const filePath = path.join(FEATURED_BASE, safeName)
        if (!filePath.startsWith(FEATURED_BASE + path.sep)) continue
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }

    return NextResponse.json({ success: true })
}
