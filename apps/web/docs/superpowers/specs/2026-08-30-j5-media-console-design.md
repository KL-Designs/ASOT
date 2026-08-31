# J5 Media Console — Design

**Date:** 2026-08-30
**Branch:** `feat/gallery-submissions` (extended — not a new branch)
**Predecessor spec:** [2026-08-30-gallery-submissions-design.md](2026-08-30-gallery-submissions-design.md)
**Mockups:** https://claude.ai/code/artifact/9451c88e-b772-4d2a-80b7-6f037c23e43e

---

## 1. The problem

The gallery stopped being a folder tree and became a database. J5's dashboard
never caught up.

`GET /api/gallery` used to walk `storage/gallery/content/{year}/{op}/{mission}/`
with `readdirSync` and return the tree. The submissions feature replaced that
with a `gallery_media` collection carrying captions, tags, authors, votes and
review state. But `GalleryOperationsTab` still edits **folders** — it can upload
a file into a directory and delete a directory, and nothing else. The thing
worth editing is now **media**, and there is no interface for it.

Three consequences, all of them live today:

1. **The archive cannot be curated.** `scripts/index-gallery.mjs` can index all
   4,781 files, but it can only date 44 of 88 operation folders. The other
   ~1,157 files land undated with no caption, no tags and no author, and there
   is no screen in the application where any of that can be supplied.

2. **New submissions are invisible on disk.** They are written flat to
   `storage/gallery/media/6a93707585a4027e6d332904.jpg`. The J4 backup zip is a
   verbatim stream of the live tree, so a downloaded backup contains a readable
   `content/` tree of legacy files sitting beside a flat pile of opaque hex
   filenames. The archive stops being readable outside the website at exactly
   the point new material starts arriving.

3. **The database and the disk can disagree with nothing to say so.** A record
   whose file was deleted serves a broken tile forever (observed: media
   `6a93707585a4027e6d332904`, caption "WOOOOO"). A file copied into the tree by
   hand is invisible. A failed transcode sits in the review queue with nothing
   to publish. None of these surface anywhere.

### 1.1 A pre-existing vulnerability this work must fix first

`apps/web/app/api/gallery/featured/route.ts` interpolates the unvalidated
`?img=` query parameter into a filesystem path:

```ts
if (!fs.existsSync(`../../storage/gallery/featured/${img}`)) return 404
const output = fs.readFileSync(`../../storage/gallery/featured/${img}`)
```

`?img=../../../.env` resolves to the repository-root `.env` — `MONGO_URI`,
`DISCORD_TOKEN`, every secret the deployment holds. The route requires no
authentication. This is present on `main`, not introduced by this work, and is
**Task 1 of Plan A**.

The same route, and `/api/gallery/media/[id]`, also send
`Cache-Control: public, max-age=31536000, immutable` on id-addressed URLs.
`immutable` is a promise that the bytes at a URL can never change; these URLs
are not content-addressed, so the promise is false and a deleted or replaced
image is served from cache indefinitely with no way to bust it. Fixed in the
same task.

---

## 2. Goals

- **G1** — One screen where every item in the gallery can be found, and its
  caption, tags, author and operation edited, one at a time or in bulk.
- **G2** — Storage on disk is readable and reorganisable by a human, so a
  downloaded backup can be browsed and rearranged in a file manager.
- **G3** — Reorganising files outside the website is honoured on re-import: a
  moved file keeps its caption, tags, author and votes, and takes its new
  operation from the folder it now sits in.
- **G4** — Every disagreement between the database and the disk is visible and
  fixable, and none of them is resolved by deleting something automatically.
- **G5** — The 4,781-file legacy archive is indexed, with the ~1,157 undated
  files curatable by hand.

## 3. Non-goals

- **N1 — No hide/unhide.** Deliberately excluded by the user. Delete remains the
  only way to take a published item off the gallery, which destroys the file.
  The `hidden` status in `lib/gallery/status.ts` stays unreachable from the UI.
- **N2 — No re-encoding of the legacy archive.** The migration moves no bytes
  and rewrites no legacy filenames.
- **N3 — No automatic reconciliation on a timer.** Reconcile runs when a backup
  is imported and when a human presses a button. Nothing else triggers it.
- **N4 — No changes to the public gallery page.** It reads `gallery_media`
  already; this work changes what is *in* that collection, not how it is read.
- **N5 — Production is never written to by an agent.** The migration and any
  relocation script are built and tested against fixtures only. The user runs
  them.

---

## 4. Storage layout

### 4.1 The rule

The backup zip is a verbatim stream of the live tree (`openDownloadZipStream`
pipes `restic dump` straight into the archive). Therefore **the only way to
make the zip readable is to make storage itself readable.** No synthetic tree
is built at download time, no manifest is written, and `openDownloadZipStream`
is not modified.

### 4.2 Directories

```
storage/gallery/
├─ content/     archive originals — the readable tree, and the only one a human organises
├─ media/       poster frames only (regenerable derivatives of a video)
├─ featured/    existing 58 featured images (bytes stay put; see §4.6)
├─ sotm/        existing screenshot-of-the-month files (bytes stay put)
└─ staging/     in-flight uploads, pre-processing
```

Poster frames stay in `media/`. They are derived artifacts regenerable from the
video, nobody organises them by hand, and leaving them there means
`resolveStorageKey`'s existing `media:` branch is unchanged.

### 4.3 The content tree

```
content/{year}/{operation}/{mission}/{file}     4 segments — legacy files, unchanged
content/{year}/{operation}/{file}               3 segments — new submissions (no mission)
content/Unknown/{file}                          2 segments — no operation chosen or resolved
```

`resolveStorageKey` currently requires **exactly four** segments. It must accept
**two, three or four**.

- `{year}` — legacy folder names are preserved verbatim, including ranges like
  `2022 - 2023`. For a new item it is the operation's calendar year.
- `{operation}` — `{order}. {label}`, matching the existing convention
  (`23. Op New Winter`). Resolved by `resolveOperationFolder` (§4.5).
- `{mission}` — only legacy files have one. New submissions have no mission and
  sit directly under the operation folder.
- `Unknown` — a literal top-level folder beside the year folders. Anything the
  submitter left unknown, or the migration could not resolve, goes here.

**A file enters the content tree when it is published, not when it is
uploaded.** The pipeline is `staging/` (raw upload) → `media/` (transcoded,
`status: pending`) → `content/` (accepted, `status: live`). Three reasons: the
readable tree then holds only archive material a human would want to browse; a
rejected submission never touches it; and a reviewer who corrects the operation
mid-review causes one move at accept rather than a move and then a second move.
Rejecting deletes the flat file and leaves the tree alone.

### 4.4 Filename grammar

```
{author} — {caption} [{id}].{ext}
```

Both the author and caption parts are optional and collapse cleanly:

| Has | Filename |
|---|---|
| author + caption | `Koda — Chopper came in hot [6a9380f11c4e5d2a77b31099].mp4` |
| caption only | `Chopper came in hot [6a9380f11c4e5d2a77b31099].mp4` |
| author only | `Koda [6a9380f11c4e5d2a77b31099].jpg` |
| neither | `6a9380f11c4e5d2a77b31099.jpg` |

**The bracketed ID is load-bearing.** It is the 24-character ObjectId of the
`gallery_media` document, and it is what survives the file being dragged into a
different folder in a file manager. Everything about G3 rests on it.

Separator is an em dash with single spaces (` — `), chosen because it cannot
appear in a sanitised segment and so parses unambiguously.

**Sanitisation** (`sanitizeFilePart`), applied to the author and caption parts:

- Remove `/ \ : * ? " < > |` and every control character (`\x00-\x1f`).
- Remove `[` and `]`, so a caption can never forge an ID bracket.
- Collapse runs of whitespace to a single space; trim.
- Strip trailing dots and spaces (Windows silently drops them, which would make
  the written name differ from the recorded one).
- Truncate the combined `{author} — {caption}` portion to **80 characters**,
  cutting on a word boundary where one exists within the last 12.
- If the result is empty, that part is omitted entirely.

Windows' 260-character path limit is a real hazard — `index-gallery.mjs`
already counts unreadable files from it. The 80-character cap plus a
120-character cap on each directory segment keeps a worst-case path inside it.

**Parsing** (`parseMediaFilename`):

```
/\[([0-9a-f]{24})\]\.[A-Za-z0-9]{2,5}$/
```

The ID is read from the end, immediately before the extension, so a caption
containing bracket-like text cannot be mistaken for one. Returns
`{ id: string | null, ext: string }`.

### 4.5 Resolving an operation folder

`resolveOperationFolder(db, operationId | null, year)` returns the folder name
for an operation, creating nothing on disk:

1. `null` operation → `Unknown` (a two-segment path, no year folder).
2. Look for an existing folder in `content/{year}/` whose `splitOperation`
   label normalises (via the migration's existing `normalizeKey`) to the same
   key as the operation's title. Reuse it. **This is the common case** — it is
   how a new submission lands next to the legacy files from the same operation
   rather than in a duplicate folder beside them.
3. Otherwise create `{n}. {sanitised title}`, where `n` is one greater than the
   highest numeric prefix already present in that year's folder.

Reusing `normalizeKey` is deliberate: it already knows that operations are
recorded per session-day (`OPERATION Lost Army IV — Sun`) while gallery folders
are per weekend and abbreviated (`18. Op Atlantic Shield`).

### 4.6 `storageKey` grammar

| Prefix | Names | Status |
|---|---|---|
| `content:{2-4 segments}` | `storage/gallery/content/…` | **replaces `legacy:`** |
| `media:{id}[_poster].{ext}` | `storage/gallery/media/…` | unchanged; posters, and pre-relocation originals |
| `featured:{file}` | `storage/gallery/featured/…` | new — the existing 58 |
| `sotm:{file}` | `storage/gallery/sotm/…` | new — existing SOTM files |

The `legacy:` → `content:` rename is a pure string rewrite over existing
documents. No bytes move. It exists because "legacy" stops being true the
moment new submissions are written into the same tree.

The document stores its **own path**, not a recipe for deriving one. Reconcile
re-derives the *operation* from the path when the path changes — which is the
direction that has to work for G3.

---

## 5. Reconcile

The single routine that makes the database and the disk agree. It runs when a
backup is imported, and when a human presses **Re-scan disk**. Never on a
timer, and never as a side effect of anything else.

### 5.1 The four rules, in order

| Condition | Action |
|---|---|
| Filename carries `[id]` and that record exists | **Match by ID.** Re-read year / operation / mission from the folders the file now sits in and update the record, including `operationId` and `takenAt`. Caption, tags, author and votes are untouched. `storageKey` is rewritten to the new path. |
| No `[id]`, and the path matches a record's `storageKey` | **Match by path.** How 4,781 legacy files keep working without renaming one. They gain an ID-carrying name only when next edited in the dashboard (§6.4). |
| File on disk matches no record either way | **Report `not-indexed`.** Never inserted automatically — a human presses Index. Operation is proposed from the folder. |
| Record has a `storageKey` with no file behind it | **Report `missing-file`.** Never deleted automatically. |

Rule order matters: ID before path. A file that was moved has *both* a
resolvable ID and a stale path, and matching by path first would fail to notice
it moved.

### 5.2 Why nothing auto-deletes

A restore that fails partway leaves a tree missing most of its files. A
reconcile that deleted records for missing files would then destroy the index
of the entire archive — captions, tags, authors and votes for 4,781 items —
in response to a transient condition. Every destructive resolution is a button
a human presses, listed in Health.

### 5.3 Report shape

```ts
type ReconcileReport = {
    scanned: number
    matchedById: number
    matchedByPath: number
    relocated: { id: string, from: string, to: string, operation: string | null }[]
    notIndexed: { path: string, bytes: number, proposedOperation: string | null }[]
    missingFiles: { id: string, storageKey: string, caption: string | null }[]
    failedProcessing: { id: string, error: string }[]
    unreadable: number
    at: Date
}
```

Persisted to a single `gallery_health` document (one row, overwritten) so the
Health view can render the last result without re-walking 4,781 files on every
page load.

### 5.4 Module split

Pure (no `fs`, no `mongodb`, unit-testable in isolation):

- `lib/gallery/filenames.ts` — `sanitizeFilePart`, `buildMediaFilename`,
  `parseMediaFilename`, `MAX_NAME_PART`
- `lib/gallery/content-path.ts` — `parseContentPath`, `buildContentPath`,
  segment sanitisation and the 2/3/4-segment rules

Impure:

- `lib/gallery/reconcile.ts` — the walker and the four rules
- `lib/gallery/relocate.ts` — `relocateMedia(db, id, { operationId, mission })`:
  resolves the target folder, renames the file on the same volume, updates the
  document. Rename, never copy — bulk-moving 300 items must be instant and must
  not duplicate bytes.

---

## 6. The J5 Media Console

Tab order becomes: **Media · Submissions · Featured · Screenshot of month ·
Tags · Meetings · Tickets**.

### 6.1 Media — layout

Three columns.

**Left rail** — saved views on top, archive tree below, every row carrying a
live count:

- Views: All media · Not linked to an operation · No caption · Videos · Health
- Archive: `{year}` → `{operation}` → `{mission}`, expandable, counts at each level

**Centre** — a toolbar (text search over caption/author/filename, filter chips
for tag / author / kind / status, and a Grid ⇄ Table toggle), a bulk-selection
bar that appears once anything is selected, and the results themselves.

Grid is for recognising a shot. Table is for working through three hundred of
them — sortable columns, inline caption editing, shift-click range selection.

**Right inspector** — the selected item's fields. With more than one selected it
becomes the bulk panel.

### 6.2 Single-item inspector

Editable: caption, operation, mission, author, tags.
Read-only: taken date (and where it came from), added date, dimensions, byte
size, vote tallies, status, and **the exact path on disk** — shown in full,
with the bracketed ID highlighted, because that string is the contract that
lets the file be moved by hand.

Actions: Save · Feature · Delete.

### 6.3 Bulk panel

- **Move to operation** — with mission left as "keep existing" by default.
- **Add tags** / **Remove tags**
- **Set author**
- **Delete**

Before applying, the panel states the consequence in plain terms: *"Sets the
date to 14 Aug 2021 and moves 7 files into `content/2021/4. Op Silent Ridge/`
on disk."* A bulk move that relocates files is not something to discover after
the fact.

### 6.4 Editing converts a legacy name

When a legacy item (path-matched, no ID in its filename) has its caption,
author or operation edited, the file is renamed to carry its ID. This is how
the archive converts to the ID scheme gradually — no mass rename of 4,781
files, and every file a human has touched gains the property that makes moving
it safe.

### 6.5 Health

A view in the rail, not a tab, because everything it lists is still media.

| Severity | Row | Fix |
|---|---|---|
| Critical | Missing file | Delete record |
| Warning | Transcode failed | Retry · Discard |
| Info | Not indexed | Index (operation proposed from folder) |

Plus a **Re-scan disk** action that runs §5 and refreshes the report.

"Not indexed" turns copying files straight into a folder into a supported
workflow: drop them in, re-scan, assign the operation.

### 6.6 Submissions

The current queue puts a full-width empty caption box above the fields and
buries the thumbnail, so a reviewer cannot see what they are judging. Inverted:
a 172px preview leads, fields sit beside it in two columns, Accept/Reject sit in
a fixed column on the right.

Carried forward from the predecessor spec, and re-stated because both are
regressions if lost:

- **Accept cannot publish nothing.** A failed transcode has no file. Accept is
  disabled on those rows.
- **Edits flush before accept.** Field edits are debounced; Accept awaits the
  pending save so a corrected operation is never published with the old value.

New: **Expand** opens the same lightbox the public gallery uses. Judging a clip
from a thumbnail does not work.

### 6.7 Featured

Today: `readdirSync` over `storage/gallery/featured/`, 58 images, no records, no
order, its own upload path, and the traversal bug of §1.1.

Becomes: `featuredOrder?: number` on `GalleryMedia`. The tab shows an ordered
rotation (drag to reorder) above a library picker sorted by rating. The 58
existing files are indexed as media documents with `storageKey: featured:{file}`
and sequential `featuredOrder` — bytes stay where they are. They appear in the
library like anything else and can be given an operation later.

`/api/gallery/featured` stops taking a filename and starts serving by media id
through the existing `/api/gallery/media/[id]` route, which deletes the
vulnerable code path rather than patching it.

**The reader side changes with it.** `GET /api/gallery` currently returns
`featured` as a `string[]` of raw filenames, and `useGalleryData` shuffles it
with `.sort(() => Math.random() - 0.5)` on arrival — so a curated order would be
discarded the moment it was set. `featured` becomes an array of
`{ id, width, height }` ordered by `featuredOrder`, the client-side shuffle is
removed, and `FeaturedRail` and `page.tsx`'s `openFeatured` render
`/api/gallery/media/{id}` instead of `?img={filename}`.

(The removed shuffle is also a latent bug in its own right:
`sort(() => Math.random() - 0.5)` is not a uniform shuffle and is undefined
behaviour under the spec's comparator contract. The dashboard's **Shuffle**
button randomises `featuredOrder` server-side instead, once, deliberately.)

### 6.8 Screenshot of the month

Same move: `sotmAt?: Date` and `sotmCredit?: string` on `GalleryMedia`, picked
from the library instead of re-uploading a file that already exists. Existing
SOTM files are indexed with `storageKey: sotm:{file}`. Past winners stay listed
so it is visible what has been run.

### 6.9 Tags

Closest to finished. Two additions: a **usage count** per tag (so dead
vocabulary is visible), and **drag ordering**, since that order is what both
the submit form and the public gallery's facet rail render.

---

## 7. Backup round trip

`openDownloadZipStream` is **not modified**. The zip is already
`{ db-source/, gallery/, uploads/ }` and `gallery/` is already a verbatim copy
of the live tree — which §4 has now made readable.

One change, in `applyUploadedZip` and `revertToPoint`: after the media tree is
copied into place and the database restored, **run reconcile** and store its
report. A restored backup whose tree was rearranged by hand then arrives with
its moves already applied and its unresolvable rows waiting in Health.

Reconcile runs after both the database and media restore steps, never between
them — it compares the two, so it needs both to be settled.

---

## 8. Migration

`scripts/index-gallery.mjs` already walks the tree, matches folder names against
operation records (44 of 88), and falls back to a January-1st date or null.
Changes:

1. Write `content:` keys instead of `legacy:`, and handle the 2- and
   3-segment shapes (`Unknown/`, and operation folders holding files directly).
2. Index `storage/gallery/featured/` and `storage/gallery/sotm/` with their
   own prefixes and `featuredOrder` / `sotmAt`.
3. A one-shot companion, `scripts/relocate-flat-media.mjs`, that moves anything
   still in `media/` with a non-poster key into the content tree under its new
   name. Idempotent; skips posters.

**Neither is run against production by an agent.** They are built and verified
against fixture trees. The user runs them, with a J4 backup taken immediately
beforehand.

The existing safeguards stay: dry-run by default, `$setOnInsert` so a caption a
reviewer has since added survives a re-run, unreadable files counted rather than
fatal, and separate `wouldInsert`/`alreadyIndexed` counters so a dry run cannot
report a misleading total.

---

## 9. Permissions

One new key, following the existing convention in `lib/permissions.ts` (an
empty array, since `flatten()` only emits a path when it reaches one, and
`hasPermission` never reads the value):

- `gallery.manage` — the Media tab: edit, bulk-edit, move, index, delete,
  re-scan, and set Featured/SOTM.

Existing `gallery.submit`, `gallery.review` and `gallery.tags` are unchanged.
`gallery.review` continues to gate Submissions alone.

`J5Panel`'s conditional tabs must keep using the derived `extraTabs` array —
MUI indexes tabs positionally, so inserting a permission-gated tab mid-list
desynchronises every tab after it.

---

## 10. API surface

New, all under `gallery.manage`:

| Route | Purpose |
|---|---|
| `GET /api/gallery/admin/library` | Paged, filtered, sorted list for the Media tab |
| `GET /api/gallery/admin/tree` | Rail counts by year / operation / mission (exists; extended with counts) |
| `PATCH /api/gallery/admin/media/[id]` | Caption, tags, author, operation, mission |
| `DELETE /api/gallery/admin/media/[id]` | Record and file |
| `POST /api/gallery/admin/bulk` | Move, add/remove tags, set author, delete |
| `POST /api/gallery/admin/reconcile` | Run §5, persist and return the report |
| `GET /api/gallery/admin/health` | Last persisted report |
| `POST /api/gallery/admin/index` | Index specific `not-indexed` paths |
| `PUT /api/gallery/admin/featured` | Set the ordered rotation |
| `PUT /api/gallery/admin/sotm` | Set the current pick by media id |

Modified: `/api/gallery/featured` (serve by id, kill the traversal),
`/api/gallery/media/[id]` (drop `immutable`, add a version token derived from
the document's `bytes` so a replaced file busts cache).

---

## 11. Testing

Pure modules carry the load, matching the predecessor spec's approach — the
suite is already 867 tests across 68 files with `fileParallelism: false`.

- `filenames.test.ts` — the grammar round-trips: build → parse → same ID, for
  every optional-part combination. Captions containing `]`, `[`, `/`, control
  characters, trailing dots, 300-character captions, and captions that are
  entirely punctuation.
- `content-path.test.ts` — 2/3/4-segment parsing, `2022 - 2023` year ranges,
  traversal attempts (`..`, absolute paths, backslashes, empty segments).
- `reconcile.test.ts` — against a fixture tree in the scratchpad: each of the
  four rules in isolation, then the case that matters most — **a file moved
  between folders keeps its caption, tags, author and votes and takes its new
  operation**. Plus the ordering assertion: a moved file must match by ID, not
  by its stale path.
- `relocate.test.ts` — rename-not-copy (assert the source no longer exists and
  no byte duplication), folder reuse via `normalizeKey`, and the
  next-order-number path.
- `index-gallery.test.ts` — extended for the new key prefix and segment shapes.
- Backup round trip — extend `backups.roundtrip.test.ts` to assert reconcile
  runs after restore and that a hand-moved file in the uploaded zip lands with
  its new operation.

The traversal fix gets its own regression test asserting `?img=../../../.env`
is refused.

---

## 12. Sequencing

**Plan A — the data layer.** Independently testable, ships nothing visible.

1. The traversal fix and the cache-header fix (§1.1) — first, alone.
2. `filenames.ts` + `content-path.ts` (pure).
3. `resolveStorageKey` accepting 2–4 segments; `legacy:` → `content:` rewrite.
4. `relocate.ts`.
5. `reconcile.ts` and the `gallery_health` document.
6. Reconcile wired into `applyUploadedZip` / `revertToPoint`.
7. Submission writes routed into the content tree.
8. Migration script changes + `relocate-flat-media.mjs` (built, not run).

**Plan B — the console.** Depends on A.

9. `gallery.manage` permission and the API routes.
10. Media tab: rail, grid, table, inspector.
11. Bulk panel and the move consequence statement.
12. Health view.
13. Submissions rebuild.
14. Featured and SOTM moving onto the library.
15. Tags: usage counts and ordering.

---

## 13. Deliberate omissions

- **Hide/unhide** (§3, N1) — excluded by the user. Recorded because accepting a
  submission is currently one-way: a reviewer who publishes something they
  should not has to delete the file to undo it.
- **Poster relocation** — posters stay flat in `media/` (§4.2).
- **Legacy filename rewriting** — only on edit (§6.4), never in bulk.
- **Scheduled reconciliation** — human-triggered only (§3, N3).
