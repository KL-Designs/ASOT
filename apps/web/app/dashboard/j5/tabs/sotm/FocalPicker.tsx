'use client'

import { useState } from 'react'
import c from '@/styles/j5-controls.module.css'

/**
 * Marks the point of the Screenshot of the Month that every crop should keep.
 *
 * The photograph is shown whole, at its own proportions, and a click on it
 * sets the point — it has to be the whole image, because the point is stored
 * as a percentage of it and a cropped or letterboxed preview would map a
 * click to the wrong place.
 *
 * The strips underneath are the three shapes the site actually crops it to.
 * They are the reason this is not just a crosshair: whether a point is right
 * is a question about what the crops look like, and J5 should not have to
 * save, open three public pages and come back to find out.
 */

const IMAGE = '/api/gallery/sotm/image'

/** Roughly what each public surface crops to. Proportions, not pixel sizes. */
const CROPS: { label: string; ratio: string }[] = [
    { label: 'Home page', ratio: '21 / 8' },
    { label: 'Gallery', ratio: '20 / 9' },
    { label: 'Join page', ratio: '32 / 7' },
]

export default function FocalPicker({ initialX, initialY, onSaved, onError }: {
    initialX?: number
    initialY?: number
    onSaved: (focal: { focalX?: number; focalY?: number }) => void
    onError: (message: string) => void
}) {
    const [point, setPoint] = useState<{ x: number; y: number } | null>(
        typeof initialX === 'number' && typeof initialY === 'number' ? { x: initialX, y: initialY } : null,
    )
    const [busy, setBusy] = useState(false)

    const saved = typeof initialX === 'number' && typeof initialY === 'number' ? { x: initialX, y: initialY } : null
    const dirty = (point?.x ?? null) !== (saved?.x ?? null) || (point?.y ?? null) !== (saved?.y ?? null)
    const position = point ? `${point.x}% ${point.y}%` : undefined

    function place(e: React.MouseEvent<HTMLImageElement>) {
        const box = e.currentTarget.getBoundingClientRect()
        if (!box.width || !box.height) return
        const pct = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10
        setPoint({ x: pct(((e.clientX - box.left) / box.width) * 100), y: pct(((e.clientY - box.top) / box.height) * 100) })
    }

    async function save(next: { x: number; y: number } | null) {
        setBusy(true)
        try {
            const res = await fetch('/api/gallery/sotm', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(next ? { focalX: next.x, focalY: next.y } : { focalX: null, focalY: null }),
            })
            const data = await res.json().catch(() => null)
            if (!res.ok) { onError(data?.error ?? 'Could not save the focal point.'); return }
            setPoint(next)
            onSaved(next ? { focalX: next.x, focalY: next.y } : {})
        } catch {
            onError('Network error. Please try again.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'rgba(237,237,237,0.55)' }}>
                Click the part of the screenshot that must stay in view. Every page that crops it will keep that point in frame.
            </p>

            <div style={{ position: 'relative', lineHeight: 0, border: '1px solid rgba(255,255,255,0.08)', cursor: 'crosshair' }}>
                {/* A plain <img> at its natural proportions — that is the point of it. */}
                <img src={IMAGE} alt='Screenshot of the Month, click to set its focal point' onClick={place} style={{ display: 'block', width: '100%', height: 'auto' }} />
                {point && (
                    <span
                        aria-hidden='true'
                        style={{
                            position: 'absolute', left: `${point.x}%`, top: `${point.y}%`,
                            width: 26, height: 26, margin: '-13px 0 0 -13px',
                            border: '2px solid #fff', borderRadius: '50%',
                            boxShadow: '0 0 0 2px rgba(0,0,0,0.7), inset 0 0 0 2px rgba(0,0,0,0.7)',
                            pointerEvents: 'none',
                        }}
                    />
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                {CROPS.map(crop => (
                    <figure key={crop.label} style={{ margin: 0 }}>
                        <div style={{ aspectRatio: crop.ratio, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#000' }}>
                            <img src={IMAGE} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: position, display: 'block' }} />
                        </div>
                        <figcaption style={{ marginTop: 5, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' }}>
                            {crop.label}
                        </figcaption>
                    </figure>
                ))}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type='button' className={c.btn} disabled={busy || !dirty || !point} onClick={() => save(point)}>
                    {busy ? 'Saving…' : 'Save focal point'}
                </button>
                {(point || saved) && (
                    <button type='button' className={`${c.btn} ${c.btnGhost}`} disabled={busy} onClick={() => (saved ? save(null) : setPoint(null))}>
                        Back to centre
                    </button>
                )}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(237,237,237,0.4)' }}>
                    {point ? `${point.x}% across, ${point.y}% down${dirty ? ' (not saved)' : ''}` : 'Centred'}
                </span>
            </div>
        </div>
    )
}
