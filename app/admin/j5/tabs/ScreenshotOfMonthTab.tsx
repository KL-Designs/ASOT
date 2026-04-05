'use client'

import { useState, useEffect, useRef } from 'react'
import { Typography, TextField, LinearProgress } from '@mui/material'

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.82rem',
        color: '#ededed',
        background: 'rgba(255,255,255,0.02)',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.2)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.4)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.82rem', color: 'rgba(237,237,237,0.4)' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
    '& .MuiInputBase-input': { color: '#ededed' },
}

const cardStyle = {
    border: '1px solid rgba(219,0,29,0.12)',
    background: 'rgba(255,255,255,0.015)',
    padding: '20px 24px',
}

const labelStyle = {
    fontSize: '0.6rem',
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: 'rgba(219,0,29,0.7)',
    marginBottom: 12,
}

export default function ScreenshotOfMonthTab({ canManage }: { canManage: boolean }) {
    const [sotm, setSotm] = useState<ScreenshotOfMonth | null | undefined>(undefined)
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [clearing, setClearing] = useState(false)
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

    // Form state
    const [file, setFile] = useState<File | null>(null)
    const [dateTaken, setDateTaken] = useState('')
    const [credit, setCredit] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    function showFeedback(type: 'success' | 'error', msg: string) {
        setFeedback({ type, msg })
        setTimeout(() => setFeedback(null), 5000)
    }

    async function fetchSotm() {
        setLoading(true)
        try {
            const res = await fetch('/api/gallery/sotm')
            const data = await res.json()
            setSotm(data ?? null)
        } catch {
            setSotm(null)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchSotm() }, [])

    async function handleSubmit() {
        if (!file || !dateTaken || !credit.trim()) {
            showFeedback('error', 'Please fill in all fields and select an image.')
            return
        }
        setUploading(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('dateTaken', dateTaken)
            fd.append('credit', credit.trim())
            const res = await fetch('/api/gallery/sotm', { method: 'POST', body: fd })
            const data = await res.json()
            if (!res.ok) {
                showFeedback('error', data.error ?? 'Upload failed.')
            } else {
                showFeedback('success', 'Screenshot of the Month updated.')
                setFile(null)
                setDateTaken('')
                setCredit('')
                if (fileInputRef.current) fileInputRef.current.value = ''
                fetchSotm()
            }
        } catch {
            showFeedback('error', 'Network error. Please try again.')
        } finally {
            setUploading(false)
        }
    }

    async function handleClear() {
        setClearing(true)
        try {
            const res = await fetch('/api/gallery/sotm', { method: 'DELETE' })
            const data = await res.json()
            if (!res.ok) {
                showFeedback('error', data.error ?? 'Failed to clear.')
            } else {
                showFeedback('success', 'Screenshot of the Month cleared.')
                fetchSotm()
            }
        } catch {
            showFeedback('error', 'Network error. Please try again.')
        } finally {
            setClearing(false)
        }
    }

    return (
        <div className='p-6 flex flex-col gap-5 max-w-[800px]'>

            {(uploading) && (
                <LinearProgress sx={{
                    backgroundColor: 'rgba(219,0,29,0.1)',
                    '& .MuiLinearProgress-bar': { backgroundColor: 'var(--red)' },
                }} />
            )}

            {feedback && (
                <div style={{
                    padding: '8px 12px',
                    fontSize: '0.78rem',
                    background: feedback.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(219,0,29,0.08)',
                    border: `1px solid ${feedback.type === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(219,0,29,0.25)'}`,
                    color: feedback.type === 'success' ? 'rgba(34,197,94,0.9)' : 'rgba(219,0,29,0.9)',
                }}>
                    {feedback.msg}
                </div>
            )}

            {/* Current SOTM */}
            <div style={cardStyle}>
                <Typography style={labelStyle}>Current Screenshot of the Month</Typography>

                {loading ? (
                    <Typography style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.3)' }}>Loading…</Typography>
                ) : !sotm ? (
                    <Typography style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.3)', padding: '8px 0' }}>
                        No screenshot of the month set.
                    </Typography>
                ) : (
                    <div className='flex flex-col gap-4'>
                        {/* Preview */}
                        <div style={{ position: 'relative', maxWidth: 480, aspectRatio: '16/9', background: '#0a0a0a', border: '1px solid rgba(219,0,29,0.15)' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src='/api/gallery/sotm/image'
                                alt='Screenshot of the Month'
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                        </div>

                        {/* Metadata */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', minWidth: 80 }}>Date Taken</span>
                                <span style={{ fontSize: '0.82rem', color: '#ededed' }}>{sotm.dateTaken}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', minWidth: 80 }}>Credit</span>
                                <span style={{ fontSize: '0.82rem', color: '#ededed' }}>{sotm.credit}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', minWidth: 80 }}>Set</span>
                                <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)' }}>
                                    {new Date(sotm.setAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>

                        {canManage && (
                            <div>
                                <button
                                    onClick={handleClear}
                                    disabled={clearing}
                                    style={{
                                        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                        padding: '6px 16px', cursor: clearing ? 'not-allowed' : 'pointer',
                                        background: 'none',
                                        border: '1px solid rgba(219,0,29,0.3)',
                                        color: clearing ? 'rgba(219,0,29,0.3)' : 'rgba(219,0,29,0.7)',
                                    }}
                                >
                                    {clearing ? 'CLEARING…' : 'CLEAR SOTM'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Upload form — leads only */}
            {canManage && (
                <div style={cardStyle}>
                    <Typography style={labelStyle}>{sotm ? 'Replace Screenshot of the Month' : 'Set Screenshot of the Month'}</Typography>

                    <div className='flex flex-col gap-4'>
                        {/* File picker */}
                        <div>
                            <input
                                ref={fileInputRef}
                                type='file'
                                accept='image/jpeg,image/jpg,image/png,image/webp'
                                style={{ display: 'none' }}
                                onChange={e => setFile(e.target.files?.[0] ?? null)}
                            />
                            <div className='flex items-center gap-3'>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                        padding: '7px 16px', cursor: 'pointer',
                                        background: 'rgba(219,0,29,0.1)',
                                        border: '1px solid rgba(219,0,29,0.3)',
                                        color: 'rgba(219,0,29,0.8)',
                                    }}
                                >
                                    Choose Image
                                </button>
                                <span style={{ fontSize: '0.78rem', color: file ? 'rgba(237,237,237,0.6)' : 'rgba(237,237,237,0.25)' }}>
                                    {file ? file.name : 'No file selected'}
                                </span>
                            </div>
                        </div>

                        <div className='flex gap-4 flex-wrap'>
                            <TextField
                                label='Date Taken'
                                type='date'
                                value={dateTaken}
                                onChange={e => setDateTaken(e.target.value)}
                                size='small'
                                sx={{ ...inputSx, minWidth: 180 }}
                                slotProps={{ inputLabel: { shrink: true } }}
                            />
                            <TextField
                                label='Credit (photographer)'
                                value={credit}
                                onChange={e => setCredit(e.target.value)}
                                size='small'
                                sx={{ ...inputSx, flex: 1, minWidth: 200 }}
                                placeholder='e.g. Cpl. Smith'
                            />
                        </div>

                        <div>
                            <button
                                onClick={handleSubmit}
                                disabled={uploading || !file || !dateTaken || !credit.trim()}
                                style={{
                                    fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                    padding: '7px 20px',
                                    cursor: (uploading || !file || !dateTaken || !credit.trim()) ? 'not-allowed' : 'pointer',
                                    background: (uploading || !file || !dateTaken || !credit.trim()) ? 'rgba(219,0,29,0.2)' : 'var(--red)',
                                    border: '1px solid var(--red)',
                                    color: 'white',
                                    transition: 'background 0.15s',
                                }}
                            >
                                {uploading ? 'UPLOADING…' : 'SET AS SOTM'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
