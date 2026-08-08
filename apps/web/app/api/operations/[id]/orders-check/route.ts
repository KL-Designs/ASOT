import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotificationForRole, createNotification } from '@/lib/notifications'
import { sendTaskAssignedDM } from '@/lib/discord/bot'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/operations/[id]/orders-check
 * Returns the active orders_check task for this operation, if any.
 */
export async function GET(req: NextRequest, { params }: Params) {
    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.departments.j2)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const task = await Db.tasks.findOne(
        { type: 'orders_check', relatedId: id, completedAt: { $exists: false } } as never,
        { projection: { status: 1, ordersCheckAt: 1, ordersCheckStatus: 1, ordersCheckProposedAt: 1, ordersCheckProposedBy: 1 } }
    )

    return NextResponse.json({
        task: task
            ? {
                _id: (task as any)._id.toString(),
                status: (task as any).status,
                ordersCheckAt: (task as any).ordersCheckAt,
                ordersCheckStatus: (task as any).ordersCheckStatus,
                ordersCheckProposedAt: (task as any).ordersCheckProposedAt,
                ordersCheckProposedBy: (task as any).ordersCheckProposedBy,
            }
            : null,
    })
}

/**
 * POST /api/operations/[id]/orders-check
 * Body: { preferredAt: string (ISO), comments?: string }
 *
 * Mission maker (J2 member) requests an orders check from J2 leads.
 * Creates an 'orders_check' task visible to J2 leads.
 */
export async function POST(req: NextRequest, { params }: Params) {
    let me: User
    try {
        me = await client.fetchMe()
        // Any J2 member or J4 can request an orders check
        if (!client.hasRoles(me, PERMISSIONS.departments.j2)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    let body: { preferredAt?: string; comments?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const { preferredAt, comments } = body
    if (!preferredAt) return NextResponse.json({ error: 'preferredAt required' }, { status: 400 })

    // Validate ISO date
    const scheduledDate = new Date(preferredAt)
    if (isNaN(scheduledDate.getTime())) {
        return NextResponse.json({ error: 'Invalid preferredAt date' }, { status: 400 })
    }

    let op: Operation | null
    try {
        op = await Db.operations.findOne({ _id: new ObjectId(id), deletedAt: { $exists: false } })
    } catch {
        return NextResponse.json({ error: 'Invalid operation id' }, { status: 400 })
    }
    if (!op) return NextResponse.json({ error: 'Operation not found' }, { status: 404 })

    // Check no existing pending/in_progress orders check for this op
    const existing = await Db.tasks.findOne({
        type: 'orders_check',
        relatedId: id,
        completedAt: { $exists: false },
    } as never)
    if (existing) {
        return NextResponse.json({ error: 'An orders check is already in progress for this operation' }, { status: 409 })
    }

    const callerName = (me as any).guild?.displayName || (me as any).guild?.nickname
        || (me as any).globalName || (me as any).username || 'Unknown'

    const preferredStr = scheduledDate.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
    const taskTitle  = `[Orders Check] ${op.title}`
    const actionUrl  = `/operations/${id}/edit`
    const j2LeadRole = PERMISSIONS.departmentLeads.j2[0]  // 'J2 - Department Leader'

    const task: Task = {
        title: taskTitle,
        description: `${callerName} has requested an orders check for "${op.title}".\n\nPreferred time: ${preferredStr}${comments ? `\n\nComments: ${comments}` : ''}`,
        assignedRole:   j2LeadRole,
        assignedBy:     me.id,
        assignedByName: callerName,
        dueDate:        scheduledDate,
        createdAt:      new Date(),
        status:         'pending',
        department:     'j2',
        type:           'orders_check',
        relatedId:      id,
        ordersCheckAt:     preferredAt,
        ordersCheckStatus: 'pending',
        actionUrl,
    } as Task

    const result = await Db.tasks.insertOne(task)
    const taskId = result.insertedId.toString()

    // In-app notifications to all J2 leads
    await createNotificationForRole(j2LeadRole, {
        type: 'task_assigned',
        title: 'Orders Check Requested',
        body: `${callerName} has requested an orders check for "${op.title}" — preferred time: ${preferredStr}.`,
        actionUrl,
        relatedId: taskId,
    })

    // Discord DMs to all J2 leads
    const j2Leads = await Db.users
        .find({ 'guild.roles': j2LeadRole, discharged: { $exists: false } }, { projection: { id: 1 } })
        .toArray()
    for (const lead of j2Leads as Array<{ id: string }>) {
        if (lead.id) {
            sendTaskAssignedDM(lead.id, taskTitle, preferredStr, actionUrl)
                .catch(err => console.error('[orders-check] DM failed for', lead.id, err))
        }
    }

    return NextResponse.json({ ok: true, taskId })
}

/**
 * DELETE /api/operations/[id]/orders-check?taskId=...
 *
 * Mission maker cancels their orders check request.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
    let me: User
    try {
        me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.departments.j2)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const taskId = req.nextUrl.searchParams.get('taskId')
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

    let task: Task | null
    try {
        task = await Db.tasks.findOne({ _id: new ObjectId(taskId), type: 'orders_check', relatedId: id } as never)
    } catch {
        return NextResponse.json({ error: 'Invalid taskId' }, { status: 400 })
    }
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    if ((task as any).completedAt) return NextResponse.json({ error: 'Already completed' }, { status: 400 })

    // Only the requester (or J4/admin via override) can cancel
    const isLead = client.hasRoles(me, PERMISSIONS.departmentLeads.j2)
    if (task.assignedBy !== me.id && !isLead) {
        return NextResponse.json({ error: 'Only the requester can cancel' }, { status: 403 })
    }

    await Db.tasks.updateOne(
        { _id: new ObjectId(taskId) },
        { $set: { completedAt: new Date(), status: 'completed', ordersCheckStatus: 'cancelled' } } as never
    )

    const callerName = (me as any).guild?.displayName || (me as any).guild?.nickname
        || (me as any).globalName || (me as any).username || 'Unknown'
    const opName = task.title.replace('[Orders Check] ', '')
    const j2LeadRole = PERMISSIONS.departmentLeads.j2[0]

    await createNotificationForRole(j2LeadRole, {
        type: 'system',
        title: 'Orders Check Cancelled',
        body: `${callerName} has cancelled the orders check request for "${opName}".`,
        actionUrl: task.actionUrl,
        relatedId: taskId,
    })

    return NextResponse.json({ ok: true })
}

/**
 * PATCH /api/operations/[id]/orders-check
 * Body: { taskId, action: 'confirm' | 'propose' | 'set_reminder', proposedAt?: string, note?: string }
 *
 * J2 lead confirms or proposes an alternative time.
 * Any J2 member can use 'set_reminder' to store a personal reminder time.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
    let me: User
    try {
        me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.departments.j2)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    let body: { taskId?: string; action?: 'confirm' | 'propose' | 'set_reminder'; proposedAt?: string; note?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const { taskId, action, proposedAt, note } = body
    if (!taskId || !action) return NextResponse.json({ error: 'taskId + action required' }, { status: 400 })

    let task: Task | null
    try {
        task = await Db.tasks.findOne({ _id: new ObjectId(taskId), type: 'orders_check', relatedId: id } as never)
    } catch {
        return NextResponse.json({ error: 'Invalid taskId' }, { status: 400 })
    }
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    // 'set_reminder' is available to any J2 member (already gated above)
    if (action === 'set_reminder') {
        if (!proposedAt) return NextResponse.json({ error: 'proposedAt required' }, { status: 400 })
        const reminderDate = new Date(proposedAt)
        if (isNaN(reminderDate.getTime())) return NextResponse.json({ error: 'Invalid proposedAt' }, { status: 400 })
        await Db.tasks.updateOne(
            { _id: new ObjectId(taskId) },
            { $set: { ordersCheckMakerReminderAt: proposedAt, ordersCheckMakerReminderFiredAt: null } } as never
        )
        return NextResponse.json({ ok: true })
    }

    // 'confirm' and 'propose' require J2 Lead
    if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j2)) {
        return NextResponse.json({ error: 'Forbidden: J2 Lead required' }, { status: 403 })
    }

    const callerName = (me as any).guild?.displayName || (me as any).guild?.nickname
        || (me as any).globalName || (me as any).username || 'Unknown'

    if (action === 'confirm') {
        await Db.tasks.updateOne(
            { _id: new ObjectId(taskId) },
            { $set: { ordersCheckStatus: 'confirmed' } } as never
        )

        // Notify requester if identifiable
        if (task.assignedBy) {
            const confirmedStr = task.ordersCheckAt
                ? new Date(task.ordersCheckAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
                : 'the proposed time'

            await createNotification({
                userId: task.assignedBy,
                type: 'system',
                title: 'Orders Check Confirmed',
                body: `${callerName} has confirmed your orders check for "${task.title.replace('[Orders Check] ', '')}" at ${confirmedStr}.`,
                actionUrl: task.actionUrl,
                relatedId: taskId,
            })
        }

        return NextResponse.json({ ok: true, status: 'confirmed' })
    }

    if (action === 'propose') {
        if (!proposedAt) return NextResponse.json({ error: 'proposedAt required for propose action' }, { status: 400 })
        const proposedDate = new Date(proposedAt)
        if (isNaN(proposedDate.getTime())) return NextResponse.json({ error: 'Invalid proposedAt' }, { status: 400 })

        await Db.tasks.updateOne(
            { _id: new ObjectId(taskId) },
            {
                $set: {
                    ordersCheckStatus:     'proposed',
                    ordersCheckProposedAt: proposedAt,
                    ordersCheckProposedBy: callerName,
                    dueDate:               proposedDate,
                },
            } as never
        )

        const proposedStr = proposedDate.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
        if (task.assignedBy) {
            await createNotification({
                userId: task.assignedBy,
                type: 'system',
                title: 'Orders Check — Alternative Time Proposed',
                body: `${callerName} has proposed an alternative time for your orders check: ${proposedStr}.${note ? ` Note: ${note}` : ''}`,
                actionUrl: task.actionUrl,
                relatedId: taskId,
            })
        }

        return NextResponse.json({ ok: true, status: 'proposed' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
