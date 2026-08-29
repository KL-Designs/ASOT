import { describe, test, expect } from 'vitest'
import { visibleTabs, resolveTab, tabFromSegment, TABS, TAB_LABELS } from './tabs'

/**
 * The tab strip's contract.
 *
 * These exist because of a real regression: `visibleTabs` moved from taking a
 * `canEdit` boolean to taking a capability object, the editor's header was not
 * updated, and `visibleTabs({})` quietly hid Schedule, Attendance and AAR from
 * everybody inside the editor. Nothing failed — the strip just came back short.
 *
 * The prop is required now, so that specific mistake is a compile error. What
 * is pinned below is the behaviour that made it invisible: an empty access
 * object really does mean "almost nothing", and that has to be a decision a
 * caller states rather than one it falls into.
 */

describe('visibleTabs', () => {
    test('Orders is always shown — it is the operation\'s front door', () => {
        expect(visibleTabs({})).toContain('orders')
    })

    test('Map is shown unless a caller explicitly says otherwise', () => {
        // Public capability: the link people paste to each other has to work.
        expect(visibleTabs({})).toContain('map')
        expect(visibleTabs({ map: false })).not.toContain('map')
    })

    test('an empty access object gives the bare strip, and only that', () => {
        expect(visibleTabs({})).toEqual(['orders', 'map'])
    })

    test('each gated tab needs its own capability, and grants no other', () => {
        expect(visibleTabs({ schedule: true })).toEqual(['orders', 'map', 'schedule'])
        expect(visibleTabs({ attendance: true })).toEqual(['orders', 'map', 'attendance'])
        expect(visibleTabs({ aar: true })).toEqual(['orders', 'map', 'aar'])
    })

    test('everything at once comes back in the declared order', () => {
        expect(visibleTabs({ schedule: true, attendance: true, aar: true })).toEqual([...TABS])
    })

    test('the strip is never empty, whatever it is handed', () => {
        // A viewer with no capabilities is still looking at an operation.
        for (const access of [{}, { schedule: false, attendance: false, aar: false, map: false }]) {
            expect(visibleTabs(access).length).toBeGreaterThan(0)
        }
    })
})

describe('every tab is complete', () => {
    test('has a label', () => {
        for (const tab of TABS) {
            expect(TAB_LABELS[tab], tab).toBeTruthy()
        }
    })

    test('resolves from its own name', () => {
        for (const tab of TABS) {
            expect(resolveTab(tab), tab).toBe(tab)
        }
    })
})

describe('legacy links keep working', () => {
    test('?tab=brief is Orders, ?tab=development is Schedule', () => {
        // Every bookmark and Discord message written before the rename.
        expect(resolveTab('brief')).toBe('orders')
        expect(resolveTab('development')).toBe('schedule')
    })

    test('anything unrecognised resolves to nothing rather than guessing', () => {
        expect(resolveTab('nonsense')).toBeNull()
        expect(resolveTab('')).toBeNull()
    })

    test('but a path segment falls back to Orders, which is the front door', () => {
        expect(tabFromSegment('edit')).toBe('orders')
        expect(tabFromSegment('nonsense')).toBe('orders')
        expect(tabFromSegment('aar')).toBe('aar')
    })
})
