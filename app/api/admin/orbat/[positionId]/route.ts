import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'


async function auth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbat)) return null
    return me
}

function parseId(positionId: string): ObjectId | null {
    try { return new ObjectId(positionId) } catch { return null }
}


// ── PATCH /api/admin/orbat/[positionId] ───────────────────────────────────────
// Body: { userId: string | null }            — assign/unassign user
//       { role: string }                     — rename role
//       { positionOrder: number }            — reorder within section

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ positionId: string }> }
) {
    if (!await auth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { positionId } = await params
    const objectId = parseId(positionId)
    if (!objectId) return NextResponse.json({ error: 'Invalid positionId' }, { status: 400 })

    const position = await Db.orbatPositions.findOne({ _id: objectId })
    if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 })

    const body = await request.json()

    // User assignment
    if ('userId' in body) {
        const { userId } = body
        if (userId) {
            const existing = await Db.orbatPositions.findOne({ userId, _id: { $ne: objectId } })
            if (existing) {
                return NextResponse.json({ error: 'User already assigned', conflict: existing }, { status: 409 })
            }
        }
        await Db.orbatPositions.updateOne({ _id: objectId }, { $set: { userId: userId ?? null } })
        return NextResponse.json({ success: true })
    }

    // Field updates (role rename, reorder)
    const updates: Partial<OrbatPosition> = {}
    if (typeof body.role === 'string') updates.role = body.role
    if (typeof body.positionOrder === 'number') updates.positionOrder = body.positionOrder
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    await Db.orbatPositions.updateOne({ _id: objectId }, { $set: updates })
    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/orbat/[positionId] ──────────────────────────────────────

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ positionId: string }> }
) {
    if (!await auth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { positionId } = await params
    const objectId = parseId(positionId)
    if (!objectId) return NextResponse.json({ error: 'Invalid positionId' }, { status: 400 })

    await Db.orbatPositions.deleteOne({ _id: objectId })
    return NextResponse.json({ success: true })
}
