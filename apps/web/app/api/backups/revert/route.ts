import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { readStatus, revertToPoint, listBackups, parseBackupParts } from '@/lib/backups'
import { logAction } from '@/lib/logAction'

// Any ISO instant — see the download route for why this loosened from an
// on-the-hour bucket. The id is resolved against listBackups() server-side, so
// this only rejects malformed input.
const ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

// POST /api/backups/revert — revert to a merged backup point (backups.restore)
// Body: { id: string } — an hour-bucket ISO string from GET /api/backups
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!await hasPermission(me, 'backups.restore')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { id, parts: rawParts } = body as { id?: string; parts?: string[] }
    if (!id || !ID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    // Absent means every part, which is what this endpoint has always done.
    // Anything malformed is refused rather than widened — this call overwrites
    // live data, so a typo must not turn a gallery-only restore into all three.
    const parts = parseBackupParts(rawParts)
    if (!parts) {
        return NextResponse.json({ error: 'Invalid parts (expected any of: database, gallery, uploads)' }, { status: 400 })
    }

    const status = await readStatus()
    if (status.state !== 'idle') {
        return NextResponse.json({ error: `Operation already in progress: ${status.state}` }, { status: 409 })
    }

    // Resolve the id back to a real BackupPoint server-side — never trust a
    // client-supplied snapshot id directly.
    const points = await listBackups()
    const point = points.find(p => p.id === id)
    if (!point) return NextResponse.json({ error: 'Backup point not found' }, { status: 404 })

    // Fire and forget
    revertToPoint(point, parts).catch(e => console.error('[backups] Revert error:', e.message))

    await logAction({
        action: 'backup.revert',
        category: 'system',
        performedBy: me.id,
        performedByName: me.name ?? me.id,
        entityType: 'backup',
        entityId: point.id,
        // Which parts were overwritten is the first thing anyone auditing a
        // restore needs to know.
        details: { parts },
    })

    return NextResponse.json({ message: 'Revert started' }, { status: 202 })
}
