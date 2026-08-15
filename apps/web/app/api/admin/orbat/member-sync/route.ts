import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { computeMemberSyncReport } from '@/lib/orbat/member-sync'

// GET /api/admin/orbat/member-sync — same read gate as the rest of the
// ORBAT admin surface (this route lives inside the Roles Manager panel).
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const report = await computeMemberSyncReport()
    return NextResponse.json(report)
}
