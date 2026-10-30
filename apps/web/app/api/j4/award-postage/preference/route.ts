import { NextRequest, NextResponse } from 'next/server'
import { setPostagePreference } from '@/lib/military/award-postage-db'
import { postageGate } from '../gate'

/** POST /api/j4/award-postage/preference — `{ userId, preference }`, a manual correction. Logged. */
export async function POST(req: NextRequest) {
    const g = await postageGate()
    if (g.error) return g.error
    const body = await req.json().catch(() => ({})) as { userId?: string; preference?: string }
    if (typeof body.userId !== 'string' || !/^\d{5,25}$/.test(body.userId)) return NextResponse.json({ error: 'Invalid member.' }, { status: 400 })
    if (body.preference !== 'yes' && body.preference !== 'no' && body.preference !== 'unassigned') {
        return NextResponse.json({ error: 'Invalid preference.' }, { status: 400 })
    }
    return NextResponse.json(await setPostagePreference(body.userId, body.preference, g.actor))
}
