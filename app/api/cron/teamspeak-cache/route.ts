import { NextRequest, NextResponse } from 'next/server'
import { refreshOfflineCache, isOfflineRefreshing } from '@/lib/teamspeak/cache'

/**
 * GET /api/cron/teamspeak-cache?secret=...
 * Triggers a background refresh of the TeamSpeak offline client cache.
 * Called every 15 minutes by server.mjs.
 */
export async function GET(request: NextRequest) {
    const secret = request.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (isOfflineRefreshing()) {
        return NextResponse.json({ skipped: true, reason: 'Already refreshing' })
    }

    refreshOfflineCache().catch(e => console.error('[cron/teamspeak-cache] Error:', e.message))
    return NextResponse.json({ message: 'Cache refresh started' })
}
