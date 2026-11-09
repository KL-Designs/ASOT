/**
 * The pure half of `useTabState`: what a department panel's URL means.
 * Kept free of React and Next imports so it can be unit-tested.
 */

export type View = 'dept' | 'settings' | 'calendar' | 'meetings' | 'logs' | 'activity' | 'tickets'

const VALID_VIEWS: View[] = ['dept', 'settings', 'calendar', 'meetings', 'logs', 'activity', 'tickets']

export interface TabState {
    tab: number
    view: View
    adminTab: string | null
}

export function resolveTabState(
    raw: { tab: string | null; view: string | null; admin: string | null },
    defaultTab: number,
    defaultView: View,
    movedTabs: Record<number, string>,
): TabState {
    const tab = raw.tab !== null && raw.tab !== '' && !isNaN(Number(raw.tab)) ? Number(raw.tab) : defaultTab
    // Legacy aliases: this view was called 'members', then 'settings' (shown as
    // Management), before it became Admin. Keep old bookmarks and pinned links working.
    const requestedView = raw.view === 'members' || raw.view === 'admin' ? 'settings' : raw.view
    let view: View = requestedView && VALID_VIEWS.includes(requestedView as View) ? (requestedView as View) : defaultView
    let adminTab = raw.admin ?? null

    // A tool that moved under Admin keeps its old tab number in pins and
    // bookmarks; open it there instead of on an empty main tab.
    const moved = movedTabs[tab]
    if (view === 'dept' && moved) {
        view = 'settings'
        adminTab = moved
    }
    return { tab, view, adminTab }
}
