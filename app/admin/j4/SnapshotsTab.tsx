'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Typography, CircularProgress, Dialog, DialogContent } from '@mui/material'
import CornerBrackets from '@/app/admin/_components/CornerBrackets'

// ── Duration history (localStorage) ──────────────────────────────────────────

const DURATION_KEY = 'snapshot_op_durations'

type DurationHistory = { create: number[]; revert: number[] }

function loadHistory(): DurationHistory {
    try {
        const raw = localStorage.getItem(DURATION_KEY)
        return raw ? JSON.parse(raw) as DurationHistory : { create: [], revert: [] }
    } catch { return { create: [], revert: [] } }
}

function recordDuration(type: 'create' | 'revert', secs: number) {
    const h = loadHistory()
    if (!h.create) h.create = []
    if (!h.revert) h.revert = []
    h[type].push(Math.round(secs))
    h[type] = h[type].slice(-5)  // keep last 5
    try { localStorage.setItem(DURATION_KEY, JSON.stringify(h)) } catch {}
}

function getEstimate(type: 'create' | 'revert'): number {
    const h = loadHistory()
    const times = (h[type] ?? []).slice(-3)
    if (times.length === 0) return type === 'create' ? 90 : 45
    return times.reduce((a, b) => a + b, 0) / times.length
}

function fmtTime(secs: number): string {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${String(s).padStart(2, '0')}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SnapshotInfo {
    filename: string
    createdAt: string
    sizeBytes: number
    sizeHuman: string
}

interface SnapshotStatus {
    state: 'idle' | 'creating' | 'reverting'
    startedAt?: string
    message?: string
    error?: string
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({ open, title, body, danger, onConfirm, onCancel }: {
    open: boolean
    title: string
    body: string
    danger?: boolean
    onConfirm: () => void
    onCancel: () => void
}) {
    return (
        <Dialog
            open={open}
            onClose={onCancel}
            PaperProps={{
                style: {
                    background: '#111',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    borderRadius: 0,
                    minWidth: 420,
                    maxWidth: 520,
                    color: '#ededed',
                },
            }}
        >
            <DialogContent style={{ padding: '28px 28px 24px' }}>
                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3}
                    style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    J4 — Administration
                </Typography>
                <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={2}
                    style={{ textTransform: 'uppercase', marginBottom: 16 }}>
                    {title}
                </Typography>
                <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.7)', marginBottom: 24, lineHeight: 1.6 }}>
                    {body}
                </Typography>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            background: 'none',
                            border: '1px solid rgba(237,237,237,0.15)',
                            color: 'rgba(237,237,237,0.6)',
                            padding: '7px 18px',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                            letterSpacing: 1,
                        }}
                    >
                        CANCEL
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            background: danger ? 'rgba(219,0,29,0.3)' : 'rgba(255,255,255,0.08)',
                            border: `1px solid ${danger ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.2)'}`,
                            color: '#ededed',
                            padding: '7px 18px',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                            letterSpacing: 1,
                        }}
                    >
                        CONFIRM
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function SnapshotsTab() {
    const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([])
    const [status, setStatus]       = useState<SnapshotStatus>({ state: 'idle' })
    const [loading, setLoading]     = useState(true)
    const [error, setError]         = useState<string | null>(null)
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const [uploading, setUploading]   = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null)

    const [elapsed, setElapsed] = useState(0)
    const prevBusy   = useRef(false)
    const opStartMs  = useRef(0)
    const opTypeRef  = useRef<'create' | 'revert'>('create')

    const [cancelling, setCancelling] = useState(false)

    const [confirm, setConfirm] = useState<{
        open: boolean
        title: string
        body: string
        danger?: boolean
        action: (() => void) | null
    }>({ open: false, title: '', body: '', action: null })

    const busy = status.state !== 'idle'

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/snapshots')
            if (!res.ok) throw new Error('Failed to load')
            const data = await res.json()
            setSnapshots(data.snapshots ?? [])
            setStatus(data.status ?? { state: 'idle' })
            setError(null)
        } catch {
            setError('Failed to load snapshots.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchData() }, [fetchData])

    // Poll every 3s while an operation is in progress
    useEffect(() => {
        if (status.state !== 'idle') {
            if (!pollRef.current) pollRef.current = setInterval(fetchData, 3000)
        } else {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        }
        return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
    }, [status.state, fetchData])

    // Record duration when operation completes; set start time when it begins
    useEffect(() => {
        if (busy && !prevBusy.current) {
            opStartMs.current = status.startedAt ? new Date(status.startedAt).getTime() : Date.now()
            opTypeRef.current = status.state === 'creating' ? 'create' : 'revert'
        }
        if (!busy && prevBusy.current && opStartMs.current) {
            const secs = (Date.now() - opStartMs.current) / 1000
            if (secs > 2) recordDuration(opTypeRef.current, secs)
        }
        prevBusy.current = busy
    }, [busy, status.state, status.startedAt])

    // Sub-second ticker for smooth progress bar
    useEffect(() => {
        if (!busy) { setElapsed(0); return }
        const startMs = status.startedAt ? new Date(status.startedAt).getTime() : Date.now()
        const id = setInterval(() => setElapsed((Date.now() - startMs) / 1000), 200)
        return () => clearInterval(id)
    }, [busy, status.startedAt])

    function openConfirm(title: string, body: string, action: () => void, danger = false) {
        setConfirm({ open: true, title, body, danger, action })
    }

    function closeConfirm() {
        setConfirm(c => ({ ...c, open: false, action: null }))
    }

    async function handleForceReset() {
        openConfirm(
            'Force Reset Status',
            'This will reset the in-progress status immediately. If a background operation is still running it may finish silently or leave a partial .tmp file (cleaned up automatically after 2 hours). Only use this if the operation appears stuck.',
            async () => {
                setCancelling(true)
                try {
                    const res = await fetch('/api/snapshots/cancel', { method: 'POST' })
                    const data = await res.json()
                    if (!res.ok) setError(data.error ?? 'Reset failed')
                    else fetchData()
                } finally {
                    setCancelling(false)
                }
            },
            true
        )
    }

    async function handleCreate() {
        openConfirm(
            'Create Snapshot',
            'This will export the entire database and all media files. It may take several minutes depending on gallery size. Continue?',
            async () => {
                const res = await fetch('/api/snapshots/create', { method: 'POST' })
                const data = await res.json()
                if (!res.ok) setError(data.error ?? 'Failed to start')
                else fetchData()
            }
        )
    }

    async function handleRevert(filename: string) {
        openConfirm(
            'Revert to Snapshot',
            `This will DROP all database collections and overwrite all media files using "${filename}". The current state cannot be recovered unless you have another snapshot. Are you sure?`,
            async () => {
                const res = await fetch('/api/snapshots/revert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename }),
                })
                const data = await res.json()
                if (!res.ok) setError(data.error ?? 'Failed to start revert')
                else fetchData()
            },
            true
        )
    }

    async function handleDelete(filename: string) {
        openConfirm(
            'Delete Snapshot',
            `Permanently delete "${filename}"? This cannot be undone.`,
            async () => {
                const res = await fetch(`/api/snapshots/${encodeURIComponent(filename)}`, { method: 'DELETE' })
                const data = await res.json()
                if (!res.ok) setError(data.error ?? 'Failed to delete')
                else fetchData()
            },
            true
        )
    }

    async function handleUploadRevert() {
        if (!uploadFile) return
        openConfirm(
            'Upload & Revert',
            `Upload "${uploadFile.name}" and revert the entire database and media to it? This will DROP all current data. This cannot be undone.`,
            async () => {
                setUploading(true)
                setError(null)
                try {
                    const form = new FormData()
                    form.append('snapshot', uploadFile)
                    const res = await fetch('/api/snapshots/upload', { method: 'POST', body: form })
                    const data = await res.json()
                    if (!res.ok) setError(data.error ?? 'Upload failed')
                    else {
                        setUploadFile(null)
                        if (fileInputRef.current) fileInputRef.current.value = ''
                        fetchData()
                    }
                } catch {
                    setError('Network error during upload.')
                } finally {
                    setUploading(false)
                }
            },
            true
        )
    }

    const rowBtnSx = (accent?: 'red' | 'green'): React.CSSProperties => ({
        fontSize: '0.62rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '3px 16px',
        cursor: busy ? 'not-allowed' : 'pointer',
        border: `1px solid ${accent === 'red' ? 'rgba(219,0,29,0.3)' : accent === 'green' ? 'rgba(0,195,100,0.3)' : 'rgba(219,0,29,0.25)'}`,
        color: busy
            ? 'rgba(237,237,237,0.2)'
            : accent === 'red'
                ? 'rgba(219,0,29,0.8)'
                : accent === 'green'
                    ? 'rgba(0,195,100,0.8)'
                    : 'rgba(237,237,237,0.75)',
        background: 'none',
        whiteSpace: 'nowrap' as const,
        width: '100%',
        display: 'inline-flex' as const,
        alignItems: 'center',
        justifyContent: 'center',
    })

    return (
        <div className='p-6 md:p-10 flex flex-col gap-6 max-w-[960px]'>

            {/* Header */}
            <div
                style={{
                    position: 'relative',
                    border: '1px solid rgba(219,0,29,0.42)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.04)',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <CornerBrackets />
                <div>
                    <Typography fontSize='0.52rem' fontWeight={700} letterSpacing={3}
                        style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 2, fontFamily: 'monospace' }}>
                        <span style={{ color: 'rgba(219,0,29,0.35)' }}>{'//'}</span> J4 — Administration
                    </Typography>
                    <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        Snapshots
                    </Typography>
                </div>
                <button
                    onClick={handleCreate}
                    disabled={busy}
                    style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        padding: '8px 20px',
                        background: busy ? 'none' : 'rgba(219,0,29,0.2)',
                        border: '1px solid rgba(219,0,29,0.4)',
                        color: busy ? 'rgba(237,237,237,0.3)' : '#ededed',
                        cursor: busy ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    {busy && <CircularProgress size={12} style={{ color: 'rgba(237,237,237,0.4)' }} />}
                    {busy ? 'IN PROGRESS…' : '+ CREATE SNAPSHOT'}
                </button>
            </div>

            {/* Progress banner */}
            {(busy || status.error) && (() => {
                const opType  = status.state === 'creating' ? 'create' : 'revert'
                const estimate = getEstimate(opType)
                const pct     = busy ? Math.min(96, (elapsed / estimate) * 100) : 0
                const remaining = Math.max(0, Math.ceil(estimate - elapsed))
                const almostDone = elapsed > estimate * 0.9

                return status.error ? (
                    <div style={{
                        padding: '10px 16px',
                        background: 'rgba(219,0,29,0.1)',
                        border: '1px solid rgba(219,0,29,0.4)',
                        fontSize: '0.78rem',
                        color: 'rgba(219,0,29,0.9)',
                    }}>
                        Error: {status.error}
                    </div>
                ) : (
                    <div style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,200,0,0.15)',
                        overflow: 'hidden',
                    }}>
                        {/* Progress bar */}
                        <div style={{ position: 'relative', height: 3, background: 'rgba(255,255,255,0.06)' }}>
                            <div style={{
                                position: 'absolute', left: 0, top: 0, bottom: 0,
                                width: `${pct}%`,
                                background: almostDone ? 'rgba(0,200,80,0.7)' : 'rgba(219,160,0,0.8)',
                                transition: 'width 0.4s ease, background 0.6s ease',
                            }} />
                        </div>

                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            gap: 12,
                            flexWrap: 'wrap',
                        }}>
                            {/* Left: label + phase */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <CircularProgress size={13} style={{ color: 'rgba(219,160,0,0.7)', flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.7)' }}>
                                        {status.state === 'creating' ? 'Creating Snapshot' : 'Reverting to Snapshot'}
                                    </div>
                                    {status.message && (
                                        <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', marginTop: 1, letterSpacing: '0.04em' }}>
                                            {status.message}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right: times + percentage + cancel */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0 }}>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', marginBottom: 1 }}>
                                        Elapsed
                                    </div>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: 'monospace', color: 'rgba(237,237,237,0.6)' }}>
                                        {fmtTime(elapsed)}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', marginBottom: 1 }}>
                                        Est. Remaining
                                    </div>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: 'monospace', color: almostDone ? 'rgba(0,200,80,0.75)' : 'rgba(219,160,0,0.85)' }}>
                                        {almostDone ? 'Almost done…' : `~${fmtTime(remaining)}`}
                                    </div>
                                </div>
                                <div style={{
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    fontFamily: 'monospace',
                                    color: almostDone ? 'rgba(0,200,80,0.75)' : 'rgba(219,160,0,0.85)',
                                    minWidth: 44,
                                    textAlign: 'right',
                                }}>
                                    {Math.round(pct)}%
                                </div>
                                <button
                                    onClick={handleForceReset}
                                    disabled={cancelling}
                                    title='Force-reset stuck operation'
                                    style={{
                                        fontSize: '0.6rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.12em',
                                        textTransform: 'uppercase',
                                        padding: '4px 10px',
                                        background: 'none',
                                        border: '1px solid rgba(219,0,29,0.35)',
                                        color: cancelling ? 'rgba(219,0,29,0.3)' : 'rgba(219,0,29,0.7)',
                                        cursor: cancelling ? 'not-allowed' : 'pointer',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {cancelling ? '…' : 'Force Reset'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* Error */}
            {error && (
                <Typography fontSize='0.75rem' style={{ color: '#ff4444' }}>{error}</Typography>
            )}

            {/* Snapshot list */}
            <div>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3}
                    style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 10 }}>
                    Stored Snapshots ({snapshots.length} / {5})
                </Typography>

                {loading && (
                    <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress size={24} style={{ color: 'rgba(219,0,29,0.6)' }} />
                    </div>
                )}

                {!loading && snapshots.length === 0 && (
                    <Typography fontSize='0.8rem' style={{ color: 'rgba(237,237,237,0.3)', padding: '12px 0' }}>
                        No snapshots stored yet.
                    </Typography>
                )}

                {snapshots.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {/* Column header */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 160px 90px 80px 70px 65px',
                            gap: 8,
                            padding: '5px 12px',
                            fontSize: '0.58rem',
                            fontWeight: 700,
                            letterSpacing: 2,
                            textTransform: 'uppercase',
                            color: 'rgba(237,237,237,0.25)',
                        }}>
                            <span>Filename</span>
                            <span>Created</span>
                            <span>Size</span>
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>

                        {[...snapshots].reverse().map(s => (
                            <div key={s.filename} style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 160px 90px 80px 70px 65px',
                                gap: 8,
                                alignItems: 'center',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.05)',
                            }}>
                                <span style={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.7rem',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    color: 'rgba(237,237,237,0.85)',
                                }}>
                                    {s.filename}
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.45)' }}>
                                    {new Date(s.createdAt).toLocaleString()}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.55)', fontFamily: 'monospace' }}>
                                    {s.sizeHuman}
                                </span>
                                <a
                                    href={busy ? undefined : `/api/snapshots/${encodeURIComponent(s.filename)}/download`}
                                    download={s.filename}
                                    onClick={e => { if (busy) e.preventDefault() }}
                                    style={{
                                        ...rowBtnSx('green'),
                                        textDecoration: 'none',
                                        textAlign: 'center',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    Download
                                </a>
                                <button
                                    onClick={() => handleRevert(s.filename)}
                                    disabled={busy}
                                    style={rowBtnSx()}
                                >
                                    Revert
                                </button>
                                <button
                                    onClick={() => handleDelete(s.filename)}
                                    disabled={busy}
                                    style={rowBtnSx('red')}
                                >
                                    Delete
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Upload & revert */}
            <div style={{ borderTop: '1px solid rgba(219,0,29,0.12)', paddingTop: 20 }}>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3}
                    style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 12 }}>
                    Upload & Revert
                </Typography>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{
                        border: '1px solid rgba(219,0,29,0.25)',
                        padding: '6px 14px',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                        letterSpacing: 1,
                        color: uploadFile ? '#ededed' : 'rgba(237,237,237,0.35)',
                        background: 'rgba(255,255,255,0.03)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                    }}>
                        {uploadFile ? uploadFile.name : 'Choose File (.zip)'}
                        <input
                            ref={fileInputRef}
                            type='file'
                            accept='.zip'
                            style={{ display: 'none' }}
                            onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                        />
                    </label>

                    <button
                        onClick={handleUploadRevert}
                        disabled={!uploadFile || busy || uploading}
                        style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            padding: '6px 18px',
                            background: (!uploadFile || busy || uploading) ? 'none' : 'rgba(219,0,29,0.2)',
                            border: '1px solid rgba(219,0,29,0.4)',
                            color: (!uploadFile || busy || uploading) ? 'rgba(237,237,237,0.25)' : '#ededed',
                            cursor: (!uploadFile || busy || uploading) ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}
                    >
                        {uploading && <CircularProgress size={12} style={{ color: 'rgba(237,237,237,0.4)' }} />}
                        {uploading ? 'Uploading…' : 'Upload & Revert'}
                    </button>
                </div>
                <Typography fontSize='0.68rem' style={{ color: 'rgba(237,237,237,0.25)', marginTop: 8 }}>
                    Upload a previously downloaded snapshot ZIP to restore the website to that state.
                </Typography>
            </div>

            {/* Confirm dialog */}
            <ConfirmDialog
                open={confirm.open}
                title={confirm.title}
                body={confirm.body}
                danger={confirm.danger}
                onConfirm={() => {
                    const action = confirm.action
                    closeConfirm()
                    action?.()
                }}
                onCancel={closeConfirm}
            />
        </div>
    )
}
