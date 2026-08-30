import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { relocateMedia, resolveOperationFolder, operationYear, type RelocateDeps } from './relocate'

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

    /* Final review, important 5: the archive's two parenthetical folders sit
       beside operations whose titles do not repeat the parenthetical.
       Matching only on the full key could not see either, so accepting a
       submission minted a DUPLICATE numbered folder next to the one already
       holding that operation's photographs, and the public facet rail showed
       the operation twice. */
    test('reuses a folder whose label carries a parenthetical the operation title lacks', async () => {
        mkdirSync(join(contentDir, '2021', '9. Op Copper Ridge (Lanze Verde)'), { recursive: true })
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Copper Ridge \u2014 Sat', date: new Date('2021-05-15T09:00:00Z') }])

        expect(await resolveOperationFolder(d, OP_ID))
            .toEqual({ year: '2021', operation: '9. Op Copper Ridge (Lanze Verde)' })
    })

    test('reuses the MW Training (CAG) folder for an operation titled MW Training', async () => {
        mkdirSync(join(contentDir, '2021', '12. MW Training (CAG)'), { recursive: true })
        const d = deps({}, [{ _id: OP_ID, title: 'MW Training', date: new Date('2021-06-19T09:00:00Z') }])

        expect(await resolveOperationFolder(d, OP_ID))
            .toEqual({ year: '2021', operation: '12. MW Training (CAG)' })
    })

    // The reason the tiers are ordered rather than merged: both folders are
    // real and unrelated, so the specific one must win its own operation.
    test('a parenthetical folder does not steal an operation that has a plain namesake folder', async () => {
        mkdirSync(join(contentDir, '2021', '9. Op Copper Ridge (Lanze Verde)'), { recursive: true })
        mkdirSync(join(contentDir, '2021', '10. Op Copper Ridge'), { recursive: true })
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Copper Ridge (Lanze Verde) \u2014 Sat', date: new Date('2021-05-15T09:00:00Z') }])

        expect(await resolveOperationFolder(d, OP_ID))
            .toEqual({ year: '2021', operation: '9. Op Copper Ridge (Lanze Verde)' })
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

    // year stays null — there is no date to file a year folder under — but
    // operation does not: operationFields() (submissions/[id]/route.ts) keeps
    // operation/opLabel set on its undated branch and unsets only year, so
    // this must too, or the same document disagrees depending on which path
    // touched it last.
    test('an operation with no date cannot be placed in a year, but the operation itself is kept', async () => {
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Undated' }])
        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: null, operation: 'OPERATION Undated' })
    })

    test('an operation dated right at the year boundary resolves by UTC, not local time', async () => {
        // 2025-12-31T23:30:00Z is still December in UTC but would already be
        // January in any timezone ahead of UTC — exactly the case
        // operationYear() exists to pin down.
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Boundary \u2014 Sun', date: new Date('2025-12-31T23:30:00Z') }])
        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: '2025', operation: '1. Op Boundary' })
    })
})

describe('operationYear', () => {
    // operationFields() (submissions/[id]/route.ts) calls this same function
    // rather than keeping its own getFullYear() — this pins the UTC behaviour
    // both sides depend on.
    test('reads the year in UTC, not the host process\'s local timezone', () => {
        expect(operationYear(new Date('2025-12-31T23:30:00Z'))).toBe('2025')
    })
})

describe('relocateMedia', () => {
    /* Mission is the facet relocate.ts and reconcile.ts disagreed about:
       relocate dropped it from the PATH when there was no operation but never
       unset the FIELD, so a legacy file reassigned to Unknown sat at
       "Unknown/…" while its document still claimed mission "I" — and the
       public facet rail filters on that field. relocate.test.ts had never
       covered mission at all, in either direction. */
    test('a legacy file keeps its mission folder when the operation is reassigned', async () => {
        const stage = join(contentDir, '2021', '4. Op Silent Ridge', 'I')
        mkdirSync(stage, { recursive: true })
        writeFileSync(join(stage, 'arma3_01.png'), 'BYTES')
        mkdirSync(join(contentDir, '2022', '9. Op Copper Ridge'), { recursive: true })

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID,
                storageKey: 'content:2021/4. Op Silent Ridge/I/arma3_01.png',
                mission: 'I',
                operationId: OP_ID,
            },
        }
        const d = deps(docs, [{ _id: OP_ID, title: 'OPERATION Copper Ridge \u2014 Sat', date: new Date('2022-03-05T09:00:00Z') }])

        const result = await relocateMedia(d, MEDIA_ID)

        expect(result?.to).toBe(`content:2022/9. Op Copper Ridge/I/${MEDIA_ID}.png`)
        expect(docs[MEDIA_ID.toString()].mission).toBe('I')
        expect(existsSync(join(contentDir, '2022', '9. Op Copper Ridge', 'I', `${MEDIA_ID}.png`))).toBe(true)
    })

    test('reassigning to Unknown unsets mission rather than leaving it behind', async () => {
        const stage = join(contentDir, '2021', '4. Op Silent Ridge', 'I')
        mkdirSync(stage, { recursive: true })
        writeFileSync(join(stage, 'arma3_02.png'), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID,
                storageKey: 'content:2021/4. Op Silent Ridge/I/arma3_02.png',
                mission: 'I',
                year: '2021',
                operation: '4. Op Silent Ridge',
            },
        }
        const d = deps(docs, [])

        const result = await relocateMedia(d, MEDIA_ID)

        // The bytes are at Unknown/, so the document must not still claim a
        // mission — exactly what reconcile.ts does for the same move.
        expect(result?.to).toBe(`content:Unknown/${MEDIA_ID}.png`)
        expect(docs[MEDIA_ID.toString()].mission).toBeUndefined()
        expect(docs[MEDIA_ID.toString()].year).toBeUndefined()
        expect(docs[MEDIA_ID.toString()].operation).toBeUndefined()
    })

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

    // The file still goes to Unknown/ — there is no date to file a year
    // folder under — but operation/opLabel survive, matching
    // operationFields()'s undated branch (item 3 of fix round 1).
    test('an operation that exists but has no date still lands in Unknown, with the operation preserved', async () => {
        const flat = join(root, 'media')
        mkdirSync(flat, { recursive: true })
        writeFileSync(join(flat, `${MEDIA_ID}.jpg`), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID, storageKey: `media:${MEDIA_ID}.jpg`, authorName: 'Reaper', operationId: OP_ID,
            } as Record<string, unknown>,
        }
        const d = deps(docs, [{ _id: OP_ID, title: 'OPERATION Undated' }])
        const result = await relocateMedia({ ...d, mediaDir: flat }, MEDIA_ID)

        expect(result?.to).toBe(`content:Unknown/Reaper [${MEDIA_ID}].jpg`)
        const doc = docs[MEDIA_ID.toString()]
        expect(doc.operation).toBe('OPERATION Undated')
        expect(doc.opLabel).toBe('OPERATION Undated')
        expect('year' in doc).toBe(false)
        expect(doc.takenAt).toBeNull()
    })

    // $set/$unset are built correctly and the fake's updateOne handles
    // $unset correctly (both already true) — but nothing exercised them
    // together against a document that actually HAD year/operation/opLabel
    // set beforehand, so a regression in either would go undetected (fix
    // round 1, item 1). `'x' in doc` rather than `doc.x` being undefined:
    // the field must be gone, not merely re-set to an undefined value that
    // would still satisfy a Mongo `$exists: true` query.
    test('reassigning an already-filed item to Unknown actually removes year, operation and opLabel', async () => {
        const flat = join(root, 'media')
        mkdirSync(flat, { recursive: true })
        writeFileSync(join(flat, `${MEDIA_ID}.jpg`), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID,
                storageKey: `media:${MEDIA_ID}.jpg`,
                authorName: 'Reaper',
                year: '2026',
                operation: '23. Op New Winter',
                opLabel: 'Op New Winter',
                takenAt: new Date('2026-02-01T00:00:00Z'),
                // No operationId: this is the "reassigned to Unknown" case.
            } as Record<string, unknown>,
        }
        const d = deps(docs, [])
        const result = await relocateMedia({ ...d, mediaDir: flat }, MEDIA_ID)

        expect(result?.to).toBe(`content:Unknown/Reaper [${MEDIA_ID}].jpg`)
        const doc = docs[MEDIA_ID.toString()]
        expect('year' in doc).toBe(false)
        expect('operation' in doc).toBe(false)
        expect('opLabel' in doc).toBe(false)
        expect(doc.takenAt).toBeNull()
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
