import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { sendTaskReminderDM, sendTaskOverdueDM, sendTaskEscalationDM } from '@/lib/discord/bot'
import { verifyCronSecret } from '@/lib/cron-auth'

/**
 * GET /api/cron/task-reminders
 *
 * Fires every minute (via server.mjs). Each pass handles:
 *   1. Reminder (chase-up) notifications — reminderDateTime has passed, reminderNotifiedAt not yet set
 *   2. Due/overdue notifications   — dueDate has passed, dueNotificationSentAt not yet set
 *   3. Task-limit escalation       — member task counts exceed configured thresholds
 *
 * Using `field: null` instead of `{ $exists: false }` so that both missing fields
 * and explicitly-null fields are matched — prevents missed notifications after restarts.
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const tag = '[cron/task-reminders]'
    console.log(`${tag} tick at ${now.toISOString()}`)

    let remindersFired = 0
    let overduesFired = 0
    let escalationsFired = 0
    const errors: string[] = []

    // ── 1. Chase-up / reminder notifications ─────────────────────────────────
    //
    // Match tasks where:
    //   • reminderDateTime is set and has already passed
    //   • reminderNotifiedAt is null/missing (not yet fired)
    //   • task is not completed (completedAt null/missing)
    //   • not an internal extension_review task
    const reminderTasks = await Db.tasks.find({
        reminderDateTime: { $lte: now },
        reminderNotifiedAt: { $exists: false },
        completedAt: { $exists: false },
        status: { $nin: ['completed'] },
        type: { $ne: 'extension_review' },
    }).toArray()

    console.log(`${tag} reminder check — found ${reminderTasks.length} task(s) due for chase-up`)

    for (const task of reminderTasks) {
        const taskId = task._id!.toString()
        const url = `/dashboard/tasks?taskId=${taskId}`
        const dueDateStr = task.dueDate
            ? new Date(task.dueDate).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
            : 'No due date set'

        const recipientIds = await resolveTaskRecipients(task)
        console.log(`${tag} reminder — task "${task.title}" (${taskId}), recipients: [${recipientIds.join(', ')}]`)

        let notifOk = true
        for (const userId of recipientIds) {
            try {
                await createNotification({
                    userId,
                    type: 'task_reminder',
                    title: 'Task Reminder',
                    body: `Reminder: "${task.title}" is due ${dueDateStr}`,
                    actionUrl: url,
                    relatedId: taskId,
                })
                await sendTaskReminderDM(userId, task.title, dueDateStr, url)
                    .catch(err => {
                        const msg = `${tag} reminder DM failed for user ${userId}: ${err?.message ?? err}`
                        console.error(msg)
                        errors.push(msg)
                    })
                console.log(`${tag} reminder sent — user ${userId}, task "${task.title}"`)
            } catch (err) {
                const msg = `${tag} reminder notification failed for user ${userId}: ${(err as Error)?.message ?? err}`
                console.error(msg)
                errors.push(msg)
                notifOk = false
            }
        }

        // Mark reminderNotifiedAt even if Discord DM failed (website notif succeeded)
        if (notifOk) {
            await Db.tasks.updateOne(
                { _id: task._id as ObjectId },
                { $set: { reminderNotifiedAt: now } }
            )
            remindersFired++
        }
    }

    // ── 2. Due / overdue notifications ────────────────────────────────────────
    //
    // Match tasks where:
    //   • dueDate is set and has passed
    //   • dueNotificationSentAt is null/missing (not yet fired)
    //   • task is not completed
    //   • not an internal helper task
    const overdueTasks = await Db.tasks.find({
        dueDate: { $lte: now },
        dueNotificationSentAt: { $exists: false },
        completedAt: { $exists: false },
        status: { $nin: ['completed'] },
        type: { $ne: 'extension_review' },
    }).toArray()

    console.log(`${tag} overdue check — found ${overdueTasks.length} task(s) now overdue`)

    for (const task of overdueTasks) {
        const taskId = task._id!.toString()
        const url = `/dashboard/tasks?taskId=${taskId}`
        const dueDateStr = task.dueDate
            ? new Date(task.dueDate).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
            : 'Unknown'

        const recipientIds = await resolveTaskRecipients(task)
        console.log(`${tag} overdue — task "${task.title}" (${taskId}), recipients: [${recipientIds.join(', ')}]`)

        for (const userId of recipientIds) {
            try {
                await createNotification({
                    userId,
                    type: 'task_overdue',
                    title: 'Task Overdue',
                    body: `"${task.title}" was due ${dueDateStr} and has not been completed.`,
                    actionUrl: url,
                    relatedId: taskId,
                })
                await sendTaskOverdueDM(userId, task.title, dueDateStr, url)
                    .catch(err => {
                        const msg = `${tag} overdue DM failed for user ${userId}: ${err?.message ?? err}`
                        console.error(msg)
                        errors.push(msg)
                    })
                console.log(`${tag} overdue sent — user ${userId}, task "${task.title}"`)
            } catch (err) {
                const msg = `${tag} overdue notification failed for user ${userId}: ${(err as Error)?.message ?? err}`
                console.error(msg)
                errors.push(msg)
            }
        }

        // Mark as overdue and record notification sent time regardless of DM failure
        await Db.tasks.updateOne(
            { _id: task._id as ObjectId },
            { $set: { status: 'overdue', dueNotificationSentAt: now } }
        )
        overduesFired++
    }

    // ── 3. Task-limit escalation ──────────────────────────────────────────────
    const policyDoc = await Db.notifPolicyConfig.findOne({ type: 'task_limit_policy' } as never)
    if (policyDoc) {
        const policy = policyDoc as unknown as TaskLimitPolicy

        // Count incomplete tasks per member (including role-based assignments)
        const activeTasks = await Db.tasks.find({
            completedAt: { $exists: false },
            status: { $nin: ['completed'] },
            type: { $ne: 'extension_review' },
        }, { projection: { assignedTo: 1, assignedRole: 1, _id: 1 } }).toArray()

        const memberTaskCounts: Record<string, number> = {}

        for (const task of activeTasks) {
            if (task.assignedTo) {
                memberTaskCounts[task.assignedTo] = (memberTaskCounts[task.assignedTo] ?? 0) + 1
            }
            if (task.assignedRole) {
                const roleUsers = await Db.users
                    .find({ 'guild.roles': task.assignedRole, discharged: { $exists: false } }, { projection: { id: 1 } })
                    .toArray()
                for (const u of roleUsers) {
                    const uid = u.id as string
                    if (uid && uid !== task.assignedTo) {
                        memberTaskCounts[uid] = (memberTaskCounts[uid] ?? 0) + 1
                    }
                }
            }
        }

        for (const [memberId, count] of Object.entries(memberTaskCounts)) {
            const user = await Db.users.findOne({ id: memberId }, {
                projection: { 'guild.roles': 1, 'guild.displayName': 1, 'guild.nickname': 1, globalName: 1, username: 1 }
            })
            if (!user) continue

            const memberName = user.guild?.nickname || user.guild?.displayName || user.globalName || user.username || memberId
            const memberRoles: string[] = user.guild?.roles ?? []
            const group = resolveEscalationGroup(memberRoles, policy)
            if (!group) continue

            // Find the current escalation level for this member
            const representative = await Db.tasks.findOne(
                { assignedTo: memberId, completedAt: { $exists: false } },
                { projection: { escalationLevel: 1 } }
            )
            const currentLevel = (representative as unknown as { escalationLevel?: number })?.escalationLevel ?? 0

            let targetLevel = 0
            let recipientRoles: string[] = []
            if (group.secondThreshold && count >= group.secondThreshold) {
                targetLevel = 2
                recipientRoles = group.secondRecipientRoles ?? []
            } else if (group.firstThreshold && count >= group.firstThreshold) {
                targetLevel = 1
                recipientRoles = group.firstRecipientRoles ?? []
            }

            if (targetLevel > 0 && targetLevel > currentLevel && recipientRoles.length > 0) {
                const viewUrl = `/dashboard/tasks?view=all`
                const threshold = targetLevel === 2 ? group.secondThreshold! : group.firstThreshold!

                for (const role of recipientRoles) {
                    const staffUsers = await Db.users
                        .find({ 'guild.roles': role, discharged: { $exists: false } }, { projection: { id: 1 } })
                        .toArray()
                    for (const staff of staffUsers as Array<{ id: string }>) {
                        const staffId = staff.id as string
                        if (!staffId || staffId === memberId) continue
                        await createNotification({
                            userId: staffId,
                            type: 'system',
                            title: 'Task Limit Escalation',
                            body: `${memberName} has ${count} incomplete tasks (threshold: ${threshold})`,
                            actionUrl: viewUrl,
                            relatedId: memberId,
                        })
                        await sendTaskEscalationDM(staffId, memberName, count, threshold, viewUrl)
                            .catch(err => console.error(`${tag} escalation DM failed for ${staffId}:`, err))
                    }
                }

                await Db.tasks.updateMany(
                    { assignedTo: memberId, completedAt: { $exists: false } },
                    { $set: { escalationLevel: targetLevel, escalationNotifiedAt: now } }
                )
                escalationsFired++
                console.log(`${tag} escalation level ${targetLevel} fired for member ${memberName} (${count} tasks)`)
            }
        }
    }

    const summary = { remindersFired, overduesFired, escalationsFired, errors: errors.length }
    console.log(`${tag} done — ${JSON.stringify(summary)}`)
    return NextResponse.json(summary)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve all Discord user IDs that should receive notifications for a task. Deduplicates. */
async function resolveTaskRecipients(task: Task): Promise<string[]> {
    const ids = new Set<string>()

    if (task.assignedTo) ids.add(task.assignedTo)

    if (task.assignedRole) {
        const members = await Db.users
            .find(
                { 'guild.roles': task.assignedRole, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } },
                { projection: { id: 1 } }
            )
            .toArray()
        for (const m of members) {
            if (m.id) ids.add(m.id as string)
        }
    }

    return Array.from(ids)
}

// ── Task limit policy types ───────────────────────────────────────────────────

interface EscalationGroup {
    roles: string[]
    firstThreshold?: number
    firstRecipientRoles?: string[]
    secondThreshold?: number
    secondRecipientRoles?: string[]
}

interface TaskLimitPolicy {
    type: 'task_limit_policy'
    groups: EscalationGroup[]
}

function resolveEscalationGroup(memberRoles: string[], policy: TaskLimitPolicy): EscalationGroup | null {
    for (const group of policy.groups ?? []) {
        if (group.roles.some(r => memberRoles.includes(r))) return group
    }
    return null
}
