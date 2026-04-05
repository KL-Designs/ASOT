import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/members — list of all members for use across admin departments
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

    const users = await Db.users
        .find({ isSkeletonAccount: { $ne: true }, discharged: { $exists: false } })
        .project({ id: 1, globalName: 1, username: 1, name: 1, 'guild.nickname': 1, 'guild.displayName': 1, 'milpac.qualifications': 1, 'milpac.currentRank': 1 })
        .toArray()

    const members = users.map(u => ({
        id: u.id,
        displayName: u.guild?.nickname || u.guild?.displayName || u.globalName || u.username || u.id,
        inGameName: u.name || null,
        qualifications: (u.milpac?.qualifications ?? []).map((q: { qualification: string }) => q.qualification),
        currentRank: u.milpac?.currentRank ?? null,
    }))

    return NextResponse.json({ members })
}
