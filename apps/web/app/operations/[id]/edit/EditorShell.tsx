'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { rgbTriplet } from '@/lib/colour'
import { useThinScrollFade } from '@/components/editor/useThinScrollFade'
import styles from './shell.module.css'

export type EditorTab = 'brief' | 'map' | 'schedule' | 'attendance'

/** Also used by Header.tsx, which renders the tab links inline in the merged
 * header row — see that file for why the row owns them instead of this one. */
export const TABS: readonly EditorTab[] = ['brief', 'map', 'schedule', 'attendance']

export const TAB_LABELS: Record<EditorTab, string> = {
    brief: 'Brief',
    map: 'Map',
    schedule: 'Schedule',
    attendance: 'Attendance',
}

/** Tab values that used to be valid and still appear in saved links.
 * Without this an old `development` bookmark silently resolves to `brief`,
 * since an unrecognised value already falls back there. */
const LEGACY_TAB_ALIASES: Record<string, EditorTab> = { development: 'schedule' }

function resolveTab(raw: string): EditorTab | null {
    if (raw in LEGACY_TAB_ALIASES) return LEGACY_TAB_ALIASES[raw]
    return (TABS as readonly string[]).includes(raw) ? (raw as EditorTab) : null
}

/** The last path segment, which is what names the tab. */
function currentSegment(): string {
    return window.location.pathname.replace(/\/+$/, '').split('/').pop() ?? ''
}

/**
 * Where a tab lives.
 *
 * The four tabs are siblings under the operation — `/operations/{id}/edit`,
 * `/map`, `/schedule`, `/attendance` — rather than children of `/edit`. They are
 * four views of one operation, and nesting three of them a level below the
 * fourth read as if Brief were the operation and the rest were sub-pages of the
 * editor.
 *
 * Brief keeps the bare `/edit` instead of `/brief`: it is where the editor
 * opens, and `/edit` already says what the page is.
 */
function tabPath(tab: EditorTab): string {
    const base = window.location.pathname
        .replace(/\/+$/, '')
        .replace(/\/(edit|brief|map|schedule|attendance)$/, '')
    return `${base}/${tab === 'brief' ? 'edit' : tab}`
}

function tabFromLocation(): EditorTab {
    if (typeof window === 'undefined') return 'brief'

    // The path is authoritative.
    const segment = decodeURIComponent(currentSegment())
    if (segment === 'edit') return 'brief'
    const fromPath = resolveTab(segment)
    if (fromPath) return fromPath

    // `?tab=` is the old shape and still turns up in bookmarks, Discord
    // messages and the E2E suite. It is read, then normalised away by the
    // effect below so the two forms never both linger in one URL.
    const fromQuery = resolveTab(new URLSearchParams(window.location.search).get('tab') ?? '')
    return fromQuery ?? 'brief'
}

/**
 * Tabs are plain client state with the URL mirrored via `replaceState` —
 * deliberately not `next/link`/`router.push`. See `app/(landing)/milpacs/[username]/tabs.tsx`
 * for the measured failure rate of Link-based tabs (11/18 commits), and note
 * that a real navigation here would also tear down the Hocuspocus socket and
 * force the Y.Doc to reconnect on every tab switch.
 *
 * That is why the tab being a path segment changes nothing about how switching
 * works: the sibling routes (`[id]/schedule`, `[id]/attendance`, and `[id]/map`,
 * which serves the editor to anyone who can edit and the public viewer to
 * everyone else) exist only so a cold load or a refresh resolves to a route.
 * Every switch after that is still `replaceState`, so the socket lives even
 * though the URL now crosses what Next considers different routes.
 *
 * This hook doesn't know about `isHQ`, so it can resolve an `attendance` path
 * for a non-HQ user — EditorShell (which does know isHQ) is responsible for
 * falling back to `brief` when the resolved tab isn't actually visible.
 */
export function useEditorTab(): [EditorTab, (t: EditorTab) => void] {
    const [tab, setTab] = useState<EditorTab>('brief')

    // Read the deep link after mount — the server render has no location.
    useEffect(() => {
        const resolved = tabFromLocation()
        setTab(resolved)

        // Rewrite a legacy `?tab=` link into the path form, so what the address
        // bar shows is what a copied link will do, and the query does not sit
        // there contradicting the path after the next switch.
        const url = new URL(window.location.href)
        if (url.searchParams.has('tab')) {
            url.searchParams.delete('tab')
            url.pathname = tabPath(resolved)
            window.history.replaceState(null, '', url)
        }
    }, [])

    const change = (next: EditorTab) => {
        setTab(next)
        const url = new URL(window.location.href)
        url.pathname = tabPath(next)
        url.searchParams.delete('tab')
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
    /** Operation lifecycle: development gates, RSVP window, stage. Holds no socket — free to mount/unmount
     * with the tab switch. */
    schedule: ReactNode
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
    operationId, themeColor, isHQ, tab, onTabChange, header, deck, statusBar,
    brief, map, schedule, attendance, contentPaddingRight,
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

    const mainScrollFadeRef = useThinScrollFade<HTMLDivElement>()

    return (
        <div
            className={`command ${styles.shell}`}
            style={{ ['--acc' as string]: themeColor, ['--acc-rgb' as string]: rgbTriplet(themeColor) }}
        >
            {/*
             * The tab links themselves render inline in Header's own row now
             * (spec §3: one merged row, not a header row plus a separate tab
             * bar) — Header gets `tab`/`onTabChange`/`isHQ` from page.tsx
             * directly and computes the same `visibleTabs`/active fallback
             * this component still needs below for content routing. This
             * component intentionally still owns that routing logic (which
             * tab's content is on screen) even though it no longer renders
             * the buttons that drive it.
             */}
            {header}

            <div className={styles.body}>
                <div className={styles.main}>
                    <div
                        ref={mainScrollFadeRef}
                        className={`${styles.mainScroll} thin-scroll`}
                        style={{ paddingRight: contentPaddingRight, transition: 'padding-right 0.25s ease' }}
                    >
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
                        {/*
                         * height: '100%' (matching the `map` wrapper just below) gives
                         * this box a definite height equal to .mainScroll's own — the
                         * body region between the merged header and the status bar,
                         * already computed purely via flexbox (no viewport maths) — so
                         * CollabEditor's own `minHeight: '100%'` root (which otherwise
                         * has no definite ancestor to resolve that percentage against)
                         * actually takes effect. That's what lets PageSidebar's rail
                         * stretch to fill the same region (visual-fixes FIX 2) instead
                         * of relying on a hardcoded `calc(100vh - N)` that drifts every
                         * time the chrome above or below it changes height.
                         */}
                        <div style={{ display: active === 'brief' ? undefined : 'none', height: '100%' }}>
                            {brief}
                        </div>
                        {mapVisited && (
                            <div style={{ display: active === 'map' ? undefined : 'none', height: '100%' }}>
                                {map}
                            </div>
                        )}
                        {active === 'schedule' && schedule}
                        {active === 'attendance' && isHQ && attendance}
                    </div>
                    {/*
                     * Preview — floats at the bottom-right of the editor column
                     * itself (.main is `position: relative`, set above), not the
                     * viewport, so it always sits just left of the mission deck
                     * (deck is .main's sibling in .body) at every width, deck
                     * state included. Opens the public operation page in a new
                     * tab — same behaviour the old header overflow-menu "⊡
                     * Preview" item had; only its position moved.
                     */}
                    {operationId && (
                        <button
                            type='button'
                            onClick={() => window.open(`/operations/${operationId}`, '_blank')}
                            title='Preview operation'
                            className={styles.previewBtn}
                        >
                            ⊡ Preview
                        </button>
                    )}
                </div>
                {/*
                 * No wrapping div here: MissionDeck (deck/MissionDeck.tsx) is
                 * fully self-contained — its own root element sets width for
                 * both the expanded (340px) and collapsed (0 — nothing but
                 * the pull-tab remains) states, with border/background/
                 * overflow-y living on an inner box so the pull-tab itself
                 * can overhang uncropped. A wrapping div styled from
                 * styles.deck/.deckCollapsed would fight that (fixed 340px
                 * outer box while the inner rail shrinks to 0, doubled
                 * border-left, mismatched width on resize), so `deck` is
                 * rendered directly and owns its own layout.
                 *
                 * Hidden on Attendance. The board is a wide, dense surface with
                 * its own docked pool rail, and the deck's 340px of operation
                 * metadata is neither relevant to placing people nor affordable
                 * next to it. Every other tab keeps it. Unmounting is safe here
                 * in a way it is not for Brief or Map: the deck holds no socket,
                 * only props already lifted into page.tsx.
                 */}
                {tab !== 'attendance' && deck}
            </div>

            {statusBar}
        </div>
    )
}
