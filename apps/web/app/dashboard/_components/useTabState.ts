'use client'
import { useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

type View = 'dept' | 'settings' | 'calendar' | 'meetings' | 'logs' | 'activity' | 'tickets'

const VALID_VIEWS: View[] = ['dept', 'settings', 'calendar', 'meetings', 'logs', 'activity', 'tickets']

/**
 * URL-backed tab + view state for department panels.
 * Derives state directly from search params so sidebar links update the active tab reactively.
 */
export function useTabState(defaultTab = 0, defaultView: View = 'dept') {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()

    const rawTab  = searchParams.get('tab')
    const rawView = searchParams.get('view')

    const tab  = rawTab !== null && !isNaN(Number(rawTab)) ? Number(rawTab) : defaultTab
    // Legacy alias: this view was called 'members' before it became Settings.
    // Keep old bookmarks and pinned links working.
    const requestedView = rawView === 'members' ? 'settings' : rawView
    const view: View = requestedView && VALID_VIEWS.includes(requestedView as View) ? (requestedView as View) : defaultView

    const setTab = useCallback((n: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', String(n))
        params.set('view', 'dept')
        router.replace(`${pathname}?${params.toString()}` as any)
    }, [searchParams, router, pathname])

    const setView = useCallback((v: View) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('view', v)
        router.replace(`${pathname}?${params.toString()}` as any)
    }, [searchParams, router, pathname])

    return { tab, setTab, view, setView }
}
