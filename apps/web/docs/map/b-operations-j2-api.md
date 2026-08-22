# Part B — Operations + J2 API

Scope: 42 files under `app/api/operations/**`, 10 files under `app/api/j2/**`. All read in full.

---

## `app/api/operations/` (top-level and flat routes)

#### /api/operations
- **Security:** the list branch is reachable unauthenticated and now projects out `internalNotes`, `zeusNotes`, `missionDevelopment` and `acknowledgements`. Excluded by name rather than allow-listed, so a new *private* field must be added to that list. The `?id=` branch is separate — it returns a full document and is gated on `operations.viewInDevelopment` for in-development missions.
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
- **POST** — records a dev-check completion (`checkId`, `reviewerName`, `comments`, `outcome`) into `missionDevelopment.completions.{checkId}` on the op. Gate: `await hasPermission(me, 'departmentLeads.j2')`. Collections: `Db.operations`.
- **DELETE** — removes a dev-check completion (`?checkId=`). Gate: `await hasPermission(me, 'departmentLeads.j2')`. Collections: `Db.operations`.

#### /api/operations/[id]/orders-check
- **GET** — returns the active (uncompleted) `orders_check` task for this op, if any. Gate: `PERMISSIONS.departments.j2`. Collections: `Db.tasks`.
- **POST** — J2 member requests an orders check from J2 leads (`preferredAt`, `comments`); creates a `Task` (`type: 'orders_check'`), errors if one already pending. Gate: `PERMISSIONS.departments.j2`. Collections: `Db.operations` (read), `Db.tasks`, `Db.users` (J2 leads lookup). Side effects: `createNotificationForRole(j2Lead)` + `sendTaskAssignedDM` to each J2 lead.
- **DELETE** — requester (or J2 lead) cancels their pending orders-check task (`?taskId=`). Gate: `PERMISSIONS.departments.j2` (+ ownership or lead check). Collections: `Db.tasks`. Side effects: `createNotificationForRole(j2Lead)`.
- **PATCH** — J2 lead `confirm`s or `propose`s an alternate time on a pending check; any J2 member can `set_reminder` (personal reminder timestamp). Gate: `PERMISSIONS.departments.j2` for `set_reminder`; `await hasPermission(me, 'departmentLeads.j2')` for `confirm`/`propose`. Collections: `Db.tasks`. Side effects: `createNotification` to requester on confirm/propose.

#### /api/operations/[id]/publish
- **POST** — transitions operation status `In Development` → `Upcoming` (409 if not currently In Development). Gate: `PERMISSIONS.operations.write`. Collections: `Db.operations`, `Db.users` (performer display name). Side effects: `createNotificationForRole('All Staff')` + `createNotificationForRole(j2Lead)`; `logAction('operation.publish')`.

#### /api/operations/[id]/remind
- **POST** — notifies all "All Staff" users who haven't yet acknowledged orders for this op. Gate: `PERMISSIONS.operations.write` OR `await hasPermission(me, 'departmentLeads.j2')`. Collections: `Db.operations` (read title+acknowledgements), `Db.users` (All Staff list). Side effects: `createNotification` per unacknowledged user.

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
- **GET** — paginated action-log feed filtered to `department: 'j2'` + `action` matching `^workspace\.`; supports `?memberId`, `?actionType` (whitelist of workspace.* actions), `?from`/`?to` date range, `?limit` (max 200), `?page`. Gate: `PERMISSIONS.departments.j2` OR `await hasPermission(me, 'departmentLeads.j2')` OR `PERMISSIONS.pages.admin`. Collections: `Db.actionLogs`.

#### /api/j2/workspace/members
- **GET** — lists all active J2 members (from `Db.users.departments: 'j2'`) with aggregated workspace metadata: file count, doc count, linked-op count (`ownedBy`), last-activity timestamp, and position label (Department Leader / Team Leader / Creator Trainer derived from whether the member's `departmentRoleIds` includes J2's `linkedSlot: 'leader'`/`'2ic'`/`'3ic'` `DepartmentRole` id). Gate: `PERMISSIONS.departments.j2` OR `await hasPermission(me, 'departmentLeads.j2')` OR `PERMISSIONS.pages.admin`. Collections: `Db.users`, `Db.departmentRoles`, `Db.workspaceFiles` (aggregate), `Db.workspaceDocs` (aggregate), `Db.operations` (aggregate).

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
- **GET** — lists all `In Development`/`Active` (or `+Upcoming` with `?filter=all`) ops with computed dev-check status rows: for campaign ops uses `CAMPAIGN_CHECK_WEEKS = [16,12,10,8,6,4]` relative to campaign `startDate`, for standalone ops uses `SINGLE_CHECK_WEEKS = [12,10,8,6,4]` relative to op `date`; each check reports due date, overdue flag, days-until, linked completion (from `missionDevelopment.completions`), and assigned task info. Supports `?filter=active|overdue|completed|all`. Gate: `await hasPermission(me, 'departmentLeads.j2')` or `PERMISSIONS.departments.j2`. Collections: `Db.operations`, `Db.operationCampaigns`, `Db.tasks`.

#### /api/j2/dev-checks/[opId]/[checkId]
- **POST** — assigns a reviewer to a specific dev check (`reviewerId`, `reviewerName`); computes `dueDate` as `referenceDate − weeksOut*7 days` (reference = campaign startDate if op is campaign-linked, else op date), reminder = dueDate + 7 days; deletes any existing task for this op+check and inserts a fresh `Task` (`type: 'dev_check'`). `CHECK_WEEKS` maps `w16|w12|w10|w8|w6|w4` → week counts. Gate: `await hasPermission(me, 'departmentLeads.j2')`. Collections: `Db.operations`, `Db.operationCampaigns` (reference date), `Db.tasks`. Side effects: `createNotification` (task_assigned) + `sendTaskAssignedDM` to reviewer.
- **DELETE** — removes the reviewer assignment (`deleteMany` on matching dev_check tasks for opId+checkId). Gate: `await hasPermission(me, 'departmentLeads.j2')`. Collections: `Db.tasks`.
