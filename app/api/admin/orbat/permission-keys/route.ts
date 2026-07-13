import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'

// GET /api/admin/orbat/permission-keys — flat list of permission keys the
// Roles Manager's permission picker offers. Same gate as viewing Roles.
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbat)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ keys: PERMISSION_KEYS })
}
