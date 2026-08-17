# `/milpac profile` Dossier Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/milpac profile` Discord subcommand that posts one composited card of a member — uniform, medal box, service statistics and their favourite public kit — with link buttons to each section of their milpac.

**Architecture:** The card is drawn in `apps/web` with satori (`next/og`), reusing the treatment of the existing OpenGraph share card without modifying it. The bot gains one `type=dossier` value on the `/api/bot/milpac/[discordId]` route it already calls, and continues to know only a Discord ID. Artwork comes from `generateMilpacForUser()`'s return value so it is current per request.

**Tech Stack:** Next.js 15 App Router, `next/og` (satori), `@napi-rs/canvas`, MongoDB via the `Db` singleton, vitest for `lib/**`, discord.js v14.

**Spec:** `apps/web/docs/superpowers/specs/2026-08-18-milpac-discord-dossier-design.md`

## Global Constraints

- **The bot never builds a render payload.** It knows a Discord ID and a `type`. All member-data mapping stays in `apps/web` (`apps/bot/CLAUDE.md`; `apps/milpac/PLAN.md` §3, §4).
- **`config.apiInternal` must never appear in a member-facing link.** The route returns paths; the bot prefixes `config.api`.
- **A kit that is not `shared` must never leave the owner's own browser.** Every read of another member's kits filters on `shared` (`apps/web/types/loadout.d.ts`).
- **`apps/milpac` is not touched.** **`app/(landing)/milpacs/[username]/opengraph-image.tsx` is not touched.**
- **vitest only collects `lib/**/*.test.ts`** (`apps/web/vitest.config.ts`). Anything needing a test goes in `lib/`.
- Unit tests: `npm run test:unit` from `apps/web`. **Do not run `npm run test:e2e`** — the user runs the Playwright suite themselves.
- Web path alias is `@/` → `apps/web/`. Bot uses bare specifiers mapped in `apps/bot/tsconfig.json` (`lib/config.ts`, not `@/lib/config`).
- Work happens on branch `feat/milpac-discord-dossier`. Never commit to `main` — it deploys on push with no CI gate.
- Update `apps/web/docs/map/*.md` for any route or lib file added, in the same task that adds it.

---

### Task 1: Extract milpac statistics into a reusable module

The dossier needs the same five figures the profile page leads with. Two of them — confirmed operations and promotion points — take ~50 lines of attendance/operation joining that currently lives inline in `milpac-file.tsx`. Copying that into the card's data builder would create a second source of truth for a number members are promoted on.

**Files:**
- Create: `apps/web/lib/military/milpac-stats.ts`
- Create: `apps/web/lib/military/milpac-stats.test.ts`
- Modify: `apps/web/app/(landing)/milpacs/[username]/milpac-file.tsx` (remove `durationSince` at lines 96-102; replace the inline blocks at lines 226-285)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type ConfirmedOp = { operationId: string; name: string; date: Date | null; confirmedAt: Date | null; unit: string | null; section: string | null; role: string | null; ocap: OcapData | null }`
  - `loadConfirmedOps(memberId: string): Promise<ConfirmedOp[]>`
  - `resolvePromotionPoints(member: User, confirmedOps: ConfirmedOp[]): number`
  - `resolveEnlistedDate(member: User): string | null`
  - `durationSince(raw?: string | null): string | null`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/military/milpac-stats.test.ts`:

```ts
/**
 * These figures appear on the profile page, on the Discord dossier card, and
 * feed the promotion-points bar members are actually promoted on — so they are
 * worth pinning rather than trusting to two copies staying in step.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { durationSince, resolveEnlistedDate } from './milpac-stats'

describe('durationSince', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(2026, 7, 18))
    })
    afterEach(() => vi.useRealTimers())

    test('under a year reads in whole months', () => {
        expect(durationSince('18 February 2026')).toBe('6M')
    })

    test('a year or more reads in years to one decimal', () => {
        expect(durationSince('18 August 2024')).toBe('2.0Y')
        expect(durationSince('15 August 2020')).toBe('6.0Y')
    })

    test('day-first slash dates are read day-first', () => {
        // 4 October 2024, not 10 April — the trap parseMilpacDate exists for.
        expect(durationSince('04/10/2024')).toBe('1.9Y')
    })

    test('an unparseable or future date yields null, never NaN', () => {
        expect(durationSince('sometime in 2019')).toBeNull()
        expect(durationSince(undefined)).toBeNull()
        expect(durationSince('18 August 2030')).toBeNull()
    })
})

describe('resolveEnlistedDate', () => {
    test('prefers the stored milpac date', () => {
        const member = {
            milpac: { enlistedDate: '15 August 2020' },
            guild: { joinedTimestamp: Date.UTC(2023, 0, 5) },
        } as unknown as User
        expect(resolveEnlistedDate(member)).toBe('15 August 2020')
    })

    test('falls back to the Discord join date when none is stored', () => {
        const member = {
            milpac: {},
            guild: { joinedTimestamp: new Date(2023, 0, 5).getTime() },
        } as unknown as User
        expect(resolveEnlistedDate(member)).toBe('5 Jan 2023')
    })

    test('null when neither exists', () => {
        expect(resolveEnlistedDate({ milpac: {} } as unknown as User)).toBeNull()
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

From `apps/web`:

Run: `npm run test:unit -- milpac-stats`
Expected: FAIL — `Failed to resolve import "./milpac-stats"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/military/milpac-stats.ts`. The three bodies are moved verbatim from `milpac-file.tsx` — do not rewrite the logic, only relocate it:

```ts
import Db from '@/lib/mongo'
import { calculateOpPoints, calculatePromotionPoints } from '@/lib/military/points'
import { parseMilpacDate } from '@/lib/military/milpac-dates'

/**
 * The figures a member's service is summarised by.
 *
 * Extracted from the profile page when the Discord dossier card needed the same
 * five numbers. Promotion points in particular are recalculated live from
 * confirmed attendance rather than read off the document, and a second copy of
 * that arithmetic is a second answer to "am I due a promotion".
 */

/** One operation a member is confirmed as having attended. */
export type ConfirmedOp = {
    operationId: string
    name: string
    date: Date | null
    confirmedAt: Date | null
    /** Snapshotted per record: where this member sat AT THAT OPERATION. */
    unit: string | null
    section: string | null
    role: string | null
    ocap: OcapData | null
}

export async function loadConfirmedOps(memberId: string): Promise<ConfirmedOp[]> {
    const attendanceDocs = await Db.operationAttendance.find({
        records: { $elemMatch: { userId: memberId, confirmed: true } },
    }).toArray()

    const operationIds = attendanceDocs.map(d => d.operationId)
    const operationsData = operationIds.length > 0
        // Soft-deleted operations were previously shown in public op history.
        ? await Db.operations.find({ _id: { $in: operationIds }, deletedAt: { $exists: false } }).toArray()
        : []

    const opMap = new Map(operationsData.map(o => [String(o._id), o]))
    const seenOpIds = new Set<string>()

    return attendanceDocs.flatMap(doc => {
        const opId = String(doc.operationId)
        if (seenOpIds.has(opId)) return []
        seenOpIds.add(opId)
        const rec = doc.records.find(r => r.userId === memberId && r.confirmed)
        if (!rec) return []
        const op = opMap.get(opId)
        if (!op) return []
        return [{
            operationId: opId,
            name:        op.title ?? 'Unknown Operation',
            date:        op.date ? new Date(op.date) : null,
            confirmedAt: rec.confirmedAt ? new Date(rec.confirmedAt) : null,
            unit:        rec.unit ?? null,
            section:     rec.orbatSection ?? null,
            role:        rec.orbatRole ?? null,
            ocap:        op.ocap ?? null,
        }]
    })
}

/**
 * Promotion points, recalculated live — non-op points from the stored billet
 * counts plus op points from confirmed attendance. Matches the editor's logic.
 *
 * Members without billet counts have never been through the current editor, so
 * their stored total is all there is.
 */
export function resolvePromotionPoints(member: User, confirmedOps: ConfirmedOp[]): number {
    const billetCounts = member.milpac?.billetCounts
    if (!billetCounts) return member.milpac?.promotionPoints ?? 0

    return calculatePromotionPoints({
        ...billetCounts,
        primaryNightOps:   0,
        secondaryNightOps: 0,
        awards:         (member.milpac?.awards         ?? []).map(a => ({ name: a.name })),
        qualifications: (member.milpac?.qualifications ?? []).map(q => ({ qualification: q.qualification })),
        j4Points:             member.milpac?.j4Points            ?? 0,
        disciplineDeductions: member.milpac?.disciplineDeductions ?? 0,
    }) + calculateOpPoints(confirmedOps)
}

/** The stored enlistment date, else the Discord join date, else null. */
export function resolveEnlistedDate(member: User): string | null {
    return member.milpac?.enlistedDate
        || (member.guild?.joinedTimestamp
            ? new Date(member.guild.joinedTimestamp).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' })
            : null)
}

/**
 * Rough duration between a stored date string and now, as `2.4Y` / `7M`.
 *
 * Parsing lives in `milpac-dates` because the certificate route reads the same
 * free-form fields, and two parsers for one format drift. Anything unparseable
 * yields null and the caller renders an em-dash, not `NaN`.
 */
export function durationSince(raw?: string | null): string | null {
    const d = parseMilpacDate(raw)
    if (!d) return null
    const months = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    if (months < 0) return null
    return months < 12 ? `${Math.max(0, Math.round(months))}M` : `${(months / 12).toFixed(1)}Y`
}
```

Note: `calculatePromotionPoints` becomes a static import. `milpac-file.tsx` imported it dynamically, but `calculateOpPoints` from the same module was already static, so the dynamic form bought nothing.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- milpac-stats`
Expected: PASS, 7 tests.

- [ ] **Step 5: Refactor `milpac-file.tsx` to consume the module**

Delete the local `durationSince` (lines 96-102). Replace the import of `parseMilpacDate` if nothing else uses it. Add:

```ts
import { loadConfirmedOps, resolvePromotionPoints, resolveEnlistedDate, durationSince } from '@/lib/military/milpac-stats'
```

Replace lines 226-258 (the attendance/operations join) with:

```ts
	// Confirmed attendance drives both the operation history panel and the stat bar.
	const confirmedOps = await loadConfirmedOps(member.id)
```

Replace lines 260-278 (the promotion-points block) with:

```ts
	const promotionPts = resolvePromotionPoints(member, confirmedOps)
```

Replace lines 281-285 (the enlisted-date block) with:

```ts
	const enlistedDate = resolveEnlistedDate(member)
```

Remove the now-unused `calculateOpPoints` import if nothing else in the file uses it. Leave `getPromotionProgress` and everything below untouched.

- [ ] **Step 6: Verify the page still compiles and renders identically**

Run: `npm run lint`
Expected: no new errors.

Then load a real milpac in the dev server and confirm the five hero stats and the Recent Operations panel are unchanged. This is a pure relocation — any visible difference is a mistake.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/military/milpac-stats.ts apps/web/lib/military/milpac-stats.test.ts "apps/web/app/(landing)/milpacs/[username]/milpac-file.tsx"
git commit -m "refactor(milpac): extract service statistics into lib/military/milpac-stats

The Discord dossier card needs the same five figures the profile leads
with, and two of them take fifty lines of attendance joining. Copying
that would make a second source of truth for the number members are
promoted on.

Pure relocation — no logic changed. calculatePromotionPoints becomes a
static import; the dynamic form bought nothing, since calculateOpPoints
from the same module was already static.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `pickCardKit` — which kit the card may show

The privacy rule from spec §3. This is the single most consequential function in the feature: it is what keeps a kit a member marked private out of a public Discord channel.

**Files:**
- Modify: `apps/web/lib/loadout/select.ts`
- Modify: `apps/web/lib/loadout/select.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pickCardKit<T extends CardKitCandidate>(kits: readonly T[]): T | null` where `type CardKitCandidate = { isDefault: boolean; shared: boolean; updatedAt: Date }`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/lib/loadout/select.test.ts`:

```ts
import { pickCardKit } from './select'

describe('pickCardKit', () => {
    const kit = (name: string, isDefault: boolean, shared: boolean, day: number) =>
        ({ name, isDefault, shared, updatedAt: new Date(2026, 0, day) })

    test('prefers the default kit when it is public', () => {
        const kits = [kit('recent', false, true, 20), kit('fave', true, true, 1)]
        expect(pickCardKit(kits)?.name).toBe('fave')
    })

    test('a private default never wins — the newest public kit does', () => {
        const kits = [kit('fave', true, false, 1), kit('older', false, true, 5), kit('newer', false, true, 20)]
        expect(pickCardKit(kits)?.name).toBe('newer')
    })

    test('no public kit at all yields null', () => {
        expect(pickCardKit([kit('fave', true, false, 1), kit('other', false, false, 2)])).toBeNull()
    })

    test('an empty list yields null', () => {
        expect(pickCardKit([])).toBeNull()
    })

    test('input order does not decide the fallback', () => {
        // The caller may or may not have sorted. The rule is newest, not first.
        const kits = [kit('newer', false, true, 20), kit('older', false, true, 5)]
        const reversed = [kit('older', false, true, 5), kit('newer', false, true, 20)]
        expect(pickCardKit(kits)?.name).toBe('newer')
        expect(pickCardKit(reversed)?.name).toBe('newer')
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- loadout/select`
Expected: FAIL — `pickCardKit is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `apps/web/lib/loadout/select.ts`:

```ts
export type CardKitCandidate = { isDefault: boolean; shared: boolean; updatedAt: Date }

/**
 * The one kit a shareable card may show, or null.
 *
 * Anyone may run `/milpac profile` on anyone and the reply can land in a public
 * channel, so a kit the member did not publish must never be shown by someone
 * else's command — `shared` is the whole privacy boundary for the collection.
 * That is why an unshared default loses to a shared non-default rather than
 * simply being unlabelled.
 *
 * Sorted here rather than trusted from the caller: this is also the predicate
 * that decides whether the reply carries a Kits button, and a rule that depends
 * on query order is a rule that changes when someone adds an index.
 */
export function pickCardKit<T extends CardKitCandidate>(kits: readonly T[]): T | null {
    const publicKits = kits.filter(k => k.shared)
    if (publicKits.length === 0) return null
    return publicKits.find(k => k.isDefault)
        ?? [...publicKits].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- loadout/select`
Expected: PASS — the existing `pickLoadoutId` tests plus 5 new.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/loadout/select.ts apps/web/lib/loadout/select.test.ts
git commit -m "feat(loadout): add pickCardKit, the kit a shareable card may show

Anyone may run /milpac profile on anyone and the reply can land in a
public channel, so an unshared default loses to a shared non-default
rather than being shown unlabelled. Sorting happens here rather than
being trusted from the caller — this predicate also decides whether the
reply carries a Kits button, and a rule that depends on query order
changes when someone adds an index.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `formatKitLine` — the kit as one line of text

**Files:**
- Create: `apps/web/lib/loadout/kit-line.ts`
- Create: `apps/web/lib/loadout/kit-line.test.ts`

**Interfaces:**
- Consumes: `summariseLoadout(kit: ParsedLoadout): KitSummary` from `@/lib/loadout/summary`; `resolveItemName(className: string): string` from `@/lib/loadout/names`.
- Produces: `formatKitLine(name: string, summary: KitSummary): string`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/loadout/kit-line.test.ts`:

```ts
/**
 * One line on a 1400px card, drawn by satori, which does not wrap gracefully —
 * so the truncation rule matters as much as the content.
 */
import { describe, test, expect } from 'vitest'
import { formatKitLine } from './kit-line'
import type { KitSummary } from './summary'

const summary = (over: Partial<KitSummary> = {}): KitSummary => ({
    primary: { className: 'ACE_arifle_MX_Black', attachments: [] },
    uniform: null,
    vest: 'V_PlateCarrier1_rgr',
    backpack: null,
    headgear: null,
    itemCount: 64,
    ...over,
})

describe('formatKitLine', () => {
    test('names the kit, its rifle, its vest and what it carries', () => {
        const line = formatKitLine('Breacher', summary())
        expect(line.startsWith('Breacher — ')).toBe(true)
        expect(line).toContain('64 items')
        expect(line.split(' · ').length).toBe(3)
    })

    test('classnames are resolved to display names, never printed raw', () => {
        expect(formatKitLine('Breacher', summary())).not.toContain('V_PlateCarrier1_rgr')
    })

    test('a kit with no rifle omits the weapon rather than printing a gap', () => {
        const line = formatKitLine('Medic', summary({ primary: null }))
        expect(line).not.toContain(' ·  · ')
        expect(line).toContain('64 items')
    })

    test('a kit with no vest and no rifle is still a valid line', () => {
        expect(formatKitLine('Empty', summary({ primary: null, vest: null, itemCount: 0 })))
            .toBe('Empty — 0 items')
    })

    test('one item is singular', () => {
        expect(formatKitLine('Sparse', summary({ primary: null, vest: null, itemCount: 1 })))
            .toBe('Sparse — 1 item')
    })

    test('a very long kit name is truncated with an ellipsis, not wrapped', () => {
        // Asserted on the name portion alone. The rest of the line is built
        // from the real item dictionary, so asserting a total length would
        // make this test fail whenever someone renames a vest.
        const name = formatKitLine('A'.repeat(80), summary()).split(' — ')[0]
        expect(name).toHaveLength(28)
        expect(name.endsWith('…')).toBe(true)
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- kit-line`
Expected: FAIL — cannot resolve `./kit-line`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/loadout/kit-line.ts`:

```ts
import { resolveItemName } from './names'
import type { KitSummary } from './summary'

/**
 * A kit compressed to one line, for the Discord dossier card.
 *
 * Shorter than the community index's card, which has three lines and a grid to
 * spend. Here there is one line at the foot of a 1400px canvas drawn by satori,
 * which does not wrap gracefully — so the rule is: never print an empty
 * segment, and never let a member's kit name push the item count off the edge.
 *
 * Pure and separate from the card so the truncation rule can be tested; vitest
 * only collects lib/**\/*.test.ts.
 */

/** Enough for the name plus rifle, vest and count at the card's type size. */
const MAX_NAME = 28

const truncate = (value: string, max: number) =>
    value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value

export function formatKitLine(name: string, summary: KitSummary): string {
    const parts = [
        summary.primary ? resolveItemName(summary.primary.className) : null,
        summary.vest ? resolveItemName(summary.vest) : null,
        `${summary.itemCount} ${summary.itemCount === 1 ? 'item' : 'items'}`,
    ].filter(Boolean)

    return `${truncate(name, MAX_NAME)} — ${parts.join(' · ')}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- kit-line`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/loadout/kit-line.ts apps/web/lib/loadout/kit-line.test.ts
git commit -m "feat(loadout): add formatKitLine for the dossier card

One line at the foot of a canvas satori will not wrap gracefully, so the
rule is never print an empty segment and never let a kit name push the
item count off the edge.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Downscale artwork to data URIs

Satori takes images as data URIs and base64 inflates by a third. The uniform is 1398x1000 — embedded raw, two artwork images plus a cover would be several megabytes of string decoded on every invocation.

**Files:**
- Create: `apps/web/lib/military/card-images.ts`
- Create: `apps/web/lib/military/card-images.test.ts`

**Interfaces:**
- Consumes: `fitCover(srcW, srcH, boxW, boxH): CropRect` from `@/lib/military/milpac-cover`.
- Produces:
  - `type ImageBox = { width: number; height: number }`
  - `toCardImage(bytes: Buffer | null | undefined, box: ImageBox): Promise<string | null>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/military/card-images.test.ts`:

```ts
/**
 * The card must survive a member whose artwork failed to render. Every failure
 * here degrades to null so the card draws without the image, rather than
 * turning one bad PNG into a failed Discord command.
 */
import { describe, test, expect } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { toCardImage } from './card-images'

const png = (w: number, h: number): Buffer => {
    const canvas = createCanvas(w, h)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#556b2f'
    ctx.fillRect(0, 0, w, h)
    return canvas.toBuffer('image/png')
}

describe('toCardImage', () => {
    test('returns a PNG data URI', async () => {
        const uri = await toCardImage(png(1398, 1000), { width: 560, height: 400 })
        expect(uri?.startsWith('data:image/png;base64,')).toBe(true)
    })

    test('the result is smaller than the source it was made from', async () => {
        const source = png(1398, 1000)
        const uri = await toCardImage(source, { width: 560, height: 400 })
        const bytes = Buffer.from(uri!.split(',')[1], 'base64')
        expect(bytes.length).toBeLessThan(source.length)
    })

    test('missing bytes yield null rather than throwing', async () => {
        expect(await toCardImage(null, { width: 560, height: 400 })).toBeNull()
        expect(await toCardImage(undefined, { width: 560, height: 400 })).toBeNull()
    })

    test('undecodable bytes yield null rather than throwing', async () => {
        expect(await toCardImage(Buffer.from('not a png'), { width: 560, height: 400 })).toBeNull()
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- card-images`
Expected: FAIL — cannot resolve `./card-images`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/military/card-images.ts`:

```ts
import { fitCover } from './milpac-cover'

/**
 * Artwork prepared for a satori card.
 *
 * Satori takes images as data URIs and base64 inflates by a third. The uniform
 * is 1398x1000; embedded raw, two artwork images plus a cover photo would be
 * several megabytes of string decoded on every invocation of a Discord command.
 * Re-encoding to the draw size first is what keeps that small — the same reason
 * readCoverImage() re-encodes covers.
 *
 * PNG rather than JPEG, unlike covers: these are composited layer stacks that
 * may carry alpha, and a photograph's compression tradeoff does not apply.
 *
 * Every failure returns null. The dossier card draws without its artwork when
 * the render service is down (spec §7), so one undecodable PNG must degrade the
 * card, not fail the command.
 */

export type ImageBox = { width: number; height: number }

export async function toCardImage(
    bytes: Buffer | null | undefined,
    box: ImageBox,
): Promise<string | null> {
    if (!bytes || bytes.length === 0) return null

    try {
        // Imported here rather than at module scope so importing this file does
        // not pull a native binary in behind it.
        const { createCanvas, loadImage } = await import('@napi-rs/canvas')

        const image = await loadImage(bytes)

        // The draw boxes are chosen to match the sources' aspect ratios — the
        // uniform is 1.398:1 drawn at 1.4:1, the medal box 2.797:1 at 2.8:1 —
        // so this crops a sub-pixel sliver rather than cutting the artwork.
        // Cover-fitting anyway means a future box that does not match degrades
        // to a crop rather than to a stretched uniform.
        const crop = fitCover(image.width, image.height, box.width, box.height)
        if (crop.sw <= 0 || crop.sh <= 0) return null

        const canvas = createCanvas(box.width, box.height)
        canvas.getContext('2d').drawImage(
            image,
            crop.sx, crop.sy, crop.sw, crop.sh,
            0, 0, box.width, box.height,
        )

        return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`
    } catch {
        return null
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- card-images`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/military/card-images.ts apps/web/lib/military/card-images.test.ts
git commit -m "feat(milpac): add toCardImage for satori artwork embedding

Satori takes images as data URIs and base64 inflates by a third. The
uniform alone is 1.4 megapixels, so re-encoding to the draw size first
is what keeps the embedded string small.

Every failure returns null: the dossier card draws without its artwork
when the render service is down, so one undecodable PNG must degrade the
card rather than fail the command.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Assemble the card's data

**Files:**
- Create: `apps/web/lib/military/dossier-data.ts`

**Interfaces:**
- Consumes: Tasks 1-4 (`loadConfirmedOps`, `resolvePromotionPoints`, `resolveEnlistedDate`, `durationSince`, `pickCardKit`, `formatKitLine`, `toCardImage`), plus `resolveMilpacProfile`, `deriveStatus`, `platoonLabel`, `readCoverImage`, `getOrbatEntryByUserId`, `canonicalSegment`, `buildSlugIndex`, `toSlugCandidate`, `MILPAC_TABS`, `tabPath`, `parseLoadout`, `summariseLoadout`, `generateMilpacForUser`.
- Produces:
  - `const DOSSIER_SIZE = { width: 1400, height: 860 }`
  - `type DossierLink = { label: string; path: string }`
  - `type DossierStat = { value: string; label: string; accent: boolean }`
  - `type DossierData = { accent: string; name: string; fullRank: string; meta: string; statusLabel: string; discharged: boolean; cover: string | null; uniform: string | null; medals: string | null; stats: DossierStat[]; kitLine: string | null; links: DossierLink[] }`
  - `buildDossierData(member: User, allMembers: User[]): Promise<DossierData>`

- [ ] **Step 1: Write the implementation**

There is no unit test for this task — it is composition over five tested helpers plus live database and render-service calls, and vitest's `lib/` suite has no Mongo fixture for `Db.loadouts`. The rules worth asserting are already pinned in Tasks 1-4. It is verified end-to-end in Task 7.

Create `apps/web/lib/military/dossier-data.ts`:

```ts
import Db from '@/lib/mongo'
import { getOrbatEntryByUserId } from '@/lib/orbat'
import { generateMilpacForUser } from '@/lib/milpac-gen/generate-for-user'
import { resolveMilpacProfile } from './milpac-profile'
import { deriveStatus, platoonLabel } from './milpac-status'
import { readCoverImage } from './milpac-cover'
import { toCardImage } from './card-images'
import { loadConfirmedOps, resolvePromotionPoints, resolveEnlistedDate, durationSince } from './milpac-stats'
import { canonicalSegment, buildSlugIndex, toSlugCandidate } from './milpac-slug'
import { MILPAC_TABS, tabPath } from './milpac-tabs'
import { pickCardKit } from '@/lib/loadout/select'
import { formatKitLine } from '@/lib/loadout/kit-line'
import { parseLoadout } from '@/lib/loadout/parse'
import { summariseLoadout } from '@/lib/loadout/summary'

/**
 * Everything the Discord dossier card draws, for one member.
 *
 * Separate from the component so the card is a pure function of data — satori
 * cannot await, and a component that queried Mongo mid-render would be
 * untestable and unreadable at once.
 *
 * Deliberately not the OpenGraph share card's data. That card is the link
 * preview for every milpac URL pasted anywhere; growing it into this would
 * change all of them (spec §1).
 */

export const DOSSIER_SIZE = { width: 1400, height: 860 }

/** The draw boxes, matched to the sources' aspect ratios — see toCardImage. */
const UNIFORM_BOX = { width: 560, height: 400 }
const MEDALS_BOX  = { width: 700, height: 250 }

export type DossierLink = { label: string; path: string }
export type DossierStat = { value: string; label: string; accent: boolean }

export type DossierData = {
    accent: string
    name: string
    fullRank: string
    /** `1 PL · 2 SECT · Rifleman`, with absent segments dropped. */
    meta: string
    statusLabel: string
    discharged: boolean
    cover: string | null
    uniform: string | null
    medals: string | null
    stats: DossierStat[]
    kitLine: string | null
    links: DossierLink[]
}

export async function buildDossierData(member: User, allMembers: User[]): Promise<DossierData> {
    const orbatEntry = await getOrbatEntryByUserId(member.id)
    const { accent, name, fullRank } = resolveMilpacProfile(member, orbatEntry)
    const status = deriveStatus(Boolean(member.discharged), orbatEntry?.category)

    const confirmedOps = await loadConfirmedOps(member.id)
    const awards = member.milpac?.awards ?? []
    const quals  = member.milpac?.qualifications ?? []

    // A private kit is the member's own business, and this reply can land in a
    // public channel — so the filter is on the query, not on the result.
    const publicKits = await Db.loadouts
        .find({ userId: member.id, shared: true })
        .sort({ updatedAt: -1 })
        .toArray()
    const kit = pickCardKit(publicKits)

    /**
     * The render service is allowed to be down. Identity, statistics and the
     * kit line still make a good card, so the artwork is optional rather than
     * load-bearing (spec §7) — unlike `type=uniform`, which has nothing left to
     * return without it.
     */
    const artwork = await generateMilpacForUser(member).catch(err => {
        console.error('[milpac] dossier artwork unavailable for', member.username, err)
        return null
    })

    const [cover, uniform, medals] = await Promise.all([
        readCoverImage(member.id, DOSSIER_SIZE),
        toCardImage(artwork?.uniform, UNIFORM_BOX),
        toCardImage(artwork?.medals, MEDALS_BOX),
    ])

    const segment = canonicalSegment(member, buildSlugIndex(allMembers.map(toSlugCandidate)))
    const base = `/milpacs/${encodeURIComponent(segment)}`

    return {
        accent,
        name,
        fullRank: fullRank || 'Serving member',
        meta: [platoonLabel(orbatEntry?.category), orbatEntry?.section, orbatEntry?.role]
            .filter(Boolean).join('  ·  '),
        statusLabel: status.label,
        discharged: status.key === 'discharged',
        cover,
        uniform,
        medals,
        stats: [
            { value: String(confirmedOps.length),                  label: 'Operations', accent: true },
            { value: durationSince(resolveEnlistedDate(member)) ?? '—', label: 'Service', accent: true },
            { value: String(awards.length),                        label: 'Awards', accent: false },
            { value: String(quals.length),                         label: 'Qualifications', accent: false },
            { value: String(resolvePromotionPoints(member, confirmedOps)), label: 'Points', accent: false },
        ],
        kitLine: kit ? formatKitLine(kit.name, summariseLoadout(parseLoadout(kit.raw))) : null,
        // The buttons are the site's own sections, so a fourth tab added to
        // milpac-tabs produces a fourth button with no bot change. Kits is
        // dropped when there is nothing public to show — the same predicate the
        // kit line uses, so there is one notion of "has kits worth showing".
        links: MILPAC_TABS
            .filter(tab => tab.key !== 'kits' || kit !== null)
            .map(tab => ({ label: tab.label, path: `${base}${tabPath(tab.key)}` })),
    }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json` (from the repo root) or `npm run lint` from `apps/web`.
Expected: no errors in `dossier-data.ts`.

If `readCoverImage`'s second parameter is not yet optional-with-a-box in the installed version, confirm its signature is `(memberId: string, box = CARD)` — it is, per `lib/military/milpac-cover.ts:75`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/military/dossier-data.ts
git commit -m "feat(milpac): assemble the Discord dossier card's data

Separate from the component because satori cannot await — a card that
queried Mongo mid-render would be untestable and unreadable at once.

Artwork is optional rather than load-bearing: identity, statistics and
the kit line still make a good card, so a render-service outage degrades
this command instead of failing it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Draw the card

**Files:**
- Create: `apps/web/lib/military/dossier-card.tsx`

**Interfaces:**
- Consumes: `DossierData`, `DOSSIER_SIZE` from Task 5.
- Produces: `DossierCard({ data }: { data: DossierData }): ReactElement`

**Satori constraints — all four have bitten this codebase already, see the comments in `opengraph-image.tsx`:** every element that contains more than one child needs an explicit `display: 'flex'`; there is no stylesheet, no CSS custom properties and no `repeating-linear-gradient`; `objectFit` support is thin, which is why images are pre-cropped to their exact draw size; and colours are written as 8-digit hex rather than `rgba()`.

- [ ] **Step 1: Write the implementation**

Create `apps/web/lib/military/dossier-card.tsx`:

```tsx
import { DOSSIER_SIZE, type DossierData } from './dossier-data'

/**
 * The Discord dossier card.
 *
 * Shares the share card's treatment — cover under three scrims, the accent sun,
 * the corner tick — because those were tuned against real uploads and are not
 * worth re-deriving. It is a separate layout rather than a widening of
 * opengraph-image.tsx, which is the link preview for every milpac URL pasted
 * anywhere (spec §1).
 *
 * Everything is an inline style because this renders through satori, not a
 * browser: no stylesheet, no custom properties, and every multi-child element
 * needs an explicit display:flex.
 */

// Imported rather than restated: the cover is pre-cropped to these exact
// dimensions by buildDossierData, and a card drawn at a different size than the
// image it was cropped for is a bug nothing would report.
const { width: W, height: H } = DOSSIER_SIZE
const PAD = 56

const LABEL = {
    fontSize: 15,
    letterSpacing: '0.22em',
    textTransform: 'uppercase' as const,
    color: '#6b7480',
    fontWeight: 600,
}

const RULE = '1px solid #1e232b'

export function DossierCard({ data }: { data: DossierData }) {
    const { accent } = data
    // The share card's rule: the longer the name, the smaller it is set.
    const nameSize = data.name.length > 20 ? 54 : data.name.length > 15 ? 64 : data.name.length > 10 ? 76 : 86

    return (
        <div style={{
            width: '100%', height: '100%', background: '#08090a',
            display: 'flex', flexDirection: 'column',
            fontFamily: 'sans-serif', position: 'relative',
        }}>
            {data.cover && (
                <>
                    {/* Pre-cropped to exactly WxH, so it needs no objectFit —
                        satori's support for that is thin. */}
                    <img src={data.cover} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0 }} />

                    {/* Three scrims, each with its own job. One flat wash heavy
                        enough for the stat strip would drown the photo. */}
                    <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, background: '#08090ab8', display: 'flex' }} />
                    <div style={{
                        position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex',
                        background: 'linear-gradient(180deg, #08090a4d 0%, #08090a26 34%, #08090ad9 100%)',
                    }} />
                    <div style={{
                        position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex',
                        background: 'linear-gradient(90deg, #08090acc 0%, #08090a4d 45%, #08090a00 74%)',
                    }} />
                </>
            )}

            {/* A single low sun in the accent, echoing the profile's banner. */}
            <div style={{
                position: 'absolute', top: -160, right: -80, width: 760, height: 760, borderRadius: 760,
                background: `radial-gradient(circle, ${accent}2e 0%, ${accent}0d 45%, #08090a00 70%)`,
                display: 'flex',
            }} />

            {/* The dossier's panel tick. */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: 96, height: 5, background: accent, display: 'flex' }} />

            {/* Ridgeline — the stand-in for a cover, so it yields to a real one. */}
            {!data.cover && (
                <svg width={W} height={220} viewBox='0 0 1400 220' style={{ position: 'absolute', left: 0, bottom: 150 }}>
                    <path d='M0 130 L160 96 L320 134 L480 92 L640 138 L810 100 L980 140 L1160 96 L1330 136 L1400 112 V220 H0 Z' fill='#101319' />
                    <path d='M0 168 L215 150 L430 178 L645 154 L860 182 L1075 158 L1290 184 L1400 164 V220 H0 Z' fill='#0b0e12' />
                </svg>
            )}

            {/* Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', height: 72, padding: `0 ${PAD}px`, borderBottom: RULE }}>
                <span style={{ ...LABEL, color: '#a8b0ba' }}>Australian Special Operations Taskforce</span>
                <span style={{ ...LABEL, marginLeft: 'auto', color: data.discharged ? '#c05a48' : '#7fae5c' }}>
                    {data.statusLabel}
                </span>
            </div>

            {/* Body: uniform left, identity and medals right */}
            <div style={{ display: 'flex', flex: 1, padding: `28px ${PAD}px`, alignItems: 'center' }}>
                {data.uniform && (
                    <img src={data.uniform} width={560} height={400} style={{ borderRadius: 3, border: '1px solid #2a3038' }} />
                )}

                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginLeft: data.uniform ? 44 : 0 }}>
                    <span style={{ fontSize: 19, letterSpacing: '0.26em', textTransform: 'uppercase', color: accent }}>
                        {data.fullRank}
                    </span>
                    <span style={{
                        fontSize: nameSize, fontWeight: 800, letterSpacing: '-0.01em', textTransform: 'uppercase',
                        color: '#e8eaed', lineHeight: 1.04, marginTop: 4,
                    }}>
                        {data.name}
                    </span>
                    {data.meta !== '' && (
                        <span style={{ fontSize: 21, color: '#a8b0ba', letterSpacing: '0.04em', marginTop: 10 }}>
                            {data.meta}
                        </span>
                    )}
                    {data.medals && (
                        <img src={data.medals} width={700} height={250} style={{ marginTop: 22, borderRadius: 3 }} />
                    )}
                </div>
            </div>

            {/* Stat strip */}
            <div style={{ display: 'flex', borderTop: RULE }}>
                {data.stats.map((stat, i) => (
                    <div key={stat.label} style={{
                        display: 'flex', flexDirection: 'column', flex: 1,
                        padding: `20px ${PAD}px 22px`,
                        borderRight: i < data.stats.length - 1 ? RULE : 'none',
                    }}>
                        <span style={{ fontSize: 42, fontWeight: 600, lineHeight: 1, color: stat.accent ? accent : '#e8eaed' }}>
                            {stat.value}
                        </span>
                        <span style={{ ...LABEL, fontSize: 14, marginTop: 8 }}>{stat.label}</span>
                    </div>
                ))}
            </div>

            {/* Kit line — omitted entirely when there is no public kit, so the
                strip above becomes the card's foot rather than leaving a gap. */}
            {data.kitLine && (
                <div style={{ display: 'flex', alignItems: 'center', borderTop: RULE, padding: `0 ${PAD}px`, height: 76 }}>
                    <span style={{ ...LABEL, color: accent }}>Kit</span>
                    <span style={{ fontSize: 23, color: '#e8eaed', marginLeft: 20 }}>{data.kitLine}</span>
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run lint` from `apps/web`.
Expected: no errors.

Note the import direction: `dossier-card.tsx` imports from `dossier-data.ts`, never the reverse. Only the route imports both, so there is no cycle.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/military/dossier-card.tsx
git commit -m "feat(milpac): draw the Discord dossier card

Shares the share card's cover-scrim and accent treatment, which was
tuned against real uploads, but is a separate layout — opengraph-image
is the link preview for every milpac URL pasted anywhere, and widening
it would change all of them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Serve it from the bot route

**Files:**
- Modify: `apps/web/app/api/bot/milpac/[discordId]/route.ts`
- Modify: `apps/web/docs/map/d-misc-api.md`
- Modify: `apps/web/docs/map/h-lib-types-components.md`

**Interfaces:**
- Consumes: `buildDossierData`, `DOSSIER_SIZE` (Task 5), `DossierCard` (Task 6).
- Produces: `POST /api/bot/milpac/{discordId}?type=dossier` → `image/png` + `X-Milpac-Links: <JSON array of {label, path}>`

- [ ] **Step 1: Rename the file first, so it may contain JSX**

The branch added below returns JSX, which a `.ts` file cannot hold. Rename before editing rather than after, so the file never passes through a state that fails lint:

```bash
git mv "apps/web/app/api/bot/milpac/[discordId]/route.ts" "apps/web/app/api/bot/milpac/[discordId]/route.tsx"
```

- [ ] **Step 2: Widen the type guard**

In `apps/web/app/api/bot/milpac/[discordId]/route.ts`, replace the validation at lines 41-44:

```ts
    const type = req.nextUrl.searchParams.get('type') ?? 'uniform'
    if (type !== 'uniform' && type !== 'medals' && type !== 'dossier') {
        return NextResponse.json({ error: 'type must be "uniform", "medals" or "dossier"' }, { status: 400 })
    }
```

- [ ] **Step 3: Add the dossier branch**

Insert immediately after the `if (!user)` 404 check (currently line 50), before the existing `try`:

```ts
    /**
     * The dossier draws a whole card rather than returning one render, so it
     * takes its own path: it needs the roster for the canonical segment, and it
     * survives a render-service outage where the two image types cannot.
     */
    if (type === 'dossier') {
        // For the slug index only — the member above was found by Discord id.
        const allMembers = await client.fetchAllMembers()
        const data = await buildDossierData(user as unknown as User, allMembers)

        return new ImageResponse(<DossierCard data={data} />, {
            ...DOSSIER_SIZE,
            headers: {
                // The bot prefixes config.api. Paths rather than absolute URLs
                // so config.apiInternal can never reach a member-facing button.
                'X-Milpac-Links': JSON.stringify(data.links),
                'Cache-Control': 'no-store',
            },
        })
    }
```

Add the imports at the top of the file:

```ts
import { ImageResponse } from 'next/og'
import client from '@/lib/discord'
import { buildDossierData, DOSSIER_SIZE } from '@/lib/military/dossier-data'
import { DossierCard } from '@/lib/military/dossier-card'
```

- [ ] **Step 4: Verify it builds**

Run: `npm run lint` from `apps/web`.
Expected: no errors.

- [ ] **Step 5: Verify against a real member**

Start the dev server (`npm run dev` from `apps/web`) with the render service running, then, substituting a real Discord ID and the `BOT_API_SECRET` from the root `.env`:

```bash
curl -s -D headers.txt -X POST \
  -H "Authorization: Bearer $BOT_API_SECRET" \
  "http://localhost:3000/api/bot/milpac/<discordId>?type=dossier" -o dossier.png
grep -i x-milpac-links headers.txt
```

Expected: `dossier.png` opens as a 1400x860 card, and the header holds two or three `{label, path}` entries — three if the member has a public kit.

Check all four of these against the image, since they are what spec §10 flags as most likely to be wrong:
1. A member with a long name — the identity block must not overrun the medal box.
2. A member with a bright daylight cover photo — the stat strip must stay readable (spec R3).
3. A member with no cover — the ridgeline must appear.
4. A member with no public kit — the kit line and the Kits header entry must both be absent.

Tune the pixel values in `dossier-card.tsx` until it looks right. The spec's numbers are a starting point, not a contract.

- [ ] **Step 6: Update the site map**

In `apps/web/docs/map/d-misc-api.md`, extend the existing `/api/bot/milpac/[discordId]` entry to note the third `type` value and the `X-Milpac-Links` response header.

In `apps/web/docs/map/h-lib-types-components.md`, add entries for `lib/military/milpac-stats.ts`, `lib/military/card-images.ts`, `lib/military/dossier-data.ts`, `lib/military/dossier-card.tsx` and `lib/loadout/kit-line.ts`, following the format of the surrounding rows.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/api/bot/milpac/[discordId]/" apps/web/docs/map/
git commit -m "feat(milpac): serve the dossier card from the bot route

One more type value on the route the bot already calls, so the bot keeps
knowing only a Discord id and which image it wants.

The link paths ride back on X-Milpac-Links rather than being built by the
bot, which knows nothing of name slugs. Paths, not absolute URLs, so
config.apiInternal can never reach a member-facing button.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Teach the bot's render body about visibility and links

**Files:**
- Modify: `apps/bot/app/commands/milpac/render.ts`

**Interfaces:**
- Consumes: `X-Milpac-Links` from Task 7.
- Produces:
  - `hiddenOption` — the shared boolean option
  - `renderMilpac(interaction, type: 'uniform' | 'medals' | 'dossier')`

- [ ] **Step 1: Read the deferral ordering constraint**

`render.ts` currently defers on its first line. Discord fixes a reply's visibility at deferral — which is exactly why `fail()` has to withdraw the public placeholder and follow up privately. `hidden` must therefore be read **before** `deferReply`.

- [ ] **Step 2: Check which ephemeral API the installed discord.js wants**

Run: `npm ls discord.js` from the repo root.

If the resolved version is `< 14.17.0`, use `{ ephemeral: true }`, matching what `fail()` already does. If it is `>= 14.17.0`, use `{ flags: MessageFlags.Ephemeral }` **and change `fail()`'s existing `ephemeral: true` to match** — the file should use one form throughout, not both. The steps below are written for the `ephemeral` form; substitute if needed.

- [ ] **Step 3: Add the hidden option and the third label**

```ts
const LABEL = {
    uniform: { noun: 'uniform', title: 'Uniform' },
    medals: { noun: 'medal display', title: 'Medals' },
    dossier: { noun: 'personnel file', title: 'Personnel File' },
} as const

/** The private-reply toggle. Read before deferring — see renderMilpac. */
export const hiddenOption = {
    name: 'hidden',
    description: 'Show the reply only to you',
    type: Discord.ApplicationCommandOptionType.Boolean,
    required: false,
} as const
```

- [ ] **Step 4: Make `fail()` aware of visibility**

Replace `fail()` entirely:

```ts
/**
 * Reports a failure to the caller alone.
 *
 * A public reply is deferred publicly because the successful case is the point
 * of the command, and Discord fixes a reply's visibility at deferral. So a
 * failure withdraws the public placeholder and follows up privately instead —
 * nobody else needs to watch someone else's command not work.
 *
 * An already-private reply has no placeholder to withdraw, so it is simply
 * edited. Deleting it first would leave the caller with nothing on screen
 * between the two calls.
 */
async function fail(interaction: Discord.ChatInputCommandInteraction, message: string, hidden: boolean) {
    if (hidden) return interaction.editReply({ content: message })
    // Best-effort: if the placeholder is already gone, the follow-up still matters.
    await interaction.deleteReply().catch(() => { })
    return interaction.followUp({ content: message, ephemeral: true })
}
```

- [ ] **Step 5: Rewrite the body**

Replace the signature, the deferral and every `fail(...)` call site:

```ts
export async function renderMilpac(
    interaction: Discord.ChatInputCommandInteraction,
    type: 'uniform' | 'medals' | 'dossier',
) {
    // Read before deferring: Discord fixes a reply's visibility at deferral,
    // so this cannot be consulted afterwards.
    const hidden = interaction.options.getBoolean('hidden') ?? false

    // Public by default — the point of the command is to show the unit.
    await interaction.deferReply({ ephemeral: hidden })

    if (!config.apiSecret) {
        return fail(interaction, 'The milpac renderer is not configured on this bot — `BOT_API_SECRET` is unset.', hidden)
    }
```

The fetch and its error handling are unchanged. There are exactly **three** remaining `fail()` call sites, and each needs `hidden` added as a third argument — the compiler will name all three if any is missed:

```ts
// 1. The catch around fetch (currently line 65):
        return fail(interaction, `Could not reach the milpac renderer at \`${config.apiInternal}\` — ${reason}.`, hidden)

// 2. The !response.ok branch (currently line 76):
        return fail(interaction, message, hidden)
```

The third is the `!config.apiSecret` guard shown above. Nothing else in the function changes until the success path.

Then replace the success path at the end:

```ts
    const png = Buffer.from(await response.arrayBuffer())
    const file = new AttachmentBuilder(png, { name: `${target.username}-${type}.png` })

    return interaction.editReply({
        content: `**${target.displayName}** — ${label.title}`,
        files: [file],
        components: linkRow(response),
    })
}

/**
 * The section buttons, built from what web sent back.
 *
 * Web owns the URL structure — it decides which sections exist and which are
 * worth offering, so a member with no public kit gets no Kits button without
 * the bot knowing what a kit is. A fourth section added to the site produces a
 * fourth button here with no change to this file.
 *
 * `config.api`, never `config.apiInternal`: this URL is clicked by a member.
 */
function linkRow(response: Response): Discord.ActionRowBuilder<Discord.ButtonBuilder>[] {
    let links: { label: string; path: string }[]
    try {
        const parsed = JSON.parse(response.headers.get('x-milpac-links') ?? '[]')
        // A malformed header must cost the buttons, not the whole reply:
        // ButtonBuilder throws on an invalid URL and that would swallow the card.
        links = Array.isArray(parsed)
            ? parsed.filter(l => typeof l?.label === 'string' && typeof l?.path === 'string' && l.path.startsWith('/'))
            : []
    } catch {
        return []
    }

    if (links.length === 0) return []

    const base = config.api.replace(/\/+$/, '')
    return [new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
        links.slice(0, 5).map(l => new Discord.ButtonBuilder()
            .setStyle(Discord.ButtonStyle.Link)
            .setLabel(l.label)
            .setURL(`${base}${l.path}`)),
    )]
}
```

`slice(0, 5)` is Discord's own limit — one action row holds five components, and web could in principle grow a sixth tab.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck` from `apps/bot`.
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/bot/app/commands/milpac/render.ts
git commit -m "feat(bot): add hidden replies and section link buttons to /milpac

hidden is read before deferReply because Discord fixes a reply's
visibility at deferral — the same fact that forces fail() to withdraw a
public placeholder. An already-private reply has nothing to withdraw, so
it is edited instead of deleted and followed up.

The buttons are built from web's X-Milpac-Links rather than assembled
here, so the bot still knows nothing about name slugs or what a kit is.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Register `/milpac profile`

**Files:**
- Create: `apps/bot/app/commands/milpac/profile.ts`
- Modify: `apps/bot/app/commands/milpac/index.ts`

**Interfaces:**
- Consumes: `memberOption`, `hiddenOption`, `renderMilpac` from Task 8.
- Produces: the `/milpac profile` subcommand.

- [ ] **Step 1: Create the subcommand**

Create `apps/bot/app/commands/milpac/profile.ts`, matching the shape of `uniform.ts` and `medals.ts` exactly:

```ts
import { ApplicationCommandOptionType } from 'discord.js'
import { memberOption, hiddenOption, renderMilpac } from './render.ts'


export default {
    name: 'profile',
    description: 'Show a member\'s full personnel file — uniform, medals, service record and kit',
    type: ApplicationCommandOptionType.Subcommand,
    options: [memberOption, hiddenOption],

    execute(interaction) {
        return renderMilpac(interaction, 'dossier')
    }
} as ChatSubcommand
```

- [ ] **Step 2: Register it**

In `apps/bot/app/commands/milpac/index.ts`:

```ts
import { ApplicationCommandType } from 'discord.js'

import profile from './profile.ts'
import uniform from './uniform.ts'
import medals from './medals.ts'


export default {
    name: 'milpac',
    description: 'Milpac Commands',
    type: ApplicationCommandType.ChatInput,

    options: [
        profile,
        uniform,
        medals,
    ]
} as ChatCommand
```

`profile` goes first — it is the one that shows everything, and Discord lists subcommands in declaration order.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` from `apps/bot`.
Expected: no errors.

- [ ] **Step 4: Verify in Discord**

Start the bot (`npm run dev` from `apps/bot`) with web and the render service running. Commands re-register on `ready`, so the subcommand appears without any manual step.

Check each:
1. `/milpac profile` — posts the card publicly with the section buttons; every button opens the right page.
2. `/milpac profile member:<someone>` — targets them, not you.
3. `/milpac profile hidden:True` — only you can see it; the buttons still work.
4. A member with no public kit — no Kits button, no kit line.
5. Stop the render service, then run it again — the card still posts, without the two images.
6. `/milpac uniform` and `/milpac medals` — unchanged, and still have no `hidden` option.

- [ ] **Step 5: Commit**

```bash
git add apps/bot/app/commands/milpac/profile.ts apps/bot/app/commands/milpac/index.ts
git commit -m "feat(bot): add /milpac profile

Listed first of the three: it is the one that shows everything, and
Discord lists subcommands in declaration order.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Document the command

**Files:**
- Modify: `apps/bot/CLAUDE.md`

- [ ] **Step 1: Update the `/milpac` section**

`apps/bot/CLAUDE.md`'s "`/milpac` — rendering goes through `apps/web`, not the render service" section currently says the group is `uniform` and `medals`, "which of two images it wants". Update it to three subcommands, and record the two facts a future reader would otherwise have to rediscover:

- The dossier is a satori card drawn in web, not a render-service output — which is why a render-service outage degrades it rather than failing it, unlike the other two.
- The section buttons come from web's `X-Milpac-Links` header as **paths**, joined to `config.api` here, so `config.apiInternal` cannot reach a member-facing link.

- [ ] **Step 2: Commit**

```bash
git add apps/bot/CLAUDE.md
git commit -m "docs(bot): record /milpac profile and the link-button contract

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verification

Run once at the end, from `apps/web`:

```bash
npm run test:unit     # Tasks 1-4: milpac-stats, select, kit-line, card-images
npm run lint
```

From `apps/bot`:

```bash
npm run typecheck
```

**Do not run `npm run test:e2e`.** The Playwright suite covers page gates and does not reach this route — no spec there needs adding or changing (spec §9). The user runs that suite themselves.

The card itself has no automated assertion. Task 7 step 5 and Task 9 step 4 are the verification that matters, and both need a real member in front of them.
