import Db from '@/lib/mongo'

/**
 * Schedule 60-minute and 15-minute reminders for an approved training event.
 * Skips reminder if it would fire in the past.
 */
export async function scheduleTrainingReminders(
    eventId: string,
    eventTitle: string,
    scheduledAt: Date,
): Promise<void> {
    const now = new Date()
    const reminders = [60, 15].map(minutesBefore => ({
        eventId,
        eventTitle,
        minutesBefore,
        fireAt: new Date(scheduledAt.getTime() - minutesBefore * 60_000),
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
