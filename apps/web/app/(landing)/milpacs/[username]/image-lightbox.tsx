'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

export function ImageLightbox({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) {
    const [open, setOpen] = useState(false)
    // Portals need the DOM, and this renders inside a server component tree.
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        window.addEventListener('keydown', onKey)
        // Stops the page scrolling behind a full-screen overlay.
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            window.removeEventListener('keydown', onKey)
            document.body.style.overflow = previous
        }
    }, [open])

    /**
     * Rendered into document.body rather than in place.
     *
     * `position: fixed` is only relative to the viewport while no ancestor
     * establishes a containing block — and a transform does, including one that
     * merely *fills* from a finished animation. The profile's panels animate in
     * with `translateY`, so an overlay rendered inside one was being clipped to
     * that panel: the image overflowed instead of fitting the screen, and the
     * backdrop covered only the panel, which left the other images still
     * clickable and allowed two lightboxes open at once.
     *
     * A portal sidesteps the whole class of problem rather than depending on no
     * ancestor ever gaining a transform, filter or `contain`.
     */
    const overlay = (
        <div
            onClick={() => setOpen(false)}
            role='dialog'
            aria-modal='true'
            aria-label={alt}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.92)',
                backdropFilter: 'blur(10px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'zoom-out',
            }}
        >
            <img
                src={src}
                alt={alt}
                style={{ maxWidth: '95vw', maxHeight: '92vh', objectFit: 'contain', boxShadow: '0 16px 80px rgba(0,0,0,0.8)' }}
                onClick={e => e.stopPropagation()}
            />
            <button
                onClick={() => setOpen(false)}
                style={{
                    position: 'absolute', top: 16, right: 20,
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem', lineHeight: 1,
                    padding: '4px 10px', cursor: 'pointer', borderRadius: 4,
                }}
                aria-label='Close'
            >
                ✕
            </button>
        </div>
    )

    return (
        <>
            <img src={src} alt={alt} style={{ ...style, cursor: 'zoom-in' }} onClick={() => setOpen(true)} />
            {open && mounted && createPortal(overlay, document.body)}
        </>
    )
}
