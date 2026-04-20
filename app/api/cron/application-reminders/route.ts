import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { sendDM } from '@/lib/discord/bot'

/**
 * GET /api/cron/application-reminders?secret=...
 *
 * Finds all J1 applications that are still "reviewing" past their reviewDueAt
 * deadline and haven't yet been reminded. Marks the linked task as overdue,
 * notifies the assigned recruiter and the J1 Lead who assigned them.
 *
 * Call on a schedule every 15 minutes via an external cron service.
 */
export async function GET(request: NextRequest) {
    const secret = request.nextUrl.searchParams.get('secret')
    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()

    const overdue = await Db.j1Applications.find({
        status: 'reviewing',
        reviewDueAt: { $lte: now },
        overdueReminderSentAt: { $exists: false },
        assignedReviewerId: { $exists: true, $ne: undefined },
    }).toArray()

    if (overdue.length === 0) return NextResponse.json({ reminded: 0 })

    await Promise.all(overdue.map(async app => {
        const appId = (app._id as ObjectId).toString()
        const applicantName = app.inGameName?.trim() || app.discordUsername || 'Unknown Applicant'
        const recruiterName = app.assignedReviewerName ?? app.assignedReviewerId ?? 'Recruiter'

        // Mark the linked task as overdue
        await Db.tasks.updateOne(
            { type: 'application_review', relatedId: appId },
            { $set: { status: 'overdue' } }
        ).catch(err => console.error('[application-reminders] Task update failed:', err))

        // Notify recruiter
        if (app.assignedReviewerId) {
            await Promise.allSettled([
                createNotification({
                    userId: app.assignedReviewerId,
                    type: 'task_assigned',
                    title: `Overdue: Review application — ${applicantName}`,
                    body: `Your application review for ${applicantName} is overdue. Please complete it as soon as possible.`,
                    actionUrl: `/admin/j1?tab=1&app=${appId}`,
                    relatedId: appId,
                }),
                sendDM(app.assignedReviewerId, {
                    embeds: [{
                        title: '⚠️ Overdue Application Review',
                        description: `Your application review for **${applicantName}** is overdue. Please action it as soon as possible.`,
                        color: 0xf59e0b,
                        footer: { text: 'ASOT Member Portal' },
                        fields: [{ name: '\u200b', value: `[View Application](/admin/j1)`, inline: false }],
                        timestamp: now.toISOString(),
                    }],
                }, 'task'),
            ])
        }

        // Notify J1 Lead who assigned the recruiter
        if (app.assignedByLeadId) {
            await Promise.allSettled([
                createNotification({
                    userId: app.assignedByLeadId,
                    type: 'task_assigned',
                    title: `Recruiter overdue — ${applicantName}`,
                    body: `${recruiterName} has not completed the application review for ${applicantName} yet. The deadline has passed.`,
                    actionUrl: `/admin/j1?tab=1&app=${appId}`,
                    relatedId: appId,
                }),
                sendDM(app.assignedByLeadId, {
                    embeds: [{
                        title: '⚠️ Recruiter Has Not Completed Review',
                        description: `**${recruiterName}** has not completed the application review for **${applicantName}**. The deadline has passed.`,
                        color: 0xf59e0b,
                        footer: { text: 'ASOT Member Portal' },
                        timestamp: now.toISOString(),
                    }],
                }, 'task'),
            ])
        }

        // Mark as reminded so we don't re-fire
        await Db.j1Applications.updateOne(
            { _id: app._id as ObjectId },
            { $set: { overdueReminderSentAt: now } }
        )
    }))

    return NextResponse.json({ reminded: overdue.length })
}
