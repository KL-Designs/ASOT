import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient, type Db, type ObjectId } from 'mongodb'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'

/**
 * The migration is the sharp edge of this feature: it writes one document per
 * file across the whole archive, and then the gallery stops reading the disk.
 * The property that makes that safe is that running it twice is the same as
 * running it once — so that is what this asserts, against a real mongod and a
 * real folder tree, because both halves are what it could get wrong.
 */

let mongod: MongoMemoryServer
let client: MongoClient
let db: Db
let root: string
let atlanticShieldOpId: ObjectId

const SCRIPT = resolve(__dirname, '../../../../scripts/index-gallery.mjs')

function run() {
    execFileSync('node', [SCRIPT, '--apply'], {
        cwd: root,
        env: { ...process.env, MONGO_URI: mongod.getUri(), MONGO_DB: 'galleryindextest' },
        stdio: 'pipe',
    })
}

beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    client = new MongoClient(mongod.getUri())
    await client.connect()
    db = client.db('galleryindextest')

    // A miniature archive: two years, two operations (one numbered, one not),
    // two missions, four files — plus fixtures for the two fix-round findings:
    // a range-named year folder ("2022 - 2023", a real folder in production
    // storage), a year with no leading digits at all, an operation whose
    // title differs from its folder the way real data does (prefix, day
    // suffix, parenthetical), and a same-named operation from the wrong year
    // that the match must refuse.
    root = mkdtempSync(join(tmpdir(), 'asot-gallery-'))
    const content = join(root, 'storage', 'gallery', 'content')
    for (const dir of [
        join(content, '2025', '1. Op Black Hill', 'I'),
        join(content, '2025', '1. Op Black Hill', 'II'),
        join(content, '2026', 'Op Unnumbered', 'I'),
        join(content, '2022 - 2023', 'Op Range Test', 'I'),
        join(content, 'Undated', 'Op Something', 'I'),
        join(content, '2025', '18. Op Atlantic Shield (Test)', 'I'),
        join(content, '2025', '19. Op Ghost Town', 'I'),
    ]) mkdirSync(dir, { recursive: true })

    // A real 1x1 PNG, so the dimension probe has something to read.
    const PNG = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
    )
    writeFileSync(join(content, '2025', '1. Op Black Hill', 'I', 'a.png'), PNG)
    writeFileSync(join(content, '2025', '1. Op Black Hill', 'I', 'b.png'), PNG)
    writeFileSync(join(content, '2025', '1. Op Black Hill', 'II', 'c.png'), PNG)
    writeFileSync(join(content, '2026', 'Op Unnumbered', 'I', 'd.png'), PNG)
    writeFileSync(join(content, '2022 - 2023', 'Op Range Test', 'I', 'e.png'), PNG)
    writeFileSync(join(content, 'Undated', 'Op Something', 'I', 'g.png'), PNG)
    writeFileSync(join(content, '2025', '18. Op Atlantic Shield (Test)', 'I', 'h.png'), PNG)
    writeFileSync(join(content, '2025', '19. Op Ghost Town', 'I', 'i.png'), PNG)

    // Real operations are recorded per session day, abbreviated differently
    // than the gallery folder, and sometimes carry parenthetical context the
    // folder doesn't — this is what the normalised match has to see through.
    atlanticShieldOpId = (await db.collection('operations').insertOne({
        title: 'OPERATION Atlantic Shield — Sat',
        date: new Date(Date.UTC(2025, 5, 14)),
    })).insertedId

    // Same normalised key as the gallery's "19. Op Ghost Town" folder, but a
    // different year — the match must refuse this rather than borrow its date.
    await db.collection('operations').insertOne({
        title: 'OPERATION Ghost Town — Sat',
        date: new Date(Date.UTC(2024, 2, 1)),
    })
}, 120_000)

afterAll(async () => {
    await client?.close()
    await mongod?.stop()
    if (root) rmSync(root, { recursive: true, force: true })
})

describe('index-gallery', () => {
    test('indexes every file exactly once', () => {
        run()
        return expect(db.collection('gallery_media').countDocuments()).resolves.toBe(8)
    })

    test('running it again changes nothing', () => {
        run()
        return expect(db.collection('gallery_media').countDocuments()).resolves.toBe(8)
    })

    test('a re-run does not clobber what a reviewer edited', async () => {
        // $setOnInsert, not $set. A migrated item given a caption and tags must
        // survive the script being run again.
        await db.collection('gallery_media').updateOne(
            { storageKey: 'legacy:2025/1. Op Black Hill/I/a.png' },
            { $set: { caption: 'set by a reviewer', tags: ['funny'] } },
        )
        run()
        const doc = await db.collection('gallery_media').findOne({ storageKey: 'legacy:2025/1. Op Black Hill/I/a.png' })
        expect(doc?.caption).toBe('set by a reviewer')
        expect(doc?.tags).toEqual(['funny'])
    })

    test('every migrated item is live, authorless and untagged', async () => {
        const docs = await db.collection('gallery_media').find({}).toArray()
        for (const d of docs) {
            expect(d.status).toBe('live')
            expect(d.kind).toBe('image')
            expect(d.source).toBe('upload')
            expect(d.authorId).toBeUndefined()
            expect(d.up).toBe(0)
            expect(d.down).toBe(0)
            // No publishedAt — the NEW badge must not light up the whole
            // archive on the day this runs.
            expect(d.publishedAt).toBeUndefined()
        }
    })

    test('strips the ordering prefix into opLabel and keeps the raw folder', async () => {
        const doc = await db.collection('gallery_media').findOne({ storageKey: 'legacy:2025/1. Op Black Hill/I/a.png' })
        expect(doc?.operation).toBe('1. Op Black Hill')
        expect(doc?.opLabel).toBe('Op Black Hill')
        expect(doc?.year).toBe('2025')
        expect(doc?.mission).toBe('I')
    })

    test('falls back to January of the folder year when no operation matches', async () => {
        const doc = await db.collection('gallery_media').findOne({ storageKey: 'legacy:2026/Op Unnumbered/I/d.png' })
        expect(new Date(doc!.takenAt).getUTCFullYear()).toBe(2026)
        expect(new Date(doc!.takenAt).getUTCMonth()).toBe(0)
    })

    test('probes real dimensions off the file', async () => {
        const doc = await db.collection('gallery_media').findOne({ storageKey: 'legacy:2025/1. Op Black Hill/I/a.png' })
        expect(doc?.width).toBe(1)
        expect(doc?.height).toBe(1)
    })

    test('seeds the tag vocabulary once', async () => {
        const tags = await db.collection('gallery_tags').find({}).toArray()
        expect(tags).toHaveLength(15)
        expect(tags.map(t => t.slug)).toContain('rare-moment')
        expect(tags.every(t => t.retired === false)).toBe(true)
    })

    test('creates the unique index the idempotency depends on', async () => {
        const indexes = await db.collection('gallery_media').indexes()
        expect(indexes.find(i => i.name === 'storageKey_unique')?.unique).toBe(true)
    })

    // Fix round 1, finding 1: exact-string matching found 0 of 88 real
    // operation folders. matchKey() has to see through a prefix mismatch
    // ("Op" vs "OPERATION"), a day-of-week suffix the folder lacks, and a
    // parenthetical the operation title lacks, all at once.
    test('matches a folder to an operation despite prefix, day-suffix and parenthetical differences', async () => {
        const doc = await db.collection('gallery_media').findOne({ storageKey: 'legacy:2025/18. Op Atlantic Shield (Test)/I/h.png' })
        expect(doc?.operationId?.toString()).toBe(atlanticShieldOpId.toString())
        expect(new Date(doc!.takenAt).toISOString()).toBe(new Date(Date.UTC(2025, 5, 14)).toISOString())
    })

    // A normalised key can collide across years for two unrelated operations
    // of the same name. Borrowing the wrong one's date would be worse than no
    // match, so the match must be refused rather than accepted.
    test('refuses a normalised match when the matched operation is from a different year', async () => {
        const doc = await db.collection('gallery_media').findOne({ storageKey: 'legacy:2025/19. Op Ghost Town/I/i.png' })
        expect(doc?.operationId).toBeUndefined()
        // Falls back to the folder's own year, not the mismatched operation's.
        expect(new Date(doc!.takenAt).getUTCFullYear()).toBe(2025)
        expect(new Date(doc!.takenAt).getUTCMonth()).toBe(0)
    })

    // Fix round 1, finding 2: Number(year) on a folder like "2022 - 2023" is
    // NaN, and Date.UTC(NaN, 0, 1) silently becomes an Invalid Date rather
    // than throwing — 24% of the real archive lives under a folder shaped
    // like this. The fix reads the leading four digits instead, so this
    // folder recovers a real (if approximate) year rather than corrupting the
    // one field the gallery sorts by.
    test('reads the leading year out of a range-named folder instead of producing an Invalid Date', async () => {
        const doc = await db.collection('gallery_media').findOne({ storageKey: 'legacy:2022 - 2023/Op Range Test/I/e.png' })
        const takenAt = new Date(doc!.takenAt)
        expect(Number.isNaN(takenAt.getTime())).toBe(false)
        expect(takenAt.getUTCFullYear()).toBe(2022)
        expect(takenAt.getUTCMonth()).toBe(0)
    })

    // A year folder with no leading digits at all has nothing to fall back
    // to. Null, not a guess and not an Invalid Date — the gallery already
    // sorts undated media into its own group.
    test('leaves takenAt null when the year folder has no leading digits to read', async () => {
        const doc = await db.collection('gallery_media').findOne({ storageKey: 'legacy:Undated/Op Something/I/g.png' })
        expect(doc?.takenAt).toBeNull()
    })
})
