// Two roles with the same name only conflict if they could ever appear
// together in the same category-filtered role picker. categories: []
// means "usable in every category" (unscoped), so it overlaps everything.
export function categoriesOverlap(a: string[], b: string[]): boolean {
    if (a.length === 0 || b.length === 0) return true
    return a.some(c => b.includes(c))
}

function sameTag(a: string | null, b: string | null): boolean {
    return (a ?? '').trim() === (b ?? '').trim()
}

// Two same-named roles conflict only if their categories overlap AND their
// tags match — a tag lets two roles share both a name and an overlapping
// category scope, as long as they're tagged differently.
export function rolesConflict(a: { categories: string[]; tag: string | null }, b: { categories: string[]; tag: string | null }): boolean {
    return categoriesOverlap(a.categories, b.categories) && sameTag(a.tag, b.tag)
}
