# Operations Schedule Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the operations editor's Development tab and the mission deck's Stage and Timeline cards into one lifecycle tab named Schedule, rebuilt as a control panel.

**Architecture:** Three panels in one tab, ordered by time horizon (Pre-Production → RSVP Window → Stage). All state stays lifted in `page.tsx` exactly as it is today; every handler is reused verbatim. This is a presentation change — no API route, no persisted shape, and no permission gate is altered.

**Tech Stack:** Next.js 15 App Router, React 19 client components, inline `CSSProperties` styles against the editor's CSS custom-property palette (`--acc`, `--ink`, `--line`, `--good`, `--warn`, `--s1`–`--s3`), MUI X date pickers, Playwright for E2E.

**Spec:** `apps/web/docs/superpowers/specs/2026-08-27-operations-schedule-tab-design.md`

## Global Constraints

- All paths below are relative to `apps/web/`.
- Work on branch `fix/operations-editor`. Never commit to `main` — a push to `main` deploys immediately with no CI gate (root `CLAUDE.md`).
- **Never run `npm run build` while a dev server is running** — `next build` and `next dev` share `.next/` and corrupt it in both directions (`apps/web/CLAUDE.md`). A dev server is currently running on port 3001.
- The fast checks are `npx tsc --noEmit` and `npx next lint --file <path>`. Use those, not a full build.
- **Do not run `npm run test:e2e` without asking the user first** (`apps/web/CLAUDE.md`) — it spawns its own `next dev` server, and editing files mid-run causes spurious failures.
- No new unit tests. These are presentational panels whose logic is moved verbatim or is layout. Do not invent a test harness for them.
- Gating convention: gate by not rendering at all, never by disabling.
- `isHQ` is **not** a real access boundary here — it is fetched with the same permission key as the layout gate, so it is true for every user who reaches the editor. Keep the `isHQ &&` guards verbatim; do not "fix" or remove them.
- Update `docs/map/g-public-pages.md` as part of the change, not afterwards (`apps/web/CLAUDE.md`).

## File Structure

| File | Responsibility |
|---|---|
| `app/operations/[id]/edit/tabs/TabPanel.tsx` | **New.** Shared tab-panel chrome — hairline box, accent tick, header with title / badge slot / right-aligned horizon caption. Replaces three copy-pasted style objects. |
| `app/operations/[id]/edit/tabs/schedule/ScheduleTab.tsx` | **New.** Composes the three panels, owns `isHQ` gating and the no-date empty-state decision. |
| `app/operations/[id]/edit/tabs/schedule/PreProductionPanel.tsx` | **New.** Dev-check node strip, legend, Orders Check row, and both modals. From `DevelopmentTab.tsx`. |
| `app/operations/[id]/edit/tabs/schedule/RsvpWindowPanel.tsx` | **New.** RSVP open/close controls, two-column. From `deck/ScheduleCard.tsx`. |
| `app/operations/[id]/edit/tabs/schedule/StagePanel.tsx` | **New.** Six-segment stage bar with restored visible labels, plus Advance. From `deck/StageCard.tsx`. |
| `app/operations/[id]/edit/EditorShell.tsx` | Modified. `EditorTab` union, `TABS`, `TAB_LABELS`, `schedule` prop, legacy `?tab=development` alias. |
| `app/operations/[id]/edit/page.tsx` | Modified. Deck composition drops two cards; tab prop rewired; one new `ConfirmDialog` target state. |
| `app/operations/[id]/edit/tabs/AttendanceTab.tsx` | Modified. Adopts `TabPanel`. |
| `app/operations/[id]/edit/tabs/DevelopmentTab.tsx` | **Deleted** (split into the four files above). |
| `app/operations/[id]/edit/deck/ScheduleCard.tsx` | **Deleted.** |
| `app/operations/[id]/edit/deck/StageCard.tsx` | **Deleted.** |
| `tests/operations-editor.spec.ts` | Modified. One spec for the legacy deep-link alias. |
| `docs/map/g-public-pages.md` | Modified. Tab names and deck contents. |

`deck/Panel.tsx` stays — `DetailsCard` still uses it.

---

### Task 1: Shared tab panel chrome

Extracts the panel chrome duplicated verbatim in `AttendanceTab.tsx` and `DevelopmentTab.tsx` before a third and fourth copy appear. No visual change.

**Files:**
- Create: `app/operations/[id]/edit/tabs/TabPanel.tsx`
- Modify: `app/operations/[id]/edit/tabs/AttendanceTab.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `TabPanel`, default export. Props: `{ title: string; horizon?: string; badge?: ReactNode; children: ReactNode }`. Renders its own header; children receive **no** padding and must supply their own (every current panel body uses `padding: 16`).

- [ ] **Step 1: Create the shared panel**

```tsx
import type { ReactNode } from 'react'

interface TabPanelProps {
    title: string
    /** Right-aligned mono caption: the panel's time horizon ("16w → 4w out")
     * or a count ("3 of 5 complete"). */
    horizon?: string
    /** Inline header content between title and horizon — status badges,
     * "Saving…" indicators. */
    badge?: ReactNode
    children: ReactNode
}

/**
 * The editor's tab-panel chrome: hairline box, 36px accent tick on the
 * top-left corner, header rule. Same shape as the deck's `Panel` (which stays
 * for DetailsCard), but with a `badge` slot the deck never needed and no
 * padding on the body — tab panels lay out their own interiors.
 */
export default function TabPanel({ title, horizon, badge, children }: TabPanelProps) {
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
                {badge}
                {horizon && (
                    <span style={{
                        marginLeft: 'auto', fontFamily: 'var(--mono)',
                        fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: '0.12em',
                    }}>{horizon}</span>
                )}
            </div>
            <div>{children}</div>
        </div>
    )
}
```

- [ ] **Step 2: Adopt it in AttendanceTab**

In `tabs/AttendanceTab.tsx`, delete the `panelStyle`, `tickStyle` and `panelHeaderStyle` consts and add `import TabPanel from './TabPanel'`. Replace each of the three panel blocks, which currently read:

```tsx
<div style={panelStyle}>
    <div style={tickStyle} />
    <div style={panelHeaderStyle}>Assigned Units</div>
    <div style={{ padding: 16 }}>
```

with:

```tsx
<TabPanel title='Assigned Units'>
    <div style={{ padding: 16 }}>
```

and close with `</TabPanel>` instead of the outer `</div>`. Do the same for `Notifications` and `Acknowledgements`. Keep `labelStyle`, `chipStyle` and `dotStyle` — they are body styles, not chrome.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx next lint --file "app/operations/[id]/edit/tabs/AttendanceTab.tsx" --file "app/operations/[id]/edit/tabs/TabPanel.tsx"
```
Expected: both clean. Then open `http://localhost:3001/operations/<id>/edit?tab=attendance` and confirm the three panels look **identical** to before — same tick, same header rule, same spacing. This task is a pure refactor; any visual difference is a bug.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/operations/[id]/edit/tabs/TabPanel.tsx" "apps/web/app/operations/[id]/edit/tabs/AttendanceTab.tsx"
git commit -m "refactor(ops-editor): extract shared TabPanel chrome"
```

---

### Task 2: Rename the tab to Schedule

Renames the tab everywhere it is named, while its content is still `DevelopmentTab`. Splitting the rename from the rebuild keeps both reviewable — after this task the app works and the tab reads SCHEDULE.

**Files:**
- Modify: `app/operations/[id]/edit/EditorShell.tsx`
- Modify: `app/operations/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `EditorTab` union member `'schedule'` (replacing `'development'`); `EditorShell` prop `schedule: ReactNode` (replacing `development`). Task 3 renders `ScheduleTab` into this prop.

- [ ] **Step 1: Rename in EditorShell**

In `EditorShell.tsx`, change the union, the tab list and the labels:

```ts
export type EditorTab = 'brief' | 'map' | 'schedule' | 'attendance'

export const TABS: readonly EditorTab[] = ['brief', 'map', 'schedule', 'attendance']

export const TAB_LABELS: Record<EditorTab, string> = {
    brief: 'Brief',
    map: 'Map',
    schedule: 'Schedule',
    attendance: 'Attendance',
}
```

`Header.tsx` renders the links from these two constants (`Header.tsx:101`, `:155`) and needs no edit.

- [ ] **Step 2: Add the legacy deep-link alias**

Still in `EditorShell.tsx`, replace `tabFromLocation`:

```ts
/** Tab values that used to be valid and still appear in saved links.
 * Without this an old `?tab=development` bookmark silently resolves to
 * `brief`, since an unrecognised value already falls back there. */
const LEGACY_TAB_ALIASES: Record<string, EditorTab> = { development: 'schedule' }

function tabFromLocation(): EditorTab {
    if (typeof window === 'undefined') return 'brief'
    const t = new URLSearchParams(window.location.search).get('tab') ?? ''
    if (t in LEGACY_TAB_ALIASES) return LEGACY_TAB_ALIASES[t]
    return (TABS as readonly string[]).includes(t) ? (t as EditorTab) : 'brief'
}
```

- [ ] **Step 3: Rename the prop**

In `EditorShell.tsx`, rename the `development` prop to `schedule` in `EditorShellProps`, in the destructured parameter list, and in the content-routing line, which becomes:

```tsx
{active === 'schedule' && schedule}
```

Update the prop's doc comment to say "Operation lifecycle: development gates, RSVP window, stage. Holds no socket — free to mount/unmount with the tab switch."

In `page.tsx`, rename the `development={...}` prop passed to `EditorShell` to `schedule={...}`. Leave its `<DevelopmentTab ... />` contents alone for now.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npx next lint --file "app/operations/[id]/edit/EditorShell.tsx" --file "app/operations/[id]/edit/page.tsx"
```
Expected: both clean. Then check in the browser: the tab bar reads `BRIEF MAP SCHEDULE ATTENDANCE`; `?tab=schedule` selects it; and `?tab=development` **also** selects it rather than falling back to Brief.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/operations/[id]/edit/EditorShell.tsx" "apps/web/app/operations/[id]/edit/page.tsx"
git commit -m "refactor(ops-editor): rename the development tab to schedule"
```

---

### Task 3: Pre-Production panel

Splits `DevelopmentTab.tsx` into a tab shell plus a panel, and applies the four fixes the spec calls for: no collapsible wrapper, state in the header, Orders Check folded in, and `ConfirmDialog` instead of native `confirm()`.

**Files:**
- Create: `app/operations/[id]/edit/tabs/schedule/ScheduleTab.tsx`
- Create: `app/operations/[id]/edit/tabs/schedule/PreProductionPanel.tsx`
- Delete: `app/operations/[id]/edit/tabs/DevelopmentTab.tsx`
- Modify: `app/operations/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `TabPanel` from Task 1; the `schedule` prop slot from Task 2.
- Produces:
  - `ScheduleTab`, default export. Props are the union of what the three panels need; at this task it takes `{ opID, isHQ, isJ2Lead, title, date, isCampaignOp, campaignStartDate, missionDev, setMissionDev, ordersCheckTask, setOrdersCheckTask }`. Tasks 4 and 5 add to this list.
  - `PreProductionPanel`, default export, taking the same minus `isHQ`.

- [ ] **Step 1: Note the confirmation approach**

`DevelopmentTab.tsx:212` calls the native `confirm()`. Replace it with the editor's own dialog, held as **local state inside `PreProductionPanel`** — not lifted to `page.tsx` like `stageCardConfirmTarget`.

The reason to differ from the stage pattern: `stageCardConfirmTarget` had to be lifted because the mutation it guards (`commitStageChange`) lives in `page.tsx`. Here the mutation (`removeCompletion`) lives in the panel, so lifting the dialog would mean threading a callback ref back down for no gain. `ConfirmDialog` is `position: fixed` at `zIndex: 9999`, so it renders correctly from anywhere in the tree.

The import is the same one `page.tsx:5` uses:

```tsx
import ConfirmDialog from '@/components/confirm-dialog'
```

Its props are `{ open, title, message?, confirmLabel?, danger?, onConfirm, onCancel }`.

- [ ] **Step 2: Create PreProductionPanel**

Copy `DevelopmentTab.tsx` to `tabs/schedule/PreProductionPanel.tsx`, then:

1. Delete the `open`/`setOpen` state (`:83`) and the collapsible `<button>` header (`:173-193`), along with the `{open && (` wrapper and its closing paren (`:195`).
2. Wrap the body in `TabPanel`, moving the header's status content into the `badge` slot and the count into `horizon`:

```tsx
<TabPanel
    title='Pre-Production'
    horizon={`${checks.filter(c => c.isCompleted).length} of ${checks.length} complete`}
    badge={<>
        {allDone && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--good)', letterSpacing: '0.1em' }}>✓ All Checks Complete</span>}
        {!allDone && checks.some(ch => ch.isOverdue) && (
            <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--warn)', border: '1px solid var(--warn)', borderRadius: 'var(--r)', padding: '2px 8px' }}>
                {checks.filter(ch => ch.isOverdue).length} Overdue
            </span>
        )}
        {saving && <span style={{ fontSize: '0.6rem', color: 'var(--acc)', fontWeight: 700 }}>Saving…</span>}
    </>}
>
    <div style={{ padding: '20px 16px 16px' }}>
```

3. Replace the native confirm at `:212`. The node's `onClick` becomes:

```tsx
onClick={() => {
    if (!isJ2Lead) return
    if (ch.isCompleted) {
        setUncompleteCheckId(ch.id)
    } else {
        setCompletingCheckId(ch.id)
        setReviewerName('')
        setComments('')
        setOutcome('')
    }
}}
```

declaring the state alongside the panel's other local state:

```tsx
const [uncompleteCheckId, setUncompleteCheckId] = useState<string | null>(null)
```

and add the dialog next to the two existing modals at the end of the component:

```tsx
<ConfirmDialog
    open={uncompleteCheckId !== null}
    title='Remove Completion'
    message={`Remove the completion record for the ${uncompleteCheckId?.replace('w', '')}W development check? The reviewer, comments and outcome will be discarded.`}
    confirmLabel='Remove'
    danger
    onConfirm={() => { const id = uncompleteCheckId!; setUncompleteCheckId(null); removeCompletion(id) }}
    onCancel={() => setUncompleteCheckId(null)}
/>
```

Import it with the same specifier `page.tsx` uses.

4. Keep the Orders Check block (`:284` onward) inside this same `TabPanel`, below the legend, separated by `borderTop: '1px solid var(--line)'` and `paddingTop: 14` — it becomes the panel's final row rather than a sibling block.
5. Replace the early return at `:103`. Compute `baseDate` as now, but instead of `if (!opID || !baseDate) return null`, render the empty state inside the panel:

```tsx
if (!baseDate) {
    return (
        <TabPanel title='Pre-Production' horizon='16w → 4w out'>
            <div style={{ padding: 16, fontSize: '0.72rem', color: 'var(--ink-3)', fontStyle: 'italic' }}>
                Set an operation date in Details to schedule development checks.
            </div>
        </TabPanel>
    )
}
```

Keep `if (!opID) return null` — no operation means nothing to render at all.

6. Set `horizon` on the populated panel to `isCampaignOp ? '16w → 4w out' : '12w → 4w out'`.

- [ ] **Step 3: Create ScheduleTab**

```tsx
'use client'

import type { Dayjs } from 'dayjs'
import PreProductionPanel from './PreProductionPanel'

interface Props {
    opID: string
    isHQ: boolean
    isJ2Lead: boolean
    title: string
    date: Dayjs | null
    isCampaignOp: boolean
    campaignStartDate: string | null
    missionDev: MissionDevelopment | null
    setMissionDev: React.Dispatch<React.SetStateAction<MissionDevelopment | null>>
    ordersCheckTask: OrdersCheckTask | null
    setOrdersCheckTask: React.Dispatch<React.SetStateAction<OrdersCheckTask | null>>
}

/**
 * The operation's lifecycle, read top to bottom as one countdown: development
 * gates weeks out, the RSVP window days and hours out, then the stage machine
 * on the day. Merged here from the old Development tab and the mission deck's
 * Timeline and Stage cards, which were three zoom levels on the same clock
 * split across two surfaces.
 *
 * `isHQ` gates the RSVP Window and Stage panels by not rendering them, exactly
 * as the deck cards were gated. Note it is true for every user who reaches
 * this editor (see the spec's Permissions section) — kept for continuity and
 * to suppress a flash before the permission fetch resolves.
 */
export default function ScheduleTab({
    opID, isHQ, isJ2Lead, title, date, isCampaignOp, campaignStartDate,
    missionDev, setMissionDev, ordersCheckTask, setOrdersCheckTask,
}: Props) {
    return (
        <div style={{ width: '100%', maxWidth: 1220, margin: '0 auto', padding: 'clamp(1.5rem, 2.5vw, 2.5rem)', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <PreProductionPanel
                opID={opID}
                isJ2Lead={isJ2Lead}
                title={title}
                date={date}
                isCampaignOp={isCampaignOp}
                campaignStartDate={campaignStartDate}
                missionDev={missionDev}
                setMissionDev={setMissionDev}
                ordersCheckTask={ordersCheckTask}
                setOrdersCheckTask={setOrdersCheckTask}
            />
            {/* Tasks 4 and 5 add RsvpWindowPanel and StagePanel here. */}
        </div>
    )
}
```

Move the `OrdersCheckTask` type from `DevelopmentTab.tsx` into `PreProductionPanel.tsx` and export it, then import it here.

The wrapper matches `AttendanceTab`'s outer div exactly (`maxWidth: 1220`, the same clamp padding, `gap: 20`) so the two tabs share one content rhythm.

- [ ] **Step 4: Wire it up and delete the old tab**

In `page.tsx`, replace the `<DevelopmentTab ... />` in the `schedule` prop with `<ScheduleTab ... />`, adding `isHQ={isHQ}` to the props it already passed. Update the import. Then:

```bash
rm "apps/web/app/operations/[id]/edit/tabs/DevelopmentTab.tsx"
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
npx next lint --file "app/operations/[id]/edit/tabs/schedule/ScheduleTab.tsx" --file "app/operations/[id]/edit/tabs/schedule/PreProductionPanel.tsx" --file "app/operations/[id]/edit/page.tsx"
grep -rn "DevelopmentTab" apps/web/app apps/web/tests apps/web/docs
```
Expected: tsc and lint clean; the grep returns nothing.

In the browser, on the Schedule tab: the check strip renders with no collapse toggle; the header shows `N of M complete` plus any Overdue badge; Orders Check sits inside the same panel below the legend; clicking a completed node opens the themed dialog, not a browser confirm; completing a check still opens its modal and saves. Then clear the operation's date in Details and confirm the panel shows the empty-state sentence instead of a blank tab.

- [ ] **Step 6: Commit**

```bash
git add -A "apps/web/app/operations/[id]/edit"
git commit -m "feat(ops-editor): rebuild development gates as the Pre-Production panel"
```

---

### Task 4: RSVP Window panel

Moves the deck's Timeline card into the tab and relays it two-column.

**Files:**
- Create: `app/operations/[id]/edit/tabs/schedule/RsvpWindowPanel.tsx`
- Delete: `app/operations/[id]/edit/deck/ScheduleCard.tsx`
- Modify: `app/operations/[id]/edit/tabs/schedule/ScheduleTab.tsx`
- Modify: `app/operations/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `TabPanel` (Task 1), `ScheduleTab` (Task 3).
- Produces: `RsvpWindowPanel`, default export, taking `ScheduleCard`'s existing prop interface unchanged: `{ timeline, date, onChangeDate, rsvpOpenAt, onSetRsvpOpenManual, onSetRsvpOpenScheduled, onChangeRsvpOpenAt, onQuickSetRsvpOpen, closeOffsetMins, onChangeCloseOffset, onChangeRsvpCloseAt, automationPaused }`. `ScheduleTab` gains all twelve as pass-through props.

- [ ] **Step 1: Move and re-chrome**

```bash
git mv "apps/web/app/operations/[id]/edit/deck/ScheduleCard.tsx" "apps/web/app/operations/[id]/edit/tabs/schedule/RsvpWindowPanel.tsx"
```

In the moved file: rename the component to `RsvpWindowPanel`, replace `import Panel from './Panel'` with `import TabPanel from '../TabPanel'`, and change the wrapper from `<Panel title="Timeline">` to:

```tsx
<TabPanel title='RSVP Window' horizon='days → hrs out'>
```

Keep every handler, preset list (`RSVP_OPEN_QUICKSETS`, the eight close offsets plus Custom) and picker exactly as-is.

- [ ] **Step 2: Two-column layout**

The card stacked its Opens and Closes rows because it had 340px. Wrap the two rows in a grid that collapses on narrow viewports:

```tsx
<div style={{
    padding: 16,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 20,
}}>
```

`auto-fit`/`minmax` needs no media query — the columns fall to one when the tab is narrower than ~600px, which matters because the tab content area shrinks when the Activity or Preview drawer opens (`contentPaddingRight` in `EditorShell`). Remove any `borderTop` divider that previously separated the two rows vertically; side by side it reads as a rule in the wrong place.

- [ ] **Step 2b: No-date empty state**

Both RSVP instants are computed relative to the operation date, so the controls are meaningless without one. The deck card never had to handle this — the whole Development tab returned `null` and the deck card simply rendered with unresolved times. Match `PreProductionPanel`'s empty state:

```tsx
if (!date) {
    return (
        <TabPanel title='RSVP Window' horizon='days → hrs out'>
            <div style={{ padding: 16, fontSize: '0.72rem', color: 'var(--ink-3)', fontStyle: 'italic' }}>
                Set an operation date in Details to schedule the RSVP window.
            </div>
        </TabPanel>
    )
}
```

Place it after the existing prop destructuring and before the main return.

- [ ] **Step 3: Render it and drop the deck card**

In `ScheduleTab.tsx`, add the twelve props to `Props`, and render below `PreProductionPanel`:

```tsx
{isHQ && (
    <RsvpWindowPanel
        timeline={timeline}
        date={date}
        onChangeDate={onChangeDate}
        rsvpOpenAt={rsvpOpenAt}
        onSetRsvpOpenManual={onSetRsvpOpenManual}
        onSetRsvpOpenScheduled={onSetRsvpOpenScheduled}
        onChangeRsvpOpenAt={onChangeRsvpOpenAt}
        onQuickSetRsvpOpen={onQuickSetRsvpOpen}
        closeOffsetMins={closeOffsetMins}
        onChangeCloseOffset={onChangeCloseOffset}
        onChangeRsvpCloseAt={onChangeRsvpCloseAt}
        automationPaused={automationPaused}
    />
)}
```

In `page.tsx`, delete the `{isHQ && opID && (<ScheduleCard ... />)}` block from the deck composition and its import, and pass those same twelve values to `ScheduleTab` instead — the handler names are unchanged, so this is a move of the prop block, not a rewrite. `automationPaused` stays `status === 'In Development'`.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npx next lint --file "app/operations/[id]/edit/tabs/schedule/RsvpWindowPanel.tsx" --file "app/operations/[id]/edit/tabs/schedule/ScheduleTab.tsx" --file "app/operations/[id]/edit/page.tsx"
grep -rn "ScheduleCard" apps/web/app apps/web/docs
```
Expected: clean; grep returns nothing.

In the browser: the deck no longer shows a Timeline card; the Schedule tab shows RSVP Window as two columns; switch Opens between Manual and Scheduled, set a close offset, reload, and confirm both persisted.

- [ ] **Step 5: Commit**

```bash
git add -A "apps/web/app/operations/[id]/edit"
git commit -m "feat(ops-editor): move the RSVP window from the deck into the schedule tab"
```

---

### Task 5: Stage panel

Moves the deck's Stage card into the tab and restores the visible stage labels the 340px rail could not fit.

**Files:**
- Create: `app/operations/[id]/edit/tabs/schedule/StagePanel.tsx`
- Delete: `app/operations/[id]/edit/deck/StageCard.tsx`
- Modify: `app/operations/[id]/edit/tabs/schedule/ScheduleTab.tsx`
- Modify: `app/operations/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `TabPanel` (Task 1), `ScheduleTab` (Task 3).
- Produces: `StagePanel`, default export, taking `StageCard`'s existing interface unchanged: `{ stage: AttendanceStage | null; onAdvance: (to: AttendanceStage) => void; onSelect: (to: AttendanceStage) => void; advancing: boolean }`. `ScheduleTab` gains all four as pass-through props.

- [ ] **Step 1: Move and re-chrome**

```bash
git mv "apps/web/app/operations/[id]/edit/deck/StageCard.tsx" "apps/web/app/operations/[id]/edit/tabs/schedule/StagePanel.tsx"
```

Rename the component to `StagePanel`, swap `import Panel from './Panel'` for `import TabPanel from '../TabPanel'`, and change the wrapper to:

```tsx
<TabPanel title='Stage' horizon='run day'>
```

The `tag={`${filled} of ${STAGE_ORDER.length}`}` the card passed becomes redundant — the labelled segments below now show position directly. Drop it. Keep the `STAGE_ORDER`, `stageIndex`, `stageLabel`, `stageProgress`, `nextStage` imports from `@/lib/operations/stage` and the `AttendanceStage` type import from `@/lib/operations/schedule`.

- [ ] **Step 2: Restore the segment labels**

Each segment is currently a bare 3px bar whose stage name exists only in `aria-label`. Add a visible label under each bar. Replace the `<span>` inside the segment button with:

```tsx
<>
    <span style={{
        display: 'block', height: 3, borderRadius: 2,
        background: isFilled
            ? (isHovered ? 'rgba(var(--acc-rgb), 0.7)' : 'var(--acc)')
            : (isHovered ? 'var(--line-2)' : 'var(--line)'),
    }} />
    <span style={{
        display: 'block', marginTop: 7,
        fontFamily: 'var(--mono)', fontSize: 8.5,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: isCurrent ? 'var(--acc)' : 'var(--ink-3)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>{stageLabel(s)}</span>
</>
```

Keep the `aria-label` on the button — the visible label is the stage name alone, while the aria-label states the action ("Set stage to X").

The current-stage name is now shown twice: once as the highlighted segment label and once in the mono `stageLabel(stage)` line below the bar. Delete that second one and let the Advance button take the full row, since the labelled segments make it redundant:

```tsx
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
```

- [ ] **Step 3: Render it and drop the deck card**

In `ScheduleTab.tsx`, add the four props and render last:

```tsx
{isHQ && (
    <StagePanel stage={stage} onAdvance={onAdvance} onSelect={onSelect} advancing={advancing} />
)}
```

In `page.tsx`, delete the `{isHQ && opID && (<StageCard ... />)}` deck block and its import, and pass `stage={displayStage}`, `onAdvance={requestStageChange}`, `onSelect={requestStageChange}`, `advancing={stageAdvancing}` to `ScheduleTab`. The existing `stageCardConfirmTarget` / `ConfirmDialog` path in `page.tsx` is untouched and keeps working — only the component rendering the controls moved.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npx next lint --file "app/operations/[id]/edit/tabs/schedule/StagePanel.tsx" --file "app/operations/[id]/edit/tabs/schedule/ScheduleTab.tsx" --file "app/operations/[id]/edit/page.tsx"
grep -rn "StageCard" apps/web/app apps/web/docs
```
Expected: clean. The grep will still match `stageCardConfirmTarget` and `STAGE_CARD_CONFIRM_MSGS` in `page.tsx` — those are state names, not the component, and are fine to leave. No `<StageCard` or import should remain.

In the browser: the deck shows only Countdown + Details; the Schedule tab's Stage panel shows six labelled segments with the current one accented; Advance opens the confirm dialog and moves the stage; clicking a non-current segment does the same.

- [ ] **Step 5: Commit**

```bash
git add -A "apps/web/app/operations/[id]/edit"
git commit -m "feat(ops-editor): move stage control into the schedule tab with visible labels"
```

---

### Task 6: Deep-link spec and documentation

Covers the one piece of genuinely new logic — the legacy tab alias — and brings the site map current.

**Files:**
- Modify: `tests/operations-editor.spec.ts`
- Modify: `docs/map/g-public-pages.md`

**Interfaces:**
- Consumes: the alias from Task 2; the finished tab from Tasks 3–5.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Add the deep-link spec**

Append to `tests/operations-editor.spec.ts`. It uses the file's existing `createOperation()` and `pageAs()` fixtures and the `editorTab()` helper at `:92`. The `j4` persona is used because `pageAs('j3')` is redirected off the editor entirely (see the existing describe block at `:212`).

```ts
// ── Legacy tab deep links still resolve ─────────────────────────────────────

test.describe('Schedule tab deep links', () => {
    test('a legacy ?tab=development link lands on Schedule, not Brief', async ({ pageAs }) => {
        // The tab was renamed development → schedule. An unrecognised ?tab=
        // value falls back to 'brief' (EditorShell.tsx tabFromLocation), so
        // without the alias every saved link would silently open the wrong
        // tab — a failure with no error message. This is that alias.
        const opId = await createOperation()
        const page = await pageAs('j4')
        await page.goto(`/operations/${opId}/edit?tab=development`)

        await expect(editorTab(page, 'SCHEDULE')).toHaveAttribute('aria-current', 'page', { timeout: 30_000 })
    })

    test('positive control: ?tab=schedule selects the same tab', async ({ pageAs }) => {
        const opId = await createOperation()
        const page = await pageAs('j4')
        await page.goto(`/operations/${opId}/edit?tab=schedule`)

        await expect(editorTab(page, 'SCHEDULE')).toHaveAttribute('aria-current', 'page', { timeout: 30_000 })
    })
})
```

`aria-current='page'` is what `Header.tsx:152` sets on the active tab button.

- [ ] **Step 2: Update the site map**

In `docs/map/g-public-pages.md`, the `app/operations/[id]/edit/page.tsx` entry has a paragraph added during the attendance work that names the tabs and deck cards. Replace it with:

```markdown
Composed via `edit/EditorShell.tsx` as four tabs (Brief / Map / Schedule / Attendance — the
last `isHQ`-only) plus a right-hand mission deck (`edit/deck/`: CountdownStrip, DetailsCard).
**All attendance controls live in the Attendance tab** (`edit/tabs/AttendanceTab.tsx`):
assigned units + custom units, the Discord ping toggle and its per-role targets, and the
acknowledgement summary. **The operation's lifecycle lives in the Schedule tab**
(`edit/tabs/schedule/`): `PreProductionPanel` (mission development gates + Orders Check),
`RsvpWindowPanel` (RSVP open/close), `StagePanel` (the six-step attendance stage machine).
A legacy `?tab=development` deep link resolves to Schedule.
```

Also correct the entry's opening line — it says "Very large (2400+ line) client operation-editor page", which predates the tab split; `page.tsx` is now roughly 1,050 lines. Change the parenthetical to "(~1,050 line)".

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```
Expected: clean (the spec file is typechecked with the app).

**Do not run the E2E suite here.** Ask the user first — it spawns its own `next dev` server and the one on port 3001 is theirs.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/operations-editor.spec.ts apps/web/docs/map/g-public-pages.md
git commit -m "test(ops-editor): cover the legacy schedule deep link; refresh the site map"
```

---

## Verification checklist

After Task 6, before opening a PR:

- [ ] `npx tsc --noEmit` clean
- [ ] `npx next lint` clean for every touched file
- [ ] `grep -rn "DevelopmentTab\|ScheduleCard\|<StageCard" apps/web/app apps/web/tests apps/web/docs` returns nothing
- [ ] Deck shows Countdown + Details only
- [ ] Schedule tab shows three panels in horizon order
- [ ] An operation with no date shows empty states, not a blank tab
- [ ] `?tab=development` and `?tab=schedule` both select Schedule
- [ ] Ask the user before running `npm run test:e2e`

---

## Corrections applied during execution

Two defects surfaced while carrying this plan out. Both are left here rather than edited into the
body above, so the plan still reads as what was actually planned.

**Task 3, Step 2 — `horizon` vs. `badge` contradiction.** The JSX snippet at Step 2 set `horizon` to
the completion count (`` `${checks.filter(c => c.isCompleted).length} of ${checks.length} complete` ``),
while point 6 of the same step said to set `horizon` to the week range
(`isCampaignOp ? '16w → 4w out' : '12w → 4w out'`) — the panel can't carry both at once. Resolved by
giving `horizon` the week range, as point 6 and every other panel's `horizon` (RSVP Window's
`'days → hrs out'`, Stage's `'run day'`) already do, and moving the completion count into the
`badge` slot alongside the Overdue/All-Complete/Saving indicators it already shared that slot with.
`PreProductionPanel.tsx` implements it this way.

**Task 4, Step 2 — the panel has five timeline rows, not two.** The step's prose said "The card
stacked its Opens and Closes rows because it had 340px" and described wrapping "the two rows" in a
grid. `RsvpWindowPanel`'s `timeline` prop (`buildTimeline()`, `lib/operations/schedule.ts`) actually
carries five moments — RSVP opens, RSVP closes, Operation starts, Confirmations open, Completed —
not two. The `display: grid` / `gridTemplateColumns: repeat(auto-fit, minmax(280px, 1fr))` wrapper
was applied around the full `timeline.map()`, so it was already correctly applied to all five rows;
only the prose undercounted them.
