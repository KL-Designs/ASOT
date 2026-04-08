import { NextRequest, NextResponse } from 'next/server'
import { readStatus, createSnapshot } from '@/lib/snapshots'

/**
 * GET /api/cron/snapshots?secret=...
 *
 * Creates a snapshot and enforces the 6-snapshot retention limit.
 * Called automatically by the server.mjs scheduler every 2 days at 3am,
 * or externally via CRON_SECRET for manual triggers.
 */
export async function GET(request: NextRequest) {
    const secret = request.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.CRON_SECRET) {
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
