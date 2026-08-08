import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { getConnection, getOfflineCache, getOnlineCache, isOfflineRefreshing, isOnlineRefreshing, refreshOfflineCache, refreshOnlineCache } from '@/lib/teamspeak/cache'

/**
 * GET /api/teamspeak/clients
 *
 * ?type=online  — fast: only currently connected clients (~1-2s)
 * ?type=offline — returns cached offline clients + cache metadata
 * ?type=all     — (default) full fetch including paginated DB clients (~60s)
 */
export async function GET(req: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const type = req.nextUrl.searchParams.get('type') ?? 'all'

    if (type === 'offline') {
        const cache = getOfflineCache()
        if (!cache) {
            return NextResponse.json({ clients: [], roles: [], refreshedAt: null, refreshing: isOfflineRefreshing() })
        }
        return NextResponse.json({ clients: cache.clients, roles: [], refreshedAt: cache.refreshedAt, refreshing: isOfflineRefreshing() })
    }

    if (type === 'online') {
        const cache = getOnlineCache()
        if (!cache) {
            // First ever load — wait for fresh data so the tab isn't blank
            await refreshOnlineCache().catch(err => console.error('[TeamSpeak] Online cache error:', err))
            const fresh = getOnlineCache()
            return NextResponse.json({ clients: fresh?.clients ?? [], roles: fresh?.roles ?? [], refreshedAt: fresh?.refreshedAt ?? null, refreshing: false })
        }
        // Cache exists — serve it immediately and refresh in background
        if (!isOnlineRefreshing()) {
            refreshOnlineCache().catch(err => console.error('[TeamSpeak] Online cache refresh error:', err))
        }
        return NextResponse.json({ clients: cache.clients, roles: cache.roles, refreshedAt: cache.refreshedAt, refreshing: isOnlineRefreshing() })
    }

    try {
        const ts = await getConnection()

        // type=all — original full behaviour (backward compat)
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
                const members = await ts.serverGroupClientList(g.sgid)
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
    }
}

// POST /api/teamspeak/clients/refresh-cache — trigger background refresh
export async function POST() {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (isOfflineRefreshing()) {
        return NextResponse.json({ queued: false, message: 'Already refreshing' })
    }

    refreshOfflineCache().catch(err => console.error('[TeamSpeak] Cache refresh error:', err))
    return NextResponse.json({ queued: true })
}
