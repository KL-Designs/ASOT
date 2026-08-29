# Gallery Submissions, Video, Tags and Voting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the gallery a database index so members can submit photos, video files and YouTube/Twitch links for J5 review, and so published media can carry an author, a caption, tags and member votes.

**Architecture:** A single `gallery_media` collection replaces `readdirSync` as the gallery's source of truth; a one-off migration indexes every existing file into it without moving any bytes. Uploads land in a staging directory, are compressed by sharp (stills) or ffmpeg (video) on a single-concurrency in-process queue, and wait at `status: 'pending'` until a J5 reviewer accepts them. Embeds are a *source* of a video, not a separate kind, so filtering, sorting and voting treat a Twitch clip exactly like an uploaded one.

**Tech Stack:** Next.js 15 App Router, React 19, MongoDB (driver v7), sharp 0.33, ffmpeg (added to the Alpine image), `@napi-rs/canvas`, vitest 4, CSS modules.

**Spec:** `apps/web/docs/superpowers/specs/2026-08-30-gallery-submissions-design.md` — read it before Task 1. The plan argues from the spec; where they disagree the spec is wrong and should be corrected, not silently diverged from.

## Global Constraints

- **Repo root is `d:\Projects\ASOT`.** `apps/web` is NOT an npm workspace — run its commands with `--prefix apps/web` or from inside it.
- **Never commit to `main`, never push.** All work lands on the existing branch `feat/gallery-submissions`. Verify with `git branch --show-current` before every commit. A push to `main` deploys immediately.
- **Unit tests:** `npm run test:unit` from `apps/web` (vitest). Include pattern is `lib/**/*.test.ts` and `app/**/*.test.ts` — a test outside those paths will never run. `fileParallelism: false` is deliberate; do not change it.
- **Never run `npm run test:e2e` or `npx playwright test`.** The Playwright suite belongs to the repository owner.
- **Typecheck:** `npx tsc --noEmit` from `apps/web`. **Lint:** `npm run lint` from `apps/web`.
- **Do not run a production build after every task.** Build once, at the end (Task 19).
- **Path aliases:** `@/` is `apps/web/`, `@asot/lib` is the monorepo-root `lib/`. Both are mirrored in `vitest.config.ts`; anything new must resolve under both.
- **Storage paths are relative to `apps/web`'s working directory** — existing gallery code uses `path.resolve('../../storage/gallery/...')`. Match that exactly; do not invent an env var.
- **Permission keys, verbatim:** `gallery.submit`, `gallery.review`, `gallery.tags`. The pre-existing `gallery.manage` is not touched.
- **The field is `caption`.** Never `description`, in code, in copy, or in a comment.
- **Upload ceilings, verbatim:** 20 items per submission; images ≤ 20 MB; video ≤ 500 MB; video ≤ 300 seconds.
- **Seed tags, verbatim and in this order:** funny, cinematic, cool, rare moment, teamwork, close call, explosion, aftermath, night op, air, armour, breach, fail, scenery, portrait.
- **Comment style:** this codebase explains *why*, not *what*, in prose paragraphs above the code. Match the surrounding files. Do not add a comment that restates the line below it.

---

## File Structure

**New — pure modules (no I/O, unit-tested):**

| File | Responsibility |
|---|---|
| `apps/web/lib/gallery/naming.ts` | The operation-folder ordering-prefix parser, moved out of `gallery-data.ts` so the migration script and the app share one copy |
| `apps/web/lib/gallery/embeds.ts` | Parsing a pasted YouTube/Twitch URL into a provider, kind and id; building an iframe src |
| `apps/web/lib/gallery/limits.ts` | Every upload ceiling, and the checks over them, shared by client and server |
| `apps/web/lib/gallery/ranking.ts` | Wilson lower bound, for the Top rated sort |
| `apps/web/lib/gallery/status.ts` | The `GalleryStatus` union and its legal transitions |
| `apps/web/lib/gallery/votes.ts` | Vote delta arithmetic |

**New — server modules (I/O):**

| File | Responsibility |
|---|---|
| `apps/web/lib/gallery/paths.ts` | Resolving a `storageKey` to an absolute path, and nothing else |
| `apps/web/lib/gallery/process.ts` | sharp and ffmpeg invocation for one staged file |
| `apps/web/lib/gallery/queue.ts` | Single-concurrency job queue and the restart sweep |
| `apps/web/lib/gallery/poster.ts` | Fetching or generating an embed's poster image |

**New — routes, pages, components, script:** listed in each task.

**Modified:** `lib/mongo.ts`, `lib/permissions.ts`, `lib/permissions-descriptions.ts`, `lib/uploads/image-limits.ts`, `app/api/gallery/route.ts`, the five gallery `_components`, `app/(landing)/gallery/{page,gallery-data}.tsx|ts`, `app/dashboard/j5/J5Panel.tsx`, `styles/gallery.module.css`, root `dockerfile`, root `scripts/start.mjs`, root `.env.template`.

---

## Task 1: Fix the featured carousel's dead click

Independent of everything else in this plan, and it fixes a bug that is live right now. Landing it first means the branch has value even if it stalls.

**Files:**
- Modify: `apps/web/app/(landing)/gallery/_components/FeaturedRail.tsx:110-140`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. No other task depends on this.

**Background the implementer needs.** `FeaturedRail` renders each featured photograph as a `<button>` inside a scrolling `<div>` that also handles drag-to-pan. `onPointerDown` currently calls `el.setPointerCapture(e.pointerId)` unconditionally. Pointer capture retargets the subsequent `pointerup` to the capturing element, and a `click` is dispatched at the nearest common ancestor of the `pointerdown` and `pointerup` targets — which becomes the rail `<div>`, not the tile `<button>`. So the tile's `onClick` never fires and the lightbox never opens, even for a perfectly still click. The existing `DRAG_SLOP` guard was written for the opposite failure (a click firing *after* a long drag) and does not help.

The fix is to take capture lazily: not on pointerdown, but on the first pointermove that exceeds `DRAG_SLOP`. A click never captures and reaches its button; a drag captures the moment it becomes a drag, so panning past the rail's edge still works.

- [ ] **Step 1: Read the file and confirm the current shape**

Run: `sed -n '100,150p' "apps/web/app/(landing)/gallery/_components/FeaturedRail.tsx"`

Expected: `onPointerDown` contains `el.setPointerCapture(e.pointerId)` and `setDragging(true)`.

- [ ] **Step 2: Make capture lazy**

Replace the `onPointerDown` and `onPointerMove` functions with these. Note `captured` on the drag record — it is what stops `setPointerCapture` being called on every subsequent move.

```tsx
    const drag = useRef<{ id: number; startX: number; startLeft: number; moved: number; captured: boolean } | null>(null)
    const dragged = useRef(false)
    const [dragging, setDragging] = useState(false)
    const DRAG_SLOP = 4

    function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        paused.current = true
        dragged.current = false
        if (e.pointerType !== 'mouse' || e.button !== 0) return
        const el = rail.current
        if (!el) return
        drag.current = { id: e.pointerId, startX: e.clientX, startLeft: el.scrollLeft, moved: 0, captured: false }
    }

    function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        const d = drag.current
        const el = rail.current
        if (!d || !el || e.pointerId !== d.id) return
        const dx = e.clientX - d.startX
        d.moved = Math.max(d.moved, Math.abs(dx))

        /*
           Capture is taken here rather than on pointerdown, and only once the
           gesture has proved itself a drag.

           A captured pointer retargets its pointerup to the capturing element,
           and the browser dispatches the click at the common ancestor of the
           down and up targets — so capturing on pointerdown moved every click
           from the tile <button> up to this <div>, and no click ever reached
           onOpen. That is why clicking a featured photograph did nothing while
           dragging worked fine.
        */
        if (!d.captured && d.moved > DRAG_SLOP) {
            el.setPointerCapture(e.pointerId)
            d.captured = true
            setDragging(true)
        }

        el.scrollLeft = d.startLeft - dx
    }
```

- [ ] **Step 3: Release capture only if it was taken**

In `onPointerEnd`, the `hasPointerCapture` guard already covers this, but make the intent explicit by replacing that one line:

```tsx
        if (d.captured && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify by hand**

Start the dev server (`npm start` → Website, or `npm --prefix apps/web run dev`), open `/gallery`, and:
- click a featured tile once without moving the mouse → the lightbox opens
- press, drag 200px, release → the strip pans and the lightbox does **not** open
- drag past the right edge of the rail and keep moving → the strip keeps following the pointer

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add "apps/web/app/(landing)/gallery/_components/FeaturedRail.tsx"
git commit -m "fix(gallery): let a click on a featured tile open the lightbox

Pointer capture was taken on every pointerdown, which retargets the
following click from the tile button up to the rail, so onOpen was
never called. Take capture on the first move past the slop threshold
instead: a click never captures, a drag still does."
```

---

## Task 2: `lib/gallery/naming.ts` — the ordering-prefix parser

**Files:**
- Create: `apps/web/lib/gallery/naming.ts`
- Create: `apps/web/lib/gallery/naming.test.ts`
- Modify: `apps/web/app/(landing)/gallery/gallery-data.ts` (re-export from the new home)

**Interfaces:**
- Consumes: nothing.
- Produces: `splitOperation(folder: string): { label: string, order: number }` — used by Task 9 (the migration), Task 10 (`/api/gallery`) and the gallery page.

**Why this moves.** Operation folders are stored as `"1. Op Black Hill"`, `"9. Op Copper Ridge (Lanze Verde)"`. The numeric prefix is storage ordering leaking into the interface: useful for sorting, wrong to print. `gallery-data.ts` already parses it, but that file is a client module and the migration script is a plain `.mjs` at the repo root — it cannot import it. One copy, in `lib/`, is what stops the two drifting.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/gallery/naming.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { splitOperation } from './naming'

describe('splitOperation', () => {
    test('strips a numeric prefix and keeps it for sorting', () => {
        expect(splitOperation('1. Op Black Hill')).toEqual({ label: 'Op Black Hill', order: 1 })
    })

    test('accepts the separators that actually appear in storage', () => {
        for (const folder of ['9) Op Copper Ridge', '9 - Op Copper Ridge', '9 Op Copper Ridge', '9. Op Copper Ridge']) {
            expect(splitOperation(folder), folder).toEqual({ label: 'Op Copper Ridge', order: 9 })
        }
    })

    test('keeps parenthesised codenames intact', () => {
        expect(splitOperation('9. Op Copper Ridge (Lanze Verde)'))
            .toEqual({ label: 'Op Copper Ridge (Lanze Verde)', order: 9 })
    })

    test('an unnumbered folder sorts last rather than first', () => {
        // MAX_SAFE_INTEGER, not 0 — an unnumbered folder is "unknown position",
        // and putting it at the top would misrepresent it as the first operation.
        const { label, order } = splitOperation('Op Unnumbered')
        expect(label).toBe('Op Unnumbered')
        expect(order).toBe(Number.MAX_SAFE_INTEGER)
    })

    test('a folder that is only a number keeps its own name as the label', () => {
        expect(splitOperation('12')).toEqual({ label: '12', order: 12 })
    })

    test('trims surrounding whitespace', () => {
        expect(splitOperation('  3.  Op Ash  ')).toEqual({ label: 'Op Ash', order: 3 })
    })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && npx vitest run lib/gallery/naming.test.ts`
Expected: FAIL — `Failed to resolve import "./naming"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/gallery/naming.ts`. This is the existing body from `gallery-data.ts`, moved verbatim so behaviour cannot change in the move:

```ts
/**
 * Reading an operation's name out of its storage folder.
 *
 * Operations are stored as "1. Op Black Hill", "9. Op Copper Ridge (Lanze
 * Verde)" — the leading number is the storage layer's ordering leaking into the
 * interface, and it makes a set of choices read as a numbered list. It is
 * genuinely useful for *sorting*, so it is parsed out and kept rather than
 * thrown away, but nothing prints it.
 *
 * This lives in lib/ rather than beside the gallery page because
 * scripts/index-gallery.mjs has to agree with the page about what an operation
 * is called, and a script at the repo root cannot import a client module.
 */
const ORDER_PREFIX = /^\s*(\d+)\s*[.)\-–]?\s*/

export function splitOperation(folder: string): { label: string, order: number } {
    const match = folder.match(ORDER_PREFIX)
    if (!match) return { label: folder.trim(), order: Number.MAX_SAFE_INTEGER }
    return {
        label: folder.slice(match[0].length).trim() || folder.trim(),
        order: parseInt(match[1], 10),
    }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd apps/web && npx vitest run lib/gallery/naming.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Point the old home at the new one**

In `apps/web/app/(landing)/gallery/gallery-data.ts`, delete the `ORDER_PREFIX` constant, its comment block and the `splitOperation` function, and add near the top imports:

```ts
import { splitOperation } from '@/lib/gallery/naming'
```

and beside the other exports at the bottom of the file:

```ts
export { splitOperation }
```

Every existing importer (`page.tsx`, and `flatten` inside this file) keeps working unchanged.

- [ ] **Step 6: Typecheck and commit**

```bash
cd apps/web && npx tsc --noEmit
cd /d/Projects/ASOT
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/lib/gallery/naming.ts apps/web/lib/gallery/naming.test.ts "apps/web/app/(landing)/gallery/gallery-data.ts"
git commit -m "refactor(gallery): move splitOperation into lib/gallery/naming

The migration script has to agree with the page about what an operation
is called, and a root-level .mjs cannot import a client module."
```

---

## Task 3: `lib/gallery/embeds.ts` — YouTube and Twitch URL parsing

**Files:**
- Create: `apps/web/lib/gallery/embeds.ts`
- Create: `apps/web/lib/gallery/embeds.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type EmbedProvider = 'youtube' | 'twitch'
  export type EmbedKind = 'video' | 'clip'
  export type ParsedEmbed = { provider: EmbedProvider, kind: EmbedKind, id: string, canonicalUrl: string }
  export function parseEmbedUrl(input: string): ParsedEmbed | null
  export function embedIframeSrc(e: { provider: EmbedProvider, kind: EmbedKind, id: string }, parentHost: string): string
  ```
  Used by Task 12 (submissions API), Task 13 (poster), Task 16 (submit page), Task 20 (lightbox).

**Two things the implementer must know.**

**`kind` is not decoration.** A Twitch VOD and a Twitch clip embed through different URLs — `player.twitch.tv/?video=<id>` versus `clips.twitch.tv/embed?clip=<slug>` — so the id alone is not enough to render one. YouTube is always `kind: 'video'`.

**This is a spec addendum.** The spec's `GalleryMedia` shape does not list `embedKind`. It must: add `embedKind?: EmbedKind` in Task 7 and record the reason in the spec's §4. Do not skip that — a stored Twitch clip with no kind cannot be embedded.

**Twitch's `parent` parameter.** A Twitch iframe refuses to load unless `parent=` matches the hostname serving the page. It is passed in rather than read from `window` so this module stays pure and testable.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/gallery/embeds.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { parseEmbedUrl, embedIframeSrc } from './embeds'

describe('parseEmbedUrl — YouTube', () => {
    test.each([
        ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ])('%s -> %s', (url, id) => {
        expect(parseEmbedUrl(url)).toEqual({
            provider: 'youtube', kind: 'video', id,
            canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
        })
    })

    test('ignores the noise a share link carries', () => {
        // A timestamp, a playlist and a tracking parameter must not end up in the id.
        const parsed = parseEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=42&si=abc123')
        expect(parsed?.id).toBe('dQw4w9WgXcQ')
    })

    test('a missing v parameter is not a video', () => {
        expect(parseEmbedUrl('https://www.youtube.com/watch?list=PL123')).toBeNull()
    })
})

describe('parseEmbedUrl — Twitch', () => {
    test('a VOD is kind video', () => {
        expect(parseEmbedUrl('https://www.twitch.tv/videos/1234567890')).toEqual({
            provider: 'twitch', kind: 'video', id: '1234567890',
            canonicalUrl: 'https://www.twitch.tv/videos/1234567890',
        })
    })

    test.each([
        'https://www.twitch.tv/asotmilsim/clip/PluckyCrunchyOtterKappa',
        'https://clips.twitch.tv/PluckyCrunchyOtterKappa',
    ])('a clip is kind clip — %s', url => {
        expect(parseEmbedUrl(url)).toEqual({
            provider: 'twitch', kind: 'clip', id: 'PluckyCrunchyOtterKappa',
            canonicalUrl: 'https://clips.twitch.tv/PluckyCrunchyOtterKappa',
        })
    })

    test('a bare channel is not a clip', () => {
        expect(parseEmbedUrl('https://www.twitch.tv/asotmilsim')).toBeNull()
    })
})

describe('parseEmbedUrl — refusals', () => {
    test.each([
        '',
        '   ',
        'not a url at all',
        'https://vimeo.com/123456',
        'https://streamable.com/abcdef',
        'ftp://youtube.com/watch?v=dQw4w9WgXcQ',
        'javascript:alert(1)',
    ])('refuses %s', input => {
        expect(parseEmbedUrl(input)).toBeNull()
    })

    test('tolerates a pasted url with surrounding whitespace', () => {
        expect(parseEmbedUrl('  https://youtu.be/dQw4w9WgXcQ  ')?.id).toBe('dQw4w9WgXcQ')
    })
})

describe('embedIframeSrc', () => {
    test('YouTube', () => {
        expect(embedIframeSrc({ provider: 'youtube', kind: 'video', id: 'abc' }, 'asotmilsim.com'))
            .toBe('https://www.youtube.com/embed/abc')
    })

    test('a Twitch VOD carries the parent host', () => {
        expect(embedIframeSrc({ provider: 'twitch', kind: 'video', id: '123' }, 'asotmilsim.com'))
            .toBe('https://player.twitch.tv/?video=123&parent=asotmilsim.com&autoplay=false')
    })

    test('a Twitch clip uses the clip player', () => {
        expect(embedIframeSrc({ provider: 'twitch', kind: 'clip', id: 'Plucky' }, 'localhost'))
            .toBe('https://clips.twitch.tv/embed?clip=Plucky&parent=localhost&autoplay=false')
    })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && npx vitest run lib/gallery/embeds.test.ts`
Expected: FAIL — `Failed to resolve import "./embeds"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/gallery/embeds.ts`:

```ts
/**
 * Turning a pasted link into something that can actually be embedded.
 *
 * A submission stores the provider, the kind and the id — never the raw URL a
 * member pasted. Three things need the resolved id and none of them can work
 * from a share link: the poster fetch, the iframe src, and the "watch on"
 * link back to the provider.
 *
 * Parsing is done with the URL constructor rather than a regex over the whole
 * string, so a link carrying a timestamp, a playlist or a tracking parameter
 * resolves to the same id as the clean one — which is what members will
 * actually paste, because it is what the share button gives them.
 */

export type EmbedProvider = 'youtube' | 'twitch'

/** Twitch VODs and Twitch clips embed through different players, so the id
 *  alone is not enough to render one. YouTube is always 'video'. */
export type EmbedKind = 'video' | 'clip'

export type ParsedEmbed = {
    provider: EmbedProvider
    kind: EmbedKind
    id: string
    canonicalUrl: string
}

/** YouTube ids are exactly 11 characters from a fixed alphabet. Checking the
 *  shape rejects a truncated paste here rather than at the poster fetch. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const TWITCH_VOD_ID = /^\d+$/
const TWITCH_CLIP_SLUG = /^[A-Za-z0-9-]{4,100}$/

function youtube(id: string | null | undefined): ParsedEmbed | null {
    if (!id || !YOUTUBE_ID.test(id)) return null
    return { provider: 'youtube', kind: 'video', id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` }
}

function twitchClip(slug: string | undefined): ParsedEmbed | null {
    if (!slug || !TWITCH_CLIP_SLUG.test(slug)) return null
    return { provider: 'twitch', kind: 'clip', id: slug, canonicalUrl: `https://clips.twitch.tv/${slug}` }
}

export function parseEmbedUrl(input: string): ParsedEmbed | null {
    const trimmed = input.trim()
    if (!trimmed) return null

    let url: URL
    try { url = new URL(trimmed) } catch { return null }

    // Anything but http(s) is refused outright — javascript: and data: reach
    // this function from a paste field, and neither is a video.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '')
    // Leading empty segment from the leading slash, dropped.
    const parts = url.pathname.split('/').filter(Boolean)

    if (host === 'youtu.be') return youtube(parts[0])

    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        if (parts[0] === 'watch') return youtube(url.searchParams.get('v'))
        if (parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'embed') return youtube(parts[1])
        return null
    }

    if (host === 'clips.twitch.tv') return twitchClip(parts[0])

    if (host === 'twitch.tv') {
        if (parts[0] === 'videos' && TWITCH_VOD_ID.test(parts[1] ?? '')) {
            return { provider: 'twitch', kind: 'video', id: parts[1], canonicalUrl: `https://www.twitch.tv/videos/${parts[1]}` }
        }
        // twitch.tv/<channel>/clip/<slug>
        if (parts[1] === 'clip') return twitchClip(parts[2])
        return null
    }

    return null
}

/**
 * The src for the iframe that plays this embed.
 *
 * `parentHost` is required because a Twitch player refuses to load unless it
 * matches the hostname of the page framing it. It is passed in rather than read
 * off `window` so this module stays pure — the caller reads
 * `window.location.hostname`, which is correct on localhost in development and
 * on the live domain in production with no configuration either side.
 */
export function embedIframeSrc(
    e: { provider: EmbedProvider, kind: EmbedKind, id: string },
    parentHost: string,
): string {
    if (e.provider === 'youtube') return `https://www.youtube.com/embed/${e.id}`
    if (e.kind === 'clip') return `https://clips.twitch.tv/embed?clip=${e.id}&parent=${parentHost}&autoplay=false`
    return `https://player.twitch.tv/?video=${e.id}&parent=${parentHost}&autoplay=false`
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd apps/web && npx vitest run lib/gallery/embeds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/gallery/embeds.ts apps/web/lib/gallery/embeds.test.ts
git commit -m "feat(gallery): parse YouTube and Twitch links into provider, kind and id

A share link carries a timestamp, a playlist and a tracking parameter,
and none of the three things that need an embed - poster, iframe, watch
link - can work from the raw URL."
```

---

## Task 4: `lib/gallery/limits.ts` — upload ceilings

**Files:**
- Create: `apps/web/lib/gallery/limits.ts`
- Create: `apps/web/lib/gallery/limits.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export const MAX_ITEMS_PER_SUBMISSION = 20
  export const MAX_IMAGE_BYTES: number
  export const MAX_VIDEO_BYTES: number
  export const MAX_VIDEO_SECONDS = 300
  export const ACCEPTED_IMAGE_MIME: ReadonlySet<string>
  export const ACCEPTED_VIDEO_MIME: ReadonlySet<string>
  export const ACCEPT_ATTRIBUTE: string
  export type LimitFailure = { code: 'count' | 'type' | 'size' | 'duration', message: string }
  export function checkItemCount(count: number): LimitFailure | null
  export function checkFile(f: { mime: string, bytes: number, durationSec?: number }): LimitFailure | null
  export function kindForMime(mime: string): 'image' | 'video' | null
  ```
  Used by Task 12 (server validation), Task 16 (client pre-flight).

**Why one module.** The message a member reads before uploading and the rule the server applies on arrival have to be the same rule. This is the reasoning that already split `image-limits.ts` out of `image.ts` — that file says so in its own header, and it exists specifically because `image.ts` imports sharp, which cannot be bundled into a client component. This module must import nothing at all, for the same reason.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/gallery/limits.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import {
    MAX_ITEMS_PER_SUBMISSION, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS,
    checkItemCount, checkFile, kindForMime,
} from './limits'

describe('the ceilings themselves', () => {
    test('match the values the spec fixed', () => {
        expect(MAX_ITEMS_PER_SUBMISSION).toBe(20)
        expect(MAX_IMAGE_BYTES).toBe(20 * 1024 * 1024)
        expect(MAX_VIDEO_BYTES).toBe(500 * 1024 * 1024)
        expect(MAX_VIDEO_SECONDS).toBe(300)
    })
})

describe('checkItemCount', () => {
    test('accepts up to and including the limit', () => {
        expect(checkItemCount(1)).toBeNull()
        expect(checkItemCount(20)).toBeNull()
    })

    test('refuses one past it, and says the number', () => {
        const failure = checkItemCount(21)
        expect(failure?.code).toBe('count')
        expect(failure?.message).toContain('20')
    })
})

describe('kindForMime', () => {
    test('classifies what we accept', () => {
        expect(kindForMime('image/jpeg')).toBe('image')
        expect(kindForMime('image/png')).toBe('image')
        expect(kindForMime('image/webp')).toBe('image')
        expect(kindForMime('video/mp4')).toBe('video')
        expect(kindForMime('video/quicktime')).toBe('video')
        expect(kindForMime('video/webm')).toBe('video')
    })

    test('refuses what we do not', () => {
        expect(kindForMime('application/pdf')).toBeNull()
        expect(kindForMime('image/svg+xml')).toBeNull()   // scriptable, never an upload
        expect(kindForMime('')).toBeNull()
    })

    test('is case-insensitive — browsers are inconsistent about this', () => {
        expect(kindForMime('IMAGE/JPEG')).toBe('image')
    })
})

describe('checkFile', () => {
    test('an image at the ceiling passes, one byte over does not', () => {
        expect(checkFile({ mime: 'image/jpeg', bytes: MAX_IMAGE_BYTES })).toBeNull()
        expect(checkFile({ mime: 'image/jpeg', bytes: MAX_IMAGE_BYTES + 1 })?.code).toBe('size')
    })

    test('a video at the ceiling passes, one byte over does not', () => {
        expect(checkFile({ mime: 'video/mp4', bytes: MAX_VIDEO_BYTES, durationSec: 10 })).toBeNull()
        expect(checkFile({ mime: 'video/mp4', bytes: MAX_VIDEO_BYTES + 1, durationSec: 10 })?.code).toBe('size')
    })

    test('a video at exactly five minutes passes, one second over does not', () => {
        expect(checkFile({ mime: 'video/mp4', bytes: 1000, durationSec: MAX_VIDEO_SECONDS })).toBeNull()
        expect(checkFile({ mime: 'video/mp4', bytes: 1000, durationSec: MAX_VIDEO_SECONDS + 1 })?.code).toBe('duration')
    })

    test('an unreadable duration is not a refusal — ffprobe checks it again server-side', () => {
        expect(checkFile({ mime: 'video/mp4', bytes: 1000 })).toBeNull()
    })

    test('duration is not checked on an image', () => {
        expect(checkFile({ mime: 'image/png', bytes: 1000, durationSec: 9999 })).toBeNull()
    })

    test('an unaccepted type is refused before its size is looked at', () => {
        expect(checkFile({ mime: 'application/zip', bytes: 1 })?.code).toBe('type')
    })

    test('a zero-byte file is refused', () => {
        expect(checkFile({ mime: 'image/jpeg', bytes: 0 })?.code).toBe('size')
    })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && npx vitest run lib/gallery/limits.test.ts`
Expected: FAIL — `Failed to resolve import "./limits"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/gallery/limits.ts`:

```ts
/**
 * What a gallery submission is allowed to carry.
 *
 * Checked twice — in the browser before a byte moves, and on the server when
 * the bytes arrive — from this one module, so the message a member reads and
 * the rule the server applies cannot drift apart. That is the same reasoning
 * that split `lib/uploads/image-limits.ts` out of `image.ts`, and it has the
 * same hard constraint: this file must import nothing, because a client
 * component pulls it in and sharp cannot be bundled.
 *
 * Duration is deliberately checked before upload. A twelve-minute clip refused
 * up front costs a member nothing; refused after 400MB has crossed their
 * connection, it costs them the upload.
 */

export const MAX_ITEMS_PER_SUBMISSION = 20

/** The same ceiling `lib/uploads/image-limits.ts` already applies elsewhere:
 *  generous, because a photo off a phone is routinely 5-15MB and its owner has
 *  done nothing wrong. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024
export const MAX_VIDEO_SECONDS = 300

/** No SVG. It is scriptable, it is never a screenshot of an operation, and it
 *  has no business in an upload path that ends in a public page. */
export const ACCEPTED_IMAGE_MIME: ReadonlySet<string> = new Set([
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
])

/** quicktime is what a Mac screen recording arrives as; x-matroska is what OBS
 *  writes by default. Both transcode to mp4 on the way in. */
export const ACCEPTED_VIDEO_MIME: ReadonlySet<string> = new Set([
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
])

/** For the file input's `accept` attribute — the picker should not offer a
 *  member files we are going to refuse. */
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_IMAGE_MIME, ...ACCEPTED_VIDEO_MIME].join(',')

export type LimitFailure = { code: 'count' | 'type' | 'size' | 'duration', message: string }

const MB = (bytes: number) => `${Math.round(bytes / 1024 / 1024)}MB`

export function kindForMime(mime: string): 'image' | 'video' | null {
    const m = mime.toLowerCase()
    if (ACCEPTED_IMAGE_MIME.has(m)) return 'image'
    if (ACCEPTED_VIDEO_MIME.has(m)) return 'video'
    return null
}

export function checkItemCount(count: number): LimitFailure | null {
    if (count > MAX_ITEMS_PER_SUBMISSION) {
        return { code: 'count', message: `A submission can carry at most ${MAX_ITEMS_PER_SUBMISSION} items. Send the rest as a second submission.` }
    }
    return null
}

export function checkFile(f: { mime: string, bytes: number, durationSec?: number }): LimitFailure | null {
    const kind = kindForMime(f.mime)
    if (!kind) return { code: 'type', message: 'That file type is not accepted. Photos can be JPEG, PNG or WebP; video can be MP4, MOV, WebM or MKV.' }

    if (f.bytes <= 0) return { code: 'size', message: 'That file is empty.' }

    const max = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES
    if (f.bytes > max) return { code: 'size', message: `${kind === 'image' ? 'Photos' : 'Video'} must be under ${MB(max)}. That one is ${MB(f.bytes)}.` }

    // An unreadable duration is not a refusal: some containers do not expose it
    // to the browser at all, and ffprobe checks it again on arrival, before any
    // CPU is spent transcoding.
    if (kind === 'video' && f.durationSec !== undefined && f.durationSec > MAX_VIDEO_SECONDS) {
        return { code: 'duration', message: `Clips must be under ${MAX_VIDEO_SECONDS / 60} minutes. That one is ${Math.round(f.durationSec / 60)} minutes.` }
    }

    return null
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd apps/web && npx vitest run lib/gallery/limits.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/gallery/limits.ts apps/web/lib/gallery/limits.test.ts
git commit -m "feat(gallery): one module for every submission ceiling

Checked in the browser and again on the server from the same source, so
the message a member reads and the rule applied cannot drift."
```

---

## Task 5: `lib/gallery/ranking.ts` and `lib/gallery/votes.ts`

Two small pure modules that only make sense together — the vote arithmetic and the ordering it feeds. One reviewer gate.

**Files:**
- Create: `apps/web/lib/gallery/ranking.ts`, `apps/web/lib/gallery/ranking.test.ts`
- Create: `apps/web/lib/gallery/votes.ts`, `apps/web/lib/gallery/votes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  // ranking.ts
  export function wilsonScore(up: number, down: number): number
  // votes.ts
  export type VoteValue = 1 | -1
  export function voteDelta(previous: VoteValue | null, next: VoteValue | null): { up: number, down: number }
  ```
  Used by Task 10 (`/api/gallery` sort), Task 14 (vote route), Task 20 (Top rated sort).

**Why Wilson and not a ratio.** A raw up/(up+down) ratio puts a single up-vote (1.00) above forty-up-two-down (0.95) forever, which makes a "Top rated" sort useless the moment anything has one vote. The Wilson lower bound asks instead: given these votes, what is the lowest plausible true approval rate? One vote carries almost no confidence, so it scores low.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/gallery/ranking.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { wilsonScore } from './ranking'

describe('wilsonScore', () => {
    test('an unvoted item scores zero', () => {
        expect(wilsonScore(0, 0)).toBe(0)
    })

    test('a well-voted item outranks a barely-voted perfect one', () => {
        // The whole reason this is not a raw ratio: 1/1 is 100% and 40/42 is
        // 95%, and ordering by ratio would put the single vote on top forever.
        expect(wilsonScore(40, 2)).toBeGreaterThan(wilsonScore(1, 0))
    })

    test('more agreeing votes always score higher than fewer', () => {
        expect(wilsonScore(100, 0)).toBeGreaterThan(wilsonScore(10, 0))
        expect(wilsonScore(10, 0)).toBeGreaterThan(wilsonScore(1, 0))
    })

    test('downvotes lower the score', () => {
        expect(wilsonScore(10, 0)).toBeGreaterThan(wilsonScore(10, 5))
        expect(wilsonScore(10, 5)).toBeGreaterThan(wilsonScore(10, 40))
    })

    test('the result is always a proportion', () => {
        for (const [up, down] of [[0, 0], [1, 0], [0, 1], [500, 3], [3, 500]]) {
            const score = wilsonScore(up, down)
            expect(score).toBeGreaterThanOrEqual(0)
            expect(score).toBeLessThanOrEqual(1)
        }
    })

    test('an all-negative item scores zero-ish, not negative', () => {
        expect(wilsonScore(0, 50)).toBeGreaterThanOrEqual(0)
        expect(wilsonScore(0, 50)).toBeLessThan(0.1)
    })
})
```

Create `apps/web/lib/gallery/votes.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { voteDelta } from './votes'

describe('voteDelta', () => {
    test('a first up-vote', () => {
        expect(voteDelta(null, 1)).toEqual({ up: 1, down: 0 })
    })

    test('a first down-vote', () => {
        expect(voteDelta(null, -1)).toEqual({ up: 0, down: 1 })
    })

    test('changing up to down moves the vote rather than adding one', () => {
        expect(voteDelta(1, -1)).toEqual({ up: -1, down: 1 })
    })

    test('changing down to up moves the vote rather than adding one', () => {
        expect(voteDelta(-1, 1)).toEqual({ up: 1, down: -1 })
    })

    test('withdrawing removes only what was there', () => {
        expect(voteDelta(1, null)).toEqual({ up: -1, down: 0 })
        expect(voteDelta(-1, null)).toEqual({ up: 0, down: -1 })
    })

    test('re-casting the same vote changes nothing', () => {
        // The route treats this as a withdrawal before it gets here, but the
        // arithmetic has to be safe on its own — a double-submit must not
        // double-count.
        expect(voteDelta(1, 1)).toEqual({ up: 0, down: 0 })
        expect(voteDelta(-1, -1)).toEqual({ up: 0, down: 0 })
    })

    test('withdrawing a vote that was never cast changes nothing', () => {
        expect(voteDelta(null, null)).toEqual({ up: 0, down: 0 })
    })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/web && npx vitest run lib/gallery/ranking.test.ts lib/gallery/votes.test.ts`
Expected: FAIL — both imports unresolved.

- [ ] **Step 3: Write both implementations**

Create `apps/web/lib/gallery/ranking.ts`:

```ts
/**
 * Ordering media by what the unit thinks of it.
 *
 * Not a ratio. up/(up+down) scores a single up-vote at 1.00 and forty-up-two-
 * down at 0.95, so a "Top rated" sort built on it shows whatever was voted on
 * once, forever, and never the things people actually liked.
 *
 * The Wilson lower bound asks a better question: given these votes, what is the
 * lowest approval rate consistent with them at 95% confidence? A single vote
 * supports almost no confidence and scores near zero; forty votes narrow the
 * interval and score close to their observed rate. It is the same ranking
 * Reddit's "best" comment sort uses, for the same reason.
 */

/** 1.96 — the two-tailed z for 95% confidence. Hard-coded because the
 *  confidence level is not a knob anyone should turn per call. */
const Z = 1.959963984540054

export function wilsonScore(up: number, down: number): number {
    const n = up + down
    if (n === 0) return 0

    const phat = up / n
    const z2 = Z * Z

    const numerator = phat + z2 / (2 * n) - Z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n)
    const denominator = 1 + z2 / n

    // Clamped because the lower bound can land a hair below zero on an
    // all-negative item, and a negative "score" is meaningless to sort on.
    return Math.max(0, Math.min(1, numerator / denominator))
}
```

Create `apps/web/lib/gallery/votes.ts`:

```ts
/**
 * What one member changing their mind does to the two counters.
 *
 * `gallery_media.up` and `.down` are denormalised so a grid of 48 tiles never
 * aggregates the votes collection. That is only safe if the deltas are exactly
 * right, so the arithmetic is separated from the route that applies it and
 * tested on its own — including the cases the route is supposed to prevent,
 * because "the route prevents it" is not something the counters can rely on
 * under a double-submit.
 */

export type VoteValue = 1 | -1

export function voteDelta(previous: VoteValue | null, next: VoteValue | null): { up: number, down: number } {
    const count = (v: VoteValue | null, want: VoteValue) => (v === want ? 1 : 0)
    return {
        up: count(next, 1) - count(previous, 1),
        down: count(next, -1) - count(previous, -1),
    }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd apps/web && npx vitest run lib/gallery/ranking.test.ts lib/gallery/votes.test.ts`
Expected: PASS, 13 tests across two files.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/gallery/ranking.ts apps/web/lib/gallery/ranking.test.ts apps/web/lib/gallery/votes.ts apps/web/lib/gallery/votes.test.ts
git commit -m "feat(gallery): Wilson ranking and vote delta arithmetic

A raw ratio puts one up-vote above forty-up-two-down forever. The
counters are denormalised, so the deltas are tested apart from the route
that applies them."
```

---

## Task 6: `lib/gallery/status.ts` — the lifecycle

**Files:**
- Create: `apps/web/lib/gallery/status.ts`, `apps/web/lib/gallery/status.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type GalleryStatus = 'processing' | 'pending' | 'live' | 'rejected' | 'hidden'
  export const GALLERY_STATUSES: readonly GalleryStatus[]
  export function canTransition(from: GalleryStatus, to: GalleryStatus): boolean
  export function isPublic(status: GalleryStatus): boolean
  ```
  Used by Task 7 (types), Task 10, Task 12, Task 13, Task 15.

**The rules, stated once.**

| From | May become | Why |
|---|---|---|
| `processing` | `pending` | The queue finished, successfully or not — a failed transcode still reaches a reviewer, carrying `processingError`, rather than vanishing |
| `pending` | `live`, `rejected` | The two things a reviewer can do |
| `live` | `hidden` | Pulled from the gallery without deleting it |
| `hidden` | `live` | Put back |
| `rejected` | *nothing* | Terminal. Its bytes are already gone from disk |

`live` may never return to `processing` or `pending`: the staging file is deleted once processing completes, so there is nothing to re-process, and a published item re-entering the review queue would confuse a reviewer into approving something already public.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/gallery/status.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { canTransition, isPublic, GALLERY_STATUSES, type GalleryStatus } from './status'

const ALLOWED: [GalleryStatus, GalleryStatus][] = [
    ['processing', 'pending'],
    ['pending', 'live'],
    ['pending', 'rejected'],
    ['live', 'hidden'],
    ['hidden', 'live'],
]

describe('canTransition', () => {
    test('every allowed move is allowed', () => {
        for (const [from, to] of ALLOWED) expect(canTransition(from, to), `${from} -> ${to}`).toBe(true)
    })

    test('every move not on the list is refused', () => {
        const allowed = new Set(ALLOWED.map(([f, t]) => `${f}->${t}`))
        for (const from of GALLERY_STATUSES) {
            for (const to of GALLERY_STATUSES) {
                if (from === to) continue
                if (allowed.has(`${from}->${to}`)) continue
                expect(canTransition(from, to), `${from} -> ${to} should be refused`).toBe(false)
            }
        }
    })

    test('rejected is terminal — its bytes are already deleted', () => {
        for (const to of GALLERY_STATUSES) {
            if (to === 'rejected') continue
            expect(canTransition('rejected', to), `rejected -> ${to}`).toBe(false)
        }
    })

    test('a published item cannot re-enter the review queue', () => {
        expect(canTransition('live', 'pending')).toBe(false)
        expect(canTransition('live', 'processing')).toBe(false)
    })

    test('a no-op transition is not an error', () => {
        for (const s of GALLERY_STATUSES) expect(canTransition(s, s)).toBe(true)
    })
})

describe('isPublic', () => {
    test('only live media is public', () => {
        expect(isPublic('live')).toBe(true)
        for (const s of GALLERY_STATUSES) {
            if (s === 'live') continue
            expect(isPublic(s), s).toBe(false)
        }
    })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && npx vitest run lib/gallery/status.test.ts`
Expected: FAIL — import unresolved.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/gallery/status.ts`:

```ts
/**
 * Where a piece of gallery media is in its life, and where it may go next.
 *
 * The table is here rather than inline in the routes because four different
 * places move media between states — the queue, the review tab's accept, its
 * reject, and the hide/unhide control — and a rule restated in four places is a
 * rule that will eventually disagree with itself.
 */

export type GalleryStatus = 'processing' | 'pending' | 'live' | 'rejected' | 'hidden'

export const GALLERY_STATUSES: readonly GalleryStatus[] = ['processing', 'pending', 'live', 'rejected', 'hidden']

/**
 * `processing` reaches `pending` whether the transcode succeeded or not: a
 * failure carries a `processingError` into the review queue so somebody sees it
 * and can reject it, which is strictly better than an item that silently never
 * appears anywhere.
 *
 * `live` may never go back to `pending` or `processing`. The staging file is
 * deleted once processing finishes, so there is nothing left to re-process, and
 * a published item sitting in the review queue invites a reviewer to approve
 * something that is already public.
 *
 * `rejected` is terminal because rejection deletes the bytes.
 */
const TRANSITIONS: Record<GalleryStatus, readonly GalleryStatus[]> = {
    processing: ['pending'],
    pending: ['live', 'rejected'],
    live: ['hidden'],
    hidden: ['live'],
    rejected: [],
}

export function canTransition(from: GalleryStatus, to: GalleryStatus): boolean {
    if (from === to) return true
    return TRANSITIONS[from].includes(to)
}

export function isPublic(status: GalleryStatus): boolean {
    return status === 'live'
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd apps/web && npx vitest run lib/gallery/status.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole unit suite — nothing existing should have broken**

Run: `cd apps/web && npm run test:unit`
Expected: PASS. Note the existing suite boots real mongod instances and takes a couple of minutes.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/web/lib/gallery/status.ts apps/web/lib/gallery/status.test.ts
git commit -m "feat(gallery): the media lifecycle, written down once

Four places move media between states; a rule restated four times is a
rule that will disagree with itself."
```

---

## Task 7: `lib/gallery/freshness.ts` — the NEW badge window

**Files:**
- Create: `apps/web/lib/gallery/freshness.ts`, `apps/web/lib/gallery/freshness.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export const NEW_BADGE_DAYS = 7
  export function isNewlyPublished(publishedAt: string | Date | null | undefined, now?: Date): boolean
  ```
  Used by Task 19 (the tile).

**Why `publishedAt` and not `takenAt`.** The question a visitor asks of a badge is "what has appeared since I last looked", not "what was shot recently". A photograph from a two-year-old operation that J5 approved this morning is new to the gallery; an item whose operation ran last week but which has been up for a month is not. Migrated legacy items have no `publishedAt` at all and must never carry the badge — otherwise the entire archive lights up on migration day.

`now` is injectable so the test does not depend on the clock.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/gallery/freshness.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { isNewlyPublished, NEW_BADGE_DAYS } from './freshness'

const NOW = new Date('2026-08-30T12:00:00Z')
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

describe('isNewlyPublished', () => {
    test('the window is a week', () => {
        expect(NEW_BADGE_DAYS).toBe(7)
    })

    test('published moments ago', () => {
        expect(isNewlyPublished(NOW, NOW)).toBe(true)
    })

    test('published six days ago is still new', () => {
        expect(isNewlyPublished(daysBefore(6), NOW)).toBe(true)
    })

    test('published eight days ago is not', () => {
        expect(isNewlyPublished(daysBefore(8), NOW)).toBe(false)
    })

    test('the boundary is inclusive at exactly seven days', () => {
        expect(isNewlyPublished(daysBefore(7), NOW)).toBe(true)
        expect(isNewlyPublished(new Date(daysBefore(7).getTime() - 1000), NOW)).toBe(false)
    })

    test('accepts the ISO string the API actually sends', () => {
        expect(isNewlyPublished(daysBefore(2).toISOString(), NOW)).toBe(true)
    })

    test('a migrated legacy item never carries the badge', () => {
        // No publishedAt at all. If this returned true the whole archive would
        // light up the day the migration runs.
        expect(isNewlyPublished(null, NOW)).toBe(false)
        expect(isNewlyPublished(undefined, NOW)).toBe(false)
    })

    test('an unparseable date is not new', () => {
        expect(isNewlyPublished('not a date', NOW)).toBe(false)
    })

    test('a future date is treated as new rather than as an error', () => {
        // Clock skew between the server that stamped it and the browser reading
        // it is real and small; refusing the badge over a few seconds of it
        // would be a worse answer than granting it.
        expect(isNewlyPublished(new Date(NOW.getTime() + 60_000), NOW)).toBe(true)
    })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && npx vitest run lib/gallery/freshness.test.ts`
Expected: FAIL — import unresolved.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/gallery/freshness.ts`:

```ts
/**
 * Whether a piece of media is new enough to say so on its tile.
 *
 * Keyed on when it was *published*, not when it was taken. The badge answers
 * "what has appeared since I last looked", so a photograph from a two-year-old
 * operation that J5 approved this morning earns it and an item that has been up
 * for a month does not, whatever its operation's date.
 *
 * Migrated legacy files carry no publishedAt and so never qualify — which is
 * the point, because the alternative is the entire archive badged NEW on the
 * day the migration runs.
 *
 * Evaluated in the browser against the item's own timestamp rather than
 * precomputed on the server, so it decays correctly on a page left open
 * overnight and needs no scheduled job to clear it.
 */

export const NEW_BADGE_DAYS = 7

const WINDOW_MS = NEW_BADGE_DAYS * 24 * 60 * 60 * 1000

export function isNewlyPublished(
    publishedAt: string | Date | null | undefined,
    now: Date = new Date(),
): boolean {
    if (!publishedAt) return false

    const at = publishedAt instanceof Date ? publishedAt : new Date(publishedAt)
    const ms = at.getTime()
    if (Number.isNaN(ms)) return false

    // A timestamp slightly in the future is clock skew between the server that
    // stamped it and the browser reading it, not an error worth refusing over.
    return now.getTime() - ms <= WINDOW_MS
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd apps/web && npx vitest run lib/gallery/freshness.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/web/lib/gallery/freshness.ts apps/web/lib/gallery/freshness.test.ts
git commit -m "feat(gallery): a NEW badge window keyed on publication

Published, not taken: the badge answers what has appeared since you last
looked. Legacy items have no publishedAt, so the archive does not light
up on migration day."
```

---

## Task 8: Types, collections, permission keys

The whole data layer's declarations in one gate — they are useless apart, and nothing from here on compiles without them.

**Files:**
- Create: `apps/web/types/gallery-media.d.ts`
- Modify: `apps/web/lib/mongo.ts` (three collections beside the others)
- Modify: `apps/web/lib/permissions.ts` (the existing `gallery` block, around line 716)
- Modify: `apps/web/lib/permissions-descriptions.ts` (beside `gallery.manage`, line 44)
- Create: `apps/web/lib/gallery/keys.test.ts`

**Interfaces:**
- Consumes: `GalleryStatus` (Task 6), `EmbedProvider` / `EmbedKind` (Task 3).
- Produces: global `GalleryMedia`, `GalleryVote`, `GalleryTag`; `Db.galleryMedia`, `Db.galleryVotes`, `Db.galleryTags`; the keys `gallery.submit`, `gallery.review`, `gallery.tags`.

**How types work here.** `apps/web/types/*.d.ts` declare interfaces inside `declare global {}` with a bare `export {}` to make the file a module. Read `apps/web/types/gallery.d.ts` for the pattern first. Nothing imports these names; they are ambient.

- [ ] **Step 1: Check the descriptions module's export name**

Run: `grep -n '^export' apps/web/lib/permissions-descriptions.ts`

Use whatever name it prints in the test below (the plan assumes `PERMISSION_DESCRIPTIONS`).

- [ ] **Step 2: Write the failing test**

A typo in a key is a gate that silently never opens for anybody — the exact failure `lib/operations/permissions.test.ts` exists to catch.

Create `apps/web/lib/gallery/keys.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'
import { PERMISSION_DESCRIPTIONS } from '@/lib/permissions-descriptions'

const GALLERY_KEYS = ['gallery.submit', 'gallery.review', 'gallery.tags'] as const

describe('the gallery submission permission keys', () => {
    test('each one exists in the flattened catalog', () => {
        // A typo here is a gate that never opens for anybody, silently.
        for (const key of GALLERY_KEYS) expect(PERMISSION_KEYS).toContain(key)
    })

    test('the key that already existed is untouched', () => {
        expect(PERMISSION_KEYS).toContain('gallery.manage')
    })

    test('each one is described, so the Permissions Explorer can explain it', () => {
        for (const key of GALLERY_KEYS) expect(PERMISSION_DESCRIPTIONS[key], key).toBeTruthy()
    })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd apps/web && npx vitest run lib/gallery/keys.test.ts`
Expected: FAIL — `expected [ ... ] to contain 'gallery.submit'`.

- [ ] **Step 4: Add the permission keys**

In `apps/web/lib/permissions.ts`, inside the existing `gallery: { ... }` block (which currently holds only `manage`), after `manage`:

```ts
        /**
         * Submit media to the gallery — the Submit button, `/gallery/submit`,
         * and the submission API routes.
         *
         * Gated with `await hasPermission(user, 'gallery.submit')` and nothing
         * else. Deliberately no Discord-role fallback and no legacy arm, which
         * means this is false for everybody — staff included — until it is
         * granted in the Roles Manager. Grant it on whichever role every member
         * holds.
         *
         * Used by:
         *  - `app/(landing)/gallery/submit/page.tsx` (page gate)
         *  - `app/(landing)/gallery/page.tsx` (shows or hides the Submit button)
         *  - `app/api/gallery/submissions/route.ts`
         */
        submit: [],

        /**
         * Review submitted media — accept, reject, or correct its caption,
         * tags and operation before publishing.
         *
         * Same story as `submit`: no legacy arm, so grant it on the J5 base
         * department role before this feature is any use.
         *
         * Used by:
         *  - `app/dashboard/j5/tabs/GallerySubmissionsTab.tsx`
         *  - `app/api/gallery/submissions/[id]/route.ts`
         *  - `app/api/gallery/media/[id]/route.ts` (seeing pending media)
         */
        review: [],

        /**
         * Manage the gallery's tag vocabulary — add, rename, reorder, retire.
         *
         * Used by:
         *  - `app/dashboard/j5/tabs/GalleryTagsTab.tsx`
         *  - `app/api/gallery/tags/route.ts` (POST/PATCH — GET is public)
         */
        tags: [],
```

The empty arrays are correct and deliberate. `hasPermission` never reads them; they exist because `lib/permissions/tree.ts` walks this object for the Permissions Explorer, and `permissions-catalog.ts`'s `flatten()` only emits a path when it reaches an array.

- [ ] **Step 5: Describe them**

In `apps/web/lib/permissions-descriptions.ts`, beside the existing `'gallery.manage'` line:

```ts
    'gallery.submit': 'Submit photos, video and YouTube/Twitch links to the gallery for review.',
    'gallery.review': 'Review submitted gallery media — accept, reject, or correct its caption, tags and operation.',
    'gallery.tags': 'Manage the gallery tag vocabulary.',
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `cd apps/web && npx vitest run lib/gallery/keys.test.ts`
Expected: PASS.

- [ ] **Step 7: Declare the document shapes**

Create `apps/web/types/gallery-media.d.ts`:

```ts
import type { ObjectId } from "mongodb"
import type { GalleryStatus } from "@/lib/gallery/status"
import type { EmbedProvider, EmbedKind } from "@/lib/gallery/embeds"

export { }

declare global {

    /**
     * One piece of gallery media — the index the gallery reads from.
     *
     * Before this existed the gallery was a window onto a folder tree and
     * `GET /api/gallery` walked it with readdirSync, which is why the page
     * carried no author, no tags and no likes: there was nowhere to put them.
     * Every file in the archive has a document here, written by
     * `scripts/index-gallery.mjs`; the bytes did not move.
     */
    interface GalleryMedia {
        _id: ObjectId

        kind: 'image' | 'video'
        /** Where the bytes are. An embed has none of its own. */
        source: 'upload' | EmbedProvider

        /**
         * Uploads and migrated legacy files.
         *   'media:{_id}.{ext}'                    -> storage/gallery/media/...
         *   'legacy:{year}/{op}/{mission}/{file}'  -> storage/gallery/content/...
         * The prefix is what tells the serving layer which tree to look in.
         */
        storageKey?: string
        /** 'media:{_id}_poster.jpg'. Uploaded video and embeds; stills have none. */
        posterKey?: string

        /** Embeds only — the provider's own video id or clip slug. */
        embedId?: string
        /** Embeds only. A Twitch VOD and a Twitch clip embed through different
         *  players, so the id alone cannot render one. */
        embedKind?: EmbedKind
        /** Embeds only — the canonical provider URL, for the "watch on" link. */
        embedUrl?: string

        /**
         * The folder-tree facets. All present on a migrated item; derived from
         * the chosen operation on a new one, and all absent together when the
         * submitter chose Unknown. `mission` only ever comes from the tree —
         * new submissions have no mission.
         */
        year?: string
        operation?: string
        opLabel?: string
        mission?: string
        operationId?: ObjectId

        /** The operation's date — what the gallery sorts and groups on. Null
         *  when the operation was Unknown and no reviewer has set one. */
        takenAt: Date | null

        /** Absent on migrated files: nothing on disk records who shot what. */
        authorId?: string
        authorName?: string

        caption?: string
        /** `gallery_tags` slugs. */
        tags: string[]

        width?: number
        height?: number
        durationSec?: number
        bytes?: number

        status: GalleryStatus
        /** Why processing failed. Carried into the review queue rather than
         *  hidden, so a reviewer sees it instead of the item vanishing. */
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

    /**
     * One member's vote on one piece of media.
     *
     * The unique index on { mediaId, userId } is what enforces one vote per
     * member. The route does not, and must not be what this relies on.
     */
    interface GalleryVote {
        _id: ObjectId
        mediaId: ObjectId
        userId: string
        value: 1 | -1
        at: Date
    }

    /**
     * The tag vocabulary, managed by J5.
     *
     * Retired rather than deleted, so a rename never has to cascade across
     * every document carrying the slug.
     */
    interface GalleryTag {
        _id: ObjectId
        slug: string
        label: string
        order: number
        retired: boolean
    }

}
```

- [ ] **Step 8: Register the collections**

In `apps/web/lib/mongo.ts`, after the `operationFeedback` entry (the file groups by feature; follow that):

```ts
    // ── Gallery ───────────────────────────────────────────────────────────────
    /** Every piece of gallery media, legacy and submitted alike. The gallery
     *  reads from here rather than from the folder tree. */
    galleryMedia: db.collection('gallery_media') as MongoCollection<GalleryMedia>,
    galleryVotes: db.collection('gallery_votes') as MongoCollection<GalleryVote>,
    galleryTags:  db.collection('gallery_tags')  as MongoCollection<GalleryTag>,
```

- [ ] **Step 9: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors. If `GalleryStatus` will not resolve inside the `.d.ts`, that is a typo — `tsconfig.json` already includes `types/**` and already declares the `@/` alias.

- [ ] **Step 10: Commit**

```bash
git branch --show-current
git add apps/web/types/gallery-media.d.ts apps/web/lib/mongo.ts apps/web/lib/permissions.ts apps/web/lib/permissions-descriptions.ts apps/web/lib/gallery/keys.test.ts
git commit -m "feat(gallery): document shapes, collections and three permission keys

The keys carry empty role arrays deliberately - hasPermission never
reads them, and the Permissions Explorer needs the path to exist. No
legacy arm, so they are false for everyone until granted."
```

---

## Task 9: The migration — index the archive into Mongo

**Files:**
- Create: `scripts/index-gallery.mjs` (repo root)
- Create: `apps/web/lib/gallery/index-gallery.test.ts`
- Modify: `scripts/start.mjs` (a `MIGRATION_ITEMS` entry, around line 817)

**Interfaces:**
- Consumes: the collections (Task 8).
- Produces: a populated `gallery_media`, a seeded `gallery_tags`, and every index later tasks query against.

**Conventions to follow** — read `scripts/2026-08-19-kit-rating-indexes.mjs` first, it is the closest model. Dry-run by default, `--apply` writes. `MONGO_URI` / `MONGO_DB` from the environment, exit 1 with a clear message if either is missing. Plain `mongodb` driver, top-level `await`, `client.close()` in a `finally`.

**Storage paths — the one way this fails silently.** The menu runs migrations with `cwd: ROOT`, so this resolves `storage/gallery/content` from the repo root, *not* the `../../storage/...` the app uses from `apps/web`. A missing content directory must be a hard exit, not an empty run.

**Idempotency** is the unique `storageKey` index plus `updateOne(..., { $setOnInsert }, { upsert: true })`. `$setOnInsert` and not `$set`: a re-run must not overwrite a caption or tags a reviewer has since put on a migrated item.

- [ ] **Step 1: Write the failing test**

This is the one place a real database earns its boot time — the property under test is what *two* runs do to a collection. Follow the `mongodb-memory-server` usage already in `lib/backups.test.ts`.

Create `apps/web/lib/gallery/index-gallery.test.ts`:

```ts
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient, type Db } from 'mongodb'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'

/**
 * The migration is the sharp edge of this feature: it writes one document per
 * file across the whole archive, and then the gallery stops reading the disk.
 * The property that makes that safe is that running it twice is the same as
 * running it once — so that is what this asserts, against a real mongod and a
 * real folder tree, because both halves are what it could get wrong.
 */

let mongod: MongoMemoryServer
let client: MongoClient
let db: Db
let root: string

const SCRIPT = resolve(__dirname, '../../../../scripts/index-gallery.mjs')

function run() {
    execFileSync('node', [SCRIPT, '--apply'], {
        cwd: root,
        env: { ...process.env, MONGO_URI: mongod.getUri(), MONGO_DB: 'galleryindextest' },
        stdio: 'pipe',
    })
}

beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    client = new MongoClient(mongod.getUri())
    await client.connect()
    db = client.db('galleryindextest')

    // A miniature archive: two years, two operations (one numbered, one not),
    // two missions, four files.
    root = mkdtempSync(join(tmpdir(), 'asot-gallery-'))
    const content = join(root, 'storage', 'gallery', 'content')
    for (const dir of [
        join(content, '2025', '1. Op Black Hill', 'I'),
        join(content, '2025', '1. Op Black Hill', 'II'),
        join(content, '2026', 'Op Unnumbered', 'I'),
    ]) mkdirSync(dir, { recursive: true })

    // A real 1x1 PNG, so the dimension probe has something to read.
    const PNG = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
    )
    writeFileSync(join(content, '2025', '1. Op Black Hill', 'I', 'a.png'), PNG)
    writeFileSync(join(content, '2025', '1. Op Black Hill', 'I', 'b.png'), PNG)
    writeFileSync(join(content, '2025', '1. Op Black Hill', 'II', 'c.png'), PNG)
    writeFileSync(join(content, '2026', 'Op Unnumbered', 'I', 'd.png'), PNG)
}, 120_000)

afterAll(async () => {
    await client?.close()
    await mongod?.stop()
    if (root) rmSync(root, { recursive: true, force: true })
})

describe('index-gallery', () => {
    test('indexes every file exactly once', () => {
        run()
        return expect(db.collection('gallery_media').countDocuments()).resolves.toBe(4)
    })

    test('running it again changes nothing', () => {
        run()
        return expect(db.collection('gallery_media').countDocuments()).resolves.toBe(4)
    })

    test('a re-run does not clobber what a reviewer edited', async () => {
        // $setOnInsert, not $set. A migrated item given a caption and tags must
        // survive the script being run again.
        await db.collection('gallery_media').updateOne(
            { storageKey: 'legacy:2025/1. Op Black Hill/I/a.png' },
            { $set: { caption: 'set by a reviewer', tags: ['funny'] } },
        )
        run()
        const doc = await db.collection('gallery_media').findOne({ storageKey: 'legacy:2025/1. Op Black Hill/I/a.png' })
        expect(doc?.caption).toBe('set by a reviewer')
        expect(doc?.tags).toEqual(['funny'])
    })

    test('every migrated item is live, authorless and untagged', async () => {
        const docs = await db.collection('gallery_media').find({}).toArray()
        for (const d of docs) {
            expect(d.status).toBe('live')
            expect(d.kind).toBe('image')
            expect(d.source).toBe('upload')
            expect(d.authorId).toBeUndefined()
            expect(d.up).toBe(0)
            expect(d.down).toBe(0)
            // No publishedAt — the NEW badge must not light up the whole
            // archive on the day this runs.
            expect(d.publishedAt).toBeUndefined()
        }
    })

    test('strips the ordering prefix into opLabel and keeps the raw folder', async () => {
        const doc = await db.collection('gallery_media').findOne({ storageKey: 'legacy:2025/1. Op Black Hill/I/a.png' })
        expect(doc?.operation).toBe('1. Op Black Hill')
        expect(doc?.opLabel).toBe('Op Black Hill')
        expect(doc?.year).toBe('2025')
        expect(doc?.mission).toBe('I')
    })

    test('falls back to January of the folder year when no operation matches', async () => {
        const doc = await db.collection('gallery_media').findOne({ storageKey: 'legacy:2026/Op Unnumbered/I/d.png' })
        expect(new Date(doc!.takenAt).getUTCFullYear()).toBe(2026)
        expect(new Date(doc!.takenAt).getUTCMonth()).toBe(0)
    })

    test('probes real dimensions off the file', async () => {
        const doc = await db.collection('gallery_media').findOne({ storageKey: 'legacy:2025/1. Op Black Hill/I/a.png' })
        expect(doc?.width).toBe(1)
        expect(doc?.height).toBe(1)
    })

    test('seeds the tag vocabulary once', async () => {
        const tags = await db.collection('gallery_tags').find({}).toArray()
        expect(tags).toHaveLength(15)
        expect(tags.map(t => t.slug)).toContain('rare-moment')
        expect(tags.every(t => t.retired === false)).toBe(true)
    })

    test('creates the unique index the idempotency depends on', async () => {
        const indexes = await db.collection('gallery_media').indexes()
        expect(indexes.find(i => i.name === 'storageKey_unique')?.unique).toBe(true)
    })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && npx vitest run lib/gallery/index-gallery.test.ts`
Expected: FAIL — `ENOENT` on `scripts/index-gallery.mjs`.

- [ ] **Step 3: Write the script**

Create `scripts/index-gallery.mjs` at the repo root:

```js
#!/usr/bin/env node
/**
 * Index the gallery's folder tree into `gallery_media`.
 *
 * The gallery used to be a window onto storage: `GET /api/gallery` walked
 * years/operations/missions with readdirSync and returned the tree. That is why
 * the page carried no author, no tags and no likes — there was nowhere to put
 * them. This writes one document per file so there is.
 *
 * It does not move a single byte. Every migrated document keeps a `storageKey`
 * of `legacy:{year}/{operation}/{mission}/{file}` and the serving route reads
 * the same file from the same place it always has.
 *
 * Idempotent, and it has to be: J5 keeps uploading through their existing
 * dashboard tab, so this is re-run rather than run once. The unique index on
 * storageKey plus `$setOnInsert` is what makes a second run a no-op — note
 * `$setOnInsert` and not `$set`, so a caption or tags a reviewer has since put
 * on a migrated item survive.
 *
 * Dry-run by default. Pass --apply to write.
 */

import { MongoClient } from 'mongodb'
import { readdirSync, statSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { createRequire } from 'module'

const APPLY = process.argv.includes('--apply')
const MONGO_URI = process.env.MONGO_URI
const MONGO_DB = process.env.MONGO_DB

if (!MONGO_URI || !MONGO_DB) {
    console.error('MONGO_URI and MONGO_DB env vars are required.')
    process.exit(1)
}

/* sharp lives in apps/web/node_modules — the repo root has no copy, and adding
   one just for a dimension probe would be a second native binary to keep in
   step. Resolved from there explicitly; if it cannot be found the probe is
   skipped and masonry falls back to its 16:10 default, which is a cosmetic
   loss rather than a failed migration.

   Resolved relative to THIS FILE, not to the working directory. The content
   tree below is found via cwd — that is what lets the test point the script at
   a fixture directory — and resolving sharp the same way would look for it
   inside that fixture and never find it. This script always sits at
   <repo>/scripts/, so apps/web is always its sibling. */
let sharp = null
try {
    const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
    sharp = require('sharp')
} catch {
    console.warn('sharp not resolvable from apps/web — indexing without dimensions.')
}

/* Run from the repo root: that is the cwd scripts/start.mjs gives a migration.
   The app resolves this as '../../storage/...' because it runs from apps/web,
   and confusing the two is the one way this silently indexes nothing — so a
   missing tree is a hard failure rather than an empty run. */
const CONTENT = resolve(process.cwd(), 'storage/gallery/content')
if (!existsSync(CONTENT)) {
    console.error(`No gallery content at ${CONTENT}. Run this from the repo root.`)
    process.exit(1)
}

const ORDER_PREFIX = /^\s*(\d+)\s*[.)\-–]?\s*/

/** Kept in step with apps/web/lib/gallery/naming.ts. A root-level .mjs cannot
 *  import a TypeScript module, so this is the feature's one duplicated
 *  function; naming.test.ts and this script's own test both pin the behaviour. */
function splitOperation(folder) {
    const match = folder.match(ORDER_PREFIX)
    if (!match) return { label: folder.trim(), order: Number.MAX_SAFE_INTEGER }
    return { label: folder.slice(match[0].length).trim() || folder.trim(), order: parseInt(match[1], 10) }
}

const SEED_TAGS = [
    'Funny', 'Cinematic', 'Cool', 'Rare moment', 'Teamwork', 'Close call',
    'Explosion', 'Aftermath', 'Night op', 'Air', 'Armour', 'Breach',
    'Fail', 'Scenery', 'Portrait',
]

const slugify = label => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const extOf = name => {
    const dot = name.lastIndexOf('.')
    return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

const dirs = path => readdirSync(path, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
const files = path => readdirSync(path, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name)

const client = new MongoClient(MONGO_URI)

try {
    await client.connect()
    const db = client.db(MONGO_DB)
    const media = db.collection('gallery_media')
    const tags = db.collection('gallery_tags')

    if (APPLY) {
        await media.createIndex({ storageKey: 1 }, { unique: true, sparse: true, name: 'storageKey_unique' })
        await media.createIndex({ status: 1, takenAt: -1 }, { name: 'status_takenAt' })
        await media.createIndex({ status: 1, createdAt: 1 }, { name: 'status_createdAt' })
        await media.createIndex({ authorId: 1 }, { name: 'authorId' })
        await media.createIndex({ tags: 1 }, { name: 'tags' })
        await db.collection('gallery_votes').createIndex({ mediaId: 1, userId: 1 }, { unique: true, name: 'mediaId_userId_unique' })
        await tags.createIndex({ slug: 1 }, { unique: true, name: 'slug_unique' })
        console.log('indexes ensured')
    } else {
        console.log('[dry-run] would ensure indexes on gallery_media, gallery_votes, gallery_tags')
    }

    // ── Operations, for resolving a folder name to a real date ───────────────
    const operations = await db.collection('operations')
        .find({ deletedAt: { $exists: false } }, { projection: { title: 1, date: 1 } })
        .toArray()

    const byTitle = new Map()
    for (const op of operations) {
        if (op.title) byTitle.set(String(op.title).trim().toLowerCase(), op)
    }

    // ── Walk ─────────────────────────────────────────────────────────────────
    let seen = 0, inserted = 0, skipped = 0, matched = 0

    for (const year of dirs(CONTENT)) {
        for (const operation of dirs(join(CONTENT, year))) {
            const { label } = splitOperation(operation)
            const op = byTitle.get(label.toLowerCase())
            if (op) matched++

            for (const mission of dirs(join(CONTENT, year, operation))) {
                const missionDir = join(CONTENT, year, operation, mission)

                for (const file of files(missionDir)) {
                    if (!IMAGE_EXT.has(extOf(file))) { skipped++; continue }
                    seen++

                    const storageKey = `legacy:${year}/${operation}/${mission}/${file}`
                    const absolute = join(missionDir, file)

                    let width, height
                    if (sharp) {
                        try {
                            const meta = await sharp(absolute).metadata()
                            width = meta.width
                            height = meta.height
                        } catch {
                            // A file sharp cannot read is still a file the
                            // gallery has been serving. Index it without
                            // dimensions rather than dropping it.
                        }
                    }

                    if (!APPLY) {
                        console.log(`[dry-run] would index ${storageKey}`)
                        continue
                    }

                    const result = await media.updateOne(
                        { storageKey },
                        {
                            $setOnInsert: {
                                kind: 'image',
                                source: 'upload',
                                storageKey,
                                year,
                                operation,
                                opLabel: label,
                                mission,
                                ...(op ? { operationId: op._id } : {}),
                                /* 1 January of the folder's year rather than
                                   null when nothing matched: the year is real
                                   information, and a null would drop the whole
                                   unmatched archive into the undated group. */
                                takenAt: op?.date ? new Date(op.date) : new Date(Date.UTC(Number(year), 0, 1)),
                                tags: [],
                                width,
                                height,
                                bytes: statSync(absolute).size,
                                status: 'live',
                                up: 0,
                                down: 0,
                                createdAt: new Date(),
                            },
                        },
                        { upsert: true },
                    )
                    if (result.upsertedCount) inserted++
                }
            }
        }
    }

    // ── Tag vocabulary ───────────────────────────────────────────────────────
    const tagCount = await tags.countDocuments()
    if (tagCount === 0) {
        if (APPLY) {
            await tags.insertMany(SEED_TAGS.map((label, order) => ({ slug: slugify(label), label, order, retired: false })))
            console.log(`seeded ${SEED_TAGS.length} tags`)
        } else {
            console.log(`[dry-run] would seed ${SEED_TAGS.length} tags`)
        }
    } else {
        console.log(`tag vocabulary already has ${tagCount} entries — left alone`)
    }

    console.log(`\nfiles seen: ${seen}   inserted: ${inserted}   already indexed: ${seen - inserted}   non-image skipped: ${skipped}`)
    console.log(`operation folders matched to a real operation: ${matched}`)
    if (!APPLY) console.log('\nDry run. Re-run with --apply to write.')
} finally {
    await client.close()
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd apps/web && npx vitest run lib/gallery/index-gallery.test.ts`
Expected: PASS, 9 tests. This boots a real mongod — give it a minute.

- [ ] **Step 5: Add the menu item**

In `scripts/start.mjs`, inside `MIGRATION_ITEMS` (after the kit-rating-indexes entry, around line 817):

```js
    // Dry-run first, then --apply, via runMigration's own flow. Writes one
    // gallery_media document per file already in storage and seeds the tag
    // vocabulary. Must run before the gallery starts reading Mongo, and it is
    // safe to re-run afterwards — J5 keeps uploading through their own tab.
    { label: '🗃️ Index: gallery media', script: 'scripts/index-gallery.mjs', cwd: ROOT },
```

- [ ] **Step 6: Dry-run it against the real database**

Run `npm start` → Migrations → **Index: gallery media**, or directly from the repo root with `MONGO_URI` / `MONGO_DB` set.

Expected: a list of `[dry-run] would index legacy:...` lines and a summary.

**Read the "operation folders matched" number.** If it is 0, title matching is not working and the entire archive would land on 1 January dates. Investigate before applying — most likely the folder labels do not match `operations.title` closely enough, in which case a looser match is a legitimate change to this script.

Do **not** pass `--apply` yet. Task 10 is what makes the data useful; applying now leaves the database ahead of the code for no benefit.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add scripts/index-gallery.mjs scripts/start.mjs apps/web/lib/gallery/index-gallery.test.ts
git commit -m "feat(gallery): index the archive into gallery_media

One document per file, no bytes moved. Idempotent via a unique
storageKey and setOnInsert, because J5 keeps uploading through their own
tab and this gets re-run rather than run once."
```

---

## Task 10: `/api/gallery` reads Mongo — the first shippable checkpoint

After this task the gallery looks and behaves exactly as it does today, but the data comes from `gallery_media` instead of `readdirSync`. Nothing user-visible changes. **This is a natural place to stop, apply the migration, and verify against the real archive before any new surface lands.**

**Files:**
- Modify: `apps/web/types/gallery.d.ts` (the `GalleryAPI` shape)
- Modify: `apps/web/app/api/gallery/route.ts` (complete rewrite)
- Modify: `apps/web/app/(landing)/gallery/gallery-data.ts` (`flatten` deleted, `Photo` re-shaped)
- Modify: `apps/web/app/(landing)/gallery/page.tsx` (consumes the flat list)
- Modify: `apps/web/app/(landing)/gallery/_components/PhotoGrid.tsx`, `FacetRail.tsx` (nullable facets)

**Interfaces:**
- Consumes: `splitOperation` (Task 2), `Db.galleryMedia` / `Db.galleryTags` (Task 8), `wilsonScore` (Task 5), `isPublic` (Task 6).
- Produces: the `GalleryItemAPI` shape and the reworked `Photo` type, which Tasks 19 and 20 build on.

**The shape change.** `GalleryAPI` currently nests years → operations → stages → filenames, and `flatten()` in `gallery-data.ts` immediately undoes that nesting because every single thing the page does — filtering, counting, sorting — wants a flat list. With Mongo as the source there is no reason to build the tree only to flatten it, so the route returns the flat list directly and `flatten()` is deleted.

**Nullability is the trap.** `year`, `operation`, `opLabel` and `mission` are all optional now (a submission with Unknown operation has none of them), and existing code reads `p.year`, `p.mission` and `p.opLabel` unconditionally in at least six places. Every one has to handle absence. Grep for them before declaring this done.

- [ ] **Step 1: Replace the API type**

In `apps/web/types/gallery.d.ts`, replace the `GalleryAPI` interface (keep `ScreenshotOfMonth` untouched):

```ts
    /** One piece of media, as the gallery page receives it. Everything is
     *  JSON-safe — dates are ISO strings, ObjectIds are hex. */
    interface GalleryItemAPI {
        id: string
        kind: 'image' | 'video'
        source: 'upload' | 'youtube' | 'twitch'

        /** Ready to use. Legacy items get an /api/gallery/fetch URL, new ones
         *  an /api/gallery/media URL — the page never has to know which. */
        src: string | null
        poster: string | null

        embedId: string | null
        embedKind: 'video' | 'clip' | null
        embedUrl: string | null

        year: string | null
        operation: string | null
        opLabel: string | null
        /** MAX_SAFE_INTEGER when the folder carried no ordering prefix. */
        opOrder: number
        mission: string | null
        takenAt: string | null

        authorId: string | null
        authorName: string | null
        caption: string | null
        tags: string[]

        width: number | null
        height: number | null
        durationSec: number | null

        up: number
        down: number
        /** Wilson lower bound, precomputed so the client never recomputes it
         *  for four thousand items on every sort. */
        score: number

        /** ISO. Null on migrated legacy files — see lib/gallery/freshness.ts. */
        publishedAt: string | null
    }

    interface GalleryAPI {
        info: string
        updated: string
        featured: string[]
        items: GalleryItemAPI[]
        tags: { slug: string, label: string }[]
    }
```

- [ ] **Step 2: Rewrite the route**

Replace `apps/web/app/api/gallery/route.ts` entirely:

```ts
import { NextResponse } from 'next/server'
import fs from 'fs'

import Db from '@/lib/mongo'
import { splitOperation } from '@/lib/gallery/naming'
import { wilsonScore } from '@/lib/gallery/ranking'

/**
 * The gallery, as one flat list.
 *
 * This route used to walk storage/gallery/content with readdirSync and return
 * years holding operations holding missions holding filenames — and the page
 * immediately flattened it, because filtering, counting and sorting all want
 * one list. The tree was the storage layer's shape, not the page's.
 *
 * Now that `gallery_media` is the index, the tree has nothing left to offer:
 * it cannot carry an author, a caption, tags or a score, and building it only
 * to have the client undo it was always waste. `scripts/index-gallery.mjs`
 * wrote a document for every file already on disk, so this returns strictly
 * more than the old route did, about exactly the same photographs.
 *
 * `featured` still comes off the filesystem. The featured strip is a folder of
 * hand-picked files that J5 manages through their own tab and it was never
 * part of the archive tree.
 */

/** The two storage trees, and which URL serves each. A legacy item keeps being
 *  served by the route that has always served it — its bytes never moved, and
 *  that route already sends immutable cache headers. */
function srcFor(m: GalleryMedia): string | null {
    if (!m.storageKey) return null

    if (m.storageKey.startsWith('legacy:')) {
        const [year, operation, mission, file] = m.storageKey.slice('legacy:'.length).split('/')
        const q = new URLSearchParams({ year, operation, stage: mission, img: file })
        return `/api/gallery/fetch?${q}`
    }

    return `/api/gallery/media/${m._id.toString()}`
}

export async function GET() {
    const [docs, tags] = await Promise.all([
        Db.galleryMedia.find({ status: 'live' }).toArray(),
        Db.galleryTags.find({ retired: false }).sort({ order: 1 }).toArray(),
    ])

    const items: GalleryItemAPI[] = docs.map(m => ({
        id: m._id.toString(),
        kind: m.kind,
        source: m.source,

        src: srcFor(m),
        poster: m.posterKey ? `/api/gallery/media/${m._id.toString()}/poster` : null,

        embedId: m.embedId ?? null,
        embedKind: m.embedKind ?? null,
        embedUrl: m.embedUrl ?? null,

        year: m.year ?? null,
        operation: m.operation ?? null,
        opLabel: m.opLabel ?? null,
        opOrder: m.operation ? splitOperation(m.operation).order : Number.MAX_SAFE_INTEGER,
        mission: m.mission ?? null,
        takenAt: m.takenAt ? m.takenAt.toISOString() : null,

        authorId: m.authorId ?? null,
        authorName: m.authorName ?? null,
        caption: m.caption ?? null,
        tags: m.tags ?? [],

        width: m.width ?? null,
        height: m.height ?? null,
        durationSec: m.durationSec ?? null,

        up: m.up ?? 0,
        down: m.down ?? 0,
        // Precomputed here rather than in the browser: the Top rated sort would
        // otherwise run this over every item on every re-sort.
        score: wilsonScore(m.up ?? 0, m.down ?? 0),

        publishedAt: m.publishedAt ? m.publishedAt.toISOString() : null,
    }))

    let featured: string[] = []
    try {
        featured = fs.readdirSync('../../storage/gallery/featured')
    } catch {
        // An absent featured folder is a normal state on a fresh checkout; the
        // strip renders nothing rather than the page failing.
    }

    return NextResponse.json({
        info: 'Gallery API',
        updated: new Date().toISOString(),
        featured,
        items,
        tags: tags.map(t => ({ slug: t.slug, label: t.label })),
    } satisfies GalleryAPI)
}
```

- [ ] **Step 3: Rework `gallery-data.ts`**

Delete `flatten()` and the `photoSrc()` helper — the API now supplies `src`. Replace the `Photo` type and `archiveStats`, and widen `matches` / `sortPhotos`:

```ts
/** A gallery item, as the page holds it. Identical to what the API sends —
 *  the flattening step this file used to perform now happens server-side. */
export type Photo = GalleryItemAPI

export type Facet = 'year' | 'operation' | 'mission' | 'tag' | 'author'

export type Filters = {
    q: string
    year: Set<string>
    operation: Set<string>
    mission: Set<string>
    tag: Set<string>
    author: Set<string>
    /** Not a facet — a segmented control in the toolbar. */
    media: 'all' | 'image' | 'video'
}

export const emptyFilters = (): Filters => ({
    q: '', year: new Set(), operation: new Set(), mission: new Set(),
    tag: new Set(), author: new Set(), media: 'all',
})

/** The value a facet filters on, for an item that may not have it. Items
 *  missing a facet are excluded by any selection on it, which is the honest
 *  answer: an undated submission is not "in 2025". */
function facetValues(p: Photo, facet: Facet): string[] {
    if (facet === 'year') return p.year ? [p.year] : []
    if (facet === 'operation') return p.operation ? [p.operation] : []
    if (facet === 'mission') return p.mission ? [p.mission] : []
    if (facet === 'author') return p.authorName ? [p.authorName] : []
    return p.tags
}

export function matches(p: Photo, f: Filters, skip?: Facet): boolean {
    if (f.media !== 'all' && p.kind !== f.media) return false

    if (f.q) {
        const haystack = [p.opLabel, p.mission, p.year, p.caption, p.authorName, ...p.tags]
            .filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(f.q.toLowerCase())) return false
    }

    for (const facet of ['year', 'operation', 'mission', 'tag', 'author'] as const) {
        if (skip === facet) continue
        const selected = f[facet]
        if (!selected.size) continue
        if (!facetValues(p, facet).some(v => selected.has(v))) return false
    }

    return true
}
```

And the sort — `takenAt` replaces `year` as the ordering key, and Top rated joins the list:

```ts
export function sortPhotos(list: Photo[], sort: SortKey): Photo[] {
    /* An item with no date sorts last under every date order rather than
       first. "Unknown operation" is missing information, not the beginning of
       time, and putting it at the top of Newest first would give the gallery a
       front page of undated submissions. */
    const when = (p: Photo) => (p.takenAt ? Date.parse(p.takenAt) : null)
    const byDate = (a: Photo, b: Photo, dir: 1 | -1) => {
        const x = when(a), y = when(b)
        if (x === null && y === null) return 0
        if (x === null) return 1
        if (y === null) return -1
        return (y - x) * dir
    }
    const byOp = (a: Photo, b: Photo) =>
        a.opOrder - b.opOrder || (a.opLabel ?? '').localeCompare(b.opLabel ?? '')

    const out = list.slice()
    if (sort === 'new') out.sort((a, b) => byDate(a, b, 1) || byOp(a, b))
    if (sort === 'old') out.sort((a, b) => byDate(a, b, -1) || byOp(a, b))
    if (sort === 'op') out.sort((a, b) => byOp(a, b) || byDate(a, b, 1))
    if (sort === 'top') out.sort((a, b) => b.score - a.score || (b.up - b.down) - (a.up - a.down) || byDate(a, b, 1))
    return out
}
```

`groupByOperation` keeps working but must tolerate absent fields — key undated items under a single `'unknown'` group:

```ts
export function groupByOperation(list: Photo[]): OperationGroup[] {
    const groups = new Map<string, OperationGroup>()
    for (const p of list) {
        const key = p.operation ? `${p.year ?? '—'}/${p.operation}` : 'unknown'
        let group = groups.get(key)
        if (!group) {
            group = {
                key,
                operation: p.operation ?? '',
                label: p.opLabel ?? 'Unknown operation',
                year: p.year ?? '',
                photos: [],
            }
            groups.set(key, group)
        }
        group.photos.push(p)
    }
    return [...groups.values()]
}
```

`archiveStats` now takes `items` rather than `years`:

```ts
export function archiveStats(items: Photo[]): ArchiveStats {
    const operations = new Set<string>()
    const missions = new Set<string>()
    let earliest: string | null = null

    for (const p of items) {
        if (p.operation) operations.add(`${p.year ?? ''}/${p.operation}`)
        if (p.mission && p.operation) missions.add(`${p.year ?? ''}/${p.operation}/${p.mission}`)
        if (p.year && /^\d{4}$/.test(p.year) && (earliest === null || p.year < earliest)) earliest = p.year
    }

    return { photographs: items.length, operations: operations.size, missions: missions.size, earliest }
}
```

- [ ] **Step 4: Update the page and the two components**

In `page.tsx`: replace the `years` state with `items`, drop `flatten`, and add `media` to the filter-reset logic.

In `Toolbar.tsx`, add `'top'` to the `SortKey` union **only** — `sortPhotos` handles it, so the type has to admit it or nothing compiles. Do **not** add the visible option to `SORTS` yet: this task's whole claim is that nothing changes on screen, and an unusable sort would break that. Task 18 adds the option.

In `PhotoGrid.tsx`'s `Tile`, the `aria-label` and the meta block read `photo.mission` and `photo.year` unconditionally. Make them tolerate absence:

```tsx
            aria-label={`Open ${photo.opLabel ?? 'gallery item'}${photo.mission ? `, ${photo.mission}` : ''}`}
```
```tsx
            <span className={s.meta}>
                <span className={s.metaT}>{photo.opLabel ?? 'Unknown operation'}</span>
                <span className={s.metaS}>
                    {photo.mission && <b>{photo.mission}</b>}
                    <span>{photo.year ?? ''}</span>
                </span>
            </span>
```

In `FacetRail.tsx`, the three `countBy` calls and the option lists must skip items missing the facet. Filter before mapping in each case, e.g.:

```tsx
    const years: Option[] = [...new Set(photos.map(p => p.year).filter((y): y is string => !!y))]
```

Leave the Tags and Author facets for Task 19 — this task is "nothing visibly changes".

- [ ] **Step 5: Typecheck and grep for the nullability trap**

```bash
cd apps/web && npx tsc --noEmit
grep -rn "\.mission\b\|\.opLabel\b\|\.year\b" "app/(landing)/gallery" | grep -v "?? \|?\.\|&&"
```

Expected: `tsc` clean. The grep should return nothing that dereferences a now-nullable field bare.

- [ ] **Step 6: Apply the migration, then verify against the real archive**

```bash
node scripts/index-gallery.mjs --apply     # from the repo root, with MONGO_URI/MONGO_DB set
```

Then start the dev server and open `/gallery`. Check, against how it looked before:
- the archive count in the banner matches the old one
- the year, operation and mission facets list the same values, with the same counts
- masonry lays out correctly (dimensions came from the migration's sharp probe)
- the lightbox opens, steps and downloads
- **Newest first** puts recent operations first and does not lead with undated items

- [ ] **Step 7: Run the unit suite and commit**

```bash
cd apps/web && npm run test:unit
cd /d/Projects/ASOT
git branch --show-current
git add apps/web/types/gallery.d.ts apps/web/app/api/gallery/route.ts "apps/web/app/(landing)/gallery"
git commit -m "feat(gallery): read the archive from Mongo instead of the filesystem

The tree was the storage layer's shape, not the page's - flatten() undid
it immediately, and it could never carry an author, a caption, tags or a
score. Same photographs, same page, more per item."
```

---

## Task 11: ffmpeg, and the media processing module

**Files:**
- Modify: `dockerfile` (repo root, beside the `restic` line)
- Create: `apps/web/lib/gallery/paths.ts`
- Create: `apps/web/lib/gallery/process.ts`
- Create: `apps/web/lib/gallery/paths.test.ts`

**Interfaces:**
- Consumes: `MAX_VIDEO_SECONDS` (Task 4).
- Produces:
  ```ts
  // paths.ts
  export const MEDIA_DIR: string
  export const STAGING_DIR: string
  export const CONTENT_DIR: string
  export function resolveStorageKey(key: string): string | null
  export function mediaKey(id: string, ext: string): string
  export function posterKey(id: string): string
  // process.ts
  export type ProcessedStill = { ext: string, width: number, height: number, bytes: number }
  export type ProcessedVideo = { ext: 'mp4', width: number, height: number, durationSec: number, bytes: number }
  export async function probeVideo(file: string): Promise<{ durationSec: number, width: number, height: number } | null>
  export async function processStill(staged: string, destNoExt: string): Promise<ProcessedStill>
  export async function processVideo(staged: string, destNoExt: string): Promise<ProcessedVideo>
  ```
  Used by Task 12 (queue) and Task 14 (submissions route).

**Why `paths.ts` is separate and tested.** It is the only thing standing between a `storageKey` from the database and `fs.readFileSync`. The existing `/api/gallery/fetch` route validates four user-supplied segments and then re-checks the resolved path; this module has to be at least as careful, and it is far easier to prove correct in isolation than through a route.

- [ ] **Step 1: Add ffmpeg to the image**

In the root `dockerfile`, extend the existing restic line:

```dockerfile
# restic — content-addressed backup tool used by lib/backups.ts.
# ffmpeg — transcodes and thumbnails submitted video (lib/gallery/process.ts).
# Both are in Alpine's own repo. ffmpeg brings ffprobe, which is what rejects an
# over-length clip before any CPU is spent encoding it.
RUN apk add --no-cache restic ffmpeg
```

Locally, ffmpeg must be on PATH for video submissions to work in dev. `ffmpeg -version` should print something; if it does not, install it (`winget install Gyan.FFmpeg` on Windows) — image submissions work without it, video does not.

- [ ] **Step 2: Write the failing path test**

Create `apps/web/lib/gallery/paths.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { resolveStorageKey, mediaKey, posterKey, MEDIA_DIR, CONTENT_DIR } from './paths'
import { sep } from 'path'

describe('resolveStorageKey', () => {
    test('a media key resolves inside the media directory', () => {
        const resolved = resolveStorageKey('media:507f1f77bcf86cd799439011.jpg')
        expect(resolved?.startsWith(MEDIA_DIR + sep)).toBe(true)
        expect(resolved?.endsWith('507f1f77bcf86cd799439011.jpg')).toBe(true)
    })

    test('a legacy key resolves inside the content directory', () => {
        const resolved = resolveStorageKey('legacy:2025/1. Op Black Hill/I/a.png')
        expect(resolved?.startsWith(CONTENT_DIR + sep)).toBe(true)
    })

    test.each([
        'media:../../../etc/passwd',
        'legacy:../../secrets/.env',
        'legacy:2025/../../../etc/passwd',
        'media:..%2F..%2Fetc%2Fpasswd',
        'media:/etc/passwd',
        'legacy:2025/op/I/../../../../.env',
    ])('refuses traversal — %s', key => {
        expect(resolveStorageKey(key)).toBeNull()
    })

    test.each([
        '',
        'no-prefix.jpg',
        'unknown:thing.jpg',
        'media:',
        'legacy:',
        'media:file .jpg',
    ])('refuses a malformed key — %s', key => {
        expect(resolveStorageKey(key)).toBeNull()
    })

    test('a media key must be an ObjectId hex plus an extension', () => {
        // Anything else did not come from this application.
        expect(resolveStorageKey('media:notanobjectid.jpg')).toBeNull()
        expect(resolveStorageKey('media:507f1f77bcf86cd799439011')).toBeNull()
        expect(resolveStorageKey('media:507f1f77bcf86cd799439011_poster.jpg')).not.toBeNull()
    })
})

describe('key builders', () => {
    test('round-trip through resolveStorageKey', () => {
        const id = '507f1f77bcf86cd799439011'
        expect(resolveStorageKey(mediaKey(id, 'mp4'))).not.toBeNull()
        expect(resolveStorageKey(posterKey(id))).not.toBeNull()
    })

    test('a poster is a jpg beside the media', () => {
        expect(posterKey('507f1f77bcf86cd799439011')).toBe('media:507f1f77bcf86cd799439011_poster.jpg')
    })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd apps/web && npx vitest run lib/gallery/paths.test.ts`
Expected: FAIL — import unresolved.

- [ ] **Step 4: Write `paths.ts`**

```ts
import path from 'path'

/**
 * The only thing between a storageKey and the filesystem.
 *
 * Two trees, because the migration moved no bytes: everything that predates
 * submissions still sits in the nested content tree the old gallery walked, and
 * everything submitted since sits flat under media/, addressed by its own
 * ObjectId. The key's prefix says which.
 *
 * Flat storage for new media is a security property as much as a tidiness one.
 * `/api/gallery/fetch` has to validate four user-supplied path segments against
 * a character class and then re-check the resolved path, because a member picks
 * those segments. A media id is a 24-character hex string this application
 * generated, so the check is one regex — and the containment assertion below is
 * belt and braces over that.
 *
 * Paths are relative to apps/web's working directory, matching every other
 * storage path in this codebase.
 */

const GALLERY_ROOT = path.resolve('../../storage/gallery')

export const CONTENT_DIR = path.join(GALLERY_ROOT, 'content')
export const MEDIA_DIR = path.join(GALLERY_ROOT, 'media')
export const STAGING_DIR = path.join(GALLERY_ROOT, 'staging')

/** A media filename this application wrote: an ObjectId hex, an optional
 *  _poster suffix, and an extension. Nothing else. */
const MEDIA_FILE = /^[0-9a-f]{24}(_poster)?\.[a-z0-9]{2,5}$/

export function mediaKey(id: string, ext: string): string {
    return `media:${id}.${ext.replace(/^\./, '').toLowerCase()}`
}

export function posterKey(id: string): string {
    return `media:${id}_poster.jpg`
}

/** The absolute path this key names, or null if it does not name one safely. */
export function resolveStorageKey(key: string): string | null {
    if (!key || key.includes(' ')) return null

    if (key.startsWith('media:')) {
        const file = key.slice('media:'.length)
        if (!MEDIA_FILE.test(file)) return null
        const resolved = path.resolve(MEDIA_DIR, file)
        return resolved.startsWith(MEDIA_DIR + path.sep) ? resolved : null
    }

    if (key.startsWith('legacy:')) {
        const rest = key.slice('legacy:'.length)
        if (!rest) return null
        const segments = rest.split('/')
        // Four segments exactly — year, operation, mission, file — and none of
        // them may be a traversal or empty.
        if (segments.length !== 4) return null
        if (segments.some(s => !s || s === '.' || s === '..' || s.includes('\\'))) return null
        const resolved = path.resolve(CONTENT_DIR, ...segments)
        return resolved.startsWith(CONTENT_DIR + path.sep) ? resolved : null
    }

    return null
}
```

- [ ] **Step 5: Run the path test and watch it pass**

Run: `cd apps/web && npx vitest run lib/gallery/paths.test.ts`
Expected: PASS.

- [ ] **Step 6: Write `process.ts`**

No unit test — it shells out to ffmpeg and decodes real images, which is integration territory; it is verified by hand in Task 14 instead.

```ts
import sharp from 'sharp'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { statSync } from 'fs'

import { MAX_VIDEO_SECONDS } from './limits'

const run = promisify(execFile)

/**
 * Turning what a member uploaded into what the gallery serves.
 *
 * Stills go through sharp with a 4K ceiling. Note that the gallery is an
 * explicit exemption from `lib/uploads/image.ts` — see GALLERY_IS_EXEMPT in
 * image-limits.ts, whose reasoning is that this is "the one place whose entire
 * purpose is the picture itself". A 4K ceiling honours that: nothing anybody
 * can display is lost, while a 15MB phone photo comes down to about 2MB.
 *
 * Video goes through ffmpeg, which is in the image (see the dockerfile). It is
 * probed first, so a clip over the length limit is refused before a single
 * frame is encoded — a five-minute 1080p transcode is one to three minutes of
 * CPU and there is no point spending it on something that will be rejected.
 */

/** Deliberately below 4K on the long edge in both directions rather than a
 *  fixed landscape box: a portrait screenshot should not be upscaled. */
const STILL_BOX = { width: 3840, height: 2160 }
const STILL_QUALITY = 82

export type ProcessedStill = { ext: string, width: number, height: number, bytes: number }
export type ProcessedVideo = { ext: 'mp4', width: number, height: number, durationSec: number, bytes: number }

export async function probeVideo(file: string): Promise<{ durationSec: number, width: number, height: number } | null> {
    try {
        const { stdout } = await run('ffprobe', [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height:format=duration',
            '-of', 'json',
            file,
        ], { maxBuffer: 1024 * 1024 })

        const parsed = JSON.parse(stdout)
        const stream = parsed.streams?.[0]
        const duration = Number(parsed.format?.duration)

        // No video stream at all: an audio file with a video extension, or a
        // container ffprobe could not make sense of. Not a video.
        if (!stream?.width || !stream?.height || !Number.isFinite(duration)) return null

        return { durationSec: duration, width: stream.width, height: stream.height }
    } catch {
        return null
    }
}

export async function processStill(staged: string, destNoExt: string): Promise<ProcessedStill> {
    const dest = `${destNoExt}.jpg`

    const info = await sharp(staged, { limitInputPixels: 300_000_000 })
        .rotate()                                  // honour EXIF orientation before resizing
        .resize({ ...STILL_BOX, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: STILL_QUALITY, mozjpeg: true })
        .toFile(dest)

    return { ext: 'jpg', width: info.width, height: info.height, bytes: statSync(dest).size }
}

export async function processVideo(staged: string, destNoExt: string): Promise<ProcessedVideo> {
    const probe = await probeVideo(staged)
    if (!probe) throw new Error('That file does not contain a video stream.')
    if (probe.durationSec > MAX_VIDEO_SECONDS) {
        throw new Error(`Clips must be under ${MAX_VIDEO_SECONDS / 60} minutes.`)
    }

    const dest = `${destNoExt}.mp4`

    await run('ffmpeg', [
        '-y', '-i', staged,
        '-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast',
        // -2 rather than -1 on the height: H.264 requires even dimensions, and
        // an odd height is a hard encoder failure rather than a warning.
        '-vf', "scale='min(1920,iw)':-2",
        '-c:a', 'aac', '-b:a', '128k',
        // Moves the moov atom to the front. Without it the browser must
        // download the entire file before it can play a frame.
        '-movflags', '+faststart',
        dest,
    ], { maxBuffer: 10 * 1024 * 1024 })

    await run('ffmpeg', [
        '-y', '-ss', '1', '-i', dest,
        '-frames:v', '1', '-q:v', '3',
        `${destNoExt}_poster.jpg`,
    ], { maxBuffer: 10 * 1024 * 1024 })

    const out = await probeVideo(dest)

    return {
        ext: 'mp4',
        width: out?.width ?? probe.width,
        height: out?.height ?? probe.height,
        durationSec: Math.round(probe.durationSec),
        bytes: statSync(dest).size,
    }
}
```

- [ ] **Step 7: Verify ffmpeg is reachable and the arguments work**

```bash
ffmpeg -version && ffprobe -version
```

If both print, the module will work locally. If not, note it and carry on — Task 14 is where video is actually exercised.

- [ ] **Step 8: Typecheck and commit**

```bash
cd apps/web && npx tsc --noEmit
cd /d/Projects/ASOT
git branch --show-current
git add dockerfile apps/web/lib/gallery/paths.ts apps/web/lib/gallery/paths.test.ts apps/web/lib/gallery/process.ts
git commit -m "feat(gallery): ffmpeg in the image, and the media processing module

Flat storage for new media is a security property: a media id is a hex
string this app generated, so resolving it is one regex rather than the
four user-supplied segments the legacy fetch route has to validate."
```

---

## Task 12: The transcode queue

**Files:**
- Create: `apps/web/lib/gallery/queue.ts`

**Interfaces:**
- Consumes: `processStill` / `processVideo` (Task 11), `paths` (Task 11), `Db.galleryMedia` (Task 8).
- Produces:
  ```ts
  export function enqueue(mediaId: string): void
  export async function sweepStranded(): Promise<number>
  ```
  Used by Task 14 (the submissions route enqueues) and Task 20 (the sweep runs at startup).

**Why in-process and concurrency 1.** This is one container. The work is minutes-scale, idempotent, and rare — a handful of clips after an operation, not a stream. A job server would be more infrastructure than the problem has.

**The two properties that matter.** A container restart mid-transcode must not strand documents at `processing` forever, and a *failed* transcode must still reach a reviewer rather than vanishing. Both are handled below; neither is optional.

- [ ] **Step 1: Write the module**

Create `apps/web/lib/gallery/queue.ts`:

```ts
import { ObjectId } from 'mongodb'
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'fs'
import path from 'path'

import Db from '@/lib/mongo'
import { MEDIA_DIR, STAGING_DIR, mediaKey, posterKey } from './paths'
import { processStill, processVideo } from './process'

/**
 * One transcode at a time, in this process.
 *
 * Not a job server, deliberately. This is a single container, the work is
 * minutes-scale and idempotent, and it arrives in bursts of a dozen after an
 * operation rather than as a stream. An in-memory array drained on a promise
 * chain is the whole mechanism.
 *
 * Concurrency is 1 because ffmpeg will happily saturate every core it is given,
 * and this process is also serving the site.
 *
 * Two properties are load-bearing:
 *
 *  - A failed transcode still reaches the review queue, carrying its error.
 *    An item that silently never appears anywhere is far worse than one a
 *    reviewer can look at and reject.
 *  - A restart mid-transcode does not strand documents at `processing`
 *    forever. `sweepStranded` runs at startup and either re-queues the work or
 *    hands it to a reviewer.
 */

const pending: string[] = []
let draining = false

export function enqueue(mediaId: string): void {
    pending.push(mediaId)
    if (!draining) void drain()
}

async function drain(): Promise<void> {
    draining = true
    try {
        for (let id = pending.shift(); id !== undefined; id = pending.shift()) {
            await processOne(id).catch(err => {
                // processOne handles its own failures; reaching here means the
                // failure handling itself failed, which must not stop the queue.
                console.error('[gallery/queue] unrecoverable while processing', id, err)
            })
        }
    } finally {
        draining = false
    }
}

async function processOne(id: string): Promise<void> {
    const _id = new ObjectId(id)
    const doc = await Db.galleryMedia.findOne({ _id })
    if (!doc || doc.status !== 'processing') return

    const staged = path.join(STAGING_DIR, id)

    if (!existsSync(staged)) {
        await fail(_id, 'The uploaded file went missing before it could be processed.')
        return
    }

    mkdirSync(MEDIA_DIR, { recursive: true })
    const destNoExt = path.join(MEDIA_DIR, id)

    try {
        if (doc.kind === 'video') {
            const out = await processVideo(staged, destNoExt)
            await Db.galleryMedia.updateOne({ _id }, {
                $set: {
                    status: 'pending',
                    storageKey: mediaKey(id, out.ext),
                    posterKey: posterKey(id),
                    width: out.width, height: out.height,
                    durationSec: out.durationSec, bytes: out.bytes,
                },
                $unset: { processingError: '' },
            })
        } else {
            const out = await processStill(staged, destNoExt)
            await Db.galleryMedia.updateOne({ _id }, {
                $set: {
                    status: 'pending',
                    storageKey: mediaKey(id, out.ext),
                    width: out.width, height: out.height, bytes: out.bytes,
                },
                $unset: { processingError: '' },
            })
        }
    } catch (err) {
        await fail(_id, err instanceof Error ? err.message : 'Processing failed.')
        return
    } finally {
        // The staged original has served its purpose either way. Leaving it
        // would grow the staging directory without bound.
        try { unlinkSync(staged) } catch { /* already gone */ }
    }
}

/** A failure still lands in the review queue, with its reason attached. */
async function fail(_id: ObjectId, message: string): Promise<void> {
    await Db.galleryMedia.updateOne({ _id }, { $set: { status: 'pending', processingError: message } })
}

/**
 * Called once at startup.
 *
 * Anything left at `processing` was interrupted by a restart. If its staged
 * original survived, the work can simply be redone; if it did not, there is
 * nothing to redo and a reviewer should see it rather than it sitting invisible
 * forever.
 */
export async function sweepStranded(): Promise<number> {
    const stranded = await Db.galleryMedia.find({ status: 'processing' }, { projection: { _id: 1 } }).toArray()

    for (const { _id } of stranded) {
        const id = _id.toString()
        if (existsSync(path.join(STAGING_DIR, id))) enqueue(id)
        else await fail(_id, 'Processing was interrupted and the upload could not be recovered. Ask the submitter to send it again.')
    }

    if (stranded.length) console.log(`[gallery/queue] swept ${stranded.length} interrupted item(s)`)
    return stranded.length
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd apps/web && npx tsc --noEmit
cd /d/Projects/ASOT
git branch --show-current
git add apps/web/lib/gallery/queue.ts
git commit -m "feat(gallery): a single-concurrency transcode queue

A failed transcode still reaches the review queue carrying its error -
an item that silently never appears anywhere is worse than one a
reviewer can look at and reject."
```

---

## Task 13: Serving media, with Range

**Files:**
- Create: `apps/web/app/api/gallery/media/[id]/route.ts`
- Create: `apps/web/app/api/gallery/media/[id]/poster/route.ts`

**Interfaces:**
- Consumes: `resolveStorageKey` (Task 11), `isPublic` (Task 6), `hasPermission`, `client.fetchMe`.
- Produces: `GET /api/gallery/media/{id}` and `GET /api/gallery/media/{id}/poster`, the URLs Task 10's route already emits.

**Range is not optional.** Without `Accept-Ranges` and `206 Partial Content`, video scrubbing does not work in any browser and Safari refuses to play the file at all. This is the single most likely thing to be skipped and the single most likely thing to be reported as "video is broken".

**Access.** `live` is public. `pending` and `processing` are visible to the item's own author and to anyone holding `gallery.review`; the review tab cannot show a preview otherwise. `rejected` and `hidden` are visible to nobody — their bytes are gone or deliberately pulled.

- [ ] **Step 1: Write the media route**

Create `apps/web/app/api/gallery/media/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { createReadStream, statSync } from 'fs'
import { Readable } from 'stream'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { resolveStorageKey } from '@/lib/gallery/paths'
import { isPublic } from '@/lib/gallery/status'

/**
 * Serving one piece of submitted media.
 *
 * Range support is the reason this is not four lines. A plain 200 with the
 * whole body makes video unscrubbable in every browser and unplayable in
 * Safari, which refuses to start a video the server will not serve a range of.
 * So a Range header gets a 206 and a slice, and everything advertises
 * Accept-Ranges so the browser knows it may ask.
 *
 * The body is streamed rather than read into a Buffer: a 60MB clip read whole
 * is 60MB of heap per concurrent viewer, and the gallery is a public page.
 */

const CONTENT_TYPES: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4',
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ObjectId.isValid(id)) return new NextResponse('Not found', { status: 404 })

    const doc = await Db.galleryMedia.findOne({ _id: new ObjectId(id) })
    if (!doc?.storageKey) return new NextResponse('Not found', { status: 404 })

    /* Unpublished media is visible to its author and to whoever reviews it —
       the review tab cannot show a preview otherwise. Rejected and hidden are
       visible to nobody: one has had its bytes deleted, the other was pulled
       on purpose. */
    if (!isPublic(doc.status)) {
        if (doc.status !== 'pending' && doc.status !== 'processing') return new NextResponse('Not found', { status: 404 })
        const me = await client.fetchMe().catch(() => null)
        const allowed = !!me && (me.id === doc.authorId || await hasPermission(me, 'gallery.review'))
        if (!allowed) return new NextResponse('Not found', { status: 404 })
    }

    const file = resolveStorageKey(doc.storageKey)
    if (!file) return new NextResponse('Not found', { status: 404 })

    let size: number
    try { size = statSync(file).size } catch { return new NextResponse('Not found', { status: 404 }) }

    const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

    /* Only live media is cached hard. A pending item can be re-processed or
       corrected, and an immutable cache entry would outlive the change. */
    const cacheControl = isPublic(doc.status)
        ? 'public, max-age=31536000, immutable'
        : 'private, no-store'

    const range = request.headers.get('range')
    const match = range?.match(/^bytes=(\d*)-(\d*)$/)

    if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0
        const end = match[2] ? parseInt(match[2], 10) : size - 1

        // An unsatisfiable range gets 416 with the real size, which is how a
        // player recovers rather than failing outright.
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
            return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
        }

        const last = Math.min(end, size - 1)
        const stream = createReadStream(file, { start, end: last })

        return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
            status: 206,
            headers: {
                'Content-Type': contentType,
                'Content-Length': String(last - start + 1),
                'Content-Range': `bytes ${start}-${last}/${size}`,
                'Accept-Ranges': 'bytes',
                'Cache-Control': cacheControl,
            },
        })
    }

    return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, {
        status: 200,
        headers: {
            'Content-Type': contentType,
            'Content-Length': String(size),
            // Advertised even on a full response, or the browser never asks
            // for a range in the first place.
            'Accept-Ranges': 'bytes',
            'Cache-Control': cacheControl,
        },
    })
}
```

- [ ] **Step 2: Write the poster route**

Create `apps/web/app/api/gallery/media/[id]/poster/route.ts` — the same access rules, but always a whole small JPEG, so no Range handling:

```ts
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { readFileSync } from 'fs'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { resolveStorageKey } from '@/lib/gallery/paths'
import { isPublic } from '@/lib/gallery/status'

/** A video's or an embed's still frame. Always a small JPEG, so it is served
 *  whole — Range would be ceremony over a few dozen kilobytes. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ObjectId.isValid(id)) return new NextResponse('Not found', { status: 404 })

    const doc = await Db.galleryMedia.findOne({ _id: new ObjectId(id) })
    if (!doc?.posterKey) return new NextResponse('Not found', { status: 404 })

    if (!isPublic(doc.status)) {
        if (doc.status !== 'pending' && doc.status !== 'processing') return new NextResponse('Not found', { status: 404 })
        const me = await client.fetchMe().catch(() => null)
        const allowed = !!me && (me.id === doc.authorId || await hasPermission(me, 'gallery.review'))
        if (!allowed) return new NextResponse('Not found', { status: 404 })
    }

    const file = resolveStorageKey(doc.posterKey)
    if (!file) return new NextResponse('Not found', { status: 404 })

    try {
        return new NextResponse(readFileSync(file) as BodyInit, {
            status: 200,
            headers: {
                'Content-Type': 'image/jpeg',
                'Cache-Control': isPublic(doc.status) ? 'public, max-age=31536000, immutable' : 'private, no-store',
            },
        })
    } catch {
        return new NextResponse('Not found', { status: 404 })
    }
}
```

- [ ] **Step 3: Typecheck and commit**

```bash
cd apps/web && npx tsc --noEmit
cd /d/Projects/ASOT
git branch --show-current
git add "apps/web/app/api/gallery/media"
git commit -m "feat(gallery): serve submitted media, with Range

Without 206 and Accept-Ranges video is unscrubbable everywhere and
unplayable in Safari. Streamed, not buffered - a 60MB clip read whole is
60MB of heap per concurrent viewer on a public page."
```

---

## Task 14: The submissions API

**Files:**
- Create: `apps/web/lib/gallery/poster.ts`
- Create: `apps/web/app/api/gallery/submissions/route.ts` (POST — one item per request)
- Create: `apps/web/app/api/gallery/submissions/status/route.ts` (GET — batch progress)
- Create: `apps/web/app/api/gallery/tags/route.ts` (GET public, POST/PATCH `gallery.tags`)

**Interfaces:**
- Consumes: `limits` (Task 4), `embeds` (Task 3), `paths` / `process` (Task 11), `enqueue` (Task 12).
- Produces:
  - `POST /api/gallery/submissions` → `{ id, status }`. Body is `multipart/form-data` with `file` plus `batchId`, `caption`, `tags` (JSON array), `operationId` (or the literal `unknown`); **or** JSON with `embedUrl` instead of a file.
  - `GET /api/gallery/submissions/status?batch=<id>` → `{ items: { id, status, processingError }[] }`.
  - `poster.ts`: `export async function fetchEmbedPoster(media: GalleryMedia): Promise<boolean>`
  Used by Tasks 15-16 (submit page) and Task 17 (review tab).

**One item per request, not one submission per request.** Progress is per-file, and a 500MB body carrying twenty files has no meaningful progress and no partial retry. `batchId` is generated client-side and ties them together.

- [ ] **Step 1: Write `poster.ts`**

```ts
import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { ObjectId } from 'mongodb'

import Db from '@/lib/mongo'
import { MEDIA_DIR, posterKey } from './paths'

/**
 * An embed's thumbnail, cached locally.
 *
 * Fetched once at approval and written beside the rest of the media so the grid
 * is uniform and the page does not hotlink a third party — which also means no
 * `remotePatterns` entry in next.config.ts and no broken tiles the day a
 * provider changes its CDN.
 *
 * YouTube gives its thumbnail away at a predictable URL. Twitch does not: its
 * public oEmbed is gone and real clip thumbnails need Helix credentials. So
 * Twitch degrades — with TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET set it gets
 * a real thumbnail, and without them a generated placeholder. Everything else
 * about a Twitch item works either way, which is why this is a graceful
 * degradation and not a configuration requirement.
 */

async function firstOk(urls: string[]): Promise<Buffer | null> {
    for (const url of urls) {
        try {
            const res = await fetch(url)
            // YouTube answers 404 for maxresdefault on videos that never had
            // one, so a failure here is expected and means "try the next size".
            if (!res.ok) continue
            const buf = Buffer.from(await res.arrayBuffer())
            if (buf.byteLength > 1024) return buf
        } catch { /* try the next */ }
    }
    return null
}

async function twitchHelixThumbnail(media: GalleryMedia): Promise<Buffer | null> {
    const id = process.env.TWITCH_CLIENT_ID
    const secret = process.env.TWITCH_CLIENT_SECRET
    if (!id || !secret || !media.embedId) return null

    try {
        const tokenRes = await fetch(
            `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
            { method: 'POST' },
        )
        if (!tokenRes.ok) return null
        const { access_token } = await tokenRes.json()

        const endpoint = media.embedKind === 'clip'
            ? `https://api.twitch.tv/helix/clips?id=${media.embedId}`
            : `https://api.twitch.tv/helix/videos?id=${media.embedId}`

        const res = await fetch(endpoint, { headers: { 'Client-Id': id, Authorization: `Bearer ${access_token}` } })
        if (!res.ok) return null

        const url: string | undefined = (await res.json()).data?.[0]?.thumbnail_url
        if (!url) return null

        // Helix returns a template with %{width} placeholders on videos.
        return await firstOk([url.replace('%{width}', '1280').replace('%{height}', '720')])
    } catch {
        return null
    }
}

/** A last resort so an embed tile is never blank. @napi-rs/canvas is already a
 *  dependency — it is what renders milpac images. */
async function placeholder(media: GalleryMedia): Promise<Buffer> {
    const { createCanvas } = await import('@napi-rs/canvas')
    const canvas = createCanvas(1280, 720)
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, 1280, 720)
    ctx.fillStyle = media.source === 'twitch' ? '#9146ff' : '#ff0000'
    ctx.fillRect(0, 660, 1280, 60)

    ctx.fillStyle = '#ededed'
    ctx.font = 'bold 44px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(media.source === 'twitch' ? 'Twitch clip' : 'YouTube video', 640, 340)

    if (media.caption) {
        ctx.font = '28px sans-serif'
        ctx.fillStyle = 'rgba(237,237,237,0.65)'
        ctx.fillText(media.caption.slice(0, 60), 640, 400)
    }

    return canvas.toBuffer('image/jpeg')
}

/** Writes the poster and sets `posterKey`. Returns whether a real provider
 *  thumbnail was obtained, as opposed to a placeholder. */
export async function fetchEmbedPoster(media: GalleryMedia): Promise<boolean> {
    let buf: Buffer | null = null
    let real = false

    if (media.source === 'youtube' && media.embedId) {
        buf = await firstOk([
            `https://i.ytimg.com/vi/${media.embedId}/maxresdefault.jpg`,
            `https://i.ytimg.com/vi/${media.embedId}/hqdefault.jpg`,
        ])
        real = !!buf
    } else if (media.source === 'twitch') {
        buf = await twitchHelixThumbnail(media)
        real = !!buf
    }

    if (!buf) buf = await placeholder(media)

    const id = media._id.toString()
    mkdirSync(MEDIA_DIR, { recursive: true })
    writeFileSync(path.join(MEDIA_DIR, `${id}_poster.jpg`), buf)
    await Db.galleryMedia.updateOne({ _id: new ObjectId(id) }, { $set: { posterKey: posterKey(id) } })

    return real
}
```

- [ ] **Step 2: Write the submission route**

Create `apps/web/app/api/gallery/submissions/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { STAGING_DIR } from '@/lib/gallery/paths'
import { enqueue } from '@/lib/gallery/queue'
import { checkFile, kindForMime } from '@/lib/gallery/limits'
import { parseEmbedUrl } from '@/lib/gallery/embeds'
import { splitOperation } from '@/lib/gallery/naming'

/**
 * One submitted item per request.
 *
 * Not one submission per request, deliberately: progress is reported per file,
 * and a single 500MB body carrying twenty of them has no meaningful progress
 * bar and no way to retry just the one that failed. The client generates a
 * `batchId` and sends each item against it, which is what groups them for the
 * reviewer.
 *
 * The response returns as soon as the bytes are on disk. Transcoding happens
 * afterwards on the queue — a five-minute 1080p encode would hold this request
 * open past every proxy timeout, and it would make the upload bar sit at 100%
 * for minutes, which is worse than no bar at all.
 */

// A 500MB body needs longer than the platform default to arrive.
export const maxDuration = 300

/** Resolves the operation the submitter chose into the four fields that have to
 *  agree with each other. `'unknown'` leaves every one of them absent, which is
 *  what makes an undated item sort into its own group rather than lying about
 *  a date. */
async function resolveOperation(operationId: string | null) {
    if (!operationId || operationId === 'unknown') return {}

    if (!ObjectId.isValid(operationId)) return {}
    const op = await Db.operations.findOne(
        { _id: new ObjectId(operationId) },
        { projection: { title: 1, date: 1 } },
    )
    if (!op) return {}

    const { label } = splitOperation(op.title ?? '')
    return {
        operationId: op._id,
        operation: op.title ?? undefined,
        opLabel: label,
        year: op.date ? String(new Date(op.date).getFullYear()) : undefined,
        takenAt: op.date ? new Date(op.date) : null,
    }
}

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!await hasPermission(me, 'gallery.submit')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const contentType = request.headers.get('content-type') ?? ''
    const isEmbed = contentType.includes('application/json')

    const form = isEmbed ? null : await request.formData()
    const body = isEmbed ? await request.json().catch(() => ({})) : null

    const field = (name: string): string | null =>
        isEmbed ? (body?.[name] ?? null) : ((form!.get(name) as string) ?? null)

    const batchId = field('batchId')
    if (!batchId || !/^[a-z0-9-]{8,64}$/.test(batchId)) {
        return NextResponse.json({ error: 'A batch id is required' }, { status: 400 })
    }

    const caption = (field('caption') ?? '').trim().slice(0, 500) || undefined

    let tags: string[] = []
    try {
        const raw = isEmbed ? body?.tags : JSON.parse(field('tags') ?? '[]')
        if (Array.isArray(raw)) tags = raw.filter((t): t is string => typeof t === 'string').slice(0, 10)
    } catch { /* an unparseable tag list is no tags, not an error */ }

    // Only slugs that actually exist, so a hand-crafted request cannot invent
    // a tag that then shows up in the facet rail.
    if (tags.length) {
        const known = await Db.galleryTags.find({ slug: { $in: tags } }, { projection: { slug: 1 } }).toArray()
        tags = known.map(t => t.slug)
    }

    const operation = await resolveOperation(field('operationId'))

    const common = {
        ...operation,
        takenAt: (operation as { takenAt?: Date | null }).takenAt ?? null,
        authorId: me.id,
        authorName: me.guild?.displayName || me.globalName || me.username,
        caption,
        tags,
        batchId,
        up: 0,
        down: 0,
        createdAt: new Date(),
    }

    // ── An embed: nothing to upload, nothing to transcode ────────────────────
    if (isEmbed) {
        const parsed = parseEmbedUrl(String(body?.embedUrl ?? ''))
        if (!parsed) {
            return NextResponse.json({ error: 'That link is not a YouTube or Twitch video.' }, { status: 400 })
        }

        const doc = {
            ...common,
            kind: 'video' as const,
            source: parsed.provider,
            embedId: parsed.id,
            embedKind: parsed.kind,
            embedUrl: parsed.canonicalUrl,
            status: 'pending' as const,
        }
        const { insertedId } = await Db.galleryMedia.insertOne(doc as GalleryMedia)
        return NextResponse.json({ id: insertedId.toString(), status: 'pending' })
    }

    // ── A file ───────────────────────────────────────────────────────────────
    const file = form!.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const kind = kindForMime(file.type)
    // Duration is not checked here: the browser already refused an over-length
    // clip before uploading, and ffprobe checks it again before spending any
    // CPU on the encode. Re-deriving it from bytes would be a guess.
    const failure = checkFile({ mime: file.type, bytes: file.size })
    if (!kind || failure) {
        return NextResponse.json({ error: failure?.message ?? 'That file type is not accepted.' }, { status: 400 })
    }

    const doc = { ...common, kind, source: 'upload' as const, status: 'processing' as const }
    const { insertedId } = await Db.galleryMedia.insertOne(doc as GalleryMedia)
    const id = insertedId.toString()

    /* Staged under the document's own id and with no extension. The name is
       therefore never anything a member chose, which takes the whole class of
       filename problems off the table. */
    mkdirSync(STAGING_DIR, { recursive: true })
    writeFileSync(path.join(STAGING_DIR, id), Buffer.from(await file.arrayBuffer()))

    enqueue(id)

    return NextResponse.json({ id, status: 'processing' })
}
```

- [ ] **Step 3: Write the status route**

Create `apps/web/app/api/gallery/submissions/status/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'

/** What the submit page's monitor polls while the queue works through a batch.
 *  Scoped to the caller's own submissions, so a guessed batch id reveals
 *  nothing. */
export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const batch = new URL(request.url).searchParams.get('batch')
    if (!batch) return NextResponse.json({ error: 'batch is required' }, { status: 400 })

    const docs = await Db.galleryMedia
        .find({ batchId: batch, authorId: me.id }, { projection: { status: 1, processingError: 1 } })
        .toArray()

    return NextResponse.json({
        items: docs.map(d => ({
            id: d._id.toString(),
            status: d.status,
            processingError: d.processingError ?? null,
        })),
    })
}
```

- [ ] **Step 4: Write the tags route**

Create `apps/web/app/api/gallery/tags/route.ts` — `GET` is public (the submit form and the facet rail both need the vocabulary); `POST` and `PATCH` require `gallery.tags`.

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

const slugify = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function canManage() {
    const me = await client.fetchMe().catch(() => null)
    return !!me && await hasPermission(me, 'gallery.tags')
}

/** Public: the facet rail and the submit form both need the vocabulary, and
 *  the gallery is a public page. Retired tags are included only for a manager,
 *  who has to see them to bring one back. */
export async function GET() {
    const all = await canManage()
    const tags = await Db.galleryTags
        .find(all ? {} : { retired: false })
        .sort({ order: 1 })
        .toArray()

    return NextResponse.json({
        tags: tags.map(t => ({ id: t._id.toString(), slug: t.slug, label: t.label, order: t.order, retired: t.retired })),
    })
}

export async function POST(request: NextRequest) {
    if (!await canManage()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { label } = await request.json().catch(() => ({}))
    const trimmed = String(label ?? '').trim().slice(0, 40)
    if (!trimmed) return NextResponse.json({ error: 'A label is required' }, { status: 400 })

    const slug = slugify(trimmed)
    if (!slug) return NextResponse.json({ error: 'That label has no usable characters' }, { status: 400 })

    // A slug that already exists is un-retired rather than duplicated: the
    // unique index would refuse the insert anyway, and bringing one back is the
    // likely intent.
    const existing = await Db.galleryTags.findOne({ slug })
    if (existing) {
        await Db.galleryTags.updateOne({ _id: existing._id }, { $set: { retired: false, label: trimmed } })
        return NextResponse.json({ id: existing._id.toString(), slug, revived: true })
    }

    const order = await Db.galleryTags.countDocuments()
    const { insertedId } = await Db.galleryTags.insertOne({ slug, label: trimmed, order, retired: false } as GalleryTag)
    return NextResponse.json({ id: insertedId.toString(), slug })
}

/** Rename, reorder or retire. The slug never changes — media carry it, and a
 *  rename that cascaded across every document is exactly what retiring exists
 *  to avoid. */
export async function PATCH(request: NextRequest) {
    if (!await canManage()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, label, order, retired } = await request.json().catch(() => ({}))
    if (!ObjectId.isValid(String(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const set: Partial<GalleryTag> = {}
    if (typeof label === 'string' && label.trim()) set.label = label.trim().slice(0, 40)
    if (typeof order === 'number') set.order = order
    if (typeof retired === 'boolean') set.retired = retired
    if (!Object.keys(set).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

    await Db.galleryTags.updateOne({ _id: new ObjectId(String(id)) }, { $set: set })
    return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Document the optional Twitch credentials**

In the root `.env.template`, in the apps/web section:

```
# Optional, apps/web only. Without these a submitted Twitch clip gets a
# generated placeholder thumbnail instead of the real one — everything else
# about it works. Create an application at https://dev.twitch.tv/console/apps.
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
```

- [ ] **Step 6: Typecheck, then exercise the pipeline by hand**

```bash
cd apps/web && npx tsc --noEmit
```

Then, with the dev server running and `gallery.submit` granted to yourself in the Roles Manager (`/dashboard/orbat` → Roles Manager), POST a real JPEG and a real short MP4 with `curl` or the browser console, and confirm:
- a `gallery_media` document appears at `processing`, then flips to `pending`
- a resized `.jpg` / a transcoded `.mp4` plus `_poster.jpg` land in `storage/gallery/media/`
- the staging file is gone afterwards
- `GET /api/gallery/submissions/status?batch=...` reports them
- a deliberately corrupt file ends at `pending` with a `processingError`, not stuck at `processing`

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add apps/web/lib/gallery/poster.ts "apps/web/app/api/gallery/submissions" "apps/web/app/api/gallery/tags" .env.template
git commit -m "feat(gallery): submission, status and tag APIs

One item per request: progress is per file, and a single 500MB body
carrying twenty of them has no meaningful progress and no partial retry.
The response returns when the bytes land; transcoding is the queue's."
```

---

## Task 15: The submit page

**Files:**
- Create: `apps/web/app/(landing)/gallery/submit/page.tsx` (server gate)
- Create: `apps/web/app/(landing)/gallery/submit/SubmitClient.tsx` (composer + monitor)
- Create: `apps/web/app/(landing)/gallery/submit/_components/ItemCard.tsx`
- Create: `apps/web/app/(landing)/gallery/submit/upload.ts` (the XHR uploader)
- Create: `apps/web/app/(landing)/gallery/submit/upload.test.ts`
- Create: `apps/web/app/api/gallery/operations/route.ts` (the operation picker's list)
- Modify: `apps/web/styles/gallery.module.css` (submit-page classes)

**Interfaces:**
- Consumes: `limits` (Task 4), `parseEmbedUrl` (Task 3), the submission APIs (Task 14).
- Produces: `/gallery/submit`. Task 18 adds the button that links here.

**The one genuinely non-obvious piece is the uploader.** `fetch` cannot report upload progress — there is no hook for bytes sent — so a progress bar requires `XMLHttpRequest`. That is not a stylistic choice and must not be "modernised" away.

- [ ] **Step 1: Write the failing uploader test**

`upload.ts` holds the pure orchestration — queueing, concurrency, per-item state — with the XHR call injected, so the state machine is testable without a network.

Create `apps/web/app/(landing)/gallery/submit/upload.test.ts`:

```ts
import { describe, test, expect, vi } from 'vitest'
import { runUploads, type UploadJob } from './upload'

const job = (id: string): UploadJob => ({ localId: id, body: new FormData() })

describe('runUploads', () => {
    test('reports progress and completion per item', async () => {
        const events: string[] = []
        await runUploads({
            jobs: [job('a')],
            concurrency: 1,
            send: async (_j, onProgress) => { onProgress(0.5); onProgress(1); return { id: 'server-a' } },
            onChange: (localId, state) => events.push(`${localId}:${state.phase}:${Math.round(state.progress * 100)}`),
        })
        expect(events).toEqual(['a:uploading:0', 'a:uploading:50', 'a:uploading:100', 'a:processing:100'])
    })

    test('runs at most `concurrency` at once', async () => {
        let inFlight = 0
        let peak = 0
        await runUploads({
            jobs: ['a', 'b', 'c', 'd'].map(job),
            concurrency: 2,
            send: async () => {
                inFlight++; peak = Math.max(peak, inFlight)
                await new Promise(r => setTimeout(r, 5))
                inFlight--
                return { id: 'x' }
            },
            onChange: () => {},
        })
        expect(peak).toBe(2)
    })

    test('one failure does not stop the rest', async () => {
        const finished: Record<string, string> = {}
        await runUploads({
            jobs: ['a', 'b'].map(job),
            concurrency: 1,
            send: async j => {
                if (j.localId === 'a') throw new Error('network died')
                return { id: 'server-b' }
            },
            onChange: (localId, state) => { finished[localId] = state.phase },
        })
        expect(finished.a).toBe('failed')
        expect(finished.b).toBe('processing')
    })

    test('a failed item carries its message, for the Retry row', async () => {
        let message = ''
        await runUploads({
            jobs: [job('a')],
            concurrency: 1,
            send: async () => { throw new Error('Photos must be under 20MB.') },
            onChange: (_id, state) => { if (state.error) message = state.error },
        })
        expect(message).toBe('Photos must be under 20MB.')
    })

    test('returns the server ids, so the monitor knows what to poll', async () => {
        const result = await runUploads({
            jobs: ['a', 'b'].map(job),
            concurrency: 2,
            send: async j => ({ id: `server-${j.localId}` }),
            onChange: () => {},
        })
        expect(result.uploaded.sort()).toEqual(['server-a', 'server-b'])
        expect(result.failed).toEqual([])
    })
})
```

Note this test lives under `app/` — `vitest.config.ts`'s include pattern covers `app/**/*.test.ts`, and `upload.ts` must therefore import nothing that pulls in React or the DOM.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && npx vitest run "app/(landing)/gallery/submit/upload.test.ts"`
Expected: FAIL — import unresolved.

- [ ] **Step 3: Write `upload.ts`**

```ts
/**
 * Uploading a batch, with a bar per item.
 *
 * `XMLHttpRequest` and not `fetch`, and this is not nostalgia: fetch has no
 * upload-progress event at all, so a bar built on it can only ever show
 * "started" and "finished". A member sending a 400MB clip over a domestic
 * connection needs to see it moving.
 *
 * Two at a time. One is needlessly slow on twenty small screenshots; more than
 * two competes with itself for the same upstream bandwidth and makes every
 * individual bar crawl, which reads as broken even though the total is the
 * same.
 *
 * The orchestration is kept apart from the XHR so the state machine — which is
 * where the bugs live — can be tested without a network.
 */

export type UploadPhase = 'queued' | 'uploading' | 'processing' | 'failed'

export type UploadState = { phase: UploadPhase, progress: number, error?: string }

export type UploadJob = { localId: string, body: FormData | { json: unknown } }

export type SendFn = (
    job: UploadJob,
    onProgress: (fraction: number) => void,
) => Promise<{ id: string }>

export async function runUploads(opts: {
    jobs: UploadJob[]
    concurrency: number
    send: SendFn
    onChange: (localId: string, state: UploadState) => void
}): Promise<{ uploaded: string[], failed: string[] }> {
    const { jobs, concurrency, send, onChange } = opts
    const uploaded: string[] = []
    const failed: string[] = []

    const queue = [...jobs]

    async function worker() {
        for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
            onChange(job.localId, { phase: 'uploading', progress: 0 })
            try {
                const { id } = await send(job, fraction => {
                    onChange(job!.localId, { phase: 'uploading', progress: fraction })
                })
                uploaded.push(id)
                // The bytes have landed; the server is now transcoding. The
                // monitor polls the status route from here.
                onChange(job.localId, { phase: 'processing', progress: 1 })
            } catch (err) {
                failed.push(job.localId)
                onChange(job.localId, {
                    phase: 'failed',
                    progress: 0,
                    error: err instanceof Error ? err.message : 'Upload failed.',
                })
            }
        }
    }

    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))
    return { uploaded, failed }
}

/** The real sender. Separated from `runUploads` so the orchestration above can
 *  be exercised without a network. */
export const sendOverXhr: SendFn = (job, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/gallery/submissions')

    // The only reason this is not fetch.
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total) }

    xhr.onload = () => {
        let parsed: { id?: string, error?: string } = {}
        try { parsed = JSON.parse(xhr.responseText) } catch { /* handled below */ }
        if (xhr.status >= 200 && xhr.status < 300 && parsed.id) resolve({ id: parsed.id })
        else reject(new Error(parsed.error ?? `Upload failed (${xhr.status}).`))
    }
    xhr.onerror = () => reject(new Error('The connection dropped during the upload.'))
    xhr.onabort = () => reject(new Error('Upload cancelled.'))

    if (job.body instanceof FormData) {
        xhr.send(job.body)
    } else {
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.send(JSON.stringify(job.body.json))
    }
})
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd apps/web && npx vitest run "app/(landing)/gallery/submit/upload.test.ts"`
Expected: PASS, 5 tests.

- [ ] **Step 5: The operations list route**

Create `apps/web/app/api/gallery/operations/route.ts` — the picker needs id, title and date, most recent first, and nothing else:

```ts
import { NextResponse } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

/** The operation picker's list. Behind `gallery.submit` because it is only
 *  ever used by the submit form, and there is no reason to publish the
 *  operations table to anyone who wanders past. */
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !await hasPermission(me, 'gallery.submit')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const operations = await Db.operations
        .find({ deletedAt: { $exists: false } }, { projection: { title: 1, date: 1 } })
        .sort({ date: -1 })
        .limit(300)
        .toArray()

    return NextResponse.json({
        operations: operations.map(o => ({
            id: o._id.toString(),
            title: o.title ?? 'Untitled',
            date: o.date ? new Date(o.date).toISOString() : null,
        })),
    })
}
```

- [ ] **Step 6: The page gate**

Create `apps/web/app/(landing)/gallery/submit/page.tsx`:

```tsx
import { redirect } from 'next/navigation'

import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import SubmitClient from './SubmitClient'

/**
 * Gated on `gallery.submit`, which has no Discord-role fallback and no legacy
 * arm — so until somebody grants it in the Roles Manager this redirects
 * everybody, including staff. That is the intended behaviour; see the key's
 * own comment in lib/permissions.ts.
 */
export default async function Page() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!await hasPermission(me, 'gallery.submit')) redirect('/gallery')

    return <SubmitClient authorName={me.guild?.displayName || me.globalName || me.username} />
}
```

- [ ] **Step 7: The composer and monitor**

Create `apps/web/app/(landing)/gallery/submit/SubmitClient.tsx`. Structure, with the parts that carry real decisions written out:

```tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import Button from '@/components/ui/Button'
import { ACCEPT_ATTRIBUTE, MAX_ITEMS_PER_SUBMISSION, checkFile, checkItemCount, kindForMime } from '@/lib/gallery/limits'
import { parseEmbedUrl, type ParsedEmbed } from '@/lib/gallery/embeds'
import { runUploads, sendOverXhr, type UploadState } from './upload'
import ItemCard from './_components/ItemCard'
import s from '@/styles/gallery.module.css'

type Draft = {
    localId: string
    file?: File
    embed?: ParsedEmbed
    /** Object URL for a still, a canvas-grabbed frame for a video, a provider
     *  thumbnail for an embed. Null until it resolves. */
    thumb: string | null
    caption: string
    tags: string[]
    /** Overrides the batch operation for this one item. */
    operationId: string | null
    durationSec?: number
}

type Operation = { id: string, title: string, date: string | null }
type Tag = { slug: string, label: string }

/**
 * Reads a video's duration and first frame in the browser.
 *
 * The duration is why this exists: refusing a twelve-minute clip here costs the
 * member nothing, and refusing it after 400MB has crossed their connection
 * costs them the upload. The frame is a bonus — it gives the card a thumbnail
 * without waiting for the server to make a poster.
 */
function readVideo(file: File): Promise<{ durationSec: number, thumb: string | null }> {
    return new Promise(resolve => {
        const video = document.createElement('video')
        video.preload = 'metadata'
        video.muted = true
        video.src = URL.createObjectURL(file)

        const bail = () => resolve({ durationSec: 0, thumb: null })
        video.onerror = bail

        video.onloadedmetadata = () => {
            const durationSec = Number.isFinite(video.duration) ? video.duration : 0
            // Seek a second in: frame zero of a game capture is very often a
            // black loading screen.
            video.currentTime = Math.min(1, durationSec / 2)
            video.onseeked = () => {
                try {
                    const canvas = document.createElement('canvas')
                    canvas.width = video.videoWidth
                    canvas.height = video.videoHeight
                    canvas.getContext('2d')!.drawImage(video, 0, 0)
                    resolve({ durationSec, thumb: canvas.toDataURL('image/jpeg', 0.6) })
                } catch {
                    resolve({ durationSec, thumb: null })
                }
            }
        }
    })
}
```

The component body:

- **State:** `drafts: Draft[]`, `operationId: string | null` (the batch default), `tags: string[]` (batch default), `phase: 'compose' | 'uploading' | 'done'`, `progress: Record<string, UploadState>`, `serverIds: string[]`.
- **On mount:** fetch `/api/gallery/operations` and `/api/gallery/tags`. Preselect the most recent operation whose `date` is in the past — that is the "display most recent as default" behaviour, and filtering to past dates stops an upcoming operation being the default.
- **`addFiles(files: FileList)`:** run `checkItemCount(drafts.length + files.length)` first and surface the failure without adding anything. Then per file: `kindForMime`, `checkFile`, and for video `await readVideo` before the second `checkFile` that includes `durationSec`. Rejected files are listed with their reason rather than silently dropped.
- **`addEmbed(url: string)`:** `parseEmbedUrl`; on null show *"That link is not a YouTube or Twitch video."* and keep the text so it can be corrected.
- **Submit:** generate `batchId` with `crypto.randomUUID()`, build a `FormData` per file draft (`file`, `batchId`, `caption`, `tags` as JSON, `operationId` — the draft's override or the batch default or the string `unknown`) and a `{ json: {...} }` body per embed draft, then `runUploads({ jobs, concurrency: 2, send: sendOverXhr, onChange })`.
- **Monitor:** once `phase === 'uploading'`, poll `/api/gallery/submissions/status?batch=` every 2s. Stop when no item is `processing`. Merge the polled status over the local upload state so a row reads *Uploading 62% → Processing → Queued for review*, and *Needs another look* when `processingError` is set.
- **Retry:** a failed row re-sends only its own job.
- **Done:** a summary — *"N items are with J5 for review."* — plus a Back to gallery link and a Submit more action that resets to `compose`.

`ItemCard.tsx` renders one draft: the thumbnail (or a provider mark), a caption input (`maxLength={500}`, placeholder *"What's happening here?"*), the tag chips, and an operation override select defaulting to *"Same as batch"*. It also carries a remove button.

Add the classes this uses to `styles/gallery.module.css`, following the file's existing naming (short, lowercase, e.g. `.subPage`, `.dropzone`, `.dropzoneOver`, `.itemCard`, `.itemThumb`, `.bar`, `.barFill`, `.rowState`). Match the surrounding dark palette — `var(--line-2)`, `var(--txt-3)`, `var(--red)` are already in use throughout.

- [ ] **Step 8: Verify by hand**

Grant yourself `gallery.submit` in the Roles Manager, then at `/gallery/submit`:
- drop five images and one short MP4 → six cards, video card shows a grabbed frame and a duration
- paste a YouTube link and a Twitch clip link → two more cards with provider thumbnails
- paste `https://vimeo.com/123` → refused with the two-provider message, text preserved
- try a 21st item → refused, naming 20
- try a clip over five minutes → refused before any upload starts
- submit → per-row bars move, then Processing, then Queued for review
- kill the dev server mid-upload → the failed row offers Retry

- [ ] **Step 9: Lint, typecheck, commit**

```bash
cd apps/web && npm run lint && npx tsc --noEmit
cd /d/Projects/ASOT
git branch --show-current
git add "apps/web/app/(landing)/gallery/submit" "apps/web/app/api/gallery/operations" apps/web/styles/gallery.module.css
git commit -m "feat(gallery): the submission page

XMLHttpRequest and not fetch, because fetch has no upload-progress event
at all and a bar built on it can only show started and finished. Video
duration is read in the browser so an over-length clip is refused before
400MB crosses the member's connection."
```

---

## Task 16: Voting

**Files:**
- Create: `apps/web/app/api/gallery/vote/route.ts`
- Create: `apps/web/app/(landing)/gallery/_components/VoteBar.tsx`
- Modify: `apps/web/styles/gallery.module.css`

**Interfaces:**
- Consumes: `voteDelta` (Task 5), `Db.galleryVotes` / `Db.galleryMedia` (Task 8).
- Produces: `PUT /api/gallery/vote` → `{ up, down, mine: 1 | -1 | null }`; `<VoteBar mediaId up down mine onChange />`. Used by Task 18 (lightbox and tile).

**Follow the existing pattern.** `app/api/loadouts/[id]/rating/route.ts` solves this exact problem and documents a bug worth not repeating: it applies the delta in a **single aggregation-pipeline update**, so the counters are derived inside the same write that changes them. A read-then-write let two concurrent raters permanently desync the count. Do the same here.

- [ ] **Step 1: Read the precedent**

Run: `sed -n '1,60p' apps/web/app/api/loadouts/\[id\]/rating/route.ts`

- [ ] **Step 2: Write the route**

Create `apps/web/app/api/gallery/vote/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { voteDelta, type VoteValue } from '@/lib/gallery/votes'

/**
 * What the unit thinks of a photograph.
 *
 * Voting is not a permission key — it is "any authenticated member", the same
 * bar as every other logged-in action on the public site. Guests see the bar
 * and are prompted to log in.
 *
 * The counters on gallery_media are denormalised so a grid of 48 tiles never
 * aggregates gallery_votes. That is only safe if the delta is applied in one
 * atomic write, which is why the update below is an aggregation pipeline rather
 * than a read followed by an $inc — the same fix
 * app/api/loadouts/[id]/rating/route.ts documents, where a read-then-write let
 * two concurrent raters permanently desync the count.
 *
 * `$max: [0, ...]` floors both counters, so a double-submitted withdrawal can
 * never drive one negative.
 */
export async function PUT(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Sign in to vote.' }, { status: 401 })

    const { mediaId, value } = await request.json().catch(() => ({}))
    if (!ObjectId.isValid(String(mediaId))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (value !== 1 && value !== -1 && value !== null) {
        return NextResponse.json({ error: 'A vote is 1, -1 or null' }, { status: 400 })
    }

    const _id = new ObjectId(String(mediaId))

    // `status: 'live'` is part of the query, not a check after it: unpublished
    // media is not addressable, and a 403 would confirm it exists.
    const media = await Db.galleryMedia.findOne({ _id, status: 'live' }, { projection: { _id: 1 } })
    if (!media) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    /* findOneAndDelete hands back the row it removed in the same operation that
       removes it, so the previous value comes from the write rather than from a
       read a moment earlier. */
    const removed = await Db.galleryVotes.findOneAndDelete({ mediaId: _id, userId: me.id })
    const previous = (removed?.value ?? null) as VoteValue | null

    // Clicking the vote you already hold withdraws it — the obvious meaning of
    // pressing an already-pressed button, and it saves a separate control.
    const next: VoteValue | null = value === null || value === previous ? null : (value as VoteValue)

    if (next !== null) {
        await Db.galleryVotes.insertOne({ mediaId: _id, userId: me.id, value: next, at: new Date() } as GalleryVote)
    }

    const delta = voteDelta(previous, next)

    const updated = await Db.galleryMedia.findOneAndUpdate(
        { _id },
        [{
            $set: {
                up: { $max: [0, { $add: [{ $ifNull: ['$up', 0] }, delta.up] }] },
                down: { $max: [0, { $add: [{ $ifNull: ['$down', 0] }, delta.down] }] },
            },
        }],
        { returnDocument: 'after', projection: { up: 1, down: 1 } },
    )

    return NextResponse.json({ up: updated?.up ?? 0, down: updated?.down ?? 0, mine: next })
}
```

- [ ] **Step 3: A route for "what did I vote on"**

The gallery has to render the member's own votes. Add a `GET` to the same file:

```ts
/** The caller's own votes, so the gallery can show which button is pressed.
 *  One request for the whole page rather than one per tile. */
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ votes: {} })

    const votes = await Db.galleryVotes.find({ userId: me.id }).toArray()
    return NextResponse.json({
        votes: Object.fromEntries(votes.map(v => [v.mediaId.toString(), v.value])),
    })
}
```

- [ ] **Step 4: The component**

Create `apps/web/app/(landing)/gallery/_components/VoteBar.tsx`:

```tsx
'use client'

import React, { useState } from 'react'
import s from '@/styles/gallery.module.css'

/**
 * Two buttons and a proportion.
 *
 * Optimistic: the counts move on click and are replaced by the server's answer
 * when it lands. A vote that fails rolls back rather than leaving the interface
 * claiming something the database does not agree with.
 *
 * A guest sees the bar — the score is public information — and gets a prompt on
 * click rather than a disabled button, which explains nothing.
 */
export default function VoteBar({ mediaId, up, down, mine, canVote, onChange, compact }: {
    mediaId: string
    up: number
    down: number
    mine: 1 | -1 | null
    canVote: boolean
    onChange: (next: { up: number, down: number, mine: 1 | -1 | null }) => void
    compact?: boolean
}) {
    const [busy, setBusy] = useState(false)
    const [prompt, setPrompt] = useState(false)

    const total = up + down
    const ratio = total ? up / total : 0

    async function cast(value: 1 | -1) {
        if (!canVote) { setPrompt(true); return }
        if (busy) return
        setBusy(true)

        const rollback = { up, down, mine }
        // Clicking the vote you hold withdraws it — the server agrees, this is
        // just the local guess at the same answer.
        const next = value === mine ? null : value
        const delta = (v: 1 | -1) => (next === v ? 1 : 0) - (mine === v ? 1 : 0)
        onChange({ up: up + delta(1), down: down + delta(-1), mine: next })

        try {
            const res = await fetch('/api/gallery/vote', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaId, value: next }),
            })
            if (!res.ok) throw new Error()
            onChange(await res.json())
        } catch {
            onChange(rollback)
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className={compact ? `${s.vote} ${s.voteCompact}` : s.vote}>
            <button type='button' className={mine === 1 ? s.voteOn : ''} onClick={() => cast(1)}
                aria-label='Thumbs up' aria-pressed={mine === 1}>▲ {up}</button>
            <button type='button' className={mine === -1 ? s.voteOn : ''} onClick={() => cast(-1)}
                aria-label='Thumbs down' aria-pressed={mine === -1}>▼ {down}</button>

            {/* A bar with nothing behind it would read as 0% rather than as
                "nobody has voted", so an unvoted item shows no bar at all. */}
            {total > 0 && (
                <div className={s.voteBar} title={`${up} up, ${down} down`}>
                    <div className={s.voteBarFill} style={{ width: `${Math.round(ratio * 100)}%` }} />
                </div>
            )}
            {total > 0 && <span className={s.voteN}>{total}</span>}

            {prompt && <span className={s.voteHint}>Sign in to vote</span>}
        </div>
    )
}
```

Replace the `▲`/`▼` glyphs with proper thumb icons added to the gallery's own `_components/icons.tsx`, matching how every other icon in that file is defined.

- [ ] **Step 5: Verify and commit**

Vote up, down, and click the same button again to withdraw. Reload — the pressed state persists. Open a private window — the bar shows and clicking prompts.

```bash
cd apps/web && npx tsc --noEmit
cd /d/Projects/ASOT
git branch --show-current
git add "apps/web/app/api/gallery/vote" "apps/web/app/(landing)/gallery/_components/VoteBar.tsx" "apps/web/app/(landing)/gallery/_components/icons.tsx" apps/web/styles/gallery.module.css
git commit -m "feat(gallery): thumbs up and down, with a ratio bar

One aggregation-pipeline update, not a read then an inc - the same fix
the loadout rating route documents, where read-then-write let two
concurrent raters permanently desync the count."
```

---

## Task 17: The J5 review tab and the tags tab

**Files:**
- Create: `apps/web/app/api/gallery/submissions/[id]/route.ts` (PATCH edit, POST accept, DELETE reject)
- Create: `apps/web/app/api/gallery/submissions/pending/route.ts` (GET the queue)
- Create: `apps/web/app/dashboard/j5/tabs/GallerySubmissionsTab.tsx`
- Create: `apps/web/app/dashboard/j5/tabs/GalleryTagsTab.tsx`
- Modify: `apps/web/app/dashboard/j5/J5Panel.tsx` (two tabs), `apps/web/app/dashboard/j5/page.tsx` (pass the two new permission flags)
- Modify: `apps/web/types/notification.d.ts` (two `NotificationType` members)

**Interfaces:**
- Consumes: `canTransition` (Task 6), `fetchEmbedPoster` (Task 14), `resolveOperation` logic (Task 14), `createNotification`.
- Produces: the review surface. Nothing else consumes it.

**Notification types.** `NotificationType` is a closed union in `apps/web/types/notification.d.ts`. Add `'gallery_submission_accepted'` and `'gallery_submission_rejected'` to it, or `createNotification` will not typecheck.

- [ ] **Step 1: The queue route**

Create `apps/web/app/api/gallery/submissions/pending/route.ts`. It returns everything at `pending`, oldest first, grouped client-side by `batchId`:

```ts
import { NextResponse } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !await hasPermission(me, 'gallery.review')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const docs = await Db.galleryMedia.find({ status: 'pending' }).sort({ createdAt: 1 }).toArray()

    return NextResponse.json({
        items: docs.map(d => ({
            id: d._id.toString(),
            kind: d.kind,
            source: d.source,
            src: d.storageKey ? `/api/gallery/media/${d._id.toString()}` : null,
            poster: d.posterKey ? `/api/gallery/media/${d._id.toString()}/poster` : null,
            embedId: d.embedId ?? null,
            embedKind: d.embedKind ?? null,
            embedUrl: d.embedUrl ?? null,
            caption: d.caption ?? '',
            tags: d.tags ?? [],
            operationId: d.operationId?.toString() ?? null,
            opLabel: d.opLabel ?? null,
            takenAt: d.takenAt ? d.takenAt.toISOString() : null,
            durationSec: d.durationSec ?? null,
            authorId: d.authorId ?? null,
            authorName: d.authorName ?? 'Unknown',
            batchId: d.batchId ?? d._id.toString(),
            createdAt: d.createdAt.toISOString(),
            /* Surfaced rather than hidden: a failed transcode reaches the queue
               on purpose, so somebody can look at it and reject it instead of
               it vanishing. */
            processingError: d.processingError ?? null,
        })),
    })
}
```

- [ ] **Step 2: The review actions route**

Create `apps/web/app/api/gallery/submissions/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { unlinkSync } from 'fs'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { createNotification } from '@/lib/notifications'
import { canTransition } from '@/lib/gallery/status'
import { resolveStorageKey } from '@/lib/gallery/paths'
import { fetchEmbedPoster } from '@/lib/gallery/poster'
import { splitOperation } from '@/lib/gallery/naming'

/**
 * What a reviewer can do to one submission.
 *
 * PATCH corrects it, POST publishes it, DELETE rejects it. Editing and
 * accepting are separate verbs on purpose: a reviewer fixing a mis-tagged
 * operation on six of a member's twelve clips should not have to publish each
 * one the moment they touch it.
 */

async function reviewer() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    return await hasPermission(me, 'gallery.review') ? me : null
}

/** Changing the operation re-derives everything that hangs off it in one go, so
 *  takenAt, year, operation and opLabel can never disagree with each other. */
async function operationFields(operationId: string | null) {
    if (!operationId || operationId === 'unknown') {
        return { $unset: { operationId: '', operation: '', opLabel: '', year: '' }, $set: { takenAt: null } }
    }
    if (!ObjectId.isValid(operationId)) return null

    const op = await Db.operations.findOne({ _id: new ObjectId(operationId) }, { projection: { title: 1, date: 1 } })
    if (!op) return null

    const { label } = splitOperation(op.title ?? '')
    return {
        $set: {
            operationId: op._id,
            operation: op.title ?? '',
            opLabel: label,
            year: op.date ? String(new Date(op.date).getFullYear()) : '',
            takenAt: op.date ? new Date(op.date) : null,
        },
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await reviewer()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { caption, tags, operationId } = await request.json().catch(() => ({}))

    const set: Record<string, unknown> = {}
    const unset: Record<string, string> = {}

    if (typeof caption === 'string') set.caption = caption.trim().slice(0, 500)

    if (Array.isArray(tags)) {
        const known = await Db.galleryTags
            .find({ slug: { $in: tags.filter((t): t is string => typeof t === 'string') } }, { projection: { slug: 1 } })
            .toArray()
        set.tags = known.map(t => t.slug)
    }

    if (operationId !== undefined) {
        const fields = await operationFields(operationId === null ? 'unknown' : String(operationId))
        if (!fields) return NextResponse.json({ error: 'No such operation' }, { status: 400 })
        Object.assign(set, fields.$set ?? {})
        Object.assign(unset, (fields as { $unset?: Record<string, string> }).$unset ?? {})
    }

    if (!Object.keys(set).length && !Object.keys(unset).length) {
        return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
    }

    await Db.galleryMedia.updateOne({ _id: new ObjectId(id) }, {
        ...(Object.keys(set).length ? { $set: set } : {}),
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
    })

    return NextResponse.json({ success: true })
}

/** Accept — publish it. */
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await reviewer()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const doc = await Db.galleryMedia.findOne({ _id: new ObjectId(id) })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!canTransition(doc.status, 'live')) {
        return NextResponse.json({ error: `Cannot publish something that is ${doc.status}.` }, { status: 409 })
    }

    // Fetched now rather than at submission, so a reviewer's edits to the
    // caption are on the placeholder if a placeholder is what we end up with.
    if (doc.source !== 'upload' && !doc.posterKey) await fetchEmbedPoster(doc)

    await Db.galleryMedia.updateOne({ _id: doc._id }, {
        $set: { status: 'live', publishedAt: new Date(), publishedBy: me.id },
        $unset: { processingError: '' },
    })

    if (doc.authorId) {
        await createNotification({
            userId: doc.authorId,
            type: 'gallery_submission_accepted',
            title: 'Your gallery submission was published',
            body: doc.opLabel ? `Your submission from ${doc.opLabel} is now on the gallery.` : 'Your submission is now on the gallery.',
            actionUrl: '/gallery',
            relatedId: id,
        })
    }

    return NextResponse.json({ success: true })
}

/** Reject — delete the bytes, keep the record. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await reviewer()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { reason } = await request.json().catch(() => ({}))
    const trimmed = String(reason ?? '').trim()
    // Required, because a member who is told nothing learns nothing and
    // submits the same thing again.
    if (!trimmed) return NextResponse.json({ error: 'A reason is required.' }, { status: 400 })

    const doc = await Db.galleryMedia.findOne({ _id: new ObjectId(id) })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!canTransition(doc.status, 'rejected')) {
        return NextResponse.json({ error: `Cannot reject something that is ${doc.status}.` }, { status: 409 })
    }

    /* The bytes go; the record stays. Rejection is a decision worth being able
       to look up later, and the file is the only expensive part of it. */
    for (const key of [doc.storageKey, doc.posterKey]) {
        if (!key) continue
        const file = resolveStorageKey(key)
        if (file) { try { unlinkSync(file) } catch { /* already gone */ } }
    }

    await Db.galleryMedia.updateOne({ _id: doc._id }, {
        $set: { status: 'rejected', rejectedAt: new Date(), rejectedBy: me.id, rejectedReason: trimmed.slice(0, 500) },
        $unset: { storageKey: '', posterKey: '' },
    })

    if (doc.authorId) {
        await createNotification({
            userId: doc.authorId,
            type: 'gallery_submission_rejected',
            title: 'A gallery submission was not published',
            body: trimmed.slice(0, 500),
            actionUrl: '/gallery/submit',
            relatedId: id,
        })
    }

    return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Extend `NotificationType`**

In `apps/web/types/notification.d.ts`, add to the union:

```ts
    | 'gallery_submission_accepted'
    | 'gallery_submission_rejected'
```

- [ ] **Step 4: The review tab**

Create `apps/web/app/dashboard/j5/tabs/GallerySubmissionsTab.tsx`. Read `IntelImagesTab.tsx` in the J2 folder first for this codebase's dashboard-tab idiom (MUI components, the `CornerBrackets` chrome, `var(--red)` accents).

Structure:
- Fetch `/api/gallery/submissions/pending`, `/api/gallery/tags` and `/api/gallery/operations` on mount.
- **Group by `batchId`**, each group headed with the submitter's name, the item count and a relative time — *"Corporal Smith · 12 items · 2 hours ago"* — with an **Accept all** button. Twelve clips from one member on one night are one thing to work through, not twelve.
- Each item renders playable at full size: `<img>` for stills, `<video controls poster>` for uploaded video, an iframe via `embedIframeSrc(item, window.location.hostname)` for embeds.
- Caption (text field), tags (multi-select over the vocabulary) and operation (searchable select, plus **Unknown**) are **live editable** — `PATCH` on blur or on change, debounced, with a saved indicator. Fixing a mistake is typing into it, not sending it back.
- A `processingError` renders as a prominent warning on the item, since that item's media may be unusable.
- **Accept** → `POST`. **Reject** → open a small dialog demanding a reason, then `DELETE`. Remove accepted/rejected items from local state so the queue drains as it is worked.
- Empty state: *"Nothing waiting for review."*

In `J5Panel.tsx`, **append** both tabs after `Tickets` — do not insert them in the middle.

MUI's `Tabs` matches `value` against a child's position among the tabs it actually renders, and the body is a chain of `{tab === N && ...}` against hard-coded numbers. Inserting a *conditional* tab in the middle desynchronises the two the moment the condition is false: Meetings would sit at position 3 while its body still tested `tab === 5`, and a reviewer without `gallery.review` would click Meetings and get Tickets. J2Panel already avoids this by keeping its one conditional tab (`ERA Options`) last.

Appending is necessary but not sufficient — two *independently* conditional tabs still shift against each other when the first is absent and the second is not. So derive the positions rather than hard-coding them:

```tsx
/* Positions, not constants. Both of these are permission-gated, and MUI
   indexes tabs by their position among the ones actually rendered — so a
   member holding gallery.tags but not gallery.review would otherwise land on
   the wrong panel entirely. */
const extraTabs = ([
    canReviewGallery && 'submissions',
    canManageTags && 'tags',
].filter(Boolean) as ('submissions' | 'tags')[])

const FIXED_TABS = 5   // Operations, Featured, SOTM, Meetings, Tickets
```

```tsx
{extraTabs.map((key, i) => (
    <Tab
        key={key}
        label={<PinTabLabel
            label={key === 'submissions' ? 'Submissions' : 'Gallery Tags'}
            pinLabel={key === 'submissions' ? 'J5 — Submissions' : 'J5 — Tags'}
            href='/dashboard/j5'
            tabIndex={FIXED_TABS + i}
        />}
        sx={tabSx}
    />
))}
```

and in the body, after the five existing `{tab === N && ...}` lines, which stay exactly as they are:

```tsx
{tab >= FIXED_TABS && extraTabs[tab - FIXED_TABS] === 'submissions' && <GallerySubmissionsTab />}
{tab >= FIXED_TABS && extraTabs[tab - FIXED_TABS] === 'tags' && <GalleryTagsTab />}
```

`page.tsx` resolves `canReviewGallery` and `canManageTags` with `hasPermission` and passes them in, following how it already resolves `canManageMembers`.

- [ ] **Step 5: The tags tab**

`GalleryTagsTab.tsx` — a list of tags with inline rename, up/down reorder, and a retire/restore toggle, plus an add field. It talks to `/api/gallery/tags` (`GET`, `POST`, `PATCH`). Retired tags render dimmed at the bottom with a Restore action; make it visible in the interface that retiring hides a tag from the picker without removing it from media that already carry it.

- [ ] **Step 6: Verify by hand**

Grant yourself `gallery.review` and `gallery.tags`. Submit a batch of three from `/gallery/submit`, then in J5:
- the batch appears as one group with the right count and submitter
- change an operation → the item's date changes with it
- accept one → it appears on `/gallery` and the submitter's bell shows a notification
- reject one with a reason → the file is gone from `storage/gallery/media/`, the record is `rejected`, and the notification carries the reason
- reject with an empty reason → refused
- add a tag in the Tags tab → it appears in the submit form's picker
- retire a tag → it leaves the picker, and media already carrying it are unchanged

- [ ] **Step 7: Lint, typecheck, commit**

```bash
cd apps/web && npm run lint && npx tsc --noEmit
cd /d/Projects/ASOT
git branch --show-current
git add "apps/web/app/api/gallery/submissions" apps/web/app/dashboard/j5 apps/web/types/notification.d.ts
git commit -m "feat(gallery): J5 review queue and tag vocabulary

Grouped by submitter and batch - twelve clips from one member on one
night are one thing to work through. Caption, tags and operation are
editable in place, so fixing a mistake is typing into it rather than
sending it back."
```

---

## Task 18: The gallery surface

**Files:**
- Modify: `apps/web/app/(landing)/gallery/page.tsx`
- Modify: `apps/web/app/(landing)/gallery/_components/{PhotoGrid,Lightbox,Toolbar,FacetRail,icons}.tsx`
- Modify: `apps/web/styles/gallery.module.css`

**Interfaces:**
- Consumes: everything above.
- Produces: the finished public gallery.

**Scope.** Video playback, embeds, tags, author, captions, the NEW badge, the vote controls, the Top rated sort and the media-type filter, and the Submit button. `page.tsx` is 252 lines before this and gains all of it, so the fetching and lightbox-item construction move into a `useGalleryData` hook and the page stays a layout.

- [ ] **Step 1: Extract the data hook**

Create `apps/web/app/(landing)/gallery/useGalleryData.ts`: owns `items`, `featured`, `sotm`, `tags`, `votes` and `canSubmit`; fetches `/api/gallery`, `/api/gallery/sotm`, `/api/gallery/vote` (GET) and `/api/me/permission?key=gallery.submit` on mount; exposes `applyVote(mediaId, next)` that updates the item in place so a vote cast in the lightbox is reflected on the tile behind it.

- [ ] **Step 2: The tile**

In `PhotoGrid.tsx`'s `Tile`, render `photo.poster ?? photo.src` as the image so a video tile shows its poster, and overlay:

```tsx
{isNewlyPublished(photo.publishedAt) && <span className={s.badgeNew}>NEW</span>}
{photo.kind === 'video' && (
    <span className={s.badgeVideo}>
        <PlayIcon />
        {photo.durationSec ? formatDuration(photo.durationSec) : (photo.source === 'youtube' ? 'YouTube' : photo.source === 'twitch' ? 'Twitch' : 'Video')}
    </span>
)}
{(photo.up + photo.down) > 0 && <span className={s.badgeScore}>▲ {photo.up - photo.down}</span>}
```

`formatDuration` is `m:ss` — put it in `gallery-data.ts` beside the other display helpers. The masonry `onRatio` handler stays as it is, but for an item with `width`/`height` already known from the database, seed `ratios` from those on first render rather than waiting for the image to load — it removes the reflow that currently happens as each tile lands.

An item whose caption exists should use it as the tile's meta title, falling back to `opLabel` — the caption is the more specific thing a member wrote about that photograph.

- [ ] **Step 3: The lightbox**

`LightboxItem` gains `kind`, `source`, `embedId`, `embedKind`, `tags`, `authorName`, `caption`, and the vote fields. The stage renders one of three things:

```tsx
{item.kind === 'video' && item.source === 'upload' && (
    <video src={item.src!} poster={item.poster ?? undefined} controls autoPlay playsInline className={s.lbVideo} />
)}
{item.kind === 'video' && item.source !== 'upload' && (
    <iframe
        className={s.lbEmbed}
        src={embedIframeSrc({ provider: item.source, kind: item.embedKind ?? 'video', id: item.embedId! }, window.location.hostname)}
        allow='autoplay; fullscreen; picture-in-picture'
        allowFullScreen
        title={item.title}
    />
)}
{item.kind === 'image' && <img key={item.src} src={item.src!} alt={item.title} />}
```

`window.location.hostname` is read at render, not module load — this is a client component but the file may still be evaluated during prerender, so guard with `typeof window === 'undefined' ? '' : window.location.hostname`.

The side panel gains the caption as body text above the rows, an **Author** row, clickable tag chips (each applies that tag as a filter and closes the lightbox), and `<VoteBar />`. Hide **Download** when `source !== 'upload'` — an embed has nothing to download.

- [ ] **Step 4: Toolbar and facets**

`Toolbar.tsx`: add `{ value: 'top', label: 'Top rated' }` to `SORTS` and **delete the comment above it** claiming no such sort is possible — it is now false, and a stale comment that confidently explains why a feature is absent is worse than none. Add a three-way media segment (All / Photos / Video) beside the view segment. Include `tag` and `author` pills in the active-filter row.

`FacetRail.tsx`: add Tags (labels resolved from the vocabulary, ordered by `order`) and Author (alphabetical) blocks, both counted with the existing `skip` treatment.

- [ ] **Step 5: The Submit button**

In `GalleryBanner.tsx` or the toolbar, render when `canSubmit`:

```tsx
<Button variant='red' size='sm' href='/gallery/submit'>Submit media</Button>
```

Nothing renders for a member without the key — no disabled button and no explanation, because there is nothing they can do about it and a dead control is worse than an absent one.

- [ ] **Step 6: Verify the whole feature end to end**

With everything granted, walk it once: submit a photo, a video file, a YouTube link and a Twitch link → review and accept all four in J5 → confirm on `/gallery` that each renders, plays, carries its author, caption, tags and NEW badge, and can be voted on. Then check **Top rated** orders sensibly and the **Video** filter shows exactly the four video items.

Also confirm the gallery still works **logged out** — the whole page, the lightbox, video playback, and the vote prompt.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
cd apps/web && npm run lint && npx tsc --noEmit
cd /d/Projects/ASOT
git branch --show-current
git add "apps/web/app/(landing)/gallery" apps/web/styles/gallery.module.css
git commit -m "feat(gallery): video, embeds, tags, authors, captions and voting

The page's own comment said there was no photographer facet, no tags and
no likes because storage held none of it. It holds all of it now."
```

---

## Task 19: Wire the restart sweep, then build

**Files:**
- Modify: `apps/web/server.mjs` (call the sweep at startup)
- Modify: `apps/web/CLAUDE.md` (document the feature)

**Interfaces:**
- Consumes: `sweepStranded` (Task 12).
- Produces: the finished branch.

- [ ] **Step 1: Run the sweep at startup**

`server.mjs` is plain JavaScript and cannot import the TypeScript queue module. Expose the sweep through a route instead and call it once after Next is ready — simplest, and it keeps the queue in one language.

Create `apps/web/app/api/gallery/internal/sweep/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { sweepStranded } from '@/lib/gallery/queue'

/**
 * Re-queues anything a restart interrupted mid-transcode.
 *
 * A route rather than something server.mjs calls directly, because server.mjs
 * is plain JavaScript and the queue is TypeScript — and putting the queue in
 * two languages to avoid one fetch would be the worse trade. Called once, from
 * localhost, after Next reports ready.
 */
export async function POST(request: Request) {
    // Local only. Nothing outside this process has any business triggering it.
    const host = new URL(request.url).hostname
    if (host !== 'localhost' && host !== '127.0.0.1') return new NextResponse('Not found', { status: 404 })

    return NextResponse.json({ swept: await sweepStranded() })
}
```

In `server.mjs`, after the server starts listening:

```js
    // Anything left mid-transcode by a restart is either redone or handed to a
    // reviewer — see lib/gallery/queue.ts. Failure here is not fatal: it means
    // a handful of submissions wait for the next restart, not that the site is
    // down.
    fetch(`http://127.0.0.1:${port}/api/gallery/internal/sweep`, { method: 'POST' })
        .then(res => res.json())
        .then(({ swept }) => { if (swept) console.log(`[gallery] swept ${swept} interrupted upload(s)`) })
        .catch(err => console.warn('[gallery] startup sweep failed:', err.message))
```

- [ ] **Step 2: Run the full unit suite**

Run: `cd apps/web && npm run test:unit`
Expected: PASS. Every new file's tests plus the existing suite.

- [ ] **Step 3: Lint and typecheck**

```bash
cd apps/web && npm run lint && npx tsc --noEmit
```

- [ ] **Step 4: Production build — once, here, not earlier**

Run: `cd apps/web && npm run build`
Expected: success. This is the only build in the plan.

- [ ] **Step 5: Document it**

Add a short section to `apps/web/CLAUDE.md` covering: the gallery is Mongo-backed via `gallery_media`; `scripts/index-gallery.mjs` indexes the legacy tree and is re-runnable; the three permission keys and that they must be granted; ffmpeg is a runtime dependency of video submissions; and the optional Twitch credentials.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add apps/web/server.mjs "apps/web/app/api/gallery/internal" apps/web/CLAUDE.md
git commit -m "feat(gallery): sweep interrupted transcodes at startup, and document the feature

A route rather than a direct call: server.mjs is plain JavaScript and
the queue is TypeScript, and putting the queue in two languages to avoid
one fetch is the worse trade."
```

---

## Handover

The branch is `feat/gallery-submissions`. **Do not push it and do not merge to `main`** — a push to `main` deploys immediately.

Before this is any use to anybody, three things have to happen in this order:

1. **Run the migration on production** — `npm start` → Migrations → *Index: gallery media*, dry-run first, then `--apply`. The gallery reads Mongo after this branch deploys, so an un-migrated database is an empty gallery.
2. **Grant the permission keys** in the Roles Manager. `gallery.review` and `gallery.tags` on the J5 base department role; `gallery.submit` on whichever role every member holds. Until then the Submit button does not render for anybody and the J5 tabs do not appear — by design, per the strict-gating decision.
3. **Confirm ffmpeg is in the deployed image** — `docker compose exec web ffmpeg -version`. Image submissions work without it; video submissions fail at the transcode and land in the review queue carrying a `processingError`.

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: §3 permissions → Task 8; §4 data model → Task 8; §5 storage and pipeline → Tasks 11-13; §6 migration → Tasks 9-10; §7 submit page → Task 15; §8 review tab → Task 17; §9 gallery surface → Tasks 16 and 18, with the carousel fix pulled forward to Task 1 and the NEW badge split across Tasks 7 and 18; §10 testing → the test steps in Tasks 2-9, 11 and 15; §12 order of work → the task order, with the shippable checkpoint at Task 10.

Two spec requirements deliberately did **not** get their own tasks, and both are called out where they land instead: the `image-limits.ts` exemption comment (Task 11, Step 6's module comment) and the `next.config.ts` non-change (Task 14 — posters are cached locally, so nothing new loads from a remote host).

**Type consistency, checked across tasks.** `splitOperation` (Tasks 2, 9, 10, 14, 17), `parseEmbedUrl` / `embedIframeSrc` / `ParsedEmbed.kind` (Tasks 3, 14, 17, 18), `checkFile` / `kindForMime` / `checkItemCount` (Tasks 4, 14, 15), `wilsonScore` (Tasks 5, 10), `voteDelta` (Tasks 5, 16), `canTransition` / `isPublic` (Tasks 6, 10, 13, 17), `isNewlyPublished` (Tasks 7, 18), `resolveStorageKey` / `mediaKey` / `posterKey` (Tasks 11, 12, 13, 17), `enqueue` / `sweepStranded` (Tasks 12, 14, 19), `fetchEmbedPoster` (Tasks 14, 17), `runUploads` / `sendOverXhr` (Task 15). `GalleryMedia.embedKind` is introduced in Task 3's addendum, declared in Task 8, written in Task 14 and read in Tasks 17 and 18.

**Known soft spots**, flagged rather than papered over:

- **Task 9's operation-title matching** is the plan's biggest unknown. Folder labels may not match `operations.title` closely enough for a useful hit rate, in which case the whole legacy archive dates to 1 January of its folder year. Step 6 makes the implementer read the match count before applying, and loosening the match is an explicitly sanctioned change.
- **Tasks 15, 17 and 18 are described structurally**, with real code only for the parts carrying a decision (the uploader, the video reader, the vote control, the lightbox stage). The JSX around them follows existing components in the same folders, which the steps name. This is a deliberate trade: transcribing several hundred lines of routine markup would have added length without adding information, and the components it should match are already in the repository.
- **`process.ts` has no unit test.** It shells out to ffmpeg and decodes real images; it is exercised by hand in Task 14, Step 6.

