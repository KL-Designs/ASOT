'use client'

import { useRsvpCountdown } from './useRsvpCountdown'
import s from './scifi.module.css'

interface Props {
    operationId: string
    /** SSR value, so the gauge has a shape before the live read lands. */
    rsvpOpen: boolean
}

/**
 * The one live gauge on the console: how long is left to answer.
 *
 * The rules come from `useRsvpCountdown`, shared with Modern and Cold War so
 * the three cannot end up disagreeing about the same operation. Only the
 * drawing differs — amber on a green screen, the single warm cell in the row,
 * which is what makes the deadline the first thing read.
 */
export default function ConsoleRsvp({ operationId, rsvpOpen }: Props) {
    const { key, value, urgent, ready } = useRsvpCountdown(operationId, rsvpOpen)

    // A gauge reading "—" is worse than one that isn't there.
    if (!ready) return null

    return (
        <div className={urgent ? `${s.gauge} ${s.gaugeHot}` : s.gauge}>
            <dt className={s.gaugeKey}>{key}</dt>
            <dd className={s.gaugeVal}>{value}</dd>
        </div>
    )
}
