import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/members/discharged — list discharged members (J4 only)
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const users = await Db.users
        .find({ discharged: { $exists: true } })
        .project({ id: 1, globalName: 1, username: 1, name: 1, 'guild.nickname': 1, 'guild.displayName': 1, discharged: 1 })
        .toArray()

    const members = users.map(u => ({
        id: u.id,
        displayName: u.guild?.nickname || u.guild?.displayName || u.globalName || u.username || u.id,
        discharged: u.discharged,
    }))

    return NextResponse.json({ members })
}

// PATCH /api/admin/members/discharged — reinstate a member (J4 only)
export async function PATCH(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { targetUserId } = await req.json()
    if (!targetUserId) {
        return NextResponse.json({ error: 'Missing targetUserId' }, { status: 400 })
    }

    const user = await Db.users.findOne({ id: targetUserId })
    if (!user) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    if (!user.discharged) return NextResponse.json({ error: 'Member is not discharged' }, { status: 400 })

    await Db.users.updateOne({ id: targetUserId }, { $unset: { discharged: '' } })

    return NextResponse.json({ ok: true })
}
