import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

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
        return NextResponse.json({ status: 'discharged', name: displayName, inGameName: user.name ?? null })
    }

    return NextResponse.json({ status: 'active', name: displayName, inGameName: user.name ?? null })
}
