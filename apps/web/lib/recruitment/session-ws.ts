/**
 * Where the live recruitment session's WebSocket lives, worked out in the
 * browser. The Node server answers `/recruit-session` next to `/collab`, so
 * the address the collab editor already reaches (NEXT_PUBLIC_COLLAB_WS_URL)
 * is tried first: whatever sits in front of the site is known to pass that
 * one's upgrade through. The page's own host is the fallback. A client
 * moves to the next address each time a connection fails, so a link never
 * sits on "Reconnecting" because one of them is blocked.
 */
export function recruitSessionWsUrls(): string[] {
    if (typeof window === 'undefined') return []
    const out: string[] = []
    const collab = process.env.NEXT_PUBLIC_COLLAB_WS_URL?.trim()
    const local = (u: string) => /localhost|127\.0\.0\.1/.test(u)
    // The localhost default is only any use when the page is local too.
    if (collab && (!local(collab) || local(window.location.host))) {
        out.push(collab.replace(/\/collab\/?$/, '') + '/recruit-session')
    }
    out.push(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/recruit-session`)
    return [...new Set(out)]
}

/** The server closes with 1008 when the session does not exist or has run out; no retry will fix that. */
export const SESSION_GONE = 1008
