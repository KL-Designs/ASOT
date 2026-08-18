import { describe, test, expect } from 'vitest'
import { dedupeQualifications, dedupeAwards, repeatedAwards } from './milpac-dedupe'

const qual = (qualification: string, date = '') => ({ qualification, date })
const award = (name: string, date = '') => ({ name, date, type: 'Service Citation' })

describe('dedupeQualifications', () => {
    test('leaves a list with no repeats alone', () => {
        const records = [qual('BCT 1'), qual('BCT 2')]
        expect(dedupeQualifications(records)).toEqual(records)
    })

    test('keeps one record per course', () => {
        expect(dedupeQualifications([qual('BCT 2'), qual('BCT 2')])).toEqual([qual('BCT 2')])
    })

    // A dated record says when the course was passed; a blank one says
    // nothing. Order of arrival should not decide which survives.
    test('prefers the dated record, whichever came first', () => {
        expect(dedupeQualifications([qual('BCT 2'), qual('BCT 2', '04 October 2025')]))
            .toEqual([qual('BCT 2', '04 October 2025')])
        expect(dedupeQualifications([qual('BCT 2', '04 October 2025'), qual('BCT 2')]))
            .toEqual([qual('BCT 2', '04 October 2025')])
    })

    test('keeps the first when both are dated', () => {
        expect(dedupeQualifications([qual('BCT 2', '01 January 2024'), qual('BCT 2', '04 October 2025')]))
            .toEqual([qual('BCT 2', '01 January 2024')])
    })

    // Deduping must not double as a re-sort — the member's list should look
    // the same minus the repeats.
    test('preserves the order of the records it keeps', () => {
        const records = [qual('BCT 1'), qual('VCP'), qual('BCT 1'), qual('BCT 2')]
        expect(dedupeQualifications(records).map(r => r.qualification)).toEqual(['BCT 1', 'VCP', 'BCT 2'])
    })

    test('three copies collapse to one', () => {
        expect(dedupeQualifications([qual('VCP'), qual('VCP'), qual('VCP')])).toHaveLength(1)
    })

    test('an empty list stays empty', () => {
        expect(dedupeQualifications([])).toEqual([])
    })
})

describe('dedupeAwards', () => {
    test('removes an exact repeat', () => {
        expect(dedupeAwards([award('Watchman Award', '05 January 2023'), award('Watchman Award', '05 January 2023')]))
            .toEqual([award('Watchman Award', '05 January 2023')])
    })

    // Two undated copies of the same award are the shape the history import
    // left behind — one member held three undated 1 Year Service Citations.
    test('treats two undated copies as the same record', () => {
        expect(dedupeAwards([award('Gallantry Award'), award('Gallantry Award')]))
            .toEqual([award('Gallantry Award')])
    })

    // The judgement call this function refuses to make. Some repeats are real,
    // some are plainly wrong, and only the unit can say which.
    test('keeps the same award granted on two different dates', () => {
        const records = [award('Watchman Award', '05 January 2023'), award('Watchman Award', '05 November 2023')]
        expect(dedupeAwards(records)).toEqual(records)
    })

    test('keeps different awards sharing a date', () => {
        const records = [award('Gallantry Award', '01 May 2025'), award('Atlas Award', '01 May 2025')]
        expect(dedupeAwards(records)).toEqual(records)
    })

    test('preserves order', () => {
        const records = [award('A', '1 January 2024'), award('B'), award('A', '1 January 2024'), award('C')]
        expect(dedupeAwards(records).map(r => r.name)).toEqual(['A', 'B', 'C'])
    })
})

describe('repeatedAwards', () => {
    test('reports an award held on two different dates', () => {
        expect(repeatedAwards([award('Watchman Award', '05 January 2023'), award('Watchman Award', '05 November 2023')]))
            .toEqual([{ name: 'Watchman Award', dates: ['05 January 2023', '05 November 2023'] }])
    })

    // An exact repeat is dedupeAwards' business, not a question for anyone.
    test('does not report an exact repeat', () => {
        expect(repeatedAwards([award('Watchman Award', '05 January 2023'), award('Watchman Award', '05 January 2023')]))
            .toEqual([])
    })

    test('labels a missing date rather than reporting a blank', () => {
        expect(repeatedAwards([award('Watchman Award'), award('Watchman Award', '05 November 2023')]))
            .toEqual([{ name: 'Watchman Award', dates: ['(no date)', '05 November 2023'] }])
    })

    test('says nothing about a clean list', () => {
        expect(repeatedAwards([award('Gallantry Award', '01 May 2025'), award('Atlas Award', '02 May 2025')]))
            .toEqual([])
    })
})
