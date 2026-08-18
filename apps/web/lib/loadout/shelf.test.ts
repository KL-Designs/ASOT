/**
 * Everything the shelf does to a list of kits, with no React in the way.
 * The card shape here is only the part these functions read — the rendered
 * card carries much more.
 */
import { describe, test, expect } from 'vitest'
import {
    matchesQuery, matchesTags, sortCards, pageCount, paginate, tagCounts,
    KITS_PER_PAGE, SHELF_SORTS, type ShelfCard,
} from './shelf'
import type { KitTag } from './tags'

function card(over: Partial<ShelfCard> & { id: string }): ShelfCard {
    return {
        name: 'Kit',
        tags: [],
        updatedAt: 0,
        ratingAvg: 0,
        ratingCount: 0,
        ratingScore: 0,
        copyCount: 0,
        haystack: '',
        ...over,
    }
}

describe('search', () => {
    const medic = card({
        id: 'a', name: 'Section Medic',
        haystack: 'section medic|the section first aid kit|cpl bones|medical night|mx 3d rifle',
    })

    test('an empty query matches everything', () => {
        expect(matchesQuery(medic, '')).toBe(true)
        expect(matchesQuery(medic, '   ')).toBe(true)
    })

    test('matches the kit name, case-insensitively', () => {
        expect(matchesQuery(medic, 'MEDIC')).toBe(true)
    })

    test('matches the owner, a tag label and the primary weapon', () => {
        expect(matchesQuery(medic, 'bones')).toBe(true)
        expect(matchesQuery(medic, 'night')).toBe(true)
        expect(matchesQuery(medic, 'mx 3d')).toBe(true)
    })

    test('every word must match, not just one', () => {
        expect(matchesQuery(medic, 'medic bones')).toBe(true)
        expect(matchesQuery(medic, 'medic pilot')).toBe(false)
    })

    test('no match is no match', () => {
        expect(matchesQuery(medic, 'submarine')).toBe(false)
    })
})

describe('tag filter', () => {
    const kit = card({ id: 'a', tags: ['medical', 'night'] as KitTag[] })

    test('no tags selected matches everything', () => {
        expect(matchesTags(kit, [])).toBe(true)
    })

    test('matches a tag it carries', () => {
        expect(matchesTags(kit, ['medical'] as KitTag[])).toBe(true)
    })

    test('several tags is AND, not OR', () => {
        expect(matchesTags(kit, ['medical', 'night'] as KitTag[])).toBe(true)
        expect(matchesTags(kit, ['medical', 'sniper'] as KitTag[])).toBe(false)
    })
})

describe('sorting', () => {
    const older = card({ id: 'old', name: 'Alpha', updatedAt: 100, ratingScore: 4, copyCount: 10 })
    const newer = card({ id: 'new', name: 'Zulu', updatedAt: 200, ratingScore: 3, copyCount: 2 })

    test('newest first by default', () => {
        expect(sortCards([older, newer], 'newest').map(c => c.id)).toEqual(['new', 'old'])
    })

    test('top rated uses the weighted score, not the raw average', () => {
        expect(sortCards([newer, older], 'rated').map(c => c.id)).toEqual(['old', 'new'])
    })

    test('most copied', () => {
        expect(sortCards([newer, older], 'copied').map(c => c.id)).toEqual(['old', 'new'])
    })

    test('A-Z', () => {
        expect(sortCards([newer, older], 'name').map(c => c.id)).toEqual(['old', 'new'])
    })

    test('ties break on recency, in every sort', () => {
        const a = card({ id: 'a', name: 'Same', updatedAt: 100, ratingScore: 4, copyCount: 5 })
        const b = card({ id: 'b', name: 'Same', updatedAt: 300, ratingScore: 4, copyCount: 5 })
        for (const sort of SHELF_SORTS) {
            expect(sortCards([a, b], sort.key).map(c => c.id)).toEqual(['b', 'a'])
        }
    })

    test('does not mutate its input', () => {
        const input = [older, newer]
        sortCards(input, 'name')
        expect(input.map(c => c.id)).toEqual(['old', 'new'])
    })
})

describe('paging', () => {
    const many = Array.from({ length: 50 }, (_, i) => card({ id: String(i) }))

    test('a full page is KITS_PER_PAGE long', () => {
        expect(paginate(many, 1)).toHaveLength(KITS_PER_PAGE)
    })

    test('the last page holds the remainder', () => {
        expect(paginate(many, 3)).toHaveLength(50 - KITS_PER_PAGE * 2)
    })

    test('page count rounds up and is never zero', () => {
        expect(pageCount(50)).toBe(3)
        expect(pageCount(24)).toBe(1)
        expect(pageCount(0)).toBe(1)
    })

    test('an out-of-range page clamps rather than emptying the shelf', () => {
        expect(paginate(many, 99).map(c => c.id)).toEqual(paginate(many, 3).map(c => c.id))
        expect(paginate(many, 0).map(c => c.id)).toEqual(paginate(many, 1).map(c => c.id))
        expect(paginate(many, -5).map(c => c.id)).toEqual(paginate(many, 1).map(c => c.id))
    })
})

describe('tagCounts', () => {
    test('counts only tags in use, in declared order', () => {
        const cards = [
            card({ id: 'a', tags: ['night', 'medical'] as KitTag[] }),
            card({ id: 'b', tags: ['medical'] as KitTag[] }),
        ]
        expect(tagCounts(cards)).toEqual([
            { tag: 'medical', count: 2 },
            { tag: 'night', count: 1 },
        ])
    })

    test('an empty shelf offers no chips', () => {
        expect(tagCounts([])).toEqual([])
    })
})
