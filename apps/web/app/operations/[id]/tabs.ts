/**
 * The operation's five views, and where each one lives.
 *
 * Plain module, deliberately: both the editor's header (a client component) and
 * the public orders page (a server one) render this same strip, and a shared
 * `'use client'` module would drag the whole thing across that boundary just to
 * read four labels.
 *
 * ## Orders is the operation, not a tab of the editor
 *
 * `orders` points at `/operations/{id}` — the page anybody can read — rather
 * than at `/edit`. That is the change this module exists for: the orders are
 * the operation as far as the unit is concerned, and the editor is a thing you
 * open *on* them. Editing is reached from the Orders tab's own menu, by the few
 * people who can, instead of being the destination everybody lands on.
 *
 * The tab key is `orders` rather than `brief` for the same reason. "Brief" was
 * the editor's name for its own first tab; nobody outside the editor called it
 * that.
 */
import type { Route } from 'next'

export type OperationTab = 'orders' | 'map' | 'schedule' | 'attendance' | 'aar'

/**
 * In the order an operation is lived: read the orders, look at the ground, know
 * when it runs, take a position, say how it went. The AAR is last because it is
 * the only one that does not exist yet when the others do.
 */
export const TABS: readonly OperationTab[] = ['orders', 'map', 'schedule', 'attendance', 'aar']

export const TAB_LABELS: Record<OperationTab, string> = {
    orders: 'Orders',
    map: 'Map',
    schedule: 'Schedule',
    attendance: 'Attendance',
    /* Abbreviated deliberately. "After Action Report" is twice the width of the
       widest other tab and would set the strip's height on a narrow window; the
       unit says AAR out loud anyway. */
    aar: 'AAR',
}

/**
 * Tab values that used to be valid and still appear in saved links.
 *
 * `brief` is the one this change creates: every bookmark, Discord message and
 * `?tab=brief` link written before today. Without the alias they resolve by
 * falling through to the default, which happens to be Orders — right by luck,
 * and only until the default changes.
 */
const LEGACY_ALIASES: Record<string, OperationTab> = {
    brief: 'orders',
    development: 'schedule',
}

export function resolveTab(raw: string): OperationTab | null {
    if (raw in LEGACY_ALIASES) return LEGACY_ALIASES[raw]
    return (TABS as readonly string[]).includes(raw) ? (raw as OperationTab) : null
}

/**
 * Where a tab lives.
 *
 * Orders is the operation's own URL; the other three are segments under it.
 * `/edit` is deliberately absent — it is not a tab, it is the editor opened on
 * the Orders view, and only that menu links to it.
 */
export function tabHref(operationId: string, tab: OperationTab): Route {
    return (tab === 'orders'
        ? `/operations/${operationId}`
        : `/operations/${operationId}/${tab}`) as Route
}

/** The editor, opened on this operation's orders. */
export function editHref(operationId: string): Route {
    return `/operations/${operationId}/edit` as Route
}

/**
 * Which tabs a viewer gets.
 *
 * Orders and Map are the operation as the unit reads it, and both have public
 * routes already. Schedule stays a staff surface whose own page redirects
 * anyone else away — showing it to a member would be offering a door that
 * closes in their face.
 *
 * Attendance is the exception, and only for signed-in members: the board is
 * how they RSVP and claim a position, and it used to live at the bottom of the
 * orders page. Moving it behind the tab means the tab has to open for them —
 * the same board in its read-and-claim mode, with none of the staff controls.
 * A logged-out visitor still gets neither, since they have nothing to answer.
 */
export interface TabAccess {
    /** `operations.schedule.view`. */
    schedule?: boolean
    /** `attendance.view`. */
    attendance?: boolean
    /** `operations.map.view` — public, so this defaults to shown. */
    map?: boolean
    /**
     * `operations.aar.view`, **and** the operation having actually finished.
     *
     * Two conditions rather than one, and the caller resolves both: an AAR tab
     * on an operation that has not run yet is a door onto an empty room, and
     * the permission alone cannot tell you which of those you are looking at.
     * See `aarOpen()` in `lib/operations/aar.ts`.
     */
    aar?: boolean
}

/**
 * Which of the four tabs this viewer gets.
 *
 * Takes one capability per tab rather than the `canEdit` boolean it used to,
 * because "can edit operations" was answering four different questions at once
 * and there was no way to give somebody the Schedule without also giving them
 * the editor. The capabilities themselves are resolved server-side by
 * `lib/operations/permissions.ts`; this file stays a plain module with no
 * imports so the public page and the editor's client header can both read it.
 *
 * Orders is always shown — it is the operation's front door and it is public.
 * Map defaults to shown for the same reason.
 *
 * Offering a tab whose page redirects the viewer straight back is worse than
 * not offering it, which is the whole reason this function exists.
 */
export function visibleTabs(access: TabAccess = {}): OperationTab[] {
    return TABS.filter(t => {
        if (t === 'schedule') return !!access.schedule
        if (t === 'attendance') return !!access.attendance
        if (t === 'aar') return !!access.aar
        if (t === 'map') return access.map !== false
        return true
    })
}

/**
 * The tab a path is showing.
 *
 * `/operations/{id}` and `/operations/{id}/edit` are both the Orders view — one
 * reading it, one editing it — so both light the same tab. Anything
 * unrecognised is Orders too, which is the operation's front door.
 */
export function tabFromSegment(segment: string): OperationTab {
    if (segment === 'edit') return 'orders'
    return resolveTab(segment) ?? 'orders'
}

/* ── Which mode Orders is in ────────────────────────────────────────────── */

/** Reading the orders, or writing them. Two modes of one view. */
export type OrdersMode = 'read' | 'edit'

/**
 * Per-tab, per-operation, and deliberately not a saved preference.
 *
 * `sessionStorage`, so opening the operation in a new tab starts you reading —
 * editing is something you chose to be doing right now, not a setting you carry
 * between visits. Scoped by operation id because being mid-edit on one op says
 * nothing about the next.
 */
function ordersModeKey(operationId: string): string {
    return `asot:orders-mode:${operationId}`
}

/**
 * The mode this session last had this operation's orders open in.
 *
 * Defaults to reading, which is also what the server renders — so the sticky
 * value only ever arrives after mount and only ever changes an href.
 *
 * Wrapped because storage access throws outright in some privacy modes rather
 * than returning nothing.
 */
export function readOrdersMode(operationId: string): OrdersMode {
    if (typeof window === 'undefined') return 'read'
    try {
        return window.sessionStorage.getItem(ordersModeKey(operationId)) === 'edit' ? 'edit' : 'read'
    } catch {
        return 'read'
    }
}

/** Records the mode. Failing to remember is not worth breaking a tab switch over. */
export function rememberOrdersMode(operationId: string, mode: OrdersMode): void {
    if (typeof window === 'undefined') return
    try {
        window.sessionStorage.setItem(ordersModeKey(operationId), mode)
    } catch {
        /* private mode, blocked site data — the strip works without it. */
    }
}
