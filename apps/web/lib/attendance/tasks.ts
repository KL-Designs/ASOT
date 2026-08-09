import type { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { getSectionLeaders } from '@/lib/orbat'
import { sendTaskAssignedDM } from '@/lib/discord/bot'

/**
 * Creates attendance-confirmation tasks for every section leader
 * (isSenior ORBAT position) whose category is in the attendance doc's
 * assignedPlatoons. Safe to call from both the cron and the manual
 * confirmation-open handler. Swallows errors so callers are never broken.
 */
export async function createAttendanceTasksForOperation(
    operationId: ObjectId,
    attendanceAssignedPlatoons: string[],
    confirmationOpenedAt: Date,
): Promise<void> {
    try {
        if (!attendanceAssignedPlatoons.length) return

        const operation = await Db.operations.findOne({ _id: operationId })
        if (!operation) return

        // Always include companyHQ so CHQ receives tasks regardless of assignedPlatoons
        const categories = Array.from(new Set([...attendanceAssignedPlatoons, 'companyHQ']))
        const leaders = await getSectionLeaders(categories)

        if (!leaders.length) return

        const dueDate = new Date(confirmationOpenedAt.getTime() + 24 * 60 * 60 * 1000)
        const taskTitle = `Confirm attendance — ${operation.title}`
        const actionUrl = `/operations/${operation._id}`

        for (const leader of leaders) {
            if (!leader.userId) continue

            // Skip if an attendance task for this operation already exists for this leader
            const existing = await Db.tasks.findOne({
                type: 'attendance',
                relatedId: operation._id.toString(),
                assignedTo: leader.userId,
            })
            if (existing) continue

            const description = `Attendance confirmations are open for ${leader.sectionTitle}. Please confirm your section's attendance before the window closes.`
            // Chase-up reminder fires halfway through the confirmation window (12h in)
            const chaseUpAt = new Date(confirmationOpenedAt.getTime() + 12 * 60 * 60 * 1000)

            const insertResult = await Db.tasks.insertOne({
                title: taskTitle,
                description,
                assignedTo: leader.userId,
                assignedBy: 'system',
                assignedByName: 'System',
                type: 'attendance',
                actionUrl,
                relatedId: operation._id.toString(),
                dueDate,
                reminderDateTime: chaseUpAt,
                status: 'pending',
                createdAt: confirmationOpenedAt,
            } as Task)
            await createNotification({
                userId: leader.userId,
                type: 'task_assigned',
                title: taskTitle,
                body: description,
                actionUrl,
                relatedId: insertResult.insertedId.toString(),
            })
            sendTaskAssignedDM(leader.userId, taskTitle, description, actionUrl).catch(err =>
                console.error('[attendance-tasks] DM failed for', leader.userId, err)
            )
        }

        console.log(
            `[attendance-tasks] Created ${leaders.length} task(s) for op="${operation.title}"`,
        )
    } catch (err) {
        console.error('[attendance-tasks] Failed to create attendance tasks:', err)
    }
}
