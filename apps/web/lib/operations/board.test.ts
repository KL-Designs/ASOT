/**
 * The board renders entirely from these functions, so anything it can show
 * wrong about the unit's history is decided here. The cases that matter are the
 * ones seven years of data actually contains: missions linked properly, missions
 * that only ever said what they were in their title, and nights that never ran.
 */
import { describe, test, expect } from 'vitest'
import {
    countOperations, detectDaySlot, detectRoman, escapeRegex, fillMonths, groupOperations,
    isFiltered, monthKey, parseBoardFilter, PAGE_SIZE,
    type BoardOperation, type CampaignRef, type MissionRef,
} from './board'

const op = (over: Partial<BoardOperation> & { id: string; title: string; date: string }): BoardOperation => ({
    units: [], ...over,
})

const LOST_ARMY: CampaignRef = { id: 'c-la', name: 'Lost Army' }

describe('detectDaySlot', () => {
    test('reads the day off the end of a title, however it was punctuated', () => {
        for (const title of ['Lost Army IV — SUN', 'Lost Army IV - Sun', 'Lost Army IV Sunday']) {
            expect(detectDaySlot(title).day, title).toBe('sunday')
            expect(detectDaySlot(title).stripped, title).toBe('Lost Army IV')
        }
    })

    test('leaves a title that names no day alone', () => {
        expect(detectDaySlot('Operation Broken Anchor')).toEqual({
            stripped: 'Operation Broken Anchor', day: null,
        })
    })

    test('does not mistake a word ending in the day for the day', () => {
        expect(detectDaySlot('Operation Sunspear').day).toBe(null)
    })
})

describe('detectRoman', () => {
    test('reads the ordinal and knows where it sits in the sequence', () => {
        expect(detectRoman('Lost Army IV')).toEqual({ stripped: 'Lost Army', roman: 'IV', index: 3 })
        expect(detectRoman('Lost Army I').index).toBe(0)
    })

    test('a title with no ordinal is left whole', () => {
        expect(detectRoman('Broken Anchor').roman).toBe(null)
    })
})

describe('groupOperations', () => {
    test('an operation in no campaign stands on its own', () => {
        const groups = groupOperations([op({ id: 'a', title: 'Broken Anchor', date: '2026-07-18' })])
        expect(groups).toHaveLength(1)
        expect(groups[0].kind).toBe('solo')
    })

    test('pairs a mission’s Saturday and Sunday into one row', () => {
        // The whole point of the grouping: eight rows become four.
        const missions: MissionRef[] = [{ id: 'm4', campaignId: 'c-la', name: 'Lost Army IV', sequence: 4 }]
        const groups = groupOperations([
            op({ id: 'sat', title: 'Lost Army IV — SAT', date: '2026-08-15', campaignId: 'c-la', campaignMissionId: 'm4', daySlot: 'saturday' }),
            op({ id: 'sun', title: 'Lost Army IV — SUN', date: '2026-08-16', campaignId: 'c-la', campaignMissionId: 'm4', daySlot: 'sunday' }),
        ], [LOST_ARMY], missions)

        expect(groups).toHaveLength(1)
        const group = groups[0]
        expect(group.kind).toBe('campaign')
        if (group.kind !== 'campaign') return
        expect(group.missions).toHaveLength(1)
        expect(group.missions[0].saturday?.id).toBe('sat')
        expect(group.missions[0].sunday?.id).toBe('sun')
        expect(group.missions[0].label).toBe('IV')
    })

    test('pairs on the title when no mission record links them', () => {
        // Most of the archive predates campaign missions being modelled at all;
        // those operations still said what they were, in their own names.
        const groups = groupOperations([
            op({ id: 'sat', title: 'Lost Army III — SAT', date: '2026-08-08', campaignId: 'c-la' }),
            op({ id: 'sun', title: 'Lost Army III — SUN', date: '2026-08-09', campaignId: 'c-la' }),
        ], [LOST_ARMY])

        const group = groups[0]
        if (group.kind !== 'campaign') throw new Error('expected a campaign')
        expect(group.missions).toHaveLength(1)
        expect(group.missions[0].name).toBe('Lost Army III')
        expect(group.missions[0].saturday?.id).toBe('sat')
        expect(group.missions[0].sunday?.id).toBe('sun')
    })

    test('a mission that only ran one night keeps the other side empty', () => {
        // Lost Army I had no Saturday. A flat list can only say nothing about
        // that; the board draws the gap, so it has to survive grouping.
        const groups = groupOperations([
            op({ id: 'sun', title: 'Lost Army I — SUN', date: '2026-07-26', campaignId: 'c-la' }),
        ], [LOST_ARMY])

        const group = groups[0]
        if (group.kind !== 'campaign') throw new Error('expected a campaign')
        expect(group.missions[0].saturday).toBe(null)
        expect(group.missions[0].sunday?.id).toBe('sun')
    })

    test('orders a campaign’s missions newest first, by ordinal', () => {
        const groups = groupOperations([
            op({ id: '1', title: 'Lost Army I — SUN', date: '2026-07-26', campaignId: 'c-la' }),
            op({ id: '3', title: 'Lost Army III — SAT', date: '2026-08-08', campaignId: 'c-la' }),
            op({ id: '2', title: 'Lost Army II — SAT', date: '2026-08-01', campaignId: 'c-la' }),
        ], [LOST_ARMY])

        const group = groups[0]
        if (group.kind !== 'campaign') throw new Error('expected a campaign')
        expect(group.missions.map(m => m.label)).toEqual(['III', 'II', 'I'])
    })

    test('a campaign reports the span its operations actually cover', () => {
        const groups = groupOperations([
            op({ id: 'a', title: 'Lost Army I — SUN', date: '2026-07-26', campaignId: 'c-la' }),
            op({ id: 'b', title: 'Lost Army IV — SUN', date: '2026-08-16', campaignId: 'c-la' }),
        ], [LOST_ARMY])

        const group = groups[0]
        if (group.kind !== 'campaign') throw new Error('expected a campaign')
        expect(group.from.slice(0, 10)).toBe('2026-07-26')
        expect(group.to.slice(0, 10)).toBe('2026-08-16')
    })

    test('groups come back newest first, campaigns and singles interleaved', () => {
        const groups = groupOperations([
            op({ id: 'old', title: 'Broken Anchor', date: '2026-07-18' }),
            op({ id: 'la', title: 'Lost Army IV — SUN', date: '2026-08-16', campaignId: 'c-la' }),
            op({ id: 'new', title: 'Iron Gate', date: '2026-08-22' }),
        ], [LOST_ARMY])

        expect(groups.map(g => g.kind === 'solo' ? g.operation.id : g.id)).toEqual(['new', 'c-la', 'old'])
    })

    test('an unknown campaign id does not swallow the operation', () => {
        // A campaign that was deleted must not take its operations off the board.
        const groups = groupOperations([
            op({ id: 'a', title: 'Orphan', date: '2026-06-01', campaignId: 'c-gone' }),
        ], [LOST_ARMY])
        expect(groups[0].kind).toBe('solo')
    })

    test('the same operation is never placed twice', () => {
        const missions: MissionRef[] = [{ id: 'm4', campaignId: 'c-la', name: 'Lost Army IV', sequence: 4 }]
        const groups = groupOperations([
            op({ id: 'sat', title: 'Lost Army IV — SAT', date: '2026-08-15', campaignId: 'c-la', campaignMissionId: 'm4', daySlot: 'saturday' }),
        ], [LOST_ARMY], missions)
        expect(countOperations(groups[0])).toBe(1)
    })

    test('two operations claiming the same night both survive', () => {
        // Bad data rather than a real case, but losing one silently would make
        // the archive disagree with the count above it.
        const groups = groupOperations([
            op({ id: 'a', title: 'Lost Army II — SAT', date: '2026-08-01', campaignId: 'c-la' }),
            op({ id: 'b', title: 'Lost Army II — SAT', date: '2026-08-01', campaignId: 'c-la' }),
        ], [LOST_ARMY])
        expect(countOperations(groups[0])).toBe(2)
    })
})

describe('countOperations', () => {
    test('counts the nights, not the missions', () => {
        const groups = groupOperations([
            op({ id: 'a', title: 'Lost Army IV — SAT', date: '2026-08-15', campaignId: 'c-la' }),
            op({ id: 'b', title: 'Lost Army IV — SUN', date: '2026-08-16', campaignId: 'c-la' }),
            op({ id: 'c', title: 'Lost Army III — SUN', date: '2026-08-09', campaignId: 'c-la' }),
        ], [LOST_ARMY])
        expect(countOperations(groups[0])).toBe(3)
    })
})

describe('parseBoardFilter', () => {
    const parse = (qs: string) => parseBoardFilter(new URLSearchParams(qs))

    test('reads the whole filter off the query string', () => {
        expect(parse('q=anchor&campaign=c-la&unit=support&terrain=Livonia&mine=1&from=2023-01&to=2026-08&skip=40'))
            .toEqual({
                q: 'anchor', campaignId: 'c-la', unit: 'support', terrain: 'Livonia',
                mine: true, from: '2023-01', to: '2026-08', skip: 40,
            })
    })

    test('an empty query string is an unfiltered first page', () => {
        const f = parse('')
        expect(f.skip).toBe(0)
        expect(isFiltered(f)).toBe(false)
    })

    test('rejects a month that is not a month', () => {
        // These reach a date query; a malformed one must not become an unbounded
        // range or a thrown cast.
        expect(parse('from=2026&to=august').from).toBe(null)
        expect(parse('from=2026&to=august').to).toBe(null)
    })

    test('clamps skip rather than trusting it', () => {
        expect(parse('skip=-5').skip).toBe(0)
        expect(parse('skip=nonsense').skip).toBe(0)
        expect(parse('skip=999999').skip).toBe(10_000)
    })

    test('caps the search text', () => {
        expect(parse(`q=${'x'.repeat(400)}`).q).toHaveLength(120)
    })

    test('any one filter counts as filtered', () => {
        expect(isFiltered(parse('q=anchor'))).toBe(true)
        expect(isFiltered(parse('mine=1'))).toBe(true)
        expect(isFiltered(parse('from=2024-01'))).toBe(true)
        expect(isFiltered(parse('skip=40'))).toBe(false)   // paging is not filtering
    })

    test('the page size is what the archive advertises', () => {
        expect(PAGE_SIZE).toBeGreaterThan(0)
    })
})

describe('escapeRegex', () => {
    test('a search that would otherwise be a pattern is taken literally', () => {
        expect(escapeRegex('lost (army)')).toBe('lost \\(army\\)')
        expect(escapeRegex('.*')).toBe('\\.\\*')
    })

    test('an unbalanced bracket cannot reach the driver as a syntax error', () => {
        expect(() => new RegExp(escapeRegex('op ['))).not.toThrow()
    })
})

describe('monthKey / fillMonths', () => {
    test('a date becomes the key the range filter speaks', () => {
        expect(monthKey('2026-08-15T09:00:00Z')).toBe('2026-08')
        expect(monthKey('2026-01-01T00:00:00Z')).toBe('2026-01')
    })

    test('fills the empty months between, because a gap is information', () => {
        // Drawing only the months that exist makes a six-month break look like
        // one step, which is exactly the shape the histogram exists to show.
        expect(fillMonths([
            { month: '2025-11', count: 4 },
            { month: '2026-02', count: 2 },
        ])).toEqual([
            { month: '2025-11', count: 4 },
            { month: '2025-12', count: 0 },
            { month: '2026-01', count: 0 },
            { month: '2026-02', count: 2 },
        ])
    })

    test('rolls the year over correctly', () => {
        const months = fillMonths([{ month: '2025-12', count: 1 }, { month: '2026-01', count: 1 }])
        expect(months.map(m => m.month)).toEqual(['2025-12', '2026-01'])
    })

    test('does not invent months around a single one', () => {
        expect(fillMonths([{ month: '2026-08', count: 3 }])).toEqual([{ month: '2026-08', count: 3 }])
    })

    test('no history draws nothing', () => {
        expect(fillMonths([])).toEqual([])
    })
})
