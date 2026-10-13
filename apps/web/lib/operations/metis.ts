/**
 * Metis Marker, as the mod itself defines it.
 *
 * The operation map lets a mission maker place Metis markers so a plan drawn
 * on the site can be loaded in game. That only works if the site means the
 * same thing by "icon 12" as the mod does — and it did not. The lists the map
 * used were written by hand and matched Metis for the first five icons only:
 * the site's icon 6 was Artillery where the mod's is Anti-Armour (Armoured),
 * its "modifier 1" was a list of mobility types the mod has never had, and the
 * export handed HQ and Task Force flags to the slot the mod reads as
 * Reinforced and Reduced. A plan exported from the site arrived in game as
 * different units.
 *
 * Everything below is taken from the mod's own source — Metis Marker 1.9.0,
 * `addons/mts_markers`: the arrays from `initMarkerVariables.hpp`, the
 * parameter format from `fnc_createMarker.sqf` / `fnc_createMarkerLocal.sqf`,
 * the limits from `script_component.hpp`, the valid characters from
 * `initCharacterMarkerVariables.hpp`. **An entry's position in a list is its
 * id in game.** Do not reorder, insert into, or "tidy" these lists: add only
 * what the mod adds, at the index the mod adds it.
 *
 * Pure and import-free, so the mapping is tested without a map or a browser.
 */

/** The Metis Marker release these lists were read from. */
export const METIS_VERSION = '1.9.0'

/* ── Identity ───────────────────────────────────────────────────────────── */

export type MetisIdentity = 'blu' | 'red' | 'neu' | 'unk'

export const METIS_IDENTITIES: { id: MetisIdentity; label: string }[] = [
    { id: 'blu', label: 'Friendly' },
    { id: 'red', label: 'Hostile' },
    { id: 'neu', label: 'Neutral' },
    { id: 'unk', label: 'Unknown' },
]

/** Identities that have a dashed ("suspected / assumed") frame. The mod has no
 *  dashed neutral frame, and asking it for one draws nothing. */
export const METIS_DASHABLE: readonly MetisIdentity[] = ['blu', 'red', 'unk']

/* ── Icons and modifiers — index is the in-game id ──────────────────────── */

export interface MetisEntry {
    /** The mod's own name for it. */
    key: string
    label: string
    /** The textures composited to draw it: `mts_{identity}_mod_{layer}` in
     *  game, `/markers/metis/mod/{identity}_{layer}.png` on the site. */
    layers: readonly string[]
}

const entry = (key: string, label: string, layers?: string[]): MetisEntry => ({
    key, label, layers: key === 'empty' ? [] : (layers ?? [key]),
})

/** `mts_markers_iconArray`. */
export const METIS_ICONS: readonly MetisEntry[] = [
    entry('empty', 'None'),
    entry('infantry', 'Infantry'),
    entry('infantry_mechanized', 'Mechanised infantry', ['infantry', 'armor']),
    entry('infantry_motorized', 'Motorised infantry', ['infantry', 'motorized']),
    entry('armor', 'Armour'),
    entry('anti_armor', 'Anti-armour'),
    entry('anti_armor_armored', 'Anti-armour (armoured)', ['anti_armor', 'armor']),
    entry('anti_armor_motorized', 'Anti-armour (motorised)', ['anti_armor', 'motorized']),
    entry('maintenance', 'Maintenance'),
    entry('air_defence', 'Air defence'),
    entry('air_defence_missile', 'Air defence missile', ['air_defence', 'missile']),
    entry('fixed_wing', 'Fixed wing'),
    entry('rotary_wing', 'Rotary wing'),
    entry('uav', 'UAV'),
    entry('engineer', 'Engineer'),
    entry('engineer_armored', 'Engineer (armoured)'),
    entry('engineer_motorized', 'Engineer (motorised)', ['engineer', 'motorized']),
    entry('artillery', 'Artillery'),
    entry('artillery_sp', 'Self-propelled artillery'),
    entry('mortar', 'Mortar'),
    entry('mortar_armored', 'Mortar (armoured)'),
    entry('reconnaissance', 'Reconnaissance'),
    entry('reconnaissance_armored', 'Reconnaissance (armoured)', ['reconnaissance', 'armor']),
    entry('reconnaissance_motorized', 'Reconnaissance (motorised)', ['reconnaissance', 'motorized']),
    entry('surface_surface_missile', 'Surface-to-surface missile', ['missile', 'surface_surface']),
    entry('cbrn', 'CBRN'),
    entry('military_intelligence', 'Military intelligence'),
    entry('military_police', 'Military police'),
    entry('signal_unit', 'Signals'),
    entry('combat_service_support', 'Combat service support'),
    entry('medical', 'Medical'),
    entry('supply', 'Supply'),
    entry('transportation', 'Transport'),
    entry('amphibious_infantry', 'Amphibious infantry', ['amphibious', 'infantry']),
    entry('amphibious_armor', 'Amphibious armour', ['amphibious', 'armor']),
    entry('amphibious_reconnaissance', 'Amphibious reconnaissance', ['amphibious', 'reconnaissance']),
    entry('naval', 'Naval'),
    entry('combined_arms', 'Combined arms'),
    entry('joint_fire_support', 'Joint fire support'),
    entry('special_forces', 'Special forces'),
    entry('special_operation_forces', 'Special operations forces'),
    entry('radar', 'Radar'),
    entry('field_artillery_observer', 'Field artillery observer'),
    entry('eod', 'EOD'),
    entry('ranger', 'Ranger'),
    entry('aviation_composite', 'Aviation (composite)'),
    entry('electromagnetic_warfare', 'Electronic warfare'),
    entry('internal_security_force', 'Internal security force'),
    entry('isaf', 'ISAF'),
    entry('liaison', 'Liaison'),
    entry('main_gun_system', 'Main gun system'),
    entry('main_gun_system_infantry', 'Main gun system (infantry)', ['main_gun_system', 'infantry']),
    entry('main_gun_system_mechanized', 'Main gun system (mechanised)', ['main_gun_system', 'infantry', 'armor']),
    entry('main_gun_system_air_defence', 'Main gun system (air defence)', ['main_gun_system', 'air_defence']),
    entry('police', 'Police'),
    entry('search_and_rescue', 'Search and rescue'),
]

/** `mts_markers_mod1Array` — drawn in the top of the frame. */
export const METIS_MOD1: readonly MetisEntry[] = [
    entry('empty', 'None'),
    entry('air_assault', 'Air assault'),
    entry('attack', 'Attack'),
    entry('maintenance_top', 'Maintenance'),
    entry('multiple_rocket_launcher', 'Multiple rocket launcher'),
    entry('single_rocket_launcher', 'Single rocket launcher'),
    entry('sniper', 'Sniper'),
    entry('headquarters', 'Headquarters'),
    entry('naval_top', 'Naval'),
    entry('radar_top', 'Radar'),
    entry('bridging', 'Bridging'),
    entry('medevac', 'MEDEVAC'),
    entry('eod_top', 'EOD'),
]

/** `mts_markers_mod2Array` — drawn in the bottom of the frame. */
export const METIS_MOD2: readonly MetisEntry[] = [
    entry('empty', 'None'),
    entry('airborne', 'Airborne'),
    entry('heavy', 'Heavy'),
    entry('medium', 'Medium'),
    entry('light', 'Light'),
    entry('mountain', 'Mountain'),
    entry('vstol', 'VSTOL'),
    entry('wheeled', 'Wheeled'),
    entry('towed', 'Towed'),
]

/** `mts_markers_echelonArray`, with the symbol NATO draws above the frame. */
export const METIS_ECHELONS: readonly { key: string; label: string; symbol: string }[] = [
    { key: 'empty', label: 'None', symbol: '' },
    { key: 'team', label: 'Team / crew', symbol: 'Ø' },
    { key: 'squad', label: 'Squad', symbol: '●' },
    { key: 'section', label: 'Section', symbol: '●●' },
    { key: 'platoon', label: 'Platoon', symbol: '●●●' },
    { key: 'company', label: 'Company', symbol: 'I' },
    { key: 'battalion', label: 'Battalion', symbol: 'II' },
    { key: 'regiment', label: 'Regiment', symbol: 'III' },
    { key: 'brigade', label: 'Brigade', symbol: 'X' },
    { key: 'division', label: 'Division', symbol: 'XX' },
    { key: 'corps', label: 'Corps', symbol: 'XXX' },
    { key: 'army', label: 'Army', symbol: 'XXXX' },
    { key: 'army_group', label: 'Army group', symbol: 'XXXXX' },
]

/** `mts_markers_directions`, clockwise from north, so `index * 22.5` is the bearing. */
export const METIS_DIRECTIONS = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const
export type MetisDirection = typeof METIS_DIRECTIONS[number]

/** Operational condition: `OC_FULLY_CAPABLE`, `OC_DAMAGED`, `OC_DESTROYED`. */
export const METIS_CONDITIONS: readonly { id: 0 | 1 | 2; label: string; colour: string | null }[] = [
    { id: 0, label: 'Fully capable', colour: null },
    { id: 1, label: 'Damaged', colour: '#e0b020' },
    { id: 2, label: 'Destroyed', colour: '#d02020' },
]

export const METIS_DEFAULT_SCALE = 1.3
export const METIS_TEXT_MAX = 6

/** `mts_markers_validCharacters`: what the mod can draw in the two short texts. */
const VALID_CHARS = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/\\.+- ()[]{}=~:,|*^_'.split(''))

/* ── A marker ───────────────────────────────────────────────────────────── */

export interface MetisMarker {
    identity: MetisIdentity
    /** Dashed frame: suspected / assumed. */
    dashed: boolean
    /** Headquarters staff indicator. */
    hq: boolean
    /** Index into METIS_ICONS. */
    icon: number
    /** Index into METIS_MOD1. */
    mod1: number
    /** Index into METIS_MOD2. */
    mod2: number
    /** Index into METIS_ECHELONS. */
    echelon: number
    reinforced: boolean
    reduced: boolean
    /** Bottom left, at most six of the mod's characters. */
    designation: string
    /** Right of the frame: free text. */
    additionalInfo: string
    /** Bottom right, at most six of the mod's characters. */
    higherFormation: string
    condition: 0 | 1 | 2
    direction: MetisDirection | ''
    scale: number
}

export const DEFAULT_METIS: MetisMarker = {
    identity: 'blu', dashed: false, hq: false,
    icon: 0, mod1: 0, mod2: 0, echelon: 0, reinforced: false, reduced: false,
    designation: '', additionalInfo: '', higherFormation: '',
    condition: 0, direction: '', scale: METIS_DEFAULT_SCALE,
}

const index = (value: unknown, list: readonly unknown[]): number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < list.length ? value : 0

/**
 * A short text as the mod will accept it: upper case, the mod's characters
 * only, six at most. The mod drops the *whole* text if one character is
 * invalid, so an unsupported character is removed here rather than left to
 * silently blank the designation in game.
 */
export function metisText(value: unknown): string {
    if (typeof value !== 'string') return ''
    return value.toUpperCase().split('').filter(c => VALID_CHARS.has(c)).join('').slice(0, METIS_TEXT_MAX)
}

/** Any object, as a marker the mod can draw. Unknown values fall back to the defaults. */
export function normaliseMetis(input: Partial<Record<keyof MetisMarker, unknown>> | null | undefined): MetisMarker {
    const m = input ?? {}
    const identity = METIS_IDENTITIES.some(i => i.id === m.identity) ? (m.identity as MetisIdentity) : 'blu'
    const scale = typeof m.scale === 'number' && m.scale > 0 && m.scale <= 5 ? m.scale : METIS_DEFAULT_SCALE
    return {
        identity,
        dashed: m.dashed === true && METIS_DASHABLE.includes(identity),
        hq: m.hq === true,
        icon: index(m.icon, METIS_ICONS),
        mod1: index(m.mod1, METIS_MOD1),
        mod2: index(m.mod2, METIS_MOD2),
        echelon: index(m.echelon, METIS_ECHELONS),
        reinforced: m.reinforced === true,
        reduced: m.reduced === true,
        designation: metisText(m.designation),
        additionalInfo: typeof m.additionalInfo === 'string' ? m.additionalInfo.replace(/["\r\n]/g, ' ').trim().slice(0, 60) : '',
        higherFormation: metisText(m.higherFormation),
        condition: m.condition === 1 || m.condition === 2 ? m.condition : 0,
        direction: (METIS_DIRECTIONS as readonly string[]).includes(m.direction as string) ? (m.direction as MetisDirection) : '',
        scale,
    }
}

/* ── Drawing ────────────────────────────────────────────────────────────── */

/**
 * The textures that make up a marker, bottom to top, as paths under
 * `/markers/metis/` without the extension.
 *
 * The same family the mod creates in `fnc_createMarkerLocal`: the frame, the
 * HQ staff, the echelon, the reinforced/reduced sign, then every modifier
 * layer of the icon and the two modifiers. The mod replaces the HQ staff with
 * the direction arrow when both are set; the site has no arrow textures, so it
 * keeps the staff and draws the arrow itself (see `metisBearing`).
 */
export function metisLayers(marker: MetisMarker): string[] {
    const id = marker.identity
    const layers = [marker.dashed && METIS_DASHABLE.includes(id) ? `frame/${id}_dash` : `frame/${id}`]
    if (marker.hq) layers.push(`frame/${id}_hq`)
    if (marker.echelon > 0) layers.push(`size/${id}_${marker.echelon}`)
    if (marker.reinforced && marker.reduced) layers.push('com/reinforced_reduced')
    else if (marker.reinforced) layers.push('com/reinforced')
    else if (marker.reduced) layers.push('com/reduced')
    for (const name of metisModifierNames(marker)) layers.push(`mod/${id}_${name}`)
    return layers
}

/** `mts_markers_fnc_getAllModifiers`: every modifier texture name, in the mod's order. */
export function metisModifierNames(marker: Pick<MetisMarker, 'icon' | 'mod1' | 'mod2'>): string[] {
    return [
        ...(METIS_ICONS[marker.icon]?.layers ?? []),
        ...(METIS_MOD1[marker.mod1]?.layers ?? []),
        ...(METIS_MOD2[marker.mod2]?.layers ?? []),
    ]
}

/** The direction-of-movement arrow's compass bearing in degrees, or null. */
export function metisBearing(direction: MetisMarker['direction']): number | null {
    const at = (METIS_DIRECTIONS as readonly string[]).indexOf(direction)
    return at < 0 ? null : at * 22.5
}

/** A one-line description, for a tooltip or a list: "Friendly mechanised infantry platoon (HQ)". */
export function describeMetis(marker: MetisMarker): string {
    const parts = [METIS_IDENTITIES.find(i => i.id === marker.identity)?.label ?? '']
    if (marker.dashed) parts.push('suspected')
    if (marker.icon > 0) parts.push(METIS_ICONS[marker.icon].label.toLowerCase())
    if (marker.echelon > 0) parts.push(METIS_ECHELONS[marker.echelon].label.toLowerCase())
    const text = parts.filter(Boolean).join(' ')
    return marker.hq ? `${text} (HQ)` : text
}

/* ── SQF ────────────────────────────────────────────────────────────────── */

const sqfString = (value: string) => `"${value.replace(/"/g, '""')}"`
const sqfChars = (value: string) => `[${value.split('').map(sqfString).join(',')}]`

/**
 * The marker configuration array `mts_markers_fnc_createMarker` takes as its
 * fourth parameter, as SQF source:
 *
 *   [[identity, dashed, hq], [icon, mod1, mod2], [echelon, reinforced, reduced],
 *    [designation chars], additionalInfo, [higherFormation chars],
 *    condition, [], direction]
 *
 * The two short texts are arrays of single characters — that is how the mod
 * takes them — and the empty array is the Date-Time Group, which the site does
 * not set.
 */
export function metisConfigSqf(input: MetisMarker): string {
    const m = normaliseMetis(input)
    return '['
        + `[${sqfString(m.identity)},${m.dashed},${m.hq}],`
        + `[${m.icon},${m.mod1},${m.mod2}],`
        + `[${m.echelon},${m.reinforced},${m.reduced}],`
        + `${sqfChars(m.designation)},`
        + `${sqfString(m.additionalInfo)},`
        + `${sqfChars(m.higherFormation)},`
        + `${m.condition},[],${sqfString(m.direction)}`
        + ']'
}

/**
 * One complete call: `[pos, channel, editable, config, scale] call mts_markers_fnc_createMarker`.
 *
 * Channel `-10` is the mod's "global, without channel alpha": everybody sees
 * the plan, which is what a briefing overlay is for.
 */
export function metisCreateSqf(marker: MetisMarker, x: number, y: number, editable = true): string {
    const m = normaliseMetis(marker)
    return `[[${x},${y}],-10,${editable},${metisConfigSqf(m)},${m.scale}] call mts_markers_fnc_createMarker`
}

/* ── Markers drawn before this file existed ─────────────────────────────── */

/** The annotation properties a Metis marker is stored in. */
export interface MetisStoredProps {
    /** 2 = the indices are the mod's. Absent = the old hand-written lists. */
    a3MetisV?: number
    a3SideId?: string
    a3Dashed?: boolean
    a3Hq?: boolean
    a3Icon?: number
    a3Mod1?: number
    a3Mod2?: number
    a3Size?: number
    a3HqTf?: number
    a3Reinforced?: boolean
    a3Reduced?: boolean
    a3Designation?: string
    a3AdditionalInfo?: string
    a3HigherFormation?: string
    a3Condition?: number
    a3Direction?: string
    a3MetisScale?: number
}

/**
 * The old icon list, by index, as the key of the icon it was *drawn* as.
 *
 * A marker placed with the old lists has to keep looking like what its author
 * saw, so each old index is mapped to the real icon with the same picture —
 * not to whatever the mod has at the same number.
 */
const LEGACY_ICON_KEYS = [
    'empty', 'infantry', 'infantry_mechanized', 'infantry_motorized', 'armor', 'anti_armor',
    'artillery', 'air_defence', 'rotary_wing', 'fixed_wing', 'naval', 'combat_service_support',
    'medical', 'reconnaissance', 'engineer', 'signal_unit', 'mortar', 'special_operation_forces',
    'military_police',
]

/** Old modifier 2 (None / Airborne / Mountain / Arctic) → the mod's. Arctic has no equivalent. */
const LEGACY_MOD2 = [0, 1, 5, 0]

/** Old "mobility" modifier → the mod's modifier 2, where it has one: Wheeled and Towed. */
const LEGACY_MOBILITY_TO_MOD2: Record<number, number> = { 1: 7, 2: 7, 5: 8 }

const keyIndex = (list: readonly MetisEntry[], key: string) => Math.max(0, list.findIndex(e => e.key === key))

/**
 * Read a stored marker, whichever lists it was written with.
 *
 * Version 2 props are the mod's indices and are read straight. Anything older
 * is translated: the icon by its picture, the old modifier 2 by name, the old
 * mobility list onto modifier 2 where the mod has the same idea, and the old
 * HQ / Task Force / Feint selector down to the one thing the mod has, the HQ
 * staff. Task force and feint markers have no Metis equivalent and lose that
 * flag — there is nothing to export them as.
 */
export function readMetis(props: MetisStoredProps | null | undefined): MetisMarker {
    const p = props ?? {}
    const identity = p.a3SideId === 'grn' ? 'neu' : p.a3SideId
    const common = {
        identity, dashed: p.a3Dashed, echelon: p.a3Size,
        reinforced: p.a3Reinforced, reduced: p.a3Reduced,
        designation: p.a3Designation, additionalInfo: p.a3AdditionalInfo, higherFormation: p.a3HigherFormation,
        condition: p.a3Condition, direction: p.a3Direction,
        // The old scale was a multiplier on the mod's default; the new one is the mod's own number.
        scale: p.a3MetisV === 2 ? p.a3MetisScale : (typeof p.a3MetisScale === 'number' ? p.a3MetisScale * METIS_DEFAULT_SCALE : undefined),
    }

    if (p.a3MetisV === 2) {
        return normaliseMetis({ ...common, hq: p.a3Hq, icon: p.a3Icon, mod1: p.a3Mod1, mod2: p.a3Mod2 })
    }

    const oldMod2 = LEGACY_MOD2[p.a3Mod2 ?? 0] ?? 0
    return normaliseMetis({
        ...common,
        hq: [1, 2, 5, 6].includes(p.a3HqTf ?? 0),
        icon: keyIndex(METIS_ICONS, LEGACY_ICON_KEYS[p.a3Icon ?? 0] ?? 'empty'),
        mod1: 0,
        mod2: oldMod2 || (LEGACY_MOBILITY_TO_MOD2[p.a3Mod1 ?? 0] ?? 0),
    })
}

/** A marker as version 2 annotation properties. */
export function writeMetis(marker: MetisMarker): Required<Omit<MetisStoredProps, 'a3HqTf' | 'a3SideId'>> & { a3SideId: MetisIdentity } {
    const m = normaliseMetis(marker)
    return {
        a3MetisV: 2,
        a3SideId: m.identity,
        a3Dashed: m.dashed,
        a3Hq: m.hq,
        a3Icon: m.icon,
        a3Mod1: m.mod1,
        a3Mod2: m.mod2,
        a3Size: m.echelon,
        a3Reinforced: m.reinforced,
        a3Reduced: m.reduced,
        a3Designation: m.designation,
        a3AdditionalInfo: m.additionalInfo,
        a3HigherFormation: m.higherFormation,
        a3Condition: m.condition,
        a3Direction: m.direction,
        a3MetisScale: m.scale,
    }
}
