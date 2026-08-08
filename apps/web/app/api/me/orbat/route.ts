import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import { getOrbatEntryByUserId } from '@/lib/orbat'



export async function GET(request: NextRequest) {
    try {
        const me = await client.fetchMe()
        const entry = await getOrbatEntryByUserId(me.id)
        return NextResponse.json(entry ?? null, { status: 200 })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}
