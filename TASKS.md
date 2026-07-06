# Task Queue

---

## J1 Recruitment

### ~~Log Recruit → Billet Point Award~~ ✓ Complete
> Moved to Completed — see below.

---

### ~~Returning Member Detection & Routing~~ ✓ Complete
> Moved to Completed — see below.

<!--
During the log-recruit form, auto-detect if the applicant is a previous member by checking the J4 mastersheet (leaving history).

Routing logic based on mastersheet columns — **Discharge Type** (`GD`, `DD`, `HD`) and **Return status** (`Yes`, `No`, `Review`):
- If discharge type is **DD** → J4 must be involved before recruitment can proceed, regardless of return status.
- If discharge type is not DD, check the return column:
  - **Yes** → Recruitment proceeds as normal.
  - **No** → J4 must get involved before recruitment can proceed.
  - **Review** → J1 Lead must get involved before recruitment can proceed.

When J4 or J1 Lead involvement is required:
- Show a warning on the log-recruit form with the member's status.
- Send a notification to J4 / J1 Lead and ping in the J1-Recruitment Discord channel:
  > "*[Member name]* is requesting to rejoin. @[J1 staff who logged the recruit] requests @J4 confirmation that the applicant is eligible to rejoin."

> **Code context:** `runReturningMemberCheck()` in `app/api/admin/j1/applications/[id]/route.ts` already handles routing based on the `return` field (YES/NO/REVIEW) and creates tasks + in-app notifications for J4. **What is missing:**
> 1. The **DD discharge type check** — current code only looks at the `return` column, never at `type`. DD must trigger J4 involvement regardless of return value.
> 2. The **Discord channel ping** — current implementation sends in-app notifications and DMs to J4 users but does NOT ping the J1-Recruitment channel.

---

-->

### ~~Reinstate Member — Selective Data Restoration~~ ✓ Complete
> Moved to Completed — see below.

<!--
When reinstating a returning member, give J1 Staff a checklist to select which data from their discharge snapshot gets restored:
- Qualifications
- Awards & citations
- Trainings
- Campaign medallions / operation attendance

The member's discharge record and previous application both remain — a new entry is created for their new service period.

> **Code context:** Reinstate currently exists at `app/api/admin/members/discharged/route.ts` (PATCH) and `app/dashboard/j4/J4AdminPanel.tsx` (`ReinstateModal`). It only does `$unset: { discharged: '' }` — no data restoration at all. The `dischargeSnapshots` collection (defined in `lib/mongo.ts`) already stores the full milpac snapshot including qualifications, awards, and trainings from discharge time. The checklist UI and data restoration logic both need to be built on top of the existing reinstate modal.

-->

---

## J1 Mastersheet

### ~~Reviewed By Field~~ ✓ Complete
> Moved to Completed — see below.

<!--
The `reviewed by` field on recruit records should reflect:
- **Old / imported data:** the recruiter who handled the application.
- **New recruits going forward:** the J1 Lead who approved the application (set at approval time).

No old records will have this field populated — only new recruits from this point forward.

> **Code context:** `reviewedBy` is set in three places in `app/api/admin/j1/applications/[id]/route.ts`. Line 252 sets it to the recruiter when they submit their recommendation; line 329 sets it again on J1 Lead actions (potentially overwriting). For imports (`app/api/admin/j1/import/route.ts` line 127), it is set to the importing admin's name — not the original recruiter. **What needs to change:** ensure `reviewedBy` is only set to the J1 Lead at the point of final approval (accept/reject), not overwritten by intermediate actions or set to the wrong person on import.

-->

---

## Mastersheet — Discharge Snapshot & Returning Member Indicator

> **Confirm before building:**
> 1. The `[D]` tag in the applications tab currently means **Direct Recruit**, not discharged. A separate indicator for previously-discharged/returning members needs to be added to the application list row — the returning member check result (YES/REVIEW) is currently only visible inside the application modal.
> 2. The `dischargeSnapshots` collection already exists (`lib/mongo.ts` line 69) and is populated when a discharge ticket is processed (`app/api/admin/tickets/[id]/route.ts` line 193). A separate `retiredMembers` collection also exists. Verify whether the snapshot includes everything listed below before adding fields.

When a member is discharged, snapshot and save to a dedicated collection:
- Date of discharge & who processed it
- Rank and role at time of discharge
- All qualifications, awards & citations, campaign medallions, operation attendance

The discharge date appears on the mastersheet. Clicking it opens a modal showing the full snapshot.

When a member rejoins, their discharge record remains and a second entry is created for the new service period — full service history is preserved.

---

## J2 — Mission Making

### ~~J2 Member Operations Folder — Layout Alignment~~ ✓ Complete
> Moved to Completed — see below.

---

## Orders / Operations

### ~~All Staff — Read-Only Operation View~~ ✓ Complete
> Moved to Completed — see below.

---

### ~~PHQ/CHQ Attendance Confirmation Tasks~~ ✓ Complete
> Moved to Completed — see below.

---

### ~~Reservist Allocations~~ ✓ Complete
> Moved to Completed — see below.

---

### ~~Custom ERA List~~ ✓ Complete
> Moved to Completed — see below.

---

### ~~Custom Attendance Units~~ ✓ Complete
> Moved to Completed — see below.

---

### ~~CHQ Allocation Reminder~~ ✓ Complete
> Moved to Completed — see below.

---

### ~~Request Orders Check~~ ✓ Complete
> Moved to Completed — see below.

---

### ~~Acknowledge Orders (Read Receipt)~~ ✓ Complete
> Moved to Completed — see below.

---

### ~~Zeus Lead Nomination & Notification~~ ✓ Complete
> Moved to Completed — see below.

---

### ~~Mission Check Calendar (J2)~~ ✓ Complete
> Moved to Completed — see below.

---

### After-Action Reports (AARs)
> **Deferred** — large task, to be scoped and built later.

---

## Pending

<!-- Tasks confirmed ready to start go here -->

---

## Completed

### Log Recruit → Billet Point Award
`awardInterviewPoint()` in `app/api/admin/j1/applications/[id]/route.ts` increments `j1Interviews` by 1 and recalculates `promotionPoints` when the J1 Lead sets status to `accepted`. The J1 Lead is notified when the recruiter submits their recommendation, and the recruiter is notified with a DM when the final decision is made. Fully implemented end-to-end.

### Returning Member Detection & Routing
Added DD discharge type check to `runReturningMemberCheck()` — DD type now triggers REVIEW regardless of return column value. Added `sendChannelMessage()` to `lib/discord/bot.ts` (respects dev mode, logs to discord_logs). Wired channel ping to J1-Recruitment channel on REVIEW trigger using `DISCORD_J1_RECRUITMENT_CHANNEL_ID` and `DISCORD_J4_ROLE_ID` env vars. Both vars added to `.env.template`.

### Reinstate Member — Selective Data Restoration
Rewrote `ReinstateModal` in `app/dashboard/j4/J4AdminPanel.tsx` with a two-step flow: select member → checklist of data to restore (qualifications, awards & citations, trainings, campaign medals & op attendance), pre-checked by default with counts from the discharge snapshot. Updated `app/api/admin/members/discharged/route.ts` — GET now accepts `?memberId=xxx` to return snapshot counts; PATCH accepts `restoreItems[]` and applies selective `$set` operations from the `dischargeSnapshots` collection before removing the discharged flag.

### Reviewed By Field
`reviewedBy` now only set at final accept/reject by J1 Lead (`app/api/admin/j1/applications/[id]/route.ts`). Removed from recruiter recommendation block and from intermediate J1 Lead actions. Import route (`app/api/admin/j1/import/route.ts`) now uses `r.recruiter` field instead of the importing admin's name.

### PHQ/CHQ Attendance Confirmation Tasks
PHQ is covered — `getSectionLeaders` returns the first occupied position per (category + sectionTitle), so the platoon commander in each "X Platoon HQ" section is always included when their platoon category is in `assignedPlatoons`. CHQ (`companyHQ`) was not covered because it was only queried if `'companyHQ'` was in `attendanceAssignedPlatoons`. Fixed in `lib/attendance/tasks.ts`: always union `attendanceAssignedPlatoons` with `['companyHQ']` before calling `getSectionLeaders`.

### CHQ Allocation Reminder
Added step 1b to `app/api/cron/operations/route.ts`. Fires in the 5-minute cron window when: RSVP is closed, op is Upcoming, op starts within 60 minutes, and the reminder hasn't fired yet (`chqAllocationReminderSentAt` absent). Checks how many attending reservists (those in ORBAT reservist positions) still lack a `reservistSection` assignment; if any, sends an in-app notification to all `companyHQ` section leaders. The `chqAllocationReminderSentAt` flag is always stamped on the attendance doc (even if no unassigned reservists) so the reminder never fires twice. Added `chqAllocationReminderSentAt?: Date` to the `OperationAttendance` type.

### Custom Attendance Units
Added `customUnits` field to `AttendanceData` interface in `AttendancePanel.tsx`. Built a `customUnitMap` (name → color) in the render. Custom unit color is now applied to matching sections (members assigned via `reservistSection`) in the existing `byCategory` loop. Added a post-loop render for custom units that have no members yet — shows an empty Accordion with the unit name and color swatch. Suppressed the "Reservist" chip for members whose `reservistSection` matches a custom unit name (they're unit members, not reservists).

### Custom ERA List
Added `era_options` MongoDB collection (`lib/mongo.ts`) and `EraOption` global type (`types/operation.d.ts`). Created `app/api/admin/era-options/route.ts` (GET public, POST/PATCH/DELETE J2 Lead gated) with auto-seeding of the original 6 options on first access. Built `app/dashboard/j2/tabs/EraOptionsTab.tsx` with inline rename/delete; added "ERA Options" tab to J2Panel (J2 Lead only, tab index 5). Replaced hardcoded `<select>` in the operation edit page with a dynamic list fetched from the API; falls back to hardcoded options if fetch hasn't completed. `pageTheme` type broadened from a union to `string` to accept arbitrary ERA values.

### Reservist Allocations
Built `components/operations/ReservistAllocationPanel.tsx` — a collapsible HQ-only panel in the attendance view. Lists active and inactive reservists with their current section assignment, RSVP status, and a section dropdown for each. Dirty-state tracking shows a save button only when changes exist. Saves via POST to `/api/operations/[id]/attendance/manage` with a `moves` array. Summary row shows how many reservists are assigned per section. Integrated into `AttendancePanel.tsx` above the attendance-by-section view, gated on `isHQ`. Also fixed pre-existing TS errors: `allowedTypes` prop not threading through `ActiveEditor` in `CollabEditor.tsx`, and `staff/page.tsx` projection type cast.

### Zeus Lead Nomination & Notification
Added `leadZeus` + `leadZeusName` fields to `OperationAttendance`. New `PATCH /api/operations/[id]/attendance/lead-zeus` route — CHQ-only, sets or clears the nomination and sends a Discord DM (`sendLeadZeusDM` added to `lib/discord/bot.ts`) to the nominated member. In `AttendancePanel.tsx` (HQ only): a cyan-accented panel below the Reservist Allocations section with a member dropdown (all non-not_attending members) and a Nominate/Clear button. `applyData` initialises leadZeus state from the attendance doc on load.

### Acknowledge Orders (Read Receipt)
Moved acknowledgement from per-operation to per-document. New `operation_doc_acknowledgements` MongoDB collection and `DocAcknowledgement` global type. Rewrote `app/api/operations/[id]/acknowledge/route.ts` — GET now accepts `?pageId=` and returns `{ acknowledged, acks, eligible, notAcknowledged }` (eligible = all All Staff + HQ Staff users); POST body includes `{ pageId }`. Built `app/operations/[id]/DocAcknowledgeCard.tsx` — a self-contained client component that fetches its own ack state, shows a yellow "scroll to bottom" banner at the top and an acknowledge button + "View Acknowledgements" collapsible list at the bottom (green tick = read, red cross = not read, with timestamp). Added static yellow banner + DocAcknowledgeCard to single-page view in `page.tsx`. Wired both into `paged-view.tsx` per active page. Edit page acknowledge fetch updated to use `?pageId=main` and derive count from `acks.length`.

### J2 Member Operations Folder — Layout Alignment
Added list/tree view toggle to the Operations sub-tab in `app/dashboard/j2/tabs/MembersWorkspaceTab.tsx`. Tree mode fetches campaigns and renders collapsible campaign groups (blue header, missions inside) and a "Standalone Missions" group for ops without a campaign — matching the campaign tree layout of `J2OperationsTab.tsx`. List mode retains the existing status-grouped layout with search, filter chips, and pagination. Added `ViewList` and `AccountTree` toggle buttons to the section header. New state: `opsViewMode`, `campaigns`, `loadingCampaigns`, `expandedCampaigns`.

### Mission Check Calendar (J2)
Added two J2-specific calendar event types on top of the existing `DeptCalendarTab`/`react-big-calendar`. J2 Leads can now block unavailability slots (red events, `isJ2Unavailability: true`). Any J2 member can submit a mission check request (blue events, `isMissionCheckRequest: true`) — this creates a `mission_check` task assigned to the J2 Lead role, fans out in-app notifications to all J2 leads, and sends a confirmation notification to the requester. New `J2EventModal` handles both creation flows with operation-selector and date/time pickers. `DeptCalendarTab` extended with `isJ2Lead` prop, two new action buttons, per-type filter toggles, and coloured event styling. Calendar API extended to handle the new flags with permission gates. `NotificationType` extended with `mission_check_requested` and `mission_check_confirmed`.

### All Staff — Read-Only Operation View
`app/operations/[id]/staff/page.tsx` — new route with read-only operation details (no mission dev, schedule, attendance, or billet points). `components/editor/PageSidebar.tsx` extended with: (1) drag insert line between items (2px accent line replaces border-on-item approach) so users can precisely insert between documents; (2) folder nesting via drag-onto-item middle zone — nested pages indent with `paddingLeft: 16`; (3) Staff Orders type-modal redesigned with colour-coded callsign presets (HQ red, 1PL yellow, 2PL dark green, 3PL blue) and sub-section options (1-1 Alpha/Bravo/Charlie, 1-2 Alpha/Bravo/Charlie, 1-3 Echo/Golf/Hotel/Mike/Victor); (4) "Import sections" button on `staff_orders` pages — modal lets user pick a source document and select individual sections (checkbox list with All/None toggles) then copies them into the current page via `ydoc.transact()`.

### Request Orders Check
Added DELETE handler to `app/api/operations/[id]/orders-check/route.ts` — mission maker (or J2 lead) can cancel an active request; marks task `completedAt` with `ordersCheckStatus: 'cancelled'` and notifies all J2 leads. Added `'set_reminder'` action to PATCH handler — any J2 member can store `ordersCheckMakerReminderAt` on the task. Added step 1b to `app/api/cron/task-reminders/route.ts` — fires a one-shot in-app reminder to the mission maker (`assignedBy`) when `ordersCheckMakerReminderAt` passes; stamps `ordersCheckMakerReminderFiredAt` to prevent re-fire. Edit page (`app/operations/[id]/edit/page.tsx`): added "Cancel Request" button on the status card (shown when status is not confirmed), and a "Remind me" DateTimePicker + Save button shown after J2 Lead confirms the check time.
