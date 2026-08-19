'use client'

import { useState, useRef } from 'react'
import { Typography, CircularProgress } from '@mui/material'
import { UploadFile, CheckCircle, Warning, OpenInNew } from '@mui/icons-material'
import Link from 'next/link'

interface ImportResult {
    guideId: string
    docRef: string
    title: string
    teachingPointCount: number
    warnings: string[]
}

export default function TrainingGuideImportTab() {
    const [dragging, setDragging] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [result, setResult] = useState<ImportResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    function selectFile(f: File) {
        if (!f.name.toLowerCase().endsWith('.docx')) {
            setError('File must be a .docx document')
            return
        }
        setFile(f)
        setResult(null)
        setError(null)
    }

    async function upload() {
        if (!file) return
        setUploading(true)
        setError(null)
        setResult(null)

        const form = new FormData()
        form.append('file', file)

        try {
            const res = await fetch('/api/training-guides/import', { method: 'POST', body: form })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error || 'Import failed')
            } else {
                setResult(data as ImportResult)
                setFile(null)
            }
        } catch {
            setError('Network error — please try again')
        } finally {
            setUploading(false)
        }
    }

    return (
        <div style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>

            {/* Instructions */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '14px 18px' }}>
                <Typography fontSize='0.68rem' fontWeight={700} letterSpacing='0.12em' sx={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', mb: 1 }}>
                    How to Import
                </Typography>
                <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.55)', lineHeight: 1.7 }}>
                    1. Use the ASOT Training Guide template to write your guide in Google Docs or Microsoft Word.<br />
                    2. Export / download as <strong style={{ color: 'rgba(237,237,237,0.75)' }}>.docx</strong> format.<br />
                    3. Upload the file below — the guide is created as a <strong style={{ color: 'rgba(237,237,237,0.75)' }}>draft</strong> and opens in the Training Hub editor.<br />
                    4. Assign a Training Type and review content before submitting for approval.
                </Typography>
                <Typography fontSize='0.65rem' sx={{ color: 'rgba(237,237,237,0.3)', mt: 1.5, fontStyle: 'italic' }}>
                    Note: images are not imported — add them manually in the editor after import.
                </Typography>
            </div>

            {/* Drop zone */}
            <div
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                    e.preventDefault()
                    setDragging(false)
                    const f = e.dataTransfer.files[0]
                    if (f) selectFile(f)
                }}
                style={{
                    border: `2px dashed ${dragging ? 'rgba(219,0,29,0.6)' : file ? 'color-mix(in srgb, var(--live) 50%, transparent)' : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: 4,
                    padding: '36px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    background: dragging ? 'rgba(219,0,29,0.04)' : file ? 'color-mix(in srgb, var(--live) 4%, transparent)' : 'transparent',
                    transition: 'all 0.15s',
                }}
            >
                <input
                    ref={inputRef}
                    type='file'
                    accept='.docx'
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f) }}
                />
                <UploadFile sx={{ fontSize: 32, color: file ? 'color-mix(in srgb, var(--live) 70%, transparent)' : 'rgba(237,237,237,0.25)' }} />
                {file ? (
                    <Typography fontSize='0.78rem' fontWeight={700} sx={{ color: 'color-mix(in srgb, var(--live) 85%, transparent)' }}>
                        {file.name}
                    </Typography>
                ) : (
                    <Typography fontSize='0.75rem' sx={{ color: 'rgba(237,237,237,0.35)', textAlign: 'center' }}>
                        Drop a .docx file here, or click to browse
                    </Typography>
                )}
                {file && (
                    <Typography fontSize='0.65rem' sx={{ color: 'rgba(237,237,237,0.3)' }}>
                        Click to choose a different file
                    </Typography>
                )}
            </div>

            {/* Error */}
            {error && (
                <div style={{ background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.3)', borderLeft: '3px solid var(--red)', padding: '10px 14px' }}>
                    <Typography fontSize='0.73rem' sx={{ color: 'rgba(237,237,237,0.7)' }}>
                        {error}
                    </Typography>
                </div>
            )}

            {/* Upload button */}
            {file && !uploading && (
                <button
                    onClick={upload}
                    style={{
                        background: 'rgba(219,0,29,0.15)',
                        border: '1px solid rgba(219,0,29,0.4)',
                        borderTop: '2px solid var(--red)',
                        color: 'rgba(237,237,237,0.85)',
                        padding: '10px 28px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        alignSelf: 'flex-start',
                    }}
                >
                    Import Training Guide
                </button>
            )}

            {/* Uploading */}
            {uploading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CircularProgress size={18} sx={{ color: 'rgba(219,0,29,0.7)' }} />
                    <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.45)' }}>
                        Parsing document and creating draft guide…
                    </Typography>
                </div>
            )}

            {/* Result */}
            {result && (
                <div style={{ background: 'color-mix(in srgb, var(--live) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--live) 25%, transparent)', borderLeft: '3px solid color-mix(in srgb, var(--live) 70%, transparent)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircle sx={{ fontSize: 16, color: 'color-mix(in srgb, var(--live) 80%, transparent)' }} />
                        <Typography fontSize='0.75rem' fontWeight={700} sx={{ color: 'color-mix(in srgb, var(--live) 90%, transparent)' }}>
                            Draft guide created
                        </Typography>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.8)' }}>
                            <span style={{ color: 'rgba(237,237,237,0.4)', marginRight: 8 }}>Title</span>
                            {result.title}
                        </Typography>
                        <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.8)' }}>
                            <span style={{ color: 'rgba(237,237,237,0.4)', marginRight: 8 }}>Ref</span>
                            {result.docRef}
                        </Typography>
                        <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.8)' }}>
                            <span style={{ color: 'rgba(237,237,237,0.4)', marginRight: 8 }}>Teaching Points</span>
                            {result.teachingPointCount}
                        </Typography>
                    </div>

                    {result.warnings.length > 0 && (
                        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <Warning sx={{ fontSize: 13, color: 'color-mix(in srgb, var(--amber) 70%, transparent)' }} />
                                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing='0.1em' sx={{ textTransform: 'uppercase', color: 'color-mix(in srgb, var(--amber) 70%, transparent)' }}>
                                    Import Warnings
                                </Typography>
                            </div>
                            {result.warnings.map((w, i) => (
                                <Typography key={i} fontSize='0.68rem' sx={{ color: 'rgba(237,237,237,0.45)', pl: 1 }}>
                                    — {w}
                                </Typography>
                            ))}
                        </div>
                    )}

                    <Link
                        href={`/dashboard/unit/training-hub/guide/${result.guideId}?from=j3`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, color: 'rgba(237,237,237,0.55)', textDecoration: 'none', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}
                    >
                        <OpenInNew sx={{ fontSize: 13 }} />
                        Open in J3 Training Hub
                    </Link>
                </div>
            )}
        </div>
    )
}
