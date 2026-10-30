import { describe, expect, test } from 'vitest'
import { matchRows, parseImport, readPreference } from './award-postage-import'

describe('parseImport', () => {
    test('tabs from a spreadsheet, commas from a CSV, and a header row', () => {
        expect(parseImport('Member\tPostage\nJ Smith\tYes\n\n"Brown, A",no')).toEqual([
            { line: 2, member: 'J Smith', value: 'Yes' },
            { line: 4, member: 'Brown, A', value: 'no' },
        ])
    })

    test('a dash, colon or bar between the name and the answer', () => {
        expect(parseImport('AgentDove - Yes\nAjax – Unassigned\nAlexie: No\nMary-Jane | yes\nLoner')).toEqual([
            { line: 1, member: 'AgentDove', value: 'Yes' },
            { line: 2, member: 'Ajax', value: 'Unassigned' },
            { line: 3, member: 'Alexie', value: 'No' },
            { line: 4, member: 'Mary-Jane', value: 'yes' },
            { line: 5, member: 'Loner', value: '' },
        ])
    })
})

describe('readPreference', () => {
    test('spellings', () => {
        expect(readPreference('Y')).toBe('yes')
        expect(readPreference('Declined')).toBe('no')
        expect(readPreference('')).toBe('unassigned')
        expect(readPreference('maybe')).toBeNull()
    })
})

describe('matchRows', () => {
    const members = [
        { userId: '111111', names: ['J Smith', 'jsmith'] },
        { userId: '222222', names: ['A Brown'] },
        { userId: '333333', names: ['A Brown'] },
    ]
    test('by name, with a rank in front, by ID; shared names and bad values are reported', () => {
        const { matched, unmatched } = matchRows([
            { line: 1, member: 'CPL J. Smith', value: 'yes' },
            { line: 2, member: '222222', value: 'no' },
            { line: 3, member: 'A Brown', value: 'yes' },
            { line: 4, member: 'Nobody', value: 'yes' },
            { line: 5, member: 'jsmith', value: 'perhaps' },
        ], members, ['CPL', 'SGT'])
        expect(matched).toEqual([
            { line: 1, member: 'CPL J. Smith', userId: '111111', preference: 'yes' },
            { line: 2, member: '222222', userId: '222222', preference: 'no' },
        ])
        expect(unmatched.map(u => u.line)).toEqual([3, 4, 5])
    })
})

describe('matching names without ranks', () => {
    const members = [
        { userId: '1', names: ['CPL J. Smith', 'CPL J. Smith [LOA]', 'jsmith99'] },
        { userId: '2', names: ['LCPL Alex Brown'] },
        { userId: '3', names: ['PTE Jordan-Lee Nguyen'] },
    ]
    const ranks = ['CPL', 'LCPL', 'PTE']
    test('a plain list of names finds members whose nicknames carry ranks and tags', () => {
        const { matched, unmatched } = matchRows([
            { line: 1, member: 'J Smith', value: 'Yes' },
            { line: 2, member: 'Alex Brown', value: 'No' },
            { line: 3, member: 'Brown', value: 'Unassigned' },
            { line: 4, member: 'Jordan Lee Nguyen', value: 'yes' },
            { line: 5, member: 'J.Smith', value: 'no' },
        ], members, ranks)
        expect(matched.map(m => [m.line, m.userId])).toEqual([[1, '1'], [2, '2'], [3, '2'], [4, '3'], [5, '1']])
        expect(unmatched).toEqual([])
    })
})

