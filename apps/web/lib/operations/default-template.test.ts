import { describe, expect, test } from 'vitest'
import { newMissionContent } from './default-template'

const ids = () => {
    let n = 0
    return () => `id${++n}`
}

describe('newMissionContent', () => {
    test('with no default template, a mission gets just the two system pages', () => {
        const content = newMissionContent(null, ids())
        expect(content.pages.map(p => p.pageType)).toEqual(['zeus', 'ocap'])
        expect(content.sections).toBeUndefined()
        expect(content.extraPageSections).toBeUndefined()
    })

    test('a template brings its sections, pages and per-page sections', () => {
        const sections = [{ id: 's1', title: 'Situation' }] as unknown as OperationSection[]
        const pages = [
            { id: 'p1', title: 'Orders', isMain: true },
            { id: 'z', title: 'Zeus Notes', isMain: false, pageType: 'zeus' },
            { id: 'o', title: 'OCAP', isMain: false, pageType: 'ocap' },
        ] as unknown as OperationPage[]
        const extraPageSections = { p1: sections }

        const content = newMissionContent({ sections, pages, extraPageSections }, ids())

        expect(content.sections).toBe(sections)
        expect(content.pages.map(p => p.id)).toEqual(['p1', 'z', 'o'])
        expect(content.extraPageSections).toBe(extraPageSections)
    })

    test('a template missing a system page has it added back, after its own pages', () => {
        const pages = [
            { id: 'p1', title: 'Orders', isMain: true },
            { id: 'z', title: 'Zeus Notes', isMain: false, pageType: 'zeus' },
        ] as unknown as OperationPage[]

        const content = newMissionContent({ pages }, ids())

        expect(content.pages.map(p => p.pageType ?? 'doc')).toEqual(['doc', 'zeus', 'ocap'])
        expect(content.pages[2].id).toBe('id1')
    })

    test('the template itself is not mutated', () => {
        const pages = [{ id: 'p1', title: 'Orders', isMain: true }] as unknown as OperationPage[]
        newMissionContent({ pages }, ids())
        expect(pages).toHaveLength(1)
    })
})
