/**
 * Ordering media by what the unit thinks of it.
 *
 * Not a ratio. up/(up+down) scores a single up-vote at 1.00 and forty-up-two-
 * down at 0.95, so a "Top rated" sort built on it shows whatever was voted on
 * once, forever, and never the things people actually liked.
 *
 * The Wilson lower bound asks a better question: given these votes, what is the
 * lowest approval rate consistent with them at 95% confidence? A single vote
 * supports almost no confidence and scores near zero; forty votes narrow the
 * interval and score close to their observed rate. It is the same ranking
 * Reddit's "best" comment sort uses, for the same reason.
 */

/** 1.96 — the two-tailed z for 95% confidence. Hard-coded because the
 *  confidence level is not a knob anyone should turn per call. */
const Z = 1.959963984540054

export function wilsonScore(up: number, down: number): number {
    const n = up + down
    if (n === 0) return 0

    const phat = up / n
    const z2 = Z * Z

    const numerator = phat + z2 / (2 * n) - Z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n)
    const denominator = 1 + z2 / n

    // Clamped because the lower bound can land a hair below zero on an
    // all-negative item, and a negative "score" is meaningless to sort on.
    return Math.max(0, Math.min(1, numerator / denominator))
}
