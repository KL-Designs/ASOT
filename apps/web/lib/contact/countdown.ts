/**
 * The contact page's "next operation" figure.
 *
 * Deliberately not `formatCountdown` from the navbar rail. That one is page
 * chrome at 9.5px and reads `T−2D 04H 11M`; this is a 62px display figure and
 * the two want different things — the rail is a precise clock you glance at,
 * this is a headline number that has to be legible in one beat. Sharing an
 * arithmetic helper between them would save four lines and couple two formats
 * that should be free to diverge.
 *
 * Pure and here in lib/ rather than beside the component because vitest picks
 * up `lib/**\/*.test.ts` and nothing else.
 */

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/**
 * `2d 14h` · `14h 30m` · `30m` · `Running`, or null when `iso` is unreadable.
 *
 * Units drop as the target nears: minutes are noise two days out and the whole
 * point in the last hour. Everything floors — an operation 59 seconds away is
 * not a minute away, and a figure this size should never claim time the reader
 * does not have.
 *
 * `now` is a parameter rather than a `Date.now()` call so the caller controls
 * the clock: the server renders one value, the client ticks from it, and the
 * test does not need a fake timer.
 */
export function formatUntil(iso: string, now: number): string | null {
    const target = new Date(iso).getTime()
    if (Number.isNaN(target)) return null

    const ms = target - now
    if (ms <= 0) return 'Running'

    if (ms >= DAY) {
        return `${Math.floor(ms / DAY)}d ${Math.floor(ms / HOUR) % 24}h`
    }
    if (ms >= HOUR) {
        return `${Math.floor(ms / HOUR)}h ${Math.floor(ms / MIN) % 60}m`
    }
    return `${Math.floor(ms / MIN)}m`
}
