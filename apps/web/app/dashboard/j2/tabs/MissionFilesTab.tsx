'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
    Button, Typography, TextField, Chip, CircularProgress, Alert, Autocomplete,
} from '@mui/material'
import { Upload, Download, Delete } from '@mui/icons-material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'

type FileRow = MissionFileSubmission & { _id: string }
type OpOption = { id: string; title: string }

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(date: string | Date) {
    return new Date(date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.82rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.82rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}

const cardStyle = {
    border: '1px solid rgba(219,0,29,0.12)',
    background: 'rgba(255,255,255,0.015)',
    padding: '20px 24px',
}

const labelStyle = {
    fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2,
    textTransform: 'uppercase' as const, color: 'rgba(219,0,29,0.7)', marginBottom: 12,
}

const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '6px 12px', fontSize: '0.6rem',
    fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)',
}

const tdStyle: React.CSSProperties = { padding: '8px 12px', color: 'rgba(237,237,237,0.75)' }

export default function MissionFilesTab({ canManage }: { canManage: boolean }) {
    const [operations, setOperations] = useState<OpOption[]>([])
    const [selectedOp, setSelectedOp] = useState<OpOption | null>(null)
    const [files, setFiles] = useState<FileRow[]>([])
    const [loadingOps, setLoadingOps] = useState(true)
    const [loadingFiles, setLoadingFiles] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [note, setNote] = useState('')
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)
    const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/operations?status=all&limit=200')
            .then(r => r.json())
            .then(d => setOperations((d.operations ?? []).map((o: { _id: string; title: string }) => ({ id: o._id, title: o.title }))))
            .finally(() => setLoadingOps(false))
    }, [])

    const fetchFiles = useCallback(async (opId: string) => {
        setLoadingFiles(true)
        setFiles([])
        try {
            const res = await fetch(`/api/operations/${opId}/mission-files`)
            const data = await res.json()
            setFiles(data.files ?? [])
        } finally {
            setLoadingFiles(false)
        }
    }, [])

    useEffect(() => {
        if (selectedOp) fetchFiles(selectedOp.id)
        else setFiles([])
    }, [selectedOp, fetchFiles])

    async function handleUpload() {
        if (!selectedOp || !selectedFile) return
        setUploading(true)
        setUploadError(null)
        setUploadSuccess(null)
        try {
            const form = new FormData()
            form.append('file', selectedFile)
            if (note.trim()) form.append('note', note.trim())

            const res = await fetch(`/api/operations/${selectedOp.id}/mission-files`, { method: 'POST', body: form })
            const data = await res.json()
            if (!res.ok) { setUploadError(data.error || 'Upload failed'); return }

            setSelectedFile(null)
            setNote('')
            if (fileInputRef.current) fileInputRef.current.value = ''
            setUploadSuccess(`${data.file.originalName} (v${data.file.version}) uploaded successfully.`)
            fetchFiles(selectedOp.id)
        } finally {
            setUploading(false)
            setTimeout(() => { setUploadSuccess(null); setUploadError(null) }, 6000)
        }
    }

    async function handleDelete(fileId: string, fileName: string) {
        if (!selectedOp) return
        if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return
        setDeletingId(fileId)
        try {
            const res = await fetch(`/api/operations/${selectedOp.id}/mission-files/${fileId}`, { method: 'DELETE' })
            if (res.ok) fetchFiles(selectedOp.id)
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <div className='p-6 flex flex-col gap-5'>
            {/* Operation selector */}
            <div style={cardStyle}>
                <Typography style={labelStyle}>Select Operation</Typography>
                <Autocomplete
                    options={operations}
                    getOptionLabel={o => o.title}
                    value={selectedOp}
                    onChange={(_, v) => setSelectedOp(v)}
                    loading={loadingOps}
                    sx={{ maxWidth: 480, ...inputSx }}
                    renderInput={params => <TextField {...params} label='Operation' size='small' sx={inputSx} />}
                    size='small'
                />
            </div>

            {/* Upload form — only J2 leads/creators */}
            {canManage && selectedOp && (
                <div style={cardStyle}>
                    <Typography style={labelStyle}>Upload Mission File</Typography>
                    <Typography style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.45)', marginBottom: 12 }}>
                        Allowed file types: .pbo, .html, .htm, .zip — maximum 50 MB per file.
                    </Typography>
                    <div className='flex flex-col gap-3'>
                        <input
                            ref={fileInputRef}
                            type='file'
                            accept='.pbo,.html,.htm,.zip'
                            style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.7)' }}
                            onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                        />
                        {selectedFile && (
                            <Typography style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.5)' }}>
                                {selectedFile.name} — {formatBytes(selectedFile.size)}
                            </Typography>
                        )}
                        <TextField
                            label='Note (optional)'
                            size='small'
                            sx={{ maxWidth: 480, ...inputSx }}
                            value={note}
                            onChange={e => setNote(e.target.value)}
                        />
                        {uploadError && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{uploadError}</Alert>}
                        {uploadSuccess && <Alert severity='success' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{uploadSuccess}</Alert>}
                        <div>
                            <Button
                                variant='outlined'
                                size='small'
                                startIcon={uploading ? <CircularProgress size={14} /> : <Upload sx={{ fontSize: 14 }} />}
                                disabled={!selectedFile || uploading}
                                onClick={handleUpload}
                                sx={{
                                    borderRadius: 0, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em',
                                    borderColor: 'rgba(219,0,29,0.27)', color: 'var(--red)',
                                    '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' },
                                    '&:disabled': { opacity: 0.4 },
                                }}
                            >
                                {uploading ? 'Uploading…' : 'Upload File'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* File list */}
            {selectedOp && (
                <div style={cardStyle}>
                    <Typography style={labelStyle}>Uploaded Files — {selectedOp.title}</Typography>
                    {loadingFiles ? (
                        <TacticalSkeleton rows={4} className='px-4' />
                    ) : files.length === 0 ? (
                        <Typography style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.3)', padding: '16px 0' }}>
                            No mission files uploaded for this operation.
                        </Typography>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                                        {['File', 'Ver', 'Size', 'Note', 'Uploaded By', 'Date', ''].map(h => (
                                            <th key={h} style={thStyle}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {files.map(f => (
                                        <tr key={f._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <td style={tdStyle}>
                                                <span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{f.originalName}</span>
                                            </td>
                                            <td style={{ padding: '8px 12px' }}>
                                                <Chip label={`v${f.version}`} size='small' sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, height: 20, borderRadius: '2px', background: 'rgba(219,0,29,0.18)', color: 'var(--red)' }} />
                                            </td>
                                            <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.45)' }}>{formatBytes(f.size)}</td>
                                            <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.45)', maxWidth: 200 }}>
                                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.note || '—'}</span>
                                            </td>
                                            <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.55)' }}>{f.uploadedByName}</td>
                                            <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.45)' }}>{formatDate(f.uploadedAt)}</td>
                                            <td style={{ padding: '8px 12px' }}>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <a href={`/api/operations/${selectedOp.id}/mission-files/${f._id}`} download={f.originalName}>
                                                        <Button size='small' variant='outlined' startIcon={<Download sx={{ fontSize: 12 }} />} sx={{ borderRadius: 0, fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, minWidth: 0, padding: '2px 8px', borderColor: 'rgba(219,0,29,0.27)', color: 'rgba(237,237,237,0.6)', '&:hover': { borderColor: 'rgba(219,0,29,0.5)' } }}>
                                                            DL
                                                        </Button>
                                                    </a>
                                                    {canManage && (
                                                        <Button
                                                            size='small'
                                                            variant='outlined'
                                                            startIcon={deletingId === f._id ? <CircularProgress size={10} /> : <Delete sx={{ fontSize: 12 }} />}
                                                            disabled={deletingId === f._id}
                                                            onClick={() => handleDelete(f._id, f.originalName)}
                                                            sx={{ borderRadius: 0, fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, minWidth: 0, padding: '2px 8px', borderColor: 'rgba(219,0,29,0.27)', color: 'rgba(219,0,29,0.7)', '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' }, '&:disabled': { opacity: 0.4 } }}
                                                        >
                                                            Del
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
