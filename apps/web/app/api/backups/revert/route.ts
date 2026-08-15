import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { readStatus, revertToPoint, listBackups } from '@/lib/backups'

const ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/

// POST /api/backups/revert — revert to a merged backup point (J4 only)
// Body: { id: string } — an hour-bucket ISO string from GET /api/backups
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { id } = body as { id?: string }
    if (!id || !ID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
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
    revertToPoint(point).catch(e => console.error('[backups] Revert error:', e.message))

    return NextResponse.json({ message: 'Revert started' }, { status: 202 })
}
