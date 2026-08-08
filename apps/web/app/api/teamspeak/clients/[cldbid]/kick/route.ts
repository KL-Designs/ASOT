import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { getConnection } from '@/lib/teamspeak/cache'

// POST /api/teamspeak/clients/[cldbid]/kick
// Body: { clid: string, reason?: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ cldbid: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await params
    const { clid, reason } = await req.json()
    if (!clid) return NextResponse.json({ error: 'Missing clid' }, { status: 400 })

    try {
        const ts = await getConnection()
        // reasonid 5 = kick from server
        await ts.execute('clientkick', { clid, reasonid: 5, reasonmsg: reason || 'Kicked by admin' })
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[TeamSpeak] Failed to kick client:', err)
        return NextResponse.json({ error: 'Failed to kick client' }, { status: 500 })
    }
}
