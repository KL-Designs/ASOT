import { describe, expect, test } from 'vitest'
import { onCrew } from './roster'

const support = (night?: 'saturday' | 'sunday' | null) => ({ category: 'support', night })

describe('onCrew', () => {
    test('a slot tagged for one night is on that night\'s crew and not the other\'s', () => {
        expect(onCrew(support('saturday'), 'saturday')).toBe(true)
        expect(onCrew(support('saturday'), 'sunday')).toBe(false)
        expect(onCrew(support('sunday'), 'sunday')).toBe(true)
        expect(onCrew(support('sunday'), 'saturday')).toBe(false)
    })

    test('an untagged support slot plays both nights', () => {
        expect(onCrew(support(), 'saturday')).toBe(true)
        expect(onCrew(support(null), 'sunday')).toBe(true)
    })

    test('an operation taking both crews, or that never chose, gets every slot', () => {
        expect(onCrew(support('saturday'), 'both')).toBe(true)
        expect(onCrew(support('sunday'), 'both')).toBe(true)
        expect(onCrew(support('sunday'), undefined)).toBe(true)
    })

    test('the tag means nothing outside the support platoon', () => {
        expect(onCrew({ category: 'platoon11', night: 'sunday' }, 'saturday')).toBe(true)
        expect(onCrew({ category: 'gamemaster', night: 'saturday' }, 'sunday')).toBe(true)
    })
})
