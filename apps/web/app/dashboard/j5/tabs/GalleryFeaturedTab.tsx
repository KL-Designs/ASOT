'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import Image from 'next/image'
import {
    Typography, Button, Checkbox,
    Dialog, DialogTitle, DialogContent, DialogActions, LinearProgress,
} from '@mui/material'
import { Delete, Upload } from '@mui/icons-material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'

const PAGE_SIZE = 60
const PREVIEW_SIZE = 320

function HoverPreview({ src, rect }: { src: string; rect: DOMRect }) {
    const margin = 14
    let left = rect.right + margin
    if (left + PREVIEW_SIZE > window.innerWidth - margin) left = rect.left - PREVIEW_SIZE - margin
    let top = rect.top + rect.height / 2 - PREVIEW_SIZE / 2
    top = Math.max(margin, Math.min(top, window.innerHeight - PREVIEW_SIZE - margin))
    return (
        <div style={{
            position: 'fixed', left, top, width: PREVIEW_SIZE, height: PREVIEW_SIZE,
            zIndex: 9999, pointerEvents: 'none', background: '#0e0e0e',
            border: '1px solid rgba(219,0,29,0.4)', borderRadius: 4, overflow: 'hidden',
            boxShadow: '0 16px 56px rgba(0,0,0,0.85)',
        }}>
            <img src={src} alt='' style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
    )
}

const FeaturedImageItem = memo(function FeaturedImageItem({ img, isSelected, onToggle, onHover, onHoverEnd }: {
    img: string
    isSelected: boolean
    onToggle: (img: string) => void
    onHover: (src: string, rect: DOMRect) => void
    onHoverEnd: () => void
}) {
    const src = `/api/gallery/featured?img=${encodeURIComponent(img)}`
    return (
        <div
            className='relative cursor-pointer aspect-square overflow-hidden'
            onClick={() => onToggle(img)}
            onMouseEnter={e => onHover(src, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={onHoverEnd}
            style={{ outline: isSelected ? '2px solid var(--red)' : '2px solid transparent', borderRadius: 2 }}
        >
            <Image
                src={src}
                alt={img}
                fill
                sizes='(max-width: 640px) 33vw, (max-width: 1024px) 14vw, 11vw'
                className='object-cover'
            />
            <div className='absolute top-0.5 left-0.5 z-10'>
                <Checkbox checked={isSelected} size='small' sx={{ padding: '2px', color: 'rgba(255,255,255,0.6)', '&.Mui-checked': { color: 'var(--red)' } }} onClick={e => e.stopPropagation()} onChange={() => onToggle(img)} />
            </div>
        </div>
    )
})

const redBtn = {
    fontSize: '0.72rem',
    borderColor: 'rgba(219,0,29,0.27)',
    color: 'rgba(219,0,29,0.8)',
    '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.08)' },
}

const ghostBtn = {
    fontSize: '0.72rem',
    color: 'rgba(237,237,237,0.4)',
    '&:hover': { color: 'rgba(237,237,237,0.7)' },
}

export default function GalleryFeaturedTab() {
    const [featured, setFeatured] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedFeatured, setSelectedFeatured] = useState<Set<string>>(new Set())
    const [uploading, setUploading] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState(false)
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
    const featuredInputRef = useRef<HTMLInputElement>(null)

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/gallery')
            const data = await res.json()
            setFeatured(data.featured ?? [])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { refresh() }, [refresh])

    const handleFeaturedUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (!files.length) return
        setUploading(true)
        const fd = new FormData()
        files.forEach(f => fd.append('files', f))
        await fetch('/api/gallery/admin/featured', { method: 'POST', body: fd })
        e.target.value = ''
        await refresh()
        setUploading(false)
    }

    const deleteFeaturedImages = async () => {
        const images = [...selectedFeatured]
        if (!images.length) return
        await fetch('/api/gallery/admin/featured', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images }),
        })
        setSelectedFeatured(new Set())
        refresh()
    }

    const toggleFeatured = useCallback((img: string) =>
        setSelectedFeatured(prev => { const n = new Set(prev); n.has(img) ? n.delete(img) : n.add(img); return n }), [])

    const [hoverPreview, setHoverPreview] = useState<{ src: string; rect: DOMRect } | null>(null)
    const handleHover = useCallback((src: string, rect: DOMRect) => setHoverPreview({ src, rect }), [])
    const handleHoverEnd = useCallback(() => setHoverPreview(null), [])

    if (loading && !featured.length) return <TacticalSkeleton rows={8} className='p-8' />

    const allSelected = featured.length > 0 && featured.every(img => selectedFeatured.has(img))
    const visible = featured.slice(0, visibleCount)
    const remaining = featured.length - visibleCount

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-4'>
            {uploading && (
                <LinearProgress sx={{ backgroundColor: 'rgba(219,0,29,0.1)', '& .MuiLinearProgress-bar': { backgroundColor: 'var(--red)' } }} />
            )}

            <div className='flex items-center gap-2 flex-wrap'>
                <Button variant='outlined' startIcon={<Upload />} disabled={uploading} onClick={() => featuredInputRef.current?.click()} sx={redBtn}>
                    Upload Featured Images
                </Button>
                {featured.length > 0 && (
                    <Button variant='text' onClick={() => setSelectedFeatured(allSelected ? new Set() : new Set(featured))} sx={ghostBtn}>
                        {allSelected ? 'Deselect All' : 'Select All'}
                    </Button>
                )}
                {selectedFeatured.size > 0 && (
                    <Button variant='outlined' color='error' startIcon={<Delete />} onClick={() => setDeleteConfirm(true)} sx={{ fontSize: '0.72rem' }}>
                        Delete Selected ({selectedFeatured.size})
                    </Button>
                )}
                {featured.length > 0 && (
                    <Typography fontSize='0.7rem' style={{ color: 'rgba(237,237,237,0.3)', marginLeft: 'auto' }}>
                        {Math.min(visibleCount, featured.length)} / {featured.length}
                    </Typography>
                )}
            </div>

            {!featured.length ? (
                <Typography fontSize='0.8rem' style={{ color: 'rgba(237,237,237,0.25)' }}>No featured images yet — upload some above.</Typography>
            ) : (
                <>
                    <div className='grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-2' style={{ contain: 'content' }}>
                        {visible.map(img => (
                            <FeaturedImageItem key={img} img={img} isSelected={selectedFeatured.has(img)} onToggle={toggleFeatured} onHover={handleHover} onHoverEnd={handleHoverEnd} />
                        ))}
                    </div>
                    {remaining > 0 && (
                        <Button variant='outlined' onClick={() => setVisibleCount(c => c + PAGE_SIZE)} sx={{ ...redBtn, alignSelf: 'center', mt: 1 }}>
                            Load More ({remaining} remaining)
                        </Button>
                    )}
                </>
            )}

            <input ref={featuredInputRef} type='file' multiple accept='image/*' style={{ display: 'none' }} onChange={handleFeaturedUpload} />

            <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)} PaperProps={{ style: { background: '#181818', border: '1px solid rgba(219,0,29,0.32)', minWidth: 320 } }}>
                <DialogTitle sx={{ fontSize: '0.85rem', letterSpacing: 2, textTransform: 'uppercase', pb: 1 }}>Delete Images</DialogTitle>
                <DialogContent>
                    <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.65)' }}>
                        Permanently delete {selectedFeatured.size} selected image{selectedFeatured.size !== 1 ? 's' : ''}? This cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDeleteConfirm(false)} sx={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.75rem' }}>Cancel</Button>
                    <Button variant='contained' color='error' sx={{ fontSize: '0.75rem' }} onClick={() => { deleteFeaturedImages(); setDeleteConfirm(false) }}>Delete</Button>
                </DialogActions>
            </Dialog>

            {hoverPreview && <HoverPreview src={hoverPreview.src} rect={hoverPreview.rect} />}
        </div>
    )
}
