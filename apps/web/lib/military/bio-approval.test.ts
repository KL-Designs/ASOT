import { describe, expect, test } from 'vitest'
import { bioApproversFor, isHeadquartersSection, type BioPosition } from './bio-approval'

const p = (userId: string | null, category: string, sectionTitle: string): BioPosition => ({ userId, category, sectionTitle })

const ORBAT: BioPosition[] = [
    p('co', 'companyHQ', 'India Company HQ'),
    p('csm', 'companyHQ', 'India Company HQ'),
    p('pl1', 'platoon11', '1-1 PHQ'),
    p('sgt1', 'platoon11', '1-1 PHQ'),
    p('alpha-ic', 'platoon11', '1-1 Alpha'),
    p('rifleman', 'platoon11', '1-1 Alpha'),
    p(null, 'platoon11', '1-1 Alpha'),
    p('pilot', 'support', '1-3 HOTEL - ROTARY WING'),
    p('reservist', 'activeReservist', ''),
]

describe('isHeadquartersSection', () => {
    test('recognises a headquarters by the word, not an exact title', () => {
        expect(isHeadquartersSection('1-1 PHQ')).toBe(true)
        expect(isHeadquartersSection('1-2 Platoon HQ')).toBe(true)
        expect(isHeadquartersSection('India Company Headquarters')).toBe(true)
        expect(isHeadquartersSection('1-1 Alpha')).toBe(false)
        // "HQ" inside another word is not a headquarters.
        expect(isHeadquartersSection('1-3 CHQUEEN')).toBe(false)
    })
})

describe('bioApproversFor', () => {
    test('a section member goes to their own platoon HQ', () => {
        expect(bioApproversFor('rifleman', ORBAT)).toEqual({ level: 'phq', approverIds: ['pl1', 'sgt1'] })
    })

    test('a member of the PHQ goes up to company HQ, not to their own section', () => {
        expect(bioApproversFor('pl1', ORBAT)).toEqual({ level: 'chq', approverIds: ['co', 'csm'] })
    })

    test('a platoon with nobody in a PHQ goes to company HQ', () => {
        expect(bioApproversFor('pilot', ORBAT)).toEqual({ level: 'chq', approverIds: ['co', 'csm'] })
    })

    test('someone with no platoon position goes to company HQ', () => {
        expect(bioApproversFor('reservist', ORBAT).level).toBe('chq')
        expect(bioApproversFor('not-on-the-orbat', ORBAT).level).toBe('chq')
    })

    test('a member of company HQ goes to J4, and never to themselves', () => {
        expect(bioApproversFor('co', ORBAT)).toEqual({ level: 'j4', approverIds: [] })
    })

    test('with company HQ empty, everything that would have gone there goes to J4', () => {
        const noChq = ORBAT.filter(x => x.category !== 'companyHQ')
        expect(bioApproversFor('pl1', noChq)).toEqual({ level: 'j4', approverIds: [] })
    })

    test('nobody is ever their own approver, and vacant slots are not approvers', () => {
        const solo = [p('pl1', 'platoon11', '1-1 PHQ'), p(null, 'platoon11', '1-1 PHQ'), p('rifleman', 'platoon11', '1-1 Alpha')]
        expect(bioApproversFor('rifleman', solo)).toEqual({ level: 'phq', approverIds: ['pl1'] })
        expect(bioApproversFor('pl1', solo)).toEqual({ level: 'j4', approverIds: [] })
    })
})
