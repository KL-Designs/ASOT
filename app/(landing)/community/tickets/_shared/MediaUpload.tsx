'use client'

import React, { useRef, useState, useCallback } from 'react'
import { VideoFile, Link as LinkIcon, Close, Add, CloudUpload } from '@mui/icons-material'

export interface MediaState {
    images: File[]
    videoLinks: string[]
    otherLinks: string[]
}

interface Props {
    media: MediaState
    onChange: (m: MediaState) => void
    maxImages?: number
    allowVideo?: boolean
}

const MAX_IMAGE_SIZE = 8 * 1024 * 1024
const MAX_VIDEO_SIZE = 50 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

export function emptyMedia(): MediaState {
    return { images: [], videoLinks: [], otherLinks: [] }
}

export default function MediaUpload({ media, onChange, maxImages = 10, allowVideo = true }: Props) {
    const imgRef = useRef<HTMLInputElement>(null)
    const [dragOver, setDragOver] = useState(false)

    const addFiles = useCallback((files: File[]) => {
        const nextImages = [...media.images]
        for (const f of files) {
            if (ALLOWED_IMAGE_TYPES.includes(f.type)) {
                if (nextImages.length >= maxImages) continue
                if (f.size > MAX_IMAGE_SIZE) continue
                if (!nextImages.find(x => x.name === f.name && x.size === f.size)) nextImages.push(f)
            } else if (allowVideo && ALLOWED_VIDEO_TYPES.includes(f.type)) {
                if (f.size > MAX_VIDEO_SIZE) continue
                // Store video as blob URL in videoLinks
                onChange({ ...media, images: nextImages, videoLinks: [...media.videoLinks, URL.createObjectURL(f)] })
                return
            }
        }
        onChange({ ...media, images: nextImages })
    }, [media, onChange, maxImages, allowVideo])

    function handleDrop(e: React.DragEvent) {
        e.preventDefault()
        setDragOver(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length) addFiles(files)
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault()
        setDragOver(true)
    }

    function handleDragLeave() { setDragOver(false) }

    function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? [])
        if (files.length) addFiles(files)
        e.target.value = ''
    }

    function removeImage(i: number) {
        onChange({ ...media, images: media.images.filter((_, j) => j !== i) })
    }

    function addLink(type: 'video' | 'other', val: string) {
        if (!val.trim()) return
        if (type === 'video') onChange({ ...media, videoLinks: [...media.videoLinks, val.trim()] })
        else onChange({ ...media, otherLinks: [...media.otherLinks, val.trim()] })
    }

    function removeLink(type: 'video' | 'other', i: number) {
        if (type === 'video') onChange({ ...media, videoLinks: media.videoLinks.filter((_, j) => j !== i) })
        else onChange({ ...media, otherLinks: media.otherLinks.filter((_, j) => j !== i) })
    }

    const hasMedia = media.images.length > 0 || media.videoLinks.length > 0 || media.otherLinks.length > 0

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
                ref={imgRef} type='file' multiple
                accept='image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm'
                style={{ display: 'none' }}
                onChange={handleFileInput}
            />

            {/* Drop zone */}
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => imgRef.current?.click()}
                style={{
                    border: `2px dashed ${dragOver ? 'rgba(219,0,29,0.6)' : 'rgba(255,255,255,0.12)'}`,
                    background: dragOver ? 'rgba(219,0,29,0.06)' : 'rgba(255,255,255,0.02)',
                    padding: '18px 16px',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, background 0.15s',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                }}
            >
                <CloudUpload style={{ fontSize: 28, color: dragOver ? 'rgba(219,0,29,0.7)' : 'rgba(255,255,255,0.2)' }} />
                <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', color: dragOver ? 'rgba(219,0,29,0.8)' : 'rgba(237,237,237,0.4)' }}>
                    DRAG &amp; DROP OR CLICK TO UPLOAD
                </div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.04em' }}>
                    Images (JPEG / PNG / WebP / GIF) · max 8 MB each · {media.images.length}/{maxImages}
                </div>
            </div>

            {/* Image previews */}
            {media.images.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {media.images.map((f, i) => (
                        <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                            <img src={URL.createObjectURL(f)} alt={f.name} style={{ width: 76, height: 76, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)', display: 'block' }} />
                            <button type='button' onClick={e => { e.stopPropagation(); removeImage(i) }} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.8)', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex', borderRadius: 999 }}>
                                <Close style={{ fontSize: 13 }} />
                            </button>
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.65)', padding: '2px 4px', fontSize: '0.52rem', color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {f.name}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Link inputs row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {allowVideo && (
                    <LinkInput placeholder='Video link (YouTube, etc.)…' icon={<VideoFile style={{ fontSize: 13 }} />} onAdd={v => addLink('video', v)} label='VIDEO' />
                )}
                <LinkInput placeholder='Reference URL…' icon={<LinkIcon style={{ fontSize: 13 }} />} onAdd={v => addLink('other', v)} label='LINK' />
            </div>

            {/* Link chips */}
            {hasMedia && (media.videoLinks.length > 0 || media.otherLinks.length > 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {media.videoLinks.map((l, i) => <LinkChip key={`v-${i}`} label={l} onRemove={() => removeLink('video', i)} color='rgba(167,139,250,0.7)' prefix='VIDEO' />)}
                    {media.otherLinks.map((l, i) => <LinkChip key={`o-${i}`} label={l} onRemove={() => removeLink('other', i)} color='rgba(0,195,255,0.7)' prefix='LINK' />)}
                </div>
            )}
        </div>
    )
}


function LinkInput({ placeholder, icon, onAdd, label }: { placeholder: string; icon: React.ReactNode; onAdd: (v: string) => void; label: string }) {
    const [val, setVal] = useState('')
    return (
        <div style={{ display: 'flex', gap: 0, flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRight: 'none', padding: '0 10px', color: 'rgba(237,237,237,0.4)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {icon} {label}
            </div>
            <input
                value={val}
                onChange={e => setVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (val.trim()) { onAdd(val); setVal('') } } }}
                placeholder={placeholder}
                style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.8)', fontSize: '0.8rem', padding: '7px 10px', outline: 'none', fontFamily: 'inherit', minWidth: 0 }}
            />
            <button type='button' onClick={() => { if (val.trim()) { onAdd(val); setVal('') } }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderLeft: 'none', color: 'rgba(237,237,237,0.5)', cursor: 'pointer', padding: '0 10px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <Add style={{ fontSize: 15 }} />
            </button>
        </div>
    )
}


function LinkChip({ label, onRemove, color, prefix }: { label: string; onRemove: () => void; color: string; prefix: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: `${color}0d`, border: `1px solid ${color}33`, maxWidth: '100%' }}>
            <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', color, flexShrink: 0 }}>{prefix}</span>
            <span style={{ fontSize: '0.68rem', color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            <button type='button' onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', display: 'flex', padding: 0, flexShrink: 0 }}>
                <Close style={{ fontSize: 12 }} />
            </button>
        </div>
    )
}
