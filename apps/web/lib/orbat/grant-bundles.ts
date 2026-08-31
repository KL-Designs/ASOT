import { MEMBERS_DEPT } from '@/lib/discord/dept-codes'

/**
 * Expected-grant assembly for one member: which Discord roles and TeamSpeak
 * groups they are owed, and what owes each of them.
 *
 * Deliberately pure and dependency-free — it takes catalogs the caller has
 * already loaded rather than reaching for `Db` itself. `member-sync.ts`, the
 * only consumer, opens a TeamSpeak connection and fetches every guild member
 * before it gets this far, which made the rules below untestable while they
 * lived inside it.
 *
 * A grant appearing in more than one bundle is normal and handled upstream —
 * a department base role and an ORBAT role may legitimately list the same
 * Discord role, and `mergeBundles` keeps every source that contributed it.
 */

export interface GrantBundle {
    discordRoleIds: string[]
    tsGroupIds: number[]
    source: string
}

export interface GrantCatalog {
    /** Base DepartmentRole per department code, including `members`. */
    deptBaseByDept: Map<string, DepartmentRole>
    /** Every DepartmentRole by stringified _id, for sub-role lookups. */
    deptRoleById: Map<string, DepartmentRole>
    /** Every OrbatRole by stringified _id. */
    orbatRoleById: Map<string, OrbatRole>
    /** The member's ORBAT position, if they hold one — reservist positions included. */
    positionByUserId: Map<string, OrbatPosition>
    /** Section metadata keyed `${category}:${sectionTitle ?? ''}`. */
    sectionMetaByKey: Map<string, OrbatSectionMeta>
}

type GrantSubject = Pick<User, 'id'> & {
    departments?: string[]
    departmentRoleIds?: unknown[]
}

export function grantBundlesFor(user: GrantSubject, catalog: GrantCatalog): GrantBundle[] {
    const bundles: GrantBundle[] = []

    for (const dept of user.departments ?? []) {
        // `members` is not a department anyone belongs to, so it can never
        // appear here — but skip it explicitly rather than relying on that,
        // since a stray value would otherwise grant it to one person.
        if (dept === MEMBERS_DEPT) continue
        const base = catalog.deptBaseByDept.get(dept)
        if (base) bundles.push({ discordRoleIds: base.discordRoleIds, tsGroupIds: base.tsGroupIds, source: `Department: ${dept.toUpperCase()} base role` })
    }

    for (const id of user.departmentRoleIds ?? []) {
        const role = catalog.deptRoleById.get(String(id))
        if (role && (user.departments ?? []).includes(role.department)) {
            bundles.push({ discordRoleIds: role.discordRoleIds, tsGroupIds: role.tsGroupIds, source: `Department: ${role.name}` })
        }
    }

    const position = catalog.positionByUserId.get(user.id)
    if (position) {
        // Owed to everyone in the ORBAT — callsign holders and reservists
        // alike, and regardless of whether the position carries a roleId.
        const members = catalog.deptBaseByDept.get(MEMBERS_DEPT)
        if (members) {
            bundles.push({ discordRoleIds: members.discordRoleIds, tsGroupIds: members.tsGroupIds, source: 'Members: everyone in the ORBAT' })
        }

        if (position.roleId) {
            const role = catalog.orbatRoleById.get(String(position.roleId))
            if (role) bundles.push({ discordRoleIds: role.discordRoleIds, tsGroupIds: role.tsGroupIds, source: `ORBAT: ${role.name}` })
        }

        const categoryMeta = catalog.sectionMetaByKey.get(`${position.category}:`)
        if (categoryMeta) {
            bundles.push({
                discordRoleIds: categoryMeta.discordRoleId ? [categoryMeta.discordRoleId] : [],
                tsGroupIds: typeof categoryMeta.tsGroupId === 'number' ? [categoryMeta.tsGroupId] : [],
                source: `ORBAT category: ${position.category}`,
            })
        }

        if (position.sectionTitle) {
            const sectionMeta = catalog.sectionMetaByKey.get(`${position.category}:${position.sectionTitle}`)
            if (sectionMeta) {
                bundles.push({
                    discordRoleIds: sectionMeta.discordRoleId ? [sectionMeta.discordRoleId] : [],
                    tsGroupIds: typeof sectionMeta.tsGroupId === 'number' ? [sectionMeta.tsGroupId] : [],
                    source: `ORBAT section: ${position.sectionTitle}`,
                })
            }
        }
    }

    return bundles
}
