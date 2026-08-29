'use client'

import { useState, useEffect, useCallback } from 'react'
import { Typography, TextField, Button, IconButton, Tooltip } from '@mui/material'
import { Add, ArrowUpward, ArrowDownward, RestoreFromTrash, Delete } from '@mui/icons-material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'

type Tag = { id: string, slug: string, label: string, order: number, retired: boolean }

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.82rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.82rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}

const redBtn = {
    fontSize: '0.72rem',
    borderColor: 'rgba(219,0,29,0.27)',
    color: 'rgba(219,0,29,0.8)',
    '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.08)' },
}

const rowStyle = {
    border: '1px solid rgba(219,0,29,0.08)',
    background: 'rgba(255,255,255,0.015)',
}

/**
 * The tag vocabulary editor. Retiring a tag hides it from the picker on the
 * submit form and the public facet rail without touching any media that
 * already carries it — the slug is what's stored on `GalleryMedia.tags`, not
 * the tag document, so nothing has to cascade.
 */
export default function GalleryTagsTab() {
    const [tags, setTags] = useState<Tag[]>([])
    const [loading, setLoading] = useState(true)
    const [newLabel, setNewLabel] = useState('')
    const [adding, setAdding] = useState(false)
    const [renaming, setRenaming] = useState<Record<string, string>>({})
    const [busyId, setBusyId] = useState<string | null>(null)

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/gallery/tags')
            const data = await res.json()
            setTags(data.tags ?? [])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { refresh() }, [refresh])

    const active = tags.filter(t => !t.retired).sort((a, b) => a.order - b.order)
    const retired = tags.filter(t => t.retired).sort((a, b) => a.label.localeCompare(b.label))

    async function addTag() {
        const label = newLabel.trim()
        if (!label) return
        setAdding(true)
        try {
            await fetch('/api/gallery/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label }),
            })
            setNewLabel('')
            await refresh()
        } finally {
            setAdding(false)
        }
    }

    async function patch(id: string, body: Record<string, unknown>) {
        setBusyId(id)
        try {
            await fetch('/api/gallery/tags', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...body }),
            })
            await refresh()
        } finally {
            setBusyId(null)
        }
    }

    function commitRename(tag: Tag) {
        const label = renaming[tag.id]?.trim()
        setRenaming(prev => { const n = { ...prev }; delete n[tag.id]; return n })
        if (!label || label === tag.label) return
        patch(tag.id, { label })
    }

    function move(tag: Tag, direction: -1 | 1) {
        const idx = active.findIndex(t => t.id === tag.id)
        const swapWith = active[idx + direction]
        if (!swapWith) return
        // Two writes rather than one — `order` is a plain integer field per
        // document, not a shared array, so a swap is expressed as each side
        // taking the other's value.
        patch(tag.id, { order: swapWith.order })
        patch(swapWith.id, { order: tag.order })
    }

    if (loading && !tags.length) return <TacticalSkeleton rows={6} className='p-8' />

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-6' style={{ maxWidth: 640 }}>
            <div>
                <Typography fontSize='0.58rem' fontWeight={700} letterSpacing='0.18em' style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 4 }}>
                    Gallery Tag Vocabulary
                </Typography>
                <Typography fontSize='0.75rem' style={{ color: 'rgba(237,237,237,0.4)' }}>
                    Retiring a tag removes it from the submit form and facet rail. Media that already carry it keep it.
                </Typography>
            </div>

            <div className='flex gap-2'>
                <TextField
                    size='small'
                    label='New tag label'
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addTag() }}
                    sx={{ ...inputSx, flex: 1 }}
                />
                <Button variant='outlined' startIcon={<Add />} disabled={adding || !newLabel.trim()} onClick={addTag} sx={redBtn}>
                    Add
                </Button>
            </div>

            <div className='flex flex-col gap-1.5'>
                {active.length === 0 && (
                    <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.25)' }}>No tags yet — add one above.</Typography>
                )}
                {active.map((tag, i) => (
                    <div key={tag.id} className='flex items-center gap-1 px-3 py-1.5' style={rowStyle}>
                        <div className='flex flex-col' style={{ marginRight: 4 }}>
                            <IconButton size='small' disabled={i === 0 || busyId === tag.id} onClick={() => move(tag, -1)} sx={{ color: 'rgba(237,237,237,0.35)', padding: '2px' }}>
                                <ArrowUpward sx={{ fontSize: 14 }} />
                            </IconButton>
                            <IconButton size='small' disabled={i === active.length - 1 || busyId === tag.id} onClick={() => move(tag, 1)} sx={{ color: 'rgba(237,237,237,0.35)', padding: '2px' }}>
                                <ArrowDownward sx={{ fontSize: 14 }} />
                            </IconButton>
                        </div>
                        <TextField
                            variant='standard'
                            value={renaming[tag.id] ?? tag.label}
                            onChange={e => setRenaming(prev => ({ ...prev, [tag.id]: e.target.value }))}
                            onBlur={() => commitRename(tag)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                            sx={{ flex: 1, '& .MuiInput-input': { fontSize: '0.8rem' } }}
                        />
                        <Typography fontSize='0.65rem' style={{ color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace', marginRight: 8 }}>
                            {tag.slug}
                        </Typography>
                        <Tooltip title='Retire tag'>
                            <span>
                                <IconButton size='small' disabled={busyId === tag.id} onClick={() => patch(tag.id, { retired: true })} sx={{ color: 'rgba(219,0,29,0.6)' }}>
                                    <Delete sx={{ fontSize: 16 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </div>
                ))}
            </div>

            {retired.length > 0 && (
                <div className='flex flex-col gap-1.5'>
                    <Typography fontSize='0.58rem' fontWeight={700} letterSpacing='0.18em' style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>
                        Retired
                    </Typography>
                    {retired.map(tag => (
                        <div key={tag.id} className='flex items-center gap-2 px-3 py-1.5' style={{ ...rowStyle, opacity: 0.5 }}>
                            <Typography fontSize='0.8rem' style={{ flex: 1 }}>{tag.label}</Typography>
                            <Typography fontSize='0.65rem' style={{ color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace', marginRight: 8 }}>
                                {tag.slug}
                            </Typography>
                            <Tooltip title='Restore tag'>
                                <span>
                                    <IconButton size='small' disabled={busyId === tag.id} onClick={() => patch(tag.id, { retired: false })} sx={{ color: 'rgba(237,237,237,0.5)' }}>
                                        <RestoreFromTrash sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
