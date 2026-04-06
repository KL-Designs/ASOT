import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'

// PATCH /api/admin/tasks/[id]
// Body actions:
//   { action: 'complete', notes?: string }
//   { action: 'extend', dueDate: string }
//   { action: 'start' }
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
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const task = await Db.tasks.findOne({ _id: new ObjectId(id) })
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const { action } = body

    if (action === 'complete') {
        await Db.tasks.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: 'completed', completedAt: new Date(), ...(body.notes ? { notes: body.notes } : {}) } }
        )

        // Notify the original assigner that the task is done
        if (task.assignedBy && task.assignedBy !== me.id) {
            await createNotification({
                userId: task.assignedBy,
                type: 'task_completed',
                title: 'Task completed',
                body: task.title,
                actionUrl: '/admin/tasks',
                relatedId: id,
            })
        }

        return NextResponse.json({ ok: true })
    }

    if (action === 'extend') {
        const { dueDate } = body
        if (!dueDate) return NextResponse.json({ error: 'dueDate is required' }, { status: 400 })

        const newDue = new Date(dueDate)
        if (isNaN(newDue.getTime())) return NextResponse.json({ error: 'Invalid dueDate' }, { status: 400 })

        await Db.tasks.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    dueDate: newDue,
                    extendedAt: new Date(),
                    ...(task.originalDueDate ? {} : { originalDueDate: task.dueDate }),
                },
            }
        )

        // Notify the original assigner of the extension
        if (task.assignedBy && task.assignedBy !== me.id) {
            await createNotification({
                userId: task.assignedBy,
                type: 'task_extended',
                title: 'Task due date extended',
                body: `"${task.title}" has been extended to ${newDue.toLocaleDateString()}`,
                actionUrl: '/admin/tasks',
                relatedId: id,
            })
        }

        return NextResponse.json({ ok: true })
    }

    if (action === 'start') {
        await Db.tasks.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: 'in_progress' } }
        )
        return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// DELETE /api/admin/tasks/[id] — hard delete (creator or any admin can delete)
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
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    await Db.tasks.deleteOne({ _id: new ObjectId(id) })
    return NextResponse.json({ ok: true })
}
