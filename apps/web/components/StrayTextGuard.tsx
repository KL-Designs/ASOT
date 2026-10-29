'use client'

import { useEffect } from 'react'

/**
 * Removes bare text nodes that something outside the app drops directly into
 * `<html>` or `<body>`.
 *
 * Seen with a custom-cursor browser extension, which writes its stylesheet as
 * plain text instead of inside a `<style>`: the CSS then renders as a wall of
 * text above the navbar. React leaves such a node alone when hydration
 * succeeds (it only cleans those two elements up after a mismatch), so whether
 * a page showed it depended on the page, not on the extension.
 *
 * Nothing the app renders puts text straight into either element, so any
 * non-whitespace text node there is foreign and safe to drop. Elements are
 * left alone: other extensions mount real UI the same way.
 */
export default function StrayTextGuard() {
    useEffect(() => {
        const roots = [document.documentElement, document.body]

        const sweep = () => {
            for (const root of roots)
                for (const node of Array.from(root.childNodes))
                    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) node.remove()
        }

        sweep()
        const observer = new MutationObserver(sweep)
        for (const root of roots) observer.observe(root, { childList: true })
        return () => observer.disconnect()
    }, [])

    return null
}
