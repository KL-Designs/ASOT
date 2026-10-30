import { describe, expect, test } from 'vitest'
import { courseTypeOf, nextCourseNumber, normaliseTrainingType, typeStatusOf } from './course-type'

describe('legacy training types', () => {
    test('status comes from isActive when there is none', () => {
        expect(typeStatusOf({ isActive: true })).toBe('active')
        expect(typeStatusOf({ isActive: false })).toBe('inactive')
        expect(typeStatusOf({})).toBe('active')
        expect(typeStatusOf({ status: 'wip', isActive: false })).toBe('wip')
    })
    test('Selection and Reinforcement Cycle are recognised by category or name', () => {
        expect(courseTypeOf({ category: 'Selection', name: 'Selection' })).toBe('selection')
        expect(courseTypeOf({ category: 'Reinforcement Cycle', name: 'RC' })).toBe('reinforcement_cycle')
        expect(courseTypeOf({ category: 'Leadership', name: 'Section Commanders Course' })).toBeUndefined()
        expect(courseTypeOf({ category: 'Basic', name: 'Selection of weapons' })).toBeUndefined()
        expect(normaliseTrainingType({ name: 'Selection', category: 'Selection', isActive: true })).toMatchObject({ status: 'active', isActive: true, courseType: 'selection' })
    })
    test('the next course number follows the highest used', () => {
        expect(nextCourseNumber(null, [])).toBe(1)
        expect(nextCourseNumber(2, [{ instanceNumber: 5 }, { instanceRef: 'RC-007' }])).toBe(8)
    })
})
