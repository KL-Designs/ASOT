import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const ext = searchParams.get('ext') || 'jpg'

    const path = `./uploads/documents/${id}.${ext}`
    if (!fs.existsSync(path)) return NextResponse.json('Not found', { status: 404 })

    const output = fs.readFileSync(path)
    const contentTypeMap: Record<string, string> = { png: 'image/png', gif: 'image/gif', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' }
    const contentType = contentTypeMap[ext] ?? 'image/jpeg'

    return new NextResponse(output as BodyInit, {
        status: 200,
        headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
    })
}
