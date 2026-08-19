'use client'

import { useState, useEffect } from 'react'
import { Close } from '@mui/icons-material'

interface LibImage {
    _id: string | { $oid: string }
    prompt?: string
    cameraStyle?: string
    createdAt: string
}

interface Props {
    onSelect: (url: string) => void
    onClose: () => void
}

const LIMIT = 24

export default function ImageLibraryModal({ onSelect, onClose }: Props) {
    const [images, setImages] = useState<LibImage[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)

    useEffect(() => {
        document.body.classList.add('cursor-disabled')
        return () => document.body.classList.remove('cursor-disabled')
    }, [])

    useEffect(() => {
        setLoading(true)
        fetch(`/api/ai/images?scope=all&page=${page}&limit=${LIMIT}`)
            .then(r => r.json())
            .then(d => { setImages(d.images ?? []); setTotal(d.total ?? 0) })
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [page])

    function getId(img: LibImage): string {
        if (typeof img._id === 'object') return (img._id as any).$oid ?? String(img._id)
        return img._id as string
    }

    const totalPages = Math.ceil(total / LIMIT)

    return (
        <div
            style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
            <div style={{ background: '#0f0f14', border: '1px solid rgba(255,255,255,0.1)', width: 720, maxWidth: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                    <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.5)' }}>Image Library</div>
                        <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.22)', marginTop: 2 }}>AI-generated images — click to insert</div>
                    </div>
                    <button type='button' onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', display: 'flex' }}>
                        <Close style={{ fontSize: 18 }} />
                    </button>
                </div>

                <div className='thin-scroll' style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                    {loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'rgba(237,237,237,0.3)', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            Loading…
                        </div>
                    ) : images.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 8 }}>
                            <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>No images found</div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.18)', textAlign: 'center' }}>Generate images in the J2 Intel Image Creator to populate this library</div>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                            {images.map(img => {
                                const id = getId(img)
                                const url = `/api/ai/images/${id}/file`
                                return (
                                    <button key={id} type='button'
                                        onClick={() => { onSelect(url); onClose() }}
                                        title={img.prompt ?? ''}
                                        style={{ position: 'relative', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)', padding: 0, cursor: 'pointer', overflow: 'hidden', aspectRatio: '1 / 1', display: 'block', transition: 'border-color 0.15s, transform 0.1s' }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.45)'; e.currentTarget.style.transform = 'scale(1.02)' }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'scale(1)' }}
                                    >
                                        <img src={url} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading='lazy' />
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                    <button type='button' onClick={() => setPage(p => p - 1)} disabled={page <= 1}
                        style={{ padding: '5px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: page <= 1 ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.6)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: page <= 1 ? 'default' : 'pointer' }}
                    >Prev</button>
                    <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.28)', letterSpacing: '0.08em' }}>
                        {page} / {Math.max(1, totalPages)} — {total} image{total !== 1 ? 's' : ''}
                    </span>
                    <button type='button' onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
                        style={{ padding: '5px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: page >= totalPages ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.6)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: page >= totalPages ? 'default' : 'pointer' }}
                    >Next</button>
                </div>
            </div>
        </div>
    )
}
