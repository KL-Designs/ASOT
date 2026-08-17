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
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
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

        await rm(zipPath, { force: true }).catch(() => {})
    }, 300000)
})
