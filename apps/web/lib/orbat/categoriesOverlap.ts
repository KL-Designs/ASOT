// Two roles with the same name only conflict if they could ever appear
// together in the same category-filtered role picker. categories: []
// means "usable in every category" (unscoped), so it overlaps everything.
export function categoriesOverlap(a: string[], b: string[]): boolean {
    if (a.length === 0 || b.length === 0) return true
    return a.some(c => b.includes(c))
}
