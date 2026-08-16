import { resolve, join, basename, dirname, sep } from 'path'
import { existsSync, mkdirSync, createWriteStream, createReadStream, readdirSync } from 'fs'
import { readFile, writeFile, mkdir, mkdtemp, rm, copyFile, readdir, stat } from 'fs/promises'
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
    dbSizeBytes?: number        // total_bytes_processed from restic's own snapshot summary, when present
    mediaSizeBytes?: number
    isSafety?: boolean          // carries the 'pre-restore' tag — taken automatically before a restore, never pruned
}

export type StorageUsage = {
    live:    { database: number; gallery: number; uploads: number }
    backups: { db: number; mediaGallery: number; mediaUploads: number }
}

// ── restic binary resolution ────────────────────────────────────────────────

function resticPath(): string {
    if (process.env.RESTIC_PATH) return process.env.RESTIC_PATH
    const bundled = join(resolve('.'), 'bin', process.platform === 'win32' ? 'restic.exe' : 'restic')
    if (existsSync(bundled)) return bundled
    return 'restic'
}

// Doesn't go through runRestic()/resticEnv() deliberately — `restic version`
// touches no repo, so it shouldn't fail just because RESTIC_PASSWORD isn't
// set. This checks exactly one thing: is the binary present and runnable.
export async function checkResticHealth(): Promise<boolean> {
    try {
        await execFileAsync(resticPath(), ['version'])
        return true
    } catch {
        return false
    }
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

// The ordinary hourly DB dump. A single fixed path is fine here because only
// runAllBackups() reaches it and that path is serialised by operationInProgress.
// Cleared and recreated fresh on every dump.
//
// It does NOT need to be fixed for restores to work: restic recreates the full
// original absolute path under the restore target, and findByMarker() walks
// down that single-entry chain looking for manifest.json rather than assuming a
// name — which is what lets runSafetyBackup() use a per-run mkdtemp'd directory
// instead. (An earlier version of this comment claimed the fixed path was what
// made restores predictable. It isn't, and safety backups rely on that.)
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

async function resticBackup(repo: string, paths: string[], tag: string, extraTags: string[] = []): Promise<string> {
    await ensureRepoInitialized(repo)
    const tagArgs = ['--tag', tag, ...extraTags.flatMap(t => ['--tag', t])]
    const stdout = await runRestic(
        repo,
        ['backup', ...paths, ...tagArgs, '--host', RESTIC_HOST, '--json'],
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
        // Group by tag, not the default host+paths: the container's real
        // hostname is its container ID, which changes on every deploy, and
        // the default grouping would otherwise start a fresh never-pruned
        // group every time, silently defeating retention entirely. Ordinary
        // snapshots carry just 'db'/'media' and form one group; safety
        // snapshots additionally carry 'pre-restore' and so form a second,
        // separate group — that's fine, since --keep-tag below unions every
        // 'pre-restore'-tagged snapshot into every tier regardless of group.
        '--group-by', 'tags',
        // Safety backups (taken automatically before every restore) are
        // exempt from every tier and are never pruned — a pre-restore copy
        // that ages out on the hourly schedule defeats its own purpose. They
        // are created only when a human actually restores, and dedup makes
        // each one cost close to nothing. See issue #55 requirement 5.
        '--keep-tag', 'pre-restore',
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

// Taken automatically at the head of every restore path — issue #55's
// "a backup must be made before a backup is loaded". Deliberately NOT
// runAllBackups(): that writes { state: 'backing-up' } and owns the
// backupInProgress guard, which would move the status out of 'reverting'
// mid-operation and confuse both the UI poll and every route's in-progress
// check. This keeps the whole restore looking like one continuous operation.
//
// Tagged 'pre-restore' in addition to the repo's usual tag, which is what
// resticForget()'s --keep-tag exempts from retention.
//
// Throws on any failure. Callers MUST let it propagate — a restore that
// cannot be undone is exactly what this exists to prevent.
export async function runSafetyBackup(): Promise<void> {
    await writeStatus({ state: 'reverting', startedAt: new Date().toISOString(), message: 'Creating safety backup…' })

    try {
        // A unique dir, NOT the shared DB_DUMP_DIR runDbBackup() uses. Those two
        // can genuinely overlap: the revert route reads status 'idle', then spends
        // seconds in listBackups() before revertToPoint() writes 'reverting', and
        // the hourly cron can start runAllBackups() inside that window. Sharing one
        // fixed path would mean both dumping into it while each also rm -rf's it —
        // and because resticBackup() tolerates exit code 3 ("some source files
        // unreadable"), the safety backup would report SUCCESS on a partial
        // snapshot and the restore would proceed with an undo that isn't one.
        // operationInProgress below closes the same race from the other side; this
        // makes the two paths independent even if that guard is ever bypassed.
        const dumpDir = await mkdtemp(join(tmpdir(), 'asot-safety-dump-'))
        try {
            await dumpDatabase(dumpDir)
            await resticBackup(DB_REPO, [dumpDir], 'db', ['pre-restore'])
        } finally {
            await rm(dumpDir, { recursive: true, force: true }).catch(() => {})
        }

        await ensureRepoInitialized(MEDIA_REPO)
        const paths = [GALLERY_DIR, UPLOADS_DIR].filter(existsSync)
        if (paths.length > 0) await resticBackup(MEDIA_REPO, paths, 'media', ['pre-restore'])
    } catch (e: unknown) {
        // Prefixed so callers, the status file and the tests can all tell a
        // failed safety backup apart from a failure in the restore that
        // follows it — they otherwise surface identical restic errors, and an
        // operator needs to know the restore never started.
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`Safety backup failed: ${msg}`)
    }

    console.log('[backups] Safety backup complete')
}

// In-process guard against overlapping runs — backups AND restores, which all
// share one status file and (for the DB side) the same repo. Every route already
// checks readStatus().state !== 'idle' first, but that's a check-then-act race
// across separate HTTP requests: two callers can both observe 'idle' before
// either has written its own state, and the revert route in particular spends
// seconds in listBackups() in between. This flag closes the window synchronously
// within this one Node process, which is all of them (server.mjs's cron trigger
// and every API route run in the same process).
//
// Backups skip when it's set; restores throw (see below) — a restore that
// silently no-ops would report success to a caller who then believes their data
// was rolled back.
let operationInProgress = false

// Runs both sequentially (see Global Constraints — they share one status
// file). Each side's failure is caught independently so DB issues don't
// block a media attempt or vice versa; if either failed, the combined
// error is what's left in status once both have finished (even though each
// function already wrote its own transient status/error along the way).
export async function runAllBackups(): Promise<void> {
    if (operationInProgress) {
        console.warn('[backups] runAllBackups() called while an operation is already in progress — skipping')
        return
    }
    operationInProgress = true
    try {
        const errors: string[] = []
        try { await runDbBackup() } catch (e) { errors.push(`DB: ${e instanceof Error ? e.message : String(e)}`) }
        try { await runMediaBackup() } catch (e) { errors.push(`Media: ${e instanceof Error ? e.message : String(e)}`) }
        if (errors.length > 0) await writeStatus({ state: 'idle', error: errors.join(' | ') })
    } finally {
        operationInProgress = false
    }
}

// ── List ──────────────────────────────────────────────────────────────────────

interface ResticSnapshotEntry {
    id: string
    time: string
    tags?: string[]
    // Only present on snapshots that recorded their own backup summary
    // (which all snapshots created by this app's restic version do) — treat
    // as possibly absent rather than relying on it.
    summary?: { total_bytes_processed?: number }
}

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
        existing.dbSizeBytes = s.summary?.total_bytes_processed
        if (s.tags?.includes('pre-restore')) existing.isSafety = true
        byBucket.set(id, existing)
    }
    for (const s of mediaSnaps) {
        const id = hourBucket(s.time)
        const existing = byBucket.get(id) ?? { id, time: id }
        existing.mediaSnapshotId = s.id
        existing.mediaSizeBytes = s.summary?.total_bytes_processed
        if (s.tags?.includes('pre-restore')) existing.isSafety = true
        byBucket.set(id, existing)
    }

    return [...byBucket.values()].sort((a, b) => b.time.localeCompare(a.time))
}

// ── Storage usage ─────────────────────────────────────────────────────────────

// Tolerates a file disappearing mid-walk (ENOENT on stat, or on the readdir
// itself) — storage/gallery and storage/uploads are live directories under
// real traffic, same reasoning as the exit-code-3 tolerance in runRestic().
async function dirSize(dir: string): Promise<number> {
    if (!existsSync(dir)) return 0
    let entries
    try {
        entries = await readdir(dir, { withFileTypes: true })
    } catch {
        return 0
    }
    let total = 0
    for (const entry of entries) {
        if (entry.isSymbolicLink()) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) total += await dirSize(full)
        else total += await stat(full).then(s => s.size).catch(() => 0)
    }
    return total
}

// storageSize + indexSize (real on-disk bytes, WiredTiger-compressed) rather
// than dataSize (uncompressed logical BSON, excludes indexes) — this feeds
// the "Live Storage" donut alongside gallery/uploads' real file-byte counts,
// so it needs to be an actual disk figure to stay comparable to the other
// two slices in the same chart.
async function getLiveDbSize(): Promise<number> {
    const mongoClient = new MongoClient(process.env.MONGO_URI!)
    try {
        await mongoClient.connect()
        const stats = await mongoClient.db(process.env.MONGO_DB!).stats()
        return (stats.storageSize ?? 0) + (stats.indexSize ?? 0)
    } finally {
        await mongoClient.close()
    }
}

async function resticRepoSize(repo: string): Promise<number> {
    if (!existsSync(join(repo, 'config'))) return 0
    const stdout = await runRestic(repo, ['stats', '--mode', 'raw-data', '--json'])
    const parsed = JSON.parse(stdout) as { total_size?: number }
    return parsed.total_size ?? 0
}

// Restic dedups the media repo's two source paths (gallery + uploads) at the
// chunk level, so there's no cheap, exact "how much of this repo's on-disk
// size is gallery vs uploads" answer. Approximate it: sum each file's
// pre-dedup logical size from the latest snapshot's file listing, grouped by
// which source directory it came from, and use that ratio to split the
// repo's real on-disk total — so the two numbers still add up to the true
// size shown elsewhere, instead of presenting a second, disconnected metric.
async function mediaSplitRatio(): Promise<{ gallery: number; uploads: number }> {
    if (!existsSync(join(MEDIA_REPO, 'config'))) return { gallery: 0, uploads: 0 }
    const galleryMarker = `/${basename(GALLERY_DIR)}/`
    const uploadsMarker = `/${basename(UPLOADS_DIR)}/`
    let galleryBytes = 0
    let uploadsBytes = 0
    try {
        const stdout = await runRestic(MEDIA_REPO, ['ls', 'latest', '--json', '--recursive'])
        for (const line of stdout.split('\n')) {
            if (!line.trim()) continue
            let entry: { type?: string; path?: string; size?: number }
            try { entry = JSON.parse(line) } catch { continue }
            if (entry.type !== 'file' || !entry.size || !entry.path) continue
            if (entry.path.includes(galleryMarker)) galleryBytes += entry.size
            else if (entry.path.includes(uploadsMarker)) uploadsBytes += entry.size
        }
    } catch (e) {
        console.warn('[backups] mediaSplitRatio: restic ls failed, falling back to live directory size ratio:', e instanceof Error ? e.message : e)
        return { gallery: 0, uploads: 0 }
    }
    const total = galleryBytes + uploadsBytes
    if (total === 0) return { gallery: 0, uploads: 0 }
    return { gallery: galleryBytes / total, uploads: uploadsBytes / total }
}

// Isolates each probe so one failure (Mongo down, RESTIC_PASSWORD unset,
// restic binary missing, a corrupt repo) degrades that one number to a
// fallback instead of rejecting the whole storage panel — a health-check
// feature going dark because of the exact condition it exists to surface
// would defeat its own purpose.
async function settledOr<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
    try {
        return await promise
    } catch (e) {
        console.warn(`[backups] storage usage probe (${label}) failed:`, e instanceof Error ? e.message : e)
        return fallback
    }
}

export async function getStorageUsage(): Promise<StorageUsage> {
    const [liveGallery, liveUploads, liveDb, dbRepoSize, mediaRepoSize, resticSplitRatio] = await Promise.all([
        settledOr(dirSize(GALLERY_DIR), 0, 'gallery dir size'),
        settledOr(dirSize(UPLOADS_DIR), 0, 'uploads dir size'),
        settledOr(getLiveDbSize(), 0, 'live db size'),
        settledOr(resticRepoSize(DB_REPO), 0, 'db repo size'),
        settledOr(resticRepoSize(MEDIA_REPO), 0, 'media repo size'),
        settledOr(mediaSplitRatio(), { gallery: 0, uploads: 0 }, 'media split ratio'),
    ])

    // If the restic-derived ratio couldn't be computed (repo not
    // initialized yet, no snapshot yet, or the `restic ls` call itself
    // failed) but the repo does have a real on-disk size, fall back to the
    // live directory size ratio rather than silently reporting the whole
    // media total as zero — keeps the displayed total truthful even though
    // the gallery/uploads split becomes a rougher approximation.
    let splitRatio = resticSplitRatio
    if (splitRatio.gallery === 0 && splitRatio.uploads === 0 && mediaRepoSize > 0) {
        const liveTotal = liveGallery + liveUploads
        splitRatio = liveTotal > 0
            ? { gallery: liveGallery / liveTotal, uploads: liveUploads / liveTotal }
            : { gallery: 1, uploads: 0 } // nothing to go on — attribute it all to one bucket rather than dropping it
    }

    return {
        live: { database: liveDb, gallery: liveGallery, uploads: liveUploads },
        backups: {
            db: dbRepoSize,
            mediaGallery: Math.round(mediaRepoSize * splitRatio.gallery),
            mediaUploads: Math.round(mediaRepoSize * splitRatio.uploads),
        },
    }
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
    // Claimed before anything else, including the safety backup. Throws rather
    // than returning quietly: the caller is about to be told its restore began.
    if (operationInProgress) throw new Error('Another backup or restore operation is already in progress')
    operationInProgress = true

    const tmp = join(tmpdir(), `asot-revert-${Date.now()}`)
    try {
        // Inside the try, so a writeStatus failure releases the guard via the
        // finally rather than wedging every later operation on a set flag.
        await writeStatus({ state: 'reverting', startedAt: new Date().toISOString(), message: 'Restoring…' })

        // Must come first and must be allowed to throw — if this fails there
        // is no undo for what follows, so the restore does not happen.
        await runSafetyBackup()

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
        operationInProgress = false
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
    // Same claim-first rule as revertToPoint().
    if (operationInProgress) throw new Error('Another backup or restore operation is already in progress')
    operationInProgress = true

    const tmp = join(tmpdir(), `asot-upload-extract-${Date.now()}`)
    try {
        // Same rule as revertToPoint(): no safety backup, no restore.
        await runSafetyBackup()

        await writeStatus({ state: 'reverting', startedAt: new Date().toISOString(), message: 'Extracting upload…' })
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
        operationInProgress = false
    }
}
