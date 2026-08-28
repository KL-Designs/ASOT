'use client'

import { useEffect, useState } from 'react'
import { fmtCountdown, rsvpCloseAt, type LiveStatus } from '@/lib/operations/schedule'
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
 * Polls the same `live-status` endpoint the automation bar uses (30s) and ticks
 * its own clock every second in between, because a countdown that only moves on
 * a poll looks broken.
 */
export default function RsvpCell({ operationId, rsvpOpen }: Props) {
    const [live, setLive] = useState<LiveStatus | null>(null)
    const [now, setNow] = useState(() => new Date())

    useEffect(() => {
        let cancelled = false
        const read = () => {
            fetch(`/api/operations/${operationId}/live-status`)
                .then(res => res.json())
                .then(json => { if (!cancelled) setLive(json) })
                .catch(() => {})
        }
        read()
        const id = setInterval(read, 30_000)
        return () => { cancelled = true; clearInterval(id) }
    }, [operationId])

    // Only tick while there is something counting down.
    const open = live?.rsvpOpen ?? rsvpOpen
    useEffect(() => {
        if (!open) return
        const id = setInterval(() => setNow(new Date()), 1000)
        return () => clearInterval(id)
    }, [open])

    const opDate = live?.operationDate ? new Date(live.operationDate) : null
    const closesAt = rsvpCloseAt(opDate, live?.rsvpCloseOffsetMins ?? 60)
    const left = closesAt ? fmtCountdown(closesAt, now) : null

    // Nothing useful to say yet — no window, no date. A cell reading "—" is
    // worse than one that isn't there.
    if (!open && !live) return null

    const { key, value, tone } = open
        ? left
            ? { key: 'RSVP closes', value: left, tone: s.cellValAcc }
            : { key: 'RSVP', value: 'Closing now', tone: s.cellValWarn }
        : { key: 'RSVP', value: 'Closed', tone: s.cellValMuted }

    return (
        <div className={s.cell}>
            <dt className={s.cellKey}>{key}</dt>
            <dd className={`${s.cellVal} ${tone}`}>{value}</dd>
        </div>
    )
}
