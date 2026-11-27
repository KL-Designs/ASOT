import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'

/** Trigger a staff induction for a member after a promotion or appointment. */
export async function triggerStaffInduction({
    userId,
    userName,
    context,
    triggerLabel,
    triggeredById,
    triggeredByName,
    dept,
}: {
    userId: string
    userName: string
    context: string
    triggerLabel?: string
    triggeredById: string
    triggeredByName: string
    dept?: string
}) {
    const existing = await Db.staffInductions.findOne({
        userId,
        context,
        completedAt: { $exists: false },
    })
    if (existing) return // already has an active induction for this context

    const record: Omit<StaffInductionRecord, '_id'> = {
        userId,
        userName,
        context,
        ...(dept ? { dept } : {}),
        triggerLabel,
        triggeredById,
        triggeredByName,
        triggeredAt: new Date(),
    }

    const result = await Db.staffInductions.insertOne(record as StaffInductionRecord)

    await createNotification({
        userId,
        type: 'task_assigned',
        title: 'Staff induction required',
        body: triggerLabel
            ? `Complete your induction for ${triggerLabel}`
            : 'You have a new staff induction to complete',
        actionUrl: '/dashboard/unit/staff-induction' as string,
        relatedId: result.insertedId.toString(),
    })
}
