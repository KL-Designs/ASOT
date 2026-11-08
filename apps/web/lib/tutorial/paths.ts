import type { TutorialContext } from './types'

export function resolvePath(p: string | ((ctx: TutorialContext) => string), ctx: TutorialContext) {
    return typeof p === 'function' ? p(ctx) : p
}

/**
 * Is the browser already where a step wants it? The pathname must be equal and
 * every query param the step names must match; params it doesn't name (a
 * search box, a deep-linked id) are left alone.
 */
export function pathMatches(location: { pathname: string; search: string }, want: string) {
    const target = new URL(want, 'http://x')
    if (location.pathname.replace(/\/$/, '') !== target.pathname.replace(/\/$/, '')) return false
    const have = new URLSearchParams(location.search)
    for (const [k, v] of target.searchParams) {
        if (have.get(k) !== v) return false
    }
    return true
}
