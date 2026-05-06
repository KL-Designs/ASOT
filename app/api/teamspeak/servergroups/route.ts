import { NextResponse } from 'next/server'
import { TeamSpeak, QueryProtocol } from 'ts3-nodejs-library'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export async function GET() {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let ts: TeamSpeak | undefined

    try {
        ts = await TeamSpeak.connect({
            host: process.env.TS_HOST!,
            queryport: Number(process.env.TS_QUERY_PORT ?? 10022),
            protocol: QueryProtocol.SSH,
            username: 'serveradmin',
            password: process.env.TS_SERVERADMIN_PASSWORD!,
            serverport: Number(process.env.TS_SERVER_PORT ?? 9987),
        })

        const groups = await ts.serverGroupList()

        const roles = groups
            .filter(g => g.type === 1) // regular groups only, skip templates (0) and query groups (2)
            .map(g => ({
                id: g.sgid,
                name: g.name,
                iconId: g.iconid,
            }))
            .sort((a, b) => a.name.localeCompare(b.name))

        return NextResponse.json({ roles })
    } catch (err) {
        console.error('[TeamSpeak] Failed to fetch server groups:', err)
        return NextResponse.json({ error: 'Failed to connect to TeamSpeak server' }, { status: 500 })
    } finally {
        if (ts) await ts.quit()
    }
}
