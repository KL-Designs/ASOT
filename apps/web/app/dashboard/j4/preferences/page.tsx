'use client'

import { useState, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/material'
import { ArrowBack, Lock, LockOpen, Add, Delete } from '@mui/icons-material'
import Link from 'next/link'
import { NOTIFICATION_TYPES, NOTIF_CATEGORIES } from '@/lib/notifications/types'
import type { EscalationGroup } from '@/lib/lockout'
import type { LockoutGroup } from '@/lib/lockout'

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
    const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(237,237,237,0.85)', padding: '5px 8px', fontSize: '0.8rem', outline: 'none', width: '100%', boxSizing: 'border-box' }

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

// ── Main page ─────────────────────────────────────────────────────────────────

type ActivePanel = 'notifications' | 'task-limits' | 'task-lockout'

export default function J4NotificationPolicyPage() {
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
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(219,0,29,0.22)' }}>
                <button style={tabStyle(activePanel === 'notifications')} onClick={() => setActivePanel('notifications')}>Notification Toggles</button>
                <button style={tabStyle(activePanel === 'task-limits')} onClick={() => setActivePanel('task-limits')}>Task Limits</button>
                <button style={tabStyle(activePanel === 'task-lockout')} onClick={() => setActivePanel('task-lockout')}>Overdue Lockout</button>
            </div>

            <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5, padding: '10px 14px', background: 'rgba(219,0,29,0.04)', border: '1px solid rgba(219,0,29,0.18)' }}>
                {activePanel === 'notifications' && 'Force-on notification types cannot be disabled by members. Use sparingly for critical operational notifications.'}
                {activePanel === 'task-limits' && 'Task limit escalation notifies higher staff when a member accumulates too many incomplete tasks.'}
                {activePanel === 'task-lockout' && 'Overdue task lockout blocks members from accessing the rest of the portal until they action their overdue tasks.'}
            </div>

            {activePanel === 'notifications' && <NotificationPolicyPanel />}
            {activePanel === 'task-limits' && <TaskLimitPolicyPanel />}
            {activePanel === 'task-lockout' && <TaskLockoutPolicyPanel />}
        </div>
    )
}
