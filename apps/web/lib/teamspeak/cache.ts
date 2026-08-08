import { TeamSpeak, QueryProtocol } from 'ts3-nodejs-library'

export interface TsClientCached {
    cldbid: number
    nickname: string
    uid: string
    lastSeen: number | null
    groups: { id: number; name: string }[]
}

export interface TsClientOnlineCached {
    cldbid: number
    clid: string
    nickname: string
    uid: string
    online: true
    groups: { id: number; name: string }[]
}

export interface TsGroupCached {
    id: number
    name: string
}

export interface OfflineCache {
    clients: TsClientCached[]
    refreshedAt: number
}

export interface OnlineCache {
    clients: TsClientOnlineCached[]
    roles: TsGroupCached[]
    refreshedAt: number
}

export interface GroupCache {
    groups: TsGroupCached[]
    refreshedAt: number
}

let offlineCache: OfflineCache | null = null
let onlineCache: OnlineCache | null = null
let groupCache: GroupCache | null = null
let offlineRefreshing = false
let onlineRefreshing = false

// Fresh connection for the offline cache refresh — runs ~40 commands per cycle so it
// gets its own socket and doesn't block the persistent connection used for fast queries.
function connectForOfflineCache(): Promise<TeamSpeak> {
    return TeamSpeak.connect({
        host: process.env.TS_HOST!,
        queryport: Number(process.env.TS_QUERY_PORT ?? 10022),
        protocol: QueryProtocol.SSH,
        username: 'serveradmin',
        password: process.env.TS_SERVERADMIN_PASSWORD!,
        serverport: Number(process.env.TS_SERVER_PORT ?? 9987),
    })
}

// Persistent connection — stays alive between cache refreshes and action routes.
// Nulled out on close/error so the next caller reconnects automatically.
let persistentTs: TeamSpeak | undefined
let connectingPromise: Promise<TeamSpeak> | null = null
let keepAliveTimer: ReturnType<typeof setInterval> | undefined

export async function getConnection(): Promise<TeamSpeak> {
    if (persistentTs) return persistentTs
    if (connectingPromise) return connectingPromise
    connectingPromise = TeamSpeak.connect({
        host: process.env.TS_HOST!,
        queryport: Number(process.env.TS_QUERY_PORT ?? 10022),
        protocol: QueryProtocol.SSH,
        username: 'serveradmin',
        password: process.env.TS_SERVERADMIN_PASSWORD!,
        serverport: Number(process.env.TS_SERVER_PORT ?? 9987),
    }).then(ts => {
        persistentTs = ts
        connectingPromise = null
        // Manual keepalive — send a no-op every 60s to prevent idle timeout
        keepAliveTimer = setInterval(() => {
            ts.version().catch(() => {})
        }, 60_000)
        ts.on('close', () => {
            console.log('[TeamSpeak] Persistent connection closed — will reconnect on next use')
            clearInterval(keepAliveTimer)
            keepAliveTimer = undefined
            persistentTs = undefined
        })
        ts.on('error', () => {
            clearInterval(keepAliveTimer)
            keepAliveTimer = undefined
            persistentTs = undefined
        })
        return ts
    }).catch(err => {
        connectingPromise = null
        throw err
    })
    return connectingPromise
}

export function getOfflineCache(): OfflineCache | null { return offlineCache }
export function getOnlineCache(): OnlineCache | null { return onlineCache }
export function getGroupCache(): GroupCache | null { return groupCache }
export function isOfflineRefreshing(): boolean { return offlineRefreshing }
export function isOnlineRefreshing(): boolean { return onlineRefreshing }

export async function refreshOfflineCache(): Promise<void> {
    if (offlineRefreshing) return
    offlineRefreshing = true
    let ts: TeamSpeak | undefined
    try {
        ts = await connectForOfflineCache()
        const conn = ts

        const [allGroups, onlineList] = await Promise.all([
            conn.serverGroupList(),
            conn.clientList(),
        ])

        const regularGroups = allGroups.filter(g => g.type === 1)
        const groupNameMap: Record<string, string> = Object.fromEntries(regularGroups.map(g => [g.sgid, g.name]))

        const onlineDbIds = new Set<string>()
        for (const c of onlineList) {
            if (c.type === 0) onlineDbIds.add(c.databaseId)
        }

        const dbClients: Awaited<ReturnType<typeof conn.clientDbList>> = []
        const pageSize = 200
        for (let offset = 0; ; offset += pageSize) {
            const page = await conn.clientDbList(offset, pageSize)
            dbClients.push(...page)
            if (page.length < pageSize) break
        }

        const membershipMap: Record<string, { id: number; name: string }[]> = {}
        await Promise.all(regularGroups.map(async g => {
            try {
                const members = await conn.serverGroupClientList(g.sgid)
                for (const m of members) {
                    if (!membershipMap[m.cldbid]) membershipMap[m.cldbid] = []
                    membershipMap[m.cldbid].push({ id: Number(g.sgid), name: groupNameMap[g.sgid] })
                }
            } catch {
                // skip protected/default groups (TS error 2564)
            }
        }))

        const clients = dbClients
            .filter(c => c.clientUniqueIdentifier !== 'serveradmin' && Number(c.cldbid) > 1 && !onlineDbIds.has(c.cldbid))
            .map(c => ({
                cldbid: Number(c.cldbid),
                nickname: c.clientNickname,
                uid: c.clientUniqueIdentifier,
                lastSeen: c.clientLastconnected || null,
                groups: (membershipMap[c.cldbid] ?? []).sort((a, b) => a.name.localeCompare(b.name)),
            }))
            .sort((a, b) => {
                if (b.lastSeen !== a.lastSeen) return (b.lastSeen ?? 0) - (a.lastSeen ?? 0)
                return a.nickname.localeCompare(b.nickname)
            })

        offlineCache = { clients, refreshedAt: Date.now() }

        const groups = regularGroups.map(g => ({ id: Number(g.sgid), name: g.name })).sort((a, b) => a.name.localeCompare(b.name))
        groupCache = { groups, refreshedAt: Date.now() }
    } finally {
        offlineRefreshing = false
        if (ts) await ts.quit().catch(() => {})
    }
}

export async function refreshOnlineCache(): Promise<void> {
    if (onlineRefreshing) return
    onlineRefreshing = true
    const t0 = Date.now()
    console.log('[TS online] starting refresh')
    try {
        console.log('[TS online] getting connection...')
        const ts = await getConnection()
        console.log(`[TS online] connected in ${Date.now() - t0}ms — fetching client list + groups`)
        const [allGroups, onlineList] = await Promise.all([
            ts.serverGroupList(),
            ts.clientList(),
        ])
        const regularGroups = allGroups.filter(g => g.type === 1)
        const onlineHumans = onlineList.filter(c => c.type === 0)
        console.log(`[TS online] ${onlineHumans.length} human clients — fetching groups per client`)

        const regularGroupIds = new Set(regularGroups.map(g => String(g.sgid)))
        const clients: TsClientOnlineCached[] = await Promise.all(onlineHumans.map(async c => {
            let groups: { id: number; name: string }[] = []
            try {
                const clientGroups = await ts.serverGroupsByClientId(c.databaseId) as unknown as Array<{ sgid: string | number; name: string }>
                groups = clientGroups
                    .filter(g => regularGroupIds.has(String(g.sgid)))
                    .map(g => ({ id: Number(g.sgid), name: g.name }))
                    .sort((a, b) => a.name.localeCompare(b.name))
            } catch {
                // ignore
            }
            return { cldbid: Number(c.databaseId), clid: c.clid, nickname: c.nickname, uid: c.uniqueIdentifier, online: true as const, groups }
        }))
        clients.sort((a, b) => a.nickname.localeCompare(b.nickname))
        const roles = regularGroups.map(g => ({ id: Number(g.sgid), name: g.name })).sort((a, b) => a.name.localeCompare(b.name))
        onlineCache = { clients, roles, refreshedAt: Date.now() }
        groupCache = { groups: roles, refreshedAt: Date.now() }
        console.log(`[TS online] done — ${clients.length} clients cached in ${Date.now() - t0}ms total`)
    } finally {
        onlineRefreshing = false
    }
}

export async function refreshGroupCache(): Promise<void> {
    const ts = await getConnection()
    const allGroups = await ts.serverGroupList()
    const regularGroups = allGroups.filter(g => g.type === 1)
    const groups = regularGroups.map(g => ({ id: Number(g.sgid), name: g.name })).sort((a, b) => a.name.localeCompare(b.name))
    groupCache = { groups, refreshedAt: Date.now() }
}
