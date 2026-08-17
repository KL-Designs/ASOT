/**
 * The status pill states something about a real person on a page anyone can
 * read, so it must only claim what the system actually knows.
 *
 * There is no member-status field on the user document. These two signals are
 * all that genuinely exist: the discharge sub-document, and the ORBAT position
 * category — which is the only place the active-vs-inactive reservist
 * distinction is recorded, and which getOrbatEntryByUserId() used to discard by
 * collapsing both into the label "Company Reservists".
 *
 * LOA and probationary are absent on purpose. Neither is recorded anywhere in
 * the monorepo, and a pill asserting either would be inventing a fact.
 */
import { describe, test, expect } from 'vitest'
import { deriveStatus, platoonLabel } from './milpac-status'

describe('deriveStatus', () => {
    test('a member with no ORBAT position is Active', () => {
        expect(deriveStatus(false, undefined)).toEqual({ key: 'active', label: 'Active' })
    })

    test('distinguishes the two reservist categories', () => {
        expect(deriveStatus(false, 'activeReservist'))
            .toEqual({ key: 'reservistActive', label: 'Active Reservist' })
        expect(deriveStatus(false, 'inactiveReservist'))
            .toEqual({ key: 'reservistInactive', label: 'Inactive Reservist' })
    })

    test('a serving position reads as Active, not as its category', () => {
        for (const category of ['companyHQ', 'platoon11', 'platoon12', 'support', 'gamemaster']) {
            expect(deriveStatus(false, category).key).toBe('active')
        }
    })

    test('discharge outranks any ORBAT position', () => {
        // A discharged member can still have a stale ORBAT row; the discharge is
        // the truth and the pill must not say Active Reservist.
        expect(deriveStatus(true, 'activeReservist')).toEqual({ key: 'discharged', label: 'Discharged' })
        expect(deriveStatus(true, undefined).key).toBe('discharged')
    })
})

describe('platoonLabel', () => {
    test('maps a category to its human platoon name', () => {
        expect(platoonLabel('platoon11')).toBe('Platoon 1-1 Infantry')
        expect(platoonLabel('support')).toBe('Platoon 1-3 Support')
        expect(platoonLabel('companyHQ')).toBe('India Company HQ')
    })

    test('returns null for a category with no platoon, rather than a placeholder', () => {
        // Reservists sit outside the platoon structure — the strapline should
        // omit the segment entirely instead of printing "Unknown".
        expect(platoonLabel('activeReservist')).toBeNull()
        expect(platoonLabel(undefined)).toBeNull()
        expect(platoonLabel('nonsense')).toBeNull()
    })
})
