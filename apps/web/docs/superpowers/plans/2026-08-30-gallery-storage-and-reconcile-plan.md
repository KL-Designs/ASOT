# Gallery Storage & Reconcile — Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make gallery storage on disk readable and reorganisable by a human, so a downloaded J4 backup can be browsed and rearranged in a file manager and re-imported without losing captions, tags, authors or votes.

**Architecture:** The backup zip is a verbatim stream of the live tree, so storage itself becomes the readable tree — new submissions move out of a flat `media/` directory into the same `content/{year}/{operation}/` tree the legacy archive uses, on publish rather than on upload. Each file carries its `gallery_media` ObjectId in its own filename, in brackets before the extension; that token is what survives the file being dragged into another folder, and a reconcile pass matches by it first and re-derives the operation from whichever folder the file now sits in.

**Tech Stack:** Next.js 15 App Router, TypeScript, MongoDB driver v7, vitest (`lib/**/*.test.ts`, `fileParallelism: false`), `mongodb-memory-server` for database tests, Node 22.

**Spec:** `apps/web/docs/superpowers/specs/2026-08-30-j5-media-console-design.md`

## Global Constraints

- **Branch is `feat/gallery-submissions`.** Extend it. Never push. Never commit to `main`. Check `git branch --show-current` before every commit.
- **Never run any script against the production database.** The migration and relocation scripts are built and verified against fixture trees only. Do not run them with `--apply`. Do not connect to a real `MONGO_URI`.
- **Nothing in reconcile ever deletes a record or a file automatically** (spec §5.2). Every destructive resolution is reported for a human to action.
- **`openDownloadZipStream` is not modified** (spec §7).
- **Poster frames stay flat in `storage/gallery/media/`** (spec §4.2). They are regenerable derivatives; `resolveStorageKey`'s `media:` branch keeps working unchanged.
- **No hide/unhide** (spec §3, N1). Do not add UI or routes for the `hidden` status.
- **Name part cap is 80 characters; directory segment cap is 120 characters** (spec §4.4). Windows' 260-character path limit is the reason.
- **The bracketed ID grammar is exactly** `[0-9a-f]{24}` in square brackets immediately before the extension.
- **Separator between author and caption is an em dash with single spaces:** `" — "` (U+2014).
- **Ambient types** live in `apps/web/types/*.d.ts` using `declare global { }` plus a bare `export {}`.
- **Tests run from `apps/web`:** `npx vitest run <file>`.
- Do not run `npm run test:e2e` or `npx playwright test` — those are the user's to run.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `apps/web/lib/gallery/featured-path.ts` | Pure. Validates a featured-image filename and resolves it safely. Closes the traversal hole. |
| `apps/web/lib/gallery/filenames.ts` | Pure. The `{author} — {caption} [{id}].{ext}` grammar: sanitise, build, parse. |
| `apps/web/lib/gallery/content-path.ts` | Pure. The 2/3/4-segment content-tree path grammar: sanitise a segment, build a path, parse one back into facets. |
| `apps/web/lib/gallery/relocate.ts` | Impure. Resolves an operation's folder and moves one media file into the content tree, updating its document. |
| `apps/web/lib/gallery/reconcile.ts` | Impure. Walks the content tree, applies the four matching rules, produces and persists a report. |
| `scripts/relocate-flat-media.mjs` | One-shot. Moves anything still flat in `media/` (non-poster) into the content tree. |

**Modified:**

| File | Change |
|---|---|
| `apps/web/app/api/gallery/featured/route.ts` | Use `featured-path.ts`; drop `immutable`. |
| `apps/web/app/api/gallery/media/[id]/route.ts` | Drop `immutable`; add `ETag` + `If-None-Match`. |
| `apps/web/lib/gallery/paths.ts` | `content:` / `featured:` / `sotm:` prefixes; 2–4 segments; `legacy:` alias. |
| `apps/web/lib/gallery/naming.ts` | Add `normalizeKey`. |
| `apps/web/lib/mongo.ts` | Add `galleryHealth`. |
| `apps/web/types/gallery-media.d.ts` | Document the new `storageKey` prefixes; add `featuredOrder`, `sotmAt`, `sotmCredit`. |
| `apps/web/types/gallery-health.d.ts` | **Created** — the single persisted reconcile report. |
| `apps/web/app/api/gallery/submissions/[id]/route.ts` | Accept relocates into the content tree before publishing. |
| `apps/web/lib/backups.ts` | Run reconcile after `applyUploadedZip` and `revertToPoint`. |
| `scripts/index-gallery.mjs` | Write `content:` keys; handle 2- and 3-segment shapes; index `featured/` and `sotm/`. |

---

## Task 1: Close the featured-image path traversal, and stop lying about immutability

`apps/web/app/api/gallery/featured/route.ts` interpolates the unvalidated `?img=` query parameter straight into a filesystem path. `?img=../../../.env` serves the repository-root `.env` — `MONGO_URI`, `DISCORD_TOKEN`, every secret — with no authentication. This is on `main`, not introduced by this branch. It goes first and alone.

The same route and `/api/gallery/media/[id]` both send `Cache-Control: public, max-age=31536000, immutable`. `immutable` promises the bytes at a URL can never change. These URLs are id- and name-addressed, not content-addressed, so the promise is false: a replaced or deleted image is served from browser cache for a year with no way to bust it. This is why a deleted image kept rendering on a force-refresh.

**Files:**
- Create: `apps/web/lib/gallery/featured-path.ts`
- Create: `apps/web/lib/gallery/featured-path.test.ts`
- Modify: `apps/web/app/api/gallery/featured/route.ts`
- Modify: `apps/web/app/api/gallery/media/[id]/route.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `resolveFeaturedImage(img: string | null): string | null` — an absolute path, or `null` if the name is not a plain filename inside the featured directory.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/gallery/featured-path.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import path from 'path'

import { FEATURED_DIR, resolveFeaturedImage } from './featured-path'

describe('resolveFeaturedImage', () => {
    test('accepts a plain image filename', () => {
        const out = resolveFeaturedImage('shot-01.jpg')
        expect(out).toBe(path.join(FEATURED_DIR, 'shot-01.jpg'))
    })

    test('accepts the extensions the archive actually contains', () => {
        for (const name of ['a.jpg', 'a.jpeg', 'a.png', 'a.webp', 'a.gif', 'a.JPG']) {
            expect(resolveFeaturedImage(name)).not.toBeNull()
        }
    })

    // The whole reason this module exists. `../../../.env` reached the
    // repository root and served MONGO_URI and DISCORD_TOKEN to anyone.
    test('refuses traversal', () => {
        for (const attack of [
            '../../../.env',
            '../../../../.env',
            '..%2f..%2f.env',
            '../content/2021/x.png',
            '..\\..\\.env',
            '/etc/passwd',
            'C:\\Windows\\win.ini',
            'sub/dir/file.jpg',
            './x.jpg',
        ]) {
            expect(resolveFeaturedImage(attack), attack).toBeNull()
        }
    })

    test('refuses names that are not images', () => {
        expect(resolveFeaturedImage('notes.txt')).toBeNull()
        expect(resolveFeaturedImage('script.mjs')).toBeNull()
        expect(resolveFeaturedImage('archive.zip')).toBeNull()
    })

    test('refuses empty, null and control characters', () => {
        expect(resolveFeaturedImage(null)).toBeNull()
        expect(resolveFeaturedImage('')).toBeNull()
        expect(resolveFeaturedImage('a\u0000.jpg')).toBeNull()
        expect(resolveFeaturedImage('.')).toBeNull()
        expect(resolveFeaturedImage('..')).toBeNull()
    })
})
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd apps/web && npx vitest run lib/gallery/featured-path.test.ts
```

Expected: FAIL — `Failed to resolve import "./featured-path"`.

- [ ] **Step 3: Write the module**

Create `apps/web/lib/gallery/featured-path.ts`:

```ts
import path from 'path'

/**
 * Resolving a featured image's filename to a path on disk.
 *
 * This exists because the route it serves did not do it. It interpolated the
 * `?img=` query parameter straight into a template string, so
 * `?img=../../../.env` resolved to the repository-root .env and served
 * MONGO_URI and DISCORD_TOKEN over an unauthenticated endpoint.
 *
 * Two independent checks, deliberately. The character class is the one that
 * actually decides, and the containment assertion below it is belt and braces
 * over anything the class fails to anticipate — the same pattern
 * `resolveStorageKey` uses for media keys.
 */

const FEATURED_ROOT = path.resolve('../../storage/gallery/featured')

export const FEATURED_DIR = FEATURED_ROOT

/** A plain image filename: no separators, no traversal, no control characters. */
const FEATURED_FILE = /^[A-Za-z0-9][A-Za-z0-9 ._'()-]*\.(jpe?g|png|webp|gif)$/i

export function resolveFeaturedImage(img: string | null | undefined): string | null {
    if (!img) return null
    if (!FEATURED_FILE.test(img)) return null
    // Redundant given the class above, and kept anyway: these two are the
    // names a filename regex is most often written to allow by accident.
    if (img === '.' || img === '..') return null

    const resolved = path.resolve(FEATURED_ROOT, img)
    return resolved.startsWith(FEATURED_ROOT + path.sep) ? resolved : null
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd apps/web && npx vitest run lib/gallery/featured-path.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Use it in the route**

Replace the whole body of `apps/web/app/api/gallery/featured/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createReadStream, statSync } from 'fs'
import { Readable } from 'stream'

import { resolveFeaturedImage } from '@/lib/gallery/featured-path'

/**
 * Serving one featured image by filename.
 *
 * The filename is user input on a public, unauthenticated endpoint, so it goes
 * through resolveFeaturedImage() rather than into a template string — see that
 * module for what happened when it didn't.
 *
 * Cache-Control carries no `immutable`. This URL is name-addressed, not
 * content-addressed: the bytes behind a given filename can be replaced, and
 * the file can be deleted outright. `immutable` told every browser not to
 * revalidate for a year, which is why a deleted image kept rendering through a
 * force-refresh. A weak ETag plus revalidation gives the same saving on
 * repeat views without the lie.
 */

const CONTENT_TYPES: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif',
}

export async function GET(request: NextRequest) {
    const img = new URL(request.url).searchParams.get('img')

    const file = resolveFeaturedImage(img)
    if (!file) return new NextResponse('Not found', { status: 404 })

    let stat: { size: number, mtimeMs: number }
    try { stat = statSync(file) } catch { return new NextResponse('Not found', { status: 404 }) }

    const etag = `W/"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`
    if (request.headers.get('if-none-match') === etag) {
        return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'public, max-age=3600' } })
    }

    const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()

    return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, {
        status: 200,
        headers: {
            'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
            'Content-Length': String(stat.size),
            ETag: etag,
            'Cache-Control': 'public, max-age=3600',
        },
    })
}
```

- [ ] **Step 6: Fix the same header on the media route**

In `apps/web/app/api/gallery/media/[id]/route.ts`, replace this block:

```ts
    /* Only live media is cached hard. A pending item can be re-processed or
       corrected, and an immutable cache entry would outlive the change. */
    const cacheControl = isPublic(doc.status)
        ? 'public, max-age=31536000, immutable'
        : 'private, no-store'
```

with:

```ts
    /* No `immutable`, deliberately. This URL is addressed by media id, not by
       content hash, so its bytes can be replaced by a re-process and can
       vanish entirely on a delete. `immutable` promised a year of never
       revalidating and delivered exactly that: a deleted image kept rendering
       through a force-refresh because the browser never asked again. An ETag
       over size and mtime gives the same saving on repeat views and self-heals
       in an hour when it doesn't. */
    const cacheControl = isPublic(doc.status)
        ? 'public, max-age=3600'
        : 'private, no-store'
```

Then, immediately after the `statSync` block that sets `size`, capture the mtime too — change:

```ts
    let size: number
    try { size = statSync(file).size } catch { return new NextResponse('Not found', { status: 404 }) }
```

to:

```ts
    let size: number
    let etag: string
    try {
        const stat = statSync(file)
        size = stat.size
        // Weak: byte-range responses below are not the full entity, so a
        // strong validator would be wrong on a 206.
        etag = `W/"${doc._id.toString()}-${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`
    } catch { return new NextResponse('Not found', { status: 404 }) }
```

Then add a conditional-request short-circuit immediately before `const result = parseRange(...)`:

```ts
    /* Only on a full request. A 304 to a ranged request would tell the player
       its cached copy of the whole file is current, which is not what it
       asked and not what it has. */
    if (!request.headers.get('range') && request.headers.get('if-none-match') === etag) {
        return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cacheControl } })
    }
```

Finally add `ETag: etag,` to the headers object of both the `206` and the `200` responses, beside their existing `'Cache-Control': cacheControl,` lines.

- [ ] **Step 7: Typecheck and lint**

```bash
cd apps/web && npx tsc --noEmit && npm run lint
```

Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/lib/gallery/featured-path.ts apps/web/lib/gallery/featured-path.test.ts apps/web/app/api/gallery/featured/route.ts "apps/web/app/api/gallery/media/[id]/route.ts"
git commit -m "fix(gallery): close the featured-image path traversal

?img= went into a template string unvalidated, so ?img=../../../.env
served the repo-root secrets over an unauthenticated endpoint. The
filename now has to be a plain image name inside the featured directory.

Also drops Cache-Control: immutable from both image routes. Neither URL
is content-addressed, so the promise was false — which is why a deleted
image kept rendering through a force-refresh."
```

---

## Task 2: The filename grammar

`{author} — {caption} [{id}].{ext}`. The bracketed ObjectId is the whole point: it is what survives a file being dragged into a different folder in a file manager, and every claim about reorganising a backup by hand rests on it.

Pure module — no `fs`, no `mongodb`, no imports at all. It is used by both server code and the migration script.

**Files:**
- Create: `apps/web/lib/gallery/filenames.ts`
- Create: `apps/web/lib/gallery/filenames.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MAX_NAME_PART: 80`
  - `sanitizeFilePart(raw: string | null | undefined): string`
  - `buildMediaFilename(opts: { id: string, ext: string, author?: string | null, caption?: string | null }): string`
  - `parseMediaFilename(name: string): { id: string | null, ext: string }`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/gallery/filenames.test.ts`:

```ts
import { describe, test, expect } from 'vitest'

import { MAX_NAME_PART, buildMediaFilename, parseMediaFilename, sanitizeFilePart } from './filenames'

const ID = '6a9380f11c4e5d2a77b31099'

describe('sanitizeFilePart', () => {
    test('strips the characters no filesystem accepts', () => {
        expect(sanitizeFilePart('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij')
    })

    // A caption containing brackets could otherwise forge an id suffix.
    test('strips square brackets', () => {
        expect(sanitizeFilePart('shot [6a9380f11c4e5d2a77b31099]')).toBe('shot 6a9380f11c4e5d2a77b31099')
    })

    test('strips control characters', () => {
        expect(sanitizeFilePart('a\u0000b\u001fc')).toBe('abc')
    })

    test('collapses whitespace and trims', () => {
        expect(sanitizeFilePart('  too   many\t\tspaces  ')).toBe('too many spaces')
    })

    // Windows silently drops these, which would make the name on disk differ
    // from the name recorded in the database.
    test('strips trailing dots and spaces', () => {
        expect(sanitizeFilePart('Danger close...')).toBe('Danger close')
        expect(sanitizeFilePart('Danger close   ')).toBe('Danger close')
    })

    test('an entirely-punctuation part collapses to empty', () => {
        expect(sanitizeFilePart('///')).toBe('')
        expect(sanitizeFilePart('...')).toBe('')
    })

    test('null and undefined are empty', () => {
        expect(sanitizeFilePart(null)).toBe('')
        expect(sanitizeFilePart(undefined)).toBe('')
        expect(sanitizeFilePart('')).toBe('')
    })
})

describe('buildMediaFilename', () => {
    test('author and caption', () => {
        expect(buildMediaFilename({ id: ID, ext: 'mp4', author: 'Koda', caption: 'Chopper came in hot' }))
            .toBe(`Koda \u2014 Chopper came in hot [${ID}].mp4`)
    })

    test('caption only', () => {
        expect(buildMediaFilename({ id: ID, ext: 'jpg', caption: 'Chopper came in hot' }))
            .toBe(`Chopper came in hot [${ID}].jpg`)
    })

    test('author only', () => {
        expect(buildMediaFilename({ id: ID, ext: 'jpg', author: 'Koda' }))
            .toBe(`Koda [${ID}].jpg`)
    })

    test('neither is the bare id', () => {
        expect(buildMediaFilename({ id: ID, ext: 'jpg' })).toBe(`${ID}.jpg`)
    })

    test('a part that sanitises to nothing is omitted, not left as a dangling separator', () => {
        expect(buildMediaFilename({ id: ID, ext: 'jpg', author: 'Koda', caption: '///' }))
            .toBe(`Koda [${ID}].jpg`)
    })

    test('the extension is normalised', () => {
        expect(buildMediaFilename({ id: ID, ext: '.JPG' })).toBe(`${ID}.jpg`)
    })

    test('a long caption is truncated to the cap', () => {
        const name = buildMediaFilename({ id: ID, ext: 'jpg', caption: 'word '.repeat(80) })
        const stem = name.slice(0, name.indexOf(' ['))
        expect(stem.length).toBeLessThanOrEqual(MAX_NAME_PART)
        expect(stem.endsWith(' ')).toBe(false)
    })

    test('truncation does not leave a trailing dot', () => {
        const name = buildMediaFilename({ id: ID, ext: 'jpg', caption: `${'a'.repeat(78)}. tail` })
        expect(name).not.toContain('. [')
    })
})

describe('parseMediaFilename', () => {
    test('reads the id back out of everything build can produce', () => {
        for (const opts of [
            { id: ID, ext: 'mp4', author: 'Koda', caption: 'Chopper came in hot' },
            { id: ID, ext: 'jpg', caption: 'Chopper came in hot' },
            { id: ID, ext: 'jpg', author: 'Koda' },
            { id: ID, ext: 'jpg' },
        ]) {
            expect(parseMediaFilename(buildMediaFilename(opts)).id).toBe(ID)
        }
    })

    test('a legacy filename has no id but still reports its extension', () => {
        expect(parseMediaFilename('arma3_2021-08-14_01.png')).toEqual({ id: null, ext: 'png' })
        expect(parseMediaFilename('DSC_0411.JPG')).toEqual({ id: null, ext: 'jpg' })
    })

    // The id is read from the END, so bracket-shaped text earlier in a caption
    // cannot be mistaken for one.
    test('only the trailing bracket counts', () => {
        const name = `[aaaaaaaaaaaaaaaaaaaaaaaa] not the id [${ID}].jpg`
        expect(parseMediaFilename(name).id).toBe(ID)
    })

    test('rejects a bracket that is not a 24-character lowercase hex id', () => {
        expect(parseMediaFilename('x [not-an-objectid].jpg').id).toBeNull()
        expect(parseMediaFilename('x [6A9380F11C4E5D2A77B31099].jpg').id).toBeNull()
        expect(parseMediaFilename(`x [${ID}a].jpg`).id).toBeNull()
        expect(parseMediaFilename(`x [${ID}]`).id).toBeNull()
    })

    test('a file with no extension', () => {
        expect(parseMediaFilename('README')).toEqual({ id: null, ext: '' })
    })
})
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd apps/web && npx vitest run lib/gallery/filenames.test.ts
```

Expected: FAIL — `Failed to resolve import "./filenames"`.

- [ ] **Step 3: Write the module**

Create `apps/web/lib/gallery/filenames.ts`:

```ts
/**
 * The filename a piece of gallery media carries on disk.
 *
 *     {author} — {caption} [{id}].{ext}
 *
 * The bracketed id is load-bearing and everything else is decoration. It is
 * the 24-character ObjectId of the gallery_media document, and it is what
 * survives the file being dragged into a different folder in a file manager:
 * a reconcile pass matches on it first and re-derives the operation from
 * whichever folder the file now sits in. Without it, a moved file is
 * indistinguishable from a new one and loses its caption, tags, author and
 * votes.
 *
 * Nothing here parses the author or caption back out. It does not need to —
 * the database holds both — and it could not do it reliably anyway, since an
 * author's own name may contain the separator. The id is the only thing read
 * back, and it is read from the end of the string.
 *
 * Pure: no fs, no mongodb, no imports. Shared by the server and by
 * scripts/index-gallery.mjs's sibling logic.
 */

/** The combined author-and-caption portion, before the id. Windows gives up
 *  past a 260-character path, and a 120-character directory segment cap plus
 *  this keeps a worst case inside it. */
export const MAX_NAME_PART = 80

/** Em dash with single spaces. Chosen because sanitizeFilePart removes
 *  nothing that could produce it accidentally, so it reads unambiguously. */
const SEPARATOR = ' \u2014 '

/* Path separators, the Windows-reserved set, square brackets (a caption must
   never be able to forge an id suffix) and every control character. */
const ILLEGAL = /[/\\:*?"<>|[\]\u0000-\u001f]/g

export function sanitizeFilePart(raw: string | null | undefined): string {
    if (!raw) return ''
    return String(raw)
        .replace(ILLEGAL, '')
        .replace(/\s+/g, ' ')
        .trim()
        // Windows silently drops trailing dots and spaces, which would leave
        // the name on disk differing from the name in the database.
        .replace(/[. ]+$/, '')
}

/** Cut to `max`, preferring a word boundary if one falls near the end. */
function truncateOnWord(s: string, max: number): string {
    if (s.length <= max) return s
    const cut = s.slice(0, max)
    const space = cut.lastIndexOf(' ')
    const out = space > 0 && space >= max - 12 ? cut.slice(0, space) : cut
    return out.replace(/[. ]+$/, '')
}

export function buildMediaFilename(opts: {
    id: string
    ext: string
    author?: string | null
    caption?: string | null
}): string {
    const ext = opts.ext.replace(/^\./, '').toLowerCase()

    // filter(Boolean) rather than a conditional join: a part that sanitises to
    // nothing must disappear entirely, not leave a dangling " — ".
    const stem = truncateOnWord(
        [sanitizeFilePart(opts.author), sanitizeFilePart(opts.caption)].filter(Boolean).join(SEPARATOR),
        MAX_NAME_PART,
    )

    return stem ? `${stem} [${opts.id}].${ext}` : `${opts.id}.${ext}`
}

/* Anchored at the end, so bracket-shaped text earlier in a caption cannot be
   mistaken for the id. Lowercase hex only — ObjectId.toString() is lowercase,
   and accepting uppercase would make two spellings of the same file. */
const ID_SUFFIX = /\[([0-9a-f]{24})\]\.([A-Za-z0-9]{2,5})$/

export function parseMediaFilename(name: string): { id: string | null, ext: string } {
    const match = name.match(ID_SUFFIX)
    if (match) return { id: match[1], ext: match[2].toLowerCase() }

    const dot = name.lastIndexOf('.')
    return { id: null, ext: dot < 0 ? '' : name.slice(dot + 1).toLowerCase() }
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd apps/web && npx vitest run lib/gallery/filenames.test.ts
```

Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/lib/gallery/filenames.ts apps/web/lib/gallery/filenames.test.ts
git commit -m "feat(gallery): the on-disk filename grammar

{author} — {caption} [{id}].{ext}. The bracketed ObjectId is what lets a
file be dragged into another folder and still be recognised on import,
which is the whole basis for reorganising a backup by hand."
```

---

## Task 3: The content-tree path grammar

Three valid shapes, and `resolveStorageKey` currently accepts only the first:

```
content/{year}/{operation}/{mission}/{file}   4 segments — legacy files
content/{year}/{operation}/{file}             3 segments — published submissions
content/Unknown/{file}                        2 segments — no operation
```

Pure module. Parsing is what reconcile uses to re-derive an operation from the folder a human moved a file into, so it has to be lenient about shapes it did not create and strict about traversal.

**Files:**
- Create: `apps/web/lib/gallery/content-path.ts`
- Create: `apps/web/lib/gallery/content-path.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MAX_SEGMENT: 120`
  - `UNKNOWN_FOLDER: 'Unknown'`
  - `sanitizeSegment(raw: string): string`
  - `type ContentFacets = { year: string | null, operation: string | null, mission: string | null, file: string }`
  - `parseContentPath(relative: string): ContentFacets | null`
  - `buildContentPath(f: { year?: string | null, operation?: string | null, mission?: string | null, file: string }): string`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/gallery/content-path.test.ts`:

```ts
import { describe, test, expect } from 'vitest'

import { MAX_SEGMENT, UNKNOWN_FOLDER, buildContentPath, parseContentPath, sanitizeSegment } from './content-path'

describe('sanitizeSegment', () => {
    test('strips separators and reserved characters', () => {
        expect(sanitizeSegment('23. Op New/Winter')).toBe('23. Op NewWinter')
        expect(sanitizeSegment('a:b*c?d"e<f>g|h')).toBe('abcdefgh')
    })

    test('strips trailing dots and spaces', () => {
        expect(sanitizeSegment('Operation Montage IV.')).toBe('Operation Montage IV')
    })

    test('caps length and does not leave a trailing dot after the cap', () => {
        const out = sanitizeSegment(`${'a'.repeat(MAX_SEGMENT)}. tail`)
        expect(out.length).toBeLessThanOrEqual(MAX_SEGMENT)
        expect(out.endsWith('.')).toBe(false)
    })

    test('keeps the punctuation real operation folders use', () => {
        expect(sanitizeSegment('18. Op Copper Ridge (Lanze Verde)')).toBe('18. Op Copper Ridge (Lanze Verde)')
        expect(sanitizeSegment('2022 - 2023')).toBe('2022 - 2023')
    })
})

describe('parseContentPath', () => {
    test('four segments — a legacy file with a mission', () => {
        expect(parseContentPath('2021/4. Op Silent Ridge/I/arma3_01.png')).toEqual({
            year: '2021', operation: '4. Op Silent Ridge', mission: 'I', file: 'arma3_01.png',
        })
    })

    test('three segments — a published submission with no mission', () => {
        expect(parseContentPath('2026/23. Op New Winter/Koda [6a93].mp4')).toEqual({
            year: '2026', operation: '23. Op New Winter', mission: null, file: 'Koda [6a93].mp4',
        })
    })

    test('two segments under Unknown', () => {
        expect(parseContentPath('Unknown/Reaper.jpg')).toEqual({
            year: null, operation: null, mission: null, file: 'Reaper.jpg',
        })
    })

    // A year folder holding files directly is not a shape this writes, but a
    // human reorganising a backup can produce one. Report the year rather
    // than dropping the file.
    test('two segments under a year', () => {
        expect(parseContentPath('2021/loose.jpg')).toEqual({
            year: '2021', operation: null, mission: null, file: 'loose.jpg',
        })
    })

    test('a year folder that is a range is kept verbatim', () => {
        expect(parseContentPath('2022 - 2023/8. Op Atlantic Shield/II/x.jpg')?.year).toBe('2022 - 2023')
    })

    test('refuses traversal and malformed input', () => {
        for (const bad of [
            '../secrets.env',
            '2021/../../.env',
            '2021/./x.jpg',
            '2021\\4. Op\\x.jpg',
            'x.jpg',
            '',
            '/',
            '2021/a/b/c/d/x.jpg',
        ]) {
            expect(parseContentPath(bad), bad).toBeNull()
        }
    })

    test('leading and repeated slashes do not change the shape', () => {
        expect(parseContentPath('/2021//4. Op Silent Ridge/I/x.png')?.mission).toBe('I')
    })
})

describe('buildContentPath', () => {
    test('round-trips each shape', () => {
        for (const f of [
            { year: '2021', operation: '4. Op Silent Ridge', mission: 'I', file: 'x.png' },
            { year: '2026', operation: '23. Op New Winter', mission: null, file: 'y.mp4' },
        ]) {
            expect(parseContentPath(buildContentPath(f))).toEqual(f)
        }
    })

    test('no operation means Unknown, and the year is dropped with it', () => {
        expect(buildContentPath({ year: '2026', operation: null, file: 'y.jpg' }))
            .toBe(`${UNKNOWN_FOLDER}/y.jpg`)
        expect(buildContentPath({ file: 'y.jpg' })).toBe(`${UNKNOWN_FOLDER}/y.jpg`)
    })

    test('no year means Unknown even when an operation is named', () => {
        expect(buildContentPath({ operation: '23. Op New Winter', file: 'y.jpg' }))
            .toBe(`${UNKNOWN_FOLDER}/y.jpg`)
    })
})
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd apps/web && npx vitest run lib/gallery/content-path.test.ts
```

Expected: FAIL — `Failed to resolve import "./content-path"`.

- [ ] **Step 3: Write the module**

Create `apps/web/lib/gallery/content-path.ts`:

```ts
/**
 * The shape of a path inside storage/gallery/content.
 *
 *     {year}/{operation}/{mission}/{file}   legacy files, from the old tree
 *     {year}/{operation}/{file}             published submissions — no mission
 *     Unknown/{file}                        no operation, or none resolvable
 *
 * Parsing is the direction that matters. When a human drags a file into a
 * different folder in a downloaded backup, this is what reads their intent
 * back out: the folders they chose become the operation the item belongs to.
 * So it is lenient about shapes this module would not itself produce — a
 * year folder holding loose files, repeated slashes — and strict about
 * anything that leaves the tree.
 *
 * Pure: no fs, no mongodb, no imports.
 */

/** Per directory segment. With filenames.ts's 80-character name cap, a
 *  worst-case path stays inside Windows' 260-character limit. */
export const MAX_SEGMENT = 120

/** A literal folder, sitting beside the year folders. */
export const UNKNOWN_FOLDER = 'Unknown'

/* Path separators, the Windows-reserved set and control characters. Square
   brackets are NOT stripped here — unlike a filename, a directory segment
   cannot be confused for an id suffix, and real operation folders contain
   parentheses and full stops that must survive. */
const ILLEGAL = /[/\\:*?"<>|\u0000-\u001f]/g

export function sanitizeSegment(raw: string): string {
    const cleaned = String(raw)
        .replace(ILLEGAL, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/, '')

    // Trimmed again after the cap: slicing can land on a dot or a space, and
    // Windows would silently drop it.
    return cleaned.slice(0, MAX_SEGMENT).replace(/[. ]+$/, '')
}

export type ContentFacets = {
    year: string | null
    operation: string | null
    mission: string | null
    file: string
}

export function parseContentPath(relative: string): ContentFacets | null {
    if (!relative) return null

    // Empty segments come from a leading or doubled slash and carry no
    // meaning; dropping them is what makes '/2021//op/I/x.png' parse.
    const segments = relative.split('/').filter(s => s !== '')

    if (segments.length < 2 || segments.length > 4) return null
    if (segments.some(s => s === '.' || s === '..' || s.includes('\\'))) return null

    const file = segments[segments.length - 1]
    const dirs = segments.slice(0, -1)

    if (dirs.length === 1) {
        return dirs[0] === UNKNOWN_FOLDER
            ? { year: null, operation: null, mission: null, file }
            : { year: dirs[0], operation: null, mission: null, file }
    }

    if (dirs.length === 2) return { year: dirs[0], operation: dirs[1], mission: null, file }

    return { year: dirs[0], operation: dirs[1], mission: dirs[2], file }
}

export function buildContentPath(f: {
    year?: string | null
    operation?: string | null
    mission?: string | null
    file: string
}): string {
    // Both or neither. A year without an operation is a shape parseContentPath
    // tolerates from a human but this must never create, because there would
    // be no folder to read an operation back out of.
    if (!f.year || !f.operation) return `${UNKNOWN_FOLDER}/${f.file}`

    return [f.year, f.operation, f.mission || null, f.file].filter(Boolean).join('/')
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd apps/web && npx vitest run lib/gallery/content-path.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/lib/gallery/content-path.ts apps/web/lib/gallery/content-path.test.ts
git commit -m "feat(gallery): the content-tree path grammar

Two, three or four segments. Parsing is the direction that matters: it
is how a folder a human dragged a file into becomes the operation that
file belongs to."
```

---

## Task 4: Teach `resolveStorageKey` the new prefixes and shapes

`resolveStorageKey` accepts exactly four segments under `legacy:`, and `media:` files. It needs to accept 2–4 segments, under a `content:` prefix that replaces `legacy:`, plus `featured:` and `sotm:` for the two directories whose files are about to gain documents.

`legacy:` stays as an accepted alias. The migration has never been run with `--apply`, so there are no `legacy:` documents in production — but a developer database may hold some, and silently 404ing them would look like data loss.

**Files:**
- Modify: `apps/web/lib/gallery/paths.ts`
- Create: `apps/web/lib/gallery/paths.test.ts`
- Modify: `apps/web/types/gallery-media.d.ts`

**Interfaces:**
- Consumes: `MAX_SEGMENT`, `UNKNOWN_FOLDER` from Task 3 (imported for nothing — do not import; this module stays independent).
- Produces:
  - `FEATURED_DIR: string`, `SOTM_DIR: string` (new exports alongside the existing `CONTENT_DIR`, `MEDIA_DIR`, `STAGING_DIR`)
  - `contentKey(relative: string): string` — returns `content:{relative}`
  - `resolveStorageKey` accepting `content:`, `legacy:`, `media:`, `featured:`, `sotm:`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/gallery/paths.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import path from 'path'

import {
    CONTENT_DIR, FEATURED_DIR, MEDIA_DIR, SOTM_DIR,
    contentKey, mediaKey, posterKey, resolveStorageKey,
} from './paths'

describe('contentKey', () => {
    test('prefixes a relative path', () => {
        expect(contentKey('2021/4. Op Silent Ridge/I/x.png')).toBe('content:2021/4. Op Silent Ridge/I/x.png')
    })
})

describe('resolveStorageKey — content', () => {
    test('four segments', () => {
        expect(resolveStorageKey('content:2021/4. Op Silent Ridge/I/x.png'))
            .toBe(path.join(CONTENT_DIR, '2021', '4. Op Silent Ridge', 'I', 'x.png'))
    })

    test('three segments', () => {
        expect(resolveStorageKey('content:2026/23. Op New Winter/y.mp4'))
            .toBe(path.join(CONTENT_DIR, '2026', '23. Op New Winter', 'y.mp4'))
    })

    test('two segments under Unknown', () => {
        expect(resolveStorageKey('content:Unknown/z.jpg')).toBe(path.join(CONTENT_DIR, 'Unknown', 'z.jpg'))
    })

    test('a filename containing spaces, an em dash and a bracketed id', () => {
        const key = 'content:2026/23. Op New Winter/Koda \u2014 Danger close [6a9380f11c4e5d2a77b31099].jpg'
        expect(resolveStorageKey(key)).toContain('Danger close [6a9380f11c4e5d2a77b31099].jpg')
    })

    test('legacy: is still accepted and resolves to the same place', () => {
        expect(resolveStorageKey('legacy:2021/4. Op Silent Ridge/I/x.png'))
            .toBe(resolveStorageKey('content:2021/4. Op Silent Ridge/I/x.png'))
    })

    test('refuses traversal, empty segments and too many segments', () => {
        for (const bad of [
            'content:../../.env',
            'content:2021/../../../.env',
            'content:2021/./x.png',
            'content:2021//x.png',
            'content:2021\\4. Op\\x.png',
            'content:x.png',
            'content:a/b/c/d/e.png',
            'content:',
        ]) {
            expect(resolveStorageKey(bad), bad).toBeNull()
        }
    })
})

describe('resolveStorageKey — media, featured, sotm', () => {
    test('media keys are unchanged', () => {
        const id = '6a9380f11c4e5d2a77b31099'
        expect(resolveStorageKey(mediaKey(id, 'mp4'))).toBe(path.join(MEDIA_DIR, `${id}.mp4`))
        expect(resolveStorageKey(posterKey(id))).toBe(path.join(MEDIA_DIR, `${id}_poster.jpg`))
    })

    test('featured and sotm accept a plain filename', () => {
        expect(resolveStorageKey('featured:shot-01.jpg')).toBe(path.join(FEATURED_DIR, 'shot-01.jpg'))
        expect(resolveStorageKey('sotm:june.png')).toBe(path.join(SOTM_DIR, 'june.png'))
    })

    test('featured and sotm refuse anything but a plain filename', () => {
        for (const bad of ['featured:../.env', 'featured:sub/x.jpg', 'featured:..', 'sotm:../../.env', 'featured:']) {
            expect(resolveStorageKey(bad), bad).toBeNull()
        }
    })

    test('an unknown prefix is null, not a path', () => {
        expect(resolveStorageKey('secrets:.env')).toBeNull()
        expect(resolveStorageKey('/etc/passwd')).toBeNull()
        expect(resolveStorageKey('')).toBeNull()
    })
})
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd apps/web && npx vitest run lib/gallery/paths.test.ts
```

Expected: FAIL — `contentKey`, `FEATURED_DIR` and `SOTM_DIR` are not exported.

- [ ] **Step 3: Extend the module**

In `apps/web/lib/gallery/paths.ts`, add the two directory exports beside the existing ones:

```ts
export const FEATURED_DIR = path.join(GALLERY_ROOT, 'featured')
export const SOTM_DIR = path.join(GALLERY_ROOT, 'sotm')
```

Add `contentKey` beside `mediaKey`:

```ts
export function contentKey(relative: string): string {
    return `content:${relative}`
}
```

Then replace the `legacy:` branch of `resolveStorageKey` with this, and add the two new branches before the final `return null`:

```ts
    /* `content:` replaces `legacy:` — the tree stopped being legacy the moment
       published submissions started landing in it. `legacy:` is still accepted
       because a developer database may hold keys written before the rename;
       both name the same directory. */
    if (key.startsWith('content:') || key.startsWith('legacy:')) {
        const rest = key.slice(key.indexOf(':') + 1)
        if (!rest) return null

        const segments = rest.split('/')
        // Two, three or four: Unknown/file, year/operation/file, and the
        // original year/operation/mission/file. Empty segments are rejected
        // rather than filtered, because here they mean a malformed key rather
        // than a human's stray slash.
        if (segments.length < 2 || segments.length > 4) return null
        if (segments.some(s => !s || s === '.' || s === '..' || s.includes('\\'))) return null

        const resolved = path.resolve(CONTENT_DIR, ...segments)
        return resolved.startsWith(CONTENT_DIR + path.sep) ? resolved : null
    }

    if (key.startsWith('featured:')) return resolveFlat(FEATURED_DIR, key.slice('featured:'.length))
    if (key.startsWith('sotm:')) return resolveFlat(SOTM_DIR, key.slice('sotm:'.length))
```

And add this helper below `resolveStorageKey`:

```ts
/** A plain filename directly inside `dir` — no separators, no traversal.
 *  Used for the two directories whose files predate media ids. */
function resolveFlat(dir: string, file: string): string | null {
    if (!file || file === '.' || file === '..') return null
    if (file.includes('/') || file.includes('\\')) return null
    if (/[\u0000-\u001f]/.test(file)) return null

    const resolved = path.resolve(dir, file)
    return resolved.startsWith(dir + path.sep) ? resolved : null
}
```

- [ ] **Step 4: Update the type documentation**

In `apps/web/types/gallery-media.d.ts`, replace the `storageKey` doc comment with:

```ts
        /**
         * Where the bytes are. The prefix names the directory.
         *   'content:{year}/{op}/{mission}/{file}'  -> storage/gallery/content/...
         *   'content:{year}/{op}/{file}'            -> a published submission, no mission
         *   'content:Unknown/{file}'                -> no operation resolved
         *   'media:{_id}.{ext}'                     -> storage/gallery/media/... (pending only)
         *   'featured:{file}'                       -> storage/gallery/featured/...
         *   'sotm:{file}'                           -> storage/gallery/sotm/...
         * 'legacy:' is the former spelling of 'content:' and still resolves.
         *
         * A file reaches the content tree when it is PUBLISHED, not when it is
         * uploaded: staging/ -> media/ (pending) -> content/ (live). So the
         * readable tree holds only archive material, and a rejected submission
         * never touches it.
         */
        storageKey?: string
```

And add three fields after `bytes?: number`:

```ts
        /** Featured rail position. Absent means not featured. */
        featuredOrder?: number
        /** When this became the screenshot of the month. Absent means it never was. */
        sotmAt?: Date
        /** The photographer credit shown with the screenshot of the month, which
         *  is not always the submitting member. */
        sotmCredit?: string
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
cd apps/web && npx vitest run lib/gallery/paths.test.ts && npx tsc --noEmit
```

Expected: PASS, 11 tests; typecheck clean.

- [ ] **Step 6: Run the whole suite — this module has existing callers**

```bash
cd apps/web && npx vitest run
```

Expected: all pass. `resolveStorageKey`'s existing `media:` behaviour is untouched, so nothing that used it should move.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/lib/gallery/paths.ts apps/web/lib/gallery/paths.test.ts apps/web/types/gallery-media.d.ts
git commit -m "feat(gallery): content:, featured: and sotm: storage keys

The content tree now holds published submissions as well as the legacy
archive, so it takes two, three or four segments rather than exactly
four, and 'legacy:' becomes 'content:' — kept as an alias because a dev
database may hold the old spelling."
```

---

## Task 5: Relocating one file into the content tree

Two pieces: finding the folder an operation's media belongs in, and moving a file there.

Folder resolution reuses `normalizeKey`, which currently exists only inside `scripts/index-gallery.mjs`. It knows that operations are recorded per session day (`OPERATION Lost Army IV — Sun`) while gallery folders are per weekend and abbreviated (`18. Op Atlantic Shield`), and exact matching between the two finds nothing at all. It moves to `lib/gallery/naming.ts`; the script keeps its own copy, exactly as it already does for `splitOperation`, because a root-level `.mjs` cannot import TypeScript.

**Files:**
- Modify: `apps/web/lib/gallery/naming.ts`
- Create: `apps/web/lib/gallery/relocate.ts`
- Create: `apps/web/lib/gallery/relocate.test.ts`

**Interfaces:**
- Consumes: `buildMediaFilename` (Task 2); `buildContentPath`, `sanitizeSegment`, `UNKNOWN_FOLDER` (Task 3); `CONTENT_DIR`, `contentKey`, `resolveStorageKey` (Task 4).
- Produces:
  - `normalizeKey(s: string): string` — exported from `naming.ts`
  - `resolveOperationFolder(deps, operationId, opts?): Promise<{ year: string | null, operation: string | null }>`
  - `relocateMedia(deps, id, opts?): Promise<{ from: string | null, to: string } | null>`

Both take a `deps` object so tests can supply a fixture directory and an in-memory database without changing the working directory:

```ts
export type RelocateDeps = {
    media: { findOne(f: object): Promise<GalleryMedia | null>, updateOne(f: object, u: object): Promise<unknown> }
    operations: { findOne(f: object, o?: object): Promise<{ _id: ObjectId, title?: string, date?: Date } | null> }
    contentDir?: string
}
```

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/gallery/relocate.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { relocateMedia, resolveOperationFolder, type RelocateDeps } from './relocate'

const OP_ID = new ObjectId('6a8000000000000000000001')
const MEDIA_ID = new ObjectId('6a9380f11c4e5d2a77b31099')

let contentDir: string
let root: string

/** A minimal stand-in for the two collections relocate touches. */
function deps(docs: Record<string, Record<string, unknown>>, ops: Record<string, unknown>[]): RelocateDeps & {
    docs: typeof docs
} {
    return {
        docs,
        contentDir,
        media: {
            async findOne(filter: { _id: ObjectId }) {
                return (docs[filter._id.toString()] ?? null) as never
            },
            async updateOne(filter: { _id: ObjectId }, update: { $set?: Record<string, unknown>, $unset?: Record<string, ''> }) {
                const doc = docs[filter._id.toString()]
                Object.assign(doc, update.$set ?? {})
                for (const k of Object.keys(update.$unset ?? {})) delete doc[k]
                return {}
            },
        },
        operations: {
            async findOne(filter: { _id: ObjectId }) {
                return (ops.find(o => (o._id as ObjectId).equals(filter._id)) ?? null) as never
            },
        },
    }
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'asot-relocate-'))
    contentDir = join(root, 'content')
    mkdirSync(contentDir, { recursive: true })
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

describe('resolveOperationFolder', () => {
    test('a null operation is Unknown, with no year', async () => {
        const d = deps({}, [])
        expect(await resolveOperationFolder(d, null)).toEqual({ year: null, operation: null })
    })

    // The common case, and the reason normalizeKey exists: the operation is
    // titled per session day, the folder is per weekend and abbreviated.
    test('reuses an existing folder whose label matches the operation title', async () => {
        mkdirSync(join(contentDir, '2021', '4. Op Silent Ridge'), { recursive: true })
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Silent Ridge \u2014 Sat', date: new Date('2021-08-14T09:00:00Z') }])

        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: '2021', operation: '4. Op Silent Ridge' })
    })

    test('creates the next numbered folder name when nothing matches', async () => {
        mkdirSync(join(contentDir, '2021', '1. Op Armoured Spearhead'), { recursive: true })
        mkdirSync(join(contentDir, '2021', '7. Op Copper Ridge'), { recursive: true })
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Brand New \u2014 Sun', date: new Date('2021-11-02T09:00:00Z') }])

        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: '2021', operation: '8. Op Brand New' })
    })

    test('a year with no folders yet starts at 1', async () => {
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION First \u2014 Sat', date: new Date('2027-01-09T09:00:00Z') }])
        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: '2027', operation: '1. Op First' })
    })

    test('an operation with no date cannot be placed in a year, so it is Unknown', async () => {
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Undated' }])
        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: null, operation: null })
    })
})

describe('relocateMedia', () => {
    test('moves the file, renames it, and updates the document', async () => {
        const flat = join(root, 'media')
        mkdirSync(flat, { recursive: true })
        writeFileSync(join(flat, `${MEDIA_ID}.jpg`), 'BYTES')

        mkdirSync(join(contentDir, '2021', '4. Op Silent Ridge'), { recursive: true })

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID,
                storageKey: `media:${MEDIA_ID}.jpg`,
                caption: 'Danger close',
                authorName: 'Koda',
                operationId: OP_ID,
            } as Record<string, unknown>,
        }
        const d = deps(docs, [{ _id: OP_ID, title: 'OPERATION Silent Ridge \u2014 Sat', date: new Date('2021-08-14T09:00:00Z') }])
        // The flat source lives outside contentDir, so point the resolver at it.
        const result = await relocateMedia({ ...d, mediaDir: flat }, MEDIA_ID)

        const expected = `2021/4. Op Silent Ridge/Koda \u2014 Danger close [${MEDIA_ID}].jpg`
        expect(result).toEqual({ from: `media:${MEDIA_ID}.jpg`, to: `content:${expected}` })

        // Moved, not copied.
        expect(existsSync(join(flat, `${MEDIA_ID}.jpg`))).toBe(false)
        expect(readFileSync(join(contentDir, '2021', '4. Op Silent Ridge', `Koda \u2014 Danger close [${MEDIA_ID}].jpg`), 'utf8')).toBe('BYTES')

        const doc = docs[MEDIA_ID.toString()]
        expect(doc.storageKey).toBe(`content:${expected}`)
        expect(doc.year).toBe('2021')
        expect(doc.operation).toBe('4. Op Silent Ridge')
        expect(doc.takenAt).toEqual(new Date('2021-08-14T09:00:00Z'))
    })

    test('an item with no operation lands in Unknown', async () => {
        const flat = join(root, 'media')
        mkdirSync(flat, { recursive: true })
        writeFileSync(join(flat, `${MEDIA_ID}.jpg`), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID, storageKey: `media:${MEDIA_ID}.jpg`, authorName: 'Reaper',
            } as Record<string, unknown>,
        }
        const d = deps(docs, [])
        const result = await relocateMedia({ ...d, mediaDir: flat }, MEDIA_ID)

        expect(result?.to).toBe(`content:Unknown/Reaper [${MEDIA_ID}].jpg`)
        expect(existsSync(join(contentDir, 'Unknown', `Reaper [${MEDIA_ID}].jpg`))).toBe(true)
    })

    test('relocating something already in the right place is a no-op, not a delete', async () => {
        const dir = join(contentDir, 'Unknown')
        mkdirSync(dir, { recursive: true })
        const name = `Reaper [${MEDIA_ID}].jpg`
        writeFileSync(join(dir, name), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID, storageKey: `content:Unknown/${name}`, authorName: 'Reaper',
            } as Record<string, unknown>,
        }
        const result = await relocateMedia(deps(docs, []), MEDIA_ID)

        expect(result).toBeNull()
        expect(readFileSync(join(dir, name), 'utf8')).toBe('BYTES')
    })

    test('a document whose file is missing is left alone and reported as null', async () => {
        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID, storageKey: `media:${MEDIA_ID}.jpg`, authorName: 'Ghost',
            } as Record<string, unknown>,
        }
        const d = deps(docs, [])
        await expect(relocateMedia({ ...d, mediaDir: join(root, 'media') }, MEDIA_ID)).resolves.toBeNull()
        // The key must NOT have been rewritten to point somewhere with no file.
        expect(docs[MEDIA_ID.toString()].storageKey).toBe(`media:${MEDIA_ID}.jpg`)
    })
})
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd apps/web && npx vitest run lib/gallery/relocate.test.ts
```

Expected: FAIL — `Failed to resolve import "./relocate"`.

- [ ] **Step 3: Move `normalizeKey` into `naming.ts`**

Append to `apps/web/lib/gallery/naming.ts`:

```ts
/**
 * Reduce a folder label or an operation title to a comparable core.
 *
 * The two sides are structurally different, not merely formatted differently:
 * operations are recorded per session day ("OPERATION Lost Army IV — Sun")
 * while the gallery keeps one folder per weekend, abbreviated ("18. Op
 * Atlantic Shield"). Exact matching between them finds nothing at all.
 *
 * Does not touch a trailing parenthetical. Stripping it unconditionally would
 * let "Op Copper Ridge (Lanze Verde)" collide with a plain, unrelated "Op
 * Copper Ridge" — a real pair of folders in this archive.
 *
 * Duplicated in scripts/index-gallery.mjs, which cannot import TypeScript.
 * Both copies are pinned by tests.
 */
export function normalizeKey(s: string): string {
    return String(s)
        .toLowerCase()
        .replace(/\s*[\u2014\u2013-]\s*(sat|sun|saturday|sunday)\s*$/i, '')
        .replace(/^(operation|op|ftx|tvt)\s+/i, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}
```

- [ ] **Step 4: Write the relocate module**

Create `apps/web/lib/gallery/relocate.ts`:

```ts
import { ObjectId } from 'mongodb'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'fs'
import path from 'path'

import { buildContentPath, sanitizeSegment } from './content-path'
import { buildMediaFilename } from './filenames'
import { normalizeKey, splitOperation } from './naming'
import { CONTENT_DIR, MEDIA_DIR, contentKey, resolveStorageKey } from './paths'

/**
 * Moving one piece of media into the readable content tree.
 *
 * This runs when a submission is published, and when a reviewer reassigns an
 * item's operation. Both are the same operation: work out which folder the
 * item belongs in, give the file a name carrying its id, and move it there.
 *
 * A rename, never a copy — bulk-reassigning three hundred items has to be
 * instant and must not duplicate bytes. The copy path below exists only for
 * EXDEV, which cannot happen while both trees are under storage/gallery but
 * costs nothing to survive.
 *
 * Dependencies are injected rather than imported so this is testable against a
 * fixture directory without changing the process's working directory —
 * paths.ts resolves its roots at module load, so a test that chdir'd would
 * have to re-import the whole module graph.
 */

export type RelocateDeps = {
    media: {
        findOne(filter: object): Promise<Record<string, unknown> | null>
        updateOne(filter: object, update: object): Promise<unknown>
    }
    operations: {
        findOne(filter: object, options?: object): Promise<Record<string, unknown> | null>
    }
    /** Defaults to the real tree. Tests point this at a fixture. */
    contentDir?: string
    mediaDir?: string
}

const ORDER_PREFIX = /^\s*(\d+)/

/**
 * Which folder an operation's media belongs in.
 *
 * Reuses an existing folder wherever one matches — that is what puts a new
 * submission beside the legacy files from the same operation rather than in a
 * duplicate folder next to them. Creates nothing on disk; it only returns the
 * names.
 */
export async function resolveOperationFolder(
    deps: RelocateDeps,
    operationId: ObjectId | null,
): Promise<{ year: string | null, operation: string | null }> {
    const contentDir = deps.contentDir ?? CONTENT_DIR
    if (!operationId) return { year: null, operation: null }

    const op = await deps.operations.findOne({ _id: operationId }, { projection: { title: 1, date: 1 } })
    if (!op?.date) {
        // Without a date there is no year folder to sit in, and inventing one
        // would file the item under a year nothing else agrees with.
        return { year: null, operation: null }
    }

    const title = String(op.title ?? '')
    const year = String(new Date(op.date as Date).getUTCFullYear())
    const yearDir = path.join(contentDir, year)

    let existing: string[] = []
    try {
        existing = readdirSync(yearDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
    } catch {
        // The year folder does not exist yet. Not an error — the first
        // operation of a year creates it.
    }

    const wanted = normalizeKey(title)
    const match = existing.find(folder => normalizeKey(splitOperation(folder).label) === wanted)
    if (match) return { year, operation: match }

    const highest = existing.reduce((max, folder) => {
        const m = folder.match(ORDER_PREFIX)
        return m ? Math.max(max, parseInt(m[1], 10)) : max
    }, 0)

    // splitOperation's label, not the raw title: the folder convention is
    // "8. Op Brand New", not "8. OPERATION Brand New — Sun".
    const label = title
        .replace(/\s*[\u2014\u2013-]\s*(sat|sun|saturday|sunday)\s*$/i, '')
        .replace(/^operation\s+/i, 'Op ')
        .trim()

    return { year, operation: sanitizeSegment(`${highest + 1}. ${label}`) }
}

/**
 * Move one item's file into the content tree and update its document.
 *
 * Returns the keys it moved between, or null when there was nothing to do —
 * the file is already in the right place, or there is no file behind the key.
 * A missing file returns null WITHOUT rewriting storageKey: pointing a record
 * at a path that has no bytes turns a recoverable problem into a broken tile.
 */
export async function relocateMedia(
    deps: RelocateDeps,
    id: ObjectId,
): Promise<{ from: string | null, to: string } | null> {
    const contentDir = deps.contentDir ?? CONTENT_DIR
    const mediaDir = deps.mediaDir ?? MEDIA_DIR

    const doc = await deps.media.findOne({ _id: id })
    if (!doc) return null

    const fromKey = typeof doc.storageKey === 'string' ? doc.storageKey : null
    if (!fromKey) return null

    const source = resolveFrom(fromKey, contentDir, mediaDir)
    if (!source || !existsSync(source)) return null

    const operationId = doc.operationId instanceof ObjectId ? doc.operationId : null
    const { year, operation } = await resolveOperationFolder(deps, operationId)

    const ext = source.slice(source.lastIndexOf('.') + 1).toLowerCase()
    const file = buildMediaFilename({
        id: id.toString(),
        ext,
        author: typeof doc.authorName === 'string' ? doc.authorName : null,
        caption: typeof doc.caption === 'string' ? doc.caption : null,
    })

    // Mission is preserved when the item already had one — reassigning an
    // operation must not silently flatten a legacy file's mission folder.
    const mission = typeof doc.mission === 'string' && operation ? doc.mission : null
    const relative = buildContentPath({ year, operation, mission, file })
    const toKey = contentKey(relative)

    const destination = path.join(contentDir, ...relative.split('/'))
    if (path.resolve(destination) === path.resolve(source)) return null

    mkdirSync(path.dirname(destination), { recursive: true })
    move(source, destination)

    const set: Record<string, unknown> = { storageKey: toKey }
    const unset: Record<string, ''> = {}

    if (year) set.year = year; else unset.year = ''
    if (operation) {
        set.operation = operation
        set.opLabel = splitOperation(operation).label
    } else {
        unset.operation = ''
        unset.opLabel = ''
    }

    // takenAt follows the operation, exactly as the review route's
    // operationFields() does — the two must never disagree.
    if (operationId) {
        const op = await deps.operations.findOne({ _id: operationId }, { projection: { date: 1 } })
        set.takenAt = op?.date ? new Date(op.date as Date) : null
    }

    await deps.media.updateOne({ _id: id }, {
        $set: set,
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
    })

    return { from: fromKey, to: toKey }
}

/** resolveStorageKey against the injected roots rather than the real ones. */
function resolveFrom(key: string, contentDir: string, mediaDir: string): string | null {
    if (contentDir === CONTENT_DIR && mediaDir === MEDIA_DIR) return resolveStorageKey(key)

    if (key.startsWith('media:')) {
        const file = key.slice('media:'.length)
        if (!/^[0-9a-f]{24}(_poster)?\.[a-z0-9]{2,5}$/.test(file)) return null
        return path.join(mediaDir, file)
    }
    if (key.startsWith('content:') || key.startsWith('legacy:')) {
        const segments = key.slice(key.indexOf(':') + 1).split('/')
        if (segments.length < 2 || segments.length > 4) return null
        if (segments.some(s => !s || s === '.' || s === '..' || s.includes('\\'))) return null
        return path.join(contentDir, ...segments)
    }
    return null
}

/** Rename where the filesystem allows it; copy-then-unlink across devices. */
function move(source: string, destination: string): void {
    try {
        renameSync(source, destination)
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException)?.code !== 'EXDEV') throw err
        copyFileSync(source, destination)
        unlinkSync(source)
    }
}
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
cd apps/web && npx vitest run lib/gallery/relocate.test.ts && npx tsc --noEmit
```

Expected: PASS, 9 tests; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/lib/gallery/relocate.ts apps/web/lib/gallery/relocate.test.ts apps/web/lib/gallery/naming.ts
git commit -m "feat(gallery): relocate media into the content tree

Reuses an existing operation folder wherever normalizeKey matches one,
so a published submission lands beside the legacy files from the same
operation instead of in a duplicate folder next to them. Renames rather
than copies, and refuses to rewrite a storageKey when the file behind it
is missing."
```

---

## Task 6: Reconcile

The routine that makes the database and the disk agree, and the only thing standing between "you reorganised a backup by hand" and "your captions are gone."

Four rules, in this order. **ID before path is not arbitrary** — a file that was moved has both a resolvable id and a stale path, and matching by path first would fail to notice it moved.

| Condition | Action |
|---|---|
| Filename carries `[id]`, record exists | Match by id. Re-read facets from the folders it now sits in. Caption, tags, author, votes untouched. |
| No `[id]`, path matches a record's `storageKey` | Match by path. Legacy files, unrenamed. |
| File matches no record either way | Report `notIndexed`. Never inserted. |
| Record's `storageKey` has no file | Report `missingFiles`. Never deleted. |

**Files:**
- Create: `apps/web/lib/gallery/reconcile.ts`
- Create: `apps/web/lib/gallery/reconcile.test.ts`
- Create: `apps/web/types/gallery-health.d.ts`
- Modify: `apps/web/lib/mongo.ts`

**Interfaces:**
- Consumes: `parseMediaFilename` (Task 2); `parseContentPath` (Task 3); `CONTENT_DIR`, `contentKey` (Task 4); `normalizeKey`, `splitOperation` (Task 5).
- Produces:
  - `type ReconcileReport`
  - `reconcile(deps: ReconcileDeps): Promise<ReconcileReport>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/gallery/reconcile.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { reconcile, type ReconcileDeps } from './reconcile'

const OP_ID = new ObjectId('6a8000000000000000000001')
const A = new ObjectId('6a9380f11c4e5d2a77b31099')
const B = new ObjectId('6a937cc528231f89cb64d678')

let root: string
let contentDir: string

function write(relative: string, body = 'BYTES') {
    const full = join(contentDir, ...relative.split('/'))
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
}

function deps(docs: Record<string, unknown>[], ops: Record<string, unknown>[] = []): ReconcileDeps {
    return {
        contentDir,
        media: {
            async find() { return docs as never },
            async updateOne(filter: { _id: ObjectId }, update: { $set?: Record<string, unknown>, $unset?: Record<string, ''> }) {
                const doc = docs.find(d => (d._id as ObjectId).equals(filter._id))
                if (!doc) return {}
                Object.assign(doc, update.$set ?? {})
                for (const k of Object.keys(update.$unset ?? {})) delete doc[k]
                return {}
            },
        },
        operations: { async find() { return ops as never } },
    }
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'asot-reconcile-'))
    contentDir = join(root, 'content')
    mkdirSync(contentDir, { recursive: true })
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('reconcile', () => {
    test('matches a file by the id in its name and leaves an unmoved item alone', async () => {
        const name = `Koda \u2014 Danger close [${A}].jpg`
        write(`2026/23. Op New Winter/${name}`)

        const docs = [{ _id: A, storageKey: `content:2026/23. Op New Winter/${name}`, caption: 'Danger close', tags: ['funny'], up: 3, down: 0 }]
        const report = await reconcile(deps(docs))

        expect(report.matchedById).toBe(1)
        expect(report.relocated).toEqual([])
        expect(report.notIndexed).toEqual([])
        expect(report.missingFiles).toEqual([])
    })

    // THE test. Everything about reorganising a backup by hand rests on this.
    test('a file moved into a different operation folder keeps its metadata and takes the new operation', async () => {
        const name = `Koda \u2014 Danger close [${A}].jpg`
        write(`2021/4. Op Silent Ridge/${name}`)

        const docs = [{
            _id: A,
            storageKey: `content:2026/23. Op New Winter/${name}`,   // stale — the file moved
            caption: 'Danger close', tags: ['funny', 'armour'], authorName: 'Koda', up: 3, down: 1,
            year: '2026', operation: '23. Op New Winter',
        }]
        const ops = [{ _id: OP_ID, title: 'OPERATION Silent Ridge \u2014 Sat', date: new Date('2021-08-14T09:00:00Z') }]

        const report = await reconcile(deps(docs, ops))

        expect(report.matchedById).toBe(1)
        expect(report.relocated).toHaveLength(1)
        expect(report.relocated[0]).toMatchObject({
            id: A.toString(),
            from: `content:2026/23. Op New Winter/${name}`,
            to: `content:2021/4. Op Silent Ridge/${name}`,
        })

        // Facets follow the folder…
        expect(docs[0].storageKey).toBe(`content:2021/4. Op Silent Ridge/${name}`)
        expect(docs[0].year).toBe('2021')
        expect(docs[0].operation).toBe('4. Op Silent Ridge')
        expect(docs[0].operationId).toEqual(OP_ID)
        expect(docs[0].takenAt).toEqual(new Date('2021-08-14T09:00:00Z'))

        // …and nothing a member or reviewer wrote is touched.
        expect(docs[0].caption).toBe('Danger close')
        expect(docs[0].tags).toEqual(['funny', 'armour'])
        expect(docs[0].authorName).toBe('Koda')
        expect(docs[0].up).toBe(3)
        expect(docs[0].down).toBe(1)
    })

    test('a legacy file with no id in its name matches by path', async () => {
        write('2021/4. Op Silent Ridge/I/arma3_01.png')
        const docs = [{ _id: B, storageKey: 'content:2021/4. Op Silent Ridge/I/arma3_01.png', caption: null }]

        const report = await reconcile(deps(docs))
        expect(report.matchedByPath).toBe(1)
        expect(report.notIndexed).toEqual([])
    })

    test('a file matching nothing is reported, never inserted', async () => {
        write('2026/23. Op New Winter/III/dropped-in-by-hand.png')
        const report = await reconcile(deps([]))

        expect(report.notIndexed).toHaveLength(1)
        expect(report.notIndexed[0]).toMatchObject({
            path: '2026/23. Op New Winter/III/dropped-in-by-hand.png',
            proposedOperation: '23. Op New Winter',
        })
        expect(report.matchedById + report.matchedByPath).toBe(0)
    })

    test('a record whose file is gone is reported, never deleted', async () => {
        const docs = [{ _id: A, storageKey: 'content:Unknown/gone.jpg', caption: 'WOOOOO' }]
        const report = await reconcile(deps(docs))

        expect(report.missingFiles).toEqual([{ id: A.toString(), storageKey: 'content:Unknown/gone.jpg', caption: 'WOOOOO' }])
        // The record survives.
        expect(docs).toHaveLength(1)
        expect(docs[0].storageKey).toBe('content:Unknown/gone.jpg')
    })

    test('a pending item in the flat media tree is not reported missing', async () => {
        const docs = [{ _id: A, storageKey: `media:${A}.jpg`, status: 'pending' }]
        const report = await reconcile(deps(docs))
        // media/ is not the content tree and is not walked; a flat key is out
        // of scope rather than broken.
        expect(report.missingFiles).toEqual([])
    })

    test('a failed transcode is surfaced', async () => {
        const docs = [{ _id: B, status: 'pending', processingError: 'ffmpeg exited 1: unsupported codec' }]
        const report = await reconcile(deps(docs))
        expect(report.failedProcessing).toEqual([{ id: B.toString(), error: 'ffmpeg exited 1: unsupported codec' }])
    })

    test('an id in a filename that matches no record falls through to not-indexed', async () => {
        write(`Unknown/orphan [${A}].jpg`)
        const report = await reconcile(deps([]))
        expect(report.notIndexed).toHaveLength(1)
        expect(report.matchedById).toBe(0)
    })

    test('counts everything it walked', async () => {
        write('2021/4. Op Silent Ridge/I/a.png')
        write('2021/4. Op Silent Ridge/I/b.png')
        write('Unknown/c.png')
        const report = await reconcile(deps([]))
        expect(report.scanned).toBe(3)
        expect(report.at).toBeInstanceOf(Date)
    })
})
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd apps/web && npx vitest run lib/gallery/reconcile.test.ts
```

Expected: FAIL — `Failed to resolve import "./reconcile"`.

- [ ] **Step 3: Add the health type**

Create `apps/web/types/gallery-health.d.ts`:

```ts
import type { ObjectId } from "mongodb"

export { }

declare global {

    /**
     * The last reconcile report.
     *
     * Exactly one document, overwritten each run. The Health view renders this
     * rather than re-walking 4,781 files on every page load, and a reconcile
     * that runs after a backup restore leaves its result here for whoever
     * looks next.
     */
    interface GalleryHealth {
        _id: ObjectId
        at: Date
        scanned: number
        matchedById: number
        matchedByPath: number
        relocated: { id: string, from: string, to: string, operation: string | null }[]
        notIndexed: { path: string, bytes: number, proposedOperation: string | null }[]
        missingFiles: { id: string, storageKey: string, caption: string | null }[]
        failedProcessing: { id: string, error: string }[]
        unreadable: number
    }

}
```

Add the collection to `apps/web/lib/mongo.ts`, beside `galleryMedia`:

```ts
    galleryHealth: db.collection<GalleryHealth>('gallery_health'),
```

(Match the surrounding style exactly — read the neighbouring `galleryMedia`, `galleryVotes` and `galleryTags` lines first.)

- [ ] **Step 4: Write the module**

Create `apps/web/lib/gallery/reconcile.ts`:

```ts
import { ObjectId } from 'mongodb'
import { readdirSync, statSync } from 'fs'
import path from 'path'

import { parseContentPath } from './content-path'
import { parseMediaFilename } from './filenames'
import { normalizeKey, splitOperation } from './naming'
import { CONTENT_DIR, contentKey } from './paths'

/**
 * Making the database and the disk agree.
 *
 * Runs when a backup is imported and when a human presses Re-scan disk. Never
 * on a timer, and never as a side effect of anything else.
 *
 * Nothing here deletes a record or a file. A restore that fails partway leaves
 * a tree missing most of its files; a reconcile that deleted records for
 * missing files would then destroy the index of the entire archive — captions,
 * tags, authors and votes for 4,781 items — in response to a transient
 * condition. Every destructive resolution is a button a human presses.
 */

export type ReconcileReport = {
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

export type ReconcileDeps = {
    media: {
        find(filter?: object, options?: object): Promise<Record<string, unknown>[]>
        updateOne(filter: object, update: object): Promise<unknown>
    }
    operations: {
        find(filter?: object, options?: object): Promise<Record<string, unknown>[]>
    }
    /** Defaults to the real tree. Tests point this at a fixture. */
    contentDir?: string
}

/** Extensions the archive actually contains. `.jfif` is plain JPEG under a
 *  different extension — three real photographs are saved that way. */
const MEDIA_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'jfif', 'mp4', 'webm', 'mov'])

export async function reconcile(deps: ReconcileDeps): Promise<ReconcileReport> {
    const contentDir = deps.contentDir ?? CONTENT_DIR

    const report: ReconcileReport = {
        scanned: 0, matchedById: 0, matchedByPath: 0,
        relocated: [], notIndexed: [], missingFiles: [], failedProcessing: [],
        unreadable: 0, at: new Date(),
    }

    const docs = await deps.media.find({})
    const byId = new Map(docs.map(d => [String(d._id), d]))
    const byKey = new Map(docs.filter(d => typeof d.storageKey === 'string').map(d => [d.storageKey as string, d]))

    /* Operations grouped by normalised title, so a folder name can be resolved
       back to a real operation — the same match the migration makes, and the
       reason a file dragged into "4. Op Silent Ridge" gets that operation's
       date. Sorted ascending within a key because operations are recorded per
       session day and the earliest is the weekend's start. */
    const operations = await deps.operations.find({ deletedAt: { $exists: false } }, { projection: { title: 1, date: 1 } })
    const opsByKey = new Map<string, Record<string, unknown>[]>()
    for (const op of operations) {
        const key = normalizeKey(String(op.title ?? ''))
        if (!key) continue
        const list = opsByKey.get(key)
        if (list) list.push(op)
        else opsByKey.set(key, [op])
    }
    for (const list of opsByKey.values()) {
        list.sort((a, b) => new Date(a.date as Date).getTime() - new Date(b.date as Date).getTime())
    }

    /** The operation a folder label names, preferring one from the same year. */
    function operationFor(folder: string | null, year: string | null): Record<string, unknown> | null {
        if (!folder) return null
        const candidates = opsByKey.get(normalizeKey(splitOperation(folder).label))
        if (!candidates?.length) return null

        const yearNum = year ? Number(year.slice(0, 4)) : NaN
        if (Number.isNaN(yearNum)) return candidates[0]

        // A year folder is a season, not a calendar year — "2022 - 2023" spans
        // two outright — so one year either side still counts.
        return candidates.find(op => new Date(op.date as Date).getUTCFullYear() === yearNum)
            ?? candidates.find(op => Math.abs(new Date(op.date as Date).getUTCFullYear() - yearNum) === 1)
            ?? candidates[0]
    }

    const seenKeys = new Set<string>()

    /* Walked with an explicit depth cap rather than unbounded recursion: the
       tree is at most year/operation/mission deep, and a symlink loop in a
       restored backup must not spin forever. */
    walk(contentDir, [], 0)

    function walk(dir: string, trail: string[], depth: number): void {
        if (depth > 3) return

        let entries: { name: string, isDirectory(): boolean, isFile(): boolean }[]
        try {
            entries = readdirSync(dir, { withFileTypes: true })
        } catch {
            // An unreadable directory — permissions, a broken symlink, a
            // Windows path over 260 characters. Counted, not fatal: a
            // reconcile over a five-year archive must not die on one folder.
            report.unreadable++
            return
        }

        for (const entry of entries) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) { walk(full, [...trail, entry.name], depth + 1); continue }
            if (!entry.isFile()) continue

            const relative = [...trail, entry.name].join('/')
            const facets = parseContentPath(relative)
            if (!facets) continue

            const { ext } = parseMediaFilename(entry.name)
            if (!MEDIA_EXT.has(ext)) continue

            report.scanned++

            let bytes = 0
            try { bytes = statSync(full).size } catch { report.unreadable++; continue }

            const key = contentKey(relative)
            const { id } = parseMediaFilename(entry.name)

            // Rule 1 — by id. Before the path rule, because a file that MOVED
            // has both a resolvable id and a stale path, and matching by path
            // first would fail to notice it moved.
            const byIdDoc = id ? byId.get(id) : undefined
            if (byIdDoc) {
                report.matchedById++
                seenKeys.add(key)
                if (byIdDoc.storageKey !== key) {
                    pending.push({ doc: byIdDoc, key, facets, from: String(byIdDoc.storageKey ?? '') })
                }
                continue
            }

            // Rule 2 — by path. Legacy files, never renamed.
            if (byKey.has(key)) {
                report.matchedByPath++
                seenKeys.add(key)
                continue
            }

            // Rule 3 — nothing matches. Reported, never inserted.
            report.notIndexed.push({ path: relative, bytes, proposedOperation: facets.operation })
        }
    }

    // Applied after the walk rather than inside it, so one failing write
    // cannot abandon the rest of the scan half-done.
    for (const item of pending) {
        const op = operationFor(item.facets.operation, item.facets.year)

        const set: Record<string, unknown> = { storageKey: item.key }
        const unset: Record<string, ''> = {}

        if (item.facets.year) set.year = item.facets.year; else unset.year = ''
        if (item.facets.operation) {
            set.operation = item.facets.operation
            set.opLabel = splitOperation(item.facets.operation).label
        } else {
            unset.operation = ''
            unset.opLabel = ''
        }
        if (item.facets.mission) set.mission = item.facets.mission; else unset.mission = ''

        if (op) {
            set.operationId = op._id
            set.takenAt = op.date ? new Date(op.date as Date) : null
        } else {
            unset.operationId = ''
            // Deliberately does NOT null takenAt here. A folder this pass
            // cannot resolve to an operation may still be one a reviewer dated
            // by hand, and discarding that would lose real work.
        }

        await deps.media.updateOne({ _id: item.doc._id as ObjectId }, {
            $set: set,
            ...(Object.keys(unset).length ? { $unset: unset } : {}),
        })

        report.relocated.push({
            id: String(item.doc._id),
            from: item.from,
            to: item.key,
            operation: item.facets.operation,
        })
    }

    // Rule 4 — records with no file. Only content keys: a `media:` key is a
    // pending item that has not been published yet, which is not the content
    // tree's business and is not broken.
    for (const doc of docs) {
        const key = doc.storageKey
        if (typeof key !== 'string') continue
        if (!key.startsWith('content:') && !key.startsWith('legacy:')) continue
        if (seenKeys.has(key)) continue
        // A relocated document's NEW key is in seenKeys; its old one is not,
        // so skip anything this run just moved.
        if (report.relocated.some(r => r.id === String(doc._id))) continue

        report.missingFiles.push({
            id: String(doc._id),
            storageKey: key,
            caption: typeof doc.caption === 'string' ? doc.caption : null,
        })
    }

    for (const doc of docs) {
        if (typeof doc.processingError === 'string' && doc.processingError) {
            report.failedProcessing.push({ id: String(doc._id), error: doc.processingError })
        }
    }

    return report
}
```

Declare `pending` above `walk` (the walker pushes into it and the loop after drains it):

```ts
    const pending: {
        doc: Record<string, unknown>
        key: string
        facets: NonNullable<ReturnType<typeof parseContentPath>>
        from: string
    }[] = []
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
cd apps/web && npx vitest run lib/gallery/reconcile.test.ts && npx tsc --noEmit
```

Expected: PASS, 9 tests; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/lib/gallery/reconcile.ts apps/web/lib/gallery/reconcile.test.ts apps/web/types/gallery-health.d.ts apps/web/lib/mongo.ts
git commit -m "feat(gallery): reconcile the database against the disk

Four rules, id before path — a file that moved has both a resolvable id
and a stale path, so matching by path first would miss the move. Nothing
deletes: a half-finished restore would otherwise wipe the index for the
whole archive."
```

---

## Task 7: Publish moves the file into the content tree

A file enters the readable tree when it is **published**, not when it is uploaded. `staging/` → `media/` (transcoded, pending) → `content/` (accepted, live). A rejected submission never touches the tree, and a reviewer who corrects the operation mid-review causes one move at accept rather than a move and then a second move.

Relocation runs **before** the status flips to live. If it throws, nothing is published — the alternative is a live document pointing at a file that was never moved.

**Files:**
- Modify: `apps/web/app/api/gallery/submissions/[id]/route.ts`

**Interfaces:**
- Consumes: `relocateMedia` (Task 5).
- Produces: nothing new.

- [ ] **Step 1: Add the import**

In `apps/web/app/api/gallery/submissions/[id]/route.ts`, add beside the existing gallery imports:

```ts
import { relocateMedia } from '@/lib/gallery/relocate'
```

- [ ] **Step 2: Relocate before publishing**

In `POST`, insert this immediately before the `Db.galleryMedia.updateOne` that sets `status: 'live'`:

```ts
    /* Into the readable tree, and only now.
       A file lives flat under media/ while it is pending and moves to
       content/{year}/{operation}/ on publish, carrying its id in the filename.
       Doing it here rather than at upload means a rejected submission never
       touches the archive tree, and a reviewer who corrects the operation
       causes one move instead of two.

       Before the status change, not after: if this throws, nothing is
       published, which is recoverable. The reverse would leave a live document
       pointing at a file that was never moved. Embeds have no bytes and
       relocateMedia returns null for them without doing anything. */
    if (doc.source === 'upload') {
        try {
            await relocateMedia({ media: Db.galleryMedia, operations: Db.operations }, doc._id)
        } catch (err) {
            console.error('[gallery] failed to file media into the content tree', id, err)
            return NextResponse.json({
                error: 'Could not move this item into the gallery archive. Nothing was published.',
            }, { status: 500 })
        }
    }
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: clean. If `Db.galleryMedia` does not structurally satisfy `RelocateDeps['media']`, widen the `RelocateDeps` method signatures rather than casting at the call site — a cast here would hide a real mismatch from every future caller.

- [ ] **Step 4: Run the whole suite**

```bash
cd apps/web && npx vitest run
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add "apps/web/app/api/gallery/submissions/[id]/route.ts"
git commit -m "feat(gallery): file accepted submissions into the content tree

staging/ -> media/ while pending -> content/ on publish. The readable
tree holds only archive material, and a rejected submission never enters
it. Relocation runs before the status flip so a failure publishes
nothing."
```

---

## Task 8: Reconcile after a restore

A restored backup whose tree was rearranged by hand should arrive with those moves already applied and its unresolvable rows waiting in Health. Reconcile runs after **both** the database and the media tree are settled — it compares the two, so it needs both in place.

**Files:**
- Modify: `apps/web/lib/backups.ts`
- Modify: `apps/web/lib/backups.roundtrip.test.ts`

**Interfaces:**
- Consumes: `reconcile` (Task 6).
- Produces: `runGalleryReconcile(): Promise<void>` — internal to `backups.ts`.

- [ ] **Step 1: Add the helper**

In `apps/web/lib/backups.ts`, add near the other restore helpers:

```ts
/**
 * Reconcile the gallery after a restore.
 *
 * A backup can be downloaded, reorganised in a file manager and re-uploaded —
 * that is the point of the readable content tree. This is what reads those
 * moves back in: a file carrying its media id is matched by it and takes the
 * operation of whichever folder it now sits in.
 *
 * Never fatal. The restore itself has already succeeded by the time this runs,
 * and failing the whole operation because the index could not be refreshed
 * would report a successful restore as a failure. The report lands in
 * gallery_health either way, and a human can press Re-scan disk.
 */
async function runGalleryReconcile(): Promise<void> {
    try {
        const { reconcile } = await import('./gallery/reconcile')
        const Db = (await import('./mongo')).default

        const report = await reconcile({
            media: {
                find: (filter, options) => Db.galleryMedia.find(filter ?? {}, options).toArray(),
                updateOne: (filter, update) => Db.galleryMedia.updateOne(filter, update),
            },
            operations: {
                find: (filter, options) => Db.operations.find(filter ?? {}, options).toArray(),
            },
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
```

The dynamic imports are deliberate: `lib/gallery/reconcile.ts` reaches `lib/mongo.ts`, and importing it at the top of `backups.ts` would pull a database connection into a module the backup tests import before any mongod exists.

- [ ] **Step 2: Call it from both restore paths**

In `applyUploadedZip`, immediately after the `if (hasUploads) { … }` block and before `await writeOwnedStatus(token, { state: 'idle' })`:

```ts
        // Both the database and the media tree are settled by here — reconcile
        // compares the two, so it cannot run between them.
        if (hasGallery) await runGalleryReconcile()
```

In `revertToPoint`, add the same call at the equivalent point — after the media restore completes and before the status is set back to idle. Read the function first and place it so it runs on every path that actually restored the gallery.

- [ ] **Step 3: Extend the round-trip test**

In `apps/web/lib/backups.roundtrip.test.ts`, add a test asserting a hand-moved file survives. Add it inside the existing `describe` that already has a mongod and a storage root:

```ts
test('a file moved between folders in the zip keeps its record and takes the new operation', async () => {
    if (!hasRestic) return

    const { ObjectId } = await import('mongodb')
    const { reconcile } = await import('./gallery/reconcile')
    const { mkdirSync, writeFileSync } = await import('fs')
    const { join } = await import('path')

    const id = new ObjectId()
    const contentDir = join(storageRoot, 'gallery', 'content')
    const name = `Koda \u2014 Danger close [${id.toString()}].jpg`

    // The file is where a human dragged it; the record still names where it was.
    mkdirSync(join(contentDir, '2021', '4. Op Silent Ridge'), { recursive: true })
    writeFileSync(join(contentDir, '2021', '4. Op Silent Ridge', name), 'BYTES')

    const docs: Record<string, unknown>[] = [{
        _id: id,
        storageKey: `content:2026/23. Op New Winter/${name}`,
        caption: 'Danger close', tags: ['funny'], up: 5, down: 0,
    }]

    const report = await reconcile({
        contentDir,
        media: {
            async find() { return docs },
            async updateOne(filter: { _id: InstanceType<typeof ObjectId> }, update: { $set?: Record<string, unknown> }) {
                Object.assign(docs[0], update.$set ?? {})
                return {}
            },
        },
        operations: { async find() { return [] } },
    })

    expect(report.relocated).toHaveLength(1)
    expect(docs[0].storageKey).toBe(`content:2021/4. Op Silent Ridge/${name}`)
    expect(docs[0].operation).toBe('4. Op Silent Ridge')
    expect(docs[0].caption).toBe('Danger close')
    expect(docs[0].up).toBe(5)
})
```

- [ ] **Step 4: Run the backup tests**

```bash
cd apps/web && npx vitest run lib/backups.roundtrip.test.ts
```

Expected: PASS (or a clean skip if the restic binary is absent — the file already skips rather than fails in that case).

- [ ] **Step 5: Run the whole suite and typecheck**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && npm run lint
```

Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/lib/backups.ts apps/web/lib/backups.roundtrip.test.ts
git commit -m "feat(backups): reconcile the gallery after a restore

A downloaded backup can be reorganised in a file manager and re-uploaded.
This is what reads those moves back in. Non-fatal by design: the restore
has already succeeded by the time it runs."
```

---

## Task 9: The migration and the flat-media relocation script

`scripts/index-gallery.mjs` already walks the tree and matches 44 of 88 operation folders. It needs the new key prefix, the new path shapes, and the two directories whose files are about to gain documents.

A companion script moves anything still flat in `media/` into the content tree.

**Neither is run against production.** Both are verified against fixture trees. Do not pass `--apply` against a real `MONGO_URI`.

**Files:**
- Modify: `scripts/index-gallery.mjs`
- Create: `scripts/relocate-flat-media.mjs`
- Modify: `apps/web/lib/gallery/index-gallery.test.ts` (the existing script test — locate it first; it may be named differently)

**Interfaces:**
- Consumes: the grammar from Tasks 2 and 3, re-implemented in `.mjs` (a root-level `.mjs` cannot import TypeScript — the script already does this for `splitOperation`).
- Produces: nothing other TypeScript consumes.

- [ ] **Step 1: Switch the key prefix and widen the shapes**

In `scripts/index-gallery.mjs`, change the storage key construction:

```js
                    const storageKey = `legacy:${year}/${operation}/${mission}/${file}`
```

to:

```js
                    const storageKey = `content:${year}/${operation}/${mission}/${file}`
```

Then add a second pass for files sitting **directly** in an operation folder — published submissions have no mission, so a re-run after this ships must index them. Immediately after the `for (const mission of dirs(...))` loop closes, and still inside the `for (const operation of ...)` loop, add:

```js
            /* Files directly inside an operation folder — a published
               submission has no mission, so the mission loop above never sees
               them. Same rules otherwise. */
            for (const file of files(join(CONTENT, year, operation))) {
                if (!MEDIA_EXT.has(extOf(file))) { skipped++; continue }
                await indexOne(`${year}/${operation}/${file}`, join(CONTENT, year, operation, file), {
                    year, operation, label, op, mission: null,
                })
            }
```

And a top-level pass for the `Unknown` folder, immediately after the `for (const year of dirs(CONTENT))` loop closes:

```js
    /* The Unknown bucket sits beside the year folders, holding files with no
       operation. Two segments, no year — see the content-path grammar. */
    for (const file of files(join(CONTENT, 'Unknown'))) {
        if (!MEDIA_EXT.has(extOf(file))) { skipped++; continue }
        await indexOne(`Unknown/${file}`, join(CONTENT, 'Unknown', file), {
            year: null, operation: null, label: null, op: null, mission: null,
        })
    }
```

Extract the body of the innermost existing file loop into a single `indexOne(relative, absolute, facets)` function so all three passes share it verbatim rather than triplicating the stat, the sharp probe and the upsert. Keep every existing comment on the code you move — in particular the one explaining why `takenAt` is null for a range-named year folder rather than an Invalid Date.

Rename `IMAGE_EXT` to `MEDIA_EXT` and add the video extensions, since the tree now holds published video:

```js
// .jfif is plain JPEG under a different extension — three real photographs
// in the archive are saved this way and were silently dropped before this.
const MEDIA_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.jfif', '.mp4', '.webm', '.mov'])
```

`indexOne` must set `kind: 'video'` for the video extensions and `'image'` otherwise, and must skip the sharp probe for video.

- [ ] **Step 2: Index the featured and sotm directories**

Add before the tag-vocabulary block:

```js
    /* The two directories whose files predate media ids. Bytes stay where they
       are; they gain documents so they appear in the library like anything
       else and can be given an operation later. featuredOrder is assigned in
       readdir order, which is the order the rail showed them in before it had
       any order at all. */
    for (const [dir, prefix, extra] of [
        ['featured', 'featured', i => ({ featuredOrder: i })],
        ['sotm', 'sotm', () => ({})],
    ]) {
        const root = resolve(process.cwd(), `storage/gallery/${dir}`)
        if (!existsSync(root)) continue

        let i = 0
        for (const file of files(root)) {
            if (!MEDIA_EXT.has(extOf(file))) { skipped++; continue }
            await indexOne(`${prefix}:${file}`, join(root, file), {
                year: null, operation: null, label: null, op: null, mission: null,
                keyIsAbsolute: true, extra: extra(i++),
            })
        }
    }
```

`indexOne` takes the storage key directly when `keyIsAbsolute` is set, rather than prefixing `content:`, and merges `extra` into the `$setOnInsert` document.

- [ ] **Step 3: Write the flat-media relocation script**

Create `scripts/relocate-flat-media.mjs`:

```js
#!/usr/bin/env node
/**
 * Move anything still flat in storage/gallery/media into the content tree.
 *
 * New submissions are filed into content/ on publish, but anything published
 * before that shipped is still sitting flat under an opaque hex filename. This
 * gives those files the same readable name and location as everything else.
 *
 * Posters are skipped. They are regenerable derivatives of a video, nobody
 * organises them by hand, and they stay flat by design.
 *
 * Idempotent: a file already in the content tree has a content: key and is
 * never seen by the media: query below.
 *
 * Dry-run by default. Pass --apply to write.
 */

import { MongoClient, ObjectId } from 'mongodb'
import { copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs'
import { join, resolve, dirname } from 'path'

const APPLY = process.argv.includes('--apply')
const MONGO_URI = process.env.MONGO_URI
const MONGO_DB = process.env.MONGO_DB

if (!MONGO_URI || !MONGO_DB) {
    console.error('MONGO_URI and MONGO_DB env vars are required.')
    process.exit(1)
}

const GALLERY = resolve(process.cwd(), 'storage/gallery')
const CONTENT = join(GALLERY, 'content')
const MEDIA = join(GALLERY, 'media')

if (!existsSync(MEDIA)) {
    console.log(`No flat media directory at ${MEDIA} — nothing to relocate.`)
    process.exit(0)
}

/* Kept in step with apps/web/lib/gallery/filenames.ts and content-path.ts. A
   root-level .mjs cannot import TypeScript, so this is the same duplication
   the sibling migration already carries for splitOperation, and both copies
   are pinned by tests. */
const MAX_NAME_PART = 80
const SEPARATOR = ' \u2014 '
const ILLEGAL = /[/\\:*?"<>|[\]\u0000-\u001f]/g

const sanitize = raw => !raw ? '' : String(raw)
    .replace(ILLEGAL, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '')

function buildName({ id, ext, author, caption }) {
    let stem = [sanitize(author), sanitize(caption)].filter(Boolean).join(SEPARATOR)
    if (stem.length > MAX_NAME_PART) {
        const cut = stem.slice(0, MAX_NAME_PART)
        const space = cut.lastIndexOf(' ')
        stem = (space > 0 && space >= MAX_NAME_PART - 12 ? cut.slice(0, space) : cut).replace(/[. ]+$/, '')
    }
    return stem ? `${stem} [${id}].${ext}` : `${id}.${ext}`
}

const client = new MongoClient(MONGO_URI)

try {
    await client.connect()
    const media = client.db(MONGO_DB).collection('gallery_media')

    // Originals only. A poster's key ends in _poster and stays where it is.
    const docs = await media.find({ storageKey: { $regex: '^media:' } }).toArray()

    let moved = 0, skipped = 0, missing = 0

    for (const doc of docs) {
        const file = doc.storageKey.slice('media:'.length)
        if (file.includes('_poster.')) { skipped++; continue }

        const source = join(MEDIA, file)
        if (!existsSync(source)) {
            // Reported, never resolved by deleting the record — that is the
            // Health view's job and a human's decision.
            console.warn(`missing file for ${doc._id}: ${doc.storageKey}`)
            missing++
            continue
        }

        const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
        const name = buildName({ id: doc._id.toString(), ext, author: doc.authorName, caption: doc.caption })

        const relative = doc.year && doc.operation
            ? `${doc.year}/${doc.operation}/${name}`
            : `Unknown/${name}`
        const destination = join(CONTENT, ...relative.split('/'))
        const key = `content:${relative}`

        if (!APPLY) {
            console.log(`[dry-run] would move ${doc.storageKey} -> ${key}`)
            moved++
            continue
        }

        mkdirSync(dirname(destination), { recursive: true })
        try {
            renameSync(source, destination)
        } catch (err) {
            if (err?.code !== 'EXDEV') throw err
            copyFileSync(source, destination)
            unlinkSync(source)
        }

        await media.updateOne({ _id: new ObjectId(doc._id) }, { $set: { storageKey: key } })
        moved++
    }

    console.log(`\n${APPLY ? 'moved' : 'would move'}: ${moved}   posters skipped: ${skipped}   missing files: ${missing}`)
    if (!APPLY) console.log('\nDry run. Re-run with --apply to write.')
} finally {
    await client.close()
}
```

- [ ] **Step 4: Add the menu entry**

In `scripts/start.mjs`, add an item under Migrations beside the existing gallery indexer. Read the neighbouring entries and match their shape exactly — label, script path, and whether they take arguments.

- [ ] **Step 5: Extend the migration's test**

Locate the existing test for `index-gallery.mjs` (search for `index-gallery` under `apps/web/lib`). Add cases asserting:

- a file directly inside an operation folder is indexed with a three-segment `content:` key and no `mission`
- a file in `Unknown/` is indexed with `content:Unknown/{file}`, no `year` and no `operation`
- an `.mp4` is indexed with `kind: 'video'` and no sharp probe
- keys use the `content:` prefix, never `legacy:`
- a second run inserts nothing (the existing idempotence assertion still holds)

- [ ] **Step 6: Verify against a fixture tree — never production**

```bash
cd apps/web && npx vitest run lib/gallery
```

Expected: all gallery tests pass, including the migration's.

Do **not** run either script against a real database. The user runs those.

- [ ] **Step 7: Full verification**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && npm run lint
```

Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add scripts/index-gallery.mjs scripts/relocate-flat-media.mjs scripts/start.mjs apps/web/lib/gallery/
git commit -m "feat(gallery): index the new tree shapes, and relocate flat media

The migration writes content: keys and handles the two- and
three-segment shapes the tree now holds, plus the featured and sotm
directories. A companion script moves anything still flat under media/
into the tree with a readable name. Both dry-run by default; neither has
been run against production."
```

---

## Self-Review

**Spec coverage.** §1.1 traversal and cache → Task 1. §4.2 directories → Tasks 4, 5. §4.3 tree shapes → Tasks 3, 4. §4.4 filename grammar → Task 2. §4.5 operation folder resolution → Task 5. §4.6 key prefixes → Task 4. §5 reconcile, all four rules and the report shape → Task 6. §5.4 module split → Tasks 2, 3, 5, 6. §7 backup round trip → Task 8. §8 migration → Task 9. §11 testing → every task's own test file.

Deliberately **not** in this plan, because they are Plan B: §6 (the console), §9 (`gallery.manage`), §10 (the admin API surface), and the reader-side featured changes in §6.7. Plan A leaves `featuredOrder` and `sotmAt` written to documents by the migration but not yet read by anything, which is why Plan A ships nothing visible.

**Placeholder scan.** No "TBD", no "handle edge cases", no "similar to Task N". Three steps direct the implementer to read surrounding code before editing rather than giving a literal diff — Task 6 Step 3 (`lib/mongo.ts` collection style), Task 8 Step 2 (`revertToPoint`'s restore path) and Task 9 Step 4 (`start.mjs` menu entries). Each is a case where the file's own conventions are the requirement and quoting a stale snippet would be worse than naming the convention.

**Type consistency.** `RelocateDeps` (Task 5) and `ReconcileDeps` (Task 6) are separate types on purpose: relocate needs `findOne`/`updateOne`, reconcile needs `find`/`updateOne`. `contentKey` is defined in Task 4 and consumed in Tasks 5 and 6. `parseMediaFilename` returns `{ id, ext }` in Task 2 and is destructured for both fields in Task 6. `buildContentPath` accepts optional `year`/`operation` in Task 3 and is called with `null` for both in Task 5.

**One gap found and closed while reviewing:** Task 6's missing-file rule would have reported every document this run just relocated, because their *old* keys are absent from `seenKeys`. The `report.relocated.some(...)` guard exists for that.
