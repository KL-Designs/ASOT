'use client'

import { useState, useEffect } from 'react'
import { CircularProgress } from '@mui/material'
import { Add, Delete, Edit, Check, Close } from '@mui/icons-material'

interface EraOption {
    _id: string
    name: string
    value: string
    order: number
    isDefault?: boolean
}

export default function EraOptionsTab() {
    const [options, setOptions]   = useState<EraOption[]>([])
    const [loading, setLoading]   = useState(true)
    const [saving, setSaving]     = useState(false)
    const [newName, setNewName]   = useState('')
    const [editId, setEditId]     = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [error, setError]       = useState<string | null>(null)

    const fetchOptions = async () => {
        try {
            const res = await fetch('/api/admin/era-options')
            if (res.ok) setOptions(await res.json())
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchOptions() }, [])

    const handleAdd = async () => {
        if (!newName.trim()) return
        setError(null)
        setSaving(true)
        try {
            const res = await fetch('/api/admin/era-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() }),
            })
            if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return }
            setNewName('')
            await fetchOptions()
        } finally {
            setSaving(false)
        }
    }

    const handleRename = async (id: string) => {
        if (!editName.trim()) return
        setSaving(true)
        try {
            await fetch('/api/admin/era-options', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name: editName.trim() }),
            })
            setEditId(null)
            await fetchOptions()
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        setSaving(true)
        try {
            await fetch(`/api/admin/era-options?id=${id}`, { method: 'DELETE' })
            await fetchOptions()
        } finally {
            setSaving(false)
        }
    }

    const rowStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
    }

    return (
        <div style={{ padding: '24px 28px', maxWidth: 560 }}>
            <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)' }}>
                    ERA Options
                </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)', marginBottom: 20 }}>
                Manage the list of ERA/setting options available in the operation editor. Default options cannot be deleted — only renamed.
            </p>

            {/* Add new */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <input
                    value={newName}
                    onChange={e => { setNewName(e.target.value); setError(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                    placeholder='New ERA option name…'
                    style={{
                        flex: 1,
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        color: 'rgba(237,237,237,0.85)',
                        borderRadius: 2,
                        padding: '7px 12px',
                        fontSize: '0.8rem',
                        outline: 'none',
                    }}
                />
                <button
                    onClick={handleAdd}
                    disabled={saving || !newName.trim()}
                    style={{
                        background: 'rgba(219,0,29,0.6)',
                        border: 'none',
                        color: '#fff',
                        padding: '7px 16px',
                        borderRadius: 2,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        cursor: saving || !newName.trim() ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        opacity: saving || !newName.trim() ? 0.5 : 1,
                    }}
                >
                    {saving ? <CircularProgress size={12} sx={{ color: '#fff' }} /> : <Add sx={{ fontSize: 16 }} />}
                    Add
                </button>
            </div>
            {error && <div style={{ marginBottom: 12, fontSize: '0.72rem', color: 'rgba(219,0,29,0.8)' }}>{error}</div>}

            {/* Option list */}
            <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderTop: '1px solid var(--line-2)' }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, padding: '5px 14px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>ERA Name</span>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', width: 28, textAlign: 'center' }}>Edit</span>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', width: 28, textAlign: 'center' }}>Del</span>
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                        <CircularProgress size={20} sx={{ color: 'rgba(255,255,255,0.3)' }} />
                    </div>
                ) : options.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', fontSize: '0.75rem', color: 'rgba(237,237,237,0.2)' }}>
                        No options found.
                    </div>
                ) : (
                    options.map(opt => (
                        <div key={opt._id} style={rowStyle}>
                            {/* Name / edit input */}
                            {editId === opt._id ? (
                                <input
                                    autoFocus
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleRename(opt._id)
                                        if (e.key === 'Escape') setEditId(null)
                                    }}
                                    style={{
                                        background: 'rgba(0,0,0,0.5)',
                                        border: '1px solid var(--line-2)',
                                        color: 'rgba(237,237,237,0.9)',
                                        borderRadius: 2,
                                        padding: '4px 8px',
                                        fontSize: '0.78rem',
                                        outline: 'none',
                                        width: '100%',
                                    }}
                                />
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.85)' }}>{opt.name}</span>
                                    {opt.isDefault && (
                                        <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', padding: '1px 6px' }}>
                                            Default
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Edit / confirm */}
                            {editId === opt._id ? (
                                <button
                                    onClick={() => handleRename(opt._id)}
                                    disabled={saving}
                                    style={{ background: 'none', border: 'none', color: '#4caf50', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
                                >
                                    <Check sx={{ fontSize: 16 }} />
                                </button>
                            ) : (
                                <button
                                    onClick={() => { setEditId(opt._id); setEditName(opt.name) }}
                                    style={{ background: 'none', border: 'none', color: 'rgba(237,237,237,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
                                >
                                    <Edit sx={{ fontSize: 15 }} />
                                </button>
                            )}

                            {/* Delete / cancel */}
                            {editId === opt._id ? (
                                <button
                                    onClick={() => setEditId(null)}
                                    style={{ background: 'none', border: 'none', color: 'rgba(237,237,237,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
                                >
                                    <Close sx={{ fontSize: 16 }} />
                                </button>
                            ) : (
                                <button
                                    onClick={() => !opt.isDefault && handleDelete(opt._id)}
                                    disabled={opt.isDefault || saving}
                                    title={opt.isDefault ? 'Default options cannot be deleted' : 'Delete'}
                                    style={{
                                        background: 'none', border: 'none',
                                        color: opt.isDefault ? 'rgba(237,237,237,0.1)' : 'rgba(219,0,29,0.5)',
                                        cursor: opt.isDefault ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', padding: 2,
                                    }}
                                >
                                    <Delete sx={{ fontSize: 15 }} />
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
