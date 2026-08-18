import React from 'react'
import s from '@/styles/ui.module.css'

/**
 * The drifting contour-line backdrop.
 *
 * The art (`public/designs/topo.svg`) is a single 2400x800 tile that repeats
 * seamlessly, painted as a repeating background rather than inlined — see the
 * note above `.topo` in ui.module.css for why, and how the loop stays seam-free
 * at any speed.
 *
 * `driftSeconds = 0` pins it static. The default of 720s is roughly 4px of
 * movement per second at 1600px wide: slow enough that you never catch it
 * moving, fast enough that the surface is never quite the same twice. It stops
 * entirely under `prefers-reduced-motion`.
 *
 * `mask` decides how it meets its edges — `fade` for a full-width band,
 * `left` for a hero whose right half carries a photograph, `none` inside a
 * small card that clips it anyway.
 */
export default function Topo({
    opacity = 0.065,
    driftSeconds = 720,
    mask = 'fade',
    className = '',
    style,
}: {
    opacity?: number
    driftSeconds?: number
    mask?: 'fade' | 'left' | 'none'
    className?: string
    style?: React.CSSProperties
}) {
    const maskClass = mask === 'fade' ? s.topoFade : mask === 'left' ? s.topoLeft : ''
    const classes = [s.topo, maskClass, driftSeconds > 0 ? s.topoDrift : '', className]
        .filter(Boolean).join(' ')

    return (
        <div className={classes} style={style} aria-hidden='true'>
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
