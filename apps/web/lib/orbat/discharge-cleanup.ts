import Db from '@/lib/mongo'
import { botRequest, removeGuildRole } from '@/lib/discord/bot'
import { DEPT_ROLES } from '@/lib/discord/dept-roles'
import { applyTsServerGroups, getClientServerGroupIds } from '@/lib/teamspeak/groups'

/**
 * Taking a discharged member's access away.
 *
 * Approving a discharge used to do three things: clear their ORBAT slots, mark
 * them discharged, and save the snapshot. Everything that *granted* them
 * anything was left in place — their Discord roles, their TeamSpeak groups,
 * their department membership — and the regular member sync deliberately skips
 * discharged members, so nothing ever came along afterwards to tidy up. A
 * discharged member kept the unit's roles until somebody removed them by hand.
 *
 * This is that tidy-up, run once at the moment of discharge.
 *
 * ## What comes off
 *
 * - **Discord**: every role the site manages that they actually hold — the
 *   roles attached to department roles (which includes the Members base role,
 *   i.e. the unit role), to ORBAT roles, and to sections and platoons — plus
 *   the legacy per-department member/lead roles. Roles the site knows nothing
 *   about are left alone: it cannot tell a rank role from a server booster.
 * - **TeamSpeak**: every server group they hold. Unlike Discord there is no
 *   reason for a discharged member to keep any of them, and rank and award
 *   groups are not mapped anywhere the site could pick them out individually.
 * - **The database**: `departments` and `departmentRoleIds` are emptied, which
 *   is what actually removes their permissions on the site.
 *
 * ## What it does not do
 *
 * It never throws. A discharge that has been approved has to go through, and a
 * Discord outage must not leave a member half-discharged — so every external
 * call is settled individually and the outcome is returned for the audit log
 * instead. Developer mode is respected for free: `removeGuildRole` and
 * `applyTsServerGroups` both go through their own gates.
 */

export interface DischargeCleanupResult {
    /** What they held on the site, for the snapshot, so a reinstatement can
     *  see what they had. */
    previousDepartments: string[]
    previousDepartmentRoleIds: string[]
    discord: { attempted: number; removed: number; failed: number; skipped?: string }
    teamspeak: { attempted: number; removed: boolean; skipped?: string }
}

export async function stripDischargedMember(discordId: string): Promise<DischargeCleanupResult> {
    const result: DischargeCleanupResult = {
        previousDepartments: [],
        previousDepartmentRoleIds: [],
        discord: { attempted: 0, removed: 0, failed: 0 },
        teamspeak: { attempted: 0, removed: false },
    }

    const user = await Db.users.findOne(
        { id: discordId },
        { projection: { departments: 1, departmentRoleIds: 1, teamspeak: 1 } },
    )
    if (!user) return result

    result.previousDepartments = [...(user.departments ?? [])]
    result.previousDepartmentRoleIds = (user.departmentRoleIds ?? []).map(id => String(id))

    // ── Discord ───────────────────────────────────────────────────────────
    try {
        const [departmentRoles, orbatRoles, sectionMeta, legacyRoles] = await Promise.all([
            Db.departmentRoles.find({}, { projection: { discordRoleIds: 1 } }).toArray(),
            Db.orbatRoles.find({}, { projection: { discordRoleIds: 1 } }).toArray(),
            Db.orbatSectionMeta.find({ discordRoleId: { $exists: true } }, { projection: { discordRoleId: 1 } }).toArray(),
            // The per-department member/lead roles predate the Roles Manager and
            // are stored by name; resolve them to ids through the roles cache.
            Db.roles.find({ name: { $in: Object.values(DEPT_ROLES).flatMap(r => [r.member, r.lead].filter((n): n is string => !!n)) } }).toArray(),
        ])

        const managed = new Set<string>([
            ...departmentRoles.flatMap(r => r.discordRoleIds ?? []),
            ...orbatRoles.flatMap(r => r.discordRoleIds ?? []),
            ...sectionMeta.map(m => m.discordRoleId).filter((id): id is string => !!id),
            ...legacyRoles.map(r => r.id).filter((id): id is string => !!id),
        ])

        // Only the roles they actually hold. Asking Discord to remove every
        // managed role from everybody would be a hundred calls to remove
        // nothing, and the bot has no retry for a rate limit.
        const guildId = process.env.DISCORD_GUILD_ID
        if (!guildId) throw new Error('DISCORD_GUILD_ID is not set')
        const member = await botRequest<{ roles: string[] }>('GET', `/guilds/${guildId}/members/${discordId}`)
        const held = (member.roles ?? []).filter(id => managed.has(id))

        result.discord.attempted = held.length
        const outcomes = await Promise.allSettled(held.map(id => removeGuildRole(discordId, id)))
        result.discord.removed = outcomes.filter(o => o.status === 'fulfilled').length
        result.discord.failed = outcomes.length - result.discord.removed
    } catch (err) {
        // Most often: they have already left the Discord server, which is a
        // perfectly good reason to have nothing to remove.
        result.discord.skipped = err instanceof Error ? err.message : 'Could not read their Discord roles'
    }

    // ── TeamSpeak ─────────────────────────────────────────────────────────
    const cldbid = user.teamspeak?.cldbid
    if (!cldbid) {
        result.teamspeak.skipped = 'No linked TeamSpeak account'
    } else {
        try {
            const groups = await getClientServerGroupIds(cldbid)
            result.teamspeak.attempted = groups.length
            if (groups.length) {
                const applied = await applyTsServerGroups(discordId, 'remove', groups)
                result.teamspeak.removed = !applied.skipped
                if (applied.skipped) result.teamspeak.skipped = applied.reason
            }
        } catch (err) {
            result.teamspeak.skipped = err instanceof Error ? err.message : 'TeamSpeak could not be reached'
        }
    }

    // ── Site ──────────────────────────────────────────────────────────────
    await Db.users.updateOne({ id: discordId }, { $set: { departments: [], departmentRoleIds: [] } })

    return result
}
