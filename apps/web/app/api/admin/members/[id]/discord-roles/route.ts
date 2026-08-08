import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { botRequest, addGuildRole, removeGuildRole } from '@/lib/discord/bot'

const guildId = process.env.DISCORD_GUILD_ID

// GET /api/admin/members/[id]/discord-roles — fetch member's current roles + all guild roles
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    if (!guildId) return NextResponse.json({ error: 'DISCORD_GUILD_ID not set' }, { status: 500 })

    const [guildMember, allRoles] = await Promise.all([
        botRequest<{ roles: string[] }>('GET', `/guilds/${guildId}/members/${id}`),
        botRequest<{ id: string; name: string; color: number; position: number }[]>('GET', `/guilds/${guildId}/roles`),
    ])

    const sorted = [...allRoles].sort((a, b) => b.position - a.position)

    return NextResponse.json({
        memberRoleIds: guildMember.roles,
        allRoles: sorted,
    })
}

// PATCH /api/admin/members/[id]/discord-roles — add or remove a single role
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const { roleId, action } = await request.json()

    if (typeof roleId !== 'string' || !['add', 'remove'].includes(action)) {
        return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    if (action === 'add') {
        await addGuildRole(id, roleId)
    } else {
        await removeGuildRole(id, roleId)
    }

    return NextResponse.json({ ok: true })
}
