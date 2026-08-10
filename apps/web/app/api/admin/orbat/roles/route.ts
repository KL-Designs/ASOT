import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'
import { rolesConflict } from '@/lib/orbat/categoriesOverlap'


// ── GET /api/admin/orbat/roles ─────────────────────────────────────────────
// Same read gate as the rest of the ORBAT admin surface.

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbat)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const roles = await Db.orbatRoles.find({}).sort({ name: 1 }).toArray()
    return NextResponse.json({ roles: JSON.parse(JSON.stringify(roles)) })
}


// ── POST /api/admin/orbat/roles ────────────────────────────────────────────
// Body: { name, categories, discordRoleIds, tsGroupIds, permissions, tag }

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const name: string = (body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const categories: string[] = Array.isArray(body.categories) ? body.categories : []
    const discordRoleIds: string[] = Array.isArray(body.discordRoleIds) ? body.discordRoleIds : []
    const tsGroupIds: number[] = Array.isArray(body.tsGroupIds)
        ? body.tsGroupIds.filter((id: unknown) => typeof id === 'number')
        : []
    const permissions: string[] = Array.isArray(body.permissions)
        ? body.permissions.filter((p: unknown) => typeof p === 'string' && PERMISSION_KEYS.includes(p))
        : []
    const tag: string | null = typeof body.tag === 'string' && body.tag.trim() ? body.tag.trim() : null

    const sameName = await Db.orbatRoles.find({ name }).toArray()
    const conflict = sameName.find(r => rolesConflict(r, { categories, tag }))
    if (conflict) return NextResponse.json({ error: 'A Role with that name, category scope, and tag already exists' }, { status: 409 })

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const newRole: OrbatRole = {
        _id: new ObjectId(),
        name,
        categories,
        discordRoleIds,
        tsGroupIds,
        permissions,
        tag,
        parentRoleId: null,
        parentGroupId: null,
        createdAt: new Date(),
        createdBy: me.id,
        createdByName: performedByName,
    }
    await Db.orbatRoles.insertOne(newRole)

    return NextResponse.json({ role: JSON.parse(JSON.stringify(newRole)) })
}
