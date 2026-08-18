'use client'

/**
 * A faint two-tier survey grid — 96px cells with a 24px sub-grid.
 *
 * `gradient` masks it to the centre so it never runs into a hard edge.
 * `opacity` scales the whole thing — the line alphas are baked into the
 * gradients, so this is the lever rather than editing them; over a photograph
 * the grid wants to be fainter than it does on a flat panel.
 * `style` is merged over the defaults so a caller can place it in its own
 * stacking context; it defaults to `zIndex: 0`, which is only right when it
 * sits directly on a section background.
 */
export default function MilitaryGrid({ gradient, opacity = 1, style }: {
    gradient?: boolean
    opacity?: number
    style?: React.CSSProperties
}) {
    const mask = gradient ? 'radial-gradient(ellipse at 50% 50%, black 50%, transparent 80%)' : ''
    return (
        <div aria-hidden className='absolute inset-0 pointer-events-none select-none' style={{ zIndex: 0, opacity, maskImage: mask, WebkitMaskImage: mask, ...style }}>
            {/* Primary grid – 96 px cells */}
            <div className='absolute inset-0' style={{
                backgroundImage: [
                    'repeating-linear-gradient(rgba(255,255,255,0.026) 0px, rgba(255,255,255,0.026) 1px, transparent 1px, transparent 96px)',
                    'repeating-linear-gradient(90deg, rgba(255,255,255,0.026) 0px, rgba(255,255,255,0.026) 1px, transparent 1px, transparent 96px)',
                ].join(','),
            }} />
            {/* Sub-grid – 24 px cells */}
            <div className='absolute inset-0' style={{
                backgroundImage: [
                    'repeating-linear-gradient(rgba(255,255,255,0.01) 0px, rgba(255,255,255,0.01) 1px, transparent 1px, transparent 24px)',
                    'repeating-linear-gradient(90deg, rgba(255,255,255,0.01) 0px, rgba(255,255,255,0.01) 1px, transparent 1px, transparent 24px)',
                ].join(','),
            }} />
        </div>
    )
}
