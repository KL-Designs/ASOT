import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'

// PATCH /api/admin/calendar/[id] — update an existing event (creator or J4 admin)
export async function PATCH(
    req: NextRequest,
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
    try { oid = new ObjectId(id) } catch {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const existing = await Db.calendarEvents.findOne({ _id: oid })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)
    if (existing.createdById !== me.id && !isJ4) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const updates: Record<string, unknown> = {}
    if (body.title?.trim()) updates.title = body.title.trim()
    if (body.description !== undefined) updates.description = body.description?.trim() ?? ''
    if (body.start) updates.start = new Date(body.start)
    if (body.end) updates.end = new Date(body.end)
    if (body.timePeriod !== undefined) updates.timePeriod = body.timePeriod

    await Db.calendarEvents.updateOne({ _id: oid }, { $set: updates })
    return NextResponse.json({ ok: true })
}

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

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'calendar.delete',
        category: 'calendar',
        performedBy: me.id,
        performedByName: displayName,
        target: `Deleted event "${event.title}" from ${event.department.toUpperCase()}`,
        details: { eventId: id, department: event.department, title: event.title },
    })

    return NextResponse.json({ ok: true })
}
