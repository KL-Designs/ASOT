import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

export async function GET(request: NextRequest) {

    const { searchParams } = new URL(request.url)

    const key = searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'Key Missing' }, { status: 401 })

    try {
        const me = await client.fetchMe()
        const access = await hasPermission(me, key)
        return NextResponse.json({ access }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}
