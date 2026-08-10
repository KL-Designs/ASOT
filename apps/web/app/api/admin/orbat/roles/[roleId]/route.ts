import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'
import { rolesConflict } from '@/lib/orbat/categoriesOverlap'
import { wouldCreateCycle } from '@/lib/orbat/chainOfCommand'


function parseId(roleId: string): ObjectId | null {
    try { return new ObjectId(roleId) } catch { return null }
}

async function auth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)) return null
    return me
}


// ── PATCH /api/admin/orbat/roles/[roleId] ──────────────────────────────────
// Body: { name?, categories?, discordRoleIds?, permissions?, tag? }
// Renaming cascades to every OrbatPosition.role denormalized copy.

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ roleId: string }> }
) {
    const me = await auth()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { roleId } = await params
    const objectId = parseId(roleId)
    if (!objectId) return NextResponse.json({ error: 'Invalid roleId' }, { status: 400 })

    const role = await Db.orbatRoles.findOne({ _id: objectId })
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })

    const body = await request.json()
    const updates: Partial<OrbatRole> = {}

    const proposedName: string = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : role.name
    const proposedCategories: string[] = Array.isArray(body.categories) ? body.categories : role.categories
    const proposedTag: string | null = 'tag' in body
        ? (typeof body.tag === 'string' && body.tag.trim() ? body.tag.trim() : null)
        : role.tag
    const nameChanging = proposedName !== role.name
    const categoriesChanging = Array.isArray(body.categories)
    const tagChanging = 'tag' in body && proposedTag !== role.tag

    if (nameChanging || categoriesChanging || tagChanging) {
        const sameName = await Db.orbatRoles.find({ name: proposedName, _id: { $ne: objectId } }).toArray()
        const conflict = sameName.find(r => rolesConflict(r, { categories: proposedCategories, tag: proposedTag }))
        if (conflict) return NextResponse.json({ error: 'A Role with that name, category scope, and tag already exists' }, { status: 409 })
    }
    if (nameChanging) updates.name = proposedName
    if (categoriesChanging) updates.categories = body.categories
    if (tagChanging) updates.tag = proposedTag
    if (Array.isArray(body.discordRoleIds)) updates.discordRoleIds = body.discordRoleIds
    if (Array.isArray(body.permissions)) {
        updates.permissions = body.permissions.filter((p: unknown) => typeof p === 'string' && PERMISSION_KEYS.includes(p))
    }
    if (body.parentRoleId != null && body.parentGroupId != null) {
        return NextResponse.json({ error: 'A role cannot have both a parent role and a parent group' }, { status: 400 })
    }
    if ('parentRoleId' in body) {
        const raw = body.parentRoleId
        if (raw === null) {
            updates.parentRoleId = null
        } else if (typeof raw === 'string') {
            const parentObjectId = parseId(raw)
            if (!parentObjectId) return NextResponse.json({ error: 'Invalid parentRoleId' }, { status: 400 })
            if (parentObjectId.equals(objectId)) {
                return NextResponse.json({ error: 'A role cannot be its own parent' }, { status: 400 })
            }
            const parentRole = await Db.orbatRoles.findOne({ _id: parentObjectId })
            if (!parentRole) return NextResponse.json({ error: 'Parent role not found' }, { status: 400 })
            if (await wouldCreateCycle({ id: objectId, kind: 'role' }, { id: parentObjectId, kind: 'role' })) {
                return NextResponse.json({ error: 'This would create a cycle in the chain of command' }, { status: 409 })
            }
            updates.parentRoleId = parentObjectId
            updates.parentGroupId = null
        } else {
            return NextResponse.json({ error: 'Invalid parentRoleId' }, { status: 400 })
        }
    }
    if ('parentGroupId' in body) {
        const raw = body.parentGroupId
        if (raw === null) {
            updates.parentGroupId = null
        } else if (typeof raw === 'string') {
            const parentObjectId = parseId(raw)
            if (!parentObjectId) return NextResponse.json({ error: 'Invalid parentGroupId' }, { status: 400 })
            const parentGroup = await Db.orbatRoleGroups.findOne({ _id: parentObjectId })
            if (!parentGroup) return NextResponse.json({ error: 'Parent group not found' }, { status: 400 })
            if (await wouldCreateCycle({ id: objectId, kind: 'role' }, { id: parentObjectId, kind: 'group' })) {
                return NextResponse.json({ error: 'This would create a cycle in the chain of command' }, { status: 409 })
            }
            updates.parentGroupId = parentObjectId
            updates.parentRoleId = null
        } else {
            return NextResponse.json({ error: 'Invalid parentGroupId' }, { status: 400 })
        }
    }

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    await Db.orbatRoles.updateOne({ _id: objectId }, { $set: updates })

    if (updates.name) {
        await Db.orbatPositions.updateMany({ roleId: objectId }, { $set: { role: updates.name } })
    }

    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/orbat/roles/[roleId] ─────────────────────────────────
// Blocked if any position still references this Role.

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ roleId: string }> }
) {
    const me = await auth()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { roleId } = await params
    const objectId = parseId(roleId)
    if (!objectId) return NextResponse.json({ error: 'Invalid roleId' }, { status: 400 })

    const inUseCount = await Db.orbatPositions.countDocuments({ roleId: objectId })
    if (inUseCount > 0) {
        return NextResponse.json({ error: 'Role is in use by existing positions', inUseCount }, { status: 409 })
    }

    // Cascade: any role that had this one as its chain-of-command parent
    // becomes a root instead of the delete being blocked — this is routing
    // metadata, not structural/permission-critical, so a hard block here
    // would just be friction.
    await Db.orbatRoles.updateMany({ parentRoleId: objectId }, { $set: { parentRoleId: null } })
    await Db.orbatRoleGroups.updateMany({ parentRoleId: objectId }, { $set: { parentRoleId: null } })
    await Db.orbatRoles.deleteOne({ _id: objectId })
    return NextResponse.json({ success: true })
}
