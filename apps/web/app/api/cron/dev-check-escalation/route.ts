import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { createNotification, createNotificationForRole } from '@/lib/notifications'
import { verifyCronSecret } from '@/lib/cron-auth'
import PERMISSIONS from '@/lib/permissions'

const CHECK_SEQUENCE = ['w16', 'w12', 'w10', 'w8', 'w6', 'w4'] as const
const CHECK_WEEKS: Record<string, number> = {
    w16: 16, w12: 12, w10: 10, w8: 8, w6: 6, w4: 4,
}

function checkDueDate(referenceDate: Date, weeksOut: number): Date {
    const d = new Date(referenceDate)
    d.setDate(d.getDate() - weeksOut * 7)
    return d
}

/**
 * GET /api/cron/dev-check-escalation
 *
 * Runs hourly. For each overdue dev_check task:
 *   1. Finds the NEXT check stage's due date.
 *   2. If that date has arrived or passed and no escalation has been sent yet,
 *      fires escalation notifications to J2 Department Leader + HQ Staff,
 *      and creates an escalation task for HQ Staff.
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const tag = '[cron/dev-check-escalation]'
    console.log(`${tag} tick at ${now.toISOString()}`)

    let escalated = 0
    const errors: string[] = []

    // Find all uncompleted dev_check tasks that are overdue (dueDate passed)
    const overdueTasks = await Db.tasks
        .find({
            type: 'dev_check',
            dueDate: { $lte: now },
            completedAt: { $exists: false },
            escalatedAt: { $exists: false },   // not yet escalated
            status: { $nin: ['completed'] },
        } as never)
        .toArray() as Array<Task & { _id: import('mongodb').ObjectId }>

    console.log(`${tag} found ${overdueTasks.length} overdue dev_check tasks to check for escalation`)

    for (const task of overdueTasks) {
        const taskId = task._id.toString()
        const opId   = task.relatedId
        const checkId = (task as any).missionDevCheckId as string | undefined

        if (!opId || !checkId) continue

        const checkIdx = CHECK_SEQUENCE.indexOf(checkId as typeof CHECK_SEQUENCE[number])
        if (checkIdx === -1) continue

        // Find the next stage in sequence
        const nextCheckId = CHECK_SEQUENCE[checkIdx + 1]
        if (!nextCheckId) {
            // This was the final check — escalate regardless when it's overdue more than 7 days
            const sevenDaysLate = new Date(task.dueDate!)
            sevenDaysLate.setDate(sevenDaysLate.getDate() + 7)
            if (now < sevenDaysLate) continue
        } else {
            // Determine if the next stage's date has arrived
            let op: Operation | null = null
            try {
                op = await Db.operations.findOne({ _id: new ObjectId(opId), deletedAt: { $exists: false } })
            } catch { continue }
            if (!op) continue

            let referenceDate = new Date(op.date)
            if (op.campaignId) {
                const campaign = await Db.operationCampaigns.findOne(
                    { _id: new ObjectId(op.campaignId.toString()) },
                    { projection: { startDate: 1 } }
                )
                if (campaign?.startDate) referenceDate = new Date(campaign.startDate)
            }

            const nextCheckWeeks = CHECK_WEEKS[nextCheckId]
            const nextCheckDate  = checkDueDate(referenceDate, nextCheckWeeks)

            // Only escalate when the next stage date has arrived
            if (now < nextCheckDate) continue

            // Escalation fires — mark task
            try {
                await Db.tasks.updateOne(
                    { _id: task._id },
                    { $set: { escalatedAt: now, status: 'overdue' } } as never
                )

                const j2LeaderRole = PERMISSIONS.departmentLeads.j2[0]  // J2 - Department Leader
                const hqRole       = 'HQ Staff'
                const actionUrl    = `/dashboard/j2?tab=4`

                const opTitle = op?.title ?? 'Unknown Operation'
                const body    = `Dev check "${checkId.toUpperCase()}" for "${opTitle}" was missed. The next check stage (${nextCheckId.toUpperCase()}) has now arrived.`

                // Notify J2 Department Leader
                await createNotificationForRole(j2LeaderRole, {
                    type: 'system',
                    title: 'Dev Check Escalation',
                    body,
                    actionUrl,
                    relatedId: taskId,
                })

                // Notify HQ Staff (J4 Admin)
                await createNotificationForRole(hqRole, {
                    type: 'system',
                    title: 'Dev Check Escalation',
                    body,
                    actionUrl,
                    relatedId: taskId,
                })

                // Create an escalation task for HQ Staff
                const escalationTask: Task = {
                    title: `[Escalation] Dev Check ${checkId.toUpperCase()} overdue — ${opTitle}`,
                    description: `The ${checkId.toUpperCase()} development check for "${opTitle}" was not completed before the next stage (${nextCheckId.toUpperCase()}) arrived.\n\nOriginal task ID: ${taskId}`,
                    assignedRole:   hqRole,
                    assignedBy:     'system',
                    assignedByName: 'System',
                    createdAt:      now,
                    status:         'pending',
                    department:     'j2',
                    type:           'dev_check',
                    relatedId:      opId,
                    missionDevCheckId: checkId,
                    actionUrl,
                } as Task

                await Db.tasks.insertOne(escalationTask)

                escalated++
                console.log(`${tag} escalated task ${taskId} (${checkId} for op ${opId})`)
            } catch (err) {
                const msg = `${tag} escalation failed for task ${taskId}: ${(err as Error)?.message ?? err}`
                console.error(msg)
                errors.push(msg)
            }
        }
    }

    const summary = { escalated, errors: errors.length }
    console.log(`${tag} done — ${JSON.stringify(summary)}`)
    return NextResponse.json(summary)
}
