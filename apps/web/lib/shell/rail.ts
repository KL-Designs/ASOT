/**
 * Pure helpers for the section rail.
 *
 * The rail is a client component so it can read usePathname, but the rule for
 * *which* cell is active is ordinary logic and belongs where it can be tested.
 */

export type RailItem = {
    href: string
    label: string
}

/** Strips a trailing slash so `/about/values/` and `/about/values` agree. */
function normalise(path: string): string {
    return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/**
 * The index of the cell that should read as active, or -1.
 *
 * Longest-prefix, on path segments rather than raw strings. Exact matching
 * alone would leave `/about/rules/appendix` with no active cell; a raw
 * `startsWith` would light `/about` on `/about/faq` and `/about` on
 * `/aboutus`. Segment-aware longest-prefix gets all three right.
 */
export function activeRailIndex(items: RailItem[], pathname: string): number {
    const path = normalise(pathname)

    let best = -1
    let bestLength = -1

    items.forEach((item, i) => {
        const href = normalise(item.href)
        const isMatch = path === href || path.startsWith(`${href}/`)
        if (isMatch && href.length > bestLength) {
            best = i
            bestLength = href.length
        }
    })

    return best
}

/** The cell's displayed index: 1-based, zero-padded to two digits. */
export function railIndex(i: number): string {
    return String(i + 1).padStart(2, '0')
}
