import { NextRequest, NextResponse } from 'next/server'
import { TeamSpeak, QueryProtocol } from 'ts3-nodejs-library'

async function connect() {
    return TeamSpeak.connect({
        host: process.env.TS_HOST!,
        queryport: Number(process.env.TS_QUERY_PORT ?? 10022),
        protocol: QueryProtocol.SSH,
        username: 'serveradmin',
        password: process.env.TS_SERVERADMIN_PASSWORD!,
        serverport: Number(process.env.TS_SERVER_PORT ?? 9987),
    })
}

// POST /api/teamspeak/clients/[cldbid]/groups — add a server group
export async function POST(req: NextRequest, { params }: { params: Promise<{ cldbid: string }> }) {
    const { cldbid } = await params
    const { sgid } = await req.json()

    let ts: TeamSpeak | undefined
    try {
        ts = await connect()
        await ts.execute('servergroupaddclient', { sgid: String(sgid), cldbid })
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[TeamSpeak] Failed to add group:', err)
        return NextResponse.json({ error: 'Failed to add group' }, { status: 500 })
    } finally {
        if (ts) await ts.quit()
    }
}

// DELETE /api/teamspeak/clients/[cldbid]/groups?sgid=X — remove a server group
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ cldbid: string }> }) {
    const { cldbid } = await params
    const sgid = req.nextUrl.searchParams.get('sgid')

    if (!sgid) return NextResponse.json({ error: 'Missing sgid' }, { status: 400 })

    let ts: TeamSpeak | undefined
    try {
        ts = await connect()
        await ts.execute('servergroupdelclient', { sgid, cldbid })
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[TeamSpeak] Failed to remove group:', err)
        return NextResponse.json({ error: 'Failed to remove group' }, { status: 500 })
    } finally {
        if (ts) await ts.quit()
    }
}
