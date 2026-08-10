import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

const EXPORT_VERSION = 1

function canManage(me: User): boolean {
    return client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)
        && client.hasRoles(me, PERMISSIONS.admin.manageDepartmentRoles)
}

// GET /api/admin/orbat/roles-export — downloads the ORBAT Roles catalog,
// Role Groups (chain of command), and Department Roles catalog as one JSON
// file. Config/definitions only — never live position assignments
// (Db.orbatPositions) or roster data.
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManage(me)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [orbatRoles, orbatRoleGroups, departmentRoles] = await Promise.all([
        Db.orbatRoles.find({}).toArray(),
        Db.orbatRoleGroups.find({}).toArray(),
        Db.departmentRoles.find({}).toArray(),
    ])

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const bundle = {
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        exportedBy: performedByName,
        orbatRoles,
        orbatRoleGroups,
        departmentRoles,
    }

    const filename = `asot-roles-export-${new Date().toISOString().slice(0, 10)}.json`

    return new NextResponse(JSON.stringify(bundle, null, 2), {
        headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
    })
}
