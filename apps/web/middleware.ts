import { NextRequest, NextResponse } from 'next/server'

/**
 * Hides the work-in-progress pages behind `/wip`.
 *
 * **The matcher is deliberately narrow.** It used to run on every request in the
 * app (`/((?!_next/static|_next/image|favicon.ico|api/).*)`), which is a
 * documented cause of intermittent App Router navigation failures: middleware
 * also executes on the internal `_rsc` requests a client-side navigation makes,
 * and a broad matcher makes some of those navigations fail silently — the
 * payload arrives with a 200 and the router discards it (vercel/next.js#91723).
 *
 * That is what the milpac profile's section tabs were hitting: the first click
 * fetched and committed nothing, the second committed instantly from cache.
 * They were the only place it showed because they are the only navigation in
 * the app that keeps a layout mounted and swaps a child segment.
 *
 * It also used to set an `x-pathname` response header "so server components can
 * read the current path". Nothing in the app has ever read it, and a *response*
 * header could not be read from a server component in any case — that needs
 * `NextResponse.next({ request: { headers } })`. Removed rather than repaired,
 * since there was no consumer to keep working.
 */
export function middleware(req: NextRequest) {
    // An escape hatch for previewing a WIP page without shipping it.
    if (req.nextUrl.searchParams.has('bypass_wip')) return NextResponse.next()
    return NextResponse.rewrite(new URL('/wip', req.url))
}

export const config = {
    // The WIP list lives here rather than in a constant: `matcher` only accepts
    // literals, so a second copy in code could drift out of step with it.
    // `:path*` matches zero or more segments, so the bare path matches too.
    //
    // These moved out of /community with the rest of that tree. The matcher had
    // to move with them or they would have gone live at their new paths — the
    // redirect in next.config.ts sends /community/retired here, it does not
    // gate anything.
    //
    // ORBAT is no longer on this list: it has been released. It needed only
    // this entry removed, because it never carried the second, independent
    // gate — the `WIP_PAGES` env check that bios and retired run inside their
    // own page components. Milpacs needed both. Check for both before calling
    // a page released.
    matcher: [
        '/retired/:path*',
        '/bios/:path*',
    ],
}
