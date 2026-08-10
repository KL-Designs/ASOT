import { getConnection } from '@/lib/teamspeak/cache'
import { checkTsGate } from '@/lib/teamspeak/devmode'
import Db from '@/lib/mongo'

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
    if (!cldbid) return { skipped: true, reason: 'Member has no linked TeamSpeak account' }

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
