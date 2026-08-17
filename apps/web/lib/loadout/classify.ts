import { itemMeta } from './names'

/**
 * Which icon represents an item.
 *
 * Three tiers, most reliable first: the slot the item sits in (positional, so
 * exact), Arma's own `ItemInfo.type` code, then classname rules. Only container
 * contents reach tier three.
 *
 * Deliberately in TypeScript rather than baked into the config dump: rules will
 * be wrong on the first pass, and fixing one must not mean relaunching Arma.
 */

export const ICON_KEYS = [
    'rifle', 'carbine', 'dmr', 'sniper', 'mg', 'launcher', 'pistol', 'taser',
    'optic', 'holo', 'pointer', 'muzzle', 'bipod', 'grip',
    'magazine', 'belt', 'grenade', 'smoke', 'flashbang', 'explosive',
    'tourniquet', 'bandage', 'iv', 'syringe', 'splint', 'airway', 'chestseal',
    'surgical', 'medication', 'diagnostic',
    'radio', 'gps', 'map', 'compass', 'watch', 'nvg', 'rangefinder', 'strobe',
    'uniform', 'vest', 'backpack', 'helmet', 'facewear',
    'tool', 'document', 'item',
] as const

export type IconKey = (typeof ICON_KEYS)[number]

export type SlotContext =
    | 'primary' | 'launcher' | 'handgun'
    | 'optic' | 'pointer' | 'muzzle' | 'bipod'
    | 'uniform' | 'vest' | 'backpack' | 'headgear' | 'facewear' | 'binocular'
    | 'map' | 'gps' | 'radio' | 'compass' | 'watch' | 'nvg'
    | 'content'

/** Positional slots are exact — no inference needed or wanted. */
const BY_SLOT: Partial<Record<SlotContext, IconKey>> = {
    launcher: 'launcher', handgun: 'pistol',
    optic: 'optic', pointer: 'pointer', muzzle: 'muzzle', bipod: 'bipod',
    uniform: 'uniform', vest: 'vest', backpack: 'backpack',
    headgear: 'helmet', facewear: 'facewear', binocular: 'rangefinder',
    map: 'map', gps: 'gps', radio: 'radio', compass: 'compass',
    watch: 'watch', nvg: 'nvg',
}

/**
 * Arma's own gear-slot codes. Confirmed against the dump — 605 is headgear,
 * not glasses.
 *
 * 302 is deliberately absent. It nominally means "bipod", but 258 of the 324
 * entries carrying it are CBA/ACE misc items — `ACE_tourniquet` and
 * `MRH_SoldierTab` among them — so it is a generic bucket in practice and
 * mapping it would render tourniquets as bipods. Real bipods still resolve
 * exactly, from slot position rather than this table.
 */
const BY_TYPE: Record<number, IconKey> = {
    101: 'muzzle', 201: 'optic', 301: 'pointer',
    605: 'helmet', 616: 'nvg', 620: 'tool', 621: 'tool',
    701: 'vest', 801: 'uniform', 401: 'bandage', 619: 'surgical',
}

/** Ordered: the first match wins, so put the specific before the general. */
const BY_NAME: [RegExp, IconKey][] = [
    [/tourniquet/i, 'tourniquet'],
    [/bandage|dressing|gauze/i, 'bandage'],
    [/chestseal|occlusi/i, 'chestseal'],
    [/_IV_|salineIV|bloodIV|IO_|plasma/i, 'iv'],
    [/epinephrine|morphine|adenosine|naloxone|atropine|phenylephrine|autoinject/i, 'syringe'],
    [/splint/i, 'splint'],
    [/guedel|airway|larynx|BVM|suction|ncdKit/i, 'airway'],
    [/surgical|medikit|suture/i, 'surgical'],
    [/painkiller|penthrox|pill|carbonate|tranexamic/i, 'medication'],
    [/pulseoximeter|stethoscope|thermometer|bloodpressure/i, 'diagnostic'],
    [/smokeshell|smokegrenade|_smoke/i, 'smoke'],
    [/M84|flashbang|stun/i, 'flashbang'],
    [/grenade|_HandGrenade|_frag/i, 'grenade'],
    [/minedetector/i, 'tool'],
    [/(^|_)mine|satchel|demo(_|$)|explosive|(^|_)charge/i, 'explosive'],
    [/strobe/i, 'strobe'],
    [/microdagr|_GPS|terminal/i, 'gps'],
    [/maptools|_map/i, 'map'],
    [/rangefinder|binocular|designator/i, 'rangefinder'],
    [/entrenching|toolkit|cabletie|fiberscope|defusal/i, 'tool'],
    [/booklet|proforma|document|notepad|tab$/i, 'document'],
    [/belt|linked/i, 'belt'],
]

// Ammo magazines carry flavour words — "GPS", "Explosive", "PLASMA" — that
// collide with the instrument and medical rules below. Only a magazine whose
// name actually reads as a throwable should reach those.
const THROWABLE = /smoke|grenade|m84|flashbang|(^|_)mine|satchel|demo(_|$)|(^|_)charge|flare|chemlight/i

export function iconFor(className: string, slot: SlotContext = 'content'): IconKey {
    const bySlot = BY_SLOT[slot]
    if (bySlot) return bySlot

    const meta = itemMeta(className)

    if (slot === 'primary') {
        if (/sniper|_LRR|m107|awm/i.test(className)) return 'sniper'
        if (/(^|_)(l|h)?mg(_|$)|minimi|maximi|m249|m240|pkp/i.test(className)) return 'mg'
        if (/dmr|marksman|sr25|mk11/i.test(className)) return 'dmr'
        if (/carbine|_c8|mk18|shorty/i.test(className)) return 'carbine'
        return 'rifle'
    }

    if (meta && BY_TYPE[meta.type]) return BY_TYPE[meta.type]
    if (meta?.root === 'CfgGlasses') return 'facewear'
    if (meta?.root === 'CfgVehicles') return 'backpack'

    if (meta?.root === 'CfgMagazines' && !THROWABLE.test(className)) return 'magazine'

    for (const [re, key] of BY_NAME) if (re.test(className)) return key

    // Checked after the name rules so a smoke grenade is smoke, not "magazine".
    if (meta?.root === 'CfgMagazines') return 'magazine'
    if (/taser/i.test(className)) return 'taser'

    return 'item'
}
