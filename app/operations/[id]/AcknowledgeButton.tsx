'use client'

import { useState } from 'react'

interface Props {
    operationId: string
    initialAcknowledged: boolean
    themeColor?: string
}

export default function AcknowledgeButton({ operationId, initialAcknowledged, themeColor = '#db001d' }: Props) {
    const [acknowledged, setAcknowledged] = useState(initialAcknowledged)
    const [loading, setLoading] = useState(false)

    if (acknowledged) {
        return (
            <div className='print-hide' style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'rgba(0,200,80,0.07)', border: '1px solid rgba(0,200,80,0.25)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,200,80,0.7)' }}>
                ✓ Orders Acknowledged
            </div>
        )
    }

    return (
        <button
            className='print-hide'
            disabled={loading}
            onClick={async () => {
                setLoading(true)
                try {
                    const res = await fetch(`/api/operations/${operationId}/acknowledge`, { method: 'POST' })
                    if (res.ok) setAcknowledged(true)
                } finally {
                    setLoading(false)
                }
            }}
            style={{
                padding: '5px 14px',
                background: loading ? 'rgba(0,200,80,0.04)' : 'rgba(0,200,80,0.1)',
                border: '1px solid rgba(0,200,80,0.35)',
                color: loading ? 'rgba(0,200,80,0.4)' : 'rgba(0,200,80,0.85)',
                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = 'rgba(0,200,80,0.18)'; e.currentTarget.style.color = 'rgba(0,200,80,1)' } }}
            onMouseLeave={e => { if (!loading) { e.currentTarget.style.background = 'rgba(0,200,80,0.1)'; e.currentTarget.style.color = 'rgba(0,200,80,0.85)' } }}
        >
            {loading ? 'Acknowledging…' : '✓ Acknowledge Orders'}
        </button>
    )
}
