/**
 * Where the live recruitment session's WebSocket lives, worked out in the
 * browser. The Node server answers it at `/collab/recruit-session` as well as
 * `/recruit-session`, because the reverse proxy in front of live (Apache)
 * forwards WebSocket upgrades for `/collab` and below only: a bare
 * `/recruit-session` upgrade reaches Next.js as a page request and 404s.
 * So the address is the collab editor's (NEXT_PUBLIC_COLLAB_WS_URL, known to
 * get through) plus `/recruit-session`, then the same on the page's own host.
 * A client moves to the next address each time a connection fails.
 */
export function recruitSessionWsUrls(): string[] {
    if (typeof window === 'undefined') return []
    const out: string[] = []
    const local = (u: string) => /localhost|127\.0\.0\.1/.test(u)
    const collab = process.env.NEXT_PUBLIC_COLLAB_WS_URL?.trim()
    // The localhost default is only any use when the page is local too.
    if (collab && (!local(collab) || local(window.location.host))) {
        out.push(collab.replace(/^http/, 'ws').replace(/\/+$/, '') + '/recruit-session')
    }
    const own = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
    out.push(`${own}/collab/recruit-session`, `${own}/recruit-session`)
    return [...new Set(out)]
}

/** The server closes with 1008 when the session does not exist or has run out; no retry will fix that. */
export const SESSION_GONE = 1008
