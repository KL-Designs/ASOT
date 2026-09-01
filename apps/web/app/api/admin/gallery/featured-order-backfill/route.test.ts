import { describe, test, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The route around the featured-rail backfill.
 *
 * The migration itself is tested against a real mongod in
 * `lib/gallery/featured-order-backfill.test.ts` — none of that is repeated
 * here, and the module is mocked so this suite is about the three things the
 * route actually owns: who may call it, that `apply` reaches the module
 * exactly as sent, and that a write is audited while a dry run is not.
 *
 * The last one matters more than it looks. The J4 modal runs the dry pass on
 * open, every time it opens; if that were logged, the audit trail for a
 * one-shot migration would fill with entries for runs that wrote nothing.
 */

const state = vi.hoisted(() => ({
    permitted: true,
    calls: [] as { apply: boolean }[],
    result: {} as Record<string, unknown>,
    logged: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/mongo', () => ({ default: { galleryMedia: {} } }))
vi.mock('@/lib/discord', () => ({
    default: {
        fetchMe: async () => {
            if (!state.permitted) throw new Error('no session')
            return { _id: '1', name: 'Koda', globalName: 'Koda' }
        },
        hasRoles: () => state.permitted,
    },
}))
vi.mock('@/lib/logs', () => ({
    logAction: async (entry: Record<string, unknown>) => { state.logged.push(entry) },
}))
vi.mock('@/lib/gallery/featured-order-backfill', () => ({
    backfillFeaturedOrder: async (_media: unknown, opts: { apply: boolean }) => {
        state.calls.push(opts)
        return state.result
    },
}))

const { POST } = await import('./route')

function post(body: unknown) {
    return POST(new NextRequest('http://localhost/api/admin/gallery/featured-order-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }))
}

const OK_DRY = { status: 'ok', featuredCount: 2, archiveCount: 9, notLive: 0, placements: [], modifiedCount: null }
const OK_APPLIED = { ...OK_DRY, modifiedCount: 2 }

beforeEach(() => {
    state.permitted = true
    state.calls = []
    state.logged = []
    state.result = OK_DRY
})

describe('POST /api/admin/gallery/featured-order-backfill', () => {
    test('runs a dry pass when apply is omitted', async () => {
        const res = await post({})

        expect(res.status).toBe(200)
        expect(state.calls).toEqual([{ apply: false }])
        expect(await res.json()).toMatchObject({ status: 'ok', modifiedCount: null })
    })

    test('writes only when apply is exactly true', async () => {
        state.result = OK_APPLIED

        await post({ apply: true })

        expect(state.calls).toEqual([{ apply: true }])
    })

    test('a truthy non-boolean apply does not trigger a write', async () => {
        await post({ apply: 'yes' })

        expect(state.calls).toEqual([{ apply: false }])
    })

    test('rejects a caller without J4', async () => {
        state.permitted = false

        const res = await post({ apply: true })

        expect([401, 403]).toContain(res.status)
        expect(state.calls).toEqual([])
    })

    test('audits a run that wrote', async () => {
        state.result = OK_APPLIED

        await post({ apply: true })

        expect(state.logged).toHaveLength(1)
        expect(state.logged[0]).toMatchObject({ action: 'gallery.featured.backfill' })
    })

    test('does not audit a dry run', async () => {
        await post({ apply: false })

        expect(state.logged).toEqual([])
    })

    test('does not audit an apply the guard refused', async () => {
        state.result = { status: 'already-ordered', ordered: 58 }

        const res = await post({ apply: true })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ status: 'already-ordered', ordered: 58 })
        expect(state.logged).toEqual([])
    })
})
