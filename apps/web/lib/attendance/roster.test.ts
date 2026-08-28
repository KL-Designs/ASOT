/**
 * The attendance board renders entirely from this model, so anything the board
 * can draw wrong is decided here. Pure — the stage and the RSVP answers are
 * passed in rather than read, the same way phases.ts takes its clock.
 */
import { describe, test, expect } from 'vitest'
import {
    assignSlot, autoFill, buildRoster, derivePool, orderPositions, snapshotCategories, viewRoster,
    type OrbatSnapshotPosition, type PoolMember, type RosterContext, type RosterSlot, type SlotState,
} from './roster'

const pos = (over: Partial<OrbatSnapshotPosition> = {}): OrbatSnapshotPosition => ({
    category: 'platoon11',
    sectionTitle: '1-1 Alpha',
    role: 'Rifleman',
    userId: null,
    roleId: null,
    sectionOrder: 1,
    positionOrder: 0,
    ...over,
})

describe('buildRoster', () => {
    test('turns each ORBAT position into a slot with its holder already in it', () => {
        const roster = buildRoster([
            pos({ role: 'Section Commander', roleId: 'r-sc', userId: 'u-hollis', positionOrder: 0 }),
            pos({ role: 'Rifleman', roleId: 'r-rfn', userId: null, positionOrder: 1 }),
        ])

        expect(roster).toEqual([
            {
                id: 'platoon11-1-0',
                category: 'platoon11',
                sectionTitle: '1-1 Alpha',
                role: 'Section Commander',
                roleId: 'r-sc',
                order: 0,
                homeUserId: 'u-hollis',
                occupantUserId: 'u-hollis',
            },
            {
                id: 'platoon11-1-1',
                category: 'platoon11',
                sectionTitle: '1-1 Alpha',
                role: 'Rifleman',
                roleId: 'r-rfn',
                order: 1,
                homeUserId: null,
                occupantUserId: null,
            },
        ])
    })

    test('a position with no role definition behind it still becomes a slot', () => {
        // Positions predate the Roles Manager, so some carry only the
        // denormalized name. The slot keeps the name and simply has no link.
        expect(buildRoster([pos({ role: 'Rifleman', roleId: null })])[0].roleId).toBe(null)
    })
})

// ── Slot states ───────────────────────────────────────────────────────────────

const alpha = (over: Partial<RosterSlot> = {}): RosterSlot => ({
    id: 'platoon11-1-0',
    category: 'platoon11',
    sectionTitle: '1-1 Alpha',
    role: 'Rifleman',
    roleId: null,
    order: 0,
    homeUserId: null,
    occupantUserId: null,
    ...over,
})

const ctx = (over: Partial<RosterContext> = {}): RosterContext => ({
    rsvp: {},
    rsvpClosed: false,
    ...over,
})

/** The state of the first slot, which is what every test below asserts on. */
function stateOf(roster: RosterSlot[], c: RosterContext = ctx()): SlotState {
    return viewRoster(roster, c)[0].state
}

describe('viewRoster — slot states', () => {
    test("a member in their own slot who said yes is holding it", () => {
        const slot = alpha({ homeUserId: 'u-vance', occupantUserId: 'u-vance' })
        expect(stateOf([slot], ctx({ rsvp: { 'u-vance': 'attending' } }))).toBe('held')
    })

    test('a member in their own slot who has not answered is awaiting', () => {
        const slot = alpha({ homeUserId: 'u-vance', occupantUserId: 'u-vance' })
        expect(stateOf([slot])).toBe('awaiting')
    })

    test('awaiting becomes lapsed once RSVP has closed', () => {
        const slot = alpha({ homeUserId: 'u-vance', occupantUserId: 'u-vance' })
        expect(stateOf([slot], ctx({ rsvpClosed: true }))).toBe('lapsed')
    })

    test('a member said no, so the slot is declined and remembers whose it was', () => {
        const slot = alpha({ homeUserId: 'u-okafor', occupantUserId: null })
        const view = viewRoster([slot], ctx({ rsvp: { 'u-okafor': 'not_attending' } }))[0]
        expect(view.state).toBe('declined')
        expect(view.vacatedBy).toBe('u-okafor')
    })

    test('a home member playing elsewhere leaves their own slot released', () => {
        const home = alpha({ id: 'a', homeUserId: 'u-hollis', occupantUserId: null })
        const away = alpha({ id: 'b', sectionTitle: '1-1 Bravo', occupantUserId: 'u-hollis' })
        const view = viewRoster([home, away], ctx({ rsvp: { 'u-hollis': 'attending' } }))[0]
        expect(view.state).toBe('released')
        expect(view.vacatedBy).toBe('u-hollis')
    })

    test('someone else in a slot is a backfill, whoever it belongs to', () => {
        const slot = alpha({ homeUserId: 'u-okafor', occupantUserId: 'u-nakamura' })
        expect(stateOf([slot])).toBe('backfilled')
    })

    test('a position vacant in the ORBAT and unclaimed is simply open', () => {
        expect(stateOf([alpha()])).toBe('open')
    })

    test('a decline empties the slot even if the occupant was never cleared', () => {
        // Derivation wins over a stale write: a member who answered no is not in
        // the slot, whatever the stored occupant says. Without this a missed
        // write leaves a member visibly holding a position they declined.
        const slot = alpha({ homeUserId: 'u-okafor', occupantUserId: 'u-okafor' })
        expect(stateOf([slot], ctx({ rsvp: { 'u-okafor': 'not_attending' } }))).toBe('declined')
    })
})

describe('viewRoster — availability', () => {
    test('a reserved slot is not available, because that is what reserving means', () => {
        const slot = alpha({ homeUserId: 'u-vance', occupantUserId: 'u-vance' })
        expect(viewRoster([slot], ctx())[0].available).toBe(false)
    })

    test('the same slot frees up the moment RSVP closes', () => {
        const slot = alpha({ homeUserId: 'u-vance', occupantUserId: 'u-vance' })
        expect(viewRoster([slot], ctx({ rsvpClosed: true }))[0].available).toBe(true)
    })

    test('held and backfilled slots are taken', () => {
        const held = alpha({ id: 'a', homeUserId: 'u-vance', occupantUserId: 'u-vance' })
        const back = alpha({ id: 'b', homeUserId: 'u-okafor', occupantUserId: 'u-nakamura' })
        const view = viewRoster([held, back], ctx({ rsvp: { 'u-vance': 'attending' } }))
        expect(view.map(v => v.available)).toEqual([false, false])
    })

    test('open, declined and released slots can all be filled', () => {
        const open = alpha({ id: 'a' })
        const declined = alpha({ id: 'b', homeUserId: 'u-okafor' })
        const released = alpha({ id: 'c', homeUserId: 'u-hollis' })
        const away = alpha({ id: 'd', occupantUserId: 'u-hollis' })
        const view = viewRoster([open, declined, released, away], ctx({
            rsvp: { 'u-okafor': 'not_attending', 'u-hollis': 'attending' },
        }))
        expect(view.slice(0, 3).map(v => v.available)).toEqual([true, true, true])
    })
})

// ── Assignment ────────────────────────────────────────────────────────────────

/** Two slots in Alpha and one in Bravo, all vacant in the ORBAT. */
const threeSlots = (): RosterSlot[] => [
    alpha({ id: 'a1', role: 'Rifleman', order: 0 }),
    alpha({ id: 'a2', role: 'Medic', order: 1 }),
    alpha({ id: 'b1', sectionTitle: '1-1 Bravo', role: 'Marksman', order: 0 }),
]

const occupants = (roster: RosterSlot[]) =>
    Object.fromEntries(roster.map(s => [s.id, s.occupantUserId]))

describe('assignSlot', () => {
    test('puts a member into an empty slot', () => {
        const next = assignSlot(threeSlots(), 'a1', 'u-ivarsson')
        expect(occupants(next)).toEqual({ a1: 'u-ivarsson', a2: null, b1: null })
    })

    test('a member can only be in one slot, so the old one empties', () => {
        const roster = assignSlot(threeSlots(), 'a1', 'u-ivarsson')
        const next = assignSlot(roster, 'b1', 'u-ivarsson')
        expect(occupants(next)).toEqual({ a1: null, a2: null, b1: 'u-ivarsson' })
    })

    test('dropping onto an occupied slot swaps the two members', () => {
        // Refusing the drop would make staff do this in two moves, with
        // somebody parked nowhere in between. Swapping is what they meant.
        let roster = assignSlot(threeSlots(), 'a1', 'u-ivarsson')
        roster = assignSlot(roster, 'b1', 'u-quiroga')
        const next = assignSlot(roster, 'a1', 'u-quiroga')
        expect(occupants(next)).toEqual({ a1: 'u-quiroga', a2: null, b1: 'u-ivarsson' })
    })

    test('a member arriving from the pool displaces the occupant to the pool', () => {
        const roster = assignSlot(threeSlots(), 'a1', 'u-ivarsson')
        const next = assignSlot(roster, 'a1', 'u-bhandari')
        expect(occupants(next)).toEqual({ a1: 'u-bhandari', a2: null, b1: null })
    })

    test('assigning null clears the slot', () => {
        const roster = assignSlot(threeSlots(), 'a1', 'u-ivarsson')
        expect(occupants(assignSlot(roster, 'a1', null))).toEqual({ a1: null, a2: null, b1: null })
    })

    test('an unknown slot id changes nothing', () => {
        const roster = threeSlots()
        expect(assignSlot(roster, 'nope', 'u-ivarsson')).toEqual(roster)
    })

    test('never mutates the roster it was given', () => {
        const roster = threeSlots()
        assignSlot(roster, 'a1', 'u-ivarsson')
        expect(occupants(roster)).toEqual({ a1: null, a2: null, b1: null })
    })

    test('re-assigning a member to the slot they already hold is a no-op', () => {
        const roster = assignSlot(threeSlots(), 'a1', 'u-ivarsson')
        expect(occupants(assignSlot(roster, 'a1', 'u-ivarsson'))).toEqual(occupants(roster))
    })
})

// ── Pool ──────────────────────────────────────────────────────────────────────

const member = (userId: string, over: Partial<PoolMember> = {}): PoolMember => ({
    userId, preferredSection: null, preferredRole: null, ...over,
})

describe('derivePool', () => {
    test('lists members who are available but not in a slot', () => {
        const roster = assignSlot(threeSlots(), 'a1', 'u-ivarsson')
        const pool = derivePool(roster, [member('u-ivarsson'), member('u-bhandari')])
        expect(pool.map(p => p.userId)).toEqual(['u-bhandari'])
    })

    test('a full-timer waiting for another section shows the slot they gave up', () => {
        // The case that makes the pool card say "Released 1-1 Alpha · Sect Comd":
        // one person, a home position they are not in, and a preference elsewhere.
        const roster = [
            alpha({ id: 'a1', role: 'Section Commander', homeUserId: 'u-hollis', occupantUserId: null }),
            alpha({ id: 'b1', sectionTitle: '1-1 Bravo' }),
        ]
        const [entry] = derivePool(roster, [member('u-hollis', { preferredSection: '1-1 Bravo' })])
        expect(entry).toEqual({
            userId: 'u-hollis',
            preferredSection: '1-1 Bravo',
            preferredRole: null,
            releasedSlotId: 'a1',
        })
    })

    test('a member with no home position anywhere has released nothing', () => {
        const [entry] = derivePool(threeSlots(), [member('u-bhandari')])
        expect(entry.releasedSlotId).toBe(null)
    })
})

// ── Auto-fill ─────────────────────────────────────────────────────────────────

describe('autoFill', () => {
    test('places a member into the section they asked for', () => {
        const roster = threeSlots()
        const result = autoFill(roster, [member('u-quiroga', { preferredSection: '1-1 Bravo' })], ctx())
        expect(result.placed).toEqual([{ userId: 'u-quiroga', slotId: 'b1' }])
    })

    test('places a member into the role they asked for, in any section', () => {
        const result = autoFill(threeSlots(), [member('u-thackeray', { preferredRole: 'Marksman' })], ctx())
        expect(result.placed).toEqual([{ userId: 'u-thackeray', slotId: 'b1' }])
    })

    test('a stated preference is served before a member who will take anything', () => {
        // Order matters: if the easy-going member is placed first they take the
        // only Medic slot, and the person who actually asked for it gets nothing.
        const roster = [alpha({ id: 'a2', role: 'Medic', order: 1 })]
        const result = autoFill(roster, [
            member('u-ivarsson'),
            member('u-nakamura', { preferredRole: 'Medic' }),
        ], ctx())
        expect(result.placed).toEqual([{ userId: 'u-nakamura', slotId: 'a2' }])
        expect(result.unplaced).toEqual(['u-ivarsson'])
    })

    test('never fills a slot that is reserved for someone who has not answered', () => {
        const roster = [alpha({ id: 'a1', homeUserId: 'u-vance', occupantUserId: 'u-vance' })]
        const result = autoFill(roster, [member('u-ivarsson')], ctx())
        expect(result.placed).toEqual([])
        expect(result.unplaced).toEqual(['u-ivarsson'])
    })

    test('fills that same slot once RSVP has closed and the reservation lapses', () => {
        const roster = [alpha({ id: 'a1', homeUserId: 'u-vance', occupantUserId: 'u-vance' })]
        const result = autoFill(roster, [member('u-ivarsson')], ctx({ rsvpClosed: true }))
        expect(result.placed).toEqual([{ userId: 'u-ivarsson', slotId: 'a1' }])
    })

    test('returns a roster with everyone placed in it', () => {
        const result = autoFill(threeSlots(), [member('u-a'), member('u-b')], ctx())
        expect(occupants(result.roster)).toEqual({ a1: 'u-a', a2: 'u-b', b1: null })
    })

    test('reports who it could not place', () => {
        const roster = [alpha({ id: 'a1' })]
        const result = autoFill(roster, [member('u-a'), member('u-b')], ctx())
        expect(result.unplaced).toEqual(['u-b'])
    })

    test('a preference that cannot be met still gets a slot rather than nothing', () => {
        const result = autoFill(threeSlots(), [member('u-q', { preferredSection: '1-3 Echo' })], ctx())
        expect(result.placed).toEqual([{ userId: 'u-q', slotId: 'a1' }])
    })
})

// ── Snapshot selection ────────────────────────────────────────────────────────

describe('snapshotCategories', () => {
    test('takes the assigned platoons, in the unit’s own order', () => {
        expect(snapshotCategories(['support', 'companyHQ', 'platoon11']))
            .toEqual(['companyHQ', 'platoon11', 'support', 'gamemaster'])
    })

    test('always includes the game masters, assigned or not', () => {
        // Zeus staff play every operation and are never one of the platoons
        // someone ticks, so leaving them out would leave the board missing the
        // one section that is always there.
        expect(snapshotCategories([])).toEqual(['gamemaster'])
    })

    test('does not duplicate the game masters when they are assigned explicitly', () => {
        expect(snapshotCategories(['gamemaster'])).toEqual(['gamemaster'])
    })

    test('ignores a category the unit does not have', () => {
        expect(snapshotCategories(['platoon11', 'nonsense'])).toEqual(['platoon11', 'gamemaster'])
    })
})

describe('orderPositions', () => {
    test('orders by category first, then section, then position', () => {
        const ordered = orderPositions([
            pos({ category: 'platoon11', sectionOrder: 2, positionOrder: 1, role: 'c' }),
            pos({ category: 'companyHQ', sectionOrder: 9, positionOrder: 0, role: 'a' }),
            pos({ category: 'platoon11', sectionOrder: 2, positionOrder: 0, role: 'b' }),
        ], ['companyHQ', 'platoon11'])

        expect(ordered.map(p => p.role)).toEqual(['a', 'b', 'c'])
    })

    test('drops positions from categories not in the snapshot', () => {
        const ordered = orderPositions([
            pos({ category: 'platoon11', role: 'keep' }),
            pos({ category: 'platoon12', role: 'drop' }),
        ], ['platoon11'])

        expect(ordered.map(p => p.role)).toEqual(['keep'])
    })

    test('keeps vacant positions — an empty slot is the point', () => {
        // The old attendance list only held people, which is exactly why it
        // could not show a section that was three riflemen short.
        const ordered = orderPositions([pos({ userId: null })], ['platoon11'])
        expect(ordered).toHaveLength(1)
    })
})
