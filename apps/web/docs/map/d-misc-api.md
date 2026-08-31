# Part D — Misc API

Covers `app/api/{teamspeak,cron,applications,me,gallery,community,uploads,minigame,members,notifications,upload,services-asot,recruit-session,maps,map-presets,loadouts,dev,tfar,shoot,preferences,ping,orbat,milpacs,membercount,logout,generate,credits,award-request,auth,dashboard}/**/route.ts` (excludes `gallery/admin/**`, which belongs to the admin catalog). 88 route files.

### dashboard (1 file)

#### /api/dashboard/status
- **GET** — connectivity + dev-mode state for the `/dashboard` header's `ServiceStatusIcons`. Runs 5 checks in parallel, each racing a 5s timeout: Website (always reports online — reaching this route at all is the check), Database (`Db.users.findOne` with a `_id`-only projection), Backups (`checkResticHealth()` from `lib/backups.ts` — is the restic binary present and runnable), Discord (`GET https://discord.com/api/users/@me` with the bot token, same check `/api/admin/discord-bot-test` uses), TeamSpeak (`getConnection()` from `lib/teamspeak/cache.ts`, reusing the persistent connection). Also reads `Db.siteSettings` for `discordDevMode`/`teamspeakDevMode` (no caching — this route's own 30s client poll interval is cache enough). Auth: any authenticated user (`client.fetchMe()`), no admin gate — matches `/dashboard`'s own visibility. Collections: `Db.users`, `Db.siteSettings`.

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

#### /api/cron/backups
- **GET** — runs both restic-backed backup repos (`runAllBackups()` — DB dump + media, sequentially) if `autoEnabled` config and no operation already in progress; each side's failure is caught independently. No DB collections directly (uses restic repos + file-based status/config via `lib/backups.ts`).

#### /api/cron/calendar-reminders
- **GET** — three-part pass: (1) fires due `Db.calendarReminders` → notification + `sendCalendarReminderDM`; (2) drains `Db.meetingNotifQueue` (meeting_started/reminder/task_chaseup/attendance_overdue), resolves per-user or per-role recipients, skips LOA members, personalises reminder body by RSVP status, sends notification + `sendMeetingDM`; (3) fires due `Db.trainingReminders` for attending members → notification + `sendTrainingReminderDM`. Collections: `Db.calendarReminders`, `Db.meetingNotifQueue`, `Db.meetings`, `Db.trainingReminders`, `Db.trainingAttendance`, `Db.users`.

#### /api/cron/dev-check-escalation
- **GET** — runs hourly; for overdue `dev_check` tasks, checks whether the *next* check stage's due date (computed from op/campaign date minus weeks-out) has arrived; if so marks task `escalatedAt`/`overdue`, notifies J2 Department Leader + HQ Staff role, and creates an HQ escalation task. Collections: `Db.tasks`, `Db.operations`, `Db.operationCampaigns`. Side effects: `createNotificationForRole` x2, `Db.tasks.insertOne` (escalation task).

#### /api/cron/meeting-reminders
- **GET** — processes `Db.meetingNotifQueue` (fireAt <= now, not fired): resolves recipients by user/role, skips LOA for `meeting_reminder`, skips `meeting_attendance_overdue` if all confirmed, personalises body, sends notification + `sendMeetingDM`, marks fired. Collections: `Db.meetingNotifQueue`, `Db.meetings`, `Db.users`.

#### /api/cron/operations
- **GET** — runs every 5 min; multi-stage operations lifecycle driver: (0) RSVP auto-open at `rsvpOpenAt`; (1) RSVP auto-close (configurable offset before op date) + notifies section leaders via `getSectionLeaders`; (1b) CHQ allocation reminder 1hr before op start if unassigned reservists exist; (2) auto-activate Upcoming→Active at op start, mirrors attendance `stage` to `op_running`; (3) confirmation auto-open when op Completed, calls `createAttendanceTasksForOperation`; (4) confirmation auto-close 24h after opened. Collections: `Db.operationAttendance`, `Db.operations`, `Db.orbatPositions`. Side effects: `createNotification`, `lib/attendance/tasks.ts` task creation.

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

### me (7 files)

#### /api/me/orbat
- **GET** — returns the current user's ORBAT position entry (`getOrbatEntryByUserId`). Auth: any authenticated user (`client.fetchMe()`).

#### /api/me/promotion-progress
- **GET** — the caller's progress toward their next rank, for the navbar account menu: `{ currentRank, progress }`. Runs the same `loadConfirmedOps` → `resolvePromotionPoints` → `getPromotionProgress` chain (`lib/military/milpac-stats.ts`) the milpac file renders its bar from, so the two can never disagree. `progress` is `null` (no rank / rank on no known track), `{ atMax }`, `{ billetOnly }`, or the full `{ nextRank, required, current, pct }`. Auth: any authenticated user (`client.fetchMe()`). Collections: `Db.operationAttendance`, `Db.operations` (via `loadConfirmedOps`).

#### /api/me/roles
- **GET** — `?has=role1,role2` checks whether current user holds any of the given Discord roles. Auth: any authenticated user.

#### /api/me/permission
- **GET** — `?key=<permissionKey>` checks whether the current user holds a single migrated permission key via `hasPermission()` (`@/lib/orbat/hasPermission`), returning `{ access: boolean }`. Mirrors `/api/me/roles`'s shape but for the new DB-backed permission system — the client-side counterpart to `hasPermission()` for client components that can't call the server-only function directly. Auth: any authenticated user.

#### /api/me
- **GET** — returns current user document plus computed `isStaff`/`isMember` flags. Auth: any authenticated user.
- **POST** — updates `bio.*` fields on the current user document (upsert). Collections: `Db.users`.

#### /api/me/teamspeak
- **POST** — multi-action TS account linking flow via body `action`: `init` (auto-match online TS client by expected nickname, stores verify code), `poke` (poke a manually chosen client with the code), `verify` (confirm code, saves `teamspeak` field on user), `notify` (poke linked account with expected nickname), `list` (list online clients for manual pick). Auth: any authenticated user. Collections: `Db.users`. Side effects: TeamSpeak `clientPoke`/`clientList` calls.
- **DELETE** — unlinks the current user's TeamSpeak account (`$unset teamspeak/tsVerifyCode/tsPending`). Collections: `Db.users`.

#### /api/me/accent
- **PUT** — sets the caller's own `profileAccent` (body `{accent: '#rrggbb'}`, validated by
  `normaliseHex`). **DELETE** — clears it and returns what they will now resolve to. Own-record only
  by construction: no id parameter, no staff override, so it cannot recolour anyone else. Gate:
  `client.fetchMe()`. Collections: `Db.users`. Side effects: `logAction('milpac.accent_set'|
  'milpac.accent_clear')`.

#### /api/me/token
- **GET** — reads `token` cookie directly (no client.fetchMe() gate beyond cookie presence), resolves display name/color/avatar via `client.fetchMe(token)`; returns raw token to caller (used by TipTap collab client-side for `x-collab-token` header). Auth: `token` cookie presence only.

#### /api/me/reset-token
- **POST** — "log out of all devices": regenerates the caller's `token` field (`GenerateToken()` from `lib/encryption.ts`), invalidating every other browser/device's cookie in one shot (single-token-per-user auth, see CLAUDE.md). Sets the new token as this request's own `token` cookie so the current session isn't logged out. Auth: any authenticated user. Collections: `Db.users`. Logs `member.reset-login-token` via `logAction()`. Used by `app/me/ResetTokenButton.tsx`.

---

### nav (1 file)

#### /api/nav/status
- **GET** — the numbers behind the navbar's status rail: `{ nextOp, teamspeakOnline, roster }`. `nextOp` is the soonest `Upcoming`/`Active` operation starting less than six hours ago or later (an op runs for hours, so "next" is not simply `date >= now`); `In Development` is excluded because this route is **public and unauthenticated** — the rail renders on every page including signed-out landing. It carries `{ id, title, date, status, stage, rsvpOpen, attending, confirmed }`, the last four read off the op's `Db.operationAttendance` doc (only `records.rsvp`/`records.confirmed` are projected — `records` snapshots every member's unit/section/role and the rail needs two counts off it). `stage`/`rsvpOpen` are what let the rail tell "nobody has signed on yet" apart from "nobody can sign on yet". `teamspeakOnline` reads `getOnlineCache()` without refreshing it (cold cache → `null`); `roster` is a **distinct** count of `userId`s holding a filled `Db.orbatPositions` slot, excluding `category: 'inactiveReservist'` — reservists share that collection with platoon/HQ/gamemaster slots and are told apart only by `category`, so a plain filled-slot count both includes members flagged inactive and double-counts anyone holding two slots. Every field is independently nullable and each source is caught separately, so one failure drops a segment rather than the rail. `Cache-Control: no-store`. Collections: `Db.operations`, `Db.orbatPositions`. Consumed by `components/nav/useNavStatus.ts`.

---

### gallery (6 files, excludes admin/*)

#### /api/gallery/media/[id]/thumb
- **GET** — the grid tile's image: a ~400px WebP resized once from the original (or, for a video/embed, from its existing `posterKey` still — no ffmpeg on this path) and cached on disk under `storage/gallery/thumbs/{id}-{width}.webp`. Exists because the J5 Media tab was rendering full-size originals in 178px tiles: 4,781 archive files averaging 3.8MB, sixty a page, ~200MB per page view. Size/format/path logic is in `lib/gallery/thumbs.ts` (`THUMB_WIDTH`, `THUMB_QUALITY`, `thumbPath` — the id is re-validated against `/^[0-9a-f]{24}$/` and the resolved path asserted inside `THUMB_DIR`). Cache entries are invalidated against the **source's** mtime, and the weak ETag is over the source's size+mtime plus the width — no `immutable`, for the reason `/api/gallery/media/[id]` documents. Generation writes to a temp name and `rename()`s into place so concurrent requests never read a half-written file; any resize failure logs and 307-redirects to the full-size media/poster route, so a broken pipeline degrades to slow rather than to blank tiles. Auth: same gate as `/api/gallery/media/[id]` — public for `live`, author or `gallery.review` for `pending`/`processing`, 404 (never 403) otherwise. Collections: `Db.galleryMedia`. Consumed by `MediaGrid.tsx` and `MediaTable.tsx` via `AdminMediaAPI.thumb` from `/api/gallery/admin/library`.

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
- **POST** — uploads a new SOTM image (multipart: `file`, `dateTaken`, `credit`, optional `operationId`/`operationTitle`); validates MIME type, sanitises filename, deletes old file if replaced, upserts `Db.siteSettings`. Auth: `await hasPermission(me, 'departmentLeads.j5')`.
- **DELETE** — clears current SOTM (deletes file + doc). Auth: `await hasPermission(me, 'departmentLeads.j5')`.

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
- **POST** — uploads/overwrites the caller's own bio photo (`./uploads/bio/<me.id>.jpg`). Auth: `hasPermission(user, 'uploads.bio')`. Bounded and re-encoded via `normaliseImage(..., BIO_PRESET)`. Animation is flattened here deliberately: the file is written as `.jpg` and served as `image/jpeg` unconditionally, so a stored GIF would be bytes and content-type disagreeing. Its **GET** also validates `id` as a snowflake — it was interpolated straight into a filesystem path.

#### /api/uploads/cover
- **GET** — `?id=` serves `./uploads/cover/<id>.png` cover photo. Auth: public/no auth (read). `id` must be a Discord snowflake — it is interpolated into a filesystem path, and before that check `?id=../../../../etc/passwd` resolved. `Content-Type` is sniffed from the bytes rather than assumed `image/png`, because covers are stored under a `.png` name whatever was uploaded and some are GIFs. `?still=1` returns the first frame of an animated cover as a real PNG (decoded via `@napi-rs/canvas`, imported lazily; falls through to the raw bytes if it will not decode) — the /milpacs roster asks for that so it can hold animation back until hover.
- **POST** — uploads/overwrites the caller's own cover photo. Auth: any authenticated user. Bounded and re-encoded via `normaliseImage(..., COVER_PRESET)`: >20MB is refused with 413 before the body is materialised, and everything else is scaled into 2560x1440 and compressed under 3MB. GIFs stay GIFs (the roster animates covers on hover).
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
- **PUT** — updates milpac fields; splits into "standard" fields (promotions/awards/qualifications/name — `PERMISSIONS.members.editStandard`) and "restricted" fields (enlistedDate/bioRank/billetCounts/j4Points/disciplineHistory/disciplineDeductions — `PERMISSIONS.members.editRestricted`); stamps entries with the editor as issuer **only when the entry carries no `issuedByName` key at all** (i.e. a brand-new row). The presence of that key — including an empty string — is authoritative, because the editor deliberately clears `issuedById` whenever a name is typed by hand, and keying the stamp off the *id* meant every manually entered officer was silently overwritten with the editor's own name on save. A blank issuer is a decision and stays blank; `MilpacEditor` warns about it instead; checks name uniqueness; triggers async Discord nickname rebuild via `buildNickname` + `setGuildNickname`. Collections: `Db.users`. Side effects: `setGuildNickname` (fire-and-forget).

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

### loadouts (4 files)

#### /api/loadouts
- **POST** — creates a loadout for the authenticated member from `{raw, name, description?, shared?, icon?, tags?}`. `icon` is checked against `isKitIcon` (`lib/loadout/kit-icons.ts`) and dropped if unknown, so a stored value is always renderable. `tags` goes through `normaliseTags` (`lib/loadout/tags.ts`) — unknown keys dropped, capped at `MAX_KIT_TAGS`, always in declared order. Validates by parsing (`lib/loadout/parse.ts`); stores `raw` only. Bounds come from `lib/loadout/limits.ts` (64KB, 12 per member, 40-char name, 160-char description) — shared with the import form so the field that stops typing and the value the server truncates agree. `shared` defaults to **false**: publication is the one thing here that cannot be undone after the fact, so it is never inferred. First loadout becomes the default. Auth: any logged-in member, own records only.

#### /api/loadouts/[id]
- **PATCH** — rename, edit `description`, `icon` (same key-list check as create) or `tags` (`normaliseTags`; `undefined` means "not editing tags", `[]` means "clear them"), `shared` toggle, or `isDefault: true` (which clears the member's other defaults first). `description` is accepted with no UI behind it yet, so a line written at import time is correctable rather than permanent-until-reimport.
- **DELETE** — removes it; deleting the default promotes the most recently updated survivor. Also best-effort `deleteMany`s the loadout's rows out of `loadout_ratings` and `loadout_copies` (no transaction — ObjectIds are never reused, so a row left behind on failure is a leak, not a correctness bug).
- Both scope every query by `userId` from `fetchMe()`, never the URL id alone. Collections: `Db.loadouts`, `Db.loadoutRatings`, `Db.loadoutCopies`.

#### /api/loadouts/[id]/rating
- **PUT** — sets, changes or withdraws the caller's 1-5 star rating on a *shared* kit (`{stars: 1-5}` or `{stars: null}` to withdraw). Anonymous: the response never says who rated a kit, including to its owner — only `{mine, avg, count}` (the caller's own rating, plain mean, count) ever leaves the route. No self-rating (403) and no `GET` (both pages that show a rating read Mongo server-side). The write is a `findOneAndUpdate`/`findOneAndDelete` on `loadout_ratings` (`returnDocument: 'before'`, or the deleted doc) to get the member's previous rating atomically, then a single aggregation-pipeline `findOneAndUpdate` on the loadout that `$inc`s `ratingSum`/`ratingCount` by the computed delta and derives `ratingAvg` from those same written fields in a second `$set` stage — deliberately not a read-then-recompute-then-write, which could desync under concurrent raters. `ratingCount` floored at 0 via `$max`. Auth: any logged-in member, not the kit's owner. Collections: `Db.loadouts`, `Db.loadoutRatings`.

#### /api/loadouts/[id]/copy
- **POST** — counts a copy of a *shared* kit by a distinct actor: a signed-in member (Discord id) or a signed-out visitor identified by the `httpOnly` `kit_visitor` cookie (`anon:<uuid>`, set on first copy, 1-year `maxAge`). Only a first copy by a given actor moves `MemberLoadout.copyCount` — repeats increment `LoadoutCopy.copies` but not the headline number. Excludes the owner copying their own kit (not a signal). The increment and its read happen as one atomic `findOneAndUpdate` (`returnDocument: 'after'`) rather than write-then-arithmetic-on-a-snapshot, so two actors' first-ever copies landing concurrently can't both report the same stale count. Auth: none (public). Collections: `Db.loadouts`, `Db.loadoutCopies`.

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
- **POST** — regenerates a member's MilPac uniform + box renders from current user/ORBAT data, computes and stores `milpac.uniformHash` for change detection. Delegates to `generateMilpacForUser`, which posts to the `apps/milpac` render service via `lib/milpac-gen/client.ts` and writes the returned bytes to `storage/milpacs/`. Auth: `client.hasRoles(me, PERMISSIONS.pages.admin)` — deliberately still the legacy Discord-role gate; `pages.admin` has not migrated, and switching this route alone would have locked it to the `OVERRIDE` list (see the route's own comment). Collections: `Db.users`. Returns 502 when the render service is unreachable.

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
- **GET** — Hocuspocus collab-auth endpoint; reads `x-collab-token` header (not the `token` cookie) and `?doc=` query param to resolve document-specific permission: `sop-*` docs → any member (`hasPermission(user, 'pages.member')`); `ws-*` docs → J2 member/lead/admin; all others (operation briefings) → `hasPermission(user, 'auth.collab')`. Auth: bespoke per-document logic, no single gate. Returns `{authorized, userId, userName, userAvatar}` consumed by the Hocuspocus WS server on each connection.

## /api/milpac/certificate/[username]

- **GET** `?type=promotion|award&cert={code}` — renders a member's certificate on demand via the `apps/milpac` service and returns `image/png` inline. Nothing is persisted: unlike uniforms there is no staleness to track. Auth: any logged-in member (`client.fetchMe()`). Verifies the member actually holds the award, or has ever held the rank (any entry in `milpac.promotions`, plus `currentRank` for CSV-imported members with no history), before rendering — so the route can't be used to mint a citation for an arbitrary code. Signing officer is the officer who issued that award/promotion (`issuedByName` + `issuedByRank` on the record), falling back to `resolveUnitSignatory()` (`lib/milpac-gen/signatory.ts`) when the record names nobody. The member's own `{name}` is rendered rank-first ("MAJ Thomas") — for an award, the rank held on the award's date derived from the promotion history; for a promotion, the rank being granted. **Refuses to render an incomplete document**: a certificate is a record a member keeps, so a missing field stops it being issued rather than being filled with a plausible default. Returns **422** naming what is absent when the award/promotion date is missing or unparseable, when `milpac.enlistedDate` is, or when no signatory can be resolved at all (neither the record nor the ORBAT). The enlistment date is what the template's "enlisted on ..." line prints — it used to be passed the *award's* date, so both dates on every certificate read the same. Dates go through `parseMilpacDate` (`lib/military/milpac-dates.ts`) rather than `new Date()`, which misreads the day-first forms CSV imports produce. Returns 404 for a code the member doesn't hold or that has no slide, 502 if the render service is unreachable. Collections: `Db.users`.

## /api/bot/milpac/[discordId]

- **POST** `?type=uniform|medals` — regenerates that member's milpac images and returns the requested one as `image/png`. Auth: `Authorization: Bearer ${BOT_API_SECRET}` (**not** cookie auth — this is the Discord bot calling server-to-server; an unset secret closes the route rather than opening it). Always re-renders rather than serving the cached PNG, because the bot's contract is that the image is current as of the request. Exists so the bot never derives a render payload itself — that mapping is web's and duplicating it is the drift `apps/milpac/PLAN.md` §3/§4 describes. Returns 404 for a member with no record, 422 when their data names missing artwork, 502 when the render service is down. Collections: `Db.users` (also writes `milpac.uniformHash` via `generateMilpacForUser`). Consumed by `apps/bot`'s `/milpac uniform` and `/milpac medals`.
- **POST** `?type=dossier` — takes its own path rather than the `try`/`catch` above: builds a whole dossier card (`buildDossierData` + `DossierCard`, `lib/military/dossier-data.ts` / `dossier-card.tsx`) via `next/og`'s `ImageResponse` and returns it as `image/png` at `DOSSIER_SIZE` (1400×860). The card's link buttons ride back on an `X-Milpac-Links` response header (`JSON.stringify`d `{label, path}[]`) as site-relative paths, never absolute URLs, so the bot — which joins them to its own public base URL — can't be handed the internal render-service URL. Fetches the full roster via `client.fetchAllMembers()` solely to resolve the canonical slug segment for those paths; the member lookup itself is still by Discord id. Survives the render service being down (identity/stats/kit line still make a card) where `type=uniform|medals` cannot. Collections: `Db.users`, `Db.loadouts`.

## /api/admin/certificate-signatory

- **GET** — returns `{positionId, activePositionId, signatory, positions[]}` for the J4 Website Settings → Certificates picker: the chosen CHQ position (null when unset), the one actually in use, the resolved signature block, and every `companyHQ` ORBAT slot with its current holder. **PUT** `{positionId}` — sets or (with null) clears the choice; rejects an id that isn't a real `companyHQ` position, so a bad id can't silently unsign every certificate. Auth: `client.hasRoles(me, PERMISSIONS.departments.j4)`. Stores only the position id in `Db.siteSettings` `_id: 'certificateSignatory'`, never a name. Logs `orbat.certificateSignatory.set`. Collections: `Db.siteSettings`, `Db.orbatPositions`, `Db.users`.
