'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CircularProgress, Switch, FormControlLabel } from '@mui/material'
import { ArrowBack, Lock, LockOpen, Add, Delete } from '@mui/icons-material'
import Link from 'next/link'
import { NOTIFICATION_TYPES, NOTIF_CATEGORIES } from '@/lib/notifications/types'
import type { EscalationGroup } from '@/lib/lockout'
import type { LockoutGroup } from '@/lib/lockout'
import { RecruitmentInfoContent, DEFAULT_RECRUITMENT_INFO } from '@/lib/recruitment-defaults'

// ── Notification force-toggle panel ──────────────────────────────────────────

interface PolicyEntry { type: string; forceWebsite: boolean; forceDiscord: boolean }

function NotificationPolicyPanel() {
    const [policy, setPolicy] = useState<Record<string, PolicyEntry>>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState<string | null>(null)

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
        padding: '3px 10px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', borderRadius: 3,
        background: active ? 'rgba(219,0,29,0.15)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.1)'}`,
        color: active ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.4)',
    })

    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><CircularProgress size={22} style={{ color: 'rgba(219,0,29,0.5)' }} /></div>

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
                            return (
                                <div key={t.type} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: 12, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center', background: (p?.forceWebsite || p?.forceDiscord) ? 'rgba(219,0,29,0.03)' : undefined }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'rgba(237,237,237,0.8)' }}>{t.label}</div>
                                        <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>{t.description}</div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        {saving === t.type + 'forceWebsite' ? <CircularProgress size={14} style={{ color: 'rgba(219,0,29,0.5)' }} /> : (
                                            <button style={btnSx(!!p?.forceWebsite)} onClick={() => toggle(t.type, 'forceWebsite')}>
                                                {p?.forceWebsite ? <Lock sx={{ fontSize: 11 }} /> : <LockOpen sx={{ fontSize: 11 }} />}
                                                {p?.forceWebsite ? 'Forced' : 'Optional'}
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        {saving === t.type + 'forceDiscord' ? <CircularProgress size={14} style={{ color: 'rgba(219,0,29,0.5)' }} /> : (
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
    )
}

// ── Task Limit Policy panel ───────────────────────────────────────────────────

const ALL_ROLES = [
    'J1-Staff', 'J1-Recruiting', 'J2-Team Lead', 'J2-Mission Making',
    'J3-Team Lead', 'J3-Training', 'J4-Administration', 'J5-Media',
    'J6-Department Lead', 'J6-Game Master', 'J7 Staff', 'J7 Community Development',
    'HQ Staff', 'All Staff',
]

function TaskLimitPolicyPanel() {
    const [groups, setGroups] = useState<EscalationGroup[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        fetch('/api/admin/task-limit-policy')
            .then(r => r.json())
            .then(d => { setGroups(d.groups ?? []); setLoading(false) })
    }, [])

    function updateGroup(idx: number, patch: Partial<EscalationGroup>) {
        setGroups(prev => prev.map((g, i) => i === idx ? { ...g, ...patch } : g))
        setSaved(false)
    }

    function toggleRecipientRole(idx: number, field: 'firstRecipientRoles' | 'secondRecipientRoles', role: string) {
        const group = groups[idx]
        const current = group[field]
        const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role]
        updateGroup(idx, { [field]: next })
    }

    async function save() {
        setSaving(true)
        await fetch('/api/admin/task-limit-policy', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groups }),
        })
        setSaving(false); setSaved(true)
    }

    const lbl: React.CSSProperties = { fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 4, display: 'block' }
    const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line-2)', color: 'rgba(237,237,237,0.85)', padding: '5px 8px', fontSize: '0.8rem', outline: 'none', width: '100%', boxSizing: 'border-box' }

    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><CircularProgress size={22} style={{ color: 'rgba(219,0,29,0.5)' }} /></div>

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5, padding: '10px 14px', background: 'rgba(219,0,29,0.04)', border: '1px solid rgba(219,0,29,0.18)' }}>
                Configure how many incomplete tasks trigger escalation notifications for each staff group. When a threshold is reached, the configured recipient roles are notified via website and Discord.
            </div>

            {groups.map((group, idx) => (
                <div key={idx} style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(237,237,237,0.7)', letterSpacing: '0.06em' }}>{group.label}</div>
                    <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)' }}>
                        Applies to: {group.roles.join(', ')}
                    </div>

                    {/* First threshold */}
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, alignItems: 'start' }}>
                        <div>
                            <label style={lbl}>First Threshold</label>
                            <input type='number' min={1} max={100} value={group.firstThreshold} onChange={e => updateGroup(idx, { firstThreshold: Number(e.target.value) })} style={inp} />
                        </div>
                        <div>
                            <label style={lbl}>Notify Roles (first threshold)</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {ALL_ROLES.map(role => {
                                    const active = group.firstRecipientRoles.includes(role)
                                    return (
                                        <button key={role} onClick={() => toggleRecipientRole(idx, 'firstRecipientRoles', role)} style={{ all: 'unset', cursor: 'pointer', padding: '2px 8px', fontSize: '0.58rem', borderRadius: 999, background: active ? 'rgba(219,0,29,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${active ? 'rgba(219,0,29,0.45)' : 'rgba(255,255,255,0.1)'}`, color: active ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.4)' }}>
                                            {role}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Second threshold */}
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, alignItems: 'start' }}>
                        <div>
                            <label style={lbl}>Second Threshold</label>
                            <input type='number' min={1} max={100} value={group.secondThreshold} onChange={e => updateGroup(idx, { secondThreshold: Number(e.target.value) })} style={inp} />
                        </div>
                        <div>
                            <label style={lbl}>Notify Roles (second threshold)</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {ALL_ROLES.map(role => {
                                    const active = group.secondRecipientRoles.includes(role)
                                    return (
                                        <button key={role} onClick={() => toggleRecipientRole(idx, 'secondRecipientRoles', role)} style={{ all: 'unset', cursor: 'pointer', padding: '2px 8px', fontSize: '0.58rem', borderRadius: 999, background: active ? 'rgba(219,0,29,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${active ? 'rgba(219,0,29,0.45)' : 'rgba(255,255,255,0.1)'}`, color: active ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.4)' }}>
                                            {role}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8 }}>
                {saved && <span style={{ fontSize: '0.65rem', color: 'rgba(34,197,94,0.7)', alignSelf: 'center' }}>Saved</span>}
                <button onClick={save} disabled={saving} style={{ background: saving ? 'rgba(219,0,29,0.12)' : 'rgba(219,0,29,0.22)', border: '1px solid rgba(219,0,29,0.4)', color: saving ? 'rgba(237,237,237,0.4)' : 'rgba(237,237,237,0.9)', padding: '6px 20px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {saving ? <><CircularProgress size={12} color='inherit' /> SAVING…</> : 'SAVE POLICY'}
                </button>
            </div>
        </div>
    )
}

// ── Task Lockout Policy panel ─────────────────────────────────────────────────

function TaskLockoutPolicyPanel() {
    const [groups, setGroups] = useState<LockoutGroup[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved]   = useState(false)

    useEffect(() => {
        fetch('/api/admin/task-lockout-policy')
            .then(r => r.json())
            .then(d => { setGroups(d.groups ?? []); setLoading(false) })
    }, [])

    function toggle(idx: number) {
        setGroups(prev => prev.map((g, i) => i === idx ? { ...g, enabled: !g.enabled } : g))
        setSaved(false)
    }

    async function save() {
        setSaving(true)
        await fetch('/api/admin/task-lockout-policy', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groups }),
        })
        setSaving(false); setSaved(true)
    }

    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><CircularProgress size={22} style={{ color: 'rgba(219,0,29,0.5)' }} /></div>

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5, padding: '10px 14px', background: 'rgba(219,0,29,0.04)', border: '1px solid rgba(219,0,29,0.18)' }}>
                When lockout is enabled for a group, members of that group with overdue unactioned tasks will be blocked from accessing other dashboard pages until they take action (start, complete, request extension, or request reassignment). Note: J4 bypass is controlled here — if J4 lockout is enabled, J4 members are subject to the same rules.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '4px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.3)' }}>GROUP</div>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.3)', textAlign: 'center', minWidth: 120 }}>LOCKOUT ENABLED</div>
            </div>
            {groups.map((group, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center', background: group.enabled ? 'rgba(219,0,29,0.03)' : undefined }}>
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'rgba(237,237,237,0.8)' }}>{group.label}</div>
                        <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>Roles: {group.roles.join(', ')}</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', minWidth: 120 }}>
                        <button
                            onClick={() => toggle(idx)}
                            style={{
                                all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                padding: '3px 12px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', borderRadius: 3,
                                background: group.enabled ? 'rgba(219,0,29,0.15)' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${group.enabled ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                color: group.enabled ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.4)',
                            }}
                        >
                            {group.enabled ? <Lock sx={{ fontSize: 11 }} /> : <LockOpen sx={{ fontSize: 11 }} />}
                            {group.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                    </div>
                </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8 }}>
                {saved && <span style={{ fontSize: '0.65rem', color: 'rgba(34,197,94,0.7)', alignSelf: 'center' }}>Saved</span>}
                <button onClick={save} disabled={saving} style={{ background: saving ? 'rgba(219,0,29,0.12)' : 'rgba(219,0,29,0.22)', border: '1px solid rgba(219,0,29,0.4)', color: saving ? 'rgba(237,237,237,0.4)' : 'rgba(237,237,237,0.9)', padding: '6px 20px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {saving ? <><CircularProgress size={12} color='inherit' /> SAVING…</> : 'SAVE POLICY'}
                </button>
            </div>
        </div>
    )
}

// ── Image position editor ─────────────────────────────────────────────────────
// Inline drag editor shown below an image card when "Edit Position" is clicked.
// The preview renders the same gradient that the live page uses, with indicator
// lines at the 20 % / 80 % fade boundaries so you know what content will be
// fully visible vs faded.

function ImagePositionEditor({
    src, posY: initialPosY, onApply, onClose,
}: {
    src: string
    posY: number
    onApply: (posY: number) => void
    onClose: () => void
}) {
    const [posY, setPosY] = useState(initialPosY)
    const [dragging, setDragging] = useState(false)
    const dragStart = useRef<{ clientY: number; startPosY: number } | null>(null)
    const previewRef = useRef<HTMLDivElement>(null)

    function onMouseDown(e: React.MouseEvent) {
        e.preventDefault()
        dragStart.current = { clientY: e.clientY, startPosY: posY }
        setDragging(true)

        function onMove(ev: MouseEvent) {
            if (!dragStart.current || !previewRef.current) return
            const dy    = ev.clientY - dragStart.current.clientY
            const h     = previewRef.current.clientHeight
            const delta = (dy / h) * 150
            const next  = Math.max(0, Math.min(100, dragStart.current.startPosY - delta))
            setPosY(next)
        }
        function onUp() {
            setDragging(false)
            dragStart.current = null
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    const DARK = '#080808'

    return (
        <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', marginTop: 8, padding: 12 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(219,0,29,0.7)', textTransform: 'uppercase', marginBottom: 10 }}>
                Edit Image Position
            </div>

            {/* Drag preview */}
            <div
                ref={previewRef}
                onMouseDown={onMouseDown}
                style={{
                    height: 280,
                    position: 'relative',
                    backgroundImage: `url(${src})`,
                    backgroundSize: 'cover',
                    backgroundPosition: `center ${posY}%`,
                    cursor: dragging ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.08)',
                }}
            >
                {/* Live gradient matching the real page */}
                <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, ${DARK} 0%, transparent 20%, transparent 80%, ${DARK} 100%)`, pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,8,8,0.28)', pointerEvents: 'none' }} />

                {/* Top fade boundary — content above this line is faded */}
                <div style={{ position: 'absolute', top: '20%', left: 0, right: 0, pointerEvents: 'none' }}>
                    <div style={{ borderTop: '2px dashed rgba(255,220,0,0.75)', position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 8, top: 3, fontSize: '0.55rem', color: 'rgba(255,220,0,0.9)', background: 'rgba(0,0,0,0.55)', padding: '2px 6px', letterSpacing: '0.06em' }}>
                            ↑ fade zone
                        </span>
                    </div>
                </div>

                {/* Bottom fade boundary — content below this line is faded */}
                <div style={{ position: 'absolute', top: '80%', left: 0, right: 0, pointerEvents: 'none' }}>
                    <div style={{ borderTop: '2px dashed rgba(255,220,0,0.75)', position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 8, top: 3, fontSize: '0.55rem', color: 'rgba(255,220,0,0.9)', background: 'rgba(0,0,0,0.55)', padding: '2px 6px', letterSpacing: '0.06em' }}>
                            ↓ fade zone
                        </span>
                    </div>
                </div>

                {/* Centre drag hint */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ background: 'rgba(0,0,0,0.5)', padding: '5px 14px', fontSize: '0.62rem', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em' }}>
                        ↕ drag to reposition
                    </div>
                </div>
            </div>

            {/* Slider + position readout */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)', whiteSpace: 'nowrap' }}>Top</span>
                <input
                    type='range' min={0} max={100} step={1} value={posY}
                    onChange={e => setPosY(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#db001d' }}
                />
                <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)', whiteSpace: 'nowrap' }}>Bottom</span>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(237,237,237,0.6)', minWidth: 36, textAlign: 'right' }}>{Math.round(posY)}%</span>
            </div>

            {/* Apply / Cancel */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                    onClick={() => onApply(posY)}
                    style={{ padding: '5px 18px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.5)', color: 'rgba(237,237,237,0.85)', cursor: 'pointer' }}
                >
                    Apply
                </button>
                <button
                    onClick={onClose}
                    style={{ padding: '5px 18px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}
                >
                    Cancel
                </button>
            </div>
        </div>
    )
}

// ── Recruitment Settings panel ────────────────────────────────────────────────

function RecruitmentSettingsPanel() {
    const [showInfoPage,   setShowInfoPage]   = useState(true)
    const [visLoading,     setVisLoading]     = useState(true)
    const [visSaving,      setVisSaving]      = useState(false)

    const [info,           setInfo]           = useState<RecruitmentInfoContent>(DEFAULT_RECRUITMENT_INFO)
    const [loading,        setLoading]        = useState(true)
    const [savingContent,  setSavingContent]  = useState(false)
    const [savingRoles,    setSavingRoles]    = useState(false)
    const [savedContent,   setSavedContent]   = useState(false)
    const [savedRoles,     setSavedRoles]     = useState(false)
    const [openStepId,     setOpenStepId]     = useState<string | null>(null)
    const [editingPosIdx,  setEditingPosIdx]  = useState<number | null>(null)

    // Load visibility toggle
    useEffect(() => {
        fetch('/api/admin/recruitment-settings')
            .then(r => r.json())
            .then(d => { setShowInfoPage(d.showInfoPage ?? true) })
            .finally(() => setVisLoading(false))
    }, [])

    // Load recruitment info content
    useEffect(() => {
        fetch('/api/admin/recruitment-info')
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setInfo(d) })
            .finally(() => setLoading(false))
    }, [])

    async function toggleVisibility(val: boolean) {
        setShowInfoPage(val)
        setVisSaving(true)
        await fetch('/api/admin/recruitment-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ showInfoPage: val }),
        })
        setVisSaving(false)
    }

    async function saveContent() {
        setSavingContent(true)
        setSavedContent(false)
        await fetch('/api/admin/recruitment-info', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(info),
        })
        setSavingContent(false)
        setSavedContent(true)
    }

    async function saveRoles() {
        setSavingRoles(true)
        setSavedRoles(false)
        await fetch('/api/admin/recruitment-info', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(info),
        })
        setSavingRoles(false)
        setSavedRoles(true)
    }

    function updateStep(id: string, patch: Partial<RecruitmentInfoContent['steps'][number]>) {
        setInfo(prev => ({
            ...prev,
            steps: prev.steps.map(s => s.id === id ? { ...s, ...patch } : s),
        }))
        setSavedContent(false)
    }

    function updateRole(idx: number, patch: Partial<RecruitmentInfoContent['roles'][number]>) {
        setInfo(prev => {
            const roles = [...prev.roles]
            roles[idx] = { ...roles[idx], ...patch }
            return { ...prev, roles }
        })
        setSavedRoles(false)
    }

    function addRole() {
        setInfo(prev => ({ ...prev, roles: [...prev.roles, { role: '', qual: [], specialist: [] }] }))
        setSavedRoles(false)
    }

    function removeRole(idx: number) {
        setInfo(prev => ({ ...prev, roles: prev.roles.filter((_, i) => i !== idx) }))
        setSavedRoles(false)
    }

    const lbl: React.CSSProperties = { fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 4, display: 'block' }
    const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line-2)', color: 'rgba(237,237,237,0.85)', padding: '6px 8px', fontSize: '0.8rem', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical' }
    const sectionHeading: React.CSSProperties = { fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.55)', textTransform: 'uppercase', marginBottom: 8, marginTop: 24 }
    const card: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: '14px 16px' }
    const saveBtn = (saving: boolean): React.CSSProperties => ({
        background: saving ? 'rgba(219,0,29,0.12)' : 'rgba(219,0,29,0.22)',
        border: '1px solid rgba(219,0,29,0.4)',
        color: saving ? 'rgba(237,237,237,0.4)' : 'rgba(237,237,237,0.9)',
        padding: '6px 20px',
        cursor: saving ? 'not-allowed' : 'pointer',
        fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em',
        display: 'flex', alignItems: 'center', gap: 6,
    })

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Section 1: Page Visibility ── */}
            <div style={sectionHeading}>Page Visibility</div>
            {visLoading
                ? <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><CircularProgress size={22} style={{ color: 'rgba(219,0,29,0.5)' }} /></div>
                : (
                    <div style={{ padding: '18px 20px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
                            <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)', marginBottom: 4 }}>Pre-Application Information Page</div>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.6 }}>
                                    When enabled, applicants are shown an information page about the unit&apos;s training process and Selection &amp; Reinforcement Cycle after the recruitment video, before the application form. The page includes a 10-second acknowledgment timer.
                                </div>
                                <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)', marginTop: 8, lineHeight: 1.7 }}>
                                    ON:&nbsp; Video → Info Page → Application<br />
                                    OFF:&nbsp; Video → Application
                                </div>
                            </div>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={showInfoPage}
                                        onChange={e => toggleVisibility(e.target.checked)}
                                        disabled={visSaving}
                                        sx={{
                                            '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--red)' },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--red)' },
                                        }}
                                    />
                                }
                                label={
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: showInfoPage ? 'rgba(219,0,29,0.85)' : 'rgba(237,237,237,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                        {visSaving ? 'Saving…' : showInfoPage ? 'Enabled' : 'Disabled'}
                                    </span>
                                }
                                labelPlacement='start'
                                sx={{ margin: 0, flexShrink: 0 }}
                            />
                        </div>
                    </div>
                )
            }

            {/* ── Section 2: Section Background Images ── */}
            <div style={{ ...sectionHeading, marginTop: 32 }}>Section Background Images</div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)', lineHeight: 1.5, marginBottom: 12 }}>
                Three images that fade across the page as applicants scroll — one image per two steps. The page header and acknowledgement section remain on a dark background.
            </div>
            {loading
                ? null
                : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {(['Steps 1–2 (Application & Review)', 'Steps 3–4 (ARC & Selection)', 'Steps 5–6 (Reinforcement & Call Sign)'] as const).map((label, i) => {
                            const src     = info.sectionImages?.[i] ?? ''
                            const posY    = (info.sectionImagePositions ?? [50, 50, 50])[i]
                            const inputId = `recruit-img-${i}`
                            return (
                                <div key={i}>
                                    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
                                        {/* Thumbnail — shows current crop position */}
                                        <div style={{ width: 100, height: 62, flexShrink: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {src
                                                ? <div style={{ width: '100%', height: '100%', backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: `center ${posY}%` }} />
                                                : <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)', textAlign: 'center', padding: '0 8px' }}>No image</span>
                                            }
                                        </div>

                                        {/* Label + buttons */}
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(237,237,237,0.7)', marginBottom: 6 }}>{label}</div>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                <input
                                                    id={inputId}
                                                    type='file'
                                                    accept='image/jpeg,image/png,image/webp'
                                                    style={{ display: 'none' }}
                                                    onChange={async e => {
                                                        const file = e.target.files?.[0]
                                                        if (!file) return
                                                        const form = new FormData()
                                                        form.append('image', file)
                                                        const res  = await fetch('/api/admin/recruitment-images', { method: 'POST', body: form })
                                                        const data = await res.json()
                                                        if (data.url) {
                                                            const imgs: [string, string, string] = [...(info.sectionImages ?? ['', '', ''])] as [string, string, string]
                                                            imgs[i] = data.url
                                                            const next = { ...info, sectionImages: imgs }
                                                            setInfo(next)
                                                            await fetch('/api/admin/recruitment-info', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
                                                        }
                                                        e.target.value = ''
                                                    }}
                                                />
                                                <label htmlFor={inputId} style={{ cursor: 'pointer', padding: '4px 14px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', background: 'rgba(219,0,29,0.18)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.85)' }}>
                                                    {src ? 'Replace' : 'Upload'}
                                                </label>
                                                {src && (
                                                    <>
                                                        <button
                                                            onClick={() => setEditingPosIdx(editingPosIdx === i ? null : i)}
                                                            style={{ padding: '4px 14px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', background: editingPosIdx === i ? 'rgba(219,0,29,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${editingPosIdx === i ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.12)'}`, color: editingPosIdx === i ? 'rgba(219,0,29,0.85)' : 'rgba(237,237,237,0.55)', cursor: 'pointer' }}
                                                        >
                                                            {editingPosIdx === i ? 'Close Editor' : 'Edit Position'}
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                await fetch('/api/admin/recruitment-images', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: src }) })
                                                                const imgs: [string, string, string] = [...(info.sectionImages ?? ['', '', ''])] as [string, string, string]
                                                                imgs[i] = ''
                                                                const next = { ...info, sectionImages: imgs }
                                                                setInfo(next)
                                                                if (editingPosIdx === i) setEditingPosIdx(null)
                                                                await fetch('/api/admin/recruitment-info', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
                                                            }}
                                                            style={{ padding: '4px 14px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.45)', cursor: 'pointer' }}
                                                        >
                                                            Remove
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Inline position editor — shown when Edit Position is active */}
                                    {editingPosIdx === i && src && (
                                        <ImagePositionEditor
                                            src={src}
                                            posY={posY}
                                            onApply={async newPosY => {
                                                const positions: [number, number, number] = [...(info.sectionImagePositions ?? [50, 50, 50])] as [number, number, number]
                                                positions[i] = newPosY
                                                const next = { ...info, sectionImagePositions: positions }
                                                setInfo(next)
                                                setEditingPosIdx(null)
                                                await fetch('/api/admin/recruitment-info', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
                                            }}
                                            onClose={() => setEditingPosIdx(null)}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )
            }

            {/* ── Section 3: Page Content Editor ── */}
            <div style={{ ...sectionHeading, marginTop: 32 }}>Page Content Editor</div>
            {loading
                ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><CircularProgress size={22} style={{ color: 'rgba(219,0,29,0.5)' }} /></div>
                : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Intro text */}
                        <div style={card}>
                            <label style={lbl}>Intro Paragraph</label>
                            <textarea
                                rows={3}
                                value={info.introText}
                                onChange={e => { setInfo(prev => ({ ...prev, introText: e.target.value })); setSavedContent(false) }}
                                style={inp}
                            />
                        </div>

                        {/* Acknowledge text */}
                        <div style={card}>
                            <label style={lbl}>Acknowledgement Checkbox Text</label>
                            <textarea
                                rows={3}
                                value={info.acknowledgeText}
                                onChange={e => { setInfo(prev => ({ ...prev, acknowledgeText: e.target.value })); setSavedContent(false) }}
                                style={inp}
                            />
                        </div>

                        {/* Steps */}
                        {info.steps.map(step => {
                            const open = openStepId === step.id
                            return (
                                <div key={step.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 0 }}>
                                    {/* Collapsible header */}
                                    <button
                                        onClick={() => setOpenStepId(open ? null : step.id)}
                                        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
                                    >
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(237,237,237,0.75)', letterSpacing: '0.04em' }}>{step.title || step.id}</span>
                                        <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)' }}>{open ? '▲' : '▼'}</span>
                                    </button>

                                    {open && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                                            <div>
                                                <label style={lbl}>Title</label>
                                                <input value={step.title} onChange={e => updateStep(step.id, { title: e.target.value })} style={{ ...inp, resize: undefined }} />
                                            </div>
                                            <div>
                                                <label style={lbl}>Intro — basic HTML like &lt;em&gt; is supported</label>
                                                <textarea rows={3} value={step.intro} onChange={e => updateStep(step.id, { intro: e.target.value })} style={inp} />
                                            </div>
                                            <div>
                                                <label style={lbl}>Bullets (one per line)</label>
                                                <textarea rows={4} value={step.bullets.join('\n')} onChange={e => updateStep(step.id, { bullets: e.target.value.split('\n') })} style={inp} />
                                            </div>
                                            <div>
                                                <label style={lbl}>Grid items (one per line) — used for Selection and Reinforcement steps</label>
                                                <textarea rows={4} value={step.gridItems.join('\n')} onChange={e => updateStep(step.id, { gridItems: e.target.value.split('\n') })} style={inp} />
                                            </div>
                                            <div>
                                                <label style={lbl}>Follow Text</label>
                                                <textarea rows={2} value={step.followText} onChange={e => updateStep(step.id, { followText: e.target.value })} style={inp} />
                                            </div>
                                            <div>
                                                <label style={lbl}>Note Title</label>
                                                <input value={step.noteTitle} onChange={e => updateStep(step.id, { noteTitle: e.target.value })} style={{ ...inp, resize: undefined }} />
                                            </div>
                                            <div>
                                                <label style={lbl}>Note bullets (one per line)</label>
                                                <textarea rows={3} value={step.noteBullets.join('\n')} onChange={e => updateStep(step.id, { noteBullets: e.target.value.split('\n') })} style={inp} />
                                            </div>
                                            <div>
                                                <label style={lbl}>Extra paragraphs (one per line) — used for the Call Sign step</label>
                                                <textarea rows={4} value={step.extraParagraphs.join('\n')} onChange={e => updateStep(step.id, { extraParagraphs: e.target.value.split('\n') })} style={inp} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                            {savedContent && <span style={{ fontSize: '0.65rem', color: 'rgba(34,197,94,0.7)', alignSelf: 'center' }}>Saved</span>}
                            <button onClick={saveContent} disabled={savingContent} style={saveBtn(savingContent)}>
                                {savingContent ? <><CircularProgress size={12} color='inherit' /> SAVING…</> : 'SAVE PAGE CONTENT'}
                            </button>
                        </div>
                    </div>
                )
            }

            {/* ── Section 4: Roles & Training Editor ── */}
            <div style={{ ...sectionHeading, marginTop: 32 }}>Roles &amp; Training Editor</div>
            {loading
                ? <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><CircularProgress size={22} style={{ color: 'rgba(219,0,29,0.5)' }} /></div>
                : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {info.roles.map((role, idx) => (
                            <div key={idx} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={lbl}>Role Name</label>
                                        <input value={role.role} onChange={e => updateRole(idx, { role: e.target.value })} style={{ ...inp, resize: undefined }} />
                                    </div>
                                    <button
                                        onClick={() => removeRole(idx)}
                                        style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', fontSize: '0.62rem', fontWeight: 700, color: 'rgba(219,0,29,0.7)', border: '1px solid rgba(219,0,29,0.3)', flexShrink: 0, marginTop: 16 }}
                                    >
                                        Remove
                                    </button>
                                </div>
                                <div>
                                    <label style={lbl}>Qualification Trainings (one per line)</label>
                                    <textarea rows={4} value={role.qual.join('\n')} onChange={e => updateRole(idx, { qual: e.target.value.split('\n') })} style={inp} />
                                </div>
                                <div>
                                    <label style={lbl}>Specialist Role Trainings (one per line)</label>
                                    <textarea rows={4} value={role.specialist.join('\n')} onChange={e => updateRole(idx, { specialist: e.target.value.split('\n') })} style={inp} />
                                </div>
                            </div>
                        ))}

                        <button
                            onClick={addRole}
                            style={{ all: 'unset', cursor: 'pointer', padding: '8px 16px', border: '1px dashed rgba(219,0,29,0.3)', color: 'rgba(219,0,29,0.6)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
                        >
                            <Add sx={{ fontSize: 14 }} /> Add Role
                        </button>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                            {savedRoles && <span style={{ fontSize: '0.65rem', color: 'rgba(34,197,94,0.7)', alignSelf: 'center' }}>Saved</span>}
                            <button onClick={saveRoles} disabled={savingRoles} style={saveBtn(savingRoles)}>
                                {savingRoles ? <><CircularProgress size={12} color='inherit' /> SAVING…</> : 'SAVE ROLES'}
                            </button>
                        </div>
                    </div>
                )
            }
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────

// ── Certificate signatory panel ──────────────────────────────────────────────

interface SignatoryPosition { _id: string; role: string; holder: string | null }

/**
 * Picks the ORBAT position whose current holder signs rendered certificates.
 *
 * Deliberately a *position*, not a person: the holder is resolved at render
 * time, so a change of command needs no edit here. Awards and promotions that
 * record their own issuing officer are signed by them instead — this only
 * covers records that name nobody.
 */
function CertificateSignatoryPanel() {
    const [positions, setPositions] = useState<SignatoryPosition[]>([])
    const [positionId, setPositionId] = useState<string | null>(null)
    const [activeId, setActiveId] = useState<string | null>(null)
    const [signatory, setSignatory] = useState<{ signaturer: string; signaturerRankShort: string } | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(() => {
        fetch('/api/admin/certificate-signatory')
            .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load')))
            .then(d => {
                setPositions(d.positions ?? [])
                setPositionId(d.positionId ?? null)
                setActiveId(d.activePositionId ?? null)
                setSignatory(d.signatory ?? null)
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }, [])

    useEffect(load, [load])

    async function save(next: string | null) {
        setSaving(true)
        setError(null)
        const res = await fetch('/api/admin/certificate-signatory', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ positionId: next }),
        })
        setSaving(false)
        if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Save failed'); return }
        setPositionId(next)
        load()
    }

    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><CircularProgress size={22} /></div>

    const lbl: React.CSSProperties = { fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 6, display: 'block' }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line-2)' }}>
                <span style={lbl}>Currently signing</span>
                {signatory?.signaturer ? (
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                        {signatory.signaturerRankShort} {signatory.signaturer}
                    </div>
                ) : (
                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,180,0,0.8)' }}>
                        Nobody — certificates without an issuing officer of record will print an
                        empty signature line.
                    </div>
                )}
            </div>

            <div>
                <span style={lbl}>India Company HQ position</span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {positions.length === 0 && (
                        <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic' }}>
                            No Company HQ positions exist in the ORBAT.
                        </div>
                    )}
                    {positions.map(p => {
                        const selected = positionId === p._id
                        const isDefault = !positionId && activeId === p._id
                        return (
                            <button
                                key={p._id}
                                disabled={saving}
                                onClick={() => save(selected ? null : p._id)}
                                style={{
                                    all: 'unset', cursor: saving ? 'default' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '9px 12px',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    background: selected ? 'rgba(219,0,29,0.10)' : 'transparent',
                                    boxShadow: selected ? 'inset 2px 0 0 var(--red)' : 'none',
                                }}
                            >
                                <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)' }}>
                                    {p.role}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: p.holder ? 'rgba(237,237,237,0.45)' : 'rgba(237,237,237,0.2)' }}>
                                    {p.holder ?? 'vacant'}
                                </span>
                                {isDefault && (
                                    <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', border: '1px solid rgba(255,255,255,0.12)', padding: '1px 6px' }}>
                                        Auto
                                    </span>
                                )}
                                {selected && (
                                    <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--red)' }}>
                                        Signatory
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 8, lineHeight: 1.6 }}>
                    Click the selected position again to clear the choice — the Officer Commanding
                    slot is then picked automatically.
                </div>
            </div>

            {error && <div style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{error}</div>}
        </div>
    )
}


type ActivePanel = 'notifications' | 'task-limits' | 'task-lockout' | 'recruitment' | 'certificates'

export default function J4WebsiteSettingsPage() {
    const [activePanel, setActivePanel] = useState<ActivePanel>('notifications')

    const tabStyle = (active: boolean): React.CSSProperties => ({
        all: 'unset', cursor: 'pointer', padding: '7px 16px', fontSize: '0.65rem', fontWeight: 700,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: active ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.35)',
        borderBottom: active ? '2px solid var(--red)' : '2px solid transparent',
        transition: 'color 0.12s, border-color 0.12s',
    })

    return (
        <div className='max-w-[900px] mx-auto px-6 py-8' style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Link href='/dashboard/j4' style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem' }}>
                    <ArrowBack sx={{ fontSize: 14 }} /> Back
                </Link>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(219,0,29,0.6)', marginBottom: 4 }}>J4 — ADMINISTRATION</div>
                    <h1 style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.1em', margin: 0, textTransform: 'uppercase' }}>Website Settings</h1>
                </div>
            </div>

            {/* Sub-tab navigation */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--line-2)' }}>
                <button style={tabStyle(activePanel === 'notifications')} onClick={() => setActivePanel('notifications')}>Notification Toggles</button>
                <button style={tabStyle(activePanel === 'task-limits')} onClick={() => setActivePanel('task-limits')}>Task Limits</button>
                <button style={tabStyle(activePanel === 'task-lockout')} onClick={() => setActivePanel('task-lockout')}>Overdue Lockout</button>
                <button style={tabStyle(activePanel === 'recruitment')} onClick={() => setActivePanel('recruitment')}>Recruitment Settings</button>
                <button style={tabStyle(activePanel === 'certificates')} onClick={() => setActivePanel('certificates')}>Certificates</button>
            </div>

            <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5, padding: '10px 14px', background: 'rgba(219,0,29,0.04)', border: '1px solid rgba(219,0,29,0.18)' }}>
                {activePanel === 'notifications' && 'Force-on notification types cannot be disabled by members. Use sparingly for critical operational notifications.'}
                {activePanel === 'task-limits' && 'Task limit escalation notifies higher staff when a member accumulates too many incomplete tasks.'}
                {activePanel === 'task-lockout' && 'Overdue task lockout blocks members from accessing the rest of the portal until they action their overdue tasks.'}
                {activePanel === 'recruitment' && 'Control the public-facing recruitment flow, including optional pages shown to applicants before they reach the application form.'}
                {activePanel === 'certificates' && 'Award and promotion certificates are signed by the officer recorded against that award in the member’s milpac. Records that name nobody — anything filed before that was tracked — fall back to the position chosen here.'}
            </div>

            {activePanel === 'notifications' && <NotificationPolicyPanel />}
            {activePanel === 'task-limits' && <TaskLimitPolicyPanel />}
            {activePanel === 'task-lockout' && <TaskLockoutPolicyPanel />}
            {activePanel === 'recruitment' && <RecruitmentSettingsPanel />}
            {activePanel === 'certificates' && <CertificateSignatoryPanel />}
        </div>
    )
}
