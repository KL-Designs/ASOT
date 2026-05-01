import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { sendMeetingDM } from '@/lib/discord/bot'

/**
 * GET /api/cron/meeting-reminders
 *
 * Processes the meeting_notif_queue collection.
 * For every record where fireAt <= now and not yet fired:
 *   - Resolves recipients (per-user or per-role)
 *   - Skips LOA members for reminder types
 *   - Sends in-app notification + Discord DM to each recipient
 *   - Marks the record as fired
 *
 * Protect with CRON_SECRET env var (passed as Bearer token or ?secret= query param).
 */
export async function GET(request: NextRequest) {
    const secret = request.nextUrl.searchParams.get('secret')
        ?? request.headers.get('authorization')?.replace('Bearer ', '')
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const base = process.env.NEXT_PUBLIC_BASEURL ?? ''

    const due = await Db.meetingNotifQueue
        .find({ fireAt: { $lte: now }, firedAt: { $exists: false } })
        .toArray()

    if (due.length === 0) return NextResponse.json({ fired: 0, checkedAt: now.toISOString() })

    let fired = 0

    for (const item of due) {
        // Resolve recipient user IDs
        let recipientIds: string[] = []

        if (item.recipientUserId) {
            recipientIds = [item.recipientUserId]
        } else if (item.recipientRole) {
            const roleUsers = await Db.users
                .find(
                    { 'guild.roles': item.recipientRole, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } },
                    { projection: { id: 1 } }
                )
                .toArray()
            recipientIds = roleUsers.map((u: { id: string }) => u.id)
        }

        if (recipientIds.length === 0) {
            await Db.meetingNotifQueue.updateOne({ _id: item._id as ObjectId }, { $set: { firedAt: now } })
            continue
        }

        // For meeting_reminder type: skip LOA members
        let loaIds = new Set<string>()
        if (item.type === 'meeting_reminder') {
            const meeting = await Db.meetings.findOne(
                { _id: new ObjectId(item.meetingId) },
                { projection: { attendees: 1, title: 1 } }
            )
            if (meeting) {
                loaIds = new Set(
                    (meeting.attendees ?? [])
                        .filter((a: MeetingAttendee) => a.status === 'loa')
                        .map((a: MeetingAttendee) => a.userId)
                )
            }
        }

        // For meeting_attendance_overdue: only fire if there are still unconfirmed attendees
        if (item.type === 'meeting_attendance_overdue') {
            const meeting = await Db.meetings.findOne(
                { _id: new ObjectId(item.meetingId) },
                { projection: { attendees: 1 } }
            )
            const unconfirmed = (meeting?.attendees ?? []).filter((a: MeetingAttendee) =>
                ['pending', 'attending', 'not_attending'].includes(a.status)
            )
            if (unconfirmed.length === 0) {
                await Db.meetingNotifQueue.updateOne({ _id: item._id as ObjectId }, { $set: { firedAt: now } })
                continue
            }
        }

        // Send to each recipient
        await Promise.all(
            recipientIds
                .filter(uid => !loaIds.has(uid))
                .map(async userId => {
                    // Determine body (for meeting_reminder, personalise by attendance status)
                    let body = item.notifyBody
                    if (item.type === 'meeting_reminder') {
                        const meeting = await Db.meetings.findOne(
                            { _id: new ObjectId(item.meetingId) },
                            { projection: { attendees: 1, title: 1, date: 1, department: 1 } }
                        )
                        const attendee = (meeting?.attendees ?? []).find((a: MeetingAttendee) => a.userId === userId)
                        const dateLabel = meeting?.date ? new Date(meeting.date).toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' }) : ''
                        if (attendee?.status === 'attending' || attendee?.status === 'confirmed_attended') {
                            body = `Reminder: "${meeting?.title}" is scheduled for ${dateLabel}. You are marked as attending.`
                        } else if (attendee?.status === 'not_attending' || attendee?.status === 'confirmed_absent') {
                            body = `Reminder: "${meeting?.title}" is on ${dateLabel}. You were marked as not attending — has your availability changed?`
                        }
                    }

                    await Promise.all([
                        createNotification({
                            userId,
                            type: item.type,
                            title: item.notifyTitle,
                            body,
                            actionUrl: item.actionUrl,
                            relatedId: item.meetingId,
                        }),
                        sendMeetingDM(userId, item.notifyTitle, body, item.actionUrl)
                            .catch(err => console.error(`[cron/meetings] Discord DM failed for ${userId}:`, err)),
                    ])
                })
        )

        await Db.meetingNotifQueue.updateOne({ _id: item._id as ObjectId }, { $set: { firedAt: now } })
        fired++
    }

    return NextResponse.json({ fired, checkedAt: now.toISOString() })
}
