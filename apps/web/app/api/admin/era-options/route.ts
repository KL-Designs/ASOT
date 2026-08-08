import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

const DEFAULT_OPTIONS: Omit<EraOption, '_id'>[] = [
    { name: 'Modern',   value: 'modern',   order: 0,  isDefault: true },
    { name: 'WWII',     value: 'wwii',     order: 1,  isDefault: true },
    { name: 'Vietnam',  value: 'vietnam',  order: 2,  isDefault: true },
    { name: 'Cold War', value: 'coldwar',  order: 3,  isDefault: true },
    { name: 'Fantasy',  value: 'fantasy',  order: 4,  isDefault: true },
    { name: 'Sci-Fi',   value: 'scifi',    order: 5,  isDefault: true },
]

// GET /api/admin/era-options — public, returns ordered list
export async function GET() {
    let options = await Db.eraOptions.find({}).sort({ order: 1, name: 1 }).toArray()

    // Auto-seed defaults if collection is empty
    if (options.length === 0) {
        await Db.eraOptions.insertMany(DEFAULT_OPTIONS as EraOption[])
        options = await Db.eraOptions.find({}).sort({ order: 1, name: 1 }).toArray()
    }

    return NextResponse.json(options)
}

// POST /api/admin/era-options — J2 Lead only, create a new option
export async function POST(req: NextRequest) {
    await client.updateRoles()
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j2)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { name } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const value = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
    const existing = await Db.eraOptions.findOne({ value })
    if (existing) return NextResponse.json({ error: 'An option with that name already exists' }, { status: 409 })

    const maxOrder = await Db.eraOptions.find({}).sort({ order: -1 }).limit(1).toArray()
    const order = maxOrder.length > 0 ? maxOrder[0].order + 1 : 100

    const result = await Db.eraOptions.insertOne({ name: name.trim(), value, order, isDefault: false } as EraOption)
    return NextResponse.json({ _id: result.insertedId, name: name.trim(), value, order })
}

// PATCH /api/admin/era-options — J2 Lead only, rename an option
export async function PATCH(req: NextRequest) {
    await client.updateRoles()
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j2)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, name } = await req.json()
    if (!id || !name?.trim()) return NextResponse.json({ error: 'id and name required' }, { status: 400 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }

    await Db.eraOptions.updateOne({ _id: oid }, { $set: { name: name.trim() } })
    return NextResponse.json({ ok: true })
}

// DELETE /api/admin/era-options?id=... — J2 Lead only, remove a custom option
export async function DELETE(req: NextRequest) {
    await client.updateRoles()
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j2)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }

    const option = await Db.eraOptions.findOne({ _id: oid })
    if (!option) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (option.isDefault) return NextResponse.json({ error: 'Default options cannot be deleted' }, { status: 400 })

    await Db.eraOptions.deleteOne({ _id: oid })
    return NextResponse.json({ ok: true })
}
