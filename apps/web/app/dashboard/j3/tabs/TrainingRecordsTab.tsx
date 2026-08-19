'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Assignment, Lock, KeyboardArrowDown, KeyboardArrowUp, Close } from '@mui/icons-material'
import { CircularProgress } from '@mui/material'

const RED = '#db001d'

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS: string[] = ['all']
for (let y = CURRENT_YEAR + 1; y >= 2020; y--) YEAR_OPTIONS.push(String(y))

const INSTANCE_STATUS_LABELS: Record<string, string> = {
    planning:    'Planning',
    active:      'Active',
    in_progress: 'In Progress',
    completed:   'Completed',
    cancelled:   'Cancelled',
    archived:    'Archived',
}

const INSTANCE_STATUS_COLORS: Record<string, string> = {
    planning:    'color-mix(in srgb, var(--info) 70%, transparent)',
    active:      'rgba(100,200,160,0.75)',
    in_progress: 'color-mix(in srgb, var(--amber) 70%, transparent)',
    completed:   'color-mix(in srgb, var(--live) 85%, transparent)',
    cancelled:   'color-mix(in srgb, var(--red) 85%, transparent)',
    archived:    'rgba(150,150,150,0.7)',
}

const ALL_STATUSES = Object.keys(INSTANCE_STATUS_LABELS)

function formatDate(val: string | Date | null | undefined): string {
    if (!val) return '—'
    return new Date(val).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
    const color = INSTANCE_STATUS_COLORS[status] ?? 'rgba(150,150,150,0.5)'
    return (
        <span style={{
            fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color,
            border: `1px solid ${color.replace(/[\d.]+\)$/, '0.35)')}`,
            padding: '1px 6px',
            whiteSpace: 'nowrap',
        }}>
            {INSTANCE_STATUS_LABELS[status] ?? status}
        </span>
    )
}

interface Col { key: string; label: string; width: string }

const COLUMNS: Col[] = [
    { key: 'instanceRef',        label: 'Course',        width: '140px' },
    { key: 'leadInstructorName', label: 'Lead Trainer',  width: '1fr'   },
    { key: 'startDate',          label: 'Start Date',    width: '110px' },
    { key: 'endDate',            label: 'End Date',      width: '110px' },
    { key: 'status',             label: 'Status',        width: '120px' },
    { key: 'candidateCount',     label: 'Trainees',      width: '80px'  },
    { key: 'staffCount',         label: 'Staff',         width: '72px'  },
    { key: 'passedCount',        label: 'Passed',        width: '72px'  },
    { key: 'failedCount',        label: 'Failed',        width: '72px'  },
    { key: 'updatedAt',          label: 'Last Updated',  width: '110px' },
]

const GRID = COLUMNS.map(c => c.width).join(' ')

const selectSx: React.CSSProperties = {
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: '0.58rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'rgba(237,237,237,0.7)',
    background: 'rgba(0,0,0,0.45)',
    border: '1px solid var(--line-2)',
    outline: 'none',
    textTransform: 'uppercase' as const,
}

interface Props {
    userId: string
    canManageMembers: boolean
}

export default function TrainingRecordsTab({ userId: _userId, canManageMembers: _canManageMembers }: Props) {
    const router = useRouter()

    const [year, setYear]               = useState<string>(String(CURRENT_YEAR))
    const [typeName, setTypeName]       = useState<string>('')
    const [statusFilter, setStatusFilter] = useState<string[]>([])
    const [q, setQ]                     = useState('')
    const [sort, setSort]               = useState('startDate')
    const [order, setOrder]             = useState<'asc' | 'desc'>('desc')

    const [records, setRecords]         = useState<CourseInstance[]>([])
    const [loading, setLoading]         = useState(true)
    const [statusOpen, setStatusOpen]   = useState(false)
    const statusRef                     = useRef<HTMLDivElement>(null)

    // Accumulate all seen type names so the dropdown never shrinks when a filter is active
    const knownTypesRef = useRef<Set<string>>(new Set())
    const [typeOptions, setTypeOptions] = useState<string[]>([])

    const [debouncedQ, setDebouncedQ] = useState('')
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQ(q), 300)
        return () => clearTimeout(t)
    }, [q])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            params.set('year', year)
            if (typeName) params.set('type', typeName)
            if (statusFilter.length) params.set('status', statusFilter.join(','))
            if (debouncedQ) params.set('q', debouncedQ)
            params.set('sort', sort)
            params.set('order', order)
            const res = await fetch(`/api/j3/training-records?${params.toString()}`)
            const data = await res.json()
            const fetched: CourseInstance[] = data.records ?? []
            setRecords(fetched)
            // Accumulate type names for the dropdown
            fetched.forEach(r => { if (r.trainingTypeName) knownTypesRef.current.add(r.trainingTypeName) })
            setTypeOptions(Array.from(knownTypesRef.current).sort())
        } finally {
            setLoading(false)
        }
    }, [year, typeName, statusFilter, debouncedQ, sort, order])

    useEffect(() => { load() }, [load])

    // Close status popover on outside click
    useEffect(() => {
        if (!statusOpen) return
        const handler = (e: MouseEvent) => {
            if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [statusOpen])

    function handleSort(key: string) {
        if (sort === key) setOrder(o => o === 'asc' ? 'desc' : 'asc')
        else { setSort(key); setOrder('desc') }
    }

    function clearAll() {
        setYear(String(CURRENT_YEAR))
        setTypeName('')
        setStatusFilter([])
        setQ('')
    }

    const hasFilters = year !== String(CURRENT_YEAR) || typeName !== '' || statusFilter.length > 0 || q !== ''

    function SortArrow({ col }: { col: string }) {
        if (sort !== col) return null
        return order === 'asc'
            ? <KeyboardArrowUp sx={{ fontSize: 11, ml: '2px', verticalAlign: 'middle' }} />
            : <KeyboardArrowDown sx={{ fontSize: 11, ml: '2px', verticalAlign: 'middle' }} />
    }

    const btnBase: React.CSSProperties = {
        all: 'unset', cursor: 'pointer', padding: '3px 10px',
        fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
        border: '1px solid var(--line-2)',
    }

    return (
        <div className='m-6 mt-4'>
            {/* Toolbar */}
            <div style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                padding: '8px 12px',
                border: '1px solid var(--line-2)',
                borderBottom: 'none',
                background: 'rgba(255,255,255,0.02)',
            }}>
                {/* Year dropdown */}
                <select
                    value={year}
                    onChange={e => setYear(e.target.value)}
                    style={selectSx}
                >
                    {YEAR_OPTIONS.map(y => (
                        <option key={y} value={y} style={{ background: '#0d0d0d' }}>
                            {y === 'all' ? 'All Years' : y}
                        </option>
                    ))}
                </select>

                <div style={{ width: 1, height: 20, background: 'rgba(219,0,29,0.2)' }} />

                {/* Type dropdown */}
                <select
                    value={typeName}
                    onChange={e => setTypeName(e.target.value)}
                    style={selectSx}
                >
                    <option value='' style={{ background: '#0d0d0d' }}>All Types</option>
                    {typeOptions.map(t => (
                        <option key={t} value={t} style={{ background: '#0d0d0d' }}>{t}</option>
                    ))}
                </select>

                <div style={{ width: 1, height: 20, background: 'rgba(219,0,29,0.2)' }} />

                {/* Status multi-select */}
                <div style={{ position: 'relative' }} ref={statusRef}>
                    <button
                        style={{
                            ...btnBase,
                            color: statusFilter.length ? '#fff' : 'rgba(237,237,237,0.4)',
                            background: statusFilter.length ? 'rgba(219,0,29,0.2)' : 'transparent',
                            display: 'flex', alignItems: 'center', gap: 4,
                        }}
                        onClick={() => setStatusOpen(o => !o)}
                    >
                        {statusFilter.length === 0 ? 'All Statuses' : `${statusFilter.length} Selected`}
                        <KeyboardArrowDown sx={{ fontSize: 12 }} />
                    </button>
                    {statusOpen && (
                        <div style={{
                            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
                            background: '#1a0a0a', border: '1px solid var(--line-2)',
                            padding: '6px 0', minWidth: 140,
                        }}>
                            <div style={{ display: 'flex', gap: 6, padding: '4px 12px 6px', borderBottom: '1px solid var(--line-2)' }}>
                                <button
                                    onClick={() => setStatusFilter([...ALL_STATUSES])}
                                    style={{ all: 'unset', cursor: 'pointer', fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)' }}
                                >
                                    All
                                </button>
                                <span style={{ color: 'rgba(219,0,29,0.25)', fontSize: '0.5rem' }}>·</span>
                                <button
                                    onClick={() => setStatusFilter([])}
                                    style={{ all: 'unset', cursor: 'pointer', fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)' }}
                                >
                                    None
                                </button>
                            </div>
                            {ALL_STATUSES.map(s => (
                                <label key={s} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px',
                                    cursor: 'pointer', color: 'rgba(237,237,237,0.75)', fontSize: '0.62rem',
                                    fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                                }}>
                                    <input
                                        type='checkbox'
                                        checked={statusFilter.includes(s)}
                                        onChange={e => setStatusFilter(prev =>
                                            e.target.checked ? [...prev, s] : prev.filter(x => x !== s)
                                        )}
                                        style={{ accentColor: RED }}
                                    />
                                    {INSTANCE_STATUS_LABELS[s]}
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* Search */}
                <div style={{ marginLeft: 'auto' }}>
                    <input
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder='Search...'
                        style={{
                            all: 'unset', padding: '3px 10px',
                            fontSize: '0.62rem', color: 'rgba(237,237,237,0.75)',
                            background: 'rgba(0,0,0,0.35)', border: '1px solid var(--line-2)',
                            width: 160,
                        }}
                    />
                </div>
            </div>

            {/* Active filter badges */}
            {hasFilters && (
                <div style={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
                    padding: '5px 12px',
                    border: '1px solid var(--line-2)',
                    borderBottom: 'none',
                    background: 'rgba(0,0,0,0.15)',
                }}>
                    {year !== String(CURRENT_YEAR) && (
                        <FilterBadge label={`Year: ${year === 'all' ? 'All' : year}`} onRemove={() => setYear(String(CURRENT_YEAR))} />
                    )}
                    {typeName !== '' && (
                        <FilterBadge label={`Type: ${typeName}`} onRemove={() => setTypeName('')} />
                    )}
                    {statusFilter.map(s => (
                        <FilterBadge key={s} label={`Status: ${INSTANCE_STATUS_LABELS[s]}`} onRemove={() => setStatusFilter(prev => prev.filter(x => x !== s))} />
                    ))}
                    {q !== '' && (
                        <FilterBadge label={`Search: "${q}"`} onRemove={() => setQ('')} />
                    )}
                    <button onClick={clearAll} style={{ ...btnBase, color: 'rgba(219,0,29,0.6)', fontSize: '0.55rem', padding: '2px 8px' }}>
                        Clear All
                    </button>
                    <span style={{ marginLeft: 'auto', fontSize: '0.55rem', color: 'rgba(219,0,29,0.4)', fontFamily: 'monospace', letterSpacing: '0.12em' }}>
                        {records.length} record{records.length !== 1 ? 's' : ''}
                    </span>
                </div>
            )}

            {/* Table */}
            <div style={{ border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.01)', minHeight: 200 }}>
                {/* Column headers */}
                <div style={{
                    display: 'grid', gridTemplateColumns: GRID, gap: 8,
                    padding: '6px 12px',
                    borderBottom: '1px solid var(--line-2)',
                    background: 'rgba(0,0,0,0.35)',
                }}>
                    {COLUMNS.map(col => (
                        <button
                            key={col.key}
                            onClick={() => handleSort(col.key)}
                            style={{
                                all: 'unset', cursor: 'pointer',
                                fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.18em',
                                textTransform: 'uppercase',
                                color: sort === col.key ? RED : 'rgba(219,0,29,0.5)',
                                fontFamily: 'monospace',
                                display: 'flex', alignItems: 'center',
                            }}
                        >
                            {col.label}<SortArrow col={col.key} />
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                        <CircularProgress size={20} style={{ color: 'rgba(219,0,29,0.5)' }} />
                    </div>
                ) : records.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 40, opacity: 0.35 }}>
                        <Assignment sx={{ fontSize: 28, color: 'rgba(237,237,237,0.3)' }} />
                        <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)' }}>No training records found</span>
                        {hasFilters && <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.25)' }}>Try clearing filters</span>}
                    </div>
                ) : (
                    records.map((rec, i) => (
                        <div
                            key={String(rec._id)}
                            onClick={() => router.push(`/dashboard/j3/training-records/${String(rec._id)}`)}
                            style={{
                                display: 'grid', gridTemplateColumns: GRID, gap: 8,
                                padding: '7px 12px',
                                borderBottom: '1px solid var(--line-2)',
                                background: i % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.15)',
                                cursor: 'pointer', alignItems: 'center', transition: 'background 0.1s',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(219,0,29,0.06)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = i % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.15)' }}
                        >
                            {/* Course — instanceRef + type name stacked */}
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)', fontFamily: 'monospace' }}>
                                    {rec.instanceRef}
                                </div>
                                <div style={{ fontSize: '0.52rem', color: 'rgba(219,0,29,0.5)', fontWeight: 600, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {rec.trainingTypeName}
                                </div>
                            </div>
                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {rec.leadInstructorName ?? '—'}
                            </span>
                            <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.4)', fontFamily: 'monospace' }}>
                                {formatDate(rec.startDate as unknown as string)}
                            </span>
                            <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.4)', fontFamily: 'monospace' }}>
                                {formatDate(rec.endDate as unknown as string)}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <StatusBadge status={rec.status} />
                                {rec.isLocked && <Lock sx={{ fontSize: 10, color: 'rgba(219,0,29,0.5)' }} />}
                            </div>
                            <Num val={rec.candidateCount} />
                            <Num val={rec.staffCount} />
                            <Num val={rec.passedCount} />
                            <Num val={rec.failedCount} />
                            <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.35)', fontFamily: 'monospace' }}>
                                {formatDate(rec.updatedAt as unknown as string)}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

function Num({ val }: { val: number | undefined }) {
    return (
        <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.55)', fontFamily: 'monospace' }}>
            {val !== undefined ? val : '—'}
        </span>
    )
}

function FilterBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'rgba(219,0,29,0.7)', background: 'rgba(219,0,29,0.1)',
            border: '1px solid rgba(219,0,29,0.25)', padding: '2px 7px',
        }}>
            {label}
            <button onClick={onRemove} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                <Close sx={{ fontSize: 10 }} />
            </button>
        </span>
    )
}
