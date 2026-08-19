import { NextRequest, NextResponse } from "next/server"
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'


/*
   Never cached, and never rendered ahead of time.

   This is one member's own record, selected by their `token` cookie, and it was
   going out with no cache headers at all — which leaves the browser free to
   reuse it on its own heuristics. That is how a rank or callsign updated in
   Discord could stay missing from the navbar until something else forced a
   fresh request, and it is a privacy problem well before it is a staleness one:
   a response keyed on a cookie must not be storable.
*/
export const dynamic = 'force-dynamic'

const PRIVATE = { 'Cache-Control': 'no-store, private' }


export async function GET(request: NextRequest) {

    try {
        const me = await client.fetchMe()
        const isStaff = client.hasRoles(me, PERMISSIONS.pages.admin)
        const isMember = await hasDashboardAccess(me)
        return NextResponse.json({ ...me, isStaff, isMember }, { status: 200, headers: PRIVATE })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401, headers: PRIVATE })
    }
}


export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()

    if ('timezone' in body) {
        if (typeof body.timezone !== 'string' || !Intl.supportedValuesOf('timeZone').includes(body.timezone)) {
            return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
        }
        await Db.users.updateOne({ _id: me._id }, { $set: { timezone: body.timezone } }, { upsert: true })
        return NextResponse.json({ success: true }, { status: 200 })
    }

    const update: Record<string, any> = {}
    for (const [key, value] of Object.entries(body)) {
        update[`bio.${key}`] = value
    }

    await Db.users.updateOne({ _id: me._id }, { $set: update }, { upsert: true })

    return NextResponse.json({ success: true }, { status: 200 })
}