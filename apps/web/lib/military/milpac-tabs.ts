/**
 * The sections a milpac is split into.
 *
 * Three, and the split is conceptual rather than arithmetic: who this member
 * is, what they have earned, and what they wear and carry. That is also why the
 * uniform artwork sits with the kit rather than with the service data — a
 * reader looking at the kit wants to see the uniform beside it.
 *
 * "Kits" is the unit's word for it; the code below the surface still says
 * loadout (the collection, the API routes, `lib/loadout/`), which is ARMA's own
 * term for the exported array. Renaming those would mean a data migration for
 * no reader-facing gain.
 *
 * Kept in lib/ rather than beside the component so the resolver can be tested;
 * vitest only collects lib/**\/*.test.ts.
 */

export const MILPAC_TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'record', label: 'Service Record' },
    { key: 'kits', label: 'Kits' },
] as const

export type MilpacTab = (typeof MILPAC_TABS)[number]['key']

/** The tab a `?tab=` value selects, defaulting to the first for anything else. */
export function resolveTab(raw: string | string[] | undefined): MilpacTab {
    const value = Array.isArray(raw) ? raw[0] : raw
    const match = MILPAC_TABS.find(tab => tab.key === value)
    return match ? match.key : MILPAC_TABS[0].key
}
