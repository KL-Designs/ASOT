import { describe, expect, test } from 'vitest'
import {
    callsignOf, callsignStaff, canReviewAnything, canReviewCallsign, staffedCallsigns,
} from './callsign'

const positions = [
    { userId: 'sgt', sectionTitle: '1-1 Alpha', isSenior: true },
    { userId: 'cpl', sectionTitle: '1-1 Alpha', isSenior: true },
    { userId: 'rfn', sectionTitle: '1-1 Alpha' },
    { userId: null, sectionTitle: '1-1 Alpha', isSenior: true },
    { userId: 'sgt2', sectionTitle: '1-1 Bravo', isSenior: true },
    { userId: 'res', sectionTitle: '' },
]

describe('callsignOf', () => {
    test('is the section the member holds a position in', () => {
        expect(callsignOf(positions, 'rfn')).toBe('1-1 Alpha')
    })

    test('is nothing for somebody with no section', () => {
        expect(callsignOf(positions, 'res')).toBeNull()
        expect(callsignOf(positions, 'stranger')).toBeNull()
    })
})

describe('section staff', () => {
    test('are the senior positions of that section', () => {
        expect(callsignStaff(positions, '1-1 Alpha')).toEqual(['sgt', 'cpl'])
    })

    test('a vacant senior slot reviews nothing', () => {
        expect(callsignStaff(positions, '1-1 Alpha')).not.toContain(null)
    })

    test('a rifleman staffs no callsign', () => {
        expect(staffedCallsigns(positions, 'rfn')).toEqual([])
        expect(staffedCallsigns(positions, 'sgt')).toEqual(['1-1 Alpha'])
    })
})

describe('review scope', () => {
    test('J5 reviews everything, including what has no callsign', () => {
        const scope = { all: true, callsigns: [] }
        expect(canReviewCallsign(scope, null)).toBe(true)
        expect(canReviewCallsign(scope, '1-1 Bravo')).toBe(true)
    })

    test('section staff review their own callsign and nothing else', () => {
        const scope = { all: false, callsigns: ['1-1 Alpha'] }
        expect(canReviewCallsign(scope, '1-1 Alpha')).toBe(true)
        expect(canReviewCallsign(scope, '1-1 Bravo')).toBe(false)
        expect(canReviewCallsign(scope, null)).toBe(false)
    })

    test('nobody else reviews anything', () => {
        expect(canReviewAnything({ all: false, callsigns: [] })).toBe(false)
        expect(canReviewAnything({ all: false, callsigns: ['1-1 Alpha'] })).toBe(true)
    })
})
