import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient, ObjectId } from 'mongodb'
import type { Collection, Db as MongoDb } from 'mongodb'

import { followRename } from './reorder'

/**
 * J5's Operations tab reorders a stage folder by renaming every file in it to
 * "0001_<name>". That predates the gallery having an index, and it silently
 * broke every storageKey in the folder — permanently, for a legacy file:
 * reconcile's rule 1 needs an `[id]` in the name and rule 2 needs the path to
 * match, so the file landed in `notIndexed`, the record in `missingFiles`, and
 * its caption, tags, author and votes were unreachable from either side.
 *
 * followRename() is exercised directly rather than through POST because
 * CONTENT_BASE is resolved from the working directory at module load — driving
 * the route would rename files in the developer's real archive. The renames
 * themselves are unchanged; what this pins is that the documents follow them.
 * It moved out of the route file into lib/gallery/reorder.ts because a route
 * may not export anything but its handlers: the extra export failed
 * `next build` while tsc, lint and this suite all passed.
 *
 * Against a real mongod, so the `$in` over the two key spellings is the
 * driver's own matching rather than a fixture's imitation of it.
 */

let mongod: MongoMemoryServer
let client: MongoClient
let db: MongoDb
let media: Collection<GalleryMedia>

beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    client = new MongoClient(mongod.getUri())
    await client.connect()
    db = client.db('reordertest')
    media = db.collection<GalleryMedia>('gallery_media')
    // The same unique index the migration creates — a rewrite that made two
    // documents claim one key has to fail here rather than in production.
    await media.createIndex({ storageKey: 1 }, { unique: true, sparse: true })
}, 120_000)

afterAll(async () => {
    await client?.close()
    await mongod?.stop()
})

beforeEach(async () => { await media.deleteMany({}) })

const keyOf = async (caption: string) =>
    (await media.findOne({ caption }))?.storageKey

describe('followRename', () => {
    test('a legacy file with no id in its name keeps its record', async () => {
        await media.insertOne({
            _id: new ObjectId(),
            storageKey: 'content:2021/4. Op Silent Ridge/I/arma3_01.png',
            caption: 'the one with the helicopter',
            kind: 'image', source: 'upload', status: 'live', tags: [],
            takenAt: null, up: 0, down: 0, createdAt: new Date(),
        })

        await followRename('2021', '4. Op Silent Ridge', 'I',
            [{ from: 'arma3_01.png', to: '0001_arma3_01.png' }], media)

        expect(await keyOf('the one with the helicopter'))
            .toBe('content:2021/4. Op Silent Ridge/I/0001_arma3_01.png')
    })

    test('a legacy:-spelled key is followed too, and lands as content:', async () => {
        await media.insertOne({
            _id: new ObjectId(),
            storageKey: 'legacy:2021/4. Op Silent Ridge/I/arma3_02.png',
            caption: 'indexed before the prefix rename',
            kind: 'image', source: 'upload', status: 'live', tags: [],
            takenAt: null, up: 0, down: 0, createdAt: new Date(),
        })

        await followRename('2021', '4. Op Silent Ridge', 'I',
            [{ from: 'arma3_02.png', to: '0001_arma3_02.png' }], media)

        expect(await keyOf('indexed before the prefix rename'))
            .toBe('content:2021/4. Op Silent Ridge/I/0001_arma3_02.png')
    })

    /* The reason the route follows the file at BOTH rename passes rather than
       rewriting once at the end: these two documents swap names, so a
       single-pass rewrite gives one of them a key the other still holds and
       the unique index rejects it. Driven here exactly as the route drives
       it — through the temporary names — so a future "simplification" back to
       one pass fails. */
    test('two files swapping names both keep their records', async () => {
        await media.insertMany([
            {
                _id: new ObjectId(),
                storageKey: 'content:2021/4. Op Silent Ridge/I/0001_a.png', caption: 'was first',
                kind: 'image', source: 'upload', status: 'live', tags: [],
                takenAt: null, up: 0, down: 0, createdAt: new Date(),
            },
            {
                _id: new ObjectId(),
                storageKey: 'content:2021/4. Op Silent Ridge/I/0002_b.png', caption: 'was second',
                kind: 'image', source: 'upload', status: 'live', tags: [],
                takenAt: null, up: 0, down: 0, createdAt: new Date(),
            },
        ])

        const steps = [
            { from: '0001_a.png', tmp: '__reorder_1_0', to: '0002_a.png' },
            { from: '0002_b.png', tmp: '__reorder_1_1', to: '0001_b.png' },
        ]
        await followRename('2021', '4. Op Silent Ridge', 'I',
            steps.map(s => ({ from: s.from, to: s.tmp })), media)
        await followRename('2021', '4. Op Silent Ridge', 'I',
            steps.map(s => ({ from: s.tmp, to: s.to })), media)

        expect(await keyOf('was first')).toBe('content:2021/4. Op Silent Ridge/I/0002_a.png')
        expect(await keyOf('was second')).toBe('content:2021/4. Op Silent Ridge/I/0001_b.png')
    })

    test('a file with no document at all is simply not matched', async () => {
        await expect(followRename('2021', '4. Op Silent Ridge', 'I',
            [{ from: 'never-indexed.png', to: '0001_never-indexed.png' }], media)).resolves.toBeUndefined()
        expect(await media.countDocuments()).toBe(0)
    })
})
