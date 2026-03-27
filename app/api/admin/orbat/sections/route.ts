import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { SINGLE_SECTION_CATEGORIES } from '@/lib/orbat-constants'


async function auth(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return false
    return client.hasRoles(me, PERMISSIONS.admin.manageOrbat)
}


// ── POST /api/admin/orbat/sections ────────────────────────────────────────────
// Body: { category, sectionTitle }
// Creates the first position (placeholder) in a new section.

export async function POST(request: NextRequest) {
    if (!await auth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { category, sectionTitle } = await request.json()
    if (!category || !sectionTitle?.trim()) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    if ((SINGLE_SECTION_CATEGORIES as readonly string[]).includes(category)) {
        return NextResponse.json({ error: 'This category does not support multiple sections' }, { status: 400 })
    }

    // Assign sectionOrder after last section in this category
    const last = await Db.orbatPositions
        .find({ category })
        .sort({ sectionOrder: -1 })
        .limit(1)
        .toArray()
    const sectionOrder = (last[0]?.sectionOrder ?? -1) + 1

    const newPosition: OrbatPosition = {
        _id: new ObjectId(),
        category,
        sectionTitle: sectionTitle.trim(),
        role: 'New Role',
        userId: null,
        sectionOrder,
        positionOrder: 0,
    }
    await Db.orbatPositions.insertOne(newPosition)

    return NextResponse.json({ position: JSON.parse(JSON.stringify(newPosition)) })
}


// ── PATCH /api/admin/orbat/sections ───────────────────────────────────────────
// Body (rename): { category, oldTitle, newTitle }
// Body (reorder): { category, sectionTitle, direction: 'up' | 'down' }

export async function PATCH(request: NextRequest) {
    if (!await auth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { category } = body

    if (body.direction) {
        // Reorder section
        const { sectionTitle, direction } = body

        // Get distinct sections in this category ordered by sectionOrder
        const sections = await Db.orbatPositions.aggregate<{ _id: string; sectionOrder: number }>([
            { $match: { category } },
            { $group: { _id: '$sectionTitle', sectionOrder: { $first: '$sectionOrder' } } },
            { $sort: { sectionOrder: 1 } },
        ]).toArray()

        const idx = sections.findIndex(s => s._id === sectionTitle)
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1
        if (idx < 0 || swapIdx < 0 || swapIdx >= sections.length) {
            return NextResponse.json({ error: 'Cannot move' }, { status: 400 })
        }

        const curr = sections[idx]
        const swap = sections[swapIdx]
        await Promise.all([
            Db.orbatPositions.updateMany(
                { category, sectionTitle: curr._id },
                { $set: { sectionOrder: swap.sectionOrder } }
            ),
            Db.orbatPositions.updateMany(
                { category, sectionTitle: swap._id },
                { $set: { sectionOrder: curr.sectionOrder } }
            ),
        ])
    } else {
        // Rename section
        const { oldTitle, newTitle } = body
        if (!newTitle?.trim()) return NextResponse.json({ error: 'Missing newTitle' }, { status: 400 })
        await Db.orbatPositions.updateMany(
            { category, sectionTitle: oldTitle },
            { $set: { sectionTitle: newTitle.trim() } }
        )
    }

    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/orbat/sections ──────────────────────────────────────────
// Body: { category, sectionTitle }
// Deletes all positions in the section.

export async function DELETE(request: NextRequest) {
    if (!await auth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { category, sectionTitle } = await request.json()
    await Db.orbatPositions.deleteMany({ category, sectionTitle })
    return NextResponse.json({ success: true })
}
