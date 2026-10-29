import { describe, expect, test } from 'vitest'
import {
    buildSummaryInput, canReadEntry, commendationsPost, groupByUnit, levelsFor, reportViewer, sourceSignature, summaryKey,
} from './aar-reports'

const entry = (section: string, platoon: string, id = section) => ({ id, section, platoon, updatedAt: '1' })

describe('reportViewer', () => {
    test('CHQ and J4 read the company', () => {
        expect(reportViewer([{ category: 'companyHQ', sectionTitle: 'CHQ' }], false).maxLevel).toBe('company')
        expect(reportViewer([], true).maxLevel).toBe('company')
    })
    test('a platoon HQ reads its platoon and can drill down to sections', () => {
        const v = reportViewer([{ category: 'platoon11', sectionTitle: '1-1 PHQ' }], false)
        expect(v).toEqual({ maxLevel: 'platoon', platoons: ['platoon11'], sections: [] })
        expect(levelsFor(v)).toEqual(['section', 'platoon'])
    })
    test('a section senior reads their own call sign only; a rifleman nothing', () => {
        expect(reportViewer([{ category: 'platoon11', sectionTitle: 'Alpha', isSenior: true }], false)).toEqual({ maxLevel: 'section', platoons: [], sections: ['Alpha'] })
        expect(reportViewer([{ category: 'platoon11', sectionTitle: 'Alpha' }], false).maxLevel).toBeNull()
    })
})

describe('grouping', () => {
    const phq = reportViewer([{ category: 'platoon11', sectionTitle: '1-1 PHQ' }], false)
    const entries = [entry('Alpha', 'platoon11', 'a1'), entry('Alpha', 'platoon11', 'a2'), entry('Bravo', 'platoon11'), entry('Charlie', 'platoon12')]
    test('another platoon is never included', () => {
        expect(canReadEntry(phq, entries[3])).toBe(false)
        expect(groupByUnit(entries, 'section', phq).map(g => [g.unit, g.entries.length])).toEqual([['Alpha', 2], ['Bravo', 1]])
    })
    test('platoon and company roll up', () => {
        expect(groupByUnit(entries, 'platoon', phq).map(g => g.unit)).toEqual(['1-1 Platoon'])
        const chq = reportViewer([], true)
        expect(groupByUnit(entries, 'company', chq)).toEqual([{ unit: 'Company', entries }])
    })
})

describe('summary inputs', () => {
    test('the signature changes when an entry is edited', () => {
        expect(sourceSignature([{ id: 'a', updatedAt: '1' }])).not.toBe(sourceSignature([{ id: 'a', updatedAt: '2' }]))
        expect(summaryKey('6m', '', 'platoon', '1-1 Platoon')).toBe('6m|-|platoon|1-1 Platoon')
    })
    test('the prompt carries no member names and says when it was cut', () => {
        const text = buildSummaryInput('Alpha', [
            { operationTitle: 'Op A', section: 'Alpha', fix: 'comms', improve: '', sustain: 'pace' },
            { operationTitle: 'Op B', section: 'Alpha', fix: 'x'.repeat(100), improve: '', sustain: '' },
        ], 80)
        expect(text).toContain('[Op A · Alpha]')
        expect(text).toContain('Reports: 1 (of 2')
    })
    test('commendations become a copyable post', () => {
        expect(commendationsPost([{ targetName: 'Smith', targetType: 'member', wording: 'Held the line', authorName: 'Sgt Jones', operationTitle: 'Op A' }]))
            .toBe('**Smith** — Op A\nHeld the line\n— Sgt Jones')
    })
})
