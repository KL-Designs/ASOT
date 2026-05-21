import { NextRequest, NextResponse } from "next/server"
import fs from 'fs'

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const ext = searchParams.get('ext') || 'jpg'

    if (!id || !UUID_RE.test(id)) return NextResponse.json('Bad request', { status: 400 })
    if (!ALLOWED_EXT.has(ext)) return NextResponse.json('Bad request', { status: 400 })

    const path = `./uploads/operations/${id}.${ext}`
    if (!fs.existsSync(path)) return NextResponse.json('Not found', { status: 404 })

    const output = fs.readFileSync(path)
    const contentTypeMap: Record<string, string> = { png: 'image/png', gif: 'image/gif', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' }
    const contentType = contentTypeMap[ext] ?? 'image/jpeg'

    return new NextResponse(output as BodyInit, {
        status: 200,
        headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' }
    })
}
