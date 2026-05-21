import { NextRequest, NextResponse } from 'next/server'
import { readStatus, createSnapshot } from '@/lib/snapshots'
import { verifyCronSecret } from '@/lib/cron-auth'

/**
 * GET /api/cron/snapshots
 *
 * Creates a snapshot and enforces the 6-snapshot retention limit.
 * Called automatically by the server.mjs scheduler every 2 days at 3am,
 * or externally via Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const status = await readStatus()
    if (status.state !== 'idle') {
        return NextResponse.json({ skipped: true, reason: `Operation already in progress: ${status.state}` })
    }

    // Fire and forget
    createSnapshot().catch(e => console.error('[snapshots] Cron error:', e.message))

    return NextResponse.json({ message: 'Snapshot started' })
}
