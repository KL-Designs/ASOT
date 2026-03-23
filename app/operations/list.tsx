'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Edit, ContentCopy, Delete, ArrowForward, Add, ChevronLeft, ChevronRight } from '@mui/icons-material'


// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
    'Active':         'rgba(0,200,80,0.9)',
    'Upcoming':       'rgba(219,160,0,0.9)',
    'Completed':      'rgba(100,150,237,0.8)',
    'In Development': 'rgba(219,0,29,0.75)',
}

const STATUS_BORDER: Record<string, string> = {
    'Active':         'rgba(0,200,80,0.35)',
    'Upcoming':       'rgba(219,160,0,0.35)',
    'Completed':      'rgba(100,150,237,0.3)',
    'In Development': 'rgba(219,0,29,0.35)',
}

const STATUS_GLOW: Record<string, string> = {
    'Active':         'rgba(0,200,80,0.18)',
    'Upcoming':       'rgba(219,160,0,0.18)',
    'Completed':      'rgba(100,150,237,0.15)',
    'In Development': 'rgba(219,0,29,0.18)',
}

function StatusBadge({ status }: { status?: string }) {
    if (!status) return null
    const color = STATUS_COLORS[status] || 'rgba(237,237,237,0.35)'
    return (
        <span style={{
            fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
            color, border: `1px solid ${color}`, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0,
            background: 'rgba(0,0,0,0.45)',
        }}>
            {status}
        </span>
    )
}


// ── Icon button ────────────────────────────────────────────────────────────────

function IconBtn({ children, danger }: { children: React.ReactNode, danger?: boolean }) {
    const base = danger ? 'rgba(219,0,29,0.35)' : 'rgba(237,237,237,0.3)'
    const hover = danger ? 'rgba(219,0,29,0.8)' : 'rgba(237,237,237,0.75)'
    return (
        <div
            style={{ padding: 5, color: base, display: 'flex', transition: 'color 0.15s', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.color = hover)}
            onMouseLeave={e => (e.currentTarget.style.color = base)}
        >
            {children}
        </div>
    )
}


// ── Create button ──────────────────────────────────────────────────────────────

export function CreateButton() {
    const [active, setActive] = useState(false)

    function createMission() {
        setActive(true)
        fetch('/api/operations/new')
            .then(res => res.json())
            .then(json => {
                if (json.error) return alert(json.error)
                alert('New Mission Created!')
                setActive(false)
            })
            .catch(err => { alert(err); setActive(false) })
    }

    return (
        <button
            onClick={createMission}
            disabled={active}
            style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px',
                background: 'rgba(219,0,29,0.06)',
                border: '1px solid rgba(219,0,29,0.3)',
                color: active ? 'rgba(219,0,29,0.3)' : 'rgba(219,0,29,0.75)',
                fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                cursor: active ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s, color 0.2s',
                flexShrink: 0,
            }}
        >
            <Add style={{ fontSize: 15 }} />
            New Mission
        </button>
    )
}


// ── Calendar / month picker (right column) ─────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function CalendarPicker({
    selected, onChange,
}: {
    selected: { year: number; month: number }
    onChange: (v: { year: number; month: number }) => void
}) {
    const [year, setYear] = useState(selected.year)

    return (
        <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.01)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>
                    Browse by Month
                </span>
            </div>

            {/* Year navigation */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <button
                    onClick={() => setYear(y => y - 1)}
                    style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.4)', display: 'flex', alignItems: 'center' }}
                >
                    <ChevronLeft style={{ fontSize: 18 }} />
                </button>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(237,237,237,0.75)' }}>
                    {year}
                </span>
                <button
                    onClick={() => setYear(y => y + 1)}
                    style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.4)', display: 'flex', alignItems: 'center' }}
                >
                    <ChevronRight style={{ fontSize: 18 }} />
                </button>
            </div>

            {/* Month grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: 12 }}>
                {MONTHS.map((m, i) => {
                    const isSelected = selected.year === year && selected.month === i + 1
                    return (
                        <button
                            key={m}
                            onClick={() => onChange({ year, month: i + 1 })}
                            style={{
                                padding: '8px 4px',
                                background: isSelected ? 'rgba(219,0,29,0.12)' : 'transparent',
                                border: isSelected ? '1px solid rgba(219,0,29,0.4)' : '1px solid transparent',
                                color: isSelected ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.45)',
                                fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                cursor: 'pointer', transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.color = 'rgba(237,237,237,0.8)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' } }}
                            onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.color = 'rgba(237,237,237,0.45)'; e.currentTarget.style.background = 'transparent' } }}
                        >
                            {m}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}


// ── Active / Upcoming panel (left column) ──────────────────────────────────────

function ActiveMissionsPanel({ hasAccess: _hasAccess }: { hasAccess: boolean }) {
    const [missions, setMissions] = useState<Operation[]>([])

    useEffect(() => {
        const load = () => {
            fetch('/api/operations?status=Active,Upcoming')
                .then(r => r.json())
                .then(json => { if (json.missions) setMissions(json.missions) })
        }
        load()
        const interval = setInterval(load, 5000)
        return () => clearInterval(interval)
    }, [])

    return (
        <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.01)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>
                    Active &amp; Upcoming
                </span>
            </div>

            {missions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(237,237,237,0.12)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontStyle: 'italic' }}>
                    No active missions
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10 }}>
                    {missions.map(m => (
                        <ActiveMissionCard key={m._id.toString()} mission={m} />
                    ))}
                </div>
            )}
        </div>
    )
}

function ActiveMissionCard({ mission }: { mission: Operation }) {
    const [hovered, setHovered] = useState(false)
    const accentBorder = STATUS_BORDER[mission.status || ''] || 'rgba(219,0,29,0.25)'
    const accentGlow   = STATUS_GLOW[mission.status || '']   || 'rgba(219,0,29,0.12)'

    return (
        <Link href={`/operations/${mission._id.toString()}`} style={{ textDecoration: 'none', display: 'block' }}>
            <div
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    position: 'relative',
                    height: 145,
                    overflow: 'hidden',
                    border: `1px solid ${hovered ? accentBorder : 'rgba(255,255,255,0.07)'}`,
                    boxShadow: hovered ? `0 0 22px ${accentGlow}, inset 0 0 0 1px ${accentBorder}` : 'none',
                    cursor: 'pointer',
                    transition: 'border-color 0.25s, box-shadow 0.25s',
                    background: 'rgba(0,0,0,0.5)',
                }}
            >
                {/* Background image */}
                {mission.coverImage && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={mission.coverImage}
                        alt=''
                        style={{
                            position: 'absolute', inset: 0,
                            width: '100%', height: '100%', objectFit: 'cover',
                            filter: `brightness(${hovered ? 0.45 : 0.38})`,
                            transition: 'filter 0.25s',
                        }}
                    />
                )}

                {/* Gradient overlay — darker at bottom for text legibility */}
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.85) 100%)',
                }} />

                {/* Status badge — top right */}
                <div style={{ position: 'absolute', top: 10, right: 10 }}>
                    <StatusBadge status={mission.status} />
                </div>

                {/* Text content — bottom */}
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: '10px 12px',
                    display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                    <span style={{
                        fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: 'rgba(237,237,237,0.95)', lineHeight: 1.25,
                        textShadow: '0 1px 6px rgba(0,0,0,0.8)',
                    }}>
                        {mission.title}
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
                        {mission.department && (
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.8)', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                                {mission.department}
                            </span>
                        )}
                        <span style={{ fontSize: '0.6rem', letterSpacing: '0.07em', color: 'rgba(237,237,237,0.45)', textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                            {new Date(mission.date).toDateString()}
                        </span>
                    </div>
                </div>
            </div>
        </Link>
    )
}


// ── Monthly operations panel (center column) ───────────────────────────────────

function MonthlyMissionsPanel({
    year, month, hasAccess,
}: {
    year: number; month: number; hasAccess: boolean
}) {
    const [missions, setMissions] = useState<Operation[]>([])
    const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })

    useEffect(() => {
        setMissions([])
        fetch(`/api/operations?month=${month}&year=${year}`)
            .then(r => r.json())
            .then(json => { if (json.missions) setMissions(json.missions) })
    }, [year, month])

    return (
        <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.01)' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>
                    Operations
                </span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)' }}>
                    {monthName} {year}
                </span>
            </div>

            {missions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(237,237,237,0.12)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontStyle: 'italic' }}>
                    No operations this month
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {missions.map(m => (
                        <MissionRow key={m._id.toString()} mission={m} hasAccess={hasAccess} />
                    ))}
                </div>
            )}
        </div>
    )
}

function MissionRow({ mission, hasAccess }: { mission: Operation; hasAccess: boolean }) {
    const [hovered, setHovered] = useState(false)

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                borderLeft: `2px solid ${hovered ? 'var(--red)' : 'rgba(219,0,29,0.15)'}`,
                background: hovered ? 'rgba(255,255,255,0.015)' : 'transparent',
                transition: 'border-color 0.2s, background 0.2s',
            }}
        >
            {/* Cover thumbnail */}
            {mission.coverImage && (
                <div style={{ width: 52, height: 36, overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(255,255,255,0.08)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mission.coverImage} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
            )}

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mission.title}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <StatusBadge status={mission.status} />
                    {mission.department && (
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)' }}>
                            {mission.department}
                        </span>
                    )}
                    <span style={{ fontSize: '0.6rem', letterSpacing: '0.07em', color: 'rgba(237,237,237,0.28)', textTransform: 'uppercase' }}>
                        {new Date(mission.date).toDateString()}
                    </span>
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                {hasAccess && (
                    <>
                        <Link href={`/operations/edit?op=${mission._id.toString()}`} title='Edit'>
                            <IconBtn><Edit style={{ fontSize: 14 }} /></IconBtn>
                        </Link>
                        <button
                            title='Duplicate'
                            onClick={() => fetch(`/api/operations/duplicate?id=${mission._id}`).then(r => r.json()).then(j => { if (j.error) alert(j.error) })}
                            style={{ all: 'unset', cursor: 'pointer' }}
                        >
                            <IconBtn><ContentCopy style={{ fontSize: 14 }} /></IconBtn>
                        </button>
                        <button
                            title='Delete'
                            onClick={() => { if (confirm(`Delete "${mission.title}"?`)) fetch(`/api/operations/delete?id=${mission._id}`).then(r => r.json()).then(j => { if (j.error) alert(j.error) }) }}
                            style={{ all: 'unset', cursor: 'pointer' }}
                        >
                            <IconBtn danger><Delete style={{ fontSize: 14 }} /></IconBtn>
                        </button>
                        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
                    </>
                )}
                <Link href={`/operations/${mission._id.toString()}`} title='View Mission'>
                    <div
                        style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            padding: '5px 10px',
                            border: '1px solid rgba(219,0,29,0.25)',
                            color: 'rgba(219,0,29,0.65)',
                            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                            transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                        }}
                        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(219,0,29,0.08)'; el.style.color = 'rgba(219,0,29,1)'; el.style.borderColor = 'rgba(219,0,29,0.5)' }}
                        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'rgba(219,0,29,0.65)'; el.style.borderColor = 'rgba(219,0,29,0.25)' }}
                    >
                        View <ArrowForward style={{ fontSize: 11 }} />
                    </div>
                </Link>
            </div>
        </div>
    )
}


// ── Main board (exported) ──────────────────────────────────────────────────────

export function OperationsBoard({ editAccess }: { editAccess: boolean }) {
    const now = new Date()
    const [selected, setSelected] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 220px', gap: 16, alignItems: 'start' }}>
            {/* Left: Active & Upcoming missions */}
            <ActiveMissionsPanel hasAccess={editAccess} />

            {/* Centre: Operations for selected month */}
            <MonthlyMissionsPanel year={selected.year} month={selected.month} hasAccess={editAccess} />

            {/* Right: Month/year picker */}
            <CalendarPicker selected={selected} onChange={setSelected} />
        </div>
    )
}
