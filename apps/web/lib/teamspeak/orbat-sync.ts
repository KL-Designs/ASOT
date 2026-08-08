import { TeamSpeak, QueryProtocol } from 'ts3-nodejs-library'
import Db from '@/lib/mongo'
import { checkTsGate } from '@/lib/teamspeak/devmode'

function connect() {
    return TeamSpeak.connect({
        host: process.env.TS_HOST!,
        queryport: Number(process.env.TS_QUERY_PORT ?? 10022),
        protocol: QueryProtocol.SSH,
        username: 'serveradmin',
        password: process.env.TS_SERVERADMIN_PASSWORD!,
        serverport: Number(process.env.TS_SERVER_PORT ?? 9987),
    })
}

/**
 * Adds or removes a user's TeamSpeak server groups for an ORBAT section.
 * Mirrors syncOrbatDiscordRoles but for TeamSpeak group IDs stored in
 * OrbatSectionMeta.tsGroupId.
 *
 * Returns { skipped: true } if the member has no linked TeamSpeak account.
 * Callers should surface this as a non-blocking warning to the admin.
 */
export async function syncOrbatTeamspeakGroups(
    userId: string,
    action: 'add' | 'remove',
    category: string,
    sectionTitle: string,
): Promise<{ skipped: boolean; reason?: string }> {
    const normalizedTitle = sectionTitle || null

    const [sectionMeta, categoryMeta] = await Promise.all([
        normalizedTitle
            ? Db.orbatSectionMeta.findOne({ category, sectionTitle: normalizedTitle })
            : Promise.resolve(null),
        Db.orbatSectionMeta.findOne({ category, sectionTitle: null }),
    ])

    const groupIds = [sectionMeta?.tsGroupId, categoryMeta?.tsGroupId].filter(
        (id): id is number => typeof id === 'number',
    )
    // No TS groups configured for this section — not a failure, just nothing to do
    if (!groupIds.length) return { skipped: false }

    const user = await Db.users.findOne({ $or: [{ id: userId }, { _id: userId }] })
    const cldbid = user?.teamspeak?.cldbid
    if (!cldbid) {
        return { skipped: true, reason: 'Member has no linked TeamSpeak account' }
    }

    const tsUid = user?.teamspeak?.uid as string | undefined
    if (tsUid) {
        const gate = await checkTsGate(tsUid)
        if (!gate.allowed) {
            return { skipped: true, reason: 'Blocked by TeamSpeak dev mode' }
        }
    }

    let ts: TeamSpeak | undefined
    try {
        ts = await connect()
        const cmd = action === 'add' ? 'servergroupaddclient' : 'servergroupdelclient'
        await Promise.allSettled(
            groupIds.map(sgid => ts!.execute(cmd, { sgid: String(sgid), cldbid: String(cldbid) }))
        )
        return { skipped: false }
    } finally {
        if (ts) await ts.quit().catch(() => {})
    }
}
