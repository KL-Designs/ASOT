/**
 * These dates end up printed on a certificate a member keeps, and they decide
 * which rank a historical citation is titled with — so a misread is a wrong
 * document, not a wrong pixel.
 */
import { describe, test, expect } from 'vitest'
import { parseMilpacDate } from './milpac-dates'

const ymd = (d: Date | null) => d && [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-')

describe('parseMilpacDate', () => {
    test('reads the long form the editor writes', () => {
        expect(ymd(parseMilpacDate('15 August 2020'))).toBe('2020-8-15')
        expect(ymd(parseMilpacDate('04 October 2024'))).toBe('2024-10-4')
        expect(ymd(parseMilpacDate('27 September 2024'))).toBe('2024-9-27')
    })

    test('reads slash and dash dates as day-first, not month-first', () => {
        // The whole reason this helper exists: new Date('04/10/2024') is
        // 10 April in a US-locale engine, but the unit writes day-first.
        expect(ymd(parseMilpacDate('04/10/2024'))).toBe('2024-10-4')
        expect(ymd(parseMilpacDate('4/10/2024'))).toBe('2024-10-4')
        expect(ymd(parseMilpacDate('27-09-2024'))).toBe('2024-9-27')
        expect(ymd(parseMilpacDate('31/12/2023'))).toBe('2023-12-31')
    })

    test('ISO dates still work', () => {
        expect(ymd(parseMilpacDate('2024-10-04'))).toBe('2024-10-4')
    })

    test('an impossible day is rejected rather than rolled forward', () => {
        // Date() turns 31 February into 2 March instead of failing.
        expect(parseMilpacDate('31/02/2024')).toBeNull()
        expect(parseMilpacDate('32/01/2024')).toBeNull()
        expect(parseMilpacDate('01/13/2024')).toBeNull()
    })

    test('nothing usable reads as null, never as today', () => {
        for (const bad of [undefined, null, '', '   ', 'unknown', 'TBC', 'n/a']) {
            expect(parseMilpacDate(bad)).toBeNull()
        }
    })

    test('surrounding whitespace is tolerated', () => {
        expect(ymd(parseMilpacDate('  04/10/2024  '))).toBe('2024-10-4')
    })
})
