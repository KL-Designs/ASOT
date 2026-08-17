import { resolveItemName } from './names'
import type { KitSummary } from './summary'

/**
 * A kit compressed to one line, for the Discord dossier card.
 *
 * Shorter than the community index's card, which has three lines and a grid to
 * spend. Here there is one line at the foot of a 1400px canvas drawn by satori,
 * which does not wrap gracefully — so the rule is: never print an empty
 * segment, and never let any segment push the item count off the edge. Every
 * segment is bounded, not just the name.
 *
 * Pure and separate from the card so the truncation rule can be tested; vitest
 * only collects lib/**\/*.test.ts.
 */

/** Enough for the name plus rifle, vest and count at the card's type size. */
const MAX_NAME = 28

/**
 * Item names are bounded too, not just the kit name.
 *
 * `resolveItemName` falls back to prettifying the raw classname when the
 * dictionary has no entry, and classnames come from a pasted arsenal export —
 * so an unrecognised item is member-supplied text of unbounded length arriving
 * in the middle of the line. Long enough for the curated names (the longest in
 * the dictionary sit well under this) and short enough that the whole line
 * stays predictable for the card to lay out.
 */
const MAX_ITEM = 32

const truncate = (value: string, max: number) =>
    value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value

const item = (className: string) => truncate(resolveItemName(className), MAX_ITEM)

export function formatKitLine(name: string, summary: KitSummary): string {
    const parts = [
        summary.primary ? item(summary.primary.className) : null,
        summary.vest ? item(summary.vest) : null,
        `${summary.itemCount} ${summary.itemCount === 1 ? 'item' : 'items'}`,
    ].filter(Boolean)

    return `${truncate(name, MAX_NAME)} — ${parts.join(' · ')}`
}
