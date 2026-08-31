import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { listBackups, openDownloadZipStream, parseBackupParts } from '@/lib/backups'
import Db from '@/lib/mongo'
import { EXPORT_FOLDER_PIPELINE, buildFolderNumbering, foldersFromAggregate } from '@/lib/gallery/export-numbering'
import { logAction } from '@/lib/logAction'

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

    // ?parts=database,gallery — absent means everything, malformed is rejected
    // rather than widened (see parseBackupParts).
    const parts = parseBackupParts(request.nextUrl.searchParams.get('parts'))
    if (!parts) {
        return NextResponse.json({ error: 'Invalid parts (expected any of: database, gallery, uploads)' }, { status: 400 })
    }

    const points = await listBackups()
    const point = points.find(p => p.id === id)
    if (!point) return NextResponse.json({ error: 'Backup point not found' }, { status: 404 })

    // Logged before streaming: a download takes a full copy of the database
    // and media off the server, which is the single most sensitive thing this
    // feature can do, and it must be recorded whether or not the transfer then
    // completes.
    await logAction({
        action: 'backup.download',
        category: 'system',
        performedBy: me.id,
        performedByName: me.name ?? me.id,
        entityType: 'backup',
        entityId: point.id,
        details: { parts },
    })

    /* The order prefix the folders on disk no longer carry, ranked by the
       operation dates in gallery_media — a zip is browsed in a file manager,
       with no database and no website to sort anything, which is the only
       reason the numbers ever existed. See lib/gallery/export-numbering.ts for
       the rules that keep the re-import lossless.

       Built here rather than inside lib/backups.ts because that module has to
       stay importable without a Mongo connection. A failure degrades to an
       UNNUMBERED zip rather than a failed download: this is the
       disaster-recovery path, and a readability aid must never be the reason
       it cannot run. An old snapshot whose folders no longer match today's
       database simply misses the lookup and keeps its own names. */
    let galleryNumbering: ReadonlyMap<string, string> = new Map()
    if (parts.includes('gallery')) {
        try {
            const raw = await Db.galleryMedia.aggregate(EXPORT_FOLDER_PIPELINE).toArray()
            galleryNumbering = buildFolderNumbering(foldersFromAggregate(raw))
        } catch (e: unknown) {
            console.error('[backups] gallery folder numbering failed, exporting unnumbered:', e)
        }
    }

    // Everything that can fail with a real error response has to fail here,
    // before the stream exists — once bytes are on the wire the status is
    // already committed and a failure can only truncate the download.
    let body: ReadableStream<Uint8Array>
    try {
        body = await openDownloadZipStream(point, parts, { galleryNumbering })
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
