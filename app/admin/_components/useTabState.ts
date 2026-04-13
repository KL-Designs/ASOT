'use client'
import { useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

type View = 'dept' | 'members' | 'calendar' | 'meetings'

/**
 * URL-backed tab + view state for department panels.
 * Derives state directly from search params so sidebar links update the active tab reactively.
 */
export function useTabState(defaultTab = 0, defaultView: View = 'dept') {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()

    const rawTab = searchParams.get('tab')
    const rawView = searchParams.get('view') as View | null

    const tab = rawTab !== null && !isNaN(Number(rawTab)) ? Number(rawTab) : defaultTab
    const view: View = rawView && ['dept', 'members', 'calendar', 'meetings'].includes(rawView)
        ? rawView
        : defaultView

    const setTab = useCallback((n: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', String(n))
        params.set('view', 'dept')
        router.replace(`${pathname}?${params.toString()}`)
    }, [searchParams, router, pathname])

    const setView = useCallback((v: View) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('view', v)
        router.replace(`${pathname}?${params.toString()}`)
    }, [searchParams, router, pathname])

    return { tab, setTab, view, setView }
}
