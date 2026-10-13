/**
 * What can be restored from a discharge snapshot — the names only.
 *
 * Split from `reinstate.ts` because client components need these (the recruit
 * form's checkboxes, the lead's review panel) and that file imports the
 * database. Nothing here may import anything.
 */

export const RESTORE_ITEMS = ['qualifications', 'awards', 'trainings', 'operations'] as const
export type RestoreItem = typeof RESTORE_ITEMS[number]

export const RESTORE_LABEL: Record<RestoreItem, string> = {
    qualifications: 'Qualifications',
    awards: 'Awards and citations',
    trainings: 'Trainings',
    operations: 'Operations and campaign medallions',
}

/** The recognised items from an untrusted list, in a fixed order, each once. */
export function sanitiseRestoreItems(input: unknown): RestoreItem[] {
    if (!Array.isArray(input)) return []
    return RESTORE_ITEMS.filter(item => input.includes(item))
}
