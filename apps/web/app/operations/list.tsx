'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Edit, ArrowForward, ChevronLeft, ChevronRight, Search, Dashboard, Map } from '@mui/icons-material'
import { useRef } from 'react'

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X'] as const

function detectDaySlotFromTitle(title: string): { stripped: string; day: 'saturday' | 'sunday' | null } {
    const sat = title.match(/\s*[-–—]?\s*(sat|saturday)\s*$/i)
    if (sat) return { stripped: title.slice(0, title.length - sat[0].length).trim(), day: 'saturday' }
    const sun = title.match(/\s*[-–—]?\s*(sun|sunday)\s*$/i)
    if (sun) return { stripped: title.slice(0, title.length - sun[0].length).trim(), day: 'sunday' }
    return { stripped: title, day: null }
}
function detectRomanSuffixFromTitle(title: string): { stripped: string; roman: string | null } {
    const m = title.match(/\s+(I{1,3}|IV|VI{0,3}|IX|X)\s*$/i)
    if (m) return { stripped: title.slice(0, title.length - m[0].length).trim(), roman: m[1].toUpperCase() }
    return { stripped: title, roman: null }
}


// ── Colour helpers ─────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
}

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
    'Active': 'rgba(0,200,80,0.9)',
    'Upcoming': 'rgba(219,160,0,0.9)',
    'Completed': 'rgba(100,150,237,0.8)',
    'In Development': 'rgba(219,0,29,0.75)',
}

const STATUS_BORDER: Record<string, string> = {
    'Active': 'rgba(0,200,80,0.35)',
    'Upcoming': 'rgba(219,160,0,0.35)',
    'Completed': 'rgba(100,150,237,0.3)',
    'In Development': 'rgba(219,0,29,0.35)',
}

const STATUS_GLOW: Record<string, string> = {
    'Active': 'rgba(0,200,80,0.18)',
    'Upcoming': 'rgba(219,160,0,0.18)',
    'Completed': 'rgba(100,150,237,0.15)',
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


// ── Create button ──────────────────────────────────────────────────────────────

export function SearchBar() {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<Operation[]>([])
    const [open, setOpen] = useState(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout>>()
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const close = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [])

    function handleChange(value: string) {
        setQuery(value)
        clearTimeout(debounceRef.current)
        if (!value.trim()) { setResults([]); setOpen(false); return }
        debounceRef.current = setTimeout(() => {
            fetch(`/api/operations?search=${encodeURIComponent(value)}`)
                .then(r => r.json())
                .then(json => {
                    setResults(json.missions || [])
                    setOpen(true)
                })
        }, 250)
    }

    return (
        <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                border: '1px solid rgba(255,255,255,0.1)',
                borderBottom: open && results.length > 0 ? '1px solid transparent' : '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(0,0,0,0.3)',
                padding: '9px 14px',
            }}>
                <Search style={{ fontSize: 17, color: 'rgba(237,237,237,0.25)', flexShrink: 0 }} />
                <input
                    value={query}
                    onChange={e => handleChange(e.target.value)}
                    onFocus={() => { if (results.length > 0) setOpen(true) }}
                    placeholder='Search operations…'
                    style={{
                        flex: 1, background: 'transparent', border: 'none', outline: 'none',
                        color: 'rgba(237,237,237,0.8)', fontSize: '0.82rem',
                        letterSpacing: '0.05em',
                    }}
                />
                {query && (
                    <button
                        onClick={() => { setQuery(''); setResults([]); setOpen(false) }}
                        style={{ background: 'none', border: 'none', color: 'rgba(237,237,237,0.25)', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 16 }}
                    >×</button>
                )}
            </div>

            {open && results.length > 0 && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                    background: 'rgba(10,10,10,0.98)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderTop: '1px solid rgba(219,0,29,0.3)',
                    maxHeight: 340, overflowY: 'auto',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                }}>
                    {results.map(m => (
                        <Link
                            key={m._id.toString()}
                            href={`/operations/${m._id.toString()}`}
                            onClick={() => { setOpen(false); setQuery('') }}
                            style={{ textDecoration: 'none', display: 'block' }}
                        >
                            <SearchResult mission={m} />
                        </Link>
                    ))}
                </div>
            )}

            {open && query && results.length === 0 && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                    background: 'rgba(10,10,10,0.98)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderTop: '1px solid rgba(219,0,29,0.3)',
                    padding: '16px', textAlign: 'center',
                    color: 'rgba(237,237,237,0.2)', fontSize: '0.7rem',
                    letterSpacing: '0.1em', textTransform: 'uppercase', fontStyle: 'italic',
                }}>
                    No operations found
                </div>
            )}
        </div>
    )
}

function SearchResult({ mission }: { mission: Operation }) {
    const [hovered, setHovered] = useState(false)
    const theme = mission.themeColor || '#db001d'
    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
                borderLeft: `2px solid ${hovered ? hexToRgba(theme, 0.7) : 'transparent'}`,
                transition: 'background 0.15s, border-color 0.15s',
            }}
        >
            {mission.coverImage && (
                <div style={{ width: 44, height: 30, flexShrink: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <img src={mission.coverImage} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
            )}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mission.title}
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <StatusBadge status={mission.status} />
                    <span style={{ fontSize: '0.58rem', letterSpacing: '0.07em', color: 'rgba(237,237,237,0.28)', textTransform: 'uppercase' }}>
                        {new Date(mission.date).toDateString()}
                    </span>
                </div>
            </div>
        </div>
    )
}

export function MissionMakingButton() {
    return (
        <Link href='/dashboard/j2?tab=0' style={{ textDecoration: 'none', flexShrink: 0 }}>
            <div
                style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                    background: 'rgba(100,150,237,0.07)', border: '1px solid rgba(100,150,237,0.3)',
                    color: 'rgba(100,150,237,0.75)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                    cursor: 'pointer', transition: 'background 0.2s, color 0.2s',
                }}
            >
                <Dashboard style={{ fontSize: 15 }} />Mission Making
            </div>
        </Link>
    )
}


// ── Calendar / month picker (right column) ─────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function CalendarPicker({
    selected, onChange,
}: {
    selected: { year: number; month: number | null }
    onChange: (v: { year: number; month: number | null }) => void
}) {
    const [year, setYear] = useState(selected.year)
    const yearSelected = selected.year === year && selected.month === null

    return (
        <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.01)', flex: 1 }}>
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
                <button
                    onClick={() => onChange({ year, month: null })}
                    title='View all operations this year'
                    style={{
                        all: 'unset', cursor: 'pointer',
                        fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.12em',
                        color: yearSelected ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.75)',
                        padding: '2px 10px',
                        background: yearSelected ? 'rgba(219,0,29,0.1)' : 'transparent',
                        border: yearSelected ? '1px solid rgba(219,0,29,0.35)' : '1px solid transparent',
                        transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (!yearSelected) { (e.currentTarget as HTMLElement).style.color = 'rgba(219,0,29,0.75)' } }}
                    onMouseLeave={e => { if (!yearSelected) { (e.currentTarget as HTMLElement).style.color = 'rgba(237,237,237,0.75)' } }}
                >
                    {year}
                </button>
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

    const active = missions.filter(m => m.status === 'Active')
    const upcoming = missions.filter(m => m.status === 'Upcoming')
    const sorted = [...active, ...upcoming]

    return (
        <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.01)', flex: 1 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>
                    Active &amp; Upcoming
                </span>
            </div>

            {sorted.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(237,237,237,0.12)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontStyle: 'italic' }}>
                    No active missions
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10 }}>
                    {sorted.map(m => (
                        <ActiveMissionCard key={m._id.toString()} mission={m} />
                    ))}
                </div>
            )}
        </div>
    )
}

function ActiveMissionCard({ mission }: { mission: Operation }) {
    const [hovered, setHovered] = useState(false)
    const isActive = mission.status === 'Active'
    const theme = mission.themeColor || '#db001d'

    const borderOpacity = isActive ? (hovered ? 0.85 : 0.55) : (hovered ? 0.55 : 0.25)
    const glowOpacity = isActive ? (hovered ? 0.35 : 0.15) : (hovered ? 0.2 : 0)
    const brightness = isActive ? 1 : (hovered ? 0.65 : 0.55)
    const height = isActive ? 175 : 130

    return (
        <Link href={`/operations/${mission._id.toString()}`} style={{ textDecoration: 'none', display: 'block' }}>
            <div
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    position: 'relative',
                    height,
                    overflow: 'hidden',
                    border: `${isActive ? '1.5px' : '1px'} solid ${hexToRgba(theme, borderOpacity)}`,
                    boxShadow: glowOpacity > 0 ? `0 0 28px ${hexToRgba(theme, glowOpacity)}` : 'none',
                    cursor: 'pointer',
                    transition: 'border-color 0.25s, box-shadow 0.25s',
                    background: 'rgba(0,0,0,0.5)',
                }}
            >
                {/* Background image */}
                {mission.coverImage && (
                    <img
                        src={mission.coverImage}
                        alt=''
                        style={{
                            position: 'absolute', inset: 0,
                            width: '100%', height: '100%', objectFit: 'cover',
                            filter: `brightness(${brightness})`,
                            transition: 'filter 0.25s',
                        }}
                    />
                )}

                {/* Gradient overlay — darker at bottom for text legibility */}
                <div style={{
                    position: 'absolute', inset: 0,
                    background: isActive
                        ? 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.72) 100%)'
                        : 'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.82) 100%)',
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
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: hexToRgba(theme, 0.9), textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
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

// ── Campaign hierarchy types ───────────────────────────────────────────────────

interface MissionSlot { op: Operation; daySlot: 'saturday' | 'sunday' | 'standalone' }
interface MissionDisplay { missionId: string; missionName: string; sequence: number; slots: MissionSlot[]; missingSatNote?: string; missingSunNote?: string }
interface CampaignDisplay { campaignId: string; campaignName: string; campaign: OperationCampaign; missions: MissionDisplay[]; unstructured: Operation[] }

function CampaignEntry({ entry, hasAccess, year, month }: { entry: CampaignDisplay; hasAccess: boolean; year?: number; month?: number | null }) {
    const [open, setOpen] = useState(false)
    const [openMissions, setOpenMissions] = useState<Set<string>>(new Set())
    const totalOps = entry.missions.reduce((s, m) => s + m.slots.length, 0) + entry.unstructured.length
    const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

    // No campaign-level month note — notes appear at individual mission/slot level

    // Shared small button style factory for action buttons inside hierarchy rows
    const actionBtn = (bg: string, border: string, color: string): React.CSSProperties => ({
        display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px',
        background: bg, border: `1px solid ${border}`, color,
        fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
    })

    return (
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {/* Campaign header row */}
            <div
                onClick={() => setOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer', background: open ? 'rgba(100,150,237,0.04)' : 'transparent', borderLeft: `3px solid ${open ? 'rgba(100,150,237,0.7)' : 'rgba(100,150,237,0.25)'}`, transition: 'all 0.15s' }}
            >
                <span style={{ fontSize: '0.72rem', color: 'rgba(100,150,237,0.6)', flexShrink: 0 }}>{open ? '▼' : '▶'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(100,150,237,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.campaignName}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.58rem', color: 'rgba(100,150,237,0.45)', letterSpacing: '0.06em' }}>CAMPAIGN · {entry.missions.length} mission{entry.missions.length !== 1 ? 's' : ''} · {totalOps} op{totalOps !== 1 ? 's' : ''}</span>
                        {(entry.campaign.startDate || entry.campaign.endDate) && (
                            <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)' }}>
                                {entry.campaign.startDate ? fmtDate(entry.campaign.startDate) : '?'} → {entry.campaign.endDate ? fmtDate(entry.campaign.endDate) : 'ongoing'}
                            </span>
                        )}
                    </div>
                </div>
                {entry.campaign.status && <StatusBadge status={entry.campaign.status} />}
            </div>

            {/* Expanded missions */}
            {open && (
                <div style={{ background: 'rgba(0,0,0,0.2)' }}>
                    {entry.missions.map(m => {
                        const mOpen = openMissions.has(m.missionId)
                        const toggleM = () => setOpenMissions(s => { const n = new Set(s); if (n.has(m.missionId)) n.delete(m.missionId); else n.add(m.missionId); return n })
                        return (
                            <div key={m.missionId} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                <div onClick={toggleM} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px 7px 28px', cursor: 'pointer', borderLeft: `3px solid ${mOpen ? 'rgba(100,150,237,0.4)' : 'transparent'}` }}>
                                    <span style={{ fontSize: '0.65rem', color: 'rgba(100,150,237,0.5)', flexShrink: 0 }}>{mOpen ? '▼' : '▶'}</span>
                                    <span style={{ flex: 1, fontSize: '0.75rem', fontWeight: 600, color: 'rgba(237,237,237,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.missionName}</span>
                                    <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)', flexShrink: 0 }}>{m.slots.length} op{m.slots.length !== 1 ? 's' : ''}</span>
                                </div>
                                {mOpen && (
                                    <div style={{ background: 'rgba(0,0,0,0.15)' }}>
                                        {m.slots.length === 0 && !m.missingSatNote && !m.missingSunNote && (
                                            <div style={{ padding: '8px 16px 8px 44px', fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No operations in this period.</div>
                                        )}
                                        {/* All ops outside this month — show a single combined note */}
                                        {m.slots.length === 0 && (m.missingSatNote || m.missingSunNote) && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px 6px 44px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                <span style={{ fontSize: '0.62rem', color: 'rgba(219,0,29,0.6)', fontStyle: 'italic' }}>
                                                    ↳ Missions were run {m.missingSatNote ?? m.missingSunNote}.
                                                </span>
                                            </div>
                                        )}
                                        {/* Ordered render: Saturday (slot or note) → Sunday (slot or note) → Standalones */}
                                        {m.slots.length > 0 && (() => {
                                            const satSlot = m.slots.find(s => s.daySlot === 'saturday')
                                            const sunSlot = m.slots.find(s => s.daySlot === 'sunday')
                                            const standalones = m.slots.filter(s => s.daySlot === 'standalone')
                                            const renderSlotRow = (s: MissionSlot) => (
                                                <div key={s.op._id.toString()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px 6px 44px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                    {s.daySlot !== 'standalone' && (
                                                        <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.04em', color: s.daySlot === 'saturday' ? 'rgba(219,160,0,0.7)' : 'rgba(100,150,237,0.7)', width: 46, flexShrink: 0 }}>
                                                            {s.daySlot === 'saturday' ? 'Saturday' : 'Sunday'}
                                                        </span>
                                                    )}
                                                    <Link href={`/operations/${s.op._id.toString()}`} style={{ flex: 1, fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {s.op.title}
                                                    </Link>
                                                    <StatusBadge status={s.op.status} />
                                                    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                                                        {hasAccess && (
                                                            <Link href={`/operations/${s.op._id.toString()}/edit`} style={{ textDecoration: 'none' }}>
                                                                <div style={actionBtn('rgba(219,160,0,0.07)', 'rgba(219,160,0,0.25)', 'rgba(219,160,0,0.65)')}><Edit style={{ fontSize: 9 }} /> Edit</div>
                                                            </Link>
                                                        )}
                                                        <Link href={`/operations/${s.op._id.toString()}/map`} style={{ textDecoration: 'none' }}>
                                                            <div style={actionBtn('rgba(34,197,94,0.07)', 'rgba(34,197,94,0.3)', 'rgba(34,197,94,0.75)')}><Map style={{ fontSize: 9 }} /> Map</div>
                                                        </Link>
                                                        <Link href={`/operations/${s.op._id.toString()}`} style={{ textDecoration: 'none' }}>
                                                            <div style={actionBtn('rgba(219,0,29,0.07)', 'rgba(219,0,29,0.3)', 'rgba(219,0,29,0.75)')}>View <ArrowForward style={{ fontSize: 9 }} /></div>
                                                        </Link>
                                                    </div>
                                                </div>
                                            )
                                            return (
                                                <>
                                                    {satSlot
                                                        ? renderSlotRow(satSlot)
                                                        : m.missingSatNote && (
                                                            <div key='sat-note' style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px 6px 44px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                                <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(219,160,0,0.45)', width: 46, flexShrink: 0 }}>Saturday</span>
                                                                <span style={{ flex: 1, fontSize: '0.62rem', color: 'rgba(219,0,29,0.6)', fontStyle: 'italic' }}>↳ Mission was run {m.missingSatNote}.</span>
                                                            </div>
                                                        )
                                                    }
                                                    {sunSlot
                                                        ? renderSlotRow(sunSlot)
                                                        : m.missingSunNote && (
                                                            <div key='sun-note' style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px 6px 44px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                                <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(100,150,237,0.45)', width: 46, flexShrink: 0 }}>Sunday</span>
                                                                <span style={{ flex: 1, fontSize: '0.62rem', color: 'rgba(219,0,29,0.6)', fontStyle: 'italic' }}>↳ Mission was run {m.missingSunNote}.</span>
                                                            </div>
                                                        )
                                                    }
                                                    {standalones.map(renderSlotRow)}
                                                </>
                                            )
                                        })()}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    {entry.unstructured.map(op => (
                        <div key={op._id.toString()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px 7px 28px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                            <Link href={`/operations/${op._id.toString()}`} style={{ flex: 1, fontSize: '0.75rem', color: 'rgba(237,237,237,0.65)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.title}</Link>
                            <StatusBadge status={op.status} />
                            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                                {hasAccess && (
                                    <Link href={`/operations/${op._id.toString()}/edit`} style={{ textDecoration: 'none' }}>
                                        <div style={actionBtn('rgba(219,160,0,0.07)', 'rgba(219,160,0,0.25)', 'rgba(219,160,0,0.65)')}><Edit style={{ fontSize: 9 }} /> Edit</div>
                                    </Link>
                                )}
                                <Link href={`/operations/${op._id.toString()}/map`} style={{ textDecoration: 'none' }}>
                                    <div style={actionBtn('rgba(34,197,94,0.07)', 'rgba(34,197,94,0.3)', 'rgba(34,197,94,0.75)')}><Map style={{ fontSize: 9 }} /> Map</div>
                                </Link>
                                <Link href={`/operations/${op._id.toString()}`} style={{ textDecoration: 'none' }}>
                                    <div style={actionBtn('rgba(219,0,29,0.07)', 'rgba(219,0,29,0.3)', 'rgba(219,0,29,0.75)')}>View <ArrowForward style={{ fontSize: 9 }} /></div>
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function MonthlyMissionsPanel({
    year, month, hasAccess,
}: {
    year: number; month: number | null; hasAccess: boolean
}) {
    const [standalone, setStandalone] = useState<Operation[]>([])
    const [campaignEntries, setCampaignEntries] = useState<CampaignDisplay[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
    const label = month === null
        ? String(year)
        : `${new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })} ${year}`

    useEffect(() => {
        setStandalone([]); setCampaignEntries([]); setTotalCount(0)
        const url = month === null ? `/api/operations?year=${year}` : `/api/operations?month=${month}&year=${year}`

        Promise.all([
            fetch(url).then(r => r.json()),
            fetch('/api/operations/campaigns').then(r => r.json()),
        ]).then(async ([opsJson, campaignsJson]) => {
            if (!opsJson.missions) return
            const allOps: Operation[] = opsJson.missions
            setTotalCount(allOps.length)

            const allCampaigns: OperationCampaign[] = campaignsJson.campaigns ?? []

            if (allCampaigns.length === 0) {
                setStandalone(allOps)
                return
            }

            // Fetch missions for all campaigns in parallel
            const missionDataList = await Promise.all(
                allCampaigns.map(c => fetch(`/api/operations/campaign-missions?campaignId=${c._id.toString()}`).then(r => r.json()))
            )

            // Build lookup maps
            const campaignMap: Record<string, OperationCampaign> = {}
            const missionsByC: Record<string, CampaignMission[]> = {}
            const missionIdToCampaignId: Record<string, string> = {}

            allCampaigns.forEach((c, i) => {
                const cid = c._id.toString()
                campaignMap[cid] = c
                missionsByC[cid] = missionDataList[i].missions ?? []
                for (const m of missionsByC[cid]) {
                    if (m._id) missionIdToCampaignId[m._id.toString()] = cid
                }
            })

            // Assign ops to campaigns using campaignId or campaignMissionId lookup
            const opsByCampaign: Record<string, Operation[]> = {}
            const assignedOpIds = new Set<string>()

            for (const op of allOps) {
                const cid = op.campaignId?.toString()
                    ?? (op.campaignMissionId ? missionIdToCampaignId[op.campaignMissionId] : undefined)
                if (cid && campaignMap[cid]) {
                    if (!opsByCampaign[cid]) opsByCampaign[cid] = []
                    opsByCampaign[cid].push(op)
                    assignedOpIds.add(op._id.toString())
                }
            }

            // Build entries for campaigns that have ops in this period
            const entries: CampaignDisplay[] = Object.keys(opsByCampaign).map(cid => {
                const campaign = campaignMap[cid]
                if (!campaign) return null
                const cMissions = (missionsByC[cid] ?? []).sort((a, b) => a.sequence - b.sequence)
                const cOps = opsByCampaign[cid] ?? []

                const missions: MissionDisplay[] = cMissions.map(cm => {
                    const mId = cm._id?.toString() ?? ''
                    const slots: MissionSlot[] = []
                    const satOp = cOps.find(o => o.campaignMissionId === mId && o.daySlot === 'saturday')
                    const sunOp = cOps.find(o => o.campaignMissionId === mId && o.daySlot === 'sunday')
                    const standalones = cOps.filter(o => o.campaignMissionId === mId && !o.daySlot)
                    if (satOp) slots.push({ op: satOp, daySlot: 'saturday' })
                    if (sunOp) slots.push({ op: sunOp, daySlot: 'sunday' })
                    standalones.forEach(o => slots.push({ op: o, daySlot: 'standalone' }))
                    return { missionId: mId, missionName: cm.name, sequence: cm.sequence, slots }
                })

                const structuredIds = new Set(missions.flatMap(m => m.slots.map(s => s.op._id.toString())))
                const unstructuredAll = cOps.filter(o => !structuredIds.has(o._id.toString()))

                // Derive virtual mission groups from unstructured ops that have Roman numeral + day patterns
                type VGroup = { name: string; slots: MissionSlot[]; romanIdx: number }
                const virtualGroupMap: Record<string, VGroup> = {}
                const trueUnstructured: Operation[] = []

                for (const op of unstructuredAll) {
                    const { stripped: withoutDay, day } = detectDaySlotFromTitle(op.title)
                    const { roman } = detectRomanSuffixFromTitle(withoutDay)
                    if (!roman) { trueUnstructured.push(op); continue }
                    const key = withoutDay.toLowerCase()
                    if (!virtualGroupMap[key]) {
                        const romanIdx = (ROMAN as readonly string[]).indexOf(roman)
                        virtualGroupMap[key] = { name: withoutDay, slots: [], romanIdx: romanIdx >= 0 ? romanIdx : 99 }
                    }
                    const daySlot: 'saturday' | 'sunday' | 'standalone' =
                        day === 'saturday' ? 'saturday' : day === 'sunday' ? 'sunday' : 'standalone'
                    virtualGroupMap[key].slots.push({ op, daySlot })
                }

                const virtualMissions: MissionDisplay[] = Object.values(virtualGroupMap)
                    .sort((a, b) => a.romanIdx - b.romanIdx)
                    .map((v, i) => ({
                        missionId: `virtual-${cid}-${i}`,
                        missionName: v.name,
                        sequence: missions.length + i + 1,
                        slots: v.slots,
                    }))

                // Annotate missions with notes for ops that exist but are in an adjacent month
                if (month !== null) {
                    const currentMonthStart = new Date(year, month - 1, 1)
                    const currentMonthEnd = new Date(year, month, 1)
                    let missingDir = ''
                    if (campaign.endDate && new Date(campaign.endDate) >= currentMonthEnd) missingDir = 'the following month'
                    else if (campaign.startDate && new Date(campaign.startDate) < currentMonthStart) missingDir = 'the previous month'
                    if (missingDir) {
                        for (const m of missions) {
                            const rawM = cMissions.find(cm => cm._id?.toString() === m.missionId)
                            if (!rawM) continue
                            if (rawM.saturdayOpId && !m.slots.some(s => s.daySlot === 'saturday')) m.missingSatNote = missingDir
                            if (rawM.sundayOpId && !m.slots.some(s => s.daySlot === 'sunday')) m.missingSunNote = missingDir
                        }
                    }
                }

                return {
                    campaignId: cid,
                    campaignName: campaign.name,
                    campaign,
                    missions: [...missions, ...virtualMissions],
                    unstructured: trueUnstructured,
                }
            }).filter(Boolean) as CampaignDisplay[]

            // Standalone = ops not assigned to any campaign
            const standaloneOps = allOps.filter(op => !assignedOpIds.has(op._id.toString()))
            setStandalone(standaloneOps)

            // Sort campaigns by their earliest linked op date
            const sorted = entries.sort((a, b) => {
                const earliest = (entry: CampaignDisplay) => {
                    const dates = [...entry.missions.flatMap(m => m.slots.map(s => new Date(s.op.date).getTime())), ...entry.unstructured.map(o => new Date(o.date).getTime())]
                    return dates.length ? Math.min(...dates) : Infinity
                }
                return earliest(a) - earliest(b)
            })
            setCampaignEntries(sorted)
        })
    }, [year, month])

    const empty = totalCount === 0 && campaignEntries.length === 0


    return (
        <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.01)', flex: 1 }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>Operations</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)' }}>{label}</span>
                <div style={{ display: 'flex', marginLeft: 'auto', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <button
                        onClick={() => setSortDir('desc')}
                        style={{
                            padding: '4px 10px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                            background: sortDir === 'desc' ? 'rgba(219,0,29,0.12)' : 'transparent',
                            border: 'none', cursor: 'pointer',
                            color: sortDir === 'desc' ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.3)',
                        }}
                    >
                        Newest First
                    </button>
                    <button
                        onClick={() => setSortDir('asc')}
                        style={{
                            padding: '4px 10px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                            background: sortDir === 'asc' ? 'rgba(219,0,29,0.12)' : 'transparent',
                            border: 'none', cursor: 'pointer',
                            color: sortDir === 'asc' ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.3)',
                        }}
                    >
                        Oldest First
                    </button>
                </div>
            </div>

            {empty ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(237,237,237,0.12)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontStyle: 'italic' }}>
                    {month === null ? 'No operations this year' : 'No operations this month'}
                </div>
            ) : (() => {
                // Build flat list, sorted by date per the sortDir toggle (defaults to newest first)
                type SortedItem =
                    | { kind: 'campaign'; entry: CampaignDisplay; sortDate: number }
                    | { kind: 'standalone'; op: Operation; sortDate: number }

                const items: SortedItem[] = [
                    ...campaignEntries.map(entry => {
                        const dates = [...entry.missions.flatMap(m => m.slots.map(s => new Date(s.op.date).getTime())), ...entry.unstructured.map(o => new Date(o.date).getTime())]
                        return { kind: 'campaign' as const, entry, sortDate: dates.length ? Math.min(...dates) : 0 }
                    }),
                    ...standalone.map(op => ({ kind: 'standalone' as const, op, sortDate: new Date(op.date).getTime() })),
                ]
                items.sort((a, b) => sortDir === 'asc' ? a.sortDate - b.sortDate : b.sortDate - a.sortDate)

                return (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {items.map((item, i) => {
                            // Month dividers only make sense when browsing a whole year (month === null)
                            const prevItem = items[i - 1]
                            const showDivider = month === null && (i === 0 || new Date(item.sortDate).getMonth() !== new Date(prevItem.sortDate).getMonth())
                            const key = item.kind === 'campaign' ? item.entry.campaignId : item.op._id.toString()

                            return (
                                <React.Fragment key={key}>
                                    {showDivider && (
                                        <div style={{
                                            padding: '6px 16px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
                                            color: 'rgba(219,0,29,0.55)', background: 'rgba(219,0,29,0.04)',
                                            borderTop: '1px solid rgba(219,0,29,0.15)', borderBottom: '1px solid rgba(219,0,29,0.15)',
                                        }}>
                                            {new Date(item.sortDate).toLocaleString('default', { month: 'long' })}
                                        </div>
                                    )}
                                    {item.kind === 'campaign'
                                        ? <CampaignEntry entry={item.entry} hasAccess={hasAccess} year={year} month={month} />
                                        : <MissionRow mission={item.op} hasAccess={hasAccess} />}
                                </React.Fragment>
                            )
                        })}
                    </div>
                )
            })()}
        </div>
    )
}

function MissionRow({ mission, hasAccess, campaignName }: { mission: Operation; hasAccess: boolean; campaignName?: string }) {
    const [hovered, setHovered] = useState(false)
    const router = useRouter()
    const id = mission._id.toString()

    return (
        <div
            onClick={() => router.push(`/operations/${id}`)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                borderLeft: `2px solid ${hovered ? 'var(--red)' : 'rgba(219,0,29,0.15)'}`,
                background: hovered ? 'rgba(255,255,255,0.015)' : 'transparent',
                transition: 'border-color 0.2s, background 0.2s',
                cursor: 'pointer',
            }}
        >
                {/* Cover thumbnail */}
                {mission.coverImage && (
                    <div style={{ width: 52, height: 36, overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(255,255,255,0.08)' }}>
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
                        {campaignName && (
                            <span style={{ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(100,150,237,0.6)', border: '1px solid rgba(100,150,237,0.2)', padding: '1px 5px' }}>
                                ⛓ {campaignName}
                            </span>
                        )}
                        <span style={{ fontSize: '0.6rem', letterSpacing: '0.07em', color: 'rgba(237,237,237,0.28)', textTransform: 'uppercase' }}>
                            {new Date(mission.date).toDateString()}
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {hasAccess && (
                        <>
                            <Link href={`/operations/${id}/edit`} title='Edit' style={{ textDecoration: 'none' }}>
                                <div
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        padding: '5px 10px',
                                        background: 'rgba(219,160,0,0.07)',
                                        border: '1px solid rgba(219,160,0,0.3)',
                                        color: 'rgba(219,160,0,0.75)',
                                        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                                        cursor: 'pointer', transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                                    }}
                                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(219,160,0,0.16)'; el.style.color = 'rgba(219,160,0,1)'; el.style.borderColor = 'rgba(219,160,0,0.6)' }}
                                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(219,160,0,0.07)'; el.style.color = 'rgba(219,160,0,0.75)'; el.style.borderColor = 'rgba(219,160,0,0.3)' }}
                                >
                                    <Edit style={{ fontSize: 11 }} /> Edit
                                </div>
                            </Link>
                            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)' }} />
                        </>
                    )}
                    <Link href={`/operations/${mission._id.toString()}/map`} title='View Map' style={{ textDecoration: 'none' }}>
                        <div
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '5px 10px',
                                background: 'rgba(34,197,94,0.07)',
                                border: '1px solid rgba(34,197,94,0.35)',
                                color: 'rgba(34,197,94,0.8)',
                                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                                cursor: 'pointer', transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                            }}
                            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(34,197,94,0.16)'; el.style.color = 'rgba(34,197,94,1)'; el.style.borderColor = 'rgba(34,197,94,0.65)' }}
                            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(34,197,94,0.07)'; el.style.color = 'rgba(34,197,94,0.8)'; el.style.borderColor = 'rgba(34,197,94,0.35)' }}
                        >
                            <Map style={{ fontSize: 11 }} /> Map
                        </div>
                    </Link>
                    <Link href={`/operations/${mission._id.toString()}`} title='View Mission' style={{ textDecoration: 'none' }}>
                        <div
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '5px 10px',
                                background: 'rgba(219,0,29,0.07)',
                                border: '1px solid rgba(219,0,29,0.35)',
                                color: 'rgba(219,0,29,0.8)',
                                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                                cursor: 'pointer', transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                            }}
                            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(219,0,29,0.16)'; el.style.color = 'rgba(219,0,29,1)'; el.style.borderColor = 'rgba(219,0,29,0.65)' }}
                            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(219,0,29,0.07)'; el.style.color = 'rgba(219,0,29,0.8)'; el.style.borderColor = 'rgba(219,0,29,0.35)' }}
                        >
                            View <ArrowForward style={{ fontSize: 11 }} />
                        </div>
                    </Link>
                </div>
        </div>
    )
}

// ── Main board (exported) ──────────────────────────────────────────────────────

function CampaignsBand({ year, month }: { year: number; month: number | null }) {
    const [campaigns, setCampaigns] = useState<OperationCampaign[]>([])

    useEffect(() => {
        fetch('/api/operations/campaigns')
            .then(r => r.json())
            .then(d => {
                const all: OperationCampaign[] = d.campaigns ?? []
                // Filter to campaigns active in the selected period
                const filtered = all.filter(c => {
                    if (!c.startDate && !c.endDate) return false
                    if (month === null) {
                        // Year view: campaign overlaps this year
                        const start = c.startDate ? new Date(c.startDate).getFullYear() : null
                        const end = c.endDate ? new Date(c.endDate).getFullYear() : null
                        if (start !== null && start > year) return false
                        if (end !== null && end < year) return false
                        return true
                    } else {
                        // Month view: campaign overlaps this month
                        const monthStart = new Date(year, month - 1, 1)
                        const monthEnd = new Date(year, month, 0)
                        const cStart = c.startDate ? new Date(c.startDate) : null
                        const cEnd = c.endDate ? new Date(c.endDate) : null
                        if (cStart && cStart > monthEnd) return false
                        if (cEnd && cEnd < monthStart) return false
                        return true
                    }
                })
                setCampaigns(filtered)
            })
    }, [year, month])

    if (campaigns.length === 0) return null

    const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

    return (
        <div style={{ marginBottom: 8, border: '1px solid rgba(100,150,237,0.15)', borderTop: '2px solid rgba(100,150,237,0.4)', background: 'rgba(100,150,237,0.03)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(100,150,237,0.55)', marginBottom: 2 }}>Active Campaigns</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {campaigns.map(c => (
                    <div key={c._id.toString()} style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(100,150,237,0.85)', letterSpacing: '0.04em' }}>{c.name}</span>
                        {(c.startDate || c.endDate) && (
                            <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', letterSpacing: '0.04em' }}>
                                {c.startDate ? fmtDate(c.startDate) : '?'} → {c.endDate ? fmtDate(c.endDate) : 'ongoing'}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

export function OperationsBoard({ editAccess }: { editAccess: boolean }) {
    const now = new Date()
    const [selected, setSelected] = useState<{ year: number; month: number | null }>({ year: now.getFullYear(), month: null })

    return (
        <div className='grid grid-cols-1 md:grid-cols-[420px_1fr_240px] gap-4 items-stretch'>
                {/* Col 1 on desktop / top on mobile */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <ActiveMissionsPanel hasAccess={editAccess} />
                </div>

                {/* Col 2 on desktop / bottom on mobile (order-3) */}
                <div className='order-3 md:order-2' style={{ display: 'flex', flexDirection: 'column' }}>
                    <MonthlyMissionsPanel year={selected.year} month={selected.month} hasAccess={editAccess} />
                </div>

                {/* Col 3 on desktop / middle on mobile (order-2) so user picks month before seeing list */}
                <div className='order-2 md:order-3' style={{ display: 'flex', flexDirection: 'column' }}>
                    <CalendarPicker selected={selected} onChange={setSelected} />
                </div>
            </div>
    )
}
