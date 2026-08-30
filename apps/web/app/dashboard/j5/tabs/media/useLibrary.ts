'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { LibraryParams } from '@/lib/gallery/library-query'

/**
 * The Media tab's server state.
 *
 * Items and facets are fetched separately because they change on different
 * schedules: the list refetches on every filter and keystroke, the rail's
 * counts only after something is edited. Refetching the counts on every
 * keystroke would aggregate the whole collection per character typed.
 *
 * Only the search box is debounced. Every other control here (view, tree
 * node, sort, tag, page) is a click and must feel immediate, so the debounce
 * lives on its own effect keyed on `filters.q` alone — the fetch effect below
 * reacts to `effective`, which only changes when a real filter changes or the
 * debounce timer actually resolves, never on an unrelated re-render (e.g. the
 * grid's selection state changing in the parent component).
 *
 * An in-flight request is abandoned when a newer one starts — without that,
 * typing "chopper" fires several requests whose responses can arrive out of
 * order and leave the grid showing the results for "chopp".
 */

type Filters = Omit<LibraryParams, 'page'>

const EMPTY: Filters = {
    view: 'all', year: null, operation: null, mission: null,
    tag: null, author: null, kind: null, q: null, sort: 'newest',
    yearUnset: false, operationUnset: false,
}

export function useLibrary() {
    const [filters, setFilters] = useState<Filters>(EMPTY)
    const [debouncedQ, setDebouncedQ] = useState<string | null>(EMPTY.q)
    const [page, setPage] = useState(0)
    const [items, setItems] = useState<AdminMediaAPI[]>([])
    const [total, setTotal] = useState(0)
    const [facets, setFacets] = useState<LibraryFacetsAPI | null>(null)
    const [loading, setLoading] = useState(true)

    const requestId = useRef(0)

    // Debounces `q` alone. A search keystroke resets this timer; every other
    // filter change bypasses it entirely because it never touches `filters.q`.
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQ(filters.q), filters.q ? 250 : 0)
        return () => clearTimeout(timer)
    }, [filters.q])

    // Memoised so its identity is stable across renders that don't touch
    // filters or debouncedQ — the parent tab re-renders on every selection
    // toggle, and an un-memoised spread here would be a new object each time,
    // which would make the fetch effect below refire on every tile click.
    const effective = useMemo<Filters>(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ])

    const query = useCallback((f: Filters, p: number) => {
        const search = new URLSearchParams()
        for (const [key, value] of Object.entries(f)) {
            // `false` excluded alongside null/'': yearUnset/operationUnset
            // default false, and parseLibraryParams already treats an absent
            // key as false, so sending it every request would only add noise.
            if (value !== null && value !== '' && value !== false) search.set(key, String(value))
        }
        if (p > 0) search.set('page', String(p))
        return search.toString()
    }, [])

    const loadFacets = useCallback(async () => {
        const res = await fetch('/api/gallery/admin/facets')
        if (res.ok) setFacets(await res.json())
    }, [])

    useEffect(() => { loadFacets() }, [loadFacets])

    useEffect(() => {
        const id = ++requestId.current
        setLoading(true)

        void (async () => {
            try {
                const res = await fetch(`/api/gallery/admin/library?${query(effective, page)}`)
                if (!res.ok) return
                const data = await res.json()
                // A stale response must not overwrite a newer one.
                if (id !== requestId.current) return
                setItems(data.items ?? [])
                setTotal(data.total ?? 0)
            } finally {
                if (id === requestId.current) setLoading(false)
            }
        })()
    }, [effective, page, query])

    const setParam = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }))
        // Any filter change invalidates the page — page 3 of the old result
        // set is rarely page 3 of the new one, and is often past its end.
        setPage(0)
    }, [])

    /**
     * A tree row's year/operation/mission, translated into filter state.
     *
     * LibraryRail passes each field's `unset` flag straight from the facets
     * response (facets/route.ts's tree assembly) rather than this hook
     * inferring it from the display text: the rail can hold two rows that
     * both show the label 'Unknown' — one for "the field is absent", one for
     * a document whose field literally holds that word (relocate.ts's
     * undated-operation branch writes an operation's raw, unvalidated title
     * verbatim, so an admin can title one exactly 'Unknown') — and a string
     * comparison here could not tell the two apart once both exist. The
     * absent one becomes the `*Unset` filter channel; the literal one is
     * passed through as an ordinary value, same as any other year/operation
     * — see lib/gallery/library-query.ts's comment on buildLibraryFilter for
     * why those are two disjoint channels.
     */
    const selectNode = useCallback((sel: {
        year: string | null, yearUnset: boolean,
        operation: string | null, operationUnset: boolean,
        mission: string | null,
    }) => {
        setFilters(prev => ({
            ...prev,
            view: 'all',
            year: sel.yearUnset ? null : sel.year,
            yearUnset: sel.yearUnset,
            operation: sel.operationUnset ? null : sel.operation,
            operationUnset: sel.operationUnset,
            mission: sel.mission,
        }))
        setPage(0)
    }, [])

    const clear = useCallback(() => { setFilters(EMPTY); setPage(0) }, [])

    const refresh = useCallback(async () => {
        const id = ++requestId.current
        const res = await fetch(`/api/gallery/admin/library?${query(effective, page)}`)
        if (res.ok && id === requestId.current) {
            const data = await res.json()
            setItems(data.items ?? [])
            setTotal(data.total ?? 0)
        }
        await loadFacets()
    }, [effective, page, query, loadFacets])

    return { items, total, facets, filters, setParam, selectNode, clear, loading, page, setPage, refresh }
}
