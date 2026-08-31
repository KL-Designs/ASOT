'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { EmbedKind } from '@/lib/gallery/embeds'
import { splitOperation } from '@/lib/gallery/naming'

export type Tag = { id: string, slug: string, label: string, order: number, retired: boolean }
export type OperationOption = { id: string, title: string, date: string | null }

export type PendingItem = {
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

export type Batch = {
    batchId: string
    items: PendingItem[]
    authorName: string
    earliest: string
}

/** What a reviewer can change from the queue. `patch` always schedules a save
 *  of the full triple below regardless of which field changed — matching the
 *  PATCH route, which replaces caption/tags/operationId together rather than
 *  accepting a partial update, so there is only ever one save shape to reason
 *  about. */
export type PatchFields = Partial<{ caption: string, tags: string[], operationId: string }>

const SAVE_DEBOUNCE_MS = 800

/**
 * Owns the pending queue and, critically, the debounce-and-flush contract.
 *
 * Edits are debounced 800ms; Accept is not, and the accept route ignores its
 * request body — it publishes whatever is already in the database. Without a
 * flush, correcting a mis-tagged operation and clicking Accept within the
 * debounce window publishes the OLD values, silently. That was a Critical
 * found in the first review round, fixed with a per-item `pendingSave` ref
 * awaited before every accept (and, inside `acceptBatch`, before each item's
 * own accept) — carried across verbatim here, not reinvented.
 */
export function useSubmissions() {
    const [items, setItems]           = useState<PendingItem[]>([])
    const [tags, setTags]             = useState<Tag[]>([])
    const [operations, setOperations] = useState<OperationOption[]>([])
    const [loading, setLoading]       = useState(true)
    const [busy, setBusy]             = useState<Record<string, boolean>>({})
    const [saveState, setSaveState]   = useState<Record<string, 'saving' | 'saved' | 'error' | undefined>>({})

    // Keyed by item id: a failed accept or reject (most often a 409 from a
    // failed transcode with no media behind it) has to land somewhere a
    // reviewer will actually see it, not just a silent no-op where the item
    // stays in the list with no explanation.
    const [error, setError] = useState<Record<string, string | undefined>>({})

    const itemsRef = useRef(items)
    useEffect(() => { itemsRef.current = items }, [items])
    const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
    // Ids with an edit that has not yet been confirmed saved — set the moment
    // a field changes, cleared only once its PATCH actually succeeds. This is
    // what a flush checks: the debounce timer alone is not enough to know
    // whether there is unsaved work, because the timer id lingers in `timers`
    // (harmlessly inert) after it has already fired.
    const pendingSave = useRef<Set<string>>(new Set())

    const refresh = useCallback(() => {
        return fetch('/api/gallery/submissions/pending')
            .then(r => r.ok ? r.json() : { items: [] })
            .then(data => setItems(data.items ?? []))
    }, [])

    useEffect(() => {
        Promise.all([
            refresh(),
            fetch('/api/gallery/tags').then(r => r.ok ? r.json() : { tags: [] })
                .then(d => setTags((d.tags ?? []).filter((t: Tag) => !t.retired))),
            fetch('/api/gallery/operations').then(r => r.ok ? r.json() : { operations: [] })
                .then(d => setOperations(d.operations ?? [])),
        ]).finally(() => setLoading(false))

        // Timers belong to this mount only — a debounced save firing after the
        // tab has been left behind would PATCH a stale item nobody is looking at.
        // Closed over here (not read from the ref at cleanup time) because the
        // ref's contents by unmount are whatever the last edit scheduled, and
        // this effect only ever runs once, so there is nothing later to miss.
        const timersAtMount = timers.current
        return () => { Object.values(timersAtMount).forEach(clearTimeout) }
    }, [refresh])

    const batches = useMemo<Batch[]>(() => {
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

    /**
     * Await any pending save for this item before doing anything that reads it
     * server-side.
     *
     * Edits are debounced; Accept is not, and the accept route ignores its request
     * body — it publishes what is already in the database. Without this, correcting
     * a mis-tagged operation and clicking Accept within the debounce window
     * publishes the OLD values, silently. That was a real defect, found in review.
     */
    const flush = useCallback(async (id: string): Promise<boolean> => {
        if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id] }
        if (!pendingSave.current.has(id)) return true
        return saveItem(id)
    }, [saveItem])

    const patch = useCallback((id: string, fields: PatchFields) => {
        setItems(prev => prev.map(it => {
            if (it.id !== id) return it
            const next = { ...it, ...fields }
            // Re-derives opLabel/takenAt alongside operationId, on the client
            // too, so the row never shows a stale date next to a freshly-picked
            // operation while the debounced PATCH is still in flight.
            if ('operationId' in fields) {
                if (fields.operationId === 'unknown' || fields.operationId == null) {
                    next.operationId = null
                    next.opLabel = null
                    next.takenAt = null
                } else {
                    const op = operations.find(o => o.id === fields.operationId)
                    next.opLabel = op ? splitOperation(op.title).label : it.opLabel
                    next.takenAt = op?.date ?? it.takenAt
                }
            }
            return next
        }))
        scheduleSave(id)
    }, [operations, scheduleSave])

    const accept = useCallback(async (id: string): Promise<void> => {
        setBusy(prev => ({ ...prev, [id]: true }))
        setError(prev => ({ ...prev, [id]: undefined }))
        try {
            // Flush first: publishing has to carry whatever the reviewer just
            // typed, not whatever the last debounce cycle happened to save.
            if (!await flush(id)) return
            const res = await fetch(`/api/gallery/submissions/${id}`, { method: 'POST' })
            if (res.ok) { removeItem(id); return }
            // A 409 here is most often a failed transcode with no media behind
            // it (see the route's own comment) — surfaced per-item rather than
            // left to fail silently, which would leave the item sitting in the
            // list with no explanation for why Accept did nothing.
            const body = await res.json().catch(() => ({}))
            setError(prev => ({ ...prev, [id]: body.error ?? 'Could not publish this item.' }))
        } finally {
            setBusy(prev => { const n = { ...prev }; delete n[id]; return n })
        }
    }, [flush, removeItem])

    const acceptBatch = useCallback(async (batchId: string): Promise<void> => {
        const ids = itemsRef.current.filter(i => i.batchId === batchId).map(i => i.id)
        setBusy(prev => { const n = { ...prev }; ids.forEach(id => { n[id] = true }); return n })
        setError(prev => { const n = { ...prev }; ids.forEach(id => { n[id] = undefined }); return n })
        // Every item's edit is flushed before its own accept — not just the
        // one the reviewer was last looking at — since a batch can carry
        // several items with a debounce still in flight at once.
        await Promise.all(ids.map(async id => {
            if (!await flush(id)) return
            const res = await fetch(`/api/gallery/submissions/${id}`, { method: 'POST' })
            if (res.ok) { removeItem(id); return }
            const body = await res.json().catch(() => ({}))
            setError(prev => ({ ...prev, [id]: body.error ?? 'Could not publish this item.' }))
        }))
        setBusy(prev => { const n = { ...prev }; ids.forEach(id => delete n[id]); return n })
    }, [flush, removeItem])

    /** Returns whether the rejection went through, so a caller driving a
     *  confirmation dialog knows whether to close it. Same flush-first
     *  reasoning as accept: the caption/tags stored on the rejected record are
     *  the audit trail, so they must be whatever the reviewer last typed, not
     *  whatever the debounce last sent. */
    const reject = useCallback(async (id: string, reason: string): Promise<boolean> => {
        const trimmed = reason.trim()
        if (!trimmed) return false
        setBusy(prev => ({ ...prev, [id]: true }))
        setError(prev => ({ ...prev, [id]: undefined }))
        try {
            if (!await flush(id)) return false
            const res = await fetch(`/api/gallery/submissions/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: trimmed }),
            })
            if (res.ok) { removeItem(id); return true }
            const body = await res.json().catch(() => ({}))
            setError(prev => ({ ...prev, [id]: body.error ?? 'Could not reject this item.' }))
            return false
        } finally {
            setBusy(prev => { const n = { ...prev }; delete n[id]; return n })
        }
    }, [flush, removeItem])

    return { batches, tags, operations, loading, patch, flush, accept, acceptBatch, reject, refresh, saveState, busy, error }
}
