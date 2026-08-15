import { NextRequest, NextResponse } from 'next/server'
import { readStatus, readConfig, runAllBackups } from '@/lib/backups'
import { verifyCronSecret } from '@/lib/cron-auth'

/**
 * GET /api/cron/backups
 *
 * Runs both backup repos (DB, media) according to the configured schedule.
 * Called hourly by the server.mjs scheduler; skips if auto-backups are
 * disabled or an operation is already in progress. Can also be triggered
 * externally via Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const config = await readConfig()
    if (!config.autoEnabled) {
        return NextResponse.json({ skipped: true, reason: 'Auto-backups disabled' })
    }

    const status = await readStatus()
    if (status.state !== 'idle') {
        return NextResponse.json({ skipped: true, reason: `Operation already in progress: ${status.state}` })
    }

    // Fire and forget
    runAllBackups().catch(e => console.error('[backups] Cron error:', e.message))

    return NextResponse.json({ message: 'Backup started' })
}
