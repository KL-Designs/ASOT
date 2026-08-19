'use client'

import { useCallback, useEffect, useState } from 'react'
import { buildTimeline, type LiveStatus, type TimelineMoment } from '@/lib/operations/schedule'

/**
 * Polls the same endpoint the public status bar uses, on the same 30s cadence,
 * and ticks a 1s clock so countdowns move without another network call.
 */
export function useOperationStatus(operationId: string): {
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
        const id = setInterval(() => setNow(new Date()), 1_000)
        return () => clearInterval(id)
    }, [])

    const timeline = status ? buildTimeline(status) : []

    const opDate = status?.operationDate ? new Date(status.operationDate) : null
    const daysUntil = opDate
        ? Math.max(0, Math.ceil((opDate.getTime() - now.getTime()) / 86_400_000))
        : null

    return { status, timeline, now, daysUntil, refresh }
}
