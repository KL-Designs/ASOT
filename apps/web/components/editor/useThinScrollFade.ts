'use client'

import { useEffect, useRef } from 'react'

/**
 * Scroll-triggered half of the thin overlay scrollbar spec (styles/globals.css
 * `.thin-scroll`). The CSS alone already fades the thumb in on `:hover` —
 * this hook adds the other trigger, fading it in while the container is
 * actually being scrolled (e.g. via mouse wheel or keyboard, cursor
 * elsewhere) and back out shortly after motion stops, by toggling the
 * `is-scrolling` class `.thin-scroll` reads in globals.css. No custom
 * scrollbar is rendered here — this only flips a class.
 *
 * Uses the native `scrollend` event where supported (Chrome, Firefox) so
 * the fade-out timing matches actual scroll physics instead of a guess;
 * falls back to a debounced timeout (Safari, which has no `scrollend`).
 *
 * Usage: `<div ref={useThinScrollFade()} className="thin-scroll ...">`.
 */
export function useThinScrollFade<T extends HTMLElement>(fadeDelay = 500) {
    const ref = useRef<T | null>(null)

    useEffect(() => {
        const el = ref.current
        if (!el) return

        const supportsScrollEnd = 'onscrollend' in window
        let timer: ReturnType<typeof setTimeout> | undefined

        const onScroll = () => {
            el.classList.add('is-scrolling')
            if (!supportsScrollEnd) {
                clearTimeout(timer)
                timer = setTimeout(() => el.classList.remove('is-scrolling'), fadeDelay)
            }
        }
        const onScrollEnd = () => {
            clearTimeout(timer)
            el.classList.remove('is-scrolling')
        }

        el.addEventListener('scroll', onScroll, { passive: true })
        if (supportsScrollEnd) el.addEventListener('scrollend', onScrollEnd)

        return () => {
            el.removeEventListener('scroll', onScroll)
            if (supportsScrollEnd) el.removeEventListener('scrollend', onScrollEnd)
            clearTimeout(timer)
        }
    }, [fadeDelay])

    return ref
}
