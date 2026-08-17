import type { ParsedLoadout } from './parse'

/**
 * The headline of a kit, for the community index at /community/kits.
 *
 * That page shows a card per shared kit rather than a full panel — a hundred
 * `LoadoutPanel`s on one page would be unreadable long before it was slow. What
 * survives the compression is what a member actually scans for when picking a
 * kit to copy: the rifle, what it is wearing, and how much is in the bags.
 *
 * Pure and separate from the page so the counting rule can be tested; vitest
 * only collects lib/**\/*.test.ts.
 */

export type KitSummary = {
    /** The rifle, with its attachments in the arsenal's own order. */
    primary: { className: string; attachments: string[] } | null
    uniform: string | null
    vest: string | null
    backpack: string | null
    headgear: string | null
    /** Everything carried, stacks counted by their multiplicity. */
    itemCount: number
}

export function summariseLoadout(kit: ParsedLoadout): KitSummary {
    const carried = [kit.uniform, kit.vest, kit.backpack]
        .flatMap(c => c?.contents ?? [])
        // A stack of 6 magazines is six items. Counting stacks instead would
        // make a well-supplied rifleman look lighter than a sparse one.
        .reduce((n, stack) => n + (Number.isFinite(stack.count) ? stack.count : 0), 0)

    // Worn and held gear is not in any container, and a kit that is all worn
    // gear and no cargo should not read as empty.
    const equipped = [
        kit.primary, kit.launcher, kit.handgun, kit.binocular,
    ].filter(Boolean).length
        + [
            kit.uniform, kit.vest, kit.backpack,
            kit.headgear, kit.facewear,
            kit.assigned.map, kit.assigned.gps, kit.assigned.radio,
            kit.assigned.compass, kit.assigned.watch, kit.assigned.nvg,
        ].filter(Boolean).length

    return {
        primary: kit.primary
            ? {
                className: kit.primary.className,
                // Muzzle, pointer, optic, bipod — the order the arsenal lists
                // them, so two kits with the same rifle line up down the page.
                attachments: [
                    kit.primary.muzzle, kit.primary.pointer,
                    kit.primary.optic, kit.primary.bipod,
                ].filter((a): a is string => Boolean(a)),
            }
            : null,
        uniform: kit.uniform?.className ?? null,
        vest: kit.vest?.className ?? null,
        backpack: kit.backpack?.className ?? null,
        headgear: kit.headgear,
        itemCount: carried + equipped,
    }
}
