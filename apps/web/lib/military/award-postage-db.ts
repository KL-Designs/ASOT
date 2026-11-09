import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { sendDM } from '@/lib/discord/bot'
import { logAction } from '@/lib/logAction'
import {
    AWARD_POSTAGE_ID, BATCH_DELAY_MS, REMINDER_INTERVAL_MS, buildPostageDM, carryOver, isPhysicalAward, monthKey,
    withPostageDefaults,
} from './award-postage'

/**
 * Row 384, the database and Discord side. Awards themselves stay in
 * `milpac.awards`; this only tracks which of them need posting.
 */

export async function loadPostageConfig(): Promise<AwardPostageConfig> {
    const doc = await Db.siteSettings.findOne({ _id: AWARD_POSTAGE_ID })
    return withPostageDefaults(doc as Partial<AwardPostageConfig> | null)
}

type MemberLike = Pick<User, 'id' | 'name' | 'username' | 'globalName' | 'guild' | 'discharged' | 'isSkeletonAccount'>

export function memberName(u: Partial<MemberLike>): string {
    const nick = (u.guild?.nickname ?? '').replace(/\s*\[[^\]]*\]/g, '').trim()
    return u.name || nick || u.globalName || u.username || u.id || 'Unknown'
}

/**
 * Called by both award write paths (a `j4-award` ticket approval and the
 * MILPAC editor) with the awards just added. Yes queues them; No does
 * nothing; Unassigned queues them as awaiting and schedules one combined DM.
 * Never throws: an award must not fail because postage tracking did.
 */
export async function onAwardsAdded(userId: string, awards: { name: string; type?: string; date?: string }[], now = new Date()): Promise<void> {
    try {
        if (!awards.length) return
        const [config, member] = await Promise.all([
            loadPostageConfig(),
            Db.users.findOne({ id: userId }, { projection: { id: 1, name: 1, username: 1, globalName: 1, guild: 1, discharged: 1, isSkeletonAccount: 1 } }),
        ])
        if (!member || member.discharged || member.isSkeletonAccount) return
        const physical = awards.filter(a => isPhysicalAward(a, config))
        if (!physical.length) return

        const name = memberName(member)
        const pref = await Db.awardPostagePrefs.findOne({ userId })
        const preference = pref?.preference ?? 'unassigned'
        if (preference === 'no') return

        const status: AwardPostageStatus = preference === 'yes' ? 'ready' : 'awaiting_preference'
        await Db.awardPostageItems.insertMany(physical.map(a => ({
            userId, userName: name,
            awardName: a.name, awardType: a.type ?? '', awardDate: a.date ?? now.toISOString().slice(0, 10),
            month: monthKey(now), status, createdAt: now,
        })))

        if (preference === 'unassigned') {
            // A DM already due soon picks these up too; otherwise ask in a couple of minutes.
            const soon = new Date(now.getTime() + BATCH_DELAY_MS)
            const due = pref?.nextReminderAt && new Date(pref.nextReminderAt) < soon ? pref.nextReminderAt : soon
            await Db.awardPostagePrefs.updateOne(
                { userId },
                { $set: { userName: name, nextReminderAt: due, updatedAt: now }, $setOnInsert: { userId, preference: 'unassigned' } },
                { upsert: true },
            )
        }
    } catch (err) {
        console.error('[award-postage] onAwardsAdded failed:', err)
    }
}

export interface Actor { id: string; name: string }

/**
 * Set a member's preference, from a Discord button ('member') or by hand.
 * Yes readies the awards waiting on them; No marks every unsent one not
 * required. Either stops the reminders. Setting Unassigned again starts asking
 * about any awards still waiting; awards already decided keep their status.
 */
export async function setPostagePreference(userId: string, preference: AwardPostagePreference, actor: Actor | 'member', now = new Date()) {
    const member = await Db.users.findOne({ id: userId }, { projection: { id: 1, name: 1, username: 1, globalName: 1, guild: 1 } })
    const name = member ? memberName(member) : userId
    const before = await Db.awardPostagePrefs.findOne({ userId })
    const answered = preference !== 'unassigned'
    await Db.awardPostagePrefs.updateOne(
        { userId },
        {
            $set: {
                userName: name, preference, updatedAt: now,
                ...(answered ? { answeredAt: now, answeredBy: actor === 'member' ? 'member' : actor.id, nextReminderAt: null } : {}),
            },
            $setOnInsert: { userId },
        },
        { upsert: true },
    )
    if (preference === 'yes') await Db.awardPostageItems.updateMany({ userId, status: 'awaiting_preference' }, { $set: { status: 'ready' } })
    if (preference === 'no') await Db.awardPostageItems.updateMany({ userId, status: { $in: ['awaiting_preference', 'ready'] } }, { $set: { status: 'declined' } })
    if (preference === 'unassigned') {
        // Waiting awards are asked about again from now on.
        const waiting = await Db.awardPostageItems.countDocuments({ userId, status: 'awaiting_preference' })
        if (waiting) await Db.awardPostagePrefs.updateOne({ userId }, { $set: { nextReminderAt: new Date(now.getTime() + BATCH_DELAY_MS) } })
    }

    await logAction({
        action: 'j4.awardPostage.preference',
        category: 'award',
        performedBy: actor === 'member' ? userId : actor.id,
        performedByName: actor === 'member' ? name : actor.name,
        department: 'j4',
        entityType: 'awardPostagePref',
        entityId: userId,
        target: name,
        before: { preference: before?.preference ?? 'unassigned' },
        after: { preference },
        details: { via: actor === 'member' ? 'discord' : 'website' },
    })
    return { name, preference }
}

export async function markSent(ids: string[], actor: Actor, now = new Date()): Promise<number> {
    const oids = ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id))
    if (!oids.length) return 0
    const items = await Db.awardPostageItems.find({ _id: { $in: oids }, status: 'ready' }).toArray()
    if (!items.length) return 0
    await Db.awardPostageItems.updateMany(
        { _id: { $in: items.map(i => i._id!) } },
        { $set: { status: 'sent', sentAt: now, sentById: actor.id, sentByName: actor.name } },
    )
    await logAction({
        action: 'j4.awardPostage.sent',
        category: 'award',
        performedBy: actor.id,
        performedByName: actor.name,
        department: 'j4',
        entityType: 'awardPostageItem',
        details: { count: items.length, items: items.map(i => ({ member: i.userName, award: i.awardName, month: i.month })) },
    })
    return items.length
}

/** Move every open item into the current month. Idempotent; run by the cron and before every read. */
export async function rollOver(now = new Date()): Promise<number> {
    const current = monthKey(now)
    const stale = await Db.awardPostageItems.find({ month: { $lt: current }, status: { $in: ['ready', 'awaiting_preference'] } }).toArray()
    for (const item of stale) {
        const moved = carryOver(item, current)
        if (moved) await Db.awardPostageItems.updateOne({ _id: item._id }, { $set: { month: moved.month, carriedFrom: moved.carriedFrom } })
    }
    return stale.length
}

/**
 * Send every preference DM that is due: the first ask (a couple of minutes
 * after an award, so a batch goes as one) and the two-weekly reminders, each
 * listing every award still waiting. Stops once the member answers, is
 * discharged, or has nothing left waiting.
 */
export async function sendDuePreferenceDMs(now = new Date()): Promise<{ sent: number; failed: number }> {
    const due = await Db.awardPostagePrefs.find({ preference: 'unassigned', nextReminderAt: { $ne: null, $lte: now } }).limit(50).toArray()
    if (!due.length) return { sent: 0, failed: 0 }
    const config = await loadPostageConfig()
    let sent = 0, failed = 0
    for (const pref of due) {
        const [items, member] = await Promise.all([
            Db.awardPostageItems.find({ userId: pref.userId, status: 'awaiting_preference' }).toArray(),
            Db.users.findOne({ id: pref.userId }, { projection: { id: 1, discharged: 1 } }),
        ])
        if (!items.length || !member || member.discharged) {
            await Db.awardPostagePrefs.updateOne({ _id: pref._id }, { $set: { nextReminderAt: null } })
            continue
        }
        const reminder = !!pref.firstAskedAt
        const dm = buildPostageDM(config, { name: pref.userName, awards: items.map(i => i.awardName), baseUrl: process.env.NEXT_PUBLIC_BASEURL ?? '', reminder })
        try {
            await sendDM(pref.userId, dm, reminder ? 'award_postage_reminder' : 'award_postage_ask')
            sent++
        } catch (err) {
            // DMs closed, or Discord is down: try again at the next two-weekly mark rather than every tick.
            console.error('[award-postage] DM failed for', pref.userId, err)
            failed++
        }
        await Db.awardPostagePrefs.updateOne({ _id: pref._id }, {
            $set: {
                nextReminderAt: new Date(now.getTime() + REMINDER_INTERVAL_MS),
                ...(reminder ? { lastReminderAt: now } : { firstAskedAt: now }),
                updatedAt: now,
            },
            $inc: { reminderCount: reminder ? 1 : 0 },
        })
    }
    return { sent, failed }
}
