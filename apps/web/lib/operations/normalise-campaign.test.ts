import { describe, it, expect } from 'vitest'

import { detectDaySlot, detectRomanSuffix, planNormalise, ROMAN_ORDER, type NormalisableOp } from './normalise-campaign'

const op = (id: string, title: string): NormalisableOp => ({ id, title })

describe('detectDaySlot', () => {
    it('strips a day suffix behind any of the three dashes', () => {
        expect(detectDaySlot('Lost Army IV - SAT')).toEqual({ stripped: 'Lost Army IV', day: 'saturday' })
        expect(detectDaySlot('Lost Army IV – SAT')).toEqual({ stripped: 'Lost Army IV', day: 'saturday' })
        expect(detectDaySlot('Lost Army IV — SUN')).toEqual({ stripped: 'Lost Army IV', day: 'sunday' })
    })

    it('accepts the long form and no dash at all', () => {
        expect(detectDaySlot('Lost Army IV Saturday')).toEqual({ stripped: 'Lost Army IV', day: 'saturday' })
        expect(detectDaySlot('Lost Army IV sunday')).toEqual({ stripped: 'Lost Army IV', day: 'sunday' })
    })

    it('leaves a title with no day suffix untouched', () => {
        expect(detectDaySlot('Lost Army IV')).toEqual({ stripped: 'Lost Army IV', day: null })
    })

    it('only reads the end of the title', () => {
        // "Saturday Night Fever" is not a Saturday op.
        expect(detectDaySlot('Saturday Night Fever II')).toEqual({ stripped: 'Saturday Night Fever II', day: null })
    })
})

describe('detectRomanSuffix', () => {
    it('reads every numeral the pattern covers, case-insensitively', () => {
        for (const roman of ROMAN_ORDER) {
            expect(detectRomanSuffix(`Lost Army ${roman}`)).toEqual({ stripped: 'Lost Army', roman })
            expect(detectRomanSuffix(`Lost Army ${roman.toLowerCase()}`)).toEqual({ stripped: 'Lost Army', roman })
        }
    })

    it('returns null when there is no numeral', () => {
        expect(detectRomanSuffix('Lost Army')).toEqual({ stripped: 'Lost Army', roman: null })
    })

    it('requires whitespace before the numeral, so a word ending in one is safe', () => {
        // Without the \s+ this would strip the tail of "Vivi" and mis-title it.
        expect(detectRomanSuffix('Operation Vivi')).toEqual({ stripped: 'Operation Vivi', roman: null })
    })
})

describe('planNormalise', () => {
    it('pairs a Saturday and a Sunday of the same numeral into one group', () => {
        const plan = planNormalise([
            op('a', 'Lost Army IV — SAT'),
            op('b', 'Lost Army IV — SUN'),
        ])

        expect(plan.skipped).toEqual([])
        expect(plan.groups).toHaveLength(1)
        expect(plan.groups[0].roman).toBe('IV')
        expect(plan.groups[0].saturday?.id).toBe('a')
        expect(plan.groups[0].sunday?.id).toBe('b')
        expect(plan.groups[0].standalone).toBeNull()
    })

    it('keeps different numerals apart and orders them by numeral, not by input', () => {
        const plan = planNormalise([
            op('c', 'Lost Army IX'),
            op('a', 'Lost Army II'),
            op('b', 'Lost Army IV'),
        ])

        expect(plan.groups.map(g => g.roman)).toEqual(['II', 'IV', 'IX'])
    })

    it('files an op with no day suffix as the group standalone', () => {
        const plan = planNormalise([op('a', 'Lost Army III')])

        expect(plan.groups[0].standalone?.id).toBe('a')
        expect(plan.groups[0].saturday).toBeNull()
        expect(plan.groups[0].sunday).toBeNull()
    })

    it('reports an op with no Roman numeral instead of dropping it', () => {
        // The whole reason the all-campaigns endpoint returns a breakdown: this
        // op is skipped in silence, and "grouped 2" would read as a clean sweep.
        const plan = planNormalise([
            op('a', 'Lost Army IV — SAT'),
            op('b', 'Lost Army IV — SUN'),
            op('c', 'Range Day'),
        ])

        expect(plan.groups).toHaveLength(1)
        expect(plan.skipped).toEqual([{ op: op('c', 'Range Day'), reason: 'no-roman-numeral' }])
    })

    it('skips a day-suffixed op whose base carries no numeral', () => {
        const plan = planNormalise([op('a', 'Range Day — SAT')])

        expect(plan.groups).toEqual([])
        expect(plan.skipped.map(s => s.op.id)).toEqual(['a'])
    })

    it('groups case-insensitively on the title', () => {
        const plan = planNormalise([
            op('a', 'LOST ARMY IV — SAT'),
            op('b', 'lost army iv — SUN'),
        ])

        expect(plan.groups).toHaveLength(1)
        expect(plan.groups[0].saturday?.id).toBe('a')
        expect(plan.groups[0].sunday?.id).toBe('b')
    })

    it('lets the later op win a contested slot, matching the route date sort', () => {
        // The route feeds ops date-ascending, so the last one to claim a night
        // is the most recent. Overwriting rather than first-wins is deliberate.
        const plan = planNormalise([
            op('older', 'Lost Army IV — SAT'),
            op('newer', 'Lost Army IV — SAT'),
        ])

        expect(plan.groups).toHaveLength(1)
        expect(plan.groups[0].saturday?.id).toBe('newer')
    })

    it('orders the whole numeral range, first to last', () => {
        const plan = planNormalise(ROMAN_ORDER.map((r, i) => op(String(i), `Lost Army ${r}`)))

        expect(plan.groups.map(g => g.roman)).toEqual([...ROMAN_ORDER])
        expect(plan.groups.map(g => g.romanIndex)).toEqual(ROMAN_ORDER.map((_, i) => i))
    })

    it('skips a numeral past X, which the pattern does not recognise', () => {
        // XI is not in the pattern, so the suffix does not parse at all and the
        // op is reported rather than filed under a numeral nobody can order.
        const plan = planNormalise([op('a', 'Lost Army XI')])

        expect(plan.groups).toEqual([])
        expect(plan.skipped.map(s => s.reason)).toEqual(['no-roman-numeral'])
    })

    it('returns nothing at all for an empty campaign', () => {
        expect(planNormalise([])).toEqual({ groups: [], skipped: [] })
    })
})
