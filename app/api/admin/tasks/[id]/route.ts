import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import {
    sendTaskExtensionRequestDM,
    sendTaskExtensionApprovedDM,
    sendTaskExtensionDeniedDM,
} from '@/lib/discord/bot'

// PATCH /api/admin/tasks/[id]
// Actions:
//   { action: 'complete', notes?: string }
//   { action: 'extend', dueDate: string }
//   { action: 'start' }
//   { action: 'reopen' }
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

        if (task.assignedBy && task.assignedBy !== me.id && task.assignedBy !== 'system') {
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

        if (task.assignedBy && task.assignedBy !== me.id && task.assignedBy !== 'system') {
            await createNotification({
                userId: task.assignedBy,
                type: 'task_extended',
                title: 'Task due date extended',
                body: `"${task.title}" has been extended to ${newDue.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`,
                actionUrl: '/admin/tasks',
                relatedId: id,
            })
        }

        return NextResponse.json({ ok: true })
    }

    if (action === 'request_extension') {
        const { requestedDate, reason } = body
        if (!requestedDate) return NextResponse.json({ error: 'requestedDate is required' }, { status: 400 })
        if (!reason?.trim()) return NextResponse.json({ error: 'reason is required' }, { status: 400 })

        const newDue = new Date(requestedDate)
        if (isNaN(newDue.getTime())) return NextResponse.json({ error: 'Invalid requestedDate' }, { status: 400 })

        const requesterName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
        const formattedDate = newDue.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

        await Db.tasks.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    extensionRequest: {
                        requestedDate: newDue,
                        reason: reason.trim(),
                        requestedAt: new Date(),
                        status: 'pending',
                    },
                },
            }
        )

        if (task.assignedBy && task.assignedBy !== 'system') {
            // Create an extension_review task for the creator so it appears in their My Tasks
            await Db.tasks.insertOne({
                title: `Extension request: ${task.title}`,
                description: `**${requesterName}** has requested a due-date extension.\n\nRequested date: ${formattedDate}\nReason: ${reason.trim()}`,
                type: 'extension_review' as TaskType,
                assignedTo: task.assignedBy,
                assignedToName: task.assignedByName,
                assignedBy: 'system',
                assignedByName: 'System',
                relatedId: id,
                status: 'pending',
                createdAt: new Date(),
            } as Task)

            await createNotification({
                userId: task.assignedBy,
                type: 'task_extension_requested',
                title: 'Extension request',
                body: `${requesterName} requested an extension for "${task.title}" to ${formattedDate}`,
                actionUrl: '/admin/tasks',
                relatedId: id,
            })
            sendTaskExtensionRequestDM(
                task.assignedBy,
                task.title,
                requesterName,
                formattedDate,
                reason.trim(),
                '/admin/tasks',
            ).catch(() => {})
        }

        return NextResponse.json({ ok: true })
    }

    // approve_extension_review / deny_extension_review — called from the extension_review task in My Tasks
    if (action === 'approve_extension_review' || action === 'deny_extension_review') {
        if (!task.relatedId || !ObjectId.isValid(task.relatedId)) {
            return NextResponse.json({ error: 'Invalid relatedId' }, { status: 400 })
        }

        const originalTask = await Db.tasks.findOne({ _id: new ObjectId(task.relatedId) })
        if (!originalTask) return NextResponse.json({ error: 'Original task not found' }, { status: 404 })

        const req = originalTask.extensionRequest
        if (!req || req.status !== 'pending') {
            return NextResponse.json({ error: 'No pending extension request on original task' }, { status: 400 })
        }

        if (action === 'approve_extension_review') {
            const approvedDate = req.requestedDate instanceof Date ? req.requestedDate : new Date(req.requestedDate)
            const approvedDateStr = approvedDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

            await Db.tasks.updateOne(
                { _id: new ObjectId(task.relatedId) },
                {
                    $set: {
                        dueDate: approvedDate,
                        extendedAt: new Date(),
                        'extensionRequest.status': 'approved',
                        ...(originalTask.originalDueDate ? {} : { originalDueDate: originalTask.dueDate }),
                    },
                }
            )

            if (originalTask.assignedTo) {
                await createNotification({
                    userId: originalTask.assignedTo,
                    type: 'task_extension_approved',
                    title: 'Extension approved',
                    body: `Your extension request for "${originalTask.title}" was approved`,
                    actionUrl: '/admin/tasks',
                    relatedId: task.relatedId,
                })
                sendTaskExtensionApprovedDM(originalTask.assignedTo, originalTask.title, approvedDateStr, '/admin/tasks').catch(() => {})
            }
        } else {
            await Db.tasks.updateOne(
                { _id: new ObjectId(task.relatedId) },
                { $set: { 'extensionRequest.status': 'denied' } }
            )

            if (originalTask.assignedTo) {
                await createNotification({
                    userId: originalTask.assignedTo,
                    type: 'task_extension_denied',
                    title: 'Extension denied',
                    body: `Your extension request for "${originalTask.title}" was denied`,
                    actionUrl: '/admin/tasks',
                    relatedId: task.relatedId,
                })
                sendTaskExtensionDeniedDM(originalTask.assignedTo, originalTask.title, '/admin/tasks').catch(() => {})
            }
        }

        // Complete (remove) the review task now that it's been actioned
        await Db.tasks.deleteOne({ _id: new ObjectId(id) })

        return NextResponse.json({ ok: true })
    }

    // approve_extension / deny_extension — direct action from "Created by Me" tab
    if (action === 'approve_extension') {
        if (task.assignedBy !== me.id) {
            const isElevated = client.hasRoles(me, PERMISSIONS.admin.manageOrbat)
            if (!isElevated) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const req = task.extensionRequest
        if (!req || req.status !== 'pending') {
            return NextResponse.json({ error: 'No pending extension request' }, { status: 400 })
        }

        const approvedDate = req.requestedDate instanceof Date ? req.requestedDate : new Date(req.requestedDate)
        const approvedDateStr = approvedDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

        await Db.tasks.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    dueDate: approvedDate,
                    extendedAt: new Date(),
                    'extensionRequest.status': 'approved',
                    ...(task.originalDueDate ? {} : { originalDueDate: task.dueDate }),
                },
            }
        )

        if (task.assignedTo) {
            await createNotification({
                userId: task.assignedTo,
                type: 'task_extension_approved',
                title: 'Extension approved',
                body: `Your extension request for "${task.title}" was approved`,
                actionUrl: '/admin/tasks',
                relatedId: id,
            })
            sendTaskExtensionApprovedDM(task.assignedTo, task.title, approvedDateStr, '/admin/tasks').catch(() => {})
        }

        // Delete the companion extension_review task if one exists
        if (task._id) {
            await Db.tasks.deleteOne({ type: 'extension_review', relatedId: id })
        }

        return NextResponse.json({ ok: true })
    }

    if (action === 'deny_extension') {
        if (task.assignedBy !== me.id) {
            const isElevated = client.hasRoles(me, PERMISSIONS.admin.manageOrbat)
            if (!isElevated) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const req = task.extensionRequest
        if (!req || req.status !== 'pending') {
            return NextResponse.json({ error: 'No pending extension request' }, { status: 400 })
        }

        await Db.tasks.updateOne(
            { _id: new ObjectId(id) },
            { $set: { 'extensionRequest.status': 'denied' } }
        )

        if (task.assignedTo) {
            await createNotification({
                userId: task.assignedTo,
                type: 'task_extension_denied',
                title: 'Extension denied',
                body: `Your extension request for "${task.title}" was denied`,
                actionUrl: '/admin/tasks',
                relatedId: id,
            })
            sendTaskExtensionDeniedDM(task.assignedTo, task.title, '/admin/tasks').catch(() => {})
        }

        // Delete the companion extension_review task if one exists
        await Db.tasks.deleteOne({ type: 'extension_review', relatedId: id })

        return NextResponse.json({ ok: true })
    }

    if (action === 'start') {
        await Db.tasks.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: 'in_progress' } }
        )
        return NextResponse.json({ ok: true })
    }

    if (action === 'reopen') {
        await Db.tasks.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: 'pending' }, $unset: { completedAt: '', notes: '' } }
        )
        return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// DELETE /api/admin/tasks/[id] — hard delete (creator, J4-Administration, or HQ Staff)
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

    const task = await Db.tasks.findOne({ _id: new ObjectId(id) })
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isElevated = client.hasRoles(me, PERMISSIONS.admin.manageOrbat)
    if (task.assignedBy !== me.id && !isElevated) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await Db.tasks.deleteOne({ _id: new ObjectId(id) })
    return NextResponse.json({ ok: true })
}
