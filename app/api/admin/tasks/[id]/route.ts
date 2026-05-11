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
    sendTaskExtensionAlternativeDM,
    sendTaskReassignmentRequestDM,
    sendTaskReassignmentOutcomeDM,
    sendTaskDeleteRequestDM,
    sendTaskDeleteOutcomeDM,
} from '@/lib/discord/bot'

/** Deep-link URL for a specific task — opens My Tasks tab and expands the task. */
function taskUrl(taskId: string) {
    return `/dashboard/tasks?taskId=${taskId}`
}

// PATCH /api/admin/tasks/[id]
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

    // ── complete ──────────────────────────────────────────────────────────────
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
                actionUrl: taskUrl(id),
                relatedId: id,
            })
        }

        return NextResponse.json({ ok: true })
    }

    // ── extend (creator extends due date directly) ────────────────────────────
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

        if (task.assignedTo && task.assignedTo !== me.id) {
            const dateStr = newDue.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
            await createNotification({
                userId: task.assignedTo,
                type: 'task_extended',
                title: 'Task due date extended',
                body: `"${task.title}" has been extended to ${dateStr}`,
                actionUrl: taskUrl(id),
                relatedId: id,
            })
        }

        return NextResponse.json({ ok: true })
    }

    // ── request_extension ─────────────────────────────────────────────────────
    if (action === 'request_extension') {
        const { requestedDate, reason } = body
        if (!requestedDate) return NextResponse.json({ error: 'requestedDate is required' }, { status: 400 })
        if (!reason?.trim()) return NextResponse.json({ error: 'reason is required' }, { status: 400 })

        const newDue = new Date(requestedDate)
        if (isNaN(newDue.getTime())) return NextResponse.json({ error: 'Invalid requestedDate' }, { status: 400 })

        // Must be after current due date
        if (task.dueDate && newDue <= new Date(task.dueDate)) {
            return NextResponse.json({ error: 'Requested date must be after the current due date' }, { status: 400 })
        }

        const requesterName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
        const formattedDate = newDue.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })

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
            const reviewTaskUrl = taskUrl(id)
            await Db.tasks.insertOne({
                title: `Extension request: ${task.title}`,
                description: `**${requesterName}** has requested a due-date extension.\n\nRequested date/time: ${formattedDate}\nReason: ${reason.trim()}`,
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
                actionUrl: reviewTaskUrl,
                relatedId: id,
            })
            sendTaskExtensionRequestDM(
                task.assignedBy,
                task.title,
                requesterName,
                formattedDate,
                reason.trim(),
                reviewTaskUrl,
            ).catch(() => {})
        }

        return NextResponse.json({ ok: true })
    }

    // ── approve_extension_review / deny_extension_review / suggest_alternative_review ──
    if (
        action === 'approve_extension_review' ||
        action === 'deny_extension_review' ||
        action === 'suggest_alternative_review'
    ) {
        if (!task.relatedId || !ObjectId.isValid(task.relatedId)) {
            return NextResponse.json({ error: 'Invalid relatedId' }, { status: 400 })
        }

        const originalTask = await Db.tasks.findOne({ _id: new ObjectId(task.relatedId) })
        if (!originalTask) return NextResponse.json({ error: 'Original task not found' }, { status: 404 })

        const extReq = originalTask.extensionRequest
        if (!extReq || extReq.status !== 'pending') {
            return NextResponse.json({ error: 'No pending extension request on original task' }, { status: 400 })
        }

        // Delegate to the matching direct action
        const delegateAction =
            action === 'approve_extension_review' ? 'approve_extension' :
            action === 'deny_extension_review'    ? 'deny_extension' :
                                                    'suggest_alternative'

        // Forward the same body but with the delegated action and resolved task ID
        return handleExtensionDecision(delegateAction, task.relatedId, originalTask, body, me, id)
    }

    // ── approve_extension / deny_extension / suggest_alternative ─────────────
    if (
        action === 'approve_extension' ||
        action === 'deny_extension' ||
        action === 'suggest_alternative'
    ) {
        if (task.assignedBy !== me.id) {
            const isElevated = client.hasRoles(me, PERMISSIONS.admin.manageOrbat)
            if (!isElevated) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const extReq = task.extensionRequest
        if (!extReq || extReq.status !== 'pending') {
            return NextResponse.json({ error: 'No pending extension request' }, { status: 400 })
        }

        return handleExtensionDecision(action, id, task, body, me, null)
    }

    // ── request_reassignment ──────────────────────────────────────────────────
    if (action === 'request_reassignment') {
        const { requestedToId, requestedToName, reason } = body
        if (!requestedToId?.trim()) return NextResponse.json({ error: 'requestedToId is required' }, { status: 400 })
        if (!reason?.trim()) return NextResponse.json({ error: 'Reason is required' }, { status: 400 })

        // Only the assignee can request reassignment
        if (task.assignedTo !== me.id) {
            return NextResponse.json({ error: 'Only the assigned member can request reassignment' }, { status: 403 })
        }
        if (task.reassignmentRequest?.status === 'pending') {
            return NextResponse.json({ error: 'A reassignment request is already pending' }, { status: 400 })
        }

        const requesterName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

        await Db.tasks.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    reassignmentRequest: {
                        requestedToId: requestedToId.trim(),
                        requestedToName: requestedToName?.trim() ?? requestedToId.trim(),
                        reason: reason.trim(),
                        requestedAt: new Date(),
                        status: 'pending',
                    },
                },
            }
        )

        if (task.assignedBy && task.assignedBy !== 'system') {
            await createNotification({
                userId: task.assignedBy,
                type: 'task_reassignment_requested',
                title: 'Reassignment request',
                body: `${requesterName} requested reassignment of "${task.title}" to ${requestedToName ?? requestedToId}`,
                actionUrl: taskUrl(id),
                relatedId: id,
            })
            sendTaskReassignmentRequestDM(
                task.assignedBy,
                task.title,
                requesterName,
                requestedToName ?? requestedToId,
                reason.trim(),
                taskUrl(id),
            ).catch(() => {})
        }

        return NextResponse.json({ ok: true })
    }

    // ── approve_reassignment / deny_reassignment / redirect_reassignment ──────
    if (
        action === 'approve_reassignment' ||
        action === 'deny_reassignment' ||
        action === 'redirect_reassignment'
    ) {
        if (task.assignedBy !== me.id) {
            const isElevated = client.hasRoles(me, PERMISSIONS.admin.manageOrbat)
            if (!isElevated) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const reassign = task.reassignmentRequest
        if (!reassign || reassign.status !== 'pending') {
            return NextResponse.json({ error: 'No pending reassignment request' }, { status: 400 })
        }

        const { approverNote, newAssigneeId, newAssigneeName, newDueDate, newReminderDate } = body
        const originalAssigneeId = task.assignedTo
        const originalAssigneeName = task.assignedToName

        if (action === 'deny_reassignment') {
            await Db.tasks.updateOne(
                { _id: new ObjectId(id) },
                { $set: { 'reassignmentRequest.status': 'denied', 'reassignmentRequest.approverNote': approverNote ?? '' } }
            )
            if (originalAssigneeId) {
                await createNotification({
                    userId: originalAssigneeId,
                    type: 'task_reassignment_denied',
                    title: 'Reassignment denied',
                    body: `Your request to reassign "${task.title}" was denied${approverNote ? `: ${approverNote}` : ''}`,
                    actionUrl: taskUrl(id),
                    relatedId: id,
                })
                sendTaskReassignmentOutcomeDM(originalAssigneeId, task.title, 'denied', approverNote ?? null, null, taskUrl(id)).catch(() => {})
            }
            return NextResponse.json({ ok: true })
        }

        // approve or redirect
        const finalId   = action === 'redirect_reassignment' ? (newAssigneeId ?? reassign.requestedToId) : reassign.requestedToId
        const finalName = action === 'redirect_reassignment' ? (newAssigneeName ?? reassign.requestedToName) : reassign.requestedToName

        const updateFields: Record<string, unknown> = {
            assignedTo:     finalId,
            assignedToName: finalName,
            'reassignmentRequest.status':       action === 'redirect_reassignment' ? 'redirected' : 'approved',
            'reassignmentRequest.approverNote': approverNote ?? '',
            'reassignmentRequest.finalAssigneeId':   finalId,
            'reassignmentRequest.finalAssigneeName': finalName,
        }
        if (newDueDate) updateFields.dueDate = new Date(newDueDate)
        if (newReminderDate) updateFields.reminderDateTime = new Date(newReminderDate)

        await Db.tasks.updateOne({ _id: new ObjectId(id) }, { $set: updateFields })

        // Notify original assignee
        if (originalAssigneeId && originalAssigneeId !== finalId) {
            await createNotification({
                userId: originalAssigneeId,
                type: 'task_reassignment_approved',
                title: 'Task reassigned',
                body: `"${task.title}" has been reassigned to ${finalName}`,
                actionUrl: taskUrl(id),
                relatedId: id,
            })
            sendTaskReassignmentOutcomeDM(originalAssigneeId, task.title, 'approved', approverNote ?? null, finalName, taskUrl(id)).catch(() => {})
        }

        // Notify new assignee
        if (finalId && finalId !== originalAssigneeId) {
            await createNotification({
                userId: finalId,
                type: 'task_assigned',
                title: 'Task assigned to you',
                body: `"${task.title}" has been assigned to you`,
                actionUrl: taskUrl(id),
                relatedId: id,
            })
            sendTaskReassignmentOutcomeDM(finalId, task.title, 'new_assignment', null, null, taskUrl(id)).catch(() => {})
        }

        return NextResponse.json({ ok: true })
    }

    // ── start ─────────────────────────────────────────────────────────────────
    if (action === 'start') {
        await Db.tasks.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: 'in_progress', startedAt: new Date() } }
        )
        return NextResponse.json({ ok: true })
    }

    // ── request_delete (assignee requests creator approve deletion) ───────────
    if (action === 'request_delete') {
        // Creator can delete directly — this action is only for non-creators
        if (task.assignedBy === me.id) {
            return NextResponse.json({ error: 'Use DELETE directly to remove your own task' }, { status: 400 })
        }
        if (task.deleteRequest?.status === 'pending') {
            return NextResponse.json({ error: 'A delete request is already pending' }, { status: 400 })
        }

        const { reason } = body
        if (!reason?.trim()) {
            return NextResponse.json({ error: 'A reason is required for a delete request.' }, { status: 400 })
        }
        const requesterName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

        await Db.tasks.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    deleteRequest: {
                        reason: reason.trim(),
                        requestedAt: new Date(),
                        requestedById: me.id,
                        requestedByName: requesterName,
                        status: 'pending',
                    },
                },
            }
        )

        if (task.assignedBy && task.assignedBy !== 'system') {
            await createNotification({
                userId: task.assignedBy,
                type: 'task_delete_requested',
                title: 'Delete request',
                body: `${requesterName} requested deletion of "${task.title}"`,
                actionUrl: taskUrl(id),
                relatedId: id,
            })
            sendTaskDeleteRequestDM(task.assignedBy, task.title, requesterName, reason?.trim() ?? '', taskUrl(id)).catch(() => {})
        }

        return NextResponse.json({ ok: true })
    }

    // ── approve_delete ────────────────────────────────────────────────────────
    if (action === 'approve_delete') {
        if (task.assignedBy !== me.id) {
            const isElevated = client.hasRoles(me, PERMISSIONS.admin.manageOrbat)
            if (!isElevated) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        if (!task.deleteRequest || task.deleteRequest.status !== 'pending') {
            return NextResponse.json({ error: 'No pending delete request' }, { status: 400 })
        }

        const { approverNote } = body
        const requesterId = task.deleteRequest.requestedById

        // Notify the requester that deletion was approved before deleting
        if (requesterId) {
            await createNotification({
                userId: requesterId,
                type: 'task_delete_approved',
                title: 'Delete request approved',
                body: `Your request to delete "${task.title}" was approved`,
                actionUrl: '/dashboard/tasks',
                relatedId: id,
            })
            sendTaskDeleteOutcomeDM(requesterId, task.title, 'approved', approverNote ?? null).catch(() => {})
        }

        await Db.tasks.deleteOne({ _id: new ObjectId(id) })
        return NextResponse.json({ ok: true })
    }

    // ── deny_delete ───────────────────────────────────────────────────────────
    if (action === 'deny_delete') {
        if (task.assignedBy !== me.id) {
            const isElevated = client.hasRoles(me, PERMISSIONS.admin.manageOrbat)
            if (!isElevated) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        if (!task.deleteRequest || task.deleteRequest.status !== 'pending') {
            return NextResponse.json({ error: 'No pending delete request' }, { status: 400 })
        }

        const { approverNote } = body

        await Db.tasks.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    'deleteRequest.status': 'denied',
                    'deleteRequest.approverNote': approverNote ?? '',
                },
            }
        )

        const requesterId = task.deleteRequest.requestedById
        if (requesterId) {
            await createNotification({
                userId: requesterId,
                type: 'task_delete_denied',
                title: 'Delete request denied',
                body: `Your request to delete "${task.title}" was denied${approverNote ? `. Note: ${approverNote}` : ''}`,
                actionUrl: taskUrl(id),
                relatedId: id,
            })
            sendTaskDeleteOutcomeDM(requesterId, task.title, 'denied', approverNote ?? null, taskUrl(id)).catch(() => {})
        }

        return NextResponse.json({ ok: true })
    }

    // ── reopen ────────────────────────────────────────────────────────────────
    if (action === 'reopen') {
        await Db.tasks.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: 'pending' }, $unset: { completedAt: '', notes: '' } }
        )
        return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ── Shared extension decision handler ─────────────────────────────────────────

async function handleExtensionDecision(
    action: string,
    taskId: string,
    task: Task,
    body: Record<string, unknown>,
    me: User,
    reviewTaskIdToDelete: string | null,
): Promise<NextResponse> {
    const extReq = task.extensionRequest!
    const { approverNote, alternativeDate, alternativeReminderDate } = body as Record<string, string>

    const url = taskUrl(taskId)
    const taskObjId = new ObjectId(taskId)

    if (action === 'approve_extension') {
        const approvedDate = extReq.requestedDate instanceof Date ? extReq.requestedDate : new Date(extReq.requestedDate)
        const dateStr = approvedDate.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })

        await Db.tasks.updateOne(
            { _id: taskObjId },
            {
                $set: {
                    dueDate: approvedDate,
                    extendedAt: new Date(),
                    'extensionRequest.status': 'approved',
                    'extensionRequest.approverNote': approverNote ?? '',
                    ...(task.originalDueDate ? {} : { originalDueDate: task.dueDate }),
                },
            }
        )

        if (task.assignedTo) {
            await createNotification({
                userId: task.assignedTo,
                type: 'task_extension_approved',
                title: 'Extension approved',
                body: `Your extension for "${task.title}" was approved. New due date: ${dateStr}${approverNote ? `. Note: ${approverNote}` : ''}`,
                actionUrl: url,
                relatedId: taskId,
            })
            sendTaskExtensionApprovedDM(task.assignedTo, task.title, dateStr, url).catch(() => {})
        }
    } else if (action === 'deny_extension') {
        await Db.tasks.updateOne(
            { _id: taskObjId },
            { $set: { 'extensionRequest.status': 'denied', 'extensionRequest.approverNote': approverNote ?? '' } }
        )

        if (task.assignedTo) {
            await createNotification({
                userId: task.assignedTo,
                type: 'task_extension_denied',
                title: 'Extension denied',
                body: `Your extension request for "${task.title}" was denied${approverNote ? `. Note: ${approverNote}` : ''}`,
                actionUrl: url,
                relatedId: taskId,
            })
            sendTaskExtensionDeniedDM(task.assignedTo, task.title, url).catch(() => {})
        }
    } else if (action === 'suggest_alternative') {
        if (!alternativeDate) {
            return NextResponse.json({ error: 'alternativeDate is required for suggest_alternative' }, { status: 400 })
        }
        const altDate = new Date(alternativeDate)
        if (isNaN(altDate.getTime())) {
            return NextResponse.json({ error: 'Invalid alternativeDate' }, { status: 400 })
        }
        const altDateStr = altDate.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
        const altReminder = alternativeReminderDate ? new Date(alternativeReminderDate) : undefined

        await Db.tasks.updateOne(
            { _id: taskObjId },
            {
                $set: {
                    'extensionRequest.status': 'alternative',
                    'extensionRequest.approverNote': approverNote ?? '',
                    'extensionRequest.alternativeDate': altDate,
                    ...(altReminder ? { 'extensionRequest.alternativeReminderDate': altReminder } : {}),
                },
            }
        )

        if (task.assignedTo) {
            await createNotification({
                userId: task.assignedTo,
                type: 'task_extension_alternative',
                title: 'Alternative due date suggested',
                body: `Your request for "${task.title}" — a different date has been suggested: ${altDateStr}${approverNote ? `. Note: ${approverNote}` : ''}`,
                actionUrl: url,
                relatedId: taskId,
            })
            sendTaskExtensionAlternativeDM(task.assignedTo, task.title, altDateStr, approverNote ?? '', url).catch(() => {})
        }
    }

    // Clean up review task if this was called from a review task
    if (reviewTaskIdToDelete) {
        await Db.tasks.deleteOne({ _id: new ObjectId(reviewTaskIdToDelete) })
    } else {
        // Direct action — delete any companion review task
        await Db.tasks.deleteOne({ type: 'extension_review', relatedId: taskId })
    }

    const approverName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    return NextResponse.json({ ok: true, approverName })
}

// DELETE /api/admin/tasks/[id]
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
