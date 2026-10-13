import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { grantExpiresAt, grantIsLive, unlockedMemberIds } from './pre-learning'

/**
 * The database half of pre-learning: after anything changes who holds a seat
 * on a session, open the material for whoever is now entitled to it.
 *
 * Called from the sign-up route after every RSVP, cancellation and waitlist
 * promotion. It only ever *opens* access: a grant, once made, runs its two
 * weeks regardless of what the member does next. Closing it early when a
 * member steps back would take the material away from somebody who may well
 * sign up again tomorrow, and the two-week expiry already bounds it.
 *
 * Never throws — a failure here must not fail the sign-up that triggered it.
 */
export async function syncPreLearning(event: Pick<TrainingEvent, '_id' | 'trainingTypeId' | 'title'>): Promise<void> {
    try {
        if (!event._id || !ObjectId.isValid(event.trainingTypeId)) return
        const eventId = String(event._id)

        const type = await Db.trainingTypes.findOne(
            { _id: new ObjectId(event.trainingTypeId) },
            { projection: { name: 1, preLearning: 1 } },
        )
        // Most trainings have none, and then there is nothing to unlock.
        if (!type?.preLearning?.length) return

        const records = await Db.trainingAttendance.find({ eventId }).toArray()
        const entitled = unlockedMemberIds(records)
        if (!entitled.length) return

        const now = new Date()
        const existing = await Db.trainingPreLearning
            .find({ trainingTypeId: event.trainingTypeId, memberId: { $in: entitled } })
            .toArray()
        const live = new Set(existing.filter(g => grantIsLive(g, now)).map(g => g.memberId))

        for (const memberId of entitled) {
            if (live.has(memberId)) continue

            // One document per member per training. An expired one is reset
            // rather than kept beside a new one: the material "must be redone",
            // so the old completion goes with the old window.
            await Db.trainingPreLearning.updateOne(
                { trainingTypeId: event.trainingTypeId, memberId },
                {
                    $set: { trainingTypeId: event.trainingTypeId, memberId, eventId, unlockedAt: now },
                    $unset: { completedAt: '' },
                },
                { upsert: true },
            )

            const until = grantExpiresAt({ unlockedAt: now }).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })
            createNotification({
                userId: memberId,
                type: 'training_prelearning_unlocked',
                title: `Pre-learning unlocked: ${type.name}`,
                body: `You have a place for ${event.title}, so the pre-learning for ${type.name} is open to you until ${until}. Work through it before the session.`,
                actionUrl: '/dashboard/unit/training-docs',
                relatedId: eventId,
            }).catch(console.error)
        }
    } catch (err) {
        console.error('[training] syncPreLearning failed:', err)
    }
}
