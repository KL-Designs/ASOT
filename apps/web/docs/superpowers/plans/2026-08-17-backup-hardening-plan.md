# Backup Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three unmet requirements of [issue #55](https://github.com/KL-Designs/ASOT/issues/55) in the shipped restic backup system — a dedicated permission pair, a mandatory pre-restore safety backup, and one-way retention — plus the missing audit logging.

**Architecture:** All changes land in `apps/web`. `lib/backups.ts` gains a `runSafetyBackup()` called at the head of both restore paths and a `--keep-tag pre-restore` exemption in `resticForget()`. Nine API routes swap `client.hasRoles(me, PERMISSIONS.departments.j4)` for `await hasPermission(me, 'backups.manage' | 'backups.restore')`. `PATCH /api/backups/config` starts rejecting retention reductions instead of clamping them. A new Vitest harness covers the lib-level behaviour; the existing Playwright suite covers the gates.

**Tech Stack:** Next.js 15 App Router, TypeScript, MongoDB (`mongodb` driver v7), restic (shelled out via `execFile`), Playwright (E2E, existing), Vitest (unit, added by Task 1), `mongodb-memory-server` (already a devDependency).

**Spec:** `apps/web/docs/superpowers/specs/2026-08-17-backup-hardening-design.md`

## Global Constraints

- **All paths in this plan are relative to `apps/web/`** unless they start with `scripts/` or `storage/`, which are repo-root.
- **Work happens on branch `backup-hardening`.** Do not commit to `main` — a push to `main` deploys immediately with no CI gate (root `CLAUDE.md`).
- **Never run `npm run test:e2e` without asking the user first** (`apps/web/CLAUDE.md`). Ask, then run. `npm run test:unit` (added in Task 1) may be run freely.
- **Indentation is 4 spaces** throughout this codebase. No semicolons at end of statements in TS files — match the surrounding style exactly.
- **`restic` is invoked only via `execFile` with an args array**, never `exec` with an interpolated string. No shell interpolation, ever.
- **New permission keys use empty Discord-role arrays** (`manage: []`) — the "new-system-only key" convention set by `deptLinks.manage`. The real gate is always `hasPermission()`.
- **Retention tier maxima stay as they are:** `keepHourly` ≤ 200, `keepDaily` ≤ 90, `keepWeekly` ≤ 52, `keepMonthly` ≤ 60.
- **The safety-backup tag is the exact string `pre-restore`.** It appears in `runSafetyBackup()`, in `resticForget()`'s `--keep-tag`, and in `listBackups()`'s `isSafety` detection — all three must match.
- **`logAction()` is called from route files, never from `lib/backups.ts`** — the lib has no request context and must stay free of it.

---

## File Structure

**Created:**
- `vitest.config.ts` — Vitest configuration; `@` alias, node environment, `lib/**/*.test.ts` only.
- `lib/backups.test.ts` — unit tests for the safety-backup abort behaviour.
- `scripts/migrate-backups-permissions.mjs` (repo root) — one-off grant migration.

**Modified:**
- `lib/backups.ts` — `runSafetyBackup()`, `resticForget()` keep-tag, `BackupPoint.isSafety`, `listBackups()` tag detection, safety-backup calls in `revertToPoint()` / `applyUploadedZip()`.
- `lib/permissions.ts` — new `backups` key group.
- `app/api/backups/route.ts`, `storage/route.ts`, `config/route.ts`, `create/route.ts`, `cancel/route.ts`, `[id]/download/route.ts` — gate → `backups.manage`.
- `app/api/backups/revert/route.ts`, `upload/route.ts` — gate → `backups.restore`.
- `app/api/backups/create|revert|upload|config/route.ts` — `logAction()` calls.
- `app/dashboard/j4/page.tsx`, `J4AdminPanel.tsx`, `BackupsTab.tsx` — permission props, hidden actions, retention hint, safety badge.
- `tests/seed.ts` — grant `backups.manage` on the seeded J4 base role.
- `tests/backups.spec.ts` — new gate tests and the retention-rejection test.
- `package.json` — `vitest` devDependency, `test:unit` script.
- `docs/map/*.md`, `apps/web/CLAUDE.md`, `storage/README.md`, the 2026-08-16 spec — documentation upkeep.

---

### Task 1: Pre-restore safety backup

Implements spec section 2 (req 5). Sets up the Vitest harness, because this task's deliverable is the one that needs it.

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/backups.test.ts`
- Modify: `package.json` (devDependency + script)
- Modify: `lib/backups.ts` (`BackupPoint` type ~line 58, `resticForget` ~line 255, new `runSafetyBackup`, `revertToPoint` ~line 611, `applyUploadedZip` ~line 737, `listBackups` ~line 369)
- Modify: `storage/README.md` (repo root)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export async function runSafetyBackup(): Promise<void>` in `lib/backups.ts` — throws on failure.
  - `BackupPoint.isSafety?: boolean` — read by Task 5's UI badge.
  - `npm run test:unit` — the command later tasks use for lib-level tests.

- [ ] **Step 1: Install Vitest**

From `apps/web/`:

```bash
npm install --save-dev vitest
```

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Unit tests for lib/ only. The Playwright E2E suite lives in tests/ and is
// run separately via `npm run test:e2e` — the include pattern below keeps the
// two runners from ever picking up each other's files.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['lib/**/*.test.ts'],
        // mongodb-memory-server may download and always boots a real mongod.
        testTimeout: 60_000,
        hookTimeout: 120_000,
    },
    resolve: {
        // Mirrors tsconfig.json's `@/*` -> project root path alias.
        alias: { '@': resolve(__dirname, '.') },
    },
})
```

- [ ] **Step 3: Add the test script**

In `package.json`, add to `"scripts"` after `"lint"`:

```json
"test:unit": "vitest run",
```

- [ ] **Step 4: Write the failing test**

Create `lib/backups.test.ts`:

```ts
/**
 * Unit coverage for the pre-restore safety backup (issue #55, requirement 5).
 *
 * No mocking is needed to force the safety backup to fail: resticEnv() throws
 * when RESTIC_PASSWORD is unset, which is the first thing every restic call
 * touches. That makes "safety backup failed" reachable with a real in-memory
 * mongod standing in for the live database, so the assertion that actually
 * matters — the live data is untouched — can be made directly.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient } from 'mongodb'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
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

        await expect(backups.revertToPoint(point)).rejects.toThrow(/RESTIC_PASSWORD/)

        // The live database is intact — restoreDatabase() never ran.
        const docs = await mongo.db('asot-test').collection('sentinel').find({}).toArray()
        expect(docs).toHaveLength(1)
        expect(docs[0].marker).toBe('untouched')

        // The live media tree is intact — copyDirRecursive() never ran.
        expect(readFileSync(join(storageRoot, 'gallery', 'sentinel.txt'), 'utf-8')).toBe('untouched')

        // The failure is surfaced, not swallowed.
        const status = await backups.readStatus()
        expect(status.state).toBe('idle')
        expect(status.error).toMatch(/RESTIC_PASSWORD/)
    })
})

describe('applyUploadedZip', () => {
    test('aborts before extracting when the safety backup fails', async () => {
        const zipPath = join(storageRoot, 'irrelevant.zip')
        writeFileSync(zipPath, 'not really a zip', 'utf-8')

        await expect(backups.applyUploadedZip(zipPath)).rejects.toThrow(/RESTIC_PASSWORD/)

        const docs = await mongo.db('asot-test').collection('sentinel').find({}).toArray()
        expect(docs).toHaveLength(1)
        expect(docs[0].marker).toBe('untouched')
        expect(existsSync(join(storageRoot, 'gallery', 'sentinel.txt'))).toBe(true)
    })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm run test:unit`

Expected: FAIL. `revertToPoint` currently rejects with a restic *restore* error (or resolves), not a `RESTIC_PASSWORD` error from a safety backup — and `applyUploadedZip` fails on zip extraction instead. `backups.runSafetyBackup` does not exist yet.

- [ ] **Step 6: Add `isSafety` to the `BackupPoint` type**

In `lib/backups.ts`, in the `BackupPoint` type (~line 58), add after `mediaSizeBytes`:

```ts
    isSafety?: boolean          // carries the 'pre-restore' tag — taken automatically before a restore, never pruned
```

- [ ] **Step 7: Exempt safety backups from retention**

In `lib/backups.ts`'s `resticForget()` (~line 255), add `--keep-tag` immediately after the `--group-by` pair:

```ts
        '--group-by', 'tags',
        // Safety backups (taken automatically before every restore) are
        // exempt from every tier and are never pruned — a pre-restore copy
        // that ages out on the hourly schedule defeats its own purpose. They
        // are created only when a human actually restores, and dedup makes
        // each one cost close to nothing. See issue #55 requirement 5.
        '--keep-tag', 'pre-restore',
```

- [ ] **Step 8: Add `runSafetyBackup()`**

In `lib/backups.ts`, insert immediately after `runMediaBackup()` (~line 314), before the `backupInProgress` declaration:

```ts
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
        await dumpDatabase(DB_DUMP_DIR)
        await resticBackup(DB_REPO, [DB_DUMP_DIR], 'db', ['pre-restore'])
    } finally {
        await rm(DB_DUMP_DIR, { recursive: true, force: true }).catch(() => {})
    }

    await ensureRepoInitialized(MEDIA_REPO)
    const paths = [GALLERY_DIR, UPLOADS_DIR].filter(existsSync)
    if (paths.length > 0) await resticBackup(MEDIA_REPO, paths, 'media', ['pre-restore'])

    console.log('[backups] Safety backup complete')
}
```

- [ ] **Step 9: Let `resticBackup()` take extra tags**

`runSafetyBackup()` above passes a fourth argument. In `lib/backups.ts`, change `resticBackup()`'s signature and args construction (~line 240):

```ts
async function resticBackup(repo: string, paths: string[], tag: string, extraTags: string[] = []): Promise<string> {
    await ensureRepoInitialized(repo)
    const tagArgs = ['--tag', tag, ...extraTags.flatMap(t => ['--tag', t])]
    const stdout = await runRestic(
        repo,
        ['backup', ...paths, ...tagArgs, '--host', RESTIC_HOST, '--json'],
        [3], // "completed with some source files unreadable" — routine on a live directory, not a failure
    )
```

The rest of the function body is unchanged. Existing callers pass three arguments and are unaffected.

- [ ] **Step 10: Call it from `revertToPoint()`**

In `lib/backups.ts`'s `revertToPoint()` (~line 611), make it the first statement inside the `try`, before the `if (point.dbSnapshotId)` block:

```ts
    try {
        // Must come first and must be allowed to throw — if this fails there
        // is no undo for what follows, so the restore does not happen.
        await runSafetyBackup()

        if (point.dbSnapshotId) {
```

The existing `catch` already writes `{ state: 'idle', error: msg }` and rethrows, so a safety-backup failure surfaces correctly with no further change.

- [ ] **Step 11: Call it from `applyUploadedZip()`**

In `lib/backups.ts`'s `applyUploadedZip()` (~line 737), make it the first statement inside the `try`, before `safeExtractZip`:

```ts
    try {
        // Same rule as revertToPoint(): no safety backup, no restore.
        await runSafetyBackup()

        await safeExtractZip(zipPath, tmp)
```

- [ ] **Step 12: Surface the tag in `listBackups()`**

In `lib/backups.ts`'s `listBackups()` (~line 369), set the flag in both merge loops. Replace the two loop bodies:

```ts
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
```

Note the flag marks the whole hour bucket, so a bucket holding both an ordinary hourly and a safety snapshot reads as a safety point. That is intentional — it is a badge, not a selector.

- [ ] **Step 13: Run the tests to verify they pass**

Run: `npm run test:unit`

Expected: PASS, both tests. If `revertToPoint` rejects with a Mongo error instead of `RESTIC_PASSWORD`, `dumpDatabase()` is failing before the restic call — check that `MONGO_URI`/`MONGO_DB` are set in `beforeAll` before the lazy import.

- [ ] **Step 14: Typecheck and lint**

Run: `npm run lint`

Expected: no new errors.

- [ ] **Step 15: Document the tag in `storage/README.md`**

In the repo-root `storage/README.md`, extend the `db-backups/`, `media-backups/` bullet:

```markdown
- `db-backups/`, `media-backups/` — restic repositories (deduplicating, hourly,
  tiered retention) backing the J4 dashboard's Backups tab. `backup-meta/`
  holds the shared status/retention-config files for both. Snapshots tagged
  `pre-restore` are safety copies taken automatically before every restore and
  are exempt from retention — they are never pruned. `snapshots/` is the
  older full-copy system these replaced — left in place, untouched, no longer
  written to.
```

- [ ] **Step 16: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/lib/backups.test.ts apps/web/lib/backups.ts apps/web/package.json apps/web/package-lock.json storage/README.md
git commit -m "feat(backups): take a safety backup before every restore

Issue #55 requirement 5. runSafetyBackup() runs at the head of both
revertToPoint() and applyUploadedZip() and is allowed to throw — if it
fails, the restore does not happen. Safety snapshots carry a pre-restore
tag that restic forget --keep-tag exempts from every retention tier.

Adds Vitest for lib-level tests; the abort path is unreachable over HTTP
because revert is fire-and-forget.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: One-way retention config

Implements spec section 3 (req 6).

**Files:**
- Modify: `app/api/backups/config/route.ts:37-49`
- Modify: `tests/backups.spec.ts` (append to the existing `PATCH /api/backups/config` describe block)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `PATCH /api/backups/config` returns `400 { error }` on any tier reduction. Task 5's UI relies on this being server-enforced.

- [ ] **Step 1: Write the failing test**

In `tests/backups.spec.ts`, inside the existing `test.describe('PATCH /api/backups/config', ...)` block, append these three tests before its closing `})`:

```ts
    test('rejects lowering a retention tier', async ({ adminPage }) => {
        const current = await (await adminPage.request.get('/api/backups/config')).json()
        const res = await adminPage.request.patch('/api/backups/config', {
            data: { keepHourly: current.keepHourly - 1 },
        })
        expect(res.status()).toBe(400)
        expect((await res.json()).error).toMatch(/keepHourly/)

        // Nothing was written.
        const after = await (await adminPage.request.get('/api/backups/config')).json()
        expect(after.keepHourly).toBe(current.keepHourly)
    })

    test('accepts raising a retention tier', async ({ adminPage }) => {
        const current = await (await adminPage.request.get('/api/backups/config')).json()
        const res = await adminPage.request.patch('/api/backups/config', {
            data: { keepDaily: current.keepDaily + 1 },
        })
        expect(res.status()).toBe(200)
        expect((await res.json()).keepDaily).toBe(current.keepDaily + 1)
    })

    test('still allows disabling auto-backups', async ({ adminPage }) => {
        const res = await adminPage.request.patch('/api/backups/config', { data: { autoEnabled: false } })
        expect(res.status()).toBe(200)
        expect((await res.json()).autoEnabled).toBe(false)
        // Restore the default so later specs see a normal config.
        await adminPage.request.patch('/api/backups/config', { data: { autoEnabled: true } })
    })
```

- [ ] **Step 2: Run the test to verify it fails**

Ask the user first, then run: `npm run test:e2e -- backups.spec.ts`

Expected: FAIL on "rejects lowering a retention tier" — currently the value is clamped and written, returning 200.

- [ ] **Step 3: Implement the rejection**

In `app/api/backups/config/route.ts`, replace the body of `PATCH` from `const body = ...` to the end of the function:

```ts
    const body = await req.json().catch(() => ({})) as Partial<BackupConfig>
    const current = await readConfig()

    // Retention is one-way from the browser: it can be extended, never
    // reduced. Issue #55 requirement 6 — "backups must not be able to be
    // deleted from the browser by anyone" — and lowering a tier is deletion
    // by another name, since the next `restic forget --prune` acts on it
    // immediately. Reducing retention is deliberately a host-side act: edit
    // storage/backup-meta/.config.json and restart.
    const TIERS = [
        { key: 'keepHourly',  max: 200 },
        { key: 'keepDaily',   max: 90  },
        { key: 'keepWeekly',  max: 52  },
        { key: 'keepMonthly', max: 60  },
    ] as const

    const updated: BackupConfig = {
        ...current,
        autoEnabled: typeof body.autoEnabled === 'boolean' ? body.autoEnabled : current.autoEnabled,
    }

    for (const { key, max } of TIERS) {
        const value = body[key]
        if (typeof value !== 'number') continue
        if (value < current[key]) {
            return NextResponse.json(
                { error: `${key} cannot be reduced from ${current[key]} to ${value} — retention can only be extended from here. Lower it in storage/backup-meta/.config.json on the server.` },
                { status: 400 },
            )
        }
        updated[key] = Math.min(max, value)
    }

    await writeConfig(updated)
    return NextResponse.json(updated)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Ask the user first, then run: `npm run test:e2e -- backups.spec.ts`

Expected: PASS, including the pre-existing gate tests in that file.

- [ ] **Step 5: Lint**

Run: `npm run lint`

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/backups/config/route.ts apps/web/tests/backups.spec.ts
git commit -m "feat(backups): make retention one-way from the browser

Issue #55 requirement 6. PATCH /api/backups/config now rejects any
retention tier below its stored value instead of clamping it to 1 — a
J4 member could previously set all four tiers to 1 and have the next
prune destroy nearly the whole history. autoEnabled stays freely
toggleable; pausing backups deletes nothing.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `backups.manage` / `backups.restore` permission keys

Implements spec section 1 (req 4).

**Files:**
- Modify: `lib/permissions.ts` (new group; place it after the `deptLinks` group, before `quiz`)
- Modify: `app/api/backups/route.ts`, `storage/route.ts`, `config/route.ts`, `create/route.ts`, `cancel/route.ts`, `[id]/download/route.ts`, `revert/route.ts`, `upload/route.ts`
- Modify: `tests/seed.ts:117`
- Modify: `tests/backups.spec.ts`
- Modify: `docs/map/*.md` (the part file holding the backup route entries)
- Modify: `apps/web/CLAUDE.md`

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: permission keys `'backups.manage'` and `'backups.restore'`, consumed by Task 5's UI and Task 6's migration script.

- [ ] **Step 1: Write the failing tests**

In `tests/backups.spec.ts`, append a new describe block at the end of the file:

```ts
/**
 * The manage/restore split (issue #55 requirement 4). The `j4` persona holds
 * `backups.manage` via the seeded J4 base department role but NOT
 * `backups.restore` — it is the only persona that can distinguish the two
 * gates. `override` bypasses both; `j3` holds neither.
 */
test.describe('backups.manage vs backups.restore', () => {
    test('a manage-only holder can read the timeline', async ({ pageAs }) => {
        const page = await pageAs('j4')
        const res = await page.request.get('/api/backups')
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })

    test('a manage-only holder cannot revert', async ({ pageAs }) => {
        const page = await pageAs('j4')
        const res = await page.request.post('/api/backups/revert', { data: { id: '2026-08-17T14:00:00.000Z' } })
        expect(res.status()).toBe(403)
    })

    test('a manage-only holder cannot upload-restore', async ({ pageAs }) => {
        const page = await pageAs('j4')
        expect((await page.request.post('/api/backups/upload')).status()).toBe(403)
    })

    test('a holder of neither key is refused the timeline', async ({ pageAs }) => {
        const page = await pageAs('plainMember')
        expect((await page.request.get('/api/backups')).status()).toBe(403)
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Ask the user first, then run: `npm run test:e2e -- backups.spec.ts`

Expected: FAIL on "a manage-only holder cannot revert" and "cannot upload-restore" — the `j4` persona currently passes every gate through the `J4-Administration` bypass in `client.hasRoles()`.

- [ ] **Step 3: Add the permission keys**

In `lib/permissions.ts`, insert this group immediately after the `deptLinks` group's closing `},`:

```ts
    // ── Backups ───────────────────────────────────────────────────────────────
    //
    // Two new-system-only keys (empty arrays; the real gate is always
    // `await hasPermission(user, 'backups.x')` — lib/orbat/hasPermission.ts).
    // Split so everyday visibility and the destructive actions can be granted
    // separately: restoring overwrites the live database and media tree
    // wholesale. See docs/superpowers/specs/2026-08-17-backup-hardening-design.md.
    //
    // Moving these routes onto hasPermission() removes the hardcoded
    // `J4-Administration` bypass that client.hasRoles() grants — that is the
    // point (issue #55 requirement 4), but it means the grant migration
    // (scripts/migrate-backups-permissions.mjs) must be applied before this
    // deploys or J4 locks itself out.

    backups: {
        /** View the backup timeline and storage usage, trigger a backup on demand, download a backup point, extend retention. New-system-only key. */
        manage: [],

        /** Revert to a backup point, or upload a ZIP and restore from it. Destructive — always takes a safety backup first. New-system-only key. */
        restore: [],
    },
```

`lib/permissions-catalog.ts`'s `flatten()` treats array-valued leaves as keys, so both appear in `PERMISSION_KEYS` and the Roles Manager with no further change.

- [ ] **Step 4: Swap the six `backups.manage` gates**

In each of `app/api/backups/route.ts`, `storage/route.ts`, `config/route.ts` (both `GET` and `PATCH`), `create/route.ts`, `cancel/route.ts`, and `[id]/download/route.ts`:

Replace the import line:

```ts
import PERMISSIONS from '@/lib/permissions'
```

with:

```ts
import { hasPermission } from '@/lib/orbat/hasPermission'
```

and replace the gate:

```ts
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```

with:

```ts
    if (!await hasPermission(me, 'backups.manage')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```

Update each route's header comment from `(J4 only)` to `(backups.manage)`.

- [ ] **Step 5: Swap the two `backups.restore` gates**

In `app/api/backups/revert/route.ts` and `app/api/backups/upload/route.ts`, make the same import swap, then:

```ts
    if (!await hasPermission(me, 'backups.restore')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```

Update each route's header comment from `(J4 only)` to `(backups.restore)`.

- [ ] **Step 6: Grant the key to the seeded J4 base role**

In `tests/seed.ts`, on the `DEPT_ROLE_IDS.j4Base` document (~line 117), change:

```ts
                permissions: ['pages.dashboard', 'departmentLeads.j4'],
```

to:

```ts
                // backups.manage but deliberately NOT backups.restore — this
                // role is what makes the manage/restore split testable.
                permissions: ['pages.dashboard', 'departmentLeads.j4', 'backups.manage'],
```

- [ ] **Step 7: Run the tests to verify they pass**

Ask the user first, then run: `npm run test:e2e -- backups.spec.ts`

Expected: PASS. The pre-existing `adminPage` tests still pass because `override` short-circuits `hasPermission()`; the `memberPage` (j3) tests still pass because that persona holds neither key.

- [ ] **Step 8: Lint**

Run: `npm run lint`

Expected: no new errors. If a route now has an unused `PERMISSIONS` import, remove it; if `client` is still used for `fetchMe()`, keep that import.

- [ ] **Step 9: Update the site map**

Find the part file holding the backup route entries:

```bash
grep -rln "api/backups" apps/web/docs/map/
```

In that file, change every backup route entry's permission gate from `PERMISSIONS.departments.j4` to `backups.manage` or `backups.restore` per the table in spec section 1. In `docs/map/README.md`'s "Find it fast" keyword table, add a `backups` row pointing at that part file.

- [ ] **Step 10: Update `apps/web/CLAUDE.md`**

In the "Permission System" section's list of `PERMISSIONS` groups, add `backups.*` to the enumeration alongside `deptLinks.*` and the others.

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/permissions.ts apps/web/app/api/backups apps/web/tests/seed.ts apps/web/tests/backups.spec.ts apps/web/docs/map apps/web/CLAUDE.md
git commit -m "feat(backups): gate on backups.manage/backups.restore

Issue #55 requirement 4. Every backup route gated on plain J4 department
membership, the same gate as the rest of the J4 dashboard, so the right
could not be granted or withheld on its own. Splits it into a manage key
(timeline, storage, create, download, extend retention) and a restore key
(revert, upload-restore), both new-system-only.

This removes the hardcoded J4-Administration bypass on these routes —
scripts/migrate-backups-permissions.mjs must run before this deploys.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Audit logging

Implements spec section 4.

**Files:**
- Modify: `app/api/backups/create/route.ts`, `revert/route.ts`, `upload/route.ts`, `config/route.ts`

**Interfaces:**
- Consumes: the gates from Task 3 (`me` is already in scope in every route).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the import to all four routes**

In each of the four route files, add:

```ts
import { logAction } from '@/lib/logAction'
```

- [ ] **Step 2: Log backup creation**

In `app/api/backups/create/route.ts`, immediately before the `return NextResponse.json({ message: 'Backup started' }, { status: 202 })`:

```ts
    await logAction({
        action: 'backup.create',
        category: 'system',
        performedBy: me.id,
        performedByName: me.name ?? me.id,
    })
```

- [ ] **Step 3: Log reverts**

In `app/api/backups/revert/route.ts`, immediately before its `return`:

```ts
    await logAction({
        action: 'backup.revert',
        category: 'system',
        performedBy: me.id,
        performedByName: me.name ?? me.id,
        entityType: 'backup',
        entityId: point.id,
    })
```

- [ ] **Step 4: Log upload-restores**

In `app/api/backups/upload/route.ts`, immediately before its `return`:

```ts
    await logAction({
        action: 'backup.upload_restore',
        category: 'system',
        performedBy: me.id,
        performedByName: me.name ?? me.id,
        details: { filename: file.name },
    })
```

- [ ] **Step 5: Log config changes**

In `app/api/backups/config/route.ts`'s `PATCH`, between `await writeConfig(updated)` and the `return`:

```ts
    await logAction({
        action: 'backup.config_change',
        category: 'system',
        performedBy: me.id,
        performedByName: me.name ?? me.id,
        before: current,
        after: updated,
    })
```

Place it only on the success path — a rejected reduction changed nothing and needs no entry.

- [ ] **Step 6: Verify the logs land**

Ask the user first, then run: `npm run test:e2e -- backups.spec.ts`

Expected: PASS — the existing "passes the gate for an authorized caller" tests now also exercise these calls. `logAction()` never throws, so a logging failure cannot break a route; the tests confirm nothing regressed.

- [ ] **Step 7: Lint**

Run: `npm run lint`

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/api/backups
git commit -m "feat(backups): log create, revert, upload-restore and config changes

The backup routes had no logAction() calls at all. Restores are the most
destructive operation on the site and left no record of who ran them.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: UI — hide what the viewer cannot do

Implements spec section 5.

**Files:**
- Modify: `app/dashboard/j4/page.tsx:17-19`
- Modify: `app/dashboard/j4/J4AdminPanel.tsx:952-958,974` and its props type
- Modify: `app/dashboard/j4/BackupsTab.tsx:207,477-480,700-716,751`

**Interfaces:**
- Consumes: `'backups.manage'` / `'backups.restore'` (Task 3), `BackupPoint.isSafety` (Task 1).
- Produces: nothing later tasks depend on.

**Note on this file's idiom:** `BackupsTab.tsx` styles with inline `style={{…}}` objects and plain `<button>`/`<span>` elements, not MUI `Button`/`Chip`/`TextField`. Its only `@mui/material` imports are `Typography, CircularProgress, Dialog, DialogContent, Tooltip as MuiTooltip`. Match that idiom — do not introduce new MUI components.

- [ ] **Step 1: Resolve both rights in the page**

In `app/dashboard/j4/page.tsx`, after the `canManageLinks` line:

```ts
    const [canBackupManage, canBackupRestore] = await Promise.all([
        hasPermission(me, 'backups.manage'),
        hasPermission(me, 'backups.restore'),
    ])
```

and extend the render:

```tsx
    return (
        <J4AdminPanel
            userId={me.id}
            displayName={me.name ?? me.globalName ?? me.id}
            canManageLinks={canManageLinks}
            canBackupManage={canBackupManage}
            canBackupRestore={canBackupRestore}
        />
    )
```

- [ ] **Step 2: Pin the tab indices before making any tab conditional**

**Do this step before Step 3.** `J4AdminPanel.tsx`'s `<Tabs value={tab}>` children (lines 952–958) carry no explicit `value` prop, so MUI assigns them 0–6 by position. Removing the Backups `<Tab>` conditionally would shift Teamspeak from 4 to 3, Tools 5→4 and AI Admin 6→5, while the panel bodies below still test `tab === 4/5/6` — clicking Teamspeak would render nothing.

Add an explicit `value` to all seven, so position stops mattering:

```tsx
                            <Tab value={0} label={<PinTabLabel label='Mastersheet'  pinLabel='J4 — Mastersheet'  href='/dashboard/j4' tabIndex={0} />} sx={tabSx} />
                            <Tab value={1} label={<PinTabLabel label='Tickets'      pinLabel='J4 — Tickets'      href='/dashboard/j4' tabIndex={1} />} sx={tabSx} />
                            <Tab value={2} label={<PinTabLabel label='Meetings'     pinLabel='J4 — Meetings'     href='/dashboard/j4' tabIndex={2} />} sx={tabSx} />
                            <Tab value={4} label={<PinTabLabel label='Teamspeak'    pinLabel='J4 — Teamspeak'    href='/dashboard/j4' tabIndex={4} />} sx={tabSx} />
                            <Tab value={5} label={<PinTabLabel label='Tools'        pinLabel='J4 — Tools'        href='/dashboard/j4' tabIndex={5} />} sx={tabSx} />
                            <Tab value={6} label={<PinTabLabel label='AI Admin'     pinLabel='J4 — AI Admin'     href='/dashboard/j4' tabIndex={6} />} sx={tabSx} />
```

and insert the Backups tab conditionally between Meetings and Teamspeak:

```tsx
                            {canBackupManage && (
                                <Tab value={3} label={<PinTabLabel label='Backups' pinLabel='J4 — Backups' href='/dashboard/j4' tabIndex={3} />} sx={tabSx} />
                            )}
```

- [ ] **Step 3: Thread the props through the panel**

In `app/dashboard/j4/J4AdminPanel.tsx`, add `canBackupManage: boolean` and `canBackupRestore: boolean` to its props type and destructuring, then gate the body at line ~974:

```tsx
                        {tab === 3 && canBackupManage && <BackupsTab canRestore={canBackupRestore} />}
```

- [ ] **Step 4: Accept `canRestore` in the tab and hide the two restore controls**

In `app/dashboard/j4/BackupsTab.tsx`, change the component signature at line ~207:

```tsx
export default function BackupsTab({ canRestore }: { canRestore: boolean }) {
```

Wrap the per-row Revert button (lines 714–716) — the Download anchor above it stays, it is `backups.manage`:

```tsx
                                {canRestore && (
                                    <button onClick={() => handleRevert(p)} disabled={busy} style={rowBtnSx()}>
                                        Revert
                                    </button>
                                )}
```

Then wrap the entire "Upload & revert" block that begins at line 751 (`{/* Upload & revert */}`) through its closing `</div>`:

```tsx
            {/* Upload & revert — backups.restore only */}
            {canRestore && (
                <div style={{ borderTop: '1px solid rgba(219,0,29,0.12)', paddingTop: 20 }}>
                    …existing contents, re-indented one level…
                </div>
            )}
```

The timeline, storage usage, "Create Backup Now", Download and the config panel stay visible regardless — those are `backups.manage`.

- [ ] **Step 5: Make retention floors one-way in the UI**

The four retention steppers are driven by the `RETENTION_FIELDS` array at lines 470–481, whose `min` is currently a hardcoded `1`. Because that array is built inside the component, `config` is already in scope — point each `min` at the currently saved value:

```tsx
    // `min` is the currently saved value, not 1: PATCH /api/backups/config
    // rejects any reduction (issue #55 requirement 6), so offering a lower
    // number in the stepper would only produce a 400. Retention is raised
    // from here and lowered only in storage/backup-meta/.config.json.
    const RETENTION_FIELDS: {
        key: keyof Pick<BackupConfig, 'keepHourly' | 'keepDaily' | 'keepWeekly' | 'keepMonthly'>
        label: string
        description: string
        min: number
        max: number
    }[] = [
        { key: 'keepHourly',  label: 'Keep Hourly',  description: 'How many hourly backups to keep before thinning to daily',    min: config.keepHourly,  max: 200 },
        { key: 'keepDaily',   label: 'Keep Daily',    description: 'How many daily backups to keep before thinning to weekly',    min: config.keepDaily,   max: 90 },
        { key: 'keepWeekly',  label: 'Keep Weekly',   description: 'How many weekly backups to keep before thinning to monthly',  min: config.keepWeekly,  max: 52 },
        { key: 'keepMonthly', label: 'Keep Monthly',  description: 'How many monthly backups to keep before they age out',        min: config.keepMonthly, max: 60 },
    ]
```

Note the stale comment above the array ("The ranges match the clamps /api/backups/config applies server-side") is replaced by the one above — the server no longer clamps, it rejects.

Add a helper line immediately after the four steppers render, matching the file's `Typography` idiom:

```tsx
                <Typography fontSize='0.6rem'
                    style={{ color: 'rgba(237,237,237,0.3)', marginTop: 8, letterSpacing: 1 }}>
                    Retention can be extended, but not reduced — lower it in the server config.
                </Typography>
```

- [ ] **Step 6: Badge safety points**

In the timeline row, after the media-size `<span>` that closes at line 705 and before the Download anchor, add a badge in the same inline-style idiom (no MUI `Chip` — this file does not use one):

```tsx
                                {p.isSafety && (
                                    <span
                                        title='Taken automatically before a restore — exempt from retention'
                                        style={{
                                            fontSize: '0.6rem',
                                            letterSpacing: 1,
                                            padding: '2px 6px',
                                            border: '1px solid rgba(219,166,0,0.5)',
                                            color: 'rgba(219,166,0,0.85)',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        Pre-restore
                                    </span>
                                )}
```

- [ ] **Step 7: Build to verify**

Run: `npm run build`

Expected: succeeds. A missing prop or a type mismatch on `BackupsTab`'s new required prop surfaces here.

- [ ] **Step 8: Lint**

Run: `npm run lint`

Expected: no new errors.

- [ ] **Step 9: Manually check the tab indices still line up**

Run `npm run dev`, open `/dashboard/j4` as a user holding `backups.manage`, and click every tab in the strip. Each must render its own panel — this is the specific regression Step 2 exists to prevent, and no automated test covers it.

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/dashboard/j4
git commit -m "feat(backups): hide restore actions from manage-only holders

Threads backups.manage/backups.restore from the J4 page into BackupsTab:
the tab itself needs manage, revert and upload need restore. Retention
inputs get a floor and a hint, and pre-restore safety points get a badge.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Grant migration script

Implements spec section 6.

**Files:**
- Create: `scripts/migrate-backups-permissions.mjs` (repo root)

**Interfaces:**
- Consumes: the key names `'backups.manage'` / `'backups.restore'` (Task 3).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the script**

Create `scripts/migrate-backups-permissions.mjs`:

```js
#!/usr/bin/env node
// One-off migration: grant the new backup permission keys introduced by
// issue #55 requirement 4.
//
//   J4 base DepartmentRole            -> backups.manage
//   J4 leader / 2ic / 3ic slot roles  -> backups.manage, backups.restore
//
// MUST be applied before the code that uses these keys deploys. The routes
// previously accepted any J4 member via client.hasRoles(), which also honours
// the hardcoded J4-Administration bypass; hasPermission() does not. Without
// these grants, J4 loses access to backups entirely.
//
// Writes only department_roles.permissions, and is inert until the new gates
// exist — safe to run against production ahead of the deploy.
//
// Dry-run by default. Pass --apply to write changes.

import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const MONGO_URI = process.env.MONGO_URI
const MONGO_DB = process.env.MONGO_DB

if (!MONGO_URI || !MONGO_DB) {
    console.error('MONGO_URI and MONGO_DB env vars are required.')
    process.exit(1)
}

const MANAGE = 'backups.manage'
const RESTORE = 'backups.restore'

async function main() {
    const client = new MongoClient(MONGO_URI)
    await client.connect()
    const db = client.db(MONGO_DB)
    const departmentRoles = db.collection('department_roles')

    console.log(APPLY ? 'APPLY MODE — writing changes' : 'DRY RUN — no changes will be written (pass --apply to write)')
    console.log('')

    const updates = [] // { roleId, roleName, label, keys }

    const j4Base = await departmentRoles.findOne({ department: 'j4', isBase: true })
    if (!j4Base) {
        console.error('  [ERROR] No J4 base DepartmentRole found — cannot grant backups.manage. Aborting.')
        await client.close()
        process.exit(1)
    }
    updates.push({ roleId: j4Base._id, roleName: j4Base.name, label: 'j4/base', keys: [MANAGE] })

    for (const slot of ['leader', '2ic', '3ic']) {
        const role = await departmentRoles.findOne({ department: 'j4', linkedSlot: slot })
        if (!role) {
            console.warn(`  [WARN] j4/${slot}: no DepartmentRole has this slot linked yet — skipped. Link it via the Department Roles editor, then re-run this script.`)
            continue
        }
        updates.push({ roleId: role._id, roleName: role.name, label: `j4/${slot}`, keys: [MANAGE, RESTORE] })
    }

    for (const u of updates) {
        const role = await departmentRoles.findOne({ _id: u.roleId })
        const existing = role.permissions ?? []
        const missing = u.keys.filter(k => !existing.includes(k))

        if (missing.length === 0) {
            console.log(`  [SKIP] ${u.label} (${u.roleName}) — already holds ${u.keys.join(', ')}`)
            continue
        }

        console.log(`  [GRANT] ${u.label} (${u.roleName}) += ${missing.join(', ')}`)
        if (APPLY) {
            await departmentRoles.updateOne(
                { _id: u.roleId },
                { $addToSet: { permissions: { $each: missing } } },
            )
        }
    }

    console.log('')
    console.log(APPLY ? 'Done — changes written.' : 'Done — dry run, nothing written. Re-run with --apply.')
    await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Run the dry run**

From the repo root, with the root `.env` loaded:

```bash
npx dotenv -e .env -- node scripts/migrate-backups-permissions.mjs
```

Expected: prints `DRY RUN`, one `[GRANT]` line for `j4/base`, and either `[GRANT]` or `[WARN]` lines for the three leadership slots. Nothing is written.

- [ ] **Step 3: Verify it is idempotent**

Run it again with `--apply`, then a third time without:

```bash
npx dotenv -e .env -- node scripts/migrate-backups-permissions.mjs --apply
npx dotenv -e .env -- node scripts/migrate-backups-permissions.mjs
```

Expected: the third run reports `[SKIP]` for every role it granted. `$addToSet` makes re-application harmless.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-backups-permissions.mjs
git commit -m "chore(backups): add the backups.manage/restore grant migration

Grants backups.manage on the J4 base department role and both keys on
J4's leader/2ic/3ic slots. Dry-run by default, idempotent via \$addToSet.
Must be applied before the new gates deploy.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Documentation sweep and full verification

Implements spec section 8, and confirms the whole change set holds together.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-restic-backups-design.md` (superseded-permissions pointer)
- Verify: everything from Tasks 1–6

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a merge-ready branch.

- [ ] **Step 1: Point the old spec at the new one**

In `docs/superpowers/specs/2026-08-16-restic-backups-design.md`, replace the `## Permissions` section body:

```markdown
## Permissions

~~Unchanged: `PERMISSIONS.departments.j4` gates every route, same as the
current snapshot routes.~~

**Superseded** by `2026-08-17-backup-hardening-design.md`: the routes now gate
on `backups.manage` / `backups.restore` via `hasPermission()`. See that
document for why, and for the two other issue #55 requirements this design
left unmet.
```

- [ ] **Step 2: Confirm the site map is current**

```bash
grep -rn "departments.j4" apps/web/docs/map/
```

Expected: no remaining hits that refer to a backup route. Any that do were missed in Task 3 Step 9 — fix them now.

- [ ] **Step 3: Confirm no gate was missed**

```bash
grep -rn "PERMISSIONS.departments.j4" apps/web/app/api/backups/
```

Expected: no output. Every backup route is on `hasPermission()`.

- [ ] **Step 4: Confirm the safety backup is on both restore paths**

```bash
grep -n "runSafetyBackup" apps/web/lib/backups.ts
```

Expected: three hits — the definition, the call in `revertToPoint()`, and the call in `applyUploadedZip()`.

- [ ] **Step 5: Run the unit suite**

Run: `npm run test:unit`

Expected: PASS.

- [ ] **Step 6: Run the full E2E suite**

Ask the user first, then run: `npm run test:e2e`

Expected: PASS. This is the whole suite, not just `backups.spec.ts` — Task 3 changed `tests/seed.ts`, which every spec shares.

- [ ] **Step 7: Production build**

Run: `npm run build`

Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add apps/web/docs
git commit -m "docs(backups): supersede the 2026-08-16 spec's permissions section

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 9: Hand back for the merge decision**

Do not merge to `main` unattended. Report to the user:

- the branch is `backup-hardening` and all seven tasks are complete
- **`scripts/migrate-backups-permissions.mjs --apply` must be run against production before the merge lands**, because merging to `main` deploys immediately and the new gates will otherwise lock J4 out of backups
- issue #55 can be closed once deployed

---

## Deferred / Not In This Plan

- Off-box replication of either restic repo.
- Migrating the legacy `storage/snapshots/` zips.
- Moving `GET /api/backups/[id]/download` under `backups.restore`. It stays on `manage` by decision (downloading is how requirement 3 is satisfied), but it dumps every collection including `users` and their auth tokens — spec section 1 records this as an accepted risk, and `backups.manage` should be granted narrowly as a result.
