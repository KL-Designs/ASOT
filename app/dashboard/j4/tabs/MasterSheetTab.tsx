'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MastersheetContext, useMastersheetCtx } from './mastersheet-context'
import type { MastersheetSubTab, PendingChange, MastersheetContextValue } from './mastersheet-context'
import BilletMastersheetTab from './BilletMastersheetTab'

// ── Shared styles ──────────────────────────────────────────────────────────────

const RED = 'var(--red)'

const labelSx: React.CSSProperties = {
    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em',
    textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)',
}

const cellSx: React.CSSProperties = {
    padding: '8px 12px', fontSize: '0.72rem', color: 'rgba(237,237,237,0.75)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240,
}

const hdrSx: React.CSSProperties = {
    padding: '7px 12px', fontSize: '0.58rem', fontWeight: 700,
    letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)',
    background: 'rgba(0,0,0,0.45)', borderBottom: '1px solid rgba(219,0,29,0.2)',
    whiteSpace: 'nowrap',
}

const stickyNameHdr: React.CSSProperties = {
    ...hdrSx, position: 'sticky', left: 0, zIndex: 2, background: 'rgba(8,8,8,0.97)',
}

const stickyNameCell: React.CSSProperties = {
    ...cellSx, position: 'sticky', left: 0, zIndex: 1, background: '#0d0d0d',
    fontWeight: 600, color: 'rgba(237,237,237,0.9)', maxWidth: 160,
}

const inputEditSx: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(219,0,29,0.4)',
    color: '#ededed', fontSize: '0.72rem', padding: '3px 6px',
    width: '100%', outline: 'none', boxSizing: 'border-box',
}

const selectEditSx: React.CSSProperties = { ...inputEditSx, cursor: 'pointer' }

// ── Shared UI ──────────────────────────────────────────────────────────────────

function ReturnBadge({ value }: { value: string }) {
    const v = value?.trim().toUpperCase()
    let bg = 'rgba(255,255,255,0.06)', color = 'rgba(237,237,237,0.4)'
    if (v === 'YES')         { bg = 'rgba(0,195,100,0.12)';   color = 'rgb(0,195,100)' }
    else if (v === 'REVIEW') { bg = 'rgba(245,158,11,0.12)';  color = '#f59e0b' }
    else if (v === 'NO')     { bg = 'rgba(219,0,29,0.12)';    color = 'var(--red)' }
    else if (v === 'INDEFINITE') { bg = 'rgba(139,92,246,0.12)'; color = '#a78bfa' }
    return (
        <span style={{ display: 'inline-block', fontSize: '0.58rem', fontWeight: 700, letterSpacing: 1, padding: '2px 7px', background: bg, color }}>
            {value || '—'}
        </span>
    )
}

function TypeBadge({ value }: { value: string }) {
    const v = value?.trim().toUpperCase()
    let color = 'rgba(237,237,237,0.4)'
    if (v === 'GD') color = 'rgb(0,195,100)'
    else if (v === 'HD') color = '#60a5fa'
    else if (v === 'DD') color = 'var(--red)'
    return <span style={{ fontSize: '0.65rem', fontWeight: 700, color }}>{v || '—'}</span>
}

function DisciplineLevelBadge({ value }: { value: string }) {
    const v = value?.trim()
    let bg = 'rgba(255,255,255,0.06)', color = 'rgba(237,237,237,0.45)'
    if (v === 'Verbal Warning')       { bg = 'rgba(245,158,11,0.08)';  color = '#f59e0b' }
    if (v === 'Formal Warning')       { bg = 'rgba(251,146,60,0.1)';   color = '#fb923c' }
    if (v === 'First Strike')         { bg = 'rgba(219,0,29,0.1)';     color = '#f87171' }
    if (v === 'Second Strike')        { bg = 'rgba(219,0,29,0.18)';    color = '#ef4444' }
    if (v === 'Removal from Section') { bg = 'rgba(139,92,246,0.1)';   color = '#a78bfa' }
    if (v === 'Removal from Unit')    { bg = 'rgba(219,0,29,0.25)';    color = 'var(--red)' }
    return (
        <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', padding: '2px 7px', background: bg, color }}>
            {v || '—'}
        </span>
    )
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
    return (
        <input type='text' value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder ?? 'Search…'}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(219,0,29,0.2)', color: '#ededed', fontSize: '0.72rem', padding: '5px 10px', outline: 'none', width: 220 }}
        />
    )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} style={{
            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '4px 12px', cursor: 'pointer',
            background: active ? 'rgba(219,0,29,0.2)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${active ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.08)'}`,
            color: active ? '#ededed' : 'rgba(237,237,237,0.4)',
        }}>
            {label}
        </button>
    )
}

function ImportButton({ onImport, label }: { onImport: (file: File) => Promise<void>; label: string }) {
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setLoading(true); setResult(null)
        try { await onImport(file); setResult('Imported successfully') }
        catch (err: any) { setResult(err?.message ?? 'Import failed') }
        finally { setLoading(false); if (inputRef.current) inputRef.current.value = '' }
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => inputRef.current?.click()} disabled={loading} style={{
                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '5px 14px', cursor: loading ? 'default' : 'pointer',
                background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.3)',
                color: loading ? 'rgba(237,237,237,0.35)' : '#ededed', opacity: loading ? 0.6 : 1,
            }}>
                {loading ? 'Importing…' : label}
            </button>
            <input ref={inputRef} type='file' accept='.csv' style={{ display: 'none' }} onChange={handleChange} />
            {result && <span style={{ fontSize: '0.68rem', color: result.includes('success') ? 'rgb(0,195,100)' : 'var(--red)' }}>{result}</span>}
        </div>
    )
}

// ── SyncScrollTable ────────────────────────────────────────────────────────────

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

    function syncBot() {
        if (syncing.current || !topRef.current || !botRef.current) return
        syncing.current = true; botRef.current.scrollLeft = topRef.current.scrollLeft; syncing.current = false
    }
    function syncTop() {
        if (syncing.current || !topRef.current || !botRef.current) return
        syncing.current = true; topRef.current.scrollLeft = botRef.current.scrollLeft; syncing.current = false
    }
    function onWheel(e: React.WheelEvent) {
        if (!e.shiftKey) return
        e.preventDefault()
        if (botRef.current) botRef.current.scrollLeft += e.deltaY
    }

    return (
        <div style={{ border: '1px solid rgba(219,0,29,0.15)', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div ref={topRef} onScroll={syncBot} style={{ overflowX: 'scroll', overflowY: 'hidden', height: 14, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div ref={mirrorRef} style={{ height: 1, minWidth: '100%' }} />
            </div>
            <div ref={botRef} onScroll={syncTop} onWheel={onWheel} style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'auto' }}>
                {children}
            </div>
        </div>
    )
}

// ── Sort header helper ─────────────────────────────────────────────────────────

function SortHdr({ label, field, sortBy, sortDir, onSort, style }: {
    label: string; field: string; sortBy: string; sortDir: 'asc' | 'desc'
    onSort: (f: string) => void; style?: React.CSSProperties
}) {
    const active = sortBy === field
    return (
        <th style={{ ...hdrSx, cursor: 'pointer', userSelect: 'none', ...style }} onClick={() => onSort(field)}>
            {label} <span style={{ opacity: active ? 0.85 : 0.2, fontSize: '0.5rem' }}>
                {active ? (sortDir === 'asc' ? '▲' : '▼') : '⬍'}
            </span>
        </th>
    )
}

// ── Inline text edit ───────────────────────────────────────────────────────────

function TextEdit({ value, onDone, style }: { value: string; onDone: (v: string) => void; style?: React.CSSProperties }) {
    const [val, setVal] = useState(value)
    const orig = useRef(value)
    return (
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
            onBlur={() => onDone(val)}
            onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') { e.preventDefault(); onDone(orig.current) }
            }}
            style={{ ...inputEditSx, ...style }}
        />
    )
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, confirmLabel, dangerous, loading, onConfirm, onCancel }: {
    title: string; message: string; confirmLabel: string
    dangerous?: boolean; loading?: boolean
    onConfirm: () => void; onCancel: () => void
}) {
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#0e0e0e', border: `1px solid ${dangerous ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.1)'}`, width: '100%', maxWidth: 400, padding: '24px 24px 20px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.6, marginBottom: 20 }}>{message}</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={onCancel} disabled={loading} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: loading ? 'rgba(237,237,237,0.25)' : 'rgba(237,237,237,0.6)', cursor: loading ? 'default' : 'pointer' }}>Cancel</button>
                    <button onClick={onConfirm} disabled={loading} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 16px', background: dangerous ? 'rgba(219,0,29,0.18)' : 'rgba(255,255,255,0.08)', border: `1px solid ${dangerous ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.2)'}`, color: loading ? 'rgba(237,237,237,0.3)' : '#ededed', cursor: loading ? 'default' : 'pointer' }}>
                        {loading ? 'Deleting…' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Recycle bin types ──────────────────────────────────────────────────────────

type RecycleBinItem = {
    id: string
    originalTab: 'billet' | 'leaving' | 'denied' | 'discipline'
    name: string
    deletedAt: string
    deletedByName: string
}

const TAB_BADGE: Record<string, { label: string; color: string }> = {
    billet:     { label: 'Billet',     color: '#60a5fa' },
    leaving:    { label: 'Leaving',    color: '#a78bfa' },
    denied:     { label: 'Denied',     color: '#f59e0b' },
    discipline: { label: 'Discipline', color: 'var(--red)' },
}

// ── Leaving History ────────────────────────────────────────────────────────────

function LeavingHistoryTab({ refreshKey }: { refreshKey: number }) {
    const ctx = useMastersheetCtx()
    const [records, setRecords] = useState<LeavingHistoryRecord[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState('')
    const [returnFilter, setReturnFilter] = useState('')
    const [typeFilter, setTypeFilter] = useState('')
    const [sortBy, setSortBy] = useState('leavingDate')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
    const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null)
    const [tick, setTick] = useState(0)
    const [deleteTarget, setDeleteTarget] = useState<{ rowId: string; name: string } | null>(null)
    const [deleting, setDeleting] = useState(false)

    const load = useCallback(async (pg: number, s: string, ret: string, typ: string, sb: string, sd: string) => {
        setLoading(true)
        try {
            const p = new URLSearchParams({ page: String(pg), search: s, return: ret, type: typ, sortBy: sb, sortDir: sd })
            const res = await fetch(`/api/admin/j4/mastersheet/leaving-history?${p}`)
            const data = await res.json()
            setRecords(data.records ?? []); setTotal(data.total ?? 0)
        } catch { /* ignore */ } finally { setLoading(false) }
    }, [])

    useEffect(() => {
        load(page, search, returnFilter, typeFilter, sortBy, sortDir)
    }, [page, search, returnFilter, typeFilter, sortBy, sortDir, refreshKey, tick, load])

    const jt = ctx.jumpTarget
    useEffect(() => {
        if (!jt || jt.tab !== 'leaving') return
        const timer = setTimeout(() => {
            document.querySelector(`[data-row-id="${jt.rowId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            ctx.setJumpTarget(null)
        }, 100)
        return () => clearTimeout(timer)
    }, [jt]) // eslint-disable-line

    function handleSort(f: string) {
        if (sortBy === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortBy(f); setSortDir('asc') }
        setPage(1)
    }

    const norm = (v: string | number | boolean | null) => v == null ? '' : String(v).trim()

    function handleEndEdit(rowId: string, field: string, fieldLabel: string, memberName: string,
        oldVal: string | number | boolean | null, newVal: string | number | boolean | null) {
        const id = `leaving:${rowId}:${field}`
        if (norm(newVal) === norm(oldVal)) ctx.removeChange(id)
        else ctx.upsertChange({ id, tab: 'leaving', rowId, memberName, field, fieldLabel, oldValue: oldVal, newValue: newVal })
        setEditingCell(null)
    }

    const startEdit = (rowId: string, field: string) => setEditingCell({ rowId, field })
    const isEdit = (rowId: string, field: string) => editingCell?.rowId === rowId && editingCell?.field === field

    function cellBg(rowId: string, field: string): React.CSSProperties {
        const id = `leaving:${rowId}:${field}`
        if (ctx.jumpTarget?.tab === 'leaving' && ctx.jumpTarget.rowId === rowId && ctx.jumpTarget.field === field)
            return { background: 'rgba(59,130,246,0.12)', outline: '1px solid rgba(59,130,246,0.35)' }
        if (ctx.pendingChanges.has(id))
            return { background: 'rgba(245,158,11,0.07)', outline: '1px solid rgba(245,158,11,0.25)' }
        return {}
    }

    async function handleImport(file: File) {
        const fd = new FormData(); fd.append('file', file)
        const res = await fetch('/api/admin/j4/mastersheet/leaving-history', { method: 'POST', body: fd })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error ?? 'Import failed')
        setPage(1); setTick(t => t + 1)
    }

    async function handleConfirmDelete() {
        if (!deleteTarget) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/admin/j4/mastersheet/leaving-history/${deleteTarget.rowId}`, { method: 'DELETE' })
            if (!res.ok) return
            setRecords(prev => prev.filter(r => String(r._id) !== deleteTarget.rowId))
            setTotal(t => t - 1)
            ctx.removeChange(`leaving:${deleteTarget.rowId}:*`) // best-effort; exact keys may remain
            setDeleteTarget(null)
        } catch { /* ignore */ } finally { setDeleting(false) }
    }

    const LIMIT = 100
    const totalPages = Math.max(1, Math.ceil(total / LIMIT))

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder='Search name, reason…' />
                <div style={{ display: 'flex', gap: 6 }}>
                    {(['', 'YES', 'REVIEW', 'NO'] as const).map(v => (
                        <FilterChip key={v} label={v || 'All'} active={returnFilter === v} onClick={() => { setReturnFilter(v); setPage(1) }} />
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {(['', 'GD', 'HD', 'DD'] as const).map(v => (
                        <FilterChip key={v} label={v || 'All Types'} active={typeFilter === v} onClick={() => { setTypeFilter(v); setPage(1) }} />
                    ))}
                </div>
                <div style={{ marginLeft: 'auto' }}><ImportButton onImport={handleImport} label='Import CSV' /></div>
            </div>

            <div style={labelSx}>{loading ? 'Loading…' : `${total} records${search || returnFilter || typeFilter ? ' (filtered)' : ''}`}</div>

            <SyncScrollTable>
                <table style={{ borderCollapse: 'collapse', minWidth: 1030, width: '100%' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
                        <tr>
                            <th style={{ ...stickyNameHdr, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                                Name <span style={{ opacity: sortBy === 'name' ? 0.85 : 0.2, fontSize: '0.5rem' }}>{sortBy === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : '⬍'}</span>
                            </th>
                            <SortHdr label='Date'         field='leavingDate'   sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                            <SortHdr label='Type'         field='type'          sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                            <SortHdr label='Return'       field='return'        sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                            <th style={hdrSx}>Grace</th>
                            <th style={hdrSx}>Authorised By</th>
                            <th style={{ ...hdrSx, minWidth: 320 }}>Reason / Notes</th>
                            <th style={hdrSx}>Ticket</th>
                            <th style={{ ...hdrSx, width: 44, padding: '7px 6px' }} />
                        </tr>
                    </thead>
                    <tbody>
                        {records.length === 0 && !loading && (
                            <tr><td colSpan={9} style={{ ...cellSx, textAlign: 'center', color: 'rgba(237,237,237,0.2)', padding: '24px 12px' }}>
                                {total === 0 ? 'No records. Import a CSV to populate.' : 'No records match your filters.'}
                            </td></tr>
                        )}
                        {records.map((r, i) => {
                            const rowId = String(r._id)
                            return (
                                <tr key={rowId} data-row-id={rowId} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'name')} style={{ ...stickyNameCell, cursor: 'text', ...cellBg(rowId, 'name') }}>
                                        {isEdit(rowId, 'name') ? <TextEdit value={r.name} onDone={v => handleEndEdit(rowId, 'name', 'Name', r.name, r.name, v)} /> : r.name}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'leavingDate')} style={{ ...cellSx, cursor: 'text', ...cellBg(rowId, 'leavingDate') }}>
                                        {isEdit(rowId, 'leavingDate') ? <TextEdit value={r.leavingDate ?? ''} onDone={v => handleEndEdit(rowId, 'leavingDate', 'Date', r.name, r.leavingDate, v)} /> : r.leavingDate}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'type')} style={{ ...cellSx, cursor: 'pointer', ...cellBg(rowId, 'type') }}>
                                        {isEdit(rowId, 'type') ? (
                                            <select autoFocus defaultValue={r.type} onChange={e => handleEndEdit(rowId, 'type', 'Type', r.name, r.type, e.target.value)} onBlur={() => setEditingCell(null)} style={selectEditSx}>
                                                {['GD', 'HD', 'DD'].map(v => <option key={v} value={v}>{v}</option>)}
                                            </select>
                                        ) : <TypeBadge value={r.type} />}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'return')} style={{ ...cellSx, cursor: 'pointer', ...cellBg(rowId, 'return') }}>
                                        {isEdit(rowId, 'return') ? (
                                            <select autoFocus defaultValue={r.return} onChange={e => handleEndEdit(rowId, 'return', 'Return', r.name, r.return, e.target.value)} onBlur={() => setEditingCell(null)} style={selectEditSx}>
                                                {['YES', 'REVIEW', 'NO', 'Indefinite', 'Expired'].map(v => <option key={v} value={v}>{v}</option>)}
                                            </select>
                                        ) : <ReturnBadge value={r.return} />}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'grace')} style={{ ...cellSx, cursor: 'text', ...cellBg(rowId, 'grace') }}>
                                        {isEdit(rowId, 'grace') ? <TextEdit value={r.grace ?? ''} onDone={v => handleEndEdit(rowId, 'grace', 'Grace', r.name, r.grace, v)} /> : (
                                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)' }}>{r.grace}</span>
                                        )}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'authorisedBy')} style={{ ...cellSx, cursor: 'text', ...cellBg(rowId, 'authorisedBy') }}>
                                        {isEdit(rowId, 'authorisedBy') ? <TextEdit value={r.authorisedBy ?? ''} onDone={v => handleEndEdit(rowId, 'authorisedBy', 'Authorised By', r.name, r.authorisedBy, v)} /> : r.authorisedBy}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'reason')} style={{ ...cellSx, maxWidth: 480, whiteSpace: 'normal', lineHeight: 1.5, fontSize: '0.68rem', color: 'rgba(237,237,237,0.6)', cursor: 'text', ...cellBg(rowId, 'reason') }}>
                                        {isEdit(rowId, 'reason') ? <TextEdit value={r.reason ?? ''} onDone={v => handleEndEdit(rowId, 'reason', 'Reason', r.name, r.reason, v)} /> : (
                                            <>{r.reason}{r.notes && <div style={{ marginTop: 4, color: 'rgba(237,237,237,0.35)', fontSize: '0.62rem' }}>{r.notes}</div>}</>
                                        )}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'dischargeTicket')} style={{ ...cellSx, cursor: 'text', ...cellBg(rowId, 'dischargeTicket') }}>
                                        {isEdit(rowId, 'dischargeTicket') ? <TextEdit value={r.dischargeTicket ?? ''} onDone={v => handleEndEdit(rowId, 'dischargeTicket', 'Ticket', r.name, r.dischargeTicket ?? null, v || null)} /> : (
                                            <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)' }}>{r.dischargeTicket || '—'}</span>
                                        )}
                                    </td>
                                    <td style={{ ...cellSx, width: 44, padding: '4px 6px', textAlign: 'center' }}>
                                        <button onClick={() => setDeleteTarget({ rowId, name: r.name })} title='Delete record' style={{ background: 'none', border: '1px solid rgba(219,0,29,0.18)', color: 'rgba(219,0,29,0.45)', fontSize: '0.7rem', cursor: 'pointer', padding: '2px 7px', lineHeight: 1 }}>×</button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </SyncScrollTable>

            {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ background: 'none', border: '1px solid rgba(219,0,29,0.2)', color: page === 1 ? 'rgba(237,237,237,0.2)' : '#ededed', padding: '4px 12px', cursor: page === 1 ? 'default' : 'pointer', fontSize: '0.65rem' }}>←</button>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)' }}>Page {page} of {totalPages}</span>
                    <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} style={{ background: 'none', border: '1px solid rgba(219,0,29,0.2)', color: page === totalPages ? 'rgba(237,237,237,0.2)' : '#ededed', padding: '4px 12px', cursor: page === totalPages ? 'default' : 'pointer', fontSize: '0.65rem' }}>→</button>
                </div>
            )}

            {deleteTarget && (
                <ConfirmDialog
                    title='Delete Record'
                    message={`Delete "${deleteTarget.name}"? The record will be moved to the Recycle Bin and can be restored.`}
                    confirmLabel='Delete'
                    dangerous
                    loading={deleting}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </div>
    )
}

// ── Denied Applications ────────────────────────────────────────────────────────

function DeniedApplicationsTab({ refreshKey }: { refreshKey: number }) {
    const ctx = useMastersheetCtx()
    const [records, setRecords] = useState<DeniedApplicationRecord[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState('')
    const [sortBy, setSortBy] = useState('date')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
    const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null)
    const [tick, setTick] = useState(0)
    const [deleteTarget, setDeleteTarget] = useState<{ rowId: string; name: string } | null>(null)
    const [deleting, setDeleting] = useState(false)

    const load = useCallback(async (pg: number, s: string, sb: string, sd: string) => {
        setLoading(true)
        try {
            const p = new URLSearchParams({ page: String(pg), search: s, sortBy: sb, sortDir: sd })
            const res = await fetch(`/api/admin/j4/mastersheet/denied-applications?${p}`)
            const data = await res.json()
            setRecords(data.records ?? []); setTotal(data.total ?? 0)
        } catch { /* ignore */ } finally { setLoading(false) }
    }, [])

    useEffect(() => {
        load(page, search, sortBy, sortDir)
    }, [page, search, sortBy, sortDir, refreshKey, tick, load])

    const jt = ctx.jumpTarget
    useEffect(() => {
        if (!jt || jt.tab !== 'denied') return
        const timer = setTimeout(() => {
            document.querySelector(`[data-row-id="${jt.rowId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            ctx.setJumpTarget(null)
        }, 100)
        return () => clearTimeout(timer)
    }, [jt]) // eslint-disable-line

    function handleSort(f: string) {
        if (sortBy === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortBy(f); setSortDir('asc') }
        setPage(1)
    }

    const norm = (v: string | number | boolean | null) => v == null ? '' : String(v).trim()

    function handleEndEdit(rowId: string, field: string, fieldLabel: string, memberName: string,
        oldVal: string | number | boolean | null, newVal: string | number | boolean | null) {
        const id = `denied:${rowId}:${field}`
        if (norm(newVal) === norm(oldVal)) ctx.removeChange(id)
        else ctx.upsertChange({ id, tab: 'denied', rowId, memberName, field, fieldLabel, oldValue: oldVal, newValue: newVal })
        setEditingCell(null)
    }

    const startEdit = (rowId: string, field: string) => setEditingCell({ rowId, field })
    const isEdit = (rowId: string, field: string) => editingCell?.rowId === rowId && editingCell?.field === field

    function cellBg(rowId: string, field: string): React.CSSProperties {
        const id = `denied:${rowId}:${field}`
        if (ctx.jumpTarget?.tab === 'denied' && ctx.jumpTarget.rowId === rowId && ctx.jumpTarget.field === field)
            return { background: 'rgba(59,130,246,0.12)', outline: '1px solid rgba(59,130,246,0.35)' }
        if (ctx.pendingChanges.has(id))
            return { background: 'rgba(245,158,11,0.07)', outline: '1px solid rgba(245,158,11,0.25)' }
        return {}
    }

    async function handleImport(file: File) {
        const fd = new FormData(); fd.append('file', file)
        const res = await fetch('/api/admin/j4/mastersheet/denied-applications', { method: 'POST', body: fd })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error ?? 'Import failed')
        setPage(1); setTick(t => t + 1)
    }

    async function handleConfirmDelete() {
        if (!deleteTarget) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/admin/j4/mastersheet/denied-applications/${deleteTarget.rowId}`, { method: 'DELETE' })
            if (!res.ok) return
            setRecords(prev => prev.filter(r => String(r._id) !== deleteTarget.rowId))
            setTotal(t => t - 1)
            setDeleteTarget(null)
        } catch { /* ignore */ } finally { setDeleting(false) }
    }

    const LIMIT = 100
    const totalPages = Math.max(1, Math.ceil(total / LIMIT))

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder='Search name, reason…' />
                <div style={{ marginLeft: 'auto' }}><ImportButton onImport={handleImport} label='Import CSV' /></div>
            </div>

            <div style={labelSx}>{loading ? 'Loading…' : `${total} records${search ? ' (filtered)' : ''}`}</div>

            <SyncScrollTable>
                <table style={{ borderCollapse: 'collapse', minWidth: 830, width: '100%' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
                        <tr>
                            <th style={{ ...stickyNameHdr, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                                Name <span style={{ opacity: sortBy === 'name' ? 0.85 : 0.2, fontSize: '0.5rem' }}>{sortBy === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : '⬍'}</span>
                            </th>
                            <SortHdr label='Date'      field='date'      sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                            <th style={hdrSx}>Steam ID</th>
                            <th style={{ ...hdrSx, minWidth: 300 }}>Reason</th>
                            <SortHdr label='Denied By' field='deniedBy'  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                            <th style={{ ...hdrSx, width: 44, padding: '7px 6px' }} />
                        </tr>
                    </thead>
                    <tbody>
                        {records.length === 0 && !loading && (
                            <tr><td colSpan={6} style={{ ...cellSx, textAlign: 'center', color: 'rgba(237,237,237,0.2)', padding: '24px 12px' }}>
                                {total === 0 ? 'No records. Import a CSV to populate.' : 'No records match your search.'}
                            </td></tr>
                        )}
                        {records.map((r, i) => {
                            const rowId = String(r._id)
                            return (
                                <tr key={rowId} data-row-id={rowId} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'name')} style={{ ...stickyNameCell, cursor: 'text', ...cellBg(rowId, 'name') }}>
                                        {isEdit(rowId, 'name') ? <TextEdit value={r.name} onDone={v => handleEndEdit(rowId, 'name', 'Name', r.name, r.name, v)} /> : r.name}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'date')} style={{ ...cellSx, cursor: 'text', ...cellBg(rowId, 'date') }}>
                                        {isEdit(rowId, 'date') ? <TextEdit value={r.date ?? ''} onDone={v => handleEndEdit(rowId, 'date', 'Date', r.name, r.date, v)} /> : r.date}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'steamId')} style={{ ...cellSx, fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', fontFamily: 'monospace', cursor: 'text', ...cellBg(rowId, 'steamId') }}>
                                        {isEdit(rowId, 'steamId') ? <TextEdit value={r.steamId ?? ''} onDone={v => handleEndEdit(rowId, 'steamId', 'Steam ID', r.name, r.steamId ?? null, v || null)} style={{ fontFamily: 'monospace' }} /> : (r.steamId || '—')}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'reason')} style={{ ...cellSx, maxWidth: 400, whiteSpace: 'normal', lineHeight: 1.5, fontSize: '0.68rem', color: 'rgba(237,237,237,0.6)', cursor: 'text', ...cellBg(rowId, 'reason') }}>
                                        {isEdit(rowId, 'reason') ? <TextEdit value={r.reason ?? ''} onDone={v => handleEndEdit(rowId, 'reason', 'Reason', r.name, r.reason, v)} /> : r.reason}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'deniedBy')} style={{ ...cellSx, cursor: 'text', ...cellBg(rowId, 'deniedBy') }}>
                                        {isEdit(rowId, 'deniedBy') ? <TextEdit value={r.deniedBy ?? ''} onDone={v => handleEndEdit(rowId, 'deniedBy', 'Denied By', r.name, r.deniedBy, v)} /> : r.deniedBy}
                                    </td>
                                    <td style={{ ...cellSx, width: 44, padding: '4px 6px', textAlign: 'center' }}>
                                        <button onClick={() => setDeleteTarget({ rowId, name: r.name })} title='Delete record' style={{ background: 'none', border: '1px solid rgba(219,0,29,0.18)', color: 'rgba(219,0,29,0.45)', fontSize: '0.7rem', cursor: 'pointer', padding: '2px 7px', lineHeight: 1 }}>×</button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </SyncScrollTable>

            {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ background: 'none', border: '1px solid rgba(219,0,29,0.2)', color: page === 1 ? 'rgba(237,237,237,0.2)' : '#ededed', padding: '4px 12px', cursor: page === 1 ? 'default' : 'pointer', fontSize: '0.65rem' }}>←</button>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)' }}>Page {page} of {totalPages}</span>
                    <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} style={{ background: 'none', border: '1px solid rgba(219,0,29,0.2)', color: page === totalPages ? 'rgba(237,237,237,0.2)' : '#ededed', padding: '4px 12px', cursor: page === totalPages ? 'default' : 'pointer', fontSize: '0.65rem' }}>→</button>
                </div>
            )}

            {deleteTarget && (
                <ConfirmDialog
                    title='Delete Record'
                    message={`Delete "${deleteTarget.name}"? The record will be moved to the Recycle Bin and can be restored.`}
                    confirmLabel='Delete'
                    dangerous
                    loading={deleting}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </div>
    )
}

// ── Discipline ─────────────────────────────────────────────────────────────────

const DISCIPLINE_LEVELS = [
    'Verbal Warning', 'Formal Warning', 'First Strike',
    'Second Strike', 'Removal from Section', 'Removal from Unit',
]

function DisciplineTab({ refreshKey }: { refreshKey: number }) {
    const ctx = useMastersheetCtx()
    const [records, setRecords] = useState<DisciplineRecord[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(false)
    const [unauthorized, setUnauthorized] = useState(false)
    const [search, setSearch] = useState('')
    const [levelFilter, setLevelFilter] = useState('')
    const [activeOnly, setActiveOnly] = useState(false)
    const [sortBy, setSortBy] = useState('issued')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
    const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null)
    const [tick, setTick] = useState(0)
    const [deleteTarget, setDeleteTarget] = useState<{ rowId: string; name: string } | null>(null)
    const [deleting, setDeleting] = useState(false)

    const load = useCallback(async (pg: number, s: string, lvl: string, ao: boolean, sb: string, sd: string) => {
        setLoading(true)
        try {
            const p = new URLSearchParams({ page: String(pg), search: s, level: lvl, active: String(ao), sortBy: sb, sortDir: sd })
            const res = await fetch(`/api/admin/j4/mastersheet/discipline?${p}`)
            if (res.status === 401) { setUnauthorized(true); return }
            const data = await res.json()
            setRecords(data.records ?? []); setTotal(data.total ?? 0)
        } catch { /* ignore */ } finally { setLoading(false) }
    }, [])

    useEffect(() => {
        load(page, search, levelFilter, activeOnly, sortBy, sortDir)
    }, [page, search, levelFilter, activeOnly, sortBy, sortDir, refreshKey, tick, load])

    const jt = ctx.jumpTarget
    useEffect(() => {
        if (!jt || jt.tab !== 'discipline') return
        const timer = setTimeout(() => {
            document.querySelector(`[data-row-id="${jt.rowId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            ctx.setJumpTarget(null)
        }, 100)
        return () => clearTimeout(timer)
    }, [jt]) // eslint-disable-line

    function handleSort(f: string) {
        if (sortBy === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortBy(f); setSortDir('asc') }
        setPage(1)
    }

    const norm = (v: string | number | boolean | null) => v == null ? '' : String(v).trim()

    function handleEndEdit(rowId: string, field: string, fieldLabel: string, memberName: string,
        oldVal: string | number | boolean | null, newVal: string | number | boolean | null) {
        const id = `discipline:${rowId}:${field}`
        if (norm(newVal) === norm(oldVal)) ctx.removeChange(id)
        else ctx.upsertChange({ id, tab: 'discipline', rowId, memberName, field, fieldLabel, oldValue: oldVal, newValue: newVal })
        setEditingCell(null)
    }

    const startEdit = (rowId: string, field: string) => setEditingCell({ rowId, field })
    const isEdit = (rowId: string, field: string) => editingCell?.rowId === rowId && editingCell?.field === field

    function cellBg(rowId: string, field: string): React.CSSProperties {
        const id = `discipline:${rowId}:${field}`
        if (ctx.jumpTarget?.tab === 'discipline' && ctx.jumpTarget.rowId === rowId && ctx.jumpTarget.field === field)
            return { background: 'rgba(59,130,246,0.12)', outline: '1px solid rgba(59,130,246,0.35)' }
        if (ctx.pendingChanges.has(id))
            return { background: 'rgba(245,158,11,0.07)', outline: '1px solid rgba(245,158,11,0.25)' }
        return {}
    }

    async function handleImport(file: File) {
        const fd = new FormData(); fd.append('file', file)
        const res = await fetch('/api/admin/j4/mastersheet/discipline', { method: 'POST', body: fd })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error ?? 'Import failed')
        setPage(1); setTick(t => t + 1)
    }

    async function handleConfirmDelete() {
        if (!deleteTarget) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/admin/j4/mastersheet/discipline/${deleteTarget.rowId}`, { method: 'DELETE' })
            if (!res.ok) return
            setRecords(prev => prev.filter(r => String(r._id) !== deleteTarget.rowId))
            setTotal(t => t - 1)
            setDeleteTarget(null)
        } catch { /* ignore */ } finally { setDeleting(false) }
    }

    if (unauthorized) {
        return <div style={{ padding: '32px 0', textAlign: 'center', color: 'rgba(237,237,237,0.2)', fontSize: '0.72rem' }}>Access restricted.</div>
    }

    const LIMIT = 100
    const totalPages = Math.max(1, Math.ceil(total / LIMIT))

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder='Search name, reason…' />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <FilterChip label='All' active={levelFilter === ''} onClick={() => { setLevelFilter(''); setPage(1) }} />
                    {DISCIPLINE_LEVELS.map(l => (
                        <FilterChip key={l} label={l} active={levelFilter === l} onClick={() => { setLevelFilter(l === levelFilter ? '' : l); setPage(1) }} />
                    ))}
                </div>
                <FilterChip label='Active Only' active={activeOnly} onClick={() => { setActiveOnly(p => !p); setPage(1) }} />
                <div style={{ marginLeft: 'auto' }}><ImportButton onImport={handleImport} label='Import CSV' /></div>
            </div>

            <div style={labelSx}>{loading ? 'Loading…' : `${total} records${search || levelFilter || activeOnly ? ' (filtered)' : ''}`}</div>

            <SyncScrollTable>
                <table style={{ borderCollapse: 'collapse', minWidth: 1080, width: '100%' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
                        <tr>
                            {/* Slightly narrower Name column for Discipline to give more room to Reason */}
                            <th style={{ ...stickyNameHdr, width: 120, maxWidth: 120, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                                Name <span style={{ opacity: sortBy === 'name' ? 0.85 : 0.2, fontSize: '0.5rem' }}>{sortBy === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : '⬍'}</span>
                            </th>
                            <SortHdr label='Level'        field='disciplineLevel' sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                            <SortHdr label='Issued'       field='issued'          sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                            <SortHdr label='Expires'      field='expires'         sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                            <th style={hdrSx}>Status</th>
                            <th style={hdrSx}>Given By</th>
                            <th style={hdrSx}>Authorised By</th>
                            <th style={hdrSx}>Points</th>
                            <th style={{ ...hdrSx, minWidth: 280 }}>Reason</th>
                            <th style={{ ...hdrSx, width: 44, padding: '7px 6px' }} />
                        </tr>
                    </thead>
                    <tbody>
                        {records.length === 0 && !loading && (
                            <tr><td colSpan={10} style={{ ...cellSx, textAlign: 'center', color: 'rgba(237,237,237,0.2)', padding: '24px 12px' }}>
                                {total === 0 ? 'No records. Import a CSV to populate.' : 'No records match your filters.'}
                            </td></tr>
                        )}
                        {records.map((r, i) => {
                            const rowId = String(r._id)
                            return (
                                <tr key={rowId} data-row-id={rowId} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'name')} style={{ ...stickyNameCell, width: 120, maxWidth: 120, cursor: 'text', ...cellBg(rowId, 'name') }}>
                                        {isEdit(rowId, 'name') ? <TextEdit value={r.name} onDone={v => handleEndEdit(rowId, 'name', 'Name', r.name, r.name, v)} /> : r.name}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'disciplineLevel')} style={{ ...cellSx, cursor: 'pointer', ...cellBg(rowId, 'disciplineLevel') }}>
                                        {isEdit(rowId, 'disciplineLevel') ? (
                                            <select autoFocus defaultValue={r.disciplineLevel} onChange={e => handleEndEdit(rowId, 'disciplineLevel', 'Level', r.name, r.disciplineLevel, e.target.value)} onBlur={() => setEditingCell(null)} style={{ ...selectEditSx, minWidth: 160 }}>
                                                {DISCIPLINE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                                            </select>
                                        ) : <DisciplineLevelBadge value={r.disciplineLevel} />}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'issued')} style={{ ...cellSx, cursor: 'text', ...cellBg(rowId, 'issued') }}>
                                        {isEdit(rowId, 'issued') ? <TextEdit value={r.issued ?? ''} onDone={v => handleEndEdit(rowId, 'issued', 'Issued', r.name, r.issued, v)} /> : r.issued}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'expires')} style={{ ...cellSx, cursor: 'text', ...cellBg(rowId, 'expires') }}>
                                        {isEdit(rowId, 'expires') ? <TextEdit value={r.expires ?? ''} onDone={v => handleEndEdit(rowId, 'expires', 'Expires', r.name, r.expires, v)} /> : r.expires}
                                    </td>
                                    <td onClick={() => handleEndEdit(rowId, 'expired', 'Status', r.name, r.expired, !r.expired)} style={{ ...cellSx, cursor: 'pointer', ...cellBg(rowId, 'expired') }}>
                                        <span style={{ fontSize: '0.58rem', fontWeight: 700, padding: '2px 6px', background: r.expired ? 'rgba(255,255,255,0.05)' : 'rgba(219,0,29,0.12)', color: r.expired ? 'rgba(237,237,237,0.3)' : 'var(--red)' }}>
                                            {r.expired ? 'EXPIRED' : 'ACTIVE'}
                                        </span>
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'givenBy')} style={{ ...cellSx, cursor: 'text', ...cellBg(rowId, 'givenBy') }}>
                                        {isEdit(rowId, 'givenBy') ? <TextEdit value={r.givenBy ?? ''} onDone={v => handleEndEdit(rowId, 'givenBy', 'Given By', r.name, r.givenBy, v)} /> : r.givenBy}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'authorisedBy')} style={{ ...cellSx, cursor: 'text', ...cellBg(rowId, 'authorisedBy') }}>
                                        {isEdit(rowId, 'authorisedBy') ? <TextEdit value={r.authorisedBy ?? ''} onDone={v => handleEndEdit(rowId, 'authorisedBy', 'Authorised By', r.name, r.authorisedBy, v)} /> : r.authorisedBy}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'pointsRemoved')} style={{ ...cellSx, textAlign: 'center', cursor: 'text', ...cellBg(rowId, 'pointsRemoved') }}>
                                        {isEdit(rowId, 'pointsRemoved') ? (
                                            <TextEdit value={r.pointsRemoved?.toString() ?? ''} onDone={v => handleEndEdit(rowId, 'pointsRemoved', 'Points', r.name, r.pointsRemoved ?? null, v === '' ? null : Number(v))} style={{ width: 60 }} />
                                        ) : (
                                            r.pointsRemoved != null
                                                ? <span style={{ color: 'var(--red)', fontWeight: 700 }}>−{r.pointsRemoved}</span>
                                                : <span style={{ color: 'rgba(237,237,237,0.2)' }}>—</span>
                                        )}
                                    </td>
                                    <td onClick={() => !editingCell && startEdit(rowId, 'reason')} style={{ ...cellSx, maxWidth: 400, whiteSpace: 'normal', lineHeight: 1.5, fontSize: '0.68rem', color: 'rgba(237,237,237,0.6)', cursor: 'text', ...cellBg(rowId, 'reason') }}>
                                        {isEdit(rowId, 'reason') ? <TextEdit value={r.reason ?? ''} onDone={v => handleEndEdit(rowId, 'reason', 'Reason', r.name, r.reason, v)} /> : r.reason}
                                    </td>
                                    <td style={{ ...cellSx, width: 44, padding: '4px 6px', textAlign: 'center' }}>
                                        <button onClick={() => setDeleteTarget({ rowId, name: r.name })} title='Delete record' style={{ background: 'none', border: '1px solid rgba(219,0,29,0.18)', color: 'rgba(219,0,29,0.45)', fontSize: '0.7rem', cursor: 'pointer', padding: '2px 7px', lineHeight: 1 }}>×</button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </SyncScrollTable>

            {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ background: 'none', border: '1px solid rgba(219,0,29,0.2)', color: page === 1 ? 'rgba(237,237,237,0.2)' : '#ededed', padding: '4px 12px', cursor: page === 1 ? 'default' : 'pointer', fontSize: '0.65rem' }}>←</button>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)' }}>Page {page} of {totalPages}</span>
                    <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} style={{ background: 'none', border: '1px solid rgba(219,0,29,0.2)', color: page === totalPages ? 'rgba(237,237,237,0.2)' : '#ededed', padding: '4px 12px', cursor: page === totalPages ? 'default' : 'pointer', fontSize: '0.65rem' }}>→</button>
                </div>
            )}

            {deleteTarget && (
                <ConfirmDialog
                    title='Delete Record'
                    message={`Delete "${deleteTarget.name}"? The record will be moved to the Recycle Bin and can be restored.`}
                    confirmLabel='Delete'
                    dangerous
                    loading={deleting}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </div>
    )
}

// ── Recycle Bin ────────────────────────────────────────────────────────────────

function RecycleBinTab() {
    const [items, setItems] = useState<RecycleBinItem[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(false)
    const [tabFilter, setTabFilter] = useState('')
    const [restoring, setRestoring] = useState<string | null>(null)
    const [permDeleteTarget, setPermDeleteTarget] = useState<RecycleBinItem | null>(null)
    const [permDeleting, setPermDeleting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [tick, setTick] = useState(0)

    const load = useCallback(async (pg: number, tf: string) => {
        setLoading(true)
        try {
            const p = new URLSearchParams({ page: String(pg), tab: tf })
            const res = await fetch(`/api/admin/j4/mastersheet/recycle-bin?${p}`)
            const data = await res.json()
            setItems(data.items ?? []); setTotal(data.total ?? 0)
        } catch { /* ignore */ } finally { setLoading(false) }
    }, [])

    useEffect(() => {
        load(page, tabFilter)
    }, [page, tabFilter, tick, load])

    async function handleRestore(item: RecycleBinItem) {
        setRestoring(item.id); setError(null)
        try {
            const res = await fetch(`/api/admin/j4/mastersheet/recycle-bin/${item.id}`, { method: 'POST' })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? 'Restore failed'); return }
            setItems(prev => prev.filter(i => i.id !== item.id))
            setTotal(t => t - 1)
        } catch { setError('Network error') } finally { setRestoring(null) }
    }

    async function handlePermDelete() {
        if (!permDeleteTarget) return
        setPermDeleting(true); setError(null)
        try {
            const res = await fetch(`/api/admin/j4/mastersheet/recycle-bin/${permDeleteTarget.id}`, { method: 'DELETE' })
            if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Delete failed'); return }
            setItems(prev => prev.filter(i => i.id !== permDeleteTarget.id))
            setTotal(t => t - 1)
            setPermDeleteTarget(null)
        } catch { setError('Network error') } finally { setPermDeleting(false) }
    }

    const LIMIT = 50
    const totalPages = Math.max(1, Math.ceil(total / LIMIT))

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                    {(['', 'billet', 'leaving', 'denied', 'discipline'] as const).map(v => (
                        <FilterChip key={v} label={v ? TAB_BADGE[v]?.label ?? v : 'All'} active={tabFilter === v} onClick={() => { setTabFilter(v); setPage(1) }} />
                    ))}
                </div>
                <button onClick={() => setTick(t => t + 1)} style={{ marginLeft: 'auto', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}>
                    Refresh
                </button>
            </div>

            {error && <div style={{ fontSize: '0.68rem', color: 'var(--red)' }}>{error}</div>}

            <div style={labelSx}>
                {loading ? 'Loading…' : `${total} item${total !== 1 ? 's' : ''} in recycle bin`}
            </div>

            <div style={{ border: '1px solid rgba(219,0,29,0.15)' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
                        <tr>
                            <th style={{ ...stickyNameHdr }}>Name</th>
                            <th style={hdrSx}>Source</th>
                            <th style={hdrSx}>Deleted</th>
                            <th style={hdrSx}>Deleted By</th>
                            <th style={{ ...hdrSx, width: 160, textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 && !loading && (
                            <tr><td colSpan={5} style={{ ...cellSx, textAlign: 'center', color: 'rgba(237,237,237,0.2)', padding: '32px 12px' }}>
                                Recycle bin is empty.
                            </td></tr>
                        )}
                        {items.map((item, i) => {
                            const badge = TAB_BADGE[item.originalTab]
                            return (
                                <tr key={item.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                                    <td style={stickyNameCell}>{item.name}</td>
                                    <td style={cellSx}>
                                        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: badge?.color ?? 'rgba(237,237,237,0.4)', padding: '2px 6px', background: 'rgba(255,255,255,0.05)' }}>
                                            {badge?.label ?? item.originalTab}
                                        </span>
                                    </td>
                                    <td style={{ ...cellSx, color: 'rgba(237,237,237,0.45)', fontSize: '0.68rem' }}>
                                        {new Date(item.deletedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </td>
                                    <td style={cellSx}>{item.deletedByName}</td>
                                    <td style={{ ...cellSx, textAlign: 'right', padding: '5px 12px' }}>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={() => handleRestore(item)}
                                                disabled={restoring === item.id}
                                                style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 10px', background: 'rgba(0,195,100,0.1)', border: '1px solid rgba(0,195,100,0.25)', color: restoring === item.id ? 'rgba(237,237,237,0.3)' : 'rgb(0,195,100)', cursor: restoring === item.id ? 'default' : 'pointer' }}
                                            >
                                                {restoring === item.id ? '…' : 'Restore'}
                                            </button>
                                            <button
                                                onClick={() => setPermDeleteTarget(item)}
                                                style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 10px', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.65)', cursor: 'pointer' }}
                                            >
                                                Perm. Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ background: 'none', border: '1px solid rgba(219,0,29,0.2)', color: page === 1 ? 'rgba(237,237,237,0.2)' : '#ededed', padding: '4px 12px', cursor: page === 1 ? 'default' : 'pointer', fontSize: '0.65rem' }}>←</button>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)' }}>Page {page} of {totalPages}</span>
                    <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} style={{ background: 'none', border: '1px solid rgba(219,0,29,0.2)', color: page === totalPages ? 'rgba(237,237,237,0.2)' : '#ededed', padding: '4px 12px', cursor: page === totalPages ? 'default' : 'pointer', fontSize: '0.65rem' }}>→</button>
                </div>
            )}

            {permDeleteTarget && (
                <ConfirmDialog
                    title='Permanently Delete Record'
                    message={`Permanently delete "${permDeleteTarget.name}"? This action cannot be undone — the record will be gone forever.`}
                    confirmLabel='Permanently Delete'
                    dangerous
                    loading={permDeleting}
                    onConfirm={handlePermDelete}
                    onCancel={() => setPermDeleteTarget(null)}
                />
            )}
        </div>
    )
}

// ── Review Modal ───────────────────────────────────────────────────────────────

function fmtVal(v: string | number | boolean | null): string {
    if (v === null || v === undefined || v === '') return '(empty)'
    if (typeof v === 'boolean') return v ? 'Yes' : 'No'
    return String(v)
}

const TAB_LABELS: Record<string, string> = {
    billet: 'Billet Mastersheet',
    leaving: 'Leaving History',
    denied: 'Denied Applications',
    discipline: 'Discipline',
}

function ReviewModal({
    pendingChanges, onClose, onCancel, onConfirm, confirming, error, onJump,
}: {
    pendingChanges: Map<string, PendingChange>
    onClose: () => void
    onCancel: () => void
    onConfirm: () => void
    confirming: boolean
    error: string | null
    onJump: (tab: MastersheetSubTab, rowId: string, field: string) => void
}) {
    const list = Array.from(pendingChanges.values())
    const byTab: Record<string, PendingChange[]> = {}
    for (const c of list) (byTab[c.tab] ??= []).push(c)

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#0e0e0e', border: '1px solid rgba(219,0,29,0.25)', width: '100%', maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Review Changes</div>
                        <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.35)', marginTop: 2 }}>
                            {list.length} pending change{list.length !== 1 ? 's' : ''} — review before applying
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '0 2px' }}>×</button>
                </div>

                <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
                    {(['billet', 'leaving', 'denied', 'discipline'] as MastersheetSubTab[]).map(tab => {
                        const changes = byTab[tab]
                        if (!changes?.length) return null
                        return (
                            <div key={tab} style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.55)', padding: '4px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', marginBottom: 2 }}>
                                    {TAB_LABELS[tab]}
                                </div>
                                {changes.map(c => (
                                    <div key={c.id}
                                        onClick={() => onJump(c.tab, c.rowId, c.field)}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 20px', borderBottom: '1px solid rgba(255,255,255,0.025)', cursor: 'pointer' }}
                                    >
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'rgba(237,237,237,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                                                {c.memberName}
                                                <span style={{ fontWeight: 400, color: 'rgba(237,237,237,0.35)', marginLeft: 6 }}>· {c.fieldLabel}</span>
                                            </div>
                                            <div style={{ fontSize: '0.62rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ color: 'rgba(219,0,29,0.7)', textDecoration: 'line-through' }}>{fmtVal(c.oldValue)}</span>
                                                <span style={{ color: 'rgba(237,237,237,0.2)' }}>→</span>
                                                <span style={{ color: 'rgb(0,195,100)' }}>{fmtVal(c.newValue)}</span>
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)', flexShrink: 0 }}>↗</span>
                                    </div>
                                ))}
                            </div>
                        )
                    })}
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {error
                        ? <span style={{ fontSize: '0.65rem', color: 'var(--red)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{error}</span>
                        : <div style={{ flex: 1 }} />
                    }
                    <button onClick={onCancel} disabled={confirming} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 16px', cursor: confirming ? 'default' : 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: confirming ? 'rgba(237,237,237,0.25)' : 'rgba(237,237,237,0.6)' }}>
                        Discard All
                    </button>
                    <button onClick={onConfirm} disabled={confirming} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 16px', cursor: confirming ? 'default' : 'pointer', background: 'rgba(219,0,29,0.18)', border: '1px solid rgba(219,0,29,0.35)', color: confirming ? 'rgba(237,237,237,0.3)' : '#ededed' }}>
                        {confirming ? 'Applying…' : `Confirm ${list.length} Change${list.length !== 1 ? 's' : ''}`}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Main ───────────────────────────────────────────────────────────────────────

type FullTab = MastersheetSubTab | 'recycle'

export default function MasterSheetTab() {
    const [activeTab, setActiveTab] = useState<FullTab>('billet')
    const [activeSub, setActiveSub] = useState<MastersheetSubTab>('billet')
    const [pendingChanges, setPendingChanges] = useState<Map<string, PendingChange>>(new Map())
    const [reviewOpen, setReviewOpen] = useState(false)
    const [jumpTarget, setJumpTarget] = useState<{ tab: MastersheetSubTab; rowId: string; field: string } | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const [confirming, setConfirming] = useState(false)
    const [confirmError, setConfirmError] = useState<string | null>(null)

    const upsertChange = useCallback((change: PendingChange) => {
        setPendingChanges(m => { const n = new Map(m); n.set(change.id, change); return n })
    }, [])

    const removeChange = useCallback((id: string) => {
        setPendingChanges(m => { const n = new Map(m); n.delete(id); return n })
    }, [])

    const clearAll = useCallback(() => setPendingChanges(new Map()), [])

    function switchTab(t: FullTab) {
        setActiveTab(t)
        if (t !== 'recycle') setActiveSub(t as MastersheetSubTab)
    }

    async function handleConfirm() {
        setConfirming(true); setConfirmError(null)

        const endpointMap: Record<string, string> = {
            billet:     '/api/admin/j4/mastersheet/billet',
            leaving:    '/api/admin/j4/mastersheet/leaving-history',
            denied:     '/api/admin/j4/mastersheet/denied-applications',
            discipline: '/api/admin/j4/mastersheet/discipline',
        }

        const groups = new Map<string, { tab: string; rowId: string; body: Record<string, unknown> }>()
        for (const c of pendingChanges.values()) {
            const key = `${c.tab}:${c.rowId}`
            if (!groups.has(key)) groups.set(key, { tab: c.tab, rowId: c.rowId, body: {} })
            groups.get(key)!.body[c.field] = c.newValue
        }

        const errors: string[] = []
        for (const { tab, rowId, body } of groups.values()) {
            try {
                const res = await fetch(`${endpointMap[tab]}/${rowId}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
                })
                if (!res.ok) {
                    const d = await res.json().catch(() => ({}))
                    errors.push(d.error ?? `${tab} save failed`)
                }
            } catch { errors.push(`Network error (${tab})`) }
        }

        if (errors.length > 0) {
            setConfirmError(errors.join(' · '))
            setConfirming(false)
        } else {
            clearAll(); setReviewOpen(false); setRefreshKey(k => k + 1); setConfirming(false)
        }
    }

    function handleJump(tab: MastersheetSubTab, rowId: string, field: string) {
        setReviewOpen(false); switchTab(tab); setJumpTarget({ tab, rowId, field })
    }

    const ctxValue: MastersheetContextValue = {
        pendingChanges, upsertChange, removeChange, clearAll,
        reviewOpen, setReviewOpen,
        jumpTarget, setJumpTarget,
        activeSub, setActiveSub,
    }

    const tabs: { key: FullTab; label: string; sublabel: string }[] = [
        { key: 'billet',     label: 'Billet Mastersheet',  sublabel: 'Live member personnel data' },
        { key: 'leaving',    label: 'Leaving History',      sublabel: 'Discharge & departure records' },
        { key: 'denied',     label: 'Denied Applications',  sublabel: 'Rejected recruitment applications' },
        { key: 'discipline', label: 'Discipline',           sublabel: 'J4 / CHQ restricted' },
        { key: 'recycle',    label: 'Recycle Bin',          sublabel: 'Deleted records' },
    ]

    return (
        <MastersheetContext.Provider value={ctxValue}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0, padding: '24px 24px 32px' }}>

                {/* Header */}
                <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', marginBottom: 4 }}>
                            J4 — Administration
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                            HQ Mastersheet
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)' }}>
                            Personnel records and billet data. Import CSV files to sync data from HQ spreadsheets.
                        </div>
                    </div>

                    <button
                        onClick={() => { setConfirmError(null); setReviewOpen(true) }}
                        disabled={pendingChanges.size === 0}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 4,
                            fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                            padding: '8px 16px', cursor: pendingChanges.size === 0 ? 'default' : 'pointer',
                            background: pendingChanges.size > 0 ? 'rgba(219,0,29,0.18)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${pendingChanges.size > 0 ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.1)'}`,
                            color: pendingChanges.size > 0 ? '#ededed' : 'rgba(237,237,237,0.25)',
                            transition: 'all 0.15s',
                        }}
                    >
                        Apply Changes
                        {pendingChanges.size > 0 && (
                            <span style={{ background: RED, color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 2, minWidth: 18, textAlign: 'center' }}>
                                {pendingChanges.size}
                            </span>
                        )}
                    </button>
                </div>

                {/* Sub-tab selector */}
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(219,0,29,0.2)', marginBottom: 20 }}>
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => switchTab(t.key)} style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: '10px 20px',
                            borderBottom: activeTab === t.key ? `2px solid ${t.key === 'recycle' ? 'rgba(237,237,237,0.25)' : RED}` : '2px solid transparent',
                            marginBottom: -1, display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left',
                        }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: activeTab === t.key ? '#ededed' : 'rgba(237,237,237,0.4)' }}>
                                {t.label}
                            </span>
                            <span style={{ fontSize: '0.56rem', color: activeTab === t.key ? (t.key === 'recycle' ? 'rgba(237,237,237,0.25)' : 'rgba(219,0,29,0.6)') : 'rgba(237,237,237,0.2)', letterSpacing: '0.05em' }}>
                                {t.sublabel}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Content */}
                {activeTab === 'billet'     && <BilletMastersheetTab />}
                {activeTab === 'leaving'    && <LeavingHistoryTab refreshKey={refreshKey} />}
                {activeTab === 'denied'     && <DeniedApplicationsTab refreshKey={refreshKey} />}
                {activeTab === 'discipline' && <DisciplineTab refreshKey={refreshKey} />}
                {activeTab === 'recycle'    && <RecycleBinTab />}

            </div>

            {reviewOpen && (
                <ReviewModal
                    pendingChanges={pendingChanges}
                    onClose={() => setReviewOpen(false)}
                    onCancel={() => { clearAll(); setReviewOpen(false); setConfirmError(null) }}
                    onConfirm={handleConfirm}
                    confirming={confirming}
                    error={confirmError}
                    onJump={handleJump}
                />
            )}
        </MastersheetContext.Provider>
    )
}
