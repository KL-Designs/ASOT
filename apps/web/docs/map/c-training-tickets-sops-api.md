# Part C — Training / Tickets / SOPs / Backups API

Scope: `app/api/training/**` (27), `app/api/training-docs/**` (3), `app/api/tickets/**` (11), `app/api/sops/**` (2), `app/api/backups/**` (7). 50 files total.

Note: `app/api/tickets/**` is the **community feedback/tickets system**, not the admin discharge/promotion ticket workflow. It reads/writes `Db.communityTickets` and `Db.communityTicketComments`, gated by `PERMISSIONS.communityTickets.manage` and `PERMISSIONS.departmentLeads.*` — distinct from `Db.tickets` used elsewhere.

---

## app/api/training/**

#### /api/training/events
- **GET** — lists training events; visibility varies by role (J3 leads see all, trainers see approved+own, others see approved/Scheduled+Completed); also returns per-event slot counts (trainer/trainee/sit-in + waitlist) and the caller's own RSVP. Gate: `client.fetchMe()` only (no explicit role check beyond query scoping via `PERMISSIONS.training.manage`/`.trainer`). Collections: `Db.trainingEvents`, `Db.trainingAttendance`.
- **POST** — creates a new training event (pending approval by default), auto-RSVPs the creator into a trainer slot, notifies J3 lead roles. Gate: `PERMISSIONS.training.create`. Collections: `Db.trainingEvents` (insert), `Db.trainingTypes` (read), `Db.trainingAttendance` (insert). Side effects: `createNotificationForRole` to J3 leads, `logAction('training.event.create')`.

#### /api/training/events/[id]
- **GET** — none (no GET handler in this file; attendance GET is in the attendance subroute).
- **PATCH** — edits an event (title/description/location/duration/server/mods/slots/scheduledAt/trainingType); editable by J3 lead or owner-while-pending; blocked once Completed. Gate: `PERMISSIONS.training.manage` OR owner+pending. Collections: `Db.trainingEvents`, `Db.trainingTypes` (read on type change).
- **DELETE** — soft-deletes an event (`deletedAt`) and removes its linked calendar event; blocked once Completed. Gate: `PERMISSIONS.training.manage` OR owner. Collections: `Db.trainingEvents`, `Db.calendarEvents`.

#### /api/training/events/[id]/approve
- **POST** — approves a pending event: creates a `Db.calendarEvents` entry, sets `approvalStatus: 'approved'`, schedules 60/15-min reminders. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingEvents`, `Db.calendarEvents` (insert). Side effects: `createNotification` to trainer, `sendTrainingApprovedDM` (Discord DM), `scheduleTrainingReminders()`, `logAction('training.event.approve')`.

#### /api/training/events/[id]/reject
- **POST** — rejects a pending event with optional reason. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingEvents`. Side effects: `createNotification`, `sendTrainingRejectedDM` (Discord DM), `logAction('training.event.reject')`.

#### /api/training/events/[id]/cancel
- **POST** — cancels a Scheduled/approved event (not Completed/already-Cancelled), deletes linked calendar event, notifies attendees. Gate: `PERMISSIONS.training.manage` OR owner (`trainerId === me.id`). Collections: `Db.trainingEvents`, `Db.calendarEvents`, `Db.trainingAttendance` (read attendees). Side effects: `createNotification` per attendee, `cancelTrainingReminders()`.

#### /api/training/events/[id]/complete
- **POST** — marks a Scheduled+approved event Completed, builds attendee list from attendance records, creates a pending `Db.trainingTickets` record for J3 review, links `ticketId` back onto the event. Gate: `PERMISSIONS.training.manage` OR owner. Collections: `Db.trainingEvents`, `Db.trainingAttendance` (read), `Db.trainingTickets` (insert). Side effects: `createNotificationForRole` (J3 leads), `createNotification` (trainer if someone else completed it), `logAction('training.event.complete')`.

#### /api/training/events/[id]/attendance
- **GET** — lists attendance records for an event, sorted by slot/status/name. Gate: `PERMISSIONS.training.manage` OR event owner. Collections: `Db.trainingAttendance`, `Db.trainingEvents`.
- **POST** — member RSVP: cancel, or slot-based RSVP (trainer/trainee/sit-in) with capacity checks producing `attending`/`waitlist`; trainer slot requires `PERMISSIONS.training.trainer`; auto-promotes first waitlisted trainee on cancel/switch; manages a `Db.calendarReminders` entry (60-min-before) for confirmed attendees. Gate: `hasPermission(user, 'pages.member')`. Collections: `Db.trainingAttendance`, `Db.trainingEvents`, `Db.calendarReminders`. Side effects: `createNotification` on waitlist promotion, `logAction('training.rsvp.*')`.
- **PATCH** — bulk-marks `attended: boolean` for a list of members (post-session sign-off). Gate: `PERMISSIONS.training.manage` OR event owner. Collections: `Db.trainingAttendance`.

#### /api/training/events/[id]/award-qualifications
- **POST** — for a Completed+approved event, awards the matching `CERTIFICATIONS` entry (from `lib/military/certifications`) to each attended-but-unawarded member (pushes to `milpac.qualifications`, increments `milpac.promotionPoints`), marks `qualificationAwarded` on the attendance record. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingEvents`, `Db.trainingAttendance`, `Db.users`. Side effects: `createNotification` per member.

#### /api/training/import
- **POST** — parses a pasted CSV (F/Date/Trainees/J3 Staff/Training Run/Notes/Ticket#) into `training_import_records`; does not create live `TrainingEvent`/`TrainingTicket` docs. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingImportRecords` (insertMany). Side effects: `logAction('training.import.csv')`.
- **GET** — paginated list of previously imported CSV records. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingImportRecords`.

#### /api/training/master-sheet
- **GET** — paginated/filterable aggregation of training events joined with their `training_tickets` (via `$lookup` on `eventId`), plus distinct trainer and training-type lists for filter dropdowns. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingEvents` (aggregate), `Db.trainingTypes`.

#### /api/training/requests
- **GET** — lists training requests; J3 leads see all, members see pending/approved only. Gate: `hasPermission(user, 'pages.member')`. Collections: `Db.trainingRequests`.
- **POST** — member submits a request for a training type with optional preferred time/description. Gate: `hasPermission(user, 'pages.member')`. Collections: `Db.trainingRequests` (insert), `Db.trainingTypes` (read). Side effects: `createNotificationForRole` to J3 lead roles, `logAction('training.request.submit')`.

#### /api/training/requests/[id]
- **PATCH** — cancels the caller's own pending request (or any, if J3 lead). Gate: `hasPermission(user, 'pages.member')` + (owner OR `PERMISSIONS.training.manage`). Collections: `Db.trainingRequests`.

#### /api/training/requests/[id]/approve
- **POST** — J3 approves a request: creates a new approved `Db.trainingEvents` doc (trainer override or requester, scheduledAt override/preferredAt/+7 days fallback), auto-RSVPs trainer, marks request `approved` with `approvedEventId`, schedules reminders. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingRequests`, `Db.trainingTypes` (read), `Db.trainingEvents` (insert), `Db.trainingAttendance` (insert). Side effects: `scheduleTrainingReminders()`, `createNotification` to requester + interested members, `logAction('training.request.approve')`.

#### /api/training/requests/[id]/reject
- **POST** — rejects a pending request with optional reason. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingRequests`. Side effects: `createNotification`, `logAction('training.request.reject')`.

#### /api/training/requests/[id]/interest
- **POST** — toggles the caller's "interested" flag on a pending request (`interestedUserIds`/`interestedCount`). Gate: `hasPermission(user, 'pages.member')`. Collections: `Db.trainingRequests`.

#### /api/training/tickets
- **GET** — J3 leads see all training tickets; trainers see only their own (limit 100). Gate: `PERMISSIONS.training.trainer`. Collections: `Db.trainingTickets`.

#### /api/training/tickets/[id]
- **GET** — fetch a single ticket; visible to J3 leads or the owning trainer. Gate: `PERMISSIONS.training.trainer` + (owner OR `PERMISSIONS.training.manage`). Collections: `Db.trainingTickets`.
- **PATCH** — trainer edits `trainerNotes` / per-attendee `passed`/`notes` while ticket is `pending`/`amendments_requested`. Gate: `PERMISSIONS.training.trainer` + (owner OR manage). Collections: `Db.trainingTickets`.

#### /api/training/tickets/[id]/approve
- **POST** — approves a pending/amendments_requested ticket: applies per-attendee pass patches, increments trainer's `milpac.billetCounts.{billetField}` by the event's `billetPointsAwarded`, marks trainee qualifications awarded for passed trainees. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingTickets`, `Db.trainingEvents` (read), `Db.users` (inc billet points). Side effects: `createNotification` to trainer, `logAction('training.ticket.approve')`.

#### /api/training/tickets/[id]/reject
- **POST** — rejects a non-finalised ticket with optional notes. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingTickets`. Side effects: `createNotification`, `logAction('training.ticket.reject')`.

#### /api/training/tickets/[id]/amend
- **POST** — requests amendments on a pending ticket (requires `amendmentNotes`), sets status `amendments_requested`. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingTickets`. Side effects: `createNotification` to trainer, `logAction('training.ticket.amend')`.

#### /api/training/types
- **GET** — lists training types (auto-seeds `TRAINING_TYPE_DEFAULTS` if collection empty); visibility scoped by role (J3 leads: all, trainers: active+wip, members: active only). Gate: `hasPermission(user, 'pages.member')`. Collections: `Db.trainingTypes`.
- **POST** — creates a new training type (name/category/billetField/points/description/status/etc). Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingTypes` (insert). Side effects: `logAction('training.type.create')`.

#### /api/training/types/[id]
- **PATCH** — updates a training type's fields (core info, status incl. legacy `isActive` sync, event defaults, resource links, sortOrder). Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingTypes`. Side effects: `logAction('training.type.edit')`.

#### /api/training/types/[id]/docs
- **GET** — lists documents attached to a training type; visibility scoped (J3 leads: all, trainers: approved+own, members: approved only). Gate: `hasPermission(user, 'pages.member')`. Collections: `Db.trainingTypeDocs`.
- **POST** — attaches a doc (title/url/description) to a training type; auto-approved if J3 lead, otherwise `pending`. Gate: `PERMISSIONS.training.manage` OR `PERMISSIONS.training.create`. Collections: `Db.trainingTypeDocs` (insert), `Db.trainingTypes` (read). Side effects: `createNotificationForRole` to J3 leads when submitted by a non-lead trainer.

#### /api/training/types/[id]/docs/[docId]
- **DELETE** — deletes (soft, sets `deletedAt`) a doc; J3 leads can delete any, uploaders can withdraw their own non-approved submissions. Gate: `PERMISSIONS.training.manage` OR (uploader + not-approved). Collections: `Db.trainingTypeDocs`.

#### /api/training/types/[id]/docs/[docId]/approve
- **POST** — approves a pending doc. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingTypeDocs`, `Db.trainingTypes` (read for notif text). Side effects: `createNotification` to uploader.

#### /api/training/types/[id]/docs/[docId]/reject
- **POST** — rejects a pending doc with optional note. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingTypeDocs`, `Db.trainingTypes` (read). Side effects: `createNotification` to uploader.

#### /api/training/types/seed
- **POST** — upserts `TRAINING_TYPE_DEFAULTS` into `Db.trainingTypes` (idempotent via `$setOnInsert`), returns count inserted. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingTypes`.

---

## app/api/training-docs/**

(Google-Docs-style folder/document tree, distinct from `training/types/[id]/docs` above — this is the standalone knowledge base under `Db.trainingDocs`.)

#### /api/training-docs
- **GET** — lists items (`?parentId=`) in a folder or root, sorted folders-first then alphabetical; excludes `htmlContent`/`imageFiles` in projection. Gate: `hasPermission(user, 'pages.member')`. Collections: `Db.trainingDocs`.
- **POST** — creates a folder or blank document (JSON body), or uploads/parses a Google Docs `.zip` export (multipart) into a new document via `parseGoogleDocsZip`. Gate: `PERMISSIONS.trainingDocs.manage`. Collections: `Db.trainingDocs` (insert, then update after zip parse; deletes doc if parse fails).

#### /api/training-docs/[id]
- **GET** — fetches a full document including `htmlContent`. Gate: `hasPermission(user, 'pages.member')`. Collections: `Db.trainingDocs`.
- **PATCH** — updates name/parentId (move, with self-move and non-folder-target guards)/htmlContent (sanitized via `sanitizeDocHtml`)/iconName/color. Gate: `PERMISSIONS.trainingDocs.manage`. Collections: `Db.trainingDocs`.
- **DELETE** — deletes an item; folders are deleted recursively (children + their images via `deleteDocImages`). Gate: `PERMISSIONS.trainingDocs.manage`. Collections: `Db.trainingDocs`.

#### /api/training-docs/images/[filename]
- **GET** — serves an uploaded training-doc image from `uploads/training-docs/` with path-traversal guard (`path.basename`) and long-lived cache header. Gate: `hasPermission(user, 'pages.member')`. Collections: none (filesystem read).

---

## app/api/tickets/** (community tickets — `Db.communityTickets`)

#### /api/tickets
- **GET** — lists community tickets with filtering (category/status(es)/sort/department/tag) and visibility scoping: J4 (`communityTickets.manage`) sees all (+ optionally soft-deleted), dept leads see their dept's tickets, everyone else sees `visibility: 'public'` only; excludes heavy fields (activityLog, mission/campaign long-text) via projection. Gate: `client.fetchMe()` only, scoping via role checks. Collections: `Db.communityTickets`.
- **POST** — creates a new ticket; routes to department(s) via `routeTicket(subtype, responsibleDept)` (mod-request→j4+j7, bug-website/milpac/teamspeak→j7, bug-arma/discord/other→j4, mission/campaign→j2, feature-request→responsibleDept+j4, default→j4); private categories (`unit-feedback`, `complaint`, `award`) forced to `visibility: 'private'`; de-dupes `mod-request` by normalized `modLink` regex match (409 `DUPLICATE_MOD`). Gate: `client.fetchMe()` only. Collections: `Db.communityTickets` (insert). Side effects: `logAction('ticket.create')`, `notifyTicketDeptLeads()` per routed department.

#### /api/tickets/[id]
- **GET** — fetches a ticket with its comments joined in; enforces private-visibility gate (J4 or dept lead for the ticket's departments only); includes `myVote`. Gate: `client.fetchMe()` + visibility check. Collections: `Db.communityTickets`, `Db.communityTicketComments`.
- **PATCH** — multi-purpose updater gated per-field: status change (J4/dept-lead) syncs legacy `status` + `statuses[]`; department reassign (J4 only); multi-dept set (J4 only); tags (J4 only); title/description edit (author or J4); restore from soft-delete (J4 only); `ticketTags` and `memberVisible` (J4/dept-lead); full `statuses[]` replace (J4/dept-lead); `reopen` flag removes `closed` from statuses. Gate: varies per field, computed via `getLeadDepts()` helper checking `PERMISSIONS.departmentLeads`. Collections: `Db.communityTickets`. Side effects: `logAction('ticket.status_change'|'ticket.restore'|'ticket.reassign')`, `createNotification` + `sendFeedbackStatusDM` on status change, `notifyTicketDeptLeads` + `createNotification` on reopen.
- **DELETE** — soft-deletes (`isDeleted: true`, `deletedAt`/`deletedById`); author or J4 only. Gate: author OR `PERMISSIONS.communityTickets.manage`. Collections: `Db.communityTickets`. Side effects: `logAction('ticket.delete')`.

#### /api/tickets/[id]/comments
- **GET** — lists non-deleted comments for a ticket; respects ticket visibility (private → J4 only). Gate: `client.fetchMe()` + visibility check. Collections: `Db.communityTicketComments`, `Db.communityTickets` (read visibility).
- **POST** — adds a comment; increments `commentCount`, pushes `activityLog` entry. Gate: same visibility check. Collections: `Db.communityTicketComments` (insert), `Db.communityTickets` (update). Side effects: `createNotification` + `sendFeedbackCommentDM` to ticket author (unless anonymous ticket or self-comment).

#### /api/tickets/[id]/comments/[commentId]
- **PATCH** — edits own comment content; sets `isEdited`. Gate: comment author only. Collections: `Db.communityTicketComments`, `Db.communityTickets` (push activityLog).
- **DELETE** — soft-deletes a comment (`isDeleted: true`), decrements `commentCount`. Gate: comment author OR `PERMISSIONS.communityTickets.manage`. Collections: `Db.communityTicketComments`, `Db.communityTickets`.

#### /api/tickets/[id]/comments/[commentId]/vote
- **POST** — toggles up/down vote on a comment (`direction: 'up'|'down'|null`), recomputes `voteScore`. Gate: ticket visibility check (private → J4 only), `client.fetchMe()`. Collections: `Db.communityTicketComments`.

#### /api/tickets/[id]/vote
- **PATCH** — toggles up/down vote on the ticket itself, recomputes `voteScore`. Gate: ticket visibility check. Collections: `Db.communityTickets`.

#### /api/tickets/[id]/tasks
- **POST** — adds a task (title/description/assignee user-or-role/dueAt/chaseUpAt) to a ticket's `tasks[]`. Gate: J4 or dept lead for the ticket's department(s) (via `getLeadDepts()`). Collections: `Db.communityTickets`. Side effects: `logAction('ticket.task_create')`, and if assigned: `createNotification` + `sendTaskAssignedDM` to the assigned user, or to all `Db.users` holding the assigned role; `logAction('ticket.task_assigned')`.

#### /api/tickets/[id]/tasks/[taskId]
- **PATCH** — updates a task's status(pending/completed)/title/description/dueAt/assignee fields via positional `tasks.$` update. Gate: J4 or dept lead. Collections: `Db.communityTickets`. Side effects: `logAction('ticket.task_complete')` when marked completed.
- **DELETE** — removes a task from `tasks[]`. Gate: J4 or dept lead. Collections: `Db.communityTickets`.

#### /api/tickets/[id]/transfer
- **POST** — adds a department to a ticket's `departments[]` (J4 can also change primary `department`); requires `toDepartment` to be a valid `PERMISSIONS.departments` key. Gate: J4 or dept lead for the ticket. Collections: `Db.communityTickets`. Side effects: `logAction('ticket.transfer')`, `notifyTicketDeptLeads()` to the new department.

#### /api/tickets/[id]/uploads
- **POST** — uploads image/video attachments (type/size validated: images ≤8MB, video ≤50MB, max 10 total) to `uploads/community-tickets/{id}/`, appends filenames to `attachments[]`. Gate: ticket author or J4. Collections: `Db.communityTickets`. Filesystem write.
- **GET** — serves an attachment file by name with path-traversal guard, respecting ticket visibility (private → J4 only). Gate: visibility check. Filesystem read.

#### /api/tickets/similar
- **GET** — `?title=&category=` fuzzy-matches existing public tickets by word-overlap similarity (Jaccard-like, threshold 0.4, top 5) — used for duplicate-detection UI. Gate: `client.fetchMe()` only. Collections: `Db.communityTickets`.

---

## app/api/sops/**

#### /api/sops
- **GET** — lists all SOPs (excludes `yjsState` collab payload from projection), plus `isJ4` flag. Gate: `hasPermission(user, 'pages.member')`. Collections: `Db.sops`.
- **POST** — creates a new SOP shell (title/category/description); the Y.js document body is populated separately via the collab editor (`sop-{sopId}`). Gate: `PERMISSIONS.sops.manage`. Collections: `Db.sops` (insert).

#### /api/sops/[id]
- **PATCH** — updates title/category/description metadata (not content — that's collab-edited). Gate: `PERMISSIONS.sops.manage`. Collections: `Db.sops`.
- **DELETE** — hard-deletes the SOP document. Gate: `PERMISSIONS.sops.manage`. Collections: `Db.sops`.

---

## app/api/backups/**

All routes gated by `PERMISSIONS.departments.j4` (J4 department membership) and back onto two restic repositories (`storage/db-backups/`, `storage/media-backups/`) plus `lib/backups.ts` helpers rather than MongoDB — backups are deduplicating, hourly, tiered-retention restic snapshots, not a `Db.*` collection. Replaced the old full-copy-zip `/api/snapshots/**` system; retention is automatic (`restic forget --prune`), so there is no manual per-point delete route.

#### /api/backups
- **GET** — merged backup timeline (`listBackups()`, one entry per hour bucket with either/both DB and media sides present) and current operation status (`readStatus()`). Gate: `PERMISSIONS.departments.j4`. Collections: none (restic repos + JSON status file via `lib/backups`).

#### /api/backups/create
- **POST** — fire-and-forget triggers `runAllBackups()` in the background (DB dump + media, sequentially); rejects (409) if an operation is already in progress. Gate: `PERMISSIONS.departments.j4`. No DB collection; writes to the two restic repos.

#### /api/backups/upload
- **POST** — accepts a multipart-uploaded `.zip` (buffered fully in memory), writes it to a temp path, then fire-and-forget `applyUploadedZip(tmpPath)`; rejects if not idle. Gate: `PERMISSIONS.departments.j4`. Filesystem only — does not feed the upload into either restic repo's history.

#### /api/backups/revert
- **POST** — reverts to a merged backup point resolved server-side from a client-supplied hour-bucket `id` via `listBackups()` (never trusts the id directly), fire-and-forget `revertToPoint()`; rejects if not idle or point not found. Gate: `PERMISSIONS.departments.j4`. Restic restore + filesystem only.

#### /api/backups/cancel
- **POST** — force-resets a stuck in-progress operation back to `idle` via `writeStatus()`. Gate: `PERMISSIONS.departments.j4`. Filesystem/status-file only.

#### /api/backups/config
- **GET** — reads backup config (`autoEnabled`/`keepHourly`/`keepDaily`/`keepWeekly`/`keepMonthly`). Gate: `PERMISSIONS.departments.j4`. Filesystem config file.
- **PATCH** — updates config with clamped ranges (`keepHourly` 1–200, `keepDaily` 1–90, `keepWeekly` 1–52, `keepMonthly` 1–60). Gate: `PERMISSIONS.departments.j4`. Filesystem config file.

#### /api/backups/[id]/download
- **GET** — restores a backup point to a temp zip (`buildDownloadZip()`) and streams it to the browser as an attachment (Node `createReadStream` → web `ReadableStream`), deleting the temp zip once fully streamed. Gate: `PERMISSIONS.departments.j4`. Restic restore + filesystem only.
