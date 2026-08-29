'use client'

import { useEffect, useState, useCallback } from 'react'

interface AckEntry {
    userId: string
    userName: string
    acknowledgedAt: string
}

interface EligibleEntry {
    userId: string
    userName: string
}

interface Props {
    operationId: string
    pageId?: string
}

/**
 * The acknowledgement card at the foot of a set of orders.
 *
 * Every colour is `var(--ack-*, <the dark value>)` rather than a literal. These
 * are inline styles, so a theme's stylesheet cannot override them at any
 * specificity - and this card renders *inside* the Cold War theme's paper
 * sheet, where the dark chrome came out near-white on cream and the whole
 * roster was unreadable. The fallbacks are the original dark values verbatim,
 * so every dark theme is unchanged and a light one only has to set the tokens
 * on an ancestor - see `.sheet` in `themes/coldwar.module.css`.
 */
export default function DocAcknowledgeCard({ operationId, pageId = 'main' }: Props) {
    const [acknowledged, setAcknowledged] = useState<boolean | null>(null)
    const [acks, setAcks] = useState<AckEntry[]>([])
    const [notAcknowledged, setNotAcknowledged] = useState<EligibleEntry[]>([])
    const [eligible, setEligible] = useState<EligibleEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showList, setShowList] = useState(false)
    const [canAcknowledge, setCanAcknowledge] = useState(false)

    const refresh = useCallback(async () => {
        try {
            const res = await fetch(`/api/operations/${operationId}/acknowledge?pageId=${encodeURIComponent(pageId)}`)
            if (!res.ok) {
                if (res.status === 403 || res.status === 401) { setLoading(false); return }
                return
            }
            const d = await res.json()
            setAcknowledged(d.acknowledged)
            setAcks(d.acks ?? [])
            setNotAcknowledged(d.notAcknowledged ?? [])
            setEligible(d.eligible ?? [])
            // If eligible list is non-empty the user is eligible (they passed auth on server)
            setCanAcknowledge(true)
        } catch {
            // not logged in or fetch failed — don't show the card
        } finally {
            setLoading(false)
        }
    }, [operationId, pageId])

    useEffect(() => { refresh() }, [refresh])

    // Nothing to show for public/non-staff viewers
    if (loading) return null
    if (!canAcknowledge) return null

    const ackCount = acks.length
    const notAckCount = notAcknowledged.length
    const totalEligible = eligible.length

    return (
        <>
            {/* Bottom acknowledge card */}
            <div className='print-hide' style={{
                marginTop: 24,
                border: acknowledged
                    ? '1px solid var(--ack-ok-edge, rgba(0,200,80,0.2))'
                    : '1px solid var(--ack-warn-edge, rgba(219,160,0,0.2))',
                borderTop: acknowledged
                    ? '2px solid var(--ack-ok, rgba(0,200,80,0.55))'
                    : '2px solid var(--ack-warn, rgba(219,160,0,0.55))',
                background: acknowledged
                    ? 'var(--ack-ok-soft, rgba(0,200,80,0.03))'
                    : 'var(--ack-warn-soft, rgba(219,160,0,0.03))',
                padding: '14px 20px',
                display: 'flex', flexDirection: 'column', gap: 12,
            }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 6, height: 6, background: acknowledged ? 'var(--ack-ok, rgba(0,200,80,0.7))' : 'var(--ack-warn, rgba(219,160,0,0.7))', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: acknowledged ? 'var(--ack-ok, rgba(0,200,80,0.75))' : 'var(--ack-warn, rgba(219,160,0,0.75))' }}>
                            {acknowledged ? 'Orders Acknowledged' : 'Acknowledge Orders'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {/* View acknowledgements button */}
                        <button
                            type='button'
                            onClick={() => setShowList(v => !v)}
                            style={{
                                fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                                padding: '4px 12px',
                                background: 'var(--ack-btn-bg, rgba(255,255,255,0.04))',
                                border: '1px solid var(--ack-btn-edge, rgba(255,255,255,0.1))',
                                color: 'var(--ack-ink-2, rgba(237,237,237,0.45))', cursor: 'pointer',
                            }}
                        >
                            {showList ? 'Hide' : 'View Acknowledgements'} ({ackCount}/{totalEligible})
                        </button>
                        {/* Acknowledge button */}
                        {!acknowledged && (
                            <button
                                type='button'
                                disabled={saving}
                                onClick={async () => {
                                    setSaving(true)
                                    try {
                                        const res = await fetch(`/api/operations/${operationId}/acknowledge`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ pageId }),
                                        })
                                        if (res.ok) await refresh()
                                    } finally {
                                        setSaving(false)
                                    }
                                }}
                                style={{
                                    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                                    padding: '5px 16px',
                                    background: saving
                                        ? 'var(--ack-warn-soft, rgba(219,160,0,0.04))'
                                        : 'var(--ack-warn-soft, rgba(219,160,0,0.12))',
                                    border: '1px solid var(--ack-warn-edge, rgba(219,160,0,0.4))',
                                    color: saving
                                        ? 'var(--ack-warn-dim, rgba(219,160,0,0.4))'
                                        : 'var(--ack-warn, rgba(219,160,0,0.9))',
                                    cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                                }}
                            >
                                {saving ? 'Acknowledging…' : '✓ Acknowledge'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Acknowledgement list */}
                {showList && (
                    <div style={{ borderTop: '1px solid var(--ack-rule, rgba(255,255,255,0.06))', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {eligible.length === 0 ? (
                            <span style={{ fontSize: '0.7rem', color: 'var(--ack-ink-3, rgba(237,237,237,0.3))' }}>No eligible members.</span>
                        ) : (
                            <>
                                {/* Acknowledged */}
                                {acks.map(a => (
                                    <div key={a.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', background: 'var(--ack-ok-soft, rgba(0,200,80,0.04))' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--ack-ok, rgba(0,200,80,0.75))', flexShrink: 0 }}>✓</span>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--ack-ink, rgba(237,237,237,0.75))', flex: 1, fontWeight: 500 }}>{a.userName}</span>
                                        <span style={{ fontSize: '0.58rem', color: 'var(--ack-ink-3, rgba(237,237,237,0.25))', letterSpacing: '0.08em', flexShrink: 0 }}>
                                            {new Date(a.acknowledgedAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}
                                        </span>
                                    </div>
                                ))}
                                {/* Not acknowledged */}
                                {notAcknowledged.map(u => (
                                    <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', background: 'var(--ack-bad-soft, rgba(219,0,29,0.03))' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--ack-bad, rgba(219,50,50,0.5))', flexShrink: 0 }}>✗</span>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--ack-ink-2, rgba(237,237,237,0.4))', flex: 1, fontWeight: 400 }}>{u.userName}</span>
                                        <span style={{ fontSize: '0.58rem', color: 'var(--ack-ink-3, rgba(237,237,237,0.15))', letterSpacing: '0.08em', flexShrink: 0 }}>Not read</span>
                                    </div>
                                ))}
                            </>
                        )}
                        {/* Summary row */}
                        {eligible.length > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', gap: 16, borderTop: '1px solid var(--ack-rule, rgba(255,255,255,0.04))', paddingTop: 8 }}>
                                <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ack-ok, rgba(0,200,80,0.55))' }}>
                                    {ackCount} Read
                                </span>
                                {notAckCount > 0 && (
                                    <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ack-bad, rgba(219,50,50,0.5))' }}>
                                        {notAckCount} Unread
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    )
}
