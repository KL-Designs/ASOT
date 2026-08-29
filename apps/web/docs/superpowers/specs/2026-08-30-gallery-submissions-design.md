# Gallery submissions, video, tags and voting

**Date:** 2026-08-30
**Status:** approved, not yet implemented
**Touches:** `apps/web` (gallery, J5 dashboard, permissions, uploads), the root `dockerfile`, one root migration script.

---

## 1. What this is

Today the gallery is a read-only window onto a folder tree. `GET /api/gallery`
walks `storage/gallery/content/{year}/{operation}/{mission}/` with `readdirSync`
and returns the tree; the page flattens it. There is no database record for any
gallery item, which is why the page carries no author, no tags and no likes —
the code says so out loud:

> Everything on this page is derived from what storage actually holds. The
> archive is a tree of years, operations, missions and files and nothing more,
> so there is no photographer facet, no tags and no likes — the mockup carried
> all three, and every one of them would have had to be invented.
> — `app/(landing)/gallery/page.tsx`

This design gives the archive the index it never had, and builds five things on
top of it:

1. Members submit photos, video files and YouTube/Twitch links from a dedicated
   page, gated behind a new permission key.
2. Uploads are compressed server-side and report live progress while they run.
3. J5 reviews every submission in their dashboard — reject it, or fix its
   caption, tags or operation and accept it.
4. The public gallery gains video, tags, authors and captions.
5. Members thumbs-up / thumbs-down published media, with a ratio bar and count.

It also fixes a bug: clicking a tile in the featured carousel does nothing.

## 2. Decisions taken

| Question | Decision |
|---|---|
| Which department reviews | **J5 - Media** — it already owns `gallery.manage`, Featured Images and Screenshot of the Month |
| Old archive vs. new submissions | **One model.** A migration indexes every existing file into Mongo; files stay on disk where they are |
| Video compression | **ffmpeg in the web image.** Real transcode, real poster frames |
| Who can vote | **Logged-in members only.** Guests see the bar, and get a login prompt on click |
| `gallery.submit` on day one | **Strictly key-gated.** Nobody can submit until the key is granted in the Roles Manager |
| Tag vocabulary | **J5-managed in Mongo**, seeded with a starter list |
| Accept / reject feedback | **Site notification**; a rejection requires a reason and shows it |
| Upload ceilings | 20 items per submission, images 20MB, video 500MB and 5 minutes |
| Caption | The field is called **caption**, not description, everywhere |
| Embeds | A **video source**, not a separate kind — `source: 'upload' \| 'youtube' \| 'twitch'` |

### Why one collection and not two

An earlier draft had `gallery_submissions` feeding a separate `gallery_media`.
Collapsing them removes a copy-on-approve step and a class of drift between the
record a reviewer edited and the record the gallery renders. Status is a field,
not a collection boundary.

### Why a background transcode queue

A 5-minute 1080p transcode is one to three minutes of CPU. Doing it inside the
upload request would hold the connection open past every proxy timeout, and
would make an upload progress bar a lie — it would sit at 100% for minutes.
So the request ends when the bytes have landed, and the work happens after.

Rejected alternatives: transcoding in the browser with WebCodecs (large,
fragile, patchy Safari support, and it makes the member's laptop do minutes of
encoding with the tab open), and no ffmpeg at all (a 500MB clip stays 500MB
forever, which is not "compress the videos").

## 3. Permissions

Three new keys under `gallery` in `lib/permissions.ts`:

| Key | Gates |
|---|---|
| `gallery.submit` | The Submit button, `/gallery/submit`, and every submission API route |
| `gallery.review` | The J5 review tab and the accept / reject / edit routes |
| `gallery.tags` | The tag vocabulary tab and its routes |

All three are checked with plain `await hasPermission(user, key)`. **No legacy
arm.** `hasPermission` has no Discord-role fallback, so each key is false for
everybody — including staff — until it is granted in the Roles Manager. This is
deliberate, and it has a deployment consequence:

> **After deploy, nothing works until the keys are granted.** Put
> `gallery.review` and `gallery.tags` on the J5 base department role, and
> `gallery.submit` on whichever ORBAT or department role every member holds.
> Until then the Submit button will not render for anyone and the J5 tab will
> not appear.

The existing `gallery.manage` key is untouched and keeps guarding the current
J5 folder / featured / SOTM tools.

Voting is **not** a permission key. It is "any authenticated member", checked
with `client.fetchMe()` — the same bar as any other logged-in action on the
public site.

`lib/permissions-descriptions.ts` gains a line for each new key so the
Permissions Explorer describes them.

## 4. Data model

Three collections, registered in `lib/mongo.ts`, with global shapes in a new
`apps/web/types/gallery-media.d.ts` (following the convention in
`types/README.md`).

### `gallery_media`

One document per piece of media. This is the index the entire gallery reads
from after the migration.

```ts
interface GalleryMedia {
    _id: ObjectId

    kind: 'image' | 'video'
    /** Where the bytes are. Embeds have no bytes. */
    source: 'upload' | 'youtube' | 'twitch'

    // ── Location of the media ────────────────────────────────────────────────
    /** Uploads and migrated legacy files only.
     *  New:    'media:{_id}.{ext}'      -> storage/gallery/media/{_id}.{ext}
     *  Legacy: 'legacy:{year}/{op}/{mission}/{file}' */
    storageKey?: string
    /** Uploads and embeds. 'media:{_id}_poster.jpg'. Stills have none. */
    posterKey?: string
    /** Embeds only. The provider's own id — a video id, or a clip slug. */
    embedId?: string
    /** Embeds only. A Twitch VOD and a Twitch clip embed through different
     *  players, so the id alone is not enough to render one. Always 'video'
     *  for YouTube. */
    embedKind?: 'video' | 'clip'
    /** Embeds only. Canonical provider URL, for the "watch on" link. */
    embedUrl?: string

    // ── Provenance ───────────────────────────────────────────────────────────
    /** Facets carried over from the folder tree. Always present on migrated
     *  items; derived from the chosen operation on new ones, and all absent
     *  together when the submitter chose "Unknown". `mission` only ever comes
     *  from the folder tree — new submissions have no mission. */
    year?: string
    operation?: string
    opLabel?: string
    mission?: string
    /** Set when the submitter picked a real operation, absent for "Unknown". */
    operationId?: ObjectId
    /** The operation's date. What the gallery sorts and groups on.
     *  Null means the operation was Unknown and no reviewer has set one. */
    takenAt: Date | null

    authorId?: string       // Discord user id; absent on migrated legacy files
    authorName?: string

    caption?: string
    tags: string[]          // gallery_tags slugs

    // ── Intrinsics ───────────────────────────────────────────────────────────
    width?: number
    height?: number
    durationSec?: number    // uploaded video only
    bytes?: number          // stored size after transcode

    // ── Lifecycle ────────────────────────────────────────────────────────────
    status: 'processing' | 'pending' | 'live' | 'rejected' | 'hidden'
    /** Set while status is 'processing' or after a failure, for the monitor. */
    processingError?: string
    /** Groups one member's items from one visit to the submit page. */
    batchId?: string

    up: number
    down: number

    createdAt: Date
    publishedAt?: Date
    publishedBy?: string
    rejectedAt?: Date
    rejectedBy?: string
    rejectedReason?: string
}
```

Statuses:

- `processing` — bytes landed, ffmpeg/sharp not finished. Never public.
- `pending` — waiting on J5. Visible only in the review queue and to its author.
- `live` — on the gallery. Migrated legacy files land here.
- `rejected` — file deleted from disk, record kept for audit.
- `hidden` — pulled from the gallery after publication without deleting it.

Indexes: `{ status: 1, takenAt: -1 }` (the gallery's main read),
`{ status: 1, createdAt: 1 }` (the review queue), `{ storageKey: 1 }` unique
sparse (what makes the migration idempotent), `{ authorId: 1 }`, `{ tags: 1 }`.

### `gallery_votes`

```ts
interface GalleryVote {
    _id: ObjectId
    mediaId: ObjectId
    userId: string
    value: 1 | -1
    at: Date
}
```

Unique compound index on `{ mediaId: 1, userId: 1 }` — the database, not the
route, is what guarantees one vote per member. `up`/`down` on `gallery_media`
are denormalised counters updated in the same request, so rendering a grid of
48 tiles never aggregates.

### `gallery_tags`

```ts
interface GalleryTag {
    _id: ObjectId
    slug: string     // unique
    label: string
    order: number
    retired: boolean // hidden from the picker; media already carrying it keep it
}
```

Seeded by the migration with: funny, cinematic, cool, rare moment, teamwork,
close call, explosion, aftermath, night op, air, armour, breach, fail, scenery,
portrait.

Retiring rather than deleting is what keeps a rename from having to cascade
across every document that carries the slug.

## 5. Storage and the media pipeline

### Layout

New media is **flat**:

```
storage/gallery/media/{mediaId}.{ext}
storage/gallery/media/{mediaId}_poster.jpg
storage/gallery/staging/{uploadId}          # originals, deleted after processing
```

Flat because Mongo is the index now. It removes filename collisions between
operations, and it shrinks the path-traversal surface to one regex on a 24-char
hex id — compare `app/api/gallery/fetch/route.ts`, which has to validate four
user-supplied path segments against `SAFE_SEGMENT` and then re-check the
resolved path.

Legacy files are **not moved**. They stay in `storage/gallery/content/...` and
keep being served by the existing `/api/gallery/fetch` route. The `legacy:`
prefix on `storageKey` is what tells the serving layer which of the two to use.

### Processing

**Images** — `sharp`, resized to fit within 3840x2160, re-encoded as JPEG using
the quality ladder already in `lib/uploads/image.ts`.

Note that the gallery is currently an explicit *exemption* from that helper
(`GALLERY_IS_EXEMPT` in `lib/uploads/image-limits.ts`) on the grounds that it is
"the one place whose entire purpose is the picture itself". A 4K ceiling honours
that intent — nothing a member can display is lost — while still taking a 15MB
phone photo down to roughly 2MB. The exemption comment is updated to record that
submissions are processed and that the J5 direct-upload tab is still exempt.

**Video** — `ffprobe` first, so a clip over 5 minutes or with no video stream is
rejected before any CPU is spent on it. Then libx264 at CRF 23, preset
veryfast, scaled to at most 1920 wide with an even height, AAC audio at 128k,
and `-movflags +faststart`. Without faststart the moov atom sits at the end of
the file and the browser has to download the whole thing before it can play a
frame. The poster frame is grabbed at one second in.

`apk add --no-cache ffmpeg` goes into the root `dockerfile` beside the existing
`restic` line. It brings `ffprobe` with it.

**Embeds** — no transcode. At approval the server fetches the provider thumbnail
once and writes it to `{id}_poster.jpg`, so the grid is uniform and the page
does not hotlink a third party.

- **YouTube**: `https://i.ytimg.com/vi/{id}/maxresdefault.jpg`, falling back to
  `hqdefault.jpg` (maxres does not exist for every video).
- **Twitch**: its public oEmbed is gone, and real clip thumbnails require Helix
  credentials. If `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are present in
  `.env` the server uses Helix; if they are absent it generates a placeholder
  poster (provider mark, caption, operation) with `@napi-rs/canvas`, which is
  already a dependency. Everything else about a Twitch item works either way.
  Both variables are documented as optional in `.env.template`.

### The queue

`lib/gallery/queue.ts` — an in-memory array with concurrency 1, drained on a
promise chain. Not a job server, deliberately: this is one container, and the
work is minutes-scale and idempotent.

Two properties matter:

- **Restart recovery.** A startup sweep re-queues anything still `processing`
  whose staging file still exists, and marks the rest `pending` with a
  `processingError`. Without it a container restart mid-transcode strands
  documents forever.
- **Failure is visible.** A failed transcode sets `processingError` and moves
  the item to `pending` anyway, so a reviewer sees it and can reject it, rather
  than it vanishing.

### Serving

`GET /api/gallery/media/[id]` serves uploaded media and posters. It **must**
implement HTTP Range (`206 Partial Content`, `Accept-Ranges: bytes`) — without
it video scrubbing does not work and Safari refuses to play at all. It reads
the document to resolve `storageKey`, so it also enforces status: only `live`
media is public; `pending` is visible to its author and to `gallery.review`
holders.

## 6. The migration

`scripts/index-gallery.mjs`, run from the `npm start` menu under Migrations.

For every file under `storage/gallery/content/{year}/{operation}/{mission}/`:

- `storageKey: 'legacy:{year}/{operation}/{mission}/{file}'`
- `year`, `operation`, `mission`, and `opLabel` from the existing
  `splitOperation()` logic in `gallery-data.ts` (the ordering-prefix parser),
  which moves to `lib/gallery/naming.ts` so the script and the app share one
  copy rather than the script reimplementing it.
- `takenAt` resolved by matching the stripped operation label against the
  `operations` collection, falling back to 1 January of the folder's year.
- `width`/`height` probed with sharp, `bytes` from `statSync`.
- `kind: 'image'`, `source: 'upload'`, `status: 'live'`, `tags: []`,
  `up: 0`, `down: 0`. No `authorId` — nothing on disk records who shot what.

Idempotent via the unique `storageKey` index and an upsert, so it can be re-run
after J5 adds files through the existing upload tab. It also seeds
`gallery_tags` if that collection is empty.

`GET /api/gallery` is then rewritten to read `gallery_media` where
`status: 'live'` and return a **flat list** rather than the year/operation/stage
tree. `flatten()` in `gallery-data.ts` is deleted; `matches`, `sortPhotos` and
`groupByOperation` stay and gain tag, author and score handling.

## 7. The submit page

`app/(landing)/gallery/submit/` — under the public site chrome, not the
dashboard's. A server component checks `hasPermission(me, 'gallery.submit')` and
redirects to `/gallery` otherwise. The **Submit** button on the gallery renders
only when the same check passes, fetched through the existing
`/api/me/permission?key=` route.

### Composing

A drop zone (drag, or browse) above a "paste a YouTube or Twitch link" field.
Both append to one list.

Above the list sit two fields that apply to everything in the batch: the
**operation** — a searchable select over the operations board, most recent
completed operation preselected, with **Unknown** as a genuine option — and a
**tag picker**. Most submissions are one night's clips, so setting these once
and overriding per item beats filling in twelve identical forms.

Each item card carries a thumbnail, a **caption** field, tag chips, and an
operation override. Thumbnails come from `URL.createObjectURL` for stills, a
`<video>` plus canvas first-frame grab for uploaded video, and the provider for
embeds.

The operation sets `takenAt` — the gallery's date for a piece of media is the
date of the operation it came from. "Unknown" leaves `takenAt` null and the item
sorts into an "Undated" group until a reviewer sets one.

### Embed URL parsing

`lib/gallery/embeds.ts` resolves a pasted URL to `{ provider, id, canonicalUrl }`
or fails. Accepted forms:

- `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/shorts/ID`,
  `youtube.com/live/ID`, with or without extra query parameters
- `twitch.tv/videos/ID`, `twitch.tv/<channel>/clip/SLUG`, `clips.twitch.tv/SLUG`

Anything else is refused with a message naming the two supported providers.
Storing a raw URL is not an option — the poster fetch, the embed iframe and the
"watch on" link all need the resolved id.

Twitch iframes only load when their `parent=` query parameter matches the
hosting hostname, so it is derived from `window.location.hostname` at render
time. That makes it correct on `localhost` in development and on the live domain
in production with no configuration.

### Pre-flight

Enforced client-side before a byte moves, and again server-side on arrival, from
one shared module (`lib/gallery/limits.ts`) so the message a member reads and
the rule the server applies cannot drift — the same reasoning that split
`image-limits.ts` out of `image.ts`:

- at most 20 items per submission, embeds included
- images at most 20MB each (`MAX_UPLOAD_BYTES`, reused)
- video at most 500MB each
- video at most 5 minutes, read from `<video>` metadata

Duration is checked before upload deliberately: a 12-minute clip is refused
instantly instead of after a 400MB upload.

### Submitting

The composer is replaced by a monitor: one row per item with its own bar, and an
overall bar above them.

Uploads run **two at a time** via `XMLHttpRequest`. This is not a preference —
`fetch` cannot report upload progress, and a progress bar is the requirement.

Each row moves **Uploading n%** to **Processing** to **Queued for review**. The
processing state is polled from `GET /api/gallery/submissions/status?batch=`.
A failed row offers Retry, which re-sends only that file. Embeds skip straight
to Queued; there is nothing to upload.

## 8. The J5 review tab

A new tab in `app/dashboard/j5/J5Panel.tsx` — `GallerySubmissionsTab.tsx`, gated
on `gallery.review`, with a badge counting what is pending. Beside it, a small
**Tags** tab gated on `gallery.tags`.

The queue groups by submitter and `batchId`: twelve clips from one member on one
night are one thing to work through, not twelve.

Each item shows the media playable at full size, with **caption**, **tags** and
**operation** as live editable fields — fixing a mistake is typing into it, not
sending it back. Changing the operation re-derives `takenAt`, `year`,
`operation` and `opLabel` together, so they cannot disagree.

- **Accept** — `status: 'live'`, `publishedAt` / `publishedBy` stamped, embed
  poster fetched if it has not been already, submitter notified. An
  **Accept all** action covers a whole batch.
- **Reject** — a reason is required. The media file and poster are deleted from
  disk; the document is kept at `rejected` for audit. The submitter is notified
  with the reason.

Both actions write to the J5 activity log and use `createNotification` from
`lib/notifications/index.ts`, which already swallows its own errors so a
notification failure cannot break the review.

## 9. The gallery

**Tiles.** Video tiles show a poster, a duration badge and a play glyph; embeds
show the provider mark. A compact score chip sits on the tile.

**The NEW badge.** Media published within the last seven days carries a NEW
badge on its tile. It keys on `publishedAt` rather than `takenAt`, because the
question a visitor is asking is "what has appeared since I last looked", not
"what was shot recently" — a photograph from a two-year-old operation that J5
approved this morning is new to the gallery, and an item whose operation ran
last week but which has been up for a month is not. Migrated legacy items have
no `publishedAt` and never carry the badge, which is correct: the entire archive
would otherwise light up on migration day.

The cutoff is computed client-side from the item's `publishedAt`, so it decays
correctly on a page left open and needs no scheduled job to clear it.

**Lightbox.** `<video controls poster>` for uploaded video, a provider iframe
for embeds, `<img>` as now. The metadata panel gains **Author**, **Caption** and
tag chips (each clickable, applying that tag as a filter), and the vote control.
The Download action hides itself for embeds, which have nothing to download.

**Voting.** Thumbs up / thumbs down, one per member per item and changeable by
clicking again. Below them a split bar showing the up-to-down proportion, with
the total count beside it. The UI updates optimistically and reconciles against
the response. Guests see the bar and get a login prompt on click.

**Toolbar.** A **Top rated** sort joins the existing three, and a media-type
filter (All / Photos / Video). Top rated ranks on a Wilson lower bound, not a
raw ratio — with a raw ratio a single up-vote outranks 40-up-2-down forever.
The comment in `Toolbar.tsx` explaining why there is no "most liked" sort is
replaced with what is now true.

**Facets.** Tags and Author join Year / Operation / Mission in `FacetRail`,
counted with the same `skip` treatment `matches()` already implements so a
facet's own selections do not zero out its own counts.

**The carousel bug.** `FeaturedRail.tsx` calls `el.setPointerCapture()` on every
`pointerdown`. Pointer capture retargets the subsequent `click` to the capturing
element, so the click lands on the rail `<div>` instead of the tile `<button>`
and `onOpen` is never called — which is why a still, deliberate click on a
featured photograph does nothing and only the drag behaviour appears to work.
The `DRAG_SLOP` guard was written for a different failure (a click firing after
a 300px drag) and does not address this one.

Fix: move `setPointerCapture` out of `onPointerDown` and into `onPointerMove`,
taken once and only once movement first exceeds `DRAG_SLOP`. A click never
captures, so it reaches the button; a drag captures as soon as it becomes a
drag, so panning outside the rail still works.

## 10. Testing

Vitest, following the existing `lib/**/*.test.ts` convention.

| Unit | What is asserted |
|---|---|
| `lib/gallery/embeds.ts` | Every accepted YouTube and Twitch URL form resolves to the right provider and id; malformed and unsupported hosts are refused; query-parameter noise is ignored |
| `lib/gallery/ranking.ts` | Wilson lower bound orders 40-2 above 1-0; an unvoted item does not outrank a well-voted one |
| `lib/gallery/votes.ts` | First vote, changed vote and retracted vote each produce the right `up`/`down` deltas; a duplicate is rejected |
| `lib/gallery/status.ts` | Legal status transitions only — `live` cannot go back to `processing`, `rejected` is terminal |
| `lib/gallery/limits.ts` | Count, per-file size and duration ceilings, at and either side of each boundary |
| `lib/gallery/naming.ts` | The ordering-prefix parser, moved from `gallery-data.ts`, keeps its existing behaviour |
| `scripts/index-gallery.mjs` | Running twice over the same fixture tree produces one document per file, against `mongodb-memory-server` |

No Playwright. `tests/*.spec.ts` is run by hand by the repository owner.

## 11. Files

**New**

```
apps/web/types/gallery-media.d.ts
apps/web/lib/gallery/{naming,embeds,limits,ranking,votes,status,queue,process,poster}.ts
apps/web/app/(landing)/gallery/submit/{page.tsx,SubmitClient.tsx,_components/*}
apps/web/app/(landing)/gallery/_components/{VoteBar,MediaTile,TagPicker}.tsx
apps/web/app/api/gallery/media/[id]/route.ts
apps/web/app/api/gallery/submissions/route.ts
apps/web/app/api/gallery/submissions/status/route.ts
apps/web/app/api/gallery/submissions/[id]/route.ts
apps/web/app/api/gallery/vote/route.ts
apps/web/app/api/gallery/tags/route.ts
apps/web/app/dashboard/j5/tabs/GallerySubmissionsTab.tsx
apps/web/app/dashboard/j5/tabs/GalleryTagsTab.tsx
scripts/index-gallery.mjs
```

**Modified**

```
apps/web/lib/mongo.ts                             three collections
apps/web/lib/permissions.ts                       three keys
apps/web/lib/permissions-descriptions.ts          three descriptions
apps/web/lib/uploads/image-limits.ts              exemption comment
apps/web/app/api/gallery/route.ts                 reads Mongo, returns a flat list
apps/web/app/(landing)/gallery/gallery-data.ts    flatten() out, tags/author/score in
apps/web/app/(landing)/gallery/page.tsx           video, votes, submit button
apps/web/app/(landing)/gallery/_components/{FeaturedRail,Lightbox,PhotoGrid,Toolbar,FacetRail}.tsx
apps/web/app/dashboard/j5/J5Panel.tsx             two tabs
dockerfile                                        apk add ffmpeg
scripts/start.mjs                                 the migration menu item
.env.template                                     optional TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET
```

No `next.config.ts` change is needed: posters are cached locally, so nothing
new is loaded from a remote host.

`page.tsx` is already 252 lines and gains video, voting and a submit button.
The lightbox item construction and the fetch/state block move into a
`useGalleryData` hook so the page stays a layout rather than becoming the
feature.

## 12. Order of work

1. Shared pure modules and their tests — `naming`, `embeds`, `limits`,
   `ranking`, `votes`, `status`. No I/O, so they are testable first.
2. Types, collections, permission keys, descriptions.
3. The migration script, and `/api/gallery` reading Mongo. **The gallery keeps
   working unchanged at this point** — same data, different source.
4. ffmpeg in the dockerfile; `process` and `queue`; the media serving route with
   Range support.
5. Submission API routes and the submit page.
6. The J5 review tab and the tags tab.
7. Gallery surface: video, tags, author, captions, voting, the new sort and
   filter.
8. The `FeaturedRail` fix — independent of everything above and safe to land at
   any point.

Steps 1-3 are a complete, shippable change on their own: the gallery is
database-backed and behaves identically. Everything after builds on that.

## 13. Risks

**The migration is the sharp edge.** It writes one document per file across the
whole archive and then `/api/gallery` stops reading the disk. Mitigations: it is
idempotent via a unique `storageKey`, it only reads the tree and never modifies
it, and it is a separate menu item run deliberately rather than anything that
happens at startup. If it produces a wrong result the fix is to drop
`gallery_media` and re-run.

**ffmpeg grows the image** by roughly 80MB and puts transcode CPU on the web
container. With concurrency 1 the worst case is one core busy for a few minutes,
which is acceptable for a unit of this size. If it ever is not, the queue module
is the single place that would move to a separate container.

**Twitch thumbnails degrade** to a generated placeholder without Helix
credentials. Documented, and does not block anything.

**Members will submit clips longer than five minutes** and be refused. The limit
is stated on the page before they pick a file, not after the upload.
