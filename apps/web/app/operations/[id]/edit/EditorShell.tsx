'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { rgbTriplet } from '@/lib/colour'
import styles from './shell.module.css'

export type EditorTab = 'brief' | 'map' | 'development' | 'attendance'

const TABS: readonly EditorTab[] = ['brief', 'map', 'development', 'attendance']

const TAB_LABELS: Record<EditorTab, string> = {
    brief: 'Brief',
    map: 'Map',
    development: 'Development',
    attendance: 'Attendance',
}

function tabFromLocation(): EditorTab {
    if (typeof window === 'undefined') return 'brief'
    const t = new URLSearchParams(window.location.search).get('tab')
    return (TABS as readonly string[]).includes(t ?? '') ? (t as EditorTab) : 'brief'
}

/**
 * Tabs are plain client state with the URL mirrored via `replaceState` —
 * deliberately not `next/link`/`router.push`. See `app/(landing)/milpacs/[username]/tabs.tsx`
 * for the measured failure rate of Link-based tabs (11/18 commits), and note
 * that a real navigation here would also tear down the Hocuspocus socket and
 * force the Y.Doc to reconnect on every tab switch.
 */
export function useEditorTab(): [EditorTab, (t: EditorTab) => void] {
    const [tab, setTab] = useState<EditorTab>('brief')

    // Read the deep link after mount — the server render has no location.
    useEffect(() => { setTab(tabFromLocation()) }, [])

    const change = (next: EditorTab) => {
        setTab(next)
        const url = new URL(window.location.href)
        url.searchParams.set('tab', next)
        // replaceState, not router.push: no navigation, so the collab socket lives.
        window.history.replaceState(null, '', url)
    }

    return [tab, change]
}

function TabPlaceholder({ label }: { label: string }) {
    return <div className={styles.tabPlaceholder}>{label} — coming soon</div>
}

interface EditorShellProps {
    operationId: string
    themeColor: string
    isHQ: boolean
    tab: EditorTab
    onTabChange: (t: EditorTab) => void
    header: ReactNode
    /** Optional for now — nothing populates it until the deck itself exists. */
    deck?: ReactNode
    statusBar: ReactNode
    children: ReactNode
}

export default function EditorShell({
    themeColor, isHQ, tab, onTabChange, header, deck, statusBar, children,
}: EditorShellProps) {
    const visibleTabs = TABS.filter(t => t !== 'attendance' || isHQ)

    return (
        <div
            className={`command ${styles.shell}`}
            style={{ ['--acc' as string]: themeColor, ['--acc-rgb' as string]: rgbTriplet(themeColor) }}
        >
            {header}

            <nav className={styles.tabbar} aria-label='Operation editor sections'>
                {visibleTabs.map(t => (
                    <button
                        key={t}
                        type='button'
                        onClick={() => onTabChange(t)}
                        aria-current={t === tab ? 'page' : undefined}
                        className={t === tab ? `${styles.tab} ${styles.tabOn}` : styles.tab}
                    >
                        {TAB_LABELS[t].toUpperCase()}
                    </button>
                ))}
            </nav>

            <div className={styles.body}>
                <div className={styles.main}>
                    <div className={styles.mainScroll}>
                        {tab === 'brief' && children}
                        {tab === 'map' && <TabPlaceholder label='Map' />}
                        {tab === 'development' && <TabPlaceholder label='Development' />}
                        {tab === 'attendance' && isHQ && <TabPlaceholder label='Attendance' />}
                    </div>
                </div>
                {deck && <div className={styles.deck}>{deck}</div>}
            </div>

            {statusBar}
        </div>
    )
}
