'use client'

import React, { useEffect, useRef } from 'react'
import { cellSegments, fbm3, noise3 } from '@/lib/topo/field'
import s from '@/styles/ui.module.css'

/**
 * The drifting contour-line backdrop.
 *
 * It used to be `public/designs/topo.svg` — a single 2400x800 tile of contour
 * paths painted as a repeating background and translated sideways. Cheap: one
 * composited transform, no JavaScript, no repaint. But a picture of contours
 * cannot warp, because the lines are baked into the file, so all it could ever
 * do was slide.
 *
 * The field is generated now (see `lib/topo/field.ts`): a noise field whose
 * third axis is time, traced into isolines every frame. Individual contours
 * stretch, pinch, split and close into rings the way real ones do as terrain
 * moves under them — which is the whole reason for the change.
 *
 * The props are unchanged, so every existing call site kept working untouched:
 *
 * `opacity` is still the per-surface intensity, and still the thing each caller
 * tunes — the seven call sites run from 0.045 in a stat band to 0.32 where the
 * field stands in for a missing cover image.
 *
 * `driftSeconds` is still "bigger is slower", and 0 still pins it static. It no
 * longer means what it used to literally mean (there is no tile to advance one
 * width) so it is now a rate: 720 gives the tuned speed, 1440 half of it.
 *
 * `mask` and `className` are untouched — the masks were always CSS and still
 * are.
 *
 * Two things it does that the old one could not afford to care about: it stops
 * entirely when scrolled out of view, and under `prefers-reduced-motion` it
 * draws one frame and never starts the loop, so the field is still there and
 * still generated — just still.
 */

/*
   Tuned on a live prototype rather than guessed. Everything here is the field's
   character and is deliberately global — only `opacity` varies per surface.

   `INDEX_EVERY` is the cartographic convention the old asset already followed:
   every fifth contour drawn heavier, so elevation bands read at a glance
   instead of the field being an undifferentiated mat. `DEPTH` fades the low
   contours relative to the high ones, which is what gives it relief.
*/
const CELL = 7            // px between field samples
const LEVELS = 22         // contour lines across the field
const WEIGHT = 0.9        // px, before the index multiplier
const WARP = 0.55         // domain-warp strength — the twisting
const INDEX_EVERY = 5     // heavier line every Nth contour
const INDEX_BOOST = 2.15  // its opacity multiplier
const INDEX_WEIGHT = 1.85 // its line-weight multiplier
const DEPTH = 0.52        // how much brighter high ground reads
const RATE = 0.0055       // clock units per second at driftSeconds = 720
const FREQ = 0.0022       // per-pixel, so the field keeps its scale on any width
const STROKE = '#dfe6ee'

export default function Topo({
    opacity = 0.102,
    driftSeconds = 720,
    mask = 'fade',
    className = '',
    style,
}: {
    opacity?: number
    driftSeconds?: number
    mask?: 'fade' | 'edges' | 'left' | 'none'
    className?: string
    style?: React.CSSProperties
}) {
    const hostRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    // Read through refs inside the loop rather than restarting it on every prop
    // change — a parent re-render must not cost a teardown and a cold canvas.
    const opts = useRef({ opacity, driftSeconds })
    opts.current = { opacity, driftSeconds }

    useEffect(() => {
        const host = hostRef.current
        const canvas = canvasRef.current
        if (!host || !canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const still = matchMedia('(prefers-reduced-motion: reduce)').matches

        let cols = 0, rows = 0, w = 0, h = 0
        let field = new Float32Array(0)
        let clock = 0
        let raf = 0
        let visible = true
        let last = 0

        function measure() {
            const r = host!.getBoundingClientRect()
            w = Math.max(1, Math.round(r.width))
            h = Math.max(1, Math.round(r.height))
            // Capped at 2: past that the extra pixels cost real time and buy
            // nothing on a 0.1-opacity hairline.
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            canvas!.width = Math.round(w * dpr)
            canvas!.height = Math.round(h * dpr)
            ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
            cols = Math.ceil(w / CELL) + 1
            rows = Math.ceil(h / CELL) + 1
            field = new Float32Array((cols + 1) * (rows + 1))
        }

        function draw(t: number) {
            const alpha = opts.current.opacity
            ctx!.clearRect(0, 0, w, h)

            const stride = cols + 1
            const warp = WARP * 90

            for (let j = 0; j <= rows; j++) {
                const py = j * CELL
                for (let i = 0; i <= cols; i++) {
                    const px = i * CELL
                    // Domain warp: displace the sample point by a second,
                    // slower field. One octave is enough — it only has to be
                    // smooth — and its third-speed drift is what makes the
                    // motion read as shearing rather than sliding.
                    const wx = noise3(px * FREQ * 0.6 + 11.3, py * FREQ * 0.6 + 4.7, t * 0.33) - 0.5
                    const wy = noise3(px * FREQ * 0.6 + 47.9, py * FREQ * 0.6 + 23.1, t * 0.33) - 0.5
                    field[j * stride + i] = fbm3(
                        (px + wx * warp) * FREQ,
                        (py + wy * warp) * FREQ,
                        t,
                    )
                }
            }

            ctx!.strokeStyle = STROKE
            ctx!.lineCap = 'round'

            // One path per contour level: weight and alpha differ between them,
            // and a canvas path carries a single set of stroke settings. Twenty
            // -two strokes a frame is nothing beside the tracing above.
            for (let L = 1; L <= LEVELS; L++) {
                const level = L / (LEVELS + 1)
                const isIndex = L % INDEX_EVERY === 0
                const ramp = 1 - DEPTH + DEPTH * (0.35 + level)

                ctx!.globalAlpha = Math.min(1, alpha * ramp * (isIndex ? INDEX_BOOST : 1))
                ctx!.lineWidth = WEIGHT * (isIndex ? INDEX_WEIGHT : 1)
                ctx!.beginPath()

                for (let j = 0; j < rows; j++) {
                    for (let i = 0; i < cols; i++) {
                        const o = j * stride + i
                        const segs = cellSegments(
                            field[o], field[o + 1],
                            field[o + stride + 1], field[o + stride],
                            level,
                        )
                        if (segs.length === 0) continue

                        const x0 = i * CELL, y0 = j * CELL
                        for (let k = 0; k < segs.length; k += 4) {
                            ctx!.moveTo(x0 + segs[k] * CELL, y0 + segs[k + 1] * CELL)
                            ctx!.lineTo(x0 + segs[k + 2] * CELL, y0 + segs[k + 3] * CELL)
                        }
                    }
                }

                ctx!.stroke()
            }

            ctx!.globalAlpha = 1
        }

        function frame(now: number) {
            const dt = Math.min(0.05, (now - last) / 1000)
            last = now
            const secs = opts.current.driftSeconds
            if (secs > 0) clock += dt * RATE * (720 / secs)
            draw(clock)
            raf = requestAnimationFrame(frame)
        }

        function start() {
            if (raf || still) return
            last = performance.now()
            raf = requestAnimationFrame(frame)
        }

        function stop() {
            if (!raf) return
            cancelAnimationFrame(raf)
            raf = 0
        }

        measure()
        draw(clock)

        const ro = new ResizeObserver(() => { measure(); draw(clock) })
        ro.observe(host)

        // Topo is on nearly every page and the landing page mounts several at
        // once. Without this they would all trace a field nobody is looking at.
        const io = new IntersectionObserver(entries => {
            visible = entries[0].isIntersecting
            if (visible) start()
            else stop()
        }, { rootMargin: '120px' })
        io.observe(host)

        const onVisibility = () => {
            if (document.hidden) stop()
            else if (visible) start()
        }
        document.addEventListener('visibilitychange', onVisibility)

        return () => {
            stop()
            ro.disconnect()
            io.disconnect()
            document.removeEventListener('visibilitychange', onVisibility)
        }
    }, [])

    const maskClass = mask === 'fade' ? s.topoFade
        : mask === 'edges' ? s.topoEdges
            : mask === 'left' ? s.topoLeft
                : ''

    return (
        <div
            ref={hostRef}
            className={[s.topo, maskClass, className].filter(Boolean).join(' ')}
            style={style}
            aria-hidden='true'
        >
            <canvas ref={canvasRef} className={s.topoCanvas} />
        </div>
    )
}
