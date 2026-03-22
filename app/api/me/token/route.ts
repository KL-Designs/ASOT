import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import client from '@/lib/discord'

export async function GET() {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    try {
        const me = await client.fetchMe(token)
        const name = me.guild?.displayName || me.globalName || me.username || 'Unknown'
        const color = me.hexAccentColor || '#db001d'
        return NextResponse.json({ token, name, color })
    } catch {
        return NextResponse.json({ token, name: 'Unknown', color: '#db001d' })
    }
}
