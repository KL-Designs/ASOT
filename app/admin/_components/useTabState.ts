'use client'
import { useState, useEffect, useCallback } from 'react'

type View = 'dept' | 'members' | 'calendar'

/**
 * URL-backed tab + view state for department panels.
 * Reads `?tab=N&view=V` on mount; updates URL on change without triggering navigation.
 */
export function useTabState(defaultTab = 0, defaultView: View = 'dept') {
    const [tab, setTabState] = useState(defaultTab)
    const [view, setViewState] = useState<View>(defaultView)

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const t = params.get('tab')
        const v = params.get('view') as View | null
        if (t !== null && !isNaN(Number(t))) setTabState(Number(t))
        if (v && (v === 'dept' || v === 'members' || v === 'calendar')) setViewState(v)
    }, [])

    const setTab = useCallback((n: number) => {
        setTabState(n)
        setViewState('dept')
        const url = new URL(window.location.href)
        url.searchParams.set('tab', String(n))
        url.searchParams.set('view', 'dept')
        window.history.replaceState(null, '', url.toString())
    }, [])

    const setView = useCallback((v: View) => {
        setViewState(v)
        const url = new URL(window.location.href)
        url.searchParams.set('view', v)
        window.history.replaceState(null, '', url.toString())
    }, [])

    return { tab, setTab, view, setView }
}
