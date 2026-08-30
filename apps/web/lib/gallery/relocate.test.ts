import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { relocateMedia, resolveOperationFolder, type RelocateDeps } from './relocate'

const OP_ID = new ObjectId('6a8000000000000000000001')
const MEDIA_ID = new ObjectId('6a9380f11c4e5d2a77b31099')

let contentDir: string
let root: string

/** A minimal stand-in for the two collections relocate touches. */
function deps(docs: Record<string, Record<string, unknown>>, ops: Record<string, unknown>[]): RelocateDeps & {
    docs: typeof docs
} {
    return {
        docs,
        contentDir,
        media: {
            async findOne(filter: { _id: ObjectId }) {
                return (docs[filter._id.toString()] ?? null) as never
            },
            async updateOne(filter: { _id: ObjectId }, update: { $set?: Record<string, unknown>, $unset?: Record<string, ''> }) {
                const doc = docs[filter._id.toString()]
                Object.assign(doc, update.$set ?? {})
                for (const k of Object.keys(update.$unset ?? {})) delete doc[k]
                return {}
            },
        },
        operations: {
            async findOne(filter: { _id: ObjectId }) {
                return (ops.find(o => (o._id as ObjectId).equals(filter._id)) ?? null) as never
            },
        },
    }
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'asot-relocate-'))
    contentDir = join(root, 'content')
    mkdirSync(contentDir, { recursive: true })
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

describe('resolveOperationFolder', () => {
    test('a null operation is Unknown, with no year', async () => {
        const d = deps({}, [])
        expect(await resolveOperationFolder(d, null)).toEqual({ year: null, operation: null })
    })

    // The common case, and the reason normalizeKey exists: the operation is
    // titled per session day, the folder is per weekend and abbreviated.
    test('reuses an existing folder whose label matches the operation title', async () => {
        mkdirSync(join(contentDir, '2021', '4. Op Silent Ridge'), { recursive: true })
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Silent Ridge \u2014 Sat', date: new Date('2021-08-14T09:00:00Z') }])

        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: '2021', operation: '4. Op Silent Ridge' })
    })

    test('creates the next numbered folder name when nothing matches', async () => {
        mkdirSync(join(contentDir, '2021', '1. Op Armoured Spearhead'), { recursive: true })
        mkdirSync(join(contentDir, '2021', '7. Op Copper Ridge'), { recursive: true })
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Brand New \u2014 Sun', date: new Date('2021-11-02T09:00:00Z') }])

        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: '2021', operation: '8. Op Brand New' })
    })

    test('a year with no folders yet starts at 1', async () => {
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION First \u2014 Sat', date: new Date('2027-01-09T09:00:00Z') }])
        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: '2027', operation: '1. Op First' })
    })

    test('an operation with no date cannot be placed in a year, so it is Unknown', async () => {
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Undated' }])
        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: null, operation: null })
    })
})

describe('relocateMedia', () => {
    test('moves the file, renames it, and updates the document', async () => {
        const flat = join(root, 'media')
        mkdirSync(flat, { recursive: true })
        writeFileSync(join(flat, `${MEDIA_ID}.jpg`), 'BYTES')

        mkdirSync(join(contentDir, '2021', '4. Op Silent Ridge'), { recursive: true })

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID,
                storageKey: `media:${MEDIA_ID}.jpg`,
                caption: 'Danger close',
                authorName: 'Koda',
                operationId: OP_ID,
            } as Record<string, unknown>,
        }
        const d = deps(docs, [{ _id: OP_ID, title: 'OPERATION Silent Ridge \u2014 Sat', date: new Date('2021-08-14T09:00:00Z') }])
        // The flat source lives outside contentDir, so point the resolver at it.
        const result = await relocateMedia({ ...d, mediaDir: flat }, MEDIA_ID)

        const expected = `2021/4. Op Silent Ridge/Koda \u2014 Danger close [${MEDIA_ID}].jpg`
        expect(result).toEqual({ from: `media:${MEDIA_ID}.jpg`, to: `content:${expected}` })

        // Moved, not copied.
        expect(existsSync(join(flat, `${MEDIA_ID}.jpg`))).toBe(false)
        expect(readFileSync(join(contentDir, '2021', '4. Op Silent Ridge', `Koda \u2014 Danger close [${MEDIA_ID}].jpg`), 'utf8')).toBe('BYTES')

        const doc = docs[MEDIA_ID.toString()]
        expect(doc.storageKey).toBe(`content:${expected}`)
        expect(doc.year).toBe('2021')
        expect(doc.operation).toBe('4. Op Silent Ridge')
        expect(doc.takenAt).toEqual(new Date('2021-08-14T09:00:00Z'))
    })

    test('an item with no operation lands in Unknown, and a stale takenAt is cleared', async () => {
        const flat = join(root, 'media')
        mkdirSync(flat, { recursive: true })
        writeFileSync(join(flat, `${MEDIA_ID}.jpg`), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID, storageKey: `media:${MEDIA_ID}.jpg`, authorName: 'Reaper',
                // Left over from a previous operation link. operationFields()
                // (app/api/gallery/submissions/[id]/route.ts) always nulls
                // takenAt on its Unknown branch, so relocateMedia must too —
                // otherwise the tile would keep sorting/grouping on a date
                // from an operation it is no longer assigned to.
                takenAt: new Date('2020-01-01T00:00:00Z'),
            } as Record<string, unknown>,
        }
        const d = deps(docs, [])
        const result = await relocateMedia({ ...d, mediaDir: flat }, MEDIA_ID)

        expect(result?.to).toBe(`content:Unknown/Reaper [${MEDIA_ID}].jpg`)
        expect(existsSync(join(contentDir, 'Unknown', `Reaper [${MEDIA_ID}].jpg`))).toBe(true)
        expect(docs[MEDIA_ID.toString()].takenAt).toBeNull()
    })

    test('relocating something already in the right place is a no-op, not a delete', async () => {
        const dir = join(contentDir, 'Unknown')
        mkdirSync(dir, { recursive: true })
        const name = `Reaper [${MEDIA_ID}].jpg`
        writeFileSync(join(dir, name), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID, storageKey: `content:Unknown/${name}`, authorName: 'Reaper',
            } as Record<string, unknown>,
        }
        const result = await relocateMedia(deps(docs, []), MEDIA_ID)

        expect(result).toBeNull()
        expect(readFileSync(join(dir, name), 'utf8')).toBe('BYTES')
    })

    test('a document whose file is missing is left alone and reported as null', async () => {
        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID, storageKey: `media:${MEDIA_ID}.jpg`, authorName: 'Ghost',
            } as Record<string, unknown>,
        }
        const d = deps(docs, [])
        await expect(relocateMedia({ ...d, mediaDir: join(root, 'media') }, MEDIA_ID)).resolves.toBeNull()
        // The key must NOT have been rewritten to point somewhere with no file.
        expect(docs[MEDIA_ID.toString()].storageKey).toBe(`media:${MEDIA_ID}.jpg`)
    })
})
