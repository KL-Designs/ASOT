'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { BilletRow } from '@/lib/billetMastersheet'

// ── Cert metadata ─────────────────────────────────────────────────────────────

const CERT_ABBR: Record<string, string> = {
    'BCT 1':                                'BCT1',
    'BCT 2':                                'BCT2',
    'Basic Medical Course':                 'MED',
    'Advanced Medical Course':              'ADV MED',
    'Basic CQB Course':                     'CQB',
    'Basic Indirect Fires Course':          'IDF',
    'Direct Fires Support Weapons Course':  'DFSW',
    'Basic Rotary Wing Course':             'BRW',
    'Basic Rotary Wing Assessment (Wings)': 'RW WINGS',
    'Advanced Rotary Wing Course':          'ARW',
    'Basic CAS and RECON Course':           'CAS',
    'Advanced CAS Course':                  'ADV CAS',
    'Radio Telecommunications Operator Course': 'RTO',
    'Forward Observer Course':              'FO',
    'Basic Staff (NCO) Course':             'NCO',
    'Static Line Paratrooper Course':       'SLP',
    'Driver Basics Course':                 'DRV',
    'Driver Formations and Tactics Course': 'DRV F&T',
    'VCP':                                  'VCP',
    'Rifleman Proficiency':                 'RIFLE',
    'Machine Gunner Proficiency':           'MG',
    'AT Gunner Proficiency':                'AT',
    'Grenadier Proficiency':                'GLA',
    'Pistol Sharpshooter Proficiency':      'PISTOL',
}

const J3_CERTS = [
    'BCT 1', 'BCT 2',
    'Basic Medical Course', 'Advanced Medical Course',
    'Basic CQB Course',
    'Basic Indirect Fires Course', 'Direct Fires Support Weapons Course',
    'Basic Rotary Wing Course', 'Basic Rotary Wing Assessment (Wings)', 'Advanced Rotary Wing Course',
    'Basic CAS and RECON Course', 'Advanced CAS Course',
    'Radio Telecommunications Operator Course', 'Forward Observer Course',
    'Basic Staff (NCO) Course', 'Static Line Paratrooper Course',
    'Driver Basics Course', 'Driver Formations and Tactics Course',
    'VCP',
    'Rifleman Proficiency', 'Machine Gunner Proficiency', 'AT Gunner Proficiency',
    'Grenadier Proficiency', 'Pistol Sharpshooter Proficiency',
]

// ── Sync-scroll dual scrollbar wrapper ───────────────────────────────────────

function SyncScrollTable({ children }: { children: React.ReactNode }) {
    const topRef = useRef<HTMLDivElement>(null)
    const botRef = useRef<HTMLDivElement>(null)
    const mirrorRef = useRef<HTMLDivElement>(null)
    const syncing = useRef(false)

    useEffect(() => {
        function syncWidth() {
            if (botRef.current && mirrorRef.current) {
                mirrorRef.current.style.width = `${botRef.current.scrollWidth}px`
            }
        }
        syncWidth()
        const obs = new ResizeObserver(syncWidth)
        if (botRef.current) obs.observe(botRef.current)
        if (botRef.current?.firstElementChild) obs.observe(botRef.current.firstElementChild)
        return () => obs.disconnect()
    }, [])

    function onTop() {
        if (syncing.current || !botRef.current || !topRef.current) return
        syncing.current = true
        botRef.current.scrollLeft = topRef.current.scrollLeft
        syncing.current = false
    }
    function onBot() {
        if (syncing.current || !topRef.current || !botRef.current) return
        syncing.current = true
        topRef.current.scrollLeft = botRef.current.scrollLeft
        syncing.current = false
    }
    function onWheel(e: React.WheelEvent) {
        if (!e.shiftKey) return
        e.preventDefault()
        if (botRef.current) botRef.current.scrollLeft += e.deltaY
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div ref={topRef} onScroll={onTop} style={{ overflowX: 'scroll', overflowY: 'hidden', height: 14, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div ref={mirrorRef} style={{ height: 1, minWidth: '100%' }} />
            </div>
            <div ref={botRef} onScroll={onBot} onWheel={onWheel} style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'auto' }}>
                {children}
            </div>
        </div>
    )
}

// ── Cell helpers ──────────────────────────────────────────────────────────────

function Tick({ has }: { has: boolean }) {
    return (
        <span style={{ display: 'block', textAlign: 'center', fontSize: '0.68rem', color: has ? 'rgb(0,195,100)' : 'rgba(255,255,255,0.1)', fontWeight: has ? 700 : 400 }}>
            {has ? '✓' : '—'}
        </span>
    )
}

function Num({ v }: { v: number }) {
    return (
        <span style={{ display: 'block', textAlign: 'center', fontSize: '0.72rem', color: v > 0 ? 'rgba(237,237,237,0.85)' : 'rgba(255,255,255,0.12)', fontWeight: v > 0 ? 700 : 400 }}>
            {v > 0 ? v : '—'}
        </span>
    )
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey = 'name' | 'rank' | 'j3Bct12' | 'j3OtherTrainings'

function sortRows(rows: BilletRow[], key: SortKey, dir: 'asc' | 'desc'): BilletRow[] {
    const mul = dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
        const av = a[key] as any
        const bv = b[key] as any
        if (av == null && bv == null) return 0
        if (av == null) return mul
        if (bv == null) return -mul
        if (typeof av === 'number' && typeof bv === 'number') return mul * (av - bv)
        return mul * String(av).localeCompare(String(bv), 'en', { sensitivity: 'base' })
    })
}

// ── Main component ────────────────────────────────────────────────────────────

export default function J3MasterSheetTab() {
    const [rows, setRows] = useState<BilletRow[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState('')
    const [membership, setMembership] = useState<'active' | 'discharged' | 'all'>('active')
    const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

    const load = useCallback((s: string, mem = membership) => {
        setLoading(true)
        fetch(`/api/admin/j4/mastersheet/billet?search=${encodeURIComponent(s)}&membership=${mem}`)
            .then(r => r.json())
            .then(d => {
                setRows(d.rows ?? [])
                setTotal(d.total ?? 0)
            })
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [membership])

    useEffect(() => { load('') }, [load])

    function handleSearch(v: string) {
        setSearch(v)
        if (debounce.current) clearTimeout(debounce.current)
        debounce.current = setTimeout(() => load(v), 300)
    }

    function handleMembership(m: 'active' | 'discharged' | 'all') {
        setMembership(m)
        load(search, m)
    }

    function handleSort(key: SortKey) {
        setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
    }

    const displayRows = sortRows(rows, sort.key, sort.dir)

    // ── Shared styles ─────────────────────────────────────────────────────────

    const hdrBase: React.CSSProperties = {
        padding: '5px 6px', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', background: 'rgba(0,0,0,0.55)',
        borderBottom: '1px solid var(--line-2)', whiteSpace: 'nowrap', textAlign: 'center',
    }

    const grpHdr = (color: string): React.CSSProperties => ({
        padding: '4px 6px', fontSize: '0.46rem', fontWeight: 700, letterSpacing: '0.18em',
        textTransform: 'uppercase', color, background: 'rgba(0,0,0,0.65)',
        borderBottom: `1px solid ${color}`, whiteSpace: 'nowrap', textAlign: 'center',
    })

    const stickyNameHdr: React.CSSProperties = {
        ...hdrBase, position: 'sticky', left: 0, zIndex: 4,
        background: 'rgba(8,8,8,0.98)', textAlign: 'left', minWidth: 175,
        borderRight: '1px solid var(--line-2)',
    }

    const cellBase: React.CSSProperties = {
        padding: '6px 6px', fontSize: '0.7rem', color: 'rgba(237,237,237,0.7)',
        borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
    }

    const stickyNameCell: React.CSSProperties = {
        ...cellBase, position: 'sticky', left: 0, zIndex: 1, background: '#0c0c0c',
        fontWeight: 600, color: 'rgba(237,237,237,0.9)', minWidth: 175,
        borderRight: '1px solid rgba(255,255,255,0.05)',
    }

    const numHdr: React.CSSProperties = { ...hdrBase, minWidth: 42 }

    const sortHdrStyle = (key: SortKey, extra?: React.CSSProperties): React.CSSProperties => ({
        ...numHdr, ...extra, cursor: 'pointer', userSelect: 'none',
        color: sort.key === key ? '#ededed' : (extra?.color ?? 'rgba(237,237,237,0.35)'),
    })

    const rotatedHdr: React.CSSProperties = {
        ...hdrBase, minWidth: 38, maxWidth: 46, writingMode: 'vertical-rl',
        transform: 'rotate(180deg)', height: 60, verticalAlign: 'bottom',
        paddingBottom: 4, fontSize: '0.46rem',
    }

    const TOTAL_COLS = 1 + 1 + 2 + J3_CERTS.length

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, padding: 'clamp(0.75rem, 2vw, 1.5rem)' }}>

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                <input
                    type='text' value={search} onChange={e => handleSearch(e.target.value)}
                    placeholder='Search member…'
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line-2)', color: '#ededed', fontSize: '0.72rem', padding: '5px 10px', outline: 'none', width: 180 }}
                />

                {(['active', 'discharged', 'all'] as const).map(m => (
                    <button key={m} onClick={() => handleMembership(m)} style={{
                        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                        padding: '4px 10px', cursor: 'pointer',
                        background: membership === m ? 'rgba(219,0,29,0.2)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${membership === m ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        color: membership === m ? '#ededed' : 'rgba(237,237,237,0.4)',
                    }}>
                        {m === 'all' ? 'All' : m === 'active' ? 'Active' : 'Discharged'}
                    </button>
                ))}

                <div style={{ marginLeft: 'auto', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>
                    {loading ? 'Loading…' : `${total} member${total !== 1 ? 's' : ''}`}
                </div>
            </div>

            {/* Table with dual scrollbars */}
            <SyncScrollTable>
                <div style={{ border: '1px solid var(--line-2)' }}>
                    <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                            {/* Group header row */}
                            <tr>
                                <th rowSpan={2} style={stickyNameHdr}>Name</th>
                                <th rowSpan={2} style={{ ...numHdr, minWidth: 68, textAlign: 'left', paddingLeft: 6 }}>Rank</th>
                                <th colSpan={2} style={grpHdr('rgba(0,195,100,0.55)')}>J3 Points</th>
                                <th colSpan={J3_CERTS.length} style={grpHdr('rgba(96,165,250,0.55)')}>Certifications</th>
                            </tr>

                            {/* Per-column header row */}
                            <tr>
                                {/* J3 Points */}
                                <th onClick={() => handleSort('j3Bct12')} style={sortHdrStyle('j3Bct12', { color: 'rgba(0,195,100,0.7)', minWidth: 54 })}>
                                    J3 BCT{sort.key === 'j3Bct12' ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                                </th>
                                <th onClick={() => handleSort('j3OtherTrainings')} style={sortHdrStyle('j3OtherTrainings', { color: 'rgba(0,195,100,0.7)', minWidth: 54 })}>
                                    J3 Other{sort.key === 'j3OtherTrainings' ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                                </th>

                                {/* Cert columns */}
                                {J3_CERTS.map(c => (
                                    <th key={c} style={rotatedHdr} title={c}>
                                        {CERT_ABBR[c] ?? c}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {displayRows.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={TOTAL_COLS} style={{ ...cellBase, textAlign: 'center', color: 'rgba(237,237,237,0.2)', padding: '32px 12px' }}>
                                        No members found.
                                    </td>
                                </tr>
                            )}
                            {loading && rows.length === 0 && (
                                <tr>
                                    <td colSpan={TOTAL_COLS} style={{ ...cellBase, textAlign: 'center', color: 'rgba(237,237,237,0.2)', padding: '32px 12px' }}>
                                        Loading…
                                    </td>
                                </tr>
                            )}

                            {displayRows.map((r, i) => {
                                const stripe = i % 2 === 1
                                const bg = stripe ? 'rgba(255,255,255,0.018)' : 'transparent'
                                const nameBg = stripe ? '#0e0e0e' : '#0c0c0c'
                                const certSet = new Set(r.certifications ?? [])

                                return (
                                    <tr key={r.id}>
                                        {/* Name */}
                                        <td style={{ ...stickyNameCell, background: nameBg }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                                                {r.name}
                                            </span>
                                        </td>

                                        {/* Rank */}
                                        <td style={{ ...cellBase, background: bg, minWidth: 68, fontSize: '0.68rem', fontWeight: 600 }}>
                                            {r.rank || '—'}
                                        </td>

                                        {/* J3 BCT Points */}
                                        <td style={{ ...cellBase, background: bg }}>
                                            <Num v={r.j3Bct12 ?? 0} />
                                        </td>

                                        {/* J3 Other Training Points */}
                                        <td style={{ ...cellBase, background: bg }}>
                                            <Num v={r.j3OtherTrainings ?? 0} />
                                        </td>

                                        {/* Cert ticks */}
                                        {J3_CERTS.map(c => (
                                            <td key={c} style={{ ...cellBase, background: bg, textAlign: 'center', minWidth: 38 }}>
                                                <Tick has={certSet.has(c)} />
                                            </td>
                                        ))}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </SyncScrollTable>
        </div>
    )
}
