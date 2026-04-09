'use client'

import { useState, useEffect } from 'react'

interface LiveStatus {
    operationStatus: string | null
    operationDate: string | null
    stage?: string
    rsvpOpen: boolean
    rsvpOpenAt?: string
    rsvpCloseOffsetMins?: number
    confirmationOpen: boolean
    confirmationOpenedAt?: string
}

interface Props {
    operationId: string
    operationDate: string | null   // ISO string (initial SSR value)
    operationStatus: string        // initial SSR value
    themeColor: string
    r: number
    g: number
    b: number
}

function fmtCountdown(target: Date, now: Date): string | null {
    const diff = target.getTime() - now.getTime()
    if (diff <= 0) return null
    const s = Math.floor(diff / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    const d = Math.floor(h / 24)
    if (d > 0) return `${d}d ${h % 24}h`
    if (h > 0) return `${h}h ${m % 60}m`
    return `${m}m ${s % 60}s`
}

export default function OperationStatusBar({ operationId, operationDate: initialDate, operationStatus: initialStatus, r, g, b }: Props) {
    const c = (a: number) => `rgba(${r},${g},${b},${a})`
    const [data, setData] = useState<LiveStatus | null>(null)
    const [now, setNow] = useState(() => new Date())

    const fetchStatus = () => {
        fetch(`/api/operations/${operationId}/live-status`)
            .then(res => res.json())
            .then(json => setData(json))
            .catch(() => {})
    }

    useEffect(() => {
        fetchStatus()
        const id = setInterval(fetchStatus, 30_000)
        return () => clearInterval(id)
    }, [operationId])

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000)
        return () => clearInterval(id)
    }, [])

    if (!data) return null

    const operationStatus = data.operationStatus ?? initialStatus
    const operationDate   = data.operationDate   ?? initialDate

    const opDate = operationDate ? new Date(operationDate) : null
    const rsvpOpenAt = data.rsvpOpenAt ? new Date(data.rsvpOpenAt) : null
    const rsvpCloseOffsetMins = data.rsvpCloseOffsetMins ?? 60
    const rsvpCloseDate = opDate ? new Date(opDate.getTime() - rsvpCloseOffsetMins * 60000) : null
    const confirmCloseDate = data.confirmationOpenedAt ? new Date(new Date(data.confirmationOpenedAt).getTime() + 24 * 3600000) : null

    const isCompleted   = operationStatus === 'Completed'
    const isActive      = operationStatus === 'Active'
    const rsvpAlreadyFired = ['rsvp_closed', 'op_running', 'confirmations_open', 'completed'].includes(data.stage ?? '')

    // Derive items
    const items: { label: string; detail: string; state: 'done' | 'active' | 'pending' }[] = []

    // RSVP Opens
    if (rsvpOpenAt || data.rsvpOpen || rsvpAlreadyFired) {
        let detail: string
        let state: 'done' | 'active' | 'pending'
        if (data.rsvpOpen) {
            // Green while open
            detail = 'RSVP Open'
            state = 'done'
        } else if (rsvpAlreadyFired) {
            // Greyed out once closed
            detail = 'RSVP Closed'
            state = 'pending'
        } else if (rsvpOpenAt && rsvpOpenAt > now) {
            detail = `Opens in ${fmtCountdown(rsvpOpenAt, now) ?? '...'}`
            state = 'pending'
        } else {
            detail = 'RSVP Open'
            state = 'done'
        }
        items.push({ label: 'RSVP', detail, state })
    }

    // RSVP Closes — only show countdown while RSVP is currently open; hide once closed
    if (rsvpCloseDate && data.rsvpOpen) {
        const cd = fmtCountdown(rsvpCloseDate, now)
        items.push({
            label: 'RSVP Close',
            detail: cd ? `Closes in ${cd}` : 'Closing...',
            state: 'active',
        })
    }

    // Mission Active
    {
        let detail: string
        let state: 'done' | 'active' | 'pending'
        if (isCompleted) {
            detail = '✓ Completed'
            state = 'done'
        } else if (isActive) {
            detail = '● Active'
            state = 'active'
        } else if (opDate) {
            const cd = fmtCountdown(opDate, now)
            detail = cd ? `In ${cd}` : 'Starting...'
            state = cd ? 'pending' : 'active'
        } else {
            detail = 'TBD'
            state = 'pending'
        }
        items.push({ label: 'Mission', detail, state })
    }

    // Confirmations
    if (data.confirmationOpen || data.confirmationOpenedAt || isCompleted) {
        let detail: string
        let state: 'done' | 'active' | 'pending'
        if (data.confirmationOpen && confirmCloseDate) {
            detail = `Open · closes in ${fmtCountdown(confirmCloseDate, now) ?? 'soon'}`
            state = 'active'
        } else if (data.confirmationOpen) {
            detail = 'Confirmation Open'
            state = 'active'
        } else if (data.confirmationOpenedAt && !data.confirmationOpen) {
            detail = '✓ Confirmed'
            state = 'done'
        } else {
            detail = 'When mission ends'
            state = 'pending'
        }
        items.push({ label: 'Confirm', detail, state })
    }

    if (items.length === 0) return null

    const DOT_COLORS = {
        done:    'rgba(0,210,90,0.85)',
        active:  'rgba(219,160,0,0.9)',
        pending: 'rgba(237,237,237,0.18)',
    }

    return (
        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0,
            border: `1px solid ${c(0.2)}`,
            borderTop: `2px solid ${c(0.55)}`,
            background: 'rgba(0,0,0,0.35)',
            marginBottom: 16,
        }}>
            {items.map((item, i) => (
                <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 20px',
                    borderRight: i < items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    flex: '1 1 auto',
                }}>
                    <span style={{
                        display: 'inline-block',
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: DOT_COLORS[item.state],
                        boxShadow: item.state === 'active' ? `0 0 6px ${DOT_COLORS[item.state]}` : undefined,
                    }} />
                    <div>
                        <div style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 1 }}>
                            {item.label}
                        </div>
                        <div style={{
                            fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em',
                            color: item.state === 'done' ? 'rgba(0,210,90,0.8)'
                                : item.state === 'active' ? 'rgba(219,180,0,0.9)'
                                : 'rgba(237,237,237,0.35)',
                        }}>
                            {item.detail}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
