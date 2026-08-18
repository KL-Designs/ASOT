/**
 * What a kit is *for*, in the unit's own shorthand.
 *
 * A fixed vocabulary rather than free text: tags are a filter control on the
 * shelf, and free text would give thirty spellings of "medic" and a filter bar
 * that finds nothing. Adding one is a one-line commit, the same as adding a
 * kit icon.
 *
 * Keys are short and stable — they are what is stored. Labels are what is
 * shown and may be reworded without touching a document. Lives here rather
 * than beside a component because the API routes validate against it and must
 * not pull JSX into a route handler.
 *
 * This is `apps/web/lib`, not the repo-root `lib/`: per `lib/README.md` the
 * root is for vocabulary more than one app must agree on, and the bot has no
 * concept of a kit. `kit-icons.ts` next door made the same call.
 */

export const KIT_TAGS = [
    // Role
    { key: 'staff',     label: 'Staff',             group: 'Role' },
    { key: 'sc',        label: 'Section Commander', group: 'Role' },
    { key: 'ftl',       label: 'Fireteam Leader',   group: 'Role' },
    { key: 'rifleman',  label: 'Rifleman',          group: 'Role' },
    { key: 'medical',   label: 'Medical',           group: 'Role' },
    { key: 'engineer',  label: 'Engineer',          group: 'Role' },
    { key: 'signaller', label: 'Signaller',         group: 'Role' },
    { key: 'jtac',      label: 'JTAC/FO',           group: 'Role' },
    { key: 'marksman',  label: 'Marksman',          group: 'Role' },
    { key: 'sniper',    label: 'Sniper',            group: 'Role' },
    { key: 'zeus',      label: 'Zeus',              group: 'Role' },
    // Weapon
    { key: 'mg',        label: 'MG',                group: 'Weapon' },
    { key: 'lmg',       label: 'LMG',               group: 'Weapon' },
    { key: 'mat',       label: 'MAT',               group: 'Weapon' },
    { key: 'hat',       label: 'HAT',               group: 'Weapon' },
    { key: 'grenadier', label: 'Grenadier',         group: 'Weapon' },
    { key: 'aa',        label: 'AA',                group: 'Weapon' },
    { key: 'dfsw',      label: 'DFSW',              group: 'Weapon' },
    { key: 'idf',       label: 'IDF',               group: 'Weapon' },
    // Vehicle
    { key: 'pilot',     label: 'Pilot',             group: 'Vehicle' },
    { key: 'crewman',   label: 'Crewman',           group: 'Vehicle' },
    { key: 'armour',    label: 'Armoured Crew',     group: 'Vehicle' },
    // Setting
    { key: 'night',     label: 'Night',             group: 'Setting' },
    { key: 'cqb',       label: 'CQB',               group: 'Setting' },
    { key: 'recon',     label: 'Recon',             group: 'Setting' },
    { key: 'para',      label: 'Paratrooper',       group: 'Setting' },
    { key: 'diver',     label: 'Diver',             group: 'Setting' },
    { key: 'winter',    label: 'Winter',            group: 'Setting' },
    { key: 'desert',    label: 'Desert',            group: 'Setting' },
] as const

export type KitTag = typeof KIT_TAGS[number]['key']

/** Declared order — the order chips render in, everywhere. */
export const KIT_TAG_KEYS = KIT_TAGS.map(t => t.key) as KitTag[]

export const KIT_TAG_LABELS = Object.fromEntries(
    KIT_TAGS.map(t => [t.key, t.label]),
) as Record<KitTag, string>

/** For the picker, which shows them under headings rather than as one long run. */
export const KIT_TAG_GROUPS: { group: string; tags: KitTag[] }[] =
    [...new Set(KIT_TAGS.map(t => t.group))].map(group => ({
        group,
        tags: KIT_TAGS.filter(t => t.group === group).map(t => t.key),
    }))

/** Enough for a role, a weapon and a setting without the card footer wrapping. */
export const MAX_KIT_TAGS = 4

/**
 * Narrow an untrusted value to a key.
 *
 * An explicit key-list check rather than `key in KIT_TAG_LABELS`, so
 * `__proto__` and `constructor` are rejected as firmly as a typo — the result
 * becomes a `Record` lookup on a public page.
 */
export function isKitTag(value: unknown): value is KitTag {
    return typeof value === 'string' && (KIT_TAG_KEYS as string[]).includes(value)
}

/**
 * The single gate every write goes through.
 *
 * Filtering `KIT_TAG_KEYS` rather than the input is what makes this
 * deterministic: the result is always in declared order, so chips sit in the
 * same order on every card whatever order the owner clicked them, and the cap
 * always keeps the same four rather than whichever four arrived first.
 */
export function normaliseTags(input: unknown): KitTag[] {
    if (!Array.isArray(input)) return []
    const chosen = new Set<KitTag>()
    for (const value of input) if (isKitTag(value)) chosen.add(value)
    return KIT_TAG_KEYS.filter(key => chosen.has(key)).slice(0, MAX_KIT_TAGS)
}
