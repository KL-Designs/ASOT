import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
// ── GET /api/admin/orbat ───────────────────────────────────────────────────────
// Returns all positions with hydrated user info.

export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbat)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const positions = await Db.orbatPositions
        .find({})
        .sort({ category: 1, sectionOrder: 1, positionOrder: 1 })
        .toArray()

    const userIds = positions.map(p => p.userId).filter(Boolean) as string[]
    const users = userIds.length
        ? await Db.users.find({ _id: { $in: userIds } }).toArray()
        : []

    const userMap = new Map(users.map(u => [u._id, u]))

    const result: OrbatPositionWithUser[] = positions.map(p => {
        const u = p.userId ? userMap.get(p.userId) : null
        return {
            ...p,
            user: u
                ? {
                      id: u._id,
                      username: u.username,
                      displayName: (u.milpac?.currentRank ? u.milpac.currentRank + ' ' : '') + (u.name || u.guild.nickname || u.globalName || u.username),
                      avatarURL: u.guild?.avatarURL || u.avatarURL,
                  }
                : null,
        }
    })

    return NextResponse.json(result)
}

