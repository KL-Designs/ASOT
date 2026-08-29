import { NextResponse } from 'next/server'
import { sweepStranded } from '@/lib/gallery/queue'

/**
 * Re-queues anything a restart interrupted mid-transcode.
 *
 * A route rather than something server.mjs calls directly, because server.mjs
 * is plain JavaScript and the queue is TypeScript — and putting the queue in
 * two languages to avoid one fetch would be the worse trade. Called once, from
 * localhost, after Next reports ready.
 */
export async function POST(request: Request) {
    // Local only. Nothing outside this process has any business triggering it.
    const host = new URL(request.url).hostname
    if (host !== 'localhost' && host !== '127.0.0.1') return new NextResponse('Not found', { status: 404 })

    return NextResponse.json({ swept: await sweepStranded() })
}
