'use client'

import { useEffect, useState } from 'react'
import { fmtCountdown } from '@/lib/operations/schedule'
import s from './modern.module.css'

interface Props {
    /** The operation's own start, ISO. */
    iso: string | null
    status?: string
}

/**
 * How long until the operation starts, in the hero.
 *
 * Not the same clock as the ledger's, which counts down to the RSVP deadline —
 * the deadline is what you owe, this is what you are waiting for, and on an
 * operation a fortnight out the two are hours apart.
 *
 * Ticks locally off the operation date rather than polling: the date is already
 * server data, and a countdown that needs a request to move is a countdown that
 * stops when the network does. It renders nothing until mounted, because a time
 * computed on the server and again in the browser will not agree and React will
 * say so.
 */
export default function StepOff({ iso, status }: Props) {
    const [now, setNow] = useState<Date | null>(null)

    useEffect(() => {
        setNow(new Date())
        const id = setInterval(() => setNow(new Date()), 1000)
        return () => clearInterval(id)
    }, [])

    if (!iso || !now) return null

    const left = fmtCountdown(new Date(iso), now)

    const { key, value } = status === 'Completed'
        ? { key: 'Operation', value: 'Complete' }
        : left
            ? { key: 'Until step off', value: left }
            : { key: 'Operation', value: status === 'Active' ? 'Under way' : 'Started' }

    return (
        <div className={s.heroCount}>
            <span className={s.heroCountKey}>{key}</span>
            <span className={s.heroCountVal}>{value}</span>
        </div>
    )
}
