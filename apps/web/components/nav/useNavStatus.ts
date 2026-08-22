'use client'

import { useEffect, useState } from 'react'
import type { NavStatus } from '@/app/api/nav/status/route'

/**
 * The status rail's data, fetched once per mount and refreshed every five
 * minutes. Shared by the rail and by the "Next Op" card in the mega panels, so
 * both quote the same operation — hence a hook rather than a fetch in each.
 *
 * Never throws and never surfaces an error state: everything it feeds is
 * decoration on a navigation bar, so a failed request just leaves the segments
 * unrendered rather than putting an error in the chrome of every page.
 */

const REFRESH_MS = 5 * 60 * 1000

export function useNavStatus(): NavStatus | null {
    const [status, setStatus] = useState<NavStatus | null>(null)

    useEffect(() => {
        let cancelled = false

        const load = () => {
            fetch('/api/nav/status')
                .then(res => res.ok ? res.json() : null)
                .then(json => { if (!cancelled && json && !json.error) setStatus(json) })
                .catch(() => { })
        }

        load()
        const id = setInterval(load, REFRESH_MS)
        return () => { cancelled = true; clearInterval(id) }
    }, [])

    return status
}

/** `SAT 20:00` in the reader's own timezone. */
export function formatOpTime(iso: string): string {
    const d = new Date(iso)
    const day = d.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase()
    const time = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
    return `${day} ${time}`
}

/**
 * `T−2D 04H 11M`, or `RUNNING` once the start time has passed.
 *
 * Minute resolution on purpose — a ticking seconds counter in the page chrome
 * is a distraction, and it lets the rail re-render every 30s instead of every
 * second.
 */
export function formatCountdown(iso: string): string {
    const ms = new Date(iso).getTime() - Date.now()
    if (ms <= 0) return 'RUNNING'

    const totalMinutes = Math.floor(ms / 60000)
    const days = Math.floor(totalMinutes / 1440)
    const hours = Math.floor((totalMinutes % 1440) / 60)
    const minutes = totalMinutes % 60

    const pad = (n: number) => String(n).padStart(2, '0')
    return days > 0
        ? `T−${days}D ${pad(hours)}H ${pad(minutes)}M`
        : `T−${pad(hours)}H ${pad(minutes)}M`
}
