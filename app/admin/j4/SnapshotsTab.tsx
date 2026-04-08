'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Typography, CircularProgress, Dialog, DialogContent } from '@mui/material'
import CornerBrackets from '@/app/admin/_components/CornerBrackets'

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

    const [confirm, setConfirm] = useState<{
        open: boolean
        title: string
        body: string
        danger?: boolean
        action: (() => void) | null
    }>({ open: false, title: '', body: '', action: null })

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

    const busy = status.state !== 'idle'

    function openConfirm(title: string, body: string, action: () => void, danger = false) {
        setConfirm({ open: true, title, body, danger, action })
    }

    function closeConfirm() {
        setConfirm(c => ({ ...c, open: false, action: null }))
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
                        <span style={{ color: 'rgba(219,0,29,0.35)' }}>//</span> J4 — Administration
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

            {/* Status banner */}
            {(busy || status.error) && (
                <div style={{
                    padding: '10px 16px',
                    background: status.error ? 'rgba(219,0,29,0.1)' : 'rgba(255,200,0,0.06)',
                    border: `1px solid ${status.error ? 'rgba(219,0,29,0.4)' : 'rgba(255,200,0,0.2)'}`,
                    fontSize: '0.78rem',
                    color: status.error ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                }}>
                    {busy && <CircularProgress size={14} style={{ color: 'rgba(237,237,237,0.4)' }} />}
                    {status.error
                        ? `Error: ${status.error}`
                        : `${status.state === 'creating' ? 'Creating snapshot' : 'Reverting to snapshot'}… ${status.message ?? ''}`
                    }
                </div>
            )}

            {/* Error */}
            {error && (
                <Typography fontSize='0.75rem' style={{ color: '#ff4444' }}>{error}</Typography>
            )}

            {/* Snapshot list */}
            <div>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3}
                    style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 10 }}>
                    Stored Snapshots ({snapshots.length} / {6})
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
