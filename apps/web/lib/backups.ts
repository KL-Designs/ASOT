import { resolve, join, basename, dirname, sep } from 'path'
import { existsSync, mkdirSync, createWriteStream, createReadStream, readdirSync } from 'fs'
import { readFile, writeFile, mkdir, mkdtemp, rm, copyFile, readdir, stat, statfs } from 'fs/promises'
import { execFile, spawn, type ChildProcess } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { pipeline } from 'stream/promises'
import { Readable, finished } from 'stream'
import { createInterface } from 'readline'
import { EJSON } from 'bson'
import { MongoClient, FindCursor } from 'mongodb'
import archiver, { type Archiver } from 'archiver'
// The one gallery import here, and deliberately from the module that owns the
// path rather than a second `join(GALLERY_DIR, 'thumbs')` — two spellings of
// one directory is how an exclude silently stops matching. paths.ts imports
// only `path`, so this pulls in no server-only dependency.
import { THUMB_DIR } from '@/lib/gallery/paths'
// Same rule as THUMB_DIR above: pure, imports nothing but ./naming, and in
// particular does not reach @/lib/mongo — the numbering itself is built by the
// caller and handed to openDownloadZipStream().
import { numberContentEntry } from '@/lib/gallery/export-numbering'
import { extract as tarExtract } from 'tar-stream'
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

// Prefix of the restic tag every snapshot in one backup run shares
// ('run:2026-08-17T06:28:40.123Z'). It is what pairs a run's database and
// media snapshots into a single restore point in buildBackupPoints().
const RUN_TAG_PREFIX = 'run:'

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

// One checkpoint in an operation. The plan is computed when the operation
// starts, so the UI can show what is coming as well as what is done — rather
// than a single bar that has no idea how much of the work remains.
export type BackupStage = {
    id: string
    label: string
}

export type BackupStatus = {
    state: 'idle' | 'backing-up' | 'reverting'
    // Set ONCE when the operation starts. It used to be rewritten on every
    // stage, which reset the elapsed time and made the progress bar restart
    // from zero several times per backup.
    startedAt?: string
    message?: string
    error?: string
    stage?: string          // id of the stage running right now
    plan?: BackupStage[]    // every stage this operation will run, in order
}

export type BackupPoint = {
    // The run that produced it, as an ISO instant — every snapshot from one
    // backup run carries a matching 'run:<iso>' tag, which is what pairs the
    // database and media halves into a single restore point. Snapshots taken
    // before run tagging existed fall back to their ISO hour bucket, which is
    // the identity the whole timeline used to have.
    id: string
    time: string                // when the earliest snapshot in the point was actually taken, normalised to UTC
    dbSnapshotId?: string
    mediaSnapshotId?: string
    dbSizeBytes?: number        // total_bytes_processed from restic's own snapshot summary, when present
    mediaSizeBytes?: number
    isSafety?: boolean          // carries the 'pre-restore' tag — taken automatically before a restore, never pruned
    isManual?: boolean          // carries the 'manual' tag — taken by a human on demand, likewise never pruned
}

// The separately restorable parts of a backup. The database is its own restic
// repo; gallery and uploads share the media repo but are distinct source paths
// within it, so all three can be restored independently.
export type BackupPart = 'database' | 'gallery' | 'uploads'
export const ALL_BACKUP_PARTS: readonly BackupPart[] = ['database', 'gallery', 'uploads']

// Returns null for anything malformed rather than silently falling back to
// "everything": these values choose what a restore overwrites, so a typo must
// fail the request, not quietly widen it. Absent input DOES mean everything —
// that is the historical behaviour of every one of these endpoints.
export function parseBackupParts(raw: string | string[] | null | undefined): BackupPart[] | null {
    if (raw === null || raw === undefined || raw === '') return [...ALL_BACKUP_PARTS]
    const requested = (Array.isArray(raw) ? raw : raw.split(',')).map(s => s.trim()).filter(Boolean)
    if (requested.length === 0) return null
    const parts: BackupPart[] = []
    for (const value of requested) {
        const match = ALL_BACKUP_PARTS.find(p => p === value)
        if (!match) return null
        if (!parts.includes(match)) parts.push(match)
    }
    return parts
}

// Which part a media snapshot's source path belongs to. The media repo backs up
// GALLERY_DIR and UPLOADS_DIR, so the last path segment identifies it.
function mediaPartOf(sourcePath: string): BackupPart | null {
    const name = toResticTreePath(sourcePath).split('/').filter(Boolean).pop()
    if (name === basename(GALLERY_DIR)) return 'gallery'
    if (name === basename(UPLOADS_DIR)) return 'uploads'
    return null
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

// Every restic child currently running in this process, so cancelOperation()
// can actually stop one — a backup wedged on an unobtainable repo lock is
// unreachable any other way, and rewriting the status file alone leaves it
// running and holding the guard (which is precisely what made Force Reset a
// no-op before).
const runningRestic = new Set<ChildProcess>()

// Exit codes restic can return that don't mean the operation actually failed
// overall, per call site. Currently just `backup`'s 3 ("completed with some
// source files unreadable, e.g. deleted mid-run on a live directory") — that
// is routine on storage/gallery|uploads and should not read as a hard error.
async function runRestic(repo: string, args: string[], tolerableExitCodes: number[] = []): Promise<string> {
    const env = resticEnv(repo) // throws before anything is spawned
    return await new Promise<string>((resolveRun, reject) => {
        // --retry-lock: `forget --prune` takes an exclusive repo lock; without
        // this, any backup/restore/snapshots call that lands mid-prune fails
        // immediately instead of waiting its turn. Note this only helps
        // against locks that will actually be released — clearStaleLocks()
        // below is what deals with locks whose owner is already gone.
        const child = execFile(
            resticPath(),
            ['--retry-lock', '5m', ...args],
            {
                env,
                maxBuffer: 1024 * 1024 * 64, // 64MB — snapshot lists / backup summaries can be large
            },
            (error, stdout, stderr) => {
                runningRestic.delete(child)
                if (!error) return resolveRun(stdout)

                const err = error as Error & { code?: number | string; killed?: boolean }
                if (typeof err.code === 'number' && tolerableExitCodes.includes(err.code)) {
                    console.warn(`[backups] restic exited ${err.code} (tolerated):`, stderr?.trim() || err.message)
                    return resolveRun(stdout)
                }
                // Killed by cancelOperation() rather than failed on its own —
                // restic reports no stderr in that case, so without this the
                // operator would see a bare "Command failed".
                if (err.killed) return reject(new Error('Operation cancelled — restic was stopped mid-run.'))
                reject(new Error(stderr?.trim() || err.message || 'restic command failed'))
            },
        )
        // Registered after execFile returns, which is safe because a child
        // process never calls back synchronously.
        runningRestic.add(child)
    })
}

// restic clears stale locks ONLY in its `unlock` command — never while
// acquiring one. That matters here because a lock records the hostname and
// PID of whatever created it, and in Docker that hostname is the container
// ID: once a container dies mid-run (a deploy, a restart, an OOM kill), no
// later container can ever prove the owning process is gone, so the lock sits
// there and `forget --prune` — the only operation here that needs an
// EXCLUSIVE lock — blocks on it indefinitely. With --retry-lock that presents
// as the backup hanging at "Pruning old backups…" rather than failing.
//
// Plain `unlock`, deliberately NOT `unlock --remove-all`: it removes only the
// locks restic itself judges stale (older than the refresh window it keeps up
// while running, or a dead process on this host), so it can never delete the
// lock of an operation that is genuinely still in flight elsewhere.
async function clearStaleLocks(repo: string): Promise<void> {
    if (!existsSync(join(repo, 'config'))) return
    try {
        await runRestic(repo, ['unlock'])
    } catch (e: unknown) {
        // Not fatal by itself — if the repo is genuinely unusable, the
        // operation this precedes fails next with the real reason. Swallowing
        // it here keeps a transient unlock hiccup from cancelling a backup
        // that would otherwise have succeeded.
        console.warn(`[backups] could not clear stale locks on ${repo}:`, e instanceof Error ? e.message : e)
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
// runAllBackups() reaches it and that path is serialised by currentOperation.
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

/* The gallery's thumbnail cache. Every entry is regenerated on demand from a
   file that is itself in this backup, so backing them up stores a second copy
   of the whole archive at reduced size — roughly 120MB of files that also
   churn, since a caption edit renames the source and mints a new thumbnail
   while the old one lingers. Excluding it keeps the media repo the archive
   rather than the archive plus a derivative of it.

   It is excluded from RESTORE for free: nothing puts back what was never
   backed up, and a restored gallery simply regenerates its thumbnails the
   first time the Media tab is opened. A `wipeMedia` restore empties the
   gallery tree including this directory, which is exactly right — a thumbnail
   of a file the snapshot does not contain is a thumbnail of nothing. */
const BACKUP_EXCLUDES = [THUMB_DIR]

async function resticBackup(repo: string, paths: string[], tag: string, extraTags: string[] = []): Promise<string> {
    await ensureRepoInitialized(repo)
    const tagArgs = ['--tag', tag, ...extraTags.flatMap(t => ['--tag', t])]
    const excludeArgs = BACKUP_EXCLUDES.flatMap(dir => ['--exclude', dir])
    const stdout = await runRestic(
        repo,
        ['backup', ...paths, ...excludeArgs, ...tagArgs, '--host', RESTIC_HOST, '--json'],
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
    // The one exclusive-lock operation in this file, and so the one that a
    // lock orphaned by a dead container blocks. Everything else restic does
    // here (backup, snapshots, restore, ls, stats) takes a shared lock and is
    // unaffected — which is why this was the only step that ever hung.
    await clearStaleLocks(repo)
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
        // Manual "Create Now" backups, for the same reason. --keep-hourly
        // keeps only the LAST snapshot of each hour, so without this a manual
        // backup taken at 16:28 silently deletes that hour's automatic 16:08
        // one — the operator's deliberate restore point replacing the
        // scheduled one instead of joining it. Like pre-restore snapshots
        // these exist only because a human asked for one, so their count is
        // bounded by clicks rather than by the clock.
        '--keep-tag', 'manual',
        '--keep-hourly',  String(cfg.keepHourly),
        '--keep-daily',   String(cfg.keepDaily),
        '--keep-weekly',  String(cfg.keepWeekly),
        '--keep-monthly', String(cfg.keepMonthly),
    ])
}

export async function runDbBackup(extraTags: string[] = []): Promise<void> {
    // Captured at entry so every status write below belongs to THIS run — see
    // writeOwnedStatus(). Null when called outside runAllBackups().
    const token = currentOperation
    const cfg = await readConfig()
    await writeOwnedStatus(token, { state: 'backing-up', message: 'Dumping database…', stage: 'db-dump' })
    try {
        await dumpDatabase(DB_DUMP_DIR)
        await writeOwnedStatus(token, { state: 'backing-up', message: 'Backing up to restic…', stage: 'db-store' })
        await resticBackup(DB_REPO, [DB_DUMP_DIR], 'db', extraTags)
        await writeOwnedStatus(token, { state: 'backing-up', message: 'Pruning old database backups…', stage: 'db-prune' })
        await resticForget(DB_REPO, cfg)
        await writeOwnedStatus(token, { state: 'idle' })
        console.log('[backups] DB backup complete')
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        await writeOwnedStatus(token, { state: 'idle', error: msg })
        console.error('[backups] DB backup failed:', msg)
        throw e
    } finally {
        await rm(DB_DUMP_DIR, { recursive: true, force: true }).catch(() => {})
    }
}

export async function runMediaBackup(extraTags: string[] = []): Promise<void> {
    const token = currentOperation // see runDbBackup()
    const cfg = await readConfig()
    await writeOwnedStatus(token, { state: 'backing-up', message: 'Backing up media…', stage: 'media-store' })
    try {
        // Always ensure the repo exists, even if there's nothing to back up
        // yet (a fresh clone has neither storage/gallery nor storage/uploads
        // until something is uploaded) — resticForget() below runs
        // unconditionally and throws on a repo that was never `restic init`'d.
        await ensureRepoInitialized(MEDIA_REPO)
        const paths = [GALLERY_DIR, UPLOADS_DIR].filter(existsSync)
        if (paths.length > 0) await resticBackup(MEDIA_REPO, paths, 'media', extraTags)
        await writeOwnedStatus(token, { state: 'backing-up', message: 'Pruning old media backups…', stage: 'media-prune' })
        await resticForget(MEDIA_REPO, cfg)
        await writeOwnedStatus(token, { state: 'idle' })
        console.log('[backups] Media backup complete')
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        await writeOwnedStatus(token, { state: 'idle', error: msg })
        console.error('[backups] Media backup failed:', msg)
        throw e
    }
}

// Taken automatically at the head of every restore path — issue #55's
// "a backup must be made before a backup is loaded". Deliberately NOT
// runAllBackups(): that writes { state: 'backing-up' } and owns the
// currentOperation guard, which would move the status out of 'reverting'
// mid-operation and confuse both the UI poll and every route's in-progress
// check. This keeps the whole restore looking like one continuous operation.
//
// Tagged 'pre-restore' in addition to the repo's usual tag, which is what
// resticForget()'s --keep-tag exempts from retention.
//
// Throws on any failure. Callers MUST let it propagate — a restore that
// cannot be undone is exactly what this exists to prevent.
export async function runSafetyBackup(): Promise<void> {
    const token = currentOperation // see runDbBackup()
    await writeOwnedStatus(token, { state: 'reverting', message: 'Creating safety backup…', stage: 'safety' })

    try {
        // A unique dir, NOT the shared DB_DUMP_DIR runDbBackup() uses. Those two
        // can genuinely overlap: the revert route reads status 'idle', then spends
        // seconds in listBackups() before revertToPoint() writes 'reverting', and
        // the hourly cron can start runAllBackups() inside that window. Sharing one
        // fixed path would mean both dumping into it while each also rm -rf's it —
        // and because resticBackup() tolerates exit code 3 ("some source files
        // unreadable"), the safety backup would report SUCCESS on a partial
        // snapshot and the restore would proceed with an undo that isn't one.
        // currentOperation below closes the same race from the other side; this
        // makes the two paths independent even if that guard is ever bypassed.
        // Same run tag on both halves as an ordinary backup, so a safety
        // backup appears in the timeline as one restore point rather than a
        // database row and a media row that happen to be adjacent.
        const extraTags = [`${RUN_TAG_PREFIX}${new Date().toISOString()}`, 'pre-restore']

        const dumpDir = await mkdtemp(join(tmpdir(), 'asot-safety-dump-'))
        try {
            await dumpDatabase(dumpDir)
            await resticBackup(DB_REPO, [dumpDir], 'db', extraTags)
        } finally {
            await rm(dumpDir, { recursive: true, force: true }).catch(() => {})
        }

        await ensureRepoInitialized(MEDIA_REPO)
        const paths = [GALLERY_DIR, UPLOADS_DIR].filter(existsSync)
        if (paths.length > 0) await resticBackup(MEDIA_REPO, paths, 'media', extraTags)
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
// seconds in listBackups() in between. This closes the window synchronously
// within this one Node process, which is all of them (server.mjs's cron trigger
// and every API route run in the same process).
//
// Backups skip when it's held; restores throw (see below) — a restore that
// silently no-ops would report success to a caller who then believes their data
// was rolled back.
//
// It holds an identity token rather than a boolean because cancelOperation()
// drops the guard while the operation it cancelled is still unwinding: the
// killed restic call has to travel back up through that operation's catch and
// finally, and a boolean would let those clobber the status of — and release
// the guard held by — whatever the operator started next. Comparing tokens
// makes every write from a superseded operation a no-op.
let currentOperation: symbol | null = null

// When the current operation started, and every stage it intends to run. Both
// belong to the operation rather than to any one status write — which is the
// point: writing a fresh startedAt per stage is what made the progress bar
// restart at each one.
let currentStartedAt: string | null = null
let currentPlan: BackupStage[] = []

// Returns null when another operation already holds the guard.
function beginOperation(label: string): symbol | null {
    if (currentOperation) return null
    currentOperation = Symbol(label)
    currentStartedAt = new Date().toISOString()
    currentPlan = []
    return currentOperation
}

function endOperation(token: symbol): void {
    if (currentOperation === token) {
        currentOperation = null
        currentStartedAt = null
        currentPlan = []
    }
}

// Declares the checkpoints this operation will pass through. Called once the
// operation knows its own shape (which parts are being restored, say).
function setPlan(stages: BackupStage[]): void {
    currentPlan = stages
}

// Status write scoped to one operation. A null token means "not running under
// the guard at all" (runDbBackup()/runMediaBackup() called directly rather
// than through runAllBackups()), which always writes.
//
// startedAt and plan are attached from the operation, never from the caller,
// so no individual stage can reset the clock.
async function writeOwnedStatus(
    token: symbol | null,
    s: { state: BackupStatus['state']; message?: string; stage?: string; error?: string },
): Promise<void> {
    if (token !== null && currentOperation !== token) return
    if (s.state === 'idle') {
        await writeStatus({ state: 'idle', error: s.error })
        return
    }
    await writeStatus({
        ...s,
        startedAt: currentStartedAt ?? new Date().toISOString(),
        plan: currentPlan.length > 0 ? currentPlan : undefined,
    })
}

// What the J4 Backups tab's Force Reset button is for. Kills the restic child
// the operation is blocked in, which unwinds it through its own catch/finally,
// and drops the guard immediately so the operator's next attempt is not
// silently skipped.
//
// Returns how many children were actually stopped: zero means the guard was
// held by something outside restic (a database dump, say) or by nothing at
// all — either way the guard is released, since this is the operator's
// deliberate escape hatch from a wedged operation.
export async function cancelOperation(): Promise<{ aborted: number }> {
    const children = [...runningRestic]
    runningRestic.clear()
    for (const child of children) {
        try { child.kill() } catch { /* already exited between the copy and here */ }
    }

    currentOperation = null
    await writeStatus({ state: 'idle', error: 'Operation cancelled by user.' })

    console.warn(`[backups] operation cancelled by user — stopped ${children.length} restic process(es)`)
    return { aborted: children.length }
}

// Runs both sequentially (see Global Constraints — they share one status
// file). Each side's failure is caught independently so DB issues don't
// block a media attempt or vice versa; if either failed, the combined
// error is what's left in status once both have finished (even though each
// function already wrote its own transient status/error along the way).
export async function runAllBackups(opts: { manual?: boolean } = {}): Promise<void> {
    const token = beginOperation('backup')
    if (!token) {
        console.warn('[backups] runAllBackups() called while an operation is already in progress — skipping')
        return
    }
    setPlan([
        { id: 'db-dump',     label: 'Dump database' },
        { id: 'db-store',    label: 'Store database' },
        { id: 'db-prune',    label: 'Prune database' },
        { id: 'media-store', label: 'Store media' },
        { id: 'media-prune', label: 'Prune media' },
    ])

    // Both halves of this run carry the same run tag, which is what lets
    // listBackups() pair the database and media snapshots into one restore
    // point instead of guessing from their timestamps. 'manual' additionally
    // exempts the run from retention (see resticForget) so a hand-made backup
    // is never deleted by the next hour's automatic one.
    const extraTags = [`${RUN_TAG_PREFIX}${new Date().toISOString()}`]
    if (opts.manual) extraTags.push('manual')
    try {
        const errors: string[] = []
        try { await runDbBackup(extraTags) } catch (e) { errors.push(`DB: ${e instanceof Error ? e.message : String(e)}`) }
        // Cancelled while the DB half was running: stop here rather than
        // starting the media half of an operation the operator has already
        // aborted (and which may by now be racing a fresh run).
        if (currentOperation !== token) {
            console.warn('[backups] run was cancelled — not starting the media backup')
            return
        }
        try { await runMediaBackup(extraTags) } catch (e) { errors.push(`Media: ${e instanceof Error ? e.message : String(e)}`) }
        if (errors.length > 0) await writeOwnedStatus(token, { state: 'idle', error: errors.join(' | ') })
    } finally {
        endOperation(token)
    }
}

// ── List ──────────────────────────────────────────────────────────────────────

export interface ResticSnapshotEntry {
    id: string
    time: string
    tags?: string[]
    // The absolute source paths this snapshot was taken from, in the platform
    // form of whatever created it — '/tmp/asot-db-dump' from the container,
    // 'C:\Users\...\asot-db-dump' from a Windows dev machine. resticRestore()
    // needs these to restore a subpath instead of the whole snapshot.
    paths?: string[]
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

function runIdOf(s: ResticSnapshotEntry): string | null {
    const tag = s.tags?.find(t => t.startsWith(RUN_TAG_PREFIX))
    return tag ? tag.slice(RUN_TAG_PREFIX.length) : null
}

// Pairs each run's database and media snapshots into one restore point.
//
// Grouping is by run tag, NOT by hour. Hour bucketing meant two backups in the
// same hour — an automatic one and a manual "Create Now" minutes later —
// collapsed into a single row showing only whichever came last, hiding a
// restore point that still existed. (Retention independently deleted the
// earlier one; see resticForget's --keep-tag manual.)
//
// Snapshots predating run tagging carry no such tag, so they fall back to the
// hour bucket that used to be the identity of every point — historical points
// keep the same ids and merge exactly as they always did.
//
// Exported for backups.listing.test.ts: this is pure, and the pairing rules
// are worth testing without standing up two restic repos.
export function buildBackupPoints(dbSnaps: ResticSnapshotEntry[], mediaSnaps: ResticSnapshotEntry[]): BackupPoint[] {
    const byRun = new Map<string, BackupPoint>()

    const absorb = (s: ResticSnapshotEntry, side: 'db' | 'media') => {
        const runId = runIdOf(s)
        // Normalised to UTC: restic records each snapshot's own offset, so
        // '+10:00' and 'Z' timestamps would otherwise sort against each other
        // lexicographically and interleave wrongly.
        const time = new Date(s.time).toISOString()
        const key = runId ?? `hour:${hourBucket(s.time)}`
        const point = byRun.get(key) ?? { id: runId ?? hourBucket(s.time), time }

        // The database half runs first, so the earlier timestamp is the moment
        // the operator actually asked for — show that, not when the media half
        // happened to finish.
        if (time < point.time) point.time = time

        if (side === 'db') {
            point.dbSnapshotId = s.id
            point.dbSizeBytes = s.summary?.total_bytes_processed
        } else {
            point.mediaSnapshotId = s.id
            point.mediaSizeBytes = s.summary?.total_bytes_processed
        }

        if (s.tags?.includes('pre-restore')) point.isSafety = true
        if (s.tags?.includes('manual')) point.isManual = true
        byRun.set(key, point)
    }

    for (const s of dbSnaps) absorb(s, 'db')
    for (const s of mediaSnaps) absorb(s, 'media')

    return [...byRun.values()].sort((a, b) => b.time.localeCompare(a.time))
}

export async function listBackups(): Promise<BackupPoint[]> {
    const [dbSnaps, mediaSnaps] = await Promise.all([
        resticSnapshots(DB_REPO),
        resticSnapshots(MEDIA_REPO),
    ])
    return buildBackupPoints(dbSnaps, mediaSnaps)
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

// Empties a directory's contents, leaving the directory itself in place.
//
// Not `rm(dir)` then recreate: GALLERY_DIR and UPLOADS_DIR live inside the
// `storage/` tree bind-mounted by docker-compose.yml, and removing a mount
// point detaches it — every later write would land on a path inside the
// container that nothing outside can see, and the failure would look like
// "uploads silently stopped appearing" rather than anything about a restore.
//
// A missing directory is not an error. A restore into a tree that does not
// exist yet has nothing to clear, and copyDirRecursive() creates it next.
async function emptyDir(dir: string): Promise<void> {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
        // rm removes a symlink itself, never what it points at — the same
        // rule copyDirRecursive() follows in the other direction.
        await rm(join(dir, entry), { recursive: true, force: true })
    }
}

// `wipeDatabase` drops every collection the LIVE database holds before the
// dump's are reinserted, so the result matches the backup rather than being
// the union of the two. Without it, only the collections the dump happens to
// contain are dropped — a collection created after the backup was taken
// survives a restore to a point before it existed. That is not hypothetical:
// a restore to a point predating the gallery media console carried no
// gallery_media.ejson, the files rolled back and the collection did not, and
// the J5 rail went on drawing folders that existed only in the database.
// runGalleryReconcile() cannot repair that — it matches files to records and
// never deletes or inserts.
//
// Defaults to false HERE, exactly as `wipeMedia` does in revertToPoint(): a
// programmatic caller that says nothing gets the non-destructive behaviour;
// only a caller that asked destroys data. The dashboard is what ticks it on.
async function restoreDatabase(dumpDir: string, wipeDatabase = false): Promise<void> {
    const mongoClient = new MongoClient(process.env.MONGO_URI!)
    try {
        await mongoClient.connect()
        const db = mongoClient.db(process.env.MONGO_DB!)
        const dbDir = join(dumpDir, 'db')
        const collectionNames = existsSync(dbDir)
            ? readdirSync(dbDir).filter(f => f.endsWith('.ejson')).map(f => f.slice(0, -6)).sort()
            : []

        /* The wipe sits INSIDE this guard for the same reason wipeMedia's sits
           inside `if (gallery)` in revertToPoint(): it runs only once a source
           to restore FROM has actually been located. `collectionNames` is
           non-empty only when the dump directory exists and holds .ejson
           files, so a dump that is empty, missing or unreadable cannot empty
           the live database and leave nothing to put back. This is the more
           dangerous of the two — a media wipe with no source leaves the
           gallery empty but the database intact, while a database wipe with no
           source is the whole application gone. */
        if (wipeDatabase && collectionNames.length > 0) {
            /* Every collection the live database reports, not the dump's list
               and not a hardcoded one: the entire point is to catch the
               collections nobody thought about, which is precisely the set a
               hardcoded list would miss. Same enumeration dumpDatabase() uses,
               so what a backup captures and what a wipe clears cannot drift. */
            const liveCollections = await db.listCollections({}, { nameOnly: true }).toArray()
            for (const info of liveCollections) {
                // The driver normally hides these, but a restore is the wrong
                // place to find out it did not: dropping an internal system.*
                // collection fails at best and corrupts the database's own
                // catalogue at worst.
                if (info.name.startsWith('system.')) continue
                // Swallowed like the per-collection drop below — a collection
                // that disappears between the listing and the drop is already
                // in the state this loop wanted it in.
                await db.collection(info.name).drop().catch(() => {})
            }
        }

        // Dropping a collection the wipe above already dropped is a no-op, so
        // the two passes do not need to know about each other.
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

// restic's `<snapshotId>:<subfolder>` form needs the subfolder written the way
// restic's own tree stores it: forward slashes, with a Windows drive letter as
// the first path node. 'C:\Users\koda\x' becomes '/C/Users/koda/x'; a POSIX
// path passes straight through. Handles either platform's paths regardless of
// which platform is doing the restoring, because a snapshot taken on a Windows
// dev box can be restored inside the Linux container and vice versa.
function toResticTreePath(sourcePath: string): string {
    return sourcePath.replace(/\\/g, '/').replace(/^([A-Za-z]):\//, '/$1/')
}

async function snapshotSourcePaths(repo: string, snapshotId: string): Promise<string[]> {
    const stdout = await runRestic(repo, ['snapshots', snapshotId, '--json'])
    const paths = (JSON.parse(stdout) as ResticSnapshotEntry[])[0]?.paths ?? []
    if (paths.length === 0) throw new Error(`Snapshot ${snapshotId} records no source paths to restore`)
    return paths
}

// Restores each of the snapshot's source paths into `<target>/<last segment>`,
// via restic's subfolder form, rather than restoring the snapshot whole.
//
// Restoring it whole makes restic recreate the ENTIRE original absolute path
// underneath the target. For a snapshot taken on Windows that means recreating
// a 'C:\Users' node and applying the real C:\Users ACL to it — after which
// restic can no longer set that directory's own timestamp, reports
// "failed to restore timestamp ... Access is denied" and exits fatal
// ("There were 1 errors"). Every download and every revert of a
// Windows-created snapshot failed on that, even though the file data itself
// restored fine. Restoring only the subpath never creates those parent nodes
// at all, so there is nothing to re-apply a hostile ACL to — and it fixes
// snapshots that already exist, since the paths come from the snapshot itself.
async function resticRestore(
    repo: string,
    snapshotId: string,
    target: string,
    // Restores only the source paths this accepts. Lets a scoped revert skip
    // restoring gigabytes it is not going to copy anywhere.
    wanted: (sourcePath: string) => boolean = () => true,
): Promise<void> {
    const sources = (await snapshotSourcePaths(repo, snapshotId)).filter(wanted)
    const used = new Set<string>()
    for (const source of sources) {
        const treePath = toResticTreePath(source)
        // Not path.basename(): it can't split a Windows path while running on
        // Linux (or vice versa). The normalised form always splits on '/'.
        let name = treePath.split('/').filter(Boolean).pop() ?? 'restored'
        // Two sources sharing a last segment would otherwise restore on top of
        // each other and silently merge.
        while (used.has(name)) name = `${name}_`
        used.add(name)
        await runRestic(repo, ['restore', `${snapshotId}:${treePath}`, '--target', join(target, name)])
    }
}

// The DB dump restores as a single directory holding manifest.json (named for
// whatever temp dir it was dumped from, which differs between the hourly
// backup and a safety backup) — walk down until manifest.json is found rather
// than assuming that name.
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

/**
 * Reconcile the gallery after a restore.
 *
 * A backup can be downloaded, reorganised in a file manager and re-uploaded —
 * that is the point of the readable content tree. This is what reads those
 * moves back in: a file carrying its media id is matched by it and takes the
 * operation of whichever folder it now sits in.
 *
 * Runs after a restore of the gallery tree OR of the database — rolling back
 * either half is what makes the two disagree.
 *
 * Never fatal. The restore itself has already succeeded by the time this runs,
 * and failing the whole operation because the index could not be refreshed
 * would report a successful restore as a failure. The report lands in
 * gallery_health either way, and it can be re-run by hand from the repo root's
 * `npm start` menu (Migrations -> Reconcile: gallery disk). There is no button
 * for it in the app yet: the Health view that will carry one is Plan B.
 *
 * The imports are dynamic rather than top-level ones: `lib/gallery/reconcile.ts`
 * reaches `lib/mongo.ts`, and a static import would pull a database connection
 * into this module at load time — lib/backups.roundtrip.test.ts boots its own
 * MongoMemoryServer and sets process.env.TEMP *before* importing backups.ts,
 * because DB_DUMP_DIR is derived from os.tmpdir() at module load. A top-level
 * `import './gallery/reconcile'` would run before that setup and connect to
 * whatever Mongo happens to be configured, or throw trying.
 */
async function runGalleryReconcile(): Promise<void> {
    try {
        const { reconcile } = await import('./gallery/reconcile')
        const Db = (await import('./mongo')).default

        // acceptsRealCollections() in reconcile.ts pins that a real
        // Collection<GalleryMedia> / Collection<Operation> satisfy
        // ReconcileDeps with no adapter and no cast — so the collections are
        // handed over as-is.
        const report = await reconcile({
            media: Db.galleryMedia,
            operations: Db.operations,
        })

        await Db.galleryHealth.replaceOne({}, report, { upsert: true })

        console.log(
            `[backups] gallery reconcile: ${report.scanned} scanned, ${report.relocated.length} relocated, ` +
            `${report.notIndexed.length} not indexed, ${report.missingFiles.length} missing`,
        )
    } catch (e: unknown) {
        console.error('[backups] gallery reconcile after restore failed:', e instanceof Error ? e.message : String(e))
    }
}

// ── Revert ────────────────────────────────────────────────────────────────────

export async function revertToPoint(
    point: BackupPoint,
    parts: readonly BackupPart[] = ALL_BACKUP_PARTS,
    // `wipeMedia` clears each restored media tree before copying into it, so
    // the result matches the backup rather than being the union of the two.
    // The database half has always worked this way — restoreDatabase() drops
    // each collection — so this closes the gap between them, and the dashboard
    // ticks it by default for that reason.
    //
    // `wipeDatabase` is the same idea one level deeper: it drops collections
    // the dump does not contain AT ALL, so the database matches the backup
    // rather than keeping whatever was created after it. See restoreDatabase().
    //
    // Both flags still default to false HERE. A programmatic caller that says
    // nothing should get the non-destructive behaviour; only a caller that
    // asked deletes files.
    opts: { wipeMedia?: boolean; wipeDatabase?: boolean } = {},
): Promise<void> {
    // Claimed before anything else, including the safety backup. Throws rather
    // than returning quietly: the caller is about to be told its restore began.
    const token = beginOperation('revert')
    if (!token) throw new Error('Another backup or restore operation is already in progress')

    // Only the stages this restore will actually run, so the checkpoints
    // reflect the chosen parts rather than a fixed list with dead steps in it.
    setPlan([
        { id: 'safety', label: 'Safety backup' },
        ...(point.dbSnapshotId && parts.includes('database') ? [{ id: 'db-restore', label: 'Restore database' }] : []),
        ...(point.mediaSnapshotId && (parts.includes('gallery') || parts.includes('uploads'))
            ? [{ id: 'media-restore', label: 'Restore media' }] : []),
    ])

    const tmp = join(tmpdir(), `asot-revert-${Date.now()}`)
    try {
        // Inside the try, so a writeStatus failure releases the guard via the
        // finally rather than wedging every later operation on a held guard.
        await writeOwnedStatus(token, { state: 'reverting', message: 'Preparing restore…', stage: 'safety' })

        // Must come first and must be allowed to throw — if this fails there
        // is no undo for what follows, so the restore does not happen.
        await runSafetyBackup()

        let restoredDatabase = false
        let restoredGallery = false

        if (point.dbSnapshotId && parts.includes('database')) {
            await writeOwnedStatus(token, { state: 'reverting', message: 'Restoring database…', stage: 'db-restore' })
            const dbTarget = join(tmp, 'db-restore')
            await resticRestore(DB_REPO, point.dbSnapshotId, dbTarget)
            const dumpRoot = findByMarker(dbTarget, 'manifest.json')
            await restoreDatabase(dumpRoot, opts.wipeDatabase)
            restoredDatabase = true
        }
        if (point.mediaSnapshotId && (parts.includes('gallery') || parts.includes('uploads'))) {
            await writeOwnedStatus(token, { state: 'reverting', message: 'Restoring media files…', stage: 'media-restore' })
            const mediaTarget = join(tmp, 'media-restore')
            // Restore only the trees being copied over: a gallery-only revert
            // shouldn't spend the time and disk to restore uploads as well.
            await resticRestore(MEDIA_REPO, point.mediaSnapshotId, mediaTarget, sourcePath => {
                const part = mediaPartOf(sourcePath)
                return part ? parts.includes(part) : false
            })
            const gallery = parts.includes('gallery') ? findDirNamed(mediaTarget, basename(GALLERY_DIR)) : null
            const uploads = parts.includes('uploads') ? findDirNamed(mediaTarget, basename(UPLOADS_DIR)) : null
            // The wipe sits INSIDE each guard deliberately. `gallery` is
            // non-null only once findDirNamed() has located a tree to copy
            // from, so a snapshot that turns out to hold no gallery cannot
            // empty the live one and leave nothing to put back.
            if (gallery) {
                if (opts.wipeMedia) await emptyDir(GALLERY_DIR)
                await copyDirRecursive(gallery, GALLERY_DIR)
            }
            if (uploads) {
                if (opts.wipeMedia) await emptyDir(UPLOADS_DIR)
                await copyDirRecursive(uploads, UPLOADS_DIR)
            }
            // `gallery`, not `parts.includes('gallery')`: that flag only means
            // the caller asked, while `gallery` also means the snapshot
            // actually held one (findDirNamed above). A media restore that
            // turns out to carry no gallery tree moved nothing to reconcile.
            restoredGallery = !!gallery
        }

        /* Either half moving is enough. The index and the disk are the two
           sides reconcile compares, so rolling back EITHER is what makes them
           disagree — and a database-only revert is the worst case, not an
           exempt one: gallery_media goes back to a dump taken before files
           were reorganised while the tree on disk stays current, so every tile
           whose file has moved since renders 404. Guarding on the gallery
           alone left exactly that revert unreconciled.

           Deliberately outside the media block and after both: reconcile
           compares the database against the disk, so it cannot run between the
           two being settled. */
        if (restoredGallery || restoredDatabase) await runGalleryReconcile()

        await writeOwnedStatus(token, { state: 'idle' })
        console.log(`[backups] Revert to ${point.id} complete`)
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        await writeOwnedStatus(token, { state: 'idle', error: msg })
        console.error('[backups] Revert failed:', msg)
        throw e
    } finally {
        await rm(tmp, { recursive: true, force: true }).catch(() => {})
        endOperation(token)
    }
}

// ── Download ──────────────────────────────────────────────────────────────────

// Decides what a tar entry from `restic dump` becomes inside the zip, or that
// it is dropped. Exported because it is the whole compatibility contract with
// safeExtractZip()/applyUploadedZip() reduced to one pure function.
//
// Symlinks and hardlinks are dropped: safeExtractZip() refuses symlink entries
// outright (they are a path-traversal vector in an untrusted upload), so
// emitting one would produce a disaster-recovery zip this app itself cannot
// ingest. The restore-to-disk version dropped them only as a side effect of
// copyDirRecursive() refusing to follow them; here the rule is explicit.
//
// `rename` is the one hook into that contract: the gallery download passes a
// function that puts the "{n}. " order prefix back onto an operation folder
// (lib/gallery/export-numbering.ts), because folders on disk no longer carry
// one and a zip is read in a file manager with nothing to sort it. It is
// applied HERE rather than at the call site so the renamed name is still the
// name this function returns — the compatibility contract has to cover the
// string that actually goes into the zip, not the one before the rewrite.
export function zipEntryNameFor(
    prefix: string,
    header: { name: string; type?: string | null },
    rename?: (name: string, isDirectory: boolean) => string,
): string | null {
    if (header.type === 'symlink' || header.type === 'link') return null
    if (header.type !== 'file' && header.type !== 'directory') return null
    const name = rename ? rename(header.name, header.type === 'directory') : header.name
    // restic emits paths relative to the dumped subfolder, so this is just a
    // prefix join — 'db/users.ejson' becomes 'db-source/db/users.ejson'.
    return `${prefix}/${name}`
}

// Streams one snapshot subtree out of restic and straight into the archive.
//
// `restic dump <id>:<subfolder> / --archive tar` writes that subtree to stdout
// as a tar, which is unpacked entry by entry and re-appended into the zip under
// `prefix`. Nothing is written to disk at any point.
function appendSnapshotSubtree(
    archive: Archiver,
    repo: string,
    snapshotId: string,
    sourcePath: string,
    prefix: string,
    rename?: (name: string, isDirectory: boolean) => string,
): Promise<void> {
    return new Promise<void>((resolveJob, reject) => {
        const child = spawn(
            resticPath(),
            ['-r', repo, 'dump', `${snapshotId}:${toResticTreePath(sourcePath)}`, '/', '--archive', 'tar'],
            { env: resticEnv(repo) },
        )

        let stderr = ''
        child.stderr.on('data', d => { stderr += d.toString() })

        const extract = tarExtract()
        extract.on('entry', (header, stream, next) => {
            const name = zipEntryNameFor(prefix, header, rename)
            if (!name) {
                // Still has to be drained, or tar-stream stalls on it.
                stream.on('end', next)
                stream.resume()
                return
            }
            if (header.type === 'directory') {
                archive.append(null as unknown as Buffer, { name: name.endsWith('/') ? name : `${name}/` })
                stream.on('end', next)
                stream.resume()
                return
            }
            // next() on 'end' is the flow control: archiver reads this entry
            // when it reaches it in its queue, so the tar is unpacked no faster
            // than the HTTP response drains it.
            archive.append(stream, { name })
            stream.on('end', next)
        })

        extract.on('error', reject)
        extract.on('finish', () => resolveJob())

        child.on('error', reject)
        child.on('close', code => {
            if (code !== 0) reject(new Error(stderr.trim() || `restic dump exited ${code}`))
        })

        child.stdout.pipe(extract)
    })
}

// Streams a zip of the point straight to the caller — shaped
// { db-source/, gallery/, uploads/ }, exactly what applyUploadedZip() expects,
// so a downloaded zip re-uploads and round-trips correctly.
//
// It touches no disk at all. Two earlier versions did: the original restored
// the snapshot (7GB on the current media set), copied it to a staging tree
// (another 7GB) and zipped that to disk (another ~7GB); the version after it
// dropped the copy and the zip file but still restored. Even that could not
// download a 7GB backup on a machine with 7GB free — the restore alone filled
// the disk, and on localhost the browser writes its copy to the same drive.
// Reading the snapshot as a tar stream removes the floor entirely: peak disk
// usage is zero, and the first bytes reach the client in about a second rather
// than after a multi-minute restore.
//
// The response carries no Content-Length in exchange (the size isn't knowable
// until it's built), so the browser shows an indeterminate progress bar.
//
// `galleryNumbering` is what puts the "{n}. " order prefix back onto the
// operation folders inside gallery/content — see lib/gallery/export-
// numbering.ts for the rules, and why an already-numbered folder must come
// out byte-identical. It is passed in rather than computed here because
// building it reads gallery_media, and lib/backups.ts must stay importable
// without a live Mongo connection (@/lib/mongo opens one at module load, and
// this module's own tests import it with no database at all). Omitted, the
// zip carries the folder names exactly as they sit on disk.
export async function openDownloadZipStream(
    point: BackupPoint,
    parts: readonly BackupPart[] = ALL_BACKUP_PARTS,
    opts: { galleryNumbering?: ReadonlyMap<string, string> } = {},
): Promise<ReadableStream<Uint8Array>> {
    // Resolved up front so a bad snapshot id still fails as a real HTTP error,
    // before any bytes commit the response.
    const jobs: {
        repo: string
        snapshotId: string
        sourcePath: string
        prefix: string
        rename?: (name: string, isDirectory: boolean) => string
    }[] = []

    if (point.dbSnapshotId && parts.includes('database')) {
        const [dbPath] = await snapshotSourcePaths(DB_REPO, point.dbSnapshotId)
        // Always 'db-source', never the dump directory's own name: the hourly
        // backup and a safety backup dump from differently-named temp dirs,
        // and applyUploadedZip() looks for exactly this name.
        jobs.push({ repo: DB_REPO, snapshotId: point.dbSnapshotId, sourcePath: dbPath, prefix: 'db-source' })
    }
    if (point.mediaSnapshotId && (parts.includes('gallery') || parts.includes('uploads'))) {
        for (const sourcePath of await snapshotSourcePaths(MEDIA_REPO, point.mediaSnapshotId)) {
            const part = mediaPartOf(sourcePath)
            // An unrecognised media path (the set of backed-up directories
            // changed since the snapshot was taken) is included only when the
            // caller asked for everything, so a narrowed request can never
            // quietly carry something it didn't name.
            if (part ? !parts.includes(part) : parts.length !== ALL_BACKUP_PARTS.length) continue
            // 'gallery' / 'uploads' — the live directory names, which are also
            // what applyUploadedZip() restores from.
            const prefix = toResticTreePath(sourcePath).split('/').filter(Boolean).pop() ?? 'media'
            /* Only the gallery subtree, and only when a numbering was built.
               uploads/ is department files with no operation folders in it,
               and numberContentEntry would refuse them anyway — but keying on
               the prefix says so rather than relying on that. */
            const numbering = opts.galleryNumbering
            const rename = prefix === 'gallery' && numbering && numbering.size
                ? (name: string, isDirectory: boolean) => numberContentEntry(name, isDirectory, numbering)
                : undefined
            jobs.push({ repo: MEDIA_REPO, snapshotId: point.mediaSnapshotId, sourcePath, prefix, rename })
        }
    }

    const archive = archiver('zip', { zlib: { level: 1 } })

    // Not awaited: these only progress as the HTTP response drains the archive,
    // so awaiting here would deadlock before the stream is ever returned.
    void (async () => {
        try {
            for (const job of jobs) {
                await appendSnapshotSubtree(archive, job.repo, job.snapshotId, job.sourcePath, job.prefix, job.rename)
            }
            await archive.finalize()
        } catch (e: unknown) {
            // Past this point the response is already committed, so the client
            // sees a truncated download rather than an error status — log it
            // server-side so the cause isn't invisible.
            const msg = e instanceof Error ? e.message : String(e)
            console.error('[backups] download stream failed:', msg)
            archive.destroy(e instanceof Error ? e : new Error(msg))
        }
    })()

    return Readable.toWeb(archive) as ReadableStream<Uint8Array>
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
// Exported so backups.archive.test.ts can assert that the zip this app
// produces is one this exact extractor accepts, rather than reimplementing the
// checks in the test and proving nothing.
export async function safeExtractZip(zipPath: string, destDir: string): Promise<void> {
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
export async function applyUploadedZip(
    zipPath: string,
    parts: readonly BackupPart[] = ALL_BACKUP_PARTS,
    // See revertToPoint() — same flags, same defaults, same reasoning.
    opts: { wipeMedia?: boolean; wipeDatabase?: boolean } = {},
): Promise<void> {
    // Same claim-first rule as revertToPoint().
    const token = beginOperation('upload-revert')
    if (!token) throw new Error('Another backup or restore operation is already in progress')

    // What the archive actually holds isn't known until it is extracted, so
    // this is the plan for the parts that were asked for.
    setPlan([
        { id: 'safety',  label: 'Safety backup' },
        { id: 'extract', label: 'Extract archive' },
        ...(parts.includes('database') ? [{ id: 'db-restore', label: 'Restore database' }] : []),
        ...(parts.includes('gallery') || parts.includes('uploads')
            ? [{ id: 'media-restore', label: 'Restore media' }] : []),
    ])

    const tmp = join(tmpdir(), `asot-upload-extract-${Date.now()}`)
    try {
        // Same rule as revertToPoint(): no safety backup, no restore.
        await runSafetyBackup()

        await writeOwnedStatus(token, { state: 'reverting', message: 'Extracting upload…', stage: 'extract' })
        await safeExtractZip(zipPath, tmp)

        const dbDir = join(tmp, 'db-source')
        const gallery = join(tmp, 'gallery')
        const uploads = join(tmp, 'uploads')
        // Present in the archive AND asked for. The two are checked separately
        // below so "the zip has no gallery" and "you chose not to restore the
        // gallery" stay distinguishable in the error case.
        const inZip = {
            database: existsSync(dbDir),
            gallery:  existsSync(gallery),
            uploads:  existsSync(uploads),
        }
        const hasDbSource = inZip.database && parts.includes('database')
        const hasGallery  = inZip.gallery  && parts.includes('gallery')
        const hasUploads  = inZip.uploads  && parts.includes('uploads')

        // Asked for parts that this archive simply does not contain — restoring
        // "nothing, successfully" is the failure mode this whole check exists
        // to prevent, so say which parts are missing rather than proceeding.
        if (!hasDbSource && !hasGallery && !hasUploads && (inZip.database || inZip.gallery || inZip.uploads)) {
            const present = ALL_BACKUP_PARTS.filter(p => inZip[p])
            throw new Error(
                `This ZIP contains no ${parts.join(', ')} to restore. It contains: ${present.join(', ')}.`
            )
        }

        if (!inZip.database && !inZip.gallery && !inZip.uploads) {
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
            await writeOwnedStatus(token, { state: 'reverting', message: 'Restoring database…', stage: 'db-restore' })
            await restoreDatabase(dbDir, opts.wipeDatabase)
        }

        await writeOwnedStatus(token, { state: 'reverting', message: 'Restoring media files…', stage: 'media-restore' })
        // Guarded by hasGallery/hasUploads, which already mean "in the archive
        // AND asked for" — so, as in revertToPoint(), nothing is emptied
        // unless there is a tree ready to replace it.
        if (hasGallery) {
            if (opts.wipeMedia) await emptyDir(GALLERY_DIR)
            await copyDirRecursive(gallery, GALLERY_DIR)
        }
        if (hasUploads) {
            if (opts.wipeMedia) await emptyDir(UPLOADS_DIR)
            await copyDirRecursive(uploads, UPLOADS_DIR)
        }

        /* Both the database and the media tree are settled by here — reconcile
           compares the two, so it cannot run between them.

           Either half moving is enough. `hasUploads` is excluded because
           uploads/ really is a separate tree (department files, not the
           content tree reconcile walks) — but the DATABASE is not separate at
           all: a db-source-only ZIP rolls gallery_media back to a dump taken
           before files were reorganised while the tree on disk stays current,
           which is the restore that leaves the index MOST out of step with the
           disk. Guarding on hasGallery alone left it the one restore that
           never reconciled, and every tile whose file had moved rendered 404. */
        if (hasGallery || hasDbSource) await runGalleryReconcile()

        await writeOwnedStatus(token, { state: 'idle' })
        console.log('[backups] Upload-revert complete')
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        await writeOwnedStatus(token, { state: 'idle', error: msg })
        console.error('[backups] Upload-revert failed:', msg)
        throw e
    } finally {
        await rm(tmp, { recursive: true, force: true }).catch(() => {})
        endOperation(token)
    }
}
