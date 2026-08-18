# Operations Editor Redesign — Design

Replaces the operation editing page — one 2,464-line client component at
`apps/web/app/operations/[id]/edit/page.tsx` — with a full-height application
shell that separates writing a briefing from administering an operation, and
rebuilds the schedule and attendance surfaces at roughly half their current
information density.

## Goal

The page does two unrelated jobs in one vertical scroll, in the wrong order.

A J2 member opens it to **write**: the briefing is a tree of documents in a
single Y.Doc — `main`, plus typed `intel`, `orders`, `zeus`, `ocap`,
`staff_orders` and `aar` pages that nest, take colour codes, drag to reorder
and import sections from other operations. That is the daily work, and it sits
at the very bottom of the page.

Above it sit five stacked collapsible panels that exist to **administer**:
Mission Development gates, Operation Details, Schedule & Automation, Attendance
Settings and Custom Attendance Units. Two of them are `isHQ`-gated, so an
ordinary author scrolls past locked or empty chrome to reach the thing they
came for. Three more surfaces live elsewhere again — the map at
`/operations/[id]/map`, the public view at `/operations/[id]`, and Preview and
Activity as slide-over drawers — reachable only through `VIEW →` and `MAP ↗`
links in the header, each a context switch that loses your place.

Three problems follow from that shape, and the design is mostly about them:

- **The primary task is below the fold.** Everything a writer needs is
  reachable only after everything they do not.
- **The same facts are printed twice.** Schedule & Automation is a form on the
  left and a status column on the right restating the same four moments as
  countdowns. Whichever you read, you must reconcile it against the other.
- **Nothing is glanceable.** The op date, the stage, the RSVP mode and the
  development-gate progress are the facts an author checks constantly, and each
  one costs a scroll or a panel expansion to see.

## Non-Goals

- **Rewriting `CollabEditor.tsx` or `PageSidebar.tsx`.** They are 1,070 and
  949 lines respectively and they work. This redesign changes where they sit
  and what surrounds them, not what they do. Their props gain nothing beyond
  what the shell must pass down.
- **Changing the Y.js document model, the Hocuspocus server, or
  `GET /api/auth/collab`.** Document naming (`{operationId}`, `sop-{id}`,
  `ws-{id}`) and per-document permission resolution are untouched.
- **Changing the operations lifecycle.** Status progression, attendance stages
  and the `cron/operations` transitions keep their current behaviour. This
  redesign changes how the stage is *displayed and manually overridden*, not
  when it advances.
- **The public view page** at `app/operations/[id]/page.tsx`, its paged view,
  section nav or print path.
- **The standalone map route.** `/operations/[id]/map` stays exactly as it is —
  `app/operations/list.tsx` links into it from three places (lines 530, 578 and
  908) and it provides a genuine fullscreen mode. The Map *tab* embeds the same
  `MapSection` component; it does not replace the route.
- **`IntelPackageEditor` / `IntelPackageViewer`** (1,300 and 1,410 lines). The
  Intel Package is one of the document types in the rail and opens as it does
  today.
- **Merging the two design systems.** See §2 — this ports milpac's tokens into
  the editor and accepts one duplication, deliberately.

---

## 1. The shell

A full-height, four-region application shell. The page itself never scrolls;
each region scrolls internally.

```
┌────────────────────────────────────────────────────────────────────┐ 54px
│ ← J2 Operations │ NEW MISSION 18/08/2026 │ IN DEVELOPMENT          │
│      BRIEF  MAP  DEVELOPMENT  ATTENDANCE      ✓ Saved  Publish  ⋯  │
├──────────┬──────────────────────────────────────┬──────────────────┤
│ 196px    │  flex                                │ 340px            │
│          │                                      │                  │
│ DOCUMENTS│  editor toolbar                      │  D-92 │ 0/5      │
│  Main    │  ──────────────────────────────────  │  ─────┴────      │
│  Intel   │                                      │  SCHEDULE        │
│  CHQ     │  the document                        │  STAGE           │
│   HQ     │                                      │  ATTENDANCE      │
│   1 PLT  │                                      │  DETAILS         │
│  Zeus    │                            ┌────────┐│                  │
│  OCAP    │                            │ Preview││                  │
├──────────┴────────────────────────────┴────────┴┴──────────────────┤ 32px
│ ● Live │ Doc Main │ 1,240 words │ Saved 14:32 │  2 editing │ 1-0 HQ │
└────────────────────────────────────────────────────────────────────┘
```

**Header (54px, sticky).** Back crumb, operation title, status pill, save
state, Publish (HQ, `In Development` only), and an overflow menu holding Delete
Mission, Activity and Duplicate. Delete leaves the top level: today it sits
immediately beside Publish, which puts the destructive action next to the
primary one.

**Tabs.** `BRIEF · MAP · DEVELOPMENT · ATTENDANCE`. Attendance is `isHQ`-only
and is not rendered otherwise — not rendered disabled. There is no Settings
tab; Operation Details and Schedule are edited in the deck (§4).

**Documents rail (196px).** `PageSidebar` with `orientation='sidebar'`,
unchanged, restyled to the shell's tokens. Persists across the Brief and Map
tabs.

**Mission deck (340px, persistent).** §4.

**Status bar (32px).** §5.

**Preview** is a floating button at the editor's bottom-right, opening the
existing drawer. It is not a tab and not a header button.

### Why not tabs for everything

The deck is the design's one real bet, so state the trade plainly: it costs
340px of editor width permanently. The alternative — Development and Attendance
as tabs with nothing persistent — was drawn as Option A and rejected because it
leaves an author unable to see the op date while writing, which is the specific
complaint that started this work. The deck is what buys "nothing is hidden and
nothing blocks the editor". §8 covers what happens when the window is too
narrow to afford it.

---

## 2. Design system

The editor's current styling is ad-hoc `rgba()` literals — `c(0.15)`,
`rgba(237,237,237,0.3)` — recomputed per component from a `hexToRgb` helper
that appears in at least three files.

The milpac personnel file already solved this. `app/(landing)/milpacs/
[username]/profile.module.css` defines a real token set, and its central idea
maps one-to-one onto operations: `--acc` and `--acc-rgb` are injected inline
per member, exactly as each operation carries its own `themeColor`.

Ported values, unchanged:

| Token | Value | Use |
|---|---|---|
| `--bg` | `#08090a` | page ground |
| `--s1` `--s2` `--s3` | `#0d0f11` `#12151a` `#181c22` | panel, control, hover |
| `--line` `--line-2` | `#1e232b` `#2a3038` | hairline, control border |
| `--ink` `--ink-2` `--ink-3` | `#e8eaed` `#a8b0ba` `#6b7480` | text ramp |
| `--good` `--warn` `--crit` | `#7fae5c` `#d4a03a` `#c05a48` | stage, gates, delete |
| `--r` | `3px` | radius |
| `--acc` `--acc-rgb` | operation `themeColor` | accent |

And the primitives that carry the look: the **36px accent tick** on a panel's
top-left corner (not the current full-width 2px top rule), `panelHeader` at
`14px 18px` with an 11px/`0.22em` uppercase label, the `rw`/`rwK`/`rwV` data
row, `chip`, `btn`, `pill`, the mono tab with its 2px underline and glow, and
the film-grain overlay.

These land in a new `app/operations/[id]/edit/shell.module.css`.

**This duplicates `profile.module.css`'s token block, knowingly.** Extracting a
shared stylesheet means editing a shipped, well-tested page in the same change
that rewrites another one, and the two will want to diverge while this settles.
Merging them into one `styles/` module is a follow-up, worth doing once the
editor has been in use for a few operations — recorded here so it is not
rediscovered as an accident.

---

## 3. Component decomposition

`page.tsx` currently holds 2,464 lines and roughly 90 `useState` calls in one
component. The target is that no file in the feature exceeds ~400 lines.

```
app/operations/[id]/edit/
  page.tsx                    thin: params, permissions, initial fetch, <EditorShell>
  shell.module.css
  EditorShell.tsx             layout, tab state, save orchestration
  Header.tsx                  crumb, title, status pill, publish, overflow menu
  StatusBar.tsx               §5
  DocumentsRail.tsx           wraps PageSidebar
  activity-log.tsx            unchanged
  deck/
    MissionDeck.tsx           column container, collapse behaviour
    CountdownStrip.tsx        D-n and gate progress
    ScheduleCard.tsx          summary + inline edits
    StageCard.tsx             progress bar, current stage, Advance
    AttendanceCard.tsx        platoon chips, ping toggle        (HQ)
    DetailsCard.tsx           owner, department, billet points, theme, map world
  tabs/
    BriefTab.tsx              CollabEditor
    MapTab.tsx                MapSection
    DevelopmentTab.tsx        the gate timeline + completion modal
    AttendanceTab.tsx         §6                                 (HQ)
  hooks/
    useOperationMeta.ts       meta fields + Y.js sync + debounced save
    useOperationStatus.ts     §5
    useDocStats.ts            word/section counts from the editor
```

`hexToRgb` moves to `lib/` — it is currently redefined in `page.tsx`,
`PageSidebar.tsx` and elsewhere.

---

## 4. The deck

Persistent right column, 340px. It answers "what is the state of this
operation" without leaving the document, and takes the edits that are one
control wide. Anything larger opens its tab.

**Countdown strip.** Two cells in the milpac `strip`/`cell` idiom: days until
the operation (accent), and development gates as `0/5` (warn). These are the
two numbers that decide whether an author needs to do anything today.

**Schedule card.** The full timeline from §6, not a summary of it — compressed
to the deck's width by stacking each moment's label, value and control rather
than laying them across. Five moments at roughly 70px each is ~400px of the
deck's ~938px budget, so the deck scrolls; that is expected and is why every
region scrolls internally.

Keeping the whole timeline here rather than splitting a summary from a detail
view is deliberate: a summary that must be reconciled against a fuller version
elsewhere is precisely the failure this redesign is removing.

**Stage card.** A six-segment progress bar, the current stage in accent, and a
single `Advance` button. The six-step labelled stepper the page has today is
replaced: `cron/operations` drives the transitions, so the manual control is an
override, not a primary input.

**Attendance card (HQ).** Platoon chips and the Discord ping state. Selection
is editable here; anything more opens the Attendance tab.

**Details card.** Owner, department, billet points, theme colour, map world.
Confirmed placement — these do not get a tab.

**Collapse.** The deck collapses to a 44px rail of icons, with state in
`localStorage`. §8 makes this automatic below a breakpoint.

---

## 5. The status bar

32px, full width, bottom. It carries **document and session** state, and
deliberately does not repeat the mission facts the deck is already showing a
few hundred pixels to the right — sync status, active document, word and
section counts, last save time, who else is editing, and the department.

Two data sources, both already present:

- **Presence** (`2 editing`) comes from the Hocuspocus awareness protocol that
  `CollabEditor` already maintains for its collaborative cursors.
- **Doc stats** come from the TipTap editor instance, via `useDocStats`.

Live operation status — used by the deck, not the status bar — comes from
`components/operations/OperationStatusBar.tsx`, which already polls the
operation and formats countdowns (`fmtCountdown`, `LiveStatus`). Its fetching
logic is extracted into `hooks/useOperationStatus.ts` and consumed by both that
component and the deck, so the public view page and the editor cannot drift.

---

## 6. Density: schedule and attendance

The named complaint, and a change that stands on its own regardless of shell.

**Schedule becomes one timeline.** Today: a form (date picker, RSVP open
manual/scheduled, RSVP close offset, a confirm button) beside a status column
restating RSVP opens / RSVP closes / mission active / confirmations as
countdowns. The two must be read against each other to answer "when does
anything happen".

They collapse into a single vertical timeline in the milpac `tl` idiom — five
moments, each a row carrying its own control:

| Moment | Value | Control |
|---|---|---|
| RSVP opens | Manual, or a computed datetime | mode toggle |
| RSVP closes | computed datetime | offset select |
| Operation starts | datetime, and `in 92 days` | date picker |
| Confirmations open | when the mission ends | — |
| Completed | 48h after confirmations | — |

The current moment carries the accent ring. Nothing is stated twice.

**The timeline lives in the deck, not a tab** (§4). Schedule was never asked to
be a tab, and the deck is where Details and Schedule were confirmed to belong.

**Attendance loses the stepper.** The six-step labelled stage stepper becomes
the deck's thin progress bar plus one `Advance` control.

**Custom Attendance Units stops being a panel.** It becomes a `+ Custom unit`
chip in the platoon row, opening the existing editor inline. It is a rarely
used feature currently occupying a top-level collapsible.

**Notifications get grouped.** Discord ping and the orders reminder become two
labelled toggle rows in one card, instead of a bare `Disabled` switch whose
scope is not stated.

The Attendance tab is then: Who attends, Notifications, Acknowledgements —
everything about *people*. Timeline and Stage stay in the deck, so the tab set
holds at four and nothing about *time* is split across two places.

---

## 7. Tab navigation is client state

**Tabs must not be routes.** `app/(landing)/milpacs/[username]/tabs.tsx`
carries a measured finding: with `next/link`, tab navigation committed on the
first click 11 times out of 18 in production, and the milpac page deliberately
fell back to plain `<a>` full document loads to get reliability. Query params,
the `loading.tsx` boundary, `prefetch`, `scroll={false}` and the middleware
matcher were each deployed and ruled out.

A full document load per tab is unacceptable here: it tears down the Hocuspocus
websocket and rebuilds the Y.Doc on every switch between Brief and Map.

So tab state is React state in `EditorShell`, mirrored to the URL with
`history.replaceState` so refreshes and deep links work without involving the
Next router. All four tab panels mount within one client tree; Brief and Map
stay mounted once visited so the editor and the map keep their connections.

---

## 8. Responsive behaviour

The deck's 340px is the design's real cost, and 1366×768 laptops are common in
the unit.

| Viewport | Behaviour |
|---|---|
| ≥ 1600px | Rail 196 + deck 340, both open |
| 1280–1599px | Deck open, documents rail collapses to 44px icons |
| 1024–1279px | Deck collapses to a 44px rail; expands as an overlay on click |
| < 1024px | Deck and rail both become overlay drawers; tabs scroll horizontally |

The status bar drops cells from the left as width falls, keeping sync state and
save time longest. Below 768px the editor is usable but not a target: this is a
staff authoring tool used at a desk.

---

## 9. What is deleted

- The five top-level collapsible panels and their `[−]`/`[+]` toggles.
- The Schedule status column (folded into the timeline).
- The six-step labelled stage stepper (folded into the progress bar).
- The `VIEW →` and `MAP ↗` header links (Map is a tab; View moves to overflow).
- Delete Mission's top-level placement (moves to overflow).
- The three per-file `hexToRgb` copies (moves to `lib/`).

---

## 10. Testing

**Unit (`vitest`, `npm run test:unit`).** The extracted logic is where the real
risk sits and it is all pure:

- `useOperationStatus` schedule computation — RSVP close offsets against an
  operation date, DST boundaries, and the "manual" case where no open time
  exists.
- `fmtCountdown` at day, hour and minute boundaries, and past-due.
- Stage progression: which stage is current for a given operation, and which
  `Advance` targets.
- `useDocStats` word and section counts over a known ProseMirror document.

**Component.** The permission gates are worth asserting directly: the
Attendance tab and deck card are absent — not disabled — for a non-HQ user, and
Publish renders only for HQ on an `In Development` operation.

**End-to-end (`playwright`).** Specs are written for tab switching preserving
the collab connection, deck collapse persistence, and the timeline editing a
date. **These are not run as part of this work without asking** — running
`npm run test:e2e` is the user's call.

---

## 11. Rollout

Work happens on `feat/operations-editor`, already branched off `main` at
`63526821`, and carrying one unrelated commit-pending fix (the React
shorthand/longhand border warning).

No feature flag. This is a staff-only page behind `pages.operationsEdit`, the
change is not incremental, and a flag would mean maintaining both shells
against one Y.Doc. Because `.github/workflows/deploy.yml` deploys every push to
`main` with no CI gate, the branch merges only when the whole shell is
finished — per the repo's standing rule on large features.

Sequencing, each step leaving the page working:

1. `shell.module.css` and the token port.
2. Extract `useOperationMeta`, `useOperationStatus`, `useDocStats` from
   `page.tsx` — behaviour-preserving, page still renders as today.
3. `EditorShell` + Header + StatusBar, with the existing panels stacked
   underneath unchanged.
4. Deck cards, moving content out of the panels one at a time.
5. Tabs, once the panels are empty.
6. Density rebuild of Schedule and Attendance.
7. Delete the dead panel code.

---

## 12. Open questions

- **`billetPoints` on the Details card.** It is awarded to the owner on
  completion. Whether it should be editable after publish is a policy question
  for J2, not a layout one.
- **Deck contents when an operation is `Completed`.** The countdown strip
  becomes meaningless. Likely it flips to attendance results, but that is a
  design pass of its own once the shell exists.
- **Zeus Notes and OCAP** are document types in the rail, but OCAP also has
  panels (`OcapLinkPanel`, `OcapStatsPanel`, 568 and 520 lines) on the public
  view. Whether the editor's OCAP page should surface sync status is unresolved
  and deferred.
