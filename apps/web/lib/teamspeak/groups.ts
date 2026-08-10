import { getConnection } from '@/lib/teamspeak/cache'
import { checkTsGate } from '@/lib/teamspeak/devmode'
import { sendTeamspeakLinkReminderDM } from '@/lib/discord/bot'
import Db from '@/lib/mongo'

const LINK_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000 // 24h — avoid spamming on repeated role changes

/**
 * DMs the member a "link your TeamSpeak account" reminder, at most once per
 * LINK_REMINDER_COOLDOWN_MS. Never throws — a failed reminder DM should never
 * take down the calling grant/revoke attempt.
 */
async function maybeSendLinkReminder(userId: string, user: User | null): Promise<void> {
    const lastSent = user?.tsLinkReminderSentAt ?? 0
    if (Date.now() - lastSent < LINK_REMINDER_COOLDOWN_MS) return

    try {
        await Db.users.updateOne(
            { $or: [{ id: userId }, { _id: userId }] },
            { $set: { tsLinkReminderSentAt: Date.now() } },
        )
        await sendTeamspeakLinkReminderDM(userId)
    } catch (err) {
        console.error('[TeamSpeak] link reminder DM failed:', err)
    }
}

/**
 * Adds or removes a set of TeamSpeak server groups for a member, resolved by
 * internal userId. Non-fatal — returns { skipped: true, reason } instead of
 * throwing if the member has no linked TeamSpeak account, is blocked by TS
 * dev mode, or the TS server is unreachable. Callers should surface `reason`
 * as a non-blocking warning, not an error.
 */
export async function applyTsServerGroups(
    userId: string,
    action: 'add' | 'remove',
    groupIds: number[],
): Promise<{ skipped: boolean; reason?: string }> {
    if (!groupIds.length) return { skipped: false }

    const user = await Db.users.findOne({ $or: [{ id: userId }, { _id: userId }] })
    const cldbid = user?.teamspeak?.cldbid
    if (!cldbid) {
        maybeSendLinkReminder(userId, user).catch(err => console.error('[TeamSpeak] link reminder failed:', err))
        return { skipped: true, reason: 'Member has no linked TeamSpeak account' }
    }

    const tsUid = user?.teamspeak?.uid
    if (tsUid) {
        const gate = await checkTsGate(tsUid)
        if (!gate.allowed) return { skipped: true, reason: 'Blocked by TeamSpeak dev mode' }
    }

    try {
        const ts = await getConnection()
        const cmd = action === 'add' ? 'servergroupaddclient' : 'servergroupdelclient'
        await Promise.allSettled(groupIds.map(sgid => ts.execute(cmd, { sgid: String(sgid), cldbid: String(cldbid) })))
        return { skipped: false }
    } catch (err) {
        console.error('[TeamSpeak] applyTsServerGroups failed:', err)
        return { skipped: true, reason: 'Failed to connect to TeamSpeak server' }
    }
}

/**
 * Returns the TeamSpeak server group IDs a client currently holds, resolved
 * by cldbid. Returns [] (never throws) if the TS server is unreachable —
 * callers doing a full add/remove reconcile (sync-dept) tolerate this
 * safely: on failure the "should have" set looks entirely missing, so the
 * only effect is a redundant grant attempt, which itself independently
 * no-ops via applyTsServerGroups's own connection-failure handling. Nothing
 * ever gets incorrectly revoked from this failure mode.
 */
export async function getClientServerGroupIds(cldbid: number): Promise<number[]> {
    try {
        const ts = await getConnection()
        const groups = await ts.serverGroupsByClientId(String(cldbid)) as unknown as Array<{ sgid: string | number }>
        return groups.map(g => Number(g.sgid))
    } catch (err) {
        console.error('[TeamSpeak] getClientServerGroupIds failed:', err)
        return []
    }
}
