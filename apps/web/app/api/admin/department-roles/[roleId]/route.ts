import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'
import { removeGuildRole } from '@/lib/discord/bot'
import { applyTsServerGroups } from '@/lib/teamspeak/groups'
import { DEPT_LEADERSHIP_POSITIONS, LEADERSHIP_SLOT_INDEX, type LeadershipSlot } from '@/lib/discord/dept-codes'

function parseId(roleId: string): ObjectId | null {
    try { return new ObjectId(roleId) } catch { return null }
}

async function auth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!client.hasRoles(me, PERMISSIONS.admin.manageDepartmentRoles)) return null
    return me
}


// ── PATCH /api/admin/department-roles/[roleId] ─────────────────────────────
// Body: { name?, discordRoleIds?, tsGroupIds?, permissions? }
// Base roles are renameable like any other role — "base" only means it can't
// be deleted (see DELETE below) and its grants apply implicitly to every
// member of the department, not that its name is fixed.

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ roleId: string }> }
) {
    const me = await auth()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { roleId } = await params
    const objectId = parseId(roleId)
    if (!objectId) return NextResponse.json({ error: 'Invalid roleId' }, { status: 400 })

    const role = await Db.departmentRoles.findOne({ _id: objectId })
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })

    const body = await request.json()
    const updates: Partial<DepartmentRole> = {}

    if (typeof body.name === 'string' && body.name.trim() && body.name.trim() !== role.name) {
        const conflict = await Db.departmentRoles.findOne({ department: role.department, name: body.name.trim(), _id: { $ne: objectId } })
        if (conflict) return NextResponse.json({ error: 'A role with that name already exists in this department' }, { status: 409 })
        updates.name = body.name.trim()
    }
    if (Array.isArray(body.discordRoleIds)) updates.discordRoleIds = body.discordRoleIds
    if (Array.isArray(body.tsGroupIds)) updates.tsGroupIds = body.tsGroupIds.filter((id: unknown) => typeof id === 'number')
    if (Array.isArray(body.permissions)) {
        updates.permissions = body.permissions.filter((p: unknown) => typeof p === 'string' && PERMISSION_KEYS.includes(p))
    }
    if ('linkedSlot' in body) {
        const slot = body.linkedSlot
        if (slot !== null && slot !== 'leader' && slot !== '2ic' && slot !== '3ic') {
            return NextResponse.json({ error: 'Invalid linkedSlot' }, { status: 400 })
        }
        if (role.isBase && slot !== null) return NextResponse.json({ error: 'Base roles cannot be linked to a leadership position' }, { status: 400 })
        if (slot !== null) {
            const label = DEPT_LEADERSHIP_POSITIONS[role.department]?.[LEADERSHIP_SLOT_INDEX[slot as LeadershipSlot]]
            if (!label) return NextResponse.json({ error: 'This department has no such leadership position' }, { status: 400 })
        }
        updates.linkedSlot = slot
    }

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    if (updates.linkedSlot) {
        // Only one role per department can hold a given slot — reassigning
        // it clears the slot from whoever held it before.
        await Db.departmentRoles.updateMany(
            { department: role.department, linkedSlot: updates.linkedSlot, _id: { $ne: objectId } },
            { $set: { linkedSlot: null } },
        )
    }

    await Db.departmentRoles.updateOne({ _id: objectId }, { $set: updates })

    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/department-roles/[roleId] ────────────────────────────
// Rejected for base roles (400). Otherwise revokes the role's Discord/
// TeamSpeak grants from every member who currently holds it, then removes
// it from their departmentRoleIds and deletes the role document.

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ roleId: string }> }
) {
    const me = await auth()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { roleId } = await params
    const objectId = parseId(roleId)
    if (!objectId) return NextResponse.json({ error: 'Invalid roleId' }, { status: 400 })

    const role = await Db.departmentRoles.findOne({ _id: objectId })
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    if (role.isBase) return NextResponse.json({ error: 'Base department roles cannot be deleted' }, { status: 400 })

    const holders = await Db.users.find({ departmentRoleIds: objectId }).project({ id: 1 }).toArray()
    const revokePromises = holders.flatMap(u => [
        ...role.discordRoleIds.map(id => removeGuildRole(u.id, id)),
        applyTsServerGroups(u.id, 'remove', role.tsGroupIds),
    ])
    await Promise.allSettled(revokePromises)

    await Db.users.updateMany({ departmentRoleIds: objectId }, { $pull: { departmentRoleIds: objectId } })
    await Db.departmentRoles.deleteOne({ _id: objectId })

    return NextResponse.json({ success: true })
}
