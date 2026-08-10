import Db from '@/lib/mongo'
import { addGuildRole, removeGuildRole, setGuildNickname } from '@/lib/discord/bot'
import { applyTsServerGroups } from '@/lib/teamspeak/groups'
import { buildNickname } from '@/lib/buildNickname'

// Maps dept code → Discord role names to grant/revoke on membership changes.
// member: role given when a user is added to the dept (revoked on removal)
// lead:   role given when a user becomes team lead (revoked on remove-lead); also revoked on full dept removal
export const DEPT_ROLES: Record<string, { member: string; lead?: string }> = {
    j1: { member: 'J1-Recruitment', lead: 'J1-Staff' },
    j2: { member: 'J2-Mission Making', lead: 'J2-Team Lead' },
    j3: { member: 'J3-Training', lead: 'J3-Team Lead' },
    j4: { member: 'J4-Administration' },
    j5: { member: 'J5-Media', lead: 'J5-Team Lead' },
    j6: { member: 'J6 - Game Master', lead: 'J6-Department Lead' },
    j7: { member: 'J7 Community Development', lead: 'J7 Staff' },
}

async function resolveRole(name: string): Promise<string | null> {
    const role = await Db.roles.findOne({ name })
    return role?.id ?? null
}

export async function syncDeptDiscordRole(
    userId: string,
    deptCode: string,
    action: 'add' | 'remove' | 'set-lead' | 'remove-lead',
): Promise<void> {
    const mapping = DEPT_ROLES[deptCode]
    if (!mapping) return

    if (action === 'add') {
        const id = await resolveRole(mapping.member)
        if (id) await addGuildRole(userId, id)
    } else if (action === 'remove') {
        // Remove member role and lead role (in case they held it)
        const [memberId, leadId] = await Promise.all([
            resolveRole(mapping.member),
            mapping.lead ? resolveRole(mapping.lead) : Promise.resolve(null),
        ])
        await Promise.allSettled([
            memberId ? removeGuildRole(userId, memberId) : Promise.resolve(),
            leadId   ? removeGuildRole(userId, leadId)   : Promise.resolve(),
        ])
    } else if (action === 'set-lead' && mapping.lead) {
        const id = await resolveRole(mapping.lead)
        if (id) await addGuildRole(userId, id)
    } else if (action === 'remove-lead' && mapping.lead) {
        const id = await resolveRole(mapping.lead)
        if (id) await removeGuildRole(userId, id)
    }

    // Rebuild Discord nickname to reflect updated department tags
    const user = await Db.users.findOne({ id: userId })
    if (user) {
        const nick = buildNickname(
            user.milpac?.currentRank,
            user.name || user.username || userId,
            user.departments,
            user.isChaplain,
        )
        await setGuildNickname(userId, nick)
    }
}

/**
 * Grants or revokes a department's base DepartmentRole (Discord roles +
 * TeamSpeak groups) for a member. Every mutation path that adds/removes
 * someone from User.departments should call this alongside the existing
 * section-level syncDeptDiscordRole, since the base role's grants are a
 * separate, admin-configured layer on top of plain membership.
 */
export async function applyBaseDepartmentRoleSync(
    userId: string,
    deptCode: string,
    action: 'add' | 'remove',
): Promise<void> {
    const baseRole = await Db.departmentRoles.findOne({ department: deptCode, isBase: true })
    if (!baseRole) return
    const grantFn = action === 'add' ? addGuildRole : removeGuildRole
    await Promise.allSettled([
        ...baseRole.discordRoleIds.map(id => grantFn(userId, id)),
        applyTsServerGroups(userId, action, baseRole.tsGroupIds),
    ])
}

/**
 * Revokes every DepartmentRole sub-role a member holds THAT BELONGS TO the
 * given department (leaving any sub-roles from other departments alone),
 * and removes them from User.departmentRoleIds. Call this whenever someone
 * is removed from a department — sub-role grants are stored per-user and
 * don't self-heal the way the base role (derived live from User.departments)
 * does, so without this cleanup a removed member keeps every grant and
 * permission their department sub-roles gave them indefinitely.
 */
export async function revokeDepartmentSubRoles(userId: string, deptCode: string): Promise<void> {
    const user = await Db.users.findOne({ id: userId }, { projection: { departmentRoleIds: 1 } })
    const subRoleIds = user?.departmentRoleIds ?? []
    if (subRoleIds.length === 0) return

    const deptSubRoles = await Db.departmentRoles.find({ _id: { $in: subRoleIds }, department: deptCode }).toArray()
    if (deptSubRoles.length === 0) return

    await Promise.allSettled(deptSubRoles.flatMap(role => [
        ...role.discordRoleIds.map(id => removeGuildRole(userId, id)),
        applyTsServerGroups(userId, 'remove', role.tsGroupIds),
    ]))
    await Db.users.updateOne({ id: userId }, { $pull: { departmentRoleIds: { $in: deptSubRoles.map(r => r._id) } } })
}
