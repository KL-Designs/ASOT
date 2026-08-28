'use client'

import { useCallback, useEffect, useState } from 'react'
import { buildTimeline, type LiveStatus, type TimelineMoment } from '@/lib/operations/schedule'

/**
 * Polls the same endpoint the public status bar uses, on the same 30s cadence.
 *
 * `liveClock` ticks `now` every second so a countdown moves without another
 * network call — **off by default**, because a caller that only wants
 * `daysUntil` or `refresh` was paying a re-render of its whole subtree every
 * second for a number that changes once a day. On the operations editor that
 * subtree includes the attendance board, and the tick alone cost ~240ms of
 * layout measurement per second.
 */
export function useOperationStatus(operationId: string, liveClock = false): {
    status: LiveStatus | null
    timeline: TimelineMoment[]
    now: Date
    daysUntil: number | null
    refresh: () => void
} {
    const [status, setStatus] = useState<LiveStatus | null>(null)
    const [now, setNow] = useState(() => new Date())

    const refresh = useCallback(() => {
        if (!operationId) return
        fetch(`/api/operations/${operationId}/live-status`)
            .then(res => res.json())
            .then(setStatus)
            .catch(() => {})
    }, [operationId])

    useEffect(() => {
        refresh()
        const id = setInterval(refresh, 30_000)
        return () => clearInterval(id)
    }, [refresh])

    useEffect(() => {
        if (!liveClock) return
        const id = setInterval(() => setNow(new Date()), 1_000)
        return () => clearInterval(id)
    }, [liveClock])

    const timeline = status ? buildTimeline(status) : []

    const opDate = status?.operationDate ? new Date(status.operationDate) : null
    const daysUntil = opDate
        ? Math.max(0, Math.ceil((opDate.getTime() - now.getTime()) / 86_400_000))
        : null

    return { status, timeline, now, daysUntil, refresh }
}
