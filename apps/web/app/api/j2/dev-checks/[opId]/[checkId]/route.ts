import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { createNotification } from '@/lib/notifications'
import { sendTaskAssignedDM } from '@/lib/discord/bot'

type Params = { params: Promise<{ opId: string; checkId: string }> }

const CHECK_WEEKS: Record<string, number> = {
    w16: 16, w12: 12, w10: 10, w8: 8, w6: 6, w4: 4,
}

async function authJ2Lead() {
    try {
        const me = await client.fetchMe()
        if (!(await hasPermission(me, 'departmentLeads.j2'))) return null
        return me
    } catch { return null }
}

/** Compute check due date: referenceDate minus weeksOut * 7 days */
function checkDueDate(referenceDate: Date, weeksOut: number): Date {
    const d = new Date(referenceDate)
    d.setDate(d.getDate() - weeksOut * 7)
    return d
}

/**
 * POST /api/j2/dev-checks/[opId]/[checkId]
 * Body: { reviewerId, reviewerName }
 * Assigns a J2 reviewer to a dev check — creates or replaces the task.
 */
export async function POST(req: NextRequest, { params }: Params) {
    const me = await authJ2Lead()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { opId, checkId } = await params
    const weeksOut = CHECK_WEEKS[checkId]
    if (!weeksOut) return NextResponse.json({ error: 'Invalid checkId' }, { status: 400 })

    let body: { reviewerId?: string; reviewerName?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const { reviewerId, reviewerName } = body
    if (!reviewerId || !reviewerName) return NextResponse.json({ error: 'reviewerId + reviewerName required' }, { status: 400 })

    // Fetch the operation
    let op: Operation | null
    try {
        op = await Db.operations.findOne({ _id: new ObjectId(opId), deletedAt: { $exists: false } })
    } catch {
        return NextResponse.json({ error: 'Invalid opId' }, { status: 400 })
    }
    if (!op) return NextResponse.json({ error: 'Operation not found' }, { status: 404 })

    // Determine reference date (campaign start or op date)
    let referenceDate = new Date(op.date)
    if (op.campaignId) {
        const campaign = await Db.operationCampaigns.findOne(
            { _id: new ObjectId(op.campaignId.toString()) },
            { projection: { startDate: 1 } }
        )
        if (campaign?.startDate) referenceDate = new Date(campaign.startDate)
    }

    const dueDate   = checkDueDate(referenceDate, weeksOut)
    // 1-week chaser fires 7 days after the check due date
    const reminder  = new Date(dueDate)
    reminder.setDate(reminder.getDate() + 7)

    const callerName = (me as any).guild?.displayName || (me as any).guild?.nickname
        || (me as any).globalName || (me as any).username || 'Unknown'
    const checkLabel = `W${weeksOut} Development Check`
    const taskTitle  = `[${checkLabel}] ${op.title}`
    const actionUrl  = `/operations/${opId}/edit`

    // Remove any existing task for this op + check (replace)
    await Db.tasks.deleteMany({ type: 'dev_check', relatedId: opId, missionDevCheckId: checkId } as never)

    const task: Task = {
        title: taskTitle,
        description: `${checkLabel} for operation "${op.title}". Review and sign off the mission development check by the due date.`,
        assignedTo:     reviewerId,
        assignedToName: reviewerName,
        assignedBy:     me.id,
        assignedByName: callerName,
        dueDate,
        reminderDateTime: reminder,
        createdAt: new Date(),
        status: 'pending',
        department: 'j2',
        type: 'dev_check',
        relatedId: opId,
        missionDevCheckId: checkId,
        actionUrl,
    } as Task

    const result = await Db.tasks.insertOne(task)
    const taskId = result.insertedId.toString()
    const dueDateStr = dueDate.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })

    // In-app notification to reviewer
    await createNotification({
        userId: reviewerId,
        type: 'task_assigned',
        title: 'Dev Check Assigned',
        body: `You've been assigned the ${checkLabel} for "${op.title}" — due ${dueDateStr}.`,
        actionUrl,
        relatedId: taskId,
    })

    // Discord DM to reviewer
    sendTaskAssignedDM(reviewerId, taskTitle, dueDateStr, actionUrl)
        .catch(err => console.error('[dev-checks] DM failed:', err))

    return NextResponse.json({ ok: true, taskId })
}

/**
 * DELETE /api/j2/dev-checks/[opId]/[checkId]
 * Removes the reviewer assignment for this check.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
    const me = await authJ2Lead()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { opId, checkId } = await params

    const result = await Db.tasks.deleteMany(
        { type: 'dev_check', relatedId: opId, missionDevCheckId: checkId } as never
    )

    return NextResponse.json({ ok: true, deleted: result.deletedCount })
}
