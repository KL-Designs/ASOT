import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { listBackups, openDownloadZipStream } from '@/lib/backups'

// Any ISO instant: a point's id is the run that produced it, and only falls
// back to an on-the-hour bucket for snapshots taken before run tagging. The id
// is re-resolved against listBackups() below regardless, so this is a shape
// check rather than the actual authorisation of what gets restored.
const ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

// GET /api/backups/[id]/download — restore a backup point and stream a zip of it (backups.manage)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!await hasPermission(me, 'backups.manage')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!ID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const points = await listBackups()
    const point = points.find(p => p.id === id)
    if (!point) return NextResponse.json({ error: 'Backup point not found' }, { status: 404 })

    // Everything that can fail with a real error response has to fail here,
    // before the stream exists — once bytes are on the wire the status is
    // already committed and a failure can only truncate the download.
    let body: ReadableStream<Uint8Array>
    try {
        body = await openDownloadZipStream(point)
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: `Failed to build download: ${msg}` }, { status: 500 })
    }

    // No Content-Length: the zip is produced as it is sent, so its size isn't
    // knowable up front. The cost is an indeterminate progress bar in the
    // browser; the gain is that a media download no longer needs three times
    // the snapshot's size in temp space before it starts. X-Accel-Buffering
    // stops an nginx in front of this from buffering the whole body to add a
    // Content-Length of its own, which would reinstate exactly the wait this
    // removes.
    const headers: Record<string, string> = {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="backup-${id.replace(/:/g, '-')}.zip"`,
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
    }

    // A download is a browser navigation, so the page that started it can't see
    // when it begins — and opening the stream takes a few seconds. Echoing the
    // caller's nonce straight back lets the tab clear its "Starting" indicator
    // the moment the response headers land, instead of guessing with a timer.
    // Strictly validated: this value is interpolated into a response header,
    // and anything outside [A-Za-z0-9] could inject one.
    const nonce = request.nextUrl.searchParams.get('dl')
    if (nonce && /^[A-Za-z0-9]{1,32}$/.test(nonce)) {
        headers['Set-Cookie'] = `backup-dl=${nonce}; Path=/; Max-Age=120; SameSite=Lax`
    }

    return new NextResponse(body, { headers })
}
