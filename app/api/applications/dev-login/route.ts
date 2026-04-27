import { NextResponse } from 'next/server'
import client from '@/lib/discord'

export async function GET() {
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Not available outside development mode.' }, { status: 403 })
    }

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'No active admin session — log in to the admin panel first.' }, { status: 401 })
    }

    const session = {
        id:         me._id,
        username:   me.username,
        globalName: me.globalName || me.guild?.nickname || me.username,
        avatar:     me.avatarURL || '',
    }

    const response = NextResponse.json({ ok: true, ...session })
    response.cookies.set('discord_join_session', JSON.stringify(session), {
        httpOnly: true,
        maxAge:   60 * 60,
        path:     '/',
        sameSite: 'lax',
    })
    return response
}
