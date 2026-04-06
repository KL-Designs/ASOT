'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
    Typography, Button, Checkbox,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    Tabs, Tab, IconButton, Collapse, Tooltip, LinearProgress,
} from '@mui/material'
import {
    PhotoLibrary, Star, Add, Delete, Upload,
    ExpandMore, ExpandLess, Collections,
} from '@mui/icons-material'


import TacticalSkeleton from '@/app/admin/_components/TacticalSkeleton'

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
    /** The exact folder name the user must type to confirm deletion */
    name: string
}


const tileStyle = {
    border: '1px solid rgba(219,0,29,0.3)',
    borderTop: '2px solid var(--red)',
    background: 'rgba(255,255,255,0.04)',
}

const rowStyle = {
    border: '1px solid rgba(219,0,29,0.08)',
    background: 'rgba(255,255,255,0.015)',
}

const redBtn = {
    fontSize: '0.72rem',
    borderColor: 'rgba(219,0,29,0.4)',
    color: 'rgba(219,0,29,0.8)',
    '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.08)' },
}

const ghostBtn = {
    fontSize: '0.72rem',
    color: 'rgba(237,237,237,0.4)',
    '&:hover': { color: 'rgba(237,237,237,0.7)' },
}


export default function GalleryManager({ hideHeader }: { hideHeader?: boolean } = {}) {

    const [data, setData] = useState<GalleryAPI | null>(null)
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState(0)

    // Tree expand state
    const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())
    const [expandedOps, setExpandedOps] = useState<Set<string>>(new Set())
    const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())

    // Image selection
    const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
    const [selectedFeatured, setSelectedFeatured] = useState<Set<string>>(new Set())

    // Upload / operation state
    const [uploading, setUploading] = useState(false)

    // Dialogs
    const [addContext, setAddContext] = useState<AddContext | null>(null)
    const [addInput, setAddInput] = useState('')
    const [deleteTarget, setDeleteTarget] = useState<DeleteFolderTarget | null>(null)
    const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
    const [deleteImagesConfirm, setDeleteImagesConfirm] = useState<
        | { type: 'content'; year: string; op: string; stage: string; count: number }
        | { type: 'featured'; count: number }
        | null
    >(null)

    // Hidden file input refs
    const uploadTarget = useRef<UploadTarget | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const featuredInputRef = useRef<HTMLInputElement>(null)

    // ── Data ──────────────────────────────────────────────────────────────────

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

    // ── Folder CRUD ───────────────────────────────────────────────────────────

    const createFolder = async () => {
        if (!addContext || !addInput.trim()) return
        const body: Record<string, string> = { type: addContext.type, name: addInput.trim() }
        if (addContext.type === 'operation') body.year = addContext.year
        if (addContext.type === 'stage') { body.year = addContext.year; body.operation = addContext.op }
        await fetch('/api/gallery/admin/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        setAddContext(null)
        setAddInput('')
        refresh()
    }

    const deleteFolder = async () => {
        if (!deleteTarget) return
        await fetch('/api/gallery/admin/folder', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: deleteTarget.type,
                year: deleteTarget.year,
                operation: deleteTarget.op,
                stage: deleteTarget.stage,
            }),
        })
        setDeleteTarget(null)
        setDeleteConfirmInput('')
        refresh()
    }

    // ── Image uploads / deletes ───────────────────────────────────────────────

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
            const next = new Set(prev)
            images.forEach(img => next.delete(`${prefix}${img}`))
            return next
        })
        refresh()
    }

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

    // ── Selection helpers ─────────────────────────────────────────────────────

    const toggleImage = (key: string) =>
        setSelectedImages(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

    const toggleFeatured = (img: string) =>
        setSelectedFeatured(prev => { const n = new Set(prev); n.has(img) ? n.delete(img) : n.add(img); return n })

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

    // ── Tree toggles ──────────────────────────────────────────────────────────

    const toggleYear = (y: string) =>
        setExpandedYears(prev => { const n = new Set(prev); n.has(y) ? n.delete(y) : n.add(y); return n })

    const toggleOp = (k: string) =>
        setExpandedOps(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

    const toggleStage = (k: string) =>
        setExpandedStages(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

    // ── Render ────────────────────────────────────────────────────────────────

    if (loading && !data) return <TacticalSkeleton rows={8} className='p-8' />

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-6 max-w-[1200px] mx-auto'>

            {/* Header */}
            {!hideHeader && (
                <div className='flex flex-col px-5 py-4' style={tileStyle}>
                    <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                        J5 — Media
                    </Typography>
                    <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        Gallery Management
                    </Typography>
                    <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.35)', marginTop: 4, letterSpacing: '0.04em' }}>
                        Manage gallery structure, upload images in bulk, and control featured content
                    </Typography>
                </div>
            )}

            {uploading && (
                <LinearProgress sx={{
                    backgroundColor: 'rgba(219,0,29,0.1)',
                    '& .MuiLinearProgress-bar': { backgroundColor: 'var(--red)' },
                }} />
            )}

            {/* Tabs */}
            <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                sx={{
                    '& .MuiTab-root': { color: 'rgba(237,237,237,0.4)', textTransform: 'uppercase', letterSpacing: 2, fontSize: '0.7rem', minHeight: 40 },
                    '& .Mui-selected': { color: 'var(--red) !important' },
                    '& .MuiTabs-indicator': { backgroundColor: 'var(--red)' },
                    minHeight: 40,
                }}
            >
                <Tab label='Operations' icon={<Collections fontSize='small' />} iconPosition='start' />
                <Tab label='Featured Images' icon={<Star fontSize='small' />} iconPosition='start' />
            </Tabs>

            {/* ── Operations Tab ── */}
            {tab === 0 && (
                <div className='flex flex-col gap-2'>
                    {data?.years.map(yearData => {
                        const yearExpanded = expandedYears.has(yearData.year)
                        return (
                            <div key={yearData.year} style={tileStyle}>

                                {/* Year row */}
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

                                                    {/* Operation row */}
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
                                                                const stageSelectedKeys = getStageSelectedKeys(yearData.year, opData.operation, stageData.stage)
                                                                const allSelected = stageData.media.length > 0 && stageData.media.every(img => selectedImages.has(`${stageKey}/${img}`))

                                                                return (
                                                                    <div key={stageKey} style={{ ...rowStyle, borderLeft: '2px solid rgba(219,0,29,0.25)' }}>

                                                                        {/* Stage row */}
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

                                                                                {/* Stage action bar */}
                                                                                <div className='flex items-center gap-2 mb-3 flex-wrap'>
                                                                                    <Button
                                                                                        size='small'
                                                                                        variant='outlined'
                                                                                        startIcon={<Upload fontSize='small' />}
                                                                                        disabled={uploading}
                                                                                        onClick={() => {
                                                                                            uploadTarget.current = { year: yearData.year, op: opData.operation, stage: stageData.stage }
                                                                                            fileInputRef.current?.click()
                                                                                        }}
                                                                                        sx={redBtn}
                                                                                    >
                                                                                        Upload Images
                                                                                    </Button>
                                                                                    {stageData.media.length > 0 && (
                                                                                        <Button size='small' variant='text' onClick={() => toggleAllStage(yearData.year, opData.operation, stageData.stage, stageData.media)} sx={ghostBtn}>
                                                                                            {allSelected ? 'Deselect All' : 'Select All'}
                                                                                        </Button>
                                                                                    )}
                                                                                    {stageSelectedKeys.length > 0 && (
                                                                                        <Button
                                                                                            size='small'
                                                                                            variant='outlined'
                                                                                            color='error'
                                                                                            startIcon={<Delete fontSize='small' />}
                                                                                            onClick={() => setDeleteImagesConfirm({ type: 'content', year: yearData.year, op: opData.operation, stage: stageData.stage, count: stageSelectedKeys.length })}
                                                                                            sx={{ fontSize: '0.72rem' }}
                                                                                        >
                                                                                            Delete ({stageSelectedKeys.length})
                                                                                        </Button>
                                                                                    )}
                                                                                </div>

                                                                                {/* Image grid */}
                                                                                {stageData.media.length === 0 ? (
                                                                                    <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.25)' }}>
                                                                                        No images yet — upload some above.
                                                                                    </Typography>
                                                                                ) : (
                                                                                    <div className='grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-1.5'>
                                                                                        {stageData.media.map(img => {
                                                                                            const key = `${stageKey}/${img}`
                                                                                            const isSelected = selectedImages.has(key)
                                                                                            return (
                                                                                                <div
                                                                                                    key={img}
                                                                                                    className='relative cursor-pointer'
                                                                                                    onClick={() => toggleImage(key)}
                                                                                                    style={{
                                                                                                        outline: isSelected ? '2px solid var(--red)' : '2px solid transparent',
                                                                                                        borderRadius: 2,
                                                                                                    }}
                                                                                                >
                                                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                                                    <img
                                                                                                        src={`/api/gallery/fetch?year=${encodeURIComponent(yearData.year)}&operation=${encodeURIComponent(opData.operation)}&stage=${encodeURIComponent(stageData.stage)}&img=${encodeURIComponent(img)}`}
                                                                                                        alt={img}
                                                                                                        className='w-full aspect-square object-cover block'
                                                                                                        loading='lazy'
                                                                                                    />
                                                                                                    <div className='absolute top-0.5 left-0.5'>
                                                                                                        <Checkbox
                                                                                                            checked={isSelected}
                                                                                                            size='small'
                                                                                                            sx={{ padding: '2px', color: 'rgba(255,255,255,0.6)', '&.Mui-checked': { color: 'var(--red)' } }}
                                                                                                            onClick={e => e.stopPropagation()}
                                                                                                            onChange={() => toggleImage(key)}
                                                                                                        />
                                                                                                    </div>
                                                                                                </div>
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

                    <Button
                        variant='outlined'
                        startIcon={<Add />}
                        onClick={() => { setAddContext({ type: 'year' }); setAddInput('') }}
                        sx={{ ...redBtn, alignSelf: 'flex-start', mt: 1 }}
                    >
                        Add Year
                    </Button>
                </div>
            )}

            {/* ── Featured Tab ── */}
            {tab === 1 && (
                <div className='flex flex-col gap-4'>
                    <div className='flex items-center gap-2 flex-wrap'>
                        <Button
                            variant='outlined'
                            startIcon={<Upload />}
                            disabled={uploading}
                            onClick={() => featuredInputRef.current?.click()}
                            sx={redBtn}
                        >
                            Upload Featured Images
                        </Button>
                        {(data?.featured.length ?? 0) > 0 && (
                            <Button
                                variant='text'
                                onClick={() => {
                                    const allSel = data!.featured.every(img => selectedFeatured.has(img))
                                    setSelectedFeatured(allSel ? new Set() : new Set(data!.featured))
                                }}
                                sx={ghostBtn}
                            >
                                {data?.featured.every(img => selectedFeatured.has(img)) ? 'Deselect All' : 'Select All'}
                            </Button>
                        )}
                        {selectedFeatured.size > 0 && (
                            <Button
                                variant='outlined'
                                color='error'
                                startIcon={<Delete />}
                                onClick={() => setDeleteImagesConfirm({ type: 'featured', count: selectedFeatured.size })}
                                sx={{ fontSize: '0.72rem' }}
                            >
                                Delete Selected ({selectedFeatured.size})
                            </Button>
                        )}
                    </div>

                    {!data?.featured.length ? (
                        <Typography fontSize='0.8rem' style={{ color: 'rgba(237,237,237,0.25)' }}>
                            No featured images yet — upload some above.
                        </Typography>
                    ) : (
                        <div className='grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-2'>
                            {data.featured.map(img => {
                                const isSelected = selectedFeatured.has(img)
                                return (
                                    <div
                                        key={img}
                                        className='relative cursor-pointer'
                                        onClick={() => toggleFeatured(img)}
                                        style={{
                                            outline: isSelected ? '2px solid var(--red)' : '2px solid transparent',
                                            borderRadius: 2,
                                        }}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={`/api/gallery/featured?img=${encodeURIComponent(img)}`}
                                            alt={img}
                                            className='w-full aspect-square object-cover block'
                                            loading='lazy'
                                        />
                                        <div className='absolute top-0.5 left-0.5'>
                                            <Checkbox
                                                checked={isSelected}
                                                size='small'
                                                sx={{ padding: '2px', color: 'rgba(255,255,255,0.6)', '&.Mui-checked': { color: 'var(--red)' } }}
                                                onClick={e => e.stopPropagation()}
                                                onChange={() => toggleFeatured(img)}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Hidden file inputs */}
            <input ref={fileInputRef} type='file' multiple accept='image/*' style={{ display: 'none' }} onChange={handleContentUpload} />
            <input ref={featuredInputRef} type='file' multiple accept='image/*' style={{ display: 'none' }} onChange={handleFeaturedUpload} />

            {/* Add Folder Dialog */}
            <Dialog
                open={!!addContext}
                onClose={() => { setAddContext(null); setAddInput('') }}
                PaperProps={{ style: { background: '#181818', border: '1px solid rgba(219,0,29,0.2)', minWidth: 340 } }}
            >
                <DialogTitle sx={{ fontSize: '0.85rem', letterSpacing: 2, textTransform: 'uppercase', pb: 1 }}>
                    {addContext?.type === 'year' ? 'Add Year' : addContext?.type === 'operation' ? 'Add Operation' : 'Add Stage'}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        size='small'
                        label={
                            addContext?.type === 'year' ? 'Year (e.g. 2026)'
                            : addContext?.type === 'operation' ? 'Operation name (e.g. 1. Op Storm)'
                            : 'Stage name (e.g. III)'
                        }
                        value={addInput}
                        onChange={e => setAddInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') createFolder() }}
                        sx={{ mt: 0.5 }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => { setAddContext(null); setAddInput('') }} sx={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.75rem' }}>
                        Cancel
                    </Button>
                    <Button onClick={createFolder} disabled={!addInput.trim()} sx={{ color: 'var(--red)', fontSize: '0.75rem' }}>
                        Create
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={!!deleteTarget}
                onClose={() => { setDeleteTarget(null); setDeleteConfirmInput('') }}
                PaperProps={{ style: { background: '#181818', border: '1px solid rgba(219,0,29,0.2)', minWidth: 380 } }}
            >
                <DialogTitle sx={{ fontSize: '0.85rem', letterSpacing: 2, textTransform: 'uppercase', pb: 1 }}>
                    Confirm Delete
                </DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.65)' }}>
                        This will permanently delete {deleteTarget?.label} and all of its contents. This cannot be undone.
                    </Typography>
                    <Typography fontSize='0.75rem' style={{ color: 'rgba(237,237,237,0.4)' }}>
                        Type <span style={{ color: 'rgba(237,237,237,0.85)', fontFamily: 'monospace' }}>{deleteTarget?.name}</span> to confirm.
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        size='small'
                        placeholder={deleteTarget?.name}
                        value={deleteConfirmInput}
                        onChange={e => setDeleteConfirmInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && deleteConfirmInput === deleteTarget?.name) deleteFolder() }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                '& fieldset': { borderColor: 'rgba(219,0,29,0.3)' },
                                '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.5)' },
                                '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
                            },
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => { setDeleteTarget(null); setDeleteConfirmInput('') }} sx={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.75rem' }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={deleteFolder}
                        variant='contained'
                        color='error'
                        disabled={deleteConfirmInput !== deleteTarget?.name}
                        sx={{ fontSize: '0.75rem' }}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Image Delete Confirmation Dialog */}
            <Dialog
                open={!!deleteImagesConfirm}
                onClose={() => setDeleteImagesConfirm(null)}
                PaperProps={{ style: { background: '#181818', border: '1px solid rgba(219,0,29,0.2)', minWidth: 320 } }}
            >
                <DialogTitle sx={{ fontSize: '0.85rem', letterSpacing: 2, textTransform: 'uppercase', pb: 1 }}>
                    Delete Images
                </DialogTitle>
                <DialogContent>
                    <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.65)' }}>
                        Permanently delete {deleteImagesConfirm?.count} selected image{deleteImagesConfirm?.count !== 1 ? 's' : ''}? This cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDeleteImagesConfirm(null)} sx={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.75rem' }}>
                        Cancel
                    </Button>
                    <Button
                        variant='contained'
                        color='error'
                        sx={{ fontSize: '0.75rem' }}
                        onClick={() => {
                            if (deleteImagesConfirm?.type === 'content') {
                                deleteContentImages(deleteImagesConfirm.year, deleteImagesConfirm.op, deleteImagesConfirm.stage)
                            } else {
                                deleteFeaturedImages()
                            }
                            setDeleteImagesConfirm(null)
                        }}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

        </div>
    )
}
