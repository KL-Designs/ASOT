import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { getConnection } from '@/lib/teamspeak/cache'

// POST /api/teamspeak/clients/[cldbid]/groups — add a server group
export async function POST(req: NextRequest, { params }: { params: Promise<{ cldbid: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { cldbid } = await params
    const { sgid } = await req.json()

    try {
        const ts = await getConnection()
        await ts.execute('servergroupaddclient', { sgid: String(sgid), cldbid })
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[TeamSpeak] Failed to add group:', err)
        return NextResponse.json({ error: 'Failed to add group' }, { status: 500 })
    }
}

// DELETE /api/teamspeak/clients/[cldbid]/groups?sgid=X — remove a server group
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ cldbid: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { cldbid } = await params
    const sgid = req.nextUrl.searchParams.get('sgid')

    if (!sgid) return NextResponse.json({ error: 'Missing sgid' }, { status: 400 })

    try {
        const ts = await getConnection()
        await ts.execute('servergroupdelclient', { sgid, cldbid })
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[TeamSpeak] Failed to remove group:', err)
        return NextResponse.json({ error: 'Failed to remove group' }, { status: 500 })
    }
}
