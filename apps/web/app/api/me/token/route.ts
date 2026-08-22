import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import client from '@/lib/discord'
import { DEFAULT_ACCENT, resolveMemberAccent } from '@/lib/military/accent'

export async function GET() {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    try {
        const me = await client.fetchMe(token)
        const name = me.guild?.displayName || me.globalName || me.username || 'Unknown'
        const color = resolveMemberAccent(me)
        const avatar = me.guild?.avatarURL || me.avatarURL || null
        return NextResponse.json({ token, name, color, avatar })
    } catch {
        return NextResponse.json({ token, name: 'Unknown', color: DEFAULT_ACCENT })
    }
}
