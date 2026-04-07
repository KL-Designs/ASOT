'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type OpSummary = {
    _id: string
    title: string
    date: string
    status: string
    zeusNotes?: string
}

const btnBase: React.CSSProperties = {
    background: 'none',
    border: '1px solid rgba(219,0,29,0.25)',
    color: 'rgba(237,237,237,0.4)',
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    padding: '3px 10px',
    cursor: 'pointer',
}

export default function ZeusNotesTab() {
    const [ops, setOps] = useState<OpSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [total, setTotal] = useState(0)
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [notes, setNotes] = useState('')
    const [draft, setDraft] = useState('')
    const [editing, setEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState(false)

    const fetchOps = useCallback(async (q: string, p: number) => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ page: String(p) })
            if (q) params.set('search', q)
            const res = await fetch(`/api/operations/zeus-notes?${params}`)
            const data = await res.json()
            setOps(data.operations ?? [])
            setTotalPages(data.pages ?? 1)
            setTotal(data.total ?? 0)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchOps('', 1) }, [fetchOps])

    function handleSearch(val: string) {
        setSearch(val)
        setPage(1)
        if (searchTimeout.current) clearTimeout(searchTimeout.current)
        searchTimeout.current = setTimeout(() => fetchOps(val.trim(), 1), 300)
    }

    function goToPage(p: number) {
        setPage(p)
        fetchOps(search.trim(), p)
    }

    function selectOp(op: OpSummary) {
        setSelectedId(op._id)
        const n = op.zeusNotes ?? ''
        setNotes(n)
        setDraft(n)
        setEditing(false)
        setSaveError(false)
    }

    async function handleSave() {
        setSaving(true)
        setSaveError(false)
        try {
            const res = await fetch('/api/operations/zeus-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedId, notes: draft }),
            })
            if (!res.ok) { setSaveError(true); return }
            setNotes(draft)
            setEditing(false)
            setOps(prev => prev.map(o => o._id === selectedId ? { ...o, zeusNotes: draft } : o))
        } catch {
            setSaveError(true)
        } finally {
            setSaving(false)
        }
    }

    function handleCancel() {
        setDraft(notes)
        setEditing(false)
        setSaveError(false)
    }

    const selectedOp = ops.find(o => o._id === selectedId) ?? null

    return (
        <div className='flex h-full min-h-0' style={{ padding: '16px 24px', gap: 16 }}>

            {/* Operation list */}
            <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Search */}
                <input
                    value={search}
                    onChange={e => handleSearch(e.target.value)}
                    placeholder='Search operations…'
                    style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(0,195,255,0.2)',
                        color: '#ededed',
                        fontSize: '0.78rem',
                        padding: '6px 10px',
                        outline: 'none',
                        boxSizing: 'border-box',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(0,195,255,0.5)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(0,195,255,0.2)')}
                />

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <button
                            onClick={() => goToPage(page - 1)}
                            disabled={page <= 1}
                            style={{ ...btnBase, opacity: page <= 1 ? 0.3 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
                        >
                            ← Prev
                        </button>
                        <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.05em', textAlign: 'center' }}>
                            {page} / {totalPages}
                            <span style={{ display: 'block', fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)' }}>{total} total</span>
                        </span>
                        <button
                            onClick={() => goToPage(page + 1)}
                            disabled={page >= totalPages}
                            style={{ ...btnBase, opacity: page >= totalPages ? 0.3 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
                        >
                            Next →
                        </button>
                    </div>
                )}

                {/* List */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {loading ? (
                        <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.25)', padding: '8px 2px' }}>Loading…</span>
                    ) : ops.length === 0 ? (
                        <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.25)', padding: '8px 2px' }}>No operations found.</span>
                    ) : ops.map(op => {
                        const isSelected = op._id === selectedId
                        const hasNotes = !!op.zeusNotes?.trim()
                        return (
                            <button
                                key={op._id}
                                onClick={() => selectOp(op)}
                                style={{
                                    textAlign: 'left',
                                    background: isSelected ? 'rgba(0,195,255,0.08)' : 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${isSelected ? 'rgba(0,195,255,0.35)' : 'rgba(255,255,255,0.06)'}`,
                                    padding: '8px 10px',
                                    cursor: 'pointer',
                                    transition: 'background 0.12s, border-color 0.12s',
                                }}
                                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,195,255,0.04)' }}
                                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.02)' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {hasNotes && (
                                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(0,195,255,0.7)', flexShrink: 0, boxShadow: '0 0 4px rgba(0,195,255,0.5)' }} />
                                    )}
                                    <span style={{ fontSize: '0.78rem', color: isSelected ? 'rgba(0,195,255,0.9)' : 'rgba(237,237,237,0.75)', lineHeight: 1.3, fontWeight: isSelected ? 600 : 400 }}>
                                        {op.title}
                                    </span>
                                </div>
                                <div style={{ marginTop: 3, fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.05em' }}>
                                    {op.date ? new Date(op.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                    {' · '}
                                    <span style={{ color: op.status === 'Completed' ? 'rgba(34,197,94,0.5)' : 'rgba(237,237,237,0.25)' }}>{op.status}</span>
                                </div>
                            </button>
                        )
                    })}
                </div>

            </div>

            {/* Notes panel */}
            <div style={{ flex: 1, minWidth: 0 }}>
                {!selectedOp ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200 }}>
                        <span style={{ fontSize: '0.78rem', color: 'rgba(0,195,255,0.25)', letterSpacing: '0.08em' }}>Select an operation to view or edit zeus notes.</span>
                    </div>
                ) : (
                    <div style={{ border: '1px solid rgba(0,195,255,0.2)', borderTop: '2px solid rgba(0,195,255,0.6)', background: 'rgba(0,195,255,0.02)', height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid rgba(0,195,255,0.1)', background: 'rgba(0,195,255,0.04)', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <div style={{ width: 6, height: 6, background: 'rgba(0,195,255,0.8)', flexShrink: 0, boxShadow: '0 0 6px rgba(0,195,255,0.8)' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {selectedOp.title}
                                </span>
                                <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(0,195,255,0.45)', flexShrink: 0 }}>
                                    // Zeus Notes
                                </span>
                            </div>
                            {!editing && (
                                <button
                                    onClick={() => { setDraft(notes); setEditing(true) }}
                                    style={{
                                        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                                        padding: '4px 12px', cursor: 'pointer', flexShrink: 0, marginLeft: 8,
                                        background: 'none', border: '1px solid rgba(0,195,255,0.3)', color: 'rgba(0,195,255,0.7)',
                                        transition: 'border-color 0.15s, color 0.15s',
                                    }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,195,255,0.7)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,195,255,1)' }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,195,255,0.3)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,195,255,0.7)' }}
                                >
                                    Edit
                                </button>
                            )}
                        </div>

                        {/* Body */}
                        <div style={{ padding: '14px 16px', flex: 1, minHeight: 0, overflow: 'auto' }}>
                            {saveError && (
                                <div style={{ marginBottom: 10, fontSize: '0.75rem', color: 'rgba(219,0,29,0.8)', padding: '6px 10px', border: '1px solid rgba(219,0,29,0.2)', background: 'rgba(219,0,29,0.05)' }}>
                                    Failed to save. Please try again.
                                </div>
                            )}
                            {editing ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <textarea
                                        value={draft}
                                        onChange={e => setDraft(e.target.value)}
                                        rows={10}
                                        placeholder='Enter zeus notes for this operation…'
                                        style={{
                                            width: '100%',
                                            background: 'rgba(0,195,255,0.03)',
                                            border: '1px solid rgba(0,195,255,0.25)',
                                            color: '#ededed',
                                            fontSize: '0.82rem',
                                            lineHeight: 1.6,
                                            padding: '10px 12px',
                                            resize: 'vertical',
                                            outline: 'none',
                                            fontFamily: 'inherit',
                                            boxSizing: 'border-box',
                                        }}
                                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(0,195,255,0.6)')}
                                        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(0,195,255,0.25)')}
                                    />
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                            onClick={handleSave}
                                            disabled={saving}
                                            style={{
                                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                                padding: '6px 18px', cursor: saving ? 'not-allowed' : 'pointer',
                                                background: saving ? 'rgba(0,195,255,0.1)' : 'rgba(0,195,255,0.15)',
                                                border: '1px solid rgba(0,195,255,0.4)',
                                                color: saving ? 'rgba(0,195,255,0.4)' : 'rgba(0,195,255,0.9)',
                                            }}
                                        >
                                            {saving ? 'Saving…' : 'Save'}
                                        </button>
                                        <button
                                            onClick={handleCancel}
                                            disabled={saving}
                                            style={{
                                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                                padding: '6px 18px', cursor: 'pointer',
                                                background: 'none',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                color: 'rgba(237,237,237,0.4)',
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : notes ? (
                                <p style={{ fontSize: '0.82rem', lineHeight: 1.7, color: 'rgba(237,237,237,0.8)', whiteSpace: 'pre-wrap', margin: 0 }}>
                                    {notes}
                                </p>
                            ) : (
                                <p style={{ fontSize: '0.78rem', color: 'rgba(0,195,255,0.3)', margin: 0, fontStyle: 'italic' }}>
                                    No zeus notes recorded. Click Edit to add notes.
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
