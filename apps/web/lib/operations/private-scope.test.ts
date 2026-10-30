import { describe, expect, test } from 'vitest'
import { hidePrivateOperations, scopeFilter, scopePipeline } from './private-scope'

describe('private operations are kept out of lists', () => {
    test('a list query gets the exclusion; one by id or naming assessment does not', () => {
        expect(scopeFilter({ status: 'Active' })).toEqual({ status: 'Active', assessment: { $exists: false } })
        expect(scopeFilter(undefined)).toEqual({ assessment: { $exists: false } })
        expect(scopeFilter({ _id: 'x' })).toEqual({ _id: 'x' })
        expect(scopeFilter({ 'assessment.traineeId': 'u' })).toEqual({ 'assessment.traineeId': 'u' })
    })
    test('aggregations get a leading $match unless they start by id', () => {
        expect(scopePipeline([{ $group: { _id: null } }])[0]).toEqual({ $match: { assessment: { $exists: false } } })
        expect(scopePipeline([{ $match: { _id: 1 } }])).toEqual([{ $match: { _id: 1 } }])
    })
    test('the wrapper rewrites the filter and passes everything else through', () => {
        const calls: unknown[][] = []
        const fake = {
            collectionName: 'operations',
            find: (...a: unknown[]) => { calls.push(['find', ...a]); return 'cursor' },
            distinct: (...a: unknown[]) => { calls.push(['distinct', ...a]); return [] },
            insertOne: (...a: unknown[]) => { calls.push(['insertOne', ...a]); return 'ok' },
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const col = hidePrivateOperations(fake as any) as any
        expect(col.collectionName).toBe('operations')
        expect(col.find({ status: 'Active' }, { projection: { title: 1 } })).toBe('cursor')
        col.distinct('department', { status: 'Active' })
        col.insertOne({ title: 'x' })
        expect(calls).toEqual([
            ['find', { status: 'Active', assessment: { $exists: false } }, { projection: { title: 1 } }],
            ['distinct', 'department', { status: 'Active', assessment: { $exists: false } }],
            ['insertOne', { title: 'x' }],
        ])
    })
})
