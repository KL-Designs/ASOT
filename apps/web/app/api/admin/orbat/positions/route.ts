import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'


// ── POST /api/admin/orbat/positions ───────────────────────────────────────────
// Body: { category, sectionTitle, roleId }
// Creates a new vacant position at the end of the section.

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatStructure)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { category, sectionTitle, roleId } = await request.json()
    if (!category || typeof roleId !== 'string' || !roleId) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    let roleObjectId: ObjectId
    try { roleObjectId = new ObjectId(roleId) } catch { return NextResponse.json({ error: 'Invalid roleId' }, { status: 400 }) }

    const roleDoc = await Db.orbatRoles.findOne({ _id: roleObjectId })
    if (!roleDoc) return NextResponse.json({ error: 'Role not found' }, { status: 404 })

    // Get sectionOrder and next positionOrder from existing docs in this section
    const existing = await Db.orbatPositions
        .find({ category, sectionTitle: sectionTitle ?? '' })
        .sort({ positionOrder: -1 })
        .limit(1)
        .toArray()

    const sectionOrder = existing[0]?.sectionOrder ?? 0
    const positionOrder = (existing[0]?.positionOrder ?? -1) + 1

    const newPosition: OrbatPosition = {
        _id: new ObjectId(),
        category,
        sectionTitle: sectionTitle ?? '',
        role: roleDoc.name,
        roleId: roleObjectId,
        userId: null,
        sectionOrder,
        positionOrder,
    }
    await Db.orbatPositions.insertOne(newPosition)

    return NextResponse.json({ position: JSON.parse(JSON.stringify(newPosition)) })
}
