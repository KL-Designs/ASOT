import Db from '@/lib/mongo'
import { LEGACY_OFFSETS } from './reminder-offsets'

/**
 * Schedule reminders for an approved training event, one per offset (minutes
 * before the start). Offsets default to the legacy 60 and 15 for events that
 * never stored their own. Skips any reminder that would fire in the past.
 */
export async function scheduleTrainingReminders(
    eventId: string,
    eventTitle: string,
    scheduledAt: Date,
    offsets: number[] = LEGACY_OFFSETS,
    kind: 'event' | 'course' = 'event',
): Promise<void> {
    const now = new Date()
    const reminders = offsets.map(minutesBefore => ({
        eventId,
        eventTitle,
        minutesBefore,
        fireAt: new Date(scheduledAt.getTime() - minutesBefore * 60_000),
        ...(kind === 'course' ? { kind } : {}),
        createdAt: now,
    }))

    const futureReminders = reminders.filter(r => r.fireAt > now)
    if (futureReminders.length === 0) return

    // Upsert to avoid duplicates if called twice (e.g. re-approval)
    for (const r of futureReminders) {
        await Db.trainingReminders.updateOne(
            { eventId: r.eventId, minutesBefore: r.minutesBefore },
            { $setOnInsert: r },
            { upsert: true }
        )
    }
}

/**
 * Remove all pending (unfired) reminders for an event (on cancellation).
 */
export async function cancelTrainingReminders(eventId: string): Promise<void> {
    await Db.trainingReminders.deleteMany({ eventId, firedAt: { $exists: false } })
}

/**
 * Reminder ids for a Selection / Reinforcement Cycle course are namespaced so
 * they can never collide with a training event's ObjectId.
 */
export function courseReminderId(courseInstanceId: string): string {
    return `course:${courseInstanceId}`
}

/** Re-plan a course's Session 1 reminders after its date or offsets change. */
export async function rescheduleCourseReminders(instance: Pick<CourseInstance, 'instanceRef' | 'trainingTypeName' | 'session1Date' | 'reminderOffsets'> & { _id: unknown }): Promise<void> {
    const id = courseReminderId(String(instance._id))
    await cancelTrainingReminders(id)
    if (!instance.session1Date || !instance.reminderOffsets?.length) return
    await scheduleTrainingReminders(id, `${instance.trainingTypeName} ${instance.instanceRef} Session 1`, new Date(instance.session1Date), instance.reminderOffsets, 'course')
}
