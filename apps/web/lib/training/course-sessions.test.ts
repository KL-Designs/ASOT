import { describe, expect, test } from 'vitest'
import {
    DEFAULT_SESSION_TEMPLATES, sanitiseSessionPlan, sanitiseSessionTemplate, sessionTemplateFor, sessionTitle, suggestedSessionDates, weekOf,
} from './course-sessions'

describe('defaults', () => {
    test('Selection has four unnamed sessions; the Reinforcement Cycle names each', () => {
        expect(DEFAULT_SESSION_TEMPLATES.selection).toHaveLength(4)
        const rc = DEFAULT_SESSION_TEMPLATES.reinforcement_cycle.map(s => s.name)
        expect(rc.slice(0, 2)).toEqual(['Foundation Skills', 'Foundation Skills'])
        expect(rc.slice(2, 6)).toEqual(['CQB', 'CQB', 'CQB', 'CQB'])
        expect(rc.at(-1)).toBe('Final Week')
    })
    test('a course\'s own template wins', () => {
        expect(sessionTemplateFor({ courseType: 'selection', sessionTemplate: [{ name: 'X' }] })).toEqual([{ name: 'X' }])
        expect(sessionTemplateFor({ courseType: 'reinforcement_cycle' })).toHaveLength(DEFAULT_SESSION_TEMPLATES.reinforcement_cycle.length)
    })
})

test('sessionTitle', () => {
    expect(sessionTitle(3, 'CQB')).toBe('Session 3 — CQB')
    expect(sessionTitle(1, '  ')).toBe('Session 1')
})

test('suggested dates alternate Saturday and Wednesday at the same time', () => {
    const wed = new Date(2026, 10, 4, 19, 30) // Wed 4 Nov 2026
    const dates = suggestedSessionDates(wed, 4)
    expect(dates.map(d => [d.getDay(), d.getDate(), d.getHours(), d.getMinutes()])).toEqual([
        [3, 4, 19, 30], [6, 7, 19, 30], [3, 11, 19, 30], [6, 14, 19, 30],
    ])
})

test('sanitisers', () => {
    expect(sanitiseSessionTemplate([{ name: ' A ', durationMinutes: 90 }, { name: 'B', durationMinutes: 5 }])).toEqual([{ name: 'A', durationMinutes: 90 }, { name: 'B' }])
    expect(sanitiseSessionTemplate([])).toBeNull()
    const plan = sanitiseSessionPlan([{ name: 'b', start: '2026-11-07T09:00:00Z' }, { name: 'a', start: '2026-11-04T09:00:00Z', durationMinutes: 120 }])
    expect(plan?.map(p => p.name)).toEqual(['a', 'b'])
    expect(sanitiseSessionPlan([{ start: 'nope' }])).toBeNull()
})

test('weekOf', () => {
    const s1 = new Date(2026, 10, 4)
    expect(weekOf(s1, new Date(2026, 10, 7))).toBe(1)
    expect(weekOf(s1, new Date(2026, 10, 11))).toBe(2)
})
