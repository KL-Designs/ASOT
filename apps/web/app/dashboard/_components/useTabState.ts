'use client'
import { useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

import { resolveTabState, type View } from './tab-state'

/**
 * URL-backed tab + view state for department panels.
 * Derives state directly from search params so sidebar links update the active tab reactively.
 *
 * `settings` is the department's Admin view (row 84). Its sub-tab lives in
 * `?admin=<key>`. Tools that used to be main tabs and now live under Admin are
 * listed in `movedTabs` (old tab number → admin key): an old pin or bookmark
 * pointing at `?tab=<n>` opens that tool under Admin instead of a blank tab.
 */
export function useTabState(defaultTab = 0, defaultView: View = 'dept', movedTabs: Record<number, string> = {}) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()

    const { tab, view, adminTab } = resolveTabState(
        { tab: searchParams.get('tab'), view: searchParams.get('view'), admin: searchParams.get('admin') },
        defaultTab, defaultView, movedTabs,
    )

    const setTab = useCallback((n: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', String(n))
        params.set('view', 'dept')
        params.delete('admin')
        router.replace(`${pathname}?${params.toString()}` as any)
    }, [searchParams, router, pathname])

    const setView = useCallback((v: View) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('view', v)
        if (v !== 'settings') params.delete('admin')
        // Leaving a moved tab's number in the URL would bounce straight back to Admin.
        if (v === 'dept' && movedTabs[Number(params.get('tab'))]) params.delete('tab')
        router.replace(`${pathname}?${params.toString()}` as any)
    }, [searchParams, router, pathname, movedTabs])

    const setAdminTab = useCallback((key: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('view', 'settings')
        params.set('admin', key)
        if (movedTabs[Number(params.get('tab'))]) params.delete('tab')
        router.replace(`${pathname}?${params.toString()}` as any)
    }, [searchParams, router, pathname, movedTabs])

    return { tab, setTab, view, setView, adminTab, setAdminTab }
}
