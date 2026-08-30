import { describe, test, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'

/**
 * Reassigning an operation on an item with no bytes.
 *
 * This route guards its relocateMedia call on `source === 'upload' &&
 * storageKey`, correctly, because relocateMedia has no file to move otherwise
 * — but nothing then derived the facets that hang off the operation, so an
 * embed came out of the PATCH with `operationId` naming the new operation and
 * `year`/`operation`/`opLabel`/`takenAt` still naming the old one. The public
 * facet rail groups on `operation`, so the item never moved as far as anyone
 * looking at the gallery was concerned, and reconcile could not report it:
 * rule 4 only inspects documents whose storageKey starts with
 * `content:`/`legacy:`, and an embed has no storageKey at all.
 *
 * The operation fixture is UNDATED on purpose: operationFacets resolves an
 * undated operation without listing any directory, so this suite never reads
 * the developer's real storage/gallery tree, which the route gives no way to
 * point elsewhere.
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
    default: { fetchMe: async () => ({ id: '1', username: 'manager', globalName: null, guild: null }) },
}))
vi.mock('@/lib/orbat/hasPermission', () => ({ hasPermission: async () => true }))
vi.mock('@/lib/logAction', () => ({ logAction: async () => {} }))

const { PATCH } = await import('./route')

const OP_ID = new ObjectId('6a8000000000000000000001')
const EMBED_ID = new ObjectId('6a9380f11c4e5d2a77b31001')
const UPLOAD_ID = new ObjectId('6a9380f11c4e5d2a77b31002')

function patch(id: ObjectId, body: unknown) {
    return PATCH(
        new NextRequest(`http://localhost/api/gallery/admin/media/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: id.toString() }) },
    )
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

describe('PATCH — reassigning the operation', () => {
    test('an embed gets every facet the operation decides, not just the id', async () => {
        const res = await patch(EMBED_ID, { operationId: OP_ID.toString() })
        expect(res.status).toBe(200)

        const doc = state.docs[EMBED_ID.toString()]
        expect(doc.operationId).toEqual(OP_ID)
        expect(doc.operation).toBe('OPERATION Undated')
        expect(doc.opLabel).toBe('OPERATION Undated')
        expect(doc.takenAt).toBeNull()
        expect('year' in doc).toBe(false)
    })

    test('clearing an embed’s operation clears the facets with it', async () => {
        state.docs[EMBED_ID.toString()].operationId = OP_ID

        await patch(EMBED_ID, { operationId: null })

        const doc = state.docs[EMBED_ID.toString()]
        expect('operationId' in doc).toBe(false)
        expect('operation' in doc).toBe(false)
        expect('opLabel' in doc).toBe(false)
        expect('year' in doc).toBe(false)
        expect(doc.takenAt).toBeNull()
    })

    /* The other half of the single-producer property: an item WITH bytes is
       relocateMedia's to decide, and this route writes nothing but the id for
       it. relocateMedia finds no file behind the fixture's key and returns
       without writing anything — had the route applied the facets too, they
       would be here. */
    test('an upload is left for relocateMedia — only the operationId is written here', async () => {
        await patch(UPLOAD_ID, { operationId: OP_ID.toString() })

        const doc = state.docs[UPLOAD_ID.toString()]
        expect(doc.operationId).toEqual(OP_ID)
        expect(doc.operation).toBe('3. Op Somewhere Else')
        expect(doc.opLabel).toBe('Op Somewhere Else')
    })

    test('an operation that does not exist is rejected, and nothing is written', async () => {
        const res = await patch(EMBED_ID, { operationId: new ObjectId().toString() })

        expect(res.status).toBe(400)
        expect(state.docs[EMBED_ID.toString()].operation).toBe('3. Op Somewhere Else')
        expect('operationId' in state.docs[EMBED_ID.toString()]).toBe(false)
    })
})
