import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import { applyRsvp } from '@/lib/attendance/rsvp'

/**
 * `POST /api/operations/{id}/attendance/rsvp` — a member answers for themselves.
 *
 * The answer itself is `applyRsvp` (lib/attendance/rsvp.ts), shared with the
 * buttons on the Discord attendance post so both do exactly the same thing.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    await client.updateRoles()

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    }

    const { status, reservistSection, reservistRole }: { status: 'attending' | 'not_attending'; reservistSection?: string; reservistRole?: string } = await req.json()
    if (status !== 'attending' && status !== 'not_attending') {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const result = await applyRsvp(operationId, me.id, status, { reservistSection, reservistRole })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    return NextResponse.json({ ok: true })
}
