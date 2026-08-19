'use client'

import React, { useCallback, useEffect, useRef } from 'react'

import { Kicker } from '@/components/ui/SectionHead'
import { ChevronLeft, ChevronRight } from './icons'
import s from '@/styles/gallery.module.css'

/**
 * The featured strip, drifting.
 *
 * The page this replaces ran the same idea as a CSS marquee on a duplicated
 * list, which is fine until someone wants to steer it: a `transform` animation
 * owns the element's position outright, so arrows and drag-scroll have nothing
 * to push against. This drives `scrollLeft` on a real scroller instead, so the
 * drift, the arrow buttons, a trackpad swipe and the scrollbar are all moving
 * the same one thing and none of them fight.
 *
 * The list is still rendered twice. Once the first copy has passed, `scrollLeft`
 * jumps back by exactly half the scrollable width — which lands on a pixel
 * showing the identical frame, so the seam is invisible and the loop never ends.
 */
export default function FeaturedRail({ images, onOpen }: {
    images: string[]
    onOpen: (index: number) => void
}) {
    const rail = useRef<HTMLDivElement>(null)
    const paused = useRef(false)

    useEffect(() => {
        const el = rail.current
        if (!el || images.length === 0) return

        // Someone who has asked for less motion is not asking for a strip of
        // photographs to slide past them indefinitely.
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
        if (reduced.matches) return

        let frame = 0
        let last = performance.now()

        const tick = (now: number) => {
            const dt = now - last
            last = now
            frame = requestAnimationFrame(tick)

            if (paused.current) return

            // Per millisecond rather than per frame, so the strip travels at the
            // same speed on a 144Hz monitor as on a 60Hz one.
            el.scrollLeft += dt * 0.022

            const half = el.scrollWidth / 2
            if (half > 0 && el.scrollLeft >= half) el.scrollLeft -= half
        }

        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [images.length])

    const nudge = useCallback((direction: -1 | 1) => {
        rail.current?.scrollBy({ left: direction * 600, behavior: 'smooth' })
    }, [])

    if (images.length === 0) return null

    return (
        <section className={s.strip}>
            <div className={s.stripH}>
                <Kicker>Featured</Kicker>
                <div className={s.stripBtns}>
                    <button type='button' className={s.sbtn} onClick={() => nudge(-1)} aria-label='Scroll featured left'>
                        <ChevronLeft />
                    </button>
                    <button type='button' className={s.sbtn} onClick={() => nudge(1)} aria-label='Scroll featured right'>
                        <ChevronRight />
                    </button>
                </div>
            </div>

            {/* Held still while anyone is reading it, or dragging it, or tabbing
                through it — a tile that slides out from under the pointer as you
                reach for it is the whole reason auto-scrolling strips annoy
                people. */}
            <div
                ref={rail}
                className={s.rail}
                onMouseEnter={() => { paused.current = true }}
                onMouseLeave={() => { paused.current = false }}
                onFocusCapture={() => { paused.current = true }}
                onBlurCapture={() => { paused.current = false }}
                onPointerDown={() => { paused.current = true }}
                onPointerUp={() => { paused.current = false }}
            >
                {[...images, ...images].map((img, i) => (
                    <button
                        key={`${img}-${i}`}
                        type='button'
                        className={s.railItem}
                        onClick={() => onOpen(i % images.length)}
                        aria-label={`Open featured photograph ${(i % images.length) + 1}`}
                        // The second copy exists only to make the loop seamless;
                        // it is the same photographs again, so it is not content.
                        aria-hidden={i >= images.length}
                        tabIndex={i >= images.length ? -1 : undefined}
                    >
                        <img src={`/api/gallery/featured?img=${encodeURIComponent(img)}`} alt='' loading='lazy' decoding='async' />
                    </button>
                ))}
            </div>
        </section>
    )
}
