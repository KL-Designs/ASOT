import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { can } from '@/lib/operations/permissions'

/** GET — return recent operations (title, date, status, zeusNotes) for the J6 notes tab */
export async function GET(request: NextRequest) {
    try {
        const me = await client.fetchMe()
        if (!(await can(me, 'zeus')))
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim()
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = 15
    const skip = (page - 1) * limit

    const query: Record<string, unknown> = { deletedAt: { $exists: false } }
    if (search) query.title = { $regex: search, $options: 'i' }

    const [ops, total] = await Promise.all([
        Db.operations
            .find(query, { projection: { _id: 1, title: 1, date: 1, status: 1, zeusNotes: 1 } })
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
        Db.operations.countDocuments(query),
    ])

    return NextResponse.json({ operations: ops, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await can(me, 'zeus'))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id, notes } = await request.json()
    if (!id) return NextResponse.json({ error: 'Operation ID required' }, { status: 400 })

    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    }

    await Db.operations.updateOne(
        { _id: operationId },
        { $set: { zeusNotes: notes ?? '' } }
    )

    return NextResponse.json({ ok: true })
}
