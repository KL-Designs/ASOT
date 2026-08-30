'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LinearProgress, Typography } from '@mui/material'
import { Add, Close, Shuffle, Upload } from '@mui/icons-material'
import {
    DndContext, closestCenter, PointerSensor, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import mc from '@/styles/media-console.module.css'
import s from '@/styles/j5-console.module.css'
import c from '@/styles/j5-controls.module.css'

/* ============================================================================
   The Featured tab.

   Replaces a tab that managed a folder: upload a file, see it in a grid,
   delete it. There was no order, because a folder has none — the public rail
   shuffled the listing on every visit specifically because nothing else was
   there to give it a sequence.

   `featuredOrder` on gallery_media is now that sequence, and this tab is the
   one place that writes it, via PUT /api/gallery/admin/featured/order (built
   alongside the route this reads from). Everything below is arranging that
   one field: drag to reorder, an X to drop out, a Library tile's Add to
   pick a new one, Shuffle to randomise it in one deliberate action rather
   than the discarded per-visit shuffle the public page used to do.
   ============================================================================ */

const MAX_ROTATION = 60   // matches the order route's own cap

/** One rotation tile. The whole tile is the drag handle — dnd-kit's
 *  listeners are spread on the wrapper div, and the remove button inside
 *  stops its click from bubbling so it isn't read as the start of a drag. */
function RotationTile({ item, index, onRemove }: {
    item: FeaturedItemAPI
    index: number
    onRemove: (id: string) => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

    return (
        <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            className={s.dragTile}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.4 : 1,
                cursor: 'grab',
            }}
        >
            <div className={mc.tile}>
                <img src={item.src} alt='' loading='lazy' decoding='async' />
                <span className={s.posBadge}>{index + 1}</span>
                <button
                    type='button'
                    className={s.removeBtn}
                    aria-label='Remove from rotation'
                    onClick={e => { e.stopPropagation(); onRemove(item.id) }}
                >
                    <Close sx={{ fontSize: 13 }} />
                </button>
                {(item.caption || item.opLabel) && <span className={mc.cap}>{item.caption || item.opLabel}</span>}
            </div>
        </div>
    )
}

export default function FeaturedTab() {
    const [rotation, setRotation] = useState<FeaturedItemAPI[]>([])
    const [rotationLoading, setRotationLoading] = useState(true)
    const [library, setLibrary] = useState<AdminMediaAPI[]>([])
    const [libraryPage, setLibraryPage] = useState(0)
    const [libraryTotal, setLibraryTotal] = useState(0)
    const [libraryLoading, setLibraryLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [note, setNote] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const uploadInputRef = useRef<HTMLInputElement>(null)

    // Not an admin-only route: /api/gallery is what the public rail itself
    // reads, already ordered by featuredOrder — reusing it here means this
    // tab can never show a rotation that disagrees with what a visitor sees.
    const loadRotation = useCallback(async () => {
        setRotationLoading(true)
        try {
            const res = await fetch('/api/gallery')
            const data: GalleryAPI = await res.json()
            setRotation(data.featured ?? [])
        } finally {
            setRotationLoading(false)
        }
    }, [])

    // Library images only, sorted by rating — the picker for "what goes in
    // next". kind=image because the public rail (FeaturedRail.tsx) renders a
    // tile with a plain <img>; a video added here would just be a broken tile
    // on the front page, not a video player.
    const loadLibrary = useCallback(async (page: number) => {
        setLibraryLoading(true)
        try {
            const res = await fetch(`/api/gallery/admin/library?sort=rated&kind=image&page=${page}`)
            const data = await res.json()
            setLibrary(prev => page === 0 ? (data.items ?? []) : [...prev, ...(data.items ?? [])])
            setLibraryTotal(data.total ?? 0)
        } finally {
            setLibraryLoading(false)
        }
    }, [])

    useEffect(() => { loadRotation() }, [loadRotation])
    useEffect(() => { loadLibrary(libraryPage) }, [loadLibrary, libraryPage])

    /** The one write this whole tab makes. Optimistic locally — the order
     *  route's own set-then-unset sequencing is what keeps a mid-failure
     *  state recoverable server-side; this just reflects the result back,
     *  or reloads on failure so the tab never shows an order it didn't
     *  actually get to keep. */
    const putOrder = useCallback(async (ids: string[]) => {
        setSaving(true)
        try {
            const res = await fetch('/api/gallery/admin/featured/order', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                setNote(typeof data.error === 'string' ? data.error : 'Could not save the rotation.')
                await loadRotation()
                return
            }
            await loadRotation()
        } catch {
            setNote('Could not reach the server.')
            await loadRotation()
        } finally {
            setSaving(false)
        }
    }, [loadRotation])

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

    const onDragEnd = useCallback((e: DragEndEvent) => {
        const { active, over } = e
        if (!over || active.id === over.id) return
        const oldIndex = rotation.findIndex(i => i.id === active.id)
        const newIndex = rotation.findIndex(i => i.id === over.id)
        if (oldIndex < 0 || newIndex < 0) return
        const next = arrayMove(rotation, oldIndex, newIndex)
        setRotation(next)   // reflected immediately; putOrder reconciles after
        void putOrder(next.map(i => i.id))
    }, [rotation, putOrder])

    const removeFromRotation = useCallback((id: string) => {
        setRotation(prev => prev.filter(i => i.id !== id))
        void putOrder(rotation.filter(i => i.id !== id).map(i => i.id))
    }, [rotation, putOrder])

    const addToRotation = useCallback((id: string) => {
        if (rotation.length >= MAX_ROTATION) {
            setNote(`The rotation is full (${MAX_ROTATION} max) — remove one before adding another.`)
            return
        }
        void putOrder([...rotation.map(i => i.id), id])
    }, [rotation, putOrder])

    /* A real shuffle — Fisher-Yates — run once, on request, and written to
       featuredOrder. This is what replaced the public page's per-visit
       `.sort(() => Math.random() - 0.5)`: that comparator wasn't a uniform
       shuffle either, and it discarded whatever order this tab had just set,
       every single time someone loaded the page. */
    const shuffle = useCallback(() => {
        const ids = rotation.map(i => i.id)
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[ids[i], ids[j]] = [ids[j], ids[i]]
        }
        void putOrder(ids)
    }, [rotation, putOrder])

    const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (!files.length) return
        setUploading(true)
        const fd = new FormData()
        files.forEach(f => fd.append('files', f))
        await fetch('/api/gallery/admin/featured', { method: 'POST', body: fd })
        e.target.value = ''
        setUploading(false)
        // No record exists for this file yet — see the module comment on
        // /api/gallery/admin/featured — so saying nothing here would look
        // like the upload silently failed to reach the rotation.
        setNote('Uploaded. It has no library record yet and will not appear below until the next Health re-scan indexes it — then it can be added to the rotation like any other image.')
    }, [])

    useEffect(() => {
        if (!note) return
        const t = setTimeout(() => setNote(null), 8000)
        return () => clearTimeout(t)
    }, [note])

    const rotationIds = new Set(rotation.map(i => i.id))
    const libraryVisible = library.filter(i => !rotationIds.has(i.id))
    const hasMoreLibrary = library.length < libraryTotal

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col'>
            {(saving || uploading) && (
                <LinearProgress sx={{ mb: 2, backgroundColor: 'rgba(219,0,29,0.1)', '& .MuiLinearProgress-bar': { backgroundColor: 'var(--red)' } }} />
            )}

            {note && (
                <Typography sx={{ fontSize: '0.75rem', color: 'var(--red-hi)', mb: 2 }}>{note}</Typography>
            )}

            <section className={s.zone}>
                <CornerBrackets />
                <div className={s.zoneHead}>
                    <Typography className={s.zoneTitle}>In rotation ({rotation.length})</Typography>
                    <button type='button' className={c.btn} disabled={rotation.length < 2 || saving} onClick={shuffle}>
                        <Shuffle sx={{ fontSize: 14, marginRight: '4px', verticalAlign: 'middle' }} />
                        Shuffle
                    </button>
                    <button type='button' className={c.btn} disabled={uploading} onClick={() => uploadInputRef.current?.click()}>
                        <Upload sx={{ fontSize: 14, marginRight: '4px', verticalAlign: 'middle' }} />
                        Upload
                    </button>
                    <span className={s.zoneNote} style={{ marginLeft: 'auto' }}>Drag to reorder. This is the order the public rail plays in.</span>
                </div>

                {rotationLoading ? <TacticalSkeleton rows={2} /> : rotation.length === 0 ? (
                    <div className={mc.empty}>Nothing in rotation yet — add something from the library below.</div>
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                        <SortableContext items={rotation.map(i => i.id)} strategy={rectSortingStrategy}>
                            <div className={mc.grid}>
                                {rotation.map((item, i) => (
                                    <RotationTile key={item.id} item={item} index={i} onRemove={removeFromRotation} />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </section>

            <section className={s.zone}>
                <CornerBrackets />
                <div className={s.zoneHead}>
                    <Typography className={s.zoneTitle}>Library ({libraryTotal})</Typography>
                    <span className={s.zoneNote}>Top rated first. Already-featured images are hidden.</span>
                </div>

                {libraryLoading && library.length === 0 ? <TacticalSkeleton rows={4} /> : libraryVisible.length === 0 ? (
                    <div className={mc.empty}>Nothing here to add.</div>
                ) : (
                    <>
                        <div className={mc.grid}>
                            {libraryVisible.map(item => (
                                <div key={item.id} className={mc.tile}>
                                    {(item.poster ?? item.src) && <img src={item.poster ?? item.src ?? ''} alt='' loading='lazy' decoding='async' />}
                                    <button type='button' className={s.addBtn} onClick={() => addToRotation(item.id)}>
                                        <Add sx={{ fontSize: 12, verticalAlign: 'middle' }} /> Add
                                    </button>
                                    <span className={mc.cap}>{item.caption || item.opLabel || 'Untitled'}</span>
                                </div>
                            ))}
                        </div>
                        {hasMoreLibrary && (
                            <div className={mc.pager}>
                                <button type='button' className={c.btn} disabled={libraryLoading} onClick={() => setLibraryPage(p => p + 1)}>
                                    Load more
                                </button>
                            </div>
                        )}
                    </>
                )}
            </section>

            <input ref={uploadInputRef} type='file' multiple accept='image/*' style={{ display: 'none' }} onChange={handleUpload} />
        </div>
    )
}
