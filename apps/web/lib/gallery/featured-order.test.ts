import { describe, test, expect } from 'vitest'
import { planFeaturedOrder } from './featured-order'
import type { ArchiveCandidate, FeaturedCandidate } from './featured-order'

/**
 * The plan half of scripts/backfill-featured-order.ts.
 *
 * The easy case — a featured file with no twin keeps its own tile — is one
 * test. The rest of this file is about the ways the archive match can be
 * WRONG, because a wrong match publishes somebody else's photograph under a
 * caption that does not belong to it, and the operator's only defence is the
 * dry run's bucket report. So: one candidate, none, two, one already taken,
 * and a document with nothing to match on.
 */

let n = 0
const id = () => `507f1f77bcf86cd7994390${(10 + n++).toString().padStart(2, '0')}`

function featured(file: string, size?: [number, number, number]): FeaturedCandidate {
    return size
        ? { id: id(), file, bytes: size[0], width: size[1], height: size[2] }
        : { id: id(), file }
}

function archive(key: string, size: [number, number, number]): ArchiveCandidate {
    return { id: id(), key, bytes: size[0], width: size[1], height: size[2] }
}

const SHOT: [number, number, number] = [3_812_004, 3840, 2160]
const OTHER: [number, number, number] = [2_119_887, 2560, 1440]

describe('planFeaturedOrder', () => {
    test('orders every featured file by filename, contiguously from zero', () => {
        const plan = planFeaturedOrder(
            [featured('Yes2.jpg'), featured('Anat.png'), featured('SUN1.JPG')],
            [],
        )

        expect(plan.placements.map(p => p.featuredFile)).toEqual(['Anat.png', 'SUN1.JPG', 'Yes2.jpg'])
        expect(plan.placements.map(p => p.order)).toEqual([0, 1, 2])
    })

    test('a featured file with no archive twin keeps its own tile', () => {
        const plan = planFeaturedOrder([featured('No1.jpg', SHOT)], [archive('content:2025/Op A/I/a.jpg', OTHER)])

        expect(plan.placements).toHaveLength(1)
        const [placement] = plan.placements
        expect(placement.target).toBe('self')
        if (placement.target !== 'self') throw new Error('unreachable')
        expect(placement.reason).toBe('no-match')
        expect(placement.candidates).toEqual([])
    })

    test('a single exact match hands the rail slot to the archive document', () => {
        const original = archive('content:2025/Op Black Hill/I/Koda — Danger close.jpg', SHOT)
        const plan = planFeaturedOrder(
            [featured('Yes1.jpg', SHOT)],
            [original, archive('content:2025/Op Black Hill/I/b.jpg', OTHER)],
        )

        const [placement] = plan.placements
        expect(placement.target).toBe('archive')
        if (placement.target !== 'archive') throw new Error('unreachable')
        // The whole point: the caption and the credit come with the document,
        // so the tile is not a bare photograph any more.
        expect(placement.archiveId).toBe(original.id)
        expect(placement.archiveKey).toBe(original.key)
        expect(placement.order).toBe(0)
    })

    /* Two archive documents indistinguishable on bytes+dimensions is exactly
       the case where guessing would publish the wrong operation's caption. */
    test('two matches are ambiguous, and the featured file keeps its own tile', () => {
        const a = archive('content:2025/Op A/I/a.jpg', SHOT)
        const b = archive('content:2024/Op B/II/b.jpg', SHOT)
        const plan = planFeaturedOrder([featured('Maybe7.jpg', SHOT)], [a, b])

        const [placement] = plan.placements
        expect(placement.target).toBe('self')
        if (placement.target !== 'self') throw new Error('unreachable')
        expect(placement.reason).toBe('ambiguous')
        expect(placement.candidates.sort()).toEqual([a.key, b.key].sort())
    })

    /* Both featured copies resolving to one document would write two different
       featuredOrder values to it: the second wins, and the rail silently comes
       out one tile short with a hole in the sequence. */
    test('an archive document is claimed once — the later featured file keeps its own tile', () => {
        const original = archive('content:2025/Op A/I/a.jpg', SHOT)
        const plan = planFeaturedOrder(
            [featured('Yes3.png', SHOT), featured('Maybe8.jpg', SHOT)],
            [original],
        )

        // Filename order decides which one wins, so the outcome does not
        // depend on the order the database happened to return the documents.
        const [first, second] = plan.placements
        expect(first.featuredFile).toBe('Maybe8.jpg')
        expect(first.target).toBe('archive')

        expect(second.featuredFile).toBe('Yes3.png')
        expect(second.target).toBe('self')
        if (second.target !== 'self') throw new Error('unreachable')
        expect(second.reason).toBe('archive-claimed')

        // Still 0 and 1: every featured file gets a slot whichever bucket it
        // fell into, so the rail is never left with a gap.
        expect(plan.placements.map(p => p.order)).toEqual([0, 1])
    })

    test('a featured document with no measurements is never matched', () => {
        const plan = planFeaturedOrder([featured('image.png')], [archive('content:2025/Op A/I/a.jpg', SHOT)])

        const [placement] = plan.placements
        expect(placement.target).toBe('self')
        if (placement.target !== 'self') throw new Error('unreachable')
        expect(placement.reason).toBe('unmeasured')
    })

    /* A zero is a failed probe, not a photograph. Grouping on it would match
       every unreadable record to every other unreadable record. */
    test('a zero byte count or dimension counts as no measurement at all', () => {
        const broken: FeaturedCandidate = { id: id(), file: 'broken.jpg', bytes: 0, width: 0, height: 0 }
        const plan = planFeaturedOrder([broken], [{ id: id(), key: 'content:2025/Op A/I/a.jpg', bytes: 0, width: 0, height: 0 }])

        const [placement] = plan.placements
        expect(placement.target).toBe('self')
        if (placement.target !== 'self') throw new Error('unreachable')
        expect(placement.reason).toBe('unmeasured')
    })
})
