'use client'

import React, { useEffect, useRef } from 'react'
import { cellSegments, fbm3, highestLevel, lowestLevel, noise3 } from '@/lib/topo/field'
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
 * Three things it does that the old one could not afford to care about: it
 * stops entirely when scrolled out of view, it holds a single frame under
 * `prefers-reduced-motion`, and it coarsens its own grid on a machine that
 * cannot keep up — see "Cost" below.
 */

/*
   ── Character ─────────────────────────────────────────────────────────────
   Tuned on a live prototype rather than guessed. This is the field's look and
   is deliberately global; only `opacity` varies per surface.

   `INDEX_EVERY` is the cartographic convention the old asset already followed:
   every Nth contour drawn heavier, so elevation bands read at a glance instead
   of the field being an undifferentiated mat. `DEPTH` fades the low contours
   relative to the high ones, which is what gives it relief.
*/
const LEVELS = 30         // contour lines across the field
const WEIGHT = 1.5          // px, before the index multiplier
const WARP = 0.55         // domain-warp strength — the twisting
const INDEX_EVERY = 4     // heavier line every Nth contour
const INDEX_BOOST = 2.15  // its opacity multiplier
const INDEX_WEIGHT = 1.85 // its line-weight multiplier
const DEPTH = 0.6         // how much brighter high ground reads
const RATE = 0.0055       // clock units per second at driftSeconds = 720
const FREQ = 0.0022       // per-pixel, so the field keeps its scale on any width
const STROKE = '#dfe6ee'

/*
   ── Cost ──────────────────────────────────────────────────────────────────
   Work scales with the number of grid cells, which is area / cell². Band height
   was therefore the thing that hurt: the 66px navbar strip comes to ~3,000
   cells and drew in 2.3ms, while a 620px band came to ~24,000 and took 18.8ms —
   past a whole frame, so it visibly stuttered. (Figures are the fastest of 25
   runs; means are worthless here, background load swamps them.)

   Three things hold it down now.

   1. `lowestLevel`/`highestLevel` skip cells no contour can cross. Testing every
      level against every cell was 726,000 calls a frame on that band to produce
      7,900 segments — 99% of the work establishing that a contour was nowhere
      near. A cell's corner range says directly which levels can appear in it.
      That alone took the band from 18.8ms to 10.5ms and the navbar to 1.3ms.

   2. Thirty frames a second, not sixty. The field crosses one noise cell every
      three minutes — nothing in it is resolved by 60fps that is not resolved by
      30 — and it halves the work outright.

   3. The grid coarsens when frames run long and refines again when they do not,
      which is what carries a machine slower than the one those figures came
      from. Each step is 18% on the cell size, so a step is ~30% of the work;
      `QUALITY_MAX` is about a 6x reduction in cells overall. Contours get
      slightly less smooth and nothing else changes, which at 6% opacity is not
      a visible trade. On the machine above the band settles around 5.5ms.

   `MAX_CELLS` is a floor under all of that for the pathological case — a
   full-bleed band on a very large display — so the first frame is never the
   slow one.
*/
const BASE_CELL = 7
const MAX_CELLS = 30_000
const FRAME_MS = 1000 / 30
const BUDGET_MS = 5.5
const QUALITY_MAX = 2.4
const QUALITY_STEP = 1.18

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

        let cols = 0, rows = 0, w = 0, h = 0, cell = BASE_CELL
        let field = new Float32Array(0)
        // Segments per contour level, so the cell pass can run once and each
        // level can still be stroked with its own weight and alpha.
        let lines: number[][] = []
        let clock = 0
        let raf = 0
        let visible = true
        let last = 0

        // Grid coarseness. 1 is full detail; higher is cheaper.
        let quality = 1
        let costAvg = 0
        let costSamples = 0
        let sinceChange = 0

        function measure() {
            const r = host!.getBoundingClientRect()
            w = Math.max(1, Math.round(r.width))
            h = Math.max(1, Math.round(r.height))

            const floor = Math.sqrt((w * h) / MAX_CELLS)
            cell = Math.max(BASE_CELL, floor) * quality

            // Capped at 2: past that the extra pixels cost real time and buy
            // nothing on a 0.1-opacity hairline.
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            canvas!.width = Math.round(w * dpr)
            canvas!.height = Math.round(h * dpr)
            ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)

            cols = Math.ceil(w / cell) + 1
            rows = Math.ceil(h / cell) + 1
            field = new Float32Array((cols + 1) * (rows + 1))
            lines = Array.from({ length: LEVELS + 1 }, () => [] as number[])
        }

        function draw(t: number) {
            const alpha = opts.current.opacity
            ctx!.clearRect(0, 0, w, h)

            const stride = cols + 1
            const warp = WARP * 90

            for (let j = 0; j <= rows; j++) {
                const py = j * cell
                for (let i = 0; i <= cols; i++) {
                    const px = i * cell
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

            for (let L = 1; L <= LEVELS; L++) lines[L].length = 0

            // Cell-major, so each cell's corner range is computed once and used
            // to skip every level that cannot cross it.
            for (let j = 0; j < rows; j++) {
                for (let i = 0; i < cols; i++) {
                    const o = j * stride + i
                    const a = field[o], b = field[o + 1]
                    const c = field[o + stride + 1], d = field[o + stride]

                    let mn = a, mx = a
                    if (b < mn) mn = b
                    if (b > mx) mx = b
                    if (c < mn) mn = c
                    if (c > mx) mx = c
                    if (d < mn) mn = d
                    if (d > mx) mx = d

                    const lo = lowestLevel(mn, LEVELS)
                    const hi = highestLevel(mx, LEVELS)
                    if (hi < lo) continue

                    const x0 = i * cell, y0 = j * cell
                    for (let L = lo; L <= hi; L++) {
                        const segs = cellSegments(a, b, c, d, L / (LEVELS + 1))
                        const out = lines[L]
                        for (let k = 0; k < segs.length; k += 4) {
                            out.push(
                                x0 + segs[k] * cell, y0 + segs[k + 1] * cell,
                                x0 + segs[k + 2] * cell, y0 + segs[k + 3] * cell,
                            )
                        }
                    }
                }
            }

            ctx!.strokeStyle = STROKE
            ctx!.lineCap = 'round'

            for (let L = 1; L <= LEVELS; L++) {
                const out = lines[L]
                if (out.length === 0) continue

                const level = L / (LEVELS + 1)
                const isIndex = L % INDEX_EVERY === 0
                const ramp = 1 - DEPTH + DEPTH * (0.35 + level)

                ctx!.globalAlpha = Math.min(1, alpha * ramp * (isIndex ? INDEX_BOOST : 1))
                ctx!.lineWidth = WEIGHT * (isIndex ? INDEX_WEIGHT : 1)
                ctx!.beginPath()
                for (let k = 0; k < out.length; k += 4) {
                    ctx!.moveTo(out[k], out[k + 1])
                    ctx!.lineTo(out[k + 2], out[k + 3])
                }
                ctx!.stroke()
            }

            ctx!.globalAlpha = 1
        }

        /**
         * Coarsen when frames run long, refine when they do not.
         *
         * The gap between the two thresholds is what stops it oscillating: a
         * grid that has just been coarsened lands well under the refine
         * threshold, so nothing changes again until the machine's load actually
         * does. Every adjustment resets the average, because the old figure
         * describes a grid that no longer exists.
         */
        function adapt() {
            // The first look comes early, so a slow machine settles in well
            // under a second rather than stuttering while a long average fills.
            const gate = costSamples < 40 ? 12 : 45
            if (sinceChange < gate) return
            sinceChange = 0

            if (costAvg > BUDGET_MS * 1.35 && quality < QUALITY_MAX) {
                quality = Math.min(QUALITY_MAX, quality * QUALITY_STEP)
            } else if (costAvg < BUDGET_MS * 0.55 && quality > 1) {
                quality = Math.max(1, quality / QUALITY_STEP)
            } else {
                return
            }

            measure()
            costAvg = 0
            costSamples = 0
        }

        function frame(now: number) {
            raf = requestAnimationFrame(frame)
            if (now - last < FRAME_MS) return

            const dt = Math.min(0.05, (now - last) / 1000)
            last = now
            const secs = opts.current.driftSeconds
            if (secs > 0) clock += dt * RATE * (720 / secs)

            const t0 = performance.now()
            draw(clock)
            const cost = performance.now() - t0

            costAvg = costSamples ? costAvg * 0.85 + cost * 0.15 : cost
            costSamples++
            sinceChange++
            adapt()
        }

        function start() {
            if (raf || still) return
            // Back-dated so the first callback draws rather than being paced out.
            last = performance.now() - FRAME_MS
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
