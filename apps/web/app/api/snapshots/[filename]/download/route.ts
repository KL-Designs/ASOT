import { NextRequest, NextResponse } from 'next/server'
import { existsSync, statSync, createReadStream } from 'fs'
import { join } from 'path'
import { Readable } from 'stream'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { SNAPSHOTS_DIR } from '@/lib/snapshots'

const FILENAME_RE = /^snapshot-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.zip$/

// GET /api/snapshots/[filename]/download — stream a snapshot ZIP to browser (J4 only)
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { filename } = await params
    if (!FILENAME_RE.test(filename)) {
        return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }

    const filePath = join(SNAPSHOTS_DIR, filename)
    if (!existsSync(filePath)) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { size } = statSync(filePath)
    const nodeStream = createReadStream(filePath)
    const webStream = Readable.toWeb(nodeStream) as ReadableStream

    return new NextResponse(webStream, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': String(size),
        },
    })
}
