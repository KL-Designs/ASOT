# J5 Console — the remaining tabs (Plan B2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the J5 console against the approved mockups — rebuild the Submissions review queue, move Featured and Screenshot of the Month onto the media library instead of their own upload silos, give tags usage counts and ordering, and close the two gaps disclosed at the end of Plan B1.

**Architecture:** Everything here already has a working predecessor, so this plan is mostly *replacement* rather than new construction. The through-line: three separate stores of gallery images (`content/`, `featured/`, `sotm/`) collapse into one library, with `featuredOrder` and `sotmAt` as flags on `gallery_media` rather than directories with their own upload routes. The public gallery's reader side changes with them, which is the only part of this plan a member can see.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, MongoDB driver v7, MUI (dashboard), CSS modules (public gallery), vitest.

**Spec:** `apps/web/docs/superpowers/specs/2026-08-30-j5-media-console-design.md` — sections 6.6, 6.7, 6.8, 6.9.

**Predecessors:** Plan A (storage, `relocateMedia`, `reconcile`) and Plan B1 (the Media tab). Both complete on this branch.

## Global Constraints

- **Branch is `feat/gallery-submissions`.** Extend it. Never push. Never commit to `main`. Check `git branch --show-current` before every commit.
- **DO NOT RUN TESTS.** The user has asked that no time be spent on `npx vitest run`, `npm run lint` or `npm run build` during implementation. Write the code, write the tests a task calls for, and commit. `npx tsc --noEmit` is optional and cheap. **Every implementer must state in its report exactly which commands it ran**, so unverified code is never mistaken for verified. The controller runs the full set once, at the end.
- **Never run any script against the production database.** The archive migration is the user's to run.
- **`gallery.manage` and `gallery.review` already exist.** No new permission keys. Note that the SOTM route currently gates on `departmentLeads.j5`, which is *different* — see Task 6.
- **No hide/unhide.** Delete is the only removal path (spec §3, N1).
- **Nothing may delete a gallery record automatically.** Only an explicit, human-triggered delete.
- **No `as` casts, no `any`** in new or rewritten modules.
- **Do not change `FIXED_TABS` arithmetic without doing Task 8 properly.** MUI indexes tabs by position among those rendered, and two are permission-gated. This bug has been fixed once in this codebase already.
- Ambient types live in `apps/web/types/*.d.ts` using `declare global { }` plus a bare `export {}`.
- Comments explain *why*, naming the specific failure a line prevents. Match the density of the file you are editing.
- Do not leave scratch files under `apps/web/`.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `apps/web/app/dashboard/j5/tabs/submissions/SubmissionsTab.tsx` | The rebuilt review queue shell. |
| `apps/web/app/dashboard/j5/tabs/submissions/SubmissionRow.tsx` | One pending item: preview left, fields beside it, actions fixed right. |
| `apps/web/app/dashboard/j5/tabs/submissions/useSubmissions.ts` | Queue state, the debounced save, and the flush-before-accept contract. |
| `apps/web/app/api/gallery/admin/featured/order/route.ts` | `PUT` the featured rotation as an ordered list of media ids. |
| `apps/web/app/dashboard/j5/tabs/featured/FeaturedTab.tsx` | Ordered rotation above a library picker. |
| `apps/web/app/dashboard/j5/tabs/sotm/SotmTab.tsx` | Current pick, past winners, replace-from-library. |
| `apps/web/app/dashboard/j5/tabs/media/MediaTable.tsx` | The mockup's table view. |
| `apps/web/styles/j5-console.module.css` | Layout shared by the rebuilt tabs. |

**Modified:**

| File | Change |
|---|---|
| `apps/web/app/api/gallery/route.ts` | `featured` becomes ordered media ids from the database, not a `readdirSync`. |
| `apps/web/app/(landing)/gallery/useGalleryData.ts` | Stop shuffling; consume the new shape. |
| `apps/web/app/(landing)/gallery/_components/FeaturedRail.tsx` | Render `/api/gallery/media/{id}`. |
| `apps/web/app/(landing)/gallery/page.tsx` | `openFeatured` builds its lightbox item from a media record. |
| `apps/web/app/api/gallery/sotm/route.ts` | Point at a media id; keep the legacy record readable. |
| `apps/web/app/dashboard/j5/tabs/GalleryTagsTab.tsx` | Usage counts and drag ordering. |
| `apps/web/app/dashboard/j5/J5Panel.tsx` | Tab order, labels, and name-keyed gating. |
| `apps/web/app/dashboard/j5/tabs/media/MediaTab.tsx` | Grid ⇄ Table toggle. |
| `apps/web/types/gallery.d.ts` | `FeaturedItemAPI`; `GalleryAPI.featured` reshaped. |

**Deleted at the end of Task 5, not before:** `apps/web/app/dashboard/j5/tabs/GalleryFeaturedTab.tsx`. It stays reachable until its replacement has been used against real data.

---

## Task 1: The Submissions queue — layout

The current tab puts a full-width empty caption box above the fields and squeezes the thumbnail underneath, so a reviewer cannot see what they are judging. The mockup inverts it: preview leads at a readable size, fields sit beside it in two columns, Accept/Reject in a fixed column on the right.

**This is a rewrite of working code with one property that must not be lost.** Field edits are debounced 800ms; Accept fires immediately and the accept route ignores its body. Without a flush, editing a mis-tagged operation and clicking Accept within 800ms publishes the *old* values, silently. That was a Critical found in the first session, and `GallerySubmissionsTab.tsx` currently implements the fix with a `pendingSave` ref awaited before accept, including per-item flush in `acceptBatch`.

**Files:**
- Create: `apps/web/app/dashboard/j5/tabs/submissions/useSubmissions.ts`
- Create: `apps/web/app/dashboard/j5/tabs/submissions/SubmissionRow.tsx`
- Create: `apps/web/app/dashboard/j5/tabs/submissions/SubmissionsTab.tsx`
- Create: `apps/web/styles/j5-console.module.css`
- Modify: `apps/web/app/dashboard/j5/J5Panel.tsx` (swap the panel's content only — ordering is Task 8)

**Interfaces:**
- Consumes: `GET /api/gallery/submissions/pending`, `PATCH|POST|DELETE /api/gallery/submissions/[id]`, `GET /api/gallery/operations`, `GET /api/gallery/tags`.
- Produces: `useSubmissions()` → `{ batches, tags, operations, loading, patch, flush, accept, acceptBatch, reject, refresh, saveState, busy, error }`

- [ ] **Step 1: Read the existing tab in full before writing anything**

`apps/web/app/dashboard/j5/tabs/GallerySubmissionsTab.tsx`, all 500 lines. You are replacing it, and it contains four behaviours that took review rounds to get right:

1. **The debounce-and-flush contract** — `SAVE_DEBOUNCE_MS = 800`, a per-item `pendingSave` ref, and `flush()` awaited before every accept including each item inside `acceptBatch`.
2. **Accept refuses an item with no media.** A failed transcode still reaches `pending` carrying `processingError`; publishing it would put an empty `<img>` on the public page. The route returns 409 and the tab surfaces it.
3. **Reject requires a reason**, and the record flips to `rejected` *before* the bytes are deleted.
4. **`MediaPreview`** already handles uploads, videos and both embed kinds.

Carry all four across. Where you move code, move its comments with it.

- [ ] **Step 2: Write the stylesheet**

Create `apps/web/styles/j5-console.module.css`:

```css
/* Layout for the rebuilt J5 tabs.

   A CSS module, like media-console.module.css, for the same reason: these are
   layouts with their own scrolling regions, and expressing that in MUI sx
   objects spread across three components is how this dashboard's older tabs
   ended up with their layout in five places at once. Controls stay MUI. */

.batch { border: 1px solid rgba(219, 0, 29, 0.18); margin-bottom: 14px; }

.batchHead {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(219, 0, 29, 0.14);
    background: rgba(219, 0, 29, 0.06);
}
.who { font-family: var(--font-cond); font-weight: 700; font-size: 15px; letter-spacing: 0.05em; }
.when {
    font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em;
    color: rgba(237, 237, 237, 0.38); text-transform: uppercase;
}
.spacer { flex: 1; }

/* Preview leads, fields beside it, actions fixed right — the whole point of
   the rebuild. The old tab stacked a full-width caption box above a squeezed
   thumbnail, so a reviewer could not see what they were judging. */
.row {
    display: grid;
    grid-template-columns: 190px 1fr auto;
    gap: 14px;
    padding: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    align-items: start;
}
.row:last-child { border-bottom: 0; }

.preview {
    position: relative; aspect-ratio: 16 / 10;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.3);
}
.preview img, .preview video, .preview iframe {
    width: 100%; height: 100%; object-fit: cover; display: block; border: 0;
}
.previewFail {
    display: grid; place-items: center; height: 100%;
    font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em;
    color: var(--amber); text-align: center; padding: 8px;
}
.dur {
    position: absolute; right: 5px; bottom: 5px;
    font-family: var(--font-mono); font-size: 9px;
    background: rgba(0, 0, 0, 0.8); color: #fff; padding: 2px 5px;
}

.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.wide { grid-column: 1 / -1; }
.techline {
    font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.05em;
    color: rgba(237, 237, 237, 0.38);
}
.warn { color: var(--amber); font-size: 12px; line-height: 1.6; }

.actions { display: flex; flex-direction: column; gap: 6px; min-width: 104px; }

.saveState {
    font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.12em;
    text-transform: uppercase; color: rgba(237, 237, 237, 0.38);
}
.saveState[data-state='error'] { color: var(--red-hi); }
.saveState[data-state='saved'] { color: var(--live); }

@media (max-width: 900px) {
    .row { grid-template-columns: 1fr; }
    .fields { grid-template-columns: 1fr; }
    .actions { flex-direction: row; }
}
```

- [ ] **Step 3: Write the hook**

Create `apps/web/app/dashboard/j5/tabs/submissions/useSubmissions.ts`. It owns the queue and, critically, the debounce-and-flush contract.

Lift the existing tab's save machinery rather than reinventing it: a `Record<string, ReturnType<typeof setTimeout>>` of pending timers and a `Record<string, () => Promise<void>>` of pending saves, both in refs; `patch(id, body)` schedules; `flush(id)` cancels the timer and awaits the save if one is pending; `accept(id)` calls `await flush(id)` first; `acceptBatch(batchId)` calls `await flush(id)` for **every** item in the batch before publishing any of them.

The contract to preserve, stated as a comment on `flush`:

```ts
/**
 * Await any pending save for this item before doing anything that reads it
 * server-side.
 *
 * Edits are debounced; Accept is not, and the accept route ignores its request
 * body — it publishes what is already in the database. Without this, correcting
 * a mis-tagged operation and clicking Accept within the debounce window
 * publishes the OLD values, silently. That was a real defect, found in review.
 */
```

- [ ] **Step 4: Write the row and the shell**

`SubmissionRow.tsx` renders one item using the stylesheet's `.row`: preview, then `.fields` with caption (wide), operation, tags, and a `.techline` stating format, dimensions, size and what the date will become on accept. `.actions` holds Accept, Reject and Expand.

Accept is **disabled** when the item has `processingError` or, for an upload, no `storageKey` — with the reason shown in `.warn`. Publishing an item with nothing behind it is the failure the route's 409 exists to prevent; the button should not offer it in the first place.

`SubmissionsTab.tsx` groups by `batchId`, renders `.batchHead` with the submitter, their department, the item count and a relative time, plus **Accept all** and **Reject all**, and maps the batch's items to rows.

- [ ] **Step 5: Point the panel at it**

In `J5Panel.tsx`, render the new `SubmissionsTab` where `GallerySubmissionsTab` was. **Change nothing about the tab list, ordering or `FIXED_TABS`** — that is Task 8. Swapping one panel's content at the same index is safe; anything else is not.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/app/dashboard/j5/tabs/submissions apps/web/styles/j5-console.module.css apps/web/app/dashboard/j5/J5Panel.tsx
git commit -m "feat(j5): rebuild the submissions queue

Preview leads at a size a reviewer can judge, fields beside it, actions
in a fixed column. Carries across the four behaviours the old tab earned
in review: the flush-before-accept contract, accept refusing an item with
no media, reject requiring a reason before the bytes go, and the embed
preview."
```

---

## Task 2: Expand to the real lightbox

Judging a clip from a 190px preview does not work. Expand opens the same lightbox the public gallery uses.

**Files:**
- Modify: `apps/web/app/dashboard/j5/tabs/submissions/SubmissionsTab.tsx`
- Modify: `apps/web/app/dashboard/j5/tabs/submissions/SubmissionRow.tsx`

**Interfaces:**
- Consumes: `Lightbox` and `LightboxItem` from `apps/web/app/(landing)/gallery/_components/Lightbox.tsx`.

- [ ] **Step 1: Read `Lightbox.tsx` and its `LightboxItem` type**

It is deliberately generic over four callers. Note that `vote` is nullable, `index` may be `null` when there are no neighbours, and embeds render through `embedIframeSrc` while uploads use `<video>` or `<img>`.

- [ ] **Step 2: Map a pending item to a `LightboxItem`**

A pending submission is not an archive item: it has no votes and no neighbours worth stepping through beyond its own batch. Set `vote: null`, and pass the batch's items as the step range so a reviewer can page through one member's upload without closing the overlay.

`kicker` should say `Pending review`; `rows` should carry the submitter and the proposed operation.

- [ ] **Step 3: Wire Expand**

Opening sets the lightbox item; `onStep` moves within the batch; `onClose` clears it. The lightbox already handles Escape and arrow keys and locks body scroll.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add apps/web/app/dashboard/j5/tabs/submissions
git commit -m "feat(j5): expand a submission into the real lightbox

Judging a clip from a 190px preview does not work. Reuses the public
gallery's lightbox rather than a second implementation, and steps within
the batch so one member's upload can be reviewed without closing it."
```

---

## Task 3: Featured becomes a flag on the library

Today `featured` is a `readdirSync` of `storage/gallery/featured/`, returned to the public page as a `string[]` of filenames which `useGalleryData` then **shuffles client-side** — so any curated order is discarded on arrival.

The migration already indexes those 58 files into `gallery_media` with `storageKey: 'featured:{file}'` and a sequential `featuredOrder`. This task makes the database the source of truth.

**Files:**
- Create: `apps/web/app/api/gallery/admin/featured/order/route.ts`
- Modify: `apps/web/app/api/gallery/route.ts`
- Modify: `apps/web/types/gallery.d.ts`

**Interfaces:**
- Produces:
  - `FeaturedItemAPI` — `{ id, src, width, height, caption, opLabel }`
  - `PUT /api/gallery/admin/featured/order` — body `{ ids: string[] }`, sets `featuredOrder` to the array index and unsets it on anything absent from the list.
  - `GET /api/gallery` — `featured` becomes `FeaturedItemAPI[]`, ordered.

- [ ] **Step 1: Add the type**

In `apps/web/types/gallery.d.ts`, inside the existing `declare global { }`:

```ts
    /** One tile of the public featured rail. Ordered by the database, not by
     *  readdir and not shuffled — J5 curates the sequence. */
    interface FeaturedItemAPI {
        id: string
        src: string
        width: number | null
        height: number | null
        caption: string | null
        opLabel: string | null
    }
```

and change `GalleryAPI`'s `featured` from `string[]` to `FeaturedItemAPI[]`.

- [ ] **Step 2: Write the ordering route**

`PUT /api/gallery/admin/featured/order`, gated on `gallery.manage`. Body `{ ids: string[] }`.

Two writes, in this order: set `featuredOrder` to each id's index, then unset `featuredOrder` on every live document not in the list. Doing the unset second means a failure between them leaves items *duplicated* in the rotation rather than the rotation empty — the recoverable direction.

Validate every id with `ObjectId.isValid` and ignore anything that is not a live media document. Cap the list at 60; the rail is a strip, not a gallery.

- [ ] **Step 3: Read from the database in `/api/gallery`**

Replace the `readdirSync` block. Query `{ status: 'live', featuredOrder: { $exists: true } }`, sort by `featuredOrder` ascending, and map to `FeaturedItemAPI` with `src: '/api/gallery/media/{id}'`.

Keep `ARCHIVE_FILTER`'s exclusion of `featured:`/`sotm:` keys — those items belong in the rail and the SOTM slot, not the archive grid.

**Update the route's header comment.** It currently explains that `featured` "still comes off the filesystem"; that stops being true here, and the comment is load-bearing for the next reader.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add apps/web/app/api/gallery/admin/featured/order apps/web/app/api/gallery/route.ts apps/web/types/gallery.d.ts
git commit -m "feat(gallery): the featured rail is ordered by the database

It was a readdir of a folder, returned as filenames and then shuffled
client-side, so a curated order could not survive arrival. featuredOrder
on gallery_media is now the source of truth."
```

---

## Task 4: The Featured tab

**Files:**
- Create: `apps/web/app/dashboard/j5/tabs/featured/FeaturedTab.tsx`
- Modify: `apps/web/app/dashboard/j5/J5Panel.tsx` (content swap only)

- [ ] **Step 1: Build the two zones**

Top: **In rotation**, ordered, drag to reorder, each tile showing its position. Bottom: **Library**, the `/api/gallery/admin/library` list sorted by `rated`, excluding anything already in rotation, with an add control per tile.

Reordering issues a `PUT` of the whole list. Removing from rotation is the same `PUT` with that id dropped.

Reuse `media-console.module.css`'s tile classes rather than inventing new ones — this is the same visual vocabulary as the Media tab's grid.

- [ ] **Step 2: Keep upload working**

`POST /api/gallery/admin/featured` still accepts direct uploads into `featured/`. Keep the button: it is how a shot that is not in the archive gets featured. A file uploaded this way has no `gallery_media` record until the migration or a Health re-scan indexes it, so say so in the UI rather than letting it silently not appear in the rotation.

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add apps/web/app/dashboard/j5/tabs/featured apps/web/app/dashboard/j5/J5Panel.tsx
git commit -m "feat(j5): featured picks from the library, in an order you set"
```

---

## Task 5: The public featured rail

The only member-visible change in this plan. Get it right or the front page of the site is wrong.

**Files:**
- Modify: `apps/web/app/(landing)/gallery/useGalleryData.ts`
- Modify: `apps/web/app/(landing)/gallery/_components/FeaturedRail.tsx`
- Modify: `apps/web/app/(landing)/gallery/page.tsx`
- Delete: `apps/web/app/dashboard/j5/tabs/GalleryFeaturedTab.tsx`

- [ ] **Step 1: Stop shuffling**

`useGalleryData` currently does `[...(json.featured ?? [])].sort(() => Math.random() - 0.5)`. Remove it and hold the ordered array as received.

Besides discarding the curation, that comparator is not a uniform shuffle and is undefined behaviour under the spec's comparator contract. If J5 wants randomness they now press **Shuffle** in the tab, which randomises `featuredOrder` server-side, once, deliberately.

- [ ] **Step 2: Render by id**

`FeaturedRail` takes `FeaturedItemAPI[]` and renders `/api/gallery/media/{id}`. Keep the existing pointer-capture behaviour exactly — capture is taken lazily in `onPointerMove`, not on `pointerdown`, because a captured pointer retargets the click from the tile button to the rail div and swallows it. That was a reported bug and the comment above it explains the fix.

- [ ] **Step 3: Open the real record**

`page.tsx`'s `openFeatured` builds a `LightboxItem` from a filename today. It now has a real media record: give it the caption, the operation label as `kicker`, and `/api/gallery/media/{id}` as `src`.

- [ ] **Step 4: Delete the old tab**

`GalleryFeaturedTab.tsx` has no remaining reference. Remove it and confirm nothing imports it.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add "apps/web/app/(landing)/gallery" apps/web/app/dashboard/j5/tabs
git commit -m "feat(gallery): the public featured rail reads media records

Drops the client-side shuffle, which discarded J5's curated order on
arrival and was not a uniform shuffle anyway. The rail now renders by
media id and the lightbox opens the real record with its caption."
```

---

## Task 6: Screenshot of the month onto the library

**Files:**
- Modify: `apps/web/app/api/gallery/sotm/route.ts`
- Create: `apps/web/app/dashboard/j5/tabs/sotm/SotmTab.tsx`
- Modify: `apps/web/app/dashboard/j5/J5Panel.tsx` (content swap only)

- [ ] **Step 1: Note the permission mismatch before you touch the route**

The SOTM route gates on `departmentLeads.j5`, not `gallery.manage`. Every other gallery admin route uses `gallery.manage`. **Do not silently change it** — widening who can set the screenshot of the month is a policy decision, not a refactor. Keep `departmentLeads.j5` and say in your report that the inconsistency exists.

- [ ] **Step 2: Point SOTM at a media id**

The current record is a `siteSettings` document `{ _id: 'screenshotOfMonth', filename, dateTaken, credit, setAt, setBy, operationId, operationTitle }`.

Add `mediaId` to it, and a `PUT` accepting `{ mediaId, credit }` that sets `sotmAt` and `sotmCredit` on the media document and records the pointer. Keep the existing `filename`-based read path working for a record that predates this — a `GET` must still answer correctly for the SOTM set before this shipped.

- [ ] **Step 3: Build the tab**

Current pick with its facts and a **Replace from library** picker; past winners below, read from `gallery_media` where `sotmAt` exists, newest first.

**Do not invent a `sotmAt` for the file migrated from `sotm/`.** The migration deliberately does not set it — there is no honest source for the date, and file mtime would be a fabrication. If the current record has a `filename` but the media document has no `sotmAt`, set it when the record is next written, and until then show the legacy record's own `setAt`.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add apps/web/app/api/gallery/sotm apps/web/app/dashboard/j5/tabs/sotm apps/web/app/dashboard/j5/J5Panel.tsx
git commit -m "feat(j5): screenshot of the month picks from the library"
```

---

## Task 7: Tag usage counts and ordering

**Files:**
- Modify: `apps/web/app/dashboard/j5/tabs/GalleryTagsTab.tsx`
- Modify: `apps/web/app/api/gallery/tags/route.ts`

- [ ] **Step 1: Return counts**

`GET /api/gallery/tags` is public and cheap; do **not** add an aggregation to it. Instead have the tab read counts from `GET /api/gallery/admin/facets`, which already computes `tags: [{ slug, label, count }]` — it is `gallery.manage`-gated and the tab is behind that permission anyway.

- [ ] **Step 2: Show the count and a proportion bar**

Each row gains its usage count and a bar scaled against the most-used tag, so dead vocabulary is visible at a glance.

- [ ] **Step 3: Drag to reorder**

The existing tab has up/down arrow buttons writing `order`. Keep them as the accessible path and add dragging on top; the order is what both the submit form and the public facet rail render.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add apps/web/app/dashboard/j5/tabs/GalleryTagsTab.tsx apps/web/app/api/gallery/tags/route.ts
git commit -m "feat(j5): tag usage counts and drag ordering"
```

---

## Task 8: Tab order and labels

The mockup's tab set is `Media · Submissions · Featured · Screenshot of month · Tags · Meetings · Tickets`, with Submissions promoted to second. The panel currently renders five fixed tabs and appends the two permission-gated ones at the end.

**This is the change the file's own comment warns about.** MUI indexes tabs by position among those *actually rendered*, so with two gated tabs a member holding one permission but not the other lands on the wrong panel. Fixing that once is why the current `extraTabs` array exists.

**Files:**
- Modify: `apps/web/app/dashboard/j5/J5Panel.tsx`

- [ ] **Step 1: Key panels by name, not by index**

Build a single array of `{ key, label, pinLabel, render }` in mockup order, filtered by permission. Both the `<Tab>` list and the panel body then derive from the same array, so a hidden tab cannot shift what any other index means — the position is computed, never assumed.

Delete `FIXED_TABS` once nothing reads it. Check `useTabState`'s stored index: a member with a pinned tab index from the old ordering must not land somewhere surprising — clamp to the array length.

- [ ] **Step 2: Shorten the labels to the mockup's**

`Featured Images` → `Featured`, `Screenshot of Month` → `Screenshot of month`, `Gallery Tags` → `Tags`. Keep the `pinLabel` values distinct and prefixed with `J5 —`, as they are now.

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add apps/web/app/dashboard/j5/J5Panel.tsx
git commit -m "feat(j5): tab order and labels match the mockups

Panels are keyed by name rather than by position, so a permission-gated
tab can no longer shift what another index means — which is the bug the
old FIXED_TABS arithmetic existed to avoid, now avoided structurally."
```

---

## Task 9: The Media tab's table view

Cut from Plan B1 and disclosed. The grid is for recognising a shot; the table is for working through three hundred of them.

**Files:**
- Create: `apps/web/app/dashboard/j5/tabs/media/MediaTable.tsx`
- Modify: `apps/web/app/dashboard/j5/tabs/media/MediaTab.tsx`

- [ ] **Step 1: Build the table**

Columns: a selection checkbox, a 48px thumbnail, caption (editable inline), operation, mission, author, taken date, and size. Sorting is by the existing `sort` parameter, so the header cells set it rather than sorting client-side — the list is paged and a client sort would only order the visible page.

Shift-click selects a range, matching the grid's behaviour. Reuse the grid's range logic rather than writing a second copy.

- [ ] **Step 2: Inline caption editing**

Editing a caption in a table cell `PATCH`es that item — the same route the inspector uses. Debounce it, and surface a failure on the row rather than silently discarding the edit.

- [ ] **Step 3: Wire the toggle**

`MediaTab`'s toolbar gains a Grid ⇄ Table segmented control. It belongs in the `view` state the toolbar already owns; the rail, filters and inspector are unaffected.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add apps/web/app/dashboard/j5/tabs/media
git commit -m "feat(j5): the media table view

Grid is for recognising a shot, table is for working through three
hundred. Sorting sets the server-side sort parameter rather than
reordering a page, which would only sort what is visible."
```

---

## Self-Review

**Spec coverage.** §6.6 Submissions rebuild → Tasks 1–2. §6.7 Featured onto the library, including the reader side and the removed shuffle → Tasks 3–5. §6.8 SOTM → Task 6. §6.9 tag counts and ordering → Task 7. The two gaps disclosed at the end of Plan B1 → Tasks 8 and 9.

Not here, and correctly so: hide/unhide (excluded by the user), and running the archive migration (the user's to trigger).

**Placeholder scan.** No "TBD", no "handle edge cases". Several steps direct the implementer to read existing code rather than quoting it — Task 1 Step 1 (the four earned behaviours), Task 2 Step 1 (`LightboxItem`'s shape), Task 5 Step 2 (`FeaturedRail`'s pointer capture), Task 8 Step 1 (`useTabState`'s stored index). Each is a case where a stale snippet would be worse than naming the thing to read, and each names precisely what to look for.

**Type consistency.** `FeaturedItemAPI` is defined in Task 3 and consumed in Tasks 4 and 5. `GalleryAPI.featured` changes shape in Task 3 and every consumer is updated in Task 5 — those two tasks must not be split across a release. `useSubmissions`'s return is defined in Task 1 and extended by Task 2's lightbox state.

**One risk I want on the record:** Tasks 3 and 5 straddle the public gallery. Between them, `/api/gallery` returns the new shape while `useGalleryData` still expects the old one, so the featured rail is broken on the branch between those two commits. They should land together, and the final review should check that nothing else read `featured` as a `string[]`.

---

## Task 10: The mockup's control language (runs BEFORE Tasks 8 and 9)

Added after the user reviewed the built tabs and found the controls did not match the approved
mockups. The layout does; the controls do not. Every button in the new tabs is a plain MUI
`<Button variant='outlined' size='small'>` with a font-size override, so it renders with MUI's shape,
ripple and palette rather than the mockups' flat uppercase button with a thin red border. There are no
`.btn` / `.chip` / `.seg` / `.frame` classes anywhere, and `CornerBrackets` — which exists in this
codebase and frames every panel in the mockups — is used in none of the new tabs.

That divergence was a deliberate choice recorded in the earlier plans ("MUI for controls, matching the
sibling tabs' `inputSx` idiom") and never surfaced to the user. **Scope, decided by the user: the J5
tabs only.** J5 will look different from J1–J7 until they follow; it becomes the template if they do.

**Files:**
- Create: `apps/web/styles/j5-controls.module.css`
- Modify: every J5 media/submissions/featured/sotm/tags tab component

**Interfaces:**
- Produces: the class set below, imported as `c` by every J5 console component.

- [ ] **Step 1: Open the approved mockups and match them**

`https://claude.ai/code/artifact/9451c88e-b772-4d2a-80b7-6f037c23e43e` is the approved design. Its
control styles are the target — read them there rather than inventing an interpretation.

- [ ] **Step 2: Write the control stylesheet**

Create `apps/web/styles/j5-controls.module.css`. The set, taken from the mockups:

```css
/* The J5 console's control language.

   Split from the layout modules deliberately: media-console and j5-console own
   where things sit, this owns what they look like. Scoped to J5 by the user's
   decision — the other departments are MUI and stay MUI until someone decides
   otherwise, at which point this file is the template rather than a second
   opinion. */

.btn {
    font-family: var(--font-cond);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border: 1px solid var(--grey);
    background: rgba(255, 255, 255, 0.02);
    color: var(--foreground);
    padding: 6px 12px;
    white-space: nowrap;
    cursor: pointer;
    transition: border-color 120ms var(--nav-ease), background 120ms var(--nav-ease);
}
.btn:hover:not(:disabled) { border-color: rgba(219, 0, 29, 0.5); background: rgba(219, 0, 29, 0.06); }
.btn:focus-visible { outline: 1px solid var(--red); outline-offset: 1px; }
.btn:disabled { opacity: 0.4; cursor: default; }

/* Primary — the action the panel exists for. One per panel, at most. */
.btnPrimary { border-color: var(--red); background: rgba(219, 0, 29, 0.2); color: #fff; }
.btnPrimary:hover:not(:disabled) { background: rgba(219, 0, 29, 0.3); }

/* Destructive. Never the primary, never the only styling that marks a delete —
   the two-step confirm carries that weight. */
.btnDanger { border-color: rgba(255, 66, 87, 0.4); color: var(--red-hi); background: transparent; }
.btnDanger:hover:not(:disabled) { border-color: var(--red-hi); background: rgba(255, 66, 87, 0.08); }

.btnGhost { border-color: var(--grey); background: transparent; color: rgba(237, 237, 237, 0.62); }

.chip {
    font-family: var(--font-cond);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 1px solid var(--grey);
    background: transparent;
    color: rgba(237, 237, 237, 0.62);
    padding: 5px 10px;
    white-space: nowrap;
    cursor: pointer;
}
.chipOn { border-color: var(--red); color: var(--red-hi); background: rgba(219, 0, 29, 0.1); }

.seg { display: flex; border: 1px solid var(--grey); }
.segItem {
    font-family: var(--font-mono);
    font-size: 9.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 5px 9px;
    color: rgba(237, 237, 237, 0.38);
    border-right: 1px solid var(--grey);
    background: transparent;
    cursor: pointer;
}
.segItem:last-child { border-right: 0; }
.segItemOn { background: rgba(219, 0, 29, 0.14); color: var(--red-hi); }

/* The mono eyebrow above a section — '// SECTION' in the mockups. */
.eyebrow {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--red);
}
```

- [ ] **Step 3: Replace the MUI buttons**

Across the J5 media, submissions, featured, SOTM and tags tabs, replace `<Button …>` with
`<button type='button' className={...}>` using the classes above. Map the intent:

- The action the panel exists for → `btn btnPrimary` (Save, Apply to N, Accept, Set as SOTM)
- Ordinary actions → `btn`
- Delete and Reject → `btn btnDanger`
- Cancel and Clear → `btn btnGhost`

**Always `type='button'`.** A bare `<button>` inside a form defaults to `type='submit'`; several of
these sit next to inputs and would submit and reload the page.

Keep every `disabled` condition exactly as it is — several encode real guards (Accept disabled when an
item has no media, Apply disabled with no operation chosen). Keep the two-step delete confirmations.

- [ ] **Step 4: Frame the panels**

Use the existing `CornerBrackets` component — read it first — on the panels the mockups show framed:
the media workspace, each submissions batch, the featured rotation and library zones. Do not invent a
second corner-bracket implementation.

- [ ] **Step 5: Leave the inputs alone**

Text fields, selects and autocompletes stay MUI with the existing `inputSx`. The mockups draw them as
flat bordered boxes, which `inputSx` already approximates, and replacing MUI's `Autocomplete` for tag
selection with a hand-rolled multi-select would be a large amount of accessible-combobox work for a
cosmetic gain. If you disagree after looking, say so in your report rather than doing it.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/styles/j5-controls.module.css apps/web/app/dashboard/j5
git commit -m "feat(j5): the console's control language matches the mockups

Layout already did; the controls were MUI with a font-size override. Flat
uppercase buttons, filter chips, segmented toggles and corner-bracketed
panels, scoped to J5 by decision — the other departments stay MUI until
someone decides otherwise."
```
