'use client'

import { useRef, useState } from 'react'

/**
 * One image for a message or post: click to choose, drag and drop, or paste,
 * with replace and remove. Uploads through the site's existing image endpoint
 * (`POST /api/upload`, which checks type and content on the server) and hands
 * back the URL it returns. Used by the Selection countdown post, the Induction
 * Pack and the award postage message.
 */
export default function ImageUploadField({ value, onChange, label = 'Image' }: {
    value: string
    onChange: (url: string) => void
    label?: string
}) {
    const input = useRef<HTMLInputElement>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [over, setOver] = useState(false)

    async function upload(file: File | undefined | null) {
        if (!file) return
        if (!file.type.startsWith('image/')) { setError('That is not an image.'); return }
        if (file.size > 8 * 1024 * 1024) { setError('Images must be 8 MB or smaller.'); return }
        setBusy(true); setError(null)
        try {
            const fd = new FormData()
            fd.append('file', file)
            const res = await fetch('/api/upload', { method: 'POST', body: fd })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.url) { setError(data.error ?? 'Upload failed.'); return }
            onChange(data.url)
        } catch {
            setError('Upload failed.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>{label}</span>
            <div
                tabIndex={0}
                role='button'
                aria-label={value ? 'Replace image' : 'Add image'}
                onClick={() => input.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click() } }}
                onPaste={e => { const f = [...e.clipboardData.files].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); upload(f) } }}
                onDragOver={e => { e.preventDefault(); setOver(true) }}
                onDragLeave={() => setOver(false)}
                onDrop={e => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files[0]) }}
                style={{
                    border: `1px dashed ${over ? 'var(--red)' : 'rgba(255,255,255,0.18)'}`,
                    background: over ? 'rgba(219,0,29,0.05)' : 'rgba(255,255,255,0.02)',
                    padding: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, minHeight: 64,
                }}
            >
                {value
                     
                    ? <img src={value} alt='' style={{ maxHeight: 120, maxWidth: 220, objectFit: 'contain' }} />
                    : null}
                <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.45)' }}>
                    {busy ? 'Uploading…' : value ? 'Click, drop or paste to replace' : 'Click, drop or paste an image'}
                </span>
            </div>
            {value && (
                <button type='button' onClick={() => onChange('')}
                    style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.7rem', color: 'rgba(219,0,29,0.8)' }}>
                    Remove image
                </button>
            )}
            {error && <span style={{ fontSize: '0.72rem', color: 'var(--red)' }}>{error}</span>}
            <input ref={input} type='file' accept='image/png,image/jpeg,image/gif,image/webp' hidden
                onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />
        </div>
    )
}
