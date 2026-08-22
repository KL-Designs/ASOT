'use client'

import { useState, type CSSProperties } from 'react'
import Panel from './Panel'

interface Props {
    platoons: { id: string; label: string }[]
    selected: string[]
    onToggle: (id: string) => void

    customUnits: { id: string; name: string; color?: string }[]
    onAddCustomUnit: (name: string, color?: string) => void
    onRemoveCustomUnit: (id: string) => void
    customUnitsSaving: boolean

    pingEnabled: boolean
    onTogglePing: () => void
}

/**
 * Platoon assignment + Discord ping toggle, pulled out of the Attendance
 * Settings panel into the deck (Task 11). The full Attendance Settings panel
 * (platoon checkboxes, ping ROLE checkboxes, mission-stage stepper) stays put
 * for now — later tasks own removing it — so this card and that panel share
 * the same underlying state (assignedPlatoons, discordPingEnabled, customUnits)
 * via the same page.tsx handlers rather than owning a second copy of it.
 *
 * The old panel's per-role ping checkboxes (@everyone/@here/…) are NOT
 * duplicated here — the brief calls for "one labelled toggle row" only, and
 * that finer control is still live in the untouched Attendance Settings panel.
 *
 * Caller must gate rendering on `isHQ` entirely (don't render at all for a
 * non-HQ user) — this card assumes HQ-only data is safe to show.
 */
export default function AttendanceCard({
    platoons, selected, onToggle,
    customUnits, onAddCustomUnit, onRemoveCustomUnit, customUnitsSaving,
    pingEnabled, onTogglePing,
}: Props) {
    const [addOpen, setAddOpen] = useState(false)
    const [name, setName] = useState('')
    const [color, setColor] = useState('#6366f1')

    function submitAdd() {
        if (!name.trim()) return
        onAddCustomUnit(name.trim(), color || undefined)
        setName('')
        setAddOpen(false)
    }

    return (
        <Panel title="Attendance">
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                    <div style={labelStyle}>Assigned Units</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {platoons.map(p => {
                            const isSel = selected.includes(p.id)
                            return (
                                <button key={p.id} type="button" onClick={() => onToggle(p.id)} style={chipStyle(isSel)}>
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
                                    type="button"
                                    disabled={customUnitsSaving}
                                    onClick={() => onRemoveCustomUnit(u.id)}
                                    aria-label={`Remove ${u.name}`}
                                    style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 0, fontSize: 10, lineHeight: 1 }}
                                >✕</button>
                            </span>
                        ))}
                        <button type="button" onClick={() => setAddOpen(v => !v)} style={{ ...chipStyle(false), borderStyle: 'dashed' }}>
                            + Custom Unit
                        </button>
                    </div>

                    {addOpen && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                            <input
                                autoFocus
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Unit name…"
                                maxLength={40}
                                onKeyDown={e => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setAddOpen(false) }}
                                style={{ flex: 1, background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)', color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 11, padding: '5px 8px', outline: 'none' }}
                            />
                            <input
                                type="color"
                                value={color}
                                onChange={e => setColor(e.target.value)}
                                title="Unit colour"
                                style={{ width: 26, height: 26, padding: 2, background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)', cursor: 'pointer' }}
                            />
                            <button
                                type="button"
                                disabled={!name.trim() || customUnitsSaving}
                                onClick={submitAdd}
                                style={{ border: '1px solid var(--line-2)', background: 'var(--s2)', borderRadius: 'var(--r)', color: 'var(--ink-2)', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 9px', cursor: 'pointer', opacity: (!name.trim() || customUnitsSaving) ? 0.5 : 1 }}
                            >Add</button>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                    <span style={labelStyle}>Discord Ping</span>
                    <button
                        type="button"
                        onClick={onTogglePing}
                        aria-pressed={pingEnabled}
                        style={{
                            width: 32, height: 18, borderRadius: 9, cursor: 'pointer',
                            border: 'none', position: 'relative', padding: 0,
                            background: pingEnabled ? 'var(--good)' : 'var(--s3)',
                            transition: 'background 0.15s',
                        }}
                    >
                        <span style={{
                            position: 'absolute', top: 3, left: pingEnabled ? 17 : 3,
                            width: 12, height: 12, borderRadius: '50%', background: 'var(--bg)',
                            transition: 'left 0.15s',
                        }} />
                    </button>
                </div>
            </div>
        </Panel>
    )
}

const labelStyle: CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
    color: 'var(--ink-3)', marginBottom: 8,
}

function chipStyle(selected: boolean): CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', gap: 7,
        border: `1px solid ${selected ? 'rgba(var(--acc-rgb), 0.42)' : 'var(--line-2)'}`,
        background: 'var(--s2)',
        borderRadius: 'var(--r)',
        padding: '6px 10px',
        fontFamily: 'var(--mono)', fontSize: 10,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: selected ? 'var(--ink)' : 'var(--ink-2)',
        cursor: 'pointer',
    }
}

function dotStyle(background: string): CSSProperties {
    return { width: 5, height: 5, borderRadius: 1, display: 'block', flexShrink: 0, background }
}
