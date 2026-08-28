'use client'

import { useEffect } from 'react'

/**
 * Drops the site navbar for a page that brings its own top bar.
 *
 * Narrower than `FullscreenPage`, deliberately: that one takes the footer with
 * it, which is right for a map or an editor that owns the viewport and wrong
 * for an ordinary scrolling document. The orders page is a document — it just
 * happens to have `OperationBar` above it, and two rows of navigation stacked
 * on each other is one row too many.
 *
 * A body class rather than CSS scoped to the page, because the navbar lives in
 * the root layout, outside anything a route can style.
 */
export default function HideSiteNav() {
    useEffect(() => {
        document.body.classList.add('hide-site-nav')
        return () => document.body.classList.remove('hide-site-nav')
    }, [])

    return null
}
