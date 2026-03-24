'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/confirm-dialog'
import { useState, useEffect } from 'react'
import { Edit, ContentCopy, Delete, ArrowForward, Add, ChevronLeft, ChevronRight, Search } from '@mui/icons-material'
import { useRef } from 'react'


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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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

export function CreateButton() {
    const [active, setActive] = useState(false)
    const router = useRouter()

    function createMission() {
        setActive(true)
        fetch('/api/operations/new')
            .then(res => res.json())
            .then(json => {
                if (json.error) { alert(json.error); setActive(false); return }
                router.push(`/operations/edit?op=${json.id}`)
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
                    /* eslint-disable-next-line @next/next/no-img-element */
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

function MonthlyMissionsPanel({
    year, month, hasAccess,
}: {
    year: number; month: number; hasAccess: boolean
}) {
    const [missions, setMissions] = useState<Operation[]>([])
    const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })

    function load() {
        fetch(`/api/operations?month=${month}&year=${year}`)
            .then(r => r.json())
            .then(json => { if (json.missions) setMissions(json.missions) })
    }

    useEffect(() => {
        setMissions([])
        load()
    }, [year, month])

    return (
        <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.01)', flex: 1 }}>
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
                        <MissionRow key={m._id.toString()} mission={m} hasAccess={hasAccess} onDeleted={id => setMissions(prev => prev.filter(x => x._id.toString() !== id))} onDuplicated={load} />
                    ))}
                </div>
            )}
        </div>
    )
}

function MissionRow({ mission, hasAccess, onDeleted, onDuplicated }: { mission: Operation; hasAccess: boolean; onDeleted?: (id: string) => void; onDuplicated?: () => void }) {
    const [hovered, setHovered] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const router = useRouter()
    const id = mission._id.toString()

    function handleDelete() {
        const id = mission._id.toString()
        fetch(`/api/operations/delete?id=${id}`)
            .then(r => r.json())
            .then(j => { if (j.error) alert(j.error); else onDeleted?.(id) })
        setConfirmDelete(false)
    }

    return (
        <>
            <ConfirmDialog
                open={confirmDelete}
                title='Delete Mission'
                message={`"${mission.title}" will be permanently deleted. This cannot be undone.`}
                confirmLabel='Delete'
                danger
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete(false)}
            />
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
                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {hasAccess && (
                        <>
                            <button
                                title='Delete'
                                onClick={() => setConfirmDelete(true)}
                                style={{ all: 'unset', cursor: 'pointer' }}
                            >
                                <div
                                    style={{
                                        display: 'flex', alignItems: 'center', lineHeight: 0,
                                        padding: '5px 8px',
                                        background: 'rgba(180,20,20,0.07)',
                                        border: '1px solid rgba(180,20,20,0.35)',
                                        color: 'rgba(220,60,60,0.75)',
                                        cursor: 'pointer', transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                                    }}
                                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(180,20,20,0.18)'; el.style.color = 'rgba(240,80,80,1)'; el.style.borderColor = 'rgba(180,20,20,0.65)' }}
                                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(180,20,20,0.07)'; el.style.color = 'rgba(220,60,60,0.75)'; el.style.borderColor = 'rgba(180,20,20,0.35)' }}
                                >
                                    <Delete style={{ fontSize: 13 }} />
                                </div>
                            </button>
                            <button
                                title='Duplicate'
                                onClick={() => fetch(`/api/operations/duplicate?id=${mission._id}`).then(r => r.json()).then(j => { if (j.error) alert(j.error); else onDuplicated?.() })}
                                style={{ all: 'unset', cursor: 'pointer' }}
                            >
                                <div
                                    style={{
                                        display: 'flex', alignItems: 'center', lineHeight: 0,
                                        padding: '5px 8px',
                                        background: 'rgba(219,160,0,0.07)',
                                        border: '1px solid rgba(219,160,0,0.3)',
                                        color: 'rgba(219,160,0,0.75)',
                                        cursor: 'pointer', transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                                    }}
                                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(219,160,0,0.16)'; el.style.color = 'rgba(219,160,0,1)'; el.style.borderColor = 'rgba(219,160,0,0.6)' }}
                                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(219,160,0,0.07)'; el.style.color = 'rgba(219,160,0,0.75)'; el.style.borderColor = 'rgba(219,160,0,0.3)' }}
                                >
                                    <ContentCopy style={{ fontSize: 13 }} />
                                </div>
                            </button>
                            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)' }} />
                            <Link href={`/operations/edit?op=${mission._id.toString()}`} title='Edit' style={{ textDecoration: 'none' }}>
                                <div
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        padding: '5px 10px',
                                        background: 'rgba(100,150,237,0.07)',
                                        border: '1px solid rgba(100,150,237,0.3)',
                                        color: 'rgba(100,150,237,0.75)',
                                        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                                        cursor: 'pointer', transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                                    }}
                                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(100,150,237,0.16)'; el.style.color = 'rgba(100,150,237,1)'; el.style.borderColor = 'rgba(100,150,237,0.6)' }}
                                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(100,150,237,0.07)'; el.style.color = 'rgba(100,150,237,0.75)'; el.style.borderColor = 'rgba(100,150,237,0.3)' }}
                                >
                                    <Edit style={{ fontSize: 11 }} /> Edit
                                </div>
                            </Link>
                            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)' }} />
                        </>
                    )}
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
        </>
    )
}


// ── Main board (exported) ──────────────────────────────────────────────────────

export function OperationsBoard({ editAccess }: { editAccess: boolean }) {
    const now = new Date()
    const [selected, setSelected] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })

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
