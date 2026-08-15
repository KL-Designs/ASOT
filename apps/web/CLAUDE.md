# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Community management platform for the **Australian Special Operations Taskforce (ASOT)** — an ARMA 3 milsim unit. It is a staff portal and public-facing site with operations management, member milpacs, an ORBAT, ticketing, training, attendance tracking, and more.

---

## Site Map — Read Before Building Features

`docs/map/README.md` is the index into a full inventory of every page, API route, and `lib`/`types`/`components` file — what it does, its permission gate, and which `Db.*` collections it touches, split across 8 part files (`docs/map/a-*.md` through `h-*.md`) so no single file is too large to work with. **Before implementing or editing a feature:**
1. Open `docs/map/README.md`.
2. Scan the "Find it fast" keyword table for your topic (or the Part-files table if you already know the area).
3. Open only the linked part file(s) and search within it for the specific route/component — don't read a part file end to end.

This tells you whether a route/helper/model already exists so you don't duplicate it.

**Keep it current:** whenever you add, remove, rename, or meaningfully change a route, page, or lib/type/component file, update or add its entry in the relevant `docs/map/*.md` file (and the index's keyword table if it introduces a new topic) as part of the same change — same discipline as updating this file. A stale map is worse than no map, so don't skip this.

---

## Commands

```bash
npm run dev           # Standard dev server (no collab WebSocket)
npm run dev-collab    # Dev server + Hocuspocus WebSocket (required for collaborative editor)
npm run build         # Production build
npm start             # Production server (Next.js + Hocuspocus on same port via server.mjs)
npm run lint          # ESLint
```

Lint is also available from the repo root's `npm run menu` (Setup / one-off → Lint — web). The first-time setup wizard (init-db), terrain generation, and the migration scripts in `scripts/` are no longer separate npm scripts here — those remain menu-only, run from the repo root's `npm run menu` (see root `CLAUDE.md`).

**`tests/` is a real Playwright E2E suite** (dashboard gate, permission-system migration behaviour, dev mode, hidden/privileged routes) — see `tests/README.md` for how it's wired (in-memory Mongo, fixed ports, seeded personas) and its design rationale/gotchas before adding or editing a spec. Run via `npm run test:e2e` (`:headed` / `:ui` / `:report` variants also exist) or the repo root's `npm run menu` → Testing category.

**Claude: ask before running the suite, don't default to running it.** The user may want to run `npm run test:e2e` themselves — ask which before invoking it, including as a verification step inside a larger workflow (e.g. before merging a branch). This isn't just etiquette: the suite spawns a real `next dev` server as its `webServer`, which hot-reloads on any file save — editing source files while a run is in flight can itself cause a spurious failure, so don't run the suite and keep editing at the same time either way.

**Keep it current:** if a change adds, removes, or changes the behaviour of anything the suite covers — a page gate, a permission key, sidebar visibility, a privileged/dev-only route, a dev-mode toggle — update the relevant spec in the same change, add one if new gated surface has no coverage, or remove/adjust one for a route that no longer exists. Same discipline as the site map above: a suite that quietly drifts from what it's testing is worse than an honest gap.

---

## Architecture Overview

### Server

`server.mjs` is the production entry point. It co-hosts the Next.js app **and** a [Hocuspocus](https://tiptap.dev/docs/hocuspocus/introduction) WebSocket server on the same port. Hocuspocus handles real-time collaborative editing (Y.js/TipTap) for operations briefings, SOPs, and workspace documents. In dev, `npm run dev` skips Hocuspocus; `npm run dev-collab` runs both.

### App Router Layout

`app/` follows Next.js 15 App Router conventions:
- `app/(landing)/` — public-facing pages (milpacs, ORBAT, gallery, recruit-session)
- `app/dashboard/` — staff/member portal, gated at layout level
- `app/operations/` — public operations board + editor
- `app/api/` — all API routes (no separate backend)
- `app/login/` and `app/login/callback/` — Discord OAuth flow

### Authentication

Auth is **cookie-based with a random token stored in MongoDB**. The flow:
1. `/login` redirects to Discord OAuth
2. `/login/callback` exchanges code for Discord access token, fetches the user from Discord, then looks up the matching record in `Db.users` via Discord ID
3. Sets an `httpOnly` cookie (`token`) containing the internal token stored on the user document
4. Every API route calls `client.fetchMe()` (from `lib/discord/index.ts`) which reads the cookie and resolves the user from MongoDB

There is no JWT or session table — the token is literally a random string stored directly on the `users` collection document.

### Permission System

**All permission logic lives in `lib/permissions.ts`** — a single exported `PERMISSIONS` constant mapping feature keys to arrays of Discord role names. Never scatter permission strings across routes.

Two global overrides bypass every check:
- Users with the Discord role `J4-Administration` (hardcoded in `client.hasRoles()`)
- Discord user IDs listed in the `OVERRIDE` env var

Legacy usage — still the live pattern for any key that hasn't migrated yet (check the key's JSDoc in `lib/permissions.ts` before assuming this applies):
```ts
const me = await client.fetchMe()
if (!client.hasRoles(me, PERMISSIONS.pages.admin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

`PERMISSIONS` structure:
- `pages.*` — top-level page gates (`dashboard`, `admin`, `members`, `operationsEdit`)
- `departments.*` — J1–J7 department membership (`j1`–`j7`)
- `departmentLeads.*` — per-department lead roles (distinct from member roles)
- `operations.*`, `uploads.*`, `members.*`, `admin.*`, `gallery.*`, `attendance.*`, `auth.*`, `tickets.*`, `meetings.*`, `quiz.*`, `trainingDocs.*`, `sops.*`, `training.*`, `masterSheet.*`, `communityTickets.*`, `optionals.*`, `feedback.*`, `deptLinks.*`, `intel.*`, `ai.*`

**A migration off the hardcoded Discord-role arrays above and onto dynamic, DB-stored grants is in progress** (`docs/superpowers/specs/2026-08-11-permission-system-migration-phase*-design.md`). Many keys have already moved — their `PERMISSIONS.x.y` array is now dead code kept only so the Permissions Explorer can still display it, and the real gate is one of:
- `await hasPermission(user, 'x.y')` (`lib/orbat/hasPermission.ts`) — dot-path key, e.g. `'pages.dashboard'`, `'gallery.manage'`, `'quiz.assign'`
- `await hasDepartmentPermission(user, department, 'x.y')` (`lib/orbat/hasDepartmentPermission.ts`) — department-scoped keys like `deptLinks.manage`
- `await hasDashboardAccess(user)` (`lib/orbat/hasDashboardAccess.ts`) — the dashboard entry gate specifically

`lib/permissions-catalog.ts` exports `PERMISSION_KEYS`, the flattened dot-path list of every key in `PERMISSIONS` (e.g. `admin.manageOrbat`, `deptLinks.manage`) — this is the grantable-permission catalog the Roles Manager UI draws from.

**Translating user requests about access control:**
- If the user describes a change in Discord-role terms ("give the X role access to Y", "require the Z role") — don't add to or check a `PERMISSIONS.x.y` Discord-role array for a key whose JSDoc says it's already migrated. Prefer granting the permission key itself (via an ORBAT Role's or Department Role's `permissions` array in the Roles Manager, or a `hasPermission`/`hasDepartmentPermission` check) over touching raw Discord role names.
- **"Role" is ambiguous in this codebase — confirm which the user means before making changes:**
  1. A **site permission** / permission key — a dot-path string from `PERMISSION_KEYS` (e.g. `admin.manageOrbat`) that a `hasPermission`/`hasRoles` check tests for.
  2. A **dynamic ORBAT Role or Department Role** (`types/orbat-role.d.ts` / `types/department-role.d.ts`, managed via the Roles Manager) — a named, DB-stored bundle of permission keys + Discord role IDs + TS group IDs that a member holds; assigning one is what grants that member's permission keys.
  A literal Discord server role (the legacy `PERMISSIONS.x.y` string arrays) is a third, older concept that's being phased out — don't default to it as what "role" means.

### Database

`lib/mongo.ts` exports a single `Db` object with a typed property for every MongoDB collection. All server-side code imports `Db` from there — never create new `MongoClient` instances in routes (the client is a singleton cached on `global` to survive Next.js HMR hot reloads).

Key collections and their types:

| Property | Collection | Type |
|---|---|---|
| `Db.users` | `users` | `User` |
| `Db.operations` | `operations` | `Operation` |
| `Db.operationAttendance` | `operation_attendance` | `OperationAttendance` |
| `Db.tickets` | `tickets` | `Ticket` |
| `Db.tasks` | `tasks` | `Task` |
| `Db.notifications` | `notifications` | `Notification` |
| `Db.calendarEvents` | `calendar_events` | `CalendarEvent` |
| `Db.calendarReminders` | `calendar_reminders` | `CalendarReminder` |
| `Db.meetings` | `meetings` | `Meeting` |
| `Db.actionLogs` | `action_logs` | `ActionLog` |
| `Db.trainingEvents` | `training_events` | `TrainingEvent` |
| `Db.trainingAttendance` | `training_attendance` | `TrainingAttendance` |
| `Db.orbatPositions` | `orbat_positions` | `OrbatPosition` |
| `Db.sops` | `sops` | `SopDocument` |
| `Db.trainingDocs` | `training_docs` | `TrainingDocument` |

### Notification System

Two-channel delivery:
1. **SSE push** — `GET /api/notifications/stream` keeps a long-lived SSE connection open per user. `lib/notifications/emitter.ts` is a Node.js `EventEmitter` that fires `user:{userId}` events when a notification is created; the SSE route listens for these and streams them to the client.
2. **Discord DM** — `lib/discord/bot.ts` sends DMs for high-priority events (task assigned, calendar reminder, etc.). All outbound Discord actions go through `checkDiscordGate()` in `bot.ts` which enforces developer-mode suppression and logs every attempt.

Client-side consumption: `hooks/useNotifications.ts` connects SSE and falls back to a 5-minute poll.

To create a notification from any API route:
```ts
import { createNotification, createNotificationForRole } from '@/lib/notifications'
await createNotification({ userId, type, title, body, actionUrl?, relatedId? })
```

### Cron / Scheduled Jobs

`server.mjs` runs an internal scheduler that calls cron API routes at set intervals (e.g. every 5 minutes). Cron routes under `app/api/cron/` verify a `Bearer {CRON_SECRET}` header via `lib/cron-auth.ts`. Available cron routes:

- `cron/operations` — RSVP auto-open/close, op auto-activate, attendance confirmation lifecycle
- `cron/calendar-reminders` — fire calendar reminder notifications
- `cron/task-reminders` — fire task chase-up and overdue notifications
- `cron/meeting-reminders` — fire meeting reminder DMs
- `cron/application-reminders` — chase up stale J1 applications
- `cron/backups` — hourly restic-backed database + media backups (see `lib/backups.ts`)
- `cron/teamspeak-cache` — refresh TS3 online member cache
- `cron/dev-check-escalation` — escalate overdue mission development checks

### Action Logging

Every significant write operation should call `logAction()` from `lib/logAction.ts`. It writes to `Db.actionLogs` and never throws. Structure: `action` (dot-separated verb, e.g. `meeting.create`), `category` (ActionCategory), `performedBy`/`performedByName`, optional `before`/`after`, `department`, `entityType`/`entityId`.

### Collaborative Editor

`components/editor/CollabEditor.tsx` — TipTap editor backed by Y.js with Hocuspocus for multiplayer sync. Document naming conventions:
- `{operationId}` — operation briefings (J2 access only)
- `sop-{sopId}` — SOPs (any ASOT member)
- `ws-{docId}` — workspace documents (J2 + staff)

The collab auth endpoint `GET /api/auth/collab` is called by Hocuspocus on each connection to validate the token and resolve the document-specific permission.

### Operations Lifecycle

Status progression: `In Development` → `Upcoming` → `Active` → `Completed`

Attendance stage: `preparing` → `rsvp_open` → `rsvp_closed` → `op_running` → `confirmations_open` → `completed`

The cron job drives transitions automatically; manual overrides exist in the UI.

### Discord Integration

`lib/discord/` contains:
- `index.ts` — `Client` class: `fetchMe()`, `fetchMember()`, `hasRoles()`, `buildOrbatLookup()`. A singleton instance is exported as default.
- `bot.ts` — all outbound Discord bot calls (DMs, role mutations). Uses `checkDiscordGate()` to respect developer mode.
- `oauth.ts` — token exchange and `/users/@me` fetch
- `dept-roles.ts` — Discord role ↔ department code mapping

### TypeScript Types

All global types live in `types/*.d.ts` and are declared in `global` scope — no imports needed. Key files: `operation.d.ts` (operations, ProseMirror nodes), `notification.d.ts` (`Notification`, `Task`, `NotificationType`, `TaskStatus`), `attendance.d.ts`, `tickets.d.ts`, `training.d.ts`, `logs.d.ts` (`ActionLog`, `ActionCategory`).

**`User`, `Role`, `Optional` live in `../../types/` instead** (the monorepo-root `types/` dir, included via this app's `tsconfig.json`) — they're shared with `apps/bot`, which reads/writes the same `users`/`roles`/`optionals` MongoDB collections. Web's shape is authoritative there; see `types/README.md` for the sharing convention. `apps/web/tsconfig.json`'s `include` and both Dockerfiles' `COPY types/` step both need to know about that directory — don't forget either if you touch it.

---

## Key Conventions

- **Path alias**: `@/` maps to the project root (`tsconfig.json`). All imports use `@/lib/...`, `@/components/...`, etc.
- **Tailwind `important: true`** is set — Tailwind utility classes override MUI styles by default.
- **MUI theme**: `themes/unit.ts` — import `UnitTheme` for the MUI `ThemeProvider` (already applied in root layout).
- **Middleware** injects `x-pathname` header on all routes so server components can read the current path without relying on Next.js internals.
- **`@napi-rs/canvas`**, `unzipper`, `archiver`, and `ts3-nodejs-library` are marked as `serverExternalPackages` in `next.config.ts` — they ship native binaries and cannot be bundled by webpack.
- **`yjs`** has a webpack alias to enforce a single instance (avoids Y.js version conflicts with TipTap).
- **Skeleton accounts** (`isSkeletonAccount: true`) are CSV-imported users not yet matched to a Discord member — treat them as read-only stubs in member-facing logic.
- **Soft delete on operations**: deleted operations have `deletedAt` set; always filter `{ deletedAt: { $exists: false } }` in queries unless intentionally fetching the recycle bin.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_BASEURL` | Full site URL (e.g. `https://asotmilsim.com`) |
| `NEXT_PUBLIC_COLLAB_WS_URL` | WebSocket URL for Hocuspocus (derived from base URL) |
| `MONGO_URI` | MongoDB connection string |
| `MONGO_DB` | Database name |
| `DISCORD_GUILD_ID` | Discord server ID |
| `DISCORD_CLIENT_ID` | OAuth2 app client ID |
| `DISCORD_CLIENT_SECRET` | OAuth2 app secret |
| `DISCORD_BOT_TOKEN` | Bot token for outbound DMs and guild queries |
| `DISCORD_REDIRECT_URI` | OAuth callback path (default `/login/callback`) |
| `CRON_SECRET` | Bearer token for authenticating internal cron requests |
| `OVERRIDE` | Comma-separated Discord user IDs with unconditional admin bypass |
| `NEXT_PUBLIC_TS_ADDRESS` | Public TeamSpeak hostname |
| `TS_HOST` / `TS_QUERY_PORT` / `TS_SERVER_PORT` / `TS_SERVERADMIN_PASSWORD` | TeamSpeak ServerQuery credentials |
| `OCAP_API_URL` / `OCAP_VIEWER_URL` | OCAP after-action recording integration |
