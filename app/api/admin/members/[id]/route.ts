import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'
import { addGuildRole, removeGuildRole, setGuildNickname } from '@/lib/discord/bot'
import { syncDeptDiscordRole } from '@/lib/discord/dept-roles'
import { buildNickname } from '@/lib/buildNickname'

// PATCH /api/admin/members/[id] — J4 only: update display name, department, or chaplain status
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
    const body = await request.json()
    const { name, department, action, chaplain } = body as {
        name?: string
        department?: string
        action?: string
        chaplain?: boolean
    }

    const VALID_DEPTS = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7']
    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    // ── Department add/remove ──
    if (department !== undefined || (action !== undefined && chaplain === undefined)) {
        if (!VALID_DEPTS.includes(department ?? '')) {
            return NextResponse.json({ error: 'Invalid department.' }, { status: 400 })
        }
        if (action !== 'add' && action !== 'remove') {
            return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
        }
        const user = await Db.users.findOne({ id })
        if (!user) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

        if (action === 'add') {
            await Db.users.updateOne({ id }, { $addToSet: { departments: department } })
        } else {
            await Db.users.updateOne({ id }, { $pull: { departments: department } })
        }

        syncDeptDiscordRole(id, department!, action as 'add' | 'remove').catch(err =>
            console.error('[admin/members] dept Discord role sync failed:', err)
        )

        logAction({
            action: `member.department.${action}`,
            category: 'member',
            performedBy: me.id,
            performedByName,
            target: user.username,
            details: { department },
        }).catch(() => {})

        return NextResponse.json({ ok: true })
    }

    // ── Chaplain toggle ──
    if (chaplain !== undefined) {
        const user = await Db.users.findOne({ id })
        if (!user) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

        await Db.users.updateOne({ id }, { $set: { isChaplain: chaplain } })

        const chaplainRole = await Db.roles.findOne({ name: 'ASOT Chaplain' })
        if (chaplainRole?.id) {
            const fn = chaplain ? addGuildRole : removeGuildRole
            fn(id, chaplainRole.id).catch(err => console.error('[admin/members] chaplain role sync failed:', err))
        }

        const nick = buildNickname(
            user.milpac?.currentRank,
            user.name || user.username || id,
            user.departments,
            chaplain,
        )
        setGuildNickname(id, nick).catch(err => console.error('[admin/members] chaplain nickname update failed:', err))

        logAction({
            action: chaplain ? 'member.chaplain.add' : 'member.chaplain.remove',
            category: 'member',
            performedBy: me.id,
            performedByName,
            target: user.username,
            details: {},
        }).catch(() => {})

        return NextResponse.json({ ok: true })
    }

    // ── Display name rename ──
    if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 })
    }

    const trimmed = name.trim()

    const conflict = await Db.users.findOne({ name: trimmed, id: { $ne: id } })
    if (conflict) {
        return NextResponse.json({ error: 'That name is already in use by another member.' }, { status: 409 })
    }

    const user = await Db.users.findOne({ id })
    if (!user) {
        return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
    }

    await Db.users.updateOne({ id }, { $set: { name: trimmed } })

    const nick = buildNickname(user.milpac?.currentRank, trimmed, user.departments, user.isChaplain)
    setGuildNickname(id, nick).catch(err => console.error('[admin/members] nickname update failed:', err))

    logAction({
        action: 'member.rename',
        category: 'member',
        performedBy: me.id,
        performedByName,
        target: user.username,
        details: { oldName: user.name ?? null, newName: trimmed, discordNick: nick },
    }).catch(() => {})

    return NextResponse.json({ ok: true })
}

// DELETE /api/admin/members/[id] — permanently delete a user from the database (J4 only)
export async function DELETE(
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

    const user = await Db.users.findOne({ id })
    if (!user) {
        return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
    }

    await Db.users.deleteOne({ id })

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'member.delete',
        category: 'member',
        performedBy: me.id,
        performedByName,
        target: `${user.username} (${user.id})`,
        details: { deletedUserId: user.id, deletedUsername: user.username, deletedName: user.name ?? null },
    }).catch(() => {})

    return NextResponse.json({ ok: true })
}
