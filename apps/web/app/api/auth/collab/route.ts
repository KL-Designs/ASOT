import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'

export async function GET(request: NextRequest) {
    const token = request.headers.get('x-collab-token')
    if (!token) return NextResponse.json({ authorized: false })
    try {
        const me = await client.fetchMe(token)
        if (!me) return NextResponse.json({ authorized: false })

        // sop-* → any ASOT member; ws-* → J2 members/leads; cfb-* → J3 trainers; all others → staff collab role
        const doc = request.nextUrl.searchParams.get('doc') ?? ''
        const authorized = doc.startsWith('sop-')
            ? await hasDashboardAccess(me)
            : doc.startsWith('ws-')
                ? client.hasRoles(me, PERMISSIONS.departments.j2) || (await hasPermission(me, 'departmentLeads.j2')) || client.hasRoles(me, PERMISSIONS.pages.admin)
                : doc.startsWith('cfb-')
                    ? client.hasRoles(me, PERMISSIONS.training.manage)
                    : await hasPermission(me, 'auth.collab')

        const userName = me.guild?.displayName || me.globalName || me.username || 'Unknown'
        const userAvatar = me.guild?.avatarURL || me.avatarURL || null
        return NextResponse.json({ authorized, userId: me._id, userName, userAvatar })
    } catch {
        return NextResponse.json({ authorized: false })
    }
}
