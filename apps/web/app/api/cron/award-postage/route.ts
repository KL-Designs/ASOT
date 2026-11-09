import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron-auth'
import { rollOver, sendDuePreferenceDMs } from '@/lib/military/award-postage-db'

/**
 * GET /api/cron/award-postage — every 5 minutes (server.mjs). Row 384:
 * carries unsent awards into the new month, and sends the preference DMs
 * that are due (the first ask, then every two weeks until answered).
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const carried = await rollOver()
    const dms = await sendDuePreferenceDMs()
    return NextResponse.json({ carried, ...dms })
}
