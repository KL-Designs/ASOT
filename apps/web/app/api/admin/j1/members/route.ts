import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/j1/members — list of Discord members for application linking
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const users = await Db.users
        .find({})
        .project({ id: 1, globalName: 1, username: 1, name: 1, csvName: 1, 'guild.nickname': 1, 'guild.displayName': 1, 'guild.roles': 1, discharged: 1, isSkeletonAccount: 1 })
        .toArray()

    const members = users.map(u => ({
        id: u.id,
        displayName: u.isSkeletonAccount
            ? (u.csvName || u.id)
            : (u.guild?.nickname || u.guild?.displayName || u.globalName || u.username || u.id),
        username: u.username || null,
        inGameName: u.name || null,
        discharged: u.discharged ? true : false,
        isSkeleton: u.isSkeletonAccount ? true : false,
        isActiveMember: client.hasRoles(u as User, ['ASOT Member']),
    }))

    return NextResponse.json({ members })
}
