/**
 * Whether a piece of media is new enough to say so on its tile.
 *
 * Keyed on when it was *published*, not when it was taken. The badge answers
 * "what has appeared since I last looked", so a photograph from a two-year-old
 * operation that J5 approved this morning earns it and an item that has been up
 * for a month does not, whatever its operation's date.
 *
 * Migrated legacy files carry no publishedAt and so never qualify — which is
 * the point, because the alternative is the entire archive badged NEW on the
 * day the migration runs.
 *
 * Evaluated in the browser against the item's own timestamp rather than
 * precomputed on the server, so it decays correctly on a page left open
 * overnight and needs no scheduled job to clear it.
 */

export const NEW_BADGE_DAYS = 7

const WINDOW_MS = NEW_BADGE_DAYS * 24 * 60 * 60 * 1000

export function isNewlyPublished(
    publishedAt: string | Date | null | undefined,
    now: Date = new Date(),
): boolean {
    if (!publishedAt) return false

    const at = publishedAt instanceof Date ? publishedAt : new Date(publishedAt)
    const ms = at.getTime()
    if (Number.isNaN(ms)) return false

    // A timestamp slightly in the future is clock skew between the server that
    // stamped it and the browser reading it, not an error worth refusing over.
    return now.getTime() - ms <= WINDOW_MS
}
