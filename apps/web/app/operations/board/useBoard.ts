'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    parseBoardFilter, type BoardFilter, type BoardOperation, type CampaignRef,
    type MissionRef, type MonthBucket,
} from '@/lib/operations/board'

export interface FacetCount { value: string; label: string; count: number }

export interface BoardData {
    upcoming: BoardOperation[]
    past: BoardOperation[]
    total: number
    pageSize: number
    histogram: MonthBucket[]
    facets: {
        campaigns: FacetCount[]
        units: FacetCount[]
        terrains: FacetCount[]
        mine: number
    }
    campaigns: CampaignRef[]
    missions: MissionRef[]
    lastFlown: { title: string; date: string } | null
    signedIn: boolean
    staff: { inDevelopment: number } | null
}

const EMPTY_FILTER: BoardFilter = {
    q: '', campaignId: null, unit: null, terrain: null, mine: false, from: null, to: null, skip: 0,
}

function toQuery(f: BoardFilter): URLSearchParams {
    const p = new URLSearchParams()
    if (f.q) p.set('q', f.q)
    if (f.campaignId) p.set('campaign', f.campaignId)
    if (f.unit) p.set('unit', f.unit)
    if (f.terrain) p.set('terrain', f.terrain)
    if (f.mine) p.set('mine', '1')
    if (f.from) p.set('from', f.from)
    if (f.to) p.set('to', f.to)
    return p
}

/**
 * The board's data and the filter that shapes it.
 *
 * ## The filter lives in the URL
 *
 * Not for the browser history — every change is a `replaceState`, so Back still
 * leaves the page rather than walking every filter you touched. It is so a
 * filtered view can be sent to somebody: "every operation 1-3 was on" is a
 * useful thing to be able to paste into Discord, and a page that holds its
 * state only in React cannot produce one.
 *
 * ## Paging appends, filtering replaces
 *
 * Changing a filter starts the archive again from the top; "load more" adds to
 * what is already there. They are the same request with a different `skip`, so
 * the distinction is made here rather than by the endpoint.
 */
export function useBoard() {
    const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER)
    const [data, setData] = useState<BoardData | null>(null)
    const [loading, setLoading] = useState(true)
    const [paging, setPaging] = useState(false)
    const [error, setError] = useState<string | null>(null)

    /**
     * Nothing loads until the deep link has been read.
     *
     * The filter cannot be initialised from the URL during render — this
     * component is still server-rendered, where there is no location, and
     * guessing would be a hydration mismatch the moment anybody shares a
     * filtered link. So it is applied in an effect, and the fetch waits for
     * `ready` rather than firing once with the empty filter and again with the
     * real one.
     */
    const [ready, setReady] = useState(false)
    useEffect(() => {
        setFilter(parseBoardFilter(new URLSearchParams(window.location.search)))
        setReady(true)
    }, [])

    const load = useCallback(async (f: BoardFilter, append: boolean) => {
        append ? setPaging(true) : setLoading(true)
        setError(null)
        try {
            const params = toQuery(f)
            if (f.skip) params.set('skip', String(f.skip))
            const res = await fetch(`/api/operations/board?${params}`)
            if (!res.ok) throw new Error('Could not load the operations board')
            const next: BoardData = await res.json()

            setData(prev => (append && prev
                // The band and the facets belong to the unpaged request; a page
                // two response carries neither, so the previous ones stand.
                ? { ...next, upcoming: prev.upcoming, past: [...prev.past, ...next.past] }
                : next))
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load the operations board')
        } finally {
            append ? setPaging(false) : setLoading(false)
        }
    }, [])

    // Refetch whenever the filter itself changes — but not for `skip`, which is
    // what `loadMore` drives, and which must append rather than replace.
    const key = toQuery(filter).toString()
    useEffect(() => {
        if (!ready) return
        load({ ...filter, skip: 0 }, false)

        const url = new URL(window.location.href)
        url.search = key
        window.history.replaceState(null, '', url)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, key, load])

    const loadMore = useCallback(() => {
        if (!data || paging) return
        const next = { ...filter, skip: data.past.length }
        setFilter(next)
        load(next, true)
    }, [data, filter, paging, load])

    /** Change one part of the filter; paging starts again from the top. */
    const update = useCallback((patch: Partial<BoardFilter>) => {
        setFilter(prev => ({ ...prev, ...patch, skip: 0 }))
    }, [])

    const clear = useCallback(() => setFilter(EMPTY_FILTER), [])

    return { filter, data, loading, paging, error, update, clear, loadMore }
}
