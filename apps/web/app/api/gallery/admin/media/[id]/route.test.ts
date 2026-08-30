import { describe, test, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'

/**
 * Reassigning an operation on an item with no bytes — and the narrower sibling
 * of the same defect, an item whose bytes are gone.
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
 * A `storageKey` being present is not proof its bytes exist — an upload the
 * Health view lists under missingFiles has one and no file, and this suite's
 * UPLOAD_ID fixture (deliberately, see below) creates none either. The same
 * fix covers both: relocateMedia returning null means "nothing to move," not
 * "nothing to write," and the route falls back to operationFacets() for the
 * four fields exactly as the embed branch does.
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

    /* The narrower sibling of the embed defect above: `doc.storageKey` being
       present is not proof the bytes behind it still exist. This fixture never
       creates a file for UPLOAD_ID (matching this suite's design of never
       touching the real storage/gallery tree — see the file header), so
       relocateMedia finds nothing to move and returns null without writing
       anything, exactly as it would for an upload the Health view lists under
       missingFiles. The route used to leave it there: operationId pointed at
       the new operation while year/operation/opLabel/takenAt still named the
       one it was reassigned away from. */
    test('an upload whose file is missing still gets the new operation\'s facets, not just its id', async () => {
        await patch(UPLOAD_ID, { operationId: OP_ID.toString() })

        const doc = state.docs[UPLOAD_ID.toString()]
        expect(doc.operationId).toEqual(OP_ID)
        expect(doc.operation).toBe('OPERATION Undated')
        expect(doc.opLabel).toBe('OPERATION Undated')
        expect(doc.takenAt).toBeNull()
        expect('year' in doc).toBe(false)
        // storageKey is untouched — relocateMedia's contract is to never point
        // a record at a path with no bytes behind it, even on this fallback.
        expect(doc.storageKey).toBe(`media:${UPLOAD_ID}.jpg`)
    })

    /* relocateMedia is still the sole writer when it actually succeeds — this
       suite cannot create the real file relocateMedia needs to exercise that
       branch (see the file header), but it can pin that the fallback above
       only fires when relocateMedia genuinely had nothing to do, not on every
       upload reassignment: a no-op caption-only edit must not touch the
       operation facets at all. */
    test('an upload edited without an operation change does not touch its facets', async () => {
        await patch(UPLOAD_ID, { caption: 'Renamed' })

        const doc = state.docs[UPLOAD_ID.toString()]
        expect(doc.operation).toBe('3. Op Somewhere Else')
        expect(doc.opLabel).toBe('Op Somewhere Else')
        expect(doc.year).toBe('2019')
    })

    test('an operation that does not exist is rejected, and nothing is written', async () => {
        const res = await patch(EMBED_ID, { operationId: new ObjectId().toString() })

        expect(res.status).toBe(400)
        expect(state.docs[EMBED_ID.toString()].operation).toBe('3. Op Somewhere Else')
        expect('operationId' in state.docs[EMBED_ID.toString()]).toBe(false)
    })
})
