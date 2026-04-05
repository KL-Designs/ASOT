import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/orbat/for-move
// Returns all ORBAT positions with basic user display names.
// Auth: any admin-page user (including All Staff) — lighter permission than manageOrbat.
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
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

    const result = positions.map(p => {
        const u = p.userId ? userMap.get(p.userId) : null
        const userDisplayName = u
            ? (u.milpac?.currentRank ? u.milpac.currentRank + ' ' : '') +
              (u.name || u.guild?.nickname || u.globalName || u.username || u.id)
            : null
        return {
            _id: p._id.toString(),
            category: p.category,
            sectionTitle: p.sectionTitle,
            role: p.role,
            positionOrder: p.positionOrder,
            sectionOrder: p.sectionOrder,
            userId: p.userId ?? null,
            userDisplayName,
        }
    })

    return NextResponse.json({ positions: result })
}
