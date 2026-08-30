import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { relocateMedia } from '@/lib/gallery/relocate'

/**
 * Fix round 1's finding: `resolveOperation()` (the submit `POST`, below) used
 * to write `operation`/`opLabel` straight off the operation document, the
 * same bug operationFields() (submissions/[id]/route.test.ts) had. It matters
 * more here — an uploaded file's operation/opLabel are provisional and get
 * overwritten by relocateMedia at accept, but an embed has no bytes for
 * relocateMedia to ever touch, so whatever resolveOperation() writes at
 * submit time is what the embed carries forever. This pins the concrete
 * defect the coordinator traced: a photo and a YouTube link submitted for the
 * same operation must end up tagged with the exact same `operation`/`opLabel`
 * string, or the public facet rail renders one operation as two entries.
 *
 * Importing route.ts pulls in `@/lib/mongo` and `@/lib/discord` at module
 * scope, both of which connect to something real as a side effect of being
 * imported — mocked to inert stand-ins below; `resolveOperation()` itself
 * never touches either mock since every test supplies its own `deps`.
 */
vi.mock('@/lib/mongo', () => ({ default: {} }))
vi.mock('@/lib/discord', () => ({ default: {} }))

const { resolveOperation } = await import('./route')

const OP_ID = new ObjectId('6a8000000000000000000001')
const UPLOAD_ID = new ObjectId('6a9380f11c4e5d2a77b31099')

let root: string
let contentDir: string
let mediaDir: string

/** `as never`, matching relocate.test.ts's own fixture: WithId<Operation> has
 *  ~20 required fields no test here needs, and this stand-in only ever
 *  carries the two (title, date) both resolveOperation() and relocateMedia
 *  read. */
function operationsFixture(ops: Record<string, unknown>[]) {
    return {
        async findOne(filter: { _id: ObjectId }) {
            return (ops.find(o => (o._id as ObjectId).equals(filter._id)) ?? null) as never
        },
    }
}

/** resolveOperation() never calls deps.media — resolveOperationFolder() only
 *  reads deps.operations and deps.contentDir — but RelocateDeps requires
 *  `media` structurally, so a stand-in that is never invoked is supplied. */
function unusedMediaStub() {
    return {
        async findOne() { return null },
        async updateOne() { return {} },
    }
}

/** A minimal stand-in for the media collection relocateMedia touches,
 *  mirroring relocate.test.ts's own deps(). */
function mediaFixture(docs: Record<string, Record<string, unknown>>) {
    return {
        async findOne(filter: { _id: ObjectId }) {
            return (docs[filter._id.toString()] ?? null) as never
        },
        async updateOne(filter: { _id: ObjectId }, update: { $set?: Record<string, unknown>, $unset?: Record<string, ''> }) {
            const doc = docs[filter._id.toString()]
            Object.assign(doc, update.$set ?? {})
            for (const k of Object.keys(update.$unset ?? {})) delete doc[k]
            return {}
        },
    }
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'asot-submit-embed-'))
    contentDir = join(root, 'content')
    mediaDir = join(root, 'media')
    mkdirSync(contentDir, { recursive: true })
    mkdirSync(mediaDir, { recursive: true })
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

describe('resolveOperation agrees with relocateMedia', () => {
    test('an accepted embed and an accepted upload from the same operation end up with the same operation and opLabel', async () => {
        const ops = [{ _id: OP_ID, title: 'OPERATION Silent Ridge — Sat', date: new Date('2021-08-14T09:00:00Z') }]

        // The embed: resolveOperation() at submit time is the ONLY writer
        // that will ever touch its operation/opLabel — relocateMedia skips
        // embeds entirely (they have no storageKey), so nothing corrects
        // this later.
        const embedFields = await resolveOperation(OP_ID.toString(), {
            contentDir,
            media: unusedMediaStub(),
            operations: operationsFixture(ops),
        })

        // The upload: relocateMedia is the writer, run against the same disk
        // state (no folder exists yet for this operation either way) —
        // exactly what happens in production when a reviewer accepts the
        // photo without ever having accepted the embed first.
        writeFileSync(join(mediaDir, `${UPLOAD_ID}.jpg`), 'BYTES')
        const docs = {
            [UPLOAD_ID.toString()]: {
                _id: UPLOAD_ID,
                storageKey: `media:${UPLOAD_ID}.jpg`,
                authorName: 'Koda',
                operationId: OP_ID,
            } as Record<string, unknown>,
        }
        await relocateMedia(
            { contentDir, mediaDir, media: mediaFixture(docs), operations: operationsFixture(ops) },
            UPLOAD_ID,
        )
        const uploadDoc = docs[UPLOAD_ID.toString()]

        expect(embedFields.operation).toBe(uploadDoc.operation)
        expect(embedFields.opLabel).toBe(uploadDoc.opLabel)
        expect(embedFields.operation).toBe('1. Op Silent Ridge')
        expect(embedFields.opLabel).toBe('Op Silent Ridge')
    })

    test('an operation with no date: still agrees, both keep the raw title and no year', async () => {
        const ops = [{ _id: OP_ID, title: 'OPERATION Undated' }]

        const embedFields = await resolveOperation(OP_ID.toString(), {
            contentDir,
            media: unusedMediaStub(),
            operations: operationsFixture(ops),
        })

        writeFileSync(join(mediaDir, `${UPLOAD_ID}.jpg`), 'BYTES')
        const docs = {
            [UPLOAD_ID.toString()]: {
                _id: UPLOAD_ID,
                storageKey: `media:${UPLOAD_ID}.jpg`,
                authorName: 'Koda',
                operationId: OP_ID,
            } as Record<string, unknown>,
        }
        await relocateMedia(
            { contentDir, mediaDir, media: mediaFixture(docs), operations: operationsFixture(ops) },
            UPLOAD_ID,
        )
        const uploadDoc = docs[UPLOAD_ID.toString()]

        expect(embedFields.operation).toBe('OPERATION Undated')
        expect(embedFields.operation).toBe(uploadDoc.operation)
        expect(embedFields.opLabel).toBe(uploadDoc.opLabel)
        expect(embedFields.year).toBeUndefined()
        expect('year' in uploadDoc).toBe(false)
    })

    test('"unknown" leaves every field absent', async () => {
        expect(await resolveOperation('unknown', {
            contentDir, media: unusedMediaStub(), operations: operationsFixture([]),
        })).toEqual({})
    })
})
