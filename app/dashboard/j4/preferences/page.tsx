'use client'

import { useState, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/material'
import { ArrowBack, Lock, LockOpen } from '@mui/icons-material'
import Link from 'next/link'
import { NOTIFICATION_TYPES, NOTIF_CATEGORIES } from '@/lib/notifications/types'

interface PolicyEntry {
    type: string
    forceWebsite: boolean
    forceDiscord: boolean
}

export default function J4NotificationPolicyPage() {
    const [policy, setPolicy]     = useState<Record<string, PolicyEntry>>({})
    const [loading, setLoading]   = useState(true)
    const [saving, setSaving]     = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const res = await fetch('/api/admin/notification-policy')
        if (res.ok) {
            const data: PolicyEntry[] = await res.json()
            setPolicy(Object.fromEntries(data.map(p => [p.type, p])))
        }
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    async function toggle(type: string, field: 'forceWebsite' | 'forceDiscord') {
        setSaving(type + field)
        const current = policy[type] ?? { type, forceWebsite: false, forceDiscord: false }
        const updated = { ...current, [field]: !current[field] }
        await fetch('/api/admin/notification-policy', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated),
        })
        setPolicy(prev => ({ ...prev, [type]: updated }))
        setSaving(null)
    }

    const btnSx = (active: boolean): React.CSSProperties => ({
        all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        padding: '3px 10px', fontSize: '0.62rem', fontWeight: 700,
        letterSpacing: '0.08em', borderRadius: 3,
        background: active ? 'rgba(219,0,29,0.15)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.1)'}`,
        color: active ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.4)',
    })

    return (
        <div className='max-w-[900px] mx-auto px-6 py-8' style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Link href='/dashboard/j4' style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem' }}>
                    <ArrowBack sx={{ fontSize: 14 }} /> Back
                </Link>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(219,0,29,0.6)', marginBottom: 4 }}>J4 — ADMINISTRATION</div>
                    <h1 style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.1em', margin: 0, textTransform: 'uppercase' }}>Notification Policy</h1>
                </div>
            </div>

            <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5, padding: '10px 14px', background: 'rgba(219,0,29,0.04)', border: '1px solid rgba(219,0,29,0.18)' }}>
                Force-on notification types cannot be disabled by members. Use sparingly for critical operational notifications.
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                    <CircularProgress size={22} style={{ color: 'rgba(219,0,29,0.5)' }} />
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Column headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: 12, padding: '4px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div />
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.3)', textAlign: 'center' }}>FORCE WEBSITE</div>
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.3)', textAlign: 'center' }}>FORCE DISCORD</div>
                    </div>

                    {NOTIF_CATEGORIES.map(cat => {
                        const items = NOTIFICATION_TYPES.filter(t => t.category === cat && !t.alwaysOn)
                        if (!items.length) return null
                        return (
                            <div key={cat}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.55)', textTransform: 'uppercase', marginBottom: 8 }}>{cat}</div>
                                {items.map(t => {
                                    const p = policy[t.type]
                                    const busyW = saving === t.type + 'forceWebsite'
                                    const busyD = saving === t.type + 'forceDiscord'
                                    return (
                                        <div key={t.type} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: 12, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center', background: (p?.forceWebsite || p?.forceDiscord) ? 'rgba(219,0,29,0.03)' : undefined }}>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'rgba(237,237,237,0.8)' }}>{t.label}</div>
                                                <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>{t.description}</div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                {busyW ? <CircularProgress size={14} style={{ color: 'rgba(219,0,29,0.5)' }} /> : (
                                                    <button style={btnSx(!!p?.forceWebsite)} onClick={() => toggle(t.type, 'forceWebsite')}>
                                                        {p?.forceWebsite ? <Lock sx={{ fontSize: 11 }} /> : <LockOpen sx={{ fontSize: 11 }} />}
                                                        {p?.forceWebsite ? 'Forced' : 'Optional'}
                                                    </button>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                {busyD ? <CircularProgress size={14} style={{ color: 'rgba(219,0,29,0.5)' }} /> : (
                                                    <button style={btnSx(!!p?.forceDiscord)} onClick={() => toggle(t.type, 'forceDiscord')}>
                                                        {p?.forceDiscord ? <Lock sx={{ fontSize: 11 }} /> : <LockOpen sx={{ fontSize: 11 }} />}
                                                        {p?.forceDiscord ? 'Forced' : 'Optional'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
