import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// PATCH /api/admin/meetings/[id]/tasks/[taskId]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id, taskId } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const deptKey = meeting.department as keyof typeof PERMISSIONS.departments
    if (!client.hasRoles(me, PERMISSIONS.departments[deptKey])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (meeting.locked) return NextResponse.json({ error: 'Meeting is locked' }, { status: 403 })

    let body: { status?: MeetingTask['status']; title?: string; reminderDate?: string | null }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    const setFields: Record<string, unknown> = { updatedAt: new Date() }

    if (body.title !== undefined) setFields['tasks.$[elem].title'] = body.title.trim()
    if (body.reminderDate !== undefined) {
        setFields['tasks.$[elem].reminderDate'] = body.reminderDate ? new Date(body.reminderDate) : null
    }
    if (body.status !== undefined) {
        setFields['tasks.$[elem].status'] = body.status
        if (body.status === 'completed') {
            setFields['tasks.$[elem].completedAt'] = new Date()
            setFields['tasks.$[elem].completedByName'] = displayName
        }
    }

    await Db.meetings.updateOne(
        { _id: new ObjectId(id) },
        { $set: setFields },
        { arrayFilters: [{ 'elem.id': taskId }] }
    )

    return NextResponse.json({ ok: true })
}

// DELETE /api/admin/meetings/[id]/tasks/[taskId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id, taskId } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const deptKey = meeting.department as keyof typeof PERMISSIONS.departments
    if (!client.hasRoles(me, PERMISSIONS.departments[deptKey])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (meeting.locked) return NextResponse.json({ error: 'Meeting is locked' }, { status: 403 })

    await Db.meetings.updateOne(
        { _id: new ObjectId(id) },
        { $pull: { tasks: { id: taskId } }, $set: { updatedAt: new Date() } }
    )

    return NextResponse.json({ ok: true })
}
