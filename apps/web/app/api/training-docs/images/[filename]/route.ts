import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

type Params = { params: Promise<{ filename: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasPermission(me, 'pages.member'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { filename } = await params

    // Prevent path traversal
    const safe = path.basename(filename)
    const filePath = path.join('uploads', 'training-docs', safe)

    if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ext = path.extname(safe).toLowerCase().replace('.', '')
    const mimeMap: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp',
    }
    const contentType = mimeMap[ext] ?? 'application/octet-stream'

    const buffer = fs.readFileSync(filePath)
    return new NextResponse(buffer, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    })
}
