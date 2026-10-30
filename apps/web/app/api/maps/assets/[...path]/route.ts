import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { ensurePreview } from '@/lib/maps-preview'

const MAPS_DIR = join(process.cwd(), '..', '..', 'storage', 'maps')

const CONTENT_TYPES: Record<string, string> = {
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    gz:   'application/gzip',
    json: 'application/json',
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params
    const filePath = resolve(join(MAPS_DIR, ...path))

    // Prevent path traversal
    if (!filePath.startsWith(MAPS_DIR)) {
        return new NextResponse('Forbidden', { status: 403 })
    }

    // A world's preview is built from its satellite tiles the first time it is
    // asked for, then served from disk like any other asset. Only for the one
    // well-known name directly inside a world's folder.
    if (!existsSync(filePath) && path.length === 2 && path[1] === 'preview.jpg') {
        await ensurePreview(dirname(filePath))
    }

    if (!existsSync(filePath)) {
        return new NextResponse('Not Found', { status: 404 })
    }

    try {
        const buffer = await readFile(filePath)
        const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
        const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        })
    } catch {
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
