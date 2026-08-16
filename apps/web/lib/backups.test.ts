/**
 * Unit coverage for the pre-restore safety backup (issue #55, requirement 5).
 *
 * No mocking is needed to force the safety backup to fail: resticEnv() throws
 * when RESTIC_PASSWORD is unset, which is the first thing every restic call
 * touches. runSafetyBackup() rethrows that failure prefixed with "Safety
 * backup failed: ", so the assertions below match on
 * /Safety backup failed: .*RESTIC_PASSWORD/ — pinning both that the safety
 * backup is what blocked the restore (the ordering) and why it failed (the
 * mechanism), rather than a bare /Safety backup failed/ that would also
 * match an unrelated dumpDatabase hiccup. That makes it possible to assert
 * directly on what matters most — the live data is untouched — with a real
 * in-memory mongod standing in for the live database.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient } from 'mongodb'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

let mongod: MongoMemoryServer
let mongo: MongoClient
let storageRoot: string

// Imported lazily inside tests: lib/backups.ts reads BACKUPS_STORAGE_ROOT at
// module load, so the env var has to be set before the first import.
type BackupsModule = typeof import('./backups')
let backups: BackupsModule

beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    process.env.MONGO_URI = mongod.getUri()
    process.env.MONGO_DB = 'asot-test'

    storageRoot = mkdtempSync(join(tmpdir(), 'asot-backup-test-'))
    mkdirSync(join(storageRoot, 'gallery'), { recursive: true })
    mkdirSync(join(storageRoot, 'uploads'), { recursive: true })
    process.env.BACKUPS_STORAGE_ROOT = storageRoot

    mongo = new MongoClient(process.env.MONGO_URI)
    await mongo.connect()

    backups = await import('./backups')
})

afterAll(async () => {
    await mongo.close()
    await mongod.stop()
    await rm(storageRoot, { recursive: true, force: true }).catch(() => {})
})

beforeEach(async () => {
    // A sentinel the restore would destroy if it ever ran: restoreDatabase()
    // drops each collection before re-inserting.
    await mongo.db('asot-test').collection('sentinel').deleteMany({})
    await mongo.db('asot-test').collection('sentinel').insertOne({ marker: 'untouched' })
    writeFileSync(join(storageRoot, 'gallery', 'sentinel.txt'), 'untouched', 'utf-8')
    delete process.env.RESTIC_PASSWORD
})

describe('revertToPoint', () => {
    test('aborts without touching live data when the safety backup fails', async () => {
        const point = {
            id: '2026-08-17T14:00:00.000Z',
            time: '2026-08-17T14:00:00.000Z',
            dbSnapshotId: 'deadbeef',
            mediaSnapshotId: 'cafebabe',
        }

        await expect(backups.revertToPoint(point)).rejects.toThrow(/Safety backup failed: .*RESTIC_PASSWORD/)

        // The live database is intact — restoreDatabase() never ran.
        const docs = await mongo.db('asot-test').collection('sentinel').find({}).toArray()
        expect(docs).toHaveLength(1)
        expect(docs[0].marker).toBe('untouched')

        // The live media tree is intact — copyDirRecursive() never ran.
        expect(readFileSync(join(storageRoot, 'gallery', 'sentinel.txt'), 'utf-8')).toBe('untouched')

        // The failure is surfaced, not swallowed.
        const status = await backups.readStatus()
        expect(status.state).toBe('idle')
        expect(status.error).toMatch(/Safety backup failed: .*RESTIC_PASSWORD/)
    })
})

describe('applyUploadedZip', () => {
    test('aborts before extracting when the safety backup fails', async () => {
        const zipPath = join(storageRoot, 'irrelevant.zip')
        writeFileSync(zipPath, 'not really a zip', 'utf-8')

        await expect(backups.applyUploadedZip(zipPath)).rejects.toThrow(/Safety backup failed: .*RESTIC_PASSWORD/)

        const docs = await mongo.db('asot-test').collection('sentinel').find({}).toArray()
        expect(docs).toHaveLength(1)
        expect(docs[0].marker).toBe('untouched')
        expect(existsSync(join(storageRoot, 'gallery', 'sentinel.txt'))).toBe(true)
    })
})

describe('concurrent operations', () => {
    // The status file is a check-then-act guard across HTTP requests: the revert
    // route reads 'idle', then spends seconds in listBackups() before
    // revertToPoint() writes 'reverting'. The hourly cron checks status the same
    // way and can start a backup inside that window — both would then dump the
    // database concurrently. The in-process operationInProgress flag is what
    // actually closes that window, and a second restore must be REFUSED rather
    // than quietly no-op, because its caller is told the restore began.
    test('refuses a second restore while one is already running', async () => {
        const point = {
            id: '2026-08-17T15:00:00.000Z',
            time: '2026-08-17T15:00:00.000Z',
            dbSnapshotId: 'deadbeef',
        }

        // Both launched before either is awaited — whichever loses the race must
        // be rejected with the in-progress error, not with the safety-backup one.
        const [first, second] = await Promise.allSettled([
            backups.revertToPoint(point),
            backups.applyUploadedZip(join(storageRoot, 'irrelevant.zip')),
        ])

        expect(first.status).toBe('rejected')
        expect(second.status).toBe('rejected')

        const reasons = [first, second].map(r => (r as PromiseRejectedResult).reason.message)
        expect(reasons.filter(m => /already in progress/.test(m))).toHaveLength(1)
        expect(reasons.filter(m => /Safety backup failed/.test(m))).toHaveLength(1)

        // And the loser touched nothing on its way out.
        const docs = await mongo.db('asot-test').collection('sentinel').find({}).toArray()
        expect(docs).toHaveLength(1)
        expect(docs[0].marker).toBe('untouched')
    })
})
