/**
 * What one member changing their mind does to the two counters.
 *
 * `gallery_media.up` and `.down` are denormalised so a grid of 48 tiles never
 * aggregates the votes collection. That is only safe if the deltas are exactly
 * right, so the arithmetic is separated from the route that applies it and
 * tested on its own — including the cases the route is supposed to prevent,
 * because "the route prevents it" is not something the counters can rely on
 * under a double-submit.
 */

export type VoteValue = 1 | -1

export function voteDelta(previous: VoteValue | null, next: VoteValue | null): { up: number, down: number } {
    const count = (v: VoteValue | null, want: VoteValue) => (v === want ? 1 : 0)
    return {
        up: count(next, 1) - count(previous, 1),
        down: count(next, -1) - count(previous, -1),
    }
}
