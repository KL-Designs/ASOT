import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'


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
// Body: { name?, categories?, discordRoleIds?, permissions? }
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

    if (typeof body.name === 'string' && body.name.trim() && body.name.trim() !== role.name) {
        const conflict = await Db.orbatRoles.findOne({ name: body.name.trim(), _id: { $ne: objectId } })
        if (conflict) return NextResponse.json({ error: 'A Role with that name already exists' }, { status: 409 })
        updates.name = body.name.trim()
    }
    if (Array.isArray(body.categories)) updates.categories = body.categories
    if (Array.isArray(body.discordRoleIds)) updates.discordRoleIds = body.discordRoleIds
    if (Array.isArray(body.permissions)) {
        updates.permissions = body.permissions.filter((p: unknown) => typeof p === 'string' && PERMISSION_KEYS.includes(p))
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

    await Db.orbatRoles.deleteOne({ _id: objectId })
    return NextResponse.json({ success: true })
}
