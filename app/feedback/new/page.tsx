'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BugReport, Lightbulb, AttachFile, Close, ArrowBack } from '@mui/icons-material'
import { CircularProgress } from '@mui/material'
import Link from 'next/link'

const MAX_FILES = 5
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']


export default function NewFeedbackPage() {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [type, setType] = useState<'bug' | 'feature'>('bug')
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [files, setFiles] = useState<File[]>([])
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)

    function handleFiles(incoming: FileList | null) {
        if (!incoming) return
        const next = [...files]
        for (const f of Array.from(incoming)) {
            if (next.length >= MAX_FILES) { setError(`Maximum ${MAX_FILES} attachments.`); break }
            if (!ALLOWED_TYPES.includes(f.type)) { setError('Only JPEG, PNG, and WebP images allowed.'); continue }
            if (f.size > MAX_FILE_SIZE) { setError('Each file must be under 5 MB.'); continue }
            if (!next.find(x => x.name === f.name && x.size === f.size)) next.push(f)
        }
        setFiles(next)
        setError('')
    }

    function removeFile(idx: number) {
        setFiles(files.filter((_, i) => i !== idx))
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        if (!title.trim()) return setError('Title is required.')
        if (!description.trim()) return setError('Description is required.')

        setSubmitting(true)
        const fd = new FormData()
        fd.append('title', title.trim())
        fd.append('type', type)
        fd.append('description', description.trim())
        for (const f of files) fd.append('attachments', f)

        const res = await fetch('/api/feedback', { method: 'POST', body: fd })
        const json = await res.json()
        setSubmitting(false)

        if (!res.ok) return setError(json.error ?? 'Submission failed.')
        router.push(`/feedback/${json._id}`)
    }

    return (
        <div className='flex flex-col gap-6 max-w-2xl'>
            <div className='flex items-center gap-3'>
                <Link href='/feedback'>
                    <button style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>
                        <ArrowBack style={{ fontSize: 16 }} /> Back
                    </button>
                </Link>
            </div>

            <div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--foreground)', marginBottom: 4 }}>
                    SUBMIT FEEDBACK
                </h1>
                <p style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.4)' }}>
                    Report a bug or request a new feature for the website.
                </p>
            </div>

            <form onSubmit={handleSubmit} className='flex flex-col gap-5'>

                {/* Type toggle */}
                <div>
                    <label style={labelStyle}>TYPE</label>
                    <div className='flex gap-3 mt-2'>
                        {([['bug', 'Bug Report', BugReport], ['feature', 'Feature Request', Lightbulb]] as const).map(([val, label, Icon]) => (
                            <button key={val} type='button' onClick={() => setType(val)} style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                padding: '10px 0', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontWeight: 600,
                                fontSize: '0.82rem', letterSpacing: '0.05em', transition: 'all 0.15s',
                                background: type === val
                                    ? (val === 'bug' ? 'rgba(219,0,29,0.12)' : 'rgba(255,160,0,0.1)')
                                    : 'rgba(255,255,255,0.02)',
                                borderColor: type === val
                                    ? (val === 'bug' ? 'rgba(219,0,29,0.5)' : 'rgba(255,160,0,0.5)')
                                    : 'rgba(255,255,255,0.08)',
                                color: type === val
                                    ? (val === 'bug' ? 'rgba(219,0,29,0.9)' : 'rgba(255,160,0,0.9)')
                                    : 'rgba(237,237,237,0.4)',
                            }}>
                                <Icon style={{ fontSize: 16 }} /> {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Title */}
                <div>
                    <label style={labelStyle}>TITLE</label>
                    <input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder='Brief summary of the issue or request'
                        maxLength={120}
                        style={inputStyle}
                    />
                </div>

                {/* Description */}
                <div>
                    <label style={labelStyle}>DESCRIPTION</label>
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder='Provide as much detail as possible. For bugs, include steps to reproduce.'
                        rows={7}
                        style={{ ...inputStyle, resize: 'vertical', minHeight: 120 }}
                    />
                </div>

                {/* Attachments */}
                <div>
                    <label style={labelStyle}>ATTACHMENTS <span style={{ opacity: 0.4, fontWeight: 400 }}>— optional, up to {MAX_FILES} images (JPEG/PNG/WebP, max 5 MB each)</span></label>
                    <input
                        ref={fileInputRef}
                        type='file'
                        multiple
                        accept='image/jpeg,image/png,image/webp'
                        style={{ display: 'none' }}
                        onChange={e => handleFiles(e.target.files)}
                    />
                    <button
                        type='button'
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
                            background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.15)',
                            borderRadius: 6, padding: '8px 14px', cursor: 'pointer',
                            fontSize: '0.8rem', color: 'rgba(237,237,237,0.5)', fontWeight: 500,
                        }}
                    >
                        <AttachFile style={{ fontSize: 16 }} /> Attach screenshots
                    </button>

                    {files.length > 0 && (
                        <div className='flex flex-wrap gap-2 mt-3'>
                            {files.map((f, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 5, padding: '4px 8px', fontSize: '0.75rem', color: 'rgba(237,237,237,0.6)',
                                }}>
                                    <img src={URL.createObjectURL(f)} alt='' style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 3 }} />
                                    <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                    <button type='button' onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', padding: 0, display: 'flex' }}>
                                        <Close style={{ fontSize: 14 }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {error && (
                    <p style={{ fontSize: '0.82rem', color: 'rgba(219,0,29,0.8)', background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.2)', borderRadius: 6, padding: '8px 12px' }}>
                        {error}
                    </p>
                )}

                <button
                    type='submit'
                    disabled={submitting}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        background: submitting ? 'rgba(219,0,29,0.06)' : 'rgba(219,0,29,0.12)',
                        border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(219,0,29,0.9)',
                        borderRadius: 6, padding: '10px 0', fontWeight: 700, fontSize: '0.82rem',
                        letterSpacing: '0.08em', cursor: submitting ? 'not-allowed' : 'pointer',
                        opacity: submitting ? 0.6 : 1, width: '100%',
                    }}
                >
                    {submitting ? <><CircularProgress size={14} style={{ color: 'rgba(219,0,29,0.7)' }} /> SUBMITTING…</> : 'SUBMIT'}
                </button>
            </form>
        </div>
    )
}

const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.4)',
}

const inputStyle: React.CSSProperties = {
    width: '100%', marginTop: 8, padding: '9px 12px',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6, color: 'rgba(237,237,237,0.85)', fontSize: '0.88rem', outline: 'none',
    boxSizing: 'border-box',
}
