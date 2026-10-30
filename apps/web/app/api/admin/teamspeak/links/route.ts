import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { getConnection } from '@/lib/teamspeak/cache'
import { logAction } from '@/lib/logAction'
import { RANKS_FLAT } from '@/lib/military/ranks'
import { AWARDS } from '@/lib/military/awards'
import { CERTIFICATIONS } from '@/lib/military/certifications'
import { TS_GROUP_MAPPINGS } from '@/lib/teamspeak/tags'
import {
    buildResolver, normaliseKey, TS_LINK_KINDS, type TsLinkKind, type TsServerGroup,
} from '@/lib/teamspeak/milpac-groups'

/**
 * `/api/admin/teamspeak/links` — which TeamSpeak group stands for each rank,
 * award, campaign and certification.
 *
 * GET lists every one of them with the group it currently resolves to and how
 * (a saved link, a name match, or nothing), so J4 can see at a glance what will
 * not sync. PUT saves or clears one link. Same gate as the rest of the J4
 * TeamSpeak tab.
 */

async function gate() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
    return { me }
}

async function serverGroups(): Promise<TsServerGroup[] | null> {
    try {
        const ts = await getConnection()
        const groups = await ts.serverGroupList()
        // type 1 = regular server groups; templates and query groups are not grantable.
        return groups.filter(g => g.type === 1).map(g => ({ id: Number(g.sgid), name: g.name }))
    } catch (err) {
        console.error('[TeamSpeak] links: could not list server groups:', err)
        return null
    }
}

export async function GET() {
    const { error } = await gate()
    if (error) return error

    const [groups, links, campaignNames] = await Promise.all([
        serverGroups(),
        Db.tsGroupLinks.find({}).toArray(),
        // Every campaign anybody has on their MILPAC — including the new ones
        // the name table has never heard of, which are the ones that need a link.
        Db.users.distinct('milpac.operations.name', { 'milpac.operations.0': { $exists: true } }),
    ])

    const resolver = buildResolver(groups ?? [], links)
    const nameById = new Map((groups ?? []).map(g => [g.id, g.name]))

    const campaigns = new Map<string, string>()
    for (const name of [
        ...TS_GROUP_MAPPINGS.map(m => m.operationName).filter((n): n is string => !!n),
        ...campaignNames.filter((n): n is string => typeof n === 'string' && !!n.trim()),
        ...links.filter(l => l.kind === 'campaign').map(l => l.key),
    ]) {
        if (!campaigns.has(normaliseKey(name))) campaigns.set(normaliseKey(name), name.trim())
    }

    const keys: Record<TsLinkKind, string[]> = {
        rank: RANKS_FLAT.map(r => r.abbr),
        award: AWARDS.map(a => a.label),
        campaign: [...campaigns.values()].sort((a, b) => a.localeCompare(b)),
        certification: CERTIFICATIONS.map(c => c.label),
    }

    const items = TS_LINK_KINDS.flatMap(kind => keys[kind].map(key => {
        const ids = resolver.groupIds(kind, key)
        return {
            kind,
            key,
            via: resolver.via(kind, key),
            tsGroupId: ids[0] ?? null,
            tsGroupName: ids[0] !== undefined ? nameById.get(ids[0]) ?? String(ids[0]) : null,
        }
    }))

    return NextResponse.json({
        tsAvailable: groups !== null,
        groups: (groups ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
        items,
    })
}

export async function PUT(req: NextRequest) {
    const { me, error } = await gate()
    if (error) return error

    const body = await req.json().catch(() => null)
    const kind = body?.kind as TsLinkKind
    const key = typeof body?.key === 'string' ? body.key.trim().slice(0, 200) : ''
    if (!TS_LINK_KINDS.includes(kind) || !key) {
        return NextResponse.json({ error: 'kind and key are required' }, { status: 400 })
    }
    const keyNorm = normaliseKey(key)
    const performedByName = me.guild?.displayName || me.globalName || me.username || me.id

    // null clears the link, falling back to the name match.
    if (body.tsGroupId === null) {
        await Db.tsGroupLinks.deleteOne({ kind, keyNorm })
        logAction({
            action: 'teamspeak.link.clear', category: 'member', department: 'j4',
            performedBy: me.id, performedByName, target: `${kind}: ${key}`,
        })
        return NextResponse.json({ ok: true })
    }

    const tsGroupId = Number(body.tsGroupId)
    if (!Number.isInteger(tsGroupId) || tsGroupId <= 0) {
        return NextResponse.json({ error: 'tsGroupId must be a server group id' }, { status: 400 })
    }
    // Only a group that is really on the server: a link to nothing would
    // silently grant nothing.
    const groups = await serverGroups()
    if (!groups) return NextResponse.json({ error: 'TeamSpeak is not reachable' }, { status: 503 })
    if (!groups.some(g => g.id === tsGroupId)) {
        return NextResponse.json({ error: 'No such TeamSpeak server group' }, { status: 400 })
    }

    await Db.tsGroupLinks.updateOne(
        { kind, keyNorm },
        { $set: { kind, key, keyNorm, tsGroupId, updatedAt: new Date(), updatedBy: me.id, updatedByName: performedByName } },
        { upsert: true },
    )
    logAction({
        action: 'teamspeak.link.set', category: 'member', department: 'j4',
        performedBy: me.id, performedByName, target: `${kind}: ${key}`,
        details: { tsGroupId, tsGroupName: groups.find(g => g.id === tsGroupId)?.name },
    })
    return NextResponse.json({ ok: true })
}
