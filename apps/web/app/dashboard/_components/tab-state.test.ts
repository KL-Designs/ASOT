import { describe, expect, test } from 'vitest'
import { resolveTabState } from './tab-state'

const MOVED = { 4: 'meetings', 5: 'tickets' }
const raw = (tab: string | null, view: string | null = null, admin: string | null = null) => ({ tab, view, admin })

describe('resolveTabState', () => {
    test('a main tab stays a main tab', () => {
        expect(resolveTabState(raw('1'), 0, 'dept', MOVED)).toEqual({ tab: 1, view: 'dept', adminTab: null })
    })

    test("an old pin to a moved tab opens that tool under Admin", () => {
        expect(resolveTabState(raw('4'), 0, 'dept', MOVED)).toEqual({ tab: 4, view: 'settings', adminTab: 'meetings' })
        expect(resolveTabState(raw('5', 'dept'), 0, 'dept', MOVED)).toEqual({ tab: 5, view: 'settings', adminTab: 'tickets' })
    })

    test('an explicit Admin sub-tab is kept', () => {
        expect(resolveTabState(raw(null, 'settings', 'tickets'), 0, 'dept', MOVED)).toMatchObject({ view: 'settings', adminTab: 'tickets' })
    })

    test("legacy 'members' and new 'admin' view names both mean Admin", () => {
        expect(resolveTabState(raw(null, 'members'), 0, 'dept', MOVED).view).toBe('settings')
        expect(resolveTabState(raw(null, 'admin'), 0, 'dept', MOVED).view).toBe('settings')
    })

    test('another view is not hijacked by a moved tab number', () => {
        expect(resolveTabState(raw('4', 'calendar'), 0, 'dept', MOVED)).toEqual({ tab: 4, view: 'calendar', adminTab: null })
    })

    test('nonsense falls back to the defaults', () => {
        expect(resolveTabState(raw('x', 'nope'), 0, 'dept', MOVED)).toEqual({ tab: 0, view: 'dept', adminTab: null })
    })
})
