import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { getConnection, getOnlineCache, getOfflineCache } from '@/lib/teamspeak/cache'
import { checkTsGate } from '@/lib/teamspeak/devmode'
import { getSpacersForGroup, TS_SPACER_NAMES } from '@/lib/teamspeak/tags'

/** Resolve a TS UID from a cldbid, using the in-memory cache first. */
async function resolveUid(cldbid: string): Promise<string | null> {
    const onlineCache = getOnlineCache()
    const offlineCache = getOfflineCache()
    const cached = [
        ...(onlineCache?.clients ?? []),
        ...(offlineCache?.clients ?? []),
    ].find(c => String(c.cldbid) === cldbid)
    if (cached) return cached.uid

    // Fall back to a TS query
    try {
        const ts = await getConnection()
        const info = await ts.clientDbInfo(cldbid) as unknown as { clientUniqueIdentifier?: string }
        return info.clientUniqueIdentifier ?? null
    } catch {
        return null
    }
}

/** Get the current server group IDs for a client. */
async function getCurrentGroupIds(cldbid: string): Promise<Set<number>> {
    try {
        const ts = await getConnection()
        const groups = await ts.serverGroupsByClientId(cldbid) as unknown as Array<{ sgid: string | number }>
        return new Set(groups.map(g => Number(g.sgid)))
    } catch {
        return new Set()
    }
}

/** Find a group name from the roles list by ID. */
function groupNameById(id: number, roles: Array<{ id: number; name: string }>): string | undefined {
    return roles.find(r => r.id === id)?.name
}

// POST /api/teamspeak/clients/[cldbid]/groups — add a server group
export async function POST(req: NextRequest, { params }: { params: Promise<{ cldbid: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { cldbid } = await params
    const { sgid } = await req.json()

    const uid = await resolveUid(cldbid)
    if (uid) {
        const gate = await checkTsGate(uid)
        if (!gate.allowed) {
            return NextResponse.json({ error: 'Blocked by TeamSpeak dev mode', devMode: true }, { status: 403 })
        }
    }

    try {
        const ts = await getConnection()
        await ts.execute('servergroupaddclient', { sgid: String(sgid), cldbid })

        // Auto-apply required spacers
        const roles = getOnlineCache()?.roles ?? []
        const groupName = groupNameById(Number(sgid), roles)
        if (groupName) {
            const requiredSpacers = getSpacersForGroup(groupName)
            if (requiredSpacers.length > 0) {
                const currentIds = await getCurrentGroupIds(cldbid)
                const spacerIds = requiredSpacers
                    .map(s => roles.find(r => r.name === s)?.id)
                    .filter((id): id is number => id !== undefined && !currentIds.has(id))

                await Promise.allSettled(
                    spacerIds.map(id => ts.execute('servergroupaddclient', { sgid: String(id), cldbid }))
                )
            }
        }

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

    const uid = await resolveUid(cldbid)
    if (uid) {
        const gate = await checkTsGate(uid)
        if (!gate.allowed) {
            return NextResponse.json({ error: 'Blocked by TeamSpeak dev mode', devMode: true }, { status: 403 })
        }
    }

    try {
        const ts = await getConnection()
        await ts.execute('servergroupdelclient', { sgid, cldbid })

        // Auto-remove orphaned spacers
        const roles = getOnlineCache()?.roles ?? []
        const groupName = groupNameById(Number(sgid), roles)
        if (groupName) {
            const affectedSpacers = getSpacersForGroup(groupName)
            if (affectedSpacers.length > 0) {
                const remainingIds = await getCurrentGroupIds(cldbid)

                for (const spacerName of affectedSpacers) {
                    const spacerId = roles.find(r => r.name === spacerName)?.id
                    if (!spacerId || !remainingIds.has(spacerId)) continue

                    // Check if any remaining group still needs this spacer
                    const stillNeeded = [...remainingIds].some(id => {
                        const name = groupNameById(id, roles)
                        if (!name || TS_SPACER_NAMES.has(name)) return false
                        return getSpacersForGroup(name).includes(spacerName)
                    })

                    if (!stillNeeded) {
                        await ts.execute('servergroupdelclient', { sgid: String(spacerId), cldbid }).catch(() => {})
                    }
                }
            }
        }

        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[TeamSpeak] Failed to remove group:', err)
        return NextResponse.json({ error: 'Failed to remove group' }, { status: 500 })
    }
}
