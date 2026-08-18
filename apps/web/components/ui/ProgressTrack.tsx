import React from 'react'
import s from '@/styles/ui.module.css'

/**
 * A labelled progress bar.
 *
 * Two consumers so far — operation sign-on ("38 / 60 slots") and rank progress
 * on a milpac ("290 / 451 pts to PTE(SL)") — which is why the label row is a
 * free-form pair rather than being computed from the numbers.
 *
 * `accent` overrides the gradient's left stop, so a milpac can run the member's
 * own accent colour through it.
 */
export default function ProgressTrack({ label, value, pct, accent, className = '' }: {
    /** Left-hand caption, e.g. "Signed on". */
    label?: React.ReactNode
    /** Right-hand caption, e.g. <><b>38</b> / 60 slots</>. */
    value?: React.ReactNode
    /** 0–100. Clamped, so a caller passing a raw ratio can't overflow the track. */
    pct: number
    accent?: string
    className?: string
}) {
    const width = Math.min(100, Math.max(0, pct))

    return (
        <div className={className}>
            {(label || value) && (
                <div className={s.trackRow}>
                    <span>{label}</span>
                    <span>{value}</span>
                </div>
            )}
            <div
                className={s.track}
                role='progressbar'
                aria-valuenow={Math.round(width)}
                aria-valuemin={0}
                aria-valuemax={100}
                style={accent ? ({ '--accent': accent } as React.CSSProperties) : undefined}
            >
                <i style={{ width: `${width}%` }} />
            </div>
        </div>
    )
}
