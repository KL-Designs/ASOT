import { NextRequest, NextResponse } from 'next/server'
import { sweepStranded } from '@/lib/gallery/queue'
import { verifyCronSecret } from '@/lib/cron-auth'

/**
 * Re-queues anything a restart interrupted mid-transcode.
 *
 * A route rather than something server.mjs calls directly, because server.mjs
 * is plain JavaScript and the queue is TypeScript — and putting the queue in
 * two languages to avoid one fetch would be the worse trade. Called once, from
 * server.mjs after Next reports ready, gated behind CRON_SECRET — the same
 * gate the scheduled jobs under app/api/cron/ use, because this is the same
 * kind of internal trigger.
 */
export async function POST(request: NextRequest) {
    if (!verifyCronSecret(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    return NextResponse.json({ swept: await sweepStranded() })
}
