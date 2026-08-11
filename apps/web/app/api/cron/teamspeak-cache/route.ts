import { NextRequest, NextResponse } from 'next/server'
import { refreshOfflineCache, isOfflineRefreshing } from '@/lib/teamspeak/cache'
import { verifyCronSecret } from '@/lib/cron-auth'
import { trackJob } from '@/lib/diagnostics.mjs'

/**
 * GET /api/cron/teamspeak-cache
 * Triggers a background refresh of the TeamSpeak offline client cache.
 * Called every 15 minutes by server.mjs.
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (isOfflineRefreshing()) {
        return NextResponse.json({ skipped: true, reason: 'Already refreshing' })
    }

    trackJob('cron:teamspeak-cache-refresh', () => refreshOfflineCache())
        .catch(e => console.error('[cron/teamspeak-cache] Error:', e.message))
    return NextResponse.json({ message: 'Cache refresh started' })
}
