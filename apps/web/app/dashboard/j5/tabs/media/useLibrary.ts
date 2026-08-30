'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PAGE_SIZE, type LibraryParams } from '@/lib/gallery/library-query'

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
 *
 * Both fetches surface their failure. Neither used to: a 403 from an expired
 * Discord session left `facets` null and `items` empty, so the rail rendered
 * its two headings and nothing under them while the grid said "Nothing here.
 * Try a different view, or clear the filters." — telling a reviewer their
 * 4,781-item archive was empty and inviting them to fix it by clearing
 * filters that were not set. HealthView, Inspector and BulkPanel all already
 * showed the server's own `error`; this hook was the one server-state
 * consumer that showed nothing at all.
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
    const [error, setError] = useState<string | null>(null)
    // Bumped to re-run the items fetch without changing a filter — what
    // `retry` and `refresh` both ask for. Going through the one effect rather
    // than a second copy of the fetch keeps the request-id guard, the
    // error handling and the page clamp in a single place; a duplicated
    // refetch is how `refresh()` came to have none of the three.
    const [reloadToken, setReloadToken] = useState(0)

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
        try {
            const res = await fetch('/api/gallery/admin/facets')
            if (!res.ok) {
                // The server's own message — same idiom as HealthView.load(),
                // Inspector.save() and BulkPanel.run(). A 403 here says
                // "Forbidden", which tells a reviewer to sign in again rather
                // than to go looking for their missing archive.
                const data = await res.json().catch(() => ({}))
                setError(typeof data.error === 'string' ? data.error : 'Could not load the archive rail.')
                return
            }
            setFacets(await res.json())
        } catch {
            setError('Could not reach the server.')
        }
    }, [])

    useEffect(() => { loadFacets() }, [loadFacets])

    useEffect(() => {
        const id = ++requestId.current
        setLoading(true)
        // Cleared here rather than on success, so a facets failure raised
        // while this request is in flight survives the request completing.
        setError(null)

        void (async () => {
            try {
                const res = await fetch(`/api/gallery/admin/library?${query(effective, page)}`)
                // A stale response must not overwrite a newer one — nor set an
                // error for a request nothing is waiting on any more.
                if (id !== requestId.current) return
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}))
                    setError(typeof data.error === 'string' ? data.error : 'Could not load the archive.')
                    return
                }
                const data = await res.json()
                if (id !== requestId.current) return
                setItems(data.items ?? [])
                const nextTotal = data.total ?? 0
                setTotal(nextTotal)
                /* A bulk move can empty the filter the reviewer is standing
                   in. `pages` shrinks, `page` does not, and the pager then
                   reads "4 / 2" over an empty grid with no way back except
                   Previous. Clamped here, where the new total is known. */
                const pages = Math.ceil(nextTotal / PAGE_SIZE)
                if (page > 0 && page >= pages) setPage(Math.max(0, pages - 1))
            } catch {
                if (id === requestId.current) setError('Could not reach the server.')
            } finally {
                if (id === requestId.current) setLoading(false)
            }
        })()
    }, [effective, page, query, reloadToken])

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

    /** Re-run both fetches after an edit. The items half goes through the
     *  effect above rather than repeating the fetch here — that second copy
     *  had no error handling and no page clamp, which is exactly the pair of
     *  gaps this change closes. */
    const refresh = useCallback(async () => {
        setReloadToken(t => t + 1)
        await loadFacets()
    }, [loadFacets])

    /** What the error banner's Retry does: both halves, since a stale session
     *  403s both and only one of them raised the message on screen. */
    const retry = useCallback(() => {
        setError(null)
        setReloadToken(t => t + 1)
        void loadFacets()
    }, [loadFacets])

    return { items, total, facets, filters, setParam, selectNode, clear, loading, error, retry, page, setPage, refresh }
}
