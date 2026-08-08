import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import Db from '@/lib/mongo'


const EXT_TO_MIME: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    gif: 'image/gif',
}


// ── GET /api/orbat/patch?category=...&section=... ────────────────────────────
// Public — serves the patch image for the given category+section.
// section param should be '' or omitted for category-level patches.

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl
    const category = searchParams.get('category')
    const sectionRaw = searchParams.get('section')

    if (!category) return NextResponse.json('Missing category', { status: 400 })

    const sectionTitle: string | null = sectionRaw === '' || sectionRaw == null ? null : sectionRaw

    let doc = await Db.orbatSectionMeta.findOne({ category, sectionTitle })
    // Fall back: if no exact match, find any patch for this category (handles legacy section-level uploads)
    if (!doc?.patch) doc = await Db.orbatSectionMeta.findOne({ category, patch: { $exists: true } })
    if (!doc?.patch) return NextResponse.json('Not found', { status: 404 })

    const filePath = path.join('../../storage/uploads/orbat', doc.patch)
    if (!fs.existsSync(filePath)) return NextResponse.json('Not found', { status: 404 })

    const ext = path.extname(doc.patch).slice(1).toLowerCase()
    const contentType = EXT_TO_MIME[ext] ?? 'image/png'

    const buffer = fs.readFileSync(filePath)
    return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
        },
    })
}
