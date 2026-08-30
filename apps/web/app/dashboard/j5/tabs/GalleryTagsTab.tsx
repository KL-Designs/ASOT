'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Typography, TextField, Button, IconButton, Tooltip } from '@mui/material'
import { Add, ArrowUpward, ArrowDownward, RestoreFromTrash, Delete, DragIndicator } from '@mui/icons-material'
import {
    DndContext, closestCenter, PointerSensor, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'

/** `count` is only ever present for the manager this tab is gated to — see
 *  the route's own comment on why it's computed there rather than read from
 *  admin/facets. */
type Tag = { id: string, slug: string, label: string, order: number, retired: boolean, count?: number }

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

/** One active row, draggable by its handle only — not the row as a whole,
 *  which still has to carry a normal text field (cursor placement, text
 *  selection) and a set of ordinary buttons. Spreading dnd-kit's listeners
 *  across the whole row the way FeaturedTab's tile does would turn every
 *  click into a potential drag start instead. */
function TagRow({ tag, index, total, busyId, renameValue, onRename, onCommitRename, onMove, onRetire, maxCount }: {
    tag: Tag
    index: number
    total: number
    busyId: string | null
    renameValue: string
    onRename: (value: string) => void
    onCommitRename: () => void
    onMove: (direction: -1 | 1) => void
    onRetire: () => void
    maxCount: number
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tag.id })
    const pct = Math.round(((tag.count ?? 0) / maxCount) * 100)

    return (
        <div
            ref={setNodeRef}
            className='flex items-center gap-1 px-3 py-1.5'
            style={{ ...rowStyle, transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
        >
            <span
                {...attributes}
                {...listeners}
                style={{ color: 'rgba(237,237,237,0.3)', cursor: 'grab', display: 'flex', touchAction: 'none' }}
                aria-label='Drag to reorder'
            >
                <DragIndicator sx={{ fontSize: 16 }} />
            </span>
            <div className='flex flex-col' style={{ marginRight: 4 }}>
                <IconButton size='small' disabled={index === 0 || busyId === tag.id} onClick={() => onMove(-1)} sx={{ color: 'rgba(237,237,237,0.35)', padding: '2px' }}>
                    <ArrowUpward sx={{ fontSize: 14 }} />
                </IconButton>
                <IconButton size='small' disabled={index === total - 1 || busyId === tag.id} onClick={() => onMove(1)} sx={{ color: 'rgba(237,237,237,0.35)', padding: '2px' }}>
                    <ArrowDownward sx={{ fontSize: 14 }} />
                </IconButton>
            </div>
            <TextField
                variant='standard'
                value={renameValue}
                onChange={e => onRename(e.target.value)}
                onBlur={onCommitRename}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                sx={{ flex: 1, '& .MuiInput-input': { fontSize: '0.8rem' } }}
            />
            {/* The bar and the number both encode the same count — the bar is
                what makes a glance across the whole list legible, the number
                is what makes any one row exact. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 84, flexShrink: 0 }}>
                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: (tag.count ?? 0) === 0 ? 'rgba(237,237,237,0.15)' : 'var(--red)' }} />
                </div>
                <Typography fontSize='0.65rem' style={{ color: 'rgba(237,237,237,0.4)', fontFamily: 'monospace', minWidth: 18, textAlign: 'right' }}>
                    {tag.count ?? 0}
                </Typography>
            </div>
            <Typography fontSize='0.65rem' style={{ color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace', marginLeft: 8, marginRight: 8 }}>
                {tag.slug}
            </Typography>
            <Tooltip title='Retire tag'>
                <span>
                    <IconButton size='small' disabled={busyId === tag.id} onClick={onRetire} sx={{ color: 'rgba(219,0,29,0.6)' }}>
                        <Delete sx={{ fontSize: 16 }} />
                    </IconButton>
                </span>
            </Tooltip>
        </div>
    )
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

    // Dragging can move a tag past more than one neighbour in a single
    // gesture, unlike the arrow buttons' single-step swap — so every tag
    // whose position actually changed gets its `order` renormalised to its
    // new index, not just the two endpoints. Optimistic locally, same as
    // FeaturedTab's rotation drag: the row reflects the drop immediately and
    // `refresh()` reconciles once every write lands.
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

    async function onDragEnd(e: DragEndEvent) {
        const { active: dragged, over } = e
        if (!over || dragged.id === over.id) return
        const oldIndex = active.findIndex(t => t.id === dragged.id)
        const newIndex = active.findIndex(t => t.id === over.id)
        if (oldIndex < 0 || newIndex < 0) return

        const reordered = arrayMove(active, oldIndex, newIndex)
        const changed = reordered.filter((t, i) => t.order !== i)

        setTags(prev => prev.map(t => {
            const i = reordered.findIndex(r => r.id === t.id)
            return i < 0 ? t : { ...t, order: i }
        }))

        await Promise.all(changed.map(t =>
            fetch('/api/gallery/tags', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: t.id, order: reordered.indexOf(t) }),
            }),
        ))
        await refresh()
    }

    // Every bar is drawn relative to whichever tag is used most, so a glance
    // at the column shows which tags are load-bearing and which are dead
    // vocabulary — a lone tag with 40 uses reads very differently against a
    // sibling at 41 than it does against one at 2.
    const maxCount = useMemo(() => Math.max(1, ...active.map(t => t.count ?? 0)), [active])

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
                {active.length > 0 && (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                        <SortableContext items={active.map(t => t.id)} strategy={verticalListSortingStrategy}>
                            {active.map((tag, i) => (
                                <TagRow
                                    key={tag.id}
                                    tag={tag}
                                    index={i}
                                    total={active.length}
                                    busyId={busyId}
                                    renameValue={renaming[tag.id] ?? tag.label}
                                    onRename={value => setRenaming(prev => ({ ...prev, [tag.id]: value }))}
                                    onCommitRename={() => commitRename(tag)}
                                    onMove={direction => move(tag, direction)}
                                    onRetire={() => patch(tag.id, { retired: true })}
                                    maxCount={maxCount}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {retired.length > 0 && (
                <div className='flex flex-col gap-1.5'>
                    <Typography fontSize='0.58rem' fontWeight={700} letterSpacing='0.18em' style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>
                        Retired
                    </Typography>
                    {retired.map(tag => (
                        <div key={tag.id} className='flex items-center gap-2 px-3 py-1.5' style={{ ...rowStyle, opacity: 0.5 }}>
                            <Typography fontSize='0.8rem' style={{ flex: 1 }}>{tag.label}</Typography>
                            {/* No proportion bar here — retired tags aren't
                                ranked against each other, the count is just
                                a reminder of how much media still carries a
                                slug nobody can pick from the form anymore. */}
                            <Typography fontSize='0.65rem' style={{ color: 'rgba(237,237,237,0.4)', fontFamily: 'monospace', marginRight: 4 }}>
                                {tag.count ?? 0}
                            </Typography>
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
