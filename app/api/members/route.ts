import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/members — admin-only list of all Discord-linked users for lookup/matching
export async function GET() {
    await client.updateRoles()

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.admin.massImport)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const users = await Db.users
        .find({ isSkeletonAccount: { $ne: true } })
        .project({ id: 1, globalName: 1, username: 1, 'guild.displayName': 1, 'guild.nickname': 1 })
        .toArray()

    const members = users.map(u => ({
        id: u.id,
        displayName: u.guild?.displayName || u.guild?.nickname || u.globalName || u.username || u.id,
    }))

    return NextResponse.json({ members })
}
