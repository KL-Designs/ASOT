'use client'

import { useState, type CSSProperties } from 'react'

interface AckEntry { userId: string; userName: string; acknowledgedAt: string }

interface Props {
    opID: string
    status: string
    discordPingEnabled: boolean
    discordPingRoles: string[]
    onChangeDiscordPingRoles: (roles: string[]) => void
    ackCount: number
    ackList: AckEntry[]
}

const PING_ROLE_OPTS = [
    { id: '@everyone', label: '@everyone' },
    { id: '@here', label: '@here' },
    { id: '@friend of unit', label: '@friend of unit' },
    { id: '@veteran member', label: '@veteran member' },
]

const panelStyle: CSSProperties = {
    position: 'relative',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r)',
    background: 'linear-gradient(180deg, var(--s1) 0%, var(--bg) 100%)',
}

const tickStyle: CSSProperties = {
    position: 'absolute', top: 0, left: 0, width: 36, height: 2, background: 'var(--acc)', opacity: 0.75,
}

const panelHeaderStyle: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 18px', borderBottom: '1px solid var(--line)',
    fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--ink)',
}

function chipStyle(selected: boolean): CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', gap: 7,
        border: `1px solid ${selected ? 'rgba(var(--acc-rgb), 0.42)' : 'var(--line-2)'}`,
        background: 'var(--s2)', borderRadius: 'var(--r)', padding: '6px 10px',
        fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: selected ? 'var(--ink)' : 'var(--ink-2)', cursor: 'pointer',
    }
}

/**
 * Who attends is already covered by the deck's AttendanceCard (platoon +
 * custom-unit chips, Discord ping on/off) — see task-12-report.md for the
 * inventory. What's left, and what this tab holds: the per-role Discord ping
 * targets AttendanceCard deliberately doesn't duplicate, and the orders
 * acknowledgement block that's been sitting in a residual page.tsx wrapper
 * since Task 11 waiting for this tab to exist.
 *
 * `isHQ` gating is the caller's job (page.tsx / EditorShell) — this component
 * assumes it's safe to render.
 */
export default function AttendanceTab({
    opID, status, discordPingEnabled, discordPingRoles, onChangeDiscordPingRoles, ackCount, ackList,
}: Props) {
    const [ackExpanded, setAckExpanded] = useState(false)
    const [remindSaving, setRemindSaving] = useState(false)
    const [remindSent, setRemindSent] = useState<number | null>(null)

    function toggleRole(id: string) {
        const updated = discordPingRoles.includes(id)
            ? discordPingRoles.filter(r => r !== id)
            : [...discordPingRoles, id]
        onChangeDiscordPingRoles(updated)
    }

    return (
        <div style={{ width: '100%', maxWidth: 1220, margin: '0 auto', padding: 'clamp(1.5rem, 2.5vw, 2.5rem)', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={panelStyle}>
                <div style={tickStyle} />
                <div style={panelHeaderStyle}>Notifications</div>
                <div style={{ padding: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10 }}>
                        Discord Ping Roles
                    </div>
                    {discordPingEnabled ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {PING_ROLE_OPTS.map(role => {
                                const checked = discordPingRoles.includes(role.id)
                                return (
                                    <button key={role.id} type='button' onClick={() => toggleRole(role.id)} style={chipStyle(checked)}>
                                        {checked && (
                                            <svg width='11' height='11' viewBox='0 0 12 12' fill='none'>
                                                <path d='M2 6l3 3 5-5' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
                                            </svg>
                                        )}
                                        {role.label}
                                    </button>
                                )
                            })}
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.72rem', color: 'var(--ink-3)', fontStyle: 'italic' }}>
                            Discord ping is disabled — enable it from the Attendance card to choose roles.
                        </div>
                    )}
                </div>
            </div>

            {status === 'Upcoming' && (
                <div style={panelStyle}>
                    <div style={tickStyle} />
                    <div style={panelHeaderStyle}>Acknowledgements</div>
                    <div style={{ padding: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: ackExpanded ? 10 : 0 }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>Orders Acknowledged</span>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: ackCount > 0 ? 'var(--good)' : 'var(--ink-3)' }}>{ackCount} staff</span>
                            <button type='button' onClick={() => setAckExpanded(v => !v)} style={{ fontSize: '0.58rem', background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: '0 4px' }}>{ackExpanded ? '▲ Hide' : '▼ Show'}</button>
                            <button type='button' disabled={remindSaving} onClick={async () => {
                                setRemindSaving(true)
                                try {
                                    const res = await fetch(`/api/operations/${opID}/remind`, { method: 'POST' })
                                    if (res.ok) { const d = await res.json(); setRemindSent(d.sent ?? 0) }
                                } finally { setRemindSaving(false) }
                            }}
                                style={{ marginLeft: 'auto', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 10px', borderRadius: 'var(--r)', background: remindSaving ? 'var(--s1)' : 'var(--s2)', border: '1px solid var(--acc)', color: remindSaving ? 'var(--ink-3)' : 'var(--acc)', cursor: remindSaving ? 'not-allowed' : 'pointer' }}
                            >
                                {remindSaving ? 'Sending…' : remindSent !== null ? `Sent (${remindSent})` : 'Remind Unacknowledged'}
                            </button>
                        </div>
                        {ackExpanded && ackList.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {ackList.map(a => (
                                    <div key={a.userId} style={{ fontSize: '0.58rem', padding: '3px 8px', borderRadius: 'var(--r)', background: 'var(--s2)', border: '1px solid var(--good)', color: 'var(--good)' }}>
                                        {a.userName} <span style={{ opacity: 0.6 }}>{new Date(a.acknowledgedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {ackExpanded && ackList.length === 0 && (
                            <div style={{ fontSize: '0.6rem', color: 'var(--ink-3)', fontStyle: 'italic' }}>No staff have acknowledged yet.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
