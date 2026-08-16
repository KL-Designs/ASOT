'use client'

import { useEffect, useState } from 'react'

/**
 * A certificate row that fetches nothing until it is opened.
 *
 * The render service draws certificates on demand and nothing is persisted, so
 * a member with 30 awards would otherwise trigger 30 renders on every profile
 * view for something almost nobody opens. The <img> is only mounted once the
 * viewer clicks.
 */
export function CertificateLink({
    label,
    href,
    accent,
}: {
    label: string
    href: string
    accent: string
}) {
    const [open, setOpen] = useState(false)
    const [failed, setFailed] = useState(false)
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open])

    return (
        <>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', fontWeight: 600, color: 'rgba(237,237,237,0.8)' }}>
                    {label}
                </span>
                {failed ? (
                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', whiteSpace: 'nowrap' }}>
                        Unavailable
                    </span>
                ) : (
                    <button
                        onClick={() => { setOpen(true); setLoaded(false) }}
                        style={{
                            fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em',
                            textTransform: 'uppercase', color: `${accent}bb`,
                            padding: '3px 10px', border: `1px solid ${accent}40`,
                            background: `${accent}10`, cursor: 'pointer', flexShrink: 0,
                        }}
                    >
                        View
                    </button>
                )}
            </div>

            {open && (
                <div
                    onClick={() => setOpen(false)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'zoom-out',
                    }}
                >
                    {!loaded && (
                        <span style={{ position: 'absolute', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                            Rendering…
                        </span>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={href}
                        alt={label}
                        onLoad={() => setLoaded(true)}
                        onError={() => { setFailed(true); setOpen(false) }}
                        style={{
                            maxWidth: '95vw', maxHeight: '92vh', objectFit: 'contain',
                            boxShadow: '0 16px 80px rgba(0,0,0,0.8)',
                            opacity: loaded ? 1 : 0, transition: 'opacity 150ms',
                        }}
                        onClick={e => e.stopPropagation()}
                    />
                    <button
                        onClick={() => setOpen(false)}
                        style={{
                            position: 'absolute', top: 16, right: 20,
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                            color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem', lineHeight: 1,
                            padding: '6px 12px', cursor: 'pointer',
                        }}
                    >
                        ✕
                    </button>
                </div>
            )}
        </>
    )
}
