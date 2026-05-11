import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { getConnection } from '@/lib/teamspeak/cache'

// POST /api/teamspeak/clients/[cldbid]/poke
// Body: { clid: string, message: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ cldbid: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await params
    const { clid, message } = await req.json()
    if (!clid) return NextResponse.json({ error: 'Missing clid' }, { status: 400 })
    if (!message?.trim()) return NextResponse.json({ error: 'Missing message' }, { status: 400 })

    try {
        const ts = await getConnection()
        await ts.execute('clientpoke', { clid, msg: message.trim() })
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[TeamSpeak] Failed to poke client:', err)
        return NextResponse.json({ error: 'Failed to poke client' }, { status: 500 })
    }
}
