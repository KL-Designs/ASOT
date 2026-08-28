# Live Attendance Board — test checklist

Branch: `feat/attendance-board` (5 commits, based on `feat/schedule-runway`).

**Verified before handover:** `npx tsc --noEmit` clean, `npm run lint` clean,
543 unit tests across 46 files (39 new in `lib/attendance/roster.test.ts`).

**Not verified:** the production build, anything visual, and the Playwright
suite. See [What was not checked](#what-was-not-checked).

---

## 1. Before anything else

- [ ] Stop the dev server, then `npm run build`.
      The only check that could not be run at handover — a dev server was live,
      and `next build` against one corrupts `.next` in both directions. It also
      matters here specifically: a route was added, and `typedRoutes: true` only
      regenerates its route union during a build.
- [ ] Grant yourself **`attendance.manage`** in the Roles Manager.
      New permission key. Without it the board renders read-only. J4-Administration
      still works through the legacy `admin.manageOrbat` arm.

## 2. The snapshot

Everything else depends on this. The roster is cut from the ORBAT once, when the
operation first reaches `rsvp_open`.

- [ ] Take a test operation through to **RSVP open**. Confirm
      `operation_attendance.roster` now exists with one entry per ORBAT position,
      each carrying `homeUserId` and `occupantUserId`.
- [ ] Confirm `rosterTakenAt` is stamped.
- [ ] Let a *second* operation open via the **cron** rather than the button, and
      confirm it also cuts. Both paths call `ensureRosterSnapshot`, which is meant
      to be idempotent — whichever arrives first cuts it, the other is a no-op.
- [ ] Confirm game masters are present even if that platoon was never ticked.

**Expected, not a bug:** an operation that passed `rsvp_open` *before* this branch
has no roster and shows "The roster is cut from the ORBAT when RSVP opens.
Nothing to show yet." Nothing is back-filled. Say if you want them migrated.

## 3. As a member

Use a second account or a private window.

- [ ] Claim an open position — you land in it and your RSVP flips to attending.
- [ ] Leave it — you return to the pool and the position reopens.
- [ ] "Set a preference" → pick a section and/or role → you sit in the pool
      tagged with it, not placed anywhere.
- [ ] Mark **not attending** via the old attendance panel → your position reads
      `Declined · <name>` and becomes fillable.
- [ ] A member with no attendance record at all still gets the bar, in its
      "Not responded" state.

## 4. As staff

- [ ] Drag from the pool onto an open position.
- [ ] Drag onto an **occupied** position — it must **swap**, not refuse.
- [ ] Drag onto a **section header** — lands in that section's first free position.
- [ ] Drag someone from a position back onto the pool rail.
- [ ] **Auto-fill from pool.** Members who named a section or role should be served
      *before* the "anywhere" people — this ordering is the part worth actually
      checking, because getting it backwards means the member who asked to be a
      medic loses the medic slot to someone who would have taken anything.
- [ ] Right-click a row: return to pool, place from pool, remove position.
- [ ] Right-click still works after a click-and-hold on the grip (there is a 5px
      drag threshold specifically so a click does not register as a zero-length drag).

## 5. Live — two browsers side by side

The headline feature. Worth doing properly.

- [ ] Move someone in one window; the other updates within about a second.
- [ ] The member **travels** into the slot rather than popping out of one list and
      into another.
- [ ] The arrival **ping fires only in the other window** — never in the one that
      made the change. Watching your own click replay reads as lag, so it is
      suppressed deliberately.
- [ ] The presence cluster shows the other viewer, with a correct count.
- [ ] Rows FLIP smoothly on reorder; the fill bar eases rather than jumping.
- [ ] Kill the collab server → the pill flips to "Reconnecting" and the board keeps
      working on a 30-second poll.
- [ ] Two windows claim the **same** position at almost the same moment. One wins,
      the other is told "That position was just taken" — not silently overwritten.

## 6. RSVP close

- [ ] Advance to `rsvp_closed`. Unanswered positions flip to `No response · <name>`,
      the frozen banner appears, and member controls disappear.
- [ ] `Declined · <name>`, `Released · <name>` and "never filled" remain visually
      distinct. They are three different problems for whoever is chasing people up.
- [ ] The rail retitles itself from "Reservist Pool" to "Available".
- [ ] **Try to beat it.** With RSVP closed, POST a claim by hand:

      ```
      POST /api/operations/<id>/attendance/roster
      { "action": "claim", "slotId": "<some open slot>" }
      ```

      It must return 403. The freeze is enforced server-side; the disabled UI is
      only a courtesy.

## 7. The dual-identity case

The scenario that drove much of the design: one member, two positions.

- [ ] A full-timer in 1-1 Alpha sets a preference for 1-2 Bravo.
- [ ] Alpha's position shows `Released · <name>` and is fillable.
- [ ] Their pool card reads `↗ Released 1-1 Alpha · <role>`, so the cost of their
      absence is visible from the pool rather than having to be hunted down.

## 8. Regressions

- [ ] Old `AttendancePanel` still works (RSVP buttons, sections, attendance types).
- [ ] Confirmation flow and section-leader tasks unaffected.
- [ ] Lead Zeus nomination unaffected.
- [ ] `attendance/platoons` still works for J4 (its gate was **widened**, not
      replaced — it should be impossible for this to lock anyone out).
- [ ] A member who joins another section and then leaves it keeps their real
      `orbatRole` on their record. This used to be destroyed on both writes.

## 9. Accessibility and preferences

- [ ] OS **reduced motion** on → no travel, no ping, no stagger. State still changes
      visibly.
- [ ] The board is operable without a pointer: every drag action also exists in the
      right-click menu, and the grip is keyboard-focusable.
- [ ] Narrow window (<1100px) → the pool rail moves below the sections rather than
      squeezing them.

---

## What was not checked

| | Why |
|---|---|
| `npm run build` | A dev server was running; CLAUDE.md forbids building against one, and stopping the user's process needs asking. |
| Anything visual | Cannot see the screen. Animations, spacing and feel all need eyes on them. |
| Playwright (`npm run test:e2e`) | Standing rule is to ask before running it. |

## Open decisions

- **Two representations coexist.** The view page shows the new board *and* the old
  attendance drawer. Deliberate for now — confirmation still lives in the old panel
  — but the old list probably wants retiring once the board is trusted.
- **Live sync requires dashboard access.** The `att-{operationId}` collab gate is
  `hasDashboardAccess`. Anyone without it still gets the board, just on the poll.
- **Custom sections snapshot empty.** `addSlot` exists in the API but has no UI
  button yet, so custom units start with no positions.
- **Five questions from the mockups are still unanswered.** Assumptions currently
  in the code: decline-and-stay-in-pool-for-the-same-section is forbidden; no ORBAT
  re-sync prompt; confirmation stays in the old panel; custom sections get
  hand-authored positions; ~30 concurrent watchers, so refetch-on-signal rather
  than shipping deltas. None are baked deep.
