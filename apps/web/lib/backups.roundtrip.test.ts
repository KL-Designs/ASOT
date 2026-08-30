/**
 * The disaster-recovery path, end to end, against the REAL restic binary:
 * back up → download a zip → wreck the live database and media → upload that
 * zip → everything comes back. Plus the same thing via revert.
 *
 * This one deliberately does not fake restic, because the bug it exists to
 * catch is not expressible against a fake. `restic restore` recreates the
 * snapshot's full original absolute path underneath the restore target, so a
 * snapshot taken on Windows (source path 'C:\Users\...\asot-db-dump') made
 * restic recreate a 'C:\Users' node, apply the real C:\Users ACL to it, and
 * then fail to set that directory's timestamp — "Access is denied", exit
 * fatal. Every download and every revert of a Windows-created snapshot broke
 * on it while the file data restored perfectly well. Only a real restic
 * against a real repo reproduces that; a stubbed child process cannot.
 *
 * It runs INSIDE the OS temp root on purpose — on Windows that keeps every
 * path under C:\Users, which is precisely the condition that failed. Do not
 * "fix" a failure here by relocating it to another drive; that hides the bug.
 * It does take its own unique subdirectory of that root, because DB_DUMP_DIR
 * is a single fixed path ('<os-temp>/asot-db-dump') and lib/backups.ts only
 * serialises access to it WITHIN one process — vitest runs each test file in
 * its own worker, so without this the workers wipe each other's dump mid-run.
 *
 * Skips (rather than fails) when the restic binary isn't present, so a fresh
 * clone that hasn't run scripts/ensure-restic.mjs yet still gets a green suite.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient } from 'mongodb'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync, createWriteStream } from 'fs'
import { rm } from 'fs/promises'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as NodeWebReadableStream } from 'stream/web'
import unzipper from 'unzipper'

const RESTIC_BIN = resolve(__dirname, '..', 'bin', process.platform === 'win32' ? 'restic.exe' : 'restic')
const hasRestic = existsSync(RESTIC_BIN)

/**
 * runGalleryReconcile() in backups.ts calls reconcile() with no `contentDir`
 * override, so — correctly, for production — it falls back to CONTENT_DIR in
 * lib/gallery/paths.ts: a fixed path.resolve('../../storage/gallery/content')
 * with NO environment override, unlike GALLERY_DIR here, which
 * BACKUPS_STORAGE_ROOT (set in beforeAll below) already redirects. Left
 * unmocked, every test in this file that restores the gallery part would have
 * reconcile() walk the real repository's storage/gallery/content tree —
 * thousands of real files on a populated checkout — instead of anything this
 * suite creates. Read-only, so nothing would be corrupted, but it is exactly
 * the cross-test isolation this file's BACKUPS_STORAGE_ROOT/tempRoot setup
 * exists to guarantee, and it would make the suite behave differently on a
 * machine with no archive.
 *
 * Mocking the module removes that side effect AND gives a spy for the pin
 * below: two tests assert reconcileMock was actually called after a gallery
 * restore, so deleting either call site in backups.ts turns an assertion red
 * instead of leaving the suite silently green. vi.hoisted() is required here
 * — vi.mock() factories run before this file's own top-level code, so a
 * factory that closes over a plain `const` declared below it would throw
 * "Cannot access before initialization".
 */
const { reconcileMock } = vi.hoisted(() => ({
    reconcileMock: vi.fn(async () => ({
        scanned: 0, matchedById: 0, matchedByPath: 0,
        relocated: [], notIndexed: [], missingFiles: [], failedProcessing: [],
        unreadable: 0, at: new Date(),
    })),
}))

vi.mock('./gallery/reconcile', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./gallery/reconcile')>()
    // Only `reconcile` is replaced. `acceptsRealCollections` is a
    // compile-time-only pin with nothing to fake — the real one, unused at
    // runtime, is left in place so any other future import of it still works.
    return { ...actual, reconcile: reconcileMock }
})

let mongod: MongoMemoryServer
let mongo: MongoClient
let storageRoot: string
let tempRoot: string
let backups: typeof import('./backups')

beforeAll(async () => {
    if (!hasRestic) return

    // Must happen before lib/backups.ts is imported: DB_DUMP_DIR is derived
    // from os.tmpdir() at module load. Still inside the OS temp tree (see the
    // file header) — just not shared with the other test workers.
    tempRoot = mkdtempSync(join(tmpdir(), 'asot-roundtrip-temp-'))
    process.env.TEMP = tempRoot
    process.env.TMP = tempRoot
    process.env.TMPDIR = tempRoot

    mongod = await MongoMemoryServer.create()
    process.env.MONGO_URI = mongod.getUri()
    process.env.MONGO_DB = 'asot-roundtrip'
    process.env.RESTIC_PASSWORD = 'roundtrip-test-password'
    process.env.RESTIC_PATH = RESTIC_BIN

    storageRoot = mkdtempSync(join(tmpdir(), 'asot-roundtrip-'))
    mkdirSync(join(storageRoot, 'gallery'), { recursive: true })
    mkdirSync(join(storageRoot, 'uploads'), { recursive: true })
    process.env.BACKUPS_STORAGE_ROOT = storageRoot

    mongo = new MongoClient(process.env.MONGO_URI)
    await mongo.connect()
    backups = await import('./backups')
}, 120000)

afterAll(async () => {
    await mongo?.close()
    await mongod?.stop()
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true }).catch(() => {})
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true }).catch(() => {})
})

describe.skipIf(!hasRestic)('real-restic disaster recovery', () => {
    // Cleared before every test so a call count asserted in one test can
    // never be satisfied by a call made during a previous one.
    beforeEach(() => { reconcileMock.mockClear() })

    const seed = async (marker: string) => {
        const db = mongo.db('asot-roundtrip')
        await db.collection('sentinel').deleteMany({})
        await db.collection('sentinel').insertOne({ marker })
        writeFileSync(join(storageRoot, 'gallery', 'photo.txt'), marker, 'utf-8')
        writeFileSync(join(storageRoot, 'uploads', 'doc.txt'), marker, 'utf-8')
    }

    const liveState = async () => ({
        db:      (await mongo.db('asot-roundtrip').collection('sentinel').findOne({}))?.marker,
        gallery: readFileSync(join(storageRoot, 'gallery', 'photo.txt'), 'utf-8'),
        uploads: readFileSync(join(storageRoot, 'uploads', 'doc.txt'), 'utf-8'),
    })

    test('a downloaded zip restores the database and media it captured', async () => {
        await seed('original')
        await backups.runAllBackups()
        expect((await backups.readStatus()).state).toBe('idle')

        const [point] = await backups.listBackups()
        expect(point.dbSnapshotId).toBeTruthy()
        expect(point.mediaSnapshotId).toBeTruthy()

        // Consumed exactly the way the route's response does — the zip is
        // produced as it is read and never exists as a file on the server.
        const zipPath = join(tempRoot, 'downloaded.zip')
        // The cast bridges the DOM ReadableStream the route returns and the
        // stream/web one Readable.fromWeb is typed against; they are the same
        // object at runtime.
        const webStream = await backups.openDownloadZipStream(point) as unknown as NodeWebReadableStream
        await pipeline(Readable.fromWeb(webStream), createWriteStream(zipPath))
        expect(existsSync(zipPath)).toBe(true)
        expect(statSync(zipPath).size).toBeGreaterThan(0)

        // The temp restore tree belongs to the stream and must be gone now
        // that it has drained. Polled: the cleanup runs from stream.finished()
        // and is not awaited by the reader.
        await vi.waitFor(() =>
            expect(readdirSync(tempRoot).filter(n => n.startsWith('asot-download-'))).toEqual([])
        )

        await seed('CORRUPTED')
        await backups.applyUploadedZip(zipPath)

        expect(await liveState()).toEqual({ db: 'original', gallery: 'original', uploads: 'original' })
        expect((await backups.readStatus()).state).toBe('idle')

        // The upload path must take a pre-restore safety backup before it
        // touches anything (issue #55 requirement 5).
        expect((await backups.listBackups()).some(p => p.isSafety)).toBe(true)

        await rm(zipPath, { force: true }).catch(() => {})
    }, 300000)

    test('a gallery-only download restores only the gallery', async () => {
        await seed('scoped-original')
        await backups.runAllBackups()
        const [point] = await backups.listBackups()

        const zipPath = join(tempRoot, 'gallery-only.zip')
        const stream = await backups.openDownloadZipStream(point, ['gallery']) as unknown as NodeWebReadableStream
        await pipeline(Readable.fromWeb(stream), createWriteStream(zipPath))

        // Nothing outside the requested part may be in the archive at all —
        // otherwise a "gallery only" restore could still carry a database.
        const { files } = await unzipper.Open.file(zipPath)
        expect(files.length).toBeGreaterThan(0)
        for (const f of files) expect(f.path).toMatch(/^gallery\//)

        await seed('CORRUPTED')
        await backups.applyUploadedZip(zipPath, ['gallery'])

        expect(await liveState()).toEqual({
            db: 'CORRUPTED',            // untouched, as asked
            gallery: 'scoped-original', // restored
            uploads: 'CORRUPTED',       // untouched, as asked
        })
    }, 300000)

    test('refuses to restore a part the archive does not contain', async () => {
        await seed('present')
        await backups.runAllBackups()
        const [point] = await backups.listBackups()

        const zipPath = join(tempRoot, 'gallery-only-2.zip')
        const stream = await backups.openDownloadZipStream(point, ['gallery']) as unknown as NodeWebReadableStream
        await pipeline(Readable.fromWeb(stream), createWriteStream(zipPath))

        await seed('CORRUPTED')
        // Asking for the database out of a gallery-only archive must fail
        // loudly: "restored nothing, successfully" is the exact failure this
        // whole code path is written to avoid.
        await expect(backups.applyUploadedZip(zipPath, ['database'])).rejects.toThrow(/contains no database/i)
        expect((await liveState()).db).toBe('CORRUPTED')
    }, 300000)

    test('revert restores a point in place', async () => {
        await seed('before-revert')
        await backups.runAllBackups()
        const [point] = await backups.listBackups()

        await seed('CORRUPTED')
        await backups.revertToPoint(point)

        expect(await liveState()).toEqual({ db: 'before-revert', gallery: 'before-revert', uploads: 'before-revert' })

        const status = await backups.readStatus()
        expect(status.state).toBe('idle')
        expect(status.error).toBeUndefined()

        // The pin for revertToPoint's call site — deliberately a separate
        // assertion from applyUploadedZip's, in a separate test, so neither
        // call site's coverage depends on the other one still being called.
        expect(reconcileMock).toHaveBeenCalledTimes(1)
    }, 300000)

    // A restore left the database clean (collections are dropped and reinserted)
    // but the media tree merged — copyDirRecursive() only ever writes, so a file
    // added after the backup survived a restore of it. The two halves of one
    // operation disagreed about what "restore" means.
    test('a clean restore removes media the backup does not contain', async () => {
        await seed('clean-original')
        await backups.runAllBackups()
        const [point] = await backups.listBackups()

        const stray = join(storageRoot, 'gallery', 'added-after-the-backup.txt')
        writeFileSync(stray, 'never in the backup', 'utf-8')

        await backups.revertToPoint(point, ['gallery'], { wipeMedia: true })

        expect(existsSync(stray)).toBe(false)
        expect(readFileSync(join(storageRoot, 'gallery', 'photo.txt'), 'utf-8')).toBe('clean-original')
    }, 300000)

    test('the default restore still merges, leaving newer files alone', async () => {
        await seed('merge-original')
        await backups.runAllBackups()
        const [point] = await backups.listBackups()

        const stray = join(storageRoot, 'gallery', 'kept-by-merge.txt')
        writeFileSync(stray, 'still here', 'utf-8')

        await backups.revertToPoint(point, ['gallery'])

        expect(readFileSync(stray, 'utf-8')).toBe('still here')
        expect(readFileSync(join(storageRoot, 'gallery', 'photo.txt'), 'utf-8')).toBe('merge-original')
    }, 300000)

    // The wipe is scoped to the parts being restored. Emptying a tree the
    // operator did not ask to restore would delete files with nothing queued
    // to put back.
    test('a clean gallery restore does not empty uploads', async () => {
        await seed('scoped-clean')
        await backups.runAllBackups()
        const [point] = await backups.listBackups()

        const strayUpload = join(storageRoot, 'uploads', 'not-my-part.txt')
        writeFileSync(strayUpload, 'survives', 'utf-8')

        await backups.revertToPoint(point, ['gallery'], { wipeMedia: true })

        expect(readFileSync(strayUpload, 'utf-8')).toBe('survives')
    }, 300000)

    test('an uploaded zip can also restore cleanly', async () => {
        await seed('zip-clean')
        await backups.runAllBackups()
        const [point] = await backups.listBackups()

        const zipPath = join(tempRoot, 'clean-restore.zip')
        const stream = await backups.openDownloadZipStream(point, ['gallery']) as unknown as NodeWebReadableStream
        await pipeline(Readable.fromWeb(stream), createWriteStream(zipPath))

        const stray = join(storageRoot, 'gallery', 'added-after-the-zip.txt')
        writeFileSync(stray, 'never in the zip', 'utf-8')

        await backups.applyUploadedZip(zipPath, ['gallery'], { wipeMedia: true })

        expect(existsSync(stray)).toBe(false)
        expect(readFileSync(join(storageRoot, 'gallery', 'photo.txt'), 'utf-8')).toBe('zip-clean')

        // The pin for applyUploadedZip's call site: this is the assertion
        // that turns red if `if (hasGallery) await runGalleryReconcile()` is
        // ever deleted from backups.ts. Without it, the whole reconcile-after-
        // restore feature could be removed and this suite would stay green.
        expect(reconcileMock).toHaveBeenCalledTimes(1)

        await rm(zipPath, { force: true }).catch(() => {})
    }, 300000)

    // Task 8 closes the loop: a downloaded backup, reorganised by hand in a
    // file manager and re-uploaded, has those moves read back into the
    // database without a human touching Health first — runGalleryReconcile()
    // in backups.ts calls reconcile() with exactly the ReconcileDeps built
    // here. The other two tests above prove backups.ts calls the real
    // reconcile(); this one proves what reconcile() actually does with a
    // moved file, which is the whole point of running it after a restore.
    //
    // Exercised directly against reconcile() rather than through
    // applyUploadedZip()/revertToPoint(): CONTENT_DIR (lib/gallery/paths.ts)
    // resolves from a fixed path.resolve('../../storage/gallery') at module
    // load and, unlike GALLERY_DIR in backups.ts, is never redirected by
    // BACKUPS_STORAGE_ROOT — so driving this through the real restore path in
    // this suite would walk the actual repository's storage/gallery/content
    // tree instead of this test's fixture. Calling reconcile() directly with
    // a contentDir override is the same thing reconcile.test.ts already does
    // for the same reason, and is the only safe way to point this at the
    // temp tree.
    //
    // vi.importActual() bypasses the vi.mock() above deliberately: that mock
    // exists so backups.ts's OWN calls never touch the real tree, but this
    // test needs the genuine implementation to prove the relocation logic
    // actually works, not a canned response.
    test('a file moved between folders in the zip keeps its record and takes the new operation', async () => {
        if (!hasRestic) return

        const { ObjectId } = await import('mongodb')
        const { reconcile } = await vi.importActual<typeof import('./gallery/reconcile')>('./gallery/reconcile')

        const id = new ObjectId()
        const contentDir = join(storageRoot, 'gallery', 'content')
        const name = `Koda — Danger close [${id.toString()}].jpg`

        // The file is where a human dragged it; the record still names where
        // it was.
        mkdirSync(join(contentDir, '2021', '4. Op Silent Ridge'), { recursive: true })
        writeFileSync(join(contentDir, '2021', '4. Op Silent Ridge', name), 'BYTES')

        // Record<string, unknown> & { _id } rather than Record<string, unknown>
        // alone: ReconcileMediaDoc's _id is a real ObjectId, not unknown, so a
        // bare index-signature type would not satisfy it. Same shape
        // reconcile.test.ts's Doc type uses.
        type Doc = Record<string, unknown> & { _id: InstanceType<typeof ObjectId> }
        const docs: Doc[] = [{
            _id: id,
            storageKey: `content:2026/23. Op New Winter/${name}`,
            caption: 'Danger close', tags: ['funny'], up: 5, down: 0,
        }]

        const report = await reconcile({
            contentDir,
            media: {
                // find() returns a cursor-shaped { toArray() }, not a promise
                // of an array directly — ReconcileDeps.find has to match the
                // real driver's Collection.find(), which acceptsRealCollections()
                // in reconcile.ts pins at compile time.
                find() { return { async toArray() { return docs } } },
                async updateOne(filter: { _id: InstanceType<typeof ObjectId> }, update: { $set?: Record<string, unknown> }) {
                    Object.assign(docs[0], update.$set ?? {})
                    return {}
                },
            },
            operations: { find() { return { async toArray() { return [] } } } },
        })

        expect(report.relocated).toHaveLength(1)
        expect(docs[0].storageKey).toBe(`content:2021/4. Op Silent Ridge/${name}`)
        expect(docs[0].operation).toBe('4. Op Silent Ridge')
        expect(docs[0].caption).toBe('Danger close')
        expect(docs[0].up).toBe(5)
    })
})
