import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import { getOrbatEntryByUserId } from '@/lib/orbat'



/* Per-member and cookie-selected, same as /api/me — not storable. */
export const dynamic = 'force-dynamic'

const PRIVATE = { 'Cache-Control': 'no-store, private' }


export async function GET(request: NextRequest) {
    try {
        const me = await client.fetchMe()
        const entry = await getOrbatEntryByUserId(me.id)
        return NextResponse.json(entry ?? null, { status: 200, headers: PRIVATE })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401, headers: PRIVATE })
    }
}
