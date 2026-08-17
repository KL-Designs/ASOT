/**
 * The sections a milpac is split into.
 *
 * Three, and the split is conceptual rather than arithmetic: who this member
 * is, what they have earned, and what they wear and carry. That is also why the
 * uniform artwork sits with the kit rather than with the service data — a
 * reader looking at the kit wants to see the uniform beside it.
 *
 * Each section is a **path segment**, not a `?tab=` value. The App Router
 * aborts a navigation that changes only the query string on the same path — the
 * segment tree is unchanged, so it cancels the RSC fetch and commits nothing,
 * with no error anywhere. Measured against production, a `?tab=` link took 2-8
 * clicks to commit while ordinary links to a different path committed on the
 * first, every time. A path segment makes each tab a real route change.
 *
 * "Kits" is the unit's word for the third; the code below the surface still
 * says loadout (the collection, the API routes, `lib/loadout/`), which is ARMA's
 * own term for the exported array.
 *
 * Kept in lib/ rather than beside the component so the helpers can be tested;
 * vitest only collects lib/**\/*.test.ts.
 */

export const MILPAC_TABS = [
    // The default section owns the bare `/milpacs/<name>` URL, so its segment
    // is empty — there is no `/overview` to keep in step with it.
    { key: 'overview', label: 'Overview', segment: '' },
    { key: 'record', label: 'Service Record', segment: 'record' },
    { key: 'kits', label: 'Kits', segment: 'kits' },
] as const

export type MilpacTab = (typeof MILPAC_TABS)[number]['key']

/** The path a tab lives at, relative to `/milpacs/<segment>`. */
export function tabPath(tab: MilpacTab): string {
    const match = MILPAC_TABS.find(t => t.key === tab)
    return match && match.segment ? `/${match.segment}` : ''
}

/**
 * The suffix a redirect should carry so a shared link to a section lands on
 * that section rather than dumping the reader back on the overview.
 *
 * `kitSegment` is encoded rather than trusted: it arrives as a path segment and
 * goes straight back out in a `Location` header.
 */
export function tabSuffix(tab: MilpacTab, kitSegment?: string): string {
    const base = tabPath(tab)
    if (tab !== 'kits' || !kitSegment) return base
    return `${base}/${encodeURIComponent(kitSegment)}`
}
