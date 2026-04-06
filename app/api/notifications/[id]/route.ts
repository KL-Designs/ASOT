import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

// PATCH /api/notifications/[id] — mark a single notification as read
export async function PATCH(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    await Db.notifications.updateOne(
        { _id: new ObjectId(id), userId: me.id },
        { $set: { readAt: new Date() } }
    )

    return NextResponse.json({ ok: true })
}

// DELETE /api/notifications/[id] — dismiss (soft-delete) a notification
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    await Db.notifications.updateOne(
        { _id: new ObjectId(id), userId: me.id },
        { $set: { dismissedAt: new Date() } }
    )

    return NextResponse.json({ ok: true })
}
