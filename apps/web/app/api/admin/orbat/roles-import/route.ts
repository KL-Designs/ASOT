import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

function canManage(me: User): boolean {
    return client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)
        && client.hasRoles(me, PERMISSIONS.admin.manageDepartmentRoles)
}

function toObjectId(value: unknown): ObjectId | null {
    if (typeof value !== 'string') return null
    try { return new ObjectId(value) } catch { return null }
}

function toObjectIdArray(value: unknown): ObjectId[] {
    if (!Array.isArray(value)) return []
    return value.map(toObjectId).filter((id): id is ObjectId => id !== null)
}

function toDate(value: unknown): Date {
    const d = value ? new Date(value as string) : new Date()
    return Number.isNaN(d.getTime()) ? new Date() : d
}

// POST /api/admin/orbat/roles-import — replaces the ENTIRE ORBAT Roles
// catalog, Role Groups (chain of command), and Department Roles catalog
// with the contents of a previously-exported bundle. Destructive: wipes all
// three collections first, then inserts the bundle's documents verbatim
// (preserving their original _ids so parentRoleId/parentGroupId/
// memberRoleIds cross-references inside the bundle stay intact). Never
// touches Db.orbatPositions or any live roster/assignment data.
export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManage(me)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body: Record<string, unknown>
    try {
        body = JSON.parse(await request.text())
    } catch {
        return NextResponse.json({ error: 'Invalid JSON file' }, { status: 400 })
    }

    if (!Array.isArray(body.orbatRoles) || !Array.isArray(body.orbatRoleGroups) || !Array.isArray(body.departmentRoles)) {
        return NextResponse.json({ error: 'File is missing orbatRoles, orbatRoleGroups, or departmentRoles' }, { status: 400 })
    }

    const orbatRoles: OrbatRole[] = (body.orbatRoles as Record<string, unknown>[]).map(r => ({
        _id: toObjectId(r._id) ?? new ObjectId(),
        name: String(r.name ?? ''),
        categories: Array.isArray(r.categories) ? r.categories.filter((c): c is string => typeof c === 'string') : [],
        tag: typeof r.tag === 'string' ? r.tag : null,
        discordRoleIds: Array.isArray(r.discordRoleIds) ? r.discordRoleIds.filter((id): id is string => typeof id === 'string') : [],
        tsGroupIds: Array.isArray(r.tsGroupIds) ? r.tsGroupIds.filter((id): id is number => typeof id === 'number') : [],
        permissions: Array.isArray(r.permissions) ? r.permissions.filter((p): p is string => typeof p === 'string') : [],
        parentRoleId: toObjectId(r.parentRoleId),
        parentGroupId: toObjectId(r.parentGroupId),
        createdAt: toDate(r.createdAt),
        createdBy: String(r.createdBy ?? me.id),
        createdByName: String(r.createdByName ?? ''),
    }))

    const orbatRoleGroups: OrbatRoleGroup[] = (body.orbatRoleGroups as Record<string, unknown>[]).map(g => ({
        _id: toObjectId(g._id) ?? new ObjectId(),
        name: String(g.name ?? ''),
        memberRoleIds: toObjectIdArray(g.memberRoleIds),
        parentRoleId: toObjectId(g.parentRoleId),
        parentGroupId: toObjectId(g.parentGroupId),
        createdAt: toDate(g.createdAt),
        createdBy: String(g.createdBy ?? me.id),
        createdByName: String(g.createdByName ?? ''),
    }))

    const departmentRoles: DepartmentRole[] = (body.departmentRoles as Record<string, unknown>[]).map(d => ({
        _id: toObjectId(d._id) ?? new ObjectId(),
        department: String(d.department ?? ''),
        name: String(d.name ?? ''),
        isBase: !!d.isBase,
        discordRoleIds: Array.isArray(d.discordRoleIds) ? d.discordRoleIds.filter((id): id is string => typeof id === 'string') : [],
        tsGroupIds: Array.isArray(d.tsGroupIds) ? d.tsGroupIds.filter((id): id is number => typeof id === 'number') : [],
        permissions: Array.isArray(d.permissions) ? d.permissions.filter((p): p is string => typeof p === 'string') : [],
        linkedSlot: (typeof d.linkedSlot === 'string' && ['leader', '2ic', '3ic'].includes(d.linkedSlot)) ? (d.linkedSlot as 'leader' | '2ic' | '3ic') : null,
        createdAt: toDate(d.createdAt),
        createdBy: String(d.createdBy ?? me.id),
        createdByName: String(d.createdByName ?? ''),
    }))

    await Promise.all([
        Db.orbatRoles.deleteMany({}),
        Db.orbatRoleGroups.deleteMany({}),
        Db.departmentRoles.deleteMany({}),
    ])
    await Promise.all([
        orbatRoles.length ? Db.orbatRoles.insertMany(orbatRoles) : Promise.resolve(),
        orbatRoleGroups.length ? Db.orbatRoleGroups.insertMany(orbatRoleGroups) : Promise.resolve(),
        departmentRoles.length ? Db.departmentRoles.insertMany(departmentRoles) : Promise.resolve(),
    ])

    return NextResponse.json({
        success: true,
        counts: { orbatRoles: orbatRoles.length, orbatRoleGroups: orbatRoleGroups.length, departmentRoles: departmentRoles.length },
    })
}
