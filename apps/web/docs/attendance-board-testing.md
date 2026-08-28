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

- [ ] **Attending / Not attending** are two large buttons at the top, and the one
      that is currently true is filled in (green / red), not just outlined.
- [ ] Marking **Attending** while already holding a position must **not** move you.
- [ ] Marking **Not attending** gives up your position and reopens it.
- [ ] Claim an open position — you land in it and your RSVP flips to attending.
- [ ] The Claim button sits **where the occupant's name would be**, and is
      visible without hovering the row. A position you cannot claim still reads
      "Open" there instead.
- [ ] Role names read in full, including the long ones above a section —
      "Regimental Sergeant Major", "Officer Commanding", "Squadron Commander".
      Three rows of "…" where the column exists to tell them apart is the bug.
- [ ] Every Claim button on the board is the **same width**, whether or not its
      row carries a "Declined · Name" badge — a column of them should line up
      with the names on the occupied rows around them.
- [ ] **The change-your-mind case.** As a full-timer: mark *not attending*, have a
      second account take your position, then mark *attending* again. You get your
      position back; they land in the reservist pool.
- [ ] That displaced member gets **both** a site notification and a Discord DM
      naming the operation and the position they lost.
- [ ] Marking attending while standing in a position you claimed **elsewhere** must
      leave you there — it must not haul you back to your own section.
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

## 4b. Adding positions after the snapshot

- [ ] Each section header shows a **+** button in manage mode.
- [ ] It lists site roles, searchable, and **only** those permitted in that
      section's platoon. A role scoped to `support` must not appear under 1-1.
- [ ] Roles with a `tag` show it — that is the only thing distinguishing two
      same-named roles with overlapping scope.
- [ ] Picking one adds an open position to that section immediately.
- [ ] **Try to bypass the filter.** POST an out-of-scope role by hand:

      ```
      POST /api/operations/<id>/attendance/roster
      { "action": "addSlot", "sectionTitle": "1-1 Alpha", "category": "platoon11",
        "roleId": "<a support-only role>" }
      ```

      It must return 400 with "<name> cannot be used in this platoon." The picker
      filtering its own list is a convenience, not the rule.
- [ ] The added position can then be filled by drag, right-click, or auto-fill.

## 4c. Row layout and dragging

- [ ] Member names are **readable**, not truncated to "P..". The role label is
      what truncates now, and a truncated "SECTION COM…" is still meaningful.
- [ ] Role labels are readable in full — "SECTION COMMANDER", "MEDIUM ANTI-TANK"
      and "PLATOON SERGEANT" should not be truncated on a normal-width card.
- [ ] Occupied rows show a short badge (`Ressy`, `Await`, `No reply`); empty rows
      show the full sentence with the name (`Declined · Okafor`).
- [ ] **The badge only clips when the row is actually short of space.** On a wide
      card with a short name it must show in full — it shrinks 100x faster than
      the name, so it is the first thing to give and the last thing to be missed.
- [ ] Hovering (or focusing) a clipped badge expands it back over the name.
- [ ] The right-hand mission deck is **hidden on the Attendance tab** and present
      on Brief, Map and Schedule.
- [ ] **The whole row drags**, not just a grip.
- [ ] The Claim button and the ⋯ menu still click without starting a drag, by
      pointer *and* by keyboard (Enter on Claim must not also pick the row up).
- [ ] The colour **legend** appears above the board and matches what the rows do.
- [ ] "Filled" agrees everywhere: stats bar, category header, section header.
      A section where nobody has replied must not read "5 / 5 filled".

## 4d. Layout

- [ ] Company HQ and Game Masters sit **side by side across the top**, and their
      cards are the **same height** as each other.
- [ ] Fighting platoons run as **columns** with sections stacked inside them.
- [ ] **1-3 Support gets a double-width column** with its sections in two columns.
      With only 1-1 and 1-3 assigned that should read as roughly one third / two thirds.
- [ ] 1-3's two inner columns are packed by content, not aligned as grid rows —
      a 14-row section beside an 8-row one must not leave a card-height gap.
- [ ] Platoon columns do **not** stretch to match each other — a four-row platoon HQ
      must not be inflated to the height of a fourteen-row engineer section.
- [ ] Categories cannot be collapsed. There is no chevron and no toggle.
- [ ] The board is **the page**: no panel frame or title bar around it, running
      edge to edge, with the setup forms in a narrower container below.
- [ ] The **+ add role menu is not clipped** by the section card — it should
      overlay everything, and flip upward near the bottom of the window.
- [ ] That menu keeps the operation's accent colour despite being portalled out
      of the board (hover a role — the highlight should be the op's theme colour).

- [ ] Sections and platoons show their **ORBAT patch** where one is uploaded,
      and their own colour as a rule under the section header.
- [ ] A section with its own colour shows **its** colour, not its platoon's —
      previously every section inherited the platoon's.
- [ ] A section with no patch of its own falls back to its platoon's patch;
      with neither, it shows a plain colour dot (or nothing).

## 4e. Rebuilding the board

- [ ] Assigned Units shows a **Rebuild Attendance Board** button for staff only.
- [ ] It confirms first, and the dialog says plainly that placements are lost.
- [ ] After rebuilding, the board reflects the currently assigned units — add
      1-2 Platoon, rebuild, and 1-2 should appear as a new column.
- [ ] Placements are gone and everyone attending is back in the pool; RSVP
      answers are **kept**.
- [ ] Other viewers pick the rebuild up within 30s (it does not bump the live
      revision — a known, accepted trade for a rare staff action).

## 4f. Generating data (development only)

- [ ] A **Developer** panel appears at the bottom of the Attendance tab in dev,
      and **not** in a production build.
- [ ] Three buttons — **Quiet Night**, **Ordinary Night**, **Busy Night** — each
      fill the board and report the turnout alongside what it did.
- [ ] Quiet leaves most positions unfilled and a thin pool; busy fills nearly
      everything and overflows the rail. They should look obviously different.
- [ ] Every one of them shows **every** state at once: attending, awaiting,
      declined, released, backfilled reservists, and open positions — a night
      where nobody failed to reply would mean no `awaiting` rows at all.
- [ ] Members waiting in the pool include both some with a stated preference and
      some with none.
- [ ] Nobody appears in two positions, and nobody marked not-attending is shown
      standing in one.
- [ ] Pressing the same one again produces a *different* board.
- [ ] The route 404s in production regardless of permission — the environment
      check runs before authentication.

## 4g. Loading

- [ ] Hard-reload the Attendance page. The skeleton is the **board's** shape —
      header, stat strip, platoon columns at 1 / 1 / 2, pool rail — not a stack
      of grey blocks.
- [ ] Nothing jumps when the real board arrives; it fades in over the skeleton
      in place.
- [ ] The setup panels (Assigned Units, Notifications, Developer) are **absent**
      until the board has settled, then fade in beneath it.
- [ ] With no roster yet, and with a deliberate server error, the panels still
      appear — the Rebuild button is the way out of both.

## 4g-bis. Saying no

- [ ] **Attending and Not attending take effect immediately** — the pressed
      button lights up, the status line changes and the affected rows recolour
      within a moment, not on the next 30-second poll. Same for Claim, Leave
      and setting a preference.

- [ ] **Not attending** takes you out of the position you were standing in —
      your own or one you claimed in another section — and out of the reservist
      pool, in one press.
- [ ] Your stated preference is cleared with it, so re-attending later does not
      quietly carry a wish you no longer remember making.
- [ ] **Attending** afterwards puts you back in your own ORBAT position, and
      whoever took it in the meantime returns to the pool and is notified.
- [ ] **Attending** when you have no position of your own on this board leaves
      you in the reservist pool.
- [ ] A member who declines through the **older RSVP panel** (the operation view
      page, not the board) is released from their position too.
- [ ] Nobody with a DECLINED badge is ever shown standing in a position — check
      an operation whose roster predates this, since the display derives the
      occupant and heals a stale roster without anyone rewriting it.

## 4h. Performance

The board is the heaviest thing the editor renders — roughly a hundred rows,
each with a dnd-kit droppable, a draggable and a motion projection node — so it
is unusually sensitive to anything that re-renders it for unrelated reasons.

- [ ] Sit on the Attendance page doing nothing, with a Performance profile
      running. There should be **no repeating long task**. Two one-second
      clocks in the editor (the auto-transition tick and `useOperationStatus`)
      used to re-render the whole tree twice a second at ~240ms a time.
- [ ] Scrolling the board is smooth, and hovering rows does not stutter.
- [ ] Dragging is still smooth with a full ORBAT on screen.
- [ ] The auto-transitions still fire on time — RSVP opening and closing, and
      Upcoming → Active — even though nothing re-renders each second now. Set an
      RSVP close a minute out and watch it happen without a refresh.
- [ ] A peer joining or leaving still updates the "watching" cluster promptly.

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
