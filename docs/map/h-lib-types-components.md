# Part H — lib, types, components, root config

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
