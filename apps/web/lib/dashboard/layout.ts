/**
 * The dashboard home page's layout, as a member has arranged it.
 *
 * Two columns of panels, each panel either open or collapsed. A member can
 * drag panels into their own order and fold away the ones they do not use; the
 * result is saved on their preferences so it follows them between devices.
 *
 * Everything here is pure and imports nothing: the API route validates with
 * it, the page renders from it, and both must agree on what a legal layout is.
 */

export const PANEL_IDS = ['nextOp', 'tasks', 'operations', 'progression', 'quickLinks', 'favourites'] as const
export type PanelId = typeof PANEL_IDS[number]

export const PANEL_TITLES: Record<PanelId, string> = {
    nextOp: 'Next operation',
    tasks: 'My tasks',
    operations: 'Operations',
    progression: 'Progression',
    quickLinks: 'Quick links',
    favourites: 'Favourites',
}

export interface DashboardLayout {
    left: PanelId[]
    right: PanelId[]
    collapsed: PanelId[]
}

/** The arrangement the page shipped with, and what "Reset" returns to. */
export const DEFAULT_LAYOUT: DashboardLayout = {
    left: ['nextOp', 'tasks', 'operations'],
    right: ['progression', 'quickLinks', 'favourites'],
    collapsed: [],
}

const isPanelId = (v: unknown): v is PanelId => typeof v === 'string' && (PANEL_IDS as readonly string[]).includes(v)

/**
 * A saved layout made safe to render.
 *
 * What comes back always places every panel in `available` exactly once and
 * nothing else, whatever went in:
 *
 * - anything that is not a known panel is dropped (a saved layout outlives the
 *   code that wrote it, and the value arrives from the browser);
 * - a panel listed twice keeps its first position;
 * - a panel the layout does not mention — one added to the dashboard after the
 *   member saved, or one they have only just gained access to — is put back in
 *   its default column rather than silently missing;
 * - a panel that is not available to this member (Operations, for a
 *   non-staff member) is left out, but NOT forgotten by the caller: save the
 *   input, not this output, or losing staff for a day loses their arrangement.
 */
export function normaliseLayout(saved: unknown, available: readonly PanelId[] = PANEL_IDS): DashboardLayout {
    const input = (saved && typeof saved === 'object' ? saved : {}) as Partial<Record<keyof DashboardLayout, unknown>>
    const allowed = new Set<PanelId>(available)
    const placed = new Set<PanelId>()

    const take = (list: unknown): PanelId[] => {
        const out: PanelId[] = []
        for (const id of Array.isArray(list) ? list : []) {
            if (!isPanelId(id) || !allowed.has(id) || placed.has(id)) continue
            placed.add(id)
            out.push(id)
        }
        return out
    }

    const left = take(input.left)
    const right = take(input.right)

    for (const id of available) {
        if (placed.has(id)) continue
        placed.add(id)
        ;(DEFAULT_LAYOUT.right.includes(id) ? right : left).push(id)
    }

    const collapsed = [...new Set((Array.isArray(input.collapsed) ? input.collapsed : []).filter(isPanelId))]
        .filter(id => allowed.has(id))

    return { left, right, collapsed }
}

/**
 * What to store: the member's arrangement with only real panel ids in it.
 *
 * Unlike `normaliseLayout` this does not fill gaps or drop unavailable panels —
 * it keeps what the member arranged, including panels they cannot currently
 * see, so those come back where they were left.
 */
export function sanitiseLayout(input: unknown): DashboardLayout {
    const raw = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof DashboardLayout, unknown>>
    const placed = new Set<PanelId>()
    const take = (list: unknown): PanelId[] => {
        const out: PanelId[] = []
        for (const id of Array.isArray(list) ? list : []) {
            if (!isPanelId(id) || placed.has(id)) continue
            placed.add(id)
            out.push(id)
        }
        return out
    }
    const left = take(raw.left)
    const right = take(raw.right)
    const collapsed = [...new Set((Array.isArray(raw.collapsed) ? raw.collapsed : []).filter(isPanelId))]
    return { left, right, collapsed }
}

/**
 * Move a panel to sit where `overId` is — or to the end of `toColumn` when
 * dropped on an empty column. Returns a new layout; the input is not touched.
 */
export function movePanel(
    layout: DashboardLayout,
    id: PanelId,
    target: { overId: PanelId } | { toColumn: 'left' | 'right' },
): DashboardLayout {
    const left = layout.left.filter(p => p !== id)
    const right = layout.right.filter(p => p !== id)

    if ('toColumn' in target) {
        ;(target.toColumn === 'left' ? left : right).push(id)
        return { ...layout, left, right }
    }

    if (target.overId === id) return layout
    const column = left.includes(target.overId) ? left : right.includes(target.overId) ? right : null
    if (!column) return layout

    // Dropping onto a panel below you in the same column lands after it;
    // anywhere else lands before. That is what a drag "feels" like it did.
    const from = [...layout.left, ...layout.right]
    const sameColumn = (layout.left.includes(id) && layout.left.includes(target.overId))
        || (layout.right.includes(id) && layout.right.includes(target.overId))
    const movingDown = sameColumn && from.indexOf(id) < from.indexOf(target.overId)

    column.splice(column.indexOf(target.overId) + (movingDown ? 1 : 0), 0, id)
    return { ...layout, left, right }
}
