import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { buildMemberGrants } from '@/lib/permissions/tree'

// GET /api/admin/permissions/member/[id] — one member's full permission-key
// breakdown (granted/denied + why). J4-Administration only.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.admin.viewPermissionsTree)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const target = await Db.users.findOne(
        { id, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } },
        { projection: { id: 1, name: 1, globalName: 1, username: 1, 'guild.nickname': 1, 'guild.displayName': 1 } }
    )
    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    const grants = await buildMemberGrants(id)
    if (!grants) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    const targetName =
        target.guild?.nickname || target.guild?.displayName || target.globalName || target.username || 'Unknown'

    return NextResponse.json({ user: { id: target.id, name: targetName }, grants })
}
