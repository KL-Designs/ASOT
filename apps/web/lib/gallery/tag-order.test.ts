import { describe, test, expect } from 'vitest'

import { planTagReorder, byTagOrder, type OrderableTag } from './tag-order'

/**
 * The tag vocabulary editor's drag, pinned.
 *
 * This logic used to sit inline in GalleryTagsTab.onDragEnd, where nothing
 * could import it — the reason review finding C5 recorded the whole of tasks
 * 6 and 7 as untested. It decides which documents get a PATCH, so the two
 * things worth pinning are that it renumbers the sequence a multi-position
 * drag actually produces, and that it writes nothing for a row that did not
 * move.
 *
 * Pure: no database, no dnd-kit. The component keeps the parts that need
 * either — optimistic state and the fetch fan-out.
 */

type Tag = OrderableTag & { label?: string, count?: number }

const active = (id: string, order: number): Tag => ({ id, order, retired: false })
const retired = (id: string, order: number): Tag => ({ id, order, retired: true })

/** The vocabulary as the tab holds it: four active tags, already normalised. */
const FOUR: Tag[] = [active('a', 0), active('b', 1), active('c', 2), active('d', 3)]

const orderOf = (tags: Tag[], id: string) => tags.find(t => t.id === id)?.order

describe('planTagReorder', () => {
    test('dragging a tag down renumbers the run it passed', () => {
        const plan = planTagReorder(FOUR, 'a', 'c')
        expect(plan).not.toBeNull()
        if (!plan) return

        // a moves from 0 to 2, so b and c each shuffle up one.
        expect(orderOf(plan.tags, 'b')).toBe(0)
        expect(orderOf(plan.tags, 'c')).toBe(1)
        expect(orderOf(plan.tags, 'a')).toBe(2)
        expect(orderOf(plan.tags, 'd')).toBe(3)
    })

    test('only the rows that moved are written', () => {
        const plan = planTagReorder(FOUR, 'a', 'c')
        if (!plan) throw new Error('expected a plan')

        // d never moved: a PATCH for it would write the value already
        // stored, and every one of those is a round trip the tab pays for
        // on every drag.
        expect(plan.writes.map(w => w.id).sort()).toEqual(['a', 'b', 'c'])
        expect(plan.writes.find(w => w.id === 'a')?.order).toBe(2)
    })

    test('dragging a tag up renumbers the run it displaced', () => {
        const plan = planTagReorder(FOUR, 'd', 'b')
        if (!plan) throw new Error('expected a plan')

        expect(orderOf(plan.tags, 'a')).toBe(0)
        expect(orderOf(plan.tags, 'd')).toBe(1)
        expect(orderOf(plan.tags, 'b')).toBe(2)
        expect(orderOf(plan.tags, 'c')).toBe(3)
        expect(plan.writes.map(w => w.id).sort()).toEqual(['b', 'c', 'd'])
    })

    test('a drag that moves nothing is null, not an empty plan', () => {
        // Dropped on itself. Null so the caller leaves its state alone
        // rather than re-rendering and re-fetching for nothing.
        expect(planTagReorder(FOUR, 'b', 'b')).toBeNull()
    })

    test('a stale row id is refused rather than reordering the wrong tag', () => {
        // The list can refresh under an in-flight drag; an id that is no
        // longer in it must not be resolved to index -1 and spliced.
        expect(planTagReorder(FOUR, 'zz', 'c')).toBeNull()
        expect(planTagReorder(FOUR, 'a', 'zz')).toBeNull()
    })

    test('a retired tag is not a drop target', () => {
        const tags = [...FOUR, retired('r', 9)]
        expect(planTagReorder(tags, 'a', 'r')).toBeNull()
    })

    test('retired tags are renumbered out of the active range', () => {
        // The C7 failure: POST assigns order = countDocuments(), which
        // counts retired tags, so a retired tag routinely carries an order
        // inside the active range — here r sits on 1, the same value b has.
        // Restoring it while two documents claim 1 leaves the tab and the
        // public facet rail free to order the pair differently.
        const tags = [active('a', 0), active('b', 1), active('c', 2), retired('r', 1)]
        const plan = planTagReorder(tags, 'a', 'c')
        if (!plan) throw new Error('expected a plan')

        const orders = plan.tags.map(t => t.order).sort((x, y) => x - y)
        expect(orders).toEqual([0, 1, 2, 3])
        expect(orderOf(plan.tags, 'r')).toBe(3)
        expect(plan.writes).toContainEqual({ id: 'r', order: 3 })
    })

    test('every tag survives the plan exactly once', () => {
        const tags = [...FOUR, retired('r', 7), retired('s', 8)]
        const plan = planTagReorder(tags, 'd', 'a')
        if (!plan) throw new Error('expected a plan')

        expect(plan.tags.map(t => t.id).sort()).toEqual(['a', 'b', 'c', 'd', 'r', 's'])
    })

    test('the caller’s array and rows are left untouched', () => {
        // The component renders from this array until it swaps in the plan;
        // mutating it in place would move rows before the writes are sent.
        const tags = FOUR.map(t => ({ ...t }))
        const before = tags.map(t => `${t.id}:${t.order}`)
        planTagReorder(tags, 'a', 'd')
        expect(tags.map(t => `${t.id}:${t.order}`)).toEqual(before)
    })

    test('fields the tab renders are carried through', () => {
        // The plan replaces the tab's whole tag state, so a tag that loses
        // its label or its usage count on the way through would blank the
        // row the moment it is dropped.
        const tags: Tag[] = [
            { id: 'a', order: 0, retired: false, label: 'Air', count: 12 },
            { id: 'b', order: 1, retired: false, label: 'Boats', count: 3 },
        ]
        const plan = planTagReorder(tags, 'a', 'b')
        if (!plan) throw new Error('expected a plan')

        expect(plan.tags.find(t => t.id === 'a')).toMatchObject({ label: 'Air', count: 12, order: 1 })
    })
})

describe('byTagOrder', () => {
    test('two tags sharing an order always sort the same way round', () => {
        // Mongo's order between equal sort keys is unspecified, so the
        // server sorts { order: 1, _id: 1 }. This is the client half of that
        // agreement: without it the same colliding pair can render in one
        // order in the tab and the other in the facet rail.
        const x: Tag = active('x', 1)
        const y: Tag = active('y', 1)
        expect([x, y].sort(byTagOrder).map(t => t.id)).toEqual(['x', 'y'])
        expect([y, x].sort(byTagOrder).map(t => t.id)).toEqual(['x', 'y'])
    })

    test('order still wins over id', () => {
        const zero: Tag = active('z', 0)
        const one: Tag = active('a', 1)
        expect([one, zero].sort(byTagOrder).map(t => t.id)).toEqual(['z', 'a'])
    })
})
