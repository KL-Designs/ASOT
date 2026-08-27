'use client'

import { useState, type CSSProperties } from 'react'
import TabPanel from './TabPanel'
import AttendanceBoard from '@/components/operations/board/AttendanceBoard'

interface AckEntry { userId: string; userName: string; acknowledgedAt: string }

interface Props {
    opID: string
    status: string

    platoons: { id: string; label: string }[]
    selected: string[]
    onToggle: (id: string) => void

    customUnits: { id: string; name: string; color?: string }[]
    onAddCustomUnit: (name: string, color?: string) => void
    onRemoveCustomUnit: (id: string) => void
    customUnitsSaving: boolean

    discordPingEnabled: boolean
    onTogglePing: () => void
    discordPingRoles: string[]
    onChangeDiscordPingRoles: (roles: string[]) => void

    ackCount: number
    ackList: AckEntry[]

    operationName: string
    operationWhen: string
    myUserId: string | null
    canManageAttendance: boolean
}

const PING_ROLE_OPTS = [
    { id: '@everyone', label: '@everyone' },
    { id: '@here', label: '@here' },
    { id: '@friend of unit', label: '@friend of unit' },
    { id: '@veteran member', label: '@veteran member' },
]

const labelStyle: CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
    color: 'var(--ink-3)', marginBottom: 8,
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

function dotStyle(background: string): CSSProperties {
    return { width: 5, height: 5, borderRadius: 1, display: 'block', flexShrink: 0, background }
}

/**
 * Everything attendance-related for an operation, in one place: who is
 * assigned, who gets pinged, and who has acknowledged.
 *
 * Unit assignment and the Discord ping master toggle used to live in a deck
 * card (`deck/AttendanceCard.tsx`) while the per-role ping targets that toggle
 * gates lived here — a staging split left over from the editor rebuild rather
 * than a deliberate one. It forced this tab to tell the reader to go flip a
 * switch over in the sidebar before the roles below it would do anything. Both
 * halves are panels of this tab now and the deck has no attendance card at all.
 *
 * `isHQ` gating is the caller's job (page.tsx / EditorShell) — this component
 * assumes it's safe to render.
 */
export default function AttendanceTab({
    opID, status,
    platoons, selected, onToggle,
    customUnits, onAddCustomUnit, onRemoveCustomUnit, customUnitsSaving,
    discordPingEnabled, onTogglePing, discordPingRoles, onChangeDiscordPingRoles,
    ackCount, ackList,
    operationName, operationWhen, myUserId, canManageAttendance,
}: Props) {
    const [ackExpanded, setAckExpanded] = useState(false)
    const [remindSaving, setRemindSaving] = useState(false)
    const [remindSent, setRemindSent] = useState<number | null>(null)

    const [addOpen, setAddOpen] = useState(false)
    const [name, setName] = useState('')
    const [color, setColor] = useState('#6366f1')

    function submitAdd() {
        if (!name.trim()) return
        onAddCustomUnit(name.trim(), color || undefined)
        setName('')
        setAddOpen(false)
    }

    function toggleRole(id: string) {
        const updated = discordPingRoles.includes(id)
            ? discordPingRoles.filter(r => r !== id)
            : [...discordPingRoles, id]
        onChangeDiscordPingRoles(updated)
    }

    return (
        <div style={{ width: '100%', padding: 'clamp(1.5rem, 2.5vw, 2.5rem)', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/*
                The board is the tab's centre of gravity once RSVP opens, so it
                comes first and takes the full page width — a 70-position roster
                plus a docked pool has nothing to spare. The setup panels below
                keep their reading measure, since they are forms.
            */}
            <TabPanel title='Attendance Board'>
                <AttendanceBoard
                    operationId={opID}
                    operationName={operationName}
                    operationWhen={operationWhen}
                    myUserId={myUserId}
                    canManage={canManageAttendance}
                />
            </TabPanel>

            <div style={{ width: '100%', maxWidth: 1220, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <TabPanel title='Assigned Units'>
                <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {platoons.map(p => {
                            const isSel = selected.includes(p.id)
                            return (
                                <button key={p.id} type='button' onClick={() => onToggle(p.id)} style={chipStyle(isSel)}>
                                    <i style={dotStyle(isSel ? 'var(--acc)' : 'var(--ink-3)')} />
                                    {p.label}
                                </button>
                            )
                        })}
                        {customUnits.map(u => (
                            <span key={u.id} style={chipStyle(true)}>
                                <i style={dotStyle(u.color ?? 'var(--acc)')} />
                                {u.name}
                                <button
                                    type='button'
                                    disabled={customUnitsSaving}
                                    onClick={() => onRemoveCustomUnit(u.id)}
                                    aria-label={`Remove ${u.name}`}
                                    style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 0, fontSize: 10, lineHeight: 1 }}
                                >✕</button>
                            </span>
                        ))}
                        <button type='button' onClick={() => setAddOpen(v => !v)} style={{ ...chipStyle(false), borderStyle: 'dashed' }}>
                            + Custom Unit
                        </button>
                    </div>

                    {addOpen && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, maxWidth: 420 }}>
                            <input
                                autoFocus
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder='Unit name…'
                                maxLength={40}
                                onKeyDown={e => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setAddOpen(false) }}
                                style={{ flex: 1, background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)', color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 11, padding: '5px 8px', outline: 'none' }}
                            />
                            <input
                                type='color'
                                value={color}
                                onChange={e => setColor(e.target.value)}
                                title='Unit colour'
                                style={{ width: 26, height: 26, padding: 2, background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)', cursor: 'pointer' }}
                            />
                            <button
                                type='button'
                                disabled={!name.trim() || customUnitsSaving}
                                onClick={submitAdd}
                                style={{ border: '1px solid var(--line-2)', background: 'var(--s2)', borderRadius: 'var(--r)', color: 'var(--ink-2)', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 9px', cursor: 'pointer', opacity: (!name.trim() || customUnitsSaving) ? 0.5 : 1 }}
                            >Add</button>
                        </div>
                    )}
                </div>
            </TabPanel>

            <TabPanel title='Notifications'>
                <div style={{ padding: 16 }}>
                    {/* The master toggle sits directly above the roles it gates —
                        the point of moving it here. Its off-state message below
                        can now name a control on this same screen. */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, maxWidth: 420 }}>
                        <span style={{ ...labelStyle, marginBottom: 0 }}>Discord Ping</span>
                        <button
                            type='button'
                            onClick={onTogglePing}
                            aria-pressed={discordPingEnabled}
                            aria-label='Discord ping'
                            style={{
                                width: 32, height: 18, borderRadius: 9, cursor: 'pointer',
                                border: 'none', position: 'relative', padding: 0, flexShrink: 0,
                                background: discordPingEnabled ? 'var(--good)' : 'var(--s3)',
                                transition: 'background 0.15s',
                            }}
                        >
                            <span style={{
                                position: 'absolute', top: 3, left: discordPingEnabled ? 17 : 3,
                                width: 12, height: 12, borderRadius: '50%', background: 'var(--bg)',
                                transition: 'left 0.15s',
                            }} />
                        </button>
                    </div>

                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                        <div style={labelStyle}>Discord Ping Roles</div>
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
                                Enable Discord ping to choose roles.
                            </div>
                        )}
                    </div>
                </div>
            </TabPanel>

            {status === 'Upcoming' && (
                <TabPanel title='Acknowledgements'>
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
                </TabPanel>
            )}
            </div>
        </div>
    )
}
