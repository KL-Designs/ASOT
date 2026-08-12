import { NextRequest, NextResponse } from "next/server"
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'



export async function GET(request: NextRequest) {

    try {
        const me = await client.fetchMe()
        const isStaff = client.hasRoles(me, PERMISSIONS.pages.admin)
        const isMember = await hasDashboardAccess(me)
        return NextResponse.json({ ...me, isStaff, isMember }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
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