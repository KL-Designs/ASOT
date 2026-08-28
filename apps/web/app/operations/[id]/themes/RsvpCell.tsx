'use client'

import { useRsvpCountdown } from './useRsvpCountdown'
import s from './modern.module.css'

interface Props {
    operationId: string
    /** SSR value, so the cell has a shape before the live read lands. */
    rsvpOpen: boolean
}

/**
 * The ledger's one live cell: how long is left to answer.
 *
 * The old page put this in a wide strip of its own, at the same weight as
 * everything around it — the single most time-critical fact on the page, styled
 * like a caption. Here it is a ledger cell like the rest, but the only one that
 * carries the accent, which is what makes it read first.
 *
 * The rules live in `useRsvpCountdown`, shared with the other themes that show
 * the same clock; this file is only how Modern draws it.
 */
export default function RsvpCell({ operationId, rsvpOpen }: Props) {
    const { key, value, urgent, ready } = useRsvpCountdown(operationId, rsvpOpen)

    // A cell reading "—" is worse than one that isn't there.
    if (!ready) return null

    return (
        <div className={s.cell}>
            <dt className={s.cellKey}>{key}</dt>
            <dd className={`${s.cellVal} ${urgent ? s.cellValAcc : s.cellValMuted}`}>{value}</dd>
        </div>
    )
}
