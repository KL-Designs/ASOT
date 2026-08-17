/**
 * Parses an ACE arsenal export into a shape the panel can render.
 *
 * The export is ARMA's `getUnitLoadout` array, which is *positional* — slot 6
 * is headgear because it is sixth. It is also valid JSON, verified against a
 * real ASOT export, so no SQF parser is needed.
 *
 * Nothing here is stored. The raw string is the record; this runs at render, so
 * improving the parser improves every existing loadout with no migration.
 */

export class LoadoutParseError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'LoadoutParseError'
    }
}

export type WeaponSlot = {
    className: string
    muzzle: string | null
    pointer: string | null
    optic: string | null
    bipod: string | null
    magazine: { className: string; ammo: number } | null
    magazine2: { className: string; ammo: number } | null
}

/** `count` is how many; `ammo` is rounds/uses each, null for non-magazines. */
export type Stack = { className: string; count: number; ammo: number | null }

export type Container = { className: string; contents: Stack[] } | null

export type AssignedItems = {
    map: string | null
    gps: string | null
    radio: string | null
    compass: string | null
    watch: string | null
    nvg: string | null
}

export type ParsedLoadout = {
    primary: WeaponSlot | null
    launcher: WeaponSlot | null
    handgun: WeaponSlot | null
    uniform: Container
    vest: Container
    backpack: Container
    headgear: string | null
    facewear: string | null
    binocular: WeaponSlot | null
    assigned: AssignedItems
}

/** Arma writes "no item" as an empty string, which is not the same as absent. */
function orNull(v: unknown): string | null {
    return typeof v === 'string' && v.length > 0 ? v : null
}

function weapon(v: unknown): WeaponSlot | null {
    if (!Array.isArray(v) || v.length === 0) return null
    const className = orNull(v[0])
    if (!className) return null

    const mag = (m: unknown) =>
        Array.isArray(m) && m.length >= 2 && typeof m[0] === 'string'
            ? { className: m[0] as string, ammo: Number(m[1]) || 0 }
            : null

    return {
        className,
        muzzle: orNull(v[1]),
        pointer: orNull(v[2]),
        optic: orNull(v[3]),
        bipod: orNull(v[6]),
        magazine: mag(v[4]),
        magazine2: mag(v[5]),
    }
}

function container(v: unknown): Container {
    if (!Array.isArray(v) || v.length === 0) return null
    const className = orNull(v[0])
    if (!className) return null

    const raw = Array.isArray(v[1]) ? (v[1] as unknown[]) : []
    const contents: Stack[] = []
    for (const entry of raw) {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue
        contents.push({
            className: entry[0],
            count: Number(entry[1]) || 0,
            // Three elements means a magazine: the third is rounds per stack.
            ammo: entry.length >= 3 ? Number(entry[2]) || 0 : null,
        })
    }
    return { className, contents }
}

export function parseLoadout(raw: string): ParsedLoadout {
    let data: unknown
    try {
        data = JSON.parse(raw)
    } catch {
        throw new LoadoutParseError('That does not look like an ACE arsenal export — it is not valid data.')
    }

    if (!Array.isArray(data)) {
        throw new LoadoutParseError('That does not look like an ACE arsenal export — expected a list.')
    }

    // ACE wraps the loadout with an extras block; some paths produce the bare
    // loadout. Tell them apart by shape rather than by length alone.
    const slots: unknown[] =
        data.length === 2 && Array.isArray(data[0]) && (data[0] as unknown[]).length === 10
            ? (data[0] as unknown[])
            : data

    if (slots.length !== 10) {
        throw new LoadoutParseError(
            `That export has ${slots.length} slots, not the 10 a loadout has — it may have been truncated when copied.`,
        )
    }

    const assignedRaw = Array.isArray(slots[9]) ? (slots[9] as unknown[]) : []

    return {
        primary: weapon(slots[0]),
        launcher: weapon(slots[1]),
        handgun: weapon(slots[2]),
        uniform: container(slots[3]),
        vest: container(slots[4]),
        backpack: container(slots[5]),
        headgear: orNull(slots[6]),
        facewear: orNull(slots[7]),
        binocular: weapon(slots[8]),
        assigned: {
            map: orNull(assignedRaw[0]),
            gps: orNull(assignedRaw[1]),
            radio: orNull(assignedRaw[2]),
            compass: orNull(assignedRaw[3]),
            watch: orNull(assignedRaw[4]),
            nvg: orNull(assignedRaw[5]),
        },
    }
}
