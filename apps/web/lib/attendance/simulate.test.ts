/**
 * The dev-only attendance simulator. It writes to a real roster, so the
 * invariants the board depends on matter as much here as anywhere: a member
 * cannot be in two positions, and somebody who said no cannot be in one.
 */
import { describe, test, expect } from 'vitest'
import { buildRoster, viewRoster, type OrbatSnapshotPosition } from './roster'
import { mulberry32, simulateAttendance } from './simulate'

/** A plausible little ORBAT: two sections of four in one platoon, one in another. */
function positions(): OrbatSnapshotPosition[] {
    const make = (
        category: string, sectionTitle: string, sectionOrder: number, holders: (string | null)[],
    ) => holders.map((userId, i) => ({
        category, sectionTitle, role: `Role ${i}`, roleId: null,
        userId, sectionOrder, positionOrder: i,
    }))

    return [
        ...make('platoon11', '1-1 Alpha', 1, ['u-a1', 'u-a2', 'u-a3', null]),
        ...make('platoon11', '1-1 Bravo', 2, ['u-b1', 'u-b2', null, null]),
        ...make('support', '1-3 Echo', 1, ['u-e1', 'u-e2', 'u-e3', null]),
    ]
}

const sim = (seed = 1, reservists = ['u-r1', 'u-r2', 'u-r3', 'u-r4']) =>
    simulateAttendance({
        roster: buildRoster(positions()),
        reservists,
        rand: mulberry32(seed),
    })

describe('simulateAttendance', () => {
    test('is deterministic for a given seed', () => {
        expect(sim(7)).toEqual(sim(7))
    })

    test('different seeds produce different outcomes', () => {
        // Otherwise "generate again" would be a no-op and the button would look broken.
        const seeds = [1, 2, 3, 4, 5].map(n => JSON.stringify(sim(n).roster))
        expect(new Set(seeds).size).toBeGreaterThan(1)
    })

    test('nobody ends up in two positions at once', () => {
        const held = sim().roster.map(s => s.occupantUserId).filter(Boolean)
        expect(held.length).toBe(new Set(held).size)
    })

    test('nobody who declined is left standing in a position', () => {
        const result = sim()
        const declined = Object.entries(result.rsvp)
            .filter(([, answer]) => answer === 'not_attending')
            .map(([userId]) => userId)

        for (const userId of declined) {
            expect(result.roster.some(s => s.occupantUserId === userId)).toBe(false)
        }
    })

    test('an occupant is either attending, or reserved in their own position', () => {
        // A holder who has not replied stays pencilled into their own position
        // — that is what "awaiting" is, and the snapshot puts them there. What
        // must never happen is an occupant who answered no.
        const result = sim()
        for (const slot of result.roster) {
            const occupant = slot.occupantUserId
            if (!occupant) continue
            const answer = result.rsvp[occupant]
            if (answer === undefined) expect(slot.homeUserId).toBe(occupant)
            else expect(answer).toBe('attending')
        }
    })

    test('produces every outcome the board can draw', () => {
        // The point of the tool: a board with one state missing does not
        // exercise the thing you generated data to look at. Sampling several
        // seeds because any single run may legitimately miss a rare one.
        const states = new Set<string>()
        for (let seed = 1; seed <= 25; seed++) {
            const r = simulateAttendance({
                roster: buildRoster(positions()),
                reservists: ['u-r1', 'u-r2', 'u-r3', 'u-r4'],
                rand: mulberry32(seed),
            })
            for (const v of viewRoster(r.roster, { rsvp: r.rsvp, rsvpClosed: false })) states.add(v.state)
        }
        expect(states).toContain('held')
        expect(states).toContain('awaiting')
        expect(states).toContain('declined')
        expect(states).toContain('backfilled')
        expect(states).toContain('open')
    })

    test('a reservist filling in is in somebody else’s section, never their own', () => {
        // A reservist has no home position at all, so every placement of one is
        // a backfill by definition — this guards the simulator from inventing a
        // home for them.
        const result = sim()
        for (const slot of result.roster) {
            const occupant = slot.occupantUserId
            if (!occupant?.startsWith('u-r')) continue
            expect(slot.homeUserId).not.toBe(occupant)
        }
    })

    test('leaves some people in the pool, with and without a preference', () => {
        const result = sim()
        const placed = new Set(result.roster.map(s => s.occupantUserId).filter(Boolean))
        const inPool = Object.keys(result.rsvp)
            .filter(u => result.rsvp[u] === 'attending' && !placed.has(u))
        expect(inPool.length).toBeGreaterThan(0)
    })

    test('never invents a preference for a section that does not exist', () => {
        const result = sim()
        const sections = new Set(result.roster.map(s => s.sectionTitle))
        for (const pref of Object.values(result.preferences)) {
            if (pref.section) expect(sections.has(pref.section)).toBe(true)
        }
    })

    test('does not mutate the roster it was handed', () => {
        const roster = buildRoster(positions())
        const before = JSON.stringify(roster)
        simulateAttendance({ roster, reservists: ['u-r1'], rand: mulberry32(3) })
        expect(JSON.stringify(roster)).toBe(before)
    })
})

describe('mulberry32', () => {
    test('returns the same sequence for the same seed', () => {
        const a = mulberry32(42)
        const b = mulberry32(42)
        expect([a(), a(), a()]).toEqual([b(), b(), b()])
    })

    test('stays within [0, 1)', () => {
        const r = mulberry32(9)
        for (let i = 0; i < 200; i++) {
            const n = r()
            expect(n).toBeGreaterThanOrEqual(0)
            expect(n).toBeLessThan(1)
        }
    })
})
