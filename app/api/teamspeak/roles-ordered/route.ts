import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { getConnection } from '@/lib/teamspeak/cache'

// GET /api/teamspeak/roles-ordered — all regular server groups in TS display order
export async function GET() {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
        const ts = await getConnection()
        const allGroups = await ts.serverGroupList()
        const groups = allGroups
            .filter(g => g.type === 1)
            .map(g => ({ id: Number(g.sgid), name: g.name, sortid: Number(g.sortid ?? 0) }))
            // TS displays groups with sortid > 0 first (ascending), then sortid === 0 at the end
            .sort((a, b) => {
                if (a.sortid === 0 && b.sortid === 0) return a.name.localeCompare(b.name)
                if (a.sortid === 0) return 1
                if (b.sortid === 0) return -1
                return a.sortid - b.sortid
            })
        return NextResponse.json({ groups })
    } catch (err) {
        console.error('[TeamSpeak] Failed to fetch ordered groups:', err)
        return NextResponse.json({ error: 'Failed to connect to TeamSpeak server' }, { status: 500 })
    }
}
