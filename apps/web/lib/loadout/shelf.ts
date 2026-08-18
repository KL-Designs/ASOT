/**
 * Searching, filtering, sorting and paging the unit's kit shelf.
 *
 * Pure and React-free so it can be tested directly: the shelf component is a
 * thin layer of state over these functions.
 *
 * `ShelfCard` is only the part of a card these functions read. The rendered
 * card carries the owner, the gear list and the export as well; every function
 * here is generic over `T extends ShelfCard` so the fuller shape survives.
 */

import { KIT_TAG_KEYS, type KitTag } from './tags'

export type ShelfSort = 'newest' | 'rated' | 'copied' | 'name'

export const SHELF_SORTS: { key: ShelfSort; label: string }[] = [
    { key: 'newest', label: 'Newest' },
    { key: 'rated',  label: 'Top rated' },
    { key: 'copied', label: 'Most copied' },
    { key: 'name',   label: 'A–Z' },
]

export const KITS_PER_PAGE = 24

export type ShelfCard = {
    id: string
    name: string
    tags: KitTag[]
    /** Epoch milliseconds — a `Date` does not survive the server/client boundary. */
    updatedAt: number
    ratingAvg: number
    ratingCount: number
    /** `weightedScore(ratingAvg, ratingCount)`, computed once on the server. */
    ratingScore: number
    copyCount: number
    /** Lowercased, `|`-joined searchable text, built server-side. */
    haystack: string
}

/**
 * Every word must appear somewhere in the card's text, so a second word
 * narrows rather than widens. Substring rather than prefix matching: "mg"
 * should find "MG" and "LMG" both.
 */
export function matchesQuery(card: ShelfCard, query: string): boolean {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return terms.every(term => card.haystack.includes(term))
}

/** AND, not OR — the point of picking two is to find the kit that is both. */
export function matchesTags(card: ShelfCard, tags: KitTag[]): boolean {
    return tags.every(tag => card.tags.includes(tag))
}

const COMPARE: Record<ShelfSort, (a: ShelfCard, b: ShelfCard) => number> = {
    // Recency is the tiebreak applied to every sort, so "newest" needs no
    // comparator of its own — it is the tiebreak, unqualified.
    newest: () => 0,
    rated:  (a, b) => b.ratingScore - a.ratingScore,
    copied: (a, b) => b.copyCount - a.copyCount,
    name:   (a, b) => a.name.localeCompare(b.name),
}

/** Returns a new array — the caller's list is a memo dependency and must not move. */
export function sortCards<T extends ShelfCard>(cards: T[], sort: ShelfSort): T[] {
    return [...cards].sort((a, b) => COMPARE[sort](a, b) || b.updatedAt - a.updatedAt)
}

/** Never zero: an empty shelf is still one (empty) page. */
export function pageCount(total: number, perPage = KITS_PER_PAGE): number {
    return Math.max(1, Math.ceil(total / perPage))
}

/**
 * Clamps rather than trusting the page number. Filtering can shrink the list
 * under a page the reader is already on, and showing them the last page is
 * better than showing them nothing.
 */
export function paginate<T>(items: T[], page: number, perPage = KITS_PER_PAGE): T[] {
    const last = pageCount(items.length, perPage)
    const safe = Math.min(Math.max(1, Math.floor(page) || 1), last)
    return items.slice((safe - 1) * perPage, safe * perPage)
}

/**
 * The tags worth offering as filter chips: those at least one kit on the shelf
 * carries, with how many carry each. A bar of every tag in the vocabulary,
 * most of them matching nothing, is a worse control than a short one that
 * always leads somewhere.
 */
export function tagCounts(cards: ShelfCard[]): { tag: KitTag; count: number }[] {
    const counts = new Map<KitTag, number>()
    for (const card of cards) {
        for (const tag of card.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return KIT_TAG_KEYS
        .filter(tag => counts.has(tag))
        .map(tag => ({ tag, count: counts.get(tag)! }))
}
