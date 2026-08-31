'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Typography, IconButton, Tooltip } from '@mui/material'
import { Add, ArrowUpward, ArrowDownward, RestoreFromTrash, Delete, DragIndicator } from '@mui/icons-material'
import {
    DndContext, closestCenter, PointerSensor, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import { planTagReorder, byTagOrder } from '@/lib/gallery/tag-order'
import { Field } from '@/app/dashboard/j5/controls/Field'
import c from '@/styles/j5-controls.module.css'

/** `count` is only ever present for the manager this tab is gated to — see
 *  the route's own comment on why it's computed there rather than read from
 *  admin/facets. */
type Tag = { id: string, slug: string, label: string, order: number, retired: boolean, count?: number }

const rowStyle = {
    border: '1px solid rgba(219,0,29,0.08)',
    background: 'rgba(255,255,255,0.015)',
}

/** One active row, draggable by its handle only — not the row as a whole,
 *  which still has to carry a normal text field (cursor placement, text
 *  selection) and a set of ordinary buttons. Spreading dnd-kit's listeners
 *  across the whole row the way FeaturedTab's tile does would turn every
 *  click into a potential drag start instead. */
function TagRow({ tag, index, total, busyId, reordering, renameValue, onRename, onCommitRename, onMove, onRetire, maxCount }: {
    tag: Tag
    index: number
    total: number
    busyId: string | null
    reordering: boolean
    renameValue: string
    onRename: (value: string) => void
    onCommitRename: () => void
    onMove: (direction: -1 | 1) => void
    onRetire: () => void
    maxCount: number
}) {
    // Disabled while a previous drag's PATCH fan-out is still in flight —
    // a second drag would compute its plan from optimistic state that the
    // first refresh() then overwrites, snapping the rows back to a stale
    // order.
    const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tag.id, disabled: reordering })
    const pct = Math.round(((tag.count ?? 0) / maxCount) * 100)

    return (
        <div
            ref={setNodeRef}
            className='flex items-center gap-1 px-3 py-1.5'
            style={{ ...rowStyle, transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
        >
            {/* listeners only, never dnd-kit's `attributes`: those put
                role='button', tabIndex={0} and aria-roledescription='sortable'
                on this handle, and only a PointerSensor is registered — so a
                keyboard or screen-reader user would tab onto a control that
                announces itself as sortable and then does nothing on
                Space/Enter/arrows. The arrow buttons beside it are the
                accessible path, so the handle is hidden from that tree
                entirely rather than advertising a second one that isn't
                there. */}
            <span
                {...listeners}
                aria-hidden='true'
                tabIndex={-1}
                style={{ color: 'rgba(237,237,237,0.3)', cursor: reordering ? 'progress' : 'grab', display: 'flex', touchAction: 'none' }}
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
            {/* Unlabelled on purpose — the row is one tag, and an eyebrow over
                every row would repeat "LABEL" down the whole vocabulary.
                Enter blurs, which is what commits the rename; `currentTarget`
                rather than `target` is the input this handler is bound to, so
                it needs no cast to reach blur(). */}
            <Field
                value={renameValue}
                onChange={onRename}
                onBlur={onCommitRename}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                className='flex-1'
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
    // Held across a drag's whole PATCH fan-out and the refresh() after it —
    // see onDragEnd.
    const [reordering, setReordering] = useState(false)

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            // ?counts=1 — the aggregation is opt-in rather than implied by
            // the permission, so a J5 lead holding gallery.tags does not pay
            // for a collection scan every time they open the public submit
            // form, which discards the counts. See the route's comment.
            const res = await fetch('/api/gallery/tags?counts=1')
            const data = await res.json()
            setTags(data.tags ?? [])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { refresh() }, [refresh])

    // byTagOrder, not a bare order comparison: two tags can hold the same
    // `order` (POST assigns countDocuments(), which counts retired tags), and
    // the server's own sort now breaks that tie on _id — the two have to
    // agree or the tab and the public facet rail show the pair differently.
    const active = tags.filter(t => !t.retired).sort(byTagOrder)
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
    // gesture, unlike the arrow buttons' single-step swap — so the whole
    // vocabulary is renormalised to 0..n-1 and only the rows that actually
    // moved are written. That decision lives in lib/gallery/tag-order.ts
    // rather than here: it is the part that chooses which documents get a
    // PATCH, and logic inside a component cannot be imported by a test.
    // Optimistic locally, same as FeaturedTab's rotation drag: the rows
    // reflect the drop immediately and `refresh()` reconciles once every
    // write lands.
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

    async function onDragEnd(e: DragEndEvent) {
        // A second drag started while the first one's fan-out is still in
        // flight would plan from optimistic state that the first refresh()
        // then overwrites — the rows snap back to a stale order. The
        // handles are disabled for the same reason; this is the guard for
        // a gesture already in progress when that flag went up.
        if (reordering) return

        const { active: dragged, over } = e
        if (!over) return
        const plan = planTagReorder(tags, String(dragged.id), String(over.id))
        // Null means the drag moved nothing, or named a row that is no
        // longer in the list — leave state alone rather than re-rendering
        // and re-fetching for nothing.
        if (!plan) return

        setReordering(true)
        setTags(plan.tags)
        try {
            await Promise.all(plan.writes.map(w =>
                fetch('/api/gallery/tags', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: w.id, order: w.order }),
                }),
            ))
            await refresh()
        } finally {
            setReordering(false)
        }
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

            {/* items-end: the field's label sits above its box, so the Add
                button lines up with the box rather than with the label. */}
            <div className='flex gap-2 items-end'>
                <Field
                    label='New tag label'
                    value={newLabel}
                    onChange={setNewLabel}
                    onKeyDown={e => { if (e.key === 'Enter') addTag() }}
                    className='flex-1'
                />
                <button type='button' className={`${c.btn} ${c.btnPrimary}`} disabled={adding || !newLabel.trim()} onClick={addTag}>
                    <Add sx={{ fontSize: 14, marginRight: '4px', verticalAlign: 'middle' }} />
                    Add
                </button>
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
                                    reordering={reordering}
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
