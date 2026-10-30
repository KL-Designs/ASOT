import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron-auth'
import { syncSelectionCountdown } from '@/lib/recruitment/selection-countdown-sync'

/**
 * GET /api/cron/selection-countdown — every 5 minutes (server.mjs).
 * Keeps the Want to Join "next Selection" post current (row 212). Does
 * nothing while the feature is disabled or has no channel.
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const result = await syncSelectionCountdown()
    return NextResponse.json({ result })
}
