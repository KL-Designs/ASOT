import { NextRequest, NextResponse } from 'next/server'

const WIP_PATHS = ['/community/orbat', '/milpacs', '/community/retired', '/community/bios']

/**
 * Injects the current pathname as an `x-pathname` header so that server
 * components (like the dashboard layout) can read it without relying on
 * unreliable internal Next.js headers.
 */
export function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl

    const bypassWip = req.nextUrl.searchParams.has('bypass_wip')
    if (!bypassWip && WIP_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
        return NextResponse.rewrite(new URL('/wip', req.url))
    }

    const res = NextResponse.next()
    res.headers.set('x-pathname', pathname)
    return res
}

export const config = {
    // Run on all routes except static assets and Next.js internals
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
