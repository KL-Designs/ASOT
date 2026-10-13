import { describe, expect, test, vi } from 'vitest'

// Only the pure half is exercised here.
vi.mock('@/lib/mongo', () => ({ default: {} }))

import { restoreOperations, sanitiseRestoreItems } from './reinstate'

const milpac = {
    qualifications: [{ date: '2025-01-01', qualification: 'BCT 1' }],
    awards: [{ name: 'Atlas Award' }],
    operations: [{ startToEndDate: '2025', name: 'Op One' }],
    billetCounts: { platoonTraining: 3, sectionTraining: 2, j3Bct12: 1, j3OtherTrainings: 4, campaignMedals: 5, primaryNightOps: 40 },
} as unknown as NonNullable<User['milpac']>

describe('sanitiseRestoreItems', () => {
    test('keeps recognised items, once each, in a fixed order', () => {
        expect(sanitiseRestoreItems(['trainings', 'awards', 'trainings', 'rank', 7])).toEqual(['awards', 'trainings'])
    })

    test('anything that is not a list is nothing', () => {
        expect(sanitiseRestoreItems(undefined)).toEqual([])
        expect(sanitiseRestoreItems('trainings')).toEqual([])
    })
})

describe('restoreOperations', () => {
    test('restores only what was asked for', () => {
        expect(restoreOperations(milpac, ['trainings'])).toEqual({
            'milpac.billetCounts.platoonTraining': 3,
            'milpac.billetCounts.sectionTraining': 2,
            'milpac.billetCounts.j3Bct12': 1,
            'milpac.billetCounts.j3OtherTrainings': 4,
        })
    })

    test('trainings never carries the operation counts with it', () => {
        const set = restoreOperations(milpac, ['trainings'])
        expect(Object.keys(set).some(k => k.includes('primaryNightOps') || k.includes('campaignMedals'))).toBe(false)
    })

    test('restores qualifications, awards and operations from their own fields', () => {
        const set = restoreOperations(milpac, ['qualifications', 'awards', 'operations'])
        expect(set['milpac.qualifications']).toBe(milpac.qualifications)
        expect(set['milpac.awards']).toBe(milpac.awards)
        expect(set['milpac.operations']).toBe(milpac.operations)
        expect(set['milpac.billetCounts.campaignMedals']).toBe(5)
    })

    test('an item the snapshot has nothing for is skipped, not written as empty', () => {
        const thin = { qualifications: [], awards: [] } as unknown as NonNullable<User['milpac']>
        expect(restoreOperations(thin, ['qualifications', 'awards', 'trainings', 'operations'])).toEqual({})
    })

    test('no snapshot milpac restores nothing', () => {
        expect(restoreOperations(undefined, ['awards'])).toEqual({})
    })
})
