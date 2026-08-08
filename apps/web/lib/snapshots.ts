import { resolve, join } from 'path'
import {
    existsSync, mkdirSync, statSync, readdirSync, unlinkSync,
    createWriteStream, createReadStream,
} from 'fs'
import { readFile, writeFile, mkdir, copyFile, rename, unlink, rm } from 'fs/promises'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import archiver from 'archiver'
import unzipper from 'unzipper'
import { createInterface } from 'readline'
import { EJSON } from 'bson'
import { MongoClient, FindCursor } from 'mongodb'

// ── Constants ─────────────────────────────────────────────────────────────────

export const SNAPSHOTS_DIR = resolve('../../storage/snapshots')
export const STATUS_FILE   = join(SNAPSHOTS_DIR, '.status.json')
export const CONFIG_FILE   = join(SNAPSHOTS_DIR, '.config.json')
export const MAX_SNAPSHOTS = 5
export const GALLERY_DIR   = resolve('../../storage/gallery')
export const UPLOADS_DIR   = resolve('../../storage/uploads')

export type SnapshotOptions = {
    database:        boolean
    galleryContent:  boolean
    galleryFeatured: boolean
    gallerySotm:     boolean
    uploads:         boolean
}

export const DEFAULT_SNAPSHOT_OPTIONS: SnapshotOptions = {
    database:        true,
    galleryContent:  true,
    galleryFeatured: true,
    gallerySotm:     true,
    uploads:         true,
}

export type SnapshotConfig = {
    maxSnapshots: number
    autoEnabled:  boolean
    intervalDays: number
}

export const DEFAULT_SNAPSHOT_CONFIG: SnapshotConfig = {
    maxSnapshots: 5,
    autoEnabled:  true,
    intervalDays: 2,
}


// ── Types ─────────────────────────────────────────────────────────────────────

export type SnapshotStatus = {
    state: 'idle' | 'creating' | 'reverting'
    startedAt?: string
    message?: string
    error?: string
}

export type SnapshotInfo = {
    filename: string
    createdAt: string
    sizeBytes: number
    sizeHuman: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function ensureSnapshotsDir() {
    if (!existsSync(SNAPSHOTS_DIR)) mkdirSync(SNAPSHOTS_DIR, { recursive: true })
}

function humanSize(bytes: number): string {
    if (bytes < 1024)       return `${bytes} B`
    if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function snapshotTimestamp(now: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}-${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}-${pad(now.getUTCSeconds())}`
}

// Yields one EJSON-encoded document per line, pulled lazily from the cursor —
// keeps each synchronous stringify call tiny instead of stringifying an entire
// collection at once, and yields to the event loop on every cursor fetch.
async function* ndjsonLines(cursor: FindCursor): AsyncGenerator<string> {
    for await (const doc of cursor) {
        yield EJSON.stringify(doc, { relaxed: false }) + '\n'
    }
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
    await mkdir(dest, { recursive: true })
    const entries = readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
        const srcPath  = join(src,  entry.name)
        const destPath = join(dest, entry.name)
        if (entry.isDirectory()) {
            await copyDirRecursive(srcPath, destPath)
        } else {
            await copyFile(srcPath, destPath)
        }
    }
}

// ── Status ────────────────────────────────────────────────────────────────────

export async function readStatus(): Promise<SnapshotStatus> {
    try {
        const raw = await readFile(STATUS_FILE, 'utf-8')
        const s = JSON.parse(raw) as SnapshotStatus
        // Auto-reset stale status (crash recovery: >60 min old)
        if (s.state !== 'idle' && s.startedAt) {
            if (Date.now() - new Date(s.startedAt).getTime() > 60 * 60 * 1000) {
                const stale: SnapshotStatus = { state: 'idle', error: 'Operation timed out (stale status)' }
                await writeFile(STATUS_FILE, JSON.stringify(stale), 'utf-8')
                return stale
            }
        }
        return s
    } catch {
        return { state: 'idle' }
    }
}

export async function writeStatus(s: SnapshotStatus): Promise<void> {
    ensureSnapshotsDir()
    await writeFile(STATUS_FILE, JSON.stringify(s), 'utf-8')
}

// ── Config ────────────────────────────────────────────────────────────────────

export async function readConfig(): Promise<SnapshotConfig> {
    try {
        const raw = await readFile(CONFIG_FILE, 'utf-8')
        const c = JSON.parse(raw) as Partial<SnapshotConfig>
        return {
            maxSnapshots: typeof c.maxSnapshots === 'number' ? Math.max(1, Math.min(20, c.maxSnapshots)) : DEFAULT_SNAPSHOT_CONFIG.maxSnapshots,
            autoEnabled:  typeof c.autoEnabled  === 'boolean' ? c.autoEnabled : DEFAULT_SNAPSHOT_CONFIG.autoEnabled,
            intervalDays: typeof c.intervalDays  === 'number' ? Math.max(1, Math.min(30, c.intervalDays))  : DEFAULT_SNAPSHOT_CONFIG.intervalDays,
        }
    } catch {
        return { ...DEFAULT_SNAPSHOT_CONFIG }
    }
}

export async function writeConfig(c: SnapshotConfig): Promise<void> {
    ensureSnapshotsDir()
    await writeFile(CONFIG_FILE, JSON.stringify(c), 'utf-8')
}

// ── List ──────────────────────────────────────────────────────────────────────

export function listSnapshots(): SnapshotInfo[] {
    ensureSnapshotsDir()

    // Clean up orphaned .tmp files from crashed operations (only if >2h old)
    const TWO_HOURS = 2 * 60 * 60 * 1000
    readdirSync(SNAPSHOTS_DIR)
        .filter(f => f.endsWith('.tmp'))
        .forEach(f => {
            try {
                const { mtimeMs } = statSync(join(SNAPSHOTS_DIR, f))
                if (Date.now() - mtimeMs > TWO_HOURS) unlinkSync(join(SNAPSHOTS_DIR, f))
            } catch {}
        })

    return readdirSync(SNAPSHOTS_DIR)
        .filter(f => /^snapshot-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.zip$/.test(f))
        .sort()
        .map(filename => {
            const { size } = statSync(join(SNAPSHOTS_DIR, filename))
            const m = filename.match(/snapshot-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/)!
            const createdAt = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`).toISOString()
            return { filename, createdAt, sizeBytes: size, sizeHuman: humanSize(size) }
        })
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createSnapshot(options: SnapshotOptions = DEFAULT_SNAPSHOT_OPTIONS): Promise<void> {
    ensureSnapshotsDir()

    const now       = new Date()
    const ts        = snapshotTimestamp(now)
    const finalPath = join(SNAPSHOTS_DIR, `snapshot-${ts}.zip`)
    const tmpPath   = finalPath + '.tmp'

    await writeStatus({ state: 'creating', startedAt: now.toISOString(), message: 'Connecting to database…' })

    const mongoClient = new MongoClient(process.env.MONGO_URI!)
    try {
        await mongoClient.connect()
        const db = mongoClient.db(process.env.MONGO_DB!)

        await writeStatus({ state: 'creating', startedAt: now.toISOString(), message: 'Building archive…' })

        await new Promise<void>((resolve, reject) => {
            const output  = createWriteStream(tmpPath)
            const archive = archiver('zip', { zlib: { level: 1 } })

            archive.on('error', reject)
            output.on('close', resolve)
            output.on('error', reject)
            archive.pipe(output)

            // File trees
            const galleryContent  = join(GALLERY_DIR, 'content')
            const galleryFeatured = join(GALLERY_DIR, 'featured')
            const gallerySotm     = join(GALLERY_DIR, 'sotm')
            if (options.galleryContent  && existsSync(galleryContent))  archive.directory(galleryContent,  'gallery/content')
            if (options.galleryFeatured && existsSync(galleryFeatured)) archive.directory(galleryFeatured, 'gallery/featured')
            if (options.gallerySotm     && existsSync(gallerySotm))     archive.directory(gallerySotm,     'gallery/sotm')
            if (options.uploads && existsSync(UPLOADS_DIR)) archive.directory(UPLOADS_DIR, 'uploads')

            // DB export — must complete before finalize()
            const dbExport = (async () => {
                if (!options.database) return
                const collInfos = await db.listCollections({}, { nameOnly: true }).toArray()
                const collections = collInfos
                    .map(c => c.name)
                    .filter(n => !n.startsWith('system.'))
                    .sort()

                // Manifest written after we know the real collection list
                archive.append(
                    JSON.stringify({ version: 1, createdAt: now.toISOString(), collections, options }),
                    { name: 'manifest.json' }
                )

                // Stream each collection as newline-delimited EJSON instead of loading the
                // whole collection into memory and stringifying it in one synchronous call —
                // that blocked the Node event loop (and the whole site) for the duration.
                for (const collName of collections) {
                    const cursor = db.collection(collName).find({})
                    archive.append(Readable.from(ndjsonLines(cursor)), { name: `db/${collName}.ejson` })
                }
            })()

            dbExport
                .then(() => archive.finalize())
                .catch(reject)
        })

        // Rename tmp → final only on full success
        await rename(tmpPath, finalPath)

        // Enforce retention limit — delete oldest beyond maxSnapshots
        const cfg = await readConfig()
        const all = listSnapshots()
        if (all.length > cfg.maxSnapshots) {
            const toDelete = all.slice(0, all.length - cfg.maxSnapshots)
            for (const s of toDelete) {
                try { unlinkSync(join(SNAPSHOTS_DIR, s.filename)) } catch {}
            }
        }

        await writeStatus({ state: 'idle' })
        console.log(`[snapshots] Created: snapshot-${ts}.zip`)
    } catch (e: unknown) {
        if (existsSync(tmpPath)) try { unlinkSync(tmpPath) } catch {}
        const msg = e instanceof Error ? e.message : String(e)
        await writeStatus({ state: 'idle', error: msg })
        console.error('[snapshots] Create failed:', msg)
        throw e
    } finally {
        await mongoClient.close()
    }
}

// ── Revert ────────────────────────────────────────────────────────────────────

// Reads a `db/<collection>.ejson` entry. New snapshots write newline-delimited EJSON
// (one document per line); snapshots created before streaming was added wrote the
// whole collection as a single EJSON array — detect and support both on read.
async function readEjsonDocs(path: string): Promise<unknown[]> {
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
    const docs: unknown[] = []
    const arrayLines: string[] = []
    let isArrayFormat: boolean | undefined

    for await (const line of rl) {
        if (isArrayFormat === undefined) isArrayFormat = line.trimStart().startsWith('[')
        if (isArrayFormat) {
            arrayLines.push(line)
        } else if (line.trim()) {
            docs.push(EJSON.parse(line))
        }
    }

    return isArrayFormat ? (EJSON.parse(arrayLines.join('\n')) as unknown[]) : docs
}

export async function revertSnapshot(zipPath: string): Promise<void> {
    const tmpDir = join(SNAPSHOTS_DIR, `.revert-tmp-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })

    await writeStatus({ state: 'reverting', startedAt: new Date().toISOString(), message: 'Extracting archive…' })

    const mongoClient = new MongoClient(process.env.MONGO_URI!)
    try {
        // Extract entire ZIP to tmpDir.
        // unzipper.Extract closes the writable side before the readable finishes,
        // which causes pipeline() to throw "Premature close" even on success.
        // We catch and ignore that specific error.
        await pipeline(
            createReadStream(zipPath),
            unzipper.Extract({ path: tmpDir })
        ).catch((e: unknown) => {
            if (e instanceof Error && e.message === 'Premature close') return
            throw e
        })

        await writeStatus({ state: 'reverting', message: 'Restoring database…' })

        await mongoClient.connect()
        const db = mongoClient.db(process.env.MONGO_DB!)

        const dbDir = join(tmpDir, 'db')
        const collectionNames = existsSync(dbDir)
            ? readdirSync(dbDir).filter(f => f.endsWith('.ejson')).map(f => f.slice(0, -6)).sort()
            : []

        for (const collName of collectionNames) {
            const ejsonPath = join(dbDir, `${collName}.ejson`)
            if (!existsSync(ejsonPath)) continue

            const docs = await readEjsonDocs(ejsonPath)

            const coll = db.collection(collName)
            await coll.drop().catch(() => {})  // ignore error if collection didn't exist
            if (docs.length > 0) {
                await coll.insertMany(docs as Parameters<typeof coll.insertMany>[0])
            }
        }

        // Recreate critical ORBAT indexes (dropped with the collection)
        await db.collection('orbat_positions').createIndex(
            { userId: 1 } as never,
            { unique: true, partialFilterExpression: { userId: { $type: 'string' } } } as never
        ).catch(() => {})
        await db.collection('orbat_positions').createIndex(
            { category: 1, sectionOrder: 1, positionOrder: 1 } as never
        ).catch(() => {})

        await writeStatus({ state: 'reverting', message: 'Restoring files…' })

        const extractedGallery = join(tmpDir, 'gallery')
        const extractedUploads = join(tmpDir, 'uploads')

        if (existsSync(extractedGallery)) await copyDirRecursive(extractedGallery, GALLERY_DIR)
        if (existsSync(extractedUploads)) await copyDirRecursive(extractedUploads, UPLOADS_DIR)

        await writeStatus({ state: 'idle' })
        console.log('[snapshots] Revert complete.')
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        await writeStatus({ state: 'idle', error: msg })
        console.error('[snapshots] Revert failed:', msg)
        throw e
    } finally {
        await mongoClient.close()
        // Clean up temp extraction directory
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
}
