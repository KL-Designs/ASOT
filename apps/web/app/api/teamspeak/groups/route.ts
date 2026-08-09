import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { getConnection, getGroupCache } from '@/lib/teamspeak/cache'

// GET /api/teamspeak/groups — returns cached group list, falls back to live fetch
export async function GET() {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatStructure)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const cached = getGroupCache()
    if (cached) return NextResponse.json({ groups: cached.groups, refreshedAt: cached.refreshedAt })

    // Cache not yet populated — live fetch
    try {
        const ts = await getConnection()
        const allGroups = await ts.serverGroupList()
        const groups = allGroups
            .filter(g => g.type === 1)
            .map(g => ({ id: Number(g.sgid), name: g.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        return NextResponse.json({ groups, refreshedAt: Date.now() })
    } catch (err) {
        console.error('[TeamSpeak] Failed to fetch groups:', err)
        return NextResponse.json({ error: 'Failed to connect to TeamSpeak server' }, { status: 500 })
    }
}
