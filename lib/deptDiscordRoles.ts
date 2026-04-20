import Db from '@/lib/mongo'
import { addGuildRole, removeGuildRole, setGuildNickname } from '@/lib/discord/bot'
import { buildNickname } from '@/lib/buildNickname'

// Maps dept code → Discord role names to grant/revoke on membership changes.
// member: role given when a user is added to the dept (revoked on removal)
// lead:   role given when a user becomes team lead (revoked on remove-lead); also revoked on full dept removal
const DEPT_ROLES: Record<string, { member: string; lead?: string }> = {
    j1: { member: 'J1-Recruitment', lead: 'J1-Staff' },
    j2: { member: 'J2-Mission Making', lead: 'J2-Team Lead' },
    j3: { member: 'J3-Training', lead: 'J3-Team Lead' },
    j4: { member: 'J4-Administration' },
    j5: { member: 'J5-Media' },
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
