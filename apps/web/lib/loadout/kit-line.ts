import { resolveItemName } from './names'
import type { KitSummary } from './summary'

/**
 * A kit compressed to one line, for the Discord dossier card.
 *
 * Shorter than the community index's card, which has three lines and a grid to
 * spend. Here there is one line at the foot of a 1400px canvas drawn by satori,
 * which does not wrap gracefully — so the rule is: never print an empty
 * segment, and never let a member's kit name push the item count off the edge.
 *
 * Pure and separate from the card so the truncation rule can be tested; vitest
 * only collects lib/**\/*.test.ts.
 */

/** Enough for the name plus rifle, vest and count at the card's type size. */
const MAX_NAME = 28

const truncate = (value: string, max: number) =>
    value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value

export function formatKitLine(name: string, summary: KitSummary): string {
    const parts = [
        summary.primary ? resolveItemName(summary.primary.className) : null,
        summary.vest ? resolveItemName(summary.vest) : null,
        `${summary.itemCount} ${summary.itemCount === 1 ? 'item' : 'items'}`,
    ].filter(Boolean)

    return `${truncate(name, MAX_NAME)} — ${parts.join(' · ')}`
}
