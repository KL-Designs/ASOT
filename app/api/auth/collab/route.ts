import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export async function GET(request: NextRequest) {
    const token = request.headers.get('x-collab-token')
    if (!token) return NextResponse.json({ authorized: false })
    try {
        const me = await client.fetchMe(token)
        if (!me) return NextResponse.json({ authorized: false })
        const authorized = client.hasRoles(me, PERMISSIONS.auth.collab)
        return NextResponse.json({ authorized })
    } catch {
        return NextResponse.json({ authorized: false })
    }
}
