import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { setGuildNickname } from '@/lib/discord/bot'
import { buildNickname } from '@/lib/buildNickname'
import { rankNameFromAbbr } from '@asot/lib'


export async function GET(_request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.members.editStandard)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { username } = await params
    const member = await Db.users.findOne({ username })
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    return NextResponse.json(member)
}


export async function PUT(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isRestricted = client.hasRoles(me, PERMISSIONS.members.editRestricted)
    const isStandard   = client.hasRoles(me, PERMISSIONS.members.editStandard)

    if (!isRestricted && !isStandard) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { username } = await params
    const body = await request.json()

    const { bioRank, enlistedDate, promotions, awards, qualifications, name, billetCounts, j4Points, disciplineHistory, disciplineDeductions } = body

    // Restricted fields check — J4-Administration only
    const hasRestrictedFields = bioRank !== undefined || enlistedDate !== undefined || billetCounts !== undefined || j4Points !== undefined || disciplineHistory !== undefined || disciplineDeductions !== undefined
    if (hasRestrictedFields && !isRestricted) {
        return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    }

    const editorName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    // Stored as the full rank name to match promotions[].rank and the editor's
    // rank picker; milpac.currentRank is the abbreviation.
    const editorRank = rankNameFromAbbr(me.milpac?.currentRank ?? '')
    const stamp = <T extends { issuedById?: string; issuedByName?: string; issuedByRank?: string }>(entries: T[]): T[] =>
        entries.map(e => e.issuedById
            ? e
            : { ...e, issuedById: me.id, issuedByName: editorName, issuedByRank: e.issuedByRank || editorRank })

    const update: Record<string, any> = {}

    // Standard fields (HQ Staff + J4-Admin)
    if (isStandard) {
        if (promotions !== undefined) update['milpac.promotions'] = stamp(promotions ?? [])
        if (awards !== undefined) update['milpac.awards'] = stamp(awards ?? [])
        if (qualifications !== undefined) update['milpac.qualifications'] = stamp(qualifications ?? [])

        if (name !== undefined) {
            if (name && typeof name === 'string') {
                const taken = await Db.users.findOne({ name, username: { $ne: username } })
                if (taken) return NextResponse.json({ error: 'Name already taken' }, { status: 409 })
            }
            update['name'] = name || null
        }
    }

    // Restricted fields (J4-Admin only)
    if (isRestricted) {
        if (enlistedDate !== undefined) update['milpac.enlistedDate'] = enlistedDate ?? ''
        if (bioRank !== undefined) update['milpac.currentRank'] = bioRank
        if (billetCounts !== undefined) update['milpac.billetCounts'] = billetCounts
        if (j4Points !== undefined) update['milpac.j4Points'] = j4Points
        if (disciplineHistory !== undefined) update['milpac.disciplineHistory'] = disciplineHistory ?? []
        if (disciplineDeductions !== undefined) update['milpac.disciplineDeductions'] = disciplineDeductions ?? 0
    }

    if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    const result = await Db.users.updateOne({ username }, { $set: update })
    if (result.matchedCount === 0) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    Db.users.findOne({ username }).then(updated => {
        if (!updated?.id) return
        const nick = buildNickname(updated.milpac?.currentRank, updated.name || updated.username || '', updated.departments, updated.isChaplain)
        return setGuildNickname(updated.id, nick)
    }).catch(err => console.error('[members/PUT] nickname update failed:', err))

    return NextResponse.json({ success: true })
}
