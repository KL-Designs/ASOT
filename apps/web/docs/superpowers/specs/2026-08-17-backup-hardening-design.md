# Backup Hardening — Design

Closes the three gaps between [GitHub issue #55](https://github.com/KL-Designs/ASOT/issues/55)'s
stated requirements and what the restic-backed backup system actually shipped
(see `2026-08-16-restic-backups-design.md`).

## Goal

The restic system already satisfies issue #55's requirements 1, 2 and 3
(scheduled hourly backups proportional to churn, datetime carried in the data,
repos movable as plain directories). Three requirements are not met:

- **Req 4 — "Backup and restoration must only be available to a special
  permission."** Every backup route gates on
  `client.hasRoles(me, PERMISSIONS.departments.j4)` — plain J4 department
  membership, the same gate as the rest of the J4 dashboard. No backup-specific
  permission exists, so the right cannot be granted or withheld on its own.
- **Req 5 — "A backup must be made before a backup is loaded."** Neither
  `revertToPoint()` nor `applyUploadedZip()` takes a pre-restore backup. Both go
  straight to `restoreDatabase()` (drop + `insertMany` per collection) and
  `copyDirRecursive()` over live media. A mistaken restore destroys everything
  since the last hourly tick, with no undo.
- **Req 6 — "Backup must not be able to be deleted or the contents edited from
  the browser by anyone."** There is correctly no DELETE route, but
  `PATCH /api/backups/config` clamps each retention tier to a minimum of 1. Any
  J4 member can set all four tiers to 1; the next `restic forget --prune`
  destroys nearly the whole history. That is browser-initiated deletion by a
  side door.

A fourth problem surfaced while auditing and is folded in because it is the same
code and the same review: **no `logAction()` call exists anywhere in the backup
routes.** Restores are the most destructive operation on the site and currently
leave no record of who ran them.

## Non-Goals

- Off-box replication of either restic repo. Still out of scope, as in the
  original design.
- Migrating the legacy `storage/snapshots/` zips.
- Reworking the merged-hour-bucket timeline model or the revert flow itself.
- Any change to `/api/cron/backups`' authentication — it is `CRON_SECRET`-gated,
  not user-gated, and requirement 4 is about human access.

---

## 1. Permission Keys (req 4)

### The keys

A new group in `lib/permissions.ts`, with empty Discord-role arrays marking them
new-system-only — the convention `deptLinks.manage` already sets:

```ts
// ── Backups ───────────────────────────────────────────────────────────────
//
// Two new-system-only keys (empty arrays; the real gate is always
// `await hasPermission(user, 'backups.x')`). Split so that everyday
// visibility and the destructive actions can be granted separately:
// restoring overwrites the live database and media tree wholesale.

backups: {
    /** View the backup timeline and storage usage, trigger a backup on demand,
      * download a backup point, extend retention. New-system-only key. */
    manage: [],

    /** Revert to a backup point, or upload a ZIP and restore from it. Destructive
      * — always takes a safety backup first. New-system-only key. */
    restore: [],
},
```

`lib/permissions-catalog.ts`'s `flatten()` treats any array-valued leaf as a key,
so both appear in `PERMISSION_KEYS` and therefore in the Roles Manager picker
with no catalog change.

### Route gates

Each route's `client.hasRoles(me, PERMISSIONS.departments.j4)` check is replaced
by `await hasPermission(me, key)`:

| Route | Key |
|---|---|
| `GET /api/backups` | `backups.manage` |
| `GET /api/backups/storage` | `backups.manage` |
| `GET /api/backups/config` | `backups.manage` |
| `PATCH /api/backups/config` | `backups.manage` |
| `POST /api/backups/create` | `backups.manage` |
| `POST /api/backups/cancel` | `backups.manage` |
| `GET /api/backups/[id]/download` | `backups.manage` |
| `POST /api/backups/revert` | `backups.restore` |
| `POST /api/backups/upload` | `backups.restore` |

`GET /api/cron/backups` is unchanged.

### The bypass consequence

`client.hasRoles()` grants unconditional access to holders of the hardcoded
`J4-Administration` Discord role. `hasPermission()` deliberately does not — its
only hard bypass is the `OVERRIDE` env list. Moving these routes therefore
*removes* an implicit bypass, which is exactly what requirement 4 asks for, but
it means **the grant migration must be applied before or with this deploy** or
J4 locks itself out of its own backups. The migration script below is the
mitigation; the rollout order in section 6 is the guarantee.

### A noted risk, accepted

`GET /api/backups/[id]/download` sits under `manage` rather than `restore`. It
produces a full EJSON dump of every collection, including `users` — which carries
each member's auth token. It is the widest data-exfiltration surface in the set,
and it is gated one level below the destructive actions. This placement was
chosen deliberately (downloading is how a backup gets moved across file systems,
requirement 3, and should not require the restore right), but it means
`backups.manage` should be granted narrowly and not treated as a read-only
permission.

---

## 2. Pre-Restore Safety Backup (req 5)

### `runSafetyBackup()`

A new export in `lib/backups.ts`:

```ts
export async function runSafetyBackup(): Promise<void>
```

It dumps the database to a fresh temp dir via the existing `dumpDatabase()` and
runs, against each repo respectively:

```
restic backup <tmpdir>                    --tag db    --tag pre-restore
restic backup storage/gallery storage/uploads --tag media --tag pre-restore
```

Both sides run; if either fails, the function throws.

**It deliberately does not reuse `runAllBackups()`.** That function writes
`{ state: 'backing-up' }` to the status file and owns the `backupInProgress`
module guard. Calling it from inside a revert would move the status out of
`reverting` mid-operation, which the UI polls and the in-progress guards on every
route read. `runSafetyBackup()` instead writes
`{ state: 'reverting', message: 'Creating safety backup…' }`, so a restore
remains one continuous operation from the outside.

### Call sites and failure semantics

`runSafetyBackup()` is the first statement inside the `try` of both
`revertToPoint()` and `applyUploadedZip()`, before any destructive call.

**If it throws, the restore aborts.** The existing `catch` writes
`{ state: 'idle', error: msg }` and rethrows, so the UI surfaces the failure and
the live data is untouched. There is no "safety backup failed but continue
anyway" path and no flag to force one — a restore that cannot be undone is
precisely what requirement 5 forbids. This is the single most important
behaviour in this design and gets a dedicated test.

### Retention exemption

`resticForget()` gains `--keep-tag pre-restore`:

```ts
await runRestic(repo, [
    'forget', '--prune',
    '--group-by', 'tags',
    '--keep-tag', 'pre-restore',
    '--keep-hourly',  String(cfg.keepHourly),
    // …unchanged
])
```

Safety backups are then exempt from every tier and are never pruned. Unbounded
growth is not a practical concern: they are created only when a human actually
restores, which is rare, and restic's deduplication means each one stores only
the chunks that changed since the last hourly — near zero.

`--group-by tags` already places the two-tag snapshots in their own group;
`--keep-tag` keeps that group whole, so the grouping and the exemption do not
interact badly.

### Surfacing them

`ResticSnapshotEntry` already parses `tags`. `listBackups()` sets a new
`isSafety?: boolean` on the `BackupPoint` when either side's snapshot carries the
`pre-restore` tag, and `BackupsTab` renders a badge on those rows so a safety
point is distinguishable from an ordinary hourly at a glance.

Safety snapshots are hour-bucketed like any other, so one taken at 14:05 merges
into the same `2026-08-17T14:00:00.000Z` bucket as the ordinary 14:00 backup. The
later snapshot wins for that bucket's `dbSnapshotId`/`mediaSnapshotId` because
the merge loop overwrites, and `restic snapshots` returns oldest-first — so the
safety backup, being newer, is the one retained in the bucket. That is the
desired outcome (the safety copy is strictly closer to the pre-restore state),
and the `isSafety` badge makes it visible.

---

## 3. Retention Becomes One-Way (req 6)

`PATCH /api/backups/config` stops clamping and starts rejecting. For each of
`keepHourly`, `keepDaily`, `keepWeekly`, `keepMonthly`: a supplied value below
the currently stored value returns `400` with a message naming the offending
tier. Values at or above the current one are accepted, still bounded above by the
existing per-tier maxima. `autoEnabled` remains freely toggleable in both
directions — pausing automatic backups destroys nothing.

Reducing retention is thereby only possible by editing
`storage/backup-meta/.config.json` on the host and restarting, which is off the
browser entirely and satisfies requirement 6's "by anyone" wording.

`BackupsTab`'s four retention inputs get `min` bound to the current stored value
and a helper line: *"Retention can be extended, but not reduced — see the server
config to lower it."* The client-side `min` is a convenience only; the server
check is the gate.

---

## 4. Audit Logging

`logAction()` calls are added under category `system`:

| Action | Where | Payload |
|---|---|---|
| `backup.create` | `POST /create` | — |
| `backup.revert` | `POST /revert` | `entityId` = the target point id |
| `backup.upload_restore` | `POST /upload` | uploaded filename |
| `backup.config_change` | `PATCH /config` | `before` / `after` config objects |

Logged in the route (where `me` is in scope), not in `lib/backups.ts` — matching
how every other logged write in this codebase is structured, and keeping the lib
free of request context. `logAction()` never throws, so no call site needs
guarding.

---

## 5. UI Changes

`app/dashboard/j4/page.tsx` resolves both rights server-side and passes them
down, exactly as it already does for `canManageLinks`:

```ts
const [canBackupManage, canBackupRestore] = await Promise.all([
    hasPermission(me, 'backups.manage'),
    hasPermission(me, 'backups.restore'),
])
```

`J4AdminPanel` takes both as props, hides the Backups tab entirely when
`canBackupManage` is false, and passes `canRestore` into `BackupsTab`.
`BackupsTab` hides the "Revert to here" action and the upload control when
`canRestore` is false — the timeline, storage usage, create and download remain.

The J4 page's own entry gate (`PERMISSIONS.departments.j4`) is unchanged; this
only governs the Backups tab within it.

---

## 6. Migration and Rollout

`scripts/migrate-backups-permissions.mjs`, dry-run by default with `--apply`,
following `migrate-batch2-permissions.mjs`'s structure:

- J4 base DepartmentRole (`{ department: 'j4', isBase: true }`) → `backups.manage`
- J4 `leader`, `2ic`, `3ic` linked-slot DepartmentRoles → `backups.manage` and
  `backups.restore`

It warns and skips rather than failing when a slot has no linked role, and
errors out if the J4 base role is missing, as batch2 does.

**Rollout order matters.** The migration reads only collections and writes only
`department_roles.permissions`; it is safe to run against production before the
code deploys, and the grants are inert until the new gates exist. Run it first,
then deploy. Reversed, J4 loses access to backups between deploy and migration.

---

## 7. Testing

Unit-level coverage of the two behaviours that carry real consequence:

- **Safety backup failure aborts the restore.** With `runSafetyBackup()` forced
  to throw, `revertToPoint()` rejects, `restoreDatabase()` is never called, and
  the status file ends at `{ state: 'idle', error }`. Same for
  `applyUploadedZip()`.
- **Retention cannot be reduced.** `PATCH /config` with any tier below the stored
  value returns 400 and leaves `.config.json` untouched; a raise succeeds.

`tests/backups.spec.ts` is extended for the two new gates: a persona holding
`backups.manage` but not `backups.restore` sees the timeline and gets 403 from
`POST /revert` and `POST /upload`; a persona with neither does not see the tab.

Per `apps/web/CLAUDE.md`, the Playwright suite is not run without asking first.

---

## 8. Documentation Upkeep

Same-change updates, per the repo's standing rules:

- `docs/map/*.md` — the backup route entries' permission gates all change; the
  keyword table gains `backups.manage` / `backups.restore`.
- `apps/web/CLAUDE.md` — the `cron/backups` bullet is still accurate, but the
  permission section's list of migrated keys should mention the new group.
- `storage/README.md` — note that `db-backups`/`media-backups` now also hold
  never-pruned `pre-restore`-tagged snapshots.
- `2026-08-16-restic-backups-design.md` — its "Permissions: unchanged" section is
  superseded; add a pointer to this document rather than editing history.
