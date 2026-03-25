import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'


// ── POST /api/admin/orbat/positions ───────────────────────────────────────────
// Body: { category, sectionTitle, role }
// Creates a new vacant position at the end of the section.

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbat)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { category, sectionTitle, role } = await request.json()
    if (!category || typeof role !== 'string' || !role.trim()) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Get sectionOrder and next positionOrder from existing docs in this section
    const existing = await Db.orbatPositions
        .find({ category, sectionTitle: sectionTitle ?? '' })
        .sort({ positionOrder: -1 })
        .limit(1)
        .toArray()

    const sectionOrder = existing[0]?.sectionOrder ?? 0
    const positionOrder = (existing[0]?.positionOrder ?? -1) + 1

    await Db.orbatPositions.insertOne({
        _id: new ObjectId(),
        category,
        sectionTitle: sectionTitle ?? '',
        role: role.trim(),
        userId: null,
        sectionOrder,
        positionOrder,
    } as OrbatPosition)

    return NextResponse.json({ success: true })
}
