# Kit Ratings, Tags and Shelf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members can rate each other's shared kits 1–5 stars, tag their own kits from a fixed vocabulary, and find any kit on `/community/kits` by searching, filtering, sorting and paging a shelf that also reports how many people have copied each kit.

**Architecture:** Three pure, unit-tested modules under `apps/web/lib/loadout/` (`tags.ts`, `rating.ts`, `shelf.ts`) hold every rule. Two new Mongo collections (`loadout_ratings`, `loadout_copies`) keep per-user rows out of the loadout document, with three denormalised counters on the loadout itself so the shelf can sort without a lookup per card. Two new API routes write them. The shelf page stays a server component that resolves display strings, then hands plain serialisable card data to a client component that does all filtering in the browser.

**Tech Stack:** Next.js 15 App Router (React server + client components), TypeScript, MongoDB driver, Vitest, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-08-19-kit-ratings-tags-shelf-design.md`

## Global Constraints

- **Branch:** all work lands on `feat/kit-ratings-tags-shelf`. Never commit to `main` — a push to `main` deploys immediately with no CI gate.
- **Working directory:** every command in this plan runs from `apps/web` unless the step says otherwise.
- **`raw` is never writable after import.** No route in this plan accepts it. Changing a kit's contents means re-importing.
- **Only `shared: true` kits are rateable, copy-countable and visible to anyone but their owner.** Every read of another member's kit filters on it.
- **Nobody rates or copy-counts their own kit.** Both routes check `doc.userId === actor` and refuse.
- **Ratings are anonymous.** No API response and no page may expose who rated a kit, including to its owner.
- **`MAX_KIT_TAGS = 4`**, `MAX_NAME = 40`, `MAX_DESCRIPTION = 160` (the last two already exist in `lib/loadout/limits.ts`).
- **Rating weighting constants:** `RATING_PRIOR_WEIGHT = 3`, `RATING_PRIOR_MEAN = 3.5`. Used for sort order only — displayed averages are always the plain mean.
- **`KITS_PER_PAGE = 24`.**
- **Anonymous visitor cookie:** name `kit_visitor`, value `anon:<uuid>`, `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `maxAge` one year, `secure` in production.
- **Commit style:** conventional commits scoped `kits` (e.g. `feat(kits): …`). Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```
- **Shared components import `app/(landing)/milpacs/[username]/profile.module.css`** for styling. There are no component-level CSS modules in this repo; `profile.module.css` is the design system both the milpac and the kits page already draw from (see `copy-kit.tsx`). New shared classes are added there; classes only the shelf uses go in `kits.module.css`.

---

### Task 1: Tag vocabulary

**Files:**
- Create: `apps/web/lib/loadout/tags.ts`
- Test: `apps/web/lib/loadout/tags.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `KIT_TAGS`, `type KitTag`, `KIT_TAG_KEYS: KitTag[]`, `KIT_TAG_LABELS: Record<KitTag, string>`, `KIT_TAG_GROUPS: { group: string; tags: KitTag[] }[]`, `MAX_KIT_TAGS: 4`, `isKitTag(value: unknown): value is KitTag`, `normaliseTags(input: unknown): KitTag[]`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/loadout/tags.test.ts`:

```ts
/**
 * Tags arrive from a JSON body and are then used as `Record` lookups when
 * chips are rendered on a public page, so an unrecognised or hostile value has
 * to be dropped at the door rather than stored.
 */
import { describe, test, expect } from 'vitest'
import {
    KIT_TAGS, KIT_TAG_KEYS, KIT_TAG_LABELS, KIT_TAG_GROUPS,
    MAX_KIT_TAGS, isKitTag, normaliseTags,
} from './tags'

describe('kit tags', () => {
    test('every tag has a label and every key is unique', () => {
        expect(new Set(KIT_TAG_KEYS).size).toBe(KIT_TAG_KEYS.length)
        for (const key of KIT_TAG_KEYS) {
            expect(typeof KIT_TAG_LABELS[key]).toBe('string')
            expect(KIT_TAG_LABELS[key].length).toBeGreaterThan(0)
        }
    })

    test('every tag appears in exactly one group', () => {
        const grouped = KIT_TAG_GROUPS.flatMap(g => g.tags)
        expect(grouped.slice().sort()).toEqual(KIT_TAG_KEYS.slice().sort())
        expect(new Set(grouped).size).toBe(grouped.length)
    })

    test('the vocabulary covers the roles the unit actually fields', () => {
        for (const key of ['staff', 'medical', 'mg', 'lmg', 'mat'] as const) {
            expect(KIT_TAG_KEYS).toContain(key)
        }
        expect(KIT_TAGS.length).toBeGreaterThanOrEqual(20)
    })

    test('accepts a real key and rejects everything else', () => {
        expect(isKitTag('medical')).toBe(true)
        expect(isKitTag('Medical')).toBe(false)
        expect(isKitTag('not-a-tag')).toBe(false)
        expect(isKitTag('__proto__')).toBe(false)
        expect(isKitTag('constructor')).toBe(false)
        expect(isKitTag(3)).toBe(false)
        expect(isKitTag(null)).toBe(false)
    })

    test('normalises a good list', () => {
        expect(normaliseTags(['medical', 'night'])).toEqual(['medical', 'night'])
    })

    test('drops unknown values and non-strings', () => {
        expect(normaliseTags(['medical', 'nope', 7, null, { key: 'mg' }])).toEqual(['medical'])
    })

    test('de-duplicates', () => {
        expect(normaliseTags(['mg', 'mg', 'mg'])).toEqual(['mg'])
    })

    test('caps at MAX_KIT_TAGS', () => {
        const many = normaliseTags(['staff', 'medical', 'mg', 'lmg', 'mat', 'night'])
        expect(many).toHaveLength(MAX_KIT_TAGS)
    })

    test('returns declared order regardless of input order', () => {
        const forwards = normaliseTags(['medical', 'mg'])
        const backwards = normaliseTags(['mg', 'medical'])
        expect(forwards).toEqual(backwards)
        expect(forwards).toEqual(['medical', 'mg'])
    })

    test('survives input that is not an array', () => {
        expect(normaliseTags(undefined)).toEqual([])
        expect(normaliseTags(null)).toEqual([])
        expect(normaliseTags('medical')).toEqual([])
        expect(normaliseTags({ 0: 'medical' })).toEqual([])
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/loadout/tags.test.ts`
Expected: FAIL — cannot resolve `./tags`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/loadout/tags.ts`:

```ts
/**
 * What a kit is *for*, in the unit's own shorthand.
 *
 * A fixed vocabulary rather than free text: tags are a filter control on the
 * shelf, and free text would give thirty spellings of "medic" and a filter bar
 * that finds nothing. Adding one is a one-line commit, the same as adding a
 * kit icon.
 *
 * Keys are short and stable — they are what is stored. Labels are what is
 * shown and may be reworded without touching a document. Lives here rather
 * than beside a component because the API routes validate against it and must
 * not pull JSX into a route handler.
 *
 * This is `apps/web/lib`, not the repo-root `lib/`: per `lib/README.md` the
 * root is for vocabulary more than one app must agree on, and the bot has no
 * concept of a kit. `kit-icons.ts` next door made the same call.
 */

export const KIT_TAGS = [
    // Role
    { key: 'staff',     label: 'Staff',             group: 'Role' },
    { key: 'sc',        label: 'Section Commander', group: 'Role' },
    { key: 'ftl',       label: 'Fireteam Leader',   group: 'Role' },
    { key: 'rifleman',  label: 'Rifleman',          group: 'Role' },
    { key: 'medical',   label: 'Medical',           group: 'Role' },
    { key: 'engineer',  label: 'Engineer',          group: 'Role' },
    { key: 'signaller', label: 'Signaller',         group: 'Role' },
    { key: 'jtac',      label: 'JTAC/FO',           group: 'Role' },
    { key: 'marksman',  label: 'Marksman',          group: 'Role' },
    { key: 'sniper',    label: 'Sniper',            group: 'Role' },
    { key: 'zeus',      label: 'Zeus',              group: 'Role' },
    // Weapon
    { key: 'mg',        label: 'MG',                group: 'Weapon' },
    { key: 'lmg',       label: 'LMG',               group: 'Weapon' },
    { key: 'mat',       label: 'MAT',               group: 'Weapon' },
    { key: 'hat',       label: 'HAT',               group: 'Weapon' },
    { key: 'grenadier', label: 'Grenadier',         group: 'Weapon' },
    { key: 'aa',        label: 'AA',                group: 'Weapon' },
    { key: 'dfsw',      label: 'DFSW',              group: 'Weapon' },
    { key: 'idf',       label: 'IDF',               group: 'Weapon' },
    // Vehicle
    { key: 'pilot',     label: 'Pilot',             group: 'Vehicle' },
    { key: 'crewman',   label: 'Crewman',           group: 'Vehicle' },
    { key: 'armour',    label: 'Armoured Crew',     group: 'Vehicle' },
    // Setting
    { key: 'night',     label: 'Night',             group: 'Setting' },
    { key: 'cqb',       label: 'CQB',               group: 'Setting' },
    { key: 'recon',     label: 'Recon',             group: 'Setting' },
    { key: 'para',      label: 'Paratrooper',       group: 'Setting' },
    { key: 'diver',     label: 'Diver',             group: 'Setting' },
    { key: 'winter',    label: 'Winter',            group: 'Setting' },
    { key: 'desert',    label: 'Desert',            group: 'Setting' },
] as const

export type KitTag = typeof KIT_TAGS[number]['key']

/** Declared order — the order chips render in, everywhere. */
export const KIT_TAG_KEYS = KIT_TAGS.map(t => t.key) as KitTag[]

export const KIT_TAG_LABELS = Object.fromEntries(
    KIT_TAGS.map(t => [t.key, t.label]),
) as Record<KitTag, string>

/** For the picker, which shows them under headings rather than as one long run. */
export const KIT_TAG_GROUPS: { group: string; tags: KitTag[] }[] =
    [...new Set(KIT_TAGS.map(t => t.group))].map(group => ({
        group,
        tags: KIT_TAGS.filter(t => t.group === group).map(t => t.key),
    }))

/** Enough for a role, a weapon and a setting without the card footer wrapping. */
export const MAX_KIT_TAGS = 4

/**
 * Narrow an untrusted value to a key.
 *
 * An explicit key-list check rather than `key in KIT_TAG_LABELS`, so
 * `__proto__` and `constructor` are rejected as firmly as a typo — the result
 * becomes a `Record` lookup on a public page.
 */
export function isKitTag(value: unknown): value is KitTag {
    return typeof value === 'string' && (KIT_TAG_KEYS as string[]).includes(value)
}

/**
 * The single gate every write goes through.
 *
 * Filtering `KIT_TAG_KEYS` rather than the input is what makes this
 * deterministic: the result is always in declared order, so chips sit in the
 * same order on every card whatever order the owner clicked them, and the cap
 * always keeps the same four rather than whichever four arrived first.
 */
export function normaliseTags(input: unknown): KitTag[] {
    if (!Array.isArray(input)) return []
    const chosen = new Set<KitTag>()
    for (const value of input) if (isKitTag(value)) chosen.add(value)
    return KIT_TAG_KEYS.filter(key => chosen.has(key)).slice(0, MAX_KIT_TAGS)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/loadout/tags.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/loadout/tags.ts apps/web/lib/loadout/tags.test.ts
git commit
```

Message:
```
feat(kits): add the kit tag vocabulary

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 2: Rating maths

**Files:**
- Create: `apps/web/lib/loadout/rating.ts`
- Test: `apps/web/lib/loadout/rating.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Stars = 1|2|3|4|5`, `isStars(value: unknown): value is Stars`, `summarise(stars: number[]): { avg: number; count: number }`, `RATING_PRIOR_WEIGHT`, `RATING_PRIOR_MEAN`, `weightedScore(avg: number, count: number): number`, `formatAvg(avg: number, count: number): string`, `NO_RATING: '—'`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/loadout/rating.test.ts`:

```ts
/**
 * The star value arrives from a JSON body, and the average it feeds decides
 * the order of a public page. Both the validation and the ranking are worth
 * pinning down: sorting on the raw mean would put one 5-star rating above a
 * 4.8 earned across thirty.
 */
import { describe, test, expect } from 'vitest'
import { isStars, summarise, weightedScore, formatAvg, NO_RATING } from './rating'

describe('star validation', () => {
    test('accepts 1 through 5', () => {
        for (const n of [1, 2, 3, 4, 5]) expect(isStars(n)).toBe(true)
    })

    test('rejects out of range, fractional and non-numeric', () => {
        for (const bad of [0, 6, -1, 3.5, NaN, Infinity, '4', null, undefined, {}]) {
            expect(isStars(bad)).toBe(false)
        }
    })
})

describe('summarise', () => {
    test('averages and counts', () => {
        expect(summarise([5, 4, 3])).toEqual({ avg: 4, count: 3 })
    })

    test('rounds to two decimals', () => {
        expect(summarise([5, 4, 4])).toEqual({ avg: 4.33, count: 3 })
    })

    test('an unrated kit is zero, not NaN', () => {
        expect(summarise([])).toEqual({ avg: 0, count: 0 })
    })
})

describe('weightedScore', () => {
    test('a well-supported 4.8 outranks a lone 5.0', () => {
        expect(weightedScore(4.8, 30)).toBeGreaterThan(weightedScore(5, 1))
    })

    test('approaches the true mean as ratings accumulate', () => {
        expect(weightedScore(5, 500)).toBeCloseTo(5, 1)
    })

    test('an unrated kit scores zero, so it sorts last', () => {
        expect(weightedScore(0, 0)).toBe(0)
    })

    test('more ratings at the same average never lowers the score', () => {
        expect(weightedScore(4.5, 20)).toBeGreaterThan(weightedScore(4.5, 2))
    })
})

describe('formatAvg', () => {
    test('one decimal place', () => {
        expect(formatAvg(4.33, 3)).toBe('4.3')
        expect(formatAvg(5, 2)).toBe('5.0')
    })

    test('an unrated kit shows no number at all', () => {
        expect(formatAvg(0, 0)).toBe(NO_RATING)
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/loadout/rating.test.ts`
Expected: FAIL — cannot resolve `./rating`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/loadout/rating.ts`:

```ts
/**
 * What a kit is rated, and how that decides its place on the shelf.
 *
 * Pure — no database, no React. The routes and both pages share it, and it is
 * the only place the ranking rule is written down.
 */

export type Stars = 1 | 2 | 3 | 4 | 5

/** Shown where an average would go on a kit nobody has rated. */
export const NO_RATING = '—'

/** The value arrives from a JSON body: whole numbers 1–5 and nothing else. */
export function isStars(value: unknown): value is Stars {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

/** The plain mean, to two decimals, and how many people gave it. */
export function summarise(stars: number[]): { avg: number; count: number } {
    if (stars.length === 0) return { avg: 0, count: 0 }
    const total = stars.reduce((sum, n) => sum + n, 0)
    return { avg: Math.round((total / stars.length) * 100) / 100, count: stars.length }
}

/**
 * How much evidence a kit needs before its own mean is trusted, and what it is
 * assumed to be until then. Three ratings and a middling 3.5: enough to stop a
 * single friendly 5 topping the shelf, not so much that a genuinely good kit
 * has to wait a month to surface.
 */
export const RATING_PRIOR_WEIGHT = 3
export const RATING_PRIOR_MEAN = 3.5

/**
 * The number "Top rated" sorts on — never the number the page displays.
 *
 * Sorting on the raw mean puts a kit with one 5-star rating above one
 * averaging 4.8 across thirty, which is the opposite of what "top rated"
 * means to a reader. This pulls a sparsely-rated kit toward the prior and
 * releases it as ratings accumulate.
 */
export function weightedScore(avg: number, count: number): number {
    if (count <= 0) return 0
    const m = RATING_PRIOR_WEIGHT
    return (count / (count + m)) * avg + (m / (count + m)) * RATING_PRIOR_MEAN
}

/** One decimal, because two is a precision the number does not have. */
export function formatAvg(avg: number, count: number): string {
    return count > 0 ? avg.toFixed(1) : NO_RATING
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/loadout/rating.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/loadout/rating.ts apps/web/lib/loadout/rating.test.ts
git commit
```

Message:
```
feat(kits): add rating maths and the shelf ranking rule

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 3: Shelf search, sort and paging

**Files:**
- Create: `apps/web/lib/loadout/shelf.ts`
- Test: `apps/web/lib/loadout/shelf.test.ts`

**Interfaces:**
- Consumes: `KitTag`, `KIT_TAG_KEYS` from Task 1.
- Produces: `type ShelfSort = 'newest'|'rated'|'copied'|'name'`, `SHELF_SORTS: { key: ShelfSort; label: string }[]`, `KITS_PER_PAGE = 24`, `type ShelfCard`, `matchesQuery(card, query): boolean`, `matchesTags(card, tags): boolean`, `sortCards<T extends ShelfCard>(cards: T[], sort: ShelfSort): T[]`, `pageCount(total: number, perPage?): number`, `paginate<T>(items: T[], page: number, perPage?): T[]`, `tagCounts(cards: ShelfCard[]): { tag: KitTag; count: number }[]`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/loadout/shelf.test.ts`:

```ts
/**
 * Everything the shelf does to a list of kits, with no React in the way.
 * The card shape here is only the part these functions read — the rendered
 * card carries much more.
 */
import { describe, test, expect } from 'vitest'
import {
    matchesQuery, matchesTags, sortCards, pageCount, paginate, tagCounts,
    KITS_PER_PAGE, SHELF_SORTS, type ShelfCard,
} from './shelf'
import type { KitTag } from './tags'

function card(over: Partial<ShelfCard> & { id: string }): ShelfCard {
    return {
        name: 'Kit',
        tags: [],
        updatedAt: 0,
        ratingAvg: 0,
        ratingCount: 0,
        ratingScore: 0,
        copyCount: 0,
        haystack: '',
        ...over,
    }
}

describe('search', () => {
    const medic = card({
        id: 'a', name: 'Section Medic',
        haystack: 'section medic|the section first aid kit|cpl bones|medical night|mx 3d rifle',
    })

    test('an empty query matches everything', () => {
        expect(matchesQuery(medic, '')).toBe(true)
        expect(matchesQuery(medic, '   ')).toBe(true)
    })

    test('matches the kit name, case-insensitively', () => {
        expect(matchesQuery(medic, 'MEDIC')).toBe(true)
    })

    test('matches the owner, a tag label and the primary weapon', () => {
        expect(matchesQuery(medic, 'bones')).toBe(true)
        expect(matchesQuery(medic, 'night')).toBe(true)
        expect(matchesQuery(medic, 'mx 3d')).toBe(true)
    })

    test('every word must match, not just one', () => {
        expect(matchesQuery(medic, 'medic bones')).toBe(true)
        expect(matchesQuery(medic, 'medic pilot')).toBe(false)
    })

    test('no match is no match', () => {
        expect(matchesQuery(medic, 'submarine')).toBe(false)
    })
})

describe('tag filter', () => {
    const kit = card({ id: 'a', tags: ['medical', 'night'] as KitTag[] })

    test('no tags selected matches everything', () => {
        expect(matchesTags(kit, [])).toBe(true)
    })

    test('matches a tag it carries', () => {
        expect(matchesTags(kit, ['medical'] as KitTag[])).toBe(true)
    })

    test('several tags is AND, not OR', () => {
        expect(matchesTags(kit, ['medical', 'night'] as KitTag[])).toBe(true)
        expect(matchesTags(kit, ['medical', 'sniper'] as KitTag[])).toBe(false)
    })
})

describe('sorting', () => {
    const older = card({ id: 'old', name: 'Alpha', updatedAt: 100, ratingScore: 4, copyCount: 10 })
    const newer = card({ id: 'new', name: 'Zulu', updatedAt: 200, ratingScore: 3, copyCount: 2 })

    test('newest first by default', () => {
        expect(sortCards([older, newer], 'newest').map(c => c.id)).toEqual(['new', 'old'])
    })

    test('top rated uses the weighted score, not the raw average', () => {
        expect(sortCards([newer, older], 'rated').map(c => c.id)).toEqual(['old', 'new'])
    })

    test('most copied', () => {
        expect(sortCards([newer, older], 'copied').map(c => c.id)).toEqual(['old', 'new'])
    })

    test('A-Z', () => {
        expect(sortCards([newer, older], 'name').map(c => c.id)).toEqual(['old', 'new'])
    })

    test('ties break on recency, in every sort', () => {
        const a = card({ id: 'a', name: 'Same', updatedAt: 100, ratingScore: 4, copyCount: 5 })
        const b = card({ id: 'b', name: 'Same', updatedAt: 300, ratingScore: 4, copyCount: 5 })
        for (const sort of SHELF_SORTS) {
            expect(sortCards([a, b], sort.key).map(c => c.id)).toEqual(['b', 'a'])
        }
    })

    test('does not mutate its input', () => {
        const input = [older, newer]
        sortCards(input, 'name')
        expect(input.map(c => c.id)).toEqual(['old', 'new'])
    })
})

describe('paging', () => {
    const many = Array.from({ length: 50 }, (_, i) => card({ id: String(i) }))

    test('a full page is KITS_PER_PAGE long', () => {
        expect(paginate(many, 1)).toHaveLength(KITS_PER_PAGE)
    })

    test('the last page holds the remainder', () => {
        expect(paginate(many, 3)).toHaveLength(50 - KITS_PER_PAGE * 2)
    })

    test('page count rounds up and is never zero', () => {
        expect(pageCount(50)).toBe(3)
        expect(pageCount(24)).toBe(1)
        expect(pageCount(0)).toBe(1)
    })

    test('an out-of-range page clamps rather than emptying the shelf', () => {
        expect(paginate(many, 99).map(c => c.id)).toEqual(paginate(many, 3).map(c => c.id))
        expect(paginate(many, 0).map(c => c.id)).toEqual(paginate(many, 1).map(c => c.id))
        expect(paginate(many, -5).map(c => c.id)).toEqual(paginate(many, 1).map(c => c.id))
    })
})

describe('tagCounts', () => {
    test('counts only tags in use, in declared order', () => {
        const cards = [
            card({ id: 'a', tags: ['night', 'medical'] as KitTag[] }),
            card({ id: 'b', tags: ['medical'] as KitTag[] }),
        ]
        expect(tagCounts(cards)).toEqual([
            { tag: 'medical', count: 2 },
            { tag: 'night', count: 1 },
        ])
    })

    test('an empty shelf offers no chips', () => {
        expect(tagCounts([])).toEqual([])
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/loadout/shelf.test.ts`
Expected: FAIL — cannot resolve `./shelf`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/loadout/shelf.ts`:

```ts
/**
 * Searching, filtering, sorting and paging the unit's kit shelf.
 *
 * Pure and React-free so it can be tested directly: the shelf component is a
 * thin layer of state over these functions.
 *
 * `ShelfCard` is only the part of a card these functions read. The rendered
 * card carries the owner, the gear list and the export as well; every function
 * here is generic over `T extends ShelfCard` so the fuller shape survives.
 */

import { KIT_TAG_KEYS, type KitTag } from './tags'

export type ShelfSort = 'newest' | 'rated' | 'copied' | 'name'

export const SHELF_SORTS: { key: ShelfSort; label: string }[] = [
    { key: 'newest', label: 'Newest' },
    { key: 'rated',  label: 'Top rated' },
    { key: 'copied', label: 'Most copied' },
    { key: 'name',   label: 'A–Z' },
]

export const KITS_PER_PAGE = 24

export type ShelfCard = {
    id: string
    name: string
    tags: KitTag[]
    /** Epoch milliseconds — a `Date` does not survive the server/client boundary. */
    updatedAt: number
    ratingAvg: number
    ratingCount: number
    /** `weightedScore(ratingAvg, ratingCount)`, computed once on the server. */
    ratingScore: number
    copyCount: number
    /** Lowercased, `|`-joined searchable text, built server-side. */
    haystack: string
}

/**
 * Every word must appear somewhere in the card's text, so a second word
 * narrows rather than widens. Substring rather than prefix matching: "mg"
 * should find "MG" and "LMG" both.
 */
export function matchesQuery(card: ShelfCard, query: string): boolean {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return terms.every(term => card.haystack.includes(term))
}

/** AND, not OR — the point of picking two is to find the kit that is both. */
export function matchesTags(card: ShelfCard, tags: KitTag[]): boolean {
    return tags.every(tag => card.tags.includes(tag))
}

const COMPARE: Record<ShelfSort, (a: ShelfCard, b: ShelfCard) => number> = {
    // Recency is the tiebreak applied to every sort, so "newest" needs no
    // comparator of its own — it is the tiebreak, unqualified.
    newest: () => 0,
    rated:  (a, b) => b.ratingScore - a.ratingScore,
    copied: (a, b) => b.copyCount - a.copyCount,
    name:   (a, b) => a.name.localeCompare(b.name),
}

/** Returns a new array — the caller's list is a memo dependency and must not move. */
export function sortCards<T extends ShelfCard>(cards: T[], sort: ShelfSort): T[] {
    return [...cards].sort((a, b) => COMPARE[sort](a, b) || b.updatedAt - a.updatedAt)
}

/** Never zero: an empty shelf is still one (empty) page. */
export function pageCount(total: number, perPage = KITS_PER_PAGE): number {
    return Math.max(1, Math.ceil(total / perPage))
}

/**
 * Clamps rather than trusting the page number. Filtering can shrink the list
 * under a page the reader is already on, and showing them the last page is
 * better than showing them nothing.
 */
export function paginate<T>(items: T[], page: number, perPage = KITS_PER_PAGE): T[] {
    const last = pageCount(items.length, perPage)
    const safe = Math.min(Math.max(1, Math.floor(page) || 1), last)
    return items.slice((safe - 1) * perPage, safe * perPage)
}

/**
 * The tags worth offering as filter chips: those at least one kit on the shelf
 * carries, with how many carry each. A bar of every tag in the vocabulary,
 * most of them matching nothing, is a worse control than a short one that
 * always leads somewhere.
 */
export function tagCounts(cards: ShelfCard[]): { tag: KitTag; count: number }[] {
    const counts = new Map<KitTag, number>()
    for (const card of cards) {
        for (const tag of card.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return KIT_TAG_KEYS
        .filter(tag => counts.has(tag))
        .map(tag => ({ tag, count: counts.get(tag)! }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/loadout/shelf.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/loadout/shelf.ts apps/web/lib/loadout/shelf.test.ts
git commit
```

Message:
```
feat(kits): add shelf search, sort and paging

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 4: Schema and indexes

**Files:**
- Modify: `apps/web/types/loadout.d.ts`
- Modify: `apps/web/lib/mongo.ts:46` (the `loadouts` line — add the two new collections beneath it)
- Create: `scripts/2026-08-19-kit-rating-indexes.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `MemberLoadout.tags?: string[]`, `MemberLoadout.ratingAvg?: number`, `MemberLoadout.ratingCount?: number`, `MemberLoadout.copyCount?: number`; global interfaces `LoadoutRating` and `LoadoutCopy`; `Db.loadoutRatings`, `Db.loadoutCopies`.

There is no unit test for this task — it is type declarations, a collection registration and a migration script. Its verification is `tsc` and a dry run of the script.

- [ ] **Step 1: Add the new fields and interfaces**

In `apps/web/types/loadout.d.ts`, inside the same `declare global` block, add these four fields to `MemberLoadout` immediately after `shared` and before `raw`:

```ts
        /**
         * Keys from `lib/loadout/tags.ts`. Typed `string[]` rather than
         * `KitTag[]` because a `.d.ts` cannot import; every write goes through
         * `normaliseTags`, and every read tolerates a key the vocabulary has
         * since dropped.
         */
        tags?: string[]
        /**
         * Denormalised from `loadout_ratings` on every rating. The shelf sorts
         * on these, and a lookup per card is what they exist to avoid — the
         * same reasoning as `voteScore` on a community ticket.
         */
        ratingAvg?: number
        ratingCount?: number
        /** Distinct actors who have copied it — see `loadout_copies`. */
        copyCount?: number
```

Then add both new interfaces after `MemberLoadout` closes, still inside `declare global`:

```ts
    /**
     * One member's rating of one kit. A collection rather than an array on the
     * loadout for two reasons: a rating carries a value per user, not just
     * membership; and the shelf sends each loadout document's `raw` to the
     * browser, so keeping ratings anonymous would otherwise depend on every
     * future projection remembering to exclude the raters. Here there is no
     * field to leak.
     *
     * Unique on `{ loadoutId, userId }` — that index *is* the
     * one-rating-per-member rule.
     */
    interface LoadoutRating {
        _id: ObjectId
        loadoutId: ObjectId
        /** Discord id. Always a member — anonymous visitors cannot rate. */
        userId: string
        stars: 1 | 2 | 3 | 4 | 5
        createdAt: Date
        updatedAt: Date
    }

    /**
     * One actor's copies of one kit. `MemberLoadout.copyCount` counts documents
     * here, not the `copies` field — the headline number is how many people
     * took the kit, not how many times.
     *
     * Unique on `{ loadoutId, actorId }`.
     */
    interface LoadoutCopy {
        _id: ObjectId
        loadoutId: ObjectId
        /** A Discord id, or `anon:<uuid>` for a signed-out visitor. */
        actorId: string
        /** Repeat copies by the same actor. Recorded, but nothing reads it. */
        copies: number
        firstCopiedAt: Date
        lastCopiedAt: Date
    }
```

- [ ] **Step 2: Register the collections**

In `apps/web/lib/mongo.ts`, directly beneath the existing `loadouts:` line:

```ts
    loadoutRatings: db.collection('loadout_ratings') as MongoCollection<LoadoutRating>,
    loadoutCopies: db.collection('loadout_copies') as MongoCollection<LoadoutCopy>,
```

- [ ] **Step 3: Write the index migration**

Create `scripts/2026-08-19-kit-rating-indexes.mjs`:

```js
#!/usr/bin/env node
// One-off migration: create the unique indexes the kit rating and copy-count
// collections rely on. Both are new and empty, so there is nothing to backfill
// — `ratingAvg`, `ratingCount`, `copyCount` and `tags` are all optional and
// read as 0/0/0/[] when absent.
//
// The uniqueness is not decoration: `{ loadoutId, userId }` is what enforces
// one rating per member, and `{ loadoutId, actorId }` is what makes a copy
// count distinct actors rather than clicks. Both routes upsert against them.
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

const INDEXES = [
    { collection: 'loadout_ratings', keys: { loadoutId: 1, userId: 1 },  name: 'loadoutId_userId_unique' },
    { collection: 'loadout_copies',  keys: { loadoutId: 1, actorId: 1 }, name: 'loadoutId_actorId_unique' },
]

const client = new MongoClient(MONGO_URI)

try {
    await client.connect()
    const db = client.db(MONGO_DB)

    for (const { collection, keys, name } of INDEXES) {
        if (!APPLY) {
            console.log(`[dry-run] would create unique index ${name} on ${collection}`, keys)
            continue
        }
        await db.collection(collection).createIndex(keys, { unique: true, name })
        console.log(`created unique index ${name} on ${collection}`)
    }

    if (!APPLY) console.log('\nDry run. Re-run with --apply to create them.')
} finally {
    await client.close()
}
```

- [ ] **Step 4: Verify types compile and the script runs**

Run, from `apps/web`:
```
npx tsc --noEmit
```
Expected: no errors.

Then from the repo root:
```
node -r dotenv/config scripts/2026-08-19-kit-rating-indexes.mjs dotenv_config_path=.env
```
Expected: two `[dry-run] would create unique index …` lines. Then re-run with `--apply` appended and expect two `created unique index …` lines. Running it twice with `--apply` must be harmless — `createIndex` is idempotent for an identical definition.

- [ ] **Step 5: Commit**

```bash
git add apps/web/types/loadout.d.ts apps/web/lib/mongo.ts scripts/2026-08-19-kit-rating-indexes.mjs
git commit
```

Message:
```
feat(kits): add rating and copy-count schema

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 5: Rating route

**Files:**
- Create: `apps/web/app/api/loadouts/[id]/rating/route.ts`

**Interfaces:**
- Consumes: `isStars`, `summarise` (Task 2); `Db.loadoutRatings`, `Db.loadouts` (Task 4).
- Produces: `PUT /api/loadouts/:id/rating` — request `{ stars: 1|2|3|4|5 }` or `{ stars: null }`; response `{ mine: number|null, avg: number, count: number }`.

This route has no unit test: it is I/O against Mongo and the Discord session, which this repo tests by hand (no route in `app/api` has a test file). Verification is the manual pass in Step 3.

- [ ] **Step 1: Write the route**

Create `apps/web/app/api/loadouts/[id]/rating/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { isStars, summarise } from '@/lib/loadout/rating'

/**
 * What the unit thinks of a shared kit.
 *
 * `PUT` only, and deliberately no `GET`: both pages that show a rating are
 * server components and read Mongo directly, so an endpoint to fetch one would
 * have no caller.
 *
 * Ratings are anonymous. Only the average and the count ever leave this file —
 * no response, here or anywhere, says who rated a kit, including to its owner.
 */

/**
 * Recompute the two denormalised fields from the collection that owns the
 * truth. Reading the rows rather than running a `$group`: a kit gathers tens of
 * ratings, not millions, and `summarise` is the same function the tests pin
 * the maths with.
 */
async function recount(loadoutId: ObjectId) {
    const rows = await Db.loadoutRatings
        .find({ loadoutId }, { projection: { stars: 1 } })
        .toArray()
    const { avg, count } = summarise(rows.map(row => row.stars))
    await Db.loadouts.updateOne({ _id: loadoutId }, { $set: { ratingAvg: avg, ratingCount: count } })
    return { avg, count }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const loadoutId = new ObjectId(id)

    // `shared: true` is part of the query, not a check after it: an unshared
    // kit is not addressable by anyone but its owner, and a 403 would confirm
    // it exists.
    const doc = await Db.loadouts.findOne({ _id: loadoutId, shared: true }, { projection: { userId: 1 } })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (doc.userId === me.id) {
        return NextResponse.json({ error: 'You cannot rate your own kit.' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)

    // An explicit null withdraws a rating. Distinct from a missing field,
    // which is a malformed request.
    if (body?.stars === null) {
        await Db.loadoutRatings.deleteOne({ loadoutId, userId: me.id })
        const { avg, count } = await recount(loadoutId)
        return NextResponse.json({ mine: null, avg, count })
    }

    if (!isStars(body?.stars)) {
        return NextResponse.json(
            { error: 'stars must be a whole number from 1 to 5, or null to withdraw.' },
            { status: 400 },
        )
    }

    const now = new Date()
    // Upsert against the unique `{ loadoutId, userId }` index rather than
    // checking for an existing row first — the index is what enforces one
    // rating per member, so rating again is a change, not a second vote.
    await Db.loadoutRatings.updateOne(
        { loadoutId, userId: me.id },
        { $set: { stars: body.stars, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true },
    )

    const { avg, count } = await recount(loadoutId)
    return NextResponse.json({ mine: body.stars, avg, count })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Exercise it by hand**

Start the dev server (`npm start` from the repo root, choose the web dev item). Signed in, with `<id>` a **shared** kit belonging to **another** member, run in the browser console on the site's own origin:

```js
await (await fetch('/api/loadouts/<id>/rating', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stars: 4 }),
})).json()
```

Expected, in order:
- `{ mine: 4, avg: 4, count: 1 }`.
- Repeating with `stars: 5` gives `{ mine: 5, avg: 5, count: 1 }` — a change, not a second rating.
- `stars: null` gives `{ mine: null, avg: 0, count: 0 }`.
- `stars: 0`, `stars: 6`, `stars: 3.5` and `stars: "4"` each give 400.
- The same call against **your own** kit gives 403.
- The same call against an **unshared** kit gives 404.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/loadouts/\[id\]/rating/route.ts
git commit
```

Message:
```
feat(kits): add the kit rating endpoint

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 6: Copy-count route

**Files:**
- Create: `apps/web/app/api/loadouts/[id]/copy/route.ts`

**Interfaces:**
- Consumes: `Db.loadoutCopies`, `Db.loadouts` (Task 4).
- Produces: `POST /api/loadouts/:id/copy` — no request body; response `{ copyCount: number }`. Sets the `kit_visitor` cookie on a signed-out visitor's first copy.

- [ ] **Step 1: Write the route**

Create `apps/web/app/api/loadouts/[id]/copy/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

/**
 * How many people have taken a kit off the shelf.
 *
 * A popularity signal, not an audit. The shelf is public, so most copies come
 * from visitors who are not signed in; counting only members would undercount
 * the majority, and requiring a sign-in to copy would put a wall in front of
 * the shelf's whole purpose. Signed-out visitors are therefore identified by a
 * long-lived cookie, which means the number is inflatable by anyone willing to
 * clear cookies repeatedly. That was the accepted trade.
 */

const VISITOR_COOKIE = 'kit_visitor'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * A signed-in member is their Discord id. Everyone else is a cookie. The
 * `anon:` prefix keeps the two id spaces from ever colliding — a Discord
 * snowflake is all digits, so nothing else could produce this string.
 *
 * Returns the cookie value to set when a visitor did not have one, since only
 * the response can set it.
 */
async function resolveActor(): Promise<{ actorId: string; freshCookie: string | null }> {
    const me = await client.fetchMe().catch(() => null)
    if (me) return { actorId: me.id, freshCookie: null }

    const jar = await cookies()
    const existing = jar.get(VISITOR_COOKIE)?.value
    if (existing) return { actorId: existing, freshCookie: null }

    const fresh = `anon:${randomUUID()}`
    return { actorId: fresh, freshCookie: fresh }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const loadoutId = new ObjectId(id)

    const doc = await Db.loadouts.findOne(
        { _id: loadoutId, shared: true },
        { projection: { userId: 1, copyCount: 1 } },
    )
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { actorId, freshCookie } = await resolveActor()

    // An owner copying their own kit is not a signal of anything.
    if (actorId === doc.userId) return NextResponse.json({ copyCount: doc.copyCount ?? 0 })

    const now = new Date()
    const result = await Db.loadoutCopies.updateOne(
        { loadoutId, actorId },
        { $inc: { copies: 1 }, $set: { lastCopiedAt: now }, $setOnInsert: { firstCopiedAt: now } },
        { upsert: true },
    )

    let copyCount = doc.copyCount ?? 0
    // Only a first copy by this actor moves the headline number. That single
    // condition is what makes it distinct people rather than total clicks.
    if (result.upsertedCount > 0) {
        await Db.loadouts.updateOne({ _id: loadoutId }, { $inc: { copyCount: 1 } })
        copyCount += 1
    }

    const res = NextResponse.json({ copyCount })
    if (freshCookie) {
        res.cookies.set(VISITOR_COOKIE, freshCookie, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: ONE_YEAR_SECONDS,
            secure: process.env.NODE_ENV === 'production',
        })
    }
    return res
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Exercise it by hand**

With the dev server running, in a **private window** (so there is no session and no cookie), on the site's origin:

```js
await (await fetch('/api/loadouts/<shared-id>/copy', { method: 'POST' })).json()
```

Expected:
- First call returns `{ copyCount: 1 }` and sets a `kit_visitor` cookie.
- A second call from the same window returns `{ copyCount: 1 }` — the same visitor, counted once.
- The same call from a *different* private window returns `{ copyCount: 2 }`.
- Signed in as the kit's **owner**, the count does not move.
- An unshared kit id gives 404.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/loadouts/\[id\]/copy/route.ts
git commit
```

Message:
```
feat(kits): count distinct copies of a shared kit

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 7: Accept tags on the write routes

**Files:**
- Modify: `apps/web/app/api/loadouts/route.ts` (the `POST` handler)
- Modify: `apps/web/app/api/loadouts/[id]/route.ts` (the `PATCH` handler)

**Interfaces:**
- Consumes: `normaliseTags` (Task 1).
- Produces: both routes accept an optional `tags: string[]` field.

- [ ] **Step 1: Accept tags at import**

In `apps/web/app/api/loadouts/route.ts`, add to the imports:

```ts
import { normaliseTags } from '@/lib/loadout/tags'
```

Below the existing `const icon = …` line, add:

```ts
    // Same treatment as the icon: validated against the vocabulary rather than
    // merely typed, de-duplicated and capped, because these become `Record`
    // lookups when chips render on the public shelf.
    const tags = normaliseTags(body?.tags)
```

Then in the `insertOne` document, immediately after the `...(icon ? { icon } : {})` line:

```ts
        ...(tags.length ? { tags } : {}),
```

- [ ] **Step 2: Accept tags on edit, and say why `raw` is absent**

In `apps/web/app/api/loadouts/[id]/route.ts`, add to the imports:

```ts
import { normaliseTags } from '@/lib/loadout/tags'
```

After the existing `if (isKitIcon(body?.icon)) set.icon = body.icon` line, add:

```ts
    // `undefined` means "not editing tags"; an empty array means "clear them",
    // so the two cases cannot be collapsed into a truthiness check.
    if (body?.tags !== undefined) set.tags = normaliseTags(body.tags)

    // `raw` is deliberately absent, and must stay absent. A kit's contents are
    // what the member exported from the arsenal; changing them means exporting
    // again and re-importing. Everything around the export is editable — name,
    // description, icon, tags, visibility — the export itself is not.
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Exercise it by hand**

With the dev server running, signed in, `<id>` being **your own** kit:

```js
await (await fetch('/api/loadouts/<id>', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags: ['mg', 'night', 'nonsense', 'mg'] }),
})).json()
```

Expected: `{ ok: true }`, and the stored document holds exactly `['medical'...]` — specifically `['night', 'mg']` reordered to declared order `['mg', 'night']`, with the unknown key and the duplicate gone. Verify with a `GET` of your milpac page or directly in Mongo. Then confirm `{ tags: [] }` clears them, and that sending `{ raw: 'anything' }` changes nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/loadouts/route.ts apps/web/app/api/loadouts/\[id\]/route.ts
git commit
```

Message:
```
feat(kits): accept tags when importing and editing a kit

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 8: Stars and tag chips

**Files:**
- Create: `apps/web/components/loadout/stars.tsx`
- Create: `apps/web/components/loadout/tag-chips.tsx`
- Modify: `apps/web/app/(landing)/milpacs/[username]/profile.module.css` (append the new classes)

**Interfaces:**
- Consumes: `formatAvg`, `NO_RATING` (Task 2); `KIT_TAG_LABELS`, `KitTag` (Task 1); `PUT /api/loadouts/:id/rating` (Task 5).
- Produces: `<Stars avg count mine? loadoutId? interactive? />` and `<TagChips tags />`.

- [ ] **Step 1: Write the tag chips**

Create `apps/web/components/loadout/tag-chips.tsx`:

```tsx
import { KIT_TAG_LABELS, type KitTag } from '@/lib/loadout/tags'
import s from '@/app/(landing)/milpacs/[username]/profile.module.css'

/**
 * A kit's tags, as chips.
 *
 * No client boundary — it renders text. Both the shelf card and the kit panel
 * use it, so it lives here rather than in either page, and it draws on
 * `profile.module.css` for the same reason the shelf does: that file is the
 * design system both pages already share.
 *
 * Renders nothing at all for an untagged kit rather than an empty row, so a
 * card without tags keeps its height.
 */
export function TagChips({ tags }: { tags: KitTag[] }) {
    if (tags.length === 0) return null
    return (
        <ul className={s.tagChips}>
            {tags.map(tag => (
                <li key={tag} className={s.tagChip}>{KIT_TAG_LABELS[tag]}</li>
            ))}
        </ul>
    )
}
```

- [ ] **Step 2: Write the stars**

Create `apps/web/components/loadout/stars.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { formatAvg } from '@/lib/loadout/rating'
import s from '@/app/(landing)/milpacs/[username]/profile.module.css'

/**
 * What the unit makes of a kit.
 *
 * Two modes from one component so the shelf card and the kit page cannot drift
 * apart: read-only shows the average and how many gave it; interactive adds a
 * hover preview and click-to-rate.
 *
 * Deliberately not the `Star` in `loadout-manager.tsx`. That one nominates a
 * default kit — a toggle the owner presses on their own file. This is a
 * five-value scale other people set. They look alike and mean nothing alike.
 */

function StarGlyph({ fill, size }: { fill: 'full' | 'half' | 'none'; size: number }) {
    const path = 'M12 2.8 15 9.5l7.2 1-5.2 5 1.2 7.2L12 19.3 5.8 22.7 7 15.5 1.8 10.5l7.2-1z'
    // A half star is the same path clipped down the middle, so a 4.5 reads as
    // four and a half rather than rounding away the half a member earned.
    const clipId = `half-${size}`
    return (
        <svg viewBox='0 0 24 24' width={size} height={size} aria-hidden='true'
            stroke='currentColor' strokeWidth={1.5} strokeLinejoin='round'>
            {fill === 'half' && (
                <defs>
                    <clipPath id={clipId}><rect x='0' y='0' width='12' height='24' /></clipPath>
                </defs>
            )}
            <path d={path} fill='none' />
            {fill === 'full' && <path d={path} fill='currentColor' />}
            {fill === 'half' && <path d={path} fill='currentColor' clipPath={`url(#${clipId})`} />}
        </svg>
    )
}

export function Stars({
    avg, count, mine = null, loadoutId, interactive = false, size = 14,
}: {
    avg: number
    count: number
    /** The viewer's own rating, when they have one. */
    mine?: number | null
    /** Required when `interactive`. */
    loadoutId?: string
    interactive?: boolean
    size?: number
}) {
    const [state, setState] = useState({ avg, count, mine })
    const [hover, setHover] = useState<number | null>(null)
    const [busy, setBusy] = useState(false)

    // Interactive stars show the viewer their own rating, not the average —
    // the average is beside them, and a control that ignores your input to
    // display a crowd's is a control nobody trusts.
    const shown = interactive ? (hover ?? state.mine ?? 0) : state.avg

    const rate = async (stars: number) => {
        if (!interactive || !loadoutId || busy) return
        // Clicking the star you already gave withdraws the rating.
        const next = state.mine === stars ? null : stars
        const previous = state
        setBusy(true)
        setState(s => ({ ...s, mine: next }))   // optimistic
        try {
            const res = await fetch(`/api/loadouts/${loadoutId}/rating`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stars: next }),
            })
            if (!res.ok) throw new Error('rating rejected')
            const json = await res.json()
            setState({ avg: json.avg, count: json.count, mine: json.mine })
        } catch {
            setState(previous)   // put the display back rather than lying about it
        } finally {
            setBusy(false)
        }
    }

    const label = state.count === 1 ? '1 rating' : `${state.count} ratings`

    return (
        <div className={interactive ? `${s.stars} ${s.starsLive}` : s.stars}
            onMouseLeave={() => setHover(null)}>
            {[1, 2, 3, 4, 5].map(n => {
                const fill = shown >= n ? 'full' : shown >= n - 0.5 ? 'half' : 'none'
                if (!interactive) {
                    return <span key={n} className={s.star}><StarGlyph fill={fill} size={size} /></span>
                }
                return (
                    <button
                        key={n}
                        type='button'
                        className={s.star}
                        disabled={busy}
                        aria-label={state.mine === n ? `Withdraw your ${n}-star rating` : `Rate ${n} of 5`}
                        aria-pressed={state.mine === n}
                        onMouseEnter={() => setHover(n)}
                        onFocus={() => setHover(n)}
                        onBlur={() => setHover(null)}
                        onClick={() => rate(n)}
                    >
                        <StarGlyph fill={fill} size={size} />
                    </button>
                )
            })}
            <span className={s.starsNum}>{formatAvg(state.avg, state.count)}</span>
            <span className={s.starsCount}>
                {state.count === 0 ? 'Not yet rated' : `(${state.count})`}
                <span className={s.srOnly}>{label}</span>
            </span>
        </div>
    )
}
```

- [ ] **Step 3: Add the styles**

Append to `apps/web/app/(landing)/milpacs/[username]/profile.module.css`. Match the file's existing conventions — it already defines `--acc` / `--acc-rgb` on `.shell` and styles `.btn`, `.kitPick` and `.kitDot` against them; these classes must read from the same custom properties so a card tinted with its owner's accent tints these too.

```css
/* ── Kit tags ─────────────────────────────────────────────────────────── */

.tagChips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.tagChip {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 2px;
    color: rgb(var(--acc-rgb));
    background: rgba(var(--acc-rgb), .10);
    border: 1px solid rgba(var(--acc-rgb), .28);
    white-space: nowrap;
}

/* ── Kit rating ───────────────────────────────────────────────────────── */

.stars {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: rgb(var(--acc-rgb));
}

.star {
    display: inline-flex;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    line-height: 0;
}

.starsLive .star {
    cursor: pointer;
    transition: transform .12s ease;
}

.starsLive .star:hover,
.starsLive .star:focus-visible {
    transform: scale(1.18);
}

.starsLive .star:disabled {
    cursor: default;
    opacity: .6;
}

.starsNum {
    margin-left: 6px;
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.starsCount {
    margin-left: 4px;
    font-size: 11px;
    opacity: .62;
}
```

Check whether `.srOnly` already exists in this file (`loadout-manager.tsx` uses `s.srOnly`, so it should). If it does not, add:

```css
.srOnly {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/loadout/stars.tsx apps/web/components/loadout/tag-chips.tsx apps/web/app/\(landing\)/milpacs/\[username\]/profile.module.css
git commit
```

Message:
```
feat(kits): add the star rating and tag chip components

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 9: Owner editing — name and tags

**Files:**
- Modify: `apps/web/app/(landing)/milpacs/[username]/loadout-manager.tsx`
- Modify: `apps/web/app/(landing)/milpacs/[username]/profile.module.css` (the tag picker grid)
- Modify: `apps/web/app/(landing)/milpacs/[username]/milpac-file.tsx:218` (add `tags` to the `loadoutList` mapping)

**Interfaces:**
- Consumes: `KIT_TAG_GROUPS`, `KIT_TAG_LABELS`, `MAX_KIT_TAGS`, `KitTag` (Task 1); `PATCH /api/loadouts/:id` accepting `tags` (Task 7).
- Produces: the `Summary` type in `loadout-manager.tsx` gains `tags: KitTag[]`.

- [ ] **Step 1: Add a tag picker beside the icon picker**

In `loadout-manager.tsx`, add to the imports:

```tsx
import { KIT_TAG_GROUPS, KIT_TAG_LABELS, MAX_KIT_TAGS, type KitTag } from '@/lib/loadout/tags'
```

Add `tags` to the `Summary` type:

```tsx
    tags: KitTag[]
```

Add the picker component beside `IconPicker`:

```tsx
/**
 * The tag grid. Checkboxes rather than a radiogroup — a kit is often two
 * things at once — grouped under headings so twenty-nine options read as four
 * short lists.
 *
 * Unchosen tags disable once the cap is reached rather than the save failing
 * afterwards: the limit is visible at the moment it starts to matter.
 */
function TagPicker({ value, onToggle }: { value: KitTag[]; onToggle: (tag: KitTag) => void }) {
    const full = value.length >= MAX_KIT_TAGS
    return (
        <div className={s.kitTagPicker}>
            {KIT_TAG_GROUPS.map(({ group, tags }) => (
                <div key={group} className={s.kitTagGroup}>
                    <span className={s.kitTagGroupName}>{group}</span>
                    <div className={s.kitTagOpts}>
                        {tags.map(tag => {
                            const on = value.includes(tag)
                            return (
                                <button
                                    key={tag}
                                    type='button'
                                    role='checkbox'
                                    aria-checked={on}
                                    disabled={!on && full}
                                    className={on ? `${s.kitTagOpt} ${s.kitTagOptOn}` : s.kitTagOpt}
                                    onClick={() => onToggle(tag)}
                                >
                                    {KIT_TAG_LABELS[tag]}
                                </button>
                            )
                        })}
                    </div>
                </div>
            ))}
            <p className={s.kitFieldNote}>
                {value.length} of {MAX_KIT_TAGS} chosen
                {full && ' — deselect one to pick another'}
            </p>
        </div>
    )
}
```

- [ ] **Step 2: Wire the edit block — name, tags, and a shared toggle helper**

In the `LoadoutManager` body, add state beside the existing drafts:

```tsx
    const [nameDraft, setNameDraft] = useState('')
    const [tagsDraft, setTagsDraft] = useState<KitTag[]>([])
    const [importTags, setImportTags] = useState<KitTag[]>([])
```

Add a toggle helper next to `saveDetails`, and extend `saveDetails` to send all four fields:

```tsx
    /** Shared by both pickers; the cap is enforced here as well as in the UI. */
    const toggleTag = (list: KitTag[], tag: KitTag): KitTag[] =>
        list.includes(tag)
            ? list.filter(t => t !== tag)
            : list.length >= MAX_KIT_TAGS ? list : [...list, tag]

    const saveDetails = () => {
        if (!active) return
        const name = nameDraft.trim()
        // An unnamed kit is unusable in the picker, so an empty box is refused
        // rather than saved and worked around later.
        if (!name) { setError('A kit needs a name.'); return }
        patch(active.id, { name, description: descDraft, icon: iconDraft, tags: tagsDraft })
    }
```

In the `editing` branch of the JSX, add a Name field **above** the existing Icon field:

```tsx
                            <div className={s.kitField}>
                                <span className={s.lbl}>Name</span>
                                <input
                                    className={s.kitImportName}
                                    placeholder='e.g. Section Medic'
                                    aria-label='Kit name'
                                    maxLength={MAX_NAME}
                                    value={nameDraft}
                                    autoFocus
                                    onChange={e => setNameDraft(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') saveDetails()
                                        if (e.key === 'Escape') setEditing(false)
                                    }}
                                />
                            </div>
```

Remove `autoFocus` from the existing description input — focus belongs on the first field, not the second.

Add a Tags field **below** the Icon field, still inside the `editing` branch:

```tsx
                            <div className={s.kitField}>
                                <span className={s.lbl}>Tags</span>
                                <TagPicker value={tagsDraft} onToggle={t => setTagsDraft(list => toggleTag(list, t))} />
                            </div>
```

In the Edit button's `onClick`, seed the two new drafts alongside the existing ones:

```tsx
                                        setNameDraft(active.name)
                                        setDescDraft(active.description)
                                        setIconDraft(active.icon)
                                        setTagsDraft(active.tags)
```

- [ ] **Step 3: Add the tag picker to the import dialog**

In `importDialog`, directly after the Icon field, add:

```tsx
                    <div className={s.kitField}>
                        <span className={s.lbl}>Tags — optional</span>
                        <TagPicker value={importTags} onToggle={t => setImportTags(list => toggleTag(list, t))} />
                    </div>
```

And include them in `submit`'s body:

```tsx
                body: JSON.stringify({ raw, name, description, shared: makePublic, icon: importIcon, tags: importTags }),
```

- [ ] **Step 4: Pass tags into the manager**

In `milpac-file.tsx`, in the `loadoutList` mapping around line 218, add to each entry:

```tsx
        tags: normaliseTags(l.tags),
```

and add the import:

```tsx
import { normaliseTags } from '@/lib/loadout/tags'
```

`normaliseTags` rather than `l.tags ?? []` so a key dropped from the vocabulary since the kit was tagged cannot reach `KIT_TAG_LABELS`.

- [ ] **Step 5: Add the picker styles**

Append to `profile.module.css`:

```css
/* ── Tag picker ───────────────────────────────────────────────────────── */

.kitTagPicker {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.kitTagGroup {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.kitTagGroupName {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .1em;
    text-transform: uppercase;
    opacity: .5;
}

.kitTagOpts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.kitTagOpt {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 2px;
    cursor: pointer;
    color: inherit;
    background: rgba(255, 255, 255, .04);
    border: 1px solid rgba(255, 255, 255, .14);
    transition: background .12s ease, border-color .12s ease;
}

.kitTagOpt:hover:not(:disabled) {
    border-color: rgba(var(--acc-rgb), .5);
}

.kitTagOptOn {
    color: rgb(var(--acc-rgb));
    background: rgba(var(--acc-rgb), .14);
    border-color: rgba(var(--acc-rgb), .55);
}

.kitTagOpt:disabled {
    opacity: .32;
    cursor: default;
}
```

- [ ] **Step 6: Typecheck, lint and exercise by hand**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

Then with the dev server running, on your own milpac's Kits tab:
- Import a kit with two tags chosen — they appear on the kit after import.
- Press Edit: name, icon, description and tags are all populated and editable.
- Rename the kit and save — the picker chip shows the new name.
- Choose a fifth tag — the unchosen tags are disabled and the note says `4 of 4 chosen`.
- Clear the name and save — it refuses with "A kit needs a name."
- Confirm there is still no way to edit the export itself.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/\(landing\)/milpacs/\[username\]/loadout-manager.tsx apps/web/app/\(landing\)/milpacs/\[username\]/milpac-file.tsx apps/web/app/\(landing\)/milpacs/\[username\]/profile.module.css
git commit
```

Message:
```
feat(kits): let owners rename and tag a kit after import

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 10: Rating and tags on the kit page

**Files:**
- Modify: `apps/web/app/(landing)/milpacs/[username]/loadout-panel.tsx`
- Modify: `apps/web/app/(landing)/milpacs/[username]/milpac-file.tsx` (around lines 208–230 and 567–585)

**Interfaces:**
- Consumes: `<Stars>`, `<TagChips>` (Task 8); `Db.loadoutRatings` (Task 4); `normaliseTags` (Task 1); `weightedScore` is *not* needed here.
- Produces: `LoadoutPanel` gains a `rating?: { avg: number; count: number; mine: number|null; loadoutId: string; canRate: boolean }` prop and a `tags: KitTag[]` prop.

- [ ] **Step 1: Read the viewer's own rating**

In `milpac-file.tsx`, after `activeLoadout` is resolved (around line 230), add:

```tsx
    // The viewer's own rating, for the control's initial state. Only ever their
    // own row: nothing here reads, or could read, who else rated it.
    const viewer = await client.fetchMe().catch(() => null)
    const myRating = activeLoadout && viewer && !isOwn
        ? await Db.loadoutRatings.findOne(
            { loadoutId: activeLoadout._id, userId: viewer.id },
            { projection: { stars: 1 } },
        )
        : null
```

If `milpac-file.tsx` already resolves the signed-in member for `isOwn`, reuse that variable instead of fetching twice — check before adding.

- [ ] **Step 2: Pass rating and tags into the panel**

In the `tab === 'kits'` branch, extend the `LoadoutPanel` call:

```tsx
                                <LoadoutPanel
                                    loadout={activeLoadout}
                                    tags={normaliseTags(activeLoadout.tags)}
                                    rating={{
                                        loadoutId: String(activeLoadout._id),
                                        avg: activeLoadout.ratingAvg ?? 0,
                                        count: activeLoadout.ratingCount ?? 0,
                                        mine: myRating?.stars ?? null,
                                        // Only a signed-in visitor who is not the owner may
                                        // rate, and only a published kit can be rated at all.
                                        canRate: Boolean(viewer) && !isOwn && activeLoadout.shared,
                                    }}
                                    actions={/* unchanged */}
                                />
```

- [ ] **Step 3: Render them in the panel**

In `loadout-panel.tsx`, add the imports:

```tsx
import { Stars } from '@/components/loadout/stars'
import { TagChips } from '@/components/loadout/tag-chips'
import type { KitTag } from '@/lib/loadout/tags'
```

Extend `LoadoutPanel`'s props to exactly this signature — `tags` is required and defaults to nothing, `rating` is optional so a private kit simply omits it:

```tsx
export function LoadoutPanel({ loadout, tags, rating, actions }: {
    loadout: MemberLoadout
    tags: KitTag[]
    /** Absent on a kit that cannot be rated at all — an unpublished one. */
    rating?: {
        loadoutId: string
        avg: number
        count: number
        /** The viewer's own rating, never anyone else's. */
        mine: number | null
        canRate: boolean
    }
    actions?: React.ReactNode
}) {
```

Keep whatever type `actions` already has in the file rather than changing it. Then render a header row above the existing weapon grid:

```tsx
            {/* What the kit is for, and what the unit makes of it — above the
                gear, because both are read before the item list is. Absent
                entirely on a private kit: an unpublished kit has no audience
                to have an opinion. */}
            {(tags.length > 0 || rating) && (
                <div className={s.kitMeta}>
                    <TagChips tags={tags} />
                    {rating && (
                        <Stars
                            avg={rating.avg}
                            count={rating.count}
                            mine={rating.mine}
                            loadoutId={rating.loadoutId}
                            interactive={rating.canRate}
                            size={16}
                        />
                    )}
                </div>
            )}
```

Add to `profile.module.css`:

```css
.kitMeta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, .07);
}
```

- [ ] **Step 4: Count copies made from the kit page too**

The shelf is not the only place a kit is copied — `loadout-manager.tsx` has its
own "Copy kit" button calling `copyText(active.raw)` directly. A copy made
there is the same act and must reach the same counter, or the number means
"copies from the shelf" while the page calls it copies.

In `loadout-manager.tsx`, extend that button's `onClick`:

```tsx
                        onClick={async () => {
                            setCopied(await copyText(active.raw))
                            setTimeout(() => setCopied(false), 1800)
                            // Only a published kit has a count to move, and the
                            // route ignores the owner's own copies anyway.
                            if (active.shared) {
                                fetch(`/api/loadouts/${active.id}/copy`, { method: 'POST', keepalive: true })
                                    .catch(() => {})
                            }
                        }}
```

The clipboard write stays ahead of the request for the same reason it does on
the shelf: a round-trip between the gesture and the write is what costs the
page its clipboard permission.

- [ ] **Step 5: Typecheck, lint and exercise by hand**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

Then, with the dev server running:
- On **another member's** shared kit, signed in: the stars are clickable, clicking sets a rating and the average updates without a reload; clicking the same star withdraws it.
- On **your own** kit: the stars render read-only.
- Signed out: read-only.
- A kit with no ratings reads "Not yet rated".
- Copying a published kit from this page moves its copy count on the shelf.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(landing\)/milpacs/\[username\]/loadout-panel.tsx apps/web/app/\(landing\)/milpacs/\[username\]/milpac-file.tsx apps/web/app/\(landing\)/milpacs/\[username\]/profile.module.css
git commit
```

Message:
```
feat(kits): show tags and let visitors rate on the kit page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 11: The shelf

**Files:**
- Create: `apps/web/app/(landing)/community/kits/kit-card.tsx`
- Create: `apps/web/app/(landing)/community/kits/shelf.tsx`
- Modify: `apps/web/app/(landing)/community/kits/page.tsx`
- Modify: `apps/web/app/(landing)/community/kits/copy-kit.tsx`
- Modify: `apps/web/app/(landing)/community/kits/kits.module.css`

**Interfaces:**
- Consumes: everything from Tasks 1–3 and 8; `POST /api/loadouts/:id/copy` (Task 6).
- Produces: `type CardData` (exported from `kit-card.tsx`), `<KitCard card />`, `<Shelf cards />`.

This is the largest task. It moves the card markup out of `page.tsx` unchanged, then wraps it in a client shelf — do the move first and confirm the page still renders identically before adding any controls.

- [ ] **Step 1: Extract the card, unchanged**

Create `apps/web/app/(landing)/community/kits/kit-card.tsx` as a **client** component holding the `<article>` markup currently inline in `page.tsx`, driven by plain data rather than by server-resolved objects:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import Avatar from '@/components/member/avatar'
import { LoadoutIcon } from '@/components/loadout/icons'
import { KitIcon, UiIcon } from '@/components/loadout/kit-icons'
import { TagChips } from '@/components/loadout/tag-chips'
import { Stars } from '@/components/loadout/stars'
import type { IconKey } from '@/lib/loadout/classify'
import type { KitIconKey } from '@/lib/loadout/kit-icons'
import type { ShelfCard } from '@/lib/loadout/shelf'
import { CopyKitButton } from './copy-kit'

import s from '../../milpacs/[username]/profile.module.css'
import k from './kits.module.css'

/**
 * One kit on the shelf.
 *
 * A client component, but every string in it was resolved on the server:
 * `resolveItemName` reads a ~2.7MB dictionary that must never reach the
 * browser, so `page.tsx` resolves names and icon keys and this renders them.
 * `CardData` is therefore all plain, serialisable values — no `Date`, no
 * `ObjectId`.
 */
export type CardData = ShelfCard & {
    description: string
    icon: KitIconKey
    raw: string
    itemCount: number
    primary: { name: string; icon: IconKey; attachments: { name: string; icon: IconKey }[] } | null
    gear: { label: string; icon: IconKey; name: string }[]
    owner: { id: string; avatarURL: string; label: string; path: string; accent: string; accentRgb: string }
}

export function KitCard({ card, delay }: { card: CardData; delay: string }) {
    const href = `${card.owner.path}/kits/${card.id}` as Route
    // Held here rather than inside the button so the footer's number and the
    // button that moves it stay one fact. Seeded from the server and corrected
    // by the copy endpoint's own answer.
    const [copies, setCopies] = useState(card.copyCount)
    return (
        <article
            className={`${s.panel} ${s.rise} ${k.card}`}
            style={{
                animationDelay: delay,
                ['--acc' as string]: card.owner.accent,
                ['--acc-rgb' as string]: card.owner.accentRgb,
            }}
        >
            <header className={k.cardHead}>
                <div className={k.cardAvatar}>
                    <Avatar user={{ id: card.owner.id, avatarURL: card.owner.avatarURL }} />
                </div>
                <div className={k.cardWho}>
                    {/* The whole card is not one link: the footer holds a
                        copy button, and a button inside a link is invalid. */}
                    <Link href={href} className={k.cardName}>
                        <KitIcon icon={card.icon} size={15} />
                        {card.name}
                    </Link>
                    <span className={k.cardOwner}>{card.owner.label}</span>
                </div>
            </header>

            <div className={k.cardMain}>
                <TagChips tags={card.tags} />
                {card.description && <p className={k.cardBlurb}>{card.description}</p>}

                {card.primary
                    ? (
                        <div>
                            <div className={k.cardWeapon}>
                                <LoadoutIcon icon={card.primary.icon} size={18} />
                                <span className={k.cardWeaponName}>{card.primary.name}</span>
                            </div>
                            {card.primary.attachments.length > 0 && (
                                <div className={k.cardAtt} style={{ marginTop: 8 }}>
                                    {card.primary.attachments.map(a => (
                                        <span key={a.name} className={k.cardAttItem}>
                                            <LoadoutIcon icon={a.icon} size={12} />
                                            {a.name}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                    : <div className={s.empty}>No primary weapon</div>}

                <ul className={k.gear}>
                    {card.gear.map(row => (
                        <li key={row.label} className={k.gearRow}>
                            <LoadoutIcon icon={row.icon} size={15} />
                            <span className={k.gearLabel}>{row.label}</span>
                            <span className={k.gearName}>{row.name}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <div className={k.cardRating}>
                <Stars avg={card.ratingAvg} count={card.ratingCount} />
            </div>

            <footer className={k.cardFoot}>
                {/* One wrapper, not two `.cardCount` spans: that class already
                    carries `margin-right: auto`, and a second one would fight
                    the first for the footer's free space. */}
                <span className={k.cardCount}>
                    {card.itemCount} items
                    <span className={k.cardCopies}>
                        {copies} {copies === 1 ? 'copy' : 'copies'}
                    </span>
                </span>
                <Link href={href} className={s.btn}><UiIcon icon='open' />View</Link>
                <CopyKitButton
                    raw={card.raw}
                    name={card.name}
                    loadoutId={card.id}
                    onCopied={setCopies}
                />
            </footer>
        </article>
    )
}
```

- [ ] **Step 2: Report the copy**

Modify `copy-kit.tsx` to take the two new props and report after copying:

```tsx
export function CopyKitButton({ raw, name, loadoutId, onCopied }: {
    raw: string
    name: string
    /** Absent on the milpac's own copy button, which reports nothing. */
    loadoutId?: string
    /** Handed the endpoint's own count, so the footer never guesses. */
    onCopied?: (copyCount: number) => void
}) {
    const [copied, setCopied] = useState(false)

    return (
        <button
            type='button'
            className={`${s.btn} ${s.kitCopy}`}
            aria-label={`Copy the ${name} kit export`}
            aria-live='polite'
            onClick={async () => {
                // The clipboard write goes first and is never behind an await
                // on the network: the browser grants clipboard access on the
                // user's gesture, and a round-trip in between is what revokes
                // it. A failed count is invisible; a failed copy is the whole
                // feature not working.
                const ok = await copyText(raw)
                setCopied(ok)
                setTimeout(() => setCopied(false), 1800)

                // Fire-and-forget. `keepalive` so it still goes if the reader
                // navigates away in the same breath.
                if (!loadoutId) return
                fetch(`/api/loadouts/${loadoutId}/copy`, { method: 'POST', keepalive: true })
                    .then(res => res.ok ? res.json() : null)
                    .then(json => { if (json) onCopied?.(json.copyCount) })
                    .catch(() => {})
            }}
        >
            <UiIcon icon={copied ? 'check' : 'copy'} />
            {copied ? 'Copied' : 'Copy'}
        </button>
    )
}
```

- [ ] **Step 3: Write the shelf**

Create `apps/web/app/(landing)/community/kits/shelf.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { KIT_TAG_LABELS, type KitTag } from '@/lib/loadout/tags'
import {
    KITS_PER_PAGE, SHELF_SORTS, matchesQuery, matchesTags,
    pageCount, paginate, sortCards, tagCounts, type ShelfSort,
} from '@/lib/loadout/shelf'
import { UiIcon } from '@/components/loadout/kit-icons'
import { KitCard, type CardData } from './kit-card'

import s from '../../milpacs/[username]/profile.module.css'
import k from './kits.module.css'

/**
 * The shelf's controls and grid.
 *
 * Filtering happens here rather than on the server because the page already
 * ships every card — searching over what is in memory costs a keystroke, and
 * searching over the network costs a round-trip per keystroke. Every rule it
 * applies lives in `lib/loadout/shelf.ts`, which is where they are tested;
 * this file is state and markup.
 *
 * That state is not mirrored into the URL, so a filtered shelf is not
 * linkable and `/community/kits` always opens unfiltered. The alternative
 * makes every keystroke a navigation.
 */
export function Shelf({ cards }: { cards: CardData[] }) {
    const [query, setQuery] = useState('')
    const [tags, setTags] = useState<KitTag[]>([])
    const [sort, setSort] = useState<ShelfSort>('newest')
    const [page, setPage] = useState(1)

    // Counted over every card, not the filtered set, so a chip's number does
    // not change as you type — it says how many kits carry the tag, always.
    const chips = useMemo(() => tagCounts(cards), [cards])

    const filtered = useMemo(
        () => sortCards(cards.filter(c => matchesQuery(c, query) && matchesTags(c, tags)), sort),
        [cards, query, tags, sort],
    )

    const pages = pageCount(filtered.length)
    const shown = paginate(filtered, page)

    // Any change to what is being shown returns to the first page — staying on
    // page 4 of a search that now has one page shows an empty shelf.
    const change = <T,>(set: (v: T) => void) => (value: T) => { set(value); setPage(1) }

    const toggleTag = change<KitTag>(tag =>
        setTags(list => list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag]))

    return (
        <>
            <div className={k.controls}>
                <div className={k.search}>
                    <UiIcon icon='search' size={13} />
                    <input
                        type='search'
                        className={k.searchInput}
                        placeholder='Search kits, members, weapons…'
                        aria-label='Search kits'
                        value={query}
                        onChange={e => change(setQuery)(e.target.value)}
                    />
                </div>

                <div className={k.sorts} role='group' aria-label='Sort kits'>
                    {SHELF_SORTS.map(option => (
                        <button
                            key={option.key}
                            type='button'
                            aria-pressed={sort === option.key}
                            className={sort === option.key ? `${k.sort} ${k.sortOn}` : k.sort}
                            onClick={() => change(setSort)(option.key)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            {chips.length > 0 && (
                <div className={k.filters} role='group' aria-label='Filter by tag'>
                    {chips.map(({ tag, count }) => {
                        const on = tags.includes(tag)
                        return (
                            <button
                                key={tag}
                                type='button'
                                aria-pressed={on}
                                className={on ? `${k.filter} ${k.filterOn}` : k.filter}
                                onClick={() => toggleTag(tag)}
                            >
                                {KIT_TAG_LABELS[tag]}<span className={k.filterCount}>{count}</span>
                            </button>
                        )
                    })}
                    {tags.length > 0 && (
                        <button type='button' className={k.filterClear} onClick={() => change(setTags)([])}>
                            <UiIcon icon='close' size={11} />Clear
                        </button>
                    )}
                </div>
            )}

            {shown.length === 0
                ? (
                    <p className={k.none}>
                        <strong>No kits match</strong>
                        Nothing on the shelf fits that search.<br />
                        Try fewer words, or clear the tag filters.
                    </p>
                )
                : (
                    <div className={k.grid}>
                        {shown.map((card, i) => (
                            <KitCard
                                key={card.id}
                                card={card}
                                // Capped at eight so the last card on a full page is not
                                // still waiting to appear seconds after the first.
                                delay={`${Math.min(i, 8) * 0.045}s`}
                            />
                        ))}
                    </div>
                )}

            {pages > 1 && (
                <nav className={k.pager} aria-label='Kit pages'>
                    <button type='button' className={k.pageBtn} disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}>
                        <UiIcon icon='prev' size={11} />Prev
                    </button>
                    {Array.from({ length: pages }, (_, i) => i + 1).map(n => (
                        <button
                            key={n}
                            type='button'
                            aria-current={n === page ? 'page' : undefined}
                            className={n === page ? `${k.pageBtn} ${k.pageBtnOn}` : k.pageBtn}
                            onClick={() => setPage(n)}
                        >
                            {n}
                        </button>
                    ))}
                    <button type='button' className={k.pageBtn} disabled={page >= pages}
                        onClick={() => setPage(p => p + 1)}>
                        Next<UiIcon icon='next' size={11} />
                    </button>
                </nav>
            )}

            <div className={s.foot}>
                <span>Unclassified // For unit use only</span>
                <span>
                    {filtered.length === cards.length
                        ? `${cards.length} shared`
                        : `${filtered.length} of ${cards.length} shared`}
                    {pages > 1 && ` · page ${Math.min(page, pages)} of ${pages}`}
                </span>
            </div>
        </>
    )
}
```

**This step needs three new UI glyphs first.** `UI_PATHS` in
`apps/web/components/loadout/kit-icons.tsx` currently holds only `plus`,
`copy`, `link`, `trash`, `import`, `check`, `close`, `pencil`, `eye` and
`open` — there is no magnifier and no arrow. Add three, in that file's own
24×24 `currentColor` idiom, rather than importing an icon library:

```ts
    search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm5 12 5 5',
    prev: 'M15 5 8 12l7 7',
    next: 'M9 5l7 7-7 7',
```

The shelf then uses `<UiIcon icon='search' size={13} />` in the search box,
`<UiIcon icon='prev' size={11} />` on the Prev button and
`<UiIcon icon='next' size={11} />` on Next — the `close` glyph used as a
stand-in in the code above must not survive into the commit.

- [ ] **Step 4: Build the card data on the server**

Rewrite `page.tsx`'s card-building loop to produce `CardData` and render `<Shelf>`. Keep `connection()`, the `shared: true` query, the slug index, the orphan skip and the `try/catch` around `summariseLoadout` exactly as they are. Replace the `Card` type with an import of `CardData`, and build each entry:

```tsx
        const { name, rankAbbr, accent } = resolveMilpacProfile(member, null)
        const ownerAccent = ensureVisible(accent)
        const ownerLabel = [rankAbbr, name].filter(Boolean).join(' ')
        const tags = normaliseTags(doc.tags)
        const ratingAvg = doc.ratingAvg ?? 0
        const ratingCount = doc.ratingCount ?? 0

        const primary = summary.primary
            ? {
                name: resolveItemName(summary.primary.className),
                icon: iconFor(summary.primary.className, 'primary'),
                attachments: summary.primary.attachments.map(a => ({
                    name: resolveItemName(a), icon: iconFor(a),
                })),
            }
            : null

        const gear = ([
            ['Head', 'headgear', summary.headgear],
            ['Uniform', 'uniform', summary.uniform],
            ['Vest', 'vest', summary.vest],
            ['Pack', 'backpack', summary.backpack],
        ] as const).map(([label, slot, cls]) => ({
            label,
            icon: iconFor(cls ?? '', slot),
            // Empty slots still render: what a member chose not to take is part
            // of the shape of a kit, and a missing row would misalign the grid.
            name: cls ? resolveItemName(cls) : '—',
        }))

        cards.push({
            id: String(doc._id),
            name: doc.name,
            description: doc.description ?? '',
            icon: kitIcon(doc.icon),
            raw: doc.raw,
            tags,
            // Epoch ms, not a Date — this crosses into a client component.
            updatedAt: doc.updatedAt.getTime(),
            ratingAvg,
            ratingCount,
            ratingScore: weightedScore(ratingAvg, ratingCount),
            copyCount: doc.copyCount ?? 0,
            itemCount: summary.itemCount,
            primary,
            gear,
            owner: {
                id: member.id,
                avatarURL: member.avatarURL,
                label: ownerLabel,
                path: `/milpacs/${canonicalSegment(member, slugIndex)}`,
                accent: ownerAccent,
                accentRgb: hexToRgbTriplet(ownerAccent),
            },
            // Built here because the dictionary that resolves these names must
            // not reach the browser. Lowercased once so the search does not
            // lowercase every card on every keystroke.
            haystack: [
                doc.name,
                doc.description ?? '',
                ownerLabel,
                ...tags.map(t => KIT_TAG_LABELS[t]),
                primary?.name ?? '',
            ].join('|').toLowerCase(),
        })
```

Add the imports `normaliseTags`, `KIT_TAG_LABELS` from `@/lib/loadout/tags`, `weightedScore` from `@/lib/loadout/rating`, and `type CardData` plus `Shelf` from `./shelf`. Remove the now-unused `Gear` helper, `LoadoutIcon`, `Avatar`, `KitIcon`, `CopyKitButton` and `Link` imports if nothing else in the file uses them — `npm run lint` will name any that are left.

Replace everything from `{cards.length === 0 ? …}` through the closing `</div>` of `s.foot` with:

```tsx
            {cards.length === 0
                ? (
                    <p className={k.none}>
                        <strong>Nothing shared yet</strong>
                        No member has switched sharing on for a kit.<br />
                        Import one on your milpac and share it to start the shelf.
                    </p>
                )
                : <Shelf cards={cards} />}
```

The `s.foot` block moves into `Shelf` (it is already in the code in Step 3) because it now reports the filtered count — delete it from `page.tsx` so it is not rendered twice.

- [ ] **Step 5: Add the shelf styles**

Append to `kits.module.css`, following that file's existing conventions:

```css
/* ── Shelf controls ───────────────────────────────────────────────────── */

.controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
}

.search {
    display: flex;
    align-items: center;
    gap: 7px;
    flex: 1 1 240px;
    padding: 7px 11px;
    border-radius: 3px;
    background: rgba(255, 255, 255, .04);
    border: 1px solid rgba(255, 255, 255, .12);
}

.search:focus-within {
    border-color: rgba(var(--acc-rgb), .55);
}

.searchInput {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 13px;
    color: inherit;
    background: none;
    border: 0;
    outline: none;
}

.sorts,
.filters {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
}

.filters {
    margin-bottom: 16px;
}

.sort,
.filter,
.filterClear,
.pageBtn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .04em;
    padding: 5px 11px;
    border-radius: 2px;
    cursor: pointer;
    color: inherit;
    background: rgba(255, 255, 255, .04);
    border: 1px solid rgba(255, 255, 255, .12);
    transition: background .12s ease, border-color .12s ease;
}

.sort:hover,
.filter:hover,
.filterClear:hover,
.pageBtn:hover:not(:disabled) {
    border-color: rgba(var(--acc-rgb), .5);
}

.sortOn,
.filterOn,
.pageBtnOn {
    color: rgb(var(--acc-rgb));
    background: rgba(var(--acc-rgb), .14);
    border-color: rgba(var(--acc-rgb), .55);
}

.filterCount {
    font-size: 10px;
    opacity: .6;
    font-variant-numeric: tabular-nums;
}

/* ── Card rating row ──────────────────────────────────────────────────── */

/* 16px horizontal to line up with .cardMain (15px 16px) and .cardFoot
   (12px 16px), which already set the card's gutter. */
.cardRating {
    padding: 0 16px 12px;
}

.cardCopies {
    margin-left: 10px;
    padding-left: 10px;
    border-left: 1px solid var(--line);
}

/* ── Pager ────────────────────────────────────────────────────────────── */

.pager {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 5px;
    margin: 22px 0 6px;
}

.pageBtn:disabled {
    opacity: .35;
    cursor: default;
}
```

`--line` is already defined in this file (`.cardFoot` uses it for its top border), so `.cardCopies` needs no new custom property.

- [ ] **Step 6: Typecheck, lint and exercise by hand**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

Then with the dev server running, on `/community/kits`:
- The shelf renders exactly as before, plus tag chips, stars and a copy count on each card.
- Typing in the search narrows as you type; it matches a kit name, an owner's name, a tag and a weapon name.
- Each of the four sorts reorders the grid; "Top rated" does not put a single 5-star rating above a well-rated kit.
- Selecting two tags narrows to kits carrying both, and "Clear" restores.
- With more than 24 matches, the pager appears; changing the search resets to page 1.
- Copying a kit increments its copy count, and copying it again from the same browser does not.
- The footer count reads `N of M shared` while filtered.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/\(landing\)/community/kits/
git commit
```

Message:
```
feat(kits): search, filter, sort and page the shared kit shelf

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 12: Full verification

**Files:** none — this task changes nothing.

- [ ] **Step 1: Run the whole unit suite**

Run, from `apps/web`: `npm run test:unit`
Expected: PASS, including the three new files and every pre-existing test.

- [ ] **Step 2: Lint and typecheck the whole app**

Run, from `apps/web`: `npm run lint && npx tsc --noEmit`
Expected: no errors, no new warnings.

- [ ] **Step 3: Confirm the production build compiles**

Run, from the repo root: `npm start` and choose the web **build** item (not dev).
Expected: the build completes. A client component importing something server-only fails here rather than at runtime, which is the specific risk this step exists to catch.

- [ ] **Step 4: Walk the whole feature once**

With the dev server running, in one pass:
1. Import a kit with tags; rename it; retag it; publish it.
2. From a second account, rate it, change the rating, withdraw it.
3. Confirm the owner cannot rate their own kit and sees read-only stars.
4. Copy it signed out; confirm the count moves once, not twice.
5. Search, filter by two tags, run all four sorts, page past 24 kits.
6. Confirm no page, response or DOM anywhere names who rated a kit.

- [ ] **Step 5: Report**

State plainly what passed and what did not, with the actual command output for anything that failed. Do not claim the feature works on the strength of the code reading correctly.
