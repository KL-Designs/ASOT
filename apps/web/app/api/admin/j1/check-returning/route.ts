import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { sendChannelMessage } from '@/lib/discord/bot'
import { runReturningMemberCheck } from '@/lib/j1/returning-check'
import { logAction } from '@/lib/logAction'

// GET /api/admin/j1/check-returning?discordId=...&steamId64=...
// Returns whether this person is a new, previously discharged, or currently active member.
export async function GET(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const discordId = request.nextUrl.searchParams.get('discordId')?.trim()
    const steamId64 = request.nextUrl.searchParams.get('steamId64')?.trim()

    if (!discordId && !steamId64) {
        return NextResponse.json({ status: 'new' })
    }

    const orClauses: Record<string, string>[] = []
    if (discordId) orClauses.push({ id: discordId })
    if (steamId64) orClauses.push({ steamId64 })

    const user = await Db.users.findOne(
        { $or: orClauses },
        { projection: { id: 1, name: 1, globalName: 1, username: 1, 'guild.nickname': 1, discharged: 1 } }
    )

    if (!user) return NextResponse.json({ status: 'new' })

    const displayName = user.guild?.nickname || user.globalName || user.username || user.id

    if (user.discharged) {
        // The same check a website application gets: welcome back (HD), to be
        // reviewed (GD) or not welcome (DD), with the history behind it.
        const check = await runReturningMemberCheck(user.id)
        return NextResponse.json({
            status: 'discharged', name: displayName, inGameName: user.name ?? null,
            level: check.status, details: check.details,
        })
    }

    return NextResponse.json({ status: 'active', name: displayName, inGameName: user.name ?? null })
}

// POST /api/admin/j1/check-returning — { discordId, name }
// Ask J4, in the J1 recruitment channel, to confirm a returning member may
// rejoin. The button behind this is shown for "to be reviewed" and "not
// welcome" in the manual Recruit Member flow; a website application sends the
// same message on its own when a recruiter is assigned.
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const discordId = typeof body.discordId === 'string' ? body.discordId.trim() : ''
    if (!discordId) return NextResponse.json({ error: 'discordId is required' }, { status: 400 })

    // The name in the message comes from the record, not the request: this
    // posts into a staff channel under the bot's name.
    const user = await Db.users.findOne(
        { id: discordId, discharged: { $exists: true } },
        { projection: { name: 1, globalName: 1, username: 1, 'guild.nickname': 1 } },
    )
    if (!user) return NextResponse.json({ error: 'That person has no discharge on record.' }, { status: 404 })
    const name = user.guild?.nickname || user.name || user.globalName || user.username || discordId

    const channel = process.env.DISCORD_J1_RECRUITMENT_CHANNEL_ID
    if (!channel) {
        return NextResponse.json({ error: 'The J1 recruitment channel is not configured (DISCORD_J1_RECRUITMENT_CHANNEL_ID).' }, { status: 503 })
    }

    const j4RoleId = process.env.DISCORD_J4_ROLE_ID
    const j4Mention = j4RoleId ? `<@&${j4RoleId}>` : '@J4'
    try {
        await sendChannelMessage(channel, {
            content: `*${name}* is requesting to rejoin. <@${me.id}> requests ${j4Mention} confirmation that the applicant is eligible to rejoin.`,
        }, 'j1_returning_member')
    } catch (err) {
        console.error('[j1/check-returning] J1-Recruitment channel ping failed:', err)
        return NextResponse.json({ error: 'Discord did not accept the message. Try again, or ask J4 directly.' }, { status: 502 })
    }

    logAction({
        action: 'j1.returning.notify_j4',
        category: 'member',
        performedBy: me.id,
        performedByName: me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id,
        target: name,
        details: { discordId },
    })

    return NextResponse.json({ success: true })
}
