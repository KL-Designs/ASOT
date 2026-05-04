'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import Image from 'next/image'
import {
    Typography, Button, Checkbox,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    IconButton, Collapse, Tooltip, LinearProgress, CircularProgress,
} from '@mui/material'
import { Add, Delete, Upload, ExpandMore, ExpandLess, Done } from '@mui/icons-material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'

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

type UploadTarget = { year: string; op: string; stage: string }

type AddContext =
    | { type: 'year' }
    | { type: 'operation'; year: string }
    | { type: 'stage'; year: string; op: string }

type DeleteFolderTarget = {
    type: 'year' | 'operation' | 'stage'
    year: string
    op?: string
    stage?: string
    label: string
    name: string
}

const GalleryImageItem = memo(function GalleryImageItem({ imgKey, src, isSelected, onToggle, isDragSource, onHover, onHoverEnd, onDragStart, onDragEnter, onDragEnd }: {
    imgKey: string
    src: string
    isSelected: boolean
    onToggle: (key: string) => void
    isDragSource?: boolean
    onHover?: (src: string, rect: DOMRect) => void
    onHoverEnd?: () => void
    onDragStart?: (e: React.DragEvent) => void
    onDragEnter?: (e: React.DragEvent) => void
    onDragEnd?: (e: React.DragEvent) => void
}) {
    return (
        <div
            draggable
            className='relative cursor-grab aspect-square overflow-hidden'
            onClick={() => onToggle(imgKey)}
            onMouseEnter={e => onHover?.(src, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={onHoverEnd}
            onDragStart={onDragStart}
            onDragEnter={onDragEnter}
            onDragEnd={onDragEnd}
            onDragOver={e => e.preventDefault()}
            style={{
                outline: isSelected ? '2px solid var(--red)' : '2px solid transparent',
                borderRadius: 2,
                opacity: isDragSource ? 0.3 : 1,
                transition: 'opacity 0.15s ease',
            }}
        >
            <Image
                src={src}
                alt={imgKey}
                fill
                sizes='(max-width: 640px) 25vw, (max-width: 1024px) 12vw, 8vw'
                className='object-cover'
            />
            <div className='absolute top-0.5 left-0.5 z-10'>
                <Checkbox checked={isSelected} size='small' sx={{ padding: '2px', color: 'rgba(255,255,255,0.6)', '&.Mui-checked': { color: 'var(--red)' } }} onClick={e => e.stopPropagation()} onChange={() => onToggle(imgKey)} />
            </div>
        </div>
    )
})

const tileStyle = {
    border: '1px solid rgba(219,0,29,0.42)',
    borderTop: '2px solid var(--red)',
    background: 'rgba(255,255,255,0.04)',
}

const rowStyle = {
    border: '1px solid rgba(219,0,29,0.08)',
    background: 'rgba(255,255,255,0.015)',
}

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

export default function GalleryOperationsTab() {
    const [data, setData] = useState<GalleryAPI | null>(null)
    const [loading, setLoading] = useState(true)
    const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())
    const [expandedOps, setExpandedOps] = useState<Set<string>>(new Set())
    const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
    const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
    const [uploading, setUploading] = useState(false)
    const [addContext, setAddContext] = useState<AddContext | null>(null)
    const [addInput, setAddInput] = useState('')
    const [deleteTarget, setDeleteTarget] = useState<DeleteFolderTarget | null>(null)
    const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
    const [deleteImagesConfirm, setDeleteImagesConfirm] = useState<{ year: string; op: string; stage: string; count: number } | null>(null)

    // Drag-and-drop reorder state
    const [stageOrders, setStageOrders] = useState<Record<string, string[]>>({})
    const [savingStage, setSavingStage] = useState<string | null>(null)
    const [draggingImg, setDraggingImg] = useState<string | null>(null)
    const dragRef = useRef<{ stageKey: string; fromIdx: number; media: string[] } | null>(null)

    // Hover preview
    const [hoverPreview, setHoverPreview] = useState<{ src: string; rect: DOMRect } | null>(null)
    const handleHover = useCallback((src: string, rect: DOMRect) => setHoverPreview({ src, rect }), [])
    const handleHoverEnd = useCallback(() => setHoverPreview(null), [])

    const uploadTarget = useRef<UploadTarget | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/gallery')
            setData(await res.json())
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { refresh() }, [refresh])

    const createFolder = async () => {
        if (!addContext || !addInput.trim()) return
        const body: Record<string, string> = { type: addContext.type, name: addInput.trim() }
        if (addContext.type === 'operation') body.year = addContext.year
        if (addContext.type === 'stage') { body.year = addContext.year; body.operation = addContext.op }
        await fetch('/api/gallery/admin/folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        setAddContext(null)
        setAddInput('')
        refresh()
    }

    const deleteFolder = async () => {
        if (!deleteTarget) return
        await fetch('/api/gallery/admin/folder', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: deleteTarget.type, year: deleteTarget.year, operation: deleteTarget.op, stage: deleteTarget.stage }),
        })
        setDeleteTarget(null)
        setDeleteConfirmInput('')
        refresh()
    }

    const handleContentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        const target = uploadTarget.current
        if (!files.length || !target) return
        setUploading(true)
        const fd = new FormData()
        fd.append('year', target.year)
        fd.append('operation', target.op)
        fd.append('stage', target.stage)
        files.forEach(f => fd.append('files', f))
        await fetch('/api/gallery/admin/images', { method: 'POST', body: fd })
        e.target.value = ''
        await refresh()
        setUploading(false)
    }

    const deleteContentImages = async (year: string, op: string, stage: string) => {
        const prefix = `${year}/${op}/${stage}/`
        const images = [...selectedImages].filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length))
        if (!images.length) return
        await fetch('/api/gallery/admin/images', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year, operation: op, stage, images }),
        })
        setSelectedImages(prev => {
            const n = new Set(prev)
            images.forEach(img => n.delete(`${prefix}${img}`))
            return n
        })
        refresh()
    }

    const saveStageOrder = async (stageKey: string, year: string, op: string, stage: string) => {
        const order = stageOrders[stageKey]
        if (!order) return
        setSavingStage(stageKey)
        try {
            await fetch('/api/gallery/admin/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year, operation: op, stage, order }),
            })
            setStageOrders(prev => { const n = { ...prev }; delete n[stageKey]; return n })
            // Clear selections for this stage since filenames change after rename
            const prefix = `${stageKey}/`
            setSelectedImages(prev => {
                const n = new Set(prev)
                for (const k of n) { if (k.startsWith(prefix)) n.delete(k) }
                return n
            })
            await refresh()
        } finally {
            setSavingStage(null)
        }
    }

    const discardStageOrder = (stageKey: string) =>
        setStageOrders(prev => { const n = { ...prev }; delete n[stageKey]; return n })

    const toggleImage = useCallback((key: string) =>
        setSelectedImages(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n }), [])

    const getStageSelectedKeys = (year: string, op: string, stage: string) => {
        const prefix = `${year}/${op}/${stage}/`
        return [...selectedImages].filter(k => k.startsWith(prefix))
    }

    const toggleAllStage = (year: string, op: string, stage: string, media: string[]) => {
        const prefix = `${year}/${op}/${stage}/`
        const allSelected = media.every(img => selectedImages.has(`${prefix}${img}`))
        setSelectedImages(prev => {
            const n = new Set(prev)
            if (allSelected) media.forEach(img => n.delete(`${prefix}${img}`))
            else media.forEach(img => n.add(`${prefix}${img}`))
            return n
        })
    }

    const toggleYear = (y: string) =>
        setExpandedYears(prev => { const n = new Set(prev); n.has(y) ? n.delete(y) : n.add(y); return n })
    const toggleOp = (k: string) =>
        setExpandedOps(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
    const toggleStage = (k: string) =>
        setExpandedStages(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

    if (loading && !data) return <TacticalSkeleton rows={8} className='p-8' />

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-6 max-w-[1200px] mx-auto'>
            {uploading && (
                <LinearProgress sx={{ backgroundColor: 'rgba(219,0,29,0.1)', '& .MuiLinearProgress-bar': { backgroundColor: 'var(--red)' } }} />
            )}

            <div className='flex flex-col gap-2'>
                {data?.years.map(yearData => {
                    const yearExpanded = expandedYears.has(yearData.year)
                    return (
                        <div key={yearData.year} style={tileStyle}>
                            <div className='flex items-center gap-1 px-3 py-2'>
                                <IconButton size='small' onClick={() => toggleYear(yearData.year)} sx={{ color: 'rgba(237,237,237,0.4)' }}>
                                    {yearExpanded ? <ExpandLess fontSize='small' /> : <ExpandMore fontSize='small' />}
                                </IconButton>
                                <Typography fontWeight={700} letterSpacing={2} fontSize='0.82rem' style={{ textTransform: 'uppercase', flex: 1 }}>
                                    {yearData.year}
                                    <span style={{ color: 'rgba(237,237,237,0.3)', fontWeight: 400, marginLeft: 10, fontSize: '0.7rem', textTransform: 'none', letterSpacing: 0 }}>
                                        {yearData.operations.length} operation{yearData.operations.length !== 1 ? 's' : ''}
                                    </span>
                                </Typography>
                                <Tooltip title='Add Operation'>
                                    <IconButton size='small' sx={{ color: 'rgba(219,0,29,0.55)', '&:hover': { color: 'var(--red)' } }} onClick={() => { setAddContext({ type: 'operation', year: yearData.year }); setAddInput('') }}>
                                        <Add fontSize='small' />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title='Delete Year'>
                                    <IconButton size='small' sx={{ color: 'rgba(237,237,237,0.25)', '&:hover': { color: '#db001d' } }} onClick={() => { setDeleteTarget({ type: 'year', year: yearData.year, label: `year "${yearData.year}"`, name: yearData.year }); setDeleteConfirmInput('') }}>
                                        <Delete fontSize='small' />
                                    </IconButton>
                                </Tooltip>
                            </div>

                            <Collapse in={yearExpanded} unmountOnExit>
                                <div className='flex flex-col gap-1.5 px-4 pb-3'>
                                    {yearData.operations.map(opData => {
                                        const opKey = `${yearData.year}/${opData.operation}`
                                        const opExpanded = expandedOps.has(opKey)
                                        return (
                                            <div key={opKey} style={rowStyle}>
                                                <div className='flex items-center gap-1 px-3 py-2'>
                                                    <IconButton size='small' onClick={() => toggleOp(opKey)} sx={{ color: 'rgba(237,237,237,0.35)' }}>
                                                        {opExpanded ? <ExpandLess fontSize='small' /> : <ExpandMore fontSize='small' />}
                                                    </IconButton>
                                                    <Typography fontSize='0.78rem' letterSpacing={1} style={{ flex: 1 }}>
                                                        {opData.operation}
                                                        <span style={{ color: 'rgba(237,237,237,0.3)', marginLeft: 8, fontSize: '0.68rem' }}>
                                                            {opData.stages.length} stage{opData.stages.length !== 1 ? 's' : ''}
                                                        </span>
                                                    </Typography>
                                                    <Tooltip title='Add Stage'>
                                                        <IconButton size='small' sx={{ color: 'rgba(219,0,29,0.55)', '&:hover': { color: 'var(--red)' } }} onClick={() => { setAddContext({ type: 'stage', year: yearData.year, op: opData.operation }); setAddInput('') }}>
                                                            <Add fontSize='small' />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title='Delete Operation'>
                                                        <IconButton size='small' sx={{ color: 'rgba(237,237,237,0.25)', '&:hover': { color: '#db001d' } }} onClick={() => { setDeleteTarget({ type: 'operation', year: yearData.year, op: opData.operation, label: `operation "${opData.operation}"`, name: opData.operation }); setDeleteConfirmInput('') }}>
                                                            <Delete fontSize='small' />
                                                        </IconButton>
                                                    </Tooltip>
                                                </div>

                                                <Collapse in={opExpanded} unmountOnExit>
                                                    <div className='flex flex-col gap-1 px-3 pb-2'>
                                                        {opData.stages.map(stageData => {
                                                            const stageKey = `${yearData.year}/${opData.operation}/${stageData.stage}`
                                                            const stageExpanded = expandedStages.has(stageKey)
                                                            const currentMedia = stageOrders[stageKey] ?? stageData.media
                                                            const stageSelectedKeys = getStageSelectedKeys(yearData.year, opData.operation, stageData.stage)
                                                            const allSelected = currentMedia.length > 0 && currentMedia.every(img => selectedImages.has(`${stageKey}/${img}`))

                                                            // Only show Save Order if the order actually differs from original
                                                            const orderDirty = !!stageOrders[stageKey] && stageOrders[stageKey].some((img, i) => img !== stageData.media[i])

                                                            return (
                                                                <div key={stageKey} style={{ ...rowStyle, borderLeft: '2px solid rgba(219,0,29,0.25)' }}>
                                                                    <div className='flex items-center gap-1 px-3 py-2'>
                                                                        <IconButton size='small' onClick={() => toggleStage(stageKey)} sx={{ color: 'rgba(237,237,237,0.3)' }}>
                                                                            {stageExpanded ? <ExpandLess fontSize='small' /> : <ExpandMore fontSize='small' />}
                                                                        </IconButton>
                                                                        <Typography fontSize='0.75rem' letterSpacing={1} style={{ flex: 1 }}>
                                                                            {stageData.stage}
                                                                            <span style={{ color: 'rgba(237,237,237,0.3)', marginLeft: 8, fontSize: '0.68rem' }}>
                                                                                {stageData.media.length} image{stageData.media.length !== 1 ? 's' : ''}
                                                                            </span>
                                                                        </Typography>
                                                                        <Tooltip title='Delete Stage'>
                                                                            <IconButton size='small' sx={{ color: 'rgba(237,237,237,0.25)', '&:hover': { color: '#db001d' } }} onClick={() => { setDeleteTarget({ type: 'stage', year: yearData.year, op: opData.operation, stage: stageData.stage, label: `stage "${stageData.stage}"`, name: stageData.stage }); setDeleteConfirmInput('') }}>
                                                                                <Delete fontSize='small' />
                                                                            </IconButton>
                                                                        </Tooltip>
                                                                    </div>

                                                                    <Collapse in={stageExpanded} unmountOnExit>
                                                                        <div className='px-3 pb-3'>
                                                                            <div className='flex items-center gap-2 mb-3 flex-wrap'>
                                                                                <Button
                                                                                    size='small'
                                                                                    variant='outlined'
                                                                                    startIcon={<Upload fontSize='small' />}
                                                                                    disabled={uploading}
                                                                                    onClick={() => { uploadTarget.current = { year: yearData.year, op: opData.operation, stage: stageData.stage }; fileInputRef.current?.click() }}
                                                                                    sx={redBtn}
                                                                                >
                                                                                    Upload Images
                                                                                </Button>
                                                                                {currentMedia.length > 0 && (
                                                                                    <Button size='small' variant='text' onClick={() => toggleAllStage(yearData.year, opData.operation, stageData.stage, currentMedia)} sx={ghostBtn}>
                                                                                        {allSelected ? 'Deselect All' : 'Select All'}
                                                                                    </Button>
                                                                                )}
                                                                                {stageSelectedKeys.length > 0 && (
                                                                                    <Button size='small' variant='outlined' color='error' startIcon={<Delete fontSize='small' />} onClick={() => setDeleteImagesConfirm({ year: yearData.year, op: opData.operation, stage: stageData.stage, count: stageSelectedKeys.length })} sx={{ fontSize: '0.72rem' }}>
                                                                                        Delete ({stageSelectedKeys.length})
                                                                                    </Button>
                                                                                )}
                                                                                {orderDirty && (
                                                                                    <>
                                                                                        <Button
                                                                                            size='small'
                                                                                            variant='outlined'
                                                                                            startIcon={savingStage === stageKey ? <CircularProgress size={11} sx={{ color: 'inherit' }} /> : <Done fontSize='small' />}
                                                                                            disabled={savingStage === stageKey}
                                                                                            onClick={() => saveStageOrder(stageKey, yearData.year, opData.operation, stageData.stage)}
                                                                                            sx={redBtn}
                                                                                        >
                                                                                            Save Order
                                                                                        </Button>
                                                                                        <Button size='small' variant='text' onClick={() => discardStageOrder(stageKey)} sx={ghostBtn}>
                                                                                            Discard
                                                                                        </Button>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                            {currentMedia.length === 0 ? (
                                                                                <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.25)' }}>No images yet — upload some above.</Typography>
                                                                            ) : (
                                                                                <div className='grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-1.5' style={{ contain: 'layout style' }}>
                                                                                    {currentMedia.map((img, idx) => {
                                                                                        const key = `${stageKey}/${img}`
                                                                                        return (
                                                                                            <GalleryImageItem
                                                                                                key={img}
                                                                                                imgKey={key}
                                                                                                src={`/api/gallery/fetch?year=${encodeURIComponent(yearData.year)}&operation=${encodeURIComponent(opData.operation)}&stage=${encodeURIComponent(stageData.stage)}&img=${encodeURIComponent(img)}`}
                                                                                                isSelected={selectedImages.has(key)}
                                                                                                onToggle={toggleImage}
                                                                                                isDragSource={draggingImg === img}
                                                                                                onHover={handleHover}
                                                                                                onHoverEnd={handleHoverEnd}
                                                                                                onDragStart={e => {
                                                                                                    e.dataTransfer.effectAllowed = 'move'
                                                                                                    handleHoverEnd()
                                                                                                    const media = stageOrders[stageKey] ? [...stageOrders[stageKey]] : [...stageData.media]
                                                                                                    dragRef.current = { stageKey, fromIdx: idx, media }
                                                                                                    setDraggingImg(img)
                                                                                                    if (!stageOrders[stageKey]) {
                                                                                                        setStageOrders(prev => ({ ...prev, [stageKey]: media }))
                                                                                                    }
                                                                                                }}
                                                                                                onDragEnter={e => {
                                                                                                    e.preventDefault()
                                                                                                    const drag = dragRef.current
                                                                                                    if (!drag || drag.stageKey !== stageKey || drag.fromIdx === idx) return
                                                                                                    const arr = [...drag.media]
                                                                                                    const [item] = arr.splice(drag.fromIdx, 1)
                                                                                                    arr.splice(idx, 0, item)
                                                                                                    dragRef.current = { stageKey, fromIdx: idx, media: arr }
                                                                                                    setStageOrders(prev => ({ ...prev, [stageKey]: arr }))
                                                                                                }}
                                                                                                onDragEnd={() => {
                                                                                                    dragRef.current = null
                                                                                                    setDraggingImg(null)
                                                                                                }}
                                                                                            />
                                                                                        )
                                                                                    })}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </Collapse>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </Collapse>
                                            </div>
                                        )
                                    })}
                                </div>
                            </Collapse>
                        </div>
                    )
                })}

                <Button variant='outlined' startIcon={<Add />} onClick={() => { setAddContext({ type: 'year' }); setAddInput('') }} sx={{ ...redBtn, alignSelf: 'flex-start', mt: 1 }}>
                    Add Year
                </Button>
            </div>

            <input ref={fileInputRef} type='file' multiple accept='image/*' style={{ display: 'none' }} onChange={handleContentUpload} />

            <Dialog open={!!addContext} onClose={() => { setAddContext(null); setAddInput('') }} PaperProps={{ style: { background: '#181818', border: '1px solid rgba(219,0,29,0.32)', minWidth: 340 } }}>
                <DialogTitle sx={{ fontSize: '0.85rem', letterSpacing: 2, textTransform: 'uppercase', pb: 1 }}>
                    {addContext?.type === 'year' ? 'Add Year' : addContext?.type === 'operation' ? 'Add Operation' : 'Add Stage'}
                </DialogTitle>
                <DialogContent>
                    <TextField autoFocus fullWidth size='small' label={addContext?.type === 'year' ? 'Year (e.g. 2026)' : addContext?.type === 'operation' ? 'Operation name (e.g. 1. Op Storm)' : 'Stage name (e.g. III)'} value={addInput} onChange={e => setAddInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createFolder() }} sx={{ mt: 0.5 }} />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => { setAddContext(null); setAddInput('') }} sx={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.75rem' }}>Cancel</Button>
                    <Button onClick={createFolder} disabled={!addInput.trim()} sx={{ color: 'var(--red)', fontSize: '0.75rem' }}>Create</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setDeleteConfirmInput('') }} PaperProps={{ style: { background: '#181818', border: '1px solid rgba(219,0,29,0.32)', minWidth: 380 } }}>
                <DialogTitle sx={{ fontSize: '0.85rem', letterSpacing: 2, textTransform: 'uppercase', pb: 1 }}>Confirm Delete</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.65)' }}>This will permanently delete {deleteTarget?.label} and all its contents. This cannot be undone.</Typography>
                    <Typography fontSize='0.75rem' style={{ color: 'rgba(237,237,237,0.4)' }}>Type <span style={{ color: 'rgba(237,237,237,0.85)', fontFamily: 'monospace' }}>{deleteTarget?.name}</span> to confirm.</Typography>
                    <TextField autoFocus fullWidth size='small' placeholder={deleteTarget?.name} value={deleteConfirmInput} onChange={e => setDeleteConfirmInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && deleteConfirmInput === deleteTarget?.name) deleteFolder() }} sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(219,0,29,0.42)' }, '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.5)' }, '&.Mui-focused fieldset': { borderColor: 'var(--red)' } } }} />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => { setDeleteTarget(null); setDeleteConfirmInput('') }} sx={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.75rem' }}>Cancel</Button>
                    <Button onClick={deleteFolder} variant='contained' color='error' disabled={deleteConfirmInput !== deleteTarget?.name} sx={{ fontSize: '0.75rem' }}>Delete</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={!!deleteImagesConfirm} onClose={() => setDeleteImagesConfirm(null)} PaperProps={{ style: { background: '#181818', border: '1px solid rgba(219,0,29,0.32)', minWidth: 320 } }}>
                <DialogTitle sx={{ fontSize: '0.85rem', letterSpacing: 2, textTransform: 'uppercase', pb: 1 }}>Delete Images</DialogTitle>
                <DialogContent>
                    <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.65)' }}>Permanently delete {deleteImagesConfirm?.count} selected image{deleteImagesConfirm?.count !== 1 ? 's' : ''}? This cannot be undone.</Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDeleteImagesConfirm(null)} sx={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.75rem' }}>Cancel</Button>
                    <Button variant='contained' color='error' sx={{ fontSize: '0.75rem' }} onClick={() => { if (deleteImagesConfirm) deleteContentImages(deleteImagesConfirm.year, deleteImagesConfirm.op, deleteImagesConfirm.stage); setDeleteImagesConfirm(null) }}>Delete</Button>
                </DialogActions>
            </Dialog>

            {hoverPreview && <HoverPreview src={hoverPreview.src} rect={hoverPreview.rect} />}
        </div>
    )
}
