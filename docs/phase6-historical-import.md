# Phase 6 — Historical Import, Post-Completion Approvals, J4 Activity Logging

**Status:** 🔲 Not started  
**Depends on:** Phases 1–5 complete. Read `docs/global-spec.md` first.

---

## What to Build

Three independent sub-features, best tackled in order:
1. Post-completion edit approval system (affects courses closed in Phase 5)
2. J4 activity log entries for all major course system events
3. Historical Training Record import from Google Sheet

---

## Sub-Feature 1: Post-Completion Approvals (spec §22, §43)

### When a course is closed (set to Completed):
- Lock the course workspace and Training Record (`isLocked: true`)
- Disable direct editing for everyone including lead instructors and J3 staff
- Show "Propose Edit" in place of edit controls on locked fields
- J3 leads and J4 may still directly correct records — but it MUST be logged as an authorised post-completion correction (not silently)

### Proposed Change Flow:

```typescript
// New collection: change_proposals
interface ChangeProposal {
    _id?: ObjectId
    entityType: 'course_candidate' | 'candidate_feedback' | 'candidate_attendance' | 'training_record' | 'course_session' | 'course_instance'
    entityId: string
    courseInstanceId: string
    fieldPath: string                  // e.g. "feedback.session-xxx.event-yyy.positiveObservations"
    previousValue: string
    proposedValue: string
    proposedBy: string                 // userId
    proposedByName: string
    proposedAt: Date
    status: 'pending' | 'approved' | 'rejected'
    reviewedBy?: string
    reviewedByName?: string
    reviewedAt?: Date
    reviewComment?: string
    approvedValue?: string             // may differ from proposedValue if reviewer edits
    isDirectCorrection: boolean        // true when J3 lead/J4 bypasses proposal and edits directly
}
```

Add to `lib/mongo.ts`: `changeProposals: db.collection('change_proposals') as MongoCollection<ChangeProposal>`

### API Routes:
```
POST   /api/j3/course-instances/[id]/change-proposals
       — submit a proposed edit (any authenticated user with course access)
       — body: { entityType, entityId, fieldPath, previousValue, proposedValue }
       — notifies J3 leads via website notification + Discord DM

GET    /api/j3/course-instances/[id]/change-proposals
       — list proposals for this course (instructor view)

PATCH  /api/j3/course-instances/[id]/change-proposals/[proposalId]
       — approve/reject; J3 leads and J4 only
       — body: { action: 'approve'|'reject', comment?: string, approvedValue?: string }
       — on approve: apply the change to the actual entity, log as approved correction

POST   /api/j3/course-instances/[id]/direct-correction
       — J3 leads/J4 only; applies an edit directly but still creates an audit entry
       — body: { entityType, entityId, fieldPath, previousValue, newValue, reason }
```

### UI:
- In locked sections (candidate feedback, attendance, course details), show a pencil/propose icon
- Clicking opens a small "Propose Edit" panel showing current value and a text area for proposed value
- Pending proposals shown in Activity History with "Pending Approval" badge
- Approved proposals shown with green "Approved" badge
- J3 leads see a notification badge and a "Pending Reviews" section in the course sidebar or overview

---

## Sub-Feature 2: J4 Activity Logging (spec §44)

Extend the existing `action_logs` collection (already used for J4 activity log via `logAction()` in `lib/logAction.ts`).

### Events to log (use `logAction()` pattern):

| Event | action string | category |
|-------|--------------|----------|
| Course created | `course.create` | `J3` |
| Course closed/completed | `course.close` | `J3` |
| Course reopened | `course.reopen` | `J3` |
| Course deleted (soft) | `course.delete` | `J3` |
| Course restored | `course.restore` | `J3` |
| Candidate number assigned | `candidate.number_assigned` | `J3` |
| Candidate added | `candidate.add` | `J3` |
| Candidate removed | `candidate.remove` | `J3` |
| Peer review tasks sent | `peer_review.send` | `J3` |
| Peer review unlocked | `peer_review.unlock` | `J3` |
| Time extension approved | `peer_review.extension_approved` | `J3` |
| Time extension rejected | `peer_review.extension_rejected` | `J3` |
| Post-completion edit approved | `course.change_approved` | `J3` |
| Post-completion edit rejected | `course.change_rejected` | `J3` |
| Historical import started | `training_record.import_start` | `J3` |
| Historical import completed | `training_record.import_complete` | `J3` |
| Historical import failed | `training_record.import_fail` | `J3` |
| Training Record manually corrected | `training_record.direct_correction` | `J3` |

### logAction() call pattern (existing):
```typescript
import { logAction } from '@/lib/logAction'
await logAction({
    action: 'course.create',
    category: 'J3',
    performedBy: me.id,
    performedByName: displayName,
    department: 'J3',
    entityType: 'course_instance',
    entityId: courseInstance._id.toString(),
    after: { courseRef, courseType, status },
    summary: `Created ${courseRef}`,
})
```

Check `lib/logAction.ts` for exact signature before using.

Add logging calls into the relevant API route handlers (most of which already exist from Phases 1–5). This is largely additive — insert `logAction()` calls without restructuring existing logic.

---

## Sub-Feature 3: Historical Training Record Import (spec §41)

### Source
- Google Sheet: `https://docs.google.com/spreadsheets/d/1bnSvLBDTVCNY37Tb0cFTD3G2S7TIGgbtkioXyKsBcTE/edit?gid=1849720519#gid=1849720519`
- Sheet tab: `Training Record`

### Source columns (from spec):
- Date
- Trainees
- J3 Staff
- Training Run
- Notes
- Ticket Number

### Consolidation Rule
Historical data uses a row-continuation pattern: a dated header row followed by continuation rows without a date. Consolidate all continuation rows under the most recent dated header row into a single Training Record.

### Import Process

**Step 1: Fetch sheet data**
Use Google Sheets API or export as CSV. Restricted to J4 / admin.

**Step 2: Parse and consolidate**
- Each row with a date = start of a new Training Record
- Continuation rows (no date) = append their Trainees, J3 Staff, Notes to the current record
- Result: one normalised Training Record object per training occurrence

**Step 3: Idempotency**
Track by source spreadsheet ID + source row range (first row of each group):
```typescript
interface ImportedRecord {
    sourceSheetId: string     // spreadsheet ID from URL
    sourceRowRange: string    // e.g. "42-45" (rows 42–45 consolidated into one record)
    importBatchId: string
    importedAt: Date
}
```
On re-run: if `sourceSheetId + sourceRowRange` exists in DB → skip (no duplicate). Log as "skipped".

**Step 4: Data mapping**
| Source field | Training Record field |
|-------------|----------------------|
| Date | `startDate` (endDate = null / `—`) |
| Trainees | trainees array (store as text if no user match found) |
| J3 Staff | instructors array (store as text if no user match found) |
| Training Run | `title` / training name |
| Notes | `notes` |
| Ticket Number | `legacyTicketRef` |

**Missing fields** (no source data): store `null`/`undefined`; display as `—`. Do NOT infer end dates, pass/fail, or lead instructor.

**Status:** All imported records → `status: 'completed'`, tag with `isHistoricalImport: true`, `importBatchId`.

**Step 5: Report**
Return JSON: `{ imported: N, skipped: N, failed: N, errors: [...] }`

### API Routes:
```
POST   /api/admin/j3/training-record-import/preview
       — J4 only; dry run; returns parsed records, consolidation result, would-import vs skip counts
       — body: { sheetId?: string }  (defaults to the known sheet)

POST   /api/admin/j3/training-record-import/run
       — J4 only; executes import; returns report
       — idempotent: safe to run multiple times

GET    /api/admin/j3/training-record-import/batches
       — list past import batches with counts
```

### UI:
- Admin page under J4 panel or a J4-accessible route
- Preview table showing records to be imported with consolidation preview
- "Run Import" button (confirmation required)
- Import log showing each batch with timestamp, counts, errors

---

## Reopen Course (spec §22)

Controlled action for J3 leads and J4.

Add "Reopen Course" to the course status menu (only visible when status = completed).
On reopen:
- Set status back to `in_progress`
- Clear `isLocked` on Training Record
- Log as `course.reopen` in activity log
- Require a reason (text field in confirmation modal)
- Notify J3 leads via website notification

After reopening, normal editing resumes. Post-completion approval flow suspends until closed again.

---

## Files to Create / Modify

```
types/course-workspace.d.ts            — add ChangeProposal type
lib/mongo.ts                           — add changeProposals collection
lib/logAction.ts                       — verify signature, no changes likely needed
app/api/j3/course-instances/[id]/change-proposals/route.ts  — POST + GET
app/api/j3/course-instances/[id]/change-proposals/[pid]/route.ts  — PATCH
app/api/j3/course-instances/[id]/direct-correction/route.ts        — POST
app/api/admin/j3/training-record-import/preview/route.ts           — POST
app/api/admin/j3/training-record-import/run/route.ts               — POST
app/api/admin/j3/training-record-import/batches/route.ts           — GET

— UI modifications:
app/dashboard/unit/training-hub/course/[id]/CourseWorkspaceClient.tsx  — add Reopen, show lock state, proposals badge
app/dashboard/j4/tabs/AIAdminTab.tsx or new J4 tab                     — import UI
```

Add `logAction()` calls to existing route handlers. Read each handler before modifying.

---

## Acceptance Checks (from spec §50)

- [ ] Closing a course locks it — no direct editing by anyone including lead instructor
- [ ] Every post-completion edit requires J3 lead or J4 approval
- [ ] Proposed changes show before/after values
- [ ] Proposals can be approved, rejected, or returned with comments
- [ ] Submitter notified of outcome
- [ ] J3 lead/J4 direct corrections still create an audit entry
- [ ] J4 activity log records all listed event types
- [ ] Course created/closed/deleted/restored events appear in J4 log
- [ ] Peer review send/unlock/extension events appear in J4 log
- [ ] Historical sheet entries consolidate continuation rows correctly into one record each
- [ ] Missing historical values stored as null and displayed as `—`
- [ ] Legacy ticket numbers stored as `legacyTicketRef` only — not used as new record IDs
- [ ] Importing the same sheet twice does not create duplicate records
- [ ] Import preview/dry-run available before committing
- [ ] Import report shows imported / skipped / failed counts
- [ ] Import restricted to J4
- [ ] Reopen Course available to J3 leads and J4 when status = completed
- [ ] Reopen requires a reason, clears lock, logs the action
