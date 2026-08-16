# Restic-Backed Backup System — Design

## Goal

Replace the J4 Snapshots system's full-copy-every-time backup model with a
content-addressed, deduplicating one, so that backing up `storage/gallery`
and `storage/uploads` doesn't re-store the ~99% of files that haven't
changed since the last backup. Database backups move onto the same
mechanism and become much more frequent (hourly) since dumps are cheap and
small.

## Current State

`apps/web/lib/snapshots.ts` creates a single `.zip` per snapshot containing
a full recursive copy of `storage/gallery/*`, `storage/uploads/`, and an
EJSON dump of every Mongo collection. Retention is a flat count
(`maxSnapshots`, default 5) — oldest deleted once the count is exceeded.
Auto-snapshots run once every `intervalDays` (default 2), checked via a
daily 3am cron trigger in `server.mjs`. The J4 dashboard's `SnapshotsTab`
lets staff create a snapshot (with per-content-type checkboxes), list
existing ones, download/upload a `.zip`, revert to one, and tune the
config.

This works but doesn't scale: every snapshot duplicates nearly-identical
media, so disk usage grows roughly linearly with snapshot count regardless
of how much content actually changed.

## Architecture

Two independent [restic](https://restic.net/) repositories, shelled out to
via `child_process.execFile` (never `exec` — args stay in an array, no
shell interpolation):

```
storage/
  db-backups/       restic repo — EJSON dumps of every Mongo collection
  media-backups/    restic repo — gallery/ + uploads/ live trees
```

Separate repos so pruning one's history can never affect the other's, and
so `restic snapshots`/`restic forget` calls for one side never need to
filter by tag.

**Database:** the dump content and format don't change — still one
`<collection>.ejson` file per collection, same EJSON streaming logic
already in `lib/snapshots.ts`'s `ndjsonLines()`. What changes is the
storage/retention mechanism: instead of zipping the dump and hand-rolling
count-based deletion, the dump gets written to a temp directory and handed
to `restic backup`, which handles deduplication (mostly irrelevant for DB
dumps, but harmless) and, more importantly, gives tiered retention via
`restic forget` for free instead of that logic being written twice (once
for media, once for DB) in application code.

**Media:** `restic backup` points directly at `storage/gallery` and
`storage/uploads` — no temp copy needed, restic reads the live
directories and only stores content-chunks it hasn't seen before.

## Schedule & Retention

Both repos back up **hourly**, gated by the existing
`autoEnabled`-style config toggle (auto-backups can still be paused from
the UI). Retention, applied via `restic forget --prune` after each backup,
uses the same tiered policy for both repos:

```
--keep-hourly 48   (every hourly snapshot for the last 2 days)
--keep-daily 14    (one per day for the next ~2 weeks)
--keep-weekly 8    (one per week for the next ~2 months)
--keep-monthly 12  (one per month for the last year)
```

These are starting defaults, stored in `storage/backup-meta/.config.json`
(see Storage Layout below), editable from the UI without a code change.

## `lib/backups.ts` (replaces `lib/snapshots.ts`)

- `resticPath(): string` — resolves the restic binary: `RESTIC_PATH` env
  override, else a local `apps/web/bin/restic[.exe]` (populated by the dev
  setup step below), else bare `'restic'` (on `PATH` inside the container
  after `apk add restic`).
- `runResticJson(repo, args): Promise<T>` — thin wrapper: sets
  `RESTIC_REPOSITORY`/`RESTIC_PASSWORD` env vars, appends `--json`, parses
  stdout. Throws with stderr on non-zero exit.
- `runDbBackup(): Promise<void>` — dumps EJSON per collection into a fresh
  temp dir (`os.tmpdir()`), runs `restic backup <tempdir> --tag db`, then
  `restic forget --prune` with the tiers above, then removes the temp dir.
- `runMediaBackup(): Promise<void>` — `restic backup storage/gallery
  storage/uploads --tag media` against the media repo, then the same
  `forget --prune`.
- `listBackups(): Promise<BackupPoint[]>` — runs `restic snapshots --json`
  against both repos, merges by rounding each snapshot's timestamp to the
  nearest hour bucket. Each `BackupPoint` carries `{ id, time,
  dbSnapshotId?, mediaSnapshotId?, dbSizeHuman?, mediaSizeHuman? }` — a
  bucket can have either or both sides present if one repo's hourly run
  failed or was skipped. `id` is the bucket's ISO hour string (e.g.
  `2026-08-16T14:00:00Z`) — what routes like `[id]/download` and `revert`
  key off, resolved back to a `BackupPoint` via `listBackups()` server-side
  rather than trusting a client-supplied snapshot ID directly.
- `revertToPoint(point: BackupPoint): Promise<void>` — restores whichever
  of `dbSnapshotId`/`mediaSnapshotId` are present to temp dirs, then reuses
  the existing import-into-Mongo logic (drop + insertMany per collection,
  recreate the two ORBAT indexes) and the existing `copyDirRecursive` for
  media — both already in `lib/snapshots.ts` today, moved over unchanged.
- `buildDownloadZip(point: BackupPoint): Promise<string>` — restores the
  point to a temp dir, zips it with `archiver` (same library already a
  dependency), returns the temp zip path for the route to stream and then
  delete.
- `applyUploadedZip(zipPath: string): Promise<void>` — extracts a
  user-uploaded zip straight onto disk (Mongo import + file copy), the same
  shape as revert but sourced from an arbitrary uploaded archive rather
  than a restic snapshot. Does **not** feed the upload into either restic
  repo's history — it's a one-off manual restore, matching today's
  behavior.
- `readStatus`/`writeStatus`, `readConfig`/`writeConfig` — same shape as
  today, `config` now holds `{ autoEnabled: boolean, keepHourly: number,
  keepDaily: number, keepWeekly: number, keepMonthly: number }` instead of
  `maxSnapshots`/`intervalDays`. One shared status/config pair covers both
  repos (a single "what's running right now" and a single retention policy
  applied to each) — files live in a new `storage/backup-meta/` directory
  (`.status.json`, `.config.json`), kept separate from the two restic repo
  directories so nothing risks colliding with restic's own repo-internal
  files.

## Routes

`app/api/snapshots/**` is deleted wholesale and replaced by
`app/api/backups/**` with the same shape (`route.ts` for list,
`create/route.ts`, `revert/route.ts`, `[id]/download/route.ts`,
`upload/route.ts`, `cancel/route.ts`, `config/route.ts`) and the same
permission gate (`PERMISSIONS.departments.j4`, unchanged from today).
`app/api/cron/snapshots/route.ts` → `app/api/cron/backups/route.ts`,
triggering both `runDbBackup()` and `runMediaBackup()` (independently —
one failing doesn't block the other), gated by `verifyCronSecret` exactly
as today.

`server.mjs`'s scheduler section changes from "daily at 3am" to hourly:
the `setInterval` becomes `60 * 60 * 1000` instead of `24 * 60 * 60 *
1000`, and the initial daily-3am alignment (`msUntilNext3am`) goes away
entirely — no need to align hourly runs to a specific clock time.

## Revert Flow

Pick a target `BackupPoint` from the merged timeline (already the nearest
hour to whatever moment the user wants). `revertToPoint()` restores
whichever side(s) that bucket has. Because the two repos run on
independent hourly schedules, a bucket could in rare cases be missing one
side (e.g. a media backup failed that hour) — the UI shows this plainly
per-entry rather than silently reverting only half.

## Docker & Dev Environment

- `apps/web/Dockerfile`: `RUN apk add --no-cache restic` alongside the
  existing `npm install -g npm@11` line.
- `docker-compose.yml`: three new bind-mounts —
  `./storage/db-backups:/app/storage/db-backups`,
  `./storage/media-backups:/app/storage/media-backups`, and
  `./storage/backup-meta:/app/storage/backup-meta` — next to the existing
  `storage/snapshots` mount (which stays mounted; see Migration).
- Native/Windows dev: a new setup step (run from `npm run install:all` or
  as a standalone `Setup / one-off` menu item in `scripts/start.mjs`,
  matching that menu's existing categories) downloads the correct restic
  release binary for the current OS/arch from GitHub releases into a
  gitignored `apps/web/bin/`, mirroring the zero-manual-steps precedent
  `sharp`'s own postinstall already sets in this repo. Skips the download
  if the binary's already present (re-running setup is a no-op).
- New `.env` var `RESTIC_PASSWORD`, documented in `.env.template` next to
  the other shared secrets. A long random value generated once during
  implementation (not human-typed, never displayed in the UI) — it's read
  only by the backup tooling. Shared by both repos; no meaningful security
  boundary between "DB backups" and "media backups" on the same server.

## Storage Layout

```
storage/
  db-backups/       restic repo (config, data/, index/, keys/, snapshots/ — restic-owned)
  media-backups/    restic repo (same internal shape)
  backup-meta/      .status.json + .config.json — shared status/retention config
  snapshots/        left in place, untouched — see Migration
```

Both new folders get the same untracked/excluded treatment every other
`storage/` subfolder already has (root `.gitignore`'s `/storage` entry,
`.dockerignore`) — no new ignore rules needed. `storage/README.md`'s
layout list gets a two-line addition documenting the new folders.

## UI Changes (`SnapshotsTab` → `BackupsTab`)

- Per-content-type checkboxes in the create dialog go away — restic backs
  up the whole tree every run and dedup makes "skip gallery to save space"
  meaningless. "Create Backup Now" becomes a single action (still fires
  both `runDbBackup()`/`runMediaBackup()` in parallel).
- The flat snapshot list becomes a merged timeline: one row per hour
  bucket that has at least one side present, showing DB size / media size
  (from `restic snapshots --json`'s reported stats) and a status chip per
  side if one is missing.
- "Revert to here", "Download as of here" (triggers `buildDownloadZip`),
  and "Upload a backup" stay as equivalent actions against the new flow.
- Config panel: `maxSnapshots`/`intervalDays` inputs replaced by the four
  `keepHourly`/`keepDaily`/`keepWeekly`/`keepMonthly` fields plus the
  existing `autoEnabled` toggle.

## Migration

No data migration. `storage/snapshots/` and its existing `.zip` files are
left exactly where they are and simply stop being written to — nobody
deletes them, they just age out of relevance on their own. The new system
starts with empty `db-backups/`/`media-backups/` repos and its first
backups happen on the next hourly cron tick (or immediately via "Create
Backup Now").

## Permissions

~~Unchanged: `PERMISSIONS.departments.j4` gates every route, same as the
current snapshot routes.~~

**Superseded** by `2026-08-17-backup-hardening-design.md`: the routes now gate
on `backups.manage` / `backups.restore` via `hasPermission()`. See that
document for why, and for the two other issue #55 requirements this design
left unmet.

## Out of Scope

- Independent revert (revert DB and media to different points in time) —
  explicitly decided against; revert always targets one merged point.
- Migrating existing `.zip` snapshots into the new restic repos.
- Off-box replication of either restic repo (e.g. syncing to another
  server) — both repos stay local to `storage/`, same as today's zips.
