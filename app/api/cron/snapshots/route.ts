import { NextRequest, NextResponse } from 'next/server'
import { readStatus, readConfig, listSnapshots, createSnapshot } from '@/lib/snapshots'
import { verifyCronSecret } from '@/lib/cron-auth'

/**
 * GET /api/cron/snapshots
 *
 * Creates a snapshot according to the configured schedule.
 * Called by the server.mjs scheduler daily at 3am; this route decides
 * whether to actually run based on autoEnabled and intervalDays config.
 * Can also be triggered externally via Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const config = await readConfig()

    if (!config.autoEnabled) {
        return NextResponse.json({ skipped: true, reason: 'Auto-snapshots disabled' })
    }

    const snapshots = listSnapshots()
    if (snapshots.length > 0) {
        const latest = snapshots[snapshots.length - 1]
        const msSinceLast = Date.now() - new Date(latest.createdAt).getTime()
        const intervalMs  = config.intervalDays * 24 * 60 * 60 * 1000
        if (msSinceLast < intervalMs) {
            return NextResponse.json({ skipped: true, reason: `Last snapshot is ${Math.round(msSinceLast / 3600000)}h old — interval is ${config.intervalDays}d` })
        }
    }

    const status = await readStatus()
    if (status.state !== 'idle') {
        return NextResponse.json({ skipped: true, reason: `Operation already in progress: ${status.state}` })
    }

    // Fire and forget
    createSnapshot().catch(e => console.error('[snapshots] Cron error:', e.message))

    return NextResponse.json({ message: 'Snapshot started' })
}
