/**
 * What a kit is rated, and how that decides its place on the shelf.
 *
 * Pure — no database, no React. The routes and both pages share it, and it is
 * the only place the ranking rule is written down.
 */

export type Stars = 1 | 2 | 3 | 4 | 5

/** Shown where an average would go on a kit nobody has rated. */
export const NO_RATING = '—'

/** The value arrives from a JSON body: whole numbers 1–5 and nothing else. */
export function isStars(value: unknown): value is Stars {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

/** The plain mean, to two decimals, and how many people gave it. */
export function summarise(stars: number[]): { avg: number; count: number } {
    if (stars.length === 0) return { avg: 0, count: 0 }
    const total = stars.reduce((sum, n) => sum + n, 0)
    return { avg: Math.round((total / stars.length) * 100) / 100, count: stars.length }
}

/**
 * How much evidence a kit needs before its own mean is trusted, and what it is
 * assumed to be until then. Three ratings and a middling 3.5: enough to stop a
 * single friendly 5 topping the shelf, not so much that a genuinely good kit
 * has to wait a month to surface.
 */
export const RATING_PRIOR_WEIGHT = 3
export const RATING_PRIOR_MEAN = 3.5

/**
 * The number "Top rated" sorts on — never the number the page displays.
 *
 * Sorting on the raw mean puts a kit with one 5-star rating above one
 * averaging 4.8 across thirty, which is the opposite of what "top rated"
 * means to a reader. This pulls a sparsely-rated kit toward the prior and
 * releases it as ratings accumulate.
 */
export function weightedScore(avg: number, count: number): number {
    if (count <= 0) return 0
    const m = RATING_PRIOR_WEIGHT
    return (count / (count + m)) * avg + (m / (count + m)) * RATING_PRIOR_MEAN
}

/** One decimal, because two is a precision the number does not have. */
export function formatAvg(avg: number, count: number): string {
    return count > 0 ? avg.toFixed(1) : NO_RATING
}
