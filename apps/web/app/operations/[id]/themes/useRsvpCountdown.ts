'use client'

import { useEffect, useState } from 'react'
import { fmtCountdown, rsvpCloseAt, type LiveStatus } from '@/lib/operations/schedule'

export interface RsvpCountdown {
    /** The label — what the number is counting to. */
    key: string
    value: string
    /** True while the window is open and running down. */
    urgent: boolean
    /** False until the first read lands, so a theme can render nothing yet. */
    ready: boolean
}

/**
 * How long is left to answer, shared by every theme that shows it.
 *
 * The logic lives here rather than in one theme's component because each theme
 * draws it differently and none of them should own the rules. A second copy of
 * "is the window open, and if so how long" is how two themes end up disagreeing
 * about the same operation.
 *
 * Polls the same `live-status` endpoint the automation bar uses (30s) and ticks
 * its own clock every second in between, because a countdown that only moves on
 * a poll looks broken.
 */
export function useRsvpCountdown(operationId: string, rsvpOpen: boolean): RsvpCountdown {
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

    const open = live?.rsvpOpen ?? rsvpOpen

    // Only tick while something is counting down.
    useEffect(() => {
        if (!open) return
        const id = setInterval(() => setNow(new Date()), 1000)
        return () => clearInterval(id)
    }, [open])

    const opDate = live?.operationDate ? new Date(live.operationDate) : null
    const closesAt = rsvpCloseAt(opDate, live?.rsvpCloseOffsetMins ?? 60)
    const left = closesAt ? fmtCountdown(closesAt, now) : null

    // Nothing useful to say yet — no window, and no live read to contradict it.
    const ready = open || !!live

    if (!open) return { key: 'Sign-ups', value: 'Closed', urgent: false, ready }
    if (!left) return { key: 'Sign-ups', value: 'Closing now', urgent: true, ready }
    return { key: 'Sign-ups close', value: left, urgent: true, ready }
}
