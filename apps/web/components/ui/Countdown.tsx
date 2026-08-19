'use client'

import React, { useEffect, useState } from 'react'
import s from '@/styles/ui.module.css'

/**
 * Days / hours / minutes / seconds until a target time.
 *
 * Ticks every second, unlike the navbar rail's minute-resolution countdown —
 * here it is the focal point of the card rather than page chrome, and a
 * standing seconds column is what makes it read as live.
 *
 * Renders nothing until mounted: the server has no idea what "now" is on the
 * client, and rendering a definite number would guarantee a hydration mismatch.
 */
export default function Countdown({ target, onElapsed }: {
    target: string | Date
    /** Rendered once the target has passed, instead of a row of zeroes. */
    onElapsed?: React.ReactNode
}) {
    const [remaining, setRemaining] = useState<number | null>(null)

    useEffect(() => {
        const end = new Date(target).getTime()
        const tick = () => setRemaining(Math.max(0, end - Date.now()))
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [target])

    if (remaining === null) return <div className={s.countdown} aria-hidden='true' />
    if (remaining === 0 && onElapsed) return <>{onElapsed}</>

    const pad = (n: number) => String(n).padStart(2, '0')
    const cells: [string, string][] = [
        [pad(Math.floor(remaining / 86_400_000)), 'Days'],
        [pad(Math.floor(remaining / 3_600_000) % 24), 'Hrs'],
        [pad(Math.floor(remaining / 60_000) % 60), 'Min'],
        [pad(Math.floor(remaining / 1000) % 60), 'Sec'],
    ]

    return (
        <div className={s.countdown}>
            {cells.map(([n, l]) => (
                <div key={l}>
                    <div className={s.n}>{n}</div>
                    <div className={s.l}>{l}</div>
                </div>
            ))}
        </div>
    )
}
