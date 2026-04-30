'use client'

import { useState, useEffect } from 'react'

export function ImageLightbox({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) {
    const [open, setOpen] = useState(false)

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open])

    return (
        <>
            <img src={src} alt={alt} style={{ ...style, cursor: 'zoom-in' }} onClick={() => setOpen(true)} />
            {open && (
                <div
                    onClick={() => setOpen(false)}
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
            )}
        </>
    )
}
