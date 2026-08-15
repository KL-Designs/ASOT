import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { applyMemberSyncFixes } from '@/lib/orbat/member-sync'
import { logAction } from '@/lib/logs'

// POST /api/admin/orbat/member-sync/apply — body: { userIds?: string[] }
// Omitted userIds = every currently out-of-sync member (Sync All). Present =
// just those (per-member Sync button sends a single-element array).
export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const userIds: string[] | undefined = Array.isArray(body?.userIds)
        ? body.userIds.filter((id: unknown): id is string => typeof id === 'string')
        : undefined

    const result = await applyMemberSyncFixes(userIds)

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'member.sync.apply',
        category: 'member',
        performedBy: me.id,
        performedByName,
        target: userIds ? userIds.join(',') : 'ALL',
        details: { ...result },
    }).catch(() => {})

    return NextResponse.json(result)
}
