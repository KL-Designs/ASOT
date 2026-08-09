# Phase 5 — Training Records Redesign

**Status:** 🔲 Not started  
**Depends on:** Phases 1–4 complete. Read `docs/global-spec.md` first.

---

## What to Build

Redesign the J3 Training Records table and detail views to support Selection/RC linked records, start/end dates, rich filtering/sorting, and live sync from the active course workspace.

---

## Spec References

§10 (start/end dates), §36 (TR creation), §37 (table columns), §38 (detail view), §39 (filters), §40 (sorting), §42 (live sync)

---

## Schema Changes

### Training Record

The existing `training_events` / `training_attendance` collections handle BCT/Medical/etc.
For Selection and RC, the **course workspace is the source of truth**; the Training Record is a derived/linked summary.

Existing `TrainingEvent` type lives in `types/training.d.ts`. Check current fields before adding.

**Add to TrainingEvent (or create a parallel `extended_training_records` collection if existing schema is too rigid):**

```typescript
interface TrainingRecordExtensions {
    // Link to course workspace (Selection / RC only)
    linkedCourseInstanceId?: string
    linkedCourseType?: 'selection' | 'reinforcement_cycle'

    // Dates (existing only has a single date — add end date)
    startDate?: Date
    endDate?: Date

    // Summary fields (synced from course workspace)
    candidateCount?: number
    staffCount?: number
    passedCount?: number
    failedCount?: number
    withdrawnCount?: number

    // Lead instructor (synced)
    leadInstructorId?: string
    leadInstructorName?: string

    // All assigned instructors/observers (synced)
    instructors?: Array<{ userId: string; name: string; role: string }>

    // Status (synced from course status)
    // Already has status field — verify existing values align
    // Target: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'archived'

    // For imported historical records (Phase 6)
    isHistoricalImport?: boolean
    legacyTicketRef?: string
    importBatchId?: string
    importedAt?: Date
    importedById?: string

    // Locked flag (set when course is completed)
    isLocked?: boolean
    lockedAt?: Date
    lockedById?: string
}
```

The simplest approach: add these fields directly to `training_events` collection documents and update the `TrainingEvent` type in `types/training.d.ts`. Check existing type first to avoid conflicts.

---

## Training Records Table — New Column Order (spec §37)

| # | Column | Source |
|---|--------|--------|
| 1 | Training / Course | `trainingType` or `linkedCourseInstanceId` ref |
| 2 | Training Type | e.g. Selection, Reinforcement Cycle, BCT, Medical |
| 3 | Lead Trainer / Instructor | `leadInstructorName` |
| 4 | Start Date | `startDate` (or existing `date`) |
| 5 | End Date | `endDate` |
| 6 | Status | status badge |
| 7 | Trainee Count | `candidateCount` or attendance count |
| 8 | Staff Count | `staffCount` |
| 9 | Passed | `passedCount` |
| 10 | Failed | `failedCount` |
| 11 | Quiz Time Taken | where applicable (existing field) |
| 12 | Last Updated | `updatedAt` |

Show `—` for missing data. Never fabricate.

---

## Training Record Detail Page (spec §38)

Prefer a dedicated page over modal for Selection/RC records (they're complex).
For simple BCT/Medical records, existing detail pattern can remain.

Route: `/dashboard/j3/training-records/[id]`

Sections:
1. **Header** — course name, type, status badge, start/end dates, last updated
2. **Staff** — lead instructor, all instructors, observers
3. **Candidates/Trainees** — table with: number, name, attendance, result (passed/failed/withdrawn/rerolled)
4. **Attendance Summary** — per-session breakdown where available
5. **Results** — passed count, failed count, withdrawn, rerolled
6. **Linked Documents** — Trainer's Guide, Training Document, Training Video, course workspace link
7. **Notes** — free text (editable if course not locked)
8. **Legacy Reference** — ticket number if historical import
9. **Activity History** — from `course_activity_logs` for linked course, or own log for standalone records

From the Training Record, provide "Open Course Workspace →" button if `linkedCourseInstanceId` exists.

---

## Filters (spec §39)

Add/update the Training Records top toolbar:

**Existing filters to keep:** All / Pending Review / Passed / Failed

**New filters:**
- Year selector (default: current calendar year, clearly labelled)
  - "All Years" option
- Date range (start/end)
- Training type (multi-select: Selection, Reinforcement Cycle, BCT, Medical, ...)
- Lead trainer/instructor (member search)
- Any trainer/instructor (member search)
- Trainee/candidate (member search)
- Status (multi-select)
- Result: Passed / Failed
- Has Notes (checkbox)
- Historical/Imported records (checkbox)
- Free-text search (searches name, notes, ticket ref)

**Active filter UX:**
- Show active-filter badges below toolbar (each dismissible)
- "Clear All Filters" button when any filter active
- Result count displayed ("Showing 12 records")

Default state: current year filter active, all others off.

Persist filter/sort state in URL query params for shareability.

---

## Sorting (spec §40)

Sortable columns (click header to toggle asc/desc):
- Training / Course name (alphabetical)
- Training type (alphabetical)
- Lead instructor (alphabetical)
- Start date (chronological — NOT alphabetical)
- End date (chronological)
- Status (by status order: in_progress → scheduled → completed → cancelled → archived)
- Trainee count (numeric)
- Staff count (numeric)
- Passed (numeric)
- Failed (numeric)
- Quiz time (numeric)
- Last updated (chronological)

Show sort arrow indicator on active sort column.
Default sort: Start date descending (most recent first).

---

## Live Sync from Course Workspace (spec §42)

For active Selection/RC courses, the Training Record automatically updates when:

| Course workspace event | Training Record update |
|------------------------|------------------------|
| Candidate added | candidateCount++ |
| Candidate removed | candidateCount-- |
| Candidate status → passed | passedCount++ |
| Candidate status → failed | failedCount++ |
| Candidate status → withdrawn/rerolled | withdrawnCount++ |
| Staff assignment changed | instructors[], staffCount, leadInstructorName |
| Session date changed | startDate (S1), endDate (S6) |
| Course status changed | status |
| Course notes updated | notes |
| Course closed | isLocked: true, lockedAt, lockedById |

Implementation approach:
- Sync happens inside the same API handler that mutates course data (same request, not a separate job)
- Use `Db.trainingEvents.updateOne({ linkedCourseInstanceId: id }, { $set: {...} })` inside candidate/staff/status mutation routes
- This avoids dual-write inconsistency from async jobs
- Store `linkedCourseInstanceId` on the Training Record at course creation time

Course workspace = source of truth. Training Record summary = derived. Do not store the same data in two places unless a snapshot is needed for historical integrity.

---

## Training Record Creation (spec §36)

When a Selection or RC course instance is created (existing Phase 1 logic):
- Create a linked Training Record in `training_events`
- Set `linkedCourseInstanceId`
- Set initial status, startDate from session 1 date, endDate from session 6 date
- Bidirectional link: CourseInstance also stores `trainingRecordId`

From course workspace: "Open Training Record →" button (already planned as placeholder).
From Training Record detail: "Open Course Workspace →" button.

---

## Locked Record Editing (spec §43, handled fully in Phase 6)

Phase 5 responsibility: show lock state in Training Record UI.
- Display a locked badge when `isLocked: true`
- Disable direct editing of locked fields
- Show "Propose Edit" option in place of direct edit (Phase 6 implements the approval flow)

---

## Files to Create / Modify

```
types/training.d.ts                                 — add TrainingRecordExtensions fields to TrainingEvent
lib/mongo.ts                                        — verify trainingEvents already registered (it is)
app/dashboard/j3/training-records/                  — existing location; read current files before editing
app/dashboard/j3/training-records/[id]/page.tsx     — new detail page
app/api/j3/training-records/[id]/route.ts           — GET/PATCH (if not already existing)
app/api/j3/course-instances/[id]/route.ts (PATCH)   — add sync calls on status change
app/api/j3/course-instances/[id]/candidates/route.ts — add sync calls on add/remove/status change
app/api/j3/course-instances/[id]/staff/route.ts     — add sync call on change
app/api/j3/course-instances/[id]/sessions/route.ts  — add sync call on date change
```

Read existing training records UI files before modifying — preserve BCT/Medical record handling.

---

## Acceptance Checks (from spec §50)

- [ ] Training Record created automatically when Selection/RC course is created
- [ ] Course workspace shows "Open Training Record →" and Training Record shows "Open Course Workspace →"
- [ ] Training Record table uses new column order
- [ ] Current-year filter is active by default and clearly labelled
- [ ] Year filter supports "All Years"
- [ ] All requested filters can be combined
- [ ] Active filter badges visible and individually dismissible
- [ ] All relevant columns are sortable; dates sort chronologically
- [ ] Training Record detail page shows all required sections
- [ ] Course workspace updates sync to Training Record (candidates, staff, dates, status)
- [ ] Closing a course sets isLocked on Training Record
- [ ] Locked Training Records display lock badge and disable direct editing
- [ ] Missing data shows `—`, never fabricated
- [ ] BCT/Medical records continue to work as before
