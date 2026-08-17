/**
 * The sections a milpac is split into.
 *
 * Three, and the split is conceptual rather than arithmetic: who this member
 * is, what they have earned, and what they wear and carry. That is also why the
 * uniform artwork sits with the loadout rather than with the service data — a
 * reader looking at the kit wants to see the uniform beside it.
 *
 * Kept in lib/ rather than beside the component so the resolver can be tested;
 * vitest only collects lib/**\/*.test.ts.
 */

export const MILPAC_TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'record', label: 'Service Record' },
    { key: 'loadout', label: 'Loadout' },
] as const

export type MilpacTab = (typeof MILPAC_TABS)[number]['key']

/** The tab a `?tab=` value selects, defaulting to the first for anything else. */
export function resolveTab(raw: string | string[] | undefined): MilpacTab {
    const value = Array.isArray(raw) ? raw[0] : raw
    const match = MILPAC_TABS.find(tab => tab.key === value)
    return match ? match.key : MILPAC_TABS[0].key
}
