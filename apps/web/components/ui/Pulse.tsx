import React from 'react'
import s from '@/styles/ui.module.css'

/**
 * The live-status dot — a solid centre under an expanding ring.
 *
 * `tone` carries the meaning: green is live, amber is pending, idle is a dim
 * dot with the animation off, for "we know this is not live" as distinct from
 * "we have no idea". Stops animating under `prefers-reduced-motion`.
 */
export default function Pulse({ tone = 'live', className = '' }: {
    tone?: 'live' | 'amber' | 'idle'
    className?: string
}) {
    const toneClass = tone === 'amber' ? s.pulseAmber : tone === 'idle' ? s.pulseIdle : ''
    return (
        <span className={`${s.pulse} ${toneClass} ${className}`} aria-hidden='true'>
            <i /><b />
        </span>
    )
}
