import { describe, expect, test } from 'vitest'
import { listNames, missingPrerequisites } from './prerequisites'

const none = { qualifications: [], attendedTrainings: [] }

describe('missingPrerequisites', () => {
    test('a training with no prerequisites blocks nobody', () => {
        expect(missingPrerequisites(undefined, none)).toEqual([])
        expect(missingPrerequisites([], none)).toEqual([])
    })

    test('lists everything outstanding, in the training\'s own order and spelling', () => {
        expect(missingPrerequisites(['Basic Medical Course', 'Basic CQB Course'], none))
            .toEqual(['Basic Medical Course', 'Basic CQB Course'])
    })

    test('a qualification on the milpac satisfies a prerequisite', () => {
        const held = { qualifications: ['Basic Medical Course'], attendedTrainings: [] }
        expect(missingPrerequisites(['Basic Medical Course', 'Basic CQB Course'], held)).toEqual(['Basic CQB Course'])
    })

    test('so does having attended a completed session, before the qualification is awarded', () => {
        const held = { qualifications: [], attendedTrainings: ['Basic CQB Course'] }
        expect(missingPrerequisites(['Basic CQB Course'], held)).toEqual([])
    })

    test('names match regardless of case and stray spacing', () => {
        const held = { qualifications: ['basic  medical course'], attendedTrainings: [] }
        expect(missingPrerequisites([' Basic Medical Course '], held)).toEqual([])
    })

    test('blank and repeated entries are not extra requirements', () => {
        expect(missingPrerequisites(['Basic CQB Course', '', 'basic cqb course'], none)).toEqual(['Basic CQB Course'])
    })
})

describe('listNames', () => {
    test('reads as a sentence fragment', () => {
        expect(listNames(['A'])).toBe('A')
        expect(listNames(['A', 'B'])).toBe('A and B')
        expect(listNames(['A', 'B', 'C'])).toBe('A, B and C')
    })
})
