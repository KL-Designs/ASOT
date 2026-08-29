'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { rgbTriplet } from '@/lib/colour'
import { useThinScrollFade } from '@/components/editor/useThinScrollFade'
import styles from './shell.module.css'
import modeSwitch from '../mode-switch.module.css'

export type { OperationTab as EditorTab } from '../tabs'
export { TABS, TAB_LABELS } from '../tabs'

import { resolveTab, tabFromSegment, tabHref, visibleTabs, type OperationTab } from '../tabs'

/** The last path segment, which is what names the tab. */
function currentSegment(): string {
    return window.location.pathname.replace(/\/+$/, '').split('/').pop() ?? ''
}

/** The operation's own path, with any view segment stripped off the end. */
function operationBase(): string {
    return window.location.pathname
        .replace(/\/+$/, '')
        .replace(/\/(edit|brief|map|schedule|attendance)$/, '')
}

/**
 * Where an *in-shell* tab lives.
 *
 * Orders maps to `/edit` rather than to `/operations/{id}`: reaching it from
 * inside the shell means you are editing the orders, and the operation's own
 * page is the *other* mode of that view — see `../tabs.ts` for why the orders
 * are the operation's page rather than a tab of the editor, and `useEditorTab`
 * below for which of the two a click resolves to.
 */
function tabPath(tab: OperationTab): string {
    return tab === 'orders' ? `${operationBase()}/edit` : `${operationBase()}/${tab}`
}

function tabFromLocation(): OperationTab {
    if (typeof window === 'undefined') return 'orders'

    // The path is authoritative.
    const fromPath = tabFromSegment(decodeURIComponent(currentSegment()))
    if (fromPath !== 'orders' || currentSegment() === 'edit') return fromPath

    // `?tab=` is the old shape and still turns up in bookmarks, Discord
    // messages and the E2E suite. It is read, then normalised away by the
    // effect below so the two forms never both linger in one URL.
    return resolveTab(new URLSearchParams(window.location.search).get('tab') ?? '') ?? 'orders'
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
export function useEditorTab(): [OperationTab, (t: OperationTab) => boolean] {
    const [tab, setTab] = useState<OperationTab>('orders')

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

    /**
     * Returns whether the switch was handled here — `false` means "let the link
     * navigate", which is how Orders leaves the editor for the operation's own
     * page. That genuinely is a navigation: the collab socket goes with it and
     * comes back when the editor is reopened, unlike every other tab, where a
     * real navigation would tear the socket down and rebuild the Y.Doc for
     * nothing.
     *
     * Which of the two Orders means is not decided here. `OperationTabs` tracks
     * the mode the orders were last open in and simply doesn't call this when
     * it is `read`, so everything that reaches this function stays in the shell.
     */
    const change = (next: OperationTab): boolean => {
        /*
         * The AAR leaves the editor, the way Orders does.
         *
         * The shell has no content slot for it — the report is its own route
         * with its own page — so handling the switch here would rewrite the URL
         * and then render nothing, which is the blank-tab failure this
         * function's return value exists to prevent. Returning false lets the
         * link navigate for real; the collab socket goes with it and comes back
         * when the editor is reopened, which is the correct trade for a tab
         * nobody switches to mid-edit.
         */
        if (next === 'aar') return false

        setTab(next)
        const url = new URL(window.location.href)
        url.pathname = tabPath(next)
        url.searchParams.delete('tab')
        // replaceState, not router.push: no navigation, so the collab socket lives.
        window.history.replaceState(null, '', url)
        return true
    }

    return [tab, change]
}

interface EditorShellProps {
    operationId: string
    themeColor: string
    /** `operations.orders.view` — inside the editor this is always true; it
     *  still gates the Attendance panel's *content*, see below. */
    isHQ: boolean
    /** `operations.schedule.view` — whether the Schedule tab is offered. */
    canSchedule?: boolean
    /** `attendance.view` — whether the Attendance tab is offered. */
    canAttendance?: boolean
    /**
     * `operations.aar.view` **and** the operation having finished.
     *
     * Defaults to false rather than to `isHQ` like the other two: the AAR tab
     * does not exist for most of an operation's life, and defaulting it on
     * would offer staff a door onto an empty room for every operation that has
     * not run yet.
     */
    canAar?: boolean
    tab: OperationTab
    onTabChange: (t: OperationTab) => boolean
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
    /** Right-padding applied to the tab content area so the Activity drawer
     * (a fixed overlay rendered outside this shell) doesn't cover whichever tab
     * is currently showing. */
    contentPaddingRight?: string | number
}

export default function EditorShell({
    operationId, themeColor, isHQ, canSchedule, canAttendance, canAar, tab, onTabChange,
    header, deck, statusBar, brief, map, schedule, attendance, contentPaddingRight,
}: EditorShellProps) {
    /* Inside the editor, so `orders.view` is already established. The other
       two are asked for separately — a reviewer who can open the orders does
       not automatically get the Schedule. */
    const shown = visibleTabs({
        // Defaulted to `isHQ` so a caller that has not been taught the new
        // capabilities yet behaves exactly as it did — the editor was gated on
        // one role, and everyone inside it had all four tabs.
        schedule: canSchedule ?? isHQ,
        attendance: canAttendance ?? isHQ,
        aar: canAar,
    })
    // A tab that isn't in the visible set — a non-HQ user deep-linking
    // ?tab=attendance, or a stale value from before a role change — must not
    // be selected: that renders nothing (no placeholder, no content) with no
    // way back except editing the URL. Fall back to Orders instead.
    const active = shown.includes(tab) ? tab : 'orders'

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
                        <div style={{ display: active === 'orders' ? undefined : 'none', height: '100%' }}>
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
                     * state included.
                     *
                     * It switches mode in place rather than opening a second
                     * tab: the orders page is the same view read instead of
                     * written, and the way back is the identical button in the
                     * identical corner over there (`../EditOrdersButton.tsx`).
                     * Two tabs of the same operation was the older answer, and
                     * it left people editing in one and reading a stale copy in
                     * the other.
                     *
                     * Orders only. It shows the rendered form of what Orders
                     * edits — there is nothing on Map, Schedule or Attendance it
                     * is a preview *of*, so on those tabs it was just a button
                     * that took you elsewhere.
                     */}
                    {operationId && active === 'orders' && (
                        <Link
                            href={tabHref(operationId, 'orders')}
                            title='Read the orders as the unit sees them'
                            className={modeSwitch.btn}
                        >
                            ⊡ Preview
                        </Link>
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
