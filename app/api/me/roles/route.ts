import { NextRequest, NextResponse } from "next/server"
import Db from '@/lib/mongo'
import client from '@/lib/discord'



export async function GET(request: NextRequest) {

    const { searchParams } = new URL(request.url)

    const roles = searchParams.get('has')?.split(',')
    if (!roles) return NextResponse.json({ error: 'Roles Missing' }, { status: 401 })

    try {
        const me = await client.fetchMe()
        const hasAccess = await client.hasRoles(me, roles)
        return NextResponse.json({ access: hasAccess }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}