'use client'

import { useState } from 'react'


export function CoverUpload({ hasCover: initialHasCover }: { hasCover: boolean }) {
    const [uploading, setUploading] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [hovered, setHovered] = useState(false)
    const [hasCover, setHasCover] = useState(initialHasCover)

    const upload = async (file: File) => {
        setUploading(true)
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/uploads/cover', { method: 'POST', body: formData })
        const json = await res.json()
        if (json.error) alert(json.error)
        else window.location.reload()
        setUploading(false)
    }

    const deleteCover = async () => {
        if (!confirm('Remove your cover photo?')) return
        setDeleting(true)
        const res = await fetch('/api/uploads/cover', { method: 'DELETE' })
        const json = await res.json()
        if (json.error) alert(json.error)
        else {
            setHasCover(false)
            window.location.reload()
        }
        setDeleting(false)
    }

    return (
        <>
            <style>{`
                @keyframes shimmer {
                    0%   { transform: translateX(-100%) skewX(-15deg); }
                    100% { transform: translateX(300%) skewX(-15deg); }
                }
                .cover-upload-shimmer::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(
                        90deg,
                        transparent 0%,
                        rgba(255,255,255,0.28) 45%,
                        rgba(255,255,255,0.45) 50%,
                        rgba(255,255,255,0.28) 55%,
                        transparent 100%
                    );
                    border-radius: inherit;
                    animation: shimmer 0.75s ease forwards;
                    pointer-events: none;
                }
            `}</style>
            <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 20, display: 'flex', gap: 8 }}>
                {hasCover && (
                    <button
                        title='Remove cover photo'
                        onClick={deleteCover}
                        disabled={deleting}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            overflow: 'hidden',
                            background: 'rgba(180,30,30,0.22)',
                            border: '1px solid rgba(255,80,80,0.28)',
                            borderRadius: 999,
                            padding: '7px 16px',
                            cursor: deleting ? 'wait' : 'pointer',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: 'rgba(255,160,160,0.9)',
                            backdropFilter: 'blur(12px) saturate(1.4)',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,120,120,0.15)',
                            transition: 'background 0.2s',
                            opacity: deleting ? 0.5 : 1,
                        }}
                    >
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm2.46-7.12 1.41-1.41L12 12.59l2.12-2.12 1.41 1.41L13.41 14l2.12 2.12-1.41 1.41L12 15.41l-2.12 2.12-1.41-1.41L10.59 14l-2.13-2.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        {deleting ? 'Removing…' : 'Remove Cover'}
                    </button>
                )}
                <label
                    title='Change cover photo'
                    className={hovered ? 'cover-upload-shimmer' : ''}
                    onMouseEnter={() => setHovered(true)}
                    onAnimationEnd={() => setHovered(false)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        overflow: 'hidden',
                        background: 'rgba(255,255,255,0.12)',
                        border: '1px solid rgba(255,255,255,0.22)',
                        borderRadius: 999,
                        padding: '7px 16px',
                        cursor: uploading ? 'wait' : 'pointer',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.82)',
                        backdropFilter: 'blur(12px) saturate(1.4)',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
                        transition: 'background 0.2s, box-shadow 0.2s',
                        pointerEvents: uploading ? 'none' : 'auto',
                        opacity: uploading ? 0.5 : 1,
                    }}
                >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                    {uploading ? 'Uploading…' : 'Change Cover'}
                    <input
                        type='file'
                        hidden
                        accept='image/*'
                        onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) upload(f)
                        }}
                    />
                </label>
            </div>
        </>
    )
}
