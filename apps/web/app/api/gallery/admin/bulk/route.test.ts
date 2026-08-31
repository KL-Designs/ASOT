import { describe, test, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'

/**
 * The bulk move is the documented remedy for an item whose `operationId` and
 * folder facets have come apart — so it must not be a way of causing one.
 *
 * It was. `relocateMedia` returns early for a document with no `storageKey`,
 * and an embed never has one, so the loop wrote `operationId`, called
 * relocateMedia (which did nothing), and counted the item as changed while
 * `year`, `operation`, `opLabel` and `takenAt` still named the operation the
 * item had just been moved away from. The public facet rail groups on
 * `operation`, so the item stayed under its old operation forever, and
 * reconcile is structurally blind to it: rule 4 only inspects documents whose
 * storageKey starts with `content:`/`legacy:`.
 *
 * Every fixture here uses an UNDATED operation on purpose. `operationFacets`
 * resolves an undated operation without listing any directory, so this suite
 * never reads the developer's real storage/gallery tree — which the route,
 * unlike a lib function, gives no way to point elsewhere.
 */

type Doc = Record<string, unknown>

/** `vi.hoisted`, because vi.mock's factory is hoisted above every other
 *  statement in the file and may only reach state hoisted with it. */
const state = vi.hoisted((): { docs: Record<string, Doc>, operations: Doc[] } => ({ docs: {}, operations: [] }))

vi.mock('@/lib/mongo', () => ({
    default: {
        galleryMedia: {
            async findOne(filter: { _id: ObjectId }) {
                return state.docs[filter._id.toString()] ?? null
            },
            async updateOne(filter: { _id: ObjectId }, update: { $set?: Doc, $unset?: Record<string, ''> }) {
                const doc = state.docs[filter._id.toString()]
                if (!doc) return {}
                Object.assign(doc, update.$set ?? {})
                for (const k of Object.keys(update.$unset ?? {})) delete doc[k]
                return {}
            },
        },
        operations: {
            async findOne(filter: { _id: ObjectId }) {
                return state.operations.find(o => o._id instanceof ObjectId && o._id.equals(filter._id)) ?? null
            },
        },
    },
}))
vi.mock('@/lib/discord', () => ({
    default: { fetchMe: async () => ({ id: '1', username: 'reviewer', globalName: null, guild: null }) },
}))
vi.mock('@/lib/orbat/hasPermission', () => ({ hasPermission: async () => true }))
vi.mock('@/lib/logAction', () => ({ logAction: async () => {} }))

const { POST } = await import('./route')

const OP_ID = new ObjectId('6a8000000000000000000001')
const EMBED_ID = new ObjectId('6a9380f11c4e5d2a77b31001')
const UPLOAD_ID = new ObjectId('6a9380f11c4e5d2a77b31002')

function post(body: unknown) {
    return POST(new NextRequest('http://localhost/api/gallery/admin/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }))
}

beforeEach(() => {
    state.operations.length = 0
    state.operations.push({ _id: OP_ID, title: 'OPERATION Undated' })

    for (const key of Object.keys(state.docs)) delete state.docs[key]
    state.docs[EMBED_ID.toString()] = {
        _id: EMBED_ID,
        source: 'youtube',
        operation: '3. Op Somewhere Else',
        opLabel: 'Op Somewhere Else',
        year: '2019',
        takenAt: new Date('2019-04-06T09:00:00Z'),
    }
    state.docs[UPLOAD_ID.toString()] = {
        _id: UPLOAD_ID,
        source: 'upload',
        storageKey: `media:${UPLOAD_ID}.jpg`,
        operation: '3. Op Somewhere Else',
        opLabel: 'Op Somewhere Else',
        year: '2019',
    }
})

describe('bulk move', () => {
    test('an embed gets every facet, not just its operationId', async () => {
        const res = await post({ action: 'move', ids: [EMBED_ID.toString()], operationId: OP_ID.toString() })
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ changed: 1, failed: [] })

        const doc = state.docs[EMBED_ID.toString()]
        expect(doc.operationId).toEqual(OP_ID)
        expect(doc.operation).toBe('OPERATION Undated')
        expect(doc.opLabel).toBe('OPERATION Undated')
        expect(doc.takenAt).toBeNull()
        // An undated operation has no year folder to sit in, and the stale
        // 2019 must not survive the move.
        expect('year' in doc).toBe(false)
    })

    test('moving an embed to Unknown clears the operation it came from', async () => {
        state.docs[EMBED_ID.toString()].operationId = OP_ID

        await post({ action: 'move', ids: [EMBED_ID.toString()], operationId: 'unknown' })

        const doc = state.docs[EMBED_ID.toString()]
        expect('operationId' in doc).toBe(false)
        expect('operation' in doc).toBe(false)
        expect('opLabel' in doc).toBe(false)
        expect('year' in doc).toBe(false)
        expect(doc.takenAt).toBeNull()
    })

    /* The other half of the single-producer property: an item WITH bytes is
       relocateMedia's to decide, and this route must write nothing but the id
       for it. relocateMedia finds no file behind the fixture's key and returns
       without writing anything, which is exactly the observation this test
       wants — had the route also applied the facets, they would be here. */
    test('an upload is left for relocateMedia — only the operationId is written here', async () => {
        await post({ action: 'move', ids: [UPLOAD_ID.toString()], operationId: OP_ID.toString() })

        const doc = state.docs[UPLOAD_ID.toString()]
        expect(doc.operationId).toEqual(OP_ID)
        expect(doc.operation).toBe('3. Op Somewhere Else')
        expect(doc.opLabel).toBe('Op Somewhere Else')
    })

    test('an id with no document is reported, not counted as changed', async () => {
        const gone = new ObjectId('6a9380f11c4e5d2a77b31003')

        const res = await post({ action: 'move', ids: [gone.toString(), EMBED_ID.toString()], operationId: OP_ID.toString() })
        const body: { changed: number, failed: { id: string }[] } = await res.json()

        expect(body.changed).toBe(1)
        expect(body.failed).toHaveLength(1)
        expect(body.failed[0].id).toBe(gone.toString())
    })
})
