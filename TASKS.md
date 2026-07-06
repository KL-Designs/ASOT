# Task Queue

---

## J1 Recruitment

### ~~Log Recruit → Billet Point Award~~ ✓ Complete
> Moved to Completed — see below.

---

### Returning Member Detection & Routing
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

### Reinstate Member — Selective Data Restoration
When reinstating a returning member, give J1 Staff a checklist to select which data from their discharge snapshot gets restored:
- Qualifications
- Awards & citations
- Trainings
- Campaign medallions / operation attendance

The member's discharge record and previous application both remain — a new entry is created for their new service period.

> **Code context:** Reinstate currently exists at `app/api/admin/members/discharged/route.ts` (PATCH) and `app/dashboard/j4/J4AdminPanel.tsx` (`ReinstateModal`). It only does `$unset: { discharged: '' }` — no data restoration at all. The `dischargeSnapshots` collection (defined in `lib/mongo.ts`) already stores the full milpac snapshot including qualifications, awards, and trainings from discharge time. The checklist UI and data restoration logic both need to be built on top of the existing reinstate modal.

---

## J1 Mastersheet

### Reviewed By Field
The `reviewed by` field on recruit records should reflect:
- **Old / imported data:** the recruiter who handled the application.
- **New recruits going forward:** the J1 Lead who approved the application (set at approval time).

No old records will have this field populated — only new recruits from this point forward.

> **Code context:** `reviewedBy` is set in three places in `app/api/admin/j1/applications/[id]/route.ts`. Line 252 sets it to the recruiter when they submit their recommendation; line 329 sets it again on J1 Lead actions (potentially overwriting). For imports (`app/api/admin/j1/import/route.ts` line 127), it is set to the importing admin's name — not the original recruiter. **What needs to change:** ensure `reviewedBy` is only set to the J1 Lead at the point of final approval (accept/reject), not overwritten by intermediate actions or set to the wrong person on import.

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

### J2 Member Operations Folder — Layout Alignment
Auto-population already works — `app/dashboard/j2/tabs/MembersWorkspaceTab.tsx` fetches `/api/operations?authorId=${memberId}`. However, the workspace member tab renders a **simple flat list**, while `app/dashboard/j2/tabs/J2OperationsTab.tsx` (the main J2 Operations tab) has a full-featured layout: status filters, pagination, campaign tree view, list/tree view toggle, template picker, and recycle bin.

Align the member workspace Operations tab layout to match `J2OperationsTab.tsx`.

---

## Orders / Operations

### All Staff — Read-Only Operation View
Create a simplified operation view for **All Staff**, based on the existing `/operations/[id]/edit` editor.

All Staff **cannot** see:
- Mission development section
- Schedule and automation settings
- Attendance settings
- Billet points

All Staff **can** see (read-only, no editing):
- Operation details

All staff will be able to add documents to the operations page as they will create their own orders for their callsign/unit. When they select the add document button, it will prompt them with the type of document they'd like to create but will only show the Document page and Staff Orders page options. (No Zeus Notes and After Action Review option at this time)

For both J2, CHQ and All staff, add the ability to click and drag operation documents into a folder structure which will show them in a subdirectory layout. When dragging the document, provide a drag line indicator so that they can insert it between the existing documents. Otherwise, if dragged on top of an existing document, it them places that document underneath and offset to the existing document. Essentially creating a folder/file system for the documents so they can be organised neatly. They will also be required to reorder documents in the "folders" if required.

Also, when selecting the Staff orders page when creating a document, it currently shows the platoons in all the same colour. HQ orders select option should be in red. 1PLT should be renamed to 1PL and stay as yellow. 2PLT should be renamed to 2PL and be changed to dark green. 3PLT should be changed to 3PL and changed to blue.

Then for each PL, the following sub options will be available once selecting the PL.
```
1PL
  1-1 Alpha
  1-1 Bravo
  1-1 Charlie
2PL
  1-2 Alpha
  1-2 Bravo
  1-2 Charlie
3PL
  1-3 Echo
  1-3 Golf
  1-3 Hotel
  1-3 Mike
  1-3 Victor
```

This allows staff to easily select/set the orders document name.

Lastly, once they select their callsign, they will be able to copy sections from certain orders to their new document. E.g. they can select to copy the situation section from CHQ orders. Or they can choose to copy/import the execution section from their PHQ orders. This will allow them to quickly import sections/data from their HQ's orders and then edit them to what they want on their callsign version.

> **Code context:** The edit page is `app/operations/[id]/edit/page.tsx`. Sections present: mission development, schedule & automation, attendance & platoon allocation, ownership/billet points, custom attendance units, and the collab document editor. Document types are defined in `components/editor/PageSidebar.tsx` — available types: Document Page, Staff Orders Page, Zeus Notes Page, After Action Review, Separator. Staff Orders presets are `'HQ Orders'`, `'1 PLT Orders'`, `'2 PLT Orders'`, `'3 PLT Orders'` (hardcoded strings). **What is missing:**
> - The All Staff read-only view does not exist — needs a new page/route or conditional rendering.
> - Drag-and-drop folder hierarchy for documents is not implemented — sidebar only supports add/remove/reorder as a flat list.
> - Staff Orders presets use old PLT names, wrong colours, and have no sub-section options (1-1 Alpha etc.) — all hardcoded, needs redesigning.
> - Section copy/import from other orders documents is not implemented.

---

### PHQ/CHQ Attendance Confirmation Tasks
PHQ and CHQ need to confirm that members actually attended and that staff have completed the attendance confirmation process.

> **Code context:** `lib/attendance/tasks.ts` and `app/api/cron/operations/route.ts` handle automated task creation. When an op moves to Completed, `createAttendanceTasksForOperation()` creates tasks for every section leader (`isSenior` ORBAT position) in the assigned platoons — with a 24hr deadline and 12hr chase-up reminder. **What needs confirming:** Are PHQ and CHQ already captured by the `isSenior` ORBAT positions in the assigned platoons? If so, they already receive tasks. If PHQ/CHQ is a separate role not covered by `isSenior`, a separate task creation path is needed.

---

### Reservist Allocations
CHQ manually assigns reservists to missions during the allocation phase. Add UI support for this within the existing allocations workflow. The provided `res allocation.csv` is the current system — referencing attendance posts, marking section numbers, tracking which reservists are attending and their callsign preferences.

We want to recreate this. The current manage attendance option when looking at an operation is large and messy. It needs to be easy to read and to assign/organise reservists to callsigns.

Ignore the text from row 47 onwards in `res allocation.csv` for now (that is for generating a Discord post).

> **Code context:** `reservistSection` field exists on attendance records and `reservistAssignments` exists on the attendance doc (`types/attendance.d.ts`). The API at `app/api/operations/[id]/attendance/manage/route.ts` already handles moving/setting `reservistSection` values. **What is missing:** A dedicated reservist allocation panel/UI within the operation view — the API supports it but there is no purpose-built interface for CHQ to easily see and assign reservists to sections for a specific operation.

---

### Custom ERA List
The ERA field on the operation editor (currently labelled "Theme", next to theme colour) should support custom user-defined entries.
- J2 Team Leads can add, edit, and remove ERA options from the list.

> **Code context:** The Theme field in `app/operations/[id]/edit/page.tsx` (lines 1251–1298) is a hardcoded `<select>` with options: Modern, WWII, Vietnam, Cold War, Fantasy, Sci-Fi, Other (which triggers a free-text `customTheme` input). There is no database collection for ERA options. **What needs building:** A new database collection for ERA/theme options, a management UI for J2 Team Leads to add/edit/remove entries, and replacing the hardcoded dropdown with a dynamic list.

---

### Custom Attendance Units
Custom attendance allows non-standard sections to be added alongside the pre-existing platoon structure.

Structure:
- **Callsign** = section name (e.g. `Sabre-1`)
  - **Roles** = roles within that section (e.g. Machine Gunner, Section Leader)

These display in the attendance view alongside the standard platoons. Discord ping roles for completion notification are already configured in the operation editor — no changes needed there.

> **Code context:** The management UI in `app/operations/[id]/edit/page.tsx` (collapsible panel, add/remove by name and colour, persisted via `/api/operations/${opID}/attendance/custom-units`) is fully built. **What is missing:** The operation view page (`app/operations/[id]/page.tsx`) has zero references to custom units — they are configured but never rendered in the actual attendance display alongside the platoons. The display side needs to be built.

---

### CHQ Allocation Reminder
If allocations have not been completed by **1 hour before mission start**, automatically send a reminder notification to **CHQ only**.

> **Code context:** `app/api/cron/operations/route.ts` currently sends a notification to section leaders when RSVP closes (defaults to 90 min before op start). **What is missing:** A separate trigger at exactly 1 hour before op start that checks whether allocations are complete and, if not, notifies CHQ specifically. No allocation-completeness check or CHQ-targeted reminder exists.

---

### Request Orders Check
Mission makers can submit a request for a J2 Lead to review their orders at any point during development.

- Already an existing orders check request. Check details/features and add/remove anything necessary.
- Available to all mission makers at any stage.
- The request captures the submitter and which mission it is for.
- Mission makers can cancel their request and resubmit at any time.
- On submission, all J2 Leads are notified.
- A J2 Lead is assigned to the check; they confirm the date/time with the mission maker.
- Both the lead and the mission maker can set custom reminders for the scheduled check.

> **Code context:** `app/api/operations/[id]/orders-check/route.ts` — POST creates an `orders_check` task notifying all J2 leads in-app and via Discord DM; PATCH supports `confirm` and `propose` (alternative time) actions with notifications back to the requester. UI state managed in the edit page. **What is missing:** There is no DELETE method and no cancel UI — mission makers cannot currently cancel their request. Custom reminders for both parties after confirmation are also not implemented.

---

### Acknowledge Orders (Read Receipt)
On the operation view page, add an acknowledgement card directly below the orders content for each document panel.
- One acknowledge action per document.
- A **yellow banner** displays at the top of the orders instructing the member to scroll down and acknowledge at the bottom.
- Acknowledgement acts as a read receipt, visible to all viewers of the operation.
- Add a button at the bottom of the document next to the acknowledge orders button, that is 'View Acknowledgements' or similar. This will display a list of people who have/haven't acknowledged the orders. Copy the attendance display order and have it with a green tick for read/acknowledged, red cross for not read/acknowledged. This option will be available for each page/document and reflect who has read each document.

> **Code context:** The current acknowledgement system (`app/api/operations/[id]/acknowledge/route.ts`) is **per-operation**, not per-document. It stores `{ userId, userName, acknowledgedAt }` in `operations.acknowledgements`. The edit page shows a count + expandable list + "Remind Unacknowledged" button. The view page (`app/operations/[id]/PageNavClient.tsx`) has a basic acknowledge button for eligible users. **What needs rebuilding:** The entire acknowledgement system needs to move from per-operation to per-document. The schema, API, and UI all need to change. The view/list UI (green tick / red cross per person, attendance-style) does not exist yet.

---

### Zeus Lead Nomination & Notification
During the allocation phase, CHQ nominates a Lead Zeus for the mission.
- The nominated Lead Zeus receives a **Discord DM** confirming they are Lead Zeus for that night.
- This will also feed into a future Discord operations post — scope that separately when ready.

> **Status: Not implemented.** No Lead Zeus nomination flow exists anywhere in the codebase. Needs to be built as part of the allocations workflow — a CHQ-only action that sets a `leadZeus` field on the operation/attendance doc and triggers a Discord DM to the nominated user.

---

### Mission Check Calendar (J2)
Extend the existing J2 calendar (same structure as the unit calendar):
- **J2 Leads** can block out unavailability.
- **Mission Makers** can add a "Request Mission Check" event, which:
  - Notifies all J2 Leads.
  - Creates a task in the task system that can be assigned to a J2 Lead.
  - Sends a confirmation back to the mission maker that a staff member will be assigned (following the existing confirmation system pattern).

> **Code context:** The J2 panel (`app/dashboard/j2/J2Panel.tsx`) has a Calendar tab that renders `DeptCalendarTab` fetching events from `/api/admin/calendar?department=j2` — a generic department event board built on `react-big-calendar`. A separate `MissionChecksTab.tsx` handles dev-check task assignment per operation. **What is missing:** J2 Lead unavailability blocking and mission maker booking into available slots are not implemented. The "Request Mission Check" calendar event type, its notification flow, and task creation all need to be built on top of the existing J2 calendar.

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
