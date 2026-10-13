import { describe, expect, test } from 'vitest'
import { DEFAULT_LAYOUT, movePanel, normaliseLayout, PANEL_IDS, sanitiseLayout, type PanelId } from './layout'

const all = (l: { left: PanelId[]; right: PanelId[] }) => [...l.left, ...l.right].sort()

describe('normaliseLayout', () => {
    test('nothing saved gives the default arrangement', () => {
        expect(normaliseLayout(undefined)).toEqual(DEFAULT_LAYOUT)
        expect(normaliseLayout(null)).toEqual(DEFAULT_LAYOUT)
        expect(normaliseLayout('nonsense')).toEqual(DEFAULT_LAYOUT)
    })

    test('a saved order is kept', () => {
        const saved = { left: ['tasks', 'nextOp'], right: ['favourites', 'operations', 'progression', 'quickLinks'], collapsed: ['tasks'] }
        expect(normaliseLayout(saved)).toEqual(saved)
    })

    test('every available panel appears exactly once, whatever was saved', () => {
        const layout = normaliseLayout({ left: ['tasks', 'tasks', 'bogus', 7], right: ['tasks', 'nextOp'], collapsed: ['bogus'] })
        expect(all(layout)).toEqual([...PANEL_IDS].sort())
        expect(layout.left[0]).toBe('tasks')
        expect(layout.collapsed).toEqual([])
    })

    test('a panel the saved layout never mentioned goes back to its default column', () => {
        const layout = normaliseLayout({ left: ['nextOp'], right: ['progression'] })
        expect(layout.left).toEqual(['nextOp', 'tasks', 'operations'])
        expect(layout.right).toEqual(['progression', 'quickLinks', 'favourites'])
    })

    test('a panel the member cannot see is left out of what is rendered', () => {
        const available = PANEL_IDS.filter(p => p !== 'operations')
        const layout = normaliseLayout({ left: ['operations', 'tasks'], right: [], collapsed: ['operations'] }, available)
        expect(all(layout)).not.toContain('operations')
        expect(layout.collapsed).toEqual([])
        expect(all(layout)).toHaveLength(available.length)
    })
})

describe('sanitiseLayout', () => {
    test('keeps what was arranged, including panels not currently available, and drops junk', () => {
        expect(sanitiseLayout({ left: ['operations', 'x', 'tasks'], right: ['tasks', 'nextOp'], collapsed: ['operations', 'operations', 1] }))
            .toEqual({ left: ['operations', 'tasks'], right: ['nextOp'], collapsed: ['operations'] })
    })

    test('does not invent panels that were not sent', () => {
        expect(sanitiseLayout({})).toEqual({ left: [], right: [], collapsed: [] })
    })
})

describe('movePanel', () => {
    const base = DEFAULT_LAYOUT

    test('dragging down within a column lands after the target', () => {
        expect(movePanel(base, 'nextOp', { overId: 'operations' }).left).toEqual(['tasks', 'operations', 'nextOp'])
    })

    test('dragging up within a column lands before the target', () => {
        expect(movePanel(base, 'operations', { overId: 'nextOp' }).left).toEqual(['operations', 'nextOp', 'tasks'])
    })

    test('dragging across columns lands before the target', () => {
        const next = movePanel(base, 'tasks', { overId: 'quickLinks' })
        expect(next.left).toEqual(['nextOp', 'operations'])
        expect(next.right).toEqual(['progression', 'tasks', 'quickLinks', 'favourites'])
    })

    test('dropping on an empty column appends', () => {
        const emptied: typeof base = { left: [], right: [...base.left, ...base.right], collapsed: [] }
        expect(movePanel(emptied, 'tasks', { toColumn: 'left' }).left).toEqual(['tasks'])
    })

    test('dropping a panel on itself changes nothing, and the input is never mutated', () => {
        const before = JSON.stringify(base)
        expect(movePanel(base, 'tasks', { overId: 'tasks' })).toBe(base)
        movePanel(base, 'tasks', { overId: 'favourites' })
        expect(JSON.stringify(base)).toBe(before)
    })
})
