import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { RESERVIST_CATEGORY_IDS } from '@/lib/orbat-constants'


async function authStructure() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatStructure)) return null
    return me
}

async function authMembers() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatMembers)) return null
    return me
}

function parseId(positionId: string): ObjectId | null {
    try { return new ObjectId(positionId) } catch { return null }
}


// ── PATCH /api/admin/orbat/[positionId] ───────────────────────────────────────
// Body: { userId: string | null, skipAutoMove?: boolean }  — assign/unassign user
//       { role: string }                                   — rename role
//       { positionOrder: number }                          — reorder within section
//
// When userId is set to null on a platoon position (and skipAutoMove is not true),
// the evicted user is automatically placed into activeReservist.

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ positionId: string }> }
) {
    const { positionId } = await params
    const objectId = parseId(positionId)
    if (!objectId) return NextResponse.json({ error: 'Invalid positionId' }, { status: 400 })

    const position = await Db.orbatPositions.findOne({ _id: objectId })
    if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 })

    const body = await request.json()

    // User assignment
    if ('userId' in body) {
        if (!await authMembers()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const { userId, skipAutoMove } = body
        const isUnassign = !userId

        if (!isUnassign) {
            // Conflict check — prevent dual assignment
            const existing = await Db.orbatPositions.findOne({ userId, _id: { $ne: objectId } })
            if (existing) {
                return NextResponse.json({ error: 'User already assigned', conflict: existing }, { status: 409 })
            }
        }

        // Auto-move evicted user to activeReservist (unless suppressed or this IS a reservist position)
        let reservistPosition: OrbatPosition | null = null
        if (isUnassign && position.userId && !skipAutoMove && !RESERVIST_CATEGORY_IDS.includes(position.category)) {
            const last = await Db.orbatPositions
                .find({ category: 'activeReservist' })
                .sort({ positionOrder: -1 })
                .limit(1)
                .toArray()
            const positionOrder = (last[0]?.positionOrder ?? -1) + 1

            reservistPosition = {
                _id: new ObjectId(),
                category: 'activeReservist',
                sectionTitle: '',
                role: 'Active Reservist',
                userId: position.userId,
                sectionOrder: 0,
                positionOrder,
            }
        }

        await Db.orbatPositions.updateOne({ _id: objectId }, { $set: { userId: userId ?? null } })
        if (reservistPosition) await Db.orbatPositions.insertOne(reservistPosition)
        return NextResponse.json({
            success: true,
            reservistPosition: reservistPosition ? JSON.parse(JSON.stringify(reservistPosition)) : null,
        })
    }

    // Field updates (role rename, reorder) — structure permission required
    if (!await authStructure()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    if (!await authStructure()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { positionId } = await params
    const objectId = parseId(positionId)
    if (!objectId) return NextResponse.json({ error: 'Invalid positionId' }, { status: 400 })

    await Db.orbatPositions.deleteOne({ _id: objectId })
    return NextResponse.json({ success: true })
}
