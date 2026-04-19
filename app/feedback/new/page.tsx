'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BugReport, Lightbulb, AttachFile, Close, ArrowBack } from '@mui/icons-material'
import { CircularProgress } from '@mui/material'
import Link from 'next/link'

const MAX_FILES = 5
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const GUIDELINES = [
    'Search existing reports before submitting to avoid duplicates.',
    'Keep the title short and specific — one issue per report.',
    'For bugs, include steps to reproduce and what you expected vs what happened.',
    'Attach screenshots where relevant — they help a lot.',
    'This board is for the website only, not Discord or Arma 3.',
]


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
        <div className='flex flex-col gap-6'>

            {/* Back */}
            <Link href='/feedback'>
                <button style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'transparent', border: 'none',
                    color: 'rgba(237,237,237,0.35)', cursor: 'pointer',
                    fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', padding: 0,
                }}>
                    <ArrowBack style={{ fontSize: 14 }} /> BACK TO FEEDBACK
                </button>
            </Link>

            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>

                {/* ── SIDEBAR ── */}
                <aside style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>

                    {/* Branding block */}
                    <div style={{ background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)', padding: '14px 16px', marginBottom: 8 }}>
                        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.6)', marginBottom: 4 }}>
                            ASOT // PORTAL
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--foreground)' }}>
                            SUBMIT REPORT
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)', marginTop: 3, letterSpacing: '0.04em', lineHeight: 1.4 }}>
                            Website bugs &amp; improvements only
                        </div>
                    </div>

                    {/* Type selection */}
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.25)', marginBottom: 6, paddingLeft: 2 }}>
                            REPORT TYPE
                        </div>

                        {([
                            ['bug', 'Bug Report', BugReport, 'Something is broken or not working as expected.', 'rgba(219,0,29,0.9)', 'rgba(219,0,29,0.08)', 'rgba(219,0,29,0.35)'],
                            ['feature', 'Feature Request', Lightbulb, 'Suggest an improvement or new capability.', 'rgba(255,160,0,0.9)', 'rgba(255,160,0,0.07)', 'rgba(255,160,0,0.3)'],
                        ] as const).map(([val, label, Icon, desc, col, bg, border]) => (
                            <button
                                key={val}
                                type='button'
                                onClick={() => setType(val)}
                                style={{
                                    display: 'flex', flexDirection: 'column', gap: 4, width: '100%',
                                    padding: '10px 12px', marginBottom: 4, textAlign: 'left', cursor: 'pointer',
                                    background: type === val ? bg : 'transparent',
                                    border: 'none',
                                    borderLeft: `2px solid ${type === val ? col : 'transparent'}`,
                                    transition: 'all 0.12s',
                                }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: type === val ? col : 'rgba(237,237,237,0.5)' }}>
                                    <Icon style={{ fontSize: 13 }} /> {label}
                                </span>
                                <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.03em', lineHeight: 1.4 }}>
                                    {desc}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Guidelines */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 14 }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.25)', marginBottom: 10, paddingLeft: 2 }}>
                            GUIDELINES
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {GUIDELINES.map((g, i) => (
                                <div key={i} style={{ display: 'flex', gap: 8, paddingLeft: 4 }}>
                                    <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', fontWeight: 700, color: 'rgba(219,0,29,0.5)', marginTop: 1, flexShrink: 0 }}>
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', lineHeight: 1.5, letterSpacing: '0.02em' }}>
                                        {g}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                </aside>

                {/* ── FORM ── */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

                    {/* Title field */}
                    <FieldBlock label='TITLE' hint='Brief, specific summary'>
                        <input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder={type === 'bug' ? 'e.g. Avatar not loading on profile page' : 'e.g. Add dark mode to the calendar'}
                            maxLength={120}
                            style={inputStyle}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                            <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.2)' }}>
                                {title.length}/120
                            </span>
                        </div>
                    </FieldBlock>

                    {/* Description field */}
                    <FieldBlock
                        label='DESCRIPTION'
                        hint={type === 'bug' ? 'Steps to reproduce · Expected vs actual behaviour' : 'What it should do and why it would help'}
                    >
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder={
                                type === 'bug'
                                    ? '1. Go to...\n2. Click...\n3. Expected: ...\n   Actual: ...'
                                    : 'Describe the feature you\'d like to see and what problem it solves.'
                            }
                            rows={9}
                            style={{ ...inputStyle, resize: 'vertical', minHeight: 160 }}
                        />
                    </FieldBlock>

                    {/* Attachments */}
                    <FieldBlock label='ATTACHMENTS' hint={`Optional · up to ${MAX_FILES} images · JPEG / PNG / WebP · max 5 MB each`}>
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
                                display: 'flex', alignItems: 'center', gap: 6,
                                background: 'transparent', border: '1px dashed rgba(255,255,255,0.12)',
                                padding: '8px 12px', cursor: 'pointer',
                                fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em',
                                color: 'rgba(237,237,237,0.4)',
                            }}
                        >
                            <AttachFile style={{ fontSize: 14 }} /> ATTACH SCREENSHOTS
                            <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)' }}>
                                [{files.length}/{MAX_FILES}]
                            </span>
                        </button>

                        {files.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                                {files.map((f, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                                        padding: '4px 8px', fontSize: '0.7rem', color: 'rgba(237,237,237,0.55)',
                                    }}>
                                        <img src={URL.createObjectURL(f)} alt='' style={{ width: 26, height: 26, objectFit: 'cover' }} />
                                        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                        <button type='button' onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.3)', padding: 0, display: 'flex' }}>
                                            <Close style={{ fontSize: 13 }} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </FieldBlock>

                    {/* Error */}
                    {error && (
                        <div style={{
                            fontSize: '0.78rem', color: 'rgba(219,0,29,0.85)',
                            background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.25)',
                            borderLeft: '3px solid rgba(219,0,29,0.7)',
                            padding: '8px 12px', marginBottom: 1,
                        }}>
                            {error}
                        </div>
                    )}

                    {/* Submit */}
                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid rgba(219,0,29,0.4)', display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.06em' }}>
                                TYPE // {type === 'bug' ? 'BUG REPORT' : 'FEATURE REQUEST'}
                            </div>
                            {title && (
                                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                                    {title}
                                </div>
                            )}
                        </div>
                        <button
                            type='submit'
                            disabled={submitting}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: submitting ? 'rgba(219,0,29,0.06)' : 'rgba(219,0,29,0.14)',
                                border: '1px solid rgba(219,0,29,0.5)',
                                color: 'rgba(219,0,29,0.95)',
                                padding: '10px 28px', fontWeight: 800, fontSize: '0.78rem',
                                letterSpacing: '0.14em', cursor: submitting ? 'not-allowed' : 'pointer',
                                opacity: submitting ? 0.6 : 1,
                                flexShrink: 0,
                            }}
                        >
                            {submitting
                                ? <><CircularProgress size={12} style={{ color: 'rgba(219,0,29,0.7)' }} /> SUBMITTING…</>
                                : 'SUBMIT REPORT'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    )
}


function FieldBlock({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.5)' }}>
                    {label}
                </span>
                {hint && (
                    <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.04em' }}>
                        — {hint}
                    </span>
                )}
            </div>
            {children}
        </div>
    )
}

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
    borderBottom: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(237,237,237,0.88)', fontSize: '0.85rem', outline: 'none',
    boxSizing: 'border-box', borderRadius: 0,
    fontFamily: 'inherit',
}
