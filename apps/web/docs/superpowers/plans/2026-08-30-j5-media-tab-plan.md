# J5 Media Tab — Implementation Plan (Plan B1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace J5's folder-browsing Operations tab with a Media tab where every item in the gallery can be found and edited — caption, tags, author, operation — one at a time or in bulk, plus a Health view that surfaces every disagreement between the database and the disk.

**Architecture:** Three columns. A left rail of saved views and the year → operation → mission tree, each with a live count; a centre pane that is a grid or a table of whatever the rail and filters select; a right inspector that edits the selected item, and becomes a bulk panel when more than one is selected. All server state comes from four new `gallery.manage`-gated routes under `/api/gallery/admin/`. The query-building is a pure module so the filter and sort logic is unit-testable without a database.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, MongoDB driver v7, MUI (dashboard only — the public gallery uses CSS modules), vitest.

**Spec:** `apps/web/docs/superpowers/specs/2026-08-30-j5-media-console-design.md` — sections 6.1–6.5, 9, 10.

**Predecessor:** Plan A (`2026-08-30-gallery-storage-and-reconcile-plan.md`), complete and merged into this branch. It built the storage layout, `relocateMedia`, and `reconcile`. This plan is their first user interface.

## Global Constraints

- **Branch is `feat/gallery-submissions`.** Extend it. Never push. Never commit to `main`. Check `git branch --show-current` before every commit.
- **Never run any script against the production database.** The migration is the user's to run. Do not pass `--apply` to anything, do not read the repo's `.env`, do not connect to a real `MONGO_URI`.
- **`gallery.manage` already exists** in `lib/permissions.ts` and gates the sibling admin routes. Use it. Do **not** add a new permission key.
- **No hide/unhide** (spec §3, N1). Delete is the only removal path. Do not add UI or routes for the `hidden` status.
- **Nothing may delete a gallery record except an explicit, human-initiated delete.** Reconcile never deletes; neither may anything here, except the DELETE route and the bulk delete action, both of which a person triggers deliberately.
- **A bulk move relocates files on disk.** It must state that consequence in the UI before it runs.
- **No `as` casts, no `any`** in new modules.
- **Ambient types** live in `apps/web/types/*.d.ts` using `declare global { }` plus a bare `export {}`.
- **Tests run from `apps/web`:** `npx vitest run <file>`. The include pattern is `lib/**/*.test.ts` and `app/**/*.test.ts`.
- Do not run `npm run test:e2e` or `npx playwright test`.
- Do not leave scratch files under `apps/web/`. Use the session scratchpad.
- Comments explain *why*, naming the specific failure a line prevents. Match the density of the file you are editing.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `apps/web/lib/gallery/library-query.ts` | Pure. Turns query parameters into a Mongo filter and sort. The only part of the API worth unit-testing on its own. |
| `apps/web/lib/gallery/library-query.test.ts` | Its tests. |
| `apps/web/app/api/gallery/admin/library/route.ts` | GET — paged, filtered, sorted list of media for the centre pane. |
| `apps/web/app/api/gallery/admin/facets/route.ts` | GET — the rail's counts: saved views, and the year/operation/mission tree. |
| `apps/web/app/api/gallery/admin/media/[id]/route.ts` | PATCH one item's caption/tags/author/operation/mission. DELETE one item and its bytes. |
| `apps/web/app/api/gallery/admin/bulk/route.ts` | POST — move, add/remove tags, set author, delete, over a selection. |
| `apps/web/app/api/gallery/admin/health/route.ts` | GET the last reconcile report. POST to re-scan, or to index specific not-indexed paths. |
| `apps/web/app/dashboard/j5/tabs/media/MediaTab.tsx` | The three-column shell and the only stateful orchestrator. |
| `apps/web/app/dashboard/j5/tabs/media/useLibrary.ts` | Data hook: fetches items and facets, owns filter state. |
| `apps/web/app/dashboard/j5/tabs/media/LibraryRail.tsx` | Saved views and the archive tree, with counts. |
| `apps/web/app/dashboard/j5/tabs/media/MediaGrid.tsx` | Tile grid with selection. |
| `apps/web/app/dashboard/j5/tabs/media/MediaTable.tsx` | Sortable table with selection and inline caption editing. |
| `apps/web/app/dashboard/j5/tabs/media/Inspector.tsx` | Single-item editor. |
| `apps/web/app/dashboard/j5/tabs/media/BulkPanel.tsx` | Multi-item editor, with the move consequence statement. |
| `apps/web/app/dashboard/j5/tabs/media/HealthView.tsx` | The four disagreement classes and their fixes. |
| `apps/web/styles/media-console.module.css` | The three-column layout and the rail/grid/inspector chrome. |

**Modified:**

| File | Change |
|---|---|
| `apps/web/types/gallery.d.ts` | Add `AdminMediaAPI`, `LibraryFacetsAPI`, `GalleryHealthAPI`. |
| `apps/web/app/dashboard/j5/J5Panel.tsx` | Operations → Media; gate on `canManageGallery`. |
| `apps/web/app/dashboard/j5/page.tsx` | Resolve and pass `canManageGallery`. |

**Deleted:** nothing. `GalleryOperationsTab.tsx` stays on disk and stays reachable until Plan B2 retires it — it is still the only way to create a folder or reorder a stage, and deleting it in the same change that adds its replacement would remove working tooling before the replacement has been used against real data.

---

## Task 1: The library query

The filter and sort that the centre pane's list is built from. Pure, so the awkward parts — a facet that must not filter itself, a search that spans three fields, a sort with a stable tie-break — are testable without a database.

**Files:**
- Create: `apps/web/lib/gallery/library-query.ts`
- Create: `apps/web/lib/gallery/library-query.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type LibraryView = 'all' | 'unknown' | 'nocaption' | 'videos' | 'health'`
  - `type LibrarySort = 'newest' | 'oldest' | 'rated' | 'operation'`
  - `type LibraryParams = { view: LibraryView, year: string | null, operation: string | null, mission: string | null, tag: string | null, author: string | null, kind: 'image' | 'video' | null, q: string | null, sort: LibrarySort, page: number }`
  - `PAGE_SIZE: 60`
  - `parseLibraryParams(search: URLSearchParams): LibraryParams`
  - `buildLibraryFilter(params: LibraryParams): Record<string, unknown>`
  - `buildLibrarySort(sort: LibrarySort): Record<string, 1 | -1>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/gallery/library-query.test.ts`:

```ts
import { describe, test, expect } from 'vitest'

import {
    PAGE_SIZE, buildLibraryFilter, buildLibrarySort, parseLibraryParams,
} from './library-query'

const params = (qs: string) => parseLibraryParams(new URLSearchParams(qs))

describe('parseLibraryParams', () => {
    test('defaults', () => {
        expect(params('')).toEqual({
            view: 'all', year: null, operation: null, mission: null, tag: null,
            author: null, kind: null, q: null, sort: 'newest', page: 0,
        })
    })

    test('reads every parameter', () => {
        const p = params('view=unknown&year=2021&operation=4.+Op+Silent+Ridge&mission=I&tag=funny&author=Koda&kind=video&q=chopper&sort=rated&page=3')
        expect(p.view).toBe('unknown')
        expect(p.year).toBe('2021')
        expect(p.operation).toBe('4. Op Silent Ridge')
        expect(p.mission).toBe('I')
        expect(p.tag).toBe('funny')
        expect(p.author).toBe('Koda')
        expect(p.kind).toBe('video')
        expect(p.q).toBe('chopper')
        expect(p.sort).toBe('rated')
        expect(p.page).toBe(3)
    })

    // An unknown value is a typo or a stale bookmark, not a reason to 500.
    test('falls back rather than trusting unknown values', () => {
        expect(params('view=nonsense').view).toBe('all')
        expect(params('sort=nonsense').sort).toBe('newest')
        expect(params('kind=nonsense').kind).toBeNull()
        expect(params('page=-4').page).toBe(0)
        expect(params('page=notanumber').page).toBe(0)
    })

    test('an empty string is the same as absent', () => {
        expect(params('year=&tag=&q=').year).toBeNull()
        expect(params('q=   ').q).toBeNull()
    })
})

describe('buildLibraryFilter', () => {
    test('every view is scoped to live media', () => {
        for (const view of ['all', 'unknown', 'nocaption', 'videos'] as const) {
            expect(buildLibraryFilter({ ...params(''), view }).status).toBe('live')
        }
    })

    // The rail's Unknown view is the migration cleanup queue. An item is
    // unknown when it has no operation link, however it got that way.
    test('unknown selects items with no operationId', () => {
        expect(buildLibraryFilter(params('view=unknown'))).toMatchObject({
            status: 'live',
            operationId: { $exists: false },
        })
    })

    test('nocaption selects absent and empty captions alike', () => {
        const f = buildLibraryFilter(params('view=nocaption'))
        expect(f).toMatchObject({ status: 'live', caption: { $in: [null, ''] } })
    })

    test('videos selects by kind, and an explicit kind filter still applies', () => {
        expect(buildLibraryFilter(params('view=videos')).kind).toBe('video')
        expect(buildLibraryFilter(params('kind=image')).kind).toBe('image')
    })

    test('tree selections stack', () => {
        const f = buildLibraryFilter(params('year=2021&operation=4.+Op+Silent+Ridge&mission=I'))
        expect(f).toMatchObject({ year: '2021', operation: '4. Op Silent Ridge', mission: 'I' })
    })

    test('tag and author', () => {
        expect(buildLibraryFilter(params('tag=funny')).tags).toBe('funny')
        expect(buildLibraryFilter(params('author=Koda')).authorName).toBe('Koda')
    })

    // Three fields, because a member searching "chopper" means the caption,
    // and a reviewer searching "Koda" means the author.
    test('search spans caption, author and storage key, case-insensitively', () => {
        const f = buildLibraryFilter(params('q=chopper'))
        expect(f.$or).toEqual([
            { caption: { $regex: 'chopper', $options: 'i' } },
            { authorName: { $regex: 'chopper', $options: 'i' } },
            { storageKey: { $regex: 'chopper', $options: 'i' } },
        ])
    })

    // A caption is member-supplied text. Left unescaped, '.*' would scan the
    // whole collection and '(' would throw a driver error.
    test('search escapes regex metacharacters', () => {
        const f = buildLibraryFilter(params('q=a.%2Ab(c%5B'))
        const first = (f.$or as { caption: { $regex: string } }[])[0]
        expect(first.caption.$regex).toBe('a\\.\\*b\\(c\\[')
    })

    test('health is not a database view', () => {
        // The Health view reads gallery_health, not gallery_media — see Task 5.
        expect(buildLibraryFilter(params('view=health'))).toMatchObject({ status: 'live' })
    })
})

describe('buildLibrarySort', () => {
    // Every sort ends in _id. Without it Mongo's order between equal keys is
    // unspecified, so paging through 4,781 items can show one twice and skip
    // another — the archive has thousands of items sharing a takenAt.
    test('every sort has a stable tie-break', () => {
        for (const sort of ['newest', 'oldest', 'rated', 'operation'] as const) {
            expect(Object.keys(buildLibrarySort(sort)).at(-1)).toBe('_id')
        }
    })

    test('newest and oldest are opposite on takenAt', () => {
        expect(buildLibrarySort('newest').takenAt).toBe(-1)
        expect(buildLibrarySort('oldest').takenAt).toBe(1)
    })

    test('rated sorts by up-votes descending', () => {
        expect(buildLibrarySort('rated').up).toBe(-1)
    })

    test('operation sorts by year then operation', () => {
        const s = buildLibrarySort('operation')
        expect(Object.keys(s).slice(0, 2)).toEqual(['year', 'operation'])
    })
})

describe('PAGE_SIZE', () => {
    test('is 60', () => {
        expect(PAGE_SIZE).toBe(60)
    })
})
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd apps/web && npx vitest run lib/gallery/library-query.test.ts
```

Expected: FAIL — `Failed to resolve import "./library-query"`.

- [ ] **Step 3: Write the module**

Create `apps/web/lib/gallery/library-query.ts`:

```ts
/**
 * Turning the Media tab's query string into a Mongo filter and sort.
 *
 * Pure, and separate from the route, because this is where the mistakes are:
 * a search that scans the collection because a caption contained '.*', a page
 * that shows the same photograph twice because the sort had no tie-break, a
 * stale bookmark that 500s because a view name no longer exists. None of that
 * needs a database to test.
 *
 * Every filter is scoped to `status: 'live'`. The Media tab is the archive,
 * not the review queue — pending and rejected items belong to the Submissions
 * tab, which has its own route.
 */

export type LibraryView = 'all' | 'unknown' | 'nocaption' | 'videos' | 'health'
export type LibrarySort = 'newest' | 'oldest' | 'rated' | 'operation'

export type LibraryParams = {
    view: LibraryView
    year: string | null
    operation: string | null
    mission: string | null
    tag: string | null
    author: string | null
    kind: 'image' | 'video' | null
    q: string | null
    sort: LibrarySort
    page: number
}

/** Tiles per page. Sixty fills the grid at every breakpoint without asking a
 *  reviewer to scroll a four-thousand-item list. */
export const PAGE_SIZE = 60

const VIEWS: readonly LibraryView[] = ['all', 'unknown', 'nocaption', 'videos', 'health']
const SORTS: readonly LibrarySort[] = ['newest', 'oldest', 'rated', 'operation']

/** Absent, empty and whitespace-only all mean "not filtering on this". */
function str(search: URLSearchParams, key: string): string | null {
    const raw = search.get(key)
    if (raw === null) return null
    const trimmed = raw.trim()
    return trimmed === '' ? null : trimmed
}

export function parseLibraryParams(search: URLSearchParams): LibraryParams {
    const view = search.get('view')
    const sort = search.get('sort')
    const kind = search.get('kind')
    const page = Number(search.get('page'))

    return {
        // A value that is not in the list is a typo or a stale bookmark. Fall
        // back rather than 500 — the tab is a staff tool, not an API contract.
        view: VIEWS.includes(view as LibraryView) ? (view as LibraryView) : 'all',
        year: str(search, 'year'),
        operation: str(search, 'operation'),
        mission: str(search, 'mission'),
        tag: str(search, 'tag'),
        author: str(search, 'author'),
        kind: kind === 'image' || kind === 'video' ? kind : null,
        q: str(search, 'q'),
        sort: SORTS.includes(sort as LibrarySort) ? (sort as LibrarySort) : 'newest',
        page: Number.isInteger(page) && page > 0 ? page : 0,
    }
}

/** A caption is member-supplied. Unescaped, '.*' scans the whole collection
 *  and an unbalanced '(' throws inside the driver. */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildLibraryFilter(params: LibraryParams): Record<string, unknown> {
    const filter: Record<string, unknown> = { status: 'live' }

    if (params.view === 'unknown') filter.operationId = { $exists: false }
    // Absent and empty both mean uncaptioned: the migration writes neither,
    // and a reviewer who clears a caption leaves an empty string.
    if (params.view === 'nocaption') filter.caption = { $in: [null, ''] }
    if (params.view === 'videos') filter.kind = 'video'

    if (params.year) filter.year = params.year
    if (params.operation) filter.operation = params.operation
    if (params.mission) filter.mission = params.mission
    if (params.tag) filter.tags = params.tag
    if (params.author) filter.authorName = params.author
    // After the view, so an explicit kind filter wins over the Videos view
    // rather than silently disagreeing with the chip the reviewer can see.
    if (params.kind) filter.kind = params.kind

    if (params.q) {
        const pattern = escapeRegex(params.q)
        filter.$or = [
            { caption: { $regex: pattern, $options: 'i' } },
            { authorName: { $regex: pattern, $options: 'i' } },
            { storageKey: { $regex: pattern, $options: 'i' } },
        ]
    }

    return filter
}

/**
 * Every sort ends in `_id`.
 *
 * Mongo's order between documents with equal sort keys is unspecified, and the
 * archive has thousands of items sharing a `takenAt` — one operation's whole
 * weekend carries the same date. Without a tie-break, paging through them can
 * show one photograph twice and never show another.
 */
export function buildLibrarySort(sort: LibrarySort): Record<string, 1 | -1> {
    switch (sort) {
        case 'oldest': return { takenAt: 1, _id: 1 }
        case 'rated': return { up: -1, _id: 1 }
        case 'operation': return { year: 1, operation: 1, mission: 1, _id: 1 }
        default: return { takenAt: -1, _id: 1 }
    }
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd apps/web && npx vitest run lib/gallery/library-query.test.ts
```

Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/lib/gallery/library-query.ts apps/web/lib/gallery/library-query.test.ts
git commit -m "feat(gallery): the media library's filter and sort

Pure, because this is where the mistakes are: an unescaped caption that
scans the collection, a sort with no tie-break that shows one photograph
twice while skipping another, a stale bookmark that 500s."
```

---

## Task 2: The library and facets routes

Two GETs. One answers "what am I looking at", the other "what could I look at, and how many of each". They are separate because the rail's counts are expensive — they aggregate the whole collection — and the centre pane refetches on every page change, filter chip and search keystroke.

**Files:**
- Create: `apps/web/app/api/gallery/admin/library/route.ts`
- Create: `apps/web/app/api/gallery/admin/facets/route.ts`
- Modify: `apps/web/types/gallery.d.ts`

**Interfaces:**
- Consumes: `parseLibraryParams`, `buildLibraryFilter`, `buildLibrarySort`, `PAGE_SIZE` (Task 1).
- Produces:
  - `AdminMediaAPI` — one row as the tab receives it.
  - `LibraryFacetsAPI` — rail counts.
  - `GET /api/gallery/admin/library` → `{ items: AdminMediaAPI[], total: number, page: number, pageSize: number }`
  - `GET /api/gallery/admin/facets` → `LibraryFacetsAPI`

- [ ] **Step 1: Add the ambient types**

In `apps/web/types/gallery.d.ts`, inside the existing `declare global { }` block, add:

```ts
    /**
     * One media row as the J5 Media tab receives it. Distinct from
     * GalleryItemAPI, which is what the public gallery gets: this one carries
     * the storage key and the on-disk filename, because the tab shows a
     * reviewer exactly where the bytes are, and omits the Wilson score, which
     * only the public sort needs.
     */
    interface AdminMediaAPI {
        id: string
        kind: 'image' | 'video'
        source: 'upload' | 'youtube' | 'twitch'
        src: string | null
        poster: string | null

        year: string | null
        operation: string | null
        opLabel: string | null
        mission: string | null
        operationId: string | null
        takenAt: string | null

        authorId: string | null
        authorName: string | null
        caption: string | null
        tags: string[]

        width: number | null
        height: number | null
        durationSec: number | null
        bytes: number | null

        /** The full storage key, shown verbatim in the inspector — the
         *  bracketed id in it is the contract that lets a file be moved by
         *  hand, so a reviewer is shown it rather than told about it. */
        storageKey: string | null

        up: number
        down: number
        publishedAt: string | null
    }

    /** The Media tab's left rail: saved views on top, the archive tree below,
     *  every row carrying a live count. */
    interface LibraryFacetsAPI {
        views: { all: number, unknown: number, nocaption: number, videos: number, health: number }
        years: {
            year: string
            count: number
            operations: {
                operation: string
                opLabel: string
                count: number
                missions: { mission: string, count: number }[]
            }[]
        }[]
        /** For the filter chips — every tag and author actually in use. */
        tags: { slug: string, label: string, count: number }[]
        authors: { name: string, count: number }[]
    }
```

- [ ] **Step 2: Write the library route**

Create `apps/web/app/api/gallery/admin/library/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { PAGE_SIZE, buildLibraryFilter, buildLibrarySort, parseLibraryParams } from '@/lib/gallery/library-query'

/**
 * The Media tab's centre pane.
 *
 * Separate from the facets route because this refetches on every keystroke,
 * chip and page while the rail's counts aggregate the whole collection. Paying
 * for both on every interaction would make typing in the search box aggregate
 * 4,781 documents per character.
 *
 * Gated with gallery.manage, like every sibling under admin/ — this returns
 * storage keys and author ids, which the public gallery route deliberately
 * does not.
 */

function srcFor(doc: GalleryMedia): string | null {
    if (doc.source !== 'upload') return null
    return doc.storageKey ? `/api/gallery/media/${doc._id.toString()}` : null
}

export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !await hasPermission(me, 'gallery.manage')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const params = parseLibraryParams(new URL(request.url).searchParams)
    const filter = buildLibraryFilter(params)

    const [items, total] = await Promise.all([
        Db.galleryMedia
            .find(filter)
            .sort(buildLibrarySort(params.sort))
            .skip(params.page * PAGE_SIZE)
            .limit(PAGE_SIZE)
            .toArray(),
        Db.galleryMedia.countDocuments(filter),
    ])

    const rows: AdminMediaAPI[] = items.map(doc => ({
        id: doc._id.toString(),
        kind: doc.kind,
        source: doc.source,
        src: srcFor(doc),
        poster: doc.posterKey ? `/api/gallery/media/${doc._id.toString()}/poster` : null,
        year: doc.year ?? null,
        operation: doc.operation ?? null,
        opLabel: doc.opLabel ?? null,
        mission: doc.mission ?? null,
        operationId: doc.operationId?.toString() ?? null,
        takenAt: doc.takenAt ? doc.takenAt.toISOString() : null,
        authorId: doc.authorId ?? null,
        authorName: doc.authorName ?? null,
        caption: doc.caption ?? null,
        tags: doc.tags ?? [],
        width: doc.width ?? null,
        height: doc.height ?? null,
        durationSec: doc.durationSec ?? null,
        bytes: doc.bytes ?? null,
        storageKey: doc.storageKey ?? null,
        up: doc.up ?? 0,
        down: doc.down ?? 0,
        publishedAt: doc.publishedAt ? doc.publishedAt.toISOString() : null,
    }))

    return NextResponse.json({ items: rows, total, page: params.page, pageSize: PAGE_SIZE })
}
```

- [ ] **Step 3: Write the facets route**

Create `apps/web/app/api/gallery/admin/facets/route.ts`:

```ts
import { NextResponse } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

/**
 * The Media tab's left rail.
 *
 * Every row carries a count, because "1,157 unknown" is a job a reviewer can
 * watch shrink, while an uncounted row is a folder they have to open to find
 * out whether it is worth opening.
 *
 * One aggregation for the tree rather than one query per node: the archive has
 * 5 years, 88 operations and several hundred missions, and a query per node
 * would be several hundred round trips every time the tab mounts.
 */

type TreeRow = { _id: { year: string | null, operation: string | null, opLabel: string | null, mission: string | null }, count: number }

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !await hasPermission(me, 'gallery.manage')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const live = { status: 'live' }

    const [all, unknown, nocaption, videos, health, tree, tagDocs, tagCounts, authorCounts] = await Promise.all([
        Db.galleryMedia.countDocuments(live),
        Db.galleryMedia.countDocuments({ ...live, operationId: { $exists: false } }),
        Db.galleryMedia.countDocuments({ ...live, caption: { $in: [null, ''] } }),
        Db.galleryMedia.countDocuments({ ...live, kind: 'video' }),
        Db.galleryHealth.findOne({}),
        Db.galleryMedia.aggregate<TreeRow>([
            { $match: live },
            { $group: { _id: { year: '$year', operation: '$operation', opLabel: '$opLabel', mission: '$mission' }, count: { $sum: 1 } } },
        ]).toArray(),
        Db.galleryTags.find({}).toArray(),
        Db.galleryMedia.aggregate<{ _id: string, count: number }>([
            { $match: live }, { $unwind: '$tags' }, { $group: { _id: '$tags', count: { $sum: 1 } } },
        ]).toArray(),
        Db.galleryMedia.aggregate<{ _id: string, count: number }>([
            { $match: { ...live, authorName: { $type: 'string' } } },
            { $group: { _id: '$authorName', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]).toArray(),
    ])

    /* Assembled here rather than in the aggregation because the tree is small
       (a few hundred rows) and $group cannot nest. A missing year or operation
       is filed under 'Unknown' rather than dropped — those are exactly the
       items a reviewer opened this tab to fix. */
    const years = new Map<string, Map<string, { opLabel: string, count: number, missions: Map<string, number> }>>()

    for (const row of tree) {
        const year = row._id.year ?? 'Unknown'
        const operation = row._id.operation ?? 'Unknown'
        const opLabel = row._id.opLabel ?? operation

        const ops = years.get(year) ?? new Map()
        years.set(year, ops)

        const op = ops.get(operation) ?? { opLabel, count: 0, missions: new Map<string, number>() }
        ops.set(operation, op)

        op.count += row.count
        if (row._id.mission) op.missions.set(row._id.mission, (op.missions.get(row._id.mission) ?? 0) + row.count)
    }

    const facets: LibraryFacetsAPI = {
        views: {
            all,
            unknown,
            nocaption,
            videos,
            health: health
                ? health.missingFiles.length + health.notIndexed.length + health.failedProcessing.length
                : 0,
        },
        // Descending, so the years with the most work sit at the top —
        // and 'Unknown' sorts last by name, which is where it belongs.
        years: [...years.entries()]
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([year, ops]) => ({
                year,
                count: [...ops.values()].reduce((n, op) => n + op.count, 0),
                operations: [...ops.entries()]
                    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
                    .map(([operation, op]) => ({
                        operation,
                        opLabel: op.opLabel,
                        count: op.count,
                        missions: [...op.missions.entries()]
                            .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
                            .map(([mission, count]) => ({ mission, count })),
                    })),
            })),
        tags: tagDocs
            .filter(t => !t.retired)
            .sort((a, b) => a.order - b.order)
            .map(t => ({
                slug: t.slug,
                label: t.label,
                count: tagCounts.find(c => c._id === t.slug)?.count ?? 0,
            })),
        authors: authorCounts.map(a => ({ name: a._id, count: a.count })),
    }

    return NextResponse.json(facets)
}
```

- [ ] **Step 4: Typecheck and lint**

```bash
cd apps/web && npx tsc --noEmit && npm run lint
```

Expected: both clean. If `Db.galleryMedia.aggregate<TreeRow>` fights the driver's types, widen `TreeRow` rather than casting — a cast here would hide a real shape mismatch.

- [ ] **Step 5: Run the whole suite**

```bash
cd apps/web && npx vitest run
```

Expected: all pass. These are new routes with no existing consumers, so nothing should move.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/app/api/gallery/admin/library apps/web/app/api/gallery/admin/facets apps/web/types/gallery.d.ts
git commit -m "feat(gallery): the media library and facet routes

Two GETs, split deliberately: the centre pane refetches on every
keystroke while the rail's counts aggregate the whole collection, and
paying for both on every interaction would aggregate 4,781 documents per
character typed."
```

---

## Task 3: Editing and deleting one item

**Files:**
- Create: `apps/web/app/api/gallery/admin/media/[id]/route.ts`

**Interfaces:**
- Consumes: `relocateMedia` from `@/lib/gallery/relocate`; `resolveStorageKey` from `@/lib/gallery/paths`.
- Produces: `PATCH /api/gallery/admin/media/[id]`, `DELETE /api/gallery/admin/media/[id]`.

- [ ] **Step 1: Write the route**

Create `apps/web/app/api/gallery/admin/media/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { unlinkSync } from 'fs'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { logAction } from '@/lib/logAction'
import { relocateMedia } from '@/lib/gallery/relocate'
import { resolveStorageKey } from '@/lib/gallery/paths'

/**
 * Editing one archive item.
 *
 * Reassigning an operation is not a metadata change — it moves the file on
 * disk, because the folder a file sits in is what a human reads when they open
 * a downloaded backup, and the two must never disagree. That is why this
 * route calls relocateMedia rather than just writing the fields.
 *
 * Editing a legacy item also renames its file to carry its media id, which is
 * how the archive converts to the id-carrying scheme gradually: no mass rename
 * of 4,781 files, and every file a human has touched gains the property that
 * makes moving it by hand safe. relocateMedia does that as a side effect of
 * building the new name.
 */

async function manager() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    return await hasPermission(me, 'gallery.manage') ? me : null
}

function managerName(me: { guild?: { displayName?: string | null } | null, globalName?: string | null, username: string }): string {
    return me.guild?.displayName || me.globalName || me.username
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await manager()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const _id = new ObjectId(id)

    const doc = await Db.galleryMedia.findOne({ _id })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { caption, tags, authorName, operationId, mission } = await request.json().catch(() => ({}))

    const set: Record<string, unknown> = {}
    const unset: Record<string, ''> = {}

    if (typeof caption === 'string') {
        const trimmed = caption.trim().slice(0, 500)
        if (trimmed) set.caption = trimmed; else unset.caption = ''
    }

    if (Array.isArray(tags)) {
        // Only slugs that exist in the vocabulary — a client sending an
        // arbitrary string would otherwise create a tag nobody can filter by.
        const known = await Db.galleryTags
            .find({ slug: { $in: tags.filter((t): t is string => typeof t === 'string') } }, { projection: { slug: 1 } })
            .toArray()
        set.tags = known.map(t => t.slug)
    }

    if (typeof authorName === 'string') {
        const trimmed = authorName.trim().slice(0, 120)
        if (trimmed) set.authorName = trimmed; else unset.authorName = ''
    }

    if (typeof mission === 'string') {
        const trimmed = mission.trim().slice(0, 60)
        if (trimmed) set.mission = trimmed; else unset.mission = ''
    }

    /* The operation is written here but the facets that hang off it are not:
       relocateMedia re-derives year, operation, opLabel and takenAt from the
       operation record and the folder it resolves, so writing them here too
       would give two producers of the same fields a chance to disagree —
       which is exactly the defect this feature spent three rounds closing. */
    let moving = false
    if (operationId !== undefined) {
        if (operationId === null || operationId === 'unknown') {
            unset.operationId = ''
            moving = true
        } else if (ObjectId.isValid(String(operationId))) {
            const op = await Db.operations.findOne({ _id: new ObjectId(String(operationId)) }, { projection: { _id: 1 } })
            if (!op) return NextResponse.json({ error: 'No such operation' }, { status: 400 })
            set.operationId = op._id
            moving = true
        } else {
            return NextResponse.json({ error: 'No such operation' }, { status: 400 })
        }
    }

    if (!Object.keys(set).length && !Object.keys(unset).length) {
        return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
    }

    await Db.galleryMedia.updateOne({ _id }, {
        ...(Object.keys(set).length ? { $set: set } : {}),
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
    })

    /* After the write, so relocateMedia reads the caption and author the
       reviewer just set and builds the filename from them. Also runs when only
       the caption changed: that changes the readable filename, and a name on
       disk that disagrees with the database is what reconcile then has to
       repair. */
    if (doc.source === 'upload' && doc.storageKey) {
        try {
            await relocateMedia({ media: Db.galleryMedia, operations: Db.operations }, _id)
        } catch (err) {
            console.error('[gallery/admin] relocate failed for', id, err)
            return NextResponse.json({
                error: 'The details were saved, but the file could not be moved. Run a gallery re-scan from the Health view.',
            }, { status: 500 })
        }
    }

    await logAction({
        action: 'gallery.media.edit',
        category: 'gallery',
        performedBy: me.id,
        performedByName: managerName(me),
        department: 'j5',
        entityType: 'gallery_media',
        entityId: id,
        actionUrl: '/dashboard/j5',
        target: doc.caption || doc.opLabel || undefined,
        details: { moved: moving },
    })

    const updated = await Db.galleryMedia.findOne({ _id })
    return NextResponse.json({ success: true, storageKey: updated?.storageKey ?? null })
}

/** Delete the record and its bytes. The only removal path — see spec §3, N1. */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await manager()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const _id = new ObjectId(id)

    const doc = await Db.galleryMedia.findOne({ _id })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    /* The record goes first, then the bytes. If the unlink fails the item is
       already gone from the gallery and an orphaned file remains, which the
       Health view reports and a human can clear. The reverse — bytes deleted,
       record surviving — is a permanently broken tile. */
    await Db.galleryMedia.deleteOne({ _id })

    for (const key of [doc.storageKey, doc.posterKey]) {
        if (!key) continue
        const file = resolveStorageKey(key)
        if (file) { try { unlinkSync(file) } catch { /* already gone */ } }
    }

    await Db.galleryVotes.deleteMany({ mediaId: _id })

    await logAction({
        action: 'gallery.media.delete',
        category: 'gallery',
        performedBy: me.id,
        performedByName: managerName(me),
        department: 'j5',
        entityType: 'gallery_media',
        entityId: id,
        actionUrl: '/dashboard/j5',
        target: doc.caption || doc.opLabel || undefined,
    })

    return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Typecheck, lint and run the suite**

```bash
cd apps/web && npx tsc --noEmit && npm run lint && npx vitest run
```

Expected: all clean.

- [ ] **Step 3: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add "apps/web/app/api/gallery/admin/media"
git commit -m "feat(gallery): edit and delete one archive item

Reassigning an operation moves the file, because the folder a file sits
in is what a human reads in a downloaded backup and the two must never
disagree. Editing a legacy item also renames it to carry its media id,
which is how the archive converts to the id scheme without a mass
rename."
```

---

## Task 4: Bulk operations

The cleanup path for the ~1,157 files the migration cannot date. One request, one selection, one action.

**Files:**
- Create: `apps/web/app/api/gallery/admin/bulk/route.ts`

**Interfaces:**
- Consumes: `relocateMedia`, `resolveStorageKey`.
- Produces: `POST /api/gallery/admin/bulk` with body `{ ids: string[], action: 'move' | 'addTags' | 'removeTags' | 'setAuthor' | 'delete', operationId?: string | null, tags?: string[], authorName?: string }` → `{ success: true, changed: number, failed: { id: string, error: string }[] }`

- [ ] **Step 1: Write the route**

Create `apps/web/app/api/gallery/admin/bulk/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { unlinkSync } from 'fs'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { logAction } from '@/lib/logAction'
import { relocateMedia } from '@/lib/gallery/relocate'
import { resolveStorageKey } from '@/lib/gallery/paths'

/**
 * One action over a selection.
 *
 * This is how the ~1,157 files the migration could not date get an operation:
 * a reviewer selects a folder's worth and moves them in one go.
 *
 * A move is applied one item at a time, sequentially. It renames files, and
 * running those concurrently against the same operation folder races on the
 * folder's creation and on the next-order-number scan. A selection is at most
 * a page of sixty, so sequential is fast enough and correct.
 *
 * Partial success is reported rather than rolled back. There is no transaction
 * across a filesystem and a database, and a reviewer who moved sixty items of
 * which two failed is better served by being told which two than by having the
 * other fifty-eight silently reverted.
 */

const MAX_IDS = 500

async function manager() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    return await hasPermission(me, 'gallery.manage') ? me : null
}

export async function POST(request: NextRequest) {
    const me = await manager()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const { action, operationId, tags, authorName } = body

    const ids: ObjectId[] = (Array.isArray(body.ids) ? body.ids : [])
        .filter((v: unknown): v is string => typeof v === 'string' && ObjectId.isValid(v))
        .slice(0, MAX_IDS)
        .map((v: string) => new ObjectId(v))

    if (!ids.length) return NextResponse.json({ error: 'Nothing selected' }, { status: 400 })

    const failed: { id: string, error: string }[] = []
    let changed = 0

    if (action === 'move') {
        let opId: ObjectId | null = null
        if (operationId && operationId !== 'unknown') {
            if (!ObjectId.isValid(String(operationId))) return NextResponse.json({ error: 'No such operation' }, { status: 400 })
            const op = await Db.operations.findOne({ _id: new ObjectId(String(operationId)) }, { projection: { _id: 1 } })
            if (!op) return NextResponse.json({ error: 'No such operation' }, { status: 400 })
            opId = op._id
        }

        // Sequential — see the module comment. Concurrent renames race on the
        // operation folder's creation and its next-order-number scan.
        for (const _id of ids) {
            try {
                await Db.galleryMedia.updateOne({ _id }, opId
                    ? { $set: { operationId: opId } }
                    : { $unset: { operationId: '' } })
                await relocateMedia({ media: Db.galleryMedia, operations: Db.operations }, _id)
                changed++
            } catch (err) {
                failed.push({ id: _id.toString(), error: err instanceof Error ? err.message : 'Move failed' })
            }
        }
    } else if (action === 'addTags' || action === 'removeTags') {
        const known = await Db.galleryTags
            .find({ slug: { $in: (Array.isArray(tags) ? tags : []).filter((t: unknown): t is string => typeof t === 'string') } }, { projection: { slug: 1 } })
            .toArray()
        const slugs = known.map(t => t.slug)
        if (!slugs.length) return NextResponse.json({ error: 'No known tags given' }, { status: 400 })

        const result = await Db.galleryMedia.updateMany({ _id: { $in: ids } }, action === 'addTags'
            ? { $addToSet: { tags: { $each: slugs } } }
            : { $pullAll: { tags: slugs } })
        changed = result.modifiedCount
    } else if (action === 'setAuthor') {
        const name = String(authorName ?? '').trim().slice(0, 120)
        const result = name
            ? await Db.galleryMedia.updateMany({ _id: { $in: ids } }, { $set: { authorName: name } })
            : await Db.galleryMedia.updateMany({ _id: { $in: ids } }, { $unset: { authorName: '' } })
        changed = result.modifiedCount
    } else if (action === 'delete') {
        const docs = await Db.galleryMedia.find({ _id: { $in: ids } }).toArray()
        // Records first, then bytes — same reasoning as the single delete: an
        // orphaned file is reported by Health, a record with no bytes is a
        // permanently broken tile.
        await Db.galleryMedia.deleteMany({ _id: { $in: ids } })
        await Db.galleryVotes.deleteMany({ mediaId: { $in: ids } })

        for (const doc of docs) {
            for (const key of [doc.storageKey, doc.posterKey]) {
                if (!key) continue
                const file = resolveStorageKey(key)
                if (file) { try { unlinkSync(file) } catch { /* already gone */ } }
            }
        }
        changed = docs.length
    } else {
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    await logAction({
        action: `gallery.media.bulk.${action}`,
        category: 'gallery',
        performedBy: me.id,
        performedByName: me.guild?.displayName || me.globalName || me.username,
        department: 'j5',
        entityType: 'gallery_media',
        entityId: ids[0].toString(),
        actionUrl: '/dashboard/j5',
        details: { count: ids.length, changed, failed: failed.length },
    })

    return NextResponse.json({ success: true, changed, failed })
}
```

- [ ] **Step 2: Typecheck, lint and run the suite**

```bash
cd apps/web && npx tsc --noEmit && npm run lint && npx vitest run
```

Expected: all clean.

- [ ] **Step 3: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/app/api/gallery/admin/bulk
git commit -m "feat(gallery): bulk move, tag, author and delete

The cleanup path for the files the migration cannot date. Moves run
sequentially because concurrent renames race on the operation folder's
creation, and partial success is reported rather than rolled back —
there is no transaction across a filesystem and a database."
```

---

## Task 5: The health route

**Files:**
- Create: `apps/web/app/api/gallery/admin/health/route.ts`

**Interfaces:**
- Consumes: `reconcile` from `@/lib/gallery/reconcile`.
- Produces:
  - `GET /api/gallery/admin/health` → the persisted `GalleryHealth` document, or `null`.
  - `POST /api/gallery/admin/health` with `{ action: 'rescan' }` → runs reconcile, persists, returns the report.
  - `POST /api/gallery/admin/health` with `{ action: 'index', paths: string[] }` → indexes those not-indexed files.

- [ ] **Step 1: Write the route**

Create `apps/web/app/api/gallery/admin/health/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { statSync } from 'fs'
import path from 'path'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { logAction } from '@/lib/logAction'
import { reconcile } from '@/lib/gallery/reconcile'
import { parseContentPath } from '@/lib/gallery/content-path'
import { CONTENT_DIR, contentKey } from '@/lib/gallery/paths'

/**
 * Where the database and the disk disagree, and what to do about it.
 *
 * GET reads the last persisted report rather than re-walking 4,781 files on
 * every page load. POST { action: 'rescan' } is the "Re-scan disk" the
 * reconcile module's own comments refer to.
 *
 * Indexing is explicit and never automatic: reconcile reports a file it does
 * not recognise, and a human decides it should exist. That asymmetry is the
 * whole safety property — a half-finished restore looks exactly like a folder
 * of new files, and only a person can tell the difference.
 */

async function manager() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    return await hasPermission(me, 'gallery.manage') ? me : null
}

export async function GET() {
    const me = await manager()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const report = await Db.galleryHealth.findOne({})
    return NextResponse.json({ report })
}

export async function POST(request: NextRequest) {
    const me = await manager()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { action, paths } = await request.json().catch(() => ({}))

    if (action === 'rescan') {
        const report = await reconcile({ media: Db.galleryMedia, operations: Db.operations })
        await Db.galleryHealth.replaceOne({}, report, { upsert: true })

        await logAction({
            action: 'gallery.health.rescan',
            category: 'gallery',
            performedBy: me.id,
            performedByName: me.guild?.displayName || me.globalName || me.username,
            department: 'j5',
            entityType: 'gallery_media',
            entityId: 'health',
            actionUrl: '/dashboard/j5',
            details: {
                scanned: report.scanned,
                relocated: report.relocated.length,
                notIndexed: report.notIndexed.length,
                missing: report.missingFiles.length,
            },
        })

        return NextResponse.json({ report })
    }

    if (action === 'index') {
        const wanted = (Array.isArray(paths) ? paths : []).filter((p: unknown): p is string => typeof p === 'string')
        if (!wanted.length) return NextResponse.json({ error: 'Nothing to index' }, { status: 400 })

        /* Only paths the last report actually listed as not-indexed. The
           request body is staff-supplied, and indexing an arbitrary relative
           path would let a typo create a record pointing anywhere in the
           content tree. */
        const report = await Db.galleryHealth.findOne({})
        const allowed = new Set((report?.notIndexed ?? []).map(n => n.path))

        let indexed = 0
        for (const relative of wanted) {
            if (!allowed.has(relative)) continue

            const facets = parseContentPath(relative)
            if (!facets) continue

            const absolute = path.join(CONTENT_DIR, ...relative.split('/'))
            let bytes = 0
            try { bytes = statSync(absolute).size } catch { continue }

            const isVideo = /\.(mp4|webm|mov)$/i.test(facets.file)

            await Db.galleryMedia.updateOne(
                { storageKey: contentKey(relative) },
                {
                    $setOnInsert: {
                        kind: isVideo ? 'video' : 'image',
                        source: 'upload',
                        storageKey: contentKey(relative),
                        ...(facets.year ? { year: facets.year } : {}),
                        ...(facets.operation ? { operation: facets.operation, opLabel: facets.operation } : {}),
                        ...(facets.mission ? { mission: facets.mission } : {}),
                        // Null, not a guessed date. A reviewer assigns the
                        // operation from the Media tab and takenAt follows it.
                        takenAt: null,
                        tags: [],
                        bytes,
                        status: 'live',
                        up: 0,
                        down: 0,
                        createdAt: new Date(),
                    },
                },
                { upsert: true },
            )
            indexed++
        }

        // Re-scan so the report reflects what was just indexed rather than
        // continuing to list them as missing.
        const fresh = await reconcile({ media: Db.galleryMedia, operations: Db.operations })
        await Db.galleryHealth.replaceOne({}, fresh, { upsert: true })

        return NextResponse.json({ indexed, report: fresh })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
```

- [ ] **Step 2: Typecheck, lint and run the suite**

```bash
cd apps/web && npx tsc --noEmit && npm run lint && npx vitest run
```

Expected: all clean.

- [ ] **Step 3: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/app/api/gallery/admin/health
git commit -m "feat(gallery): the health route, and Re-scan disk

Indexing is explicit and never automatic, and only over paths the last
report listed: a half-finished restore looks exactly like a folder of
new files, and only a person can tell the difference."
```

---

## Task 6: The Media tab — shell, rail and grid

The first visible change. After this task a reviewer can open J5, see the whole archive, and browse it by view, tree node, tag, author and search. Editing arrives in Task 7.

**Files:**
- Create: `apps/web/styles/media-console.module.css`
- Create: `apps/web/app/dashboard/j5/tabs/media/useLibrary.ts`
- Create: `apps/web/app/dashboard/j5/tabs/media/LibraryRail.tsx`
- Create: `apps/web/app/dashboard/j5/tabs/media/MediaGrid.tsx`
- Create: `apps/web/app/dashboard/j5/tabs/media/MediaTab.tsx`
- Modify: `apps/web/app/dashboard/j5/page.tsx`
- Modify: `apps/web/app/dashboard/j5/J5Panel.tsx`

**Interfaces:**
- Consumes: `AdminMediaAPI`, `LibraryFacetsAPI`, `GET /api/gallery/admin/library`, `GET /api/gallery/admin/facets`.
- Produces:
  - `useLibrary()` → `{ items, total, facets, params, setParam, loading, page, setPage, refresh }`
  - `<LibraryRail facets params onSelect />`
  - `<MediaGrid items selected onToggle onOpen />`
  - `<MediaTab />`

- [ ] **Step 1: Write the stylesheet**

Create `apps/web/styles/media-console.module.css`:

```css
/* The J5 Media tab's three-column workspace.

   A CSS module rather than MUI sx props: this is a layout with a scrolling
   rail, a scrolling centre and a sticky inspector, and expressing that in sx
   objects spread across four components is how the dashboard's other tabs
   ended up with their layout in five places at once. The controls inside stay
   MUI, matching every other tab. */

.work {
    display: grid;
    grid-template-columns: 210px 1fr 320px;
    gap: 0;
    border: 1px solid rgba(219, 0, 29, 0.18);
    background: rgba(255, 255, 255, 0.012);
    min-height: 560px;
}
.work > * { min-width: 0; }

/* ── rail ───────────────────────────────────────────────────────────── */
.rail {
    border-right: 1px solid rgba(219, 0, 29, 0.14);
    padding: 10px 0;
    max-height: 70vh;
    overflow-y: auto;
}
.railHead {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(237, 237, 237, 0.38);
    padding: 0 12px;
    margin: 0 0 6px;
}
.railHead + .railHead { margin-top: 18px; }

.row {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 5px 12px;
    border: 0;
    border-left: 2px solid transparent;
    background: none;
    color: rgba(237, 237, 237, 0.62);
    font-family: var(--font-cond);
    font-size: 13.5px;
    letter-spacing: 0.03em;
    text-align: left;
    cursor: pointer;
}
.row:hover { background: rgba(255, 255, 255, 0.03); color: var(--foreground); }
.row:focus-visible { outline: 1px solid var(--red); outline-offset: -1px; }
.rowOn {
    background: rgba(219, 0, 29, 0.1);
    border-left-color: var(--red);
    color: var(--foreground);
}
.rowSub { padding-left: 26px; font-size: 12.5px; }
.rowSubSub { padding-left: 40px; font-size: 12px; }

.count {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 10px;
    color: rgba(237, 237, 237, 0.38);
    font-variant-numeric: tabular-nums;
}
.rowOn .count { color: var(--red-hi); }
.caret { width: 9px; flex: none; font-size: 9px; color: rgba(237, 237, 237, 0.38); }

/* ── centre ─────────────────────────────────────────────────────────── */
.centre { display: flex; flex-direction: column; }
.tools {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border-bottom: 1px solid rgba(219, 0, 29, 0.14);
    flex-wrap: wrap;
}
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
    padding: 12px;
    align-content: start;
    max-height: 62vh;
    overflow-y: auto;
}
.tile {
    position: relative;
    aspect-ratio: 16 / 10;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
    padding: 0;
    cursor: pointer;
    overflow: hidden;
}
.tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tile:focus-visible { outline: 1px solid var(--red); outline-offset: 1px; }
.tileOn { border-color: var(--red); box-shadow: inset 0 0 0 1px var(--red); }

.check {
    position: absolute;
    top: 5px; left: 5px;
    width: 15px; height: 15px;
    border: 1px solid rgba(255, 255, 255, 0.55);
    background: rgba(0, 0, 0, 0.5);
}
.tileOn .check { background: var(--red); border-color: var(--red); }

.badge {
    position: absolute;
    top: 5px; right: 5px;
    font-family: var(--font-mono);
    font-size: 8px;
    letter-spacing: 0.08em;
    padding: 2px 5px;
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
}
.badgeWarn { background: rgba(216, 172, 69, 0.92); color: #1a1400; }

.cap {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    padding: 14px 6px 5px;
    font-family: var(--font-cond);
    font-size: 11px;
    color: #fff;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.88));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
}

.empty {
    padding: 48px 16px;
    text-align: center;
    color: rgba(237, 237, 237, 0.38);
    font-size: 13px;
}
.pager {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: center;
    padding: 10px;
    border-top: 1px solid rgba(219, 0, 29, 0.14);
}

/* ── inspector ──────────────────────────────────────────────────────── */
.insp {
    border-left: 1px solid rgba(219, 0, 29, 0.14);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 70vh;
    overflow-y: auto;
}
.inspHead {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(237, 237, 237, 0.38);
    display: flex;
    align-items: center;
    gap: 8px;
}
.preview { aspect-ratio: 16 / 10; border: 1px solid rgba(255, 255, 255, 0.06); }
.preview img, .preview video { width: 100%; height: 100%; object-fit: contain; display: block; }

.facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 11.5px; align-items: baseline; }
.facts dt {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: rgba(237, 237, 237, 0.38);
}
.facts dd { margin: 0; color: rgba(237, 237, 237, 0.62); font-variant-numeric: tabular-nums; }

/* The path is shown in full, because the bracketed id in it is the contract
   that lets a file be dragged to another folder and still be recognised. */
.path {
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1.6;
    color: rgba(237, 237, 237, 0.62);
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.06);
    padding: 7px 8px;
    word-break: break-all;
}

.consequence {
    border: 1px solid rgba(216, 172, 69, 0.3);
    background: rgba(216, 172, 69, 0.07);
    padding: 9px 10px;
    font-size: 11.5px;
    line-height: 1.6;
    color: rgba(237, 237, 237, 0.62);
}
.consequence b { color: var(--foreground); }

@media (max-width: 1180px) {
    .work { grid-template-columns: 190px 1fr; }
    .insp { grid-column: 1 / -1; border-left: 0; border-top: 1px solid rgba(219, 0, 29, 0.14); max-height: none; }
}
@media (max-width: 760px) {
    .work { grid-template-columns: 1fr; }
    .rail { border-right: 0; border-bottom: 1px solid rgba(219, 0, 29, 0.14); max-height: 240px; }
}
```

- [ ] **Step 2: Write the data hook**

Create `apps/web/app/dashboard/j5/tabs/media/useLibrary.ts`:

```ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { LibraryParams } from '@/lib/gallery/library-query'

/**
 * The Media tab's server state.
 *
 * Items and facets are fetched separately because they change on different
 * schedules: the list refetches on every filter and keystroke, the rail's
 * counts only after something is edited. Refetching the counts on every
 * keystroke would aggregate the whole collection per character typed.
 *
 * The search box is debounced, and an in-flight request is abandoned when a
 * newer one starts — without that, typing "chopper" fires seven requests whose
 * responses can arrive out of order and leave the grid showing the results for
 * "chopp".
 */

type Filters = Omit<LibraryParams, 'page'>

const EMPTY: Filters = {
    view: 'all', year: null, operation: null, mission: null,
    tag: null, author: null, kind: null, q: null, sort: 'newest',
}

export function useLibrary() {
    const [filters, setFilters] = useState<Filters>(EMPTY)
    const [page, setPage] = useState(0)
    const [items, setItems] = useState<AdminMediaAPI[]>([])
    const [total, setTotal] = useState(0)
    const [facets, setFacets] = useState<LibraryFacetsAPI | null>(null)
    const [loading, setLoading] = useState(true)

    const requestId = useRef(0)

    const query = useCallback((f: Filters, p: number) => {
        const search = new URLSearchParams()
        for (const [key, value] of Object.entries(f)) {
            if (value !== null && value !== '') search.set(key, String(value))
        }
        if (p > 0) search.set('page', String(p))
        return search.toString()
    }, [])

    const loadFacets = useCallback(async () => {
        const res = await fetch('/api/gallery/admin/facets')
        if (res.ok) setFacets(await res.json())
    }, [])

    useEffect(() => { loadFacets() }, [loadFacets])

    useEffect(() => {
        const id = ++requestId.current
        setLoading(true)

        // Debounced only for the search box; everything else is a click and
        // should feel immediate.
        const delay = filters.q ? 250 : 0
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/gallery/admin/library?${query(filters, page)}`)
                if (!res.ok) return
                const data = await res.json()
                // A stale response must not overwrite a newer one.
                if (id !== requestId.current) return
                setItems(data.items ?? [])
                setTotal(data.total ?? 0)
            } finally {
                if (id === requestId.current) setLoading(false)
            }
        }, delay)

        return () => clearTimeout(timer)
    }, [filters, page, query])

    const setParam = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }))
        // Any filter change invalidates the page — page 3 of the old result
        // set is rarely page 3 of the new one, and is often past its end.
        setPage(0)
    }, [])

    const selectNode = useCallback((year: string | null, operation: string | null, mission: string | null) => {
        setFilters(prev => ({ ...prev, view: 'all', year, operation, mission }))
        setPage(0)
    }, [])

    const clear = useCallback(() => { setFilters(EMPTY); setPage(0) }, [])

    const refresh = useCallback(async () => {
        const res = await fetch(`/api/gallery/admin/library?${query(filters, page)}`)
        if (res.ok) {
            const data = await res.json()
            setItems(data.items ?? [])
            setTotal(data.total ?? 0)
        }
        await loadFacets()
    }, [filters, page, query, loadFacets])

    return { items, total, facets, filters, setParam, selectNode, clear, loading, page, setPage, refresh }
}
```

- [ ] **Step 3: Write the rail**

Create `apps/web/app/dashboard/j5/tabs/media/LibraryRail.tsx`:

```tsx
'use client'

import { useState } from 'react'

import s from '@/styles/media-console.module.css'

/**
 * Saved views on top, the archive tree below, every row with a live count.
 *
 * The counts are the point. "Unknown operation · 1,157" is a job a reviewer
 * can watch shrink; an uncounted row is a folder they have to open to find out
 * whether it is worth opening.
 */

type View = 'all' | 'unknown' | 'nocaption' | 'videos' | 'health'

export default function LibraryRail({ facets, view, year, operation, mission, onView, onNode }: {
    facets: LibraryFacetsAPI | null
    view: View
    year: string | null
    operation: string | null
    mission: string | null
    onView: (view: View) => void
    onNode: (year: string | null, operation: string | null, mission: string | null) => void
}) {
    const [openYears, setOpenYears] = useState<Set<string>>(new Set())
    const [openOps, setOpenOps] = useState<Set<string>>(new Set())

    const toggle = (set: Set<string>, key: string, apply: (next: Set<string>) => void) => {
        const next = new Set(set)
        if (next.has(key)) next.delete(key); else next.add(key)
        apply(next)
    }

    const n = (value: number) => value.toLocaleString('en-AU')
    const treeSelected = year !== null || operation !== null

    const views: { key: View, label: string, count: number }[] = facets ? [
        { key: 'all', label: 'All media', count: facets.views.all },
        { key: 'unknown', label: 'Unknown operation', count: facets.views.unknown },
        { key: 'nocaption', label: 'No caption', count: facets.views.nocaption },
        { key: 'videos', label: 'Videos', count: facets.views.videos },
        { key: 'health', label: 'Health', count: facets.views.health },
    ] : []

    return (
        <nav className={s.rail} aria-label='Media library'>
            <p className={s.railHead}>Views</p>
            {views.map(v => (
                <button
                    key={v.key}
                    type='button'
                    className={`${s.row} ${view === v.key && !treeSelected ? s.rowOn : ''}`}
                    onClick={() => onView(v.key)}
                    aria-current={view === v.key && !treeSelected}
                >
                    {v.label}
                    <span className={s.count}>{n(v.count)}</span>
                </button>
            ))}

            <p className={s.railHead}>Archive</p>
            {(facets?.years ?? []).map(y => (
                <div key={y.year}>
                    <button
                        type='button'
                        className={`${s.row} ${year === y.year && !operation ? s.rowOn : ''}`}
                        onClick={() => { toggle(openYears, y.year, setOpenYears); onNode(y.year, null, null) }}
                    >
                        <span className={s.caret}>{openYears.has(y.year) ? '▾' : '▸'}</span>
                        {y.year}
                        <span className={s.count}>{n(y.count)}</span>
                    </button>

                    {openYears.has(y.year) && y.operations.map(op => {
                        const key = `${y.year}/${op.operation}`
                        return (
                            <div key={key}>
                                <button
                                    type='button'
                                    className={`${s.row} ${s.rowSub} ${operation === op.operation && !mission ? s.rowOn : ''}`}
                                    onClick={() => { toggle(openOps, key, setOpenOps); onNode(y.year, op.operation, null) }}
                                >
                                    {op.missions.length > 0 && <span className={s.caret}>{openOps.has(key) ? '▾' : '▸'}</span>}
                                    {op.opLabel}
                                    <span className={s.count}>{n(op.count)}</span>
                                </button>

                                {openOps.has(key) && op.missions.map(m => (
                                    <button
                                        key={m.mission}
                                        type='button'
                                        className={`${s.row} ${s.rowSubSub} ${mission === m.mission && operation === op.operation ? s.rowOn : ''}`}
                                        onClick={() => onNode(y.year, op.operation, m.mission)}
                                    >
                                        {m.mission}
                                        <span className={s.count}>{n(m.count)}</span>
                                    </button>
                                ))}
                            </div>
                        )
                    })}
                </div>
            ))}
        </nav>
    )
}
```

- [ ] **Step 4: Write the grid**

Create `apps/web/app/dashboard/j5/tabs/media/MediaGrid.tsx`:

```tsx
'use client'

import s from '@/styles/media-console.module.css'

/**
 * Tiles, with selection.
 *
 * A plain <img>, not next/image: these are thousands of files served from a
 * local API route, and the optimiser would re-encode every one of them. Lazy
 * loading does the work instead.
 *
 * Shift-click extends a range from the last tile clicked, because assigning an
 * operation to a folder's worth of photographs is the tab's main job and
 * ticking sixty boxes one at a time is not a workflow.
 */

export default function MediaGrid({ items, selected, onToggle, onRange, onOpen }: {
    items: AdminMediaAPI[]
    selected: Set<string>
    onToggle: (id: string) => void
    onRange: (fromId: string, toId: string) => void
    onOpen: (id: string) => void
}) {
    if (items.length === 0) {
        return <div className={s.empty}>Nothing here. Try a different view, or clear the filters.</div>
    }

    let lastClicked: string | null = null

    return (
        <div className={s.grid}>
            {items.map(item => {
                const on = selected.has(item.id)
                return (
                    <button
                        key={item.id}
                        type='button'
                        className={`${s.tile} ${on ? s.tileOn : ''}`}
                        aria-pressed={on}
                        aria-label={item.caption || item.opLabel || 'Untitled media'}
                        onClick={e => {
                            if (e.shiftKey && lastClicked) onRange(lastClicked, item.id)
                            else { onToggle(item.id); lastClicked = item.id }
                        }}
                        onDoubleClick={() => onOpen(item.id)}
                    >
                        {(item.poster ?? item.src)
                            ? <img src={item.poster ?? item.src ?? ''} alt='' loading='lazy' decoding='async' />
                            : null}

                        <span className={s.check} />
                        {!item.operationId && <span className={`${s.badge} ${s.badgeWarn}`}>NO DATE</span>}
                        {item.kind === 'video' && item.operationId && <span className={s.badge}>VIDEO</span>}

                        <span className={s.cap}>{item.caption || item.opLabel || 'Untitled'}</span>
                    </button>
                )
            })}
        </div>
    )
}
```

- [ ] **Step 5: Write the tab shell**

Create `apps/web/app/dashboard/j5/tabs/media/MediaTab.tsx`:

```tsx
'use client'

import { useCallback, useState } from 'react'
import { Button, MenuItem, TextField, Typography } from '@mui/material'

import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import LibraryRail from './LibraryRail'
import MediaGrid from './MediaGrid'
import { useLibrary } from './useLibrary'
import s from '@/styles/media-console.module.css'

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.8rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.8rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}

/**
 * The archive, and everything a reviewer can do to it.
 *
 * This tab replaces one that edited folders. The gallery stopped being a
 * folder tree when it became a database, and the thing worth editing is the
 * media — so the rail is the tree, but everything the rail selects is a query
 * against gallery_media rather than a directory listing.
 */
export default function MediaTab() {
    const { items, total, facets, filters, setParam, selectNode, clear, loading, page, setPage } = useLibrary()
    const [selected, setSelected] = useState<Set<string>>(new Set())

    const toggle = useCallback((id: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
        })
    }, [])

    const range = useCallback((fromId: string, toId: string) => {
        const from = items.findIndex(i => i.id === fromId)
        const to = items.findIndex(i => i.id === toId)
        if (from < 0 || to < 0) return
        const [lo, hi] = from < to ? [from, to] : [to, from]
        setSelected(prev => {
            const next = new Set(prev)
            for (let i = lo; i <= hi; i++) next.add(items[i].id)
            return next
        })
    }, [items])

    const pages = Math.ceil(total / 60)

    return (
        <div>
            <div className={s.work}>
                <LibraryRail
                    facets={facets}
                    view={filters.view}
                    year={filters.year}
                    operation={filters.operation}
                    mission={filters.mission}
                    onView={v => { setParam('view', v); setParam('year', null); setParam('operation', null); setParam('mission', null) }}
                    onNode={selectNode}
                />

                <div className={s.centre}>
                    <div className={s.tools}>
                        <TextField
                            size='small'
                            placeholder='Search captions, authors, filenames…'
                            value={filters.q ?? ''}
                            onChange={e => setParam('q', e.target.value || null)}
                            sx={{ ...inputSx, flex: 1, minWidth: 180 }}
                        />
                        <TextField
                            size='small'
                            select
                            label='Sort'
                            value={filters.sort}
                            onChange={e => setParam('sort', e.target.value as typeof filters.sort)}
                            sx={{ ...inputSx, minWidth: 130 }}
                        >
                            <MenuItem value='newest'>Newest first</MenuItem>
                            <MenuItem value='oldest'>Oldest first</MenuItem>
                            <MenuItem value='rated'>Top rated</MenuItem>
                            <MenuItem value='operation'>By operation</MenuItem>
                        </TextField>
                        <Button size='small' onClick={() => { clear(); setSelected(new Set()) }} sx={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.5)' }}>
                            Clear filters
                        </Button>
                        <Typography sx={{ ml: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'rgba(237,237,237,0.38)' }}>
                            {total.toLocaleString('en-AU')} ITEMS{selected.size ? ` · ${selected.size} SELECTED` : ''}
                        </Typography>
                    </div>

                    {loading ? <TacticalSkeleton /> : (
                        <MediaGrid
                            items={items}
                            selected={selected}
                            onToggle={toggle}
                            onRange={range}
                            onOpen={toggle}
                        />
                    )}

                    {pages > 1 && (
                        <div className={s.pager}>
                            <Button size='small' disabled={page === 0} onClick={() => setPage(page - 1)} sx={{ fontSize: '0.7rem' }}>Previous</Button>
                            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'rgba(237,237,237,0.5)' }}>
                                {page + 1} / {pages}
                            </Typography>
                            <Button size='small' disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} sx={{ fontSize: '0.7rem' }}>Next</Button>
                        </div>
                    )}
                </div>

                <aside className={s.insp}>
                    <div className={s.inspHead}><span>Inspector</span></div>
                    <Typography sx={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.38)' }}>
                        {selected.size === 0
                            ? 'Select an item to edit it.'
                            : `${selected.size} selected. Editing arrives in the next task.`}
                    </Typography>
                </aside>
            </div>
        </div>
    )
}
```

- [ ] **Step 6: Wire it into the panel**

In `apps/web/app/dashboard/j5/page.tsx`, add beside the other permission resolutions:

```ts
    const canManageGallery = await hasPermission(me, 'gallery.manage')
```

and pass `canManageGallery={canManageGallery}` to `<J5Panel>`.

In `apps/web/app/dashboard/j5/J5Panel.tsx`:

1. Add `canManageGallery: boolean` to the props type and destructuring.
2. Import `MediaTab from '@/app/dashboard/j5/tabs/media/MediaTab'`.
3. Replace the **Operations** tab's label with **Media**, and render `<MediaTab />` in its panel when `canManageGallery` is true, falling back to the existing `<GalleryOperationsTab />` when it is false.

**Do not change the tab ordering or the `FIXED_TABS` count.** The file's existing comment explains why: MUI indexes tabs by their position among those actually rendered, so a permission-gated tab inserted mid-list sends a member holding one permission but not another to the wrong panel entirely. Swapping one tab's content for another at the same index is safe; adding or removing a tab is not.

- [ ] **Step 7: Typecheck, lint, test and build**

```bash
cd apps/web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Expected: all clean, and the production build succeeds. The build matters here — this is the first task adding client components, and a server/client boundary mistake only surfaces there.

- [ ] **Step 8: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/styles/media-console.module.css apps/web/app/dashboard/j5/tabs/media apps/web/app/dashboard/j5/J5Panel.tsx apps/web/app/dashboard/j5/page.tsx
git commit -m "feat(j5): the Media tab — rail, grid and filters

Replaces a tab that edited folders with one that edits media. The rail
is still the archive tree, but everything it selects is a query against
gallery_media rather than a directory listing, and every row carries a
count so 'unknown operation, 1,157' is a job you can watch shrink."
```

---

## Task 7: The inspector

**Files:**
- Create: `apps/web/app/dashboard/j5/tabs/media/Inspector.tsx`
- Modify: `apps/web/app/dashboard/j5/tabs/media/MediaTab.tsx`

**Interfaces:**
- Consumes: `PATCH /api/gallery/admin/media/[id]`, `DELETE /api/gallery/admin/media/[id]`, `GET /api/gallery/operations`.
- Produces: `<Inspector item operations tags onSaved onDeleted />`

- [ ] **Step 1: Write the inspector**

Create `apps/web/app/dashboard/j5/tabs/media/Inspector.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Autocomplete, Button, Chip, MenuItem, TextField, Typography } from '@mui/material'

import s from '@/styles/media-console.module.css'

/**
 * One item, and everything a reviewer can change about it.
 *
 * The storage path is shown in full rather than summarised. The bracketed id
 * in it is the contract that lets this file be dragged into a different folder
 * in a downloaded backup and still be recognised on re-import — a reviewer who
 * can see it can trust it, and one who is only told about it cannot.
 *
 * Saving an operation moves the file. That is stated before it happens, not
 * discovered afterwards.
 */

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.8rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.8rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}

type Operation = { id: string, title: string, date: string | null }

export default function Inspector({ item, operations, tags, onSaved, onDeleted }: {
    item: AdminMediaAPI
    operations: Operation[]
    tags: { slug: string, label: string }[]
    onSaved: () => void
    onDeleted: () => void
}) {
    const [caption, setCaption] = useState(item.caption ?? '')
    const [authorName, setAuthorName] = useState(item.authorName ?? '')
    const [operationId, setOperationId] = useState(item.operationId ?? 'unknown')
    const [chosen, setChosen] = useState<string[]>(item.tags)
    const [saving, setSaving] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Re-seeded when the selection changes, or the fields would keep the
    // previous item's values while showing the new item's preview.
    useEffect(() => {
        setCaption(item.caption ?? '')
        setAuthorName(item.authorName ?? '')
        setOperationId(item.operationId ?? 'unknown')
        setChosen(item.tags)
        setConfirmDelete(false)
        setError(null)
    }, [item])

    const movingTo = operationId !== (item.operationId ?? 'unknown')
        ? operations.find(o => o.id === operationId) ?? null
        : null

    async function save() {
        setSaving(true)
        setError(null)
        try {
            const res = await fetch(`/api/gallery/admin/media/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caption, authorName, tags: chosen, operationId }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                setError(data.error ?? 'Could not save.')
                return
            }
            onSaved()
        } finally {
            setSaving(false)
        }
    }

    async function remove() {
        setSaving(true)
        try {
            const res = await fetch(`/api/gallery/admin/media/${item.id}`, { method: 'DELETE' })
            if (res.ok) onDeleted()
            else setError('Could not delete.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <aside className={s.insp}>
            <div className={s.inspHead}><span>Item</span></div>

            <div className={s.preview}>
                {item.kind === 'video' && item.src
                    ? <video src={item.src} poster={item.poster ?? undefined} controls playsInline />
                    : (item.poster ?? item.src) ? <img src={item.poster ?? item.src ?? ''} alt='' /> : null}
            </div>

            <TextField size='small' label='Caption' value={caption} onChange={e => setCaption(e.target.value)} sx={inputSx} multiline maxRows={3} />

            <TextField size='small' select label='Operation' value={operationId} onChange={e => setOperationId(e.target.value)} sx={inputSx}>
                <MenuItem value='unknown'>Unknown</MenuItem>
                {operations.map(op => <MenuItem key={op.id} value={op.id}>{op.title}</MenuItem>)}
            </TextField>

            {movingTo && (
                <div className={s.consequence}>
                    Saving moves this file into <b>{movingTo.title}</b>&rsquo;s folder on disk
                    {movingTo.date ? <> and dates it <b>{new Date(movingTo.date).toLocaleDateString('en-AU')}</b></> : null}.
                </div>
            )}
            {!movingTo && operationId === 'unknown' && item.operationId && (
                <div className={s.consequence}>
                    Saving moves this file into <b>Unknown</b> on disk and clears its date.
                </div>
            )}

            <TextField size='small' label='Author' value={authorName} onChange={e => setAuthorName(e.target.value)} sx={inputSx} />

            <Autocomplete
                multiple
                size='small'
                options={tags.map(t => t.slug)}
                value={chosen}
                onChange={(_, value) => setChosen(value)}
                getOptionLabel={slug => tags.find(t => t.slug === slug)?.label ?? slug}
                renderTags={(value, getTagProps) => value.map((slug, index) => (
                    <Chip {...getTagProps({ index })} key={slug} size='small' label={tags.find(t => t.slug === slug)?.label ?? slug} />
                ))}
                renderInput={p => <TextField {...p} label='Tags' sx={inputSx} />}
            />

            {item.storageKey && (
                <div>
                    <div className={s.inspHead} style={{ marginBottom: 4 }}><span>On disk</span></div>
                    <div className={s.path}>{item.storageKey}</div>
                </div>
            )}

            <dl className={s.facts}>
                <dt>Taken</dt><dd>{item.takenAt ? new Date(item.takenAt).toLocaleDateString('en-AU') : 'Undated'}</dd>
                {item.width && item.height ? <><dt>Size</dt><dd>{item.width} × {item.height}</dd></> : null}
                {item.bytes ? <><dt>Bytes</dt><dd>{(item.bytes / 1024 / 1024).toFixed(1)} MB</dd></> : null}
                <dt>Votes</dt><dd>▲ {item.up} ▼ {item.down}</dd>
            </dl>

            {error && <Typography sx={{ fontSize: '0.75rem', color: 'var(--red-hi)' }}>{error}</Typography>}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                <Button size='small' variant='outlined' disabled={saving} onClick={save} sx={{ fontSize: '0.7rem' }}>Save</Button>
                {confirmDelete ? (
                    <>
                        <Button size='small' color='error' disabled={saving} onClick={remove} sx={{ fontSize: '0.7rem' }}>Delete for good</Button>
                        <Button size='small' disabled={saving} onClick={() => setConfirmDelete(false)} sx={{ fontSize: '0.7rem' }}>Cancel</Button>
                    </>
                ) : (
                    <Button size='small' color='error' disabled={saving} onClick={() => setConfirmDelete(true)} sx={{ fontSize: '0.7rem' }}>Delete</Button>
                )}
            </div>
        </aside>
    )
}
```

- [ ] **Step 2: Wire it into MediaTab**

In `MediaTab.tsx`:

1. Fetch operations and tags once on mount:

```tsx
    const [operations, setOperations] = useState<{ id: string, title: string, date: string | null }[]>([])
    const [tagVocab, setTagVocab] = useState<{ slug: string, label: string }[]>([])

    useEffect(() => {
        fetch('/api/gallery/operations').then(r => r.ok ? r.json() : null).then(d => {
            if (d?.operations) setOperations(d.operations)
        })
        fetch('/api/gallery/tags').then(r => r.ok ? r.json() : null).then(d => {
            if (d?.tags) setTagVocab(d.tags.filter((t: { retired: boolean }) => !t.retired))
        })
    }, [])
```

Read `app/api/gallery/operations/route.ts` first and match the shape it actually returns — if the field names differ, follow the route, not this snippet.

2. Replace the placeholder `<aside className={s.insp}>` with:

```tsx
{selected.size === 1
    ? (() => {
        const item = items.find(i => selected.has(i.id))
        return item ? (
            <Inspector
                item={item}
                operations={operations}
                tags={tagVocab}
                onSaved={() => { refresh(); }}
                onDeleted={() => { setSelected(new Set()); refresh() }}
            />
        ) : null
    })()
    : (
        <aside className={s.insp}>
            <div className={s.inspHead}><span>{selected.size === 0 ? 'Inspector' : 'Bulk edit'}</span></div>
            <Typography sx={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.38)' }}>
                {selected.size === 0 ? 'Select an item to edit it.' : `${selected.size} selected.`}
            </Typography>
        </aside>
    )}
```

Pull `refresh` out of `useLibrary()`'s return alongside the values already destructured.

- [ ] **Step 3: Typecheck, lint, test and build**

```bash
cd apps/web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/app/dashboard/j5/tabs/media
git commit -m "feat(j5): the media inspector

Shows the storage path in full, because the bracketed id in it is the
contract that lets a file be moved by hand and still be recognised — a
reviewer who can see it can trust it. Reassigning an operation states
that it moves the file before it does."
```

---

## Task 8: The bulk panel

**Files:**
- Create: `apps/web/app/dashboard/j5/tabs/media/BulkPanel.tsx`
- Modify: `apps/web/app/dashboard/j5/tabs/media/MediaTab.tsx`

**Interfaces:**
- Consumes: `POST /api/gallery/admin/bulk`.
- Produces: `<BulkPanel ids operations tags onDone />`

- [ ] **Step 1: Write the panel**

Create `apps/web/app/dashboard/j5/tabs/media/BulkPanel.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Autocomplete, Button, Chip, MenuItem, TextField, Typography } from '@mui/material'

import s from '@/styles/media-console.module.css'

/**
 * One action over a selection — the cleanup path for the files the migration
 * could not date.
 *
 * Every destructive or file-moving action states its consequence in plain
 * terms before it runs. A bulk move relocates files on disk; discovering that
 * after the fact is not acceptable for an operation over sixty photographs.
 */

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.8rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.8rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}

type Operation = { id: string, title: string, date: string | null }

export default function BulkPanel({ ids, operations, tags, onDone }: {
    ids: string[]
    operations: Operation[]
    tags: { slug: string, label: string }[]
    onDone: () => void
}) {
    const [operationId, setOperationId] = useState('')
    const [chosen, setChosen] = useState<string[]>([])
    const [authorName, setAuthorName] = useState('')
    const [busy, setBusy] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [result, setResult] = useState<string | null>(null)

    const target = operations.find(o => o.id === operationId) ?? null

    async function run(action: string, extra: Record<string, unknown>) {
        setBusy(true)
        setResult(null)
        try {
            const res = await fetch('/api/gallery/admin/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, action, ...extra }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) { setResult(data.error ?? 'Failed.'); return }

            setResult(data.failed?.length
                ? `${data.changed} changed, ${data.failed.length} failed.`
                : `${data.changed} changed.`)
            onDone()
        } finally {
            setBusy(false)
        }
    }

    return (
        <aside className={s.insp}>
            <div className={s.inspHead}>
                <span>Bulk edit</span>
                <span style={{ marginLeft: 'auto', color: 'var(--red-hi)' }}>{ids.length} items</span>
            </div>

            <TextField size='small' select label='Move to operation' value={operationId} onChange={e => setOperationId(e.target.value)} sx={inputSx}>
                <MenuItem value=''>Choose an operation…</MenuItem>
                <MenuItem value='unknown'>Unknown</MenuItem>
                {operations.map(op => <MenuItem key={op.id} value={op.id}>{op.title}</MenuItem>)}
            </TextField>

            {operationId && (
                <div className={s.consequence}>
                    {operationId === 'unknown'
                        ? <>Moves <b>{ids.length}</b> files into <b>Unknown</b> on disk and clears their dates.</>
                        : <>Moves <b>{ids.length}</b> files into <b>{target?.title}</b>&rsquo;s folder on disk
                            {target?.date ? <> and dates them <b>{new Date(target.date).toLocaleDateString('en-AU')}</b></> : null}.</>}
                </div>
            )}

            <Button size='small' variant='outlined' disabled={!operationId || busy} onClick={() => run('move', { operationId })} sx={{ fontSize: '0.7rem' }}>
                Apply to {ids.length}
            </Button>

            <Autocomplete
                multiple
                size='small'
                options={tags.map(t => t.slug)}
                value={chosen}
                onChange={(_, value) => setChosen(value)}
                getOptionLabel={slug => tags.find(t => t.slug === slug)?.label ?? slug}
                renderTags={(value, getTagProps) => value.map((slug, index) => (
                    <Chip {...getTagProps({ index })} key={slug} size='small' label={tags.find(t => t.slug === slug)?.label ?? slug} />
                ))}
                renderInput={p => <TextField {...p} label='Tags' sx={inputSx} />}
            />
            <div style={{ display: 'flex', gap: 6 }}>
                <Button size='small' disabled={!chosen.length || busy} onClick={() => run('addTags', { tags: chosen })} sx={{ fontSize: '0.7rem' }}>Add tags</Button>
                <Button size='small' disabled={!chosen.length || busy} onClick={() => run('removeTags', { tags: chosen })} sx={{ fontSize: '0.7rem' }}>Remove tags</Button>
            </div>

            <TextField size='small' label='Set author' value={authorName} onChange={e => setAuthorName(e.target.value)} sx={inputSx} />
            <Button size='small' disabled={busy} onClick={() => run('setAuthor', { authorName })} sx={{ fontSize: '0.7rem' }}>
                {authorName.trim() ? `Set author on ${ids.length}` : `Clear author on ${ids.length}`}
            </Button>

            {result && <Typography sx={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.62)' }}>{result}</Typography>}

            <div style={{ marginTop: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {confirmDelete ? (
                    <>
                        <Button size='small' color='error' disabled={busy} onClick={() => run('delete', {})} sx={{ fontSize: '0.7rem' }}>
                            Delete {ids.length} for good
                        </Button>
                        <Button size='small' disabled={busy} onClick={() => setConfirmDelete(false)} sx={{ fontSize: '0.7rem' }}>Cancel</Button>
                    </>
                ) : (
                    <Button size='small' color='error' disabled={busy} onClick={() => setConfirmDelete(true)} sx={{ fontSize: '0.7rem' }}>
                        Delete {ids.length}
                    </Button>
                )}
            </div>
        </aside>
    )
}
```

- [ ] **Step 2: Wire it into MediaTab**

Replace the `selected.size > 1` branch of the inspector slot with:

```tsx
<BulkPanel
    ids={[...selected]}
    operations={operations}
    tags={tagVocab}
    onDone={() => { setSelected(new Set()); refresh() }}
/>
```

- [ ] **Step 3: Typecheck, lint, test and build**

```bash
cd apps/web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/app/dashboard/j5/tabs/media
git commit -m "feat(j5): bulk reassign, tag, author and delete

Every file-moving or destructive action states its consequence before it
runs — a bulk move relocates files on disk, and discovering that after
the fact is not acceptable over sixty photographs."
```

---

## Task 9: The Health view

**Files:**
- Create: `apps/web/app/dashboard/j5/tabs/media/HealthView.tsx`
- Modify: `apps/web/app/dashboard/j5/tabs/media/MediaTab.tsx`

**Interfaces:**
- Consumes: `GET /api/gallery/admin/health`, `POST /api/gallery/admin/health`.
- Produces: `<HealthView onChanged />`

- [ ] **Step 1: Write the view**

Create `apps/web/app/dashboard/j5/tabs/media/HealthView.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Typography } from '@mui/material'

import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import s from '@/styles/media-console.module.css'

/**
 * Where the database and the disk disagree.
 *
 * Not a tab of its own — a view in the rail, because everything it lists is
 * still media. Nothing here resolves itself: every fix is a button a person
 * presses. A reconcile that deleted records for missing files would destroy
 * the index for the whole archive the first time a restore failed halfway.
 */

type Report = {
    at: string
    scanned: number
    matchedById: number
    matchedByPath: number
    relocated: { id: string, from: string, to: string, operation: string | null }[]
    notIndexed: { path: string, bytes: number, proposedOperation: string | null }[]
    missingFiles: { id: string, storageKey: string, caption: string | null }[]
    failedProcessing: { id: string, error: string }[]
    unreadable: number
}

export default function HealthView({ onChanged }: { onChanged: () => void }) {
    const [report, setReport] = useState<Report | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/gallery/admin/health')
            if (res.ok) setReport((await res.json()).report)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    async function post(body: Record<string, unknown>) {
        setBusy(true)
        try {
            const res = await fetch('/api/gallery/admin/health', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (res.ok) {
                setReport((await res.json()).report)
                onChanged()
            }
        } finally {
            setBusy(false)
        }
    }

    if (loading) return <TacticalSkeleton />

    const total = report ? report.missingFiles.length + report.notIndexed.length + report.failedProcessing.length : 0

    return (
        <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', letterSpacing: '0.14em', color: 'rgba(237,237,237,0.5)' }}>
                    {report
                        ? `LAST SCAN ${new Date(report.at).toLocaleString('en-AU')} · ${report.scanned.toLocaleString('en-AU')} FILES WALKED`
                        : 'NEVER SCANNED'}
                </Typography>
                <Button size='small' variant='outlined' disabled={busy} onClick={() => post({ action: 'rescan' })} sx={{ ml: 'auto', fontSize: '0.7rem' }}>
                    {busy ? 'Scanning…' : 'Re-scan disk'}
                </Button>
            </div>

            {report && total === 0 && (
                <div className={s.empty}>Nothing to resolve. The database and the disk agree.</div>
            )}

            {report && report.missingFiles.length > 0 && (
                <section style={{ marginBottom: 18 }}>
                    <Typography sx={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.08em', color: 'var(--red-hi)', mb: 1 }}>
                        MISSING FILE · {report.missingFiles.length}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', mb: 1 }}>
                        These records are on the gallery but their file is not on disk. Visitors see a broken tile.
                    </Typography>
                    {report.missingFiles.slice(0, 50).map(m => (
                        <div key={m.id} className={s.path} style={{ marginBottom: 4 }}>
                            {m.caption ? `“${m.caption}” — ` : ''}{m.storageKey}
                        </div>
                    ))}
                </section>
            )}

            {report && report.notIndexed.length > 0 && (
                <section style={{ marginBottom: 18 }}>
                    <Typography sx={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.08em', color: '#5b8dd9', mb: 1 }}>
                        NOT INDEXED · {report.notIndexed.length}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', mb: 1 }}>
                        Files on disk with no record. Drop files into a folder and index them here.
                    </Typography>
                    {report.notIndexed.slice(0, 50).map(f => (
                        <div key={f.path} className={s.path} style={{ marginBottom: 4 }}>{f.path}</div>
                    ))}
                    <Button
                        size='small'
                        variant='outlined'
                        disabled={busy}
                        onClick={() => post({ action: 'index', paths: report.notIndexed.map(f => f.path) })}
                        sx={{ fontSize: '0.7rem', mt: 1 }}
                    >
                        Index all {report.notIndexed.length}
                    </Button>
                </section>
            )}

            {report && report.failedProcessing.length > 0 && (
                <section>
                    <Typography sx={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.08em', color: '#d8ac45', mb: 1 }}>
                        PROCESSING FAILED · {report.failedProcessing.length}
                    </Typography>
                    {report.failedProcessing.map(f => (
                        <div key={f.id} className={s.path} style={{ marginBottom: 4 }}>{f.error}</div>
                    ))}
                </section>
            )}
        </div>
    )
}
```

- [ ] **Step 2: Wire it into MediaTab**

In the centre pane, when `filters.view === 'health'`, render `<HealthView onChanged={refresh} />` instead of the grid and pager. The rail, tools and inspector stay as they are — Health is a view of the same library, not a different screen.

- [ ] **Step 3: Typecheck, lint, test and build**

```bash
cd apps/web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # must print feat/gallery-submissions
git add apps/web/app/dashboard/j5/tabs/media
git commit -m "feat(j5): the Health view

Every fix is a button a person presses. Nothing here resolves itself —
a reconcile that deleted records for missing files would destroy the
index for the whole archive the first time a restore failed halfway."
```

---

## Self-Review

**1. Spec coverage.** §6.1 layout → Task 6. §6.2 single-item inspector, including the storage path shown in full → Task 7. §6.3 bulk panel with the consequence statement → Task 8. §6.4 editing converts a legacy name → Task 3 (`relocateMedia` runs on every upload edit, which is what renames it). §6.5 Health with its three classes and Re-scan → Tasks 5 and 9. §9 permissions → uses the existing `gallery.manage`; §10's route table → Tasks 2–5.

Deliberately **not** here, and belonging to Plan B2: §6.6 the rebuilt Submissions queue, §6.7 Featured moving onto the library, §6.8 SOTM, §6.9 tag usage counts. Also not here: the table view from the mockups — the grid, rail and filters carry the workflow, and a second presentation of the same data is the first thing to cut if this plan runs long. It is listed in the mockups; say so when handing over rather than letting it look forgotten.

**2. Placeholder scan.** No "TBD", no "handle edge cases", no "similar to Task N". Three steps direct the implementer to read surrounding code rather than quoting it — Task 6 Step 6 (J5Panel's tab indexing, where the file's own comment is the requirement), Task 7 Step 2 (the operations route's actual response shape), and Task 9 Step 2 (where the centre pane branches). Each is a case where a stale snippet would be worse than naming the convention.

**3. Type consistency.** `AdminMediaAPI` is defined in Task 2 and consumed in Tasks 6, 7 and 8. `LibraryFacetsAPI` in Task 2, consumed in Task 6. `LibraryParams`/`LibraryView`/`LibrarySort` in Task 1, consumed by Task 2's route and Task 6's hook. The bulk route's action strings in Task 4 (`move`, `addTags`, `removeTags`, `setAuthor`, `delete`) are exactly the ones Task 8 sends. `useLibrary` returns `refresh`, which Tasks 7, 8 and 9 all use.

**One gap found while reviewing and closed inline:** Task 6's `MediaGrid` held `lastClicked` in a plain local, which resets on every render and would have made shift-click work only occasionally. It needs to be a ref. The implementer should use `useRef<string | null>(null)` rather than the local shown, and this note is here rather than silently corrected in the code block so the reason survives.
