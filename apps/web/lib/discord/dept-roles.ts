import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { addGuildRole, removeGuildRole, setGuildNickname } from '@/lib/discord/bot'
import { applyTsServerGroups } from '@/lib/teamspeak/groups'
import { buildNickname } from '@/lib/buildNickname'
import type { LeadershipSlot } from '@/lib/discord/dept-codes'

// Maps dept code → Discord role names to grant/revoke on membership changes.
// member: role given when a user is added to the dept (revoked on removal)
// lead:   legacy hardcoded "team lead" Discord role — still revoked on full
//         dept removal (in case a pre-migration member still holds it), but
//         no longer granted directly. Leadership slots are DepartmentRole
//         holdings now (see assignLeadershipSlot below) — configure the
//         slot-linked role's own discordRoleIds instead of relying on this.
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
    action: 'add' | 'remove',
): Promise<void> {
    const mapping = DEPT_ROLES[deptCode]
    if (!mapping) return

    if (action === 'add') {
        const id = await resolveRole(mapping.member)
        if (id) await addGuildRole(userId, id)
    } else if (action === 'remove') {
        // Remove member role and legacy lead role (in case they held it)
        const [memberId, leadId] = await Promise.all([
            resolveRole(mapping.member),
            mapping.lead ? resolveRole(mapping.lead) : Promise.resolve(null),
        ])
        await Promise.allSettled([
            memberId ? removeGuildRole(userId, memberId) : Promise.resolve(),
            leadId   ? removeGuildRole(userId, leadId)   : Promise.resolve(),
        ])
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
 * Revokes every DepartmentRole a member holds THAT BELONGS TO the given
 * department (leaving roles from other departments alone), and removes
 * them from User.departmentRoleIds. Call this whenever someone is removed
 * from a department — grants are stored per-user and don't self-heal the
 * way the base role (derived live from User.departments) does, so without
 * this cleanup a removed member keeps every grant and permission their
 * department roles gave them indefinitely. Covers leadership-slot roles
 * (assignLeadershipSlot below) too — they're ordinary DepartmentRole
 * documents stored in this same departmentRoleIds array, just with a
 * non-null linkedSlot, so no separate cleanup path is needed for them.
 */
export async function revokeDepartmentSubRoles(userId: string, deptCode: string): Promise<void> {
    const user = await Db.users.findOne({ id: userId }, { projection: { departmentRoleIds: 1 } })
    // Re-materialize through this file's own ObjectId import — the shared
    // types/user.d.ts (monorepo root) resolves ObjectId from a different
    // physical bson install than apps/web's, so TS treats them as distinct
    // nominal types even though they're runtime-identical (same 24-char hex).
    const subRoleIds = (user?.departmentRoleIds ?? []).map(id => new ObjectId(String(id)))
    if (subRoleIds.length === 0) return

    const deptSubRoles = await Db.departmentRoles.find({ _id: { $in: subRoleIds }, department: deptCode }).toArray()
    if (deptSubRoles.length === 0) return

    await Promise.allSettled(deptSubRoles.flatMap(role => [
        ...role.discordRoleIds.map(id => removeGuildRole(userId, id)),
        applyTsServerGroups(userId, 'remove', role.tsGroupIds),
    ]))
    await Db.users.updateOne({ id: userId }, { $pullAll: { departmentRoleIds: deptSubRoles.map(r => new ObjectId(String(r._id))) } })
}

async function grantDepartmentRole(userId: string, role: DepartmentRole): Promise<void> {
    await Promise.allSettled([
        ...role.discordRoleIds.map(id => addGuildRole(userId, id)),
        applyTsServerGroups(userId, 'add', role.tsGroupIds),
    ])
}

async function revokeDepartmentRole(userId: string, role: DepartmentRole): Promise<void> {
    const roleObjectId = new ObjectId(String(role._id))
    await Db.users.updateOne({ id: userId }, { $pull: { departmentRoleIds: roleObjectId } })
    await Promise.allSettled([
        ...role.discordRoleIds.map(id => removeGuildRole(userId, id)),
        applyTsServerGroups(userId, 'remove', role.tsGroupIds),
    ])
}

/**
 * Assigns a member to a department's leadership slot (leader/2ic/3ic) by
 * granting them the DepartmentRole currently linked to that slot (see
 * DepartmentRole.linkedSlot, set from the Department Roles editor) —
 * revoking it from whoever held it before, since a slot has at most one
 * holder — and granting base department membership first if they don't
 * already have it (holding a leadership slot implies membership). Throws
 * if no role is linked to that slot yet; callers should surface the
 * message as a 400.
 */
export async function assignLeadershipSlot(
    userId: string,
    deptCode: string,
    slot: LeadershipSlot,
): Promise<void> {
    const role = await Db.departmentRoles.findOne({ department: deptCode, linkedSlot: slot })
    if (!role) throw new Error('No role is linked to this position yet — link one in Department Roles first.')

    const roleObjectId = new ObjectId(String(role._id))
    const previousHolder = await Db.users.findOne({ departmentRoleIds: roleObjectId }, { projection: { id: 1 } })
    if (previousHolder && previousHolder.id !== userId) {
        await revokeDepartmentRole(previousHolder.id, role)
    }

    const target = await Db.users.findOne({ id: userId }, { projection: { departments: 1 } })
    if (!target?.departments?.includes(deptCode)) {
        await Db.users.updateOne({ id: userId }, { $addToSet: { departments: deptCode } })
        await Promise.allSettled([
            syncDeptDiscordRole(userId, deptCode, 'add'),
            applyBaseDepartmentRoleSync(userId, deptCode, 'add'),
        ])
    }

    await Db.users.updateOne({ id: userId }, { $addToSet: { departmentRoleIds: roleObjectId } })
    await grantDepartmentRole(userId, role)
}

/**
 * Removes a specific member from a department's leadership slot. No-op
 * (does not throw) if the slot has no linked role, or the member doesn't
 * currently hold it — mirrors the idempotent $pull semantics the old
 * teamLeadDepts-array removal had.
 */
export async function unassignLeadershipSlot(
    userId: string,
    deptCode: string,
    slot: LeadershipSlot,
): Promise<void> {
    const role = await Db.departmentRoles.findOne({ department: deptCode, linkedSlot: slot })
    if (!role) return
    await revokeDepartmentRole(userId, role)
}
