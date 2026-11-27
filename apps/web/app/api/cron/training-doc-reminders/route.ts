import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { verifyCronSecret } from '@/lib/cron-auth'

/** How many days between reminders for the same unacknowledged training doc. */
const REMINDER_INTERVAL_DAYS = 3

/**
 * GET /api/cron/training-doc-reminders
 *
 * Finds all users who have unacknowledged mandatory training doc updates and
 * sends reminder notifications if they haven't been reminded in the last
 * REMINDER_INTERVAL_DAYS days.
 *
 * Run every 6 hours via server.mjs.
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const tag = '[cron/training-doc-reminders]'
    console.log(`${tag} tick at ${now.toISOString()}`)

    // Find all docs that have at least one requiresAck change entry
    const docs = await Db.trainingDocs.find({
        type: 'document',
        'changeLog': { $elemMatch: { requiresAck: true } },
    }).toArray()

    if (docs.length === 0) return NextResponse.json({ reminded: 0 })

    // Find all active (non-discharged, non-skeleton) users
    const users = await Db.users.find({
        discharged: { $exists: false },
        isSkeletonAccount: { $ne: true },
    }, { projection: { id: 1, name: 1, username: 1, globalName: 1, 'guild.nickname': 1, 'guild.displayName': 1 } }).toArray()

    let reminded = 0
    const intervalMs = REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000
    const cutoff = new Date(now.getTime() - intervalMs)

    for (const doc of docs) {
        const docId = doc._id!.toString()

        // Find the latest version that requires ack
        const ackEntries = (doc.changeLog ?? []).filter(e => e.requiresAck)
        if (ackEntries.length === 0) continue
        const latestVersion = Math.max(...ackEntries.map(e => e.version))

        // Find users who have already acknowledged this version
        const ackUserIds = new Set(
            (await Db.trainingDocAcks.find({ docId, version: latestVersion }).toArray()).map(a => a.userId)
        )

        for (const user of users) {
            if (ackUserIds.has(user.id)) continue // already acknowledged

            // Check if a reminder was recently sent for this doc
            const recentReminder = await Db.notifications.findOne({
                userId: user.id,
                type: 'task_assigned',
                relatedId: docId,
                createdAt: { $gte: cutoff },
                title: { $regex: 'reminder', $options: 'i' },
            })
            if (recentReminder) continue

            const displayName = (user as any).name ||
                (user as any).guild?.nickname ||
                (user as any).globalName ||
                (user as any).username ||
                user.id

            await createNotification({
                userId: user.id,
                type: 'task_assigned',
                title: `Reminder: acknowledge "${doc.name}"`,
                body: `You still need to acknowledge the latest update to "${doc.name}". Please review and confirm you have read it.`,
                actionUrl: '/dashboard/unit/training-hub' as string,
                relatedId: docId,
            })

            reminded++
        }
    }

    console.log(`${tag} sent ${reminded} reminder(s)`)
    return NextResponse.json({ reminded })
}
