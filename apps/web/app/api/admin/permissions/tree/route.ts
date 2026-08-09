import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { buildPermissionsTree } from '@/lib/permissions/tree'

// GET /api/admin/permissions/tree — full PERMISSIONS catalog as a category
// tree, with resolved Discord role chips, granting ORBAT Roles, and live
// member counts. J4-Administration only.
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.admin.viewPermissionsTree)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const categories = await buildPermissionsTree()
    return NextResponse.json({ categories })
}
