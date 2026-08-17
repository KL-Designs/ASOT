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
