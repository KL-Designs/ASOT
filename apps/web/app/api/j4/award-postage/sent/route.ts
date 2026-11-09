import { NextRequest, NextResponse } from 'next/server'
import { markSent } from '@/lib/military/award-postage-db'
import { postageGate } from '../gate'

/**
 * POST /api/j4/award-postage/sent — `{ ids }`: mark these items Sent. One
 * item, one member's group, or Mark All Sent for a month all come through
 * here. Only Ready items change; the count says how many did. Logged.
 */
export async function POST(req: NextRequest) {
    const g = await postageGate()
    if (g.error) return g.error
    const body = await req.json().catch(() => ({})) as { ids?: unknown }
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 1000) : []
    if (!ids.length) return NextResponse.json({ error: 'Nothing to mark.' }, { status: 400 })
    return NextResponse.json({ marked: await markSent(ids, g.actor) })
}
