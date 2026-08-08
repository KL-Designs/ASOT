import { NextRequest, NextResponse } from 'next/server'
import { existsSync } from 'fs'
import { join } from 'path'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { readStatus, revertSnapshot, SNAPSHOTS_DIR } from '@/lib/snapshots'

const FILENAME_RE = /^snapshot-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.zip$/

// POST /api/snapshots/revert — revert to a stored snapshot (J4 only)
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
    const { filename } = body as { filename?: string }

    if (!filename || !FILENAME_RE.test(filename)) {
        return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }

    const filePath = join(SNAPSHOTS_DIR, filename)
    if (!existsSync(filePath)) {
        return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
    }

    const status = await readStatus()
    if (status.state !== 'idle') {
        return NextResponse.json({ error: `Operation already in progress: ${status.state}` }, { status: 409 })
    }

    // Fire and forget
    revertSnapshot(filePath).catch(e => console.error('[snapshots] Revert error:', e.message))

    return NextResponse.json({ message: 'Revert started' }, { status: 202 })
}
