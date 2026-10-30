/**
 * Where the live recruitment session's WebSocket lives, worked out in the
 * browser, as full URLs with the session's query parameters on.
 *
 * The reverse proxy in front of live (Apache) upgrades only the exact path
 * `/collab` to a WebSocket (`RewriteRule ^/collab$`), passing the query
 * string through; anything else, `/recruit-session` included, reaches Next.js
 * as a page request and 404s. So the first address is the collab editor's own
 * (NEXT_PUBLIC_COLLAB_WS_URL, known to get through) with `recruit-session=1`
 * in the query, which server.mjs routes to the recruit socket instead of the
 * editor. The direct paths follow for setups that forward them. A client
 * moves to the next address each time a connection fails.
 */
export function recruitSessionWsUrls(params: Record<string, string>): string[] {
    if (typeof window === 'undefined') return []
    const query = new URLSearchParams(params).toString()
    const out: string[] = []
    const local = (u: string) => /localhost|127\.0\.0\.1/.test(u)
    const collab = process.env.NEXT_PUBLIC_COLLAB_WS_URL?.trim()
    const own = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
    // The localhost default is only any use when the page is local too.
    if (collab && (!local(collab) || local(window.location.host))) {
        out.push(`${collab.replace(/^http/, 'ws').replace(/\/+$/, '')}?recruit-session=1&${query}`)
    }
    out.push(`${own}/collab?recruit-session=1&${query}`, `${own}/collab/recruit-session?${query}`, `${own}/recruit-session?${query}`)
    return [...new Set(out)]
}

/** The server closes with 1008 when the session does not exist or has run out; no retry will fix that. */
export const SESSION_GONE = 1008
