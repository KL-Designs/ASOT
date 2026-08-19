'use client'

import { useState, useEffect, useRef } from 'react'
import { CheckCircle, Warning, Upload, Delete, Download } from '@mui/icons-material'

interface TFARPlugin {
    _id: string
    originalName: string
    storedName: string
    ext: string
    size: number
    uploadedAt: string
    uploadedBy: string
    isCurrent: boolean
}

function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function fmtDate(s: string): string {
    return new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function TFARPluginTab() {
    const [plugins, setPlugins] = useState<TFARPlugin[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)
    const [dragOver, setDragOver] = useState(false)

    async function load() {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/j1/tfar-plugin')
            const data = await res.json()
            if (res.ok) setPlugins(data.plugins ?? [])
            else setError(data.error ?? 'Failed to load plugins')
        } catch {
            setError('Network error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    async function upload(file: File) {
        if (!file) return
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
        if (ext !== '.ts3_plugin' && ext !== '.zip') {
            setError('Only .ts3_plugin and .zip files are allowed')
            return
        }
        setUploading(true)
        setError(null)
        setSuccess(null)
        try {
            const fd = new FormData()
            fd.append('file', file)
            const res = await fetch('/api/admin/j1/tfar-plugin', { method: 'POST', body: fd })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? 'Upload failed'); return }
            setSuccess(`${file.name} uploaded and set as current plugin.`)
            await load()
        } catch {
            setError('Upload failed — network error')
        } finally {
            setUploading(false)
            if (fileRef.current) fileRef.current.value = ''
        }
    }

    async function deletePlugin(storedName: string, id: string) {
        if (!confirm('Delete this plugin file? This cannot be undone.')) return
        setDeletingId(id)
        setError(null)
        try {
            const res = await fetch('/api/admin/j1/tfar-plugin', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ storedName }),
            })
            if (!res.ok) {
                const data = await res.json()
                setError(data.error ?? 'Delete failed')
                return
            }
            await load()
        } catch {
            setError('Delete failed — network error')
        } finally {
            setDeletingId(null)
        }
    }

    const current = plugins.find(p => p.isCurrent)

    return (
        <div style={{ padding: '24px 28px', maxWidth: 720 }}>
            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', marginBottom: 4, fontFamily: 'monospace' }}>
                {'// J1 LEADS ONLY'}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)', marginBottom: 4 }}>
                TFAR Plugin Management
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.35)', marginBottom: 24, lineHeight: 1.55 }}>
                Upload and manage the TFAR plugin file served to recruits during onboarding. The most recent upload is always used as the current download.
            </div>

            {/* Current plugin status */}
            <div style={{ marginBottom: 20, padding: '14px 16px', background: current ? 'rgba(0,195,100,0.04)' : 'rgba(245,158,11,0.04)', border: `1px solid ${current ? 'rgba(0,195,100,0.25)' : 'rgba(245,158,11,0.25)'}`, borderLeft: `3px solid ${current ? '#00c364' : 'var(--amber)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {current
                        ? <CheckCircle style={{ fontSize: 16, color: '#00c364', flexShrink: 0 }} />
                        : <Warning style={{ fontSize: 16, color: 'var(--amber)', flexShrink: 0 }} />
                    }
                    <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: current ? '#00c364' : 'var(--amber)', marginBottom: 2 }}>
                            {current ? `Current plugin: ${current.originalName}` : 'No plugin uploaded — recruits cannot download TFAR'}
                        </div>
                        {current && (
                            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)' }}>
                                {fmtBytes(current.size)} · Uploaded {fmtDate(current.uploadedAt)} by {current.uploadedBy}
                            </div>
                        )}
                    </div>
                    {current && (
                        <a href='/api/tfar/download' download style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00c364', background: 'rgba(0,195,100,0.08)', border: '1px solid rgba(0,195,100,0.3)', textDecoration: 'none', flexShrink: 0 }}>
                            <Download style={{ fontSize: 13 }} /> Test Download
                        </a>
                    )}
                </div>
            </div>

            {/* Upload zone */}
            <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) upload(f) }}
                style={{
                    marginBottom: 20, padding: '28px 24px', border: `2px dashed ${dragOver ? 'rgba(219,0,29,0.6)' : 'rgba(219,0,29,0.2)'}`,
                    background: dragOver ? 'rgba(219,0,29,0.05)' : 'rgba(255,255,255,0.01)',
                    textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
                }}
                onClick={() => fileRef.current?.click()}
            >
                <Upload style={{ fontSize: 28, color: 'rgba(219,0,29,0.4)', marginBottom: 8 }} />
                <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.55)', marginBottom: 4 }}>
                    {uploading ? 'Uploading…' : 'Drag & drop or click to upload'}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)' }}>
                    Accepted: .ts3_plugin, .zip
                </div>
                <input
                    ref={fileRef}
                    type='file'
                    accept='.ts3_plugin,.zip'
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }}
                />
            </div>

            {error && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(219,0,29,0.07)', border: '1px solid rgba(219,0,29,0.3)', fontSize: '0.78rem', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Warning style={{ fontSize: 15, flexShrink: 0 }} />{error}
                </div>
            )}
            {success && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(0,195,100,0.06)', border: '1px solid rgba(0,195,100,0.25)', fontSize: '0.78rem', color: '#00c364', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle style={{ fontSize: 15, flexShrink: 0 }} />{success}
                </div>
            )}

            {/* Plugin history */}
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.55)', marginBottom: 10 }}>
                Upload History
            </div>
            {loading ? (
                <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.3)', padding: '16px 0' }}>Loading…</div>
            ) : plugins.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic', padding: '12px 0' }}>
                    No plugins uploaded yet.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {plugins.map(p => (
                        <div key={p._id} style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                            background: p.isCurrent ? 'rgba(0,195,100,0.04)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${p.isCurrent ? 'rgba(0,195,100,0.2)' : 'rgba(255,255,255,0.06)'}`,
                            borderLeft: p.isCurrent ? '2px solid #00c364' : '2px solid transparent',
                        }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: p.isCurrent ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {p.originalName}
                                    </span>
                                    {p.isCurrent && (
                                        <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: '#00c364', background: 'rgba(0,195,100,0.1)', border: '1px solid rgba(0,195,100,0.3)', padding: '1px 6px', flexShrink: 0 }}>
                                            CURRENT
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                                    {fmtBytes(p.size)} · {fmtDate(p.uploadedAt)} · {p.uploadedBy}
                                </div>
                            </div>
                            <button
                                onClick={() => deletePlugin(p.storedName, p._id)}
                                disabled={deletingId === p._id}
                                style={{
                                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '5px 10px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
                                    background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)',
                                    color: 'rgba(219,0,29,0.7)', cursor: deletingId === p._id ? 'default' : 'pointer',
                                    opacity: deletingId === p._id ? 0.4 : 1,
                                }}
                            >
                                <Delete style={{ fontSize: 13 }} />
                                {deletingId === p._id ? 'DELETING…' : 'DELETE'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
