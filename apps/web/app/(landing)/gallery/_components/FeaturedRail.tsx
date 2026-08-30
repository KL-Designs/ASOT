'use client'

import React, { useEffect, useRef, useState } from 'react'

import { Kicker } from '@/components/ui/SectionHead'
import s from '@/styles/gallery.module.css'

/**
 * The featured strip, drifting.
 *
 * The page this replaces ran the same idea as a CSS marquee on a duplicated
 * list, which is fine until someone wants to steer it: a `transform` animation
 * owns the element's position outright, so drag-scroll has nothing to push
 * against. This drives `scrollLeft` on a real scroller instead, so the drift, a
 * drag, a trackpad swipe and the keyboard are all moving the same one thing and
 * none of them fight.
 *
 * There are no arrow buttons. Grabbing the strip is what a strip of photographs
 * invites, and it worked on touch already — the mouse just wasn't wired to the
 * same gesture. Keyboard users still reach every tile with Tab, which scrolls
 * it into view.
 *
 * The list is still rendered twice. Once the first copy has passed, the position
 * winds back by exactly one period — which lands on a frame showing the
 * identical tiles, so the seam is invisible and the loop never ends.
 */
export default function FeaturedRail({ images, onOpen }: {
    images: FeaturedItemAPI[]
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

    /*
       Drag to pan, for the mouse only.

       Touch and pen already pan this natively — that is what `overflow-x: auto`
       buys — and hijacking their pointer events would trade momentum and
       rubber-banding for a worse hand-rolled version of both. So the handlers
       below bail on anything that isn't a mouse and let the browser do its job.

       `moved` is the reason a drag doesn't open the lightbox: the tiles are
       real buttons, so releasing the mouse after hauling the strip 300px fires
       a click on whichever tile happens to be under the cursor. Past the slop
       threshold that click is swallowed on the way down.
    */
    const drag = useRef<{ id: number; startX: number; startLeft: number; moved: number; captured: boolean } | null>(null)
    const dragged = useRef(false)
    const [dragging, setDragging] = useState(false)
    const DRAG_SLOP = 4

    function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        paused.current = true
        dragged.current = false
        if (e.pointerType !== 'mouse' || e.button !== 0) return
        const el = rail.current
        if (!el) return
        drag.current = { id: e.pointerId, startX: e.clientX, startLeft: el.scrollLeft, moved: 0, captured: false }
    }

    function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        const d = drag.current
        const el = rail.current
        if (!d || !el || e.pointerId !== d.id) return
        const dx = e.clientX - d.startX
        d.moved = Math.max(d.moved, Math.abs(dx))

        /*
           Capture is taken here rather than on pointerdown, and only once the
           gesture has proved itself a drag.

           A captured pointer retargets its pointerup to the capturing element,
           and the browser dispatches the click at the common ancestor of the
           down and up targets — so capturing on pointerdown moved every click
           from the tile <button> up to this <div>, and no click ever reached
           onOpen. That is why clicking a featured photograph did nothing while
           dragging worked fine.
        */
        if (!d.captured && d.moved > DRAG_SLOP) {
            el.setPointerCapture(e.pointerId)
            d.captured = true
            setDragging(true)
        }

        el.scrollLeft = d.startLeft - dx
    }

    function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
        // A mouse that is still over the strip is still reading it; let
        // onMouseLeave decide when the drift resumes.
        if (e.pointerType !== 'mouse') paused.current = false

        const d = drag.current
        const el = rail.current
        if (!d || !el || e.pointerId !== d.id) return
        if (d.captured && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
        dragged.current = d.moved > DRAG_SLOP
        drag.current = null
        setDragging(false)
    }

    function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
        if (!dragged.current) return
        dragged.current = false
        e.preventDefault()
        e.stopPropagation()
    }

    if (images.length === 0) return null

    return (
        <section className={s.strip}>
            <div className={s.stripH}>
                <Kicker>Featured</Kicker>
            </div>

            {/* Held still while anyone is reading it, or dragging it, or tabbing
                through it — a tile that slides out from under the pointer as you
                reach for it is the whole reason auto-scrolling strips annoy
                people. */}
            <div
                ref={rail}
                className={dragging ? `${s.rail} ${s.railDragging}` : s.rail}
                onMouseEnter={() => { paused.current = true }}
                onMouseLeave={() => { paused.current = false }}
                onFocusCapture={() => { paused.current = true }}
                onBlurCapture={() => { paused.current = false }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                onClickCapture={onClickCapture}
            >
                {[...images, ...images].map((img, i) => (
                    <button
                        key={`${img.id}-${i}`}
                        type='button'
                        className={s.railItem}
                        onClick={() => onOpen(i % images.length)}
                        aria-label={`Open featured photograph ${(i % images.length) + 1}`}
                        // The second copy exists only to make the loop seamless;
                        // it is the same photographs again, so it is not content.
                        aria-hidden={i >= images.length}
                        tabIndex={i >= images.length ? -1 : undefined}
                    >
                        <img src={img.src} alt='' loading='lazy' decoding='async' />
                    </button>
                ))}
            </div>
        </section>
    )
}
