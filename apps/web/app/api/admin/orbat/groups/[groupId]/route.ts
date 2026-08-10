import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { wouldCreateCycle } from '@/lib/orbat/chainOfCommand'

function parseId(id: string): ObjectId | null {
    try { return new ObjectId(id) } catch { return null }
}

async function auth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)) return null
    return me
}


// ── PATCH /api/admin/orbat/groups/[groupId] ────────────────────────────────
// Body: { name?, memberRoleIds?, parentRoleId?, parentGroupId? }

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    const me = await auth()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { groupId } = await params
    const objectId = parseId(groupId)
    if (!objectId) return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 })

    const group = await Db.orbatRoleGroups.findOne({ _id: objectId })
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    const body = await request.json()
    const updates: Partial<OrbatRoleGroup> = {}

    if (typeof body.name === 'string' && body.name.trim() && body.name.trim() !== group.name) {
        const conflict = await Db.orbatRoleGroups.findOne({ name: body.name.trim(), _id: { $ne: objectId } })
        if (conflict) return NextResponse.json({ error: 'A Group with that name already exists' }, { status: 409 })
        updates.name = body.name.trim()
    }

    if (Array.isArray(body.memberRoleIds)) {
        const memberRoleIds: ObjectId[] = body.memberRoleIds
            .filter((id: unknown) => typeof id === 'string')
            .map((id: string) => { try { return new ObjectId(id) } catch { return null } })
            .filter((id: ObjectId | null): id is ObjectId => id !== null)
        updates.memberRoleIds = memberRoleIds
    }

    if (body.parentRoleId != null && body.parentGroupId != null) {
        return NextResponse.json({ error: 'A group cannot have both a parent role and a parent group' }, { status: 400 })
    }
    if ('parentRoleId' in body) {
        const raw = body.parentRoleId
        if (raw === null) {
            updates.parentRoleId = null
        } else if (typeof raw === 'string') {
            const parentObjectId = parseId(raw)
            if (!parentObjectId) return NextResponse.json({ error: 'Invalid parentRoleId' }, { status: 400 })
            const parentRole = await Db.orbatRoles.findOne({ _id: parentObjectId })
            if (!parentRole) return NextResponse.json({ error: 'Parent role not found' }, { status: 400 })
            if (await wouldCreateCycle({ id: objectId, kind: 'group' }, { id: parentObjectId, kind: 'role' })) {
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
            if (parentObjectId.equals(objectId)) {
                return NextResponse.json({ error: 'A group cannot be its own parent' }, { status: 400 })
            }
            const parentGroup = await Db.orbatRoleGroups.findOne({ _id: parentObjectId })
            if (!parentGroup) return NextResponse.json({ error: 'Parent group not found' }, { status: 400 })
            if (await wouldCreateCycle({ id: objectId, kind: 'group' }, { id: parentObjectId, kind: 'group' })) {
                return NextResponse.json({ error: 'This would create a cycle in the chain of command' }, { status: 409 })
            }
            updates.parentGroupId = parentObjectId
            updates.parentRoleId = null
        } else {
            return NextResponse.json({ error: 'Invalid parentGroupId' }, { status: 400 })
        }
    }

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    await Db.orbatRoleGroups.updateOne({ _id: objectId }, { $set: updates })

    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/orbat/groups/[groupId] ───────────────────────────────
// Never blocked by membership — cascades parent links on anything that had
// this group as its own chain-of-command parent.

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    const me = await auth()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { groupId } = await params
    const objectId = parseId(groupId)
    if (!objectId) return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 })

    await Db.orbatRoles.updateMany({ parentGroupId: objectId }, { $set: { parentGroupId: null } })
    await Db.orbatRoleGroups.updateMany({ parentGroupId: objectId }, { $set: { parentGroupId: null } })
    await Db.orbatRoleGroups.deleteOne({ _id: objectId })

    return NextResponse.json({ success: true })
}
