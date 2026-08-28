export const PLATOON_CATEGORIES = [
    { _id: 'companyHQ',  label: 'India Company HQ' },
    { _id: 'platoon11',  label: 'Platoon 1-1 Infantry' },
    { _id: 'platoon12',  label: 'Platoon 1-2 Infantry' },
    { _id: 'support',    label: 'Platoon 1-3 Support' },
    { _id: 'gamemaster', label: 'Gamemasters' },
] as const

export const RESERVIST_CATEGORIES = [
    { _id: 'activeReservist',   label: 'Company Reservists (Active)' },
    { _id: 'inactiveReservist', label: 'Company Reservists (Inactive)' },
] as const

/**
 * The same categories under the names the unit says out loud.
 *
 * `PLATOON_CATEGORIES` above carries the formal titles, which are right for a
 * heading and far too long for a chip — three of them on one row of an
 * operations list is most of the row. Kept beside the formal list rather than
 * re-typed at each call site, which is how "1-3 Support Platoon" and
 * "Platoon 1-3 Support" ended up being the same thing spelled two ways.
 */
export const PLATOON_SHORT_LABELS: Record<string, string> = {
    companyHQ:  '1-0 HQ',
    platoon11:  '1-1',
    platoon12:  '1-2',
    support:    '1-3',
    gamemaster: 'Zeus',
}

/** A category's short name, falling back to the id for anything added later. */
export function platoonShortLabel(category: string): string {
    return PLATOON_SHORT_LABELS[category] ?? category
}

// Categories that may not gain additional sections
export const SINGLE_SECTION_CATEGORIES = ['companyHQ', 'gamemaster'] as const

export const PLATOON_CATEGORY_IDS   = PLATOON_CATEGORIES.map(c => c._id) as string[]
export const RESERVIST_CATEGORY_IDS = RESERVIST_CATEGORIES.map(c => c._id) as string[]
