import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

// GET /api/notifications — fetch the current user's notifications (newest first, max 50)
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const docs = await Db.notifications
        .find({ userId: me.id, dismissedAt: { $exists: false } })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray()

    const notifications = docs.map(n => ({
        ...n,
        _id: n._id!.toString(),
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
    }))

    return NextResponse.json({ notifications })
}

// PATCH /api/notifications — mark all as read
export async function PATCH() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await Db.notifications.updateMany(
        { userId: me.id, readAt: { $exists: false } },
        { $set: { readAt: new Date() } }
    )

    return NextResponse.json({ ok: true })
}
