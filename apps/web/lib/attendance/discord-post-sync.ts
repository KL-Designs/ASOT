import type { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { upsertChannelPost } from '@/lib/discord/bot'
import { viewRoster } from '@/lib/attendance/roster'
import { toBoardUser } from '@/lib/attendance/board-user'
import {
    ROSTER_IMAGE_NAME, buildPostMessage, refreshDue, resolveDetails, rosterFingerprint, summariseRoster,
    type PostDetails, type PostKind,
} from './discord-post'
import { renderRosterPng } from './roster-image'

/**
 * Keeping an operation's Discord attendance post in step with its sign-ups.
 *
 * One function, `syncAttendancePost`, called for an operation whenever the
 * cron ticks. It decides which of three things is due, and does at most one:
 *
 *  - **Post.** Sign-ups are open and there is no post yet.
 *  - **Refresh.** The roster has changed since the picture was last drawn, and
 *    the refresh interval has passed. A burst of sign-ups in the first minute
 *    is therefore one redraw, not twenty.
 *  - **Close.** Sign-ups have shut: the post is edited one last time, its
 *    buttons removed.
 *
 * ## It is off until it is configured
 *
 * Nothing is posted unless the channel for that kind of operation is set
 * (`DISCORD_ATTENDANCE_CHANNEL_ID` for main missions,
 * `DISCORD_ATTENDANCE_MIDWEEK_CHANNEL_ID` for mid-weeks). An unset channel
 * means this returns without doing anything, which is the state it ships in.
 *
 * Discord's developer mode is honoured by `upsertChannelPost`: with it on,
 * nothing leaves the site and the attempt is logged instead.
 *
 * Never throws — it runs inside the cron that also opens and closes sign-ups,
 * and a failed post must not stop those.
 */

export interface PostSettings {
    channels: Record<PostKind, string>
    refreshMinutes: number
    defaults: PostDetails
    baseUrl: string
}

/** The site-wide settings, from the environment. */
export function postSettings(): PostSettings {
    const env = process.env
    return {
        channels: {
            main: env.DISCORD_ATTENDANCE_CHANNEL_ID?.trim() ?? '',
            midweek: env.DISCORD_ATTENDANCE_MIDWEEK_CHANNEL_ID?.trim() ?? '',
        },
        refreshMinutes: Math.max(1, Number(env.ATTENDANCE_POST_REFRESH_MINS) || 5),
        defaults: {
            serverAddress: env.ARMA_SERVER_ADDRESS?.trim() || undefined,
            serverPort: env.ARMA_SERVER_PORT?.trim() || undefined,
            serverPassword: env.ARMA_SERVER_PASSWORD?.trim() || undefined,
            modlistUrl: env.ARMA_MODLIST_URL?.trim() || undefined,
        },
        baseUrl: (env.NEXT_PUBLIC_BASEURL ?? '').replace(/\/+$/, ''),
    }
}

export type PostOutcome = 'posted' | 'refreshed' | 'closed' | 'nothing'

export async function syncAttendancePost(operationId: ObjectId, now = new Date()): Promise<PostOutcome> {
    try {
        const settings = postSettings()
        const attendance = await Db.operationAttendance.findOne({ operationId })
        if (!attendance) return 'nothing'

        const post = attendance.discordPost
        // Finished, or nothing to do: no post and sign-ups are not open.
        if (post?.closedAt) return 'nothing'
        if (!post && !attendance.rsvpOpen) return 'nothing'

        const operation = await Db.operations.findOne(
            { _id: operationId, deletedAt: { $exists: false } },
            { projection: { title: 1, date: 1, status: 1, themeColor: 1 } },
        )
        if (!operation?.date || operation.status === 'In Development') return 'nothing'

        const date = new Date(operation.date)
        const details = resolveDetails(date, attendance.postDetails, settings.defaults)
        const channelId = post?.channelId ?? settings.channels[details.kind]
        if (!channelId) return 'nothing'

        // ── The roster as it stands ──
        const rsvp = Object.fromEntries(attendance.records.map(r => [r.userId, r.rsvp]))
        const slots = viewRoster(attendance.roster ?? [], { rsvp, rsvpClosed: !attendance.rsvpOpen })
        const ids = [...new Set([
            ...slots.map(s => s.occupantUserId).filter((id): id is string => !!id),
            ...attendance.records.filter(r => r.rsvp === 'not_attending').map(r => r.userId),
        ])]
        const users = ids.length
            ? await Db.users.find({ $or: [{ id: { $in: ids } }, { _id: { $in: ids } }] }).toArray()
            : []
        const names = new Map<string, string>()
        for (const u of users) {
            const name = toBoardUser(u, u.id).displayName
            names.set(u.id, name)
            names.set(String(u._id), name)
        }
        const summary = summariseRoster(slots, rsvp, id => names.get(id) ?? 'Unknown member')
        const fingerprint = rosterFingerprint(summary)

        const closing = !!post && !attendance.rsvpOpen
        const changed = !post || post.fingerprint !== fingerprint
        // Closing always goes through; a refresh waits for a change and the interval.
        if (post && !closing && !(changed && refreshDue(post.drawnAt, now, settings.refreshMinutes))) return 'nothing'

        const closesAt = new Date(date.getTime() - (attendance.rsvpCloseOffsetMins ?? 60) * 60_000)
        const message = buildPostMessage({
            operationId: String(operationId),
            title: operation.title || 'Operation',
            date, closesAt, details, summary,
            baseUrl: settings.baseUrl,
            open: !closing,
            colour: operation.themeColor,
        })
        const png = await renderRosterPng(operation.title || 'Operation', summary)

        const messageId = await upsertChannelPost({
            channelId,
            messageId: post?.messageId,
            payload: message,
            file: { name: ROSTER_IMAGE_NAME, data: png, contentType: 'image/png' },
            messageType: 'attendance_post',
        })
        // Null = developer mode held it back. Recorded as nothing, so it is
        // tried again once developer mode is off.
        if (!messageId) return 'nothing'

        await Db.operationAttendance.updateOne({ operationId }, {
            $set: {
                discordPost: {
                    channelId,
                    messageId,
                    postedAt: post?.postedAt ?? now,
                    fingerprint,
                    drawnAt: now,
                    ...(closing ? { closedAt: now } : {}),
                },
            },
        })
        return closing ? 'closed' : post ? 'refreshed' : 'posted'
    } catch (err) {
        console.error('[attendance] Discord post sync failed:', err)
        return 'nothing'
    }
}

/** Every operation that has, or is due, a live post. */
export async function syncAllAttendancePosts(now = new Date()): Promise<Record<PostOutcome, number>> {
    const tally: Record<PostOutcome, number> = { posted: 0, refreshed: 0, closed: 0, nothing: 0 }
    const settings = postSettings()
    // With no channel at all there is nothing this could ever do.
    if (!settings.channels.main && !settings.channels.midweek) return tally

    const due = await Db.operationAttendance.find({
        $or: [
            { rsvpOpen: true },
            { 'discordPost.messageId': { $exists: true }, 'discordPost.closedAt': { $exists: false } },
        ],
    } as Parameters<typeof Db.operationAttendance.find>[0], { projection: { operationId: 1 } }).toArray()

    for (const att of due) tally[await syncAttendancePost(att.operationId, now)]++
    return tally
}
