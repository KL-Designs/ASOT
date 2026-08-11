# TASKS.md — ASOT Website Outstanding Tasks & Phases

This file tracks all outstanding tasks, active phases, and pending work across the project.
**Every prompt that contains tasks, steps, edits, or phases must have entries added here.**
Ask "what outstanding tasks or phases do we have?" at any time to get a current status.

Completed items are marked `[x]`. Do not delete entries.

---

## Outstanding Tasks

- [x] **Training Documents tab — delete & recycle bin** — confirmed working
- [x] **DOCX import — text formatting** — confirmed bold/italic carries through correctly
- [x] **Rich text formatting toolbar** — confirmed working across all editable fields
- [x] **Revision section** — confirmed working; DOCX import of revision section confirmed
- [x] **Test Training Guide DOCX import** — confirmed all sections parse correctly

- [ ] **Activity Log Revamp** — expand the J4 activity log to capture in-depth information across the entire website; log every edit, change, addition, and deletion site-wide with date, time, user, department, and action detail (full prompt planned separately)
- [ ] **J2 Operations Orders Importer** — import historical operation orders (PDF format) into existing completed campaigns and single missions; to be built in the J4 Import Panel following import consolidation rules
- [ ] **AI Implementation Log update** — `AI_IMPLEMENTATION_LOG.md` still shows Phases 3–6 as "Pending"; update to reflect confirmed-complete status

- [ ] **Multiple checkpoint questions** — allow chaining multiple questions at a single video checkpoint; user answers each in sequence before the video resumes

- [ ] **Permission-key registry with rename backwards-compatibility** — the new `hasPermission(user, key)` system (`lib/orbat/hasPermission.ts`) has no central catalog of valid keys; each key is just a string literal at its call site and inside `DepartmentRole.permissions`/`OrbatRole.permissions` arrays in MongoDB. If a key is ever renamed, any DB documents still holding the old string silently stop granting access — no error, just quiet loss of access, and no compile-time or runtime signal that anything broke. Proposed fix: a small `lib/orbat/permission-keys.ts` with a canonical key list plus a `RENAMED_KEYS: Record<oldKey, newKey>` alias map that `hasPermission()` resolves through before checking. Raised during the Batch 2 permission migration (see `docs/superpowers/plans/2026-08-11-permission-system-migration-phase2-batch2-plan.md`); deferred until brainstormed properly — likely candidate for folding into the Phase 3 cleanup of the old `PERMISSIONS`/`hasRoles()` system.

- [x] **Department quick links (J1-J7) + Members>Settings rename**, per-department managed quick links (favicon tile rail on each J1-J7 landing view, manager card in the renamed Settings view), restriction gated server-side behind 14 new `deptLinks.*` permission keys (`lib/permissions.ts`), favicons fetched through a new SSRF-guarded fetcher (`lib/safe-fetch.ts`) and served from our own domain; confirmed working

---

## YouTube Embed Migration (complete)

- [x] **Join / Recruitment video** — YouTube embed with custom controls confirmed working
- [x] **J1 Admin — Recruit Video tab** — YouTube URL input confirmed working
- [x] **J3 Training videos** — YouTube embed per training video confirmed working
- [x] **J3 Admin — training video management** — YouTube URL input confirmed working
- [x] Checkpoint questions system confirmed working over embedded YouTube player

---

## Dead Code Cleanup

- [ ] Delete `app/dashboard/ImportPanel.tsx` — no longer imported by anything after the J4 import hub was created
- [ ] Delete `app/dashboard/j4/tabs/TrainingImportTab.tsx` — no longer used after Training Import tab was removed from J4 Admin Panel

---

## J3 Training Guide DOCX Import (complete)

- [x] `mammoth` installed as dependency
- [x] `docs/training-guide-template.md` — structured template for trainers with H1/H2/H3/H4 heading guide
- [x] `app/api/training-guides/import/route.ts` — parses DOCX via mammoth, creates draft guide
- [x] `app/dashboard/j4/import/tabs/TrainingGuideImportTab.tsx` — drag/drop upload UI with result display
- [x] `app/dashboard/j4/import/tabs/J3ImportTab.tsx` — updated to sub-tabs: Training Records | Training Guides
- [x] `types/mammoth.d.ts` — minimal type declaration (no @types/mammoth available)

---

## Next Up — Selection & Reinforcement Cycle (S&R)

All AI system phases and pre-S&R tasks are now complete. Next work block is finishing any remaining S&R cycle edits and polish.

- [ ] Review S&R cycle for any remaining polish items or outstanding bug reports before closing off

---

## Remaining Pre-S&R Tasks (complete before S&R work resumes)

- [ ] **Dead code cleanup** — delete the two unused files listed in the Dead Code Cleanup section above
- [ ] **AI Implementation Log** — update `AI_IMPLEMENTATION_LOG.md` to mark Phases 3–6 complete
- [x] **Operation document duplication** — confirmed fixed; no extra pages appearing
- [x] **Staff Orders page colours** — confirmed each section shows its own colour in the sidebar

---

## Bug Fixing / Final Checks / Website Testing

Run these tests when going live, involving other department members and staff. Add items here any time a new check is identified.

### Operations & Editor
- [ ] Confirm staff can access operations editing in a condensed view to add their platoon/section orders
- [ ] Confirm only Zeus-role users can see Zeus Notes pages inside operations documents
- [ ] Organize and combine all existing campaigns into the correct structure
- [ ] Back-import all historical operation orders into completed campaigns/missions

### Tickets
- [ ] Submit each member-facing ticket type as a regular member and confirm it is received correctly
- [ ] Confirm notifications fire to the correct department for each ticket type
- [ ] Confirm department staff can action/respond to each ticket type
- [ ] Test the full ticket lifecycle: submit → assign → resolve → close

### J3 Training Hub
- [ ] J3 trainer creates a guide/document and submits it for approval
- [ ] J3 lead tests the Send Back for Review workflow
- [ ] J3 lead tests the Approve and Deny system for submitted guides
- [ ] Confirm only J3 trainers and leads can view or edit training documents (regular members cannot access)
- [ ] Confirm J3 leads receive a notification when a trainer submits a document for review

### J1 Recruitment
- [ ] Confirm the recruit video plays when arriving via the Enlist Now button on the home page
- [ ] Note: direct URL access to `/join` does not autoplay — acceptable behaviour

### General
- [ ] Run a full site accessibility pass with a non-staff member account to confirm role-gating is correct
- [ ] Confirm all department left-hand nav entries match the actual tabs in each panel

---

## Completed Phases

### AI System — Phases 1–6 (all confirmed working)
- [x] Phase 1 — Shared AI service layer + J4 AI Admin tab
- [x] Phase 2 — Intel Image Creator (J2 panel, camera overlays, image library)
- [x] Phase 3 — Intel Package slide editor + CHQ Orders rename + default page order
- [x] Phase 4 — Recruitment Video (J1 `/join` page, J1 Recruit Video tab, admin upload)
- [x] Phase 5 — Training Hub content model (guides, draft/approval/versioning)
- [x] Phase 6 — Training Videos + checkpoint questions + AI written-answer review

### J3 Course System — Phases 1–6 (all confirmed working)
- [x] Phase 1 — Course creation and candidate management
- [x] Phase 2 — Course workspace, sessions, staff assignments
- [x] Phase 3 — Peer review system (waiting room, ranking, Borda scoring)
- [x] Phase 4 — Candidate feedback and catch-up plans
- [x] Phase 5 — Training Records (filters, detail page, live sync)
- [x] Phase 6 — Historical import, post-completion approvals, Reopen Course, J4 activity logging

### Import Panel Consolidation
- [x] J4 import hub page created at `/dashboard/j4/import`
- [x] J1 Application Records import tab with duplicate detection
- [x] J3 Training CSV import tab (wrapper around existing component)
- [x] J4 sub-tabs: ORBAT & Mastersheet, Attendance, Member Emails, Retired Records
- [x] J1 check-duplicates API route created
- [x] Training import analyze route updated with duplicate detection against existing records
- [x] J4 Admin Panel: Import Panel button changed to link to `/dashboard/j4/import`; Training Import tab removed
- [x] J3 Panel: CSV Import tab removed
- [x] Left-hand sidebar: CSV Import removed from J3 nav
- [x] Left-hand sidebar: Recruit Video added to J1 nav (after TFAR Plugin, leads only)

### Operation Document Page Duplication Fix
- [x] Default page init now waits for real Hocuspocus sync signal instead of 3-second timer
- [x] Legacy operations (pre-pageOrder) detected via section content check; migrated cleanly without new defaults
- [x] CHQ Orders (main page) deletion now permitted; navigation moves to next available page
- [x] Add Document button remains available even if all pages are deleted

### J3 Historical Import — Duplicate Detection UI
- [x] Duplicate banner above type mapping table
- [x] Dupe count badge on group rows
- [x] Red highlight + EXISTS label on individual duplicate sessions in expanded view
- [x] Summary line updated to show new vs duplicate session counts separately

### Development Rules & Tooling
- [x] `DEVELOPMENT_RULES.md` created in project root
- [x] Claude Code `UserPromptSubmit` hook configured — reads rules every 10 prompts
- [x] `TASKS.md` created for phase and task tracking
- [x] Role terminology shortcuts, voice-to-text aliases, response format rules all added to `DEVELOPMENT_RULES.md`

---

## Merged from `bulk-tasks` branch — Task Queue (historical)

> The `bulk-tasks` branch tracked work in this format before being merged in. Kept verbatim below for history; fold anything still outstanding into the sections above as it's picked up.

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
