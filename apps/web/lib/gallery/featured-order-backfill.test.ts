import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient, ObjectId } from 'mongodb'
import type { Collection, Db as MongoDb } from 'mongodb'

import { backfillFeaturedOrder } from './featured-order-backfill'

/**
 * The database half of the featured-rail backfill.
 *
 * `planFeaturedOrder` decides which document gets each rail slot and is tested
 * exhaustively next door in featured-order.test.ts — none of that is repeated
 * here. What this pins is everything the plan does NOT cover: which documents
 * are loaded in the first place, the guard that refuses to renumber a curated
 * rail, and that a write touches `featuredOrder` and nothing else.
 *
 * Against a real mongod, because two of those three are Mongo queries and a
 * fixture imitating `$regex`/`$exists` would be testing the imitation.
 *
 * It exists as a module rather than living in the script because a button in
 * the J4 console runs the same migration, and the two must not be able to
 * disagree about the guard.
 */

let mongod: MongoMemoryServer
let client: MongoClient
let db: MongoDb
let media: Collection<GalleryMedia>

beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    client = new MongoClient(mongod.getUri())
    await client.connect()
    db = client.db('featuredorderbackfilltest')
    media = db.collection<GalleryMedia>('gallery_media')
    await media.createIndex({ storageKey: 1 }, { unique: true, sparse: true })
}, 120_000)

afterAll(async () => {
    await client?.close()
    await mongod?.stop()
})

beforeEach(async () => { await media.deleteMany({}) })

/** A live image with the three fields a match is made on. Everything else is
 *  the minimum GalleryMedia requires, so a test reads as the facts it varies. */
async function insert(doc: Partial<GalleryMedia> & { storageKey: string }): Promise<ObjectId> {
    const _id = new ObjectId()
    await media.insertOne({
        _id,
        kind: 'image',
        source: 'upload',
        status: 'live',
        tags: [],
        takenAt: null,
        ...doc,
    } as GalleryMedia)
    return _id
}

const orderOf = async (storageKey: string) =>
    (await media.findOne({ storageKey }))?.featuredOrder

describe('backfillFeaturedOrder', () => {
    test('a featured file with no archive twin is ordered on its own document', async () => {
        await insert({ storageKey: 'featured:alpha.png', bytes: 100, width: 10, height: 10 })

        const result = await backfillFeaturedOrder(media, { apply: true })

        expect(result.status).toBe('ok')
        expect(await orderOf('featured:alpha.png')).toBe(0)
    })

    test('a featured file matching an archive original orders the ARCHIVE document', async () => {
        await insert({ storageKey: 'featured:alpha.png', bytes: 100, width: 10, height: 10 })
        await insert({ storageKey: 'content:2021/Op Silent Ridge/alpha.png', bytes: 100, width: 10, height: 10 })

        await backfillFeaturedOrder(media, { apply: true })

        expect(await orderOf('content:2021/Op Silent Ridge/alpha.png')).toBe(0)
        expect(await orderOf('featured:alpha.png')).toBeUndefined()
    })

    test('a dry run reports the plan and writes nothing', async () => {
        await insert({ storageKey: 'featured:alpha.png', bytes: 100, width: 10, height: 10 })

        const result = await backfillFeaturedOrder(media, { apply: false })

        if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`)
        expect(result.placements).toHaveLength(1)
        expect(result.modifiedCount).toBeNull()
        expect(await orderOf('featured:alpha.png')).toBeUndefined()
    })

    test('refuses to run when any document already carries featuredOrder', async () => {
        await insert({ storageKey: 'featured:alpha.png', bytes: 100, width: 10, height: 10 })
        await insert({ storageKey: 'content:2021/Op Silent Ridge/curated.png', featuredOrder: 7 })

        const result = await backfillFeaturedOrder(media, { apply: true })

        expect(result).toEqual({ status: 'already-ordered', ordered: 1 })
        expect(await orderOf('featured:alpha.png')).toBeUndefined()
    })

    test('a second run is refused, so a curated rail is never renumbered', async () => {
        await insert({ storageKey: 'featured:alpha.png', bytes: 100, width: 10, height: 10 })
        await backfillFeaturedOrder(media, { apply: true })

        const second = await backfillFeaturedOrder(media, { apply: true })

        expect(second.status).toBe('already-ordered')
    })

    test('reports no-featured when the indexer has not written any featured: document', async () => {
        await insert({ storageKey: 'content:2021/Op Silent Ridge/alpha.png', bytes: 100, width: 10, height: 10 })

        const result = await backfillFeaturedOrder(media, { apply: true })

        expect(result).toEqual({ status: 'no-featured' })
    })

    test('writes featuredOrder and leaves every other field alone', async () => {
        await insert({ storageKey: 'featured:alpha.png', bytes: 100, width: 10, height: 10 })
        await insert({
            storageKey: 'content:2021/Op Silent Ridge/alpha.png',
            bytes: 100, width: 10, height: 10,
            caption: 'the one with the helicopter',
            tags: ['infantry'],
        })

        await backfillFeaturedOrder(media, { apply: true })

        const archive = await media.findOne({ storageKey: 'content:2021/Op Silent Ridge/alpha.png' })
        expect(archive?.caption).toBe('the one with the helicopter')
        expect(archive?.tags).toEqual(['infantry'])
        expect(archive?.storageKey).toBe('content:2021/Op Silent Ridge/alpha.png')
    })

    test('a not-live featured document is left out and counted', async () => {
        await insert({ storageKey: 'featured:alpha.png', bytes: 100, width: 10, height: 10 })
        await insert({ storageKey: 'featured:pending.png', status: 'pending', bytes: 200, width: 20, height: 20 })

        const result = await backfillFeaturedOrder(media, { apply: true })

        if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`)
        expect(result.featuredCount).toBe(1)
        expect(result.notLive).toBe(1)
        expect(await orderOf('featured:pending.png')).toBeUndefined()
    })

    test('a not-live archive image is never handed a rail slot', async () => {
        await insert({ storageKey: 'featured:alpha.png', bytes: 100, width: 10, height: 10 })
        await insert({ storageKey: 'content:2021/Op Silent Ridge/alpha.png', status: 'pending', bytes: 100, width: 10, height: 10 })

        await backfillFeaturedOrder(media, { apply: true })

        expect(await orderOf('content:2021/Op Silent Ridge/alpha.png')).toBeUndefined()
        expect(await orderOf('featured:alpha.png')).toBe(0)
    })

    test('a video is never matched, so a poster byte count cannot claim a slot', async () => {
        await insert({ storageKey: 'featured:alpha.png', bytes: 100, width: 10, height: 10 })
        await insert({ storageKey: 'content:2021/Op Silent Ridge/clip.mp4', kind: 'video', bytes: 100, width: 10, height: 10 })

        await backfillFeaturedOrder(media, { apply: true })

        expect(await orderOf('content:2021/Op Silent Ridge/clip.mp4')).toBeUndefined()
        expect(await orderOf('featured:alpha.png')).toBe(0)
    })

    test('a legacy: key is a match candidate, since it is the old spelling of content:', async () => {
        await insert({ storageKey: 'featured:alpha.png', bytes: 100, width: 10, height: 10 })
        await insert({ storageKey: 'legacy:2021/Op Silent Ridge/alpha.png', bytes: 100, width: 10, height: 10 })

        await backfillFeaturedOrder(media, { apply: true })

        expect(await orderOf('legacy:2021/Op Silent Ridge/alpha.png')).toBe(0)
    })

    test('the rail is contiguous from 0 however the buckets fell', async () => {
        for (const file of ['a.png', 'b.png', 'c.png']) {
            await insert({ storageKey: `featured:${file}`, bytes: 100, width: 10, height: 10 })
        }
        /* All three share one fingerprint, so the single archive twin is
           ambiguous against every one of them and nothing is handed over — the
           point being that the rail still comes out 0,1,2 with no hole. */
        await insert({ storageKey: 'content:2021/Op Silent Ridge/a.png', bytes: 100, width: 10, height: 10 })

        const result = await backfillFeaturedOrder(media, { apply: true })

        if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`)
        const ordered = await media.find({ featuredOrder: { $exists: true } }).toArray()
        expect(ordered.map(d => d.featuredOrder).sort((x, y) => x! - y!)).toEqual([0, 1, 2])
        expect(result.modifiedCount).toBe(3)
    })
})
