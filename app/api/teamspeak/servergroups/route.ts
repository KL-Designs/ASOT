import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { getConnection } from '@/lib/teamspeak/cache'

export async function GET() {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
        const ts = await getConnection()
        const groups = await ts.serverGroupList()
        const roles = groups
            .filter(g => g.type === 1)
            .map(g => ({ id: g.sgid, name: g.name, iconId: g.iconid }))
            .sort((a, b) => a.name.localeCompare(b.name))
        return NextResponse.json({ roles })
    } catch (err) {
        console.error('[TeamSpeak] Failed to fetch server groups:', err)
        return NextResponse.json({ error: 'Failed to connect to TeamSpeak server' }, { status: 500 })
    }
}
