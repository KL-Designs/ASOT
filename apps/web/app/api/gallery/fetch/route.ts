import { NextRequest, NextResponse } from "next/server"
import fs from 'fs'
import path from 'path'

const CONTENT_BASE = path.resolve('./gallery/content')
const SAFE_SEGMENT = /^[a-zA-Z0-9 _\-().]+$/

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)

    const year      = searchParams.get('year')
    const operation = searchParams.get('operation')
    const stage     = searchParams.get('stage')
    const img       = searchParams.get('img')

    // Reject missing or unsafe path segments — blocks ../ traversal
    for (const part of [year, operation, stage, img]) {
        if (!part || !SAFE_SEGMENT.test(part)) return NextResponse.json('Bad request', { status: 400 })
    }

    const resolved = path.resolve(CONTENT_BASE, year!, operation!, stage!, img!)
    if (!resolved.startsWith(CONTENT_BASE + path.sep)) return NextResponse.json('Bad request', { status: 400 })

    if (!fs.existsSync(resolved)) return NextResponse.json('Media does not exist', { status: 404 })

    const ext = path.extname(resolved).slice(1).toLowerCase()
    const output = fs.readFileSync(resolved)

    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg'

    return new NextResponse(output as BodyInit, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable"
        }
    })
}