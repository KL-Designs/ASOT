# Public Page Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `apps/web/components/container.tsx` — the shell behind ten public pages — in the Command Strip language, add a sticky section rail and card/list/Q&A primitives, and move the six `/about` pages onto them without changing a word of copy.

**Architecture:** Pure logic (banner-height mapping, kicker derivation, rail active-state resolution) lives in `apps/web/lib/shell/` where vitest can reach it, and is test-driven. Presentation lives in `apps/web/components/ui/` against a new `styles/shell.module.css`, and is verified by `next build`, `next lint` and a documented visual pass. `Container` keeps its entire existing prop surface and gains five optional props, so all ten call sites compile untouched from Task 4 onward.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, CSS Modules, Tailwind (`important: true`), MUI (being removed from these pages), vitest (unit), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-08-21-public-page-shell-design.md`

## Global Constraints

- **Branch:** `feat/public-page-shell`, cut from `feat/navbar-redesign` at `36d4e482`. Commit on this branch. **Never push. Never touch `main`.** A push to `main` deploys immediately with no CI gate.
- **Working directory for all commands:** `apps/web`. Paths in this plan are relative to `apps/web` unless they start with `docs/`.
- **Copy is verbatim.** Every paragraph, bullet, question and answer moves across unchanged. The **only** new words in the entire branch are the six FAQ labels in Task 10: group headings `Joining ASOT`, `Game & setup`, `Playing with us` and kickers `Eligibility`, `Requirements`, `Life in the unit`. If a rebuild seems to need any other new wording, stop and ask.
- **URLs are unchanged.** All six `/about` routes keep their paths. No redirects.
- **Do not edit** `styles/navbar.module.css`, `styles/landing.module.css`, `app/(landing)/_components/*`, or `app/(landing)/milpacs/**`. They are read as reference only.
- **Design tokens come from `styles/globals.css`.** Never introduce a new hex value. Available: `--ink-0` `#08090a`, `--ink-1` `#0b0c0e`, `--ink-2` `#111317`, `--ink-3` `#171a1f`, `--line-1` `#1e2127`, `--line-2` `#2a2e36`, `--txt-1` `#f2f3f5`, `--txt-2` `#9aa0a8`, `--txt-3` `#5f656e`, `--red` `rgb(219,0,29)`, `--red-hi` `#ff4257`, `--red-dim` `#7d1122`, `--amber` `#d8ac45`, `--live` `#3ddc84`, `--discord` `#5865f2`, `--nav-ease` `cubic-bezier(0.22,1,0.36,1)`. Type roles: `--font-disp` (Oswald), `--font-cond` (Barlow Condensed), `--font-mono` (JetBrains Mono), `--font-ui` (Inter).
- **Navbar height is 94px** (28px status strip + 66px bar). The rail's sticky offset depends on it.
- **Do NOT run `npm run test:e2e` without asking the user first.** It spawns a real `next dev` server that hot-reloads on save; a run overlapping an edit produces spurious failures. Ask, and wait for an answer.
- **`npm run test:unit` (vitest) is safe to run freely.** It only picks up `lib/**/*.test.ts`.
- **Update `docs/map/*`** for every page or component added, removed or meaningfully changed. Task 14 covers this, but note changes as you go.
- **Build once, at the end.** Do not run `npm run build` after every task — Task 14 owns the full build. `npm run lint` per task is fine and fast.

---

### Task 1: Banner-height and kicker logic

The two pure functions `Container` needs. They go in `lib/` because `vitest.config.ts` includes `lib/**/*.test.ts` and nothing else.

**Files:**
- Create: `lib/shell/masthead.ts`
- Test: `lib/shell/masthead.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type BannerHeight = 'xsm' | 'sm' | 'md' | 'lg'`; `bannerHeightValue(size?: BannerHeight): string`; `kickerFromPath(pathname: string): string`.

- [ ] **Step 1: Write the failing test**

Create `lib/shell/masthead.test.ts`:

```ts
/**
 * The banner heights are the whole point of the redesign — `md` was 60vh,
 * which put ~742px of photograph above the fold on six of ten pages. A
 * regression here is invisible in review and obvious to every visitor.
 */
import { describe, test, expect } from 'vitest'
import { bannerHeightValue, kickerFromPath } from './masthead'

describe('bannerHeightValue', () => {
    test('maps each size to a clamped pixel height', () => {
        expect(bannerHeightValue('xsm')).toBe('clamp(110px, 16vh, 150px)')
        expect(bannerHeightValue('sm')).toBe('clamp(170px, 24vh, 250px)')
        expect(bannerHeightValue('md')).toBe('clamp(230px, 34vh, 340px)')
        expect(bannerHeightValue('lg')).toBe('clamp(280px, 44vh, 420px)')
    })

    test('defaults to md, matching the old Container default', () => {
        expect(bannerHeightValue()).toBe(bannerHeightValue('md'))
        expect(bannerHeightValue(undefined)).toBe(bannerHeightValue('md'))
    })

    test('never returns a vh-only value', () => {
        for (const size of ['xsm', 'sm', 'md', 'lg'] as const) {
            expect(bannerHeightValue(size)).toContain('px')
        }
    })
})

describe('kickerFromPath', () => {
    test('uses the last path segment, title-cased', () => {
        expect(kickerFromPath('/about/callsigns')).toBe('Callsigns')
        expect(kickerFromPath('/community/orbat')).toBe('Orbat')
        expect(kickerFromPath('/join')).toBe('Join')
    })

    test('de-slugs hyphenated segments', () => {
        expect(kickerFromPath('/community/hall-of-fame')).toBe('Hall Of Fame')
    })

    test('tolerates trailing slashes', () => {
        expect(kickerFromPath('/about/rules/')).toBe('Rules')
    })

    test('falls back to the unit name at the root', () => {
        expect(kickerFromPath('/')).toBe('ASOT')
        expect(kickerFromPath('')).toBe('ASOT')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- lib/shell/masthead.test.ts`
Expected: FAIL — `Failed to resolve import "./masthead"`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/shell/masthead.ts`:

```ts
/**
 * Pure helpers for the public page masthead.
 *
 * These live in lib/ rather than beside the component because vitest is
 * configured to pick up `lib/**\/*.test.ts` and nothing else — logic that
 * matters is logic that can be tested.
 */

export type BannerHeight = 'xsm' | 'sm' | 'md' | 'lg'

/**
 * The band's height, as a CSS value.
 *
 * These replace the `vh`-only heights in tailwind.config.ts. `md` was
 * `60vh` on desktop, which with the 94px navbar meant a reader on a 1080p
 * display saw a photograph and a title before any content. The clamps keep
 * the band responsive without letting it eat the viewport.
 */
const HEIGHTS: Record<BannerHeight, string> = {
    xsm: 'clamp(110px, 16vh, 150px)',
    sm: 'clamp(170px, 24vh, 250px)',
    md: 'clamp(230px, 34vh, 340px)',
    lg: 'clamp(280px, 44vh, 420px)',
}

export function bannerHeightValue(size?: BannerHeight): string {
    return HEIGHTS[size ?? 'md']
}

/**
 * The last-resort kicker: the final path segment, de-slugged and title-cased.
 *
 * Deliberately dumb. A page that wants "About the unit" over `/about` passes
 * `kicker` explicitly; this only exists so a page that passes nothing still
 * gets something truthful rather than an empty rule.
 */
export function kickerFromPath(pathname: string): string {
    const segments = pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    if (!last) return 'ASOT'

    return last
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- lib/shell/masthead.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/shell/masthead.ts lib/shell/masthead.test.ts
git commit -m "feat(shell): clamp the banner heights off vh

md was 60vh on desktop, so with the 94px navbar the first screen of six
public pages was a photograph and one word."
```

---

### Task 2: Rail active-state logic

The rail must mark exactly one cell active. `/about` is a prefix of `/about/faq`, so a naive `startsWith` marks two — this is the bug the test exists to prevent.

**Files:**
- Create: `lib/shell/rail.ts`
- Test: `lib/shell/rail.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type RailItem = { href: string; label: string }`; `activeRailIndex(items: RailItem[], pathname: string): number`; `railIndex(i: number): string`.

- [ ] **Step 1: Write the failing test**

Create `lib/shell/rail.test.ts`:

```ts
/**
 * `/about` is a prefix of `/about/faq`. A startsWith match lights two cells;
 * an exact match lights none on a nested route that has no cell of its own.
 * Longest-prefix is the only rule that gets both right.
 */
import { describe, test, expect } from 'vitest'
import { activeRailIndex, railIndex, type RailItem } from './rail'

const ABOUT: RailItem[] = [
    { href: '/about', label: 'About Us' },
    { href: '/about/callsigns', label: 'Callsigns' },
    { href: '/about/contact', label: 'Contact Us' },
    { href: '/about/rules', label: 'Rules & Expectations' },
    { href: '/about/values', label: 'Principles & Values' },
    { href: '/about/faq', label: 'FAQ' },
]

describe('activeRailIndex', () => {
    test('matches the index page exactly', () => {
        expect(activeRailIndex(ABOUT, '/about')).toBe(0)
    })

    test('a child route does not also light its parent', () => {
        expect(activeRailIndex(ABOUT, '/about/faq')).toBe(5)
        expect(activeRailIndex(ABOUT, '/about/callsigns')).toBe(1)
    })

    test('an unlisted descendant resolves to its nearest listed ancestor', () => {
        expect(activeRailIndex(ABOUT, '/about/rules/appendix')).toBe(3)
    })

    test('tolerates a trailing slash', () => {
        expect(activeRailIndex(ABOUT, '/about/values/')).toBe(4)
    })

    test('returns -1 when nothing matches', () => {
        expect(activeRailIndex(ABOUT, '/join')).toBe(-1)
        expect(activeRailIndex([], '/about')).toBe(-1)
    })

    test('does not match a sibling that merely shares a prefix string', () => {
        const items: RailItem[] = [
            { href: '/about', label: 'About' },
            { href: '/aboutus', label: 'About Us' },
        ]
        expect(activeRailIndex(items, '/aboutus')).toBe(1)
    })
})

describe('railIndex', () => {
    test('is 1-based and zero-padded to two digits', () => {
        expect(railIndex(0)).toBe('01')
        expect(railIndex(5)).toBe('06')
        expect(railIndex(9)).toBe('10')
    })

    test('does not pad past two digits', () => {
        expect(railIndex(99)).toBe('100')
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- lib/shell/rail.test.ts`
Expected: FAIL — `Failed to resolve import "./rail"`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/shell/rail.ts`:

```ts
/**
 * Pure helpers for the section rail.
 *
 * The rail is a client component so it can read usePathname, but the rule for
 * *which* cell is active is ordinary logic and belongs where it can be tested.
 */

export type RailItem = {
    href: string
    label: string
}

/** Strips a trailing slash so `/about/values/` and `/about/values` agree. */
function normalise(path: string): string {
    return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/**
 * The index of the cell that should read as active, or -1.
 *
 * Longest-prefix, on path segments rather than raw strings. Exact matching
 * alone would leave `/about/rules/appendix` with no active cell; a raw
 * `startsWith` would light `/about` on `/about/faq` and `/about` on
 * `/aboutus`. Segment-aware longest-prefix gets all three right.
 */
export function activeRailIndex(items: RailItem[], pathname: string): number {
    const path = normalise(pathname)

    let best = -1
    let bestLength = -1

    items.forEach((item, i) => {
        const href = normalise(item.href)
        const isMatch = path === href || path.startsWith(`${href}/`)
        if (isMatch && href.length > bestLength) {
            best = i
            bestLength = href.length
        }
    })

    return best
}

/** The cell's displayed index: 1-based, zero-padded to two digits. */
export function railIndex(i: number): string {
    return String(i + 1).padStart(2, '0')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- lib/shell/rail.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/shell/rail.ts lib/shell/rail.test.ts
git commit -m "feat(shell): resolve the active rail cell by longest prefix

/about is a prefix of /about/faq, so startsWith lights two cells and an
exact match leaves a nested route with none."
```

---

### Task 3: The shell stylesheet and the solo masthead

The band, the veil, the topo and the copy column. No aside yet — Task 4 adds it.

**Files:**
- Create: `styles/shell.module.css`
- Create: `components/ui/Masthead.tsx`

**Interfaces:**
- Consumes: `bannerHeightValue`, `type BannerHeight` from `lib/shell/masthead`; `Topo` from `components/ui/Topo`.
- Produces: `Masthead` (default export) with props `{ title, kicker?, lede?, background?, backgroundUrl?, bannerHeight?, aside?, children? }`. Task 4 fills `aside`; leave the prop declared and unused until then.

**Deliberate omission:** the spec's §6 signature lists a `scene?: 'ridge' | 'town'` drawn fallback for a page with no photograph. **Do not build it.** All ten consumers pass either `background` or `backgroundUrl`, so it would ship with zero callers. `Masthead` below renders no image at all when neither is given, and the band falls back to its own `#0b0e10` — an honest empty state. Add `scene` when a page actually needs it.

- [ ] **Step 1: Write the stylesheet**

Create `styles/shell.module.css`:

```css
/* ============================================================================
   ASOT — public page shell
   ----------------------------------------------------------------------------
   The masthead, the section rail and the content grid shared by every public
   page that is not the landing page.

   The vocabulary (notched buttons, section heads, the topo backdrop) lives in
   ui.module.css; the landing page's own arrangement lives in
   landing.module.css. This file is the third arrangement of the same pieces —
   the one for pages that are read rather than pitched at.
   ========================================================================== */

.shell {
    --pad: clamp(20px, 3.4vw, 54px);
    background: var(--ink-0);
    font-family: var(--font-ui);
}

/* ---------- band --------------------------------------------------------- */

.band {
    position: relative;
    height: var(--band-h, clamp(230px, 34vh, 340px));
    overflow: hidden;
    background: #0b0e10;
    display: flex;
    align-items: center;
}

.bandImg {
    position: absolute;
    inset: 0;
    z-index: 0;
}

.bandImg img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
}

/*
   Two passes, matching .heroVeilSolo in landing.module.css. The horizontal
   vignette is dark at both edges and clear through the middle, because the
   photograph is at its best in the centre of the frame and that is where the
   copy sits. The vertical pass seats the band under the navbar and lands its
   bottom edge on --ink-0 rather than on a hard seam.

   The stops here must stay in step with the topo's `edges` mask. If they
   drift, the contours outlive the darkening and read as a separate layer
   floating over the photograph.
*/
.veil {
    position: absolute;
    inset: 0;
    z-index: 2;
    background:
        linear-gradient(90deg,
            rgba(6, 7, 9, .9) 0%,
            rgba(6, 7, 9, .44) 18%,
            rgba(6, 7, 9, .1) 40%,
            rgba(6, 7, 9, .1) 60%,
            rgba(6, 7, 9, .5) 84%,
            rgba(6, 7, 9, .9) 100%),
        linear-gradient(180deg,
            rgba(6, 7, 9, .5) 0%,
            transparent 22%,
            transparent 62%,
            rgba(6, 7, 9, .92) 100%);
}

.bandIn {
    position: relative;
    z-index: 4;
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 var(--pad);
    display: grid;
    grid-template-columns: minmax(0, 1fr) 330px;
    gap: 48px;
    align-items: center;
}

/* With no aside, the second column would sit empty and shove the copy left.
   The band drops to one column instead — a composition in its own right rather
   than the two-column one with a hole in it. */
.bandInSolo {
    grid-template-columns: minmax(0, 1fr);
}

.kick {
    display: flex;
    align-items: center;
    gap: 14px;
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: .26em;
    text-transform: uppercase;
    color: var(--red);
}

.kick::before {
    content: '';
    height: 1px;
    width: 34px;
    background: var(--red-dim);
    flex: none;
}

.kick::after {
    content: '';
    height: 1px;
    flex: 1;
    max-width: 200px;
    background: linear-gradient(90deg, var(--red-dim), transparent);
}

.title {
    font-family: var(--font-disp);
    font-weight: 700;
    text-transform: uppercase;
    font-size: clamp(38px, 6vw, 72px);
    line-height: .96;
    letter-spacing: .01em;
    margin: 14px 0 0;
    text-shadow: 0 4px 30px rgba(0, 0, 0, .75);
    text-wrap: balance;
}

/* Sub-page titles run long — "Rules & Expectations", "Principles & Values".
   At the full display size they wrap to two lines and swamp the band. */
.titleLong {
    font-size: clamp(32px, 4.4vw, 52px);
}

/* The rule that separates the lockup from the body copy — the same job the
   one above the landing hero's subtitle does. */
.lede {
    color: #c4c9cf;
    font-size: 15.5px;
    line-height: 1.6;
    max-width: 52ch;
    margin: 18px 0 0;
    padding-top: 18px;
    border-top: 1px solid rgba(255, 255, 255, .13);
}

/* ---------- body --------------------------------------------------------- */

.body {
    width: 100%;
    max-width: var(--shell-max, 1400px);
    margin: 0 auto;
    padding: var(--shell-pad, clamp(38px, 4.6vw, 64px) var(--pad) 60px);
    display: flex;
    flex-direction: column;
    gap: var(--shell-gap, clamp(38px, 4.4vw, 62px));
}

@media (max-width: 1180px) {
    .bandIn {
        grid-template-columns: minmax(0, 1fr);
    }
}

@media (max-width: 860px) {
    .title {
        font-size: clamp(30px, 8vw, 42px);
    }
}
```

- [ ] **Step 2: Write the Masthead component**

Create `components/ui/Masthead.tsx`:

```tsx
import React from 'react'
import Image, { StaticImageData } from 'next/image'

import Topo from '@/components/ui/Topo'
import { bannerHeightValue, type BannerHeight } from '@/lib/shell/masthead'
import s from '@/styles/shell.module.css'

/**
 * The public page masthead: a photo band carrying the landing hero's two-pass
 * veil and drifting topo, with the title, kicker and lede in the left column
 * and an optional aside in the right.
 *
 * It replaces a 60vh centred banner that put a photograph and one word above
 * the fold on six of the ten pages that share this shell.
 */
export default function Masthead({
    title,
    kicker,
    lede,
    background,
    backgroundUrl,
    bannerHeight,
    aside,
}: {
    title: string
    kicker?: string
    lede?: string
    background?: StaticImageData
    backgroundUrl?: string
    bannerHeight?: BannerHeight
    aside?: React.ReactNode
}) {
    // Long titles wrap to two lines at the full display size and swamp the
    // band. The threshold is where "Rules & Expectations" (20) sits.
    const isLongTitle = title.length > 18

    return (
        <header
            className={s.band}
            style={{ '--band-h': bannerHeightValue(bannerHeight) } as React.CSSProperties}
        >
            <div className={s.bandImg}>
                {backgroundUrl
                    ? <img src={backgroundUrl} alt='' aria-hidden='true' />
                    : background
                        ? <Image src={background} alt='' fill priority placeholder='blur' style={{ objectFit: 'cover' }} />
                        : null}
            </div>

            {/* The topo's mask shares its stops with the veil's vignette. */}
            <Topo opacity={0.05} driftSeconds={900} mask='edges' />
            <div className={s.veil} />

            <div className={`${s.bandIn} ${aside ? '' : s.bandInSolo}`}>
                <div>
                    {kicker && <div className={s.kick}>{kicker}</div>}
                    <h1 className={`${s.title} ${isLongTitle ? s.titleLong : ''}`}>{title}</h1>
                    {lede && <p className={s.lede}>{lede}</p>}
                </div>
                {aside}
            </div>
        </header>
    )
}
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "shell\|Masthead" || echo "no shell/masthead type errors"`
Expected: `no shell/masthead type errors`.

Run: `npm run lint`
Expected: no new errors mentioning `Masthead.tsx` or `shell.module.css`.

- [ ] **Step 4: Commit**

```bash
git add styles/shell.module.css components/ui/Masthead.tsx
git commit -m "feat(shell): add the masthead

The landing hero's two-pass veil and drifting topo at content-page scale,
with the title anchored in a left column instead of centred over a 60vh
photograph."
```

---

### Task 4: The masthead aside

The optional right column. Only `/about` and `/join` will pass one; every other page keeps the solo band from Task 3.

**Files:**
- Modify: `styles/shell.module.css` (append)
- Create: `components/ui/MastheadAside.tsx`

**Interfaces:**
- Consumes: `s` from `styles/shell.module.css`.
- Produces: `MastheadAside` (default export) with props `{ heading: string, status?: string, rows: AsideRow[], cta?: { href: string, label: string } }` and `export type AsideRow = { label: string; value: string; accent?: boolean }`. Passed to `Masthead`'s `aside` prop as a rendered element.

- [ ] **Step 1: Append the aside styles**

Append to `styles/shell.module.css`:

```css
/* ---------- masthead aside ----------------------------------------------- */

/*
   A 340px band is only justified if something lives beside the title. This is
   the landing hero's operation card doing that job for a content page: live
   figures the reader would otherwise have to go and look for.
*/
.aside {
    background: rgba(9, 10, 12, .84);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid var(--line-2);
    border-top: 2px solid var(--red);
}

.asideH {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11px 15px;
    border-bottom: 1px solid var(--line-1);
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: .2em;
    text-transform: uppercase;
    color: var(--live);
}

.asideH i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--live);
    flex: none;
}

.asideH .rt {
    margin-left: auto;
    color: var(--txt-3);
}

.asideRows {
    padding: 6px 15px 12px;
}

.asideRow {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 9px 0;
    border-bottom: 1px solid var(--line-1);
}

.asideRow:last-child {
    border-bottom: 0;
}

.asideRow span {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: .18em;
    text-transform: uppercase;
    color: var(--txt-3);
}

.asideRow b {
    margin-left: auto;
    font-family: var(--font-disp);
    font-size: 17px;
    font-weight: 600;
    color: var(--txt-1);
    letter-spacing: .03em;
}

.asideRow b.acc {
    color: var(--amber);
}

.asideCta {
    display: block;
    margin: 0 15px 15px;
    height: 40px;
    line-height: 40px;
    text-align: center;
    background: var(--red);
    color: #fff;
    font-family: var(--font-cond);
    font-weight: 700;
    font-size: 13.5px;
    letter-spacing: .16em;
    text-transform: uppercase;
    clip-path: polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px);
    transition: background .2s var(--nav-ease);
}

.asideCta:hover {
    background: var(--red-hi);
}
```

- [ ] **Step 2: Write the component**

Create `components/ui/MastheadAside.tsx`:

```tsx
import React from 'react'
import Link from 'next/link'

import s from '@/styles/shell.module.css'

export type AsideRow = {
    label: string
    value: string
    /** Amber rather than white — for the row that is the answer, not context. */
    accent?: boolean
}

/**
 * The masthead's second column.
 *
 * Deliberately presentational: it takes resolved strings, never a query. The
 * pages that use it (/about, /join) are already server components and fetch
 * their own figures, so Container can stay synchronous for the eight
 * consumers that have no aside at all.
 */
export default function MastheadAside({
    heading,
    status,
    rows,
    cta,
}: {
    heading: string
    status?: string
    rows: AsideRow[]
    cta?: { href: string, label: string }
}) {
    return (
        <aside className={s.aside}>
            <div className={s.asideH}>
                <i />
                {heading}
                {status && <span className={s.rt}>{status}</span>}
            </div>
            <div className={s.asideRows}>
                {rows.map(row => (
                    <div key={row.label} className={s.asideRow}>
                        <span>{row.label}</span>
                        <b className={row.accent ? s.acc : undefined}>{row.value}</b>
                    </div>
                ))}
            </div>
            {cta && (
                <Link href={cta.href as any} className={s.asideCta}>{cta.label}</Link>
            )}
        </aside>
    )
}
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npm run lint`
Expected: no new errors mentioning `MastheadAside.tsx`.

- [ ] **Step 4: Commit**

```bash
git add styles/shell.module.css components/ui/MastheadAside.tsx
git commit -m "feat(shell): add the masthead aside

Takes resolved strings rather than a query, so Container stays synchronous
for the eight consumers that never render one."
```

---

### Task 5: The section rail

**Files:**
- Modify: `styles/shell.module.css` (append)
- Create: `components/ui/SectionRail.tsx`

**Interfaces:**
- Consumes: `activeRailIndex`, `railIndex`, `type RailItem` from `lib/shell/rail`.
- Produces: `SectionRail` (default export) with props `{ items: RailItem[] }`. Re-exports nothing.

- [ ] **Step 1: Append the rail styles**

Append to `styles/shell.module.css`:

```css
/* ---------- section rail ------------------------------------------------- */

/*
   Cells size to their labels rather than dividing the width equally. Six equal
   columns forces "Rules & Expectations" to be abbreviated in the rail but not
   in the title it points at, and locks the family at six pages. Auto-fit keeps
   every real title, and a seventh page is a seventh cell.

   Sticky under the navbar (28px status strip + 66px bar): on Rules and FAQ the
   old rail was gone within one scroll, with no way back to the other five
   sections but a return to the top.
*/
.rail {
    position: sticky;
    top: 94px;
    z-index: 20;
    border-top: 1px solid var(--line-1);
    border-bottom: 1px solid var(--line-1);
    background: #0a0b0d;
    display: flex;
    overflow-x: auto;
    padding: 0 var(--pad);
    scrollbar-width: none;
}

.rail::-webkit-scrollbar {
    display: none;
}

.railItem {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: none;
    white-space: nowrap;
    padding: 15px 22px 14px;
    border-left: 1px solid var(--line-1);
    transition: background .18s var(--nav-ease);
}

.railItem:first-child {
    border-left: 0;
    padding-left: 0;
}

.railItem:hover {
    background: rgba(255, 255, 255, .02);
}

.railItem:focus-visible {
    outline: 2px solid var(--red-hi);
    outline-offset: -2px;
}

.railN {
    font-family: var(--font-mono);
    font-size: 8.5px;
    letter-spacing: .2em;
    color: var(--txt-3);
}

.railT {
    font-family: var(--font-cond);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: .11em;
    text-transform: uppercase;
    color: var(--txt-2);
}

.railOn {
    background: linear-gradient(180deg, rgba(219, 0, 29, .12), transparent 80%);
}

.railOn .railT {
    color: var(--txt-1);
}

.railOn .railN {
    color: var(--red);
}

.railOn::before {
    content: '';
    position: absolute;
    left: -1px;
    right: 0;
    top: -1px;
    height: 2px;
    background: var(--red);
    box-shadow: 0 0 14px rgba(219, 0, 29, .6);
}

@media (max-width: 900px) {
    .railItem {
        padding: 12px 16px 11px;
    }

    .railItem:first-child {
        padding-left: 0;
    }
}

@media (prefers-reduced-motion: reduce) {
    .railItem {
        transition: none;
    }
}
```

- [ ] **Step 2: Write the component**

Create `components/ui/SectionRail.tsx`:

```tsx
'use client'

import React, { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { activeRailIndex, railIndex, type RailItem } from '@/lib/shell/rail'
import s from '@/styles/shell.module.css'

/**
 * The sticky section rail.
 *
 * A client component only because it reads the pathname. Keeping that here
 * rather than in the layout is what lets `about/layout.tsx` go back to being a
 * server component — it carried 'use client' solely to pick the active tab.
 */
export default function SectionRail({ items }: { items: RailItem[] }) {
    const pathname = usePathname()
    const active = activeRailIndex(items, pathname)
    const activeRef = useRef<HTMLAnchorElement>(null)

    // Below ~900px the rail overflows to a horizontal scroll, and the active
    // cell is routinely off-screen on arrival — which reads as the rail having
    // no active cell at all.
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
    }, [active])

    return (
        <nav className={s.rail} aria-label='Section'>
            {items.map((item, i) => {
                const on = i === active
                return (
                    <Link
                        key={item.href}
                        href={item.href as any}
                        ref={on ? activeRef : undefined}
                        aria-current={on ? 'page' : undefined}
                        className={on ? `${s.railItem} ${s.railOn}` : s.railItem}
                    >
                        <span className={s.railN}>{railIndex(i)}</span>
                        <span className={s.railT}>{item.label}</span>
                    </Link>
                )
            })}
        </nav>
    )
}
```

- [ ] **Step 3: Verify it lints**

Run: `npm run lint`
Expected: no new errors mentioning `SectionRail.tsx`.

- [ ] **Step 4: Commit**

```bash
git add styles/shell.module.css components/ui/SectionRail.tsx
git commit -m "feat(shell): add the sticky section rail

Cells auto-fit their labels, so the rail can carry a real title and a
seventh page without being redrawn."
```

---

### Task 6: Rebuild Container

The risky task. Ten call sites depend on this file; none of them change. Every public page's banner shortens the moment this lands, so it gets its own visual pass before anything else proceeds.

**Files:**
- Modify: `components/container.tsx` (full rewrite)
- Modify: `tailwind.config.ts` (remove the `banner-*` heights)
- Delete: `components/landing.css`

**Interfaces:**
- Consumes: `Masthead` from `components/ui/Masthead`; `SectionRail` from `components/ui/SectionRail`; `kickerFromPath` from `lib/shell/masthead`; `type RailItem` from `lib/shell/rail`.
- Produces: `Container` (default export). Existing props `title`, `subtitle`, `background`, `backgroundUrl`, `sx: { maxWidth, bannerHeight, padding, gap }` behave as before. New optional props: `kicker?: string`, `lede?: string`, `aside?: React.ReactNode`, `rail?: RailItem[]`.

- [ ] **Step 1: Confirm the ten call sites before touching anything**

Run: `grep -rln "components/container" app/`
Expected exactly these ten:
```
app/(landing)/about/layout.tsx
app/(landing)/community/bios/page.tsx
app/(landing)/community/hof/layout.tsx
app/(landing)/community/orbat/page.tsx
app/(landing)/credits/page.tsx
app/(landing)/donate/page.tsx
app/(landing)/join/page.tsx
app/(landing)/partnerships/page.tsx
app/(landing)/support/page.tsx
app/(landing)/thomo/page.tsx
app/me/layout.tsx
```
That is eleven lines. `app/me/layout.tsx` imports `Container` and a banner image and renders **neither** — dead imports from an earlier revision. Task 13 deletes them. If any other file appears here that is not on this list, stop and report it before continuing.

- [ ] **Step 2: Rewrite Container**

Replace the entire contents of `components/container.tsx`:

```tsx
import React from 'react'
import { StaticImageData } from 'next/image'
import { headers } from 'next/headers'

import Masthead from '@/components/ui/Masthead'
import SectionRail from '@/components/ui/SectionRail'
import { kickerFromPath, type BannerHeight } from '@/lib/shell/masthead'
import { type RailItem } from '@/lib/shell/rail'
import s from '@/styles/shell.module.css'

/**
 * The shell behind every public page that is not the landing page.
 *
 * Ten files render this. The four original props and the whole `sx` object
 * keep their meaning so none of them had to change when the banner was
 * rebuilt; everything added since is optional.
 *
 * `bannerHeight` still takes xsm/sm/md/lg, but those now resolve to clamped
 * pixel heights rather than the `vh` values they used to — see
 * lib/shell/masthead.ts for why.
 */
export default async function Container({
    children, title, subtitle, background, backgroundUrl, kicker, lede, aside, rail, sx,
}: {
    children?: React.ReactNode
    title?: string
    subtitle?: string
    background?: StaticImageData
    backgroundUrl?: string
    /** Overrides the route-derived label above the title. */
    kicker?: string
    /** Overrides `subtitle` for the paragraph under the title. */
    lede?: string
    /** The masthead's second column. Omit for a solo band. */
    aside?: React.ReactNode
    /** The sticky section rail. Only the About family passes one. */
    rail?: RailItem[]
    sx?: {
        maxWidth?: 'max-w-sm' | 'max-w-md' | 'max-w-lg' | 'max-w-xl' | (string & {})
        bannerHeight?: BannerHeight
        padding?: string
        gap?: string | undefined
    }
}) {
    // Middleware injects x-pathname on every route, which is how a server
    // component reads the current path without Next.js internals.
    const pathname = (await headers()).get('x-pathname') ?? '/'

    return (
        <div className={s.shell}>
            <Masthead
                title={title || 'PAGE TITLE'}
                kicker={kicker ?? kickerFromPath(pathname)}
                lede={lede ?? subtitle}
                background={background}
                backgroundUrl={backgroundUrl}
                bannerHeight={sx?.bannerHeight}
                aside={aside}
            />

            {rail && <SectionRail items={rail} />}

            <div
                className={`${s.body} ${sx?.maxWidth || 'max-w-md'} ${sx?.gap ?? ''}`}
                style={sx?.padding ? { padding: sx.padding } : undefined}
            >
                {children}
            </div>
        </div>
    )
}
```

On the `sx.gap` handling: `gap` arrives as a Tailwind class (`gap-6`, `gap-14`), and Tailwind is `important: true`, so the class beats the module's own `gap` declaration with no inline style needed. The `style` object only ever carries `padding`.

- [ ] **Step 3: Take `about/layout.tsx` off `'use client'` — required, not optional**

`Container` is now `async`. **A client component cannot render an async child**, so this task breaks the build until `about/layout.tsx` stops being one. It is the only call site that is.

Verify that claim first:

Run: `grep -l "use client" app/\(landing\)/about/layout.tsx app/\(landing\)/community/bios/page.tsx app/\(landing\)/community/hof/layout.tsx app/\(landing\)/community/orbat/page.tsx app/\(landing\)/credits/page.tsx app/\(landing\)/donate/page.tsx app/\(landing\)/join/page.tsx app/\(landing\)/partnerships/page.tsx app/\(landing\)/support/page.tsx app/\(landing\)/thomo/page.tsx`

Expected: `app/(landing)/about/layout.tsx` and nothing else. If any other file appears, convert it to a server component or wrap its `Container` call in one before proceeding.

Now make the **minimal** conversion — the layout keeps its current tab markup and its `Pages` array for the moment; Task 7 replaces the whole file. Change only these three things:

1. Delete the `'use client'` directive on line 1.
2. Replace `import { usePathname } from 'next/navigation'` with `import { headers } from 'next/headers'`.
3. Replace the component signature and its first two lines:

```tsx
export default async function AboutLayout({ children }: Readonly<{ children: React.ReactNode }>) {

	const pathname = (await headers()).get('x-pathname') ?? '/about'
	const page = Pages.find(page => page.href === pathname)
```

Middleware injects `x-pathname` on every route, which is how a server component reads the current path without reaching into Next.js internals.

Run: `npm run lint`
Expected: no error about `usePathname` outside a client component.

- [ ] **Step 4: Remove the vh banner heights**

In `tailwind.config.ts`, delete the whole `height` block:

```ts
      height: {
        'banner-xsm': '10vh',
        'banner-xsm-md': '20vh',
        'banner-sm': '20vh',
        'banner-sm-md': '40vh',
        'banner-md': '40vh',
        'banner-md-md': '60vh',
        'banner-lg': '60vh',
        'banner-lg-md': '80vh',
      },
```

Confirm nothing else uses them first:

Run: `grep -rn "banner-xsm\|banner-sm\|banner-md\|banner-lg" app/ components/ styles/`
Expected: no matches. If any remain, fix them before deleting the block.

- [ ] **Step 5: Delete the old banner typography**

`components/landing.css` defines only `.container-h1` and `.container-h2`, both of which the old centred banner used and the masthead does not.

Run: `grep -rn "container-h1\|container-h2\|components/landing.css\|\"./landing.css\"" app/ components/ styles/`
Expected: no matches once `container.tsx` is rewritten. Then:

```bash
git rm components/landing.css
```

- [ ] **Step 6: Visual pass over all ten pages**

Start the dev server: `npm run dev`

Open each and confirm the band is short, the title is left-anchored, the kicker reads sensibly, and nothing below the masthead has moved or overlapped:

```
/about          /join           /donate         /credits
/support        /partnerships   /community/orbat
/community/bios /community/hof  /thomo
```

Acceptance for each: no horizontal scrollbar on `body`; the first content block is visible at 1920×1080 without scrolling on every page except `/thomo`; the masthead's bottom edge meets the page background with no seam.

`/community/hof` passes `padding: '0px'` and lays out its own inner padding — check it specifically for doubled or missing padding. `/join` uses `backgroundUrl` rather than a static import — check the image still loads.

Stop the dev server before continuing.

- [ ] **Step 7: Lint and commit**

Run: `npm run lint`
Expected: no new errors.

`git rm` in Step 5 already staged the deletion of `components/landing.css`, so it does not need re-adding here.

```bash
git add components/container.tsx tailwind.config.ts "app/(landing)/about/layout.tsx"
git commit -m "feat(shell): rebuild Container on the masthead

Same four props and the same sx object, so all ten call sites compile
untouched — but bannerHeight now resolves to clamped pixels, and md drops
from 60vh to a 340px ceiling."
```

---

### Task 7: Wire the rail into the About layout

**Files:**
- Modify: `app/(landing)/about/layout.tsx` (full rewrite)

**Interfaces:**
- Consumes: `Container` from `components/container`; `type RailItem` from `lib/shell/rail`.
- Produces: `ABOUT_PAGES` — exported from this file so the six page files can read their own subtitle and kicker without a second copy of the list.

- [ ] **Step 1: Rewrite the layout**

Replace the entire contents of `app/(landing)/about/layout.tsx`:

```tsx
import React from 'react'
import { headers } from 'next/headers'

import Container from '@/components/container'
import { activeRailIndex, type RailItem } from '@/lib/shell/rail'

import ImgAbout from '@/public/images/home/training2.png'
import ImgCallsigns from '@/public/images/home/Gopro3.png'
import ImgContact from '@/public/images/home/Mike1440.png'
import ImgRules from '@/public/images/home/ADFField1.png'
import ImgFAQ from '@/public/images/home/SPEAR_OVERCAST_Final.png'
import ImgValues from '@/public/images/home/1122.png'

import { StaticImageData } from 'next/image'

/**
 * The About family: six pages sharing one masthead and one section rail.
 *
 * A server component. It previously carried 'use client' solely to read the
 * pathname and pick the active tab; SectionRail owns that now.
 *
 * The kickers below are the one piece of page furniture written for the
 * redesign rather than derived — "About the unit" cannot be produced from the
 * segment "about". The subtitles are unchanged from the previous revision.
 */
type AboutPage = RailItem & {
    kicker: string
    subtitle?: string
    background: StaticImageData
}

export const ABOUT_PAGES: AboutPage[] = [
    {
        href: '/about',
        label: 'About Us',
        kicker: 'About the unit',
        background: ImgAbout,
    },
    {
        href: '/about/callsigns',
        label: 'Callsigns',
        kicker: 'Registry',
        subtitle: 'Here you can see the current call signs we have and some basic information on how they are utilised in missions.',
        background: ImgCallsigns,
    },
    {
        href: '/about/contact',
        label: 'Contact Us',
        kicker: 'Get in touch',
        subtitle: 'If you have any questions, queries, want to join or simply want to say hello, you can contact us any way you like. The best way is generally through our Discord but we are also active in all our media outlets.',
        background: ImgContact,
    },
    {
        href: '/about/rules',
        label: 'Rules & Expectations',
        kicker: 'Standards of conduct',
        subtitle: 'These are some of the more basic rules and expectations we have for all members within the community. A more in depth version will be provided upon recruitment.',
        background: ImgRules,
    },
    {
        href: '/about/values',
        label: 'Principles & Values',
        kicker: 'What we stand for',
        background: ImgValues,
    },
    {
        href: '/about/faq',
        label: 'FAQ',
        kicker: 'Common questions',
        subtitle: 'If you cannot find the answer to your questions, please feel free to contact us to seek clarification.',
        background: ImgFAQ,
    },
]

export default async function AboutLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const pathname = (await headers()).get('x-pathname') ?? '/about'
    const page = ABOUT_PAGES[activeRailIndex(ABOUT_PAGES, pathname)] ?? ABOUT_PAGES[0]

    return (
        <Container
            title={page.label.toUpperCase()}
            kicker={page.kicker}
            lede={page.subtitle}
            background={page.background}
            rail={ABOUT_PAGES}
            sx={{ bannerHeight: 'md', maxWidth: 'max-w-md' }}
        >
            {children}
        </Container>
    )
}
```

Two things this deletes deliberately:

- **`'use client'` and `usePathname`.** `SectionRail` resolves its own active cell.
- **The sibling-image preload block.** It rendered a hidden `<Image>` per sibling page at `width={1} height={1}` with `priority`. `next/image` builds its srcset from the declared width, so this appears to request a ~16px variant rather than warming the full-size banner the next page renders.

- [ ] **Step 2: Confirm the preload finding before letting it go**

Start `npm run dev`, open `/about` with the Network panel filtered to images, and read the `_next/image` requests for the five sibling banners.

- If their `w=` parameter is small (16–64), the block was not warming the real banner. Leaving it deleted is correct — note the confirmed finding in the commit message.
- If it is requesting full-size variants, the block was doing real work. Restore the intent with explicit preloads in the layout instead:

```tsx
import ReactDOM from 'react-dom'
// inside the component, before the return:
ABOUT_PAGES.filter(p => p.href !== pathname)
    .forEach(p => ReactDOM.preload(p.background.src, { as: 'image' }))
```

Record which branch you took.

- [ ] **Step 3: Check the rail on every route**

With the dev server running, visit all six routes and confirm exactly one cell is active on each, that it is the right one, and that the rail stays pinned under the navbar when you scroll `/about/rules` to the bottom.

At 375px wide, confirm the rail scrolls horizontally and the active cell is centred on arrival.

- [ ] **Step 4: Lint and commit**

Run: `npm run lint`

```bash
git add "app/(landing)/about/layout.tsx"
git commit -m "feat(about): put the six pages on the section rail

The layout goes back to being a server component — it carried 'use client'
only to pick the active tab, which SectionRail now does for itself."
```

---

### Task 8: Card, list and Q&A primitives

**Files:**
- Modify: `styles/shell.module.css` (append)
- Create: `components/ui/Card.tsx`
- Create: `components/ui/List.tsx`
- Create: `components/ui/QaRow.tsx`

**Interfaces:**
- Consumes: `s` from `styles/shell.module.css`.
- Produces:
  - `Card` (default export of `Card.tsx`), props `{ title, kicker?, ghost?, icon?, span?, children }` where `span?: 1 | 2 | 3 | 4 | 6`.
  - `CardGrid` (named export of `Card.tsx`), props `{ columns: 4 | 6, children }`.
  - `List` (default export of `List.tsx`), props `{ items: React.ReactNode[], columns?: 1 | 2 | 3 }`.
  - `QaRow` (default export of `QaRow.tsx`), props `{ index: string, question: string, children }`.
  - `QaStack` (named export of `QaRow.tsx`), props `{ columns?: 1 | 2, children }`.

- [ ] **Step 1: Append the styles**

Append to `styles/shell.module.css`:

```css
/* ---------- card grid ---------------------------------------------------- */

.grid4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
}

.grid6 {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 18px;
}

.card {
    position: relative;
    border: 1px solid var(--line-1);
    background: var(--ink-1);
    padding: 22px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: border-color .2s var(--nav-ease), background .2s var(--nav-ease);
}

.card:hover {
    border-color: var(--line-2);
    background: var(--ink-2);
}

/* An outlined numeral rather than a filled one — it marks the sequence
   without competing with the heading beside it. Only used where the number is
   real: Rules already calls its blocks "Section 1 — General". */
.ghost {
    position: absolute;
    top: -14px;
    right: 6px;
    font-family: var(--font-disp);
    font-size: 80px;
    font-weight: 700;
    color: transparent;
    -webkit-text-stroke: 1px #1a1d23;
    line-height: 1;
    pointer-events: none;
    user-select: none;
}

.cardK {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: .2em;
    color: var(--txt-3);
    text-transform: uppercase;
    margin-bottom: 12px;
}

.cardIc {
    width: 30px;
    height: 30px;
    color: var(--red);
    margin-bottom: 14px;
}

.cardIc svg {
    width: 100%;
    height: 100%;
}

.card h3 {
    font-family: var(--font-disp);
    font-size: 16.5px;
    font-weight: 600;
    letter-spacing: .05em;
    text-transform: uppercase;
    margin: 0;
    line-height: 1.15;
    color: var(--txt-1);
}

.card p {
    color: var(--txt-2);
    font-size: 13.4px;
    line-height: 1.6;
    margin: 10px 0 0;
}

.s1 { grid-column: span 1; }
.s2 { grid-column: span 2; }
.s3 { grid-column: span 3; }
.s4 { grid-column: span 4; }
.s6 { grid-column: span 6; }

/* ---------- list --------------------------------------------------------- */

/*
   A real <ul>. Rules § 4 was thirteen <Typography> elements each opening with
   a hyphen — no list semantics, and a wrapped line ran back under its own
   dash. The hanging indent here is the fix.
*/
.list {
    list-style: none;
    margin: 14px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 9px;
}

.list li {
    position: relative;
    padding-left: 20px;
    color: var(--txt-2);
    font-size: 13.6px;
    line-height: 1.6;
}

.list li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 10px;
    width: 9px;
    height: 1px;
    background: var(--red);
}

/* CSS columns rather than a grid: the list reflows to one column on a narrow
   screen with no markup change, and break-inside keeps an item whole. */
.list2,
.list3 {
    display: block;
    column-gap: 34px;
}

.list2 { columns: 2; }
.list3 { columns: 3; }

.list2 li,
.list3 li {
    break-inside: avoid;
    margin-bottom: 9px;
}

/* ---------- Q&A ---------------------------------------------------------- */

.qaStack {
    margin-top: 16px;
}

.qaStack2 {
    columns: 2;
    column-gap: 38px;
}

.qa {
    border-top: 1px solid var(--line-1);
    padding: 15px 0;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 14px;
    break-inside: avoid;
}

.qa:first-child {
    border-top: 0;
    padding-top: 4px;
}

.qaN {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: .1em;
    color: var(--txt-3);
    padding-top: 3px;
}

.qa h4 {
    font-family: var(--font-cond);
    font-size: 16.5px;
    font-weight: 600;
    letter-spacing: .05em;
    text-transform: uppercase;
    margin: 0;
    color: var(--txt-1);
}

.qa p {
    color: var(--txt-2);
    font-size: 13.6px;
    line-height: 1.6;
    margin: 7px 0 0;
}

.qa a {
    color: var(--amber);
    border-bottom: 1px solid rgba(216, 172, 69, .4);
}

@media (max-width: 1180px) {
    .grid4,
    .grid6 {
        grid-template-columns: repeat(2, 1fr);
    }

    .s3, .s4, .s6 { grid-column: span 2; }
    .list3 { columns: 2; }
}

@media (max-width: 860px) {
    .grid4,
    .grid6 {
        grid-template-columns: minmax(0, 1fr);
    }

    .s2, .s3, .s4, .s6 { grid-column: span 1; }
    .list2, .list3 { columns: 1; }
    .qaStack2 { columns: 1; }
}

@media (prefers-reduced-motion: reduce) {
    .card { transition: none; }
}
```

- [ ] **Step 2: Write Card.tsx**

```tsx
import React from 'react'
import s from '@/styles/shell.module.css'

const SPAN = { 1: s.s1, 2: s.s2, 3: s.s3, 4: s.s4, 6: s.s6 } as const

/**
 * The content card.
 *
 * `span` is the mechanism that fixes the ragged grid the old InfoCard
 * produced: a card with more to say spans wider and flows its list into more
 * columns, so its height drops to meet its neighbours rather than towering
 * over them and leaving a hole beside itself.
 */
export default function Card({
    title, kicker, ghost, icon, span = 1, children,
}: {
    title: string
    kicker?: string
    /** The outlined numeral. Pass one only where the number is real. */
    ghost?: string
    icon?: React.ReactNode
    span?: 1 | 2 | 3 | 4 | 6
    children?: React.ReactNode
}) {
    return (
        <article className={`${s.card} ${SPAN[span]}`}>
            {ghost && <span className={s.ghost} aria-hidden='true'>{ghost}</span>}
            {kicker && <div className={s.cardK}>{kicker}</div>}
            {icon && <span className={s.cardIc}>{icon}</span>}
            <h3>{title}</h3>
            {children}
        </article>
    )
}

export function CardGrid({ columns, children }: { columns: 4 | 6, children: React.ReactNode }) {
    return <div className={columns === 6 ? s.grid6 : s.grid4}>{children}</div>
}
```

- [ ] **Step 3: Write List.tsx**

```tsx
import React from 'react'
import s from '@/styles/shell.module.css'

/**
 * A real list, with a hanging indent and a rule as its marker.
 *
 * The pages this replaces rendered their bullets as sibling <Typography>
 * elements each opening with a hyphen, so a wrapped line ran back underneath
 * its own dash and a screen reader was read thirteen paragraphs rather than a
 * list of thirteen items.
 */
export default function List({
    items, columns = 1,
}: {
    items: React.ReactNode[]
    columns?: 1 | 2 | 3
}) {
    const cls = columns === 3 ? `${s.list} ${s.list3}`
        : columns === 2 ? `${s.list} ${s.list2}`
            : s.list

    return (
        <ul className={cls}>
            {items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
    )
}
```

- [ ] **Step 4: Write QaRow.tsx**

```tsx
import React from 'react'
import s from '@/styles/shell.module.css'

/**
 * One FAQ entry.
 *
 * Not an accordion. These answers are indexed by search engines and found with
 * Ctrl-F, and hiding them behind a click costs both for no gain the wide card
 * does not already provide.
 */
export default function QaRow({
    index, question, children,
}: {
    index: string
    question: string
    children: React.ReactNode
}) {
    return (
        <div className={s.qa}>
            <span className={s.qaN}>{index}</span>
            <div>
                <h4>{question}</h4>
                {children}
            </div>
        </div>
    )
}

export function QaStack({ columns = 1, children }: { columns?: 1 | 2, children: React.ReactNode }) {
    return (
        <div className={columns === 2 ? `${s.qaStack} ${s.qaStack2}` : s.qaStack}>
            {children}
        </div>
    )
}
```

- [ ] **Step 5: Lint and commit**

Run: `npm run lint`

```bash
git add styles/shell.module.css components/ui/Card.tsx components/ui/List.tsx components/ui/QaRow.tsx
git commit -m "feat(shell): add card, list and Q&A primitives

Cards declare a column span, so a long block spans wider and flows its
list into more columns instead of towering over its neighbours."
```

---

### Task 9: Rebuild /about and its schedule

**Files:**
- Modify: `app/(landing)/about/page.tsx` (full rewrite)
- Modify: `app/(landing)/about/timezones.tsx` (markup only — keep the luxon logic)
- Modify: `styles/shell.module.css` (append the schedule and lead-card styles)

**Interfaces:**
- Consumes: `Card`, `CardGrid` from `components/ui/Card`; `List` from `components/ui/List`; `SectionHead` from `components/ui/SectionHead`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Append the lead-card and schedule styles**

Append to `styles/shell.module.css`:

```css
/* ---------- lead card ---------------------------------------------------- */

/* One card carrying the thesis, over a photograph, with smaller cards around
   it — the .whyLead composition from the landing page. */
.lead {
    grid-column: span 2;
    grid-row: span 2;
    border: 1px solid var(--line-1);
    background: var(--ink-1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.leadImg {
    position: relative;
    height: 170px;
    flex: none;
    overflow: hidden;
}

.leadImg img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.leadImg::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 40%, rgba(11, 12, 14, .7) 100%);
}

.leadBody {
    padding: 24px;
}

.leadBody h3 {
    font-family: var(--font-disp);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: .03em;
    text-transform: uppercase;
    margin: 0 0 12px;
    line-height: 1.1;
    color: var(--txt-1);
}

.leadBody p {
    color: var(--txt-2);
    font-size: 14px;
    line-height: 1.62;
    margin: 0 0 12px;
}

.leadBody p:last-child {
    margin-bottom: 0;
}

/* ---------- schedule ----------------------------------------------------- */

/*
   Two DST windows side by side. The version this replaces was a stack of bold
   labels each followed by a grey monospace chip, which made this the tallest
   card on the page and forced its neighbour to end half a card early.
*/
.sched {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    background: var(--line-1);
    border: 1px solid var(--line-1);
    margin: 14px 0 0;
}

.schedCol {
    background: var(--ink-1);
    padding: 15px 17px 17px;
}

.schedCol h5 {
    font-family: var(--font-mono);
    font-size: 9.5px;
    letter-spacing: .18em;
    text-transform: uppercase;
    color: var(--amber);
    margin: 0 0 4px;
    font-weight: 500;
}

.schedWin {
    display: block;
    font-family: var(--font-mono);
    font-size: 9.5px;
    letter-spacing: .1em;
    color: var(--txt-3);
    margin-bottom: 13px;
}

.schedRow {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 6px 0;
    border-top: 1px solid rgba(255, 255, 255, .045);
}

.schedRow:first-of-type {
    border-top: 0;
}

.schedRow span {
    font-family: var(--font-cond);
    font-size: 14px;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--txt-2);
}

.schedRow b {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 500;
    color: var(--txt-1);
    font-variant-numeric: tabular-nums;
    letter-spacing: .04em;
}

/* Step off is the moment that actually matters — everything else on the card
   is scaffolding around it. */
.schedRow.schedHi b {
    color: var(--red-hi);
}

.schedNote {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: .1em;
    color: var(--txt-3);
    margin: 12px 0 0;
}

@media (max-width: 1180px) {
    .lead { grid-column: span 2; grid-row: auto; }
}

@media (max-width: 860px) {
    .lead { grid-column: span 1; }
    .sched { grid-template-columns: minmax(0, 1fr); }
}
```

- [ ] **Step 2: Rebuild timezones.tsx's markup**

Keep every import, the two `standardTimes` / `daylightTimes` arrays, `convertToLocal` and the `useEffect` exactly as they are. Replace only the `return`:

```tsx
    return (
        <>
            <p>Our primary missions are run every Saturday and Sunday.</p>
            <List
                columns={3}
                items={[
                    '1 Platoon conducts missions on Saturday nights.',
                    '2 Platoon conducts missions on Sunday nights.',
                    '3 Platoon(Support Platoon) supports both Saturday and Sunday night missions.',
                ]}
            />

            <div className={s.sched}>
                <div className={s.schedCol}>
                    <h5>Daylight savings not observed</h5>
                    <span className={s.schedWin}>First Sunday of April – First Sunday of October</span>
                    {localStandardTimes.map(({ label, time }, i) => (
                        <div key={i} className={label === 'Step off' ? `${s.schedRow} ${s.schedHi}` : s.schedRow}>
                            <span>{label}</span>
                            <b>{time}</b>
                        </div>
                    ))}
                </div>
                <div className={s.schedCol}>
                    <h5>Daylight savings observed</h5>
                    <span className={s.schedWin}>First Sunday of October – First Sunday of April</span>
                    {localDaylightTimes.map(({ label, time }, i) => (
                        <div key={i} className={label === 'Step off' ? `${s.schedRow} ${s.schedHi}` : s.schedRow}>
                            <span>{label}</span>
                            <b>{time}</b>
                        </div>
                    ))}
                </div>
            </div>

            <p className={s.schedNote}>The times above have been converted to your local timezone.</p>
            <p>We also run missions and trainings throughout the week but these are optional.</p>
        </>
    )
```

Add at the top of the file, alongside the existing imports:

```tsx
import List from '@/components/ui/List'
import s from '@/styles/shell.module.css'
```

Remove the now-unused `Typography` and `Divider` imports from `@mui/material`.

The list strings and both paragraphs are copied verbatim from the file being replaced, including `3 Platoon(Support Platoon)` with no space — do not tidy it.

- [ ] **Step 3: Rebuild page.tsx**

Replace the entire contents of `app/(landing)/about/page.tsx`:

```tsx
import { Metadata } from 'next'
import Image from 'next/image'

import SectionHead from '@/components/ui/SectionHead'
import Card, { CardGrid } from '@/components/ui/Card'
import { MedalIcon, TargetIcon } from '@/components/ui/icons'
import TimeZones from './timezones'
import s from '@/styles/shell.module.css'

import LeadImg from '@/public/images/home/training2.png'

export const metadata: Metadata = {
	title: "About Us | Australian Special Operations Taskforce",
	description: "Learn about the Australian Special Operations Taskforce — our history, structure, and mission in the ARMA 3 milsim community.",
}

export default function Tab() {
	return (
		<section>
			<SectionHead kicker='The unit' title='Who we are' more={{ href: '/community/orbat', label: 'Full ORBAT' }} />

			<CardGrid columns={4}>
				<article className={s.lead}>
					<div className={s.leadImg}>
						<Image src={LeadImg} alt='' fill style={{ objectFit: 'cover' }} />
					</div>
					<div className={s.leadBody}>
						<h3>Who Are We?</h3>
						<p>We are an ARMA 3 community that aims to achieve realistic yet enjoyable game play in what we call a semi-hardcore game style. What this means is we use real to life military tactics, procedures and structure whilst still maintaining a relaxed approach. We do not expect members to address staff by rank or 'Sir/Ma'am'.</p>
						<p>With many years experience and tens of thousands of hours of experience throughout the group, our knowledge is vast. We have a number of previous and currently serving members of the armed forces who have helped develop our game play into a good balance of realism and playability.</p>
					</div>
				</article>

				<Card title='Who We Play As' kicker='Identity' ghost='02' icon={<MedalIcon />}>
					<p>We are based on a fictional department/corps of the Australian Defence Force (ADF). Our ORBAT, procedures and structure are created to resemble closely to the ADF. Being fictional has allowed us to create a flexible and varied ORBAT including many vehicles, air frames and weapons used by other countries. Essentially, it allows us to use what we want, when we want.</p>
				</Card>

				<Card title='Mission Types and Styles' kicker='Gameplay' ghost='03' icon={<TargetIcon />}>
					<p>Our missions are created by our highly skilled mission creation team and lead by our dedicated Zeus team. This allows for well balanced, challenging yet enjoyable game play.</p>
					<p>Although primarily focused on the modern era ADF/military, we also run missions based throughout the ages for both our main operations and mid-week missions/events. One week it could be WWII, next could be futuristic. The same ORBAT, structure and procedures are kept relatively the same, but this allows us to play as ASOT during any period of humanity. Fictional missions are also an option.</p>
				</Card>

				<Card title='When Do We Run Missions?' kicker='Schedule' ghost='04' span={2}>
					<TimeZones />
				</Card>
			</CardGrid>
		</section>
	)
}
```

- [ ] **Step 4: Check it in the browser**

Run `npm run dev`, open `/about`.

Acceptance: the lead card's photograph is not stretched; the schedule's two DST columns sit side by side and its figures are monospaced and aligned; "Step off" is red in both columns; the four cards form two flush rows with no half-empty box. At 375px the schedule stacks and the platoon list becomes one column.

- [ ] **Step 5: Lint and commit**

```bash
git add "app/(landing)/about/page.tsx" "app/(landing)/about/timezones.tsx" styles/shell.module.css
git commit -m "feat(about): rebuild the index on the card grid

The mission schedule becomes a two-column table of tabular figures rather
than a stack of chips — it was the tallest card on the page and the reason
its neighbour ended half a card early."
```

---

### Task 10: Rebuild /about/values

Done before Rules and FAQ because it already has the right section structure — two named groups of four — so it is the cheapest confirmation the card grid works.

**Files:**
- Modify: `app/(landing)/about/values/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `Card`, `CardGrid` from `components/ui/Card`; `SectionHead` from `components/ui/SectionHead`.

- [ ] **Step 1: Rewrite the page**

Replace the entire contents. The eight card bodies are copied verbatim from the file being replaced; only the wrapper changes. The kicker carries the **group**, not a repeat of the title — that was the duplication flagged in the spec (§4.6).

```tsx
import { Metadata } from 'next'

import SectionHead from '@/components/ui/SectionHead'
import Card, { CardGrid } from '@/components/ui/Card'

export const metadata: Metadata = {
	title: "Principles and Values | Australian Special Operations Taskforce",
	description: "The core principles and values that guide every member of the Australian Special Operations Taskforce.",
}

const CORE = [
	{ title: 'Community', body: "ASOT exists first and foremost as a community. We value connection, camaraderie, and shared experiences both inside and outside Arma 3. Members are encouraged to engage beyond operations, whether that's playing other games, hanging out in voice, or just being part of the group." },
	{ title: 'Welcoming', body: 'We actively foster an environment where new and existing members feel welcome, respected, and comfortable being themselves. No one should feel like an outsider, regardless of gaming experience, personal background, or level of familiarity with milsim communities.' },
	{ title: 'Respect', body: 'We treat each other with respect at all times. This includes how we communicate, how we handle disagreements and discipline, and how we represent the unit publicly. Respect underpins trust, cohesion, and long-term community health.' },
	{ title: 'Enjoyment', body: 'At its core, ASOT exists so people can enjoy themselves. While we take our gameplay seriously, we never lose sight of the fact that this is a game and a shared hobby meant to be fun, engaging, and rewarding.' },
]

const OPERATING = [
	{ title: 'Professionalism', body: 'We approach missions, training, and leadership with professionalism. This means clear communication, preparation, accountability, and taking objectives seriously without unnecessary ego or toxicity.' },
	{ title: 'Competence', body: 'We strive to be skilled, capable, and reliable. Members are encouraged to improve their individual skills and teamwork so the unit functions effectively across a wide range of scenarios and roles.' },
	{ title: 'Realism with Purpose', body: 'We use realism to enhance immersion, decision-making, and teamwork, not to create frustration or gatekeeping. Realism exists to support enjoyable, believable gameplay rather than strict simulation for its own sake.' },
	{ title: 'Operational Flexibility', body: 'ASOT embraces a broad scope of operations. We are not limited to special operations forces and actively engage in conventional military roles, varied mission types, and diverse operational environments to keep gameplay fresh and challenging.' },
]

export default function Tab() {
	return (
		<>
			<section>
				<SectionHead kicker='Core Values' title='Who we are as a community' />
				<CardGrid columns={4}>
					{CORE.map((v, i) => (
						<Card key={v.title} title={v.title} kicker='Core value' ghost={String(i + 1).padStart(2, '0')}>
							<p>{v.body}</p>
						</Card>
					))}
				</CardGrid>
			</section>

			<section>
				<SectionHead kicker='Operating Principles' title='How we play, train & conduct ourselves' />
				<CardGrid columns={4}>
					{OPERATING.map((v, i) => (
						<Card key={v.title} title={v.title} kicker='Operating principle' ghost={String(i + 1).padStart(2, '0')}>
							<p>{v.body}</p>
						</Card>
					))}
				</CardGrid>
			</section>
		</>
	)
}
```

- [ ] **Step 2: Check it in the browser**

Open `/about/values`. Acceptance: two groups of four, each row flush; ghost numerals restart at 01 in the second group; no card kicker repeats its own title.

- [ ] **Step 3: Lint and commit**

```bash
git add "app/(landing)/about/values/page.tsx"
git commit -m "feat(about): rebuild values on the card grid

The card kicker carries the group rather than repeating the card's own
title, which is what it did before."
```

---

### Task 11: Rebuild /about/rules

**Files:**
- Modify: `app/(landing)/about/rules/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `Card`, `CardGrid` from `components/ui/Card`; `List` from `components/ui/List`; `SectionHead` from `components/ui/SectionHead`.

Spans follow content length so the rows sit flush. Source order is preserved — a rules page with its sections out of order would be worse than a ragged one.

| § | Section | Clauses | `span` | `columns` |
|---|---|---|---|---|
| 1 | General | 6 | 3 | 1 |
| 2 | Attendance | 4 | 3 | 1 |
| 3 | TeamSpeak | 6 | 2 | 1 |
| 4 | Operations & Missions | 13 | 4 | 2 |
| 5 | Discord & Media | 5 | 6 | 3 |

- [ ] **Step 1: Rewrite the page**

Every bullet is copied verbatim from the file being replaced, minus the leading `- ` that was part of the string. Do not reword, re-punctuate or fix the apostrophes in `radio's` and `FOB's`.

```tsx
import { Metadata } from 'next'

import SectionHead from '@/components/ui/SectionHead'
import Card, { CardGrid } from '@/components/ui/Card'
import List from '@/components/ui/List'

export const metadata: Metadata = {
	title: "Rules | Australian Special Operations Taskforce",
	description: "The community rules and standards of conduct for all members of the Australian Special Operations Taskforce.",
}

export default function Tab() {
	return (
		<section>
			<SectionHead kicker='Conduct' title='What we expect' />

			<CardGrid columns={6}>
				<Card title='General' kicker='Section 1' ghost='01' span={3}>
					<List items={[
						'All members must treat everyone, including guests with the utmost respect.',
						'There is strictly no bullying, harassment or toxic behaviour allowed within the community.',
						'Members not associated with J1 are not to attempt to recruit or post recruitment content anywhere. Recommendations or invite links are acceptable to be passed onto potential new recruits.',
						'Members not associated with J3 are not to attempt to train new members.',
						'Be willing to assist all new members with any issues or concerns they may be experiencing.',
						"If you're not 15mins early, you're late!",
					]} />
				</Card>

				<Card title='Attendance' kicker='Section 2' ghost='02' span={3}>
					<List items={[
						'Members who are in a position within a call sign are expected to attend at least 3 of 4 weekends per month.',
						'Reservists are expected to attend at least 2 of 4 weekends per month.',
						"Members' expected attendance is to be tracked in the op-attendance channel on the discord each week.",
						'Not meeting the required level of attendance may result in removal from the community. We require keen and dedicated members.',
					]} />
				</Card>

				<Card title='TeamSpeak' kicker='Section 3' ghost='03' span={2}>
					<List items={[
						'Uphold a high level of seriousness and sensibility.',
						'Have their Teamspeak name set to the same as it would be when in-game on ArmA.',
						'Treat new and existing Teamspeak users with respect.',
						'Use Teamspeak permissions (Move/Ban/Kick) sensibly and not to the detriment of others.',
						"Point out teamspeak permission errors (IE a user has move/kick abilities when they shouldn't be able to)",
						'Ensure that, if they have channel admin in any channel, the channels name, topic and description is not vulgar, pornographic, racist or homophobic.',
					]} />
				</Card>

				<Card title='Operations & Missions' kicker='Section 4' ghost='04' span={4}>
					<List columns={2} items={[
						'All members are to set their in-game name with the following format – "PTE Name or CAPT Name".',
						'Listen to the orders of those with higher rank no matter which call sign they are from.',
						'Wait for permission/your turn to speak during briefings and debriefings.',
						"Use radio's or general voice for in-game/in character related chat.",
						'Posting in global chat is forbidden apart from admin related reasons.',
						'Use a legitimate, unhacked version of ARMA 3.',
						'Only use vehicles their role is permitted to use. (Eg: Only members in Hotel and Foxtrot may fly)',
						'Do not communicate about operation related matters on any out of game communication platform whilst in operations.',
						'Correctly use radio calls/call signs.',
						'Do not team kill other BLUFOR players or shoot at unarmed civilians.',
						'Ensure your mods are up to date at least 48 hours before the commencing of an operation or training.',
						'Provide constructive and respectful feedback on your experience during an operation.',
						"Leave FOB's, HQ's and the training server in a tidy state for other members to use.",
					]} />
				</Card>

				<Card title='Discord & Media' kicker='Section 5' ghost='05' span={6}>
					<List columns={3} items={[
						'DO NOT post, link to or otherwise reference vulgar, racist or sexual content.',
						'DO NOT post, link to or otherwise reference shit posting/flame baiting/troll or other bait related topics or replies.',
						'DO NOT Spam posts or replies.',
						'Be active and willing to assist new members with any issues or concerns they may be experiencing.',
						'Use the correct channels for the correct content.',
					]} />
				</Card>
			</CardGrid>
		</section>
	)
}
```

- [ ] **Step 2: Verify no clause was lost**

Run: `git show HEAD~1:"app/(landing)/about/rules/page.tsx" | grep -c "<Typography>-"`
Expected: `34`.

Run: `grep -c "^\t\t\t\t\t\t'" "app/(landing)/about/rules/page.tsx"` — count the list strings and confirm the total across all five cards is also 34. Cards contain 6 + 4 + 6 + 13 + 5.

- [ ] **Step 3: Check it in the browser**

Open `/about/rules`. Acceptance: § 3 and § 4 sit on the same row with roughly matched heights; § 4's list is two columns with no item split across the break; every wrapped line hangs clear of its marker; § 5 spans the full width in three columns.

- [ ] **Step 4: Lint and commit**

```bash
git add "app/(landing)/about/rules/page.tsx"
git commit -m "feat(about): rebuild rules as real lists

Section 4 was thirteen <Typography> elements each opening with a hyphen,
so a wrapped line ran back under its own dash. It is a <ul> now, and it
spans wide enough to sit level with section 3."
```

---

### Task 12: Rebuild /about/faq

**Files:**
- Modify: `app/(landing)/about/faq/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `Card`, `CardGrid` from `components/ui/Card`; `QaRow`, `QaStack` from `components/ui/QaRow`; `SectionHead` from `components/ui/SectionHead`.

**This task introduces the only new words on the branch.** Three group headings — `Joining ASOT`, `Game & setup`, `Playing with us` — and three kickers — `Eligibility`, `Requirements`, `Life in the unit`. Every question and every answer is verbatim. Approved 2026-08-21.

| Card | Kicker | `span` | Entries |
|---|---|---|---|
| Joining ASOT | Eligibility | 3 | age, location, microphone, other MILSIM communities |
| Game & setup | Requirements | 3 | first person, paid ARMA 3, DLC, mods |
| Playing with us | Life in the unit | 6 | PvP, cost, how often, member count, non-members, joint ops |

- [ ] **Step 1: Rewrite the page**

```tsx
import { Metadata } from 'next'
import Link from 'next/link'

import SectionHead from '@/components/ui/SectionHead'
import Card, { CardGrid } from '@/components/ui/Card'
import QaRow, { QaStack } from '@/components/ui/QaRow'

export const metadata: Metadata = {
	title: "FAQ | Australian Special Operations Taskforce",
	description: "Frequently asked questions about the Australian Special Operations Taskforce — joining, operations, and community life.",
}

export default function Tab() {
	return (
		<section>
			<SectionHead kicker='Common questions' title='Before you apply' more={{ href: '/about/contact', label: 'Still stuck? Contact us' }} />

			<CardGrid columns={6}>
				<Card title='Joining ASOT' kicker='Eligibility' ghost='01' span={3}>
					<QaStack>
						<QaRow index='1.1' question='Is there an age requirement to join ASOT?'>
							<p>You must be 17+ in order to join our group or be vouched for by a current member. We will consider mature younger players.</p>
						</QaRow>
						<QaRow index='1.2' question='Are there player location restrictions?'>
							<p>If you are from Australia or New Zealand, there will be no issues for you. If you are not in these countries, please let us know alongside your SteamID64 and we can advise you if joining is a possibility.</p>
						</QaRow>
						<QaRow index='1.3' question='Do I need a microphone to join ASOT?'>
							<p>Yes. All members require a working microphone.</p>
						</QaRow>
						<QaRow index='1.4' question='Can I be part of another ARMA 3 MILSIM community?'>
							<p>Being a member of other MILSIM/REALISM groups similar or different to ASOT regardless of times of play are not permitted. If you are, or wish to get involved in a RP community or other group, you are welcome to do so.</p>
							<p>Please confirm with our staff if your alternate group conflicts.</p>
						</QaRow>
					</QaStack>
				</Card>

				<Card title='Game & setup' kicker='Requirements' ghost='02' span={3}>
					<QaStack>
						<QaRow index='2.1' question='Do you force first person?'>
							<p>Yes.</p>
						</QaRow>
						<QaRow index='2.2' question='Do I need a paid version of ARMA 3?'>
							<p>Yes. You must have a legitimate copy of ARMA 3 as our servers use Battleye anti-cheat software. If it is discovered you are using an illegal copy or using cheats of any kind, you will be banned from the community immediately.</p>
						</QaRow>
						<QaRow index='2.3' question='Do I need ARMA 3 DLC to play?'>
							<p>Although encouraged, you will not require them to join our servers. Although, you will not be able to use certain vehicles and equipment without getting the annoying watermark appear on your screen. We recommend picking them up when they go on sale.</p>
						</QaRow>
						<QaRow index='2.4' question='What mods do you use?'>
							<p>We currently have 1 mod list that we use for our missions and on our training server.</p>
							<p>Main Modlist: <Link href='https://steamcommunity.com/sharedfiles/filedetails/?id=2461898157' target='_blank'>Steam Workshop</Link></p>
							<p>Any other mission mod lists will be posted in the discord noticeboard channel.</p>
						</QaRow>
					</QaStack>
				</Card>

				<Card title='Playing with us' kicker='Life in the unit' ghost='03' span={6}>
					<QaStack columns={2}>
						<QaRow index='3.1' question='Do you ever do PvP events?'>
							<p>Occasionally PvP events are hosted in house but our main focus is PvE. These events are optional for members and will generally not interfere with our weekend night missions.</p>
						</QaRow>
						<QaRow index='3.2' question='Does it cost money to play?'>
							<p>No, however, running the community does carry some costs that are mostly paid for by LTGEN Thomas and his head staff. Any donations are truly appreciated and will significantly help with covering those bills each month. All donations only go towards the community costs, no personal profits are kept, ever!</p>
						</QaRow>
						<QaRow index='3.3' question='How often do you play?'>
							<p>Our main operations are run weekly on Saturdays and Sundays. Once you become a member, you will be given the opportunity to join 1 Platoon, 2 Platoon or 3 Platoon.</p>
							<p>1 Platoon conducts missions on Saturday. 2 Platoon conducts missions on Sunday. 3 Platoon (support assets) support both Saturday and Sunday.</p>
							<p>We also run mid-week missions and trainings but these are optional.</p>
						</QaRow>
						<QaRow index='3.4' question='How many members do you have?'>
							<p>To see our current strength and manning, please refer to the ORBAT tab located at the top of the page.</p>
						</QaRow>
						<QaRow index='3.5' question='Do you allow non-members to join operations?'>
							<p>Unfortunately not. Generally we do not allow members of the public or from other communities to join in our operations. If you are a representative of another community or smaller group, please speak to a member of HQ about attending.</p>
						</QaRow>
						<QaRow index='3.6' question='Do you do joint operations with other units?'>
							<p>Generally not but there have been instances where we have conducted joint operations with other MILSIM groups.</p>
							<p>If you wish to conduct a joint operation with our community and you are a representative of a community, please approach a member of ASOT Staff or HQ about this in our Discord.</p>
						</QaRow>
					</QaStack>
				</Card>
			</CardGrid>
		</section>
	)
}
```

Note 3.3: the three platoon lines were three separate `<Typography>` elements in the original. They are joined into one paragraph here because they are prose in a Q&A answer rather than a list of rules — no words are changed, added or removed. If you would rather keep them as a list, use `List` with `columns={1}`; either is acceptable.

- [ ] **Step 2: Verify all fourteen survived**

Run: `git show HEAD~1:"app/(landing)/about/faq/page.tsx" | grep -c "<InfoCard title="`
Expected: `14`.

Run: `grep -c "<QaRow" "app/(landing)/about/faq/page.tsx"`
Expected: `14`.

- [ ] **Step 3: Check it in the browser**

Open `/about/faq`. Acceptance: three cards, the third full width in two columns; no Q&A row split across a column break; the Steam Workshop link is amber and underlined; the whole page is shorter than the previous revision.

- [ ] **Step 4: Lint and commit**

```bash
git add "app/(landing)/about/faq/page.tsx"
git commit -m "feat(about): group the FAQ into three cards

Fourteen bordered boxes become three wide cards of numbered rows. Adds the
only new words on this branch: three group headings and three kickers."
```

---

### Task 13: Rebuild /about/callsigns and /about/contact

Twelve callsigns and three contact channels. Both are collections of like things, so both keep their cards — restyled, not restructured.

**Files:**
- Modify: `components/callsign-card.tsx`
- Modify: `app/(landing)/about/callsigns/page.tsx`
- Modify: `app/(landing)/about/contact/page.tsx`
- Modify: `styles/shell.module.css` (append the contact-card styles)

**Interfaces:**
- Consumes: `List` from `components/ui/List`; `SectionHead` from `components/ui/SectionHead`.
- Produces: `CallsignCard` keeps its `{ title, images, children }` signature so all twelve call sites are untouched.

- [ ] **Step 1: Append the contact-card styles**

```css
/* ---------- contact channels --------------------------------------------- */

/*
   The one place on these pages where a non-red accent carries meaning rather
   than decoration: Discord blurple, TeamSpeak cyan, red for email. The colour
   arrives as a --acc custom property rather than the five hardcoded
   accentColor/accentRgb prop pairs the previous card took.
*/
.channel {
    border: 1px solid var(--line-1);
    border-top: 2px solid var(--acc, var(--red));
    background: var(--ink-1);
    padding: 20px 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: background .2s var(--nav-ease);
}

.channel:hover {
    background: var(--ink-2);
}

.channelH {
    display: flex;
    align-items: center;
    gap: 11px;
}

.channelH i {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, .05);
    color: var(--acc, var(--red));
    flex: none;
}

.channelH b {
    font-family: var(--font-cond);
    font-size: 15.5px;
    font-weight: 600;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--txt-1);
}

.channel p {
    color: var(--txt-2);
    font-size: 13.2px;
    line-height: 1.58;
    margin: 0;
}

.channelV {
    margin-top: auto;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: .04em;
    color: var(--acc, var(--red));
    word-break: break-all;
}

.channels {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
}

.widget {
    border: 1px solid var(--line-1);
    border-top: 2px solid var(--discord);
    background: var(--ink-1);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.widget iframe {
    width: 100%;
    height: 500px;
    border: none;
}

/* ---------- callsign card ------------------------------------------------ */

.csGrid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
}

.cs {
    border: 1px solid var(--line-1);
    background: var(--ink-1);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: border-color .2s var(--nav-ease), transform .2s var(--nav-ease);
}

.cs:hover {
    border-color: var(--red-dim);
    transform: translateY(-3px);
}

.csImg {
    position: relative;
    height: 118px;
    overflow: hidden;
    display: flex;
}

.csImg::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 2;
    background: linear-gradient(180deg, transparent 34%, rgba(11, 12, 14, .6) 74%, var(--ink-1) 100%);
}

/* The designation is already the identifier — a ghost numeral beside it would
   be a second number saying nothing. */
.csTag {
    position: absolute;
    z-index: 3;
    left: 16px;
    bottom: 10px;
    font-family: var(--font-disp);
    font-size: 24px;
    font-weight: 700;
    letter-spacing: .04em;
    line-height: 1;
    color: #fff;
    text-shadow: 0 2px 8px rgba(0, 0, 0, .8);
}

.csBody {
    padding: 16px 18px 18px;
}

.csBody p {
    color: var(--txt-2);
    font-size: 13.2px;
    line-height: 1.6;
    margin: 0;
}

@media (max-width: 1180px) {
    .channels, .csGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 860px) {
    .channels, .csGrid { grid-template-columns: minmax(0, 1fr); }
}

@media (prefers-reduced-motion: reduce) {
    .cs, .channel { transition: none; }
}
```

- [ ] **Step 2: Restyle CallsignCard**

Keep the `'use client'` directive, the `useRef`/`useState` shine tracking, `handleMouseMove`, `handleMouseLeave` and `shinePos` exactly as they are — that interaction is not being changed. Replace only the returned JSX's class names and structure:

```tsx
	return (
		<div
			ref={cardRef}
			onMouseMove={handleMouseMove}
			onMouseLeave={handleMouseLeave}
			className={s.cs}
			style={{ position: 'relative' }}
		>
			<div
				aria-hidden
				style={{
					position: 'absolute',
					inset: 0,
					pointerEvents: 'none',
					zIndex: 4,
					opacity: mouse.active ? 1 : 0,
					transition: 'opacity 0.4s ease',
					background: `linear-gradient(
						135deg,
						transparent ${shinePos - 30}%,
						rgba(255,255,255,0.04) ${shinePos - 10}%,
						rgba(255,255,255,0.09) ${shinePos}%,
						rgba(255,255,255,0.04) ${shinePos + 10}%,
						transparent ${shinePos + 30}%
					)`,
				}}
			/>

			<div className={s.csImg}>
				{images.map((img, i) => (
					<div key={i} className='relative flex-1 h-full'>
						<Image src={img} alt={title} fill className='object-cover' />
					</div>
				))}
				<span className={s.csTag}>{title.toUpperCase()}</span>
			</div>

			<div className={s.csBody}>
				{children}
			</div>
		</div>
	)
```

Add `import s from '@/styles/shell.module.css'` to the imports.

- [ ] **Step 3: Rebuild the callsigns page**

Keep all thirteen image imports and the `metadata` export unchanged. Wrap the grid in a `SectionHead`, swap the grid class, and convert each card's hyphenated `<Typography>` runs into a `List`. The twelve cards, in source order, are: `India 0A`, `India 1-0`, `1-0 Zulu / Game Masters`, `India 1-1`, `India 1-2`, `India 1-3-0`, `1-3 Echo`, `1-3 Golf`, `1-3 Hotel`, `1-3 Mike`, `1-3 Victor`, `Reservists`.

The wrapper becomes:

```tsx
		<section>
			<SectionHead kicker='Registry' title='Callsigns' />
			<div className={s.csGrid}>
				{/* the twelve <CallsignCard> elements, unchanged apart from their bodies */}
			</div>
		</section>
```

Inside each card, the pattern is: leading `<Typography>` paragraphs become `<p>`, the run of `- ` prefixed `<Typography>` elements becomes one `<List items={[...]} />` with the `- ` stripped from each string, and trailing paragraphs become `<p>`. For example, `India 0A` becomes:

```tsx
			<CallsignCard title='India 0A' images={[Image_0A]}>
				<p>India 0A is the commanding officer and unit owner callsign that oversees management and operation of the entire unit.</p>
				<List items={[
					'Overall command of all assets and call signs in game.',
					'Admin related to the community. (Mods, documentation and development)',
					'Management of all group departments and staff.',
					'Oversees all staff and unit management.',
				]} />
			</CallsignCard>
```

Apply the same transformation to the remaining eleven, taking each string verbatim from the file being replaced. Remove the `Typography` import when nothing uses it.

- [ ] **Step 4: Rebuild the contact page**

Replace the local `ContactCard` component with one that takes a CSS custom property, and keep all three channels plus the Discord widget:

```tsx
import { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import SectionHead from '@/components/ui/SectionHead'
import s from '@/styles/shell.module.css'

export const metadata: Metadata = {
	title: "Contact | Australian Special Operations Taskforce",
	description: "Get in touch with the Australian Special Operations Taskforce leadership and staff team.",
}

function Channel({ mark, title, accent, href, label, description, external }: {
	mark: string
	title: string
	accent: string
	href: string
	label: string
	description: string
	external?: boolean
}) {
	return (
		<Link
			href={href as any}
			target={external ? '_blank' : '_self'}
			className={s.channel}
			style={{ '--acc': accent } as React.CSSProperties}
		>
			<div className={s.channelH}><i>{mark}</i><b>{title}</b></div>
			<p>{description}</p>
			<span className={s.channelV}>{label}</span>
		</Link>
	)
}

export default function Tab() {
	return (
		<>
		<section>
			<SectionHead kicker='Get in touch' title='Contact us' />

			<div className={s.channels}>
				<Channel
					mark='TS'
					title='TeamSpeak'
					accent='#00bcd4'
					href='ts3server://ts.asotmilsim.com'
					label='ts.asotmilsim.com'
					description='Join our TeamSpeak server for real-time voice communications during operations.'
				/>
				<Channel
					mark='f'
					title='Facebook'
					accent='#1877F2'
					href='https://www.facebook.com/AustralianSpecialOperationsTaskforce'
					label='AustralianSpecialOperationsTaskforce'
					description='Follow us on Facebook for updates, event announcements, and community news.'
					external
				/>
				<Channel
					mark='@'
					title='Email'
					accent='rgb(219,0,29)'
					href='mailto:australianspecialoperationstaskforce@hotmail.com'
					label='australianspecialoperationstaskforce@hotmail.com'
					description='Send us a direct message for any inquiries, applications, or general questions.'
				/>
			</div>
		</section>

		<section className={s.widget}>
			<div className={s.channelH}>
				<i style={{ color: 'var(--discord)' }}>D</i>
				<div>
					<b>Discord</b>
					<p style={{ marginTop: 2 }}>Our primary community hub — join to connect with members, ask questions, and stay up to date.</p>
				</div>
			</div>
			<iframe
				title='ASOT Discord'
				src='https://discord.com/widget?id=744518510092484660&theme=dark'
			/>
		</section>
		</>
	)
}
```

Two sibling `<section>` elements rather than one, matching the pattern Task 10 established: the shell body is a flex column with a `gap`, so siblings are spaced by the shell and need no margin of their own. A single section would collapse the two blocks together.

- [ ] **Step 5: Check both in the browser**

Open `/about/callsigns` — acceptance: three across at 1440, twelve cards, designation legible over every photograph, duty bullets hanging correctly, hover shine still tracks the cursor.

Open `/about/contact` — acceptance: three channel cards with their own accent on the top border, icon and value; the Discord iframe loads and is not clipped; the TeamSpeak `ts3server://` link still triggers the protocol handler.

- [ ] **Step 6: Lint and commit**

```bash
git add components/callsign-card.tsx "app/(landing)/about/callsigns/page.tsx" "app/(landing)/about/contact/page.tsx" styles/shell.module.css
git commit -m "feat(about): restyle callsigns and contact

Both are collections of like things, so both keep their cards. The channel
accent moves onto a --acc custom property instead of five hardcoded prop
pairs."
```

---

### Task 14: Consumer sweep and dead code

**Files:**
- Modify: `app/me/layout.tsx`
- Modify: `app/(landing)/join/page.tsx`
- Modify: `app/(landing)/community/hof/layout.tsx` (only if the visual pass finds a problem)

**Interfaces:**
- Consumes: `MastheadAside`, `type AsideRow` from `components/ui/MastheadAside`; `getRosterCount` from `lib/landing`.

- [ ] **Step 1: Remove the dead imports from /me**

`app/me/layout.tsx` imports `Container` and `Banner` and renders neither. Delete both import lines and the unused `Metadata` import if it is only used by the commented-out block.

Run: `npm run lint`
Expected: no unused-import warnings for that file.

- [ ] **Step 2: Give /about its aside**

`app/(landing)/about/layout.tsx` is a server component. Add the roster lookup and pass an aside:

```tsx
import { getRosterCount } from '@/lib/landing'
import MastheadAside from '@/components/ui/MastheadAside'
```

Inside the component, before the return:

```tsx
    // Only the index page carries an aside — the five sub-pages have no live
    // figures worth a second column, and a 340px band with an empty right half
    // reads as the two-column composition with a hole in it.
    const isIndex = page.href === '/about'
    const roster = isIndex ? await getRosterCount() : null

    const aside = isIndex ? (
        <MastheadAside
            heading='At a glance'
            status='Live'
            rows={[
                { label: 'Active members', value: roster != null ? String(roster) : '—' },
                { label: 'Ops per week', value: '2' },
                { label: 'Applications', value: 'Open', accent: true },
            ]}
            cta={{ href: '/join', label: 'Enlist now' }}
        />
    ) : undefined
```

And pass `aside={aside}` to `Container`.

`getRosterCount()` returns `Promise<number | null>` — `null` on a failed lookup, which renders as `—` rather than a wrong number.

Add `export const dynamic = 'force-dynamic'` to the layout, matching `app/(landing)/page.tsx`: the roster moves between requests and a statically rendered figure would be stale.

- [ ] **Step 3: Give /join its aside**

In `app/(landing)/join/page.tsx`, add the same import and pass:

```tsx
            aside={
                <MastheadAside
                    heading='Applications'
                    status='Open'
                    rows={[
                        { label: 'Minimum age', value: '17' },
                        { label: 'Cost', value: 'Free' },
                        { label: 'Location', value: 'AU / NZ', accent: true },
                    ]}
                />
            }
```

These three figures are drawn from the FAQ's own answers — 17+, free to play, Australia or New Zealand — so they are not new claims.

- [ ] **Step 4: Visual pass over the remaining consumers**

Run `npm run dev` and check each again now that the primitives exist, at 1920 and at 375:

```
/join  /donate  /credits  /support  /partnerships
/community/orbat  /community/bios  /community/hof  /thomo
```

Acceptance: no page has a horizontal scrollbar; no page has doubled or missing padding under its masthead; `/community/hof`'s own inner padding still works with `padding: '0px'`; `/thomo`'s grid of images is unchanged.

Fix anything broken in the page that broke, not in `Container`.

- [ ] **Step 5: Lint and commit**

```bash
git add app/me/layout.tsx "app/(landing)/about/layout.tsx" "app/(landing)/join/page.tsx"
git commit -m "feat(shell): give about and join their asides

Both pages fetch their own figures and pass them down, so Container stays
presentational for the eight consumers that have no aside.

Also drops the dead Container and banner imports from app/me/layout.tsx,
which imported both and rendered neither."
```

---

### Task 15: Rail coverage, docs and the full build

**Files:**
- Create: `tests/about-rail.spec.ts`
- Modify: `docs/map/*` (the part files covering components and landing pages)

- [ ] **Step 1: Find the right map part files**

Run: `grep -rln "components/container\|about/layout\|InfoCard" docs/map/`

Update the entry for `components/container.tsx` to describe the new props and the masthead; add entries for `components/ui/Masthead.tsx`, `MastheadAside.tsx`, `SectionRail.tsx`, `Card.tsx`, `List.tsx`, `QaRow.tsx`, `lib/shell/masthead.ts` and `lib/shell/rail.ts`; remove the entry for `components/landing.css`; note that the six About pages no longer use `InfoCard`. Add any new topic keywords to the index's "Find it fast" table in `docs/map/README.md`.

- [ ] **Step 2: Check what the Playwright suite already asserts**

Run: `grep -rn "container-h1\|about\b" tests/ | head -30`

If any spec asserts on the old shell — the centred `container-h1`, the old tab markup — update it to the new structure. Report what you found either way.

- [ ] **Step 3: Write the rail spec**

Create `tests/about-rail.spec.ts`. Match the existing suite's fixture imports and helper names — read a neighbouring spec first and follow it rather than the sketch below if they differ.

```ts
import { test, expect } from '@playwright/test'

/**
 * The one piece of real behaviour the shell redesign introduces. The active
 * cell is resolved by longest prefix, which is unit-tested in lib/shell/rail —
 * this checks that the resolution is actually wired to the rendered rail.
 */
const ROUTES: [string, string][] = [
    ['/about', 'About Us'],
    ['/about/callsigns', 'Callsigns'],
    ['/about/contact', 'Contact Us'],
    ['/about/rules', 'Rules & Expectations'],
    ['/about/values', 'Principles & Values'],
    ['/about/faq', 'FAQ'],
]

test.describe('About section rail', () => {
    for (const [path, label] of ROUTES) {
        test(`marks exactly one cell active on ${path}`, async ({ page }) => {
            await page.goto(path)
            const rail = page.getByRole('navigation', { name: 'Section' })
            const active = rail.locator('[aria-current="page"]')

            await expect(active).toHaveCount(1)
            await expect(active).toContainText(label)
        })
    }

    test('every cell links to a page that exists', async ({ page }) => {
        await page.goto('/about')
        const links = page.getByRole('navigation', { name: 'Section' }).getByRole('link')
        await expect(links).toHaveCount(6)
    })
})
```

- [ ] **Step 4: Ask before running the E2E suite**

**Stop and ask the user** whether they want to run `npm run test:e2e -- about-rail` themselves or have you run it. Do not run it unprompted, and do not edit files while a run is in flight.

- [ ] **Step 5: Run the unit tests and the full build**

Run: `npm run test:unit`
Expected: PASS, including the 15 tests from Tasks 1 and 2.

Run: `npm run lint`
Expected: clean.

Run: `npm run build`
Expected: succeeds. This is the first full build of the branch — if `Container` being `async` broke a consumer, it surfaces here.

- [ ] **Step 6: Commit**

```bash
git add tests/about-rail.spec.ts docs/map/
git commit -m "test(about): assert the rail marks exactly one cell

Plus the site map entries for the shell primitives."
```

---

## Verification

Before reporting the branch complete:

- [ ] `npm run test:unit` passes.
- [ ] `npm run lint` is clean.
- [ ] `npm run build` succeeds.
- [ ] The E2E suite has been run — **by whoever the user nominated** — or the user has explicitly said to skip it.
- [ ] All fifteen public routes have been opened at 1920 and 375: the six About pages, `/join`, `/donate`, `/credits`, `/support`, `/partnerships`, `/community/orbat`, `/community/bios`, `/community/hof`, `/thomo`.
- [ ] `git log --oneline feat/navbar-redesign..HEAD` shows one commit per task.
- [ ] **Nothing has been pushed.**

Report to the user: what was built, what the visual pass found, the outcome of the `about/layout.tsx` preload investigation from Task 7 Step 2, and anything that had to deviate from this plan.
