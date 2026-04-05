import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/members — list of all members for use across admin departments
// Optional query param: ?department=j3 — filters to members of that department
export async function GET(request: Request) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const deptFilter = searchParams.get('department')

    const mongoFilter: Record<string, unknown> = { isSkeletonAccount: { $ne: true }, discharged: { $exists: false } }
    if (deptFilter) mongoFilter.departments = deptFilter

    const users = await Db.users
        .find(mongoFilter)
        .project({ id: 1, globalName: 1, username: 1, name: 1, 'guild.nickname': 1, 'guild.displayName': 1, 'milpac.qualifications': 1, 'milpac.currentRank': 1, teamLeadDepts: 1 })
        .toArray()

    const members = users.map(u => ({
        id: u.id,
        displayName: u.guild?.nickname || u.guild?.displayName || u.globalName || u.username || u.id,
        inGameName: u.name || null,
        qualifications: (u.milpac?.qualifications ?? []).map((q: { qualification: string }) => q.qualification),
        currentRank: u.milpac?.currentRank ?? null,
        teamLeadDepts: u.teamLeadDepts ?? [],
    }))

    return NextResponse.json({ members })
}
