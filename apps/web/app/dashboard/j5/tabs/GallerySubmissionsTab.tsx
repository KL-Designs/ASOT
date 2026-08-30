'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Typography, Button, Autocomplete, TextField, Chip, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress } from '@mui/material'
import { Done, Close, Warning } from '@mui/icons-material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import { embedIframeSrc, type EmbedProvider, type EmbedKind } from '@/lib/gallery/embeds'
import { splitOperation } from '@/lib/gallery/naming'

type Tag = { id: string, slug: string, label: string, order: number, retired: boolean }
type OperationOption = { id: string, title: string, date: string | null }

type PendingItem = {
    id: string
    kind: 'image' | 'video'
    source: 'upload' | 'youtube' | 'twitch'
    src: string | null
    poster: string | null
    embedId: string | null
    embedKind: EmbedKind | null
    embedUrl: string | null
    caption: string
    tags: string[]
    operationId: string | null
    opLabel: string | null
    takenAt: string | null
    durationSec: number | null
    authorId: string | null
    authorName: string
    batchId: string
    createdAt: string
    processingError: string | null
}

const SAVE_DEBOUNCE_MS = 800

const tileStyle = {
    border: '1px solid rgba(219,0,29,0.42)',
    borderTop: '2px solid var(--red)',
    background: 'rgba(255,255,255,0.04)',
}

const itemStyle = {
    border: '1px solid rgba(219,0,29,0.08)',
    background: 'rgba(255,255,255,0.015)',
}

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.78rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.78rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
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

function timeAgo(iso: string) {
    const diff  = Date.now() - new Date(iso).getTime()
    const mins  = Math.floor(diff / 60_000)
    const hours = Math.floor(diff / 3_600_000)
    const days  = Math.floor(diff / 86_400_000)
    if (mins  < 1)  return 'just now'
    if (mins  < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
}

function formatDuration(totalSec: number): string {
    const m = Math.floor(totalSec / 60)
    const sec = Math.round(totalSec % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
}

/** Playable at full size, not a thumbnail — this is a review surface, not a
 *  grid. An upload plays from its own storage route; an embed goes through
 *  `embedIframeSrc`, which requires the caller's own `window.location.hostname`
 *  and nothing derived from the item, or a Twitch player refuses to load. */
function MediaPreview({ item }: { item: PendingItem }) {
    const frameStyle: React.CSSProperties = {
        width: '100%', maxWidth: 480, aspectRatio: '16/9', background: '#000', display: 'block', border: '1px solid rgba(255,255,255,0.08)',
    }

    if (item.source === 'upload') {
        if (item.kind === 'image') {
            return <img src={item.src ?? ''} alt='' style={{ ...frameStyle, aspectRatio: 'auto', maxHeight: 420, objectFit: 'contain' }} />
        }
        return (
            <video
                controls
                poster={item.poster ?? undefined}
                src={item.src ?? undefined}
                style={{ ...frameStyle, aspectRatio: 'auto', maxHeight: 420 }}
            />
        )
    }

    if (!item.embedId || !item.embedKind) {
        return <div style={{ ...frameStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(237,237,237,0.3)', fontSize: '0.72rem' }}>No preview available</div>
    }

    const src = embedIframeSrc(
        { provider: item.source as EmbedProvider, kind: item.embedKind, id: item.embedId },
        window.location.hostname,
    )
    return <iframe src={src} style={frameStyle} allow='autoplay; fullscreen' />
}

export default function GallerySubmissionsTab() {
    const [items, setItems]         = useState<PendingItem[]>([])
    const [tags, setTags]           = useState<Tag[]>([])
    const [operations, setOperations] = useState<OperationOption[]>([])
    const [loading, setLoading]     = useState(true)
    const [busy, setBusy]           = useState<Record<string, boolean>>({})
    const [saveState, setSaveState] = useState<Record<string, 'saving' | 'saved' | 'error' | undefined>>({})

    const [rejectTarget, setRejectTarget] = useState<string | null>(null)
    const [rejectReason, setRejectReason] = useState('')
    const [rejecting, setRejecting]       = useState(false)

    // Keyed by item id, same shape as saveState: a failed accept (most often
    // a failed transcode with no media behind it) has to land somewhere a
    // reviewer will actually see it, not just a silent no-op where the item
    // stays in the list with no explanation.
    const [acceptError, setAcceptError] = useState<Record<string, string | undefined>>({})

    const itemsRef = useRef(items)
    useEffect(() => { itemsRef.current = items }, [items])
    const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
    // Ids with an edit that has not yet been confirmed saved — set the moment
    // a field changes, cleared only once its PATCH actually succeeds. This is
    // what a flush checks: the debounce timer alone is not enough to know
    // whether there is unsaved work, because the timer id lingers in `timers`
    // (harmlessly inert) after it has already fired.
    const pendingSave = useRef<Set<string>>(new Set())

    useEffect(() => {
        Promise.all([
            fetch('/api/gallery/submissions/pending').then(r => r.ok ? r.json() : { items: [] }),
            fetch('/api/gallery/tags').then(r => r.ok ? r.json() : { tags: [] }),
            fetch('/api/gallery/operations').then(r => r.ok ? r.json() : { operations: [] }),
        ]).then(([pending, tagData, opData]) => {
            setItems(pending.items ?? [])
            setTags((tagData.tags ?? []).filter((t: Tag) => !t.retired))
            setOperations(opData.operations ?? [])
        }).finally(() => setLoading(false))

        // Timers belong to this mount only — a debounced save firing after the
        // tab has been left behind would PATCH a stale item nobody is looking at.
        // Closed over here (not read from the ref at cleanup time) because the
        // ref's contents by unmount are whatever the last edit scheduled, and
        // this effect only ever runs once, so there is nothing later to miss.
        const timersAtMount = timers.current
        return () => { Object.values(timersAtMount).forEach(clearTimeout) }
    }, [])

    const groups = useMemo(() => {
        const byBatch = new Map<string, PendingItem[]>()
        for (const item of items) {
            const arr = byBatch.get(item.batchId) ?? []
            arr.push(item)
            byBatch.set(item.batchId, arr)
        }
        return Array.from(byBatch.entries())
            .map(([batchId, its]) => ({
                batchId,
                items: its,
                authorName: its[0].authorName,
                earliest: its.reduce((min, it) => it.createdAt < min ? it.createdAt : min, its[0].createdAt),
            }))
            .sort((a, b) => a.earliest.localeCompare(b.earliest))
    }, [items])

    const removeItem = useCallback((id: string) => {
        setItems(prev => prev.filter(i => i.id !== id))
        if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id] }
        pendingSave.current.delete(id)
    }, [])

    /** Returns whether the save succeeded. Left in `pendingSave` on failure —
     *  and `saveState` left at 'error' rather than cleared — so a second
     *  attempt (the reviewer editing again, or clicking Accept/Reject again)
     *  finds there is still unsaved work rather than wrongly assuming the
     *  first attempt's silence meant it went through. */
    const saveItem = useCallback(async (id: string): Promise<boolean> => {
        const item = itemsRef.current.find(i => i.id === id)
        if (!item) { pendingSave.current.delete(id); return true }
        setSaveState(prev => ({ ...prev, [id]: 'saving' }))
        try {
            const res = await fetch(`/api/gallery/submissions/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caption: item.caption, tags: item.tags, operationId: item.operationId ?? 'unknown' }),
            })
            if (res.ok) {
                pendingSave.current.delete(id)
                setSaveState(prev => ({ ...prev, [id]: 'saved' }))
                return true
            }
            setSaveState(prev => ({ ...prev, [id]: 'error' }))
            return false
        } catch {
            setSaveState(prev => ({ ...prev, [id]: 'error' }))
            return false
        }
    }, [])

    const scheduleSave = useCallback((id: string) => {
        setSaveState(prev => ({ ...prev, [id]: undefined }))
        pendingSave.current.add(id)
        if (timers.current[id]) clearTimeout(timers.current[id])
        timers.current[id] = setTimeout(() => { delete timers.current[id]; saveItem(id) }, SAVE_DEBOUNCE_MS)
    }, [saveItem])

    /** Accept and Reject both call this before doing anything else. A pending
     *  debounced edit is cancelled and its PATCH is run and awaited right
     *  now, rather than left to fire on its own timer — otherwise a reviewer
     *  who edits and then accepts within the debounce window publishes the
     *  *old* values with no error and no warning, which is the one thing
     *  this tab exists to prevent. Returns false if there was unsaved work
     *  and saving it just failed; callers must not proceed in that case. */
    const flushSave = useCallback(async (id: string): Promise<boolean> => {
        if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id] }
        if (!pendingSave.current.has(id)) return true
        return saveItem(id)
    }, [saveItem])

    const updateCaption = useCallback((id: string, caption: string) => {
        setItems(prev => prev.map(it => it.id === id ? { ...it, caption } : it))
        scheduleSave(id)
    }, [scheduleSave])

    const updateTags = useCallback((id: string, slugs: string[]) => {
        setItems(prev => prev.map(it => it.id === id ? { ...it, tags: slugs } : it))
        scheduleSave(id)
    }, [scheduleSave])

    const updateOperation = useCallback((id: string, operationId: string) => {
        // Re-derives opLabel/takenAt alongside operationId, on the client too,
        // so the card never shows a stale date next to a freshly-picked
        // operation while the debounced PATCH is still in flight.
        setItems(prev => prev.map(it => {
            if (it.id !== id) return it
            if (operationId === 'unknown') return { ...it, operationId: null, opLabel: null, takenAt: null }
            const op = operations.find(o => o.id === operationId)
            return {
                ...it,
                operationId,
                opLabel: op ? splitOperation(op.title).label : it.opLabel,
                takenAt: op?.date ?? it.takenAt,
            }
        }))
        scheduleSave(id)
    }, [operations, scheduleSave])

    async function acceptItem(id: string) {
        setBusy(prev => ({ ...prev, [id]: true }))
        setAcceptError(prev => ({ ...prev, [id]: undefined }))
        try {
            // Flush first: publishing has to carry whatever the reviewer just
            // typed, not whatever the last debounce cycle happened to save.
            if (!await flushSave(id)) return
            const res = await fetch(`/api/gallery/submissions/${id}`, { method: 'POST' })
            if (res.ok) { removeItem(id); return }
            // A 409 here is most often a failed transcode with no media behind
            // it (see the route's own comment) — surfaced per-item rather than
            // left to fail silently, which would leave the item sitting in the
            // list with no explanation for why Accept did nothing.
            const body = await res.json().catch(() => ({}))
            setAcceptError(prev => ({ ...prev, [id]: body.error ?? 'Could not publish this item.' }))
        } finally {
            setBusy(prev => { const n = { ...prev }; delete n[id]; return n })
        }
    }

    async function acceptBatch(batchId: string) {
        const ids = items.filter(i => i.batchId === batchId).map(i => i.id)
        setBusy(prev => { const n = { ...prev }; ids.forEach(id => { n[id] = true }); return n })
        setAcceptError(prev => { const n = { ...prev }; ids.forEach(id => { n[id] = undefined }); return n })
        // Every item's edit is flushed before its own accept — not just the
        // one the reviewer was last looking at — since a batch can carry
        // several items with a debounce still in flight at once.
        await Promise.all(ids.map(async id => {
            if (!await flushSave(id)) return
            const res = await fetch(`/api/gallery/submissions/${id}`, { method: 'POST' })
            if (res.ok) { removeItem(id); return }
            const body = await res.json().catch(() => ({}))
            setAcceptError(prev => ({ ...prev, [id]: body.error ?? 'Could not publish this item.' }))
        }))
        setBusy(prev => { const n = { ...prev }; ids.forEach(id => delete n[id]); return n })
    }

    async function confirmReject() {
        if (!rejectTarget || !rejectReason.trim()) return
        setRejecting(true)
        try {
            // Same reasoning as acceptItem: the caption/tags stored on the
            // rejected record are the audit trail, so they must be whatever
            // the reviewer last typed, not whatever the debounce last sent.
            if (!await flushSave(rejectTarget)) return
            const res = await fetch(`/api/gallery/submissions/${rejectTarget}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: rejectReason.trim() }),
            })
            if (res.ok) {
                removeItem(rejectTarget)
                setRejectTarget(null)
                setRejectReason('')
            }
        } finally {
            setRejecting(false)
        }
    }

    if (loading) return <TacticalSkeleton rows={8} className='p-8' />

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-5'>
            {items.length === 0 ? (
                <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.3)', textAlign: 'center', padding: '32px 0' }}>
                    Nothing waiting for review.
                </Typography>
            ) : groups.map(group => (
                <div key={group.batchId} style={tileStyle} className='flex flex-col gap-3 p-4'>
                    <CornerBrackets />
                    <div className='flex items-center gap-3 flex-wrap' style={{ position: 'relative' }}>
                        <Typography fontWeight={700} fontSize='0.82rem' letterSpacing={1}>
                            {group.authorName}
                        </Typography>
                        <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.4)' }}>
                            {group.items.length} item{group.items.length !== 1 ? 's' : ''} · {timeAgo(group.earliest)}
                        </Typography>
                        <Button
                            size='small'
                            variant='outlined'
                            startIcon={<Done fontSize='small' />}
                            onClick={() => acceptBatch(group.batchId)}
                            disabled={group.items.some(i => busy[i.id])}
                            sx={{ ...redBtn, marginLeft: 'auto' }}
                        >
                            Accept all
                        </Button>
                    </div>

                    <div className='flex flex-col gap-3'>
                        {group.items.map(item => {
                            const opValue = item.operationId ?? 'unknown'
                            const selectedTags = tags.filter(t => item.tags.includes(t.slug))
                            const state = saveState[item.id]
                            return (
                                <div key={item.id} style={itemStyle} className='flex flex-col md:flex-row gap-4 p-3'>
                                    <div style={{ flexShrink: 0 }}>
                                        <MediaPreview item={item} />
                                        {item.durationSec ? (
                                            <Typography fontSize='0.65rem' style={{ color: 'rgba(237,237,237,0.35)', marginTop: 2 }}>
                                                {formatDuration(item.durationSec)}
                                            </Typography>
                                        ) : null}
                                    </div>

                                    <div className='flex flex-col gap-2' style={{ flex: 1, minWidth: 0 }}>
                                        {item.processingError && (
                                            <div style={{
                                                display: 'flex', alignItems: 'flex-start', gap: 6,
                                                background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.4)',
                                                padding: '6px 10px', fontSize: '0.7rem', color: 'rgba(255,150,150,0.95)',
                                            }}>
                                                <Warning sx={{ fontSize: 16, flexShrink: 0, marginTop: '1px' }} />
                                                <span>Transcode failed — this media may be unusable: {item.processingError}</span>
                                            </div>
                                        )}

                                        {acceptError[item.id] && (
                                            <div style={{
                                                display: 'flex', alignItems: 'flex-start', gap: 6,
                                                background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.4)',
                                                padding: '6px 10px', fontSize: '0.7rem', color: 'rgba(255,150,150,0.95)',
                                            }}>
                                                <Warning sx={{ fontSize: 16, flexShrink: 0, marginTop: '1px' }} />
                                                <span>{acceptError[item.id]}</span>
                                            </div>
                                        )}

                                        <TextField
                                            label='Caption'
                                            value={item.caption}
                                            onChange={e => updateCaption(item.id, e.target.value)}
                                            multiline
                                            minRows={2}
                                            size='small'
                                            fullWidth
                                            sx={inputSx}
                                        />

                                        <Autocomplete
                                            multiple
                                            size='small'
                                            options={tags}
                                            value={selectedTags}
                                            getOptionLabel={t => t.label}
                                            isOptionEqualToValue={(o, v) => o.slug === v.slug}
                                            onChange={(_, v) => updateTags(item.id, v.map(t => t.slug))}
                                            renderInput={params => <TextField {...params} label='Tags' sx={inputSx} />}
                                            renderTags={(value, getTagProps) =>
                                                value.map((t, i) => (
                                                    <Chip {...getTagProps({ index: i })} key={t.slug} label={t.label} size='small' sx={{ fontSize: '0.68rem', height: 20, borderRadius: '2px' }} />
                                                ))
                                            }
                                        />

                                        <Autocomplete
                                            size='small'
                                            options={[{ id: 'unknown', title: 'Unknown', date: null }, ...operations]}
                                            getOptionLabel={o => o.title}
                                            isOptionEqualToValue={(o, v) => o.id === v.id}
                                            value={[{ id: 'unknown', title: 'Unknown', date: null }, ...operations].find(o => o.id === opValue) ?? null}
                                            onChange={(_, v) => updateOperation(item.id, v?.id ?? 'unknown')}
                                            renderInput={params => <TextField {...params} label='Operation' sx={inputSx} />}
                                        />

                                        <div className='flex items-center gap-2 flex-wrap' style={{ marginTop: 2 }}>
                                            <Typography fontSize='0.62rem' style={{ color: state === 'error' ? 'rgba(255,120,120,0.9)' : 'rgba(237,237,237,0.3)', fontFamily: 'monospace' }}>
                                                {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : state === 'error' ? 'Save failed — try again' : ' '}
                                            </Typography>

                                            <Button
                                                size='small'
                                                variant='outlined'
                                                startIcon={busy[item.id] ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : <Done fontSize='small' />}
                                                disabled={busy[item.id]}
                                                onClick={() => acceptItem(item.id)}
                                                sx={{ ...redBtn, marginLeft: 'auto' }}
                                            >
                                                Accept
                                            </Button>
                                            <Button
                                                size='small'
                                                variant='outlined'
                                                color='error'
                                                startIcon={<Close fontSize='small' />}
                                                disabled={busy[item.id]}
                                                onClick={() => { setRejectTarget(item.id); setRejectReason('') }}
                                                sx={{ fontSize: '0.72rem' }}
                                            >
                                                Reject
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ))}

            <Dialog open={!!rejectTarget} onClose={() => { if (!rejecting) { setRejectTarget(null); setRejectReason('') } }} PaperProps={{ style: { background: '#181818', border: '1px solid rgba(219,0,29,0.32)', minWidth: 380 } }}>
                <DialogTitle sx={{ fontSize: '0.85rem', letterSpacing: 2, textTransform: 'uppercase', pb: 1 }}>Reject Submission</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.5)' }}>
                        The file is deleted and the submitter is notified with this reason. This cannot be undone.
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        multiline
                        minRows={2}
                        size='small'
                        label='Reason (required)'
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        sx={inputSx}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => { setRejectTarget(null); setRejectReason('') }} disabled={rejecting} sx={ghostBtn}>Cancel</Button>
                    <Button onClick={confirmReject} variant='contained' color='error' disabled={rejecting || !rejectReason.trim()} sx={{ fontSize: '0.75rem' }}>
                        Reject
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    )
}
