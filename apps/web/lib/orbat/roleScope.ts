/**
 * Where an ORBAT role is allowed to be used.
 *
 * `OrbatRole.categories` is a whitelist of platoon categories, and an **empty**
 * array means "usable everywhere" rather than "usable nowhere" — the ORBAT's
 * own convention, and the sort of inversion that is easy to get backwards when
 * the rule is re-typed at each call site.
 *
 * It was re-typed at each call site: the Roles Manager's picker had it inline,
 * and the mass importer had its own variant. Pulling it out gives the
 * attendance board the same rule the ORBAT enforces, and gives the server a
 * shared way to *check* it rather than trusting a client that filtered a
 * dropdown.
 */

/** The only part of an OrbatRole this rule looks at. */
export interface ScopedRole {
    categories: string[]
}

export function roleAllowedIn<T extends ScopedRole>(role: T, category: string): boolean {
    return role.categories.length === 0 || role.categories.includes(category)
}

/** Every role usable in a category, in the order given. */
export function rolesFor<T extends ScopedRole>(roles: T[], category: string): T[] {
    return roles.filter(r => roleAllowedIn(r, category))
}
