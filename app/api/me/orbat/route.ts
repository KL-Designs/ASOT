import { NextRequest, NextResponse } from "next/server"
import client from '@/lib/discord'
import { fetchORBAT, findOrbatEntry } from '@/lib/orbat'



export async function GET(request: NextRequest) {
    try {
        const me = await client.fetchMe()
        const [orbat, allMembers] = await Promise.all([
            fetchORBAT(),
            client.fetchAllMembers(),
        ])
        const lookup = client.buildOrbatLookup(allMembers)
        const entry = findOrbatEntry(orbat, lookup, me.id)
        return NextResponse.json(entry ?? null, { status: 200 })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}
