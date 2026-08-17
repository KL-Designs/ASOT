/**
 * Which of a member's loadouts the profile shows.
 *
 * The picker switches kits by navigation (`?kit=<id>`) rather than by
 * client state, because `LoadoutPanel` is a server component — it resolves item
 * names against a ~2.7MB dictionary that must never reach the browser. That
 * makes the choice a query string, which anyone can type anything into, so an
 * unrecognised id has to land on something rather than rendering an empty tab.
 *
 * Viewing is deliberately separate from the default. Before the picker existed
 * the switcher set `isDefault` just to change what was on screen, which meant a
 * member could not look at a second loadout without demoting their first.
 *
 * Kept in lib/ rather than beside the component so it can be tested; vitest
 * only collects lib/**\/*.test.ts.
 */

export type SelectableLoadout = { id: string; isDefault: boolean }

/**
 * The id to render, or `null` when the member has no loadouts at all.
 *
 * Falls back the same way the page did before the query param existed — the
 * default, then the first of the list — so a bare `/milpacs/koda?tab=kits`
 * still opens on the kit the member nominated.
 */
export function pickLoadoutId(
    raw: string | string[] | undefined,
    loadouts: readonly SelectableLoadout[],
): string | null {
    if (loadouts.length === 0) return null

    // ?loadout=a&loadout=b arrives as an array; picking one beats throwing.
    const wanted = Array.isArray(raw) ? raw[0] : raw

    const asked = wanted ? loadouts.find(l => l.id === wanted) : undefined
    return (asked ?? loadouts.find(l => l.isDefault) ?? loadouts[0]).id
}

export type CardKitCandidate = { isDefault: boolean; shared: boolean; updatedAt: Date }

/**
 * The one kit a shareable card may show, or null.
 *
 * Anyone may run `/milpac profile` on anyone and the reply can land in a public
 * channel, so a kit the member did not publish must never be shown by someone
 * else's command — `shared` is the whole privacy boundary for the collection.
 * That is why an unshared default loses to a shared non-default rather than
 * simply being unlabelled.
 *
 * Sorted here rather than trusted from the caller: this is also the predicate
 * that decides whether the reply carries a Kits button, and a rule that depends
 * on query order is a rule that changes when someone adds an index.
 */
export function pickCardKit<T extends CardKitCandidate>(kits: readonly T[]): T | null {
    const publicKits = kits.filter(k => k.shared)
    if (publicKits.length === 0) return null
    return publicKits.find(k => k.isDefault)
        ?? [...publicKits].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
}
