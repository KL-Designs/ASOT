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
        const userName = me.guild?.displayName || me.globalName || me.username || 'Unknown'
        const userAvatar = me.guild?.avatarURL || me.avatarURL || null
        return NextResponse.json({ authorized, userId: me._id, userName, userAvatar })
    } catch {
        return NextResponse.json({ authorized: false })
    }
}
