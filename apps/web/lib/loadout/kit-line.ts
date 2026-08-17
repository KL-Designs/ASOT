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

/** A kit name is a label on a card, not the 40 characters storage permits. */
const MAX_CARD_NAME = 28

/**
 * Item names are bounded too, not just the kit name.
 *
 * `resolveItemName` falls back to prettifying the raw classname when the
 * dictionary has no entry, and classnames come from a pasted arsenal export —
 * so an unrecognised item is member-supplied text of unbounded length arriving
 * in the middle of the line. This also truncates plenty of legitimate names:
 * 6,269 dictionary entries are longer than this, the longest being 70. That is
 * the intended trade — a recognisable prefix beats a line that does not fit.
 */
const MAX_ITEM = 32

/**
 * The hard bound on the whole line, and the number the card lays out against.
 *
 * Capping each segment is not sufficient on its own: the item count is a sum of
 * unvalidated numbers from the export, and JS prints integers in full decimal
 * to 21 digits. Clamping the assembled line makes the contract one number that
 * holds however any individual segment misbehaves.
 *
 * Derived from the card: 1400px less 112px padding, less the "KIT" label and
 * its margin, leaves roughly 1228px; at the 23px type size a mixed-case Latin
 * glyph averages about 11.5px, so ~106 characters fit. 100 is the safe round.
 */
const MAX_LINE = 100

const truncate = (value: string, max: number) =>
    value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value

const item = (className: string) => truncate(resolveItemName(className), MAX_ITEM)

export function formatKitLine(name: string, summary: KitSummary): string {
    const parts = [
        summary.primary ? item(summary.primary.className) : null,
        summary.vest ? item(summary.vest) : null,
        `${summary.itemCount} ${summary.itemCount === 1 ? 'item' : 'items'}`,
    ].filter(Boolean)

    return truncate(`${truncate(name, MAX_CARD_NAME)} — ${parts.join(' · ')}`, MAX_LINE)
}
