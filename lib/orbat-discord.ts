import Db from './mongo'
import { addGuildRole, removeGuildRole } from './discord/bot'

/**
 * Adds or removes a user's Discord roles for an ORBAT section.
 * Resolves both the section-level role and the category/platoon-level role
 * from OrbatSectionMeta.discordRoleId and applies them together.
 */
export async function syncOrbatDiscordRoles(
    userId: string,
    action: 'add' | 'remove',
    category: string,
    sectionTitle: string,
): Promise<void> {
    const normalizedTitle = sectionTitle || null

    const [sectionMeta, categoryMeta] = await Promise.all([
        normalizedTitle
            ? Db.orbatSectionMeta.findOne({ category, sectionTitle: normalizedTitle })
            : Promise.resolve(null),
        Db.orbatSectionMeta.findOne({ category, sectionTitle: null }),
    ])

    const roleIds = [sectionMeta?.discordRoleId, categoryMeta?.discordRoleId].filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
    )
    if (!roleIds.length) return

    const fn = action === 'add' ? addGuildRole : removeGuildRole
    await Promise.allSettled(roleIds.map(id => fn(userId, id)))
}
