import React from 'react'
import s from '@/styles/navbar.module.css'

/**
 * The drifting contour-line backdrop.
 *
 * The art (`public/designs/topo.svg`) is a single 2400x800 tile that repeats
 * seamlessly, painted as a repeating background rather than inlined — see the
 * note above `.topo` in navbar.module.css for why, and how the loop stays
 * seam-free at any speed.
 *
 * `driftSeconds = 0` pins it static. The default of 720s is roughly 4px of
 * movement per second at 1600px wide: slow enough that you never catch it
 * moving, fast enough that the bar is never quite the same twice. It stops
 * entirely under `prefers-reduced-motion`.
 */
export default function Topo({
    opacity = 0.065,
    driftSeconds = 720,
    fade = true,
}: {
    opacity?: number
    driftSeconds?: number
    fade?: boolean
}) {
    const classes = [s.topo, fade ? s.topoFade : '', driftSeconds > 0 ? s.topoDrift : ''].filter(Boolean).join(' ')

    return (
        <div className={classes} aria-hidden='true'>
            <div
                className={s.topoTile}
                style={{
                    '--topo-op': opacity,
                    '--topo-drift': `${driftSeconds}s`,
                } as React.CSSProperties}
            />
        </div>
    )
}
