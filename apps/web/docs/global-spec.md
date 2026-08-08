# ASOT J3 Course System — Global Spec

This file captures the cross-phase rules and implementation state.
Read this alongside the relevant phase file at the start of any session.

---

## Implementation Status

| Phase | Status | Summary |
|-------|--------|---------|
| 1 | ✅ Complete | Course templates, ordering, SEL/RC creation, sequential numbering, active-instance limits, soft delete |
| 2 | ✅ Complete | Course workspace, session & candidate details, member selector, permanent candidate numbers, session scheduling, staff assignments |
| 3 | ✅ Complete | Session instruction pages (training guide template), catch-up builder (S5/S6), candidate feedback, attendance, activity log |
| 4 | ✅ Complete | Peer-review task delivery, waiting room, timed ranking/feedback, additional-time, consolidated results |
| 5 | ✅ Complete | Training Record redesign, start/end dates, detail pages, filters/sorting, live course sync |
| 6 | ✅ Complete | Post-completion approvals + reopen, J4 activity logging, Google Sheets historical import |

---

## Global Rules (apply to every phase)

- Place all features inside the J3 Training Hub.
- Reuse existing components: permissions, task workflows, Discord notifications, calendars, applicant selectors, document navigation, collaborative editing, audit logs, approval flows, recycle-bin behaviour, activity-log patterns.
- Use the existing J3 Trainer's Document template for session instruction pages.
- Preserve red-and-black styling. No white browser date pickers.
- J4 has unrestricted access and administrative authority across the entire system.
- Nothing is permanently deleted through the normal UI — always soft delete.
- All permission checks must be server-side.
- All course/candidate numbers are generated server-side to prevent races.

---

## Existing Key Files

```
lib/mongo.ts                                          — Db singleton, all collections
lib/permissions.ts                                    — PERMISSIONS constant
lib/discord/index.ts                                  — client.fetchMe(), client.hasRoles()
types/course-instance.d.ts                            — CourseInstance, CourseInstanceCounter
types/course-workspace.d.ts                           — CourseSession, CourseCandidate, PermanentCandidateCounter,
                                                        CourseStaffMember, CourseSessionStaff, CandidateSessionAttendance,
                                                        CandidateEventFeedback, CourseActivityLog, CatchUpPlan,
                                                        CatchUpSelectedTeachingPoint, CatchUpSelectedEquipment
lib/training/session-dates.ts                         — calculateSessionDates(), SESSION_DEFS
lib/training/session-events.ts                        — getSessionEvents(n), 18 events across 6 sessions
components/training-guide/TrainingGuideEditor.tsx     — full guide editor; props: guide, guideId, isEditable, accentColor, outlineColor, hideDocRef?
app/dashboard/unit/training-hub/course/[id]/
  CourseWorkspaceClient.tsx                           — sidebar nav, session/candidate/staff state, renders all tabs
  tabs/SessionInstructionTab.tsx                      — per-session: staff, guide editor (S1-4) or catch-up builder (S5-6), attendance panel
  tabs/CatchUpPlanSection.tsx                         — catch-up plan builder for sessions 5 & 6
  tabs/CandidateFeedbackTab.tsx                       — per-candidate: collapsible sessions, attendance, pos/neg feedback, autosave
  tabs/ActivityTab.tsx                                — activity log with filter pills
```

## Existing MongoDB Collections

```
course_instances            — CourseInstance
course_instance_counters    — CourseInstanceCounter (SEL/RC sequential numbers)
course_sessions             — CourseSession (6 per instance)
course_candidates           — CourseCandidate
permanent_candidate_counters — PermanentCandidateCounter (global, never reset)
course_staff                — CourseStaffMember (course-level)
course_session_staff        — CourseSessionStaff (per-session)
candidate_attendance        — CandidateSessionAttendance
candidate_event_feedback    — CandidateEventFeedback
course_activity_logs        — CourseActivityLog
catchup_plans               — CatchUpPlan (sessions 5 & 6 content builder)
training_guides             — TrainingGuide (session guide docs keyed docRef: "session-{sessionId}")
```

## Existing API Routes (J3)

```
GET/POST/PATCH/DELETE  /api/j3/course-instances
GET/PATCH              /api/j3/course-instances/[id]
GET                    /api/j3/course-instances/[id]/sessions
PATCH                  /api/j3/course-instances/[id]/sessions  (sessionId, scheduledDate/catchUpRequired/sessionStatus)
GET/POST/PATCH/DELETE  /api/j3/course-instances/[id]/candidates
GET/POST/DELETE        /api/j3/course-instances/[id]/staff
GET/POST/DELETE        /api/j3/course-instances/[id]/sessions/[sessionId]/staff
GET/PATCH              /api/j3/course-instances/[id]/sessions/[sessionId]/attendance
GET                    /api/j3/course-instances/[id]/sessions/[sessionId]/guide   (creates blank guide on first call)
GET/PATCH              /api/j3/course-instances/[id]/sessions/[sessionId]/catchup-plan
GET                    /api/j3/course-instances/[id]/session-guides  (non-catchup sessions + their guides)
GET/PATCH              /api/j3/course-instances/[id]/candidates/[candidateId]/feedback
GET/PATCH              /api/j3/course-instances/[id]/candidates/[candidateId]/attendance
GET                    /api/j3/course-instances/[id]/activity
GET                    /api/j3/candidate-search  (?q=, ?courseInstanceId= to exclude existing)
```

## Permission Keys (PERMISSIONS.training.manage)

Used on all J3 course routes. J4 role bypasses all checks automatically.

## Data Conventions

- MongoDB ObjectId stored as `_id`; passed to client as `.toString()`
- `me.id` = Discord user ID string
- `me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''` = display name pattern
- Soft delete: set `deletedAt: Date` field; queries filter `{ deletedAt: { $exists: false } }`
- Dates stored as `Date` objects in MongoDB
- Candidate numbers: unpadded integers (1, 2, 3 — not 001)
- Course instance refs: padded 3-digit (SEL-001, RC-001)
