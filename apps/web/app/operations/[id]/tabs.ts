/**
 * The operation's four views, and where each one lives.
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
 * open *on* them. Editing is reached from the ribbon under the Orders tab, by
 * the few people who can, instead of being the destination everybody lands on.
 *
 * The tab key is `orders` rather than `brief` for the same reason. "Brief" was
 * the editor's name for its own first tab; nobody outside the editor called it
 * that.
 */
import type { Route } from 'next'

export type OperationTab = 'orders' | 'map' | 'schedule' | 'attendance'

export const TABS: readonly OperationTab[] = ['orders', 'map', 'schedule', 'attendance']

export const TAB_LABELS: Record<OperationTab, string> = {
    orders: 'Orders',
    map: 'Map',
    schedule: 'Schedule',
    attendance: 'Attendance',
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
 * the Orders view, and only the ribbon links to it.
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
 * routes already. Schedule and Attendance are staff surfaces whose own pages
 * redirect anyone else away — showing them to a member would be offering a door
 * that closes in their face.
 */
export function visibleTabs(canEdit: boolean): OperationTab[] {
    return TABS.filter(t => canEdit || (t !== 'schedule' && t !== 'attendance'))
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
