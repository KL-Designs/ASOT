import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { getConnection } from '@/lib/teamspeak/cache'

// POST /api/teamspeak/clients/[cldbid]/ban
// Body: { uid: string, duration?: number, reason?: string }
// duration 0 (default) = permanent ban
export async function POST(req: NextRequest, { params }: { params: Promise<{ cldbid: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await params
    const { uid, duration = 0, reason } = await req.json()
    if (!uid) return NextResponse.json({ error: 'Missing uid' }, { status: 400 })

    try {
        const ts = await getConnection()
        await ts.execute('banadd', {
            uid,
            time: duration,
            banreason: reason?.trim() || 'Banned by admin',
        })
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[TeamSpeak] Failed to ban client:', err)
        return NextResponse.json({ error: 'Failed to ban client' }, { status: 500 })
    }
}
