import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import { reviewScope } from '@/lib/gallery/review-scope'

/**
 * `GET /api/gallery/submissions/scope` — what the viewer may review.
 *
 * `{ all: true }` for J5 (`gallery.review`); otherwise the callsigns the
 * viewer reviews as section staff, which is empty for nearly everybody. The
 * gallery page reads it to decide whether to offer section staff their review
 * queue. It grants nothing — every review route resolves the scope again.
 */
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ all: false, callsigns: [] })
    return NextResponse.json(await reviewScope(me))
}
