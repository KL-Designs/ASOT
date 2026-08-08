'use client'

import { useState, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/material'
import { Mouse, Notifications, Check, Lock } from '@mui/icons-material'
import { NOTIFICATION_TYPES, NOTIF_CATEGORIES } from '@/lib/notifications/types'

interface Prefs {
    cursorCustom: boolean
    notifications: Record<string, { website: boolean; discord: boolean }>
    policy: Record<string, { forceWebsite: boolean; forceDiscord: boolean }>
}

const cardSx: React.CSSProperties = {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderTop: '2px solid rgba(219,0,29,0.5)',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
}

const labelSx: React.CSSProperties = {
    fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em',
    textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 6,
}

function Toggle({ on, onChange, locked }: { on: boolean; onChange?: (v: boolean) => void; locked?: boolean }) {
    return (
        <button
            type='button'
            onClick={() => !locked && onChange?.(!on)}
            style={{
                all: 'unset',
                cursor: locked ? 'not-allowed' : 'pointer',
                width: 36, height: 20, borderRadius: 10, position: 'relative',
                background: on ? (locked ? 'rgba(219,0,29,0.4)' : 'rgba(219,0,29,0.7)') : 'rgba(255,255,255,0.12)',
                border: `1px solid ${on ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.1)'}`,
                transition: 'background 0.15s',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
            }}
        >
            <div style={{
                position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14,
                borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {locked && <Lock sx={{ fontSize: 8, color: 'rgba(0,0,0,0.4)' }} />}
            </div>
        </button>
    )
}

export default function PreferencesPage() {
    const [prefs, setPrefs] = useState<Prefs | null>(null)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    // cursor state also synced to localStorage for immediate effect
    const [cursorLocal, setCursorLocal] = useState(true)

    useEffect(() => {
        setCursorLocal(localStorage.getItem('cursor-disabled') !== 'true')
    }, [])

    const load = useCallback(async () => {
        const res = await fetch('/api/preferences')
        if (res.ok) setPrefs(await res.json())
    }, [])

    useEffect(() => { load() }, [load])

    async function save(update: Partial<Prefs>) {
        setSaving(true)
        setSaved(false)
        const merged = { ...prefs, ...update }
        await fetch('/api/preferences', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(merged),
        })
        setPrefs(merged as Prefs)
        setSaving(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    function toggleCursor(v: boolean) {
        // Update local cursor immediately
        localStorage.setItem('cursor-disabled', v ? 'false' : 'true')
        window.dispatchEvent(new CustomEvent('cursor-toggle', { detail: { disabled: !v } }))
        setCursorLocal(v)
        save({ cursorCustom: v })
    }

    function toggleNotif(type: string, channel: 'website' | 'discord', value: boolean) {
        if (!prefs) return
        const current = prefs.notifications[type] ?? { website: true, discord: true }
        const updated = { ...prefs.notifications, [type]: { ...current, [channel]: value } }
        save({ notifications: updated })
    }

    if (!prefs) {
        return (
            <div className='min-h-screen flex items-center justify-center'>
                <CircularProgress size={28} style={{ color: 'rgba(219,0,29,0.5)' }} />
            </div>
        )
    }

    return (
        <div className='max-w-[760px] mx-auto px-4 py-10' style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

            {/* Header */}
            <div>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(219,0,29,0.6)', marginBottom: 6 }}>MEMBER SETTINGS</div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.08em', margin: 0 }}>Preferences</h1>
                {(saving || saved) && (
                    <span style={{ marginTop: 6, fontSize: '0.65rem', color: saved ? 'rgba(74,222,128,0.7)' : 'rgba(237,237,237,0.35)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {saved ? <><Check sx={{ fontSize: 12 }} />Saved</> : 'Saving…'}
                    </span>
                )}
            </div>

            {/* Section 1 — Cursor */}
            <div style={cardSx}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Mouse sx={{ fontSize: 18, color: 'rgba(237,237,237,0.4)' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.12em' }}>CURSOR PREFERENCE</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)', marginBottom: 3 }}>Custom Cursor</div>
                        <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.5 }}>
                            Replaces the standard browser cursor with the ASOT custom cursor ring.
                        </div>
                    </div>
                    <Toggle on={cursorLocal} onChange={toggleCursor} />
                </div>
                {/* Visual comparison */}
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    {/* Standard */}
                    <div style={{ flex: 1, padding: '20px 12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <svg width='44' height='44' viewBox='0 0 44 44' fill='none' xmlns='http://www.w3.org/2000/svg'>
                            <g transform='translate(8, 4)'>
                                <path d='M3 3L3 30L10.5 22.5L14.5 32L17.5 31L13.5 21H23L3 3Z' fill='white' stroke='rgba(0,0,0,0.5)' strokeWidth='1.5' strokeLinejoin='round' />
                            </g>
                        </svg>
                        <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.3)', textAlign: 'center' }}>Standard</span>
                    </div>
                    {/* ASOT Custom — Browse + Select in one panel */}
                    <div style={{ flex: 2, padding: '14px 16px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(237,237,237,0.25)', textAlign: 'center' }}>ASOT CUSTOM CURSOR</span>
                        <div style={{ display: 'flex', flex: 1 }}>
                            {/* Browse / Normal */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <svg width='44' height='44' viewBox='0 0 44 44' fill='none' xmlns='http://www.w3.org/2000/svg'>
                                    <circle cx='22' cy='22' r='12' stroke='rgba(237,237,237,0.85)' strokeWidth='1.5' />
                                    <circle cx='22' cy='22' r='2' fill='rgba(237,237,237,0.85)' />
                                </svg>
                                <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.3)', textAlign: 'center' }}>Browse / Normal</span>
                            </div>
                            <div style={{ width: 1, background: 'rgba(255,255,255,0.07)', margin: '0 8px', flexShrink: 0 }} />
                            {/* Select / Click */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <svg width='44' height='44' viewBox='0 0 44 44' fill='none' xmlns='http://www.w3.org/2000/svg'>
                                    <path d='M13 6 L6 6 L6 13'  stroke='rgba(237,237,237,0.85)' strokeWidth='1.5' fill='none' strokeLinecap='square' />
                                    <path d='M31 6 L38 6 L38 13' stroke='rgba(237,237,237,0.85)' strokeWidth='1.5' fill='none' strokeLinecap='square' />
                                    <path d='M6 31 L6 38 L13 38' stroke='rgba(237,237,237,0.85)' strokeWidth='1.5' fill='none' strokeLinecap='square' />
                                    <path d='M38 31 L38 38 L31 38' stroke='rgba(237,237,237,0.85)' strokeWidth='1.5' fill='none' strokeLinecap='square' />
                                    <line x1='22' y1='14' x2='22' y2='20' stroke='rgba(237,237,237,0.7)' strokeWidth='1.5' />
                                    <line x1='22' y1='24' x2='22' y2='30' stroke='rgba(237,237,237,0.7)' strokeWidth='1.5' />
                                    <line x1='14' y1='22' x2='20' y2='22' stroke='rgba(237,237,237,0.7)' strokeWidth='1.5' />
                                    <line x1='24' y1='22' x2='30' y2='22' stroke='rgba(237,237,237,0.7)' strokeWidth='1.5' />
                                </svg>
                                <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.3)', textAlign: 'center' }}>Select / Click</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Section 2 — Notifications */}
            <div style={cardSx}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Notifications sx={{ fontSize: 18, color: 'rgba(237,237,237,0.4)' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.12em' }}>NOTIFICATION PREFERENCES</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5 }}>
                    Control which notifications you receive on the website and via Discord DM. Locked items are required by J4.
                </div>

                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div />
                    <div style={{ ...labelSx, marginBottom: 0, textAlign: 'center' }}>Website</div>
                    <div style={{ ...labelSx, marginBottom: 0, textAlign: 'center' }}>Discord</div>
                </div>

                {NOTIF_CATEGORIES.map(cat => {
                    const items = NOTIFICATION_TYPES.filter(t => t.category === cat)
                    return (
                        <div key={cat}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.55)', textTransform: 'uppercase', marginBottom: 8 }}>{cat}</div>
                            {items.map(t => {
                                const pref = prefs.notifications[t.type] ?? { website: true, discord: true }
                                const forced = prefs.policy[t.type]
                                const webForced = t.alwaysOn || forced?.forceWebsite
                                const discForced = t.alwaysOn || forced?.forceDiscord
                                return (
                                    <div key={t.type} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px', gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'rgba(237,237,237,0.8)' }}>{t.label}</div>
                                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', marginTop: 1 }}>{t.description}</div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                                            <Toggle on={webForced ? true : pref.website} onChange={v => toggleNotif(t.type, 'website', v)} locked={webForced} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                                            <Toggle on={discForced ? true : pref.discord} onChange={v => toggleNotif(t.type, 'discord', v)} locked={discForced} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
