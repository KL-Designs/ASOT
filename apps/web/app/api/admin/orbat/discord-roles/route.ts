import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/orbat/discord-roles — return all guild roles sorted by position (manage-structure only)
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatStructure)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const roles = await Db.roles.find({}).sort({ rawPosition: -1 }).toArray()
    return NextResponse.json({ roles: JSON.parse(JSON.stringify(roles)) })
}
