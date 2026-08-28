# Operations Editor — Schedule Tab — Design

Merges the operation editor's Development tab and the mission deck's Stage and
Timeline cards into one lifecycle surface, renamed **Schedule**, and rebuilds it
as a control panel rather than the collapsible panel it is today.

Follows on from the attendance consolidation in the same editor (deck
`AttendanceCard` folded into `AttendanceTab`), which established the pattern: a
control and the setting it gates belong on the same screen.

## Goal

The editor currently splits one timeline across two surfaces that cannot see
each other.

- `app/operations/[id]/edit/tabs/DevelopmentTab.tsx` holds the mission
  development gates — five or six week-checks counting back from the op or
  campaign start date (16W→4W for campaigns, 12W→4W for single missions) — plus
  the Orders Check Request workflow.
- `app/operations/[id]/edit/deck/ScheduleCard.tsx` (panel titled "Timeline")
  holds the RSVP open/close window, in a 340px sidebar rail.
- `app/operations/[id]/edit/deck/StageCard.tsx` holds the six-step attendance
  stage machine (`preparing → rsvp_open → rsvp_closed → op_running →
  confirmations_open → completed`) and its Advance control.

These are three zoom levels on a single clock. Dev checks are the
pre-production countdown, measured in weeks out. The RSVP window is measured in
days and hours out. Stage is where the op is on the day. Nothing in the current
layout says so: an author sets RSVP timing in a sidebar rail while tracking dev
check due dates on a different tab, with no shared frame.

Four concrete defects in the Development tab motivate rebuilding rather than
relocating:

- **The whole tab is one collapsible panel, open by default**
  (`DevelopmentTab.tsx:83`, `:173-193`). A collapse toggle on the only content of a
  tab collapses the tab to nothing and serves no purpose.
- **The tab renders completely blank when the operation has no date.**
  `DevelopmentTab.tsx:103` is `if (!opID || !baseDate) return null` — no
  message, no empty state, no indication anything is wrong or what to do.
- **Un-completing a check uses a native `confirm()`**
  (`DevelopmentTab.tsx:212`), while the same editor already has a themed
  `ConfirmDialog` component used for stage changes and deletion
  (`page.tsx:816-835`).
- **Orders Check is stacked underneath the check strip as an afterthought**
  (`DevelopmentTab.tsx:284`) rather than presented as what it is — the last
  pre-production gate before the brief locks.

## Non-goals

- **DetailsCard stays in the deck.** Title, owner, billet points, department,
  status, cover, theme, era, map and in-game date are reference fields wanted
  while writing the brief, not lifecycle controls. The deck survives, holding
  CountdownStrip and DetailsCard.
- **No change to any API route or persisted shape.** Every handler
  (`handleChangeDate`, `handleSetRsvpOpenManual`, `requestStageChange`,
  `saveCompletion`, …) already lives lifted in `page.tsx` and is reused
  verbatim. This is a presentation change.
- **The `discordPingEnabled` / `discordPingRoles` persistence bug is out of
  scope.** `POST /api/operations/[id]/attendance/platoons` accepts both fields
  in its request body but omits them from its body type and its `setFields`
  object, so neither is ever written. Pre-existing, unrelated to this work, and
  tracked separately.

## The organising idea

The tab reads top to bottom as one countdown, furthest-out first. Each panel
names its horizon in its header, so the ordering explains itself without
commentary:

```
PRE-PRODUCTION   16w → 4w out     dev checks + orders check
RSVP WINDOW      days → hrs out   when sign-ups open and close
STAGE            run day          where the op is right now
```

## Panels

### Pre-Production

The existing week-check node strip, unchanged in behaviour: nodes are
completed/overdue/pending, `isJ2Lead` may click to complete or un-complete, the
completion modal collects reviewer name, comments and outcome, and the legend
explains the colours and the campaign-vs-single check count.

Changes:

- **The collapsible wrapper is removed.** The panel is always open.
- **Its state moves into the panel header** — `3 of 5 complete`, alongside the
  existing `N Overdue` badge and the `Saving…` indicator, all of which the
  collapsed header already showed.
- **Orders Check becomes the final row of this panel**, not a sibling block. It
  is a pre-production gate; presenting it as one groups it with the gates it
  belongs to. Its request/cancel/reminder controls and its modal are unchanged.
- **Un-completing a check uses `ConfirmDialog`** rather than the native
  `confirm()`, matching stage changes and deletion in the same editor.

### RSVP Window

`ScheduleCard`'s content, renamed from "Timeline" — that name inside a tab
called Schedule is ambiguous, and the panel only ever concerned RSVP. Behaviour
is unchanged: Manual/Scheduled toggle, the four relative quick-sets for open,
the eight close-offset presets plus Custom, and the two MUI date-time pickers.

At 340px the card stacked Opens above Closes. At the tab's full width they sit
as two columns, each stating its moment once.

### Stage

`StageCard`'s content, unchanged in behaviour: six segments, click to target,
Advance as the primary action, both routed through `page.tsx`'s existing
`requestStageChange` → `ConfirmDialog` → `commitStageChange` path.

The deck's 340px forced six unlabelled segments with the stage name shown only
via `aria-label`. Full width restores visible labels (`Preparing · RSVP Open ·
RSVP Closed · Op Running · Confirmations · Completed`), which the original
stepper had and `StageCard` dropped purely for space. This is the clearest
single win from the extra width.

## Empty states

`if (!opID || !baseDate) return null` is removed. The tab always renders.
Panels that require an operation date show an inline empty state in place of
their content:

- **Pre-Production** — "Set an operation date in Details to schedule
  development checks." Development checks are computed by counting back from
  the op date (or campaign start date for campaign ops), so without one there
  is nothing to compute.
- **RSVP Window** — the same, since open/close instants are relative to the op
  date.
- **Stage** — renders regardless. The stage machine does not depend on a date.

## Permissions

Access is unchanged for every user. The merge must not widen or narrow it.

| Surface | Today | After |
|---|---|---|
| The tab itself | `pages.operationsEdit` (layout gate on the whole `edit` subtree) | unchanged |
| Completing/removing a dev check | `isJ2Lead` | unchanged |
| Orders Check request | `isJ2Lead` | unchanged |
| RSVP Window | `isHQ` (deck card not rendered otherwise) | `isHQ`, panel not rendered otherwise |
| Stage | `isHQ` (deck card not rendered otherwise) | `isHQ`, panel not rendered otherwise |

The two `isHQ` panels are gated by not rendering at all, not by disabling —
the same convention the deck cards and `AttendanceCard` already used.

**`isHQ` is not a real access boundary inside this editor, and the guards are
kept for continuity rather than for gating.** `layout.tsx:8` redirects anyone
lacking `PERMISSIONS.pages.operationsEdit` off the entire `/edit` subtree, and
`page.tsx:236` sets `isHQ` from `/api/me/roles?has=` that *same* key
(`['HQ Staff', 'J2 - Mission Making']`). Every user who reaches the editor
therefore has `isHQ === true`; the flag is only ever false for the moment
between first render and that fetch resolving. The `isHQ &&` conditionals are
retained verbatim because they cost nothing, they suppress a flash of
half-populated panels before the fetch lands, and changing them is a separate
concern from this move.

The genuinely varying gate inside the editor is `isJ2Lead`
(`departmentLeads.j2`) — a different key, and legitimately false for users who
can reach the editor. It stays exactly as it is: check completion and Orders
Check requests are J2-lead only, surfaced as disabled controls plus the
existing "J2 leads can complete checks" legend note.

## Files

**New**

- `tabs/schedule/ScheduleTab.tsx` — composes the three panels, owns the
  `isHQ` gating and the empty-state decisions.
- `tabs/schedule/PreProductionPanel.tsx` — check strip, legend, Orders Check
  row, and both modals.
- `tabs/schedule/RsvpWindowPanel.tsx` — from `deck/ScheduleCard.tsx`.
- `tabs/schedule/StagePanel.tsx` — from `deck/StageCard.tsx`.
- `tabs/TabPanel.tsx` — the shared panel chrome. `panelStyle`, `tickStyle` and
  `panelHeaderStyle` are currently duplicated verbatim in `AttendanceTab.tsx`
  and `DevelopmentTab.tsx`; a third copy would be the point at which they
  start to drift. `AttendanceTab` adopts it in the same change.

`DevelopmentTab.tsx` is split rather than moved. At 554 lines it is already the
largest file in the editor's tab directory, and folding Orders Check into the
check panel plus adding two more panels would push a single file past 900.

**Deleted**

- `deck/ScheduleCard.tsx`, `deck/StageCard.tsx`, `tabs/DevelopmentTab.tsx`.

`deck/Panel.tsx` stays — `DetailsCard` still uses it.

**Changed**

- `EditorShell.tsx` — `EditorTab` union member `'development'` → `'schedule'`,
  plus `TABS`, `TAB_LABELS`, and the `development` prop renamed to `schedule`.
- `EditorShell.tsx` `tabFromLocation()` — maps a legacy `?tab=development` to
  `schedule`. Without this, existing links and bookmarks fall back to Brief
  silently, since an unrecognised value already resolves to `'brief'`.
- `page.tsx` — deck composition drops `ScheduleCard` and `StageCard`; the tab
  prop and its props are rewired. `Header.tsx` renders the tab links from
  `TABS`/`TAB_LABELS` and needs no edit.
- `docs/map/g-public-pages.md` — the `edit/page.tsx` entry names the four tabs
  and the deck's cards; both change.

## Testing

No unit tests cover these components, and none are added — these are
presentational panels whose logic is either moved verbatim or is layout.

An `isHQ`-split spec is deliberately **not** added: as established above, a
non-HQ user is redirected off the editor entirely, so the state such a test
would assert is unreachable. `tests/operations-editor.spec.ts:212-239` already
covers that redirect.

One spec is added, covering the only genuinely new logic in this change:
a legacy `?tab=development` deep link resolves to the Schedule tab rather than
silently falling back to Brief. Nothing else here is new behaviour to assert.

No existing spec references the Development tab, so the rename breaks no test.

Manual verification on the dev server: load the tab with and without an
operation date set (the blank-tab regression), complete and un-complete a dev
check, change an RSVP open/close setting and confirm it persists across a
reload, and advance a stage through the confirm dialog.

Per `apps/web/CLAUDE.md`, the E2E suite is not to be run without asking first —
it spawns its own `next dev` server.

