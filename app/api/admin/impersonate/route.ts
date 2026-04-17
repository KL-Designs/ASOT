import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export async function POST(request: NextRequest) {
    const cookieStore = await cookies()
    const originalToken = cookieStore.get('token')?.value

    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!client.hasRoles(me, PERMISSIONS.admin.impersonate)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const target = await Db.users.findOne({ _id: userId })
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (!target.token) return NextResponse.json({ error: 'User has no token' }, { status: 400 })

    const response = NextResponse.json({ success: true })
    response.cookies.set('token', target.token, { httpOnly: true, maxAge: 60 * 60 * 24 * 30 })
    if (originalToken) {
        response.cookies.set('original_token', originalToken, { httpOnly: true, maxAge: 60 * 60 * 24 * 30 })
        response.cookies.set('is_impersonating', '1', { httpOnly: false, maxAge: 60 * 60 * 24 * 30 })
    }
    return response
}
