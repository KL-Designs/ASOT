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

// Categories that may not gain additional sections
export const SINGLE_SECTION_CATEGORIES = ['companyHQ', 'gamemaster'] as const

export const PLATOON_CATEGORY_IDS   = PLATOON_CATEGORIES.map(c => c._id) as string[]
export const RESERVIST_CATEGORY_IDS = RESERVIST_CATEGORIES.map(c => c._id) as string[]
