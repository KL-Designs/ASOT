import { describe, expect, test } from 'vitest'
import { SPACER } from './tags'
import { buildResolver, milpacBundles, milpacSubject, normaliseKey } from './milpac-groups'

/** A slice of a real server: names as they are spelt in tags.ts. */
const GROUPS = [
    { id: 1, name: SPACER.RANK },
    { id: 2, name: SPACER.PTE },
    { id: 3, name: SPACER.CITATIONS },
    { id: 4, name: SPACER.CAMPAIGN },
    { id: 5, name: SPACER.CERTS },
    { id: 10, name: 'PTE - Private' },
    { id: 11, name: 'PTE(P) - Private Proficient' },
    { id: 20, name: 'Atlas Award' },
    { id: 30, name: "- Operation Overlord '21" },
    { id: 40, name: 'BCT Stage 1' },
    { id: 50, name: '- Operation Brand New' },
]

const none = new Set<number>()

describe('normaliseKey', () => {
    test('ignores case, spacing and the campaign groups\' leading dash', () => {
        expect(normaliseKey("-  Operation  Overlord '21 ")).toBe(normaliseKey("operation overlord '21"))
    })
})

describe('resolving by name', () => {
    const resolver = buildResolver(GROUPS, [])

    test('a rank, an award, a campaign and a certification each find their group', () => {
        expect(resolver.groupIds('rank', 'PTE')).toEqual([10])
        expect(resolver.groupIds('award', 'Atlas Award')).toEqual([20])
        expect(resolver.groupIds('campaign', "Operation Overlord '21")).toEqual([30])
        expect(resolver.groupIds('certification', 'BCT 1')).toEqual([40])
    })

    test('something with no group on the server resolves to nothing', () => {
        expect(resolver.groupIds('award', 'Star of Courage')).toEqual([])
        expect(resolver.via('award', 'Star of Courage')).toBeNull()
    })

    test('carries the spacers the name table lists', () => {
        expect(resolver.spacerIds('rank', 'PTE')).toEqual([1, 2])
        expect(resolver.spacerIds('campaign', "Operation Overlord '21")).toEqual([4])
    })

    test('knows which groups are ranks', () => {
        expect([...resolver.rankGroupIds].sort()).toEqual([10, 11])
    })
})

describe('links', () => {
    test('map a campaign the name table has never heard of', () => {
        const resolver = buildResolver(GROUPS, [{ kind: 'campaign', key: 'Operation Brand New', tsGroupId: 50 }])
        expect(resolver.groupIds('campaign', 'operation brand new')).toEqual([50])
        expect(resolver.via('campaign', 'Operation Brand New')).toBe('link')
        // No table entry, so the kind's own divider.
        expect(resolver.spacerIds('campaign', 'Operation Brand New')).toEqual([4])
    })

    test('override the name match', () => {
        const resolver = buildResolver(GROUPS, [{ kind: 'award', key: 'Atlas Award', tsGroupId: 50 }])
        expect(resolver.groupIds('award', 'Atlas Award')).toEqual([50])
    })

    test('to a group that is gone are ignored', () => {
        const resolver = buildResolver(GROUPS, [{ kind: 'award', key: 'Atlas Award', tsGroupId: 999 }])
        expect(resolver.groupIds('award', 'Atlas Award')).toEqual([20])
    })

    test('a linked rank group counts as a rank group', () => {
        const resolver = buildResolver(GROUPS, [{ kind: 'rank', key: 'LCPL', tsGroupId: 50 }])
        expect(resolver.rankGroupIds.has(50)).toBe(true)
    })
})

describe('milpacBundles', () => {
    const resolver = buildResolver(GROUPS, [])
    const subject = milpacSubject({
        currentRank: 'PTE',
        awards: [{ name: 'Atlas Award' }, { name: 'Star of Courage' }],
        operations: [{ name: "Operation Overlord '21" }],
        qualifications: [{ qualification: 'BCT 1' }],
    })

    test('owe the rank, each resolvable award, campaign and certification, with their spacers', () => {
        const ids = milpacBundles(subject, resolver, none).flatMap(b => b.tsGroupIds).sort((a, b) => a - b)
        expect(ids).toEqual([1, 2, 3, 4, 5, 10, 20, 30, 40])
    })

    test('say where each came from', () => {
        expect(milpacBundles(subject, resolver, none).map(b => b.source)).toEqual([
            'Rank: PTE', 'Award: Atlas Award', "Campaign: Operation Overlord '21", 'Certification: BCT 1',
        ])
    })

    test('the same medal listed twice is owed once', () => {
        const twice = milpacSubject({ awards: [{ name: 'Atlas Award' }, { name: 'atlas award' }] })
        expect(milpacBundles(twice, resolver, none)).toHaveLength(1)
    })

    test('a member with no MILPAC is owed nothing', () => {
        expect(milpacBundles(milpacSubject(undefined), resolver, none)).toEqual([])
    })

    test('somebody already wearing a variant of their rank keeps it', () => {
        // Two groups for one rank, as a rank and its (V) twin are.
        const twins = buildResolver(
            [...GROUPS, { id: 60, name: 'LCPL - Lance Corporal' }, { id: 61, name: 'LCPL - Lance Corporal (V)' }],
            [],
        )
        expect(twins.groupIds('rank', 'LCPL')).toEqual([60, 61])

        const wearingV = milpacBundles({ rank: 'LCPL' }, twins, new Set([61]))[0]
        expect(wearingV.tsGroupIds).toContain(61)
        expect(wearingV.tsGroupIds).not.toContain(60)

        // And with neither, the plain one is granted.
        expect(milpacBundles({ rank: 'LCPL' }, twins, none)[0].tsGroupIds[0]).toBe(60)
    })
})
