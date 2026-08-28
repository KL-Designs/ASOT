'use client'

import { useRsvpCountdown } from './useRsvpCountdown'
import s from './coldwar.module.css'

interface Props {
    operationId: string
    rsvpOpen: boolean
}

/**
 * The reference block's live cell on the typed sheet.
 *
 * Same rules as Modern's — they come from `useRsvpCountdown`, which both themes
 * share so they cannot end up disagreeing about the same operation. Only the
 * drawing differs: stamp red on paper rather than the operation's accent.
 */
export default function PaperRsvp({ operationId, rsvpOpen }: Props) {
    const { key, value, urgent, ready } = useRsvpCountdown(operationId, rsvpOpen)

    if (!ready) return null

    return (
        <div className={s.ref}>
            <dt className={s.refKey}>{key}</dt>
            <dd className={`${s.refVal} ${urgent ? s.refUrgent : ''}`}>{value}</dd>
        </div>
    )
}
