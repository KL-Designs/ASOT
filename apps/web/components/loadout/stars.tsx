'use client'

import { useId, useState } from 'react'
import { formatAvg } from '@/lib/loadout/rating'
import s from '@/app/(landing)/milpacs/[username]/profile.module.css'

/**
 * What the unit makes of a kit.
 *
 * Two modes from one component so the shelf card and the kit page cannot drift
 * apart: read-only shows the average and how many gave it; interactive adds a
 * hover preview and click-to-rate.
 *
 * Deliberately not the `Star` in `loadout-manager.tsx`. That one nominates a
 * default kit — a toggle the owner presses on their own file. This is a
 * five-value scale other people set. They look alike and mean nothing alike.
 */

function StarGlyph({ fill, size }: { fill: 'full' | 'half' | 'none'; size: number }) {
    const path = 'M12 2.8 15 9.5l7.2 1-5.2 5 1.2 7.2L12 19.3 5.8 22.7 7 15.5 1.8 10.5l7.2-1z'
    // A half star is the same path clipped down the middle, so a 4.5 reads as
    // four and a half rather than rounding away the half a member earned.
    // The clip id comes from useId() rather than `size`, since a page can show
    // many stars of the same size — deriving the id from size alone would give
    // every one of them the same DOM id, and every half-star would clip against
    // whichever element happened to be first.
    const clipId = useId()
    return (
        <svg viewBox='0 0 24 24' width={size} height={size} aria-hidden='true'
            stroke='currentColor' strokeWidth={1.5} strokeLinejoin='round'>
            {fill === 'half' && (
                <defs>
                    <clipPath id={clipId}><rect x='0' y='0' width='12' height='24' /></clipPath>
                </defs>
            )}
            <path d={path} fill='none' />
            {fill === 'full' && <path d={path} fill='currentColor' />}
            {fill === 'half' && <path d={path} fill='currentColor' clipPath={`url(#${clipId})`} />}
        </svg>
    )
}

export function Stars({
    avg, count, mine = null, loadoutId, interactive = false, size = 14,
}: {
    avg: number
    count: number
    /** The viewer's own rating, when they have one. */
    mine?: number | null
    /** Required when `interactive`. */
    loadoutId?: string
    interactive?: boolean
    size?: number
}) {
    const [state, setState] = useState({ avg, count, mine })
    const [hover, setHover] = useState<number | null>(null)
    const [busy, setBusy] = useState(false)

    // Interactive stars show the viewer their own rating, not the average —
    // the average is beside them, and a control that ignores your input to
    // display a crowd's is a control nobody trusts.
    const shown = interactive ? (hover ?? state.mine ?? 0) : state.avg

    const rate = async (stars: number) => {
        if (!interactive || !loadoutId || busy) return
        // Clicking the star you already gave withdraws the rating.
        const next = state.mine === stars ? null : stars
        const previous = state
        setBusy(true)
        setState(s => ({ ...s, mine: next }))   // optimistic
        try {
            const res = await fetch(`/api/loadouts/${loadoutId}/rating`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stars: next }),
            })
            if (!res.ok) throw new Error('rating rejected')
            const json = await res.json()
            setState({ avg: json.avg, count: json.count, mine: json.mine })
        } catch {
            setState(previous)   // put the display back rather than lying about it
        } finally {
            setBusy(false)
        }
    }

    const label = state.count === 1 ? '1 rating' : `${state.count} ratings`

    return (
        <div className={interactive ? `${s.stars} ${s.starsLive}` : s.stars}
            onMouseLeave={() => setHover(null)}>
            {[1, 2, 3, 4, 5].map(n => {
                const fill = shown >= n ? 'full' : shown >= n - 0.5 ? 'half' : 'none'
                if (!interactive) {
                    return <span key={n} className={s.star}><StarGlyph fill={fill} size={size} /></span>
                }
                return (
                    <button
                        key={n}
                        type='button'
                        className={s.star}
                        disabled={busy}
                        aria-label={state.mine === n ? `Withdraw your ${n}-star rating` : `Rate ${n} of 5`}
                        aria-pressed={state.mine === n}
                        onMouseEnter={() => setHover(n)}
                        onFocus={() => setHover(n)}
                        onBlur={() => setHover(null)}
                        onClick={() => rate(n)}
                    >
                        <StarGlyph fill={fill} size={size} />
                    </button>
                )
            })}
            <span className={s.starsNum}>{formatAvg(state.avg, state.count)}</span>
            <span className={s.starsCount}>
                {state.count === 0 ? 'Not yet rated' : `(${state.count})`}
                <span className={s.srOnly}>{label}</span>
            </span>
        </div>
    )
}
