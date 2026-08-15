import { NextRequest, NextResponse } from 'next/server'
import { statSync, createReadStream } from 'fs'
import { unlink } from 'fs/promises'
import { Readable } from 'stream'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { listBackups, buildDownloadZip } from '@/lib/backups'

const ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/

// GET /api/backups/[id]/download — restore a backup point to a temp zip and stream it (J4 only)
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params
    if (!ID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const points = await listBackups()
    const point = points.find(p => p.id === id)
    if (!point) return NextResponse.json({ error: 'Backup point not found' }, { status: 404 })

    let zipPath: string
    try {
        zipPath = await buildDownloadZip(point)
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: `Failed to build download: ${msg}` }, { status: 500 })
    }

    const { size } = statSync(zipPath)
    const nodeStream = createReadStream(zipPath)
    // Delete the temp zip once fully streamed (success or client abort) — it
    // was only ever needed for this one response.
    nodeStream.on('close', () => { unlink(zipPath).catch(() => {}) })
    const webStream = Readable.toWeb(nodeStream) as ReadableStream

    return new NextResponse(webStream, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="backup-${id.replace(/:/g, '-')}.zip"`,
            'Content-Length': String(size),
        },
    })
}
