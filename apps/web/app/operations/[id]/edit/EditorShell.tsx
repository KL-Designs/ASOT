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
 *
 * This hook doesn't know about `isHQ`, so it can resolve `?tab=attendance` for
 * a non-HQ user — EditorShell (which does know isHQ) is responsible for
 * falling back to `brief` when the resolved tab isn't actually visible.
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
    /** Documents rail + collaborative editor. Holds the Hocuspocus socket and
     * Y.Doc (see the module doc below) — always mounted, hidden with CSS. */
    brief: ReactNode
    /** The map viewer. Has its own Y.js state (`useMapYjs`) with the same
     * unmount hazard as Brief — mounted on first visit, then kept mounted and
     * hidden with CSS like Brief, never unmounted again afterwards. */
    map: ReactNode
    /** Mission development gates. Holds no socket — free to mount/unmount
     * with the tab switch. */
    development: ReactNode
    /** Who attends, notifications, acknowledgements — `isHQ` only. Holds no
     * socket — free to mount/unmount with the tab switch. Gated by the caller
     * (page.tsx passes `null` for a non-HQ user) and, redundantly, here too:
     * an HQ user's role changing mid-session must not leave stale attendance
     * content selectable via a stale tab value. */
    attendance: ReactNode
    /** Right-padding applied to the tab content area so a slide-over drawer
     * (Activity/Preview, both fixed overlays rendered outside this shell)
     * doesn't cover whichever tab is currently showing. */
    contentPaddingRight?: string | number
}

export default function EditorShell({
    themeColor, isHQ, tab, onTabChange, header, deck, statusBar,
    brief, map, development, attendance, contentPaddingRight,
}: EditorShellProps) {
    const visibleTabs = TABS.filter(t => t !== 'attendance' || isHQ)
    // A tab that isn't in the visible set — a non-HQ user deep-linking
    // ?tab=attendance, or a stale value from before a role change — must not
    // be selected: that renders nothing (no placeholder, no content) with no
    // way back except editing the URL. Fall back to brief instead.
    const active = visibleTabs.includes(tab) ? tab : 'brief'

    // Map mounts on first visit, then — like Brief — stays mounted forever
    // and is only ever hidden with `display: none` (see the `brief` prop doc).
    // Unlike Brief, it isn't mounted from the very first render: an author who
    // never opens Map never pays for `useMapYjs`'s own Y.js document.
    const [mapVisited, setMapVisited] = useState(active === 'map')
    useEffect(() => {
        if (active === 'map') setMapVisited(true)
    }, [active])

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
                        aria-current={t === active ? 'page' : undefined}
                        className={t === active ? `${styles.tab} ${styles.tabOn}` : styles.tab}
                    >
                        {TAB_LABELS[t].toUpperCase()}
                    </button>
                ))}
            </nav>

            <div className={styles.body}>
                <div className={styles.main}>
                    <div className={styles.mainScroll} style={{ paddingRight: contentPaddingRight, transition: 'padding-right 0.25s ease' }}>
                        {/*
                         * Brief holds the collaborative editor — a Hocuspocus socket and a
                         * Y.Doc that CollabEditor creates in useState and destroys on
                         * unmount. Conditionally rendering it per tab (`tab === 'brief' &&
                         * brief`) would tear the socket down and force a Y.Doc rebuild
                         * every time a user switches away and back — the exact hazard the
                         * "no router navigation" rule (spec §7) exists to prevent, just
                         * reached via unmount instead of navigation. So it stays mounted
                         * always and is hidden with CSS instead.
                         */}
                        <div style={{ display: active === 'brief' ? undefined : 'none' }}>
                            {brief}
                        </div>
                        {mapVisited && (
                            <div style={{ display: active === 'map' ? undefined : 'none', height: '100%' }}>
                                {map}
                            </div>
                        )}
                        {active === 'development' && development}
                        {active === 'attendance' && isHQ && attendance}
                    </div>
                </div>
                {/*
                 * No wrapping div here: MissionDeck (deck/MissionDeck.tsx) is
                 * fully self-contained — its own root element sets width,
                 * border-left, background and overflow-y for both the
                 * expanded (340px) and collapsed (44px) states. A wrapping
                 * div styled from styles.deck/.deckCollapsed would fight
                 * that (fixed 340px outer box while the inner rail shrinks
                 * to 44px, doubled border-left, mismatched width on resize),
                 * so `deck` is rendered directly and owns its own layout.
                 */}
                {deck}
            </div>

            {statusBar}
        </div>
    )
}
