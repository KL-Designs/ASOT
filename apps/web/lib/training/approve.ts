import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { sendTrainingApprovedDM } from '@/lib/discord/bot'
import { logAction } from '@/lib/logAction'
import { scheduleTrainingReminders } from '@/lib/training/scheduleReminders'
import { unitDateTime } from '@/lib/unit-time'

/**
 * Approve a pending training event: put it on the J3 calendar (which the Unit
 * Calendar draws in J3's green), schedule its reminders, tell the trainer.
 *
 * Shared by the J3 approval button and by a J3 lead creating a session from
 * the Training Calendar's Add Event, which approves on save (row 213) — the
 * two must leave an event in exactly the same state.
 */
export async function approveTrainingEvent(
    event: TrainingEvent & { _id: ObjectId },
    approver: { id: string; name: string },
): Promise<void> {
    const id = event._id.toString()
    const now = new Date()

    const start = event.scheduledAt
    const end = event.estimatedFinishAt ?? new Date(start.getTime() + (event.durationMinutes ?? 60) * 60_000)

    const calResult = await Db.calendarEvents.insertOne({
        title: event.title,
        description: `${event.trainingTypeName} — Trainer: ${event.trainerName}${event.location ? ` — ${event.location}` : ''}${event.description ? `\n\n${event.description}` : ''}`,
        start,
        end,
        allDay: false,
        department: 'j3',
        templateTrainingTypeId: event.trainingTypeId,
        createdById: approver.id,
        createdByName: approver.name,
        createdAt: now,
    })

    await Db.trainingEvents.updateOne(
        { _id: event._id },
        {
            $set: {
                approvalStatus: 'approved',
                approvedById: approver.id,
                approvedByName: approver.name,
                approvedAt: now,
                calendarEventId: calResult.insertedId.toString(),
                updatedAt: now,
            },
        }
    )

    scheduleTrainingReminders(id, event.title, event.scheduledAt, event.reminderOffsets).catch(console.error)

    // The trainer approving their own session needs no message about it.
    if (event.trainerId !== approver.id) {
        const scheduledStr = unitDateTime(event.scheduledAt)
        await Promise.all([
            createNotification({
                userId: event.trainerId,
                type: 'training_event_approved',
                title: 'Training Session Approved',
                body: `Your session "${event.title}" has been approved for ${scheduledStr}.`,
                actionUrl: '/dashboard/unit/training-docs',
                relatedId: id,
            }),
            sendTrainingApprovedDM(event.trainerId, event.title, scheduledStr, '/dashboard/unit/training-docs')
                .catch(err => console.error('[training/approve] DM failed:', err)),
        ])
    }

    logAction({
        action: 'training.event.approve',
        category: 'training',
        performedBy: approver.id,
        performedByName: approver.name,
        department: 'j3',
        entityType: 'training_event',
        entityId: id,
        actionUrl: '/dashboard/unit/training-docs',
        target: event.title,
    }).catch(console.error)
}
