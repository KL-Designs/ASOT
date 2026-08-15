import { resolve, join, basename, dirname, sep } from 'path'
import { existsSync, mkdirSync, createWriteStream, createReadStream, readdirSync } from 'fs'
import { readFile, writeFile, mkdir, rm, copyFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { createInterface } from 'readline'
import { EJSON } from 'bson'
import { MongoClient, FindCursor } from 'mongodb'
import archiver from 'archiver'
import unzipper from 'unzipper'

const execFileAsync = promisify(execFile)

// ── Constants ─────────────────────────────────────────────────────────────────

// Overridable so the e2e suite can point every restic repo and status file at
// an isolated scratch directory instead of the real storage/ tree — without
// this, the Playwright "authorized caller" tests for create/revert/upload
// would write real backup snapshots (of the ephemeral test database) into
// the real repos, indistinguishable from genuine restore points. See
// tests/global-setup.ts / tests/global-teardown.ts.
const STORAGE_ROOT = process.env.BACKUPS_STORAGE_ROOT ?? resolve('../../storage')

export const DB_REPO     = join(STORAGE_ROOT, 'db-backups')
export const MEDIA_REPO  = join(STORAGE_ROOT, 'media-backups')
export const META_DIR    = join(STORAGE_ROOT, 'backup-meta')
export const STATUS_FILE = join(META_DIR, '.status.json')
export const CONFIG_FILE = join(META_DIR, '.config.json')
export const GALLERY_DIR = join(STORAGE_ROOT, 'gallery')
export const UPLOADS_DIR = join(STORAGE_ROOT, 'uploads')

export type BackupConfig = {
    autoEnabled:  boolean
    keepHourly:   number
    keepDaily:    number
    keepWeekly:   number
    keepMonthly:  number
}

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
    autoEnabled:  true,
    keepHourly:   48,
    keepDaily:    14,
    keepWeekly:   8,
    keepMonthly:  12,
}

export type BackupStatus = {
    state: 'idle' | 'backing-up' | 'reverting'
    startedAt?: string
    message?: string
    error?: string
}

export type BackupPoint = {
    id: string                 // ISO hour bucket, e.g. "2026-08-16T14:00:00.000Z"
    time: string                // same value as id — kept separate for UI clarity
    dbSnapshotId?: string
    mediaSnapshotId?: string
}

// ── restic binary resolution ────────────────────────────────────────────────

function resticPath(): string {
    if (process.env.RESTIC_PATH) return process.env.RESTIC_PATH
    const bundled = join(resolve('.'), 'bin', process.platform === 'win32' ? 'restic.exe' : 'restic')
    if (existsSync(bundled)) return bundled
    return 'restic'
}

function resticEnv(repo: string): NodeJS.ProcessEnv {
    // Fail fast and clearly rather than let restic fail cryptically trying to
    // prompt for a password on a non-tty (the single most likely deployment
    // mistake — an env missing RESTIC_PASSWORD).
    if (!process.env.RESTIC_PASSWORD) {
        throw new Error('RESTIC_PASSWORD is not set — every restic repo here is encrypted and needs it')
    }
    return {
        ...process.env,
        RESTIC_REPOSITORY: repo,
        RESTIC_PASSWORD: process.env.RESTIC_PASSWORD,
    }
}

// Exit codes restic can return that don't mean the operation actually failed
// overall, per call site. Currently just `backup`'s 3 ("completed with some
// source files unreadable, e.g. deleted mid-run on a live directory") — that
// is routine on storage/gallery|uploads and should not read as a hard error.
async function runRestic(repo: string, args: string[], tolerableExitCodes: number[] = []): Promise<string> {
    try {
        // --retry-lock: `forget --prune` takes an exclusive repo lock; without
        // this, any backup/restore/snapshots call that lands mid-prune fails
        // immediately instead of waiting its turn.
        const { stdout } = await execFileAsync(resticPath(), ['--retry-lock', '5m', ...args], {
            env: resticEnv(repo),
            maxBuffer: 1024 * 1024 * 64, // 64MB — snapshot lists / backup summaries can be large
        })
        return stdout
    } catch (e: unknown) {
        const err = e as { code?: number; stdout?: string; stderr?: string; message?: string }
        if (typeof err.code === 'number' && tolerableExitCodes.includes(err.code)) {
            console.warn(`[backups] restic exited ${err.code} (tolerated):`, err.stderr?.trim() || err.message)
            return err.stdout ?? ''
        }
        throw new Error(err.stderr?.trim() || err.message || 'restic command failed')
    }
}

async function ensureRepoInitialized(repo: string): Promise<void> {
    if (existsSync(join(repo, 'config'))) return
    await mkdir(repo, { recursive: true })
    await runRestic(repo, ['init'])
}

// ── Status ────────────────────────────────────────────────────────────────────

export function ensureMetaDir() {
    if (!existsSync(META_DIR)) mkdirSync(META_DIR, { recursive: true })
}

export async function readStatus(): Promise<BackupStatus> {
    try {
        const raw = await readFile(STATUS_FILE, 'utf-8')
        const s = JSON.parse(raw) as BackupStatus
        // Auto-reset stale status (crash recovery: >60 min old)
        if (s.state !== 'idle' && s.startedAt) {
            if (Date.now() - new Date(s.startedAt).getTime() > 60 * 60 * 1000) {
                const stale: BackupStatus = { state: 'idle', error: 'Operation timed out (stale status)' }
                await writeFile(STATUS_FILE, JSON.stringify(stale), 'utf-8')
                return stale
            }
        }
        return s
    } catch {
        return { state: 'idle' }
    }
}

export async function writeStatus(s: BackupStatus): Promise<void> {
    ensureMetaDir()
    await writeFile(STATUS_FILE, JSON.stringify(s), 'utf-8')
}

// ── Config ────────────────────────────────────────────────────────────────────

export async function readConfig(): Promise<BackupConfig> {
    try {
        const raw = await readFile(CONFIG_FILE, 'utf-8')
        const c = JSON.parse(raw) as Partial<BackupConfig>
        return {
            autoEnabled:  typeof c.autoEnabled  === 'boolean' ? c.autoEnabled  : DEFAULT_BACKUP_CONFIG.autoEnabled,
            keepHourly:   typeof c.keepHourly   === 'number'  ? Math.max(1, Math.min(200, c.keepHourly))  : DEFAULT_BACKUP_CONFIG.keepHourly,
            keepDaily:    typeof c.keepDaily    === 'number'  ? Math.max(1, Math.min(90,  c.keepDaily))   : DEFAULT_BACKUP_CONFIG.keepDaily,
            keepWeekly:   typeof c.keepWeekly   === 'number'  ? Math.max(1, Math.min(52,  c.keepWeekly))  : DEFAULT_BACKUP_CONFIG.keepWeekly,
            keepMonthly:  typeof c.keepMonthly  === 'number'  ? Math.max(1, Math.min(60,  c.keepMonthly)) : DEFAULT_BACKUP_CONFIG.keepMonthly,
        }
    } catch {
        return { ...DEFAULT_BACKUP_CONFIG }
    }
}

export async function writeConfig(c: BackupConfig): Promise<void> {
    ensureMetaDir()
    await writeFile(CONFIG_FILE, JSON.stringify(c), 'utf-8')
}

// ── Database dump (streamed, one EJSON file per collection) ────────────────────

// Yields one EJSON-encoded document per line, pulled lazily from the cursor —
// keeps each synchronous stringify call tiny instead of stringifying an entire
// collection at once, and yields to the event loop on every cursor fetch.
async function* ndjsonLines(cursor: FindCursor): AsyncGenerator<string> {
    for await (const doc of cursor) {
        yield EJSON.stringify(doc, { relaxed: false }) + '\n'
    }
}

// Always the same fixed path (not timestamped) — restic restores recreate the
// full original absolute path under the restore target, so a stable source
// path here is what makes that restored location predictable later (see
// findByMarker in Task 3). Cleared and recreated fresh on every dump.
const DB_DUMP_DIR = join(tmpdir(), 'asot-db-dump')

async function dumpDatabase(destDir: string): Promise<void> {
    await rm(destDir, { recursive: true, force: true }).catch(() => {})
    await mkdir(join(destDir, 'db'), { recursive: true })

    const mongoClient = new MongoClient(process.env.MONGO_URI!)
    try {
        await mongoClient.connect()
        const db = mongoClient.db(process.env.MONGO_DB!)
        const collInfos = await db.listCollections({}, { nameOnly: true }).toArray()
        const collections = collInfos.map(c => c.name).filter(n => !n.startsWith('system.')).sort()

        await writeFile(join(destDir, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), collections }))

        for (const collName of collections) {
            const cursor = db.collection(collName).find({})
            await pipeline(Readable.from(ndjsonLines(cursor)), createWriteStream(join(destDir, 'db', `${collName}.ejson`)))
        }
    } finally {
        await mongoClient.close()
    }
}

// ── Backup creation ─────────────────────────────────────────────────────────

interface ResticBackupSummary { message_type: 'summary'; snapshot_id: string }

// Fixed --host: restic's default snapshot grouping (for both `forget` and
// its own display) is by hostname+paths, and this app's real hostname is a
// Docker container ID that changes on every deploy. Pinning it keeps
// `restic snapshots` output stable and readable; `resticForget`'s own
// `--group-by tags` below is what actually makes retention correct
// regardless of hostname.
const RESTIC_HOST = 'asot-backups'

async function resticBackup(repo: string, paths: string[], tag: string): Promise<string> {
    await ensureRepoInitialized(repo)
    const stdout = await runRestic(
        repo,
        ['backup', ...paths, '--tag', tag, '--host', RESTIC_HOST, '--json'],
        [3], // "completed with some source files unreadable" — routine on a live directory, not a failure
    )
    const summary = stdout.trim().split('\n').filter(Boolean)
        .map(line => { try { return JSON.parse(line) as { message_type?: string } } catch { return null } })
        .filter((entry): entry is { message_type?: string } => entry !== null)
        .find((entry): entry is ResticBackupSummary => entry.message_type === 'summary')
    if (!summary) throw new Error('restic backup produced no summary line')
    return summary.snapshot_id
}

async function resticForget(repo: string, cfg: BackupConfig): Promise<void> {
    await runRestic(repo, [
        'forget', '--prune',
        // Group by tag, not the default host+paths: each repo carries exactly
        // one constant tag ('db' or 'media'), so this collapses to a single
        // group regardless of hostname — the container's real hostname is
        // its container ID, which changes on every deploy, and the default
        // grouping would otherwise start a fresh never-pruned group every
        // time, silently defeating retention entirely.
        '--group-by', 'tags',
        '--keep-hourly',  String(cfg.keepHourly),
        '--keep-daily',   String(cfg.keepDaily),
        '--keep-weekly',  String(cfg.keepWeekly),
        '--keep-monthly', String(cfg.keepMonthly),
    ])
}

export async function runDbBackup(): Promise<void> {
    const cfg = await readConfig()
    await writeStatus({ state: 'backing-up', startedAt: new Date().toISOString(), message: 'Dumping database…' })
    try {
        await dumpDatabase(DB_DUMP_DIR)
        await writeStatus({ state: 'backing-up', startedAt: new Date().toISOString(), message: 'Backing up to restic…' })
        await resticBackup(DB_REPO, [DB_DUMP_DIR], 'db')
        await writeStatus({ state: 'backing-up', startedAt: new Date().toISOString(), message: 'Pruning old backups…' })
        await resticForget(DB_REPO, cfg)
        await writeStatus({ state: 'idle' })
        console.log('[backups] DB backup complete')
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        await writeStatus({ state: 'idle', error: msg })
        console.error('[backups] DB backup failed:', msg)
        throw e
    } finally {
        await rm(DB_DUMP_DIR, { recursive: true, force: true }).catch(() => {})
    }
}

export async function runMediaBackup(): Promise<void> {
    const cfg = await readConfig()
    await writeStatus({ state: 'backing-up', startedAt: new Date().toISOString(), message: 'Backing up media…' })
    try {
        // Always ensure the repo exists, even if there's nothing to back up
        // yet (a fresh clone has neither storage/gallery nor storage/uploads
        // until something is uploaded) — resticForget() below runs
        // unconditionally and throws on a repo that was never `restic init`'d.
        await ensureRepoInitialized(MEDIA_REPO)
        const paths = [GALLERY_DIR, UPLOADS_DIR].filter(existsSync)
        if (paths.length > 0) await resticBackup(MEDIA_REPO, paths, 'media')
        await writeStatus({ state: 'backing-up', startedAt: new Date().toISOString(), message: 'Pruning old backups…' })
        await resticForget(MEDIA_REPO, cfg)
        await writeStatus({ state: 'idle' })
        console.log('[backups] Media backup complete')
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        await writeStatus({ state: 'idle', error: msg })
        console.error('[backups] Media backup failed:', msg)
        throw e
    }
}

// In-process guard against overlapping runs. Every route already checks
// readStatus().state !== 'idle' before calling this, but that's a
// check-then-act race across separate HTTP requests (two callers can both
// observe 'idle' before either has written 'backing-up') — this flag closes
// it synchronously within this one Node process, which is all of them
// (server.mjs's cron trigger and every API route run in the same process).
let backupInProgress = false

// Runs both sequentially (see Global Constraints — they share one status
// file). Each side's failure is caught independently so DB issues don't
// block a media attempt or vice versa; if either failed, the combined
// error is what's left in status once both have finished (even though each
// function already wrote its own transient status/error along the way).
export async function runAllBackups(): Promise<void> {
    if (backupInProgress) {
        console.warn('[backups] runAllBackups() called while a run is already in progress — skipping')
        return
    }
    backupInProgress = true
    try {
        const errors: string[] = []
        try { await runDbBackup() } catch (e) { errors.push(`DB: ${e instanceof Error ? e.message : String(e)}`) }
        try { await runMediaBackup() } catch (e) { errors.push(`Media: ${e instanceof Error ? e.message : String(e)}`) }
        if (errors.length > 0) await writeStatus({ state: 'idle', error: errors.join(' | ') })
    } finally {
        backupInProgress = false
    }
}

// ── List ──────────────────────────────────────────────────────────────────────

interface ResticSnapshotEntry { id: string; time: string; tags?: string[] }

async function resticSnapshots(repo: string): Promise<ResticSnapshotEntry[]> {
    if (!existsSync(join(repo, 'config'))) return []
    const stdout = await runRestic(repo, ['snapshots', '--json'])
    return JSON.parse(stdout) as ResticSnapshotEntry[]
}

function hourBucket(iso: string): string {
    const d = new Date(iso)
    d.setUTCMinutes(0, 0, 0)
    return d.toISOString()
}

export async function listBackups(): Promise<BackupPoint[]> {
    const [dbSnaps, mediaSnaps] = await Promise.all([
        resticSnapshots(DB_REPO),
        resticSnapshots(MEDIA_REPO),
    ])

    const byBucket = new Map<string, BackupPoint>()
    for (const s of dbSnaps) {
        const id = hourBucket(s.time)
        const existing = byBucket.get(id) ?? { id, time: id }
        existing.dbSnapshotId = s.id
        byBucket.set(id, existing)
    }
    for (const s of mediaSnaps) {
        const id = hourBucket(s.time)
        const existing = byBucket.get(id) ?? { id, time: id }
        existing.mediaSnapshotId = s.id
        byBucket.set(id, existing)
    }

    return [...byBucket.values()].sort((a, b) => b.time.localeCompare(a.time))
}

// ── Restore helpers ──────────────────────────────────────────────────────────

async function readEjsonDocs(path: string): Promise<unknown[]> {
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
    const docs: unknown[] = []
    for await (const line of rl) {
        if (line.trim()) docs.push(EJSON.parse(line))
    }
    return docs
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
    await mkdir(dest, { recursive: true })
    const entries = readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
        if (entry.isSymbolicLink()) continue // never follow symlinks out of a restored/extracted tree
        const srcPath  = join(src,  entry.name)
        const destPath = join(dest, entry.name)
        if (entry.isDirectory()) await copyDirRecursive(srcPath, destPath)
        else await copyFile(srcPath, destPath)
    }
}

async function restoreDatabase(dumpDir: string): Promise<void> {
    const mongoClient = new MongoClient(process.env.MONGO_URI!)
    try {
        await mongoClient.connect()
        const db = mongoClient.db(process.env.MONGO_DB!)
        const dbDir = join(dumpDir, 'db')
        const collectionNames = existsSync(dbDir)
            ? readdirSync(dbDir).filter(f => f.endsWith('.ejson')).map(f => f.slice(0, -6)).sort()
            : []

        for (const collName of collectionNames) {
            const docs = await readEjsonDocs(join(dbDir, `${collName}.ejson`))
            const coll = db.collection(collName)
            await coll.drop().catch(() => {})
            if (docs.length > 0) await coll.insertMany(docs as Parameters<typeof coll.insertMany>[0])
        }

        // Recreate critical ORBAT indexes (dropped along with the collection)
        await db.collection('orbat_positions').createIndex(
            { userId: 1 } as never,
            { unique: true, partialFilterExpression: { userId: { $type: 'string' } } } as never
        ).catch(() => {})
        await db.collection('orbat_positions').createIndex(
            { category: 1, sectionOrder: 1, positionOrder: 1 } as never
        ).catch(() => {})
    } finally {
        await mongoClient.close()
    }
}

async function resticRestore(repo: string, snapshotId: string, target: string): Promise<void> {
    await runRestic(repo, ['restore', snapshotId, '--target', target])
}

// restic restore recreates the full original absolute path under `target`.
// The DB dump always comes from the same single fixed path (DB_DUMP_DIR), so
// the restored tree is a chain of single-entry directories down to its
// actual contents — walk down until manifest.json is found.
function findByMarker(root: string, marker: string): string {
    let dir = root
    for (let depth = 0; depth < 20; depth++) {
        if (existsSync(join(dir, marker))) return dir
        const entries = readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory())
        if (entries.length !== 1) throw new Error(`Could not locate ${marker} under restored path ${root}`)
        dir = join(dir, entries[0].name)
    }
    throw new Error(`${marker} not found within expected depth under ${root}`)
}

// Media backs up TWO sibling paths (gallery + uploads) in one restic backup,
// so the restored tree branches rather than chaining — search by directory
// name instead of assuming a single path.
function findDirNamed(root: string, name: string): string | null {
    const stack = [root]
    while (stack.length > 0) {
        const dir = stack.pop()!
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue
            const full = join(dir, entry.name)
            if (entry.name === name) return full
            stack.push(full)
        }
    }
    return null
}

// ── Revert ────────────────────────────────────────────────────────────────────

export async function revertToPoint(point: BackupPoint): Promise<void> {
    await writeStatus({ state: 'reverting', startedAt: new Date().toISOString(), message: 'Restoring…' })
    const tmp = join(tmpdir(), `asot-revert-${Date.now()}`)
    try {
        if (point.dbSnapshotId) {
            await writeStatus({ state: 'reverting', startedAt: new Date().toISOString(), message: 'Restoring database…' })
            const dbTarget = join(tmp, 'db-restore')
            await resticRestore(DB_REPO, point.dbSnapshotId, dbTarget)
            const dumpRoot = findByMarker(dbTarget, 'manifest.json')
            await restoreDatabase(dumpRoot)
        }
        if (point.mediaSnapshotId) {
            await writeStatus({ state: 'reverting', startedAt: new Date().toISOString(), message: 'Restoring media files…' })
            const mediaTarget = join(tmp, 'media-restore')
            await resticRestore(MEDIA_REPO, point.mediaSnapshotId, mediaTarget)
            const gallery = findDirNamed(mediaTarget, basename(GALLERY_DIR))
            const uploads = findDirNamed(mediaTarget, basename(UPLOADS_DIR))
            if (gallery) await copyDirRecursive(gallery, GALLERY_DIR)
            if (uploads) await copyDirRecursive(uploads, UPLOADS_DIR)
        }
        await writeStatus({ state: 'idle' })
        console.log(`[backups] Revert to ${point.id} complete`)
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        await writeStatus({ state: 'idle', error: msg })
        console.error('[backups] Revert failed:', msg)
        throw e
    } finally {
        await rm(tmp, { recursive: true, force: true }).catch(() => {})
    }
}

// ── Download ──────────────────────────────────────────────────────────────────

// Restores the point into a temp tree shaped { db-source/, gallery/, uploads/ }
// and zips it — this exact shape is also what applyUploadedZip() below expects,
// so a downloaded zip can be re-uploaded later and round-trip correctly.
export async function buildDownloadZip(point: BackupPoint): Promise<string> {
    const tmp = join(tmpdir(), `asot-download-${Date.now()}`)
    const outDir = join(tmp, 'out')
    const zipPath = `${tmp}.zip`
    let succeeded = false
    try {
        await mkdir(outDir, { recursive: true })

        if (point.dbSnapshotId) {
            const dbTarget = join(tmp, 'db-restore')
            await resticRestore(DB_REPO, point.dbSnapshotId, dbTarget)
            const dumpRoot = findByMarker(dbTarget, 'manifest.json')
            await copyDirRecursive(dumpRoot, join(outDir, 'db-source'))
        }
        if (point.mediaSnapshotId) {
            const mediaTarget = join(tmp, 'media-restore')
            await resticRestore(MEDIA_REPO, point.mediaSnapshotId, mediaTarget)
            const gallery = findDirNamed(mediaTarget, basename(GALLERY_DIR))
            const uploads = findDirNamed(mediaTarget, basename(UPLOADS_DIR))
            if (gallery) await copyDirRecursive(gallery, join(outDir, 'gallery'))
            if (uploads) await copyDirRecursive(uploads, join(outDir, 'uploads'))
        }

        await new Promise<void>((resolveZip, reject) => {
            const output  = createWriteStream(zipPath)
            const archive = archiver('zip', { zlib: { level: 1 } })
            archive.on('error', reject)
            output.on('close', () => resolveZip())
            output.on('error', reject)
            archive.pipe(output)
            archive.directory(outDir, false)
            archive.finalize()
        })

        succeeded = true
        return zipPath
    } finally {
        await rm(tmp, { recursive: true, force: true }).catch(() => {})
        // zipPath lives deliberately outside tmp (it's the return value) — if
        // archiving failed partway through, clean up the partial file rather
        // than leaking it in os.tmpdir() forever.
        if (!succeeded) await rm(zipPath, { force: true }).catch(() => {})
    }
}

// ── Upload ────────────────────────────────────────────────────────────────────

// Extracts a zip entry-by-entry via unzipper's random-access Open API rather
// than piping through unzipper.Extract's stream: Extract's returned promise
// was found to resolve before extracted files were actually flushed to disk
// (a real, reproducible race — see task-3-report.md), silently causing the
// restore below to see an empty tree and no-op while still reporting
// success. Awaiting each entry's own write stream to 'finish' closes that
// race, and validating each entry's path/type here also closes zip-slip and
// symlink-based path traversal — the source zip is untrusted (staff-uploaded).
async function safeExtractZip(zipPath: string, destDir: string): Promise<void> {
    const destRoot = resolve(destDir) + sep
    await mkdir(destDir, { recursive: true })

    const directory = await unzipper.Open.file(zipPath)
    for (const entry of directory.files) {
        const destPath = resolve(destDir, entry.path)
        if (destPath !== resolve(destDir) && !destPath.startsWith(destRoot)) {
            throw new Error(`Refusing to extract zip entry outside target directory: ${entry.path}`)
        }

        // Zip symlinks are regular entries with the link mode bit set in the
        // upper 16 bits of externalFileAttributes (Unix mode) — unzipper
        // doesn't classify these separately from 'File'. Refuse them: this
        // code only ever handles our own generated download zips or a manual
        // admin upload, never anything that legitimately needs a symlink.
        const unixMode = (entry.externalFileAttributes >>> 16) & 0xFFFF
        if ((unixMode & 0xF000) === 0xA000) {
            throw new Error(`Refusing to extract symlink entry in uploaded zip: ${entry.path}`)
        }

        if (entry.type === 'Directory') {
            await mkdir(destPath, { recursive: true })
            continue
        }

        await mkdir(dirname(destPath), { recursive: true })
        await pipeline(entry.stream(), createWriteStream(destPath))
    }
}

// Extracts an uploaded zip straight onto disk — bypasses restic entirely, does
// not feed the upload into either repo's history. Matches buildDownloadZip's
// { db-source/, gallery/, uploads/ } shape.
export async function applyUploadedZip(zipPath: string): Promise<void> {
    const tmp = join(tmpdir(), `asot-upload-extract-${Date.now()}`)
    await writeStatus({ state: 'reverting', startedAt: new Date().toISOString(), message: 'Extracting upload…' })
    try {
        await safeExtractZip(zipPath, tmp)

        const dbDir = join(tmp, 'db-source')
        const gallery = join(tmp, 'gallery')
        const uploads = join(tmp, 'uploads')
        const hasDbSource = existsSync(dbDir)
        const hasGallery  = existsSync(gallery)
        const hasUploads  = existsSync(uploads)

        if (!hasDbSource && !hasGallery && !hasUploads) {
            // The old lib/snapshots.ts system's zips had `manifest.json` +
            // `db/` at the archive root, not `db-source/` — recognizably
            // different from anything this uploader can produce or restore.
            // Silently "succeeding" while restoring nothing (as opposed to
            // this explicit check) is exactly the failure class the Task 3
            // extraction-race bug already was: reported success, nothing
            // actually restored.
            const looksLegacy = existsSync(join(tmp, 'manifest.json')) && existsSync(join(tmp, 'db'))
            throw new Error(
                looksLegacy
                    ? 'This ZIP is from the old backup system (pre-restic) and is not compatible with this uploader.'
                    : 'Uploaded ZIP does not contain a recognised backup (expected db-source/, gallery/, or uploads/ at its root).'
            )
        }

        if (hasDbSource) {
            await writeStatus({ state: 'reverting', startedAt: new Date().toISOString(), message: 'Restoring database…' })
            await restoreDatabase(dbDir)
        }

        await writeStatus({ state: 'reverting', startedAt: new Date().toISOString(), message: 'Restoring media files…' })
        if (hasGallery) await copyDirRecursive(gallery, GALLERY_DIR)
        if (hasUploads) await copyDirRecursive(uploads, UPLOADS_DIR)

        await writeStatus({ state: 'idle' })
        console.log('[backups] Upload-revert complete')
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        await writeStatus({ state: 'idle', error: msg })
        console.error('[backups] Upload-revert failed:', msg)
        throw e
    } finally {
        await rm(tmp, { recursive: true, force: true }).catch(() => {})
    }
}
