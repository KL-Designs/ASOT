import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// DELETE /api/admin/calendar/[id] — delete an event (creator or J4 admin)
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

    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    let oid: ObjectId
    try {
        oid = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const event = await Db.calendarEvents.findOne({ _id: oid })
    if (!event) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)
    if (event.createdById !== me.id && !isJ4) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await Db.calendarEvents.deleteOne({ _id: oid })
    return NextResponse.json({ ok: true })
}
