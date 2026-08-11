import { ObjectId } from 'mongodb'

/**
 * Mongo filter fragment: matches links visible to `user` without a manage
 * gate — either unrestricted (empty/absent visibleToRoleIds) or restricted
 * to a sub-role the user holds. $and this into a { department } query.
 * Managers/leads bypass this filter entirely at the call site (they see
 * everything); this fragment is only for the "what can a plain member see"
 * case.
 */
export function visibilityFilter(user: User): Record<string, unknown> {
    const subRoleIds = (user.departmentRoleIds ?? []).map(id => new ObjectId(String(id)))
    return {
        $or: [
            { visibleToRoleIds: { $exists: false } },
            { visibleToRoleIds: { $size: 0 } },
            { visibleToRoleIds: { $in: subRoleIds } },
        ],
    }
}

/**
 * In-process equivalent of visibilityFilter, for routes that already loaded
 * one link doc (e.g. the favicon route) rather than running a list query.
 */
export function isLinkVisible(user: User, link: Pick<DepartmentLink, 'visibleToRoleIds'>): boolean {
    if (!link.visibleToRoleIds || link.visibleToRoleIds.length === 0) return true
    const held = new Set((user.departmentRoleIds ?? []).map(id => String(id)))
    return link.visibleToRoleIds.some(id => held.has(String(id)))
}
