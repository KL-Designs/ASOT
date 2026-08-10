# Part E — Dashboard: J1-J4

Scope: `app/dashboard/j1/**`, `app/dashboard/j2/**`, `app/dashboard/j3/**`, `app/dashboard/j4/**`.

All four `page.tsx` files follow the identical shape: `await connection()`, `client.fetchMe()`, redirect to `/login` if unauthenticated, redirect to `/dashboard` if `!client.hasRoles(me, PERMISSIONS.departments.jN)`, then pass `displayName`, `userId`, `canManageMembers` (`await hasPermission(me, 'departmentLeads.jN')` for J1-J3; J4 has no separate lead role), and `isJ4` (`PERMISSIONS.departments.j4`) into the client `JNPanel`/`J4AdminPanel` component. Each has a `loading.tsx` rendering `<TacticalLoader label='LOADING JN // ...' />`.

Every panel's header has three toggle buttons (Members / Calendar / Activity Logs, or Logs for J4) that swap to shared components: `DeptMembersTab` (`app/dashboard/DeptMembersTab.tsx`), `DeptCalendarTab` (`app/dashboard/unit/calendar/DeptCalendarTab.tsx`), `ActivityLogTab` (`app/dashboard/_components/ActivityLogTab.tsx`). Tab state persisted via `useTabState` (`app/dashboard/_components/useTabState.ts`). Tab labels support pin-to-sidebar via `PinTabLabel`.

`DeptMembersTab`'s member table also renders a "Roles" column — one toggleable chip per department sub-role that isn't a base role or linked to a leadership slot (fetched via `GET /api/admin/department-roles?department=X`; base and slot-linked roles are excluded — slot-linked roles are single-holder and only assignable via the Leadership card, see below), hidden entirely when the department has none. Clicking a chip calls `POST /api/admin/department-roles/assign` to add/remove that member's holding of the sub-role. Read-only (chips render but aren't clickable, and roles the member doesn't hold aren't shown) for non-managers; clickable for department leads/J4 (`canManage`).

Above the member table, a "Department Leadership" card shows the department's 3 leadership slots (Leader/2IC/3IC — labels per `DEPT_LEADERSHIP_POSITIONS` in `lib/discord/dept-codes.ts`; some departments have fewer than 3, e.g. J4 has only a Leader). Each slot's holder is derived from who holds the `DepartmentRole` whose `linkedSlot` matches (configured per-role in `DepartmentRolesTab.tsx`, J4 only) — not a separate flag. A slot with no linked role shows "Not linked — configure in Department Roles" instead of an Assign control. Assigning/removing a holder goes through `POST /api/admin/tickets` (`type: 'department-membership'`, `memberAction: set-lead|remove-lead|set-2ic|remove-2ic|set-3ic|remove-3ic`), which resolves to `assignLeadershipSlot`/`unassignLeadershipSlot` (`lib/discord/dept-roles.ts`) server-side — single holder per slot, auto-replacing whoever held it before. A J4-only "Sync Discord & TeamSpeak" button (`POST /api/admin/members/sync-dept`) does a full push reconciliation of every current member's real Discord roles/TeamSpeak groups against what their held `DepartmentRole`s say they should have.

---

### J1 — Recruitment

#### app/dashboard/j1/page.tsx
Route `/dashboard/j1`. Gated by `PERMISSIONS.departments.j1`; computes `canManageMembers` from `await hasPermission(me, 'departmentLeads.j1')` and `isJ4` from `PERMISSIONS.departments.j4`. Renders `J1Panel`.

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
