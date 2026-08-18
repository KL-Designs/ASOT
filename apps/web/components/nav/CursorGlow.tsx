'use client'

import { useEffect, useRef } from 'react'
import s from '@/styles/navbar.module.css'

/**
 * A soft red wash in the bar that trails the pointer.
 *
 * Driven by rAF rather than a CSS transition on `left`/`top`: the lag is eased
 * per frame toward the live pointer position, so the glow keeps moving while
 * the cursor does instead of restarting a transition on every mousemove, which
 * is what makes fast movement look like it snaps.
 *
 * Only `transform` is written each frame — the orb is a static gradient that
 * gets translated, so nothing repaints.
 *
 * Off entirely under `prefers-reduced-motion` and on pointers that can't hover.
 */

/** Per-frame fraction of the remaining distance. Lower trails further behind. */
const EASE = 0.11

export default function CursorGlow() {
    const wrap = useRef<HTMLDivElement>(null)
    const orb = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const wrapEl = wrap.current
        const orbEl = orb.current
        const bar = wrapEl?.parentElement
        if (!wrapEl || !orbEl || !bar) return

        if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

        let targetX = 0, targetY = 0
        let x = 0, y = 0
        let frame = 0
        let seeded = false

        const tick = () => {
            x += (targetX - x) * EASE
            y += (targetY - y) * EASE
            orbEl.style.transform = `translate3d(${x}px, ${y}px, 0)`
            frame = requestAnimationFrame(tick)
        }

        const onMove = (e: MouseEvent) => {
            const rect = bar.getBoundingClientRect()
            targetX = e.clientX - rect.left
            targetY = e.clientY - rect.top

            // First frame of a hover jumps to the pointer. Easing in from
            // wherever it was left would drag a streak across the bar.
            if (!seeded) {
                x = targetX
                y = targetY
                seeded = true
                orbEl.style.transform = `translate3d(${x}px, ${y}px, 0)`
                wrapEl.style.opacity = '1'
                frame = requestAnimationFrame(tick)
            }
        }

        const onLeave = () => {
            wrapEl.style.opacity = '0'
            cancelAnimationFrame(frame)
            frame = 0
            seeded = false
        }

        bar.addEventListener('mousemove', onMove, { passive: true })
        bar.addEventListener('mouseleave', onLeave)
        return () => {
            bar.removeEventListener('mousemove', onMove)
            bar.removeEventListener('mouseleave', onLeave)
            cancelAnimationFrame(frame)
        }
    }, [])

    return (
        <div ref={wrap} className={s.glowWrap} aria-hidden='true'>
            <div ref={orb} className={s.glow} />
        </div>
    )
}
