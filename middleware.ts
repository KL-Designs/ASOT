import { NextRequest, NextResponse } from 'next/server'

/**
 * Injects the current pathname as an `x-pathname` header so that server
 * components (like the dashboard layout) can read it without relying on
 * unreliable internal Next.js headers.
 */
export function middleware(req: NextRequest) {
    const res = NextResponse.next()
    res.headers.set('x-pathname', req.nextUrl.pathname)
    return res
}

export const config = {
    // Run on all routes except static assets and Next.js internals
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
