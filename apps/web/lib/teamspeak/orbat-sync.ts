import Db from '@/lib/mongo'
import { applyTsServerGroups } from '@/lib/teamspeak/groups'

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

    return applyTsServerGroups(userId, action, groupIds)
}
