import { NextResponse } from 'next/server'
import { TeamSpeak, QueryProtocol } from 'ts3-nodejs-library'

export async function GET() {
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

        const [allGroups, onlineList] = await Promise.all([
            ts.serverGroupList(),
            ts.clientList(),
        ])

        const dbClients: Awaited<ReturnType<typeof ts.clientDbList>> = []
        const pageSize = 200
        for (let offset = 0; ; offset += pageSize) {
            const page = await ts.clientDbList(offset, pageSize)
            dbClients.push(...page)
            if (page.length < pageSize) break
        }

        const onlineDbIds = new Set<string>()
        const onlineClids: Record<string, string> = {}
        for (const c of onlineList) {
            if (c.type === 0) {
                onlineDbIds.add(c.databaseId)
                onlineClids[c.databaseId] = c.clid
            }
        }

        const regularGroups = allGroups.filter(g => g.type === 1)
        const groupNameMap: Record<string, string> = Object.fromEntries(regularGroups.map(g => [g.sgid, g.name]))

        const membershipMap: Record<string, { id: number; name: string }[]> = {}
        await Promise.all(regularGroups.map(async g => {
            try {
                const members = await ts!.serverGroupClientList(g.sgid)
                for (const m of members) {
                    if (!membershipMap[m.cldbid]) membershipMap[m.cldbid] = []
                    membershipMap[m.cldbid].push({ id: Number(g.sgid), name: groupNameMap[g.sgid] })
                }
            } catch {
                // skip protected/default groups (TS error 2564)
            }
        }))

        const clients = dbClients
            .filter(c => c.clientUniqueIdentifier !== 'serveradmin' && Number(c.cldbid) > 1)
            .map(c => ({
                cldbid: Number(c.cldbid),
                clid: onlineClids[c.cldbid] ?? null,
                nickname: c.clientNickname,
                uid: c.clientUniqueIdentifier,
                online: onlineDbIds.has(c.cldbid),
                lastSeen: c.clientLastconnected || null,
                groups: (membershipMap[c.cldbid] ?? []).sort((a, b) => a.name.localeCompare(b.name)),
            }))
            .sort((a, b) => {
                if (a.online !== b.online) return a.online ? -1 : 1
                return a.nickname.localeCompare(b.nickname)
            })

        const roles = regularGroups
            .map(g => ({ id: Number(g.sgid), name: g.name }))
            .sort((a, b) => a.name.localeCompare(b.name))

        return NextResponse.json({ clients, roles })
    } catch (err) {
        console.error('[TeamSpeak] Failed to fetch clients:', err)
        return NextResponse.json({ error: 'Failed to connect to TeamSpeak server' }, { status: 500 })
    } finally {
        if (ts) await ts.quit()
    }
}
