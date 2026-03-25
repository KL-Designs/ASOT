import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'


const STRUCTURAL = ['companyHQ', 'activeReservist', 'inactiveReservist', 'gamemaster']

const DEFAULT_CATEGORIES: OrbatCategory[] = [
    { _id: 'platoon11', label: 'Platoon 1-1 Infantry',  order: 1 },
    { _id: 'platoon12', label: 'Platoon 1-2 Infantry',  order: 2 },
    { _id: 'support',   label: 'Platoon 1-3 Support',   order: 3 },
]

async function auth(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return false
    return client.hasRoles(me, PERMISSIONS.admin.manageOrbat)
}


// ── GET /api/admin/orbat/categories ───────────────────────────────────────────

export async function GET(request: NextRequest) {
    if (!await auth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let cats = await Db.orbatCategories.find({}).sort({ order: 1 }).toArray()

    // Auto-populate from existing positions if the collection is empty
    if (cats.length === 0) {
        const distinctCats = await Db.orbatPositions.distinct('category')
        const toInsert: OrbatCategory[] = []

        // Insert known defaults that exist in positions
        for (const def of DEFAULT_CATEGORIES) {
            if (distinctCats.includes(def._id)) toInsert.push(def)
        }

        // Insert any unknown non-structural categories found in positions
        let order = toInsert.length + 1
        for (const cat of distinctCats) {
            if (!STRUCTURAL.includes(cat) && !toInsert.find(c => c._id === cat)) {
                toInsert.push({ _id: cat, label: cat, order: order++ })
            }
        }

        if (toInsert.length > 0) {
            await Db.orbatCategories.insertMany(toInsert)
        }
        cats = toInsert
    }

    return NextResponse.json(cats)
}


// ── POST /api/admin/orbat/categories ──────────────────────────────────────────
// Body: { label: string }

export async function POST(request: NextRequest) {
    if (!await auth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { label } = await request.json()
    if (!label?.trim()) return NextResponse.json({ error: 'Missing label' }, { status: 400 })

    const last = await Db.orbatCategories.find({}).sort({ order: -1 }).limit(1).toArray()
    const order = (last[0]?.order ?? 0) + 1

    // Generate a unique key from the label
    const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
    const key = `${base}_${Date.now()}`

    await Db.orbatCategories.insertOne({ _id: key, label: label.trim(), order })
    return NextResponse.json({ key })
}


// ── PATCH /api/admin/orbat/categories ─────────────────────────────────────────
// Body: { key: string, label: string }

export async function PATCH(request: NextRequest) {
    if (!await auth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { key, label } = await request.json()
    if (!key || !label?.trim()) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    await Db.orbatCategories.updateOne({ _id: key }, { $set: { label: label.trim() } })
    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/orbat/categories ────────────────────────────────────────
// Body: { key: string }

export async function DELETE(request: NextRequest) {
    if (!await auth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { key } = await request.json()
    if (STRUCTURAL.includes(key)) {
        return NextResponse.json({ error: 'Cannot delete structural category' }, { status: 400 })
    }

    await Db.orbatPositions.deleteMany({ category: key })
    await Db.orbatCategories.deleteOne({ _id: key })
    return NextResponse.json({ success: true })
}
