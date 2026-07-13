# ASOT-Website — Site Map Index

Full inventory of every page, API route, and `lib`/`types`/`components` file in this codebase: what it does, its permission gate, and which `Db.*` collections it touches. **Consult this before building or editing a feature** so you reuse existing routes/helpers/models instead of duplicating them.

**How to use this:** don't read every part file. Scan the **Find it fast** table below for your topic, open only the linked file(s), and use your editor's search within that file for the specific route/component name. Each part file is 20–60KB — still large, so within a file, search for the exact route path or filename rather than reading it top to bottom.

**Maintenance:** this is a snapshot, not derived automatically. When you add, remove, rename, or meaningfully change a route, page, or lib/type/component file, update or add its entry in the relevant part file as part of the same change. If a change doesn't fit any existing part cleanly, add a new part file and link it here rather than stuffing it into an unrelated one.

---

## Part files

| Part | File | Scope |
|---|---|---|
| A | [a-admin-api.md](a-admin-api.md) | `app/api/admin/**` — 78 routes (activity, tickets, calendar, j1, j4 mastersheet/member-emails, meetings, members, orbat, quiz, retired) |
| B | [b-operations-j2-api.md](b-operations-j2-api.md) | `app/api/operations/**` + `app/api/j2/**` — 52 routes (ops CRUD, campaigns, attendance, OCAP, J2 workspace, dev-checks) |
| C | [c-training-tickets-sops-api.md](c-training-tickets-sops-api.md) | `app/api/training/**`, `training-docs/**`, `tickets/**` (community feedback), `sops/**`, `snapshots/**` — 51 routes |
| D | [d-misc-api.md](d-misc-api.md) | Everything else under `app/api/**` — teamspeak, cron, applications (public join flow), me, gallery, community, uploads, minigame, members, notifications, misc single-route features — 79 routes |
| E | [e-dashboard-j1-j4.md](e-dashboard-j1-j4.md) | `app/dashboard/j1/**`–`j4/**` — recruitment, mission-making, training, administration panels |
| F | [f-dashboard-j5-j7-other.md](f-dashboard-j5-j7-other.md) | `app/dashboard/j5/**`–`j7/**`, personnel, ORBAT manager, quiz review, retired import, tasks, unit (calendar/SOPs/tickets/training-docs), standalone meeting view, shared `_components` |
| G | [g-public-pages.md](g-public-pages.md) | `app/(landing)/**`, `app/operations/**`, `app/members/**`, `app/maps/**`, `app/optionals/**`, `app/login/**`, `app/me/**`, `app/recruit-session/**`, misc public pages |
| H | [h-lib-types-components.md](h-lib-types-components.md) | `lib/**` (55 files), `types/**` (30 files), `components/**`, root config (`server.mjs`, `next.config.ts`, `middleware.ts`, `themes/unit.ts`) — **read this first when looking for an existing helper/model** |

---

## Find it fast

| Topic / keyword | Where to look |
|---|---|
| Auth, login, Discord OAuth, `token` cookie | G (`/login`, `/login/callback`), H (`lib/discord/index.ts`, `lib/discord/oauth.ts`) |
| Permissions, role gates, `PERMISSIONS.*` | H (`lib/permissions.ts` — single source of truth) |
| Discord bot DMs, role add/remove, nickname sync, dev-mode gate | H (`lib/discord/bot.ts`, `lib/discord/dept-roles.ts`) |
| Members / milpac CRUD, name/role/department edit, "Danger Zone" (delete account) | A (`/api/admin/members`), D (`/api/members/[username]`), F (`personnel/all/MemberDetailPanel.tsx`), G (`/members/[username]/MilpacEditor.tsx`) |
| Discharge, reinstate, discharge snapshot, returning-member check | A (`/api/admin/members/discharged`, `/api/admin/tickets` j4-discharge, `/api/admin/j1/discharge-info`, `/api/admin/j1/applications` returning-member logic), E (J4AdminPanel `DischargeModal`/`ReinstateModal`), H (`types/discharge-snapshot.d.ts`, `lib/milpac-gen/generate-for-user.ts` archive fns) |
| Retired members (CSV import + public memorial wall) | A (`/api/admin/retired/import`), D (`/api/community/retired[/snapshot]`), F (`dashboard/retired/page.tsx` — **no page-level permission gate**, flagged), G (`community/retired/RetiredWall.tsx`), H (`types/retired-member.d.ts`) |
| Internal staff tickets (move-request, discipline, promotion, discharge, performance-report, department-membership) | A (`/api/admin/tickets`), E/F (`personnel/all-staff/tabs/*`, `unit/tickets/TicketsPanel.tsx`), H (`types/tickets.d.ts`) — **distinct from** community feedback tickets below |
| Community feedback tickets (bug/feature/mission/complaint/award) | C (`/api/tickets/**`, backed by `Db.communityTickets`), F (`_components/tickets/DeptTicketsTab.tsx`), E (J4 `CommunityTicketsTab.tsx`), H (`types/community-tickets.d.ts`) |
| ORBAT (structure, positions, reservists, section meta, move requests) | A (`/api/admin/orbat/**`), F (`dashboard/orbat/OrbatManager.tsx`), G (`community/orbat/page.tsx` public board), H (`lib/orbat/**`, `types/orbat.d.ts`) |
| Operations (briefings, lifecycle, publish, campaigns, templates, recycle bin) | B, E (`j2/tabs/J2OperationsTab.tsx`), G (`/operations`, `/operations/[id]`, `/operations/[id]/edit`), H (`types/operation.d.ts`) |
| Attendance / RSVP / confirmation / Lead Zeus / reservist allocation | B (`/api/operations/[id]/attendance/**`), F (`components/operations/AttendancePanel.tsx` etc. — see H), H (`lib/attendance/**`, `types/attendance.d.ts`) |
| OCAP after-action recordings | B (`/api/operations/ocap/**`), G (`OcapLinkPanel.tsx`, `OcapStatsPanel.tsx`), H (`lib/ocap.ts`) |
| J2 member workspace (files/docs/versions) | B (`/api/j2/workspace/**`), E (`j2/tabs/MembersWorkspaceTab.tsx`) |
| Mission development checks / dev-checks | B (`/api/j2/dev-checks/**`), E (`j2/tabs/MissionChecksTab.tsx`), D (`cron/dev-check-escalation`) |
| Collaborative editor (TipTap/Y.js/Hocuspocus) | H (`components/editor/CollabEditor.tsx`, `PageSidebar.tsx`, `ImageNodeView.tsx`, `SimpleEditor.tsx`, `server.mjs` Hocuspocus setup), D (`/api/auth/collab`, `/api/me/token`) |
| Operation map (Leaflet, annotations, METIS/A3 icons, SQF export) | H (`components/operations/map/**`, `lib/sqf-export.ts`), G (`/maps`, `/operations/[id]/map`) |
| Training (types, events, RSVP, tickets, requests, docs) | C (`/api/training/**`), E (J3 tabs), F (`unit/training-docs/TrainingHub.tsx`, `EventsTab.tsx`, `RequestsTab.tsx`, `TrainingDocsPanel.tsx` — two distinct doc concepts, see note in F), H (`lib/training/**`, `types/training.d.ts`) |
| Training Docs (standalone Google-Docs-style knowledge base) | C (`/api/training-docs/**`), F (`TrainingDocsPanel.tsx`), H (`lib/training-docs/parse-gdocs-zip.ts`) |
| SOPs | C (`/api/sops/**`), F (`unit/sops/SopsPanel.tsx`), H (`types/sops.d.ts`) |
| Quiz (BCT confirmation quiz, assign/review) | A (`/api/admin/quiz/**`), D (`/api/community/quiz/[attemptId]`), F (`dashboard/quiz/review/**`), G (`community/quiz/[attemptId]/**`), H (`lib/quiz-data.ts`, `types/quiz.d.ts`) |
| Meetings (dept meetings, attendance, transfer, standalone view) | A (`/api/admin/meetings/**`), F (`_components/meetings/**`, standalone `dashboard/meeting/[id]/page.tsx` — no page-level gate but API enforces it, confirmed non-issue), H (`lib/attendance/meeting-init.ts`, `lib/notifications/meeting.ts`, `types/meetings.d.ts`) |
| Calendar (unit-wide, per-dept, reminders, BCT/quiz availability, J2 unavailability/mission-check) | A (`/api/admin/calendar/**`), F (`unit/calendar/**`), E (`j1/tabs/BCTAvailabilityCalendar.tsx`), D (`cron/calendar-reminders`), H (`types/calendar.d.ts`) |
| Tasks (assignment, extension, reassignment, deletion workflows, escalation, lockout) | A (`/api/admin/tasks/**`, `/api/admin/task-limit-policy`, `/api/admin/task-lockout-policy`), F (`dashboard/tasks/TasksPage.tsx`), D (`cron/task-reminders`), H (`lib/lockout.ts`, `types/notification.d.ts` `Task`) |
| Notifications (in-app + Discord DM, SSE push, preferences policy) | D (`/api/notifications/**`, `/api/preferences`), H (`lib/notifications/**`, `types/notification.d.ts`, `types/preferences.d.ts`) |
| Mastersheet (billet, leaving-history, denied-applications, discipline, recycle bin) | A (`/api/admin/j4/mastersheet/**`), E (J4 `MasterSheetTab.tsx`, `BilletMastersheetTab.tsx`), H (`lib/billetMastersheet.ts`, `types/mastersheet.d.ts`) |
| J1 recruitment (applications, recruit wizard, live recruit session, TFAR plugin) | A (`/api/admin/j1/**`), D (`/api/applications/**` public join flow, `/api/recruit-session/**`, `/api/tfar/download`), E (`j1/tabs/**`), G (`join/JoinForm.tsx`, `recruit-session/**`) |
| Milpac generation (uniform/medal PNGs) | D (`/api/generate/milpac/[username]`, `/api/milpacs/[name]`), H (`lib/milpac-gen/**`) |
| Awards / certifications / ranks / promotion points | H (`lib/military/**`), D (`/api/award-request`) |
| Gallery / Screenshot of the Month | A (`gallery/admin/*` in D's scope note — actually under D as non-admin fetch/featured/sotm; admin folder mgmt lives in E `J5Panel` tabs calling `/api/gallery/admin/**`), D (`/api/gallery/**`), E (`j5/tabs/GalleryOperationsTab.tsx` etc.) |
| TeamSpeak (client mgmt, snapshots, dev-mode gate, TS-ORBAT sync) | D (`/api/teamspeak/**`), F (`j4/tabs/TeamspeakTab.tsx`), H (`lib/teamspeak/**`) |
| Database / site snapshots (backup & restore) | C (`/api/snapshots/**`), F (`j4/SnapshotsTab.tsx`), H (`lib/snapshots.ts`) |
| Minigames (physics dodger, shooting range, live leaderboard) | D (`/api/minigame/**`), H (`components/physics-game.tsx`), G (`/shoot`) |
| Services-ASOT (driver's license tracker, `1-2` role only) | D (`/api/services-asot/**`), G (`/services-asot`) — uses raw Discord role names, not `PERMISSIONS` |
| Optionals (mod list manager) | G (`app/optionals/**` — route handlers live directly under `app/optionals/*/route.ts`, not `app/api`) |
| Cron jobs | D (`/api/cron/**`), H (`server.mjs` scheduler section, `lib/cron-auth.ts`) |
| Impersonation ("Login As") | A (`/api/admin/impersonate[/return]`), G (`members/MemberList.tsx`) |
| Known gaps / flagged issues | `POST /api/admin/discord-bot-test` has no auth check (A); `/api/dev/grant-all-roles` and `/api/dev/test-application` lack a `NODE_ENV` guard (D); `app/dashboard/retired/page.tsx` has no page-level permission gate (F) |

---

## Background facts assumed throughout (not repeated per-entry)

- `Db` = `lib/mongo.ts` singleton, one typed property per MongoDB collection.
- `PERMISSIONS` = `lib/permissions.ts`, the single source of truth for role gates.
- `client.fetchMe()` / `client.hasRoles()` = `lib/discord/index.ts`.
- `logAction()` — **two versions exist**: `lib/logAction.ts` and `lib/logs.ts` (different input typing, same `Db.actionLogs` collection) — check which one a call site imports before adding a third variant.
- `createNotification()` / `createNotificationForRole()` = `lib/notifications/index.ts`.
