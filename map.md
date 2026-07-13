# ASOT-Website — Site Map

Comprehensive reference of every page, API route, and lib/type/component file in this codebase: what it does, its permission gate, and which `Db.*` collections it touches. **Consult this before building or editing a feature** so you reuse existing routes/helpers/models instead of duplicating them.

**Maintenance:** this file is a snapshot, not derived automatically. When you add, remove, or significantly change a route, page, or lib/type/component file, update or add its entry here as part of the same change (see the maintenance instruction in CLAUDE.md).

## Table of Contents

- Part A — Admin API (`app/api/admin/**`)
- Part B — Operations + J2 API (`app/api/operations/**`, `app/api/j2/**`)
- Part C — Training / Tickets / SOPs / Snapshots API
- Part D — Misc API (teamspeak, cron, applications, gallery, community, uploads, etc.)
- Part E — Dashboard: J1–J4
- Part F — Dashboard: J5–J7, Personnel, ORBAT, Quiz, Retired, Tasks, Unit, Meeting, `_components`
- Part G — Public-facing pages (landing, operations board, members, maps, optionals, etc.)
- Part H — `lib/**`, `types/**`, `components/**`, root config

---


## Part A — Admin API

Catalogs every `route.ts` under `app/api/admin/**` (78 files). Background facts assumed (not repeated per-line): `Db` = `lib/mongo.ts` singleton; `PERMISSIONS` = `lib/permissions.ts`; `client.fetchMe()` / `client.hasRoles()` = `lib/discord/index.ts`; `logAction()` = `lib/logAction.ts` (some routes import the older `lib/logs.ts` re-export — noted per-file); `createNotification()`/`createNotificationForRole()` = `lib/notifications`.

---

#### Top-level

- `GET /api/admin/activity` — paginated action-log feed with filters (department/category/entityType/userId/search/date range). J4 sees all depts; dept leads scoped to their own dept (department param required for non-J4). Gate: none explicit — J4 via `PERMISSIONS.departments.j4`, else must lead a dept per `PERMISSIONS.departmentLeads`. Collections: `Db.actionLogs`.
- `POST /api/admin/discord-bot-test` — diagnostic: verifies `DISCORD_BOT_TOKEN` via `/users/@me` and opens a self-DM channel. Gate: none (no auth check at all — should probably be removed/gated). Collections: none. Side effects: raw Discord REST calls.
- `GET/POST /api/admin/discord-devmode` — GET returns current Discord dev-mode flag; POST sets/toggles it and busts the in-process cache. Gate: `PERMISSIONS.departments.j4`. Collections: `Db.siteSettings` (`_id: 'discordDevMode'`). Side effects: `invalidateDevModeCache()` (`lib/discord/bot.ts`), `logAction()`.
- `GET /api/admin/guild-roles` — returns all synced Discord roles (excludes `@everyone`), sorted by name. Gate: any authenticated user (`fetchMe()` only). Collections: `Db.roles`.
- `GET/POST/PATCH/DELETE /api/admin/era-options` — GET is public and auto-seeds default era options (Modern/WWII/Vietnam/Cold War/Fantasy/Sci-Fi) if empty; POST/PATCH/DELETE manage custom entries. Gate: `PERMISSIONS.departmentLeads.j2` for mutations. Collections: `Db.eraOptions`.
- `GET /api/admin/logs` — unified viewer for `type=action|error|discord` logs, paginated, `category`/`status` filters. Gate: `PERMISSIONS.departments.j4`. Collections: `Db.errorLogs`, `Db.discordLogs`, `Db.actionLogs`.
- `POST /api/admin/mass-import` — bulk CSV import: parses an ORBAT CSV + a Billet Mastersheet CSV (custom multi-line-header parser), matches names via `client.buildOrbatLookup()`, wipes+rebuilds `Db.orbatPositions`, bulk-updates milpac billet counts/qualifications/promotion points, updates member names/ranks. Gate: `PERMISSIONS.admin.massImport`. Collections: `Db.users`, `Db.orbatPositions`. Side effects: drops/recreates ORBAT unique index on `userId`.
- `GET/PUT /api/admin/notification-policy` — per-notification-type force-website/force-discord override config. Gate: `PERMISSIONS.communityTickets.manage`. Collections: `Db.notifPolicyConfig`.
- `GET/POST/PUT /api/admin/task-limit-policy` — escalation-group config (roles, thresholds, recipient roles) for task-count escalation notices. Gate: `PERMISSIONS.departments.j4`. Collections: `Db.notifPolicyConfig` (`type: 'task_limit_policy'`). Falls back to hardcoded `DEFAULT_GROUPS` if unset.
- `GET/PUT /api/admin/task-lockout-policy` — per-role-group overdue-task lockout config, backed by `lib/lockout.ts` (`DEFAULT_LOCKOUT_GROUPS`). Gate: `PERMISSIONS.departments.j4`. Collections: `Db.notifPolicyConfig` (`type: 'task_lockout_policy'`).
- `GET/POST /api/admin/tasks` — GET lists tasks (`view=mine|created|all`, `includeCompleted`); role-based visibility via `client.roles` lookup. POST creates a task (direct assignee and/or role), validates assignable-role scope via `DEPT_ASSIGNABLE_ROLES`/`BROAD_ASSIGN_ROLES`. Gate: `PERMISSIONS.pages.admin` (all-view further gated by `PERMISSIONS.departments.j4`). Collections: `Db.tasks`, `Db.users` (role member lookup), `Db.notifications` (bulk insert). Side effects: `createNotification()`, `sendTaskAssignedDM()` (`lib/discord/bot.ts`).
- `GET /api/admin/tasks/lockout-status` — returns whether the current user is locked out due to overdue tasks, per `Db.notifPolicyConfig` lockout groups. Gate: `PERMISSIONS.pages.member` (soft-fails to `{locked:false}` if unauthenticated). Collections: `Db.notifPolicyConfig`, `Db.tasks`.
- `PATCH /api/admin/tasks/[id]` — giant action-dispatch endpoint. Actions: `complete`, `extend`, `request_extension`, `approve_extension_review`/`deny_extension_review`/`suggest_alternative_review` (delegates to direct actions via companion review-task), `approve_extension`/`deny_extension`/`suggest_alternative`, `request_reassignment`, `approve_reassignment`/`deny_reassignment`/`redirect_reassignment`, `start`, `request_delete`, `approve_delete`/`deny_delete`, `reopen`. Gate: `PERMISSIONS.pages.admin`; elevated actions additionally require task ownership or `PERMISSIONS.admin.manageOrbat`. Collections: `Db.tasks`. Side effects: extensive `createNotification()` + Discord DM calls (`sendTaskExtension*DM`, `sendTaskReassignment*DM`, `sendTaskDelete*DM` from `lib/discord/bot.ts`).
- `DELETE /api/admin/tasks/[id]` — deletes a task (creator or `PERMISSIONS.admin.manageOrbat`). Gate: `PERMISSIONS.pages.admin`. Collections: `Db.tasks`.
- `POST /api/admin/impersonate` — J4 impersonation: swaps `token` cookie to target user's token, stashes `original_token` + `is_impersonating` cookies. Gate: `PERMISSIONS.admin.impersonate`. Collections: `Db.users`.
- `POST /api/admin/impersonate/return` — restores original token from `original_token` cookie, clears impersonation cookies. Gate: cookie presence only (no role check needed — it's a return-to-self op). Collections: none.
- `GET/POST /api/admin/tickets` — GET lists tickets with filters (department/status/issuedById/requiredApproverUserId). POST creates one of several ticket types via `type` discriminator: `j3-promotion`, `move-request` (with section-leader approval routing + auto-approve logic via `applyOrbatMove()`), `j4-discharge`, `discipline`, `department-membership` (applies immediately, no approval — also calls `syncDeptDiscordRole()`), `performance-report`, default `j3-qualification`. Gate: `PERMISSIONS.pages.admin` baseline, per-type additional gates (`PERMISSIONS.departments.j3/j4`, `PERMISSIONS.departmentLeads[dept]`). Collections: `Db.tickets`, `Db.orbatPositions`, `Db.users`. Side effects: `createNotification()`/`createNotificationForRole()`, `syncDeptDiscordRole()` (`lib/discord/dept-roles.ts`).
- `PATCH /api/admin/tickets/[id]` — approve/reject a ticket; approval forks on `ticket.type`: `j3-qualification` (mutates `milpac.qualifications`), `j4-award` (push `milpac.awards`), `j3-promotion` (set rank + push `milpac.promotions`), `j4-discharge` (removes from ORBAT, generates final MilPac via `generateMilpacForUser()`/`archiveMilpacImages()`, sets `discharged`, inserts `Db.dischargeSnapshots`), `discipline` (increments `milpac.disciplineDeductions`, pushes history — requires `disciplinePoints`), `move-request` (re-validates positions, calls `applyOrbatMove()`). Gate: ticket-department-aware via `PERMISSIONS.tickets.action{J1..J7}` / `actionMoveRequest` / `actionDiscipline`, plus self-approval block for own discharge tickets. Collections: `Db.tickets`, `Db.users`, `Db.orbatPositions`, `Db.dischargeSnapshots`.
- `GET/PATCH /api/admin/calendar/[id]` — update/delete-adjacent... (see below); PATCH edits title/description/start/end/timePeriod (creator or J4). Gate: `PERMISSIONS.pages.admin` + ownership/J4. Collections: `Db.calendarEvents`. Side effects: `logAction()` (from `lib/logs`).
- `DELETE /api/admin/calendar/[id]` — deletes event (creator or J4). Gate: `PERMISSIONS.pages.admin` + ownership/J4. Collections: `Db.calendarEvents`. Side effects: `logAction()`.
- `GET/POST /api/admin/calendar` — GET lists events (private events filtered to creator) merged with virtual all-day "operation" events for non-deleted ops. POST creates an event; supports `isJ2Unavailability` (gated `PERMISSIONS.departmentLeads.j2`) and `isMissionCheckRequest` (gated `PERMISSIONS.departments.j2` — also creates a `mission_check` Task and notifies all J2 leads + confirms to requester). Gate: `PERMISSIONS.pages.admin`. Collections: `Db.calendarEvents`, `Db.operations`, `Db.tasks`, `Db.users`. Side effects: `createNotification()`, `logAction()`.

---

#### /api/admin/attendance-import

- `POST /api/admin/attendance-import` — parses uploaded attendance CSV(s) via `parseAttendanceCSV`/`collectOperations` (`lib/attendance/csv-parser.ts`), matches/creates Sat+Sun `Db.operations` docs per weekend, matches members via `client.buildOrbatLookup()`, upserts `Db.operationAttendance` records (merging attended/imported status), returns unmatched member list. Gate: `PERMISSIONS.admin.massImport`. Collections: `Db.operations`, `Db.operationAttendance`. Side effect: `client.updateRoles()` call at start.
- `POST /api/admin/attendance-import/resolve` — resolves unmatched CSV names from the above import: `action:'match'` rewrites `operationAttendance.records[].userId` from the CSV placeholder to a real Discord ID; `action:'skeleton'` creates a `Db.users` skeleton account (`isSkeletonAccount: true`) and rewrites attendance records to point at it. Gate: `PERMISSIONS.admin.massImport`. Collections: `Db.users`, `Db.operationAttendance`. Side effect: `client.updateRoles()`.

---

#### /api/admin/calendar (subroutes)

- `GET/POST/DELETE /api/admin/calendar/reminders` — per-user calendar-event reminders keyed by `eventId`+`minutesBefore`. GET fetches the current user's reminders; POST upserts one (computes `fireAt` from event start); DELETE removes one or all for an event. Gate: any authenticated user (`fetchMe()` only — no role check; scoped by `userId: me.id`). Collections: `Db.calendarReminders`, `Db.calendarEvents`.

---

#### /api/admin/j1

- `GET/PUT/DELETE /api/admin/j1/in-progress` — per-recruiter draft-application autosave (single doc per `recruiterId`). Gate: `PERMISSIONS.pages.admin`. Collections: `Db.inProgressRecruitments`.
- `GET/POST/DELETE /api/admin/j1/tfar-plugin` — manages uploaded TFAR plugin files (`.ts3_plugin`/`.zip`) stored under `storage/j1/`; only one `isCurrent: true` at a time. Gate: `PERMISSIONS.departmentLeads.j1` or `PERMISSIONS.pages.admin` (J4). Collections: `Db.tfarPlugins`. Side effects: filesystem writes/deletes.
- `GET/POST /api/admin/j1/applications` — GET lists all applications. POST creates a direct-recruit application record (bypasses public rate limit), notifies `J1-Staff` role for sign-off. Gate: `PERMISSIONS.departments.j1`. Collections: `Db.j1Applications`. Side effects: `createNotificationForRole()`.
- `PATCH /api/admin/j1/applications/[id]` — very large multi-branch handler: `j4ReviewDecision` (J4 approve/reject returning-member flag, DMs recruiter + notifies J1 lead on rejection), `recruiterRecommendation` (approve/deny/pend, locked while J4 review pending, notifies J1 lead), standard field patch (status/notes/linkedUserId/assignedReviewerId with `reviewDueAt` computation, DMs applicant on status change), auto-creates a review Task + runs `runReturningMemberCheck()` (checks `Db.j1Applications` rejections, `Db.users.discharged`, `Db.leavingHistory`, `Db.deniedApplicationsHQ`) when a recruiter is newly assigned — escalates to J4 review task + pings a Discord channel if flagged, and on final `accepted` decision runs a full onboarding sequence (adds `ASOT Member`/`Reservist` Discord roles, removes `Applicant`, sets rank to REC, inserts an `activeReservist` ORBAT slot, sets nickname) plus awards a J1 interview billet point to the recruiter via `calculatePromotionPoints()`. Gate: `PERMISSIONS.departments.j1` (various sub-actions further require `PERMISSIONS.departmentLeads.j1` or `PERMISSIONS.departments.j4`). Collections: `Db.j1Applications`, `Db.tasks`, `Db.users`, `Db.orbatPositions`, `Db.roles`. Side effects: `createNotification()`, `sendDM()`, `sendTaskAssignedDM()`, `sendChannelMessage()`, `addGuildRole()`/`removeGuildRole()`, `setGuildNickname()`.
- `DELETE /api/admin/j1/applications/[id]` — permanently deletes an application. Gate: `PERMISSIONS.departments.j4`. Collections: `Db.j1Applications`.
- `GET /api/admin/j1/check-returning` — looks up a Discord/Steam ID against `Db.users` and reports `new`/`active`/`discharged` status. Gate: `PERMISSIONS.departments.j1`. Collections: `Db.users`.
- `GET /api/admin/j1/members` — lists all `Db.users` for application-linking UI (includes skeleton accounts, discharge flag, `isActiveMember` via `ASOT Member` role check). Gate: `PERMISSIONS.departments.j1`. Collections: `Db.users`.
- `POST /api/admin/j1/import` — bulk-imports historical application records from a JSON array (age/bool/list normalization helpers), cross-references Discord usernames/IDs against `Db.users` to auto-link. Gate: `PERMISSIONS.departments.j1`. Collections: `Db.j1Applications`, `Db.users`. Max 2000 records/request.
- `GET /api/admin/j1/discharge-info` — returns a `discordId → discharge summary` map for J1's returning-member UI. Gate: `PERMISSIONS.departments.j1`. Collections: `Db.dischargeSnapshots`.

---

#### /api/admin/j4/mastersheet

- `GET/POST /api/admin/j4/mastersheet/billet` — GET merges live `Db.users` milpac data with imported `Db.billetExtras` (billet/upToDate/lastUpdate), computes active-vs-discharged classification signals (formal discharge, leaving-history match, discharged-section flag, ASOT-Member role, ORBAT presence), auto-tallies J2 mission points via an `Db.operations` aggregate, excludes recycle-binned rows. POST imports a Billet Mastersheet CSV into `Db.billetExtras` (custom parser with name normalization + rank-prefix stripping), fully replaces the collection. Gate: `PERMISSIONS.masterSheet.view` (GET) / `PERMISSIONS.masterSheet.import` (POST). Collections: `Db.users`, `Db.billetExtras`, `Db.memberEmails`, `Db.mastersheetRecycleBin`, `Db.orbatPositions`, `Db.leavingHistory`, `Db.roles`, `Db.operations`.
- `PATCH/DELETE /api/admin/j4/mastersheet/billet/[memberId]` — PATCH upserts `billet`/`upToDate`/`lastUpdate` fields on `Db.billetExtras` for a member. DELETE moves the member's billet-extra record into the recycle bin. Gate: `PERMISSIONS.masterSheet.import`. Collections: `Db.billetExtras`, `Db.users`, `Db.mastersheetRecycleBin`.
- `GET/POST /api/admin/j4/mastersheet/denied-applications` — GET paginated/sorted/searchable list. POST replaces the whole collection from an uploaded CSV (skips header + test row). Gate: `PERMISSIONS.masterSheet.view` / `.import`. Collections: `Db.deniedApplicationsHQ`.
- `PATCH/DELETE /api/admin/j4/mastersheet/denied-applications/[id]` — PATCH updates allowed fields (name/date/steamId/discordId/reason/deniedBy). DELETE moves record to recycle bin then deletes. Gate: `PERMISSIONS.masterSheet.import`. Collections: `Db.deniedApplicationsHQ`, `Db.mastersheetRecycleBin`.
- `PATCH/DELETE /api/admin/j4/mastersheet/discipline/[id]` — PATCH updates allowed discipline fields. DELETE moves to recycle bin then deletes. Gate: `PERMISSIONS.masterSheet.import`. Collections: `Db.disciplineRecords`, `Db.mastersheetRecycleBin`.
- `GET/POST /api/admin/j4/mastersheet/discipline` — GET paginated/sorted/searchable/filterable (level, active-only) list. POST replaces the whole collection from CSV (locates header row by `"discipline level"`). Gate: `PERMISSIONS.masterSheet.viewDiscipline` (GET) / `.import` (POST). Collections: `Db.disciplineRecords`.
- `GET/POST /api/admin/j4/mastersheet/leaving-history` — GET paginated/sorted/searchable/filterable (return status, type) list. POST replaces the whole collection from CSV. Gate: `PERMISSIONS.masterSheet.view` / `.import`. Collections: `Db.leavingHistory`.
- `PATCH/DELETE /api/admin/j4/mastersheet/leaving-history/[id]` — PATCH updates allowed leaving-history fields. DELETE moves to recycle bin then deletes. Gate: `PERMISSIONS.masterSheet.import`. Collections: `Db.leavingHistory`, `Db.mastersheetRecycleBin`.
- `PATCH /api/admin/j4/mastersheet/member-milpac` — inline-edit endpoint for a single milpac field (`rank`/`enlistedDate`/`j4Points`/`disciplineDeductions`/billet-count fields) by `username`. Gate: `PERMISSIONS.masterSheet.view` AND `PERMISSIONS.members.editRestricted` (J4 only). Collections: `Db.users`. Side effects: `logAction()` (from `lib/logAction.ts`) recording before/after.
- `GET /api/admin/j4/mastersheet/recycle-bin` — paginated list of soft-deleted mastersheet records across all tabs, with a display-name extractor per `originalTab`. Gate: `PERMISSIONS.masterSheet.view`. Collections: `Db.mastersheetRecycleBin`.
- `POST/DELETE /api/admin/j4/mastersheet/recycle-bin/[id]` — POST restores a record back into its original collection (`leaving`/`denied`/`discipline`; `billet` is a no-op since the user doc persists) and removes the bin entry, handling duplicate-key (11000) conflicts. DELETE permanently purges the bin entry. Gate: `PERMISSIONS.masterSheet.import`. Collections: `Db.mastersheetRecycleBin`, `Db.leavingHistory`, `Db.deniedApplicationsHQ`, `Db.disciplineRecords`.

---

#### /api/admin/j4/member-emails

- `GET/PATCH /api/admin/j4/member-emails/[memberId]` — GET returns email history for a member. PATCH appends a new email entry (validates contains `@`). Gate: `PERMISSIONS.masterSheet.view` (GET) / `.import` (PATCH). Collections: `Db.memberEmails`.
- `POST /api/admin/j4/member-emails/import/confirm` — commits a batch of `{memberId, email}` entries from the dry-run review (dedupes against existing emails per member). Gate: `PERMISSIONS.masterSheet.import`. Collections: `Db.memberEmails`.
- `POST /api/admin/j4/member-emails/import` — dry-run only (no writes): parses a mastersheet-style CSV, builds a fuzzy name-matching index (exact/normalized/partial-word/Levenshtein) against `Db.users`, falls back to `Db.leavingHistory` for still-unmatched rows (resolving to a current user via `discordId` where possible), returns `confirmed`/`uncertain`/`unmatched` buckets for a UI review step. Gate: `PERMISSIONS.masterSheet.import`. Collections: `Db.users`, `Db.leavingHistory` (read-only).

---

#### /api/admin/meetings

- `GET /api/admin/meetings/all` — J4-only cross-department meeting list (`department`/`imported` filters, limit 200). Gate: `PERMISSIONS.departments.j4`. Collections: `Db.meetings`.
- `GET /api/admin/meetings/attachment` — serves an uploaded meeting attachment file from `./uploads/meetings/{id}.{ext}` by content-type. Gate: `PERMISSIONS.pages.admin`. Collections: none (filesystem read).
- `POST /api/admin/meetings/[id]/attachments` — adds an attachment to a meeting: file upload (saved to `./uploads/meetings/`), YouTube URL, or generic link. Gate: dept membership (`PERMISSIONS.departments[dept]`) or invited-guest; blocked if meeting locked. Collections: `Db.meetings`. Side effects: filesystem write.
- `DELETE /api/admin/meetings/[id]/attachments/[attachmentId]` — removes an attachment (deletes file from disk if type=file). Gate: dept membership; blocked if locked. Collections: `Db.meetings`. Side effects: filesystem delete.
- `POST /api/admin/meetings/[id]/complete` — marks a meeting completed+locked, queues a 24h attendance-confirmation reminder per dept-lead role via `Db.meetingNotifQueue`. Gate: department-lead role for the meeting's department. Collections: `Db.meetings`, `Db.meetingNotifQueue`. Side effects: `logAction()` (`lib/logAction.ts`).
- `POST /api/admin/meetings/[id]/lock` — locks/unlocks a meeting (`{locked: boolean}`). Gate: per-department `PERMISSIONS.meetings.lockJ{1-7}`. Collections: `Db.meetings`.
- `GET/PATCH/DELETE /api/admin/meetings/[id]` — GET returns the meeting (dept members or invited guests). PATCH edits title/date/notes (must not be locked). DELETE removes the meeting and cleans up attachment files from disk (dept-lead only). Gate: dept membership/invited for GET/PATCH; `PERMISSIONS.departmentLeads[dept]` for DELETE. Collections: `Db.meetings`. Side effects: `logAction()` on delete.
- `PATCH/DELETE /api/admin/meetings/[id]/tasks/[taskId]` — PATCH updates a meeting sub-task's title/status/reminderDate (array-filter update, stamps `completedAt`/`completedByName` on completion). DELETE removes the sub-task. Gate: dept membership; blocked if meeting locked. Collections: `Db.meetings`.
- `POST /api/admin/meetings/[id]/attendance` — syncs the attendee list from current dept/J4/invited members via `initMeetingAttendance()`. Gate: dept membership (lead-triggered "Sync members" button, but only dept-membership check enforced). Collections: `Db.meetings` (indirect via helper).
- `PATCH /api/admin/meetings/[id]/attendance` — sets a member's own RSVP status (`attending`/`not_attending`/`loa`) or a lead's confirmation status (`confirmed_attended`/`confirmed_absent`); LOA attendance cannot be lead-confirmed. Gate: dept membership or invited; lead-only statuses require `PERMISSIONS.departmentLeads[dept]`. Collections: `Db.meetings`.
- `POST /api/admin/meetings/[id]/tasks` — creates a meeting sub-task (assignee or role), fires immediate task-assigned notification, queues a time-delayed chase-up notification if `chaseUpDate` set. Gate: dept membership or invited; blocked if locked. Collections: `Db.meetings`, `Db.meetingNotifQueue`. Side effects: `notifyMeetingUser()`/`notifyMeetingRole()` (`lib/notifications/meeting.ts`).
- `POST /api/admin/meetings/[id]/transfer` — copies a meeting's notes/attachments into a new meeting doc under a different department, marked `isTransferred` with a `transferredFrom` source pointer; auto-inits attendance for the target dept. Gate: dept lead of source dept or J4. Collections: `Db.meetings`. Side effects: `initMeetingAttendance()`, `logAction()`.
- `GET/POST /api/admin/meetings` — GET lists meetings for a `department` query param (dept-gated). POST creates a meeting, optionally carrying over incomplete tasks from a prior meeting (`carryoverFromId`), auto-inits attendance, fires immediate creation notifications to `notifyRoles`/`notifyUserIds`/`invitedUserIds`, and queues time-delayed `meeting_started`/`meeting_reminder` notifications via `Db.meetingNotifQueue` (cron-driven). Gate: `PERMISSIONS.departments[dept]`. Collections: `Db.meetings`, `Db.meetingNotifQueue`. Side effects: `notifyMeetingUser()`/`notifyMeetingRole()`, `logAction()`.

---

#### /api/admin/members

- `GET/PATCH /api/admin/members/[id]/discord-roles` — GET fetches a member's current Discord role IDs + all guild roles (sorted by position) via `botRequest()`. PATCH adds/removes a single role via `addGuildRole()`/`removeGuildRole()`. Gate: `PERMISSIONS.departments.j4`. Collections: none (Discord REST only, via `lib/discord/bot.ts`).
- `PATCH/DELETE /api/admin/members/[id]` — PATCH is multi-purpose: department add/remove (`syncDeptDiscordRole()`), chaplain toggle (role sync + `setGuildNickname()`), or display-name rename (uniqueness check + `setGuildNickname()` via `buildNickname()`). DELETE permanently removes the user document. Gate: `PERMISSIONS.departments.j4`. Collections: `Db.users`, `Db.roles`. Side effects: `logAction()` (`lib/logs`), `addGuildRole()`/`removeGuildRole()`, `setGuildNickname()`, `syncDeptDiscordRole()`.
- `POST /api/admin/members/sync-dept` — reconciles a department's member/lead lists against live Discord role holders (fetched via `fetchAllGuildMembers()`), `$addToSet`s missing `departments`/`teamLeadDepts`. Gate: `PERMISSIONS.departments.j4`. Collections: `Db.roles`, `Db.users`. Side effects: `logAction()`.
- `GET /api/admin/members` — paginated/searchable/dept-filterable member directory (excludes skeleton + discharged), enriches each row with current ORBAT position. Gate: `PERMISSIONS.pages.admin`. Collections: `Db.users`, `Db.orbatPositions`.
- `GET/PATCH /api/admin/members/discharged` — GET lists discharged members, or (with `?memberId=`) returns a discharge-snapshot summary (qualification/award/training/operation counts). PATCH reinstates a discharged member, optionally restoring selected data (`qualifications`/`awards`/`trainings`/`operations`) from `Db.dischargeSnapshots`. Gate: `PERMISSIONS.departments.j4`. Collections: `Db.users`, `Db.dischargeSnapshots`. Side effects: `logAction()` (`lib/logs`).

---

#### /api/admin/orbat

- `GET /api/admin/orbat/discord-roles` — returns all guild roles sorted by `rawPosition` for the ORBAT structure editor's role-linking UI. Gate: `PERMISSIONS.admin.manageOrbatStructure`. Collections: `Db.roles`.
- `GET /api/admin/orbat/for-move` — lightweight ORBAT position list with hydrated display names, for the move-request picker. Gate: `PERMISSIONS.pages.admin` (broader than `manageOrbat`). Collections: `Db.orbatPositions`, `Db.users`.
- `POST/DELETE /api/admin/orbat/meta/patch` — uploads/replaces a section "patch" image (multipart, saved to `./uploads/orbat/`) or deletes one, upserting `Db.orbatSectionMeta`. Gate: `PERMISSIONS.admin.manageOrbatStructure`. Collections: `Db.orbatSectionMeta`. Side effects: filesystem write/delete.
- `POST /api/admin/orbat/positions` — creates a new vacant position at the end of a section. Gate: `PERMISSIONS.admin.manageOrbatStructure`. Collections: `Db.orbatPositions`.
- `GET /api/admin/orbat` — returns all ORBAT positions hydrated with user display info (rank + name + avatar). Gate: `PERMISSIONS.admin.manageOrbat`. Collections: `Db.orbatPositions`, `Db.users`.
- `PATCH/DELETE /api/admin/orbat/[positionId]` — PATCH handles three shapes: `userId` assignment/unassignment (conflict check, auto-evicts unassigned user into `activeReservist` unless `skipAutoMove`, syncs Discord section/platoon roles via `syncOrbatDiscordRoles()`), or `role`/`positionOrder` field updates (structure permission). DELETE removes a position. Gate: `PERMISSIONS.admin.manageOrbatMembers` for `userId` changes, `PERMISSIONS.admin.manageOrbatStructure` for field edits/delete. Collections: `Db.orbatPositions`, `Db.users`. Side effects: `syncOrbatDiscordRoles()`, `logAction()`.
- `GET /api/admin/orbat/categories` — returns the fixed `PLATOON_CATEGORIES`+`RESERVIST_CATEGORIES` constant list (no DB query). Gate: `PERMISSIONS.admin.manageOrbat`.
- `GET/PATCH/DELETE /api/admin/orbat/meta` — GET is public, returns all `Db.orbatSectionMeta` docs (colors/patches/Discord role/TS group per section) for the public ORBAT/Milpacs pages. PATCH upserts color/discordRoleId/tsGroupId. DELETE clears one field (removing patch file from disk if applicable). Gate: none on GET; `PERMISSIONS.admin.manageOrbatStructure` on PATCH/DELETE. Collections: `Db.orbatSectionMeta`.
- `POST/DELETE /api/admin/orbat/reservists` — POST adds a new user to the reservist pool or moves an existing reservist between active/inactive categories (with Discord role sync). DELETE removes a reservist position entirely. Gate: `PERMISSIONS.admin.manageOrbatMembers`. Collections: `Db.orbatPositions`. Side effects: `syncOrbatDiscordRoles()`.
- `POST/PATCH/DELETE /api/admin/orbat/sections` — POST creates a new section (placeholder position) — blocked for `SINGLE_SECTION_CATEGORIES`. PATCH renames a section or reorders it (swaps `sectionOrder` with neighbor via aggregation). DELETE removes all positions in a section. Gate: `PERMISSIONS.admin.manageOrbatStructure`. Collections: `Db.orbatPositions`. Side effects: `logAction()`.

---

#### /api/admin/quiz

- `GET /api/admin/quiz/attempts` — Training Records view: filterable (`status`/`quizId`/`assignedBy`) list of quiz attempts, limit 200. Gate: `PERMISSIONS.quiz.assign`. Collections: `Db.quizAttempts`.
- `GET /api/admin/quiz/recruits` — lists users holding the `Recruit` Discord role (excludes discharged/skeleton) for the assignment selector. Gate: `PERMISSIONS.quiz.assign`. Collections: `Db.users`.
- `POST /api/admin/quiz/assign` — assigns the BCT quiz (`lib/quiz-data.ts`) to a recruit: creates `Db.quizAttempts` doc, a linked Task, in-app notification, Discord DM; supports custom time limit with mandatory `timerModifiedReason` (notifies `J3-Team Lead` if modified). Gate: `PERMISSIONS.quiz.assign`. Collections: `Db.quizAttempts`, `Db.tasks`. Side effects: `createNotification()`, `createNotificationForRole()`, `sendTaskAssignedDM()`, `logAction()` (`lib/logAction.ts`).
- `GET/POST /api/admin/quiz/review/[attemptId]` — GET returns quiz definition + attempt for review UI. POST applies a review decision: `pass`/`fail` (notifies recruit, completes the linked task) or `send_for_review` (escalates trainer→J3-Team Lead→J4-Administration, notifies recruit + next-reviewer role). Gate: `PERMISSIONS.quiz.review`. Collections: `Db.quizAttempts`, `Db.tasks`. Side effects: `createNotification()`, `createNotificationForRole()`, `logAction()`.

---

#### /api/admin/retired

- `PATCH/POST /api/admin/retired/import` — PATCH applies ad-hoc patch/upsert operations (JSON array of `{find,set}` or `{upsert}`) to retired-member records. POST bulk-imports a Discharge Ticket CSV (custom date parser handling multiple formats, Steam/Discord ID normalization, upserts by `callsign`+`dischargeDate`). Gate: `PERMISSIONS.departments.j4` or `PERMISSIONS.departmentLeads.j1`. Collections: `Db.retiredMembers`.

---


## Part B — Operations + J2 API

Scope: 42 files under `app/api/operations/**`, 10 files under `app/api/j2/**`. All read in full.

---

## `app/api/operations/` (top-level and flat routes)

#### /api/operations
- **GET** — list/search operations; supports `?id=` (single mission), `?month`/`year`, `?status` (comma list), `?search`, `?limit`, `?authorId`. Non-HQ (no `PERMISSIONS.operations.viewInDevelopment`) never sees `In Development` ops. Gate: none required for read (HQ check only gates visibility filtering). Collections: `Db.operations`.

#### /api/operations/activity
- **GET** — returns last 100 `operationActivity` log entries for `?id=` operation, newest first. Gate: any authenticated user (cookie token check only, no role check). Collections: `Db.operationActivity`.

#### /api/operations/bin
- **GET** — lazy-purges operations/campaigns/campaign-missions soft-deleted >180 days ago, then returns all soft-deleted operations (recycle bin view). Gate: `PERMISSIONS.operations.write`. Collections: `Db.operations`, `Db.operationCampaigns`, `Db.campaignMissions`.

#### /api/operations/content
- **POST** — sets `content` field (ProseMirror JSON) on an operation by `id`. Gate: `PERMISSIONS.operations.write`. Collections: `Db.operations`.

#### /api/operations/delete
- **GET** — soft-deletes an operation (`?id=`), sets `deletedAt`/`deletedBy`/`deletedByName`; logs action. Gate: `PERMISSIONS.operations.write`. Collections: `Db.operations`. Side effects: `logAction('operation.delete')`.

#### /api/operations/duplicate
- **GET** — duplicates an operation (`?id=`) into a new doc titled "X (Copy)". Gate: `PERMISSIONS.operations.write`. Collections: `Db.operations`.

#### /api/operations/duplicate-partial
- **POST** — copies selected `sections[]` (by id) from a source op to a target op; optional `replacePlatoon11` does a text find/replace ("1-1" → "1-2") across ProseMirror text nodes. Gate: `PERMISSIONS.operations.write`. Collections: `Db.operations`.

#### /api/operations/image
- **GET** — serves an uploaded operation image by `?id=` (UUID) + `?ext=`; validates UUID pattern and allowed extension, reads from `./uploads/operations/`. Gate: none (public). Collections: none (filesystem).

#### /api/operations/maps
- **GET** — returns available terrain worlds via `getAvailableWorlds()` (from `lib/maps`). Gate: none. Collections: none.

#### /api/operations/new
- **GET** — creates a new blank operation (status `In Development`, default Zeus Notes + OCAP pages), stamps `ownedBy`/`ownedByName`. Gate: `PERMISSIONS.operations.write`. Collections: `Db.operations`, `Db.users` (lookup display name). Side effects: `logAction('operation.create')`.

#### /api/operations/notes
- **POST** — sets `internalNotes` on an operation by `id`. Gate: `PERMISSIONS.operations.write`. Collections: `Db.operations`.

#### /api/operations/purge
- **GET** — clears `deletedAt`/`deletedBy`/`deletedByName` on an op (undo soft-delete before restore semantics — actually identical to restore). Gate: `PERMISSIONS.departments.j4`. Collections: `Db.operations`.

#### /api/operations/restore
- **GET** — clears `deletedAt`/`deletedBy`/`deletedByName` on an op (`?id=`) to restore from recycle bin. Gate: `PERMISSIONS.operations.write`. Collections: `Db.operations`.

#### /api/operations/update
- **GET** — bulk field-update endpoint driven entirely by query params (`title`, `date`, `loreDate`, `department`, `themeColor`, `pageTheme`, `coverImage`, `status`, `mapWorld`, `customTheme`, `isSingleMission`, `ownedBy`+`ownedByName`, `billetPoints`). `ownedBy`/`billetPoints` changes require J2 lead or `members.editRestricted`. Gate: `PERMISSIONS.operations.write` (plus extra check for owner/billet fields). Collections: `Db.operations`. Side effects: `logAction('operation.edit')`.

#### /api/operations/upload
- **POST** — uploads an image file (multipart `file` field), validates extension + magic-byte signature, writes to `./uploads/operations/{uuid}.{ext}`, returns URL for `/api/operations/image`. Gate: `PERMISSIONS.operations.write`. Collections: none (filesystem).

#### /api/operations/zeus-notes
- **GET** — paginated list of recent operations (title/date/status/zeusNotes) with `?search`/`?page` for the J6 notes tab. Gate: `PERMISSIONS.departments.j6`. Collections: `Db.operations`.
- **POST** — sets `zeusNotes` on an operation by `id`. Gate: `PERMISSIONS.departments.j6`. Collections: `Db.operations`.

---

## `app/api/operations/templates/`

#### /api/operations/templates
- **GET** — lists all operation templates, newest first. Gate: `PERMISSIONS.operations.write`. Collections: `Db.operationTemplates`.
- **POST** — creates a template snapshot (sections/pages/extraPageSections) from an existing operation (`sourceOperationId`). Gate: `PERMISSIONS.operations.write`. Collections: `Db.operationTemplates`, `Db.operations` (read source).
- **DELETE** — deletes a template by `?id=`. Gate: `PERMISSIONS.operations.write`. Collections: `Db.operationTemplates`.

#### /api/operations/templates/apply
- **POST** — creates a new operation pre-populated with a template's `sections`/`pages`/`extraPageSections`; title defaults to "New Mission DD/MM/YYYY". Gate: `PERMISSIONS.operations.write`. Collections: `Db.operationTemplates`, `Db.operations`.

---

## `app/api/operations/campaigns/`

#### /api/operations/campaigns
- **GET** — lists campaigns; `?includeDeleted=true` requires write access, otherwise excludes soft-deleted. Gate: none for normal read; `PERMISSIONS.operations.write` for `includeDeleted`. Collections: `Db.operationCampaigns`.
- **POST** — creates a campaign (name/description/startDate/endDate). Gate: `PERMISSIONS.operations.write`. Collections: `Db.operationCampaigns`.
- **PATCH** — renames/re-describes a campaign, or restores from soft-delete (`restore: true`), or status-only update (validates against `['Active','Upcoming','Completed','In Development']`). Gate: `PERMISSIONS.operations.write`. Collections: `Db.operationCampaigns`.
- **DELETE** — soft-deletes a campaign (`?id=`), keeps linked ops intact, reversible via PATCH restore. Gate: `PERMISSIONS.operations.write`. Collections: `Db.operationCampaigns`. Side effects: notifies J2 leads + campaign creator via `createNotification` + `sendMeetingDM` (async, best-effort).

#### /api/operations/campaigns/assign
- **POST** — sets `campaignId` on an operation (`operationId`, `campaignId` in body). Gate: `PERMISSIONS.operations.write`. Collections: `Db.operations`.
- **DELETE** — unsets `campaignId` on an operation (`?operationId=`). Gate: `PERMISSIONS.operations.write`. Collections: `Db.operations`.

#### /api/operations/campaigns/[id]/normalise
- **POST** — auto-groups unlinked ops in a campaign by Roman-numeral + day-slot (Sat/Sun) suffix parsed from titles, creates missing `CampaignMission` docs, and stamps `campaignMissionId`/`daySlot` on each op. Idempotent (skips already-linked ops). Gate: `PERMISSIONS.operations.write`. Collections: `Db.operations`, `Db.operationCampaigns`, `Db.campaignMissions`.

---

## `app/api/operations/campaign-missions/`

#### /api/operations/campaign-missions
- **GET** — lists missions for `?campaignId=` sorted by `sequence`; `?includeDeleted=true` returns only soft-deleted. Gate: any authenticated user. Collections: `Db.campaignMissions`.
- **POST** — creates a campaign mission (`campaignId`, `name`, `sequence`). Gate: `PERMISSIONS.operations.write`. Collections: `Db.campaignMissions`.

#### /api/operations/campaign-missions/[id]
- **PATCH** — updates mission `name`/`sequence`, or restores from soft-delete (`body.restore`) and re-links previously-unlinked Saturday/Sunday ops. Gate: `PERMISSIONS.operations.write`. Collections: `Db.campaignMissions`, `Db.operations`.
- **DELETE** — soft-deletes a mission, unlinks its Saturday/Sunday ops (`campaignMissionId`/`daySlot` unset, keeps op itself), then async-notifies J2 leads + mission/campaign creator. Gate: `PERMISSIONS.operations.write`. Collections: `Db.campaignMissions`, `Db.operations`, `Db.operationCampaigns` (read), `Db.users` (recipients). Side effects: `createNotification` + `sendMeetingDM` (best-effort, async).

#### /api/operations/campaign-missions/[id]/link
- **POST** — links an operation to a mission's `saturdayOpId`/`sundayOpId` slot; stamps op with `campaignMissionId`, `daySlot`, and parent `campaignId`. Gate: `PERMISSIONS.operations.write`. Collections: `Db.campaignMissions`, `Db.operations`.
- **DELETE** — unlinks an operation from a mission slot (`?daySlot=`), unsets `campaignMissionId`/`daySlot`/`campaignId` on the op. Gate: `PERMISSIONS.operations.write`. Collections: `Db.campaignMissions`, `Db.operations`.

---

## `app/api/operations/ocap/` (After-Action recording integration)

#### /api/operations/ocap/inspect
- **GET** — debug endpoint: `?filename=` downloads an OCAP recording and streams-parses it to report unique event types, sample entity frames, and framesFired samples (developer diagnostics). Gate: `PERMISSIONS.pages.operationsEdit`. Collections: none (external OCAP file + `lib/ocap`). Side effects: fetches from `OCAP_API_URL`.

#### /api/operations/ocap/recordings
- **GET** — proxies `OCAP_API_URL/api/v1/operations`, filters to `conversionStatus === 'completed'`, maps into a slim `OcapRecording[]` shape sorted by date desc. Gate: `PERMISSIONS.pages.operationsEdit`. Collections: none. Side effects: external fetch to OCAP API.

#### /api/operations/ocap/sync
- **POST** — SSE streaming endpoint: downloads an OCAP recording, parses kill/player stats, matches players to website members, and saves `ocap` data onto the operation doc; also persists live `ocapSync.stage` progress on the op for polling. `maxDuration = 300`. Gate: `PERMISSIONS.pages.operationsEdit`. Collections: `Db.operations`. Side effects: downloads from `OCAP_API_URL`, streams SSE progress events.

#### /api/operations/ocap/sync-status
- **GET** — returns the current `ocapSync` progress sub-document for `?operationId=` (poll target for the sync SSE above). Gate: `PERMISSIONS.pages.operationsEdit`. Collections: `Db.operations`.

---

## `app/api/operations/[id]/` (per-operation routes)

#### /api/operations/[id]/acknowledge
- **GET** — returns whether current user acknowledged a doc page (`?pageId=`, default "main"), full ack list, eligible users (`PERMISSIONS.attendance.confirm` roles), and not-yet-acknowledged list. Gate: public view allowed (me optional) but requires op to exist. Collections: `Db.operations` (existence check), `Db.operationDocAcks`, `Db.users` (eligible list).
- **POST** — records current user's read-receipt acknowledgement for a page (idempotent — returns `alreadyAcknowledged` if repeat). Gate: `PERMISSIONS.attendance.confirm`. Collections: `Db.operationDocAcks`, `Db.operations` (existence check).

#### /api/operations/[id]/live-status
- **GET** — lightweight poll endpoint for the operation viewer status bar: returns op `status`/`date` + attendance `rsvpOpen`/`rsvpOpenAt`/`rsvpCloseOffsetMins`/`confirmationOpen`/`confirmationOpenedAt`/`stage`. Gate: none (public). Collections: `Db.operations`, `Db.operationAttendance` (projections only).

#### /api/operations/[id]/mission-development
- **POST** — records a dev-check completion (`checkId`, `reviewerName`, `comments`, `outcome`) into `missionDevelopment.completions.{checkId}` on the op. Gate: `PERMISSIONS.departmentLeads.j2`. Collections: `Db.operations`.
- **DELETE** — removes a dev-check completion (`?checkId=`). Gate: `PERMISSIONS.departmentLeads.j2`. Collections: `Db.operations`.

#### /api/operations/[id]/orders-check
- **GET** — returns the active (uncompleted) `orders_check` task for this op, if any. Gate: `PERMISSIONS.departments.j2`. Collections: `Db.tasks`.
- **POST** — J2 member requests an orders check from J2 leads (`preferredAt`, `comments`); creates a `Task` (`type: 'orders_check'`), errors if one already pending. Gate: `PERMISSIONS.departments.j2`. Collections: `Db.operations` (read), `Db.tasks`, `Db.users` (J2 leads lookup). Side effects: `createNotificationForRole(j2Lead)` + `sendTaskAssignedDM` to each J2 lead.
- **DELETE** — requester (or J2 lead) cancels their pending orders-check task (`?taskId=`). Gate: `PERMISSIONS.departments.j2` (+ ownership or lead check). Collections: `Db.tasks`. Side effects: `createNotificationForRole(j2Lead)`.
- **PATCH** — J2 lead `confirm`s or `propose`s an alternate time on a pending check; any J2 member can `set_reminder` (personal reminder timestamp). Gate: `PERMISSIONS.departments.j2` for `set_reminder`; `PERMISSIONS.departmentLeads.j2` for `confirm`/`propose`. Collections: `Db.tasks`. Side effects: `createNotification` to requester on confirm/propose.

#### /api/operations/[id]/publish
- **POST** — transitions operation status `In Development` → `Upcoming` (409 if not currently In Development). Gate: `PERMISSIONS.operations.write`. Collections: `Db.operations`, `Db.users` (performer display name). Side effects: `createNotificationForRole('All Staff')` + `createNotificationForRole(j2Lead)`; `logAction('operation.publish')`.

#### /api/operations/[id]/remind
- **POST** — notifies all "All Staff" users who haven't yet acknowledged orders for this op. Gate: `PERMISSIONS.operations.write` OR `PERMISSIONS.departmentLeads.j2`. Collections: `Db.operations` (read title+acknowledgements), `Db.users` (All Staff list). Side effects: `createNotification` per unacknowledged user.

---

## `app/api/operations/[id]/attendance/` (attendance sub-resource)

#### /api/operations/[id]/attendance
- **GET** — builds the full attendance roster view: merges ORBAT positions (ordered by category/section/position) with existing attendance records, includes reservists in uncovered slots, resolves display names/avatars from `Db.users`, and returns `sectionRolesMap` + `sectionMeta` (with Discord role colors) for the UI. Gate: none explicit (public read). Collections: `Db.operationAttendance`, `Db.orbatPositions`, `Db.orbatSectionMeta`, `Db.roles`, `Db.users`.
- **POST** — initialises/upserts the attendance doc for an op (`rsvpOpen`, `confirmationOpen` flags); stamps `confirmationOpenedAt` when confirmation transitions open and triggers section-leader task creation. Gate: any authenticated user (`client.fetchMe()` only, no role check). Collections: `Db.operationAttendance`. Side effects: `createAttendanceTasksForOperation()` (lib/attendance/tasks) when confirmation newly opens.

#### /api/operations/[id]/attendance/confirm
- **POST** — section leaders (or HQ/All Staff) confirm which RSVPed members actually attended (`confirmedUserIds[]`, optional `sectionTitle` for HQ scoping); auto-creates minimal records for ORBAT members who never RSVPed; defaults `attendanceType` to `'ATTENDED'`; rolls up confirmed nights into `milpac.billetCounts.primaryNightOps`/`secondaryNightOps` on `Db.users` via bulkWrite. Gate: section leader (`orbatPositions.isSenior`) or `PERMISSIONS.attendance.confirm` roles or `'HQ Staff'`; requires `attendance.confirmationOpen === true`. Collections: `Db.operationAttendance`, `Db.orbatPositions`, `Db.users` (bulkWrite billet counts).

#### /api/operations/[id]/attendance/manage
- **POST** — HQ-only bulk record editor: `moves` (change `reservistSection`), `removals`, `additions` (new records), `roleChanges` (update `orbatRole`) applied to `attendance.records`. Gate: `PERMISSIONS.admin.manageOrbat`. Collections: `Db.operationAttendance`.

#### /api/operations/[id]/attendance/rsvp
- **POST** — member's own RSVP submission (`status: 'attending' | 'not_attending'`, optional `reservistSection`/`reservistRole`); updates existing record or inserts new one keyed off ORBAT position; requires `attendance.rsvpOpen === true`. Gate: any authenticated user. Collections: `Db.operationAttendance`, `Db.orbatPositions`.

#### /api/operations/[id]/attendance/type
- **POST** — sets or clears a visual `attendanceType` flag on a member's record (`userId`, `attendanceType | null`); no `confirmationOpen` gate — can be set any time; creates a minimal record if none exists yet. Gate: section leader, `'HQ Staff'`, or `PERMISSIONS.attendance.confirm`. Collections: `Db.operationAttendance`, `Db.orbatPositions`.

#### /api/operations/[id]/attendance/platoons
- **POST** — HQ sets `assignedPlatoons[]`, `reservistAssignments[]`, and toggles `rsvpOpen`/`confirmationOpen`/`rsvpOpenAt`/`rsvpCloseOffsetMins`/`stage` on the attendance doc (upsert); auto-opens RSVP immediately if `rsvpOpenAt` is already in the past and op isn't `In Development`; mirrors `assignedPlatoons` onto the operation doc; creates section-leader tasks when confirmation newly opens. Gate: `PERMISSIONS.admin.manageOrbat`. Collections: `Db.operationAttendance`, `Db.operations`. Side effects: `createAttendanceTasksForOperation()`.

#### /api/operations/[id]/attendance/custom-units
- **GET** — returns `customUnits[]` for the op's attendance doc. Gate: any authenticated user. Collections: `Db.operationAttendance`.
- **POST** — appends a new custom unit (`name`, optional `color`) with a generated id. Gate: `PERMISSIONS.admin.manageOrbat`. Collections: `Db.operationAttendance`.
- **PATCH** — updates an existing custom unit's `name`/`color` by `unitId`. Gate: `PERMISSIONS.admin.manageOrbat`. Collections: `Db.operationAttendance`.
- **DELETE** — removes a custom unit (`?unitId=`). Gate: `PERMISSIONS.admin.manageOrbat`. Collections: `Db.operationAttendance`.

#### /api/operations/[id]/attendance/lead-zeus
- **PATCH** — CHQ nominates or clears the Lead Zeus (`userId`/`userName` in body; `userId: null` clears); resolves display name from `Db.users` if not supplied; sends a Discord DM to the nominee. Gate: `PERMISSIONS.admin.manageOrbat`. Collections: `Db.operationAttendance`, `Db.operations` (title lookup), `Db.users` (name resolution). Side effects: `sendLeadZeusDM()`.

---

## `app/api/j2/workspace/` (J2 member workspace — files, docs, activity)

#### /api/j2/workspace/activity
- **GET** — paginated action-log feed filtered to `department: 'j2'` + `action` matching `^workspace\.`; supports `?memberId`, `?actionType` (whitelist of workspace.* actions), `?from`/`?to` date range, `?limit` (max 200), `?page`. Gate: `PERMISSIONS.departments.j2` OR `PERMISSIONS.departmentLeads.j2` OR `PERMISSIONS.pages.admin`. Collections: `Db.actionLogs`.

#### /api/j2/workspace/members
- **GET** — lists all active J2 members (from `Db.users.departments: 'j2'`) with aggregated workspace metadata: file count, doc count, linked-op count (`ownedBy`), last-activity timestamp, and position label (Department Leader / Team Leader / Creator Trainer derived from `teamLeadDepts`/`dept2icRoles`/`dept3icRoles`). Gate: `PERMISSIONS.departments.j2` OR `PERMISSIONS.departmentLeads.j2` OR `PERMISSIONS.pages.admin`. Collections: `Db.users`, `Db.workspaceFiles` (aggregate), `Db.workspaceDocs` (aggregate), `Db.operations` (aggregate).

#### /api/j2/workspace/docs
- **GET** — lists workspace docs for `?memberId=`, excludes `deleted`/`yjsState` binary from projection. Gate: J2 member/lead/admin. Collections: `Db.workspaceDocs`.
- **POST** — creates a new workspace doc (`memberId`, `memberName`, `title`). Gate: J2 member/lead/admin. Collections: `Db.workspaceDocs`. Side effects: `logAction('workspace.doc.create')`.

#### /api/j2/workspace/docs/[id]
- **PATCH** — updates a doc's `title`. Gate: J2 member/lead/admin. Collections: `Db.workspaceDocs`. Side effects: `logAction('workspace.doc.edit')` (only if title changed).
- **DELETE** — soft-deletes a doc (`deleted: true`); only doc owner/creator or J2 lead/admin may delete. Gate: J2 member/lead/admin base + ownership/lead check. Collections: `Db.workspaceDocs`. Side effects: `logAction('workspace.doc.delete')`.

#### /api/j2/workspace/docs/[id]/versions
- **GET** — lists version-history snapshots for a doc (excludes `yjsDiff` field), newest first. Gate: J2 member/lead/admin. Collections: `Db.workspaceVersions`, `Db.workspaceDocs` (existence check).
- **POST** — saves a named version snapshot (`label?`); extracts plaintext server-side from the doc's live Yjs binary state (walks `pageOrder`/`sectionOrder` arrays and converts each section's Y.Doc content to ProseMirror JSON → plain text via `yDocToProsemirrorJSON`). Gate: J2 member/lead/admin. Collections: `Db.workspaceVersions`, `Db.workspaceDocs`. Side effects: `logAction('workspace.version.save')`.

#### /api/j2/workspace/docs/[id]/versions/[versionId]/restore
- **POST** — restores a version snapshot; `mode: 'overwrite'` clears the doc's `yjsState` (forces fresh collab init) and records a new "Restored from X" version; `mode: 'copy'` creates a brand-new doc seeded from the version's content snapshot. Gate: J2 member/lead/admin. Collections: `Db.workspaceDocs`, `Db.workspaceVersions`. Side effects: `logAction('workspace.version.restore')`.

#### /api/j2/workspace/files
- **GET** — lists workspace files for `?memberId=`. Gate: J2 member/lead/admin. Collections: `Db.workspaceFiles`.
- **POST** — uploads a file (multipart: `file`, `memberId`, `memberName`, `description?`); writes to `storage/j2/{uuid}{ext}` on disk. Gate: J2 member/lead/admin. Collections: `Db.workspaceFiles`. Side effects: `logAction('workspace.file.upload')`.
- **DELETE** — deletes a file (`?id=`) from disk + DB; only uploader/owner or J2 lead/admin may delete. Gate: J2 member/lead/admin base + ownership/lead check. Collections: `Db.workspaceFiles`. Side effects: `logAction('workspace.file.delete')`.

#### /api/j2/workspace/files/[id]/download
- **GET** — streams a workspace file's raw bytes from `storage/j2/{storedName}` as an attachment download. Gate: J2 member/lead/admin. Collections: `Db.workspaceFiles`.

---

## `app/api/j2/dev-checks/` (mission development check tracking)

#### /api/j2/dev-checks
- **GET** — lists all `In Development`/`Active` (or `+Upcoming` with `?filter=all`) ops with computed dev-check status rows: for campaign ops uses `CAMPAIGN_CHECK_WEEKS = [16,12,10,8,6,4]` relative to campaign `startDate`, for standalone ops uses `SINGLE_CHECK_WEEKS = [12,10,8,6,4]` relative to op `date`; each check reports due date, overdue flag, days-until, linked completion (from `missionDevelopment.completions`), and assigned task info. Supports `?filter=active|overdue|completed|all`. Gate: `PERMISSIONS.departmentLeads.j2` or `PERMISSIONS.departments.j2`. Collections: `Db.operations`, `Db.operationCampaigns`, `Db.tasks`.

#### /api/j2/dev-checks/[opId]/[checkId]
- **POST** — assigns a reviewer to a specific dev check (`reviewerId`, `reviewerName`); computes `dueDate` as `referenceDate − weeksOut*7 days` (reference = campaign startDate if op is campaign-linked, else op date), reminder = dueDate + 7 days; deletes any existing task for this op+check and inserts a fresh `Task` (`type: 'dev_check'`). `CHECK_WEEKS` maps `w16|w12|w10|w8|w6|w4` → week counts. Gate: `PERMISSIONS.departmentLeads.j2`. Collections: `Db.operations`, `Db.operationCampaigns` (reference date), `Db.tasks`. Side effects: `createNotification` (task_assigned) + `sendTaskAssignedDM` to reviewer.
- **DELETE** — removes the reviewer assignment (`deleteMany` on matching dev_check tasks for opId+checkId). Gate: `PERMISSIONS.departmentLeads.j2`. Collections: `Db.tasks`.

---


## Part C — Training / Tickets / SOPs / Snapshots API

Scope: `app/api/training/**` (27), `app/api/training-docs/**` (3), `app/api/tickets/**` (11), `app/api/sops/**` (2), `app/api/snapshots/**` (8). 51 files total.

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
- **POST** — member RSVP: cancel, or slot-based RSVP (trainer/trainee/sit-in) with capacity checks producing `attending`/`waitlist`; trainer slot requires `PERMISSIONS.training.trainer`; auto-promotes first waitlisted trainee on cancel/switch; manages a `Db.calendarReminders` entry (60-min-before) for confirmed attendees. Gate: `PERMISSIONS.pages.member`. Collections: `Db.trainingAttendance`, `Db.trainingEvents`, `Db.calendarReminders`. Side effects: `createNotification` on waitlist promotion, `logAction('training.rsvp.*')`.
- **PATCH** — bulk-marks `attended: boolean` for a list of members (post-session sign-off). Gate: `PERMISSIONS.training.manage` OR event owner. Collections: `Db.trainingAttendance`.

#### /api/training/events/[id]/award-qualifications
- **POST** — for a Completed+approved event, awards the matching `CERTIFICATIONS` entry (from `lib/military/certifications`) to each attended-but-unawarded member (pushes to `milpac.qualifications`, increments `milpac.promotionPoints`), marks `qualificationAwarded` on the attendance record. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingEvents`, `Db.trainingAttendance`, `Db.users`. Side effects: `createNotification` per member.

#### /api/training/import
- **POST** — parses a pasted CSV (F/Date/Trainees/J3 Staff/Training Run/Notes/Ticket#) into `training_import_records`; does not create live `TrainingEvent`/`TrainingTicket` docs. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingImportRecords` (insertMany). Side effects: `logAction('training.import.csv')`.
- **GET** — paginated list of previously imported CSV records. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingImportRecords`.

#### /api/training/master-sheet
- **GET** — paginated/filterable aggregation of training events joined with their `training_tickets` (via `$lookup` on `eventId`), plus distinct trainer and training-type lists for filter dropdowns. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingEvents` (aggregate), `Db.trainingTypes`.

#### /api/training/requests
- **GET** — lists training requests; J3 leads see all, members see pending/approved only. Gate: `PERMISSIONS.pages.member`. Collections: `Db.trainingRequests`.
- **POST** — member submits a request for a training type with optional preferred time/description. Gate: `PERMISSIONS.pages.member`. Collections: `Db.trainingRequests` (insert), `Db.trainingTypes` (read). Side effects: `createNotificationForRole` to J3 lead roles, `logAction('training.request.submit')`.

#### /api/training/requests/[id]
- **PATCH** — cancels the caller's own pending request (or any, if J3 lead). Gate: `PERMISSIONS.pages.member` + (owner OR `PERMISSIONS.training.manage`). Collections: `Db.trainingRequests`.

#### /api/training/requests/[id]/approve
- **POST** — J3 approves a request: creates a new approved `Db.trainingEvents` doc (trainer override or requester, scheduledAt override/preferredAt/+7 days fallback), auto-RSVPs trainer, marks request `approved` with `approvedEventId`, schedules reminders. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingRequests`, `Db.trainingTypes` (read), `Db.trainingEvents` (insert), `Db.trainingAttendance` (insert). Side effects: `scheduleTrainingReminders()`, `createNotification` to requester + interested members, `logAction('training.request.approve')`.

#### /api/training/requests/[id]/reject
- **POST** — rejects a pending request with optional reason. Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingRequests`. Side effects: `createNotification`, `logAction('training.request.reject')`.

#### /api/training/requests/[id]/interest
- **POST** — toggles the caller's "interested" flag on a pending request (`interestedUserIds`/`interestedCount`). Gate: `PERMISSIONS.pages.member`. Collections: `Db.trainingRequests`.

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
- **GET** — lists training types (auto-seeds `TRAINING_TYPE_DEFAULTS` if collection empty); visibility scoped by role (J3 leads: all, trainers: active+wip, members: active only). Gate: `PERMISSIONS.pages.member`. Collections: `Db.trainingTypes`.
- **POST** — creates a new training type (name/category/billetField/points/description/status/etc). Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingTypes` (insert). Side effects: `logAction('training.type.create')`.

#### /api/training/types/[id]
- **PATCH** — updates a training type's fields (core info, status incl. legacy `isActive` sync, event defaults, resource links, sortOrder). Gate: `PERMISSIONS.training.manage`. Collections: `Db.trainingTypes`. Side effects: `logAction('training.type.edit')`.

#### /api/training/types/[id]/docs
- **GET** — lists documents attached to a training type; visibility scoped (J3 leads: all, trainers: approved+own, members: approved only). Gate: `PERMISSIONS.pages.member`. Collections: `Db.trainingTypeDocs`.
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
- **GET** — lists items (`?parentId=`) in a folder or root, sorted folders-first then alphabetical; excludes `htmlContent`/`imageFiles` in projection. Gate: `PERMISSIONS.pages.member`. Collections: `Db.trainingDocs`.
- **POST** — creates a folder or blank document (JSON body), or uploads/parses a Google Docs `.zip` export (multipart) into a new document via `parseGoogleDocsZip`. Gate: `PERMISSIONS.trainingDocs.manage`. Collections: `Db.trainingDocs` (insert, then update after zip parse; deletes doc if parse fails).

#### /api/training-docs/[id]
- **GET** — fetches a full document including `htmlContent`. Gate: `PERMISSIONS.pages.member`. Collections: `Db.trainingDocs`.
- **PATCH** — updates name/parentId (move, with self-move and non-folder-target guards)/htmlContent (sanitized via `sanitizeDocHtml`)/iconName/color. Gate: `PERMISSIONS.trainingDocs.manage`. Collections: `Db.trainingDocs`.
- **DELETE** — deletes an item; folders are deleted recursively (children + their images via `deleteDocImages`). Gate: `PERMISSIONS.trainingDocs.manage`. Collections: `Db.trainingDocs`.

#### /api/training-docs/images/[filename]
- **GET** — serves an uploaded training-doc image from `uploads/training-docs/` with path-traversal guard (`path.basename`) and long-lived cache header. Gate: `PERMISSIONS.pages.member`. Collections: none (filesystem read).

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
- **GET** — lists all SOPs (excludes `yjsState` collab payload from projection), plus `isJ4` flag. Gate: `PERMISSIONS.pages.member`. Collections: `Db.sops`.
- **POST** — creates a new SOP shell (title/category/description); the Y.js document body is populated separately via the collab editor (`sop-{sopId}`). Gate: `PERMISSIONS.sops.manage`. Collections: `Db.sops` (insert).

#### /api/sops/[id]
- **PATCH** — updates title/category/description metadata (not content — that's collab-edited). Gate: `PERMISSIONS.sops.manage`. Collections: `Db.sops`.
- **DELETE** — hard-deletes the SOP document. Gate: `PERMISSIONS.sops.manage`. Collections: `Db.sops`.

---

## app/api/snapshots/**

All routes gated by `PERMISSIONS.departments.j4` (J4 department membership) and back onto filesystem/`lib/snapshots.ts` helpers rather than MongoDB — snapshots are full-site backup archives (DB + gallery + uploads), not a `Db.*` collection.

#### /api/snapshots
- **GET** — lists stored snapshot files (`listSnapshots()`) and current operation status (`readStatus()`). Gate: `PERMISSIONS.departments.j4`. Collections: none (filesystem + JSON status file via `lib/snapshots`).

#### /api/snapshots/create
- **POST** — fire-and-forget triggers `createSnapshot(options)` in the background (database/galleryContent/galleryFeatured/gallerySotm/uploads toggles); rejects (409) if an operation is already in progress. Gate: `PERMISSIONS.departments.j4`. No DB collection; writes to snapshots dir.

#### /api/snapshots/upload
- **POST** — accepts a multipart-uploaded `.zip` (buffered fully in memory), writes it to a temp path, then fire-and-forget `revertSnapshot(tmpPath)`; rejects if not idle. Gate: `PERMISSIONS.departments.j4`. Filesystem only.

#### /api/snapshots/revert
- **POST** — reverts to an existing stored snapshot by filename (validated via strict regex, path-traversal-safe join), fire-and-forget `revertSnapshot()`; rejects if not idle or file missing. Gate: `PERMISSIONS.departments.j4`. Filesystem only.

#### /api/snapshots/cancel
- **POST** — force-resets a stuck in-progress operation back to `idle` via `writeStatus()`. Gate: `PERMISSIONS.departments.j4`. Filesystem/status-file only.

#### /api/snapshots/config
- **GET** — reads snapshot config (`maxSnapshots`/`autoEnabled`/`intervalDays`). Gate: `PERMISSIONS.departments.j4`. Filesystem config file.
- **PATCH** — updates config with clamped ranges (`maxSnapshots` 1–20, `intervalDays` 1–30). Gate: `PERMISSIONS.departments.j4`. Filesystem config file.

#### /api/snapshots/[filename]
- **DELETE** — deletes a stored snapshot zip by validated filename. Gate: `PERMISSIONS.departments.j4`. Filesystem only.

#### /api/snapshots/[filename]/download
- **GET** — streams a snapshot zip to the browser as an attachment (Node `createReadStream` → web `ReadableStream`). Gate: `PERMISSIONS.departments.j4`. Filesystem only.

---


## Part D — Misc API

Covers `app/api/{teamspeak,cron,applications,me,gallery,community,uploads,minigame,members,notifications,upload,services-asot,recruit-session,maps,map-presets,dev,tfar,shoot,preferences,ping,orbat,milpacs,membercount,logout,generate,credits,award-request,auth}/**/route.ts` (excludes `gallery/admin/**`, which belongs to the admin catalog). 79 route files.

---

### teamspeak (11 files)

#### /api/teamspeak/clients
- **GET** — `?type=online|offline|all`. online/offline served from in-memory cache (`lib/teamspeak/cache.ts`) with background refresh; `all` does a full live TS query (server groups + paginated clientDbList + group memberships), ~60s. Auth: `PERMISSIONS.departments.j4`. Collections: none directly (uses TS3 query API + in-memory cache). Side effects: TeamSpeak ServerQuery calls.
- **POST** — triggers a background refresh of the offline client cache (no-op if already refreshing). Auth: `PERMISSIONS.departments.j4`.

#### /api/teamspeak/clients/[cldbid]/ban
- **POST** — bans a TS client by UID via `banadd` (body: `uid`, `duration`, `reason`; duration 0 = permanent). Auth: `PERMISSIONS.departments.j4`. Side effects: TeamSpeak ban.

#### /api/teamspeak/clients/[cldbid]/groups
- **POST** — adds a TS server group to a client; auto-applies any required "spacer" groups (`lib/teamspeak/tags.ts`); blocked if `checkTsGate()` denies (TS dev mode). Auth: `PERMISSIONS.departments.j4`.
- **DELETE** — removes a TS server group (`?sgid=`); auto-removes orphaned spacer groups if no longer needed; same dev-mode gate. Auth: `PERMISSIONS.departments.j4`.

#### /api/teamspeak/clients/[cldbid]/kick
- **POST** — kicks a client from the TS server (`clientkick`, reasonid 5). Auth: `PERMISSIONS.departments.j4`.

#### /api/teamspeak/clients/[cldbid]/poke
- **POST** — sends a TS poke message to a client (body: `clid`, `message`). Auth: `PERMISSIONS.departments.j4`.

#### /api/teamspeak/groups
- **GET** — returns cached TS server group list (`lib/teamspeak/cache.ts` `getGroupCache`), live-fetches if cache empty. Auth: `PERMISSIONS.admin.manageOrbatStructure`.

#### /api/teamspeak/roles-ordered
- **GET** — returns regular TS server groups sorted by TS's native `sortid` display order. Auth: `PERMISSIONS.departments.j4`.

#### /api/teamspeak/servergroups
- **GET** — returns regular TS server groups (id, name, iconId) alphabetically. Auth: `PERMISSIONS.departments.j4`.

#### /api/teamspeak/snapshots
- **GET** — lists all TS snapshot metadata (no `data` field), newest first. Auth: `PERMISSIONS.departments.j4`. Collections: `Db.teamspeakSnapshots`.
- **POST** — creates a manual TS snapshot (`ts.createSnapshot()`), stores blob in Mongo, enforces `MAX_SNAPSHOTS = 14` retention (deletes oldest). Auth: `PERMISSIONS.departments.j4`. Collections: `Db.teamspeakSnapshots`. Side effects: TeamSpeak snapshot creation.

#### /api/teamspeak/snapshots/[id]/restore
- **POST** — deploys a stored TS snapshot back onto the live server (`ts.deploySnapshot`). Auth: `PERMISSIONS.departments.j4`. Collections: `Db.teamspeakSnapshots`. Side effects: destructive TeamSpeak deploy.

#### /api/teamspeak/snapshots/[id]
- **DELETE** — deletes a stored snapshot document by id. Auth: `PERMISSIONS.departments.j4`. Collections: `Db.teamspeakSnapshots`.

---

### cron (9 files)

All routes gated by `verifyCronSecret(request)` from `lib/cron-auth.ts` (Bearer `CRON_SECRET`), called on a schedule by `server.mjs`.

#### /api/cron/application-reminders
- **GET** — finds J1 applications `status: 'reviewing'` past `reviewDueAt` and not yet reminded; marks linked `application_review` task overdue, notifies assigned reviewer + assigning J1 Lead, sets `overdueReminderSentAt`. Collections: `Db.j1Applications`, `Db.tasks`. Side effects: `createNotification`, `sendDM` (Discord).

#### /api/cron/calendar-reminders
- **GET** — three-part pass: (1) fires due `Db.calendarReminders` → notification + `sendCalendarReminderDM`; (2) drains `Db.meetingNotifQueue` (meeting_started/reminder/task_chaseup/attendance_overdue), resolves per-user or per-role recipients, skips LOA members, personalises reminder body by RSVP status, sends notification + `sendMeetingDM`; (3) fires due `Db.trainingReminders` for attending members → notification + `sendTrainingReminderDM`. Collections: `Db.calendarReminders`, `Db.meetingNotifQueue`, `Db.meetings`, `Db.trainingReminders`, `Db.trainingAttendance`, `Db.users`.

#### /api/cron/dev-check-escalation
- **GET** — runs hourly; for overdue `dev_check` tasks, checks whether the *next* check stage's due date (computed from op/campaign date minus weeks-out) has arrived; if so marks task `escalatedAt`/`overdue`, notifies J2 Department Leader + HQ Staff role, and creates an HQ escalation task. Collections: `Db.tasks`, `Db.operations`, `Db.operationCampaigns`. Side effects: `createNotificationForRole` x2, `Db.tasks.insertOne` (escalation task).

#### /api/cron/meeting-reminders
- **GET** — processes `Db.meetingNotifQueue` (fireAt <= now, not fired): resolves recipients by user/role, skips LOA for `meeting_reminder`, skips `meeting_attendance_overdue` if all confirmed, personalises body, sends notification + `sendMeetingDM`, marks fired. Collections: `Db.meetingNotifQueue`, `Db.meetings`, `Db.users`.

#### /api/cron/operations
- **GET** — runs every 5 min; multi-stage operations lifecycle driver: (0) RSVP auto-open at `rsvpOpenAt`; (1) RSVP auto-close (configurable offset before op date) + notifies section leaders via `getSectionLeaders`; (1b) CHQ allocation reminder 1hr before op start if unassigned reservists exist; (2) auto-activate Upcoming→Active at op start, mirrors attendance `stage` to `op_running`; (3) confirmation auto-open when op Completed, calls `createAttendanceTasksForOperation`; (4) confirmation auto-close 24h after opened. Collections: `Db.operationAttendance`, `Db.operations`, `Db.orbatPositions`. Side effects: `createNotification`, `lib/attendance/tasks.ts` task creation.

#### /api/cron/snapshots
- **GET** — creates a full site snapshot (`lib/snapshots.ts`) if `autoEnabled` config and interval elapsed and no snapshot already in progress; fire-and-forget `createSnapshot()`. No DB collections directly (uses file-based snapshot config/status via `lib/snapshots.ts`).

#### /api/cron/task-reminders
- **GET** — runs every minute; (1) chase-up reminders for tasks past `reminderDateTime` not yet notified → notification + `sendTaskReminderDM`; (1b) one-shot "orders check maker" reminders for `orders_check` tasks; (2) due/overdue notifications for tasks past `dueDate` → sets status `overdue`, notification + `sendTaskOverdueDM`; (3) task-limit escalation — counts incomplete tasks per member against `Db.notifPolicyConfig` policy thresholds, escalates via `createNotification` + `sendTaskEscalationDM` to configured recipient roles, sets `escalationLevel`. Collections: `Db.tasks`, `Db.notifPolicyConfig`, `Db.users`.

#### /api/cron/teamspeak-cache
- **GET** — triggers background refresh of the TeamSpeak offline client cache (`lib/teamspeak/cache.ts`), no-op if already refreshing. Called every 15 min.

#### /api/cron/teamspeak-snapshots
- **GET** — creates a daily auto TS snapshot (direct `ts3-nodejs-library` connection, not via cache module) and enforces 14-snapshot retention. Collections: `Db.teamspeakSnapshots`. Side effects: TeamSpeak snapshot creation.

---

### applications (8 files)

Public J1 recruitment/application flow (unauthenticated except `dev-login`).

#### /api/applications/check-name
- **GET** — `?name=` public in-game-name availability check; Levenshtein-distance ≤2 similarity warning. Auth: public/no auth. Collections: `Db.users`.

#### /api/applications/dev-login
- **GET** — dev-only (blocked outside `NODE_ENV=development`); returns current admin session info and sets `discord_join_session` cookie for local testing of the join flow. Auth: existing admin `token` cookie via `client.fetchMe()`.

#### /api/applications/discord-callback
- **GET** — Discord OAuth2 callback for the public "join" flow: exchanges code for token, fetches user + guilds, verifies guild membership, blocks users who already have the "ASOT Member" role, sets `discord_join_session` httpOnly cookie (30 min), redirects to `/join`. Auth: public/no auth. Collections: `Db.roles`. Side effects: Discord OAuth token exchange, `botRequest` guild member lookup.

#### /api/applications/discord-login
- **GET** — redirects to Discord OAuth2 authorize URL for the join flow. Auth: public/no auth.

#### /api/applications/discord-session
- **GET** — reads `discord_join_session` cookie, returns verified Discord identity or `{verified:false}`. Auth: public/no auth (cookie-based).
- **DELETE** — clears the `discord_join_session` cookie. Auth: public/no auth.

#### /api/applications/resolve-steam
- **GET** — `?url=` resolves a Steam profile URL/vanity name/raw SteamID64 to a SteamID64 (uses Steam community XML endpoint for vanity names, no API key). Auth: public/no auth.

#### /api/applications
- **POST** — public unauthenticated J1 application form submission; validates Discord session cookie, required fields, length limits, IP rate limit (max 2/24h via `x-real-ip`/`x-forwarded-for`), inserts into `Db.j1Applications`, notifies `J1-Recruiting`/`J1-Staff` roles, assigns Discord "Applicant" role, sets Discord nickname, clears session cookie. Collections: `Db.j1Applications`, `Db.roles`. Side effects: `createNotificationForRole` x2, `addGuildRole`, `setGuildNickname`.

#### /api/applications/steam-callback
- **GET** — Steam OpenID callback; verifies assertion with Steam, extracts SteamID64, redirects to `/join?steamId64=...`. Auth: public/no auth.

---

### me (5 files)

#### /api/me/orbat
- **GET** — returns the current user's ORBAT position entry (`getOrbatEntryByUserId`). Auth: any authenticated user (`client.fetchMe()`).

#### /api/me/roles
- **GET** — `?has=role1,role2` checks whether current user holds any of the given Discord roles. Auth: any authenticated user.

#### /api/me
- **GET** — returns current user document plus computed `isStaff`/`isMember` flags. Auth: any authenticated user.
- **POST** — updates `bio.*` fields on the current user document (upsert). Collections: `Db.users`.

#### /api/me/teamspeak
- **POST** — multi-action TS account linking flow via body `action`: `init` (auto-match online TS client by expected nickname, stores verify code), `poke` (poke a manually chosen client with the code), `verify` (confirm code, saves `teamspeak` field on user), `notify` (poke linked account with expected nickname), `list` (list online clients for manual pick). Auth: any authenticated user. Collections: `Db.users`. Side effects: TeamSpeak `clientPoke`/`clientList` calls.
- **DELETE** — unlinks the current user's TeamSpeak account (`$unset teamspeak/tsVerifyCode/tsPending`). Collections: `Db.users`.

#### /api/me/token
- **GET** — reads `token` cookie directly (no client.fetchMe() gate beyond cookie presence), resolves display name/color/avatar via `client.fetchMe(token)`; returns raw token to caller (used by TipTap collab client-side for `x-collab-token` header). Auth: `token` cookie presence only.

---

### gallery (5 files, excludes admin/*)

#### /api/gallery/featured
- **GET** — `?img=` serves a static file from `./gallery/featured/<img>` (no path-traversal guard beyond existence check). Auth: public/no auth.

#### /api/gallery/fetch
- **GET** — `?year&operation&stage&img` serves a gallery content image from `./gallery/content/...`; validates each path segment against `SAFE_SEGMENT` regex and resolves within `CONTENT_BASE` to block traversal. Auth: public/no auth.

#### /api/gallery
- **GET** — walks `./gallery/featured` and `./gallery/content/{year}/{operation}/{stage}` directories on disk and returns the full gallery tree as JSON. Auth: public/no auth. (Filesystem-only, no DB.)

#### /api/gallery/sotm/image
- **GET** — serves the current "Screenshot of the Month" image file from `./gallery/sotm/<filename>` per `Db.siteSettings` doc `_id: 'screenshotOfMonth'`. Auth: public/no auth. Collections: `Db.siteSettings`.

#### /api/gallery/sotm
- **GET** — returns SOTM metadata (filename, dateTaken, credit, operation link) sans `_id`. Auth: public/no auth. Collections: `Db.siteSettings`.
- **POST** — uploads a new SOTM image (multipart: `file`, `dateTaken`, `credit`, optional `operationId`/`operationTitle`); validates MIME type, sanitises filename, deletes old file if replaced, upserts `Db.siteSettings`. Auth: `PERMISSIONS.departmentLeads.j5`.
- **DELETE** — clears current SOTM (deletes file + doc). Auth: `PERMISSIONS.departmentLeads.j5`.

---

### community (5 files)

#### /api/community/callsigns
- **GET** — returns distinct ORBAT section titles grouped by category label (for complaint/callsign forms). Auth: any authenticated user. Collections: `Db.orbatPositions`.

#### /api/community/members
- **GET** — returns all active (non-skeleton, non-discharged) members with computed display names, for community-facing forms. Auth: any authenticated user. Collections: `Db.users`.

#### /api/community/quiz/[attemptId]
- **GET** — returns quiz definition (`getQuizById`) + the caller's own attempt; 403 if attempt doesn't belong to caller. Auth: any authenticated user (ownership check). Collections: `Db.quizAttempts`.
- **PATCH** — actions `start`/`save`/`submit` on the caller's own quiz attempt; `submit` computes time taken, sets `currentReviewerId` to assigning trainer, notifies the trainer. Auth: any authenticated user (ownership check). Collections: `Db.quizAttempts`, `Db.notifications` (direct insert).

#### /api/community/retired
- **GET** — public memorial-wall list of GD/HD discharged members; deduplicates against currently-active "ASOT Member" role holders by Discord ID and normalised callsign, resolves join year from `milpac.enlistedDate` or earliest `j1Applications` submission. Auth: public/no auth. Collections: `Db.retiredMembers`, `Db.roles`, `Db.users`, `Db.j1Applications`.

#### /api/community/retired/snapshot
- **GET** — `?discordId=` returns a retired member's frozen MilPac snapshot (intentionally public for the memorial wall). Auth: public/no auth. Collections: `Db.dischargeSnapshots`.

---

### uploads (3 files)

#### /api/uploads/bio
- **GET** — `?id=` serves `./uploads/bio/<id>.jpg` bio photo. Auth: public/no auth (read).
- **POST** — uploads/overwrites the caller's own bio photo (`./uploads/bio/<me.id>.jpg`). Auth: `PERMISSIONS.uploads.bio`.

#### /api/uploads/cover
- **GET** — `?id=` serves `./uploads/cover/<id>.png` cover photo. Auth: public/no auth (read).
- **POST** — uploads/overwrites the caller's own cover photo. Auth: any authenticated user.
- **DELETE** — deletes the caller's own cover photo file. Auth: any authenticated user.

#### /api/uploads
- **GET** — entirely commented-out stub handler; returns `undefined` (effectively no-op / 200 empty body). Auth: public/no auth (dead code — not wired to any real logic).

---

### minigame (3 files)

#### /api/minigame/live
- **GET** — returns currently-active players (seen <8s) + recently-dead players (died <10s) for the live minigame leaderboard overlay. Auth: public/no auth. Collections: `Db.minigameLive`.
- **POST** — heartbeat/death update for the caller's live player state (score, collectScore, dead flag); emits `minigameEmitter.emit('live', ...)` for SSE subscribers. Auth: any authenticated user. Collections: `Db.minigameLive`.
- **DELETE** — removes the caller's live player entry (on page close) and re-broadcasts. Auth: any authenticated user. Collections: `Db.minigameLive`.

#### /api/minigame/live/stream
- **GET** — SSE stream of live minigame player list; subscribes to `minigameEmitter` `'live'` events, 25s heartbeat. Auth: public/no auth (no `client.fetchMe()` call).

#### /api/minigame/score
- **GET** — `?all=true` returns all scores else top 10, sorted by total desc. Auth: public/no auth. Collections: `Db.minigameScores`.
- **POST** — submits a score; only overwrites if it's a new personal best, always increments `totalGems`. Auth: any authenticated user. Collections: `Db.minigameScores`.

---

### members (3 files)

#### /api/members
- **GET** — admin-only list of all Discord-linked (non-skeleton) users for lookup/matching; calls `client.updateRoles()` first. Auth: `PERMISSIONS.admin.massImport`. Collections: `Db.users`.

#### /api/members/[username]/confirmed-ops
- **GET** — returns the target member's confirmed-attendance operations history (cross-references `Db.operationAttendance` records with `confirmed: true`). Auth: `PERMISSIONS.members.edit`. Collections: `Db.operationAttendance`, `Db.operations`, `Db.users`.

#### /api/members/[username]
- **GET** — returns full member document by username. Auth: `PERMISSIONS.members.editStandard`. Collections: `Db.users`.
- **PUT** — updates milpac fields; splits into "standard" fields (promotions/awards/qualifications/name — `PERMISSIONS.members.editStandard`) and "restricted" fields (enlistedDate/bioRank/billetCounts/j4Points/disciplineHistory/disciplineDeductions — `PERMISSIONS.members.editRestricted`); stamps entries with issuer if missing; checks name uniqueness; triggers async Discord nickname rebuild via `buildNickname` + `setGuildNickname`. Collections: `Db.users`. Side effects: `setGuildNickname` (fire-and-forget).

---

### notifications (3 files)

#### /api/notifications
- **GET** — fetches caller's undismissed notifications (max 50, newest first); also opportunistically fires any due `Db.calendarReminders` for the caller inline (avoids needing external cron for this path). Auth: any authenticated user. Collections: `Db.notifications`, `Db.calendarReminders`. Side effects: `createNotification`, `sendCalendarReminderDM`.
- **DELETE** — dismisses (soft-deletes) all of the caller's notifications. Collections: `Db.notifications`.
- **PATCH** — marks all of the caller's notifications as read. Collections: `Db.notifications`.

#### /api/notifications/stream
- **GET** — SSE stream of live notifications for the caller; subscribes to `notificationEmitter` on `user:{userId}`, 25s heartbeat. Auth: any authenticated user (401 if not).

#### /api/notifications/[id]
- **PATCH** — marks a single notification (scoped to caller) as read. Collections: `Db.notifications`.
- **DELETE** — dismisses a single notification (scoped to caller). Collections: `Db.notifications`.

---

### upload (2 files)

#### /api/upload/image
- **GET** — `?id=<uuid>&ext=` serves a generic uploaded document image from `./uploads/documents/<id>.<ext>`; validates UUID format and extension whitelist. Auth: public/no auth (read).

#### /api/upload
- **POST** — generic authenticated image upload; validates extension + magic-byte signature (jpg/png/gif/webp), writes to `./uploads/documents/<uuid>.<ext>`, returns retrieval URL. Auth: any authenticated user.

---

### services-asot (2 files)

Driver's license tracker (India Company specific feature, role-gated by raw Discord role names, not `PERMISSIONS` constant).

#### /api/services-asot/drivers-license
- **GET** — returns all driver's license entries; seeds hardcoded `SEED_DATA` on first empty call. Auth: Discord role `'1-2'` (`VIEW_ROLES`). Collections: `Db.driversLicense`.
- **POST** — creates a new license entry (name/section/status). Auth: Discord role `'1-2-0 Command'` (`EDIT_ROLES`). Collections: `Db.driversLicense`.

#### /api/services-asot/drivers-license/[id]
- **PATCH** — updates an entry's status (Active/Under Review/Revoked). Auth: `'1-2-0 Command'`. Collections: `Db.driversLicense`.
- **DELETE** — deletes an entry by id. Auth: `'1-2-0 Command'`. Collections: `Db.driversLicense`.

---

### recruit-session (2 files)

#### /api/recruit-session
- **POST** — creates a new live recruitment "follow-along" session (recruiter shares a link, applicant views live form progress); generates `sessionId`/`recruiterToken`, 8h expiry. Auth: `PERMISSIONS.departments.j1`. Collections: `Db.recruitSessions`.

#### /api/recruit-session/[id]
- **GET** — public fetch of session state (step, raisedHand, applicant/recruiter names) for the applicant-facing follow-along page; 410 if expired. Auth: public/no auth. Collections: `Db.recruitSessions`.

---

### maps (2 files)

#### /api/maps/assets/[...path]
- **GET** — serves static map tile/terrain assets from `./maps/<...path>` (png/jpg/gz/json); path-traversal guarded via `resolve()` + prefix check. Auth: public/no auth.

#### /api/maps/worlds
- **GET** — returns available map worlds (`lib/maps.ts` `getAvailableWorlds()`). Auth: public/no auth.

---

### map-presets (2 files)

#### /api/map-presets
- **GET** — returns the caller's saved map icon/metis presets, newest first. Auth: any authenticated user. Collections: `Db.mapPresets`.
- **POST** — creates a new preset (`name`, `type: 'a3icon'|'a3metis'`, `a3Props`). Auth: any authenticated user. Collections: `Db.mapPresets`.

#### /api/map-presets/[id]
- **DELETE** — deletes a preset scoped to the caller (`userId` match required). Auth: any authenticated user. Collections: `Db.mapPresets`.

---

### dev (2 files)

Both explicitly marked "DEV-ONLY — delete before deploying to production" in source comments.

#### /api/dev/grant-all-roles
- **POST** — grants the caller every department + department-lead Discord role by name (hardcoded `TARGET_ROLE_NAMES` list), 1s delay between calls to avoid Discord rate limits. Auth: any authenticated user (no role/dev-mode gate beyond being logged in). Side effects: `botRequest` guild roles fetch, `addGuildRole` per role (Discord API mutations).

#### /api/dev/test-application
- **POST** — creates a pre-filled dummy J1 application (`TEST_xxxxx` in-game name) for testing the recruitment workflow; skips Discord role assignment/notifications. Auth: any authenticated user. Collections: `Db.j1Applications`.

---

### tfar (1 file)

#### /api/tfar/download
- **GET** — streams the current TFAR (Task Force Arrowhead Radio) plugin binary from `./storage/j1/<storedName>` per `Db.tfarPlugins` doc with `isCurrent: true`, as an attachment download. Auth: public/no auth. Collections: `Db.tfarPlugins`.

---

### shoot (1 file)

#### /api/shoot/avatars
- **GET** — public list of member display names + avatar URLs for the `/shoot` minigame's target sprites. Auth: public/no auth. Collections: `Db.users`.

---

### preferences (1 file)

#### /api/preferences
- **GET** — returns the caller's notification/UI preferences merged with type defaults (`NOTIFICATION_TYPES`) and any forced org-wide policy overrides. Auth: any authenticated user. Collections: `Db.userPreferences`, `Db.notifPolicyConfig`.
- **PUT** — updates caller's preferences (`cursorCustom`, per-type `notifications`), enforcing `forceWebsite`/`forceDiscord` policy flags server-side regardless of client input. Collections: `Db.userPreferences`, `Db.notifPolicyConfig`.

---

### ping (1 file)

#### /api/ping
- **GET** — returns 204 No Content; lightweight latency check for the applicant follow-along page. Auth: public/no auth.

---

### orbat (1 file)

#### /api/orbat/patch
- **GET** — `?category&section` serves an ORBAT section/category patch image from `./uploads/orbat/<file>`; falls back to any category-level patch if no exact section match. Auth: public/no auth. Collections: `Db.orbatSectionMeta`.

---

### milpacs (1 file)

#### /api/milpacs/[name]
- **GET** — `?type=medals` serves a generated milpac PNG (`./milpacs/<name>.png` or `<name>-medals.png`). Auth: public/no auth (read). Path-safety via `SAFE_NAME_RE`.
- **POST** — uploads/overwrites a milpac image file for a member. Auth: `PERMISSIONS.members.editStandard`.

---

### membercount (1 file)

#### /api/membercount
- **GET** — returns count of ORBAT positions with an assigned `userId` (excluding `inactiveReservist`). Auth: public/no auth. Collections: `Db.orbatPositions`. (Note: contains large commented-out dead code path that used to hit the Discord guild members API directly.)

---

### logout (1 file)

#### /api/logout
- **POST** — clears the `token` auth cookie (maxAge 0). Auth: public/no auth (self-service logout).

---

### generate (1 file)

#### /api/generate/milpac/[username]
- **POST** — regenerates a member's MilPac uniform + box renders (`lib/milpac-gen/uniform.ts`, `lib/milpac-gen/box.ts`) from current user/ORBAT data, computes and stores `milpac.uniformHash` for change detection. Auth: `PERMISSIONS.pages.admin`. Collections: `Db.users`. Uses `getOrbatEntryByUserId`, `@napi-rs/canvas`-based generators (native binary, `serverExternalPackages`).

---

### credits (1 file)

#### /api/credits
- **GET** — returns site credits data (`lib/credits.ts` `getCreditsData()`). Auth: public/no auth.

---

### award-request (1 file)

#### /api/award-request
- **POST** — any authenticated guild member nominates another member for an award; validates against `lib/military/awards.ts` `AWARDS` list, blocks self-nomination, creates a `j4-award` ticket. Auth: any authenticated user. Collections: `Db.tickets` (type `'j4-award'`, department `'j4'`).

---

### auth (1 file)

#### /api/auth/collab
- **GET** — Hocuspocus collab-auth endpoint; reads `x-collab-token` header (not the `token` cookie) and `?doc=` query param to resolve document-specific permission: `sop-*` docs → any member (`PERMISSIONS.pages.member`); `ws-*` docs → J2 member/lead/admin; all others (operation briefings) → `PERMISSIONS.auth.collab`. Auth: bespoke per-document logic, no single gate. Returns `{authorized, userId, userName, userAvatar}` consumed by the Hocuspocus WS server on each connection.

---


## Part E — Dashboard: J1-J4

Scope: `app/dashboard/j1/**`, `app/dashboard/j2/**`, `app/dashboard/j3/**`, `app/dashboard/j4/**`.

All four `page.tsx` files follow the identical shape: `await connection()`, `client.fetchMe()`, redirect to `/login` if unauthenticated, redirect to `/dashboard` if `!client.hasRoles(me, PERMISSIONS.departments.jN)`, then pass `displayName`, `userId`, `canManageMembers` (`PERMISSIONS.departmentLeads.jN`), and `isJ4` (`PERMISSIONS.departments.j4`) into the client `JNPanel`/`J4AdminPanel` component. Each has a `loading.tsx` rendering `<TacticalLoader label='LOADING JN // ...' />`.

Every panel's header has three toggle buttons (Members / Calendar / Activity Logs, or Logs for J4) that swap to shared components: `DeptMembersTab` (`app/dashboard/DeptMembersTab.tsx`), `DeptCalendarTab` (`app/dashboard/unit/calendar/DeptCalendarTab.tsx`), `ActivityLogTab` (`app/dashboard/_components/ActivityLogTab.tsx`). Tab state persisted via `useTabState` (`app/dashboard/_components/useTabState.ts`). Tab labels support pin-to-sidebar via `PinTabLabel`.

---

### J1 — Recruitment

#### app/dashboard/j1/page.tsx
Route `/dashboard/j1`. Gated by `PERMISSIONS.departments.j1`; computes `canManageMembers` from `PERMISSIONS.departmentLeads.j1` and `isJ4` from `PERMISSIONS.departments.j4`. Renders `J1Panel`.

#### app/dashboard/j1/J1Panel.tsx
Top-level client panel. Tabs: Recruit Member (0), Applications (1), Mastersheet (2), Statistics (3), Meetings (4, via shared `MeetingsTab`), Tickets (5, via shared `DeptTicketsTab department='j1'`), TFAR Plugin (6, lead/J4 only). Header toggles to `DeptMembersTab`/`DeptCalendarTab`/`ActivityLogTab` for `department='j1'`.

#### app/dashboard/j1/tabs/RecruitMemberTab.tsx
**Very large (3400 lines)** multi-step (14-step) guided recruitment wizard used live during a Discord/TS interview. Manages: interview checklist, introduction, background, availability, roles, BCT availability calendar (embeds `BCTAvailabilityCalendar`), ORBAT onboarding (`app/recruit-session/OrbatOnboarding`), rules/joining-agreement Q&A, join decision (accept/pend/decline), TS/TFAR/Discord role admin steps. Supports a **live co-browsing recruit session** over WebSocket (`NEXT_PUBLIC_BASEURL` rewritten to ws(s), path `/recruit-session`) that mirrors state to an applicant-facing page (`app/recruit-session/ApplicantPageView.tsx`) — cursor position, step sync, rules answers, name/field previews, raised-hand. Auto-saves an in-progress draft with debounce.
API calls: `GET/PUT /api/admin/j1/in-progress` (draft save/restore), `GET /api/admin/j1/members`, `GET/POST /api/admin/j1/applications`, `GET /api/applications/check-name`, `GET /api/applications/resolve-steam`, `POST /api/recruit-session` (create live session), `GET/POST /api/admin/tasks`.
Props: `{ displayName }`.

#### app/dashboard/j1/tabs/ApplicationsTab.tsx
Full applications queue/table with search, sort, status filters (pending/reviewing/returned/accepted/rejected), deep-link via `?app=<id>` query param. `ApplicationModal` sub-component handles the full review workflow: recruiter assignment with configurable review-deadline, recruiter recommendation (approve/deny/pend), J1 lead final decision (accept/reject/send-back/resubmit), J4 "returning member" override review, Discord account linking, delete (J4 only).
API calls: `GET /api/admin/j1/applications`, `GET /api/admin/j1/members`, `PATCH /api/admin/j1/applications/{id}`, `DELETE /api/admin/j1/applications/{id}`.
Props: `{ isJ4, isLead, userId }`.

#### app/dashboard/j1/tabs/MastersheetTab.tsx
Read-only sortable/searchable table of **accepted** members pulled from applications data, joined against discharge records. `DetailModal` shows full application detail; `DischargeSnapshotModal` shows a member's milpac-at-discharge snapshot (quals/awards/operations counts).
API calls: `GET /api/admin/j1/applications`, `GET /api/admin/j1/discharge-info`, `GET /api/community/retired/snapshot?discordId=`.

#### app/dashboard/j1/tabs/StatisticsTab.tsx
Recharts dashboard: applications/accepted-per-month bar charts, primary-role and region distribution (horizontal bars, normalizes free-text survey answers via `normalizeRole`/`normalizeRegion`), status distribution pie, recruiter leaderboard with `all/90d/30d` period filter.
API calls: `GET /api/admin/j1/applications`. No mutations — pure read/visualize.

#### app/dashboard/j1/tabs/TFARPluginTab.tsx
J1-lead-only file manager for the TFAR TeamSpeak plugin binary served to recruits (drag-drop upload of `.ts3_plugin`/`.zip`, delete, "current" flag, upload history, test-download link).
API calls: `GET/POST/DELETE /api/admin/j1/tfar-plugin`, download link `/api/tfar/download`.

#### app/dashboard/j1/tabs/BCTAvailabilityCalendar.tsx
Reusable `react-big-calendar` widget (month/week/agenda) for recording BCT (or BCT1-quiz) availability slots by time period (Morning/Afternoon/Evening). Click a day to open a slot picker with weekly-repeat option. Each slot maps 1:1 to a J3 calendar event tagged `isBCTAvailability`/`isQuizAvailability`. Supports `readOnly` mode (renders `externalSlots` without calendar interaction) — used both inside `RecruitMemberTab` (interactive) and on the applicant-facing preview page (read-only).
API calls: `GET /api/admin/calendar?department=j3`, `POST/PATCH/DELETE /api/admin/calendar[/:id]`.
Exports `TIME_PERIODS`, `BCTSlotSummary` type — reused by `RecruitMemberTab`/`ApplicantPageView`.

#### app/dashboard/j1/loading.tsx
`<TacticalLoader label='LOADING J1 // RECRUITMENT' />`.

---

### J2 — Mission Making

#### app/dashboard/j2/page.tsx
Route `/dashboard/j2`. Gated by `PERMISSIONS.departments.j2`. Renders `J2Panel`.

#### app/dashboard/j2/J2Panel.tsx
Tabs: Operations (0), Meetings (1), Tickets (2), Members Workspace (3), Mission Checks (4), ERA Options (5, lead-only). Header toggles to `DeptMembersTab`/`DeptCalendarTab` (passes extra `isJ2Lead` prop)/`ActivityLogTab` for `department='j2'`.

#### app/dashboard/j2/tabs/J2OperationsTab.tsx
**Very large (3400+ lines)** — the core J2 operations board: list/campaign view toggle, status filter (`In Development`/`Upcoming`/`Active`/`Completed`), type filter (Campaigns/Single Missions), search, recycle bin ("bin" view mode with restore/purge), template system (save-as-template via bookmark icon, `TemplatePicker` modal to instantiate), campaign builder (drag missions onto day slots, `AssignCampaignSection` to link/unlink an op to a campaign, campaign normalise), duplicate/duplicate-partial operation, new operation creation, undo toast for delete/restore.
API calls (extensive): `GET/POST /api/operations`, `/api/operations/new`, `/api/operations/update`, `/api/operations/delete`, `/api/operations/restore`, `/api/operations/purge`, `/api/operations/duplicate`, `/api/operations/duplicate-partial`, `/api/operations/bin`, `/api/operations/notes`, `/api/operations/templates[/apply]`, `/api/operations/campaigns[/:id]`, `/api/operations/campaigns/assign`, `/api/operations/campaigns/:id/normalise`, `/api/operations/campaign-missions[/:id][/link]`.
Props: `{ isJ4 }`.

#### app/dashboard/j2/tabs/MembersWorkspaceTab.tsx
Per-J2-member workspace browser: member list (file/doc/op counts, last activity) → drill into a member's uploaded files, collaborative docs (TipTap via `CollabEditor`, doc naming `ws-{docId}`), owned operations (with campaign-tree view added in a later commit), and an activity log filtered to that member. Doc version history with restore.
API calls: `GET /api/j2/workspace/members`, `GET /api/j2/workspace/files?memberId=`, `GET /api/j2/workspace/docs?memberId=`, `GET /api/operations?authorId=`, `GET /api/operations/campaigns`, `GET /api/j2/workspace/activity`, `POST/DELETE /api/j2/workspace/files[?id=]`, `POST/GET/PATCH/DELETE /api/j2/workspace/docs[/:id]`, `GET/POST /api/j2/workspace/docs/:id/versions`, `POST /api/j2/workspace/docs/:id/versions/:vid/restore`.
Props: `{ userId, isJ4, canManage }`.

#### app/dashboard/j2/tabs/MissionChecksTab.tsx
Tracks "mission development checks" (Wn-Check milestones counting down to an op/campaign date) across all operations. Filter: active/overdue/completed/all. Each op row expands to show per-check due date, time-left, completion state, assigned reviewer; J2 leads can assign/reassign a reviewer via `AssignModal` (creates a task + notification).
API calls: `GET /api/j2/dev-checks?filter=`, `POST/DELETE /api/j2/dev-checks/:opId/:checkId`, `GET /api/admin/members?department=j2`.
Props: `{ userId, isJ2Lead }`.

#### app/dashboard/j2/tabs/EraOptionsTab.tsx
Simple lead-only CRUD list for the "ERA/setting" options offered in the operation editor (add/rename/delete; default options can be renamed but not deleted).
API calls: `GET/POST/PATCH/DELETE /api/admin/era-options[?id=]`.

#### app/dashboard/j2/loading.tsx
`<TacticalLoader label='LOADING J2 // MISSION MAKING' />`.

---

### J3 — Training

#### app/dashboard/j3/page.tsx
Route `/dashboard/j3`. Gated by `PERMISSIONS.departments.j3`. Renders `J3Panel`.

#### app/dashboard/j3/J3Panel.tsx
Tabs: Training Hub (0, via shared `TrainingHub` from `app/dashboard/unit/training-docs/TrainingHub.tsx`), Training Tickets (1), Training Calendar (2, `DeptCalendarTab department='j3'`), Training Requests (3, via shared `EventsTab` from `app/dashboard/unit/training-docs/EventsTab.tsx`), Training Records (4), Meetings (5), Tickets (6, `DeptTicketsTab department='j3'`), Master Sheet (7), CSV Import (8). Header toggles Members/Activity Logs only (no Calendar toggle — calendar is an inline tab instead).

#### app/dashboard/j3/tabs/TrainingTicketsTab.tsx
Review queue for completed-training tickets submitted by trainers (per-attendee trainer/trainee/sit-in slot type, pass/fail, qualification + billet-point award flags). J3 leads approve/reject/request-amendments; ticket detail expands to show all attendees and trainer/J3 notes.
API calls: `GET /api/training/tickets`, `POST /api/training/tickets/:id/approve`, `/reject`, `/amend`, `GET /api/training/tickets/:id`.

#### app/dashboard/j3/tabs/TrainingRecordsTab.tsx
BCT1 quiz attempt records list with status filter (all/pending_review/passed/failed); opens `AssignQuizModal` to assign the BCT1 quiz to a recruit (custom time limit with required justification if modified from default). Row click likely routes to a quiz review page.
API calls: `GET /api/admin/quiz/attempts?status=`.
Props: `{ userId, canManageMembers }`.

#### app/dashboard/j3/tabs/AssignQuizModal.tsx
Modal to assign the BCT1 quiz (`lib/quiz-data`) to a specific recruit, with adjustable time limit (must supply a reason if changed from the default).
API calls: `GET /api/admin/quiz/recruits`, `POST /api/admin/quiz/assign`.
Props: `{ onClose, onAssigned }`.

#### app/dashboard/j3/tabs/J3MasterSheetTab.tsx
Wide sync-scrolling certification matrix — one row per member, one column per J3 cert (`J3_CERTS` list with abbreviations, e.g. BCT1/BCT2/MED/CQB/IDF/DFSW/BRW/ARW/CAS/RTO/FO/NCO/SLP/DRV/VCP/RIFLE/MG/AT/GLA/PISTOL). Reads billet-mastersheet data.
API calls: `GET /api/admin/j4/mastersheet/billet?search=` (shared with J4's billet mastersheet endpoint).

#### app/dashboard/j3/tabs/TrainingImportTab.tsx
CSV bulk-importer for historical training records (paste/upload CSV → parse → import), paginated import history table.
API calls: `GET/POST /api/training/import[?limit=&offset=]`.

#### app/dashboard/j3/tabs/PromotionTicketsTab.tsx
**Orphaned/unused** — not imported by `J3Panel.tsx` or any other file (verified via grep). Implements a promote/demote ticket submission form (rank picker from `RANK_GROUPS`) plus "my submitted tickets" list.
API calls: `GET /api/admin/members`, `GET/POST /api/admin/tickets?issuedById=` (type `j3-promotion`). Superseded by the shared `DeptTicketsTab`.

#### app/dashboard/j3/tabs/QualificationTicketsTab.tsx
**Orphaned/unused** — not imported anywhere (verified via grep). Implements single/bulk qualification add-or-remove ticket submission (uses `CERTIFICATIONS` from `lib/military/certifications`) plus "my submitted tickets" list.
API calls: `GET /api/admin/members`, `GET/POST /api/admin/tickets?issuedById=` (type `j3-qualification`). Superseded by the shared `DeptTicketsTab`.

#### app/dashboard/j3/loading.tsx
`<TacticalLoader label='LOADING J3 // TRAINING' />`.

---

### J4 — Administration

#### app/dashboard/j4/page.tsx
Route `/dashboard/j4`. Gated by `PERMISSIONS.departments.j4`. Renders `J4AdminPanel` (no separate `canManageMembers`/`isJ4` props needed — J4 members are always leads/J4).

#### app/dashboard/j4/J4AdminPanel.tsx
Main J4 panel. Tabs: Mastersheet (0, `MasterSheetTab`), Tickets (1, `CommunityTicketsTab`), Meetings (2, `J4MeetingsTab`), Snapshots (3, `SnapshotsTab`), Teamspeak (4, `TeamspeakTab`), Tools (5 — grid of action tiles, not a separate component file). Header toggles: Members (`DeptMembersTab department='j4'`, `canManage=true`), Calendar (`DeptCalendarTab department='j4'`), Activity Logs (`LogsTab`, note: uses `view==='logs'` not `'activity'`).
Contains three modals defined inline: `DischargeModal` (submits `j4-discharge` ticket via `POST /api/admin/tickets`, requires target member/discharge-type/reason), `ReinstateModal` (two-step: pick discharged member from `GET /api/admin/members/discharged`, then choose which snapshot data — qualifications/awards/trainings/campaign medals — to restore via `PATCH /api/admin/members/discharged`), `TestNotificationModal` (send a test notification to self or another member via any of `NOTIF_TYPES`, channels site/discord, via `POST /api/admin/notifications/test`).
Tools grid also includes: Import Panel (opens shared `ImportPanel` from `app/dashboard/j4/../ImportPanel` i.e. `app/dashboard/ImportPanel.tsx`), Discord Developer Mode toggle (`GET/POST /api/admin/discord-devmode`), TeamSpeak Developer Mode toggle (`GET/POST /api/admin/teamspeak-devmode`), Test Notification launcher, link to HQ Mastersheet (tab 0), link to `/dashboard/j4/preferences` (Website Settings).

#### app/dashboard/j4/preferences/page.tsx
Route `/dashboard/j4/preferences` ("Website Settings"). Client component, no explicit auth check in this file itself (relies on being linked only from the gated J4 panel — **note**: this page does not appear to re-verify `PERMISSIONS.departments.j4` server-side; it's a client page with no page-level guard visible in this file). Three sub-tabs:
- `NotificationPolicyPanel` — force-on/off website & Discord delivery per `NotificationType` (grouped by `NOTIF_CATEGORIES` from `lib/notifications/types`). `GET/PUT /api/admin/notification-policy`.
- `TaskLimitPolicyPanel` — configure per-staff-group (`EscalationGroup` from `lib/lockout`) two-threshold task-count escalation with configurable notify-roles. `GET/PUT /api/admin/task-limit-policy`.
- `TaskLockoutPolicyPanel` — per-group (`LockoutGroup` from `lib/lockout`) toggle for whether overdue unactioned tasks lock a member out of the rest of the portal. `GET/PUT /api/admin/task-lockout-policy`.

#### app/dashboard/j4/SnapshotsTab.tsx
Database snapshot manager: create/revert/upload/download/delete site DB snapshots, tracks in-progress operation status and estimated duration (via localStorage history of past durations), snapshot auto-config settings.
API calls: `GET /api/snapshots`, `GET/PUT /api/snapshots/config`, `POST /api/snapshots/cancel`, `POST /api/snapshots/create`, `POST /api/snapshots/revert`, `DELETE /api/snapshots/:filename`, `POST /api/snapshots/upload`.

#### app/dashboard/j4/tabs/CommunityTicketsTab.tsx
Community-facing ticket triage board (requests/bug-reports/missions/campaigns/unit-feedback/complaints/awards categories) with category or table view, status/department filters, search, soft-delete visibility toggle, cross-department transfer.
API calls: `GET /api/feedback?...`, `GET/PATCH /api/tickets/:id`, `POST /api/tickets/:id/transfer`.

#### app/dashboard/j4/tabs/J4MeetingsTab.tsx
All-department meetings viewer defaulted to `j4` filter (own vs imported/transferred meetings), reuses `MeetingListItem`/`MeetingDetail` from `app/dashboard/_components/meetings/`.
API calls: `GET /api/admin/meetings/all?department=&imported=`.
Props: `{ userId }`.

#### app/dashboard/j4/tabs/LogsTab.tsx
Two-mode log viewer: error logs (`type=error`) and the shared `ActivityLogTab` component embedded for general action logs; paginated.
API calls: `GET /api/admin/logs?type=error&page=&limit=50`, `GET /api/admin/logs?...` (general).

#### app/dashboard/j4/tabs/TeamspeakTab.tsx
TeamSpeak admin console: online/offline client browser with server-group management per client, TS snapshot list with create/restore/delete.
API calls: `GET/POST /api/teamspeak/snapshots`, `DELETE /api/teamspeak/snapshots/:id`, `POST /api/teamspeak/snapshots/:id/restore`, `GET /api/teamspeak/clients?type=online|offline`, `GET /api/teamspeak/clients/:cldbid/groups`, `POST/DELETE /api/teamspeak/clients/:cldbid/groups?sgid=`.

#### app/dashboard/j4/tabs/MasterSheetTab.tsx
Container for the "HQ Mastersheet" — wraps `MastersheetContext` (from `mastersheet-context.ts`) providing `pendingChanges`/review-queue state shared across sub-tabs, and renders `BilletMastersheetTab` plus inline Leaving-History / Denied-Applications / Discipline / Recycle-Bin sub-tables (`activeSub` state: `'billet' | 'leaving' | 'denied' | 'discipline'`).
API calls: `GET/POST/DELETE /api/admin/j4/mastersheet/leaving-history[/:id]`, `/denied-applications[/:id]`, `/discipline[/:id]`, `GET/POST/DELETE /api/admin/j4/mastersheet/recycle-bin[/:id]`.

#### app/dashboard/j4/tabs/BilletMastersheetTab.tsx
The core wide member roster/billet spreadsheet — per-member row with cert/award abbreviation badges (`CERT_ABBR`, `AWARD_ABBR` maps), inline-editable fields, email management, opens `MemberDetailPanel` (from `app/dashboard/personnel/all/MemberDetailPanel.tsx`) for full member drill-down. Uses `useMastersheetCtx()` to register pending changes for the shared review queue.
API calls: `GET/POST /api/admin/j4/member-emails/:memberId`, `/import`, `/import/confirm`, `GET/POST/DELETE /api/admin/j4/mastersheet/billet[?search=][/:id]`, `POST /api/admin/j4/mastersheet/member-milpac`.
Type: `BilletRow`, `FieldSourceDef`, `EmailEntry` from `lib/billetMastersheet`.

#### app/dashboard/j4/tabs/mastersheet-context.ts
Not a component — defines `MastersheetContext` (React context) + `useMastersheetCtx()` hook + types `MastersheetSubTab`, `PendingChange`, `MastersheetContextValue`. Shared pending-change review-queue state (each change keyed `${tab}:${rowId}:${field}`) used across all J4 Mastersheet sub-tabs so edits can be batched and reviewed before commit.

#### app/dashboard/j4/loading.tsx
`<TacticalLoader label='LOADING J4 // ADMINISTRATION' />`.

---


## Part F — Dashboard: J5-J7 and other

Scope: `app/dashboard/j5/**`, `app/dashboard/j6/**`, `app/dashboard/j7/**`, `app/dashboard/personnel/**`, `app/dashboard/orbat/**`, `app/dashboard/quiz/**`, `app/dashboard/retired/**`, `app/dashboard/tasks/**`, `app/dashboard/unit/**`, `app/dashboard/meeting/**`, `app/dashboard/_components/**`, plus dashboard root `layout.tsx`/`page.tsx`.

---

## Dashboard Root

#### app/dashboard/layout.tsx
Server layout gating the entire staff/member portal. Redirects to `/login` if unauthenticated, to `/me` if not `PERMISSIONS.pages.member`. Computes a `permissions` object (`isStaff`, `canSeeJ1`–`canSeeJ7`, `canManageJ1`, `canSeeOrbat`, `canSeePersonnel`, `displayName`) from `PERMISSIONS.departments.*` / `PERMISSIONS.pages.*` and passes it to `StaffDashboardShell` (sidebar/shell component, outside this scope) wrapping `children`.

#### app/dashboard/page.tsx
Route: `/dashboard`. Same permission computation as layout (duplicated) and renders `DashboardOverview` (outside scope) — the portal landing page.

---

## J5 — Media

#### app/dashboard/j5/page.tsx
Route: `/dashboard/j5`. Gate: `PERMISSIONS.departments.j5` (redirects `/dashboard` on failure). Computes `canManageMembers` (`departmentLeads.j5`) and `isJ4`, renders `J5Panel`.

#### app/dashboard/j5/J5Panel.tsx
Client shell for the J5 dept page. Header with title "[J5] Media" + toggle buttons for Members/Calendar/Activity Log views (via `useTabState`, URL-backed). Default "dept" view has 5 sub-tabs: Operations (`GalleryOperationsTab`), Featured Images (`GalleryFeaturedTab`), Screenshot of Month (`ScreenshotOfMonthTab`), Meetings (`MeetingsTab`), Tickets (`DeptTicketsTab`). Reuses `DeptMembersTab` and `DeptCalendarTab` (outside this scope) for the Members/Calendar toggle views. Same shape reused by J6Panel/J7Panel.

#### app/dashboard/j5/loading.tsx
`<TacticalLoader label='LOADING J5 // MEDIA' />`.

#### app/dashboard/j5/tabs/GalleryOperationsTab.tsx
Client component: hierarchical gallery manager for operation screenshots — Year → Operation → Stage → images. Expand/collapse tree, add/delete year/operation/stage folders (with type-to-confirm delete), multi-select + bulk delete images, drag-and-drop reorder within a stage (persisted via reorder endpoint), hover image preview, file upload per stage. Calls `GET/POST/DELETE /api/gallery`, `/api/gallery/admin/folder`, `/api/gallery/admin/images`, `/api/gallery/admin/reorder`. Images served via `/api/gallery/fetch?year=&operation=&stage=&img=`.

#### app/dashboard/j5/tabs/GalleryFeaturedTab.tsx
Client component: flat grid gallery for "featured" images (not tied to an operation). Multi-select, bulk delete (confirm dialog), paginated "Load More", multi-file upload, hover preview. Calls `GET /api/gallery`, `POST/DELETE /api/gallery/admin/featured`. Images served via `/api/gallery/featured?img=`.

#### app/dashboard/j5/tabs/ScreenshotOfMonthTab.tsx
Client component: view/set the current "Screenshot of the Month" (SOTM). Shows current SOTM (image, date taken, credit, linked operation) with a Clear button; `canManage` prop gates an upload form (file + date + credit + optional operation search-select) to replace it. Calls `GET/POST/DELETE /api/gallery/sotm`, image at `/api/gallery/sotm/image`, operation search via `GET /api/operations?search=`.

---

## J6 — Game Masters

#### app/dashboard/j6/page.tsx
Route: `/dashboard/j6`. Gate: `PERMISSIONS.departments.j6`. Renders `J6Panel` with `canManageMembers` (`departmentLeads.j6`), `isJ4`.

#### app/dashboard/j6/J6Panel.tsx
Same shell pattern as J5Panel, header "[J6] Game Masters". Dept tabs: Zeus Notes (`ZeusNotesTab`), Meetings, Tickets (only 3 tabs, no gallery-style tab).

#### app/dashboard/j6/ZeusNotesTab.tsx
Client component: master-detail view for per-operation "Zeus notes" (Zeus/GM freeform notes attached to an operation). Left: searchable, paginated operation list (title, date, status, has-notes indicator dot). Right: view/edit notes textarea for the selected op with Save/Cancel. Calls `GET/POST /api/operations/zeus-notes` (list paginated via `?page=&search=`, save via `{ id, notes }`).

#### app/dashboard/j6/loading.tsx
`<TacticalLoader label='LOADING J6 // GAME MASTERS' />`.

---

## J7 — Development

#### app/dashboard/j7/page.tsx
Route: `/dashboard/j7`. Gate: `PERMISSIONS.departments.j7`. Renders `J7Panel` with `canManageMembers` (`departmentLeads.j7`), `isJ4`.

#### app/dashboard/j7/J7Panel.tsx
Same shell pattern, header "[J7] Development". Dept tabs: Meetings, Tickets only (no dept-specific feature tab — J7 has no unique content tab beyond Members/Calendar/Activity toggle + Meetings/Tickets).

#### app/dashboard/j7/loading.tsx
`<TacticalLoader label='LOADING J7 // DEVELOPMENT' />`.

---

## Personnel

#### app/dashboard/personnel/all/page.tsx
Route: `/dashboard/personnel/all`. Gate: `PERMISSIONS.pages.members`. Computes `canEditRestricted` (`members.editRestricted`), `canEditStandard` (`members.editStandard`), `canImpersonate` (`admin.impersonate`), `isJ4`. Renders `AllMembersPanel`.

#### app/dashboard/personnel/all/AllMembersPanel.tsx
Master-detail member browser/editor. Left: paginated (25/page), debounced-search member list with avatar, rank, current ORBAT role; selecting a member warns on unsaved changes (`dirty` state) before switching. Right: `MemberDetailPanel` for the selected member (keyed by username to reset state). Calls `GET /api/admin/members?page=&limit=&search=`.

#### app/dashboard/personnel/all/MemberDetailPanel.tsx
Full milpac editor + J4 administration panel for one member. Embeds `MilpacEditor` (from `app/members/[username]/MilpacEditor`, outside scope) for standard milpac editing (`canEditRestricted`/`canEditStandard`/`canImpersonate` props, `nameReadOnly` when viewer is J4). Below it, an `isJ4`-only admin panel: display-name override (with live preview of resulting Discord nickname `"{rank} {name}"`), chaplain toggle, department membership toggles (add/remove `j1`–`j7`, shows ★ for team leads which are ticket-managed not directly toggleable), Discord role management (search/add/remove any guild role), and a "Danger Zone" with type-to-confirm member account deletion. Calls `GET /api/members/{username}`, `GET /api/members/{username}/confirmed-ops`, `GET /api/admin/members/{userId}/discord-roles`, `PATCH /api/admin/members/{id}` (body varies: `{name}`, `{chaplain}`, `{department, action}`), `PATCH /api/admin/members/{id}/discord-roles` (`{roleId, action}`), `DELETE /api/admin/members/{id}`.

#### app/dashboard/personnel/all/loading.tsx
`<TacticalLoader label='LOADING ALL MEMBERS' />`.

#### app/dashboard/personnel/all-staff/page.tsx
Route: `/dashboard/personnel/all-staff`. Gate: `PERMISSIONS.pages.admin`. Renders `AllStaffPanel`.

#### app/dashboard/personnel/all-staff/AllStaffPanel.tsx
Simple tab shell ("Move Requests" / "Discipline" / "Performance Reports") over the three staff-ticket tabs below. No fetches itself.

#### app/dashboard/personnel/all-staff/tabs/MoveRequestsTab.tsx
Submit/approve ORBAT move-request tickets. Form: autocomplete pick an occupied ORBAT position (member), pick destination (Active Reservist or a section with a vacant position, then a specific vacant role), optional notes; submits — auto-applies immediately if the requester has authority, else routes to the required approver. Also shows "Pending My Approval" table (Approve/Reject buttons) and "My Submitted Requests" table with status chips. Calls `GET /api/admin/orbat/for-move` (flat position list), `GET /api/admin/tickets?issuedById=`/`?requiredApproverUserId=&status=open` (filtered client-side to `type === 'move-request'`), `POST /api/admin/tickets` (`{type:'move-request', targetUserId, fromPositionId, toPositionId|toIsReservist, notes}`), `PATCH /api/admin/tickets/{id}` (`{decision: 'approve'|'reject'}`). Uses `PLATOON_CATEGORIES`/`RESERVIST_CATEGORY_IDS` from `lib/orbat/constants`.

#### app/dashboard/personnel/all-staff/tabs/DisciplineTab.tsx
Submit a discipline ticket against a member (member autocomplete + reason + notes) and view "My Submitted Tickets" table (status chip, points deducted). Calls `GET /api/admin/members`, `GET /api/admin/tickets?issuedById=` (filtered to `type==='discipline'`), `POST /api/admin/tickets` (`{type:'discipline', targetUserId, disciplineReason, notes}`).

#### app/dashboard/personnel/all-staff/tabs/PerformanceReportTab.tsx
Same shape as DisciplineTab but for performance reports (`type==='performance-report'`, field `performanceReason`). Calls `GET /api/admin/members`, `GET /api/admin/tickets?issuedById=`, `POST /api/admin/tickets`.

#### app/dashboard/personnel/all-staff/loading.tsx
`<TacticalLoader label='LOADING PERSONNEL' />`.

#### app/dashboard/personnel/hq-staff/page.tsx
Route: `/dashboard/personnel/hq-staff`. Gate: `PERMISSIONS.pages.members`. Static "Work in Progress" placeholder page — no client component, no data fetching.

#### app/dashboard/personnel/hq-staff/loading.tsx
`<TacticalLoader label='LOADING HQ STAFF' />`.

---

## ORBAT

#### app/dashboard/orbat/page.tsx
Route: `/dashboard/orbat`. Gate: `PERMISSIONS.admin.manageOrbat`. Also computes `canManageStructure` (`admin.manageOrbatStructure`), `canManageMembers` (`admin.manageOrbatMembers`), `canMilpacEditRestricted`/`canMilpacEditStandard` (`members.editRestricted`/`editStandard`). Server-fetches **all** users directly via `Db.users.find({})` (not paginated) to build a picker list `{id, username, displayName, avatarURL}`, passed as `initialUsers` to `OrbatManager`.

#### app/dashboard/orbat/OrbatManager.tsx (1671 lines — large)
The full ORBAT structure + member-assignment editor. Renders category tabs per `PLATOON_CATEGORIES`/`RESERVIST_CATEGORIES`/`SINGLE_SECTION_CATEGORIES` (`lib/orbat/constants`), each broken into sections (`buildSections()` groups positions by `sectionTitle`). Features: drag-and-drop position reordering within a section (`@dnd-kit/core` + `@dnd-kit/sortable`), inline section/role rename, add/delete sections and positions, member picker per position (search all users) with conflict resolution modal (swap/bump when assigning an already-placed member), reservist add (active/inactive), section metadata (icon/patch image upload, Discord role linkage) via `/meta` endpoints, embedded `MilpacEditor` flyout to view/edit a clicked member's milpac inline, and a Discord-role picker per section (`rolePickerTarget`). Calls: `GET /api/admin/orbat`, `GET /api/admin/orbat/meta`, `GET /api/admin/orbat/discord-roles`, `POST/PATCH /api/admin/orbat/meta` + `POST /api/admin/orbat/meta/patch` (image upload), `PATCH/DELETE /api/admin/orbat/{positionId}`, `POST /api/admin/orbat/positions`, `POST/PATCH/DELETE /api/admin/orbat/sections`, `POST/PATCH/DELETE /api/admin/orbat/reservists`, plus `GET /api/members/{username}` + `/confirmed-ops` for the milpac flyout.

#### app/dashboard/orbat/loading.tsx
`<TacticalLoader label='LOADING ORBAT' />`.

---

## Quiz (Review)

#### app/dashboard/quiz/review/[attemptId]/page.tsx
Route: `/dashboard/quiz/review/[attemptId]`. Gate: `PERMISSIONS.quiz.review` (redirects `/dashboard/j3` on failure or invalid/missing attempt/quiz). Server-loads the `QuizAttempt` doc from `Db.quizAttempts` directly and the static quiz definition via `getQuizById()` (`lib/quiz-data`), serializes dates to ISO strings, computes `canEscalate` (`quiz.reviewEscalated`) and `isJ4`, renders `QuizReviewClient`.

#### app/dashboard/quiz/review/[attemptId]/quiz-review-client.tsx
Full quiz-attempt review/marking UI for J3 trainers. Left sidebar (`QuizSectionSidebar`, outside scope) for section nav with per-question tick state. Centre renders each question via `QuizQuestionCard` (outside scope) in read-only mode with reviewer marking controls per written/image question (or per-box for multi-box questions) — auto-grades multiple-choice, manual correct/incorrect for written. Right panel shows time taken, live score vs pass mark (with progress bar), status, and a decision panel (Pass / Fail / Send for Review with required notes on escalation). Calls `POST /api/admin/quiz/review/{attemptId}` (`{action, notes, questionDecisions, score, totalPoints}`), then redirects to `/dashboard/j3`.

---

## Retired Members

#### app/dashboard/retired/page.tsx
Route: `/dashboard/retired`. **No server component / no explicit permission gate in this file** — file starts directly with `'use client'`, so access control relies solely on the parent `app/dashboard/layout.tsx` gate (`PERMISSIONS.pages.member`), not a J4-specific check, despite the UI being J4-Administration tooling. CSV importer for the "HQ Leaving History" spreadsheet (discharge records) plus a raw JSON "patch" tool for fixing individual records. Upload/paste CSV → preview row count → Run Import (shows inserted/updated/skipped counts + skipped-row reasons table). Patch panel accepts a JSON array of `{find,set}` or `{upsert}` operations. Calls `POST /api/admin/retired/import` (CSV body, `text/plain`), `PATCH /api/admin/retired/import` (JSON patch array).

---

## Tasks

#### app/dashboard/tasks/page.tsx
Route: `/dashboard/tasks`. Gate: `PERMISSIONS.pages.admin` (redirects `/me`). Computes `isElevated` (`departments.j4`) and resolves the caller's Discord role names to determine `isAllBatStaff` (`HQ Staff`/`All Staff` roles) and `userDepts` (via a hardcoded `DEPT_ROLE_MAP` of dept → Discord role names). Computes `availableRoles` — the set of roles this user may assign tasks to (all roles if elevated/all-staff, else only their own department's roles) — and passes everything to `TasksPage`.

#### app/dashboard/tasks/TasksPage.tsx (978 lines — large)
Full task management UI with 3 tabs: My Tasks, Created by Me, All Tasks (elevated/all-staff only). Each `TaskCard` supports: expand for details, mark complete (with notes), request/approve/deny/propose-alternative extension (`ExtDecisionForm`), request/approve/deny/redirect reassignment (with member search via `/api/admin/members`), direct or request-based deletion (with reason, approve/deny for requested deletes). `CreateTaskDialog` lets staff create a task assigned to a specific member (search) or a role/department, with due date + reminder. Calls `GET /api/admin/tasks?view=mine|created|all&includeCompleted=`, `POST /api/admin/tasks`, `PATCH/DELETE /api/admin/tasks/{id}` (many action-specific bodies for complete/extend/reassign/delete flows — see file for exact shapes), `GET /api/admin/members?search=&limit=`.

---

## Unit

#### app/dashboard/unit/allstaff-calendar/page.tsx
Route: `/dashboard/unit/allstaff-calendar`. Gate: `PERMISSIONS.pages.member` (redirect `/me`). Computes `isTrainer` (`training.create`), `isJ3Lead` (`training.manage`). Renders `AllStaffCalendarPanel`.

#### app/dashboard/unit/allstaff-calendar/AllStaffCalendarPanel.tsx
Wraps `DeptCalendarTab` (department `'unit'`) with a J3-trainer-only "Create Event" flow — either a blank event or pre-filled from a J3 training-type template (`GET /api/training/types`, active only) which auto-computes the end time from the type's `durationMinutes`. Modal has title/start/description/private toggle. Calls `POST /api/admin/calendar`.

#### app/dashboard/unit/calendar/page.tsx
Route: `/dashboard/unit/calendar`. Gate: `PERMISSIONS.pages.member`. Computes `isJ4`, `canWrite` (`pages.admin`). Renders `CalendarPanel`.

#### app/dashboard/unit/calendar/CalendarPanel.tsx
Unit-wide calendar (`react-big-calendar`, month/week/day/agenda views) showing **all** departments' events with a department-colour legend (click to filter to one/several depts) plus an "Ops Only" toggle. Clicking an event opens `EventModal` (view/edit); `canWrite` staff get an "Add Event" button. Calls `GET /api/admin/calendar`.

#### app/dashboard/unit/calendar/DeptCalendarTab.tsx
Reusable department-scoped calendar (used by every JX panel's "Calendar" view and by `AllStaffCalendarPanel`). Same `react-big-calendar` base as `CalendarPanel` but filtered to one `department`. Adds toggleable overlay layers for BCT availability, quiz availability, and (J2 only) unavailability blocks + mission-check-request events, each rendered with distinct dashed-border event styling. For `department==='j2'`: extra "Block Unavailability" (leads only, `isJ2Lead`) and "Request Mission Check" buttons opening `J2EventModal`. Calls `GET /api/admin/calendar?department={dept}`.

#### app/dashboard/unit/calendar/EventModal.tsx (761 lines — large)
Shared calendar event create/view/edit/delete dialog, exports `CalendarEventRow` type and `DEPT_COLORS` map (also imported by `CalendarPanel`/`DeptCalendarTab`/`AllStaffCalendarPanel`). View mode shows full event detail (title, time, department, description, linked operation/task) with edit/delete for authorised users (`isJ4` or creator via `canWrite`-style checks) and a reminder sub-panel (add/remove reminder offsets from `LEAD_UP_PRESETS`). Create/edit mode: title, department select, start/end (or all-day date), description, private toggle. Calls `GET/POST/PATCH/DELETE /api/admin/calendar` and `/api/admin/calendar/{id}`, `GET/POST/DELETE /api/admin/calendar/reminders?eventId=`.

#### app/dashboard/unit/calendar/J2EventModal.tsx
J2-specific modal used for two special event types: `mode='unavailability'` (J2 lead blocks a period unit-wide as unavailable for mission-making) and `mode='mission_check'` (any J2 member requests a mission check against an in-development/upcoming operation, searched via `GET /api/operations?status=In Development,Upcoming&limit=100`). Submits via `POST /api/admin/calendar` with mode-specific flags (`isJ2Unavailability` / `isMissionCheckRequest`, `relatedOperationId`).

#### app/dashboard/unit/calendar/loading.tsx
`<TacticalLoader label='LOADING UNIT CALENDAR' />`.

#### app/dashboard/unit/sops/page.tsx
Route: `/dashboard/unit/sops`. Gate: `PERMISSIONS.pages.member`. Computes `isJ4` from `PERMISSIONS.sops.manage`. Renders `SopsPanel`.

#### app/dashboard/unit/sops/SopsPanel.tsx
SOP (Standard Operating Procedure) library: list view grouped by category (`General`/`Operations`/`Training`/`Administration`/`Communications`) with search, and a document view. J4 (`isJ4`) can create new SOPs (title/category/description), edit an existing SOP's metadata inline, or delete (with confirm). Document body is a `CollabEditor` (Y.js/TipTap collaborative editor) with `documentId={'sop-' + sop._id}`, read-only for non-J4. Calls `GET/POST /api/sops`, `PATCH/DELETE /api/sops/{id}`.

#### app/dashboard/unit/sops/loading.tsx
`<TacticalLoader label='LOADING UNIT SOPs' />`.

#### app/dashboard/unit/tickets/page.tsx
Route: `/dashboard/unit/tickets`. Gate: `PERMISSIONS.pages.admin` (redirect `/me`). Computes a large set of per-department `canActionJ1`–`canActionJ7`, `canActionMoveRequest`, `canActionDiscipline` (from `PERMISSIONS.tickets.*`) plus `canSeeJ1`–`canSeeJ7` (action perm OR plain dept membership) and passes all to `TicketsPanel`. This is the **staff admin ticket queue** (distinct from the `feedback`/`CommunityTicket` system used by `DeptTicketsTab`) — operates on `Db.tickets` (`Ticket` type: move-request, discipline, performance-report, department-membership, etc.).

#### app/dashboard/unit/tickets/TicketsPanel.tsx (792 lines — large)
Cross-department admin ticket queue/action console. Filterable/searchable/paginated table of all `Ticket` docs the viewer is permitted to see, with a detail/view modal and an `ActionModal` for resolving tickets (approve/reject with type-specific fields — e.g. points deducted for discipline, transfer target). `department-membership` tickets are treated as global audit records visible to all admins. Calls `GET /api/admin/tickets`, `PATCH /api/admin/tickets/{id}` (resolution body varies by ticket type).

#### app/dashboard/unit/tickets/loading.tsx
`<TacticalLoader label='LOADING TICKETS' />`.

#### app/dashboard/unit/training-docs/page.tsx
Route: `/dashboard/unit/training-docs`. Gate: `PERMISSIONS.pages.member`. Computes `isJ3Lead` (`training.manage`), `isTrainer` (`training.create`), `isJ3Trainer` (`training.trainer`). Renders `TrainingHub` — the top-level J3 training hub with 3 tabs (Courses/Types, Events, Requests).

#### app/dashboard/unit/training-docs/TrainingHub.tsx (1002 lines — large)
Tab `'courses'`: manages `TrainingType` definitions (course catalogue) — create/edit (name, category, billet field/points, description, status, duration, server, required mods, prerequisites, min trainers/trainees, trainer/info doc URLs, cover image, linked media), drag-reorder via `@dnd-kit`, seed defaults, and per-type expandable **training docs** list with add/approve/reject/delete (a document-request/approval workflow distinct from the standalone `TrainingDocsPanel` explorer below — these are docs attached directly to a training type). Tab `'events'` renders `EventsTab`; tab `'requests'` renders `RequestsTab`. Calls `GET/POST /api/training/types`, `PATCH/DELETE /api/training/types/{id}`, `POST /api/training/types/seed`, `GET/POST /api/training/types/{id}/docs`, `DELETE /api/training/types/{typeId}/docs/{docId}`, `POST /api/training/types/{typeId}/docs/{docId}/approve|reject`.

#### app/dashboard/unit/training-docs/EventsTab.tsx (959 lines — large)
Training-session event calendar/list: create/edit/cancel/complete training events tied to a `TrainingType`, RSVP (trainer/trainee slots) with slot-count pills, attendance view/mark, award-qualifications action on completion, and an approve/reject flow for trainer-submitted events (`isJ3Lead`). Calls `GET /api/training/events`, `GET /api/training/types`, `POST /api/training/events`, `PATCH /api/training/events/{id}`, `POST /api/training/events/{id}/approve|reject|cancel|complete|award-qualifications`, `GET/POST/DELETE /api/training/events/{id}/attendance`.

#### app/dashboard/unit/training-docs/RequestsTab.tsx
"Training requests" — members request a training session for a type they want scheduled; others can register interest; J3 leads approve/reject or promote a request to a scheduled event. Calls `GET /api/training/requests`, `GET /api/training/types`, `POST /api/training/requests`, `POST /api/training/requests/{id}/interest`, `PATCH /api/training/requests/{id}`, `POST /api/training/requests/{id}/approve|reject`.

#### app/dashboard/unit/training-docs/TrainingDocsPanel.tsx (1127 lines — large)
Standalone file-explorer-style document library ("Training Docs") — folders and documents with custom icon/colour (`ICON_OPTIONS`/`COLOR_PRESETS`), drag-and-drop move between folders (`@dnd-kit`), breadcrumb navigation, search, create/rename/delete folders and docs, and a rich-text document view/editor using `SimpleEditor` (non-collaborative editor, distinct from `CollabEditor` used by SOPs). Supports linking a doc via URL open (`initialDocId` deep-link from `[id]/page.tsx`) with heading-based table of contents (`extractHeadings`/`DocToc`). `isJ3` gates create/edit/delete. Calls `GET/POST/PATCH/DELETE /api/training-docs` and `/api/training-docs/{id}` (multipart `POST` for doc content/attachments).

#### app/dashboard/unit/training-docs/[id]/page.tsx
Route: `/dashboard/unit/training-docs/[id]`. Gate: `PERMISSIONS.pages.member`. Computes `isJ3` (`trainingDocs.manage`). Renders `TrainingDocsPanel` (imported from parent dir) with `initialDocId` set — deep-links straight to a specific document.

#### app/dashboard/unit/training-docs/loading.tsx
`<TacticalLoader label='LOADING TRAINING DOCS' />`.

---

## Meeting (standalone view)

#### app/dashboard/meeting/[id]/page.tsx
Route: `/dashboard/meeting/[id]`. **Client component**, no server-side permission gate in this file — fetches the meeting client-side and relies on the API route's own 403/404 handling (shows an in-page error if `meetingRes.status === 403/404`). Renders a read-only-ish standalone meeting view (title, date, department, notes, `MeetingAttendance` panel for RSVP) — used for linking a specific meeting outside the dept panel's tabbed `MeetingsTab` context (e.g. from notifications/action logs). Calls `GET /api/admin/meetings/{id}`, `GET /api/me`.

---

## `_components` (shared dashboard building blocks)

#### app/dashboard/_components/ActivityLogTab.tsx
Reusable activity/audit log viewer embedded as the "Activity Logs" view in every department panel (J1–J7) and (for J4/`isJ4`) globally across all departments. Filter bar: department (J4 only, when `department` prop unset), category, entity type, free-text search (performer name), date range. Paginated table (50/rows) with category-coloured action badges; clicking a row with an `actionUrl` navigates there, otherwise opens a raw before/after + details JSON modal. Calls `GET /api/admin/activity?page=&limit=&department=&category=&entityType=&search=&startDate=&endDate=`.

#### app/dashboard/_components/CornerBrackets.tsx
Presentational-only: renders 4 absolutely-positioned corner-bracket decorations (tactical HUD styling) inside a `position: relative` parent. Props: `color`, `size`. Used in every dept panel header (J5Panel, J6Panel, J7Panel, etc.) and `AllStaffCalendarPanel`.

#### app/dashboard/_components/NotificationBell.tsx
Global notification bell dropdown + toast system (lives in the dashboard shell header, likely `StaffSidebar`/`StaffDashboardShell` outside this scope but the component itself is here). Wraps `useNotifications()` hook (`hooks/useNotifications.ts`, outside scope) for SSE-driven live notifications; plays a Web-Audio chime + shows an auto-dismissing toast on new arrivals, dropdown panel with mark-read/mark-all-read/dismiss/dismiss-all, type-specific colour/label map, links to `actionUrl` on click, footer link to `/dashboard/tasks`. No direct fetch calls (delegates to the hook).

#### app/dashboard/_components/PinTabLabel.tsx
Small wrapper rendering a tab label plus a pin/star toggle (favourites) using `useFavourites()` hook (outside scope). Used inside every dept panel's `<Tab label={...}>` to let users pin a specific tab to their favourites sidebar. Props: `label`, `pinLabel` (stored favourite text), `href`, `tabIndex`.

#### app/dashboard/_components/RolePicker.tsx
Generic searchable Discord-role autocomplete input (single value, with clear button). Lazy-loads the guild role list once on first open. Calls `GET /api/admin/guild-roles`.

#### app/dashboard/_components/TacticalSkeleton.tsx
Presentational shimmer-loading placeholder (animated CSS gradient rows) used throughout dashboard panels while data loads (e.g. gallery tabs, move-requests tab, calendars). Props: `rows`, `className`. No fetches.

#### app/dashboard/_components/useTabState.ts
Hook: URL-search-param-backed `{tab, setTab, view, setView}` state for department panels, so the sidebar's deep-links (`?tab=&view=`) drive the active tab reactively and links stay shareable/bookmarkable. `View` union: `'dept'|'members'|'calendar'|'meetings'|'logs'|'activity'|'tickets'`. Used by J5Panel/J6Panel/J7Panel (and presumably J1–J4 panels outside this scope).

### `_components/meetings/` (department meeting sub-system, used by `MeetingsTab` inside every JX panel)

#### app/dashboard/_components/meetings/MeetingsTab.tsx
Top-level meetings view for a department: toolbar (All/Own/Imported filter — "Imported" = meetings transferred in from another department, `isTransferred`), "New Meeting" button opening `CreateMeetingModal`, master list (`MeetingListItem`) + detail pane (`MeetingDetail`). Calls `GET /api/admin/meetings?department=`.

#### app/dashboard/_components/meetings/MeetingListItem.tsx
Presentational list row for a meeting: title, date, completed/locked/imported-transfer icons, task/attachment counts, "imported from {dept}" byline. No fetches.

#### app/dashboard/_components/meetings/MeetingDetail.tsx
Meeting detail/edit pane: notes editor, lock/unlock, complete, delete, transfer-to-another-department action, embeds `MeetingTaskList`, `MeetingAttachments`, `MeetingAttendance`. Calls `PATCH /api/admin/meetings/{id}` (notes save), `POST /api/admin/meetings/{id}/lock`, `DELETE /api/admin/meetings/{id}`, `POST /api/admin/meetings/{id}/complete`, `POST /api/admin/meetings/{id}/transfer`.

#### app/dashboard/_components/meetings/MeetingTaskList.tsx
Task list embedded in a meeting (distinct from the global `Db.tasks` system in `app/dashboard/tasks/`) — add/cycle-status/delete tasks scoped to the meeting, with expand for details. Calls `POST /api/admin/meetings/{meetingId}/tasks`, `PATCH/DELETE /api/admin/meetings/{meetingId}/tasks/{taskId}`.

#### app/dashboard/_components/meetings/MeetingAttachments.tsx
File/YouTube/external-link attachments for a meeting: drag-and-drop or click-to-upload (images/video/PDF, 50MB cap), or add a YouTube/external link inline. Calls `POST /api/admin/meetings/{meetingId}/attachments` (multipart for files, JSON `{youtubeUrl}`/`{linkUrl}` for links), `DELETE /api/admin/meetings/{meetingId}/attachments/{id}`.

#### app/dashboard/_components/meetings/MeetingAttendance.tsx
RSVP + attendance-confirmation widget for a meeting, grouped by `j4`/`dept_lead`/`dept_member`/`invited`. Member RSVP (Attending/Not Attending/LOA); after the meeting is `completed`, leads confirm actual attendance (attending→confirmed_attended, not_attending→confirmed_absent). "Sync members" button re-initialises attendee list from current dept roster. Calls `PATCH /api/admin/meetings/{meetingId}/attendance` (`{userId, status}`), `POST /api/admin/meetings/{meetingId}/attendance` (`{department}` to sync).

#### app/dashboard/_components/meetings/MemberPicker.tsx
Searchable member autocomplete for meeting notification/invite targets. Modes: department + J4 members (default, split into two labelled sections), or `allMembers` (all ASOT community members). Calls `GET /api/admin/members?department=&limit=` (+ separate `department=j4` call) or `GET /api/community/members?limit=500`.

### `_components/tickets/`

#### app/dashboard/_components/tickets/DeptTicketsTab.tsx
Department-scoped view of **community feedback tickets** (`CommunityTicket`/`Db` collection surfaced via `/api/feedback` — categories: request/bug/mission/campaign/unit-feedback/complaint/award; distinct from the `Db.tickets` admin ticket system used by `unit/tickets/TicketsPanel.tsx` and the all-staff move-request/discipline/performance tabs). Filterable by category/status, status-change actions and cross-department transfer for `canManage` users. Calls `GET /api/feedback?...`, `PATCH /api/tickets/{id}` (status change), `POST /api/tickets/{id}/transfer`.

---

## Notable cross-cutting observations

- **Two separate "ticket" systems** exist and are easy to conflate: (1) `Db.tickets` / `/api/admin/tickets` — internal staff process tickets (move-request, discipline, performance-report, department-membership), surfaced in `unit/tickets/TicketsPanel.tsx` and the `personnel/all-staff/tabs/*` forms; (2) `CommunityTicket` / `/api/feedback` + `/api/tickets/{id}` — member-facing feedback/bug/mission-request tickets, surfaced per-department via `_components/tickets/DeptTicketsTab.tsx` (used inside J5Panel/J6Panel/J7Panel and presumably J1–J4).
- **Two separate document-editing systems**: `CollabEditor` (Y.js/Hocuspocus real-time collaborative, used by `unit/sops/SopsPanel.tsx`) vs `SimpleEditor` (non-collaborative, used by `unit/training-docs/TrainingDocsPanel.tsx`).
- **`app/dashboard/retired/page.tsx`** and **`app/dashboard/meeting/[id]/page.tsx`** are the only two files in this scope with no explicit per-page permission gate of their own — both rely on parent layout (`pages.member`) or API-level enforcement only, despite one being J4-administration tooling.
- Every JX department panel (`J5Panel`, `J6Panel`, `J7Panel`, and by inference J1–J4 outside this scope) shares an identical shell structure: header with `CornerBrackets` + Members/Calendar/Activity toggle buttons (via `useTabState`), reusing `DeptMembersTab`, `DeptCalendarTab`, `ActivityLogTab`, `MeetingsTab`, `DeptTicketsTab` as common building blocks — only the department-specific feature tab(s) differ (J5: gallery/SOTM; J6: Zeus Notes; J7: none extra).
- Training has **two distinct doc concepts**: per-`TrainingType` attached docs (approval workflow inside `TrainingHub.tsx`'s Courses tab) vs the standalone `TrainingDocsPanel.tsx` folder/document explorer — do not confuse when asked to "add a training document."

---


## Part G — Public-facing pages

Scope: `app/(landing)/**`, `app/operations/**`, `app/members/**`, `app/tickets/**`, `app/maps/**`,
`app/optionals/**`, `app/login/**`, `app/me/**`, `app/recruit-session/**`, `app/services-asot/**`,
`app/shoot/**`, `app/wip/**`, plus `app/layout.tsx`, `middleware.ts`. (No root `app/page.tsx` exists —
`/` is served by `app/(landing)/page.tsx`.)

---

## Root

#### middleware.ts
Injects `x-pathname` header on every request (except `_next` assets). Also intercepts `WIP_PATHS`
(`/community/orbat`, `/milpacs`, `/community/retired`, `/community/bios`) and rewrites them to `/wip`
unless the URL has `?bypass_wip`. Public, runs on every route.

#### app/layout.tsx
Root HTML layout: Montserrat font, MUI `ThemeProvider` with `UnitTheme`, `CustomCursor`, and the
site `Navbar`/`Footer` (from `app/(landing)/navbar.tsx` / `footer.tsx`) wrapping `{children}` for
the entire app (both landing and dashboard trees share this shell). Sets dynamic `metadataBase`
from request headers. Public.

---

### /  — Landing Home
#### app/(landing)/layout.tsx
Route-group layout for all `(landing)` pages; sets default OG/Twitter image. No auth gate — public.

#### app/(landing)/page.tsx
The marketing homepage. Hero with a physics minigame (`PhysicsGame`, `MinigameScoreboard`),
Screenshot-of-the-Month banner (`/api/gallery/sotm`), member count (`/api/membercount`), an
`OpsTeaser` sub-component that fetches `/api/operations?status=Active,Upcoming,Completed&limit=3`
and renders operation cards linking to `/operations/[id]`, plus static feature/platoon sections.
Fully public, no auth.

---

### /about — Unit Info Tabs
#### app/(landing)/about/layout.tsx
Tab-strip layout for the About section (About, Callsigns, Contact, Rules, Values, FAQ). Preloads
sibling background images. Public.

#### app/(landing)/about/page.tsx
Static "Who Are We" info cards (uses `<TimeZones/>` sub-component). Public, no API calls.

#### app/(landing)/about/callsigns/page.tsx
Static callsign registry (India 0A, 1-0, Gamemasters, 1-1/1-2/1-3 platoons, Reservists) via
`CallsignCard` components. Public, purely static content.

#### app/(landing)/about/contact/page.tsx
Static contact cards (TeamSpeak, Facebook, Email) + embedded Discord widget iframe. Public.

#### app/(landing)/about/faq/page.tsx
Static FAQ list via `InfoCard`. Public.

#### app/(landing)/about/rules/page.tsx
Static rules/expectations sections. Public.

#### app/(landing)/about/timezones.tsx
Client component: computes and displays op load-in/briefing/step-off times converted to the
visitor's local timezone (standard vs. daylight saving), using `luxon`. Used inside `about/page.tsx`.

#### app/(landing)/about/values/page.tsx
Static "Principles & Values" content. Public.

---

### /community — Bios, Hall of Fame, ORBAT, Quiz, Retired Wall
#### app/(landing)/community/bios/page.tsx
Server component: queries `Db.users` for HQ leadership roles, resolves ORBAT entries/profile via
`resolveMilpacProfile`, renders bio cards with `/api/uploads/bio?id=` photo. Gated by
`WIP_PAGES` env flag (shows `<WipPage/>`) — also intercepted by middleware's `WIP_PATHS` rewrite.
Public read (no login required to view).

#### app/(landing)/community/bios/loading.tsx
`TacticalLoader` Suspense fallback ("LOADING BIO DATA").

#### app/(landing)/community/hof/layout.tsx
Hall of Fame banner/container layout.

#### app/(landing)/community/hof/page.tsx
Hall of Fame — currently **hardcoded example data** (5 fake members), TODO comment says to swap
for a real `Db.users` query keyed on a HOF Discord role. Public, static for now.

#### app/(landing)/community/orbat/loading.tsx
`TacticalLoader` Suspense fallback ("LOADING ORBAT DATA").

#### app/(landing)/community/orbat/page.tsx
The full public ORBAT board: Company HQ hero, 1-1/1-2/1-3 platoon columns (`PlatoonColumn`,
`UnitCard`, `MemberRow`), Gamemasters/Reservists cards. Pulls `fetchORBAT()` from `@/lib/orbat`,
per-section colour/patch metadata from `Db.orbatSectionMeta`, links member names to
`/milpacs/[username]`. Shows a "⚙ Manage ORBAT" link to `/dashboard/orbat` if
`PERMISSIONS.admin.manageOrbat`. Intercepted by middleware `WIP_PATHS`. Public read.

#### app/(landing)/community/quiz/[attemptId]/page.tsx
Server page for an in-progress/completed quiz attempt. Requires login (`redirect('/login')` if no
`me`), validates the attempt belongs to the current user, shows static pass/fail/under-review
screens or renders `<QuizClient/>` for an in-progress attempt. Reads/writes `Db.quizAttempts`.

#### app/(landing)/community/quiz/[attemptId]/quiz-client.tsx
Client quiz-taking UI: section sidebar (`QuizSectionSidebar`), timer panel (`QuizTimerPanel`),
question cards (`QuizQuestionCard`), instruction modal. Debounced auto-save + start/submit via
`PATCH /api/community/quiz/[attemptId]` (`action: 'save'|'start'|'submit'`). Auto-submits on timer
expiry.

#### app/(landing)/community/retired/layout.tsx
Sets metadata for the Retired Members wall.

#### app/(landing)/community/retired/page.tsx
Thin wrapper — renders `<RetiredWall/>` (or `<WipPage/>` if `WIP_PAGES=true`). Also intercepted by
middleware `WIP_PATHS` rewrite (note: `/community/retired` is in the WIP_PATHS list).

#### app/(landing)/community/retired/RetiredWall.tsx
Large client component: a pannable/zoomable "memorial wall" of plaques for honourably (HD) and
generally (GD) discharged members, laid out via a custom grid-packing algorithm. Fetches member
list from `/api/community/retired`, and on plaque click fetches a discharge snapshot from
`/api/community/retired/snapshot?discordId=`. Shows archived MILPAC images
(`/api/milpacs/[userId]-discharge`), promotion/qualification/award tables. Supports deep-linking via
`?member={discordId}`. Public.

---

### /credits, /donate, /partnerships, /preferences, /support, /thomo — Static/Utility Pages
#### app/(landing)/credits/page.tsx
Server page: `getCreditsData()` from `@/lib/credits` builds contributor cards (avatar, ORBAT
role, milpac stats) and a "Special Thanks" section, plus a static tech-stack footer. Public.

#### app/(landing)/donate/page.tsx
Static PayPal donation page (info cards + conditions list). Public.

#### app/(landing)/partnerships/page.tsx
Static sister-unit partnership cards (ACOM, APCA, 7th Cavalry, 2nd Airmobile). Public.

#### app/(landing)/preferences/page.tsx
Client "Member Settings" page: toggles custom cursor (persisted to `localStorage` + a
`cursor-toggle` custom event) and per-notification-type website/Discord delivery toggles, backed
by `GET/PUT /api/preferences`. Requires an authenticated user implicitly (fetch will fail/redirect
upstream if not logged in — no explicit guard visible in this file, relies on `/api/preferences`).

#### app/(landing)/support/page.tsx
Static mental-health/crisis-support resource page (Lifeline, Beyond Blue, etc.) with `SupportCard`.
Public.

#### app/(landing)/thomo/page.tsx
Client joke/meme page — grid of static images from `/public/thomo/`. Public, no logic.

---

### /gallery — Operation Screenshot Gallery
#### app/(landing)/gallery/layout.tsx
Sets banner/container chrome for the gallery route (title "GALLERY").

#### app/(landing)/gallery/page.tsx
Client gallery browser: filter bar (Year → Operation → Mission/Stage), image grid, lightbox with
keyboard nav, and a rotating "featured" carousel. Data from `GET /api/gallery` (returns nested
`years[].operations[].stages[].media[]`), images served via `/api/gallery/fetch?...` and
`/api/gallery/featured?img=`. Public.

#### app/(landing)/gallery/context.tsx
Dead/commented-out file — an abandoned `GalleryContext` scaffold, all code commented out. No
current usage.

---

### /join — Application Form
#### app/(landing)/join/page.tsx
Server page: shows Screenshot-of-the-Month banner (from `Db.siteSettings` `screenshotOfMonth`
doc) then renders `<JoinForm/>` inside a `Suspense`, plus a dev-only `<DevTestApplicationButton/>`
when `NODE_ENV==='development'`. Public — no auth (this is the pre-membership application).

#### app/(landing)/join/JoinForm.tsx
Large client multi-step (7-step) application wizard: Discord OAuth verification
(`/api/applications/discord-login`, session check via `/api/applications/discord-session`), Steam
account linking/resolution (`/api/applications/resolve-steam`, Steam OpenID via
`/api/applications/steam-callback`), in-game name availability/offensive-word check
(`/api/applications/check-name`), background/availability/role questions, final submission to
`POST /api/applications`. Has dev-mode mock buttons for Discord/Steam when `NODE_ENV==='development'`.

#### app/(landing)/join/DeptInfoTabs.tsx
Static client tab widget describing J1–J7 departments; used inside the JoinForm's role-selection
step.

#### app/(landing)/join/DevTestApplicationButton.tsx
Dev-only button: `POST /api/dev/test-application` to seed a fake application, then redirects to
`/dashboard/j1?tab=1&app={id}`. Only rendered when `NODE_ENV==='development'`.

---

### /milpacs — Public Personnel Records
#### app/(landing)/milpacs/layout.tsx
Sets page metadata ("MILPACS").

#### app/(landing)/milpacs/loading.tsx
`TacticalLoader` fallback ("LOADING PERSONNEL RECORDS").

#### app/(landing)/milpacs/page.tsx
The MILPACs index/roster: hero banner, sticky `<MilpacsNav/>` jump-nav, then sections for India
Company HQ, 1st/2nd/Support Platoon (from `fetchORBAT()`), Reservists — each member rendered via
`<Card/>`. Section colours/patches come from `Db.orbatSectionMeta`. Shows "⚙ Manage ORBAT" link
to `/dashboard/orbat` for users with `PERMISSIONS.admin.manageOrbat`. Gated by `WIP_PAGES` env var
and also intercepted by middleware `WIP_PATHS` (`/milpacs`). Public read.

#### app/(landing)/milpacs/card.tsx
Client member card: tilt-on-hover 3D effect, links to `/milpacs/[username]`. Displays avatar
(`Avatar` from `@/components/member/avatar`), rank abbreviation, name, role. Used by both the
milpacs index and (indirectly via similar pattern) other roster pages.

#### app/(landing)/milpacs/nav.tsx
Client sticky nav bar with dropdown sub-sections; smooth-scrolls to `#section-id` anchors on the
milpacs index page.

#### app/(landing)/milpacs/[username]/layout.tsx
Clears default OG/Twitter images (overridden per-profile by `opengraph-image.tsx`).

#### app/(landing)/milpacs/[username]/loading.tsx
Client `TacticalLoader` reading the `username` route param for its label.

#### app/(landing)/milpacs/[username]/page.tsx
The full individual MILPAC profile page (largest file in this group, ~650 lines). Resolves the
member via `client.fetchAllMembers()` + `resolveMilpacProfile`, **auto-regenerates** the uniform
PNG/medal-box PNG (`generateUniform`/`generateBox` from `@/lib/milpac-gen/*`) on the server when a
content hash mismatches (`member.milpac.uniformHash`), computes promotion progress, enlisted date,
and confirmed-operation history grouped by campaign, displays Service Record / Promotions /
Qualifications / Awards / Operation History sections. Edit affordances: "Edit" link to
`/members/[username]` shown to `J5-Media`; biography editable inline by the profile owner
(`<BiographyEditor/>` posts to `/api/me`); cover photo upload by owner (`<CoverUpload/>` posts to
`/api/uploads/cover`); `<RequestAwardButton/>` lets any other logged-in member nominate an award
(`POST /api/award-request`). Public read (no login required to view a profile), but edit actions
require login/role.

#### app/(landing)/milpacs/[username]/RequestAwardButton.tsx
Client modal: lets a logged-in member (not the profile owner) nominate an award for this member,
grouped by award type from `@/lib/military/awards`. Posts `POST /api/award-request`.

#### app/(landing)/milpacs/[username]/bio-editor.tsx
Client `BiographyEditor`: inline edit/save biography text (max 2000 chars), `POST /api/me`. Only
rendered for the profile owner (`isOwn`).

#### app/(landing)/milpacs/[username]/cover-upload.tsx
Client `CoverUpload`: file input to upload (`POST /api/uploads/cover`, multipart) or remove
(`DELETE /api/uploads/cover`) the profile's cover banner image. Owner-only.

#### app/(landing)/milpacs/[username]/image-lightbox.tsx
Generic client `ImageLightbox`: click-to-zoom full-screen overlay for an `<img>`, closes on
Escape/backdrop click. Used for the uniform and medals images.

#### app/(landing)/milpacs/[username]/opengraph-image.tsx
Dynamic OG image (`next/og` `ImageResponse`, 1300×630) — avatar, rank, name, ORBAT role/section,
username, enlisted date, themed by `resolveMilpacProfile`'s accent colour.

---

### /login — Discord OAuth
#### app/login/route.ts
`GET` route: builds the Discord OAuth authorize URL and redirects. Stores an optional `returnTo`
path in a short-lived `login_return_to` cookie (validated to be a relative path only). Public
entry point.

#### app/login/callback/route.ts
`GET` route: OAuth callback — exchanges the `code` for a Discord token (`ExchangeToken`), fetches
the Discord user (`GetUser`), resolves the internal member via `client.fetchMember(user.id)`, sets
the httpOnly `token` cookie (30-day maxAge), then redirects to the stored `returnTo` (default
`/me`). Public entry point; this is the core of the site's auth flow described in CLAUDE.md.

---

### /maps — Interactive World Map Browser
#### app/maps/page.tsx
Client world-selector grid: fetches `/api/maps/worlds`, shows preview thumbnails, navigates to
`/maps/[name]` on click. Prefetches the Leaflet/`OperationMap` bundle in the background. Public
(no auth check in this file — general map browsing).

#### app/maps/[name]/page.tsx
Server page: resolves the requested world via `getAvailableWorlds()` (404s via `notFound()` if
unknown), sets dynamic OG metadata, renders `<MapViewer world={world}/>`.

#### app/maps/[name]/MapViewer.tsx
Client full-screen interactive map viewer wrapping the dynamically-imported
`components/operations/map/OperationMap` (Leaflet-based), with a mode switcher (`sat` / `map` /
`terrain`, gated by `world.hasGeoJSON`/`hasTerrain`) and a "← Maps" back button. Uses
`<FullscreenPage/>` to hide chrome. This is the standalone (non-operation-scoped) map browser —
compare with `app/operations/[id]/map/page.tsx` which reuses the same `MapSection` component
scoped to one operation.

---

### /members — Staff Member Directory & Editor (requires roles)
#### app/members/layout.tsx
No-op wrapper div.

#### app/members/page.tsx
Server page: redirects to `/login` if not authenticated, to `/me` if lacking
`PERMISSIONS.pages.members`. Fetches `client.fetchAllMembers()`, sorts alphabetically, builds an
ORBAT lookup (`getOrbatEntriesForUsers`), renders `<MemberList/>`. Passes `isAdmin` (based on
`PERMISSIONS.admin.impersonate`) to enable "Login As" impersonation.

#### app/members/MemberList.tsx
Client searchable/filterable member list (search by name/username, filter by ORBAT role
checkboxes). Each row links to `/milpacs/[username]` (View) and `/members/[username]` (Edit); if
`isAdmin`, an extra "Login As" button posts `POST /api/admin/impersonate` then redirects to `/me`.

#### app/members/[username]/page.tsx
Server page gated by `PERMISSIONS.members.editStandard` (redirects `/login`/`/me` otherwise).
Resolves the target member, fetches confirmed-attendance-derived operation history, renders
`<MilpacEditor/>` with `canEditRestricted`/`canEditStandard` flags (from
`PERMISSIONS.members.editRestricted`/`editStandard`).

#### app/members/[username]/MilpacEditor.tsx
Large client staff-editing form for a member's MILPAC record: rank (drag-reorderable via
`@dnd-kit`), promotions/awards/qualifications history (with duplicate-detection colour coding),
promotion-point calculation (`calculatePromotionPoints`/`calculateOpPoints` from
`@/lib/military/points`), suggested-rank helper (`getSuggestedRank`). This is the internal
counterpart to the public read-only `/milpacs/[username]` profile page.

---

### /operations — Public Operations Board
#### app/operations/layout.tsx
Sets page metadata ("Operations"); no auth gate (public board).

#### app/operations/page.tsx
Server page: determines `editAccess` via `PERMISSIONS.pages.operationsEdit`, renders header +
`<SearchBar/>` + conditional `<CreateButton/>` + `<OperationsBoard editAccess/>` — all from
`./list.tsx`. Public read; create/edit UI only shown to staff.

#### app/operations/list.tsx
Large (1158-line) client module exporting the three board building blocks used by
`operations/page.tsx`:
- **`SearchBar`** — debounced live search hitting `/api/operations?search=`, dropdown results.
- **`CreateButton`** — modal to create a new mission: single (`GET /api/operations/new` →
  redirects to edit) or campaign-linked (existing campaign via `GET
  /api/operations/campaign-missions?campaignId=` + `POST` to add a mission, or brand-new campaign
  via `POST /api/operations/campaigns`). Roman-numeral mission naming (`toRoman`).
- **`OperationsBoard`** (exported, used by the page) — 3-column layout: left
  `ActiveMissionsPanel` (polls `/api/operations?status=Active,Upcoming` every 5s), centre
  `MonthlyMissionsPanel` (fetches `/api/operations?year=&month=` + `/api/operations/campaigns` +
  per-campaign `/api/operations/campaign-missions`, groups ops into campaign hierarchies with
  Saturday/Sunday slot detection via title parsing), right `CalendarPicker` (year/month browser).
  Also renders `CampaignsBand`/`CampaignEntry`/`MissionRow` sub-components with J2/Edit/Map/View
  quick-links for staff (`hasAccess`).

#### app/operations/[id]/layout.tsx
Sets dynamic `<Metadata>`/`<Viewport>` (theme colour) from `Db.operations` for the given id.

#### app/operations/[id]/page.tsx
The main public operation-orders viewer (very large, themeable — `modern`/`oldfashioned`/`scifi`
page themes). Server component: fetches the operation + current user, computes role flags
(`isHQ` via `operationsEdit`, `isAllStaff` via `attendance.confirm`, `isJ6` via `departments.j6`,
`isSectionLeader` via `Db.orbatPositions`), renders hero banner (cover photo, department badge,
title, op/lore dates), section-nav or paged-view content (delegates to `<PagedView/>` when
`operation.pages.length > 1`, otherwise renders sections/legacy single body inline via
`<DocBody/>`), an `<AttendanceDrawer/>` sidebar, Zeus Notes tab (J6-only), OCAP tab
(`<OcapLinkPanel/>` for HQ to sync, `<OcapStatsPanel/>` for anyone logged in once synced), and
`<DocAcknowledgeCard/>` read-receipt banner+footer when `isAllStaff && status === 'Upcoming'`.
Hidden (`isPublic: false`) sections show a "Classified — Login to Access" banner to logged-out
visitors. Public read; edit link shown to `isHQ`.

#### app/operations/[id]/doc-body.tsx
Client: renders TipTap ProseMirror JSON (`generateHTML` from `@tiptap/core` + StarterKit,
Underline, Image, Link, TextAlign, Highlight) as themed HTML (`.op-doc` CSS varies per
`pageTheme`). Used by both the single-page view and `PagedView`/`StaffView`.

#### app/operations/[id]/DocAcknowledgeCard.tsx
Client read-receipt widget: fetches ack state from `GET
/api/operations/[id]/acknowledge?pageId=`, shows an "Acknowledge" button (`POST` same endpoint)
and an expandable acknowledged/not-acknowledged member list. Rendered for `isAllStaff` viewers
while the op is `Upcoming`.

#### app/operations/[id]/OcapLinkPanel.tsx
Client (HQ-only) panel to search OCAP recordings (`GET /api/operations/ocap/recordings`), inspect
raw format (`GET /api/operations/ocap/inspect?filename=`), and sync a recording to the operation
via a streamed SSE-style `POST /api/operations/ocap/sync` (stages: downloading → parsing →
matching → saving → complete), with reconnect/poll support via `GET
/api/operations/ocap/sync-status?operationId=`.

#### app/operations/[id]/OcapStatsPanel.tsx
Client OCAP statistics viewer with two tabs: **ORBAT view** (kills/deaths/K-D/accuracy grouped by
company/platoon/section, colour-coded via `Db.orbatSectionMeta`, fetched through `GET
/api/operations/[id]/attendance`) and **Leaderboard view** (ranked player stats with medal icons,
linking to `/milpacs/[username]`). Shown to any logged-in user once `operation.ocap` exists.

#### app/operations/[id]/PageNavClient.tsx
Client left-rail page/tab navigator for multi-page operations (updates the `?page=` search param);
also renders special Zeus/OCAP tab entries with custom accent colours. Sticky sidebar, desktop only.

#### app/operations/[id]/ZeusNotesPanel.tsx
Client J6-only notes panel: view/edit free-text Zeus notes for the operation, `POST
/api/operations/zeus-notes`.

#### app/operations/[id]/local-date.tsx
Tiny client component: formats an ISO date string in `en-AU` with timezone abbreviation
(uppercased). Used for the "Operation Date" meta chip.

#### app/operations/[id]/opengraph-image.tsx
Dynamic OG image (`next/og`, 1200×630) for an operation: reads the cover image straight off disk
(`./uploads/operations/{id}.{ext}`), themed corner brackets/badges by `operation.themeColor`.

#### app/operations/[id]/paged-view.tsx
Client `PagedView`: renders a multi-page operation (`operation.pages.length > 1`) with responsive
mobile (horizontal tab strip) vs. desktop (nav handled by the parent `PageNavClient`) layouts.
Reuses `<DocBody/>`, `<SectionNav/>`, `<ZeusNotesPanel/>`, `<OcapStatsPanel/>`,
`<OcapLinkPanel/>`, `<DocAcknowledgeCard/>`. Contains the shared `SectionCard` renderer used by
both mobile and desktop branches.

#### app/operations/[id]/print-button.tsx
Client "Export PDF" button: injects a `@media print` stylesheet sized to the content, hides
nav/footer/cursor, then calls `window.print()`.

#### app/operations/[id]/section-nav.tsx
Client sticky in-page section nav (single-page operations with >1 section): IntersectionObserver
active-section tracking, horizontal scroll-into-view, themed per `pageTheme`.

#### app/operations/[id]/map/page.tsx
Server page: fetches the operation's `mapWorld` and resolves it via `getAvailableWorlds()`, then
renders the same `<MapSection/>` (from `@/components/operations/map/MapSection`) used elsewhere,
scoped to this operation (`operationId`, `canEdit` = `isHQ`). Full-screen (`<FullscreenPage/>`),
simple back-link header. This is the operation-scoped counterpart to `/maps/[name]`.

#### app/operations/[id]/edit/layout.tsx
Server layout: redirects to `/operations` unless the user has `PERMISSIONS.pages.operationsEdit`.
Gates the entire edit subtree.

#### app/operations/[id]/edit/page.tsx
Very large (2400+ line) client operation-editor page — the main HQ/J2 authoring surface. Covers:
meta fields (title/department/date/lore-date/theme colour/page theme/status), cover image
upload, mission-development check tracker (5 or 6 milestone checks counting back from op/campaign
date, completable by J2 leads via `POST /api/operations/[id]/mission-development`), "Orders Check
Request" workflow (`/api/operations/[id]/orders-check`), publish flow (`In Development` →
`Upcoming` via `POST /api/operations/[id]/publish`), attendance/RSVP automation stage machine
(`preparing → rsvp_open → rsvp_closed → op_running → confirmations_open → completed`, both
client-side auto-fire timers and manual stage buttons, persisted via `POST
/api/operations/[id]/attendance/platoons`), acknowledgement summary, custom attendance units,
delete confirmation, and embeds the TipTap collaborative `<OperationEditor
documentId={opID}/>` (dynamic import of `@/components/editor/CollabEditor`) for the actual orders
content. Also toggles a right-hand `<ActivityLog/>` panel and a live `<iframe>` preview pane.

#### app/operations/[id]/edit/activity-log.tsx
Client `ActivityLog` panel: polls `GET /api/operations/activity?id=` every 30s, shows a
word-level diff (`before`/`after`) per edit entry when expanded, relative timestamps.

#### app/operations/[id]/staff/page.tsx
Server page: requires login (`PERMISSIONS.pages.member`, else redirect `/login`), fetches a
minimal operation projection, renders `<StaffView/>`.

#### app/operations/[id]/staff/StaffView.tsx
Client "Staff View" — a second, restricted-scope TipTap editor
(`allowedTypes={['orders','staff_orders','separator']}`) on the *same* Y.js document as the main
op editor, for staff-only content blocks (per `documentId={opId}`, same collab doc as
`operations/[id]/edit`). Header shows status/date/department, back-link to `/operations/[id]`.

---

### /optionals — Optional Mod List Manager
#### app/optionals/layout.tsx
Server layout: `redirect('/login')` if not authenticated (via `client.fetchMe()`), otherwise
centers `{children}`.

#### app/optionals/page.tsx
Client page (top ~60 lines shown): per-category (`qol`, `gfx`, `zeus`, `j2`, `j5`) mod toggle
list with per-mod enable/disable switches, GFX-mod acknowledgement gate (`localStorage` flag),
admin edit-mode to add/remove mods and set Steam Workshop dependency IDs. Talks to the sibling
route handlers below (not `app/api/*` — these live directly under `app/optionals/*/route.ts`).

#### app/optionals/context.tsx
Client-side `AuthProps` context/interface scaffold (token, user, theme, server status, Login/
Logout/ChangeTheme). Appears to be a legacy/alternate auth context — not clearly wired into the
current cookie-based auth flow described in CLAUDE.md; treat as possibly-unused infrastructure.

#### app/optionals/bulk/route.ts
`POST` route handler (not under `/api`): bulk enable-all/disable-all a mod category for the
current user (`Db.users.optionals.{type}`). Requires login (throws otherwise).

#### app/optionals/callback/route.ts
`GET` route: alternate token-based login callback specific to the optionals flow — accepts a
`?token=` query param, resolves the member via `client.fetchMember(token)`, sets the `token`
cookie, redirects to `/optionals`.

#### app/optionals/fetch/route.ts
`GET` route: returns the full mod list for a given `type` from `Db.optionals`. Public data read
(no auth check in the shown portion) but requires `?type=` one of `qol|gfx|zeus|j2|j5`.

#### app/optionals/manage/route.ts
`POST` route: admin-only (`PERMISSIONS.optionals.manage`) add/remove/set-deps operations on the
master `Db.optionals` list for a category; `remove` also pulls the mod from every user's enabled
list.

#### app/optionals/me/route.ts
`GET` route: per-user optionals state — `mode=all` (full record + `isAdmin` flag), `mode=check`
(is a specific mod id enabled), plus `add`/`remove` modes (truncated in view but implied by the
`mode` param).

#### app/optionals/reset/route.ts
`GET` route: resets all 5 optional-mod categories to empty arrays for the current user.

---

### /me — Own Member Profile
#### app/me/layout.tsx
No-op `h-full` wrapper.

#### app/me/page.tsx
Server page: `redirect('/login')` if not authenticated. Shows the current user's own profile card
(avatar, rank, callsign, role via `getOrbatEntryByUserId`), embeds `<BioSections/>` and
`<TSLinkButton/>`. Also surfaces `isHQ`/`isJ5` flags (not fully shown but present) likely for
quick-link buttons (dashboard/preferences/calendar/member-management icons imported: `Api`,
`Tune`, `CalendarToday`, `ManageAccounts`).

#### app/me/bio.tsx
Client `BioSections`: fetches/saves the current user's biography text via `GET/POST /api/me`.

#### app/me/TSLinkButton.tsx
Client TeamSpeak account-linking widget: multi-step flow (`searching → confirm/manual →
awaiting-code → success/error`) driving `POST /api/me/teamspeak` with `action: 'init'` etc. Reused
verbatim inside the recruit-session applicant view (`app/recruit-session/[id]/ApplicantSessionPage.tsx`
imports this same component).

---

### /recruit-session — Live Onboarding/Interview Session (WebSocket-driven)
#### app/recruit-session/ApplicantPageView.tsx
Client presentational component: renders the applicant-facing view for each of 14 named
interview/onboarding steps (`STEP_LABELS`), driven entirely by props (`step`, `introProgress`,
`livePreview`, `rulesAnswers`) pushed from the recruiter's session over WebSocket. No direct API
calls itself — pure view.

#### app/recruit-session/OrbatOnboarding.tsx
Client static-data component: a simplified read-only ORBAT diagram (role titles only, no real
members) mirroring `/community/orbat`'s visual style, used during the "ORBAT Overview" onboarding
step. Purely static `PLATOONS` data structure.

#### app/recruit-session/StepContent.tsx
Client: shared types (`IntroProgress`, `BgProgress`, `LivePreview`, `BCTSlotPreview`) and the
`SECTION_MAP`/`RULES_QUESTIONS` constants plus a `StepContent` renderer that lazy-loads
`BCTAvailabilityCalendar` from `app/dashboard/j1/tabs/`. Central content dispatcher used by
`ApplicantPageView`.

#### app/recruit-session/[id]/layout.tsx
Sets static metadata ("ASOT Recruitment") and dark page background.

#### app/recruit-session/[id]/page.tsx
Server page: looks up `Db.recruitSessions` by `sessionId`, 404s if missing, shows a "Session
Expired" screen if past `expiresAt`, otherwise renders `<ApplicantSessionPage/>`. Public (no login
— this is the pre-membership applicant's live view during their recruiter interview).

#### app/recruit-session/[id]/ApplicantSessionPage.tsx
Client: opens a WebSocket to `/recruit-session?id=&role=applicant` (derived from
`NEXT_PUBLIC_BASEURL`), syncs `step`/`raisedHand`/`introProgress`/`livePreview`/`rulesAnswers`
state pushed by the recruiter in real time, throttled cursor-position broadcast, reconnect logic,
embeds `<ApplicantPageView/>` and the shared `<TSLinkButton/>`.

---

### /services-asot — Easter-egg / Unit-Specific Utility Page
#### app/services-asot/page.tsx
Server page gated to the `1-2` Discord role (`redirect('/')` otherwise; `redirect('/login')` if
not authenticated). Renders `<DriversLicense canEdit={hasRole('1-2-0 Command')}/>`. Comment
credits "Assassin's Idea" — a niche in-unit feature, not general platform functionality.

#### app/services-asot/DriversLicense.tsx
Client CRUD-ish list of "driver's license" entries (name/section/status: Active / Under Review /
Revoked) grouped by section (PHQ/Alpha/Bravo/Charlie). Fetches `GET
/api/services-asot/drivers-license`. Edit mode gated by `canEdit` prop.

---

### /shoot — Standalone 3D Minigame
#### app/shoot/page.tsx
Client Babylon.js-powered shooting range/minigame (`@babylonjs/core`: Engine, Scene, camera,
lights, procedural gunshot/hit sound synthesis via Web Audio API). Self-contained; not part of the
member/staff workflow — a standalone diversion page. Public, no data fetching shown in the
truncated portion.

---

### /wip — Work-In-Progress Placeholder
#### app/wip/page.tsx
Trivial wrapper rendering `<WipPage/>` (from `@/components/wip-page`). This is the rewrite target
for `middleware.ts`'s `WIP_PATHS` list (`/community/orbat`, `/milpacs`, `/community/retired`,
`/community/bios`) — visiting those paths without `?bypass_wip` serves this page's content instead
(via Next.js rewrite, so the URL bar still shows the original path).

---

## Cross-cutting notes for future sessions

- **Public vs. auth boundary**: almost everything under `(landing)` is public read (milpacs,
  ORBAT, gallery, about/rules/faq, credits, donate, partnerships, support, join, community/*).
  Auth-gated trees are `/members`, `/optionals`, `/tickets`, `/me`, `/services-asot`, and the
  `/operations/[id]/edit` + `/operations/[id]/staff` subtrees. `/operations` and
  `/operations/[id]` themselves are public-read with extra content/actions unlocked once logged
  in (`isLoggedIn`, `isHQ`, `isJ6`, `isAllStaff`, `isSectionLeader` flags computed per-request).
- **WIP gate**: `WIP_PAGES` env var (checked inside individual page components) and
  `middleware.ts`'s `WIP_PATHS` rewrite are two *independent* mechanisms both currently targeting
  milpacs/orbat/retired/bios — don't assume one implies the other is wired up.
  `community/bios/page.tsx` and `milpacs/page.tsx` check `WIP_PAGES` explicitly;
  `community/retired/page.tsx` also checks it via its child render.
- **Operation theming**: `pageTheme` (`modern` | `oldfashioned` | `scifi`) is threaded through
  almost every operations component (`doc-body.tsx`, `paged-view.tsx`, `section-nav.tsx`,
  `PageNavClient.tsx`, the main `[id]/page.tsx`) — any new operation-page component should accept
  and respect this prop for visual consistency.
- **Collab editor reuse**: `components/editor/CollabEditor` (dynamic-imported) backs three
  distinct surfaces here: `operations/[id]/edit/page.tsx` (main orders, `documentId={opID}`),
  `operations/[id]/staff/StaffView.tsx` (staff-only blocks, *same* `documentId` but restricted
  `allowedTypes`), confirming CLAUDE.md's note that Y.js docs are keyed by `{operationId}` with
  role-based content filtering rather than separate documents.
- **Map component reuse**: `components/operations/map/MapSection` (op-scoped) and
  `components/operations/map/OperationMap` (standalone, dynamic-imported) are shared between
  `/maps/[name]` (world browser) and `/operations/[id]/map` (op-scoped map) — check there before
  building new map UI.
- **`app/tickets/_shared/`**: `constants.ts` (status/tag/category metadata + shared input styles),
  `MediaUpload.tsx`, `MemberSelect.tsx` are the reusable building blocks for the community-ticket
  system (`/tickets`, `/tickets/new`, `/tickets/[id]`) — a public-facing feedback/bug/mission-pitch
  system distinct from the internal staff ticketing under `app/dashboard`.

---


## Part H — lib, types, components, root config

This map documents every file under `lib/**` (55 files), `types/**` (30 files), and the requested
`components/**` subset, plus root-level config files (`server.mjs`, `next.config.ts`, `middleware.ts`,
`themes/unit.ts`). Use it to find existing helpers before writing new ones.

---

## 1. `lib/**` — reusable server logic (55 files)

### lib/mongo.ts
- Default export `Db` — singleton `MongoClient` cached on `global._mongoClient` (survives Next.js HMR). One typed `MongoCollection<T>` property per collection. Full list of ~55 collections including `users`, `roles`, `milpacs`, `optionals`, `operations`, `operationActivity`, `minigameScores`, `minigameLive`, `orbatPositions`, `orbatSectionMeta`, `operationAttendance`, `operationDocAcks`, `j1Applications`, `tickets`, `calendarEvents`, `siteSettings`, `operationTemplates`, `operationCampaigns`, `campaignMissions`, `notifications`, `tasks`, `calendarReminders`, `meetings`, `actionLogs`, `errorLogs`, `discordLogs`, `driversLicense`, `mapPresets`, `retiredMembers`, `quizAttempts`, `communityTickets` (→ `feedback` collection), `communityTicketComments` (→ `feedback_comments`), `meetingNotifQueue`, `userPreferences`, `notifPolicyConfig`, `sops`, `trainingDocs`, `teamspeakSnapshots`, `recruitSessions`, `tfarPlugins`, `inProgressRecruitments`, `workspaceFiles`, `workspaceDocs`, `workspaceVersions`, `leavingHistory`, `deniedApplicationsHQ`, `disciplineRecords`, `billetExtras`, `memberEmails`, `mastersheetRecycleBin`, `dischargeSnapshots`, `trainingTypes`, `trainingEvents`, `trainingAttendance`, `trainingTypeDocs`, `trainingRequests`, `trainingTickets`, `trainingReminders`, `trainingImportRecords`, `eraOptions`.
- `Db.stats()` — prints DB stats via `console.table`.

### lib/permissions.ts
- Default export `PERMISSIONS` — single source of truth, extensively JSDoc'd per key listing exactly which routes/pages consume it. Top-level groups: `pages` (member/admin/members/operationsEdit), `departments` (j1–j7), `operations` (write/viewInDevelopment), `uploads.bio`, `members` (edit/editRestricted/editStandard), `admin` (impersonate/manageOrbat/manageOrbatStructure/manageOrbatMembers/massImport), `optionals.manage`, `feedback.manageStatus`, `communityTickets.manage`, `gallery.manage`, `attendance.confirm`, `auth.collab`, `departmentLeads` (j1–j7), `meetings` (lockJ1–lockJ7), `quiz` (assign/review/reviewEscalated), `trainingDocs.manage`, `sops.manage`, `training` (create/trainer/manage), `masterSheet` (view/viewDiscipline/import), `tickets` (actionJ1–actionJ7, actionMoveRequest, actionDiscipline).

### lib/buildNickname.ts
- `buildNickname(rank, name, departments=[], isChaplain?)` — builds standard Discord nickname `RANK NAME [DEPT]... [✞]`; departments sorted+uppercased, chaplain cross appended last.

### lib/discord/color.ts
- Default export `convertColorToHex(color: number): string` — decimal → `#rrggbb`.
- `ensureVisible(hex, minLuminance=0.25)` — WCAG-luminance-based brightener; near-black → grey fallback, otherwise scales channels up to meet threshold. Used by `resolveMilpacProfile` for accent colors.

### lib/discord/index.ts
- Exports `Client` class + default singleton instance (`client`), auto-calls `updateRoles()` on module load.
  - `updateRoles()` — refreshes `this.roles` from `Db.roles`.
  - `fetchMe(token?)` — reads `token` cookie (Next `cookies()`), resolves member.
  - `fetchMember(identifier, rolesEnabled?)` — looks up `Db.users` by `_id` or `token`; throws if discharged; lazily generates+persists a token if missing; attaches `roles` and optional `hasRoles` callback.
  - `fetchAllMembers()` — `Db.users.find({}).toArray()`.
  - `buildOrbatLookup(members)` — returns a `(orbatName) => User | null` fuzzy matcher: strips `[...]`/`(...)` decorations, tries exact stripped-name match, then trailing-status fallback, then rank-prefix-difference fallback (e.g. "SAM" vs "SSAM").
  - `hasRoles(member, check: string[])` — `OVERRIDE` env bypass, `J4-Administration` global bypass, else role-name intersection.
  - `fetchRole(identifier)` — lookup by id or name; throws if not found.

### lib/discord/oauth.ts
- `ExchangeToken(code): Promise<OAuth>` — POSTs to Discord `/oauth2/token` (authorization_code grant).
- `GetUser(oauth): Promise<OAuthUserResponse>` — GETs `/users/@me` with the bearer token.

### lib/discord/dept-roles.ts
- `DEPT_ROLES: Record<deptCode, { member, lead? }>` — maps `j1`–`j7` → Discord role name(s).
- `syncDeptDiscordRole(userId, deptCode, action: 'add'|'remove'|'set-lead'|'remove-lead')` — resolves role IDs via `Db.roles`, calls `addGuildRole`/`removeGuildRole` from `bot.ts`, then rebuilds and pushes the member's Discord nickname via `buildNickname` + `setGuildNickname`.

### lib/discord/bot.ts
- Single source of truth for **all** outbound Discord actions. Every mutation passes through `checkDiscordGate()` (dev-mode gate, 30s in-process cache reading `Db.siteSettings._id:'discordDevMode'`, `OVERRIDE` env bypass) and logs via `logDiscord()` (`lib/logs.ts`).
- `botRequest<T>(method, path, body?)` — raw Discord REST fetch with `Bot {DISCORD_BOT_TOKEN}` auth; exported for reuse (used by `discord/index.ts`'s `guildRequest`).
- `checkDiscordGate(userId)` → `{ allowed, devMode, override }`.
- `invalidateDevModeCache()` — bust the 30s in-process dev-mode cache (call after toggling).
- `sendDM(userId, payload: {content?,embeds?}, messageType='raw')` — opens/caches DM channel (`dmChannelCache`), sends, logs sent/blocked/failed.
- `sendChannelMessage(channelId, payload, messageType='raw')` — same pattern for guild channels; skips silently if `channelId` falsy.
- Typed DM helpers (all wrap `sendDM` with pre-built branded embeds): `sendCalendarReminderDM`, `sendTaskAssignedDM`, `sendTaskExtensionRequestDM`, `sendTaskExtensionApprovedDM`, `sendTaskExtensionDeniedDM`, `sendTaskExtensionAlternativeDM`, `sendTaskReassignmentRequestDM`, `sendTaskReassignmentOutcomeDM`, `sendTaskReminderDM`, `sendTaskOverdueDM`, `sendTaskEscalationDM`, `sendTaskDeleteRequestDM`, `sendTaskDeleteOutcomeDM`, `sendTrainingApprovedDM`, `sendTrainingRejectedDM`, `sendTrainingReminderDM`, `sendMeetingDM`, `sendFeedbackCommentDM`, `sendFeedbackStatusDM`, `sendLeadZeusDM`.
- `addGuildRole(userId, roleId)` / `removeGuildRole(userId, roleId)` — role mutations, gated + logged.
- `setGuildNickname(userId, nick)` — nickname mutation, gated + logged.
- `fetchAllGuildMembers()` — paginated `GET /guilds/:id/members`; **not** gated (read-only). Returns `{userId, roleIds}[]`.

### lib/encryption.ts
- `GenerateToken(bytes=64)` — `crypto.randomBytes(bytes).toString('base64url')`. Used for user auth tokens.

### lib/logAction.ts
- `logAction(input: LogActionInput)` — writes to `Db.actionLogs`, never throws. **Note:** duplicate of `lib/logs.ts`'s `logAction` (different input typing: this one takes explicit `LogActionInput` interface vs. `Omit<ActionLog,...>` in `logs.ts`). Both write the same collection — check which one call sites actually import before adding a third variant.

### lib/logs.ts
- `logAction(entry: Omit<ActionLog,'_id'|'createdAt'>)` — writes `Db.actionLogs`, fire-and-forget.
- `logError(entry: Omit<ErrorLog,...>)` — writes `Db.errorLogs`.
- `logDiscord(entry: Omit<DiscordLog,...>)` — writes `Db.discordLogs`; called by every `discord/bot.ts` action.

### lib/maps.ts
- `getAvailableWorlds(): MapWorld[]` — scans `./maps/{world}/` directories on disk; requires `sat/` subfolder with ≥1 tile dir; reads optional `meta.json` for `displayName`/`worldSize`/`colorOutside`; detects presence of `geojson/`, `terrain.png`, `coastline.png`, `contours.geojson.gz`, `preview.jpg`.

### lib/milpac-gen/data-mapper.ts
- `buildUniformData(user, orbatEntry): UniformData` — derives citations (from awards via `AWARD_TO_CITATION`, campaign clasps deduped to highest), medallions (`deriveMedallions` — positions Bronze/Silver/Gold into 1/2/3 chest slots based on count held), training medals (via `QUAL_TO_BADGE`), corps badge (via `SECTION_TO_BADGE`/`DEFAULT_BADGE`), uniform color (Blue only for Hotel/Rotary Wing section), rifleman badge (PTE vs gold PTEP based on rank tier + BCT 2 qualification).
- `buildBoxData(user): BoxData` — `{name, medals: awardNames[]}` for the medal-box generator.
- `computeUniformHash(uniformData, boxData): string` — MD5 of JSON-serialized inputs; used to detect stale cached milpac portraits (`user.milpac.uniformHash`).

### lib/milpac-gen/maps.ts
- `AWARD_TO_CITATION: Record<awardLabel, Citation>` — maps `lib/military/awards.ts` labels → citation ribbon codes (includes all 16 campaign clasp tiers).
- `QUAL_TO_BADGE: Record<certLabel, TrainingBadge>` — maps `lib/military/certifications.ts` labels → training badge codes.
- `SECTION_TO_BADGE: Record<sectionTitle, Badge>` — ORBAT section title → corps badge (Command/Echo/Golf/Hotel/Mike/Victor/GM).
- `DEFAULT_BADGE = 'Infantry'`.

### lib/milpac-gen/types.ts
- Types: `TrainingBadge`, `Rank` (full flat union of every rank abbreviation variant used by the generator), `Medallion`, `Citation`, `Badge`.
- Interfaces: `UniformData` (`name,displayName,rank,medallions,citations,TrainingMedals,Uniform,RifleManBadge,badge`), `BoxData` (`name,medals`).

### lib/milpac-gen/uniform.ts
- `generateUniform(rawData: UniformData): Promise<void>` — canvas-composites the full uniform PNG (`@napi-rs/canvas`) from `public/milpac-assets/`: base uniform → rifleman badge → name tag text (auto-shrinking font) → corps badge → medallions → training badges → citation ribbons (cascading fill algorithm across 8 lines with per-row capacity) → collar/border → RE badge overlay → rank insignia. Writes to `./milpacs/{userId}.png`. Internal `sanitize()` dedupes campaign clasps, collapses training-badge hierarchy (Expert > Advanced > Basic), suppresses rank insignia for PTE-tier.

### lib/milpac-gen/box.ts
- `generateBox(rawData: BoxData): Promise<void>` — canvas-composites the medal display box PNG from `public/milpac-assets/medal-box-images/`; normalizes award names via `AWARD_TO_CITATION`, dedupes campaign clasps to highest, lays out medals centered with fixed spacing, glass overlay + border. Writes `./milpacs/{userId}-medals.png`.

### lib/milpac-gen/generate-for-user.ts
- `generateMilpacForUser(user: User): Promise<void>` — orchestrates: fetch ORBAT entry, build uniform+box data, generate both images in parallel, persist `milpac.uniformHash` on `Db.users`. Bypasses HTTP auth — caller responsible.
- `archiveMilpacImages(userId): Promise<{uniformPath, medalPath}>` — copies live milpac PNGs to immutable `-discharge` suffixed files for the discharge snapshot; swallows missing-file errors.

### lib/offensive-words.ts
- `OFFENSIVE_WORDS: string[]` — large curated wordlist (slurs, profanity, drugs/crime, religion/extremist, misc abusive, leetspeak variants, Aussie slang, high-risk terms).
- `containsOffensiveLanguage(input, words=OFFENSIVE_WORDS): boolean` — normalizes leetspeak/repeated letters, checks word-boundary regex + joined-text regex (for words ≥5 chars, catches space-stripped bypasses).
- `findOffensiveMatches(input, words?): string[]` — same matching, returns matched words.
- `censorOffensiveLanguage(input, words?, mask='****'): string` — replaces matches in-place (longest-word-first to avoid partial masking).
- `containsOffensiveWord(name)` — backward-compat alias for `containsOffensiveLanguage`, used by JoinForm/RecruitMemberTab.

### lib/quiz-data.ts
- Default export `BCT_QUIZ: QuizDefinition` — the fixed BCT confirmation quiz content (7 sections: ARMA/ACE basics, grid refs, TFAR, ACE medical, section basics, weapons, movement). Image keys map to `/public/quiz-images/{key}.png`.
- `getQuizById(id)` — only recognizes `'bct-quiz'`.
- `getQuizQuestion(quiz, questionId)` — flat lookup across all sections.

### lib/sqf-export.ts
- `buildSqf(annotations: MapAnnotation[], layers: MapLayer[]): string` — converts operation-map annotations (a3icon/a3metis/polyline types; other types are planning-only and skipped) into an Arma 3 SQF script string that recreates markers via `createMarker`/`mts_markers_fnc_createMarker`.
- `a3ColorFromHex(hex)` (internal) — nearest-neighbor match to named Arma 3 marker colors.
- `downloadSqf(content, filename='init.sqf')` — client-side Blob download trigger.

### lib/upload.ts
- `Upload(id, type, File, remove?): Promise<string>` — writes an uploaded `File` to `./.uploads/{type}/{ObjectId}.{ext}`, optionally removing an old file first; returns the stored filename.
- `Remove(type, file?): Promise<boolean>` — deletes `./.uploads/{type}/{file}`.

### lib/lockout.ts
- Interfaces: `EscalationGroup`, `TaskLimitPolicy` (`type:'task_limit_policy'`), `LockoutGroup`, `TaskLockoutPolicy` (`type:'task_lockout_policy'`).
- `DEFAULT_LOCKOUT_GROUPS: LockoutGroup[]` — default per-department task-lockout config (Section Members disabled by default; All Staff/PHQ/J1–J7 enabled).

### lib/attendance/csv-parser.ts
- `parseAttendanceCSV(csv: string): ParsedAttendanceSection[]` — parses the Attendance Tracker spreadsheet export, auto-detecting format across 2020–2026 variants (`detectFormat` inspects header row position and whether section name sits on the ops row vs. dates row). Handles Excel epoch-zero placeholder dates, 2-digit-year normalization, and the 2022 Sunday-op-stored-in-Saturday-column quirk (documented but handled by caller fallback).
- `collectOperations(sections): ParsedAttendanceOperation[]` — dedupes unique name+date op combos across all sections for DB matching.
- Interfaces: `ParsedAttendanceOperation`, `ParsedAttendanceMember`, `ParsedAttendanceSection`.

### lib/attendance/meeting-init.ts
- `initMeetingAttendance(meetingId, department, invitedUserIds=[]): Promise<number>` — builds and inserts the `MeetingAttendee[]` list for a meeting: department members, J4 members (unless meeting *is* J4), and explicitly invited outsiders; groups each into `j4`/`dept_lead`/`dept_member`/`invited` (lead detection via `PERMISSIONS.departmentLeads`), dedupes against existing attendees, sorts by group then name. Called on meeting creation and from the manual attendance-sync POST endpoint.

### lib/attendance/tasks.ts
- `createAttendanceTasksForOperation(operationId, attendanceAssignedPlatoons, confirmationOpenedAt): Promise<void>` — creates one attendance-confirmation `Task` per section leader (via `getSectionLeaders` from `lib/orbat`, always unions with `companyHQ`), each due 24h after opening with a chase-up reminder at 12h; sends notification + Discord DM per leader; skips if a task already exists for that operation+leader. Swallows all errors (safe to call from cron or manual handler).

### lib/credits.ts
- `CONTRIBUTOR_ORDER` / `THANKS_ORDER` — hardcoded Discord IDs for the `/credits` page.
- `getCreditsData(): Promise<CreditsResponse>` — fetches users + ORBAT entries, resolves display profile via `resolveMilpacProfile` (`lib/military/milpac-profile.ts`), attaches hardcoded `CONTRIBUTIONS`/`THANKS` copy and milpac stat counts (awards/promotions/quals).
- Exported types: `CreditContributor`, `CreditThanks`, `CreditsResponse`.

### lib/military/awards.ts
- `AWARDS` (const array) — master award/citation list: `{csvHeader, label, type, points}`. `csvHeader` matches Billet Mastersheet column text; `label` is the canonical `milpac.awards[].name`.
- `Award` type = `typeof AWARDS[number]`.

### lib/military/certifications.ts
- `CERTIFICATIONS` (const array) — master qualification list: `{csvHeader, label, points}`.
- `Certification` type = `typeof CERTIFICATIONS[number]`.

### lib/military/ranks.ts
- `RANK_GROUPS: RankGroup[]` — full rank hierarchy grouped by billet track (Infantry, Echo/Golf/Victor enlisted, LCPL/LBDR/CPL/BDR billets, Signaller, SNCO, Officer, Warrant Officer, Command, Hotel Crew/Pilot/Officer/Command, Game Master).
- `RANKS_FLAT` — flattened `{name, abbr}[]`.
- `rankNameFromAbbr(abbr)` / `rankAbbrFromName(name)` — bidirectional lookup, fallback to input if unmatched.

### lib/military/promotion-requirements.ts
- `RANK_TRACKS: RankTrack[]` — per-billet-track point thresholds (`minPts: null` = billet-assignment-only rank, not point-earned).
- `getSuggestedRank(currentRankAbbr, points): string | null` — finds the matching track(s) for the current abbr, prefers a track where current rank has a real point threshold, returns the highest qualifying rank abbr at/under `points`. Shared SNCO ranks (SGT/SSGT/SAM/SSAM) default to the MIKE track when ambiguous.

### lib/military/milpac-profile.ts
- `resolveMilpacProfile(member: User, orbatEntry: OrbatEntry|null)` — central name/rank/accent resolver reused across milpac page, credits, ORBAT: strips `[...]` decorations from Discord nickname, parses rank-prefix vs display name, resolves `fullRank` via `rankNameFromAbbr` (falling back through promotion history), computes `accent` via `ensureVisible(member.hexAccentColor)`. Returns `{accent, displayName, name, rankAbbr, fullRank, callsign, orbatEntry}`.

### lib/military/points.ts
- `OP_POINTS` / `DEPT_POINTS` — point-value constants for operation attendance types and department actions.
- `calculateOpPoints(ops: {date, confirmedAt}[]): number` — ISO-week-grouped op scoring (1 op/week = 2pts, 2+ = 3pts cap); undated ops score 2pts independently.
- `MilpacImportCounts` interface — full shape of raw counts used for point calculation (ops, dept actions, awards, quals, manual J4 adjustment, discipline deductions).
- `calculatePromotionPoints(counts: MilpacImportCounts): number` — sums op points + dept action points (with per-3/per-5 floor divisions for J1 interviews / J5 milpacs/PR) + award/cert point lookups + manual J4 points − discipline deductions, floored at 0.

### lib/minigame/emitter.ts
- Default export: global `EventEmitter` singleton (`global.__minigameEmitter`, maxListeners 500) — survives per-route module isolation in Next.js.

### lib/notifications/emitter.ts
- Default export: global `EventEmitter` singleton (`global.__notificationEmitter`, maxListeners 500) — powers the SSE push notification stream (`/api/notifications/stream`).

### lib/notifications/index.ts
- `createNotification(input: CreateNotificationInput): Promise<void>` — inserts into `Db.notifications`, emits `user:{userId}` event on the emitter for SSE push. Never throws.
- `createNotificationForRole(roleName, input: Omit<...,'userId'>): Promise<void>` — bulk-inserts one notification per user holding `roleName` (via `guild.roles`), emits per-user.
- `CreateNotificationInput` interface: `{userId, type, title, body, actionUrl?, relatedId?}`.

### lib/notifications/types.ts
- `NotifTypeMeta` interface + `NOTIFICATION_TYPES: NotifTypeMeta[]` — full catalogue of every `NotificationType` with `label`, `description`, `category`, optional `requiresAny` (role gate for showing the preference toggle), `alwaysOn` flag. Drives the notification-preferences UI.
- `NOTIF_CATEGORIES` — deduped category list.

### lib/notifications/meeting.ts
- `notifyMeetingUser(userId, opts: NotifOpts)` — website notification + Discord DM to one user (immediate-delivery events: created, task assigned).
- `notifyMeetingRole(roleName, opts: NotifOpts)` — bulk website notifications + DMs to every active, non-skeleton user holding `roleName`.
- (Time-delayed meeting notifications go through `meetingNotifQueue` + cron instead — not this file.)

### lib/notifications/ticket.ts
- `notifyTicketDeptLeads(department, opts: TicketNotifOpts)` — notifies dept leads (via `PERMISSIONS.departmentLeads`, with `j4` falling back to `PERMISSIONS.departments.j4` since J4 bypasses globally) with bulk website notifications + DMs.

### lib/ocap.ts
- `downloadOcapRecording(apiUrl, filename): Promise<Buffer>` — tries `.json.gz` (gunzip, with fallback if fetch already decompressed) then falls back to plain `.json`.
- `bufferChunks(buf, size=65536): AsyncGenerator<Buffer>` — yields buffer in 64KB chunks with `setImmediate` yields between, to avoid starving the event loop / hitting V8 string limits.
- `parseOcapBuffer(data: Buffer): Promise<ParsedPlayerStat[]>` — two-pass streaming JSON parse (`stream-json`) over `entities` then `events` to compute kills/deaths/shots/hits per player without ever materializing the whole buffer as a string.
- `matchPlayersToMembers(playerStats): Promise<OcapPlayerStat[]>` — fuzzy-matches OCAP player names to `Db.users` via normalized alias set (name/nickname/globalName/username/csvName), exact then substring match (≥4 chars), merges duplicate matches (reconnects) by summing stats.
- `buildViewerUrl(recordingId, filename)` — builds `OCAP_VIEWER_URL` deep link.
- `formatDuration(seconds)` — `"Xh Ym"` formatter.
- `decodeMissionName(raw)` — URI-decodes, falls back to replacing literal `"20"` with space (OCAP's odd space encoding in filenames).

### lib/orbat/constants.ts
- `PLATOON_CATEGORIES`, `RESERVIST_CATEGORIES` — canonical category id/label pairs.
- `SINGLE_SECTION_CATEGORIES` — categories that can't gain additional sections (`companyHQ`, `gamemaster`).
- `PLATOON_CATEGORY_IDS`, `RESERVIST_CATEGORY_IDS` — flattened id arrays.

### lib/orbat/csv-parser.ts
- `parseRow(line): string[]` — quoted-CSV row tokenizer.
- `parseORBAT(csv): OrbatData` — legacy fixed-column-index parser for the original ORBAT CSV export format (Company HQ, Platoon 1-1/1-2, Support sections, active/inactive reservists, gamemasters). Superseded in practice by the DB-backed `lib/orbat/index.ts` but still used for CSV import.
- Interfaces: `OrbatMember`, `OrbatSection`, `OrbatData`.

### lib/orbat/index.ts
- `fetchORBAT(): Promise<ORBATData>` — builds the full ORBAT tree from `Db.orbatPositions` + `Db.users`, grouping by category/section, resolving each position's assigned user's display name/rank/username.
- `getOrbatEntryByUserId(userId): Promise<OrbatEntry|null>` — O(1) lookup by Discord ID; maps category → display section label (`'India Company HQ'`, `'Company Reservists'`, `'Gamemasters'`, or `sectionTitle`).
- `getSectionLeaders(categories, rolePattern?): Promise<OrbatPosition[]>` — with no pattern, returns the first *occupied* position per (category+sectionTitle) — the section leader (more robust than `isSenior` flag). With a `rolePattern` (string|RegExp), returns ALL matching positions instead.
- `getOrbatEntriesForUsers(userIds): Promise<Record<userId, OrbatEntry|null>>` — bulk lookup, single query.
- Interfaces: `Member`, `RawSection`, `ORBATData`, `OrbatEntry`.

### lib/orbat/discord.ts
- `syncOrbatDiscordRoles(userId, action: 'add'|'remove', category, sectionTitle): Promise<void>` — resolves both section-level and category-level `discordRoleId` from `Db.orbatSectionMeta`, applies via `addGuildRole`/`removeGuildRole`.

### lib/orbat/move.ts
- `applyOrbatMove({fromPos, toPos, toIsReservist, targetUserId})` — applies an approved ORBAT move-request: handles reservist→section, section→reservist (finds/creates a vacant `activeReservist` slot), and section→section cases; clears source, sets destination, and fires `syncOrbatDiscordRoles` for both sides (settled, errors logged not thrown).

### lib/teamspeak/cache.ts
- Module-level in-memory caches: `offlineCache`, `onlineCache`, `groupCache` (each with `refreshedAt`), plus `offlineRefreshing`/`onlineRefreshing` guards.
- `getConnection(): Promise<TeamSpeak>` — persistent SSH-protocol TS3 connection with manual 60s keepalive; auto-reconnects on close/error.
- `refreshOfflineCache()` — opens a *separate* short-lived connection (offline scan does ~40 commands/cycle), paginates `clientDbList`, resolves server-group membership per client, sorts by last-seen.
- `refreshOnlineCache()` — uses the persistent connection, fetches online clients + their groups.
- `refreshGroupCache()` — refreshes just the server-group list.
- `getOfflineCache()/getOnlineCache()/getGroupCache()/isOfflineRefreshing()/isOnlineRefreshing()` — cache accessors.
- Interfaces: `TsClientCached`, `TsClientOnlineCached`, `TsGroupCached`, `OfflineCache`, `OnlineCache`, `GroupCache`.

### lib/teamspeak/devmode.ts
- `checkTsGate(uid): Promise<{allowed, devMode, override}>` — mirrors Discord dev-mode gate pattern but keyed on TS UID + `TS_OVERRIDE` env var; reads `Db.siteSettings._id:'teamspeakDevMode'`, 30s cache, fails open on DB error.
- `invalidateTsDevModeCache()` — bust cache immediately.

### lib/teamspeak/orbat-sync.ts
- `syncOrbatTeamspeakGroups(userId, action, category, sectionTitle): Promise<{skipped, reason?}>` — mirrors `syncOrbatDiscordRoles` but for TS server group IDs (`OrbatSectionMeta.tsGroupId`); resolves member's `teamspeak.cldbid`, checks `checkTsGate`, executes `servergroupaddclient`/`servergroupdelclient` for both section+category group IDs. Returns `skipped:true` (non-fatal) if member has no linked TS account or dev-mode blocks it.

### lib/teamspeak/tags.ts
- `SPACER` — canonical TS visual-divider group names (`~~~ CITATIONS & AWARDS ~~~` etc.).
- `TS_SPACER_NAMES: Set<string>`.
- `TS_GROUP_MAPPINGS: TsGroupMapping[]` — the full TS server-group → website-concept mapping table (award/operation/certification/rank/administration/unit/spacer/ignore categories), each entry carrying required spacer groups and links into `AWARDS`/`CERTIFICATIONS`/`RANKS_FLAT` labels/abbrs. Very large table (hundreds of rank/award/cert/campaign-medal entries).
- Lookup functions: `mappingForTsGroup(tsName)`, `getSpacersForGroup(tsName)`, `tsGroupNameForRank(abbr)`, `tsGroupNameForAward(label)`, `tsGroupNameForCert(certLabel)`, `tsGroupNameForOperation(operationName)`.

### lib/cron-auth.ts
- `verifyCronSecret(request: NextRequest): boolean` — checks `Authorization: Bearer {CRON_SECRET}` header. Used by every route under `app/api/cron/`.

### lib/billetMastersheet.ts
- `FieldSource` type (`'website'|'imported'|'calculated'`), `FieldSourceDef` interface, `FIELD_SOURCE_MAP: FieldSourceDef[]` — documents which Billet Mastersheet fields originate from the website DB vs. are imported-only vs. calculated — used to render provenance in the mastersheet UI.
- Interfaces: `EmailEntry`, `BilletRow` (the full flattened per-member mastersheet row shape used by the J4 Billet Mastersheet feature).

### lib/snapshots.ts
- Constants: `SNAPSHOTS_DIR`, `STATUS_FILE`, `CONFIG_FILE`, `MAX_SNAPSHOTS`, `GALLERY_DIR`, `UPLOADS_DIR`, `DEFAULT_SNAPSHOT_OPTIONS`, `DEFAULT_SNAPSHOT_CONFIG`.
- `ensureSnapshotsDir()` — mkdir if missing.
- `readStatus()/writeStatus(s)` — persisted `{state:'idle'|'creating'|'reverting', startedAt?, message?, error?}`; auto-resets stale (>60min) status on read (crash recovery).
- `readConfig()/writeConfig(c)` — persisted `{maxSnapshots, autoEnabled, intervalDays}`.
- `listSnapshots(): SnapshotInfo[]` — lists `snapshot-*.zip` files, cleans up orphaned `.tmp` files >2h old.
- `createSnapshot(options?)` — full-DB EJSON export + gallery/uploads directory archive via `archiver`, atomic tmp→final rename, enforces retention limit (deletes oldest beyond `maxSnapshots`).
- `revertSnapshot(zipPath)` — extracts via `unzipper`, drops+recreates every collection from EJSON, recreates the two critical `orbat_positions` indexes (unique userId, category+order compound), restores gallery/uploads directories.

### lib/training-docs/parse-gdocs-zip.ts
- `sanitizeDocHtml(html): string` — runs `sanitize-html` with a fixed whitelist (`SANITIZE_OPTIONS`) allowing only semantic tags/styles/list classes.
- `parseGoogleDocsZip(buffer, docId): Promise<ParsedDoc>` — unzips a Google Docs HTML export: extracts obfuscated `.cNN` class→inline-style map (`parseClassStyles`), extracts scoped list-bullet CSS (`extractListCss`, handles `:before` pseudo-selectors for `lst-kix_*` custom bullets), saves images to `uploads/training-docs/` with new ObjectId-based filenames, rewrites `src="images/..."` to `/api/training-docs/images/{stored}`, injects inline styles, sanitizes, strips Google Docs empty-paragraph spacers.
- `deleteDocImages(imageFiles)` — removes stored images.
- `getImagePath(filename)` — resolves stored image path.
- `ParsedDoc` interface: `{htmlContent, imageFiles}`.

### lib/permissions.ts
(see top — documented above)

### lib/training/defaults.ts
- `TRAINING_TYPE_DEFAULTS: Array<Omit<TrainingType,'_id'|'createdAt'|'updatedAt'>>` — seed list of ~24 default training types (BCT 1/2, medical, CQB, fires, aviation, comms, leadership, special, armoured, proficiency courses) with billet field/points pre-assigned.

### lib/training/scheduleReminders.ts
- `scheduleTrainingReminders(eventId, eventTitle, scheduledAt): Promise<void>` — upserts 60-min and 15-min-before reminder docs into `Db.trainingReminders` (skips reminders that would fire in the past).
- `cancelTrainingReminders(eventId): Promise<void>` — deletes all unfired reminders for an event (on cancellation).

---

## 2. `types/**` — global ambient type declarations (30 files)

All declare into `declare global { ... }` (imports become no-ops via `export {}`), so no imports needed anywhere in the app.

### types/community-tickets.d.ts
- `CommunityTicketCategory`, `CommunityTicketSubtype`, `CommunityTicketStatus`, `CommunityTicketVisibility` — union types for the community tickets ("/tickets") feature.
- `CommunityTicket` — the big ticket document interface, with per-category optional field groups (request/bug/mission-campaign/unit-feedback/complaint/award fields), `statuses[]` multi-status support, `ticketTags[]`, `activityLog`.
- `CommunityTicketTask`, `CampaignPhase`, `CommunityTicketComment`, `CommunityTicketActivity`.

### types/discord.d.ts
- Empty/commented-out placeholder (`GuildMember`, `GuildRole` shapes commented out) — no active exports.

### types/drivers-license.d.ts
- `DriverLicenseEntry` — `{_id, name, section, status:'Active'|'Under Review'|'Revoked', updatedAt, updatedBy?}`.

### types/feedback.d.ts
- `Feedback` — legacy simple bug/feature feedback doc (predecessor to `community-tickets.d.ts`'s richer model; still used somewhere per collection naming).
- `FeedbackComment`.

### types/gallery.d.ts
- `ScreenshotOfMonth` — `{filename, dateTaken, credit, setAt, setBy, operationId?, operationTitle?}`.
- `GalleryAPI` — the shape returned by the gallery listing API: `{info, updated, featured[], years[{year, operations[{operation, stages[{stage, media[]}]}]}]}`.

### types/meetingNotifQueue.d.ts
- `MeetingNotifQueueRecord` — time-delayed meeting notification queue entry (`fireAt`, `firedAt?`, `recipientUserId` xor `recipientRole`).

### types/meetings.d.ts
- `MeetingDepartment` (`j1`–`j7`).
- `MeetingAttachment`, `MeetingTask`, `MeetingAttendee` (group: `j4|dept_lead|dept_member|invited`; status incl. `confirmed_attended|confirmed_absent`), `MeetingTransferSource`.
- `Meeting` — full meeting document with lock, completion, attendance-confirmation, and notification-target fields.

### types/milpac.d.ts
- `Milpac` — minimal `{_id, title, section}` (legacy/unused shape; the real milpac data lives on `User.milpac`).

### types/optional.d.ts
- `Optional` — `{_id: 'qol'|'gfx'|'zeus'|'j2'|'j5', mods: {id,name,deps?}[]}` — the optional-mods master lists.

### types/preferences.d.ts
- `UserPreferences` — `{userId, cursorCustom, notifications: Partial<Record<NotificationType, UserNotifPref>>, updatedAt}`.
- `UserNotifPref` — `{website, discord}`.
- `NotifPolicyConfig` — J4-controlled force-on policy per notification type (`forceWebsite`, `forceDiscord`).

### types/quiz.d.ts
- `QuizQuestionType`, `QuizQuestion`, `QuizSection`, `QuizDefinition` — quiz content shapes (consumed by `lib/quiz-data.ts`).
- `QuizAttemptStatus` (`assigned|in_progress|submitted|reviewing|passed|failed`).
- `QuizAnswer`, `QuizReviewHistoryEntry`, `QuizAttempt` (DB shape, Dates), `QuizAttemptSerialized` (API response shape, ISO strings).

### types/retired-member.d.ts
- `RetiredMember` — discharge-history record imported from CSV or created on discharge (`dischargeType: GD|HD|DD`, `returnStatus`, `linkedUserId`).

### types/unit.d.ts
- Legacy/unused ORBAT-adjacent shapes: `Platoon`, `Section`, `Role` (id/order/name/abbr/description — **not** the Discord `Role` from `user.d.ts`), `Rank`, `Certification`, `Award`. Appears superseded by `lib/military/*` + `orbat.d.ts` — check usage before relying on this file.

### types/logs.d.ts
- `ActionCategory` union (`orbat|calendar|member|operation|system|discord|meeting|ticket|task|training|award|teamspeak`).
- `ActionLog` — audit log doc (see `lib/logAction.ts`/`lib/logs.ts`).
- `ErrorLog` — `{path, method, message, stack?, userId?, userDisplayName?, createdAt}`.
- `DiscordLogStatus` (`sent|blocked|failed`), `DiscordLog` — every outbound Discord action attempt (see `lib/discord/bot.ts`).

### types/orbat.d.ts
- `OrbatPosition` — named-slot ORBAT position (`category, sectionTitle, role, userId, sectionOrder, positionOrder, isSenior?, subTitle?`).
- `OrbatPositionWithUser` — `+ user: {id,username,displayName,avatarURL}|null`.
- `ReservistPosition` / `ReservistPositionWithUser` — reservist slots (no named role/section).
- `OrbatSectionMeta` — per-section/category metadata (`patch` image filename, `color`, `discordRoleId`, `tsGroupId`).

### types/sops.d.ts
- `SopCategory` union.
- `SopDocument` — `{title, category, description?, ..., yjsState?: Binary}` (collab-editor-backed SOP doc).

### types/stream-json-submodules.d.ts
- Ambient module declarations for `stream-json/filters/pick.js` and `stream-json/streamers/stream-array.js` (untyped npm submodules) — used by `lib/ocap.ts`.

### types/teamspeak.d.ts
- `TsSnapshot` — `{name, auto, createdAt, createdBy, data: raw TS3 snapshot string, sizeBytes}`.

### types/user.d.ts
- `OAuth` — Discord OAuth token response shape.
- `User` — **the** central user document. Key sub-shapes: `guild` (nickname/avatar/roles/joinedTimestamp), `optionals` (per-category mod selections), `discharged` (date/type/reason/approvedBy), `departments`/`teamLeadDepts`, `teamspeak` (linked account), `tsVerifyCode`/`tsPending`, `bio`, and the large `milpac` object (currentRank, callsign, enlistedDate, `promotions[]`, `awards[]`, `operations[]`, `qualifications[]`, `promotionPoints`, `j4Points`, `disciplineDeductions`, `disciplineHistory[]`, `billetCounts` — the full raw-count shape consumed by `lib/military/points.ts`'s `MilpacImportCounts`, `uniformHash`).
- `Role` — Discord role `{id, name, color, rawPosition}`.
- `OAuthUserResponse` — raw Discord `/users/@me` response shape.

### types/recruit-session.d.ts
- `RecruitSession` — live recruiter↔applicant WebSocket session state persisted to DB (`sessionId, recruiterToken, step, raisedHand, applicantName, formSnapshot, expiresAt`). Backs the `/recruit-session` WS handler in `server.mjs`.

### types/discharge-snapshot.d.ts
- `DischargeSnapshot` — immutable full copy of a member's milpac/rank/points at discharge time (`milpac: NonNullable<User['milpac']>`), plus archived image paths. Stored in `discharge_snapshots` collection.

### types/j1.d.ts
- `J1Application` — the full recruitment application document: base fields, extended profile fields (steam, region, hours, prior milsim, availability, roles/dept interest), reviewer assignment, `recruiterRecommendation`, `returningMemberCheck` (status YES/REVIEW/NO), `j4ReviewStatus` (triggered when returning-member check needs J4 sign-off).

### types/mastersheet.d.ts
- `BilletExtra` — imported-only billet fields with no website equivalent (billet designation, up-to-date flag, last-update date).
- `ClassificationSignals` — the signal set used to classify a member as active vs. discharged (formal discharge flag, leaving-history match, discharged-CSV-section match, ASOT Member role, ORBAT assignment, has-rank).
- `LeavingHistoryRecord`, `DeniedApplicationRecord`, `MemberEmail`, `DisciplineRecord`, `MastersheetRecycleBinEntry` (soft-delete/undo for mastersheet edits across billet/leaving/denied/discipline tabs).

### types/training-docs.d.ts
- `TrainingDocItem` — folder-or-document node for the training-docs tree (`type:'folder'|'document'`, `parentId`, `htmlContent?`, `imageFiles?`, `iconName?`, `color?`).

### types/tickets.d.ts
- `Ticket` — the internal staff ticket document (distinct from `CommunityTicket`). `type` union covers qualification/award/promotion/move-request/discharge/discipline/department-membership/performance-report/training tickets, with per-type optional field groups all on one flat interface.

### types/training.d.ts
- `TrainingApprovalStatus`, `TrainingEventStatus`, `TrainingBilletField`, `TrainingTypeStatus`, `TrainingTicketStatus`, `TrainingSlotType`.
- `TrainingMedia`, `TrainingType` (template/definition), `TrainingEvent` (scheduled instance, approval workflow, links to `TrainingTicket` after completion), `TrainingAttendance` (per-member RSVP+outcome), `TrainingDocument` (uploaded reference doc per training type, its own approval workflow), `TrainingRequest` (member-submitted "please run this training" request), `TrainingTicketAttendee`, `TrainingReminderRecord`, `TrainingTicket` (post-session completion report awaiting J3 review).

### types/operation.d.ts
- ProseMirror/TipTap JSON node types: `PMMarkType`, `PMTextNode`, `PMImageNode`, `PMHardBreakNode`, `PMParagraphNode`, `PMHeadingNode`, `PMBlockquoteNode`, `PMCodeBlockNode`, `PMHorizontalRuleNode`, `PMListItemNode`, `PMBulletListNode`, `PMOrderedListNode`, `PMInlineNode`, `PMBlockNode`, `PMDoc`.
- `collectImageUrls(node)` — **ambient function declaration only** (no implementation in this file — implemented elsewhere, likely inline where needed) — recursively collects all `image` node `src`s from a PMDoc.
- `OperationSection`, `OperationPage`, `OperationActivityLog` (collab edit-diff audit trail), `OcapPlayerStat`, `OcapSyncStatus`, `OcapData`, `MissionDevCompletion`, `MissionDevelopment` (checks keyed by `w16|w12|w10|w8|w6|w4`).
- `Operation` — the central operation document: sections/pages/extraPageSections, theme fields, `assignedPlatoons`, `internalNotes` (J2-only), `zeusNotes` (J6-only), campaign linkage, `missionDevelopment`, `ocap`/`ocapSync`, ownership (`ownedBy`/`billetPoints`), `acknowledgements[]` (legacy — see `DocAcknowledgement` for the current per-page model), soft-delete fields.
- `DocAcknowledgement` — current per-document (per-page) read receipt model (`operationId, pageId, userId, userName, acknowledgedAt`).
- `EraOption`, `OperationCampaign`, `CampaignMission`, `OperationTemplate`.

### types/attendance.d.ts
- `OperationAttendanceRecord` — per-member attendance row (`rsvp`, `confirmed`, `importedStatus`, `attendanceType`, `reservistSection?`).
- `OperationAttendance` — the attendance document for an operation (`assignedPlatoons`, `records[]`, `reservistAssignments[]`, RSVP/confirmation open state + timestamps, `stage` lifecycle, `leadZeus`/`leadZeusName`, `customUnits[]`).
- `OperationAttendanceWithUsers` — API-hydrated shape with `recordsWithUsers` (user details populated) + `sectionMeta`.

### types/calendar.d.ts
- `CalendarEvent` — `{title, start, end, department, isPrivate?, templateTrainingTypeId?, isJ2Unavailability?, isMissionCheckRequest?, relatedOperationId?, relatedTaskId?}`.
- `CalendarReminder` — `{userId, eventId, eventTitle, eventStart, minutesBefore, fireAt, firedAt?}`.

### types/notification.d.ts
- `Notification` — `{userId, type, title, body, actionUrl?, relatedId?, createdAt, readAt?, dismissedAt?}`.
- `NotificationType` — the master union of every notification type string (tasks, meetings, tickets, calendar, training, quiz, mission-check, system) — cross-reference with `lib/notifications/types.ts`'s `NOTIFICATION_TYPES` metadata table.
- `TaskType` (`manual|attendance|application_review|j4_returning_review|extension_review|quiz_assigned|dev_check|orders_check|mission_check`).
- `Task` — the central task document: assignment fields, due/reminder/escalation timestamps, `missionDevCheckId`, `ordersCheckAt`/`ordersCheckStatus`/`ordersCheckProposedAt`, `extensionRequest` (nested workflow object), `reassignmentRequest` (nested workflow object), `deleteRequest` (nested workflow object).
- `TaskStatus` (`pending|in_progress|completed|overdue`).

---

## 3. `components/**` — requested subset

### Top-level components/*.tsx

#### components/content.tsx
- `ContentText({children, className?, title, titlePos?})` — titled text block with red divider.
- `ContentWithImage({children, title, images, imageSide?, imagePos?, titlePos?})` — two-column text+image layout, image side hidden responsively via Tailwind.
- `ContentBanner({children, title, image})` — full-width blurred-background banner with gradient overlay.
- Default export = `ContentText`.

#### components/fire-embers.tsx
- Default export `FireEmbers()` — canvas particle system (rising ember glow effect), no props, self-contained animation loop.

#### components/FullscreenPage.tsx
- Default export `FullscreenPage()` — client-only side-effect component; toggles `document.body.classList.add('fullscreen-page')` on mount/unmount. Renders nothing.

#### components/info-card.tsx
- Default export `InfoCard({title, children, icon?, accentColor='var(--red)', accentRgb='219,0,29'})` — bordered card with icon+uppercase title header.

#### components/member/avatar.tsx
- Default export `Avatar({user?, borderRadius='100%'})` — Discord CDN avatar `next/image` with fallback-to-`public/images/fallback_pfp.png` on load error.

#### components/member/banner.tsx
- Default export `Banner({user?})` — **currently a no-op stub** (body fully commented out, returns `undefined`). Do not assume it renders anything.

#### components/minigame-scoreboard.tsx
- Default export `MinigameScoreboard({visible, currentUserId?, refreshKey, lastScore?})` — leaderboard overlay for the site minigame; fetches `/api/minigame/score` (top scores) and `/api/minigame/score?all=true` (full leaderboard, portal-rendered modal via `createPortal`). Shows dodged/gems/total/rank stat blocks for the just-finished run.

#### components/signature.tsx
- Default export `Signature({size?, color='#fff'})` — pure inline SVG hand-drawn signature graphic (no logic, just paths).

#### components/tactical-loader.tsx
- Default export `TacticalLoader({label='LOADING'})` — full-page military-HUD-styled loading screen (animated spinner, corner brackets, progress bar). Internal `Corner({position})` helper.

#### components/container.tsx
- Default export `Container({children?, title?, subtitle?, background?, backgroundUrl?, sx?})` — standard page-banner-plus-content wrapper used across public pages; `sx.bannerHeight` selects Tailwind height classes (`xsm|sm|md|lg`), `sx.maxWidth`/`sx.padding`/`sx.gap` control content area. Imports `./landing.css`.

#### components/callsign-card.tsx
- `CallsignCard({title, images, children})` (named export) — hoverable image-header card with cursor-tracked diagonal shine effect.

#### components/credits-modal.tsx
- Default export `CreditsModal()` — trigger button + MUI `Dialog` that lazy-fetches `/api/credits` (typed via `lib/credits.ts`'s `CreditsResponse`) and renders contributor cards (`ContributorCard`) + "Special Thanks" list (`ThanksCard`). Internal `Stat({label, value})` helper.

#### components/cursor.tsx
- Default export `CustomCursor()` — custom animated cursor (dot + ring + corner brackets on hover of clickable elements); respects `localStorage('cursor-disabled')` and a `cursor-toggle` window CustomEvent for live toggling from the navbar; suppressed via `body.suppress-custom-cursor` class (watched with `MutationObserver`); no-ops on touch devices.

#### components/military-grid.tsx
- Default export `MilitaryGrid({gradient?})` — decorative background double-grid overlay (96px primary + 24px sub-grid), optional radial-gradient mask.

#### components/physics-game.tsx
- Default export `PhysicsGame({onActivate, onGameOver?, onRestart?, active?, personalBest?, globalBest?, globalBestName?, liveUserId?, liveAccentColor?})` — large (1800+ line) self-contained canvas minigame (asteroid-dodger with gems/powerups: magnet, slowtime, shield, gemshower, nuke, autopilot). Talks to `/api/minigame/live` (heartbeat POST/DELETE) and `/api/minigame/live/stream` (SSE) for live multiplayer presence panel. No other exports — treat as a sealed component; only the top-level props are a stable integration surface.

#### components/confirm-dialog.tsx
- Default export `ConfirmDialog({open, title, message?, confirmLabel?, danger?, restore?, onConfirm, onCancel})` — generic red/green/neutral-themed confirm modal, used throughout admin UIs in place of `window.confirm`.

#### components/wip-page.tsx
- Default export `WipPage()` — "Under Development" placeholder page with a bypass button that appends `?bypass_wip=1` and reloads. Paired with `middleware.ts`'s `WIP_PATHS` rewrite (see §4).

### components/operations/*.tsx

#### components/operations/AttendanceDrawer.tsx
- Default export `AttendanceDrawer({operationId, operationStatus, myUserId, isHQ, isSectionLeader, isAllStaff, themeColor})` — responsive wrapper around `AttendancePanel`: fixed sidebar on `lg+`, slide-in mobile drawer (floating tab button + overlay) below. ESC-to-close + body-scroll-lock on mobile.

#### components/operations/AttendanceManageDialog.tsx
- Default export `AttendanceManageDialog({open, onClose, operationId, sections, records, themeColor, onSaved})` — HQ-only drag-and-drop attendance management modal (`@dnd-kit/core`): drag members between section columns, edit role inline, add new members (autocomplete against `/api/members`), remove. Diffs against a snapshot on save and POSTs `{moves, removals, additions, roleChanges}` to `/api/operations/{id}/attendance/manage`. Internal `DraggableMember` (memoized) and `DroppableSection` components.

#### components/operations/OperationStatusBar.tsx
- Default export `OperationStatusBar({operationId, operationDate, operationStatus, themeColor, r, g, b})` — polls `/api/operations/{id}/live-status` every 30s and a local 1s clock tick to render a live countdown strip (RSVP open/close, Mission Active, Confirmation) with colored state dots. Internal `fmtCountdown(target, now)` helper.

#### components/operations/ReservistAllocationPanel.tsx
- Default export `ReservistAllocationPanel({operationId, records, themeColor, onSaved})` — HQ-only collapsible panel for assigning active/inactive reservists to sections via per-row `<select>`; batches local overrides and POSTs to `/api/operations/{id}/attendance/manage` on Save; shows per-section assignment-count summary chips.

#### components/operations/AttendancePanel.tsx
- Default export `AttendancePanel({operationId, operationStatus, myUserId, isHQ, isSectionLeader, isAllStaff, themeColor})` — the main attendance UI, composing `ReservistAllocationPanel` + `AttendanceManageDialog` + Lead Zeus nomination + per-section accordions. Handles: self RSVP (`/attendance/rsvp`), HQ platoon assignment + RSVP/confirmation toggles (`/attendance/platoons`), reservist join/leave with role picker (via `sectionRolesMap`), section-leader confirm (`/attendance/confirm`), per-member attendance-type override popover (`/attendance/type`), Lead Zeus set/clear (`/attendance/lead-zeus`). Polls every 15s (skips while dialog open or dirty); separately polls `/live-status` every 30s. Internal helpers: `rsvpIcon`, `groupByCategoryAndSection` (groups records by category+section, sorts reservists to bottom of each section), skeleton loading state.

### components/operations/map/*

#### components/operations/map/types.ts
- Shared map types/constants (no React): `AnnotationType`, `DrawingTool`, `A3MarkerColor` + `A3_MARKER_COLORS`, `A3SideId`, `A3_ICON_TYPES` (Arma marker catalogue), `METIS_ICONS`/`METIS_SIDE_KEY`/`METIS_ECHELONS`/`METIS_HQTF`/`METIS_MOB` (full METIS/MIL-STD-2525 symbology tables), `MapLayer`, `AnnotationProperties`, `MapAnnotation`, `MapMode`, `MapWorld`, `A3ToolProps` + `DEFAULT_A3_PROPS`, `MapPresenceUser`, `MapMarkerPreset`.

#### components/operations/map/useMapYjs.ts
- `useMapYjs(operationId, canEdit): [MapYjsState, MapYjsActions]` — Y.js/Hocuspocus-backed collaborative state hook for the operation map (separate Yjs doc from the main briefing editor, connects to `{operationId}-map` Hocuspocus document via `/api/me/token`). 
  - State: `layers`, `annotations`, `peers` (live cursor presence), `connected`.
  - Actions: `addLayer`, `updateLayer`, `removeLayer` (cascades annotation deletion), `addAnnotation`, `updateAnnotation`, `removeAnnotation`, `broadcastCursor`, `undo`/`redo` (via `Y.UndoManager`).
  - All mutating actions are no-ops when `canEdit` is false.

#### components/operations/map/AnnotationEditor.tsx
- Default export `AnnotationEditor({annotation, actions, onClose})` — floating bottom-docked property editor for a selected map annotation; branches UI entirely on `annotation.type`: full METIS symbol builder (side/type/echelon/HQ-TF/modifiers/text/scale) for `a3metis`, A3 icon picker (grouped by Generic/Shape/BLUFOR/OPFOR/IND/CIV) + color + direction/scale for `a3icon`, simple color/label/weight/fontSize controls for line/polygon/rectangle/circle/marker/text. Internal `MetisMarker`/`MetisIconPreview`/`MetisFilterDefs` (SVG `feColorMatrix` faction-color tinting, reused pattern also in `LayersPanel.tsx`).

#### components/operations/map/LayersPanel.tsx
- Default export `LayersPanel({layers, activeLayerId, activeTool, activeColor, activeA3Props, canEdit, actions, onLayerSelect, onToolChange, onColorChange, onA3PropsChange})` — right-side panel with two tabs: **Layers** (drawing tool palette incl. a3icon/a3metis with full inline property editors mirroring `AnnotationEditor`, layer list with visibility/rename/delete, add-layer input) and **Presets** (fetches/saves/deletes `/api/map-presets`, drag-and-drop preset chips onto the map). Shares the METIS SVG-tint preview pattern with `AnnotationEditor.tsx`.

#### components/operations/map/MapSection.tsx
- Default export `MapSection({operationId, canEdit, world})` — top-level map feature orchestrator: owns `useMapYjs` state, active tool/layer/color/A3-props state, wires `LayersPanel` + dynamically-imported (`ssr:false`) `OperationMap` + `AnnotationEditor` (when an annotation is selected) + `SqfExportModal`. Handles Ctrl+Z/Ctrl+Shift+Z undo/redo keybinding, map-mode toggle (sat/map/terrain), SQF export button (builds via `lib/sqf-export.ts`'s `buildSqf`).

#### components/operations/map/SqfExportModal.tsx
- Default export `SqfExportModal({code, onClose})` — modal showing generated SQF text in a `<pre>` block with copy-to-clipboard button; ESC to close.

#### components/operations/map/OperationMap.tsx
- Default export (large Leaflet-based map renderer, dynamically imported client-only). Renders the Arma-world GeoJSON layer stack (`GEO_LAYERS` — forest/mounts/runway/house/ruin/roads/powerline/location-labels, with `detail:true` layers gated behind `DETAIL_MIN_ZOOM`), a custom coordinate grid drawn to a canvas overlay (`drawGridCanvas`), sat/map/terrain mode switching, and renders/edits `MapAnnotation`s (including custom A3 icon + METIS marker rendering). Fetches gzipped GeoJSON via `fetchGzJson`. Not fully read line-by-line (very large file) — treat `types.ts` as the contract and skim this file directly for rendering internals if modifying map visuals.

### components/quiz/*.tsx

#### components/quiz/QuizInstructionModal.tsx
- Default export `QuizInstructionModal({title, instructions, timeLimitMinutes, onStart, starting})` — pre-quiz full-screen instructions modal with numbered instruction list and "Start Quiz" button (green, disabled while `starting`).

#### components/quiz/QuizQuestionCard.tsx
- Default export `QuizQuestionCard({questionIndex, question, value, onChange?, readOnly?, reviewState?, onReviewDecision?, boxReviewStates?, onBoxReviewDecision?})` — renders one `QuizQuestion` (text/multiple_choice/image_question), supports multi-box answers (`question.answerBoxes > 1`, JSON-encoded array value via `parseMultiBoxValue`/`encodeMultiBoxValue`), and reviewer correct/incorrect marking UI (single-answer via `onReviewDecision`, per-box via `onBoxReviewDecision`). TFAR radio question (`tf-1`) gets named `Control 1..6` box labels.

#### components/quiz/QuizSectionSidebar.tsx
- Default export `QuizSectionSidebar({sections, answers, activeSectionId, onScrollTo, reviewMode?, reviewDecisions?})` — sticky left nav showing collapsible section list with per-question ticked/unticked progress dots and scroll-to-question jump links; auto-expands the currently active section.

#### components/quiz/QuizTimerPanel.tsx
- Default export `QuizTimerPanel({totalSeconds, startedAt, onExpired, onSubmit, submitting, submitted})` — sticky right countdown timer computed from `startedAt` (survives reload/reconnect), plays synthesized audio tones (`playTone`, raw `AudioContext`) + flash banners at halfway / 1-minute / 30-seconds-remaining, red-pulse styling under 30s, green "Submit Quiz" button, locked "✓ Submitted" state once submitted.

### components/editor/* (skimmed per instructions — large collaborative editor files)

#### components/editor/CollabEditor.tsx
- Default export `CollabEditor({documentId, uploadUrl='/api/upload', defaultSectionTitle='Section', initialContent, initialMeta, onMetaChange, metaHandleRef, onSaveStatusChange, themeColor='#db001d', readOnly=false, allowedTypes})` — the full multi-page/multi-section TipTap + Y.js + Hocuspocus collaborative editor used for operation briefings, SOPs (`sop-{id}`), and workspace docs (`ws-{id}`). Connects via `/api/me/token` → Hocuspocus at `NEXT_PUBLIC_COLLAB_WS_URL`. Composes `PageSidebar` for page navigation and a custom `ImageNodeView` node view for rich image handling (align/wrap/free-position/crop/resize). Custom TipTap extensions defined inline: `FontSize` (textStyle attribute + `setFontSize`/`unsetFontSize` commands). Presence: `PresenceUser`/`Peer` (cursor color via Y-awareness), tracks per-client `clientId`.

#### components/editor/PageSidebar.tsx
- Default export `PageSidebar({ydoc, activePage, onSelectPage, themeColor, orientation='sidebar'|'top', allowedTypes?})` — page-tree navigator for `CollabEditor`'s multi-page operations (`pageType`: `orders|zeus|ocap|staff_orders|aar|separator`); includes hardcoded `STAFF_SECTIONS` (HQ Orders/1PL/2PL/3PL with their sub-unit children) for organizing staff-order pages into a folder-like tree with drag reordering (`DragIndicator`) and duplicate (`ContentCopy`).

#### components/editor/ImageNodeView.tsx
- Default export `ImageNodeView({node, updateAttributes, selected, editor, getPos}: NodeViewProps)` — TipTap `NodeViewWrapper` custom render for image nodes: floating toolbar (align left/center/right, wrap-left/wrap-right float, free-position drag-anywhere mode, reset size, crop toggle/clear), bottom-right resize-drag handle, top-left drag-to-reorder handle, crop panel (4-directional inset sliders → CSS `clip-path: inset()`). Attrs used: `src, alt, width, data-align, data-crop, data-pos-x, data-pos-y`. Internal `ImgBtn`/`Sep` toolbar helpers, `parseCrop`/`CropVals` helpers.

#### components/editor/SimpleEditor.tsx
- Default export `SimpleEditor({initialContent='', onChange?, readOnly=false, minHeight=300}: Props)` — a non-collaborative (local-state only) TipTap editor for simpler HTML content editing (training docs etc.), reusing `ImageNodeView`. Custom extensions: `MarginLeftExtension` (preserves Google-Docs-imported paragraph/heading/list indentation), `ListClassExtension` (preserves `lst-kix_*` custom-bullet classes), `HeadingIdExtension` (preserves heading `id` for TOC anchors), `TabIndentExtension` (Tab/Shift-Tab → list-item sink/lift or margin-left indent step for non-list blocks). `splitStyleBlock(html)` — extracts a leading `<style>` block (Google Docs list CSS) so it survives editor round-trips; re-prepended on save.

---

## 4. Root-level config files

### server.mjs
- Custom Next.js production entry point (`node server.mjs`), co-hosts:
  1. **Hocuspocus** collaborative server (`collab`) on the `/collab` WebSocket path — `onAuthenticate` calls back into the app's own `/api/auth/collab` route over loopback HTTP; `Database` extension `fetch`/`store` handlers persist Yjs state differently per document-name prefix: `sop-{id}` → `Db.sops.yjsState`, `ws-{id}` → `Db.workspaceDocs.yjsState`, `{opId}-map` → `Db.operations.mapYjsState`, else `{opId}` → `Db.operations.yjsState` + derived `sections`/`pages`/`content` fields (single-page legacy, multi-section, or multi-page document shapes all handled). Also tracks per-section text-diff **activity logging** (`operation_activity` collection) with a 15s debounced flush per document, skipped for `sop-`/`ws-` prefixed docs.
  2. **Recruit Session** WebSocket server on `/recruit-session` — in-memory `recruitActiveSessions` map pairs a recruiter connection and applicant connection per `sessionId` (validated against `Db.recruitSessions`), relays a large set of live-preview message types (step navigation, raised-hand, name/background/field/availability/roles preview, rules Q&A, ORBAT highlight, BCT quiz mode/slots, TS-link status, cursor position) bidirectionally; recruiter messages are cached (`mem.cache`) so a reconnecting applicant gets full current state replayed.
  3. Plain Next.js request handling for everything else.
  4. Startup side effects: creates `storage/{j1..j7,hq,all,members}` directories; runs `cleanupOperationImages()` immediately and hourly (deletes orphaned `uploads/operations/*` image files >2h old not referenced by any operation's cover image or section/page content).
  5. Internal cron schedulers (plain `setInterval`/`setTimeout` hitting the app's own `/api/cron/*` routes with `Bearer {CRON_SECRET}`): `calendar-reminders` (1min), `task-reminders` (1min), `operations` (1min), `dev-check-escalation` (1hr), scheduled snapshot check (daily at 3am via `msUntilNext3am()`), TeamSpeak daily snapshot (daily at 3am — **note**: hits `/api/cron/teamspeak-snapshots`, not `/api/cron/snapshots`), TeamSpeak offline-client cache refresh (15min).

### next.config.ts
- `serverExternalPackages: ['@napi-rs/canvas', 'unzipper', 'archiver', 'ts3-nodejs-library']` — native-binary packages excluded from webpack bundling.
- `webpack()` — aliases `yjs` to the single `node_modules/yjs` install (avoids duplicate-Y.js-instance bugs with TipTap collaboration).
- `images.remotePatterns` — allowlists `cdn.discordapp.com` (avatars/banners), `*.asotmilsim.com`/`asotmilsim.com`/`localhost:3000`/`192.168.0.125:3000` for `/api/gallery/fetch`, `/api/gallery/featured`, `/api/uploads`.
- `headers()` — global security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS, restrictive `Permissions-Policy`).
- `rewrites()` — `/map-assets/:path*` → `/api/maps/assets/:path*`.
- `redirects()` — legacy path redirects (`/dashboard/gallery`→`/dashboard/j5`, `/community/tickets*`→`/tickets*`, `/feedback*`→`/tickets*`, `/ts`→`ts3server://` protocol link), plus canonical-host redirects (`www.asotmilsim.net`, `asotmilsim.net`, `asotmilsim.com` all → `NEXT_PUBLIC_BASEURL`) and http→https upgrade via `x-forwarded-proto` header check.

### middleware.ts
- `middleware(req)` — two responsibilities: (1) `WIP_PATHS = ['/community/orbat','/milpacs','/community/retired','/community/bios']` — rewrites these (and subpaths) to `/wip` (renders `components/wip-page.tsx`) unless `?bypass_wip` query param is present; (2) injects `x-pathname` response header with the current pathname so server components can read the route without relying on internal Next.js APIs.
- `config.matcher` — runs on all routes except `_next/static`, `_next/image`, `favicon.ico`.

### themes/unit.ts
- Default export: MUI dark theme (`createTheme`) — `primary.main:'#c90620'`, `secondary.main:'#242424'`, custom palette extensions `secondaryGrey` (`#3a629c`) and `light` (`#ffffff`) declared via TypeScript module augmentation (`declare module '@mui/material/styles'` + `'@mui/material/Button'` `ButtonPropsColorOverrides`). Typography: `Inter` base font, `Montserrat` for buttons, `h2` fontSize 34px. `MuiPaper` default `borderRadius:3`. Import as `UnitTheme` per CLAUDE.md convention (applied in root layout `ThemeProvider`).

---

