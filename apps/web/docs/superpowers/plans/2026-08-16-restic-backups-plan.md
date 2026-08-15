# Restic-Backed Backup System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the J4 Snapshots system's full-copy backups with a deduplicating restic-backed system — two restic repositories (DB, media), both hourly, both tiered-retention, replacing `lib/snapshots.ts` and everything under `app/api/snapshots/**`.

**Architecture:** `lib/backups.ts` shells out to a `restic` binary (resolved from `RESTIC_PATH`, a bundled `apps/web/bin/restic[.exe]`, or `PATH`) via `child_process.execFile`. Two independent repos at `storage/db-backups/` and `storage/media-backups/`, shared status/config metadata at `storage/backup-meta/`. Routes, cron, and UI all get renamed from "snapshots" to "backups" and rewired against the new module.

**Tech Stack:** Next.js 15 API routes, MongoDB driver, `archiver`/`unzipper` (already dependencies), Node's built-in `child_process`/`fetch`, restic (external binary, not an npm package).

**Spec:** `apps/web/docs/superpowers/specs/2026-08-16-restic-backups-design.md`

## Global Constraints

- Both restic repos use the SAME `RESTIC_PASSWORD` (from `.env`, shared secret convention — see `.env.template`'s other entries).
- Retention tiers, applied via `restic forget --prune` after every backup: `--keep-hourly 48 --keep-daily 14 --keep-weekly 8 --keep-monthly 12` — these are the `DEFAULT_BACKUP_CONFIG` values, editable later from the UI/config route.
- DB and media backups run **sequentially**, not concurrently — they share one status file (`storage/backup-meta/.status.json`), and sequential execution keeps "what's running right now" meaningful. Each side's failure is caught independently (see Task 2's `runAllBackups()`) so one failing doesn't block the other from attempting.
- Every route keeps the exact same permission gate as its snapshots predecessor: `PERMISSIONS.departments.j4` (via `client.hasRoles(me, PERMISSIONS.departments.j4)`), checked after `client.fetchMe()` — copy this pattern verbatim in every new route, do not introduce a different check.
- `storage/snapshots/` and its existing `.zip` files are left completely untouched — no migration, no deletion, no code referencing that directory in the new system.
- No unit test runner exists in this repo — Playwright against a real dev server is the only test tooling. Restic itself won't be installed in the Playwright test environment, so new route tests are **permission-gate-only** (verify 401/403), matching the established pattern for Discord-bot-token-dependent routes (see `tests/hidden-functions.spec.ts`'s `grant-all-roles` test) — do not attempt to exercise real backup/restore behavior in Playwright.
- `execFile` (never `exec`) for every restic invocation — args stay in an array, no shell interpolation.
- Every temp directory created by `lib/backups.ts` MUST be cleaned up in a `finally` block (`rm(path, { recursive: true, force: true }).catch(() => {})`), even on error paths — these are backup/restore code paths that will run unattended via cron; leaked temp dirs are a slow disk leak that's easy to miss.

---

### Task 1: Restic binary provisioning

**Files:**
- Create: `scripts/ensure-restic.mjs`
- Modify: `scripts/start.mjs` (add a `SETUP_ITEMS` entry)
- Modify: `package.json` (root) — `install:all` script
- Modify: `.env.template` — add `RESTIC_PASSWORD`
- Modify: `.env` (local, gitignored) — generate and write a real value

**Interfaces:**
- Produces: `apps/web/bin/restic[.exe]` on disk after running (consumed by Task 2's `resticPath()`).
- Produces: `RESTIC_PASSWORD` in the local `.env` (consumed by every restic invocation in Task 2/3).

- [ ] **Step 1: Write the provisioning script**

Create `scripts/ensure-restic.mjs`:

```js
// One-off setup: downloads the restic binary for the current OS/arch into
// apps/web/bin/, if it isn't already there. Safe to re-run — no-ops if the
// binary already exists. Mirrors the zero-manual-steps precedent sharp's own
// postinstall already sets in this repo (see apps/web/package.json).
//
// Only needed for native/Windows-style dev — the Docker image installs
// restic via `apk add restic` instead (see apps/web/Dockerfile).
//
// Usage: node scripts/ensure-restic.mjs

import { existsSync, mkdirSync, createWriteStream, createReadStream, chmodSync, readdirSync, rmSync, renameSync } from 'fs'
import { join, resolve } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const BIN_DIR = resolve('apps/web/bin')
const BINARY_NAME = process.platform === 'win32' ? 'restic.exe' : 'restic'
const BINARY_PATH = join(BIN_DIR, BINARY_NAME)

async function main() {
    if (existsSync(BINARY_PATH)) {
        console.log(`[restic] Already present at ${BINARY_PATH} — nothing to do.`)
        return
    }

    console.log('[restic] Looking up latest release…')
    const releaseRes = await fetch('https://api.github.com/repos/restic/restic/releases/latest')
    if (!releaseRes.ok) throw new Error(`GitHub API request failed: ${releaseRes.status}`)
    const release = await releaseRes.json()

    const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux'
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
    const ext = platform === 'windows' ? 'zip' : 'bz2'

    const asset = release.assets.find(a => a.name.includes(`_${platform}_${arch}.${ext}`))
    if (!asset) throw new Error(`No restic release asset found for ${platform}_${arch} (looked in ${release.tag_name})`)

    console.log(`[restic] Downloading ${asset.name}…`)
    mkdirSync(BIN_DIR, { recursive: true })
    const downloadRes = await fetch(asset.browser_download_url)
    if (!downloadRes.ok || !downloadRes.body) throw new Error(`Download failed: ${downloadRes.status}`)

    if (platform === 'windows') {
        const tmpZip = join(BIN_DIR, 'restic-download.zip')
        await pipeline(Readable.fromWeb(downloadRes.body), createWriteStream(tmpZip))
        // Expand-Archive is built into every supported Windows version — avoids
        // needing a zip-extraction npm dependency just for this one-off script.
        await execFileAsync('powershell.exe', [
            '-NoProfile', '-Command',
            `Expand-Archive -Path "${tmpZip}" -DestinationPath "${BIN_DIR}" -Force`,
        ])
        rmSync(tmpZip, { force: true })
        const extracted = readdirSync(BIN_DIR).find(f => /^restic.*\.exe$/i.test(f) && f !== BINARY_NAME)
        if (!extracted) throw new Error('Expand-Archive did not produce a restic .exe')
        renameSync(join(BIN_DIR, extracted), BINARY_PATH)
    } else {
        const tmpBz2 = join(BIN_DIR, 'restic-download.bz2')
        await pipeline(Readable.fromWeb(downloadRes.body), createWriteStream(tmpBz2))
        await execFileAsync('bunzip2', ['-f', tmpBz2])
        renameSync(tmpBz2.replace(/\.bz2$/, ''), BINARY_PATH)
        chmodSync(BINARY_PATH, 0o755)
    }

    console.log(`[restic] Installed to ${BINARY_PATH}`)
}

main().catch(err => { console.error('[restic] Setup failed:', err.message); process.exit(1) })
```

- [ ] **Step 2: Verify it runs standalone**

Run: `node scripts/ensure-restic.mjs`
Expected: downloads and installs `apps/web/bin/restic.exe` (on the Windows dev machine this runs on), then a second run prints "Already present" and exits immediately without downloading again.

Run: `apps/web/bin/restic.exe version`
Expected: prints a restic version string, confirming the binary actually works.

- [ ] **Step 3: Wire into `scripts/start.mjs`'s Setup menu**

In `scripts/start.mjs`, find `SETUP_ITEMS` (currently starts around the `📦 Install All Dependencies` entry) and add one entry:

```js
const SETUP_ITEMS = [
    { label: '📦 Install All Dependencies', command: 'npm', args: ['run', 'install:all'] },
    { label: '🔐 Ensure Restic Binary', command: 'node', args: ['scripts/ensure-restic.mjs'] },
    { label: '🧙 Run First-time Setup', command: 'node', args: ['apps/web/scripts/init-db.mjs'] },
    { label: '🗺️ Generate Terrain', command: 'node', args: ['scripts/generate-terrain.mjs'], opts: { cwd: WEB } },
    { label: '🧹 Lint Website', command: 'npm', args: ['exec', '--', 'next', 'lint'], opts: { cwd: WEB } },
    // `start ""` — the empty string is the (unused) window title `start` expects
    // as its first argument; without it, a quoted path gets misread as one.
    { label: '📊 View Site Flow Chart', command: 'cmd', args: ['/c', 'start', '', join(WEB, 'docs', 'site-flow.html')] },
]
```

(Only the new `🔐 Ensure Restic Binary` line is added — the rest of the array is unchanged, shown here for placement context.)

- [ ] **Step 4: Also run it automatically from `install:all`**

In the root `package.json`, change:

```json
"install:all": "npm install && npm --prefix apps/web install",
```

to:

```json
"install:all": "npm install && npm --prefix apps/web install && node scripts/ensure-restic.mjs",
```

- [ ] **Step 5: Add `RESTIC_PASSWORD` to `.env.template`**

In `.env.template`, under the `# ── apps/web only` section, add near the other secrets (after the `TS_SERVERADMIN_PASSWORD` line):

```
# Backups (restic)
RESTIC_PASSWORD=XXXXXXXXXXXXXXXXXXX
```

- [ ] **Step 6: Generate a real password into the local `.env`**

Run (prints a random 32-byte base64 string):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Add the printed value to the local `.env` file as `RESTIC_PASSWORD=<value>`. This is dev-environment-only — the production server's own `.env` needs the same treatment separately at deploy time (flag this to the user at the end of the plan; it isn't something this branch's code can do for the live server).

- [ ] **Step 7: Commit**

```bash
git add scripts/ensure-restic.mjs scripts/start.mjs package.json .env.template
git commit -m "feat(backups): add restic binary provisioning for dev setup"
```

(`.env` itself is gitignored — do not add it.)

---

### Task 2: `lib/backups.ts` — status/config + backup creation

**Files:**
- Create: `apps/web/lib/backups.ts`

**Interfaces:**
- Consumes: `apps/web/bin/restic[.exe]` from Task 1 (via `resticPath()`), `RESTIC_PASSWORD` env var.
- Produces (all exported, consumed by Task 3 and Task 4): `DB_REPO`, `MEDIA_REPO`, `META_DIR`, `GALLERY_DIR`, `UPLOADS_DIR`, `BackupConfig`, `DEFAULT_BACKUP_CONFIG`, `BackupStatus`, `BackupPoint`, `ensureMetaDir()`, `readStatus()`, `writeStatus()`, `readConfig()`, `writeConfig()`, `runDbBackup()`, `runMediaBackup()`, `runAllBackups()`, `listBackups()`.
- Also produces internal (not exported, but Task 3 lives in the same file and needs them): `resticPath()`, `runRestic()`, `ensureRepoInitialized()`.

- [ ] **Step 1: Write the module**

Create `apps/web/lib/backups.ts`:

```ts
import { resolve, join } from 'path'
import { existsSync, mkdirSync, createWriteStream } from 'fs'
import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { EJSON } from 'bson'
import { MongoClient, FindCursor } from 'mongodb'

const execFileAsync = promisify(execFile)

// ── Constants ─────────────────────────────────────────────────────────────────

export const DB_REPO     = resolve('../../storage/db-backups')
export const MEDIA_REPO  = resolve('../../storage/media-backups')
export const META_DIR    = resolve('../../storage/backup-meta')
export const STATUS_FILE = join(META_DIR, '.status.json')
export const CONFIG_FILE = join(META_DIR, '.config.json')
export const GALLERY_DIR = resolve('../../storage/gallery')
export const UPLOADS_DIR = resolve('../../storage/uploads')

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
    return {
        ...process.env,
        RESTIC_REPOSITORY: repo,
        RESTIC_PASSWORD: process.env.RESTIC_PASSWORD ?? '',
    }
}

async function runRestic(repo: string, args: string[]): Promise<string> {
    try {
        const { stdout } = await execFileAsync(resticPath(), args, {
            env: resticEnv(repo),
            maxBuffer: 1024 * 1024 * 64, // 64MB — snapshot lists / backup summaries can be large
        })
        return stdout
    } catch (e: unknown) {
        const err = e as { stderr?: string; message?: string }
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

// ── Database dump (streamed, same approach lib/snapshots.ts used) ──────────────

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

async function resticBackup(repo: string, paths: string[], tag: string): Promise<string> {
    await ensureRepoInitialized(repo)
    const stdout = await runRestic(repo, ['backup', ...paths, '--tag', tag, '--json'])
    const summary = stdout.trim().split('\n').filter(Boolean)
        .map(line => JSON.parse(line) as { message_type?: string })
        .find((entry): entry is ResticBackupSummary => entry.message_type === 'summary')
    if (!summary) throw new Error('restic backup produced no summary line')
    return summary.snapshot_id
}

async function resticForget(repo: string, cfg: BackupConfig): Promise<void> {
    await runRestic(repo, [
        'forget', '--prune',
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

// Runs both sequentially (see Global Constraints — they share one status
// file). Each side's failure is caught independently so DB issues don't
// block a media attempt or vice versa; if either failed, the combined
// error is what's left in status once both have finished (even though each
// function already wrote its own transient status/error along the way).
export async function runAllBackups(): Promise<void> {
    const errors: string[] = []
    try { await runDbBackup() } catch (e) { errors.push(`DB: ${e instanceof Error ? e.message : String(e)}`) }
    try { await runMediaBackup() } catch (e) { errors.push(`Media: ${e instanceof Error ? e.message : String(e)}`) }
    if (errors.length > 0) await writeStatus({ state: 'idle', error: errors.join(' | ') })
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors (Task 3 adds more to this same file next — this step just confirms Task 2's portion alone is sound).

- [ ] **Step 3: Manual smoke test against real restic**

With `apps/web/bin/restic.exe` present (Task 1) and `RESTIC_PASSWORD`/`MONGO_URI`/`MONGO_DB` set in `.env`, run this from `apps/web`:

```bash
node --env-file=../../.env -e "
require('ts-node/register');
const { runDbBackup, listBackups } = require('./lib/backups.ts');
runDbBackup().then(() => listBackups()).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e); process.exit(1) });
"
```

(If `ts-node` isn't available, temporarily add a throwaway `.mjs` test script instead that imports the compiled output, or run it via the dev server + a temporary debug route — whichever is fastest to iterate on. This step exists to catch a real restic-invocation bug before Task 3 builds on top of it, not to leave permanent test tooling behind.)

Expected: a `storage/db-backups/` directory appears with restic's repo structure inside, and the printed list shows one `BackupPoint` with a `dbSnapshotId` set and no `mediaSnapshotId`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/backups.ts
git commit -m "feat(backups): add restic-backed backup creation and listing"
```

---

### Task 3: `lib/backups.ts` — revert, download, upload

**Files:**
- Modify: `apps/web/lib/backups.ts` (same file Task 2 created)

**Interfaces:**
- Consumes: everything Task 2 exported/defined in the same file (`DB_REPO`, `MEDIA_REPO`, `GALLERY_DIR`, `UPLOADS_DIR`, `writeStatus`, `runRestic` — note `runRestic` is not exported but is in-scope since this is the same file).
- Produces (exported, consumed by Task 4): `revertToPoint(point: BackupPoint): Promise<void>`, `buildDownloadZip(point: BackupPoint): Promise<string>`, `applyUploadedZip(zipPath: string): Promise<void>`.

- [ ] **Step 1: Add the restore helpers and functions**

Append to `apps/web/lib/backups.ts` (add these imports to the existing import block at the top of the file, then add the new code below the `listBackups` function):

Add to the top-of-file imports:
```ts
import { existsSync, mkdirSync, createWriteStream, createReadStream, readdirSync } from 'fs'
import { readFile, writeFile, mkdir, rm, copyFile } from 'fs/promises'
import { basename } from 'path'
import { createInterface } from 'readline'
import archiver from 'archiver'
import unzipper from 'unzipper'
```

(This replaces Task 2's narrower import lines for `fs`/`fs/promises`/`path` with the superset needed once restore logic is added — merge them into single `import { ... } from 'fs'` / `import { ... } from 'fs/promises'` / `import { resolve, join, basename } from 'path'` lines rather than duplicating import statements for the same module.)

Append this new code at the end of the file:

```ts
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

        return zipPath
    } finally {
        await rm(tmp, { recursive: true, force: true }).catch(() => {})
    }
}

// ── Upload ────────────────────────────────────────────────────────────────────

// Extracts an uploaded zip straight onto disk — bypasses restic entirely, does
// not feed the upload into either repo's history. Matches buildDownloadZip's
// { db-source/, gallery/, uploads/ } shape.
export async function applyUploadedZip(zipPath: string): Promise<void> {
    const tmp = join(tmpdir(), `asot-upload-extract-${Date.now()}`)
    await writeStatus({ state: 'reverting', startedAt: new Date().toISOString(), message: 'Extracting upload…' })
    try {
        await pipeline(
            createReadStream(zipPath),
            unzipper.Extract({ path: tmp })
        ).catch((e: unknown) => {
            if (e instanceof Error && e.message === 'Premature close') return
            throw e
        })

        const dbDir = join(tmp, 'db-source')
        if (existsSync(dbDir)) {
            await writeStatus({ state: 'reverting', startedAt: new Date().toISOString(), message: 'Restoring database…' })
            await restoreDatabase(dbDir)
        }

        await writeStatus({ state: 'reverting', startedAt: new Date().toISOString(), message: 'Restoring media files…' })
        const gallery = join(tmp, 'gallery')
        const uploads = join(tmp, 'uploads')
        if (existsSync(gallery)) await copyDirRecursive(gallery, GALLERY_DIR)
        if (existsSync(uploads)) await copyDirRecursive(uploads, UPLOADS_DIR)

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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors. Pay particular attention to the merged import lines from Step 1 — duplicate imports from the same module (e.g. two separate `import { ... } from 'fs'` lines) are a TS/lint error, not just untidy; make sure Task 2's original import lines were actually replaced, not left alongside the new ones.

- [ ] **Step 3: Manual round-trip smoke test**

Using the same real-restic setup as Task 2 Step 3: run `runDbBackup()`, change a small piece of test data in Mongo, then `revertToPoint()` against the `BackupPoint` `listBackups()` returned before the change, and confirm the data reverted. This is the highest-risk code in the whole plan (it drops real collections) — do this against a local/dev Mongo instance, never production, and confirm the revert actually worked by reading the collection back afterward.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/backups.ts
git commit -m "feat(backups): add restic-backed revert, download, and upload"
```

---

### Task 4: API routes

**Files:**
- Create: `apps/web/app/api/backups/route.ts`
- Create: `apps/web/app/api/backups/create/route.ts`
- Create: `apps/web/app/api/backups/revert/route.ts`
- Create: `apps/web/app/api/backups/[id]/download/route.ts`
- Create: `apps/web/app/api/backups/upload/route.ts`
- Create: `apps/web/app/api/backups/cancel/route.ts`
- Create: `apps/web/app/api/backups/config/route.ts`
- Create: `apps/web/app/api/cron/backups/route.ts`
- Delete: `apps/web/app/api/snapshots/` (entire directory — `route.ts`, `create/`, `revert/`, `[filename]/`, `upload/`, `cancel/`, `config/`)
- Delete: `apps/web/app/api/cron/snapshots/route.ts`
- Delete: `apps/web/lib/snapshots.ts`

**Interfaces:**
- Consumes: every export from `apps/web/lib/backups.ts` (Tasks 2+3).
- Produces: the HTTP surface Task 6's UI calls against.

- [ ] **Step 1: List route**

Create `apps/web/app/api/backups/route.ts`:

```ts
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { listBackups, readStatus } from '@/lib/backups'

// GET /api/backups — merged backup timeline + current operation status (J4 only)
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [points, status] = await Promise.all([listBackups(), readStatus()])
    return NextResponse.json({ points, status })
}
```

- [ ] **Step 2: Create (manual trigger) route**

Create `apps/web/app/api/backups/create/route.ts`:

```ts
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { readStatus, runAllBackups } from '@/lib/backups'

// POST /api/backups/create — trigger a background backup of both repos (J4 only)
export async function POST() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const status = await readStatus()
    if (status.state !== 'idle') {
        return NextResponse.json({ error: `Operation already in progress: ${status.state}` }, { status: 409 })
    }

    // Fire and forget — returns immediately, backup runs in background
    runAllBackups().catch(e => console.error('[backups] Manual create error:', e.message))

    return NextResponse.json({ message: 'Backup started' }, { status: 202 })
}
```

- [ ] **Step 3: Revert route**

Create `apps/web/app/api/backups/revert/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { readStatus, revertToPoint, listBackups } from '@/lib/backups'

const ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/

// POST /api/backups/revert — revert to a merged backup point (J4 only)
// Body: { id: string } — an hour-bucket ISO string from GET /api/backups
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { id } = body as { id?: string }
    if (!id || !ID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const status = await readStatus()
    if (status.state !== 'idle') {
        return NextResponse.json({ error: `Operation already in progress: ${status.state}` }, { status: 409 })
    }

    // Resolve the id back to a real BackupPoint server-side — never trust a
    // client-supplied snapshot id directly.
    const points = await listBackups()
    const point = points.find(p => p.id === id)
    if (!point) return NextResponse.json({ error: 'Backup point not found' }, { status: 404 })

    // Fire and forget
    revertToPoint(point).catch(e => console.error('[backups] Revert error:', e.message))

    return NextResponse.json({ message: 'Revert started' }, { status: 202 })
}
```

- [ ] **Step 4: Download route**

Create `apps/web/app/api/backups/[id]/download/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { statSync, createReadStream } from 'fs'
import { unlink } from 'fs/promises'
import { Readable } from 'stream'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { listBackups, buildDownloadZip } from '@/lib/backups'

const ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/

// GET /api/backups/[id]/download — restore a backup point to a temp zip and stream it (J4 only)
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!ID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const points = await listBackups()
    const point = points.find(p => p.id === id)
    if (!point) return NextResponse.json({ error: 'Backup point not found' }, { status: 404 })

    let zipPath: string
    try {
        zipPath = await buildDownloadZip(point)
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: `Failed to build download: ${msg}` }, { status: 500 })
    }

    const { size } = statSync(zipPath)
    const nodeStream = createReadStream(zipPath)
    // Delete the temp zip once fully streamed (success or client abort) — it
    // was only ever needed for this one response.
    nodeStream.on('close', () => { unlink(zipPath).catch(() => {}) })
    const webStream = Readable.toWeb(nodeStream) as ReadableStream

    return new NextResponse(webStream, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="backup-${id.replace(/:/g, '-')}.zip"`,
            'Content-Length': String(size),
        },
    })
}
```

- [ ] **Step 5: Upload route**

Create `apps/web/app/api/backups/upload/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { readStatus, applyUploadedZip } from '@/lib/backups'

// POST /api/backups/upload — upload a backup ZIP and revert to it (J4 only)
// Note: large uploads are buffered in memory via arrayBuffer(). Ensure the
// server runs with --max-old-space-size set appropriately for expected sizes.
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const status = await readStatus()
    if (status.state !== 'idle') {
        return NextResponse.json({ error: `Operation already in progress: ${status.state}` }, { status: 409 })
    }

    let formData: FormData
    try {
        formData = await request.formData()
    } catch {
        return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 })
    }

    const file = formData.get('backup') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded (field name: "backup")' }, { status: 400 })
    if (!file.name.endsWith('.zip')) {
        return NextResponse.json({ error: 'File must be a .zip archive' }, { status: 400 })
    }

    const uploadDir = join(tmpdir(), 'asot-backup-uploads')
    await mkdir(uploadDir, { recursive: true })
    const tmpPath = join(uploadDir, `upload-${Date.now()}.zip`)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(tmpPath, buffer)

    // Fire and forget; delete the tmp file after revert completes
    applyUploadedZip(tmpPath)
        .finally(() => unlink(tmpPath).catch(() => {}))
        .catch(e => console.error('[backups] Upload-revert error:', e.message))

    return NextResponse.json({ message: 'Upload received, revert started' }, { status: 202 })
}
```

- [ ] **Step 6: Cancel route**

Create `apps/web/app/api/backups/cancel/route.ts`:

```ts
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { writeStatus } from '@/lib/backups'

// POST /api/backups/cancel — force-reset a stuck in-progress operation (J4 only)
export async function POST() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await writeStatus({ state: 'idle', error: 'Operation cancelled by user.' })
    return NextResponse.json({ message: 'Status reset to idle.' })
}
```

- [ ] **Step 7: Config route**

Create `apps/web/app/api/backups/config/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { readConfig, writeConfig } from '@/lib/backups'
import type { BackupConfig } from '@/lib/backups'

// GET /api/backups/config — read current backup config (J4 only)
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const config = await readConfig()
    return NextResponse.json(config)
}

// PATCH /api/backups/config — update backup config (J4 only)
export async function PATCH(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as Partial<BackupConfig>
    const current = await readConfig()

    const updated: BackupConfig = {
        autoEnabled:  typeof body.autoEnabled  === 'boolean' ? body.autoEnabled  : current.autoEnabled,
        keepHourly:   typeof body.keepHourly   === 'number'  ? Math.max(1, Math.min(200, body.keepHourly))  : current.keepHourly,
        keepDaily:    typeof body.keepDaily    === 'number'  ? Math.max(1, Math.min(90,  body.keepDaily))   : current.keepDaily,
        keepWeekly:   typeof body.keepWeekly   === 'number'  ? Math.max(1, Math.min(52,  body.keepWeekly))  : current.keepWeekly,
        keepMonthly:  typeof body.keepMonthly  === 'number'  ? Math.max(1, Math.min(60,  body.keepMonthly)) : current.keepMonthly,
    }

    await writeConfig(updated)
    return NextResponse.json(updated)
}
```

- [ ] **Step 8: Cron route**

Create `apps/web/app/api/cron/backups/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { readStatus, readConfig, runAllBackups } from '@/lib/backups'
import { verifyCronSecret } from '@/lib/cron-auth'

/**
 * GET /api/cron/backups
 *
 * Runs both backup repos (DB, media) according to the configured schedule.
 * Called hourly by the server.mjs scheduler; skips if auto-backups are
 * disabled or an operation is already in progress. Can also be triggered
 * externally via Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const config = await readConfig()
    if (!config.autoEnabled) {
        return NextResponse.json({ skipped: true, reason: 'Auto-backups disabled' })
    }

    const status = await readStatus()
    if (status.state !== 'idle') {
        return NextResponse.json({ skipped: true, reason: `Operation already in progress: ${status.state}` })
    }

    // Fire and forget
    runAllBackups().catch(e => console.error('[backups] Cron error:', e.message))

    return NextResponse.json({ message: 'Backup started' })
}
```

- [ ] **Step 9: Delete the old snapshots surface**

```bash
git rm -r apps/web/app/api/snapshots
git rm apps/web/app/api/cron/snapshots/route.ts
git rm apps/web/lib/snapshots.ts
```

- [ ] **Step 10: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors — in particular, no leftover references to `@/lib/snapshots` anywhere (Task 6 handles the UI's import; grep for `lib/snapshots` across `apps/web` to confirm nothing else references it before finishing this task).

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/api/backups apps/web/app/api/cron/backups
git commit -m "feat(backups): add API routes, remove old snapshots routes"
```

---

### Task 5: Docker, dev scheduler, and storage docs

**Files:**
- Modify: `apps/web/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `apps/web/server.mjs`
- Modify: `storage/README.md`

**Interfaces:**
- No code interfaces — this task is deployment/ops plumbing consumed only by the running server itself, not by other tasks.

- [ ] **Step 1: Install restic in the Docker image**

In `apps/web/Dockerfile`, add the restic install right after the existing npm version pin (so it's near the top, cached independently of later `COPY` layers):

```dockerfile
RUN npm install -g npm@11

# restic — content-addressed backup tool used by lib/backups.ts. Alpine ships
# it directly in its package repo.
RUN apk add --no-cache restic
```

- [ ] **Step 2: Bind-mount the new storage subfolders**

In `docker-compose.yml`, add three lines to the `web` service's `volumes` list, alongside the existing `storage/snapshots` mount (which stays — see the design spec's Migration section, nothing there changes):

```yaml
      - ./storage/snapshots:/app/storage/snapshots
      - ./storage/db-backups:/app/storage/db-backups
      - ./storage/media-backups:/app/storage/media-backups
      - ./storage/backup-meta:/app/storage/backup-meta
```

(Only the three new lines are additions — `storage/snapshots` is shown for placement context, it already exists in the file.)

- [ ] **Step 3: Change the scheduler from daily-3am to hourly**

In `apps/web/server.mjs`, find the `// ── Snapshot scheduler (every 2 days at 3am) ──` section and replace it entirely:

```js
// ── Backup scheduler (hourly) ─────────────────────────────────────────────────

async function triggerScheduledBackup() {
    await trackJob('cron:backups', async () => {
        try {
            const res = await fetch(`http://localhost:${port}/api/cron/backups`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
            const data = await res.json()
            console.log('[backups] Scheduled backup triggered:', data)
        } catch (e) {
            console.error('[backups] Scheduled backup error:', e.message)
        }
    })
}

triggerScheduledBackup()
setInterval(triggerScheduledBackup, 60 * 60 * 1000)
console.log('[backups] Auto-backup check runs hourly')
```

This replaces the old `msUntilNext3am()`-based alignment entirely — hourly runs don't need to align to a specific clock time, so the initial `setTimeout(..., msUntilNext3am())` wrapper goes away along with the `msUntilNext3am` helper function itself (delete it — check first that nothing else in `server.mjs` still calls it; the TeamSpeak daily snapshot section below it uses its own separate logic and doesn't reference this helper, but confirm with a grep before deleting).

- [ ] **Step 4: Update storage docs**

In `storage/README.md`, under `## Layout`, add two lines after the existing `gallery/`, `milpacs/`, `uploads/`, `snapshots/` bullet:

```markdown
- `db-backups/`, `media-backups/` — restic repositories (deduplicating, hourly,
  tiered retention) backing the J4 dashboard's Backups tab. `backup-meta/`
  holds the shared status/retention-config files for both. `snapshots/` is the
  older full-copy system these replaced — left in place, untouched, no longer
  written to.
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/Dockerfile docker-compose.yml apps/web/server.mjs storage/README.md
git commit -m "feat(backups): wire restic into Docker, dev scheduler, and storage docs"
```

---

### Task 6: UI — `BackupsTab`

**Files:**
- Create: `apps/web/app/dashboard/j4/BackupsTab.tsx`
- Modify: `apps/web/app/dashboard/j4/J4AdminPanel.tsx`
- Delete: `apps/web/app/dashboard/j4/SnapshotsTab.tsx`

**Interfaces:**
- Consumes: `GET /api/backups`, `POST /api/backups/create`, `POST /api/backups/revert`, `GET /api/backups/[id]/download`, `POST /api/backups/upload`, `POST /api/backups/cancel`, `GET`/`PATCH /api/backups/config` (Task 4).

- [ ] **Step 1: Build the new tab component**

`apps/web/app/dashboard/j4/SnapshotsTab.tsx` has a `ConfirmDialog`, a progress banner with elapsed/estimate tracking, and a settings panel — all of that UI machinery is unchanged in shape and should be ported verbatim (same component structure, same visual styling, same `localStorage`-based duration estimation). Three things actually change:

1. `CreateSnapshotDialog` (the per-content-type checkbox picker) is deleted entirely — "Create Backup Now" becomes a single action with no dialog, since restic backs up everything every run.
2. The flat snapshot list (`snapshots.map(...)` grid) becomes a merged timeline over `BackupPoint[]`, one row per hour bucket, showing which side(s) (DB/media) are present.
3. The settings panel's `maxSnapshots`/`intervalDays` controls are replaced by four number steppers (`keepHourly`/`keepDaily`/`keepWeekly`/`keepMonthly`) plus the same `autoEnabled` ON/OFF toggle.

Create `apps/web/app/dashboard/j4/BackupsTab.tsx` starting from a copy of `SnapshotsTab.tsx`, then apply these edits:

- Delete the `BackupRow`/`BACKUP_ROWS`/`INITIAL_OPTS`/`CreateSnapshotDialog` block (lines ~132-313 in the source file) entirely.
- Replace `import type { SnapshotOptions, SnapshotConfig } from '@/lib/snapshots'` with `import type { BackupPoint, BackupStatus, BackupConfig } from '@/lib/backups'` — delete the local `interface SnapshotInfo`/`interface SnapshotStatus` (lines ~45-57), using the imported types instead throughout the file (find/replace `SnapshotStatus` → `BackupStatus` wherever it's used as a type, e.g. `useState<SnapshotStatus>` → `useState<BackupStatus>`).
- Rename the component `export default function SnapshotsTab()` → `export default function BackupsTab()`.
- Replace every occurrence of the string `'creating'` used as a `status.state` comparison (the progress banner's `opType`/`opTypeRef.current` calculation, and the "Creating Snapshot" vs "Reverting to Snapshot" label branch) with `'backing-up'` — the new `BackupStatus['state']` union is `'idle' | 'backing-up' | 'reverting'`, not `'idle' | 'creating' | 'reverting'`. Grep the source file for `'creating'` to find every site; there are at least three (the `busy && !prevBusy.current` duration-tracking effect, the `getEstimate`/progress-banner `opType` calculation, and the banner's own state label). Also change the label text itself from `'Creating Snapshot'` to `'Backing Up'`.
- Replace `const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([])` with `const [points, setPoints] = useState<BackupPoint[]>([])`.
- In `fetchData`, replace the fetch target and field names:
  ```tsx
  const fetchData = useCallback(async () => {
      try {
          const res = await fetch('/api/backups')
          if (!res.ok) throw new Error('Failed to load')
          const data = await res.json()
          setPoints(data.points ?? [])
          setStatus(data.status ?? { state: 'idle' })
          setError(null)
      } catch {
          setError('Failed to load backups.')
      } finally {
          setLoading(false)
      }
  }, [])
  ```
- Replace the config-loading effect's fetch target: `fetch('/api/snapshots/config')` → `fetch('/api/backups/config')`, and its state types `SnapshotConfig` → `BackupConfig`.
- Replace `config`/`configDraft` initial state and the `DEFAULT_BACKUP_CONFIG`-shaped defaults:
  ```tsx
  const [config, setConfig] = useState<BackupConfig>({ autoEnabled: true, keepHourly: 48, keepDaily: 14, keepWeekly: 8, keepMonthly: 12 })
  const [configDraft, setConfigDraft] = useState<BackupConfig>({ autoEnabled: true, keepHourly: 48, keepDaily: 14, keepWeekly: 8, keepMonthly: 12 })
  ```
- Delete `handleCreate`/`handleCreateConfirm`/`createDialogOpen` and the `<CreateSnapshotDialog>` JSX usage at the bottom of the file. Replace the header's "+ CREATE SNAPSHOT" button's `onClick={handleCreate}` with a direct call:
  ```tsx
  async function handleCreateNow() {
      const res = await fetch('/api/backups/create', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Failed to start')
      else fetchData()
  }
  ```
  and wire the button to `onClick={handleCreateNow}`, label text `'+ CREATE BACKUP'` instead of `'+ CREATE SNAPSHOT'`.
- Replace `handleRevert(filename: string)` with `handleRevert(point: BackupPoint)`, posting to `/api/backups/revert` with `{ id: point.id }`, and update the confirm dialog body to describe what's actually being reverted:
  ```tsx
  async function handleRevert(point: BackupPoint) {
      const parts = [point.dbSnapshotId && 'database', point.mediaSnapshotId && 'media files'].filter(Boolean).join(' and ')
      openConfirm(
          'Revert to Backup',
          `This will restore ${parts} from ${new Date(point.time).toLocaleString()}, overwriting the current state. The current state cannot be recovered unless you have another backup. Are you sure?`,
          async () => {
              const res = await fetch('/api/backups/revert', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: point.id }),
              })
              const data = await res.json()
              if (!res.ok) setError(data.error ?? 'Failed to start revert')
              else fetchData()
          },
          true
      )
  }
  ```
- Delete `handleDelete` entirely (no per-point delete in the new system — retention/pruning is automatic via `restic forget`, not manual).
- Update `handleUploadRevert` to post to `/api/backups/upload` with field name `'backup'` instead of `'snapshot'`:
  ```tsx
  const form = new FormData()
  form.append('backup', uploadFile)
  const res = await fetch('/api/backups/upload', { method: 'POST', body: form })
  ```
- Update `handleForceReset` to call `/api/backups/cancel` instead of `/api/snapshots/cancel`.
- Update `handleSaveConfig` to PATCH `/api/backups/config` with `configDraft` unchanged (shape already matches `BackupConfig`).
- Replace the "Snapshot list" section (`{/* Snapshot list */}` through its closing `</div>`) with a merged-timeline version:
  ```tsx
  {/* Backup timeline */}
  <div>
      <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3}
          style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 10 }}>
          Backup Timeline
      </Typography>

      {loading && (
          <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={24} style={{ color: 'rgba(219,0,29,0.6)' }} />
          </div>
      )}

      {!loading && points.length === 0 && (
          <Typography fontSize='0.8rem' style={{ color: 'rgba(237,237,237,0.3)', padding: '12px 0' }}>
              No backups yet.
          </Typography>
      )}

      {points.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 65px', gap: 8,
                  padding: '5px 12px', fontSize: '0.58rem', fontWeight: 700, letterSpacing: 2,
                  textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)',
              }}>
                  <span>Time</span>
                  <span>Database</span>
                  <span>Media</span>
                  <span></span>
                  <span></span>
              </div>

              {points.map(p => (
                  <div key={p.id} style={{
                      display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 65px', gap: 8,
                      alignItems: 'center', padding: '8px 12px',
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                      <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.85)' }}>
                          {new Date(p.time).toLocaleString()}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: p.dbSnapshotId ? 'rgba(0,195,100,0.85)' : 'rgba(237,237,237,0.2)' }}>
                          {p.dbSnapshotId ? 'Present' : 'Missing'}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: p.mediaSnapshotId ? 'rgba(0,195,100,0.85)' : 'rgba(237,237,237,0.2)' }}>
                          {p.mediaSnapshotId ? 'Present' : 'Missing'}
                      </span>
                      <a
                          href={busy ? undefined : `/api/backups/${encodeURIComponent(p.id)}/download`}
                          download={`backup-${p.id}.zip`}
                          onClick={e => { if (busy) e.preventDefault() }}
                          style={{ ...rowBtnSx('green'), textDecoration: 'none', textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
                      >
                          Download
                      </a>
                      <button onClick={() => handleRevert(p)} disabled={busy} style={rowBtnSx()}>
                          Revert
                      </button>
                  </div>
              ))}
          </div>
      )}
  </div>
  ```
- In the header's "Stored Snapshots (N / maxSnapshots)" label, drop the `/ maxSnapshots` part entirely (there's no flat cap anymore) — just `Backup Timeline` as shown above already covers this; make sure the old label line is actually removed, not left duplicated above the new timeline block.
- In the Settings panel, replace the "Interval" and "Retention Limit" blocks with four steppers for `keepHourly`/`keepDaily`/`keepWeekly`/`keepMonthly`, following the exact same visual pattern as the existing "Retention Limit" `−`/`+` stepper block (copy its JSX structure four times, once per field, changing the label/description/bound key each time — e.g. label `'Keep Hourly'`, description `'How many hourly backups to keep before thinning to daily'`, bound to `configDraft.keepHourly`/`patchConfigDraft({ keepHourly: ... })`). Keep the `autoEnabled` ON/OFF toggle block completely unchanged.
- Update `patchConfigDraft`'s dirty-check to compare the four new fields instead of `maxSnapshots`/`intervalDays`:
  ```tsx
  function patchConfigDraft(patch: Partial<BackupConfig>) {
      setConfigDraft(d => {
          const next = { ...d, ...patch }
          setConfigDirty(
              next.autoEnabled  !== config.autoEnabled  ||
              next.keepHourly   !== config.keepHourly   ||
              next.keepDaily    !== config.keepDaily    ||
              next.keepWeekly   !== config.keepWeekly   ||
              next.keepMonthly  !== config.keepMonthly
          )
          return next
      })
  }
  ```
- Update the header `Typography` text `'Snapshots'` → `'Backups'`, and the "Upload & Revert" section's helper text to say "backup ZIP" instead of "snapshot ZIP".

Delete `apps/web/app/dashboard/j4/SnapshotsTab.tsx` once `BackupsTab.tsx` is complete.

- [ ] **Step 2: Wire it into the J4 panel**

In `apps/web/app/dashboard/j4/J4AdminPanel.tsx`:
- Replace `import SnapshotsTab from './SnapshotsTab'` with `import BackupsTab from './BackupsTab'`.
- Replace `{tab === 3 && <SnapshotsTab />}` with `{tab === 3 && <BackupsTab />}`.

- [ ] **Step 3: Verify it compiles and renders**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors, and specifically no remaining references anywhere in `apps/web` to `SnapshotsTab`, `@/lib/snapshots`, or `/api/snapshots` — grep for all three across the whole `apps/web` tree to confirm before moving on.

Start the dev server and open the J4 dashboard's Backups tab in a browser; confirm the timeline loads (empty state is fine if no backups exist yet), "Create Backup Now" triggers a backup and the progress banner appears, and the settings panel's four steppers save correctly.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/j4/BackupsTab.tsx apps/web/app/dashboard/j4/J4AdminPanel.tsx
git rm apps/web/app/dashboard/j4/SnapshotsTab.tsx
git commit -m "feat(backups): replace SnapshotsTab with the restic-backed BackupsTab UI"
```

---

### Task 7: Tests and docs/map

**Files:**
- Create: `apps/web/tests/backups.spec.ts`
- Modify: `apps/web/docs/map/e-dashboard-j1-j4.md`
- Modify: `apps/web/docs/map/README.md`
- Modify: `apps/web/docs/map/a-admin-api.md` (or wherever the snapshots routes were previously documented — grep `docs/map` for `snapshots` to find every file mentioning it)

**Interfaces:**
- Consumes: Task 4's routes (permission-gate assertions only, per Global Constraints).

- [ ] **Step 1: Find every docs/map mention of snapshots**

Run: `grep -rl "Snapshot\|snapshots" apps/web/docs/map/`
Expected output: the files documenting `SnapshotsTab.tsx` and the `/api/snapshots/**` routes.

- [ ] **Step 2: Update docs/map entries**

In each file found, replace the `SnapshotsTab.tsx` entry with a `BackupsTab.tsx` entry describing the new restic-backed system in the same brief style the existing entries use (one or two lines — match the surrounding entries' format exactly, don't invent a new documentation style). Replace `/api/snapshots/**` route entries with the new `/api/backups/**` + `/api/cron/backups` routes, same permission gate noted (`PERMISSIONS.departments.j4`).

- [ ] **Step 3: Permission-gate test**

Create `apps/web/tests/backups.spec.ts`, following the exact structure of the `grant-all-roles` test in `tests/hidden-functions.spec.ts` (same fixture usage, same assertion style) — read that test first to match its pattern precisely rather than inventing a new one. Cover:

```ts
import { test, expect } from './fixtures'

test.describe('Backups API — permission gate', () => {
    test('GET /api/backups is a no-op 401/403 without J4 permission', async ({ page }) => {
        const res = await page.request.get('/api/backups')
        expect([401, 403]).toContain(res.status())
    })

    test('POST /api/backups/create is a no-op 401/403 without J4 permission', async ({ page }) => {
        const res = await page.request.post('/api/backups/create')
        expect([401, 403]).toContain(res.status())
    })

    test('POST /api/backups/revert is a no-op 401/403 without J4 permission', async ({ page }) => {
        const res = await page.request.post('/api/backups/revert', { data: { id: '2026-08-16T14:00:00.000Z' } })
        expect([401, 403]).toContain(res.status())
    })
})
```

(Adjust fixture imports/usage to match whatever `tests/hidden-functions.spec.ts` actually does for an unauthenticated/under-permissioned request — this plan sketches the shape, the implementer should mirror the real established pattern exactly rather than this simplified sketch if they diverge.)

- [ ] **Step 4: Run the suite**

Per this repo's established convention (documented in `apps/web/CLAUDE.md`), **ask the user whether they want to run the Playwright suite themselves or have it run for them** before running `npm run test:e2e` — do not run it unprompted, including here as this plan's final verification step.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/backups.spec.ts apps/web/docs/map
git commit -m "test(backups): add permission-gate coverage and update docs/map"
```
