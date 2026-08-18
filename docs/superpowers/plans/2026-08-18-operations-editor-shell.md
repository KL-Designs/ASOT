# Operations Editor Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the operations editor's 2,464-line single-component scroll-stack with a full-height shell — tabs, a persistent mission deck, and a status bar — so the briefing editor is the first thing on screen instead of the last.

**Architecture:** Pure logic moves to `lib/operations/*` where the existing vitest runner can reach it; thin React hooks in the edit route wrap it; the shell composes a header, tab strip, documents rail, editor, 340px deck and status bar. Existing panels stay mounted and working until the deck card that replaces each one lands, so every task leaves a usable page.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, vitest (node), Y.js/TipTap via Hocuspocus, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-08-18-operations-editor-redesign-design.md`

## Global Constraints

- **Branch:** all work on `feat/operations-editor`. Never commit to `main` — `.github/workflows/deploy.yml` deploys every push to `main` with no CI gate. Commit freely; **do not push** (Koda pushes).
- **Scope:** this plan is spec §12 phase 1, editor shell only (spec steps 1–7). The mission page (spec §10, steps 8–11) is a separate plan.
- **Unit tests live in `lib/`.** `vitest.config.ts` includes only `lib/**/*.test.ts`, deliberately, so the Playwright suite in `tests/` is never picked up. Pure logic therefore goes in `lib/operations/`, not in the route folder.
- **Do not run `npm run test:e2e`** — Playwright runs are Koda's call. Write specs, do not execute them.
- **Design tokens** come from `styles/command.css` (Task 1). No new `rgba()` literals in shell components; use `var(--…)`.
- **Token values, verbatim:** `--bg #08090a`, `--s1 #0d0f11`, `--s2 #12151a`, `--s3 #181c22`, `--line #1e232b`, `--line-2 #2a3038`, `--ink #e8eaed`, `--ink-2 #a8b0ba`, `--ink-3 #6b7480`, `--good #7fae5c`, `--warn #d4a03a`, `--crit #c05a48`, `--r 3px`.
- **`--acc` / `--acc-rgb` are injected inline** per operation from `themeColor`, never hardcoded.
- **Confirmations close 24 hours after opening**, not 48. The spec's density study says 48; the shipped code (`OperationStatusBar.tsx:70`) uses `24 * 3600000` and is authoritative.
- **No file over ~400 lines.**
- **Commit message convention:** `type(scope): summary`, e.g. `feat(operations): add the mission deck`. End with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `apps/web/styles/command.css` | The shared token block. Imported by milpac and the editor. |
| `apps/web/lib/operations/schedule.ts` | Pure: countdown formatting, RSVP close time, timeline construction. |
| `apps/web/lib/operations/schedule.test.ts` | Its tests. |
| `apps/web/lib/operations/stage.ts` | Pure: attendance stage order, index, next, label. |
| `apps/web/lib/operations/stage.test.ts` | Its tests. |
| `apps/web/lib/operations/doc-stats.ts` | Pure: word and section counts over a ProseMirror doc. |
| `apps/web/lib/operations/doc-stats.test.ts` | Its tests. |
| `apps/web/app/operations/[id]/edit/shell.module.css` | Shell layout classes. |
| `apps/web/app/operations/[id]/edit/hooks/useOperationStatus.ts` | Polls `live-status`, returns timeline + stage. |
| `apps/web/app/operations/[id]/edit/hooks/useDocStats.ts` | Word/section counts from the live editor. |
| `apps/web/app/operations/[id]/edit/EditorShell.tsx` | Layout, tab state, URL mirroring. |
| `apps/web/app/operations/[id]/edit/Header.tsx` | Crumb, title, status pill, save state, publish, overflow. |
| `apps/web/app/operations/[id]/edit/StatusBar.tsx` | Document/session state strip. |
| `apps/web/app/operations/[id]/edit/deck/MissionDeck.tsx` | Deck column + collapse. |
| `apps/web/app/operations/[id]/edit/deck/CountdownStrip.tsx` | D-n and gate progress cells. |
| `apps/web/app/operations/[id]/edit/deck/ScheduleCard.tsx` | The timeline. |
| `apps/web/app/operations/[id]/edit/deck/StageCard.tsx` | Progress bar + Advance. |
| `apps/web/app/operations/[id]/edit/deck/AttendanceCard.tsx` | Platoon chips, ping state. HQ only. |
| `apps/web/app/operations/[id]/edit/deck/DetailsCard.tsx` | Owner, department, points, theme, map world. |
| `apps/web/app/operations/[id]/edit/tabs/BriefTab.tsx` | Documents rail + CollabEditor. |
| `apps/web/app/operations/[id]/edit/tabs/MapTab.tsx` | MapSection. |

**Modified**

| Path | Change |
|---|---|
| `apps/web/app/(landing)/milpacs/[username]/profile.module.css` | Drops its `:root` token block; imports `command.css`. |
| `apps/web/app/operations/[id]/edit/page.tsx` | Shrinks from 2,464 lines to a thin container. |
| `apps/web/components/operations/OperationStatusBar.tsx` | Uses `lib/operations/schedule` instead of its own copies. |
| `apps/web/lib/colour.ts` | New home for `hexToRgb` (Task 1). |

---

## Task 1: Shared token stylesheet

**Files:**
- Create: `apps/web/styles/command.css`
- Create: `apps/web/lib/colour.ts`
- Modify: `apps/web/app/(landing)/milpacs/[username]/profile.module.css:16-60`

**Interfaces:**
- Consumes: nothing.
- Produces: the `.command` class exposing every token above; `hexToRgb(hex: string): { r: number; g: number; b: number }` and `rgbTriplet(hex: string): string` from `@/lib/colour`.

- [ ] **Step 1: Create the token stylesheet**

`apps/web/styles/command.css`:

```css
/*
 * The shared command palette. Ported out of the milpac personnel file
 * (profile.module.css), which defined it first and still consumes it.
 *
 * --acc / --acc-rgb are deliberately NOT set here: every consumer injects them
 * inline for the entity it renders — the member's Discord colour on a milpac,
 * the operation's themeColor in the editor. That indirection is what lets one
 * palette serve pages whose accent is per-row data.
 */
.command {
    --bg: #08090a;
    --s1: #0d0f11;
    --s2: #12151a;
    --s3: #181c22;
    --line: #1e232b;
    --line-2: #2a3038;

    --ink: #e8eaed;
    --ink-2: #a8b0ba;
    --ink-3: #6b7480;

    --good: #7fae5c;
    --warn: #d4a03a;
    --crit: #c05a48;

    --mono: ui-monospace, "SF Mono", "JetBrains Mono", "Roboto Mono", Menlo, Consolas, monospace;
    --sans: "Helvetica Neue", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;

    --r: 3px;
    --pad: clamp(16px, 3vw, 40px);
}
```

- [ ] **Step 2: Create the colour helper**

`apps/web/lib/colour.ts`:

```ts
/**
 * One home for hex -> rgb. It was previously redefined in at least three
 * files (the editor page, PageSidebar, PageNavClient), each with the same
 * body, which is how two of them ended up disagreeing about what to do with
 * a malformed value.
 */
export interface Rgb { r: number; g: number; b: number }

export function hexToRgb(hex: string): Rgb {
    const h = String(hex ?? '').replace('#', '')
    if (h.length !== 6) return { r: 219, g: 0, b: 29 }
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

/** `"219,0,29"` — the form CSS custom properties want for rgba() tinting. */
export function rgbTriplet(hex: string): string {
    const { r, g, b } = hexToRgb(hex)
    return `${r},${g},${b}`
}
```

- [ ] **Step 3: Write the failing test**

`apps/web/lib/colour.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { hexToRgb, rgbTriplet } from './colour'

describe('hexToRgb', () => {
    test('parses a six-digit hex with or without the hash', () => {
        expect(hexToRgb('#db001d')).toEqual({ r: 219, g: 0, b: 29 })
        expect(hexToRgb('db001d')).toEqual({ r: 219, g: 0, b: 29 })
    })

    test('falls back to ASOT red on anything malformed', () => {
        expect(hexToRgb('')).toEqual({ r: 219, g: 0, b: 29 })
        expect(hexToRgb('#fff')).toEqual({ r: 219, g: 0, b: 29 })
    })
})

describe('rgbTriplet', () => {
    test('formats for CSS custom properties', () => {
        expect(rgbTriplet('#4dd0e1')).toBe('77,208,225')
    })
})
```

- [ ] **Step 4: Run the test**

Run: `cd apps/web && npx vitest run lib/colour.test.ts`
Expected: PASS (implementation was written in step 2).

- [ ] **Step 5: Repoint the milpac stylesheet**

In `profile.module.css`, add `@import '../../../../styles/command.css';` at the top, change `.shell {` to `.shell { composes: command from '../../../../styles/command.css';` and **delete** the token declarations from `--bg` through `--pad` in the `.shell` block. Leave every other declaration in `.shell` (background, color, font-family, font-size, line-height, font-smoothing, position, overflow-x) exactly as it is.

- [ ] **Step 6: Verify no rendered change on milpac**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`
Expected: clean. Then load a milpac page in dev and confirm colours are unchanged — this step is a visual diff, not an assertion.

- [ ] **Step 7: Commit**

```bash
git add apps/web/styles/command.css apps/web/lib/colour.ts apps/web/lib/colour.test.ts "apps/web/app/(landing)/milpacs/[username]/profile.module.css"
git commit -m "refactor(styles): extract the milpac token block into styles/command.css

Three consumers are coming — milpac, the operations editor shell and the
mission page — and three copies of a palette is how palettes drift.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Schedule logic

**Files:**
- Create: `apps/web/lib/operations/schedule.ts`
- Test: `apps/web/lib/operations/schedule.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type AttendanceStage = 'preparing' | 'rsvp_open' | 'rsvp_closed' | 'op_running' | 'confirmations_open' | 'completed'`
  - `interface LiveStatus` — the `GET /api/operations/[id]/live-status` response shape
  - `interface TimelineMoment { id; label; at: Date | null; detail: string; state: 'done' | 'current' | 'pending' }`
  - `fmtCountdown(target: Date, now: Date): string | null`
  - `rsvpCloseAt(operationDate: Date | null, offsetMins: number): Date | null`
  - `buildTimeline(status: LiveStatus, now: Date): TimelineMoment[]`

- [ ] **Step 1: Write the failing test**

`apps/web/lib/operations/schedule.test.ts`:

```ts
/**
 * The editor's deck and the public status bar both render from these, so a
 * disagreement between them is a bug users see as "the page says two things".
 * All of it is pure and clock-injected, so it is tested directly.
 */
import { describe, test, expect } from 'vitest'
import { fmtCountdown, rsvpCloseAt, buildTimeline, type LiveStatus } from './schedule'

const base: LiveStatus = {
    operationStatus: 'Upcoming',
    operationDate: '2026-11-18T08:00:00.000Z',
    rsvpOpen: false,
    rsvpOpenAt: null,
    rsvpCloseOffsetMins: 90,
    confirmationOpen: false,
    confirmationOpenedAt: null,
    stage: 'preparing',
}

describe('fmtCountdown', () => {
    const now = new Date('2026-08-18T00:00:00.000Z')

    test('days and hours when more than a day out', () => {
        expect(fmtCountdown(new Date('2026-08-20T05:00:00.000Z'), now)).toBe('2d 5h')
    })

    test('hours and minutes inside a day', () => {
        expect(fmtCountdown(new Date('2026-08-18T03:30:00.000Z'), now)).toBe('3h 30m')
    })

    test('minutes and seconds inside an hour', () => {
        expect(fmtCountdown(new Date('2026-08-18T00:02:05.000Z'), now)).toBe('2m 5s')
    })

    test('null once the target has passed, so callers can branch on it', () => {
        expect(fmtCountdown(new Date('2026-08-17T23:59:59.000Z'), now)).toBeNull()
        expect(fmtCountdown(now, now)).toBeNull()
    })
})

describe('rsvpCloseAt', () => {
    test('subtracts the offset from the operation date', () => {
        expect(rsvpCloseAt(new Date('2026-11-18T08:00:00.000Z'), 90))
            .toEqual(new Date('2026-11-18T06:30:00.000Z'))
    })

    test('null when the operation has no date yet', () => {
        expect(rsvpCloseAt(null, 90)).toBeNull()
    })
})

describe('buildTimeline', () => {
    const now = new Date('2026-08-18T00:00:00.000Z')

    test('returns the five moments in chronological order', () => {
        expect(buildTimeline(base, now).map(m => m.id)).toEqual([
            'rsvp_opens', 'rsvp_closes', 'op_starts', 'confirmations_open', 'completed',
        ])
    })

    test('reports a manual RSVP as Manual rather than inventing a time', () => {
        const m = buildTimeline(base, now)[0]
        expect(m.at).toBeNull()
        expect(m.detail).toBe('Manual')
    })

    test('uses the scheduled open time when one is set', () => {
        const m = buildTimeline({ ...base, rsvpOpenAt: '2026-11-17T08:00:00.000Z' }, now)[0]
        expect(m.at).toEqual(new Date('2026-11-17T08:00:00.000Z'))
    })

    test('marks the operation start as current once running', () => {
        const t = buildTimeline({ ...base, stage: 'op_running' }, now)
        expect(t.find(m => m.id === 'op_starts')!.state).toBe('current')
        expect(t.find(m => m.id === 'rsvp_closes')!.state).toBe('done')
    })

    test('closes confirmations 24 hours after they open, not 48', () => {
        const t = buildTimeline({
            ...base,
            stage: 'confirmations_open',
            confirmationOpen: true,
            confirmationOpenedAt: '2026-11-18T12:00:00.000Z',
        }, now)
        expect(t.find(m => m.id === 'completed')!.at)
            .toEqual(new Date('2026-11-19T12:00:00.000Z'))
    })

    test('survives an operation with no date at all', () => {
        const t = buildTimeline({ ...base, operationDate: null }, now)
        expect(t).toHaveLength(5)
        expect(t.find(m => m.id === 'op_starts')!.at).toBeNull()
    })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/web && npx vitest run lib/operations/schedule.test.ts`
Expected: FAIL — `Failed to resolve import "./schedule"`.

- [ ] **Step 3: Write the implementation**

`apps/web/lib/operations/schedule.ts`:

```ts
/**
 * Everything the editor deck and the public status bar need to say *when*
 * something happens. Pure and clock-injected: `now` is always a parameter so
 * the whole timeline is testable without faking timers.
 *
 * Lifted from components/operations/OperationStatusBar.tsx, which computed all
 * of this inline and is now a consumer.
 */

export type AttendanceStage =
    | 'preparing' | 'rsvp_open' | 'rsvp_closed'
    | 'op_running' | 'confirmations_open' | 'completed'

/** The `GET /api/operations/[id]/live-status` response. */
export interface LiveStatus {
    operationStatus: string | null
    operationDate: string | null
    rsvpOpen: boolean
    rsvpOpenAt: string | null
    rsvpCloseOffsetMins: number
    confirmationOpen: boolean
    confirmationOpenedAt: string | null
    stage: AttendanceStage | null
}

export type MomentId =
    | 'rsvp_opens' | 'rsvp_closes' | 'op_starts'
    | 'confirmations_open' | 'completed'

export interface TimelineMoment {
    id: MomentId
    label: string
    /** null when the moment has no computable time — a manual RSVP, or no op date yet. */
    at: Date | null
    /** One human sentence for the row: a formatted date, 'Manual', or a rule. */
    detail: string
    state: 'done' | 'current' | 'pending'
}

/** Confirmations stay open for a day. 24h, not 48 — see OperationStatusBar. */
const CONFIRMATION_WINDOW_MS = 24 * 3600_000

export function fmtCountdown(target: Date, now: Date): string | null {
    const diff = target.getTime() - now.getTime()
    if (diff <= 0) return null
    const s = Math.floor(diff / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    const d = Math.floor(h / 24)
    if (d > 0) return `${d}d ${h % 24}h`
    if (h > 0) return `${h}h ${m % 60}m`
    return `${m}m ${s % 60}s`
}

export function rsvpCloseAt(operationDate: Date | null, offsetMins: number): Date | null {
    if (!operationDate) return null
    return new Date(operationDate.getTime() - offsetMins * 60_000)
}

const STAGE_BY_MOMENT: Record<MomentId, AttendanceStage> = {
    rsvp_opens: 'rsvp_open',
    rsvp_closes: 'rsvp_closed',
    op_starts: 'op_running',
    confirmations_open: 'confirmations_open',
    completed: 'completed',
}

const ORDER: AttendanceStage[] = [
    'preparing', 'rsvp_open', 'rsvp_closed',
    'op_running', 'confirmations_open', 'completed',
]

function stateFor(moment: MomentId, stage: AttendanceStage | null): TimelineMoment['state'] {
    const current = ORDER.indexOf(stage ?? 'preparing')
    const mine = ORDER.indexOf(STAGE_BY_MOMENT[moment])
    if (mine < current) return 'done'
    if (mine === current) return 'current'
    return 'pending'
}

function fmtAt(at: Date | null): string {
    if (!at) return '—'
    return at.toLocaleString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false,
    })
}

export function buildTimeline(status: LiveStatus, now: Date): TimelineMoment[] {
    void now  // reserved: callers format countdowns separately via fmtCountdown
    const opDate = status.operationDate ? new Date(status.operationDate) : null
    const openAt = status.rsvpOpenAt ? new Date(status.rsvpOpenAt) : null
    const closeAt = rsvpCloseAt(opDate, status.rsvpCloseOffsetMins)
    const confirmedAt = status.confirmationOpenedAt ? new Date(status.confirmationOpenedAt) : null
    const completedAt = confirmedAt ? new Date(confirmedAt.getTime() + CONFIRMATION_WINDOW_MS) : null

    return [
        {
            id: 'rsvp_opens',
            label: 'RSVP opens',
            at: openAt,
            detail: openAt ? fmtAt(openAt) : 'Manual',
            state: stateFor('rsvp_opens', status.stage),
        },
        {
            id: 'rsvp_closes',
            label: 'RSVP closes',
            at: closeAt,
            detail: closeAt ? fmtAt(closeAt) : '—',
            state: stateFor('rsvp_closes', status.stage),
        },
        {
            id: 'op_starts',
            label: 'Operation starts',
            at: opDate,
            detail: opDate ? fmtAt(opDate) : 'No date set',
            state: stateFor('op_starts', status.stage),
        },
        {
            id: 'confirmations_open',
            label: 'Confirmations open',
            at: null,
            detail: 'When the mission ends',
            state: stateFor('confirmations_open', status.stage),
        },
        {
            id: 'completed',
            label: 'Completed',
            at: completedAt,
            detail: completedAt ? fmtAt(completedAt) : '24 hours after confirmations open',
            state: stateFor('completed', status.stage),
        },
    ]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run lib/operations/schedule.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/operations/schedule.ts apps/web/lib/operations/schedule.test.ts
git commit -m "feat(operations): extract schedule and timeline logic to lib

Pure and clock-injected so the deck, the public status bar and their tests
all agree about when things happen.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Stage logic

**Files:**
- Create: `apps/web/lib/operations/stage.ts`
- Test: `apps/web/lib/operations/stage.test.ts`

**Interfaces:**
- Consumes: `AttendanceStage` from `./schedule`.
- Produces: `STAGE_ORDER: readonly AttendanceStage[]`, `stageIndex(s): number`, `nextStage(s): AttendanceStage | null`, `stageLabel(s): string`, `stageProgress(s): number`.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/operations/stage.test.ts`:

```ts
/**
 * The deck's Advance button is a manual override on top of the cron that
 * normally drives these transitions, so "what comes next" has to be one
 * answer both agree on.
 */
import { describe, test, expect } from 'vitest'
import { STAGE_ORDER, stageIndex, nextStage, stageLabel, stageProgress } from './stage'

describe('STAGE_ORDER', () => {
    test('is the lifecycle in order', () => {
        expect(STAGE_ORDER).toEqual([
            'preparing', 'rsvp_open', 'rsvp_closed',
            'op_running', 'confirmations_open', 'completed',
        ])
    })
})

describe('stageIndex', () => {
    test('locates a stage', () => {
        expect(stageIndex('preparing')).toBe(0)
        expect(stageIndex('completed')).toBe(5)
    })

    test('treats null and anything unrecognised as preparing', () => {
        expect(stageIndex(null)).toBe(0)
        expect(stageIndex('nonsense' as never)).toBe(0)
    })
})

describe('nextStage', () => {
    test('advances one step', () => {
        expect(nextStage('preparing')).toBe('rsvp_open')
        expect(nextStage('op_running')).toBe('confirmations_open')
    })

    test('null at the end, so the button can disable itself', () => {
        expect(nextStage('completed')).toBeNull()
    })
})

describe('stageLabel', () => {
    test('renders human labels', () => {
        expect(stageLabel('rsvp_open')).toBe('RSVP Open')
        expect(stageLabel('op_running')).toBe('Op Running')
        expect(stageLabel(null)).toBe('Preparing')
    })
})

describe('stageProgress', () => {
    test('is a 1-based count for the six-segment bar', () => {
        expect(stageProgress('preparing')).toBe(1)
        expect(stageProgress('completed')).toBe(6)
    })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/web && npx vitest run lib/operations/stage.test.ts`
Expected: FAIL — cannot resolve `./stage`.

- [ ] **Step 3: Write the implementation**

`apps/web/lib/operations/stage.ts`:

```ts
import type { AttendanceStage } from './schedule'

export const STAGE_ORDER = [
    'preparing', 'rsvp_open', 'rsvp_closed',
    'op_running', 'confirmations_open', 'completed',
] as const satisfies readonly AttendanceStage[]

const LABELS: Record<AttendanceStage, string> = {
    preparing: 'Preparing',
    rsvp_open: 'RSVP Open',
    rsvp_closed: 'RSVP Closed',
    op_running: 'Op Running',
    confirmations_open: 'Confirmations Open',
    completed: 'Completed',
}

/** Unrecognised and missing stages both read as the start of the lifecycle. */
export function stageIndex(stage: AttendanceStage | null): number {
    const i = STAGE_ORDER.indexOf(stage as never)
    return i === -1 ? 0 : i
}

export function nextStage(stage: AttendanceStage | null): AttendanceStage | null {
    const i = stageIndex(stage)
    return i >= STAGE_ORDER.length - 1 ? null : STAGE_ORDER[i + 1]
}

export function stageLabel(stage: AttendanceStage | null): string {
    return LABELS[stage as AttendanceStage] ?? LABELS.preparing
}

/** 1-based, for the deck's six-segment progress bar. */
export function stageProgress(stage: AttendanceStage | null): number {
    return stageIndex(stage) + 1
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run lib/operations/stage.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/operations/stage.ts apps/web/lib/operations/stage.test.ts
git commit -m "feat(operations): extract attendance stage progression to lib

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Document statistics

**Files:**
- Create: `apps/web/lib/operations/doc-stats.ts`
- Test: `apps/web/lib/operations/doc-stats.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface DocStats { words: number; sections: number }`, `docStats(doc: unknown): DocStats`.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/operations/doc-stats.test.ts`:

```ts
/**
 * Feeds the status bar's "1,240 words · 6 sections". Takes a plain
 * ProseMirror JSON document so it never needs a live editor to test.
 */
import { describe, test, expect } from 'vitest'
import { docStats } from './doc-stats'

const doc = {
    type: 'doc',
    content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Situation' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Enemy forces hold the compound.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Mission' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Seize and hold.' }] },
    ],
}

describe('docStats', () => {
    test('counts words across every text node, headings included', () => {
        // Situation(1) + 5 + Mission(1) + 3
        expect(docStats(doc).words).toBe(10)
    })

    test('counts headings as sections', () => {
        expect(docStats(doc).sections).toBe(2)
    })

    test('collapses runs of whitespace rather than counting empties', () => {
        const d = { type: 'doc', content: [
            { type: 'paragraph', content: [{ type: 'text', text: '  spaced   out  ' }] },
        ] }
        expect(docStats(d).words).toBe(2)
    })

    test('returns zeroes for null, so the status bar renders before the doc loads', () => {
        expect(docStats(null)).toEqual({ words: 0, sections: 0 })
        expect(docStats(undefined)).toEqual({ words: 0, sections: 0 })
    })

    test('walks nested content such as lists and blockquotes', () => {
        const d = { type: 'doc', content: [
            { type: 'bulletList', content: [
                { type: 'listItem', content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'one two three' }] },
                ] },
            ] },
        ] }
        expect(docStats(d).words).toBe(3)
    })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/web && npx vitest run lib/operations/doc-stats.test.ts`
Expected: FAIL — cannot resolve `./doc-stats`.

- [ ] **Step 3: Write the implementation**

`apps/web/lib/operations/doc-stats.ts`:

```ts
export interface DocStats {
    words: number
    sections: number
}

interface PmNode {
    type?: string
    text?: string
    content?: PmNode[]
}

/**
 * Word and section counts over a ProseMirror JSON document.
 *
 * Deliberately takes plain JSON rather than a TipTap Editor: the status bar
 * gets its document from the Y.Doc, and keeping this free of editor types is
 * what lets it be unit tested under the node-environment vitest runner.
 */
export function docStats(doc: unknown): DocStats {
    let words = 0
    let sections = 0

    const walk = (node: PmNode | null | undefined): void => {
        if (!node || typeof node !== 'object') return
        if (node.type === 'heading') sections++
        if (typeof node.text === 'string') {
            const trimmed = node.text.trim()
            if (trimmed) words += trimmed.split(/\s+/).length
        }
        node.content?.forEach(walk)
    }

    walk(doc as PmNode)
    return { words, sections }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run lib/operations/doc-stats.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/operations/doc-stats.ts apps/web/lib/operations/doc-stats.test.ts
git commit -m "feat(operations): count words and sections from a ProseMirror doc

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Repoint OperationStatusBar at the shared logic

**Files:**
- Modify: `apps/web/components/operations/OperationStatusBar.tsx:1-90`

**Interfaces:**
- Consumes: `fmtCountdown`, `rsvpCloseAt`, `LiveStatus`, `AttendanceStage` from `@/lib/operations/schedule`.
- Produces: nothing new. This task is proof the extraction is faithful.

- [ ] **Step 1: Replace the local definitions**

Delete the local `interface LiveStatus` (lines 5-14) and the local `fmtCountdown` (lines 26-36). Import both from `@/lib/operations/schedule`. Replace the inline close-date maths:

```ts
// was: const rsvpCloseDate = opDate ? new Date(opDate.getTime() - rsvpCloseOffsetMins * 60000) : null
const rsvpCloseDate = rsvpCloseAt(opDate, rsvpCloseOffsetMins)
```

Leave every rendering decision, label and colour in this component untouched — this is a swap of computation, not of output.

- [ ] **Step 2: Typecheck and lint**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Verify the public page still renders the same bar**

Load `/operations/<any id>` in dev and confirm the status bar shows the same items with the same countdowns. Visual check.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/operations/OperationStatusBar.tsx
git commit -m "refactor(operations): read schedule logic from lib in the status bar

Proves the extraction is faithful before anything new consumes it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The editor hooks

**Files:**
- Create: `apps/web/app/operations/[id]/edit/hooks/useOperationStatus.ts`
- Create: `apps/web/app/operations/[id]/edit/hooks/useDocStats.ts`
- Create: `apps/web/app/operations/[id]/edit/hooks/useOperationMeta.ts`
- Create: `apps/web/app/operations/[id]/edit/hooks/usePresence.ts`

**Interfaces:**
- Consumes: `LiveStatus`, `TimelineMoment`, `buildTimeline` from `@/lib/operations/schedule`; `docStats`, `DocStats` from `@/lib/operations/doc-stats`.
- Produces:
  - `useOperationStatus(operationId: string): { status: LiveStatus | null; timeline: TimelineMoment[]; now: Date; daysUntil: number | null; refresh: () => void }`
  - `useDocStats(ydoc: Y.Doc | null, activePage: string): DocStats`
  - `useOperationMeta(operationId: string, initial: MetaFields): { meta: MetaFields; setField: (k: keyof MetaFields, v: string) => void; saveStatus: 'saved' | 'saving' | 'unsaved'; savedAt: Date | null }`
  - `usePresence(provider: HocuspocusProvider | null): number` — the count of connected editors, from Y.js awareness.

- [ ] **Step 1: Write the hook**

```ts
'use client'

import { useCallback, useEffect, useState } from 'react'
import { buildTimeline, type LiveStatus, type TimelineMoment } from '@/lib/operations/schedule'

/**
 * Polls the same endpoint the public status bar uses, on the same 30s cadence,
 * and ticks a 1s clock so countdowns move without another network call.
 */
export function useOperationStatus(operationId: string): {
    status: LiveStatus | null
    timeline: TimelineMoment[]
    now: Date
    daysUntil: number | null
    refresh: () => void
} {
    const [status, setStatus] = useState<LiveStatus | null>(null)
    const [now, setNow] = useState(() => new Date())

    const refresh = useCallback(() => {
        if (!operationId) return
        fetch(`/api/operations/${operationId}/live-status`)
            .then(res => res.json())
            .then(setStatus)
            .catch(() => {})
    }, [operationId])

    useEffect(() => {
        refresh()
        const id = setInterval(refresh, 30_000)
        return () => clearInterval(id)
    }, [refresh])

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1_000)
        return () => clearInterval(id)
    }, [])

    const timeline = status ? buildTimeline(status, now) : []

    const opDate = status?.operationDate ? new Date(status.operationDate) : null
    const daysUntil = opDate
        ? Math.max(0, Math.ceil((opDate.getTime() - now.getTime()) / 86_400_000))
        : null

    return { status, timeline, now, daysUntil, refresh }
}
```

- [ ] **Step 2: Write the doc-stats hook**

`useDocStats.ts` — reads the ProseMirror JSON out of the Y.Doc so it needs no
editor instance, and recomputes only when the document actually changes:

```ts
'use client'

import { useEffect, useState } from 'react'
import type * as Y from 'yjs'
import { docStats, type DocStats } from '@/lib/operations/doc-stats'

export function useDocStats(ydoc: Y.Doc | null, activePage: string): DocStats {
    const [stats, setStats] = useState<DocStats>({ words: 0, sections: 0 })

    useEffect(() => {
        if (!ydoc) return
        const frag = ydoc.getXmlFragment(activePage)

        const recompute = () => {
            // toJSON() on the fragment yields the ProseMirror-shaped tree.
            try { setStats(docStats(JSON.parse(JSON.stringify(frag.toJSON())))) }
            catch { setStats({ words: 0, sections: 0 }) }
        }

        recompute()
        frag.observeDeep(recompute)
        return () => frag.unobserveDeep(recompute)
    }, [ydoc, activePage])

    return stats
}
```

- [ ] **Step 3: Write the meta hook**

`useOperationMeta.ts` — lifts the debounced save at `page.tsx:360-373` out of the
component unchanged in behaviour, and additionally records *when* the save
landed so the status bar can show it:

```ts
'use client'

import { useRef, useState } from 'react'

export interface MetaFields {
    title: string
    department: string
    date: string
    loreDate: string
}

export function useOperationMeta(operationId: string, initial: MetaFields) {
    const [meta, setMeta] = useState<MetaFields>(initial)
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
    const [savedAt, setSavedAt] = useState<Date | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    function setField(key: keyof MetaFields, value: string) {
        setMeta(m => ({ ...m, [key]: value }))
        setSaveStatus('unsaved')
        clearTimeout(timer.current)
        timer.current = setTimeout(async () => {
            setSaveStatus('saving')
            const qs = `${key}=${encodeURIComponent(value)}`
            try {
                await fetch(`/api/operations/update?id=${operationId}&${qs}`)
                setSaveStatus('saved')
                setSavedAt(new Date())
            } catch {
                setSaveStatus('unsaved')
            }
        }, 1000)
    }

    return { meta, setField, saveStatus, savedAt }
}
```

- [ ] **Step 4: Write the presence hook**

`usePresence.ts` — the status bar's "n editing" comes from the awareness
protocol `CollabEditor` already maintains for its collaborative cursors, so
this reads it rather than opening a second channel:

```ts
'use client'

import { useEffect, useState } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'

export function usePresence(provider: HocuspocusProvider | null): number {
    const [count, setCount] = useState(0)

    useEffect(() => {
        if (!provider) return
        const awareness = provider.awareness
        if (!awareness) return

        const update = () => setCount(awareness.getStates().size)
        update()
        awareness.on('change', update)
        return () => awareness.off('change', update)
    }, [provider])

    return count
}
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/operations/[id]/edit/hooks/"
git commit -m "feat(operations): add the editor hooks for status, stats, meta and presence

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: The shell layout, header and status bar

**Files:**
- Create: `apps/web/app/operations/[id]/edit/shell.module.css`
- Create: `apps/web/app/operations/[id]/edit/Header.tsx`
- Create: `apps/web/app/operations/[id]/edit/StatusBar.tsx`
- Create: `apps/web/app/operations/[id]/edit/EditorShell.tsx`
- Modify: `apps/web/app/operations/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `useOperationStatus` (Task 6), `rgbTriplet` (Task 1), `docStats` (Task 4).
- Produces:
  - `type EditorTab = 'brief' | 'map' | 'development' | 'attendance'`
  - `<EditorShell operationId themeColor isHQ tab onTabChange header deck statusBar>{children}</EditorShell>`
  - `<Header …>` and `<StatusBar …>` as below.

- [ ] **Step 1: Create the shell stylesheet**

`shell.module.css` — grid regions only; all colour via tokens:

```css
.shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg);
    color: var(--ink);
    font-family: var(--sans);
    overflow: hidden;
}
.body { display: flex; flex: 1; min-height: 0; }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; }
.deck { width: 340px; flex-shrink: 0; border-left: 1px solid var(--line); overflow-y: auto; }
.deckCollapsed { width: 44px; }

@media (max-width: 1279px) { .deck { position: absolute; right: 0; top: 0; bottom: 0; z-index: 20; } }
@media (max-width: 1023px) { .deck { width: 300px; } }
```

- [ ] **Step 2: Write the tab state with URL mirroring**

In `EditorShell.tsx`. **Tabs must not use the Next router** — see spec §7: `next/link` navigation on the milpac page committed on the first click only 11 times in 18, and a full document load would tear down the Hocuspocus socket and rebuild the Y.Doc.

```tsx
'use client'

import { useEffect, useState, type ReactNode } from 'react'

export type EditorTab = 'brief' | 'map' | 'development' | 'attendance'

const TABS: readonly EditorTab[] = ['brief', 'map', 'development', 'attendance']

function tabFromLocation(): EditorTab {
    if (typeof window === 'undefined') return 'brief'
    const t = new URLSearchParams(window.location.search).get('tab')
    return (TABS as readonly string[]).includes(t ?? '') ? (t as EditorTab) : 'brief'
}

export function useEditorTab(): [EditorTab, (t: EditorTab) => void] {
    const [tab, setTab] = useState<EditorTab>('brief')

    // Read the deep link after mount — the server render has no location.
    useEffect(() => { setTab(tabFromLocation()) }, [])

    const change = (next: EditorTab) => {
        setTab(next)
        const url = new URL(window.location.href)
        url.searchParams.set('tab', next)
        // replaceState, not router.push: no navigation, so the collab socket lives.
        window.history.replaceState(null, '', url)
    }

    return [tab, change]
}
```

- [ ] **Step 3: Write the status bar**

`StatusBar.tsx` — document and session state only. It must not repeat the deck's mission facts (spec §5).

```tsx
'use client'

interface Props {
    connected: boolean
    activeDocTitle: string
    words: number
    sections: number
    savedAt: Date | null
    editorCount: number
    department: string
}

export default function StatusBar({
    connected, activeDocTitle, words, sections, savedAt, editorCount, department,
}: Props) {
    const cell: React.CSSProperties = {
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '0 16px', height: '100%',
        borderRight: '1px solid var(--line)',
        color: 'var(--ink-2)',
    }
    return (
        <div style={{
            display: 'flex', alignItems: 'center', height: 32, flexShrink: 0,
            borderTop: '1px solid var(--line)',
            background: 'linear-gradient(180deg, var(--s1), var(--bg))',
            fontFamily: 'var(--mono)', fontSize: 10,
            letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
            <div style={{ ...cell, color: connected ? 'var(--good)' : 'var(--crit)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                {connected ? 'Live' : 'Offline'}
            </div>
            <div style={cell}><span style={{ color: 'var(--ink-3)' }}>Doc</span> {activeDocTitle}</div>
            <div style={cell}>{words.toLocaleString()} words</div>
            <div style={cell}>{sections} sections</div>
            <div style={{ ...cell, color: 'var(--ink-3)' }}>
                {savedAt ? `Saved ${savedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })}` : 'Not saved'}
            </div>
            <div style={{ flexGrow: 1 }} />
            <div style={{ ...cell, borderRight: 'none', borderLeft: '1px solid var(--line)' }}>
                {editorCount} editing
            </div>
            <div style={{ ...cell, borderRight: 'none', borderLeft: '1px solid var(--line)', color: 'var(--ink-3)' }}>
                {department}
            </div>
        </div>
    )
}
```

- [ ] **Step 4: Mount the shell around the existing page**

In `page.tsx`, wrap the current content in `<EditorShell>` with the new `Header` and `StatusBar`, passing `className="command"` on the shell root so the tokens resolve, and `style={{ ['--acc' as string]: themeColor, ['--acc-rgb' as string]: rgbTriplet(themeColor) }}`.

**Leave all five existing panels rendering, unchanged, inside the Brief tab's scroll area.** They are removed one at a time in Tasks 8–12. The page must work at the end of this task.

- [ ] **Step 5: Typecheck, lint, and load the page**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`
Expected: clean. Then load `/operations/<id>/edit` in dev: header, status bar and the old panels all present; editing and saving still work.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/operations/[id]/edit/"
git commit -m "feat(operations): add the editor shell, header and status bar

Tabs are client state with the URL mirrored via replaceState — routing them
would reload the document and tear down the Hocuspocus socket (spec §7).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Deck container and countdown strip

**Files:**
- Create: `apps/web/app/operations/[id]/edit/deck/MissionDeck.tsx`
- Create: `apps/web/app/operations/[id]/edit/deck/CountdownStrip.tsx`
- Create: `apps/web/app/operations/[id]/edit/deck/Panel.tsx`

**Interfaces:**
- Consumes: `useOperationStatus` (Task 6).
- Produces:
  - `<Panel title tag>{children}</Panel>` — the 36px-accent-tick panel used by every deck card and by later tasks.
  - `<CountdownStrip daysUntil checksDone checksTotal />`
  - `<MissionDeck operationId isHQ collapsed onToggleCollapsed>{cards}</MissionDeck>`

- [ ] **Step 1: Write the shared panel primitive**

```tsx
interface PanelProps {
    title: string
    tag?: string
    children: React.ReactNode
}

/** The milpac panel: hairline box, 36px accent tick on the top-left corner. */
export default function Panel({ title, tag, children }: PanelProps) {
    return (
        <div style={{
            position: 'relative',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r)',
            background: 'linear-gradient(180deg, var(--s1) 0%, var(--bg) 100%)',
        }}>
            <div style={{
                position: 'absolute', top: 0, left: 0,
                width: 36, height: 2, background: 'var(--acc)', opacity: 0.75,
            }} />
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 18px', borderBottom: '1px solid var(--line)',
            }}>
                <span style={{
                    fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
                    fontWeight: 700, color: 'var(--ink)',
                }}>{title}</span>
                {tag && (
                    <span style={{
                        marginLeft: 'auto', fontFamily: 'var(--mono)',
                        fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: '0.12em',
                    }}>{tag}</span>
                )}
            </div>
            <div>{children}</div>
        </div>
    )
}
```

- [ ] **Step 2: Write the countdown strip**

```tsx
interface StripProps {
    daysUntil: number | null
    checksDone: number
    checksTotal: number
}

function Cell({ value, unit, label, tone }: {
    value: string; unit?: string; label: string; tone: string
}) {
    return (
        <div style={{ padding: '16px 18px', borderRight: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 600, lineHeight: 1.1, color: tone }}>
                {value}
                {unit && <small style={{ fontSize: '0.5em', color: 'var(--ink-3)', marginLeft: 3, letterSpacing: '0.1em' }}>{unit}</small>}
            </div>
            <div style={{ marginTop: 5, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 600 }}>
                {label}
            </div>
        </div>
    )
}

export default function CountdownStrip({ daysUntil, checksDone, checksTotal }: StripProps) {
    const allDone = checksTotal > 0 && checksDone === checksTotal
    return (
        <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
            borderBottom: '1px solid var(--line)',
            background: 'linear-gradient(180deg, var(--s1), var(--bg))',
            flexShrink: 0,
        }}>
            <Cell
                value={daysUntil === null ? '—' : String(daysUntil)}
                unit={daysUntil === null ? undefined : 'DAYS'}
                label="Until Op"
                tone="var(--acc)"
            />
            <Cell
                value={String(checksDone)}
                unit={`/${checksTotal}`}
                label="Dev Checks"
                tone={allDone ? 'var(--good)' : 'var(--warn)'}
            />
        </div>
    )
}
```

- [ ] **Step 3: Write the deck container**

```tsx
'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'asot.opsdeck.collapsed'

export default function MissionDeck({ strip, children }: {
    strip: React.ReactNode
    children: React.ReactNode
}) {
    const [collapsed, setCollapsed] = useState(false)

    useEffect(() => {
        setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1')
    }, [])

    function toggle() {
        setCollapsed(c => {
            window.localStorage.setItem(STORAGE_KEY, c ? '0' : '1')
            return !c
        })
    }

    if (collapsed) {
        return (
            <aside style={{ width: 44, flexShrink: 0, borderLeft: '1px solid var(--line)', background: 'var(--bg)' }}>
                <button
                    type="button" onClick={toggle} aria-label="Expand mission deck"
                    style={{ width: 44, height: 44, background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer' }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </button>
            </aside>
        )
    }

    return (
        <aside style={{
            width: 340, flexShrink: 0,
            borderLeft: '1px solid var(--line)',
            background: 'var(--bg)',
            display: 'flex', flexDirection: 'column',
            overflowY: 'auto',
        }}>
            {strip}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
                {children}
            </div>
        </aside>
    )
}
```

- [ ] **Step 4: Mount the deck in the shell with only the countdown strip**

The deck appears; the old panels remain below the editor. Page still works.

- [ ] **Step 5: Typecheck, lint, load**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`
Expected: clean, and the deck renders with a live countdown.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/operations/[id]/edit/deck/"
git commit -m "feat(operations): add the mission deck and its countdown strip

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Schedule card — the timeline

**Files:**
- Create: `apps/web/app/operations/[id]/edit/deck/ScheduleCard.tsx`
- Modify: `apps/web/app/operations/[id]/edit/page.tsx` — delete the Schedule & Automation panel

**Interfaces:**
- Consumes: `TimelineMoment` and `buildTimeline` (Task 2), `Panel` (Task 8).
- Produces: `<ScheduleCard timeline onChangeDate onChangeRsvpMode onChangeCloseOffset />`.

- [ ] **Step 1: Render the timeline**

Rows stack their label, detail and control rather than laying them across — the
deck is 340px wide, which is not enough for a three-column row (spec §4).

```tsx
'use client'

import Panel from './Panel'
import type { TimelineMoment } from '@/lib/operations/schedule'

interface Props {
    timeline: TimelineMoment[]
    onChangeDate: () => void
    onChangeRsvpMode: () => void
    onChangeCloseOffset: (mins: number) => void
}

const CLOSE_OFFSETS = [30, 60, 90, 120, 180]

export default function ScheduleCard({
    timeline, onChangeDate, onChangeRsvpMode, onChangeCloseOffset,
}: Props) {
    return (
        <Panel title="Timeline">
            <div style={{ padding: '20px 16px 16px' }}>
                <div style={{ position: 'relative', paddingLeft: 24 }}>
                    <div style={{
                        position: 'absolute', left: 4, top: 8, bottom: 8,
                        width: 1, background: 'var(--line-2)',
                    }} />

                    {timeline.map((m, i) => (
                        <div key={m.id} style={{ position: 'relative', paddingBottom: i === timeline.length - 1 ? 0 : 20 }}>
                            <div style={{
                                position: 'absolute', left: -24, top: 4,
                                width: 9, height: 9, borderRadius: '50%',
                                background: 'var(--bg)',
                                border: `2px solid ${m.state === 'current' ? 'var(--acc)' : 'var(--line-2)'}`,
                                boxShadow: m.state === 'current' ? '0 0 0 4px rgba(var(--acc-rgb), 0.12)' : undefined,
                            }} />

                            <div style={{
                                fontSize: 13.5, fontWeight: 600,
                                color: m.state === 'pending' ? 'var(--ink-2)' : 'var(--ink)',
                            }}>
                                {m.label}
                            </div>

                            <div style={{
                                fontFamily: 'var(--mono)', fontSize: 12,
                                color: m.state === 'current' ? 'var(--acc)' : 'var(--ink-3)',
                                marginTop: 3,
                            }}>
                                {m.detail}
                            </div>

                            {m.id === 'rsvp_opens' && (
                                <button type="button" onClick={onChangeRsvpMode} style={controlStyle}>
                                    {m.at ? 'Switch to manual' : 'Schedule it'}
                                </button>
                            )}

                            {m.id === 'rsvp_closes' && (
                                <select
                                    onChange={e => onChangeCloseOffset(Number(e.target.value))}
                                    style={{ ...controlStyle, appearance: 'none' }}
                                >
                                    {CLOSE_OFFSETS.map(o => (
                                        <option key={o} value={o}>{o} min before</option>
                                    ))}
                                </select>
                            )}

                            {m.id === 'op_starts' && (
                                <button type="button" onClick={onChangeDate} style={controlStyle}>
                                    Change date
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </Panel>
    )
}

const controlStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    marginTop: 8,
    border: '1px solid var(--line-2)', background: 'var(--s2)',
    borderRadius: 'var(--r)', padding: '6px 11px',
    fontFamily: 'var(--mono)', fontSize: 9.5,
    letterSpacing: '0.14em', textTransform: 'uppercase',
    color: 'var(--ink-2)', cursor: 'pointer',
}
```

`confirmations_open` and `completed` are derived from the stage and carry no
control — do not add one.

- [ ] **Step 2: Delete the old Schedule & Automation panel**

Remove the panel block from `page.tsx` **and** its now-unused state: `scheduleOpen`, `draftRsvpCloseOffsetMins`, `draftRsvpCloseMode`, and the schedule half of `scheduleSave`. Keep the save endpoint calls — they move into the card's handlers.

- [ ] **Step 3: Typecheck, lint, and verify the round trip**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`
Expected: clean. Then in dev: change the operation date in the deck, reload, and confirm it persisted; confirm the timeline's computed RSVP close time moved with it.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/operations/[id]/edit/"
git commit -m "feat(operations): replace Schedule & Automation with the deck timeline

The panel stated each moment twice — a form on the left, a status column
restating it as a countdown on the right. One timeline says it once.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Stage card

**Files:**
- Create: `apps/web/app/operations/[id]/edit/deck/StageCard.tsx`

**Interfaces:**
- Consumes: `stageLabel`, `stageProgress`, `nextStage`, `STAGE_ORDER` (Task 3), `Panel` (Task 8).
- Produces: `<StageCard stage onAdvance advancing />`.

- [ ] **Step 1: Render the bar and the control**

```tsx
'use client'

import Panel from './Panel'
import { STAGE_ORDER, stageLabel, stageProgress, nextStage } from '@/lib/operations/stage'
import type { AttendanceStage } from '@/lib/operations/schedule'

interface Props {
    stage: AttendanceStage | null
    onAdvance: (to: AttendanceStage) => void
    advancing: boolean
}

export default function StageCard({ stage, onAdvance, advancing }: Props) {
    const filled = stageProgress(stage)
    const next = nextStage(stage)

    return (
        <Panel title="Stage" tag={`${filled} of ${STAGE_ORDER.length}`}>
            <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                    {STAGE_ORDER.map((s, i) => (
                        <span key={s} style={{
                            flex: '1 1 0', height: 3, borderRadius: 2,
                            background: i < filled ? 'var(--acc)' : 'var(--line)',
                        }} />
                    ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{
                        fontFamily: 'var(--mono)', fontSize: 12,
                        letterSpacing: '0.14em', textTransform: 'uppercase',
                        color: 'var(--acc)',
                    }}>
                        {stageLabel(stage)}
                    </span>

                    <button
                        type="button"
                        disabled={!next || advancing}
                        onClick={() => next && onAdvance(next)}
                        style={{
                            border: '1px solid var(--line-2)', background: 'var(--s2)',
                            borderRadius: 'var(--r)', padding: '6px 11px',
                            fontFamily: 'var(--mono)', fontSize: 9.5,
                            letterSpacing: '0.14em', textTransform: 'uppercase',
                            color: next ? 'var(--ink-2)' : 'var(--ink-3)',
                            cursor: next ? 'pointer' : 'default',
                            opacity: next ? 1 : 0.5,
                        }}
                    >
                        {advancing ? 'Advancing…' : next ? `Advance to ${stageLabel(next)}` : 'Complete'}
                    </button>
                </div>
            </div>
        </Panel>
    )
}
```

- [ ] **Step 2: Wire Advance to the existing endpoint**

`POST /api/operations/${operationId}/attendance` with the new stage, then call `refresh()` from `useOperationStatus` so the deck and timeline both update. Do not add a new endpoint.

- [ ] **Step 3: Typecheck, lint, verify**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`
Expected: clean. In dev, advance a test operation one stage and confirm both the bar and the timeline's `current` marker move.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/operations/[id]/edit/deck/StageCard.tsx"
git commit -m "feat(operations): add the stage card, replacing the six-step stepper

The cron drives these transitions; the manual control is an override, so it
is one button rather than a labelled stepper.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Attendance and details cards

**Files:**
- Create: `apps/web/app/operations/[id]/edit/deck/AttendanceCard.tsx`
- Create: `apps/web/app/operations/[id]/edit/deck/DetailsCard.tsx`
- Modify: `apps/web/app/operations/[id]/edit/page.tsx` — delete the Operation Details panel

**Interfaces:**
- Consumes: `Panel` (Task 8).
- Produces: `<AttendanceCard platoons selected onToggle pingEnabled onTogglePing />`, `<DetailsCard owner department billetPoints themeColor mapWorld onChange />`.

- [ ] **Step 1: Write the attendance card**

Platoon chips in the milpac `chip` idiom, selected chips bordered `rgba(var(--acc-rgb), 0.42)` with an `var(--acc)` dot. A `+ Custom unit` chip opens the existing custom-units editor inline. Then one labelled toggle row for the Discord ping.

**Gate on `isHQ` by not rendering the card at all** — not by disabling it (spec §1).

- [ ] **Step 2: Write the details card**

`rw`/`rwK`/`rwV` rows: owner (with the existing picker), department, billet points, theme colour, map world. Reuse the existing `MapWorldPicker` from `page.tsx` by extracting it to its own file rather than duplicating it.

- [ ] **Step 3: Delete the Operation Details panel from `page.tsx`**

- [ ] **Step 4: Typecheck, lint, verify**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`
Expected: clean. In dev, confirm as a non-HQ user that the attendance card is absent from the DOM, and that title/department/theme edits still save.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/operations/[id]/edit/"
git commit -m "feat(operations): move details and attendance into the deck

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Tabs

**Files:**
- Create: `apps/web/app/operations/[id]/edit/tabs/BriefTab.tsx`
- Create: `apps/web/app/operations/[id]/edit/tabs/MapTab.tsx`
- Create: `apps/web/app/operations/[id]/edit/tabs/DevelopmentTab.tsx`
- Create: `apps/web/app/operations/[id]/edit/tabs/AttendanceTab.tsx`
- Modify: `apps/web/app/operations/[id]/edit/page.tsx` — delete the Mission Development and Custom Units panels

**Interfaces:**
- Consumes: `useEditorTab` (Task 7); `CollabEditor` (`documentId`, `themeColor`, `initialContent`, `metaHandleRef`, `onSaveStatusChange`, `allowedTypes`); `MapSection` (`operationId`, `canEdit`, `world`); `PageSidebar` (`ydoc`, `activePage`, `onSelectPage`, `themeColor`, `orientation`, `synced`, `allowedTypes`).
- Produces: the four tab panels.

- [ ] **Step 1: Split the four panels out**

`BriefTab` holds the documents rail and `CollabEditor`. `MapTab` renders `MapSection` with `canEdit={isHQ}`. `DevelopmentTab` takes the Mission Development gate timeline and its completion modal from `page.tsx` verbatim. `AttendanceTab` takes who-attends, notifications and acknowledgements.

- [ ] **Step 2: Keep Brief and Map mounted once visited**

Render visited tabs with `display: none` rather than unmounting, so the Hocuspocus connection and the map's Y.js state survive a tab switch (spec §7). Development and Attendance may unmount freely — they hold no socket.

- [ ] **Step 3: Delete the Mission Development and Custom Attendance Units panels from `page.tsx`**

- [ ] **Step 4: Typecheck, lint, verify**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`
Expected: clean. In dev: type in the editor, switch to Map and back, confirm the text is still there and the presence indicator never dropped. Confirm `?tab=map` deep-links, and that a non-HQ user has no Attendance tab in the DOM.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/operations/[id]/edit/"
git commit -m "feat(operations): split the editor into Brief, Map, Development and Attendance tabs

Brief and Map stay mounted once visited so the collab socket survives a
switch.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Responsive behaviour and cleanup

**Files:**
- Modify: `apps/web/app/operations/[id]/edit/shell.module.css`
- Modify: `apps/web/app/operations/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: a `page.tsx` under ~200 lines.

- [ ] **Step 1: Implement the four breakpoints from spec §8**

≥1600px both rails open; 1280–1599px documents rail collapses to 44px icons; 1024–1279px deck collapses to a 44px rail expanding as an overlay; <1024px both become overlay drawers and the tab strip scrolls horizontally. The status bar drops cells from the left as width falls, keeping sync state and save time longest.

- [ ] **Step 2: Delete the dead code**

From `page.tsx`: the five panel blocks (now empty), every `[−]`/`[+]` toggle, the `VIEW →` and `MAP ↗` header links, the local `hexToRgb`, and the `sideBorders`/`bottomBorder`/`sectionToggleStyle` helpers added by commit `1032f5c2` — the elements they styled are gone. Move Delete Mission into the header overflow menu.

- [ ] **Step 3: Confirm the file shrank**

Run: `cd apps/web && wc -l "app/operations/[id]/edit/page.tsx"`
Expected: under 200 lines (from 2,464).

- [ ] **Step 4: Full check**

Run: `cd apps/web && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all clean, all unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/operations/[id]/edit/"
git commit -m "feat(operations): add shell breakpoints and delete the old panel code

page.tsx goes from 2,464 lines to under 200.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Playwright specs (written, not run)

**Files:**
- Create: `apps/web/tests/operations-editor.spec.ts`

**Interfaces:**
- Consumes: `tests/fixtures/asot.ts`, `tests/constants.ts` — follow the existing suite's fixture pattern.

- [ ] **Step 1: Write the specs**

Cover: switching Brief → Map → Brief preserves typed content and the connection indicator stays `Live`; the deck collapse state survives a reload; editing the operation date in the timeline persists; a non-HQ user sees no Attendance tab.

- [ ] **Step 2: Typecheck only**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

**Do not run `npm run test:e2e`.** Running Playwright is Koda's call — ask first.

**Known deviation from spec §11.** The spec asks for component-level tests
asserting the permission gates (Attendance absent, not disabled, for a non-HQ
user; Publish only for HQ on an `In Development` operation). This plan covers
those with Playwright specs and a manual dev check instead, because
`vitest.config.ts` runs in the `node` environment and includes only
`lib/**/*.test.ts` — a deliberate choice, documented in that file, that keeps
the two runners from picking up each other's files. Real component tests would
need a second vitest project plus `jsdom` and `@testing-library/react` as new
devDependencies. That is a dependency decision for Koda, not one to make
silently inside this plan. If wanted, it becomes Task 15 and the permission
assertions move there.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/operations-editor.spec.ts
git commit -m "test(operations): add editor shell e2e specs

Not run here — Playwright execution is Koda's call.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
