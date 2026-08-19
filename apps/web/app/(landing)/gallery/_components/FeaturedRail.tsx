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
 * The list is still rendered twice. Once the first copy has passed, the position
 * winds back by exactly one period — which lands on a frame showing the
 * identical tiles, so the seam is invisible and the loop never ends.
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
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

        /*
           The position is kept here rather than read back off the element every
           frame, and this is the whole reason the strip moves at all.

           At 45px a second a frame advances it by well under one pixel, and
           browsers are free to round `scrollLeft` to whole pixels on write — so
           `el.scrollLeft += 0.7` reads back as unchanged, the next frame adds
           another 0.7 to the same rounded number, and the strip sits still
           forever. Accumulating in a float and assigning the absolute value
           means the fraction survives to cross the next pixel boundary.
        */
        let position = el.scrollLeft
        let written = position
        let last = performance.now()
        let frame = requestAnimationFrame(tick)

        function tick(now: number) {
            const dt = Math.min(now - last, 100)  // a backgrounded tab shouldn't lurch on return
            last = now
            frame = requestAnimationFrame(tick)

            if (paused.current || !el) return

            // If anything else moved the scroller — the arrows, a swipe, the
            // keyboard — take its position as the new truth rather than
            // snapping back to ours.
            if (Math.abs(el.scrollLeft - written) > 2) position = el.scrollLeft

            // Per millisecond, not per frame, so the strip travels at the same
            // speed on a 144Hz monitor as on a 60Hz one.
            position += dt * 0.045

            /*
               One period is the distance from the first tile to its duplicate,
               measured off the layout rather than computed. Half the scroll
               width is close but not equal — the two copies share one gap
               between them — and being a few pixels out puts a visible hitch in
               a loop whose entire job is to have no seam.
            */
            const first = el.children[0] as HTMLElement | undefined
            const repeat = el.children[images.length] as HTMLElement | undefined
            const period = first && repeat ? repeat.offsetLeft - first.offsetLeft : 0
            if (period > 0 && position >= period) position -= period

            el.scrollLeft = position
            written = el.scrollLeft
        }

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
