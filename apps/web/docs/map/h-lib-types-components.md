# Part H — lib, types, components, root config

This map documents every file under `lib/**` (60 files), `types/**` (32 files), and the requested
`components/**` subset, plus root-level config files (`server.mjs`, `next.config.ts`, `middleware.ts`,
`themes/unit.ts`). Use it to find existing helpers before writing new ones.

---

## 1. `lib/**`: reusable server logic (60 files)

### lib/mongo.ts
- Default export `Db`: singleton `MongoClient` cached on `global._mongoClient` (survives Next.js HMR). One typed `MongoCollection<T>` property per collection. Full list of ~58 collections including `users`, `roles`, `milpacs`, `optionals`, `operations`, `operationActivity`, `minigameScores`, `minigameLive`, `orbatPositions`, `orbatSectionMeta`, `orbatRoles`, `orbatRoleGroups`, `boardColumns`, `boardCards`, `departmentLinks`, `operationAttendance`, `operationDocAcks`, `j1Applications`, `tickets`, `calendarEvents`, `siteSettings`, `operationTemplates`, `operationCampaigns`, `campaignMissions`, `notifications`, `loadouts`, `loadoutRatings`, `loadoutCopies`, `tasks`, `calendarReminders`, `meetings`, `actionLogs`, `errorLogs`, `discordLogs`, `driversLicense`, `mapPresets`, `retiredMembers`, `quizAttempts`, `communityTickets` (→ `feedback` collection), `communityTicketComments` (→ `feedback_comments`), `meetingNotifQueue`, `userPreferences`, `notifPolicyConfig`, `sops`, `trainingDocs`, `teamspeakSnapshots`, `recruitSessions`, `tfarPlugins`, `inProgressRecruitments`, `workspaceFiles`, `workspaceDocs`, `workspaceVersions`, `leavingHistory`, `deniedApplicationsHQ`, `disciplineRecords`, `billetExtras`, `memberEmails`, `mastersheetRecycleBin`, `dischargeSnapshots`, `trainingTypes`, `trainingEvents`, `trainingAttendance`, `trainingTypeDocs`, `trainingRequests`, `trainingTickets`, `trainingReminders`, `trainingImportRecords`, `eraOptions`.
- `Db.stats()` — prints DB stats via `console.table`.

### lib/permissions.ts
- Default export `PERMISSIONS`: single source of truth, extensively JSDoc'd per key listing exactly which routes/pages consume it. Top-level groups: `pages` (member/admin/members/operationsEdit), `departments` (j1–j7), `operations` (write/viewInDevelopment), `uploads.bio`, `members` (edit/editRestricted/editStandard), `admin` (impersonate/manageOrbat/manageOrbatStructure/manageOrbatMembers/**manageOrbatRoles**/massImport), `optionals.manage`, `feedback.manageStatus`, `communityTickets.manage`, `gallery.manage`, `attendance.confirm`, `auth.collab`, `departmentLeads` (j1–j7), `meetings` (lockJ1–lockJ7), `deptLinks.manage` (single department-scoped key, new-system-only, no Discord-role fallback — gated via `hasDepartmentPermission`/`hasDepartmentPermissions`, not `hasPermission`/`hasPermissions`), `quiz` (assign/review/reviewEscalated), `trainingDocs.manage`, `sops.manage`, `training` (create/trainer/manage), `masterSheet` (view/viewDiscipline/import), `tickets` (actionJ1–actionJ7, actionMoveRequest, actionDiscipline).

### lib/permissions-catalog.ts
- `PERMISSION_CATALOG: Record<string, string[]>` — flattens the nested `PERMISSIONS` object into dot-path keys (e.g. `attendance.confirm`) mapped to their Discord-role-name arrays; the flat key space is what `OrbatRole.permissions` and the Roles Manager's permission picker draw from.
- `PERMISSION_KEYS: string[]` — sorted `Object.keys(PERMISSION_CATALOG)`, served to the client via `GET /api/admin/orbat/permission-keys`.

### lib/orbat/hasPermission.ts
- `hasPermission(user, key): Promise<boolean>` — additive permission check: true if the user's Discord ID is in the `OVERRIDE` env list (the only hard bypass) **or** the user's currently-assigned `Db.orbatPositions` doc's `roleId` resolves to an `OrbatRole` whose `permissions` includes `key` **or** their base department role (implicit from `User.departments`) or any assigned department sub-role (from `User.departmentRoleIds`) grants it via `Db.departmentRoles`. Deliberately does NOT fall back to checking raw Discord role names — this function replaces that pattern, one permission key at a time, across the site. Wired into `attendance.confirm` (pre-existing) and, as of the permission-system migration, `pages.member` (35 call sites) — reservists can now satisfy this via their seeded "Reservist" `OrbatRole` (see `lib/orbat/reservist-role.ts`).

### lib/orbat/hasPermissions.ts
- `hasPermissions(user, keys: string[]): Promise<Record<string, boolean>>`: batch variant of `hasPermission`, answers every requested key in one query pass (one `orbatPositions`/`orbatRoles` round trip, one `departmentRoles` round trip) instead of repeating 2-3 uncached queries per key. Identical semantics to `hasPermission`: same `OVERRIDE`-only hard bypass, same three grant sources (ORBAT position Role, base department role, department sub-roles); `hasPermission.ts` itself is untouched.

### lib/orbat/hasDepartmentPermission.ts / hasDepartmentPermissions.ts
- `hasDepartmentPermission(user, department, key): Promise<boolean>` and its batch variant `hasDepartmentPermissions(user, department, keys: string[]): Promise<Record<string, boolean>>`: department-scoped siblings of `hasPermission`/`hasPermissions`. Same `OVERRIDE`-only hard bypass, but only consult `Db.departmentRoles` docs where `department` matches the requested department (the base role, if the user is an actual member of that department, or any sub-role they hold) — ORBAT position roles are deliberately **not** consulted, since those aren't department-scoped and including them would defeat the point of the check. Introduced for the department-quick-links permission rework (`app/api/admin/dept-links/**`, `app/api/dashboard/quick-links`, `app/dashboard/j{1..7}/page.tsx`) so a single `deptLinks.manage` key can be assigned to any department's role and only grant rights over that one department.

### lib/orbat/reservist-role.ts
- `ensureReservistRole(): Promise<ObjectId>` — atomically finds or creates the seeded "Reservist" `OrbatRole` (unscoped, `categories: []`) via `findOneAndUpdate` upsert (race-free — never creates duplicate "Reservist" docs under concurrent callers, unlike a `findOne`-then-`insertOne` pattern). Every reservist position (`activeReservist`/`inactiveReservist`) sets its `roleId` to this, giving reservists a real, editable grant vehicle via the Roles Manager. Called from `POST /api/admin/orbat/reservists`, `lib/orbat/move.ts` (section→reservist move, both the new-slot and stale-null-vacant-slot cases), `PATCH /api/admin/orbat/[positionId]` (auto-evict-to-reservist on unassign), and `POST /api/admin/mass-import` (reservist rows on full-rebuild reimport).

### lib/buildNickname.ts
- `buildNickname(rank, name, departments=[], isChaplain?)` — builds standard Discord nickname `RANK NAME [DEPT]... [✞]`; departments sorted+uppercased, chaplain cross appended last.

### lib/colour.ts
- `hexToRgb(hex)` / `rgbTriplet(hex)` — one home for hex → rgb, and the `"219,0,29"` form CSS custom properties want for `rgba()` tinting. Previously redefined in three files, two of which had drifted on what to do with a malformed value; falls back to ASOT red.
- `relativeLuminance(rgb)` / `contrastRatio(a, b)` — WCAG, 1 to 21, order-independent.
- `hexToHsl(hex)` / `hslToHex(hsl)` — round-trips; greys come back with `s: 0` rather than a meaningless hue.
- **`readableOn(hex, ground, minRatio=4.5, minSaturation=0.45)`** — the operation's theme colour, moved until it is legible on a stated ground. **Why it exists:** the colour comes from a picker with no opinion about legibility, and two page themes use it as *ink*. ASOT red is 3.87:1 on the Sci-Fi console's glass and fails AA outright; the same orange that reads 5.99:1 there reads **2.61:1** on Cold War's paper. It holds the **hue** — hue is what people recognise, so the operation still reads as its own colour — and walks lightness outward from the ground in 1% steps until the ratio clears. A search rather than a formula because luminance is not linear in HSL lightness and a closed form is more machinery than 100 iterations of the real thing. Saturation is **floored, not preserved**: a near-grey accent walked towards white just becomes white and the operation stops being recognisable, so it is only ever raised. A colour that already clears is returned **untouched** — nudging one that was fine is how "keep the operation's accent" quietly becomes "keep its hue". Returns the best it managed if the ratio is unreachable, since some hues cannot hit 7:1 on a mid grey at any lightness and a slightly-low accent beats a black one. Unit-tested in `colour.test.ts`, including a sweep proving every hue clears AA on both grounds.

### lib/operations/permissions.ts
- `can(user, capability)` / `canEach(user, capabilities[])` — the single gate for everything in the operations area. `user` is nullable so callers pass `await client.fetchMe()` straight through; a logged-out visitor still passes the public capabilities.
- **Why it exists:** the whole area used to hang from one Discord-role check, `client.hasRoles(me, PERMISSIONS.pages.operationsEdit)`, which answered five questions at once — open the editor, write the orders, change the schedule, move the roster, link a replay. One role, five jobs, no way to hand somebody one of them.
- **17 capabilities**, each its own key: `view`, `zeus`, `orders.{view,write,details}`, `map.{view,edit}`, `schedule.{view,manage,override}`, `attendance.{view,claim,manage,roles,confirm}`, `ocap.{view,manage}`.
- **Every rule carries a legacy arm.** `hasPermission` has no Discord-role fallback, so a new key is false for everybody — admins included — until it is granted. Introducing thirteen at once and checking only the new way would have closed the operations area to all staff on deploy. Each rule therefore also accepts whoever passed the check it replaces, which makes the change strictly additive. Retiring an arm later is a per-rule edit in the table and nowhere else.
- **Baselines** (`'public'` / `'member'`) record what a surface allows *today* — the orders page and map are public, any member reads the attendance board and claims a slot. A baseline short-circuits its key, so granting the key changes nothing while the baseline stands; the key is the vehicle that carries the surface once the baseline goes, and it is in the Roles Manager so grants can be set up first. Tightening one is deleting a line.
- Baselines are answered before anything else, deliberately: `hasPermission` goes to Mongo twice, and a page asking eight questions of a member who passes them all on the baseline should not make sixteen round trips to find out.
- `permissions.test.ts` pins the table itself — every capability names a key that exists in `PERMISSION_KEYS`, every legacy key exists, **every gated capability has a legacy arm**, no legacy role array is empty (a mistyped `PERMISSIONS.x.y` would otherwise look like a fallback while being none), and the splits hold in both directions.

### lib/operations/console-palette.ts
- `consolePalette(themeColor): ConsolePalette` — the Sci-Fi orders theme's entire screen, derived from one hue. Glass (three depths plus the near-black that sits *on* a filled block), two brightnesses of tube, three inks, and the alarm.
- **Why a whole palette and not an accent:** the theme is a monochrome console, so the operation's colour is the phosphor and *everything* is it — the cast in the glass, the hairlines, the body copy. What separates them is **saturation and brightness, never hue**, which is how a single-phosphor tube works and the only way to hand a page to an arbitrary colour without a clash. Saturated means "this means something", desaturated means "this is text".
- Each step is a **proposal** (a chosen S and L) run through `readableOn` against the ground it will sit on: untouched if it already clears, lifted if not. The ramp keeps its intended shape for a well-behaved colour and degrades to *legible* rather than to *wrong* for a bad one. Every call passes its own `minSaturation` — the default would drag a deliberately desaturated ink up to 0.45 the moment it needed lifting.
- Floors are above AA (tube 7:1, ink 12:1, body 7:1, labels 4.5:1) because the theme's raster lays a line of black over one row in three.
- `alarmFor()` — the one lamp that is *not* the tube. Red, unless the tube is within 45° of red, at which point it takes the operation's complement: a red alarm on an orange screen stops being a different thing and becomes a slightly different shade of the same one. 45° rather than something tighter because the collision is not a knife edge.
- `console-palette.test.ts` sweeps all 24 hues and asserts every floor, that hue is held within 3°, that the glass stays near-black, that text stays less saturated than the signal, and that the alarm never sits within 45° of the tube.

### lib/discord/color.ts
- Default export `convertColorToHex(color: number): string` — decimal → `#rrggbb`.
- `ensureVisible(hex, minLuminance=0.25)` — WCAG-luminance-based brightener; near-black → grey fallback, otherwise scales channels up to meet threshold. Used by `resolveMilpacProfile` for accent colors.

### lib/discord/avatar.ts
- `defaultAvatarURL(userId)` / `avatarURL(userId, avatarHash?, size?)` — Discord CDN URLs; the extension is `.gif` when the hash starts with `a_` (Discord's marker for an animated avatar), else `.png`.
- `isAnimatedAvatarURL(url)` / `stillAvatarURL(url, size=128)` / `animatedAvatarURL(url, size=128)` — the still and animated spellings of one avatar. Discord serves the same hash under either extension, so no second stored field is needed. **Why they exist:** `next/image` does not optimise animated images, it passes them through byte-for-byte — the /milpacs roster was therefore serving full-size GIFs (one measured at 1.76MB) behind 54px circles and repainting all of them forever. The `.png` of that same avatar is 14KB. The URL pattern is deliberately strict rather than an `.endsWith('.gif')`: the result is interpolated into a CSS `url()` by the roster card. Unit-tested in `avatar.test.ts`, including the injection cases.

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

### lib/discord/dept-codes.ts
- `DEPT_CODES: readonly ['j1','j2',...,'j7']` — plain, dependency-free department-code list. Exists so client components can get the valid code set without importing `dept-roles.ts` (which pulls in `Db`/mongodb via its server-only exports and breaks client bundling if imported from a `'use client'` file — this bit `app/dashboard/orbat/DepartmentRolesTab.tsx` once already).
- `DEPT_LEADERSHIP_POSITIONS: Record<deptCode, [string,string,string]>` — per-department labels for the 3 leadership slots (`[Leader, 2IC, 3IC]`; empty string means that department has no such slot, e.g. J4 has no 2IC/3IC). `LeadershipSlot` type (`'leader'|'2ic'|'3ic'`) and `LEADERSHIP_SLOT_INDEX` (slot → array index). Shared by `DeptMembersTab.tsx`, `DepartmentRolesTab.tsx`, and the department-roles PATCH route.

### lib/discord/dept-roles.ts
- `DEPT_ROLES: Record<deptCode, { member, lead? }>` — maps `j1`–`j7` → Discord role name(s). Server-only (imports `Db`) — never import this file from a `'use client'` component; use `dept-codes.ts` for just the code list.
- `syncDeptDiscordRole(userId, deptCode, action: 'add'|'remove')` — resolves role IDs via `Db.roles`, calls `addGuildRole`/`removeGuildRole` from `bot.ts` (on `remove`, also revokes the legacy hardcoded lead-role name if `DEPT_ROLES[dept].lead` is set, in case a pre-migration member still holds it), then rebuilds and pushes the member's Discord nickname via `buildNickname` + `setGuildNickname`. `set-lead`/`remove-lead` actions were removed — leadership slots are `DepartmentRole` holdings now, see `assignLeadershipSlot`/`unassignLeadershipSlot` below.
- `applyBaseDepartmentRoleSync(userId, deptCode, action: 'add'|'remove')` — grants/revokes a department's base `DepartmentRole`'s Discord roles + TeamSpeak groups for a member. Called alongside `syncDeptDiscordRole` from every path that mutates `User.departments` (the `department-membership` ticket handler's `add`/`remove` actions, `PATCH /api/admin/members/[id]`, and `assignLeadershipSlot` when it auto-grants base membership to a new leadership-slot holder who wasn't already a member) — the base role's grants are a separate, admin-configured layer on top of plain membership, not derived from it.
- `revokeDepartmentSubRoles(userId, deptCode)` — revokes every `DepartmentRole` a member holds that belongs to `deptCode` specifically (roles from other departments they're still in are untouched), and `$pullAll`s them from `User.departmentRoleIds`. Called whenever someone is removed from a department — grants are stored per-user and don't self-heal the way the base role (derived live from `User.departments`) does. Covers leadership-slot roles too, since they're stored in the same field.
- `assignLeadershipSlot(userId, deptCode, slot: 'leader'|'2ic'|'3ic')` — grants the member the `DepartmentRole` whose `linkedSlot` matches, revoking it from whoever held it before (single holder per slot), and granting base department membership first if they don't already have it. Throws if no role is linked to that slot yet (callers surface as 400).
- `unassignLeadershipSlot(userId, deptCode, slot)` — revokes the slot-linked role from a specific member. No-op if unlinked or not held.

### lib/discord/bot.ts
- Single source of truth for **all** outbound Discord actions. Every mutation passes through `checkDiscordGate()` (dev-mode gate, 30s in-process cache reading `Db.siteSettings._id:'discordDevMode'`, `OVERRIDE` env bypass) and logs via `logDiscord()` (`lib/logs.ts`).
- `botRequest<T>(method, path, body?)` — raw Discord REST fetch with `Bot {DISCORD_BOT_TOKEN}` auth; exported for reuse (used by `discord/index.ts`'s `guildRequest`).
- `checkDiscordGate(userId)` → `{ allowed, devMode, override }`.
- `invalidateDevModeCache()` — bust the 30s in-process dev-mode cache (call after toggling).
- `sendDM(userId, payload: {content?,embeds?}, messageType='raw')` — opens/caches DM channel (`dmChannelCache`), sends, logs sent/blocked/failed.
- `sendChannelMessage(channelId, payload, messageType='raw')` — same pattern for guild channels; skips silently if `channelId` falsy.
- Typed DM helpers (all wrap `sendDM` with pre-built branded embeds): `sendCalendarReminderDM`, `sendTaskAssignedDM`, `sendTaskExtensionRequestDM`, `sendTaskExtensionApprovedDM`, `sendTaskExtensionDeniedDM`, `sendTaskExtensionAlternativeDM`, `sendTaskReassignmentRequestDM`, `sendTaskReassignmentOutcomeDM`, `sendTaskReminderDM`, `sendTaskOverdueDM`, `sendTaskEscalationDM`, `sendTaskDeleteRequestDM`, `sendTaskDeleteOutcomeDM`, `sendTrainingApprovedDM`, `sendTrainingRejectedDM`, `sendTrainingReminderDM`, `sendMeetingDM`, `sendFeedbackCommentDM`, `sendFeedbackStatusDM`, `sendLeadZeusDM`, `sendBoardCardAssignedDM(userId, cardTitle, columnTitle, actionUrl?)` — J7 board card assignment DM, inserted immediately after `sendTaskAssignedDM`, same embed shape.
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
- `buildBoxData(user): BoxData` — `{name, medals: Citation[]}` for the medal box. Shares `resolveCitations` with the uniform, so award display names become citation codes and campaign clasps collapse to the highest held. Sending raw award names is a 400 from the service (its `assetName` schema rejects the commas in e.g. "Campaign Medallion, First Clasp"), which `BoxData.medals` being typed `Citation[]` now prevents at compile time.
- `computeUniformHash(uniformData, boxData, fingerprint?): string` — MD5 of the JSON-serialized render inputs; stored as `user.milpac.uniformHash` to detect stale cached portraits. Hashes the *whole* payload rather than named fields, so any new field reaching the renderer is covered automatically. `fingerprint` (from `getRenderFingerprint`) covers what the payload cannot — the artwork itself, which otherwise leaves every cached image stale after an asset swap.

### lib/milpac-gen/maps.ts
- `AWARD_TO_CITATION: Record<awardLabel, Citation>` — maps `lib/military/awards.ts` labels → citation ribbon codes (includes all 16 campaign clasp tiers).
- `QUAL_TO_BADGE: Record<certLabel, TrainingBadge>` — maps `lib/military/certifications.ts` labels → training badge codes.
- `SECTION_TO_BADGE: Record<sectionTitle, Badge>` — ORBAT section title → corps badge (Command/Echo/Golf/Hotel/Mike/Victor/GM).
- `DEFAULT_BADGE = 'Infantry'`.

### lib/milpac-gen/types.ts
- Types: `TrainingBadge`, `Rank` (full flat union of every rank abbreviation variant used by the generator), `Medallion`, `Citation`, `Badge`.
- Interfaces: `UniformData` (`name,displayName,rank,medallions,citations,TrainingMedals,Uniform,RifleManBadge,badge`), `BoxData` (`name,medals`).

### lib/milpac-gen/client.ts
- Typed client for the `apps/milpac` render service. `renderUniform(data)` / `renderBox(data)` / `renderCertificate(data)` → `Promise<Buffer>`; `isMilpacServiceConfigured()` for callers that prefer to degrade. Posts to `MILPAC_SERVICE_URL` with `Authorization: Bearer ${MILPAC_SERVICE_TOKEN}`, 30s timeout. Failures throw `MilpacServiceError` carrying the status and the service's JSON detail — 400 names the offending field, 422 names the missing asset, 500 carries a correlation id matching the service's log.
- `getRenderFingerprint(): Promise<string>` — the service's artwork digest (`GET /fingerprint`), cached in-process for 60s. Folded into `computeUniformHash` so new artwork invalidates every cached render; an unreachable service reuses the last known value rather than letting the hash flap.
- `lib/milpac-gen/uniform.ts` and `box.ts` were **deleted** — rendering moved into the `apps/milpac` service. `public/milpac-assets/` stays: it is served directly to the browser for training badges and ribbons.

### lib/milpac-gen/signatory.ts
- Resolves who signs a rendered certificate when the award/promotion record itself names no issuing officer. `resolveUnitSignatory()` → `{signaturer, signaturerRankShort, signaturerRankFull}`; `getSignatoryPosition()` / `resolveSignatoryFor(position)` are the pieces the J4 picker reuses. `SIGNATORY_SETTING_ID = 'certificateSignatory'` in `Db.siteSettings` stores only `{positionId}` — an ORBAT position, so the holder is resolved live and a change of command needs no edit. Unset (or pointing at a deleted position) it guesses: first *occupied* `companyHQ` slot whose role matches Officer/Commanding, else first occupied CHQ slot. Deliberately ignores `isSenior` (set only at mass-import, not maintained by the ORBAT editor). Returns `EMPTY_SIGNATORY` rather than throwing when nothing resolves.

### lib/milpac-gen/generate-for-user.ts
- `generateMilpacForUser(user: User): Promise<{uniform: Buffer; medals: Buffer}>` — orchestrates: fetch ORBAT entry, build uniform+box data, generate both images in parallel, write both to `storage/milpacs/`, persist `milpac.uniformHash` on `Db.users`. **Returns the bytes as well as persisting them**, so `/api/bot/milpac` can hand them straight back without re-reading the file it just wrote. Always renders — no hash check, unlike the profile page. Bypasses HTTP auth — caller responsible.
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

### lib/attendance/roster.ts
- The pure slot model behind the live attendance board. Clock-free and dependency-injected the way `lib/operations/phases.ts` is — the stage and the RSVP answers are passed in, never read.
- `RosterSlot` carries `role` + `roleId` (denormalized name alongside the `OrbatRole` link, the same pairing `OrbatPosition` uses) and **two** user references that must not be conflated: `homeUserId` (whose ORBAT position this is — written once at snapshot, never again) and `occupantUserId` (who is actually playing in it). Splitting them is what fixes the old bug where joining another section overwrote a member's `orbatRole` in place.
- `buildRoster(positions)` — the snapshot; a position's holder starts pencilled into their own slot, which is what "reserved" means.
- `viewRoster(roster, ctx): SlotView[]` — derives all seven `SlotState`s in one pass (`held`, `awaiting`, `lapsed`, `backfilled`, `open`, `declined`, `released`) plus `vacatedBy` and `available`. `declined`/`released`/`open` stay distinct because they mean opposite things to a section leader. `lapsed` is `awaiting` after the window shuts — **derived from the stage, not written by a job**, so nothing runs at RSVP close and no release can run twice.
- `assignSlot(roster, slotId, userId)` — **swaps** when the destination is occupied rather than refusing; returns a new array.
- `releaseMember(roster, userId)` — takes a member out of **every** position they occupy; what "not attending" and "leave position" both do. Pool membership is derived (`derivePool` lists whoever is available and not in a slot), so answering no removes them from the pool by the same write. `homeUserId` is untouched — the position stays theirs, which is what makes it read as *released* and lets them reclaim it. Returns the same array when they held nothing, so a caller can skip the write and the revision bump.
- `reclaimHome(roster, userId)` — puts a member back in their own ORBAT position and names whoever was displaced. Leaves alone anyone already standing elsewhere: that was a decision, not a gap. Pure — it names the displaced member, the caller notifies.
- **`SlotView.occupantUserId` is derived, not the stored field.** A member who answered no is not in the position, whatever the roster says. `viewRoster` always computed that for the *state* and then spread the raw slot back over the top, so the board — which draws a row's member from this field — went on showing a declined member's name with a DECLINED badge beside it. The board renders entirely from the view, so deriving here heals a roster that any other write path left stale.
- `derivePool(roster, members)` / `autoFill(roster, pool, ctx)` — who is unplaced (with the position they released, for the dual-identity case), and placement that serves the pickiest preferences first.
- `snapshotCategories(assignedPlatoons)` / `orderPositions(positions, categories)` — which ORBAT categories a roster covers (game masters always included) and their display order.

### lib/orbat/roleScope.ts
- `roleAllowedIn(role, category)` / `rolesFor(roles, category)` — where an ORBAT role may be used. `OrbatRole.categories` is a whitelist in which an **empty array means "usable everywhere"**, not "nowhere" — an inversion that was easy to get backwards while the rule was re-typed at each call site (the Roles Manager's picker inline, the mass importer's own variant). Shared so the attendance board applies the same rule the ORBAT does, and so the server can *check* it rather than trusting a client that filtered a dropdown.

### lib/attendance/snapshot.ts
- `buildRosterForOperation(assignedPlatoons)` — the roster an operation *would* have if cut now, without writing it. Shared by the automatic cut and the deliberate re-take so the two cannot disagree about what a roster is made of.
- `ensureRosterSnapshot(operationId)` — cuts the roster once, when the op first reaches `rsvp_open`. Called from both server paths that can get it there (`cron/operations` and `attendance/platoons`), so the guard is the write itself: it only matches documents with no roster yet. Returns the roster if this call created it, else null.

### lib/attendance/simulate.ts
- `simulateAttendance({ roster, reservists, rand, turnout })` — dev-only generator producing plausible attendance: holders attending / declining / never replying, some turning out for another section as backfills, reservists claiming positions or waiting in the pool with and without a preference. Pure and seeded (`mulberry32`), so it is testable and so "show me that again" reproduces rather than reshuffles.
- `TURNOUT_PROFILES` / `TurnoutKey` (`quiet` | `medium` | `busy`, default `medium`) — how well the night goes. One fixed rate only ever showed one board; the two ends are what the layout has to survive, a quiet night being mostly gaps and a busy one filling nearly every position and overflowing the pool. Every profile leaves `holderAttends + holderDeclines` well under 1, so someone always fails to reply and `awaiting` stays generable. `isTurnoutKey()` is the route's validator.
- It writes to a real roster, so it holds the board's invariants: nobody in two positions, nobody who declined left standing in one. It starts from the state a fresh snapshot leaves — holders pencilled into their own positions — because clearing the board first made `awaiting` impossible to generate, which is the state a generated board most needs to show.

### lib/operations/board.ts
- The pure model behind the public operations board — grouping and filtering, both testable without a database.
- `groupOperations(ops, campaigns, missions)` — turns a flat list into campaign brackets and standalone rows. An operation joins a campaign by `campaignId` *or* by a `campaignMissionId` that resolves to one, and joins a numbered mission the same way; **anything left over is paired on its title**, so "Lost Army IV — SAT" and "— SUN" become one mission even with no mission record behind them. Most of seven years of archive predates campaign missions being modelled, and an archive that only understood the modern shape would show all of it as unrelated singletons.
- `detectDaySlot` / `detectRoman` — the title parsing that makes the above work. Lifted out of the page component, where the same logic ran and was then thrown away at the end of the render.
- `parseBoardFilter` / `isFiltered` / `escapeRegex` / `PAGE_SIZE` — the filter as a value both the query and the UI agree on. `escapeRegex` matters: without it a stray `(` in the search box is a driver-level syntax error and `.*` is a search that matches everything.
- `monthKey` / `fillMonths` — the histogram's buckets. Empty months are filled in deliberately: a histogram drawn only from months that exist makes a six-month break look like one step, which is exactly the shape it exists to show.

### lib/operations/template-document.ts
- `buildTemplateDocument()` / `applyTemplateDocument(ydoc)` — dev-only: a filled-in operation document (five-paragraph orders, a Zeus page, platoon orders, an AAR) written straight into the live `Y.Doc`. An empty document exercises none of the editor, and neither does typing “test test test” into one section.
- **Client-side by necessity.** Writing it server-side means writing `yjsState`, which Hocuspocus reads only once — on the first connection — so the write lands under whatever is already in memory and is overwritten by the next save. Applying it to the shared document is the same path “+ Add Section” takes: it syncs to every viewer and persists normally.
- **It only ever appends.** This runs against documents other people may have open, so clearing first would be a one-click way to destroy someone's work; appending gives the same test surface. One `ydoc.transact`, so peers see it arrive whole.
- Content covers **every node and mark** in `contentExtensions()`, and the tests assert exactly that — an unknown mark is discarded silently rather than throwing, so a typo would otherwise ship a document quietly missing half its formatting.

### lib/dev-tools.ts
- `DEV_TOOLS_ENABLED` — one flag for every development-only surface (the attendance data generator, the editor's template document), read by both the UI that renders the control and the route that answers it, so "visible but refusing" and "hidden but answering" cannot happen.
- `NODE_ENV` alone cannot express this for a build you intend to run: Next inlines `process.env.NODE_ENV` into the client bundle at build time and `next build` fixes it at `"production"`, so the controls are compiled out and no runtime variable brings them back; and `server.mjs` derives its own `dev` from `NODE_ENV`, so starting the built server with `NODE_ENV=development` starts the dev compiler rather than serving the build. `NEXT_PUBLIC_DEV_TOOLS=true` is the explicit opt-in, and must be set for the build as well as the start (`npm run build:devtools` / `start:devtools`, or the two "(dev tools)" items in the root menu).

### lib/orbat/constants.ts — short platoon labels
- `PLATOON_SHORT_LABELS` / `platoonShortLabel(category)` — the same categories under the names the unit says out loud ("1-0 HQ", "1-3"). `PLATOON_CATEGORIES` carries the formal titles, which are right for a heading and far too long for a chip. Kept beside the formal list rather than re-typed per call site, which is how "1-3 Support Platoon" and "Platoon 1-3 Support" became the same thing spelled two ways.

### lib/attendance/board-user.ts
- `toBoardUser(user, fallbackId?)` — how the board names and pictures a member: rank + milpac name when there is one, then guild display name, global name, username, id. Shared because two endpoints build it — the board's GET for the whole member list and the roster route for the one member a write changed — and two copies would drift into the same row being labelled one way on load and another the instant somebody pressed a button.

### lib/attendance/actions.ts
- `BoardAction` = `MemberAction | StaffAction` — the wire format shared by the roster route that validates it and the hook that sends it, so the two cannot drift. `isMemberAction()` is the discriminator the route's gate uses.

### components/operations/board/
- `AttendanceBoard.tsx` — the live board, rendered by **both** the editor's Attendance tab and the operations view page (one board, two modes; `canManage` is the only difference). Groups slots by category → section, collapses everything outside the viewer's own category (~70 positions do not fit on a screen), and hosts the dnd-kit `DndContext`.
- `useAttendanceBoard.ts` — Mongo stays authoritative and the Y.js doc (`att-{operationId}`) carries only `rev`. **The collab socket authenticates but never authorises per field**, so a CRDT board would let any connected member write any position — which is why board state is not in Y.js. Presence comes free from the awareness channel. Falls back to a 30s poll.
- `BoardSkeleton.tsx` — the board's own shape while it loads: same bars, gutters, weighted platoon columns and docked rail, so nothing jumps when the data lands. Replaced four grey rectangles that said a page was loading without saying which. The setup panels under the board wait on `onReady` (fired however the first load settles, errors and empty rosters included, since the Rebuild button down there is the fix for both) rather than arriving first and being shoved a screen down.
- `SectionCard.tsx` / `SlotRow.tsx` / `PoolRail.tsx` / `MemberBar.tsx` / `AddRole.tsx` / `Legend.tsx` / `parts.tsx` / `board.module.css` — a section and its drop target, one position, the docked reservist pool, the viewer's own controls, the per-section add-position picker (scoped by `rolesFor`), the colour key, shared avatar/tag helpers, and the state-coloured styles.
- Section and platoon **patches and colours** come from `orbat_section_meta`, keyed on `(category, sectionTitle)` where a null title means the platoon itself. The board resolves a section's own patch/colour first and falls back to its platoon's; the colour sits as a rule under the section header rather than on the rows, which carry attendance state and would otherwise compete with it.
- Layout mirrors the unit, not the data: command elements (company HQ, Zeus) across the top; fighting platoons as **columns** with their sections stacked inside, because a roster is read *down* a platoon. 1-3 Support takes a double-width column with its sections in two, since it is six sections against an infantry platoon's four. Categories are fixed labels — deliberately **not** collapsible, since folding a platoon away hides the gaps the board exists to show.
- `SectionCard` and `SlotRow` are **memoised**, and every callback the board hands them (`onClaim`, `onMenu`, `onAddRole`) is stable — the last takes the section as an argument rather than being closed over per card, precisely so it can be. ~100 rows each carry a dnd-kit droppable, a draggable and a motion projection node, so re-rendering the lot because a presence pill changed was a repeating quarter-second task in the profiler. `AttendanceBoard` itself is memoised too, since the editor above it re-renders for reasons that have nothing to do with attendance.
- **The whole slot row is the drag handle**, not a grip — the row is the thing being moved, and a 12px target for the board's most common action was the wrong trade. Buttons inside swallow pointer-down *and* keydown so they still work.
- "Filled" means `held` + `backfilled` — actually playing — everywhere it appears (stats bar, category header, section header). Counting occupants instead produced "5 / 5 filled" on a section where nobody had replied.

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
- `getNextThreshold(currentRankAbbr, points): {abbr, minPts} | null` — the next rank *up* the track and the points it wants. `getSuggestedRank` answers "what have they earned"; this answers "what are they working toward", which is what a progress bar needs. Measures from whichever is further along, the rank held or the rank the points already justify, so a member pending promotion is not shown aiming at a target they cleared weeks ago. Skips `minPts: null` entries — a billet-only rank is not reachable by accumulating points, so offering it as a target would promise something the numbers cannot deliver. Drives the `Meter` on `MilpacEditor`'s Billet Points card.

### lib/military/milpac-profile.ts
- `resolveMilpacProfile(member: User, orbatEntry: OrbatEntry|null)` — central name/rank/accent resolver reused across milpac page, credits, ORBAT: strips `[...]` decorations from Discord nickname, parses rank-prefix vs display name, resolves `fullRank` via `rankNameFromAbbr` (falling back through promotion history), computes `accent` via `ensureVisible(member.hexAccentColor)`. Returns `{accent, displayName, name, rankAbbr, fullRank, callsign, orbatEntry}`.

### lib/military/milpac-slug.ts
- `milpacSlug(name)` — the URL form of an ASOT name: NFKD-fold accents, lowercase, non-alphanumerics to single hyphens, trimmed. `''` means the member claims no name URL.
- `toSlugCandidate(member)` / `SlugCandidate` — the minimal shape a member exposes to claim a slug. Uses `resolveMilpacProfile(member, null).name`; the ORBAT entry only affects `callsign`, so the lookup is skipped.
- `buildSlugIndex(candidates)` — `slug -> member id`, **only for slugs claimed by exactly one serving member**. Discharged and skeleton accounts never claim. On the live roster 37 slugs are contested and 14 are contested by two or more serving members (`goose` is three people), so a contested name deliberately resolves to nobody rather than guessing.
- `canonicalSegment(member, index)` — the member's name slug if they hold it, else their Discord username.
- `resolveSegment(segment, members)` — `{member, canonical}` or null. Username first (unique by construction, and verified never to shadow another member's name slug), then name slug. Used by the milpac page and its `opengraph-image.tsx`. Unit-tested in `milpac-slug.test.ts`.

### lib/loadout/parse.ts
- `parseLoadout(raw): ParsedLoadout` — parses an ACE arsenal export (ARMA's *positional* `getUnitLoadout` array — slot 6 is headgear because it is sixth — but valid JSON, so no SQF parser needed) into a render-ready shape: `primary`/`launcher`/`handgun`/`binocular` (`WeaponSlot`: className + muzzle/pointer/optic/bipod + up to 2 magazines), `uniform`/`vest`/`backpack` (`Container`: className + `Stack[]` contents), `headgear`/`facewear` (className or null), `assigned` (map/gps/radio/compass/watch/nvg). Throws `LoadoutParseError` (with a user-facing message) on invalid JSON, non-array input, or a slot count other than 10. Nothing here is stored — `MemberLoadout.raw` is the record; this runs at render, so improving the parser improves every existing loadout with no migration.
- `LoadoutParseError` — `Error` subclass, `name: 'LoadoutParseError'`.

### lib/loadout/select.ts
- `pickLoadoutId(raw, loadouts): string | null` — which kit the `/kits/<id>` path segment selects, falling back to the member's default and then to the first of the list for anything unrecognised, absent or repeated; `null` only when the member has none. Viewing is deliberately separate from the default — the old `<select>` switcher set `isDefault` just to change what was on screen. Kept in `lib/` so it can be unit-tested; `select.test.ts`.

### lib/loadout/limits.ts
- `MAX_NAME` (40), `MAX_DESCRIPTION` (160), `MAX_RAW_BYTES` (65536), `MAX_PER_MEMBER` (12) — bounds on what a member may store per kit, imported by both loadout API routes and the import form so the field that stops typing and the value the server truncates cannot drift. Replaces two separate copies of `MAX_NAME` that lived in the two route files.

### lib/loadout/kit-icons.ts
- `KIT_ICON_PATHS` — 19 role-shaped badges a member can pick for a kit (`kit`, `rifle`, `crosshair`, `medic`, `radio`, `explosive`, `grenade`, `binoculars`, `wrench`, `rocket`, `shield`, `star`, `chevron`, `parachute`, `wings`, `skull`, `compass`, `flag`, `helmet`), as 24x24 `currentColor` path data — same grid and convention as `components/loadout/icons.tsx`. Path data lives in `lib/` rather than beside the component because both loadout API routes validate against it and must not pull JSX into a route handler.
- `KitIconKey`, `KIT_ICON_KEYS`, `DEFAULT_KIT_ICON` (`kit`) — the key type, the picker's order, and what an absent or unrecognised value renders.
- `isKitIcon(v)` / `kitIcon(v)` — narrow, or resolve-with-fallback. The check is against the **key list**, not `key in KIT_ICON_PATHS`: the value arrives in a JSON body and becomes a `Record` lookup on a public page, so `__proto__`/`constructor` must fall through to the default rather than resolve. Unit-tested in `kit-icons.test.ts`.

### lib/loadout/summary.ts
- `summariseLoadout(kit: ParsedLoadout): KitSummary` — the headline of a kit for the `/kits` shelf: primary weapon + its attachments in arsenal order, headgear/uniform/vest/backpack classnames, and `itemCount`. Stacks count by multiplicity (six magazines is six items, not one) and worn/held gear counts too, so a kit that is all worn gear and no cargo does not read as empty; a non-finite stack count is skipped rather than turning the card's count into `NaN`. Pure; unit-tested in `summary.test.ts`.

### lib/loadout/kit-line.ts
- `formatKitLine(name, summary: KitSummary): string` — a kit compressed to the Discord dossier card's single foot line: kit name, primary weapon, vest, item count, `·`-joined, each segment truncated on its own bound (`MAX_CARD_NAME` 28, `MAX_ITEM` 32) and the assembled line clamped again at `MAX_LINE` (100, derived from the card's own pixel width) so an unbounded pasted item name or a huge item count can't push the line off the card. Pure; unit-tested in `kit-line.test.ts`.

### lib/military/milpac-dates.ts
- `parseMilpacDate(raw): Date | null` — the one parser for the free-form dates on a milpac (`enlistedDate`, `promotions[].date`, `awards[].date`). They arrive as "15 August 2020", "04 October 2024", "27/09/2024" and "27-09-2024"; the day-first forms are parsed explicitly because `new Date('04/10/2024')` reads that as **10 April**, not 4 October. An impossible day (`31/02`) is rejected rather than rolled forward, and anything unusable returns null — never today's date, because these are printed on certificates as historical fact. Used by the certificate route and the profile's `durationSince`; unit-tested in `milpac-dates.test.ts`.

### lib/military/milpac-tabs.ts
- `MILPAC_TABS` — the three sections a milpac is split into (`overview`, `record`, `kits`) with their labels and **path segments**. The split is conceptual: who the member is, what they have earned, what they carry.
- `MilpacTab` — union of the keys.
- `tabPath(tab)` — the path a section lives at relative to `/milpacs/<segment>` (`''`, `/record`, `/kits`). The default section owns the bare URL, so its segment is empty.
- `tabSuffix(tab, kitSegment?)` — what a canonical-segment redirect must carry so a shared link to a section lands on it; appends the kit only under `kits`, and URL-encodes it (it arrives as a path segment and goes straight back out in a `Location` header).
- **Why paths, not `?tab=`:** the App Router silently aborts a navigation that changes only the query string on the same path — the segment tree is unchanged, so it cancels the RSC fetch and commits nothing, with no console error and a healthy-looking 200 in the network panel. Measured against production, a `?tab=` link needed 2–8 clicks to commit while ordinary cross-path links committed on the first, every time. Unit-tested in `milpac-tabs.test.ts`.

### lib/loadout/names.ts
- `resolveItemName(className)` — Arma classname to readable name: hand overrides, then the generated dictionary, then `prettifyClassName`. Never returns empty.
- `prettifyClassName(className)` — the fallback: strips vendor prefix and type infix, splits camelCase, title-cases. Unit-tested in `names.test.ts`.
- `itemMeta(className)` — `{name, root, type, mod}` from the dictionary, or null. The classifier's input.
- `components/loadout/kit-icons.tsx` — `KitIcon` (renders a `KitIconKey` from the paths above) and `UiIcon` (marks for the kit controls: copy, trash, import, check, close, pencil, eye, open). Both stroke `currentColor`, so a button's own colour — including the danger red and the published green — carries into its icon without the icon knowing about it.
- `generated/arma-items.json` — 31,582 entries, `{class: [name, root, ItemInfo.type, sourceMod]}`, ~2.7MB, **server-side only**. Rebuild with `node scripts/build-item-dictionary.mjs` from `generated/itemdump.txt`, which itself comes from running `lib/loadout/dump-items.sqf` in-game and extracting the `ITEMDUMP` block from the `.rpt`.

### lib/loadout/tags.ts
- `KIT_TAGS` — the fixed vocabulary of what a kit is *for* (Role/Weapon/Vehicle/Setting groups: `staff`, `sc`, `medical`, `mg`, `pilot`, `night`, `cqb`, etc.), `{key, label, group}`. A closed set rather than free text, since tags are a shelf filter control and free text would give thirty spellings of "medic". `KitTag` — union of the keys. `KIT_TAG_KEYS` (declared order — what chips render in, everywhere), `KIT_TAG_LABELS`, `KIT_TAG_GROUPS` (for the picker's headings), `MAX_KIT_TAGS` (4).
- `isKitTag(v)` — key-list check (not `key in KIT_TAG_LABELS`) so `__proto__`/`constructor` are rejected like any other unrecognised value, since a tag becomes a `Record` lookup on a public page.
- `normaliseTags(input)` — the single gate every write goes through: filters to known keys, dedupes, returns them in declared order, capped at `MAX_KIT_TAGS`. Deterministic regardless of the order the owner clicked them in. Used by both loadout API routes and the shelf page. Web-only (`apps/web/lib`, not the repo-root `lib/`) — the bot has no concept of a kit. Unit-tested in `tags.test.ts`.

### lib/loadout/rating.ts
- `Stars` — `1 | 2 | 3 | 4 | 5`. `isStars(v)` — whole-number 1-5 narrow, what the rating route validates a request body against.
- `summarise(stars: number[])` — plain mean (2dp) + count. No longer called by the rating route itself (which maintains the denormalised fields by atomic delta instead — see `app/api/loadouts/[id]/rating/route.ts`), but still exported and unit-tested; kept rather than deleted since removing an unused-but-harmless export is churn.
- `RATING_PRIOR_WEIGHT` (3) / `RATING_PRIOR_MEAN` (3.5) — how much evidence a kit needs before its own mean is trusted, and what it's assumed to be until then.
- `weightedScore(avg, count)` — the number "Top rated" sorts on, never the number shown: pulls a sparsely-rated kit toward the prior, releasing it as ratings accumulate, so one 5-star rating can't outrank a well-supported 4.8. `formatAvg(avg, count)` — one decimal, or `NO_RATING` (`—`) for an unrated kit. Pure; unit-tested in `rating.test.ts`.

### lib/loadout/shelf.ts
- `ShelfSort` — `'newest' | 'rated' | 'copied' | 'name'`. `SHELF_SORTS` — the four options with their labels, in menu order. `KITS_PER_PAGE` (24).
- `ShelfCard` — the subset of a card these functions read (`id, name, tags, updatedAt, ratingAvg, ratingCount, ratingScore, copyCount, haystack`); every function is generic over `T extends ShelfCard` so the page's fuller `CardData` survives.
- `matchesQuery(card, query)` — every whitespace-split term must appear in `card.haystack` (substring, not prefix, so "mg" finds both "MG" and "LMG"). `matchesTags(card, tags)` — AND, not OR. `sortCards(cards, sort)` — returns a new array (memo-safe), recency as the tiebreak on every sort. `pageCount(total, perPage?)` / `paginate(items, page, perPage?)` — never zero pages, clamps an out-of-range page rather than trusting it. `tagCounts(cards)` — the tags worth offering as filter chips (at least one match), with counts, in `KIT_TAG_KEYS` order.
- Pure and React-free by design — the shelf component (`app/(landing)/kits/shelf.tsx`) is a thin state layer over these. Unit-tested in `shelf.test.ts`.

### lib/military/accent.ts
- `resolveMemberAccent(member): string` — **the only thing that should read `profileAccent` or
  `hexAccentColor` directly.** Priority: the member's own pick (set on their milpac) → their Discord
  accent → `DEFAULT_ACCENT` (`#db001d`). Discord's `#000000` counts as *unset*, not as black — the
  login callback stores no-accent that way, and treating it as a colour is what used to render those
  members grey via `ensureVisible`. A member's own pick still passes through `ensureVisible`, since
  every surface using this paints on near-black.
- `normaliseHex(value)` — `#rrggbb` lower-cased or null. Used by `PUT /api/me/accent` to validate
  before storing: the value lands in a `style` attribute on every surface showing that member.
- Consumers: `lib/military/milpac-profile.ts`, the /milpacs roster card, `components/nav/AccountMenu`,
  `app/api/me/token`, the landing `Hero`. They each resolved it themselves before and disagreed —
  two applied the legibility floor, one didn't, and the fallbacks were a mix of `#db001d` and
  `var(--red)`. Unit-tested in `accent.test.ts`.

### lib/uploads/image-limits.ts
Client-safe (no sharp), so upload controls can quote the limit they enforce.
- `MAX_UPLOAD_BYTES` (20MB) — the hard ceiling. Generous deliberately: a phone photo is routinely 5-15MB and its owner has done nothing wrong.
- `MAX_INPUT_PIXELS` (300MP) — decompression-bomb guard, not a quality one. Has to sit above any real camera while refusing the gigapixel images a small crafted file expands into.
- `ImagePreset` + `COVER_PRESET` / `BIO_PRESET` / `PATCH_PRESET` / `OPERATION_PRESET` — per-upload box, stored ceiling, `stillFormat` (`jpeg` | `preserve`) and animation policy. **`preserve` is not cosmetic:** ORBAT patches are insignia on a transparent ground, so JPEG would put a solid box behind every patch; operations store files by extension, so changing format would leave name and bytes disagreeing.
- `GALLERY_IS_EXEMPT` — the gallery is the one upload deliberately stored as-is, since it is the only place whose purpose is the picture itself.

### lib/uploads/image.ts
- `normaliseImage(input, preset, opts?)` — bounds and re-encodes an upload; returns `{ok:true, image}` or `{ok:false, error}` where the error is written to be shown to the member verbatim. **Every upload is re-encoded, including one that would already have fit** — one invariant for every file on disk beats a long tail of individually-fine uploads. Compresses down a quality ladder, then shrinks dimensions and repeats, until it is under the preset's ceiling.
- `sniffImageMime(buf)` — magic bytes, never the filename or client-supplied content-type. The cover that caused the incident was a **JPEG stored as `.png`**.
- **Why it exists:** the upload routes wrote whatever bytes arrived. A 16320x7612 / 13.2MB cover (124MP, ~500MB of bitmap decoded) made /milpacs unusable and meant a ~500MB server allocation per OpenGraph card. `MAX_COVER_BYTES` (25MB) never caught it — bytes alone were the wrong measure.
- **`failOn: 'none'` is load-bearing:** that same file is a JPEG with a recoverable defect (`1 extraneous bytes before marker 0xd2`). Browsers render it fine; libvips aborts by default, which would have meant refusing a file the member can plainly see working.
- sharp, not a new dependency — it is already here and is what Next uses for image optimisation. It reads dimensions without decoding, streams the resize, and resizes animated GIFs without flattening them. Unit-tested in `image.test.ts` (sharp 0.33.5 cannot *construct* a multi-frame GIF, so the animated fixtures are single-frame — noted in the test).

### lib/military/milpac-cover.ts
- `coverPath(memberId)` / `hasCover(memberId)` — the member's uploaded cover photo at `storage/uploads/cover/{id}.png`. Used by the milpac page (banner) and its `opengraph-image.tsx` (share-card ground). `app/api/uploads/cover/route.ts` still writes via its own cwd-relative string.
- `coverIds(): Set<string>` — every id with a cover, from one `readdirSync`. What the /milpacs roster uses: `hasCover` is right for one member and wrong for 163, where it becomes 163 filesystem questions to answer one. Missing directory yields an empty set rather than throwing.
- `animatedCoverIds(ids): Set<string>` — which of those covers are GIFs, by reading six magic bytes per file. Needed because the upload route writes every cover as `{id}.png` and served it as `image/png` whatever was uploaded, so the extension says nothing and browsers sniff and animate the real format regardless. GIF only (the format members actually upload); animated WebP/APNG would need real container parsing. `coverIds()` additionally filters to snowflake-shaped ids, since they reach a CSS `url()`.
- `fitCover(srcW, srcH, boxW, boxH): CropRect` — `object-fit: cover` as a centred source rectangle. Pure; unit-tested in `milpac-cover.test.ts`.
- `readCoverImage(memberId, box?): Promise<string|null>` — decodes the cover with `@napi-rs/canvas` (which sniffs the real format, since the upload route names every file `.png` whatever it was), crops via `fitCover`, re-encodes to a JPEG data URI at the card's 1300×630. Data URI because satori resolves neither relative paths nor `background-image: url()`; re-encoded because covers are stored unresized and base64 inflates by a third. Returns `null` on any failure — the OG route must degrade to its drawn card, never 500. `MAX_COVER_BYTES` (25MB) bounds what reaches the decoder.

### lib/military/points.ts
- `OP_POINTS` / `DEPT_POINTS` — point-value constants for operation attendance types and department actions.
- `calculateOpPoints(ops: {date, confirmedAt}[]): number` — ISO-week-grouped op scoring (1 op/week = 2pts, 2+ = 3pts cap); undated ops score 2pts independently.
- `MilpacImportCounts` interface — full shape of raw counts used for point calculation (ops, dept actions, awards, quals, manual J4 adjustment, discipline deductions).
- `calculatePromotionPoints(counts: MilpacImportCounts): number` — sums op points + dept action points (with per-3/per-5 floor divisions for J1 interviews / J5 milpacs/PR) + award/cert point lookups + manual J4 points − discipline deductions, floored at 0.

### lib/military/milpac-stats.ts
- `loadConfirmedOps(memberId): Promise<ConfirmedOp[]>` — a member's confirmed attendance records joined to their (non-soft-deleted) operations, deduped by operation id. Imports `lib/mongo` lazily so the pure helpers below (and the tests that exercise them) don't require `MONGO_URI` — same reason `milpac-cover.ts` defers `@napi-rs/canvas`.
- `resolvePromotionPoints(member, confirmedOps): number` — promotion points recalculated live from stored billet counts + confirmed op attendance, matching the editor's own arithmetic; falls back to the stored `milpac.promotionPoints` for members with no billet counts on record.
- `resolveEnlistedDate(member): string | null` — stored `milpac.enlistedDate`, else the Discord guild join date, else null.
- `durationSince(raw): string | null` — a free-form milpac date to `2.4Y` / `7M` service duration via `parseMilpacDate`; unparseable or future dates yield null rather than `NaN`. Extracted from the profile page for reuse by the Discord dossier card; unit-tested in `milpac-stats.test.ts`.

### lib/military/card-images.ts
- `toCardImage(bytes, box: ImageBox): Promise<string | null>` — decodes a rendered uniform/medal-box PNG, cover-crops it to `box` via `fitCover`, re-encodes as a PNG data URI for satori (which takes images only as data URIs). Re-encoding at draw size, not full size, is what keeps a dossier card's embedded strings small. Returns null on any failure — the dossier degrades to no artwork rather than failing the whole card. Unit-tested in `card-images.test.ts`.

### lib/military/dossier-data.ts
- `DOSSIER_SIZE` (`{width: 1400, height: 860}`) — the Discord dossier card's canvas size.
- `buildDossierData(member, allMembers): Promise<DossierData>` — assembles everything the dossier card draws: identity/accent via `resolveMilpacProfile`, status via `deriveStatus`, the five stat-strip figures via `milpac-stats.ts`, uniform/medal-box artwork via `generateMilpacForUser` + `toCardImage` (optional — a render-service outage still yields a card), cover photo via `readCoverImage`, kit line via `pickCardKit` + `formatKitLine` (only the member's own **shared** loadouts are queried, never private ones), and the card's link buttons — one per `MILPAC_TABS` entry, Kits dropped when there's no public kit, paths built off `canonicalSegment` against a slug index built from `allMembers`. Separate from the `DossierCard` component so the card stays a pure function of data — satori can't await.

### lib/military/dossier-card.tsx
- `DossierCard({data: DossierData})` — the Discord dossier card itself, drawn for satori (`next/og`'s `ImageResponse`): cover + three scrims + accent sun + corner tick shared with the OpenGraph share card, a ridgeline fallback when there's no cover, identity block (name size steps down as the name gets longer), uniform/medals artwork, the five-stat strip, and an optional kit-line foot. Not a widening of `opengraph-image.tsx`, which is the link preview for every milpac URL pasted anywhere — this is a separate layout for a separate consumer.

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
- `applyOrbatMove({fromPos, toPos, toIsReservist, targetUserId})` — applies an approved ORBAT move-request: handles reservist→section, section→reservist (finds/creates a vacant `activeReservist` slot), and section→section cases; clears source, sets destination, and fires `syncOrbatDiscordRoles` for both sides (settled, errors logged not thrown). Also calls internal `swapRoleDiscordRoles()` — resolves `fromPos.roleId`/`toPos.roleId` against `Db.orbatRoles` and stacks Role-level `discordRoleIds` grant/revoke on top of the section-level sync — and `swapRoleTsGroups()`, the same diff/stack pattern for `OrbatRole.tsGroupIds` via `applyTsServerGroups()` (`lib/teamspeak/groups.ts`). In the section→reservist branch, the destination `roleId` is resolved once — a vacant slot's own `roleId` if it's already set (nullish-coalesced, not just truthiness-checked on the slot itself), otherwise `ensureReservistRole()` (`lib/orbat/reservist-role.ts`) both for a brand-new slot AND for a reused vacant slot whose stored `roleId` was still stale `null` (backfilled onto the slot's own document, not just used transiently for the grant calls) — and that single resolved value drives the position's `roleId`, plus the `swapRoleDiscordRoles`/`swapRoleTsGroups` grant calls, so reservists always land with a real grant vehicle regardless of the slot's prior state.

### lib/orbat/chainOfCommand.ts
- `ChainNodeRef` — `{id: ObjectId, kind: 'role'|'group'}`, a pointer into either `Db.orbatRoles` or `Db.orbatRoleGroups`.
- `wouldCreateCycle(child, proposedParent): Promise<boolean>` — walks `proposedParent`'s ancestor chain (following `parentRoleId`/`parentGroupId`, hopping between the roles and groups collections as needed, 50-level depth guard) looking for `child`. Used by both the roles PATCH and groups PATCH routes before applying a new chain-of-command parent, to reject anything that would create a cycle.

### lib/orbat/categoriesOverlap.ts
- `categoriesOverlap(a, b): boolean` — two category-scope arrays overlap if either is empty (unscoped = matches everything) or they share an element.
- `rolesConflict(a, b): boolean` — `{categories, tag}` conflict check used by the roles POST/PATCH routes: true only if `categoriesOverlap()` AND the two `tag`s match (untagged counts as its own "no tag" bucket). Lets two `OrbatRole` entries share a `name` either via non-overlapping `categories` (e.g. two "Section Commander" Roles scoped to different platoons) or, within an overlapping scope, via distinct `tag`s (e.g. "Section Commander" tagged "MED" vs. "VIC").

### lib/orbat/member-sync.ts
- `computeMemberSyncReport(): Promise<MemberSyncReport>` — builds the live Discord/TeamSpeak grant-drift report backing `GET /api/admin/orbat/member-sync` and the Member Sync tab; see that route's entry in `a-admin-api.md` for the full computation. Probes TS connectivity once via `getConnection()` and skips TS diffing (reporting `tsAvailable: false`) rather than false-positive drift if it's down.
- `applyMemberSyncFixes(userIds?): Promise<MemberSyncApplyResult>` — backs `POST /api/admin/orbat/member-sync/apply`; re-runs `computeMemberSyncReport()` fresh and grants/revokes each target member's diff in batches of 5. Result counts (`discordGranted`/`discordRevoked`/`discordFailed`/`tsGranted`/`tsRevoked`/`tsFailed`) reflect actual `Promise.allSettled` outcomes, not attempts.
- Interfaces: `MemberSyncEntry`, `MemberSyncReport`, `GrantDetail`, `MemberSyncApplyResult`.

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

### lib/teamspeak/groups.ts
- `applyTsServerGroups(userId, action: 'add'|'remove', groupIds: number[]): Promise<{skipped, reason?}>` — shared low-level primitive: resolves the member's `teamspeak.cldbid`, checks `checkTsGate`, then runs `servergroupaddclient`/`servergroupdelclient` for each ID via `getConnection()` (the persistent connection from `lib/teamspeak/cache.ts`). Non-fatal — returns `skipped:true` (never throws) if the member has no linked TS account, is dev-mode-blocked, or the TS server is unreachable. Used by both `syncOrbatTeamspeakGroups` (section-level) and `swapRoleTsGroups` in `lib/orbat/move.ts` (Role-level).
- `getClientServerGroupIds(cldbid): Promise<number[]>` — returns a client's actual current TS server group IDs via `serverGroupsByClientId()`. Returns `[]` (never throws) if TS is unreachable; used by `POST /api/admin/members/sync-dept` to read live state for its full reconcile.

### lib/teamspeak/orbat-sync.ts
- `syncOrbatTeamspeakGroups(userId, action, category, sectionTitle): Promise<{skipped, reason?}>` — mirrors `syncOrbatDiscordRoles` but for TS server group IDs (`OrbatSectionMeta.tsGroupId`): resolves both section-level and category-level `tsGroupId` from `Db.orbatSectionMeta`, then delegates to `applyTsServerGroups()`.

### lib/teamspeak/tags.ts
- `SPACER` — canonical TS visual-divider group names (`~~~ CITATIONS & AWARDS ~~~` etc.).
- `TS_SPACER_NAMES: Set<string>`.
- `TS_GROUP_MAPPINGS: TsGroupMapping[]` — the full TS server-group → website-concept mapping table (award/operation/certification/rank/administration/unit/spacer/ignore categories), each entry carrying required spacer groups and links into `AWARDS`/`CERTIFICATIONS`/`RANKS_FLAT` labels/abbrs. Very large table (hundreds of rank/award/cert/campaign-medal entries).
- Lookup functions: `mappingForTsGroup(tsName)`, `getSpacersForGroup(tsName)`, `tsGroupNameForRank(abbr)`, `tsGroupNameForAward(label)`, `tsGroupNameForCert(certLabel)`, `tsGroupNameForOperation(operationName)`.

### lib/cron-auth.ts
- `verifyCronSecret(request: NextRequest): boolean` — checks `Authorization: Bearer {CRON_SECRET}` header. Used by every route under `app/api/cron/`.

### lib/diagnostics/cpu-profiles.ts
- Shared file store for captured CPU profiles, used by both `app/api/admin/diagnostics/cpu-profile/route.ts` and its `[filename]/` download route so the name a capture writes cannot drift from the name a download will serve (they were two hand-copied regexes before). Storage root overridable via `DIAGNOSTICS_STORAGE_ROOT` for unit tests — same pattern as `BACKUPS_STORAGE_ROOT` in `lib/backups.ts`. Covered by `lib/diagnostics/cpu-profiles.test.ts`.
- `DIAGNOSTICS_DIR` — absolute path to `storage/diagnostics/`.
- `cpuProfileFilename(date): string` — `cpu-<ISO with : and . replaced by ->.cpuprofile`.
- `isValidCpuProfileFilename(name): boolean` / `cpuProfilePath(name): string | null` — anchored pattern match; doubles as the download route's path-traversal guard, since nothing containing `/`, `\` or `..` can match.
- `listCpuProfiles(): CpuProfileFile[]` — every profile on disk, newest first, with `capturedAt` decoded out of the filename and `sizeBytes`. Returns `[]` when the directory does not exist yet (normal before the first capture).

### lib/diagnostics.mjs
- Lightweight, always-on production diagnostics for event-loop stalls. Plain `.mjs` (not `.ts`) so it can be imported directly by `server.mjs`, which runs via `node server.mjs` with no build step; an ambient declaration at `types/diagnostics.d.ts` types the `@/lib/diagnostics.mjs` import for TypeScript route files.
- `startEventLoopWatchdog(thresholdMs?, checkIntervalMs?)` — starts a `perf_hooks.monitorEventLoopDelay`-based periodic check (default threshold `EVENT_LOOP_LAG_THRESHOLD_MS` env var or 1000ms, checked every 2000ms); on a lag sample over threshold, logs `⚠ [event-loop] lag=Xms in-flight=[...]` naming every currently in-flight request/job and its running duration. Called once in `server.mjs` right before `httpServer.listen(...)`.
- `trackJob(label, fn): Promise<T>` — wraps an async function so it's visible in the in-flight registry for its duration regardless of outcome. Used to wrap every `server.mjs` cron trigger (`cron:calendar-reminders`, `cron:task-reminders`, `cron:operations`, `cron:dev-check-escalation`, `cron:backups`, `cron:teamspeak-snapshots`, `cron:teamspeak-cache`, `cron:image-cleanup`) and the fire-and-forget refresh in `app/api/cron/teamspeak-cache/route.ts` (`cron:teamspeak-cache-refresh`).
- `registerInFlight(label): () => void` — registers `label` as in-flight, returns an idempotent deregister function. `server.mjs`'s `httpServer` request handler calls this per-request (`METHOD /url`), deregistering on the response's `finish`/`close` events.

### lib/billetMastersheet.ts
- `FieldSource` type (`'website'|'imported'|'calculated'`), `FieldSourceDef` interface, `FIELD_SOURCE_MAP: FieldSourceDef[]` — documents which Billet Mastersheet fields originate from the website DB vs. are imported-only vs. calculated — used to render provenance in the mastersheet UI.
- Interfaces: `EmailEntry`, `BilletRow` (the full flattened per-member mastersheet row shape used by the J4 Billet Mastersheet feature).

### lib/backups.ts
Content-addressed, deduplicating backup system via [restic](https://restic.net/), shelled out through `child_process.execFile` (never `exec`). Two independent repos — `storage/db-backups/` (EJSON dumps) and `storage/media-backups/` (live `gallery`/`uploads` trees) — plus a shared `storage/backup-meta/` status/config pair. Replaces the old full-copy-zip `lib/snapshots.ts`.
- Constants: `DB_REPO`, `MEDIA_REPO`, `META_DIR`, `STATUS_FILE`, `CONFIG_FILE`, `GALLERY_DIR`, `UPLOADS_DIR`, `DEFAULT_BACKUP_CONFIG` (`keepHourly: 48, keepDaily: 14, keepWeekly: 8, keepMonthly: 12`).
- `resticPath()` — resolves the restic binary: `RESTIC_PATH` env override, else the bundled `apps/web/bin/restic[.exe]` (provisioned by `scripts/ensure-restic.mjs`), else bare `'restic'` on `PATH`.
- `readStatus()/writeStatus(s)` — persisted `{state:'idle'|'backing-up'|'reverting', startedAt?, message?, error?, stage?, plan?}`; auto-resets stale (>60min) status on read (crash recovery). `plan` is the ordered `BackupStage[]` the running operation will pass through and `stage` is the one running now, so the UI can render checkpoints rather than one bar. **`startedAt` is stamped once when the operation begins, never per stage** — writing it on each status update reset the elapsed time the progress bar derives from, which is why the bar restarted several times per backup.
- `readConfig()/writeConfig(c)` — persisted `{autoEnabled, keepHourly, keepDaily, keepWeekly, keepMonthly}`.
- `runDbBackup()` — streamed EJSON dump per collection to a temp dir, `restic backup` + `restic forget --prune` (tiered retention) against `DB_REPO`.
- `runMediaBackup()` — `restic backup` straight against the live `gallery`/`uploads` dirs (no temp copy) + `forget --prune` against `MEDIA_REPO`.
- `clearStaleLocks(repo)` (private) — runs plain `restic unlock` before every `forget --prune`, the only exclusive-lock operation here. restic clears stale locks *only* in its `unlock` command, never while acquiring one, and a lock records the hostname/PID of its creator — which in Docker is the container ID, so a container that dies mid-run leaves a lock no later container can ever prove is dead. Combined with `--retry-lock 5m` that presented as a backup hung at "Pruning old backups…". Deliberately not `unlock --remove-all`, which would also delete the lock of an operation genuinely still running.
- `runSafetyBackup(): Promise<void>` — takes an immediate `db` + `media` restic backup tagged `pre-restore` (in addition to the usual tag) before every restore; throws on failure, prefixed `Safety backup failed: ...` so it's distinguishable from a failure in the restore that follows, and callers must let it propagate — a restore that cannot be undone is exactly what this prevents. Dumps to a unique `mkdtemp()` directory rather than `runDbBackup()`'s fixed one, so a concurrent hourly backup can never delete the dump out from under it (which restic reports as the tolerated exit 3, i.e. a silent partial snapshot). `resticForget`'s `--keep-tag pre-restore` exempts these snapshots from every retention tier — real one-way repo growth, bounded by how often people restore rather than by dedup.
- `runAllBackups()` — runs both sequentially (shared status file), each side's failure caught independently. Skips silently if the module-private `currentOperation` guard is held — an in-process guard, taken synchronously before the first await, that covers backups *and* restores and closes the check-then-act race the routes' `readStatus()` pre-check leaves open. `revertToPoint()`/`applyUploadedZip()` take the same guard but **throw** (`Another backup or restore operation is already in progress`) instead of returning quietly, since they're fired off in the background by their routes. The guard holds an identity `symbol` rather than a boolean so a cancelled operation, which is still unwinding after `cancelOperation()` killed it, can't release the guard or overwrite the status of the run that replaced it (`writeOwnedStatus`/`endOperation` compare tokens first).
- `cancelOperation(): Promise<{aborted: number}>` — the Force Reset escape hatch behind `POST /api/backups/cancel`. Kills every tracked in-flight restic child (which unwinds the owning operation through its own catch/finally), releases the guard, and writes `idle`. Returns how many processes it stopped. Rewriting the status file alone — what it used to do — left the operation running and the guard held, so the next create was accepted by the route and then silently skipped.
- `listBackups(): BackupPoint[]` — merges both repos' `restic snapshots --json` output into hour-bucket points; a bucket can have either or both sides present. Each side carries `dbSizeBytes`/`mediaSizeBytes` from restic's own snapshot `summary.total_bytes_processed`, when the restic version that wrote it recorded one. `BackupPoint.isSafety` is set when either side's snapshot carries the `pre-restore` tag.
- `resticRestore(repo, snapshotId, target)` (private) — restores each of the snapshot's own recorded source paths into `<target>/<last path segment>` using restic's `<snapshotId>:<subfolder>` form, via `snapshotSourcePaths()` + `toResticTreePath()` (restic's subfolder syntax needs forward slashes with a Windows drive letter as the first node: `C:\Users\x` → `/C/Users/x`). Restoring a snapshot *whole* makes restic recreate the entire original absolute path under the target — which for a Windows-created snapshot means recreating a `C:\Users` node, applying the real `C:\Users` ACL to it, then failing to set its timestamp and exiting fatal. That broke every download and every revert of a snapshot taken on a Windows dev machine while the file data itself restored fine. Covered by `backups.roundtrip.test.ts`.
- `revertToPoint(point)` — takes a safety backup first via `runSafetyBackup()` (aborts, restoring nothing, if that fails), then restic-restores whichever side(s) are present to temp dirs, drops+recreates every DB collection from EJSON (recreating the two critical `orbat_positions` indexes), copies restored media over `gallery`/`uploads`.
- `BackupPart` (`'database' | 'gallery' | 'uploads'`) + `parseBackupParts(raw)` — the separately restorable parts of a backup, and the parser the three routes share. The database is its own repo; gallery and uploads are distinct source paths inside the media snapshot, so all three restore independently. Absent input means every part (the historical behaviour); **anything malformed returns null so the caller can reject it**, because these values decide what a restore overwrites and a fallback to "everything" would silently widen a gallery-only restore into one that drops the database. Covered by `backups.parts.test.ts`.
- `openDownloadZipStream(point, parts?)` — restores a point to a temp tree and returns a web `ReadableStream` of a zip built from it on the fly. Replaced `buildDownloadZip()`, which restored (7GB on the current media set), copied into a staging tree (another 7GB), then zipped that to disk (another ~7GB) — ~21GB of temp space, none of it reaching the caller until it was all done. Peak is now the restore alone. The stream owns the temp tree and deletes it via `stream.finished()` on end, error, or client abort — never sooner, since `archiver` reads lazily as the response drains. `assertRoomForRestore()` prechecks free space (`statfs(tmpdir())` vs restic's own `total_bytes_processed`, skipped when either is unavailable) so a shortfall is an upfront error rather than a half-sent download.
- `createBackupArchiveStream({dbDumpRoot, galleryDir, uploadsDir})` — builds the `{db-source/, gallery/, uploads/}` archive from plain directories; split out from the above so the shape `applyUploadedZip()` depends on is unit-testable without restic (`backups.archive.test.ts`). Its `skipSymlinks` filter is load-bearing: `archiver.directory()` lstats entries and would emit real zip symlink entries, which `safeExtractZip()` refuses — i.e. without it the app would produce recovery zips it cannot itself restore. The staged copy this replaced dropped symlinks only as a side effect of `copyDirRecursive()`.
- `applyUploadedZip(zipPath)` — takes a safety backup first via `runSafetyBackup()` (aborts, extracting nothing, if that fails), then validated entry-by-entry extraction (rejects zip-slip paths and symlink entries — the source is an untrusted upload) of the same `{db-source/, gallery/, uploads/}` shape, then the same restore logic as `revertToPoint`. Does not feed the upload into either restic repo's history.
- `checkResticHealth(): Promise<boolean>` — `restic version` via a direct `execFile` call, bypassing the repo/password-aware wrapper deliberately (a binary-health probe shouldn't fail just because `RESTIC_PASSWORD` is unset). Surfaced in `/api/dashboard/status`, `GET /api/backups`'s `resticHealthy` field, and a chip in `BackupsTab.tsx`.
- `getStorageUsage(): StorageUsage` — live disk usage (`Db.stats()` for the database, a recursive walk for `gallery`/`uploads`) alongside each restic repo's real on-disk size (`restic stats --mode raw-data`); the media repo's gallery/uploads split is approximated from the latest snapshot's file listing (falls back to the live directory size ratio if that can't be computed). Every probe degrades independently to a zero/empty fallback rather than failing the whole call. Exposed via `GET /api/backups/storage`, rendered as two donut charts in `BackupsTab.tsx`.

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

### lib/safe-fetch.ts
- SSRF-guarded fetcher, the only outbound-fetch path in the department-quick-links feature (`lib/dept-links/favicon.ts`). Exports `isPublicIpAddress(ip): boolean` (fail-closed IPv4/IPv6 classifier: rejects loopback/private/CGNAT/link-local incl. cloud metadata/documentation/multicast/6to4/Teredo/NAT64/IPv4-mapped ranges), `assertPublicHttpUrl(input): URL` (throws `BlockedUrlError`; http/https only, no embedded credentials, default/80/443 port only, rejects `localhost`/single-label/`.local`/`.internal`/`.lan`/`.home.arpa` hosts and non-public IP literals), `safeFetch(url, opts): Promise<SafeFetchResult>` (manual redirect handling with full per-hop re-validation, hard byte cap via `readCapped`, per-hop timeout via `AbortController`), and the `BlockedUrlError`/`FetchCapError` error classes. Transport is an undici `Agent` with a connect-time guarded DNS `lookup` (validates **every** resolved address, after resolution, on every socket); rebinding-proof, unlike a pre-fetch resolve-then-check pattern. `undici` is a `serverExternalPackages` entry (`next.config.ts`).

### lib/dept-links/keys.ts
- Department-code ↔ permission-key helpers for the quick-links feature: `isDeptLinkDepartment(value): value is DeptLinkDepartment` (type guard over `DEPT_CODES`), `DEPT_LINKS_MANAGE_KEY` → `'deptLinks.manage'` (single key, department-scoped by whichever `DepartmentRole` holds it — see `hasDepartmentPermission.ts`), `leadKey(dept)` → `'departmentLeads.jX'`.

### lib/dept-links/visibility.ts
- Shared link-visibility logic, used by every route that reads `DepartmentLink` docs so the Mongo filter and the in-process check can't drift. `visibilityFilter(user): Record<string, unknown>` — Mongo filter fragment matching links with an empty/absent `visibleToRoleIds` or one intersecting the user's held `departmentRoleIds`; `$and` into a `{department}` query for non-managers (managers bypass this filter entirely at the call site). `isLinkVisible(user, link): boolean` — in-process equivalent for routes that already loaded one doc (the favicon route).

### lib/dept-links/validate-url.ts
- `validateLinkUrl(raw): LinkUrlValidation`: pure, no IO. Storage-side URL validation (length ≤2048, `http:`/`https:` only, no embedded credentials, rejects `localhost`/single-label/trailing-dot hosts unless a public IP literal via `lib/safe-fetch.ts`'s `isPublicIpAddress`). Deliberately more permissive than `assertPublicHttpUrl`; any port may be *stored* (an internal-only service on a nonstandard port is a legitimate link); the favicon-fetch pipeline is the stricter fetch-time gate. Returns `{ok: true, href, url}` (the normalised `href` is what gets stored) or `{ok: false, error}`.

### lib/dept-links/favicon.ts
- `fetchSiteMeta(url): Promise<SiteMeta>`: never throws. Bounded by an 8s overall deadline (not just per-hop timeouts), shared across every hop it makes: guarded page fetch (≤200KB, `<title>` + `<link rel~="icon">` extraction, entity-decoded/whitespace-collapsed/200-char-capped title) → guarded icon fetch (href resolved against the final post-redirect URL) → fallback to `{origin}/favicon.ico`; any step with under 500ms of budget left is skipped outright. Icon bytes are accepted only via magic-byte sniff (`sniffImageContentType`) or, failing that, a whitelisted response `Content-Type`; `faviconContentType` is therefore always exactly one of six canonical strings (`image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/x-icon`, `image/svg+xml`; `image/vnd.microsoft.icon` normalises to `image/x-icon`), never attacker-controlled text. A total failure degrades to `{fetchedTitle: host, faviconStatus: 'failed', faviconData: null, ...}` rather than throwing.

---

## 2. `types/**`: global ambient type declarations (32 files)

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

### types/loadout.d.ts
- `MemberLoadout` — `{_id, userId, name, description?, icon?, isDefault, shared, tags?, ratingAvg?, ratingCount?, ratingSum?, copyCount?, raw, createdAt, updatedAt}`. `icon` is a `KitIconKey` (`lib/loadout/kit-icons.ts`); absent or unrecognised renders `DEFAULT_KIT_ICON`. `shared` is the collection's whole privacy boundary: a shared ("public") kit appears on the owner's milpac and on `/kits` for anyone to copy, an unshared one is only ever sent to the owner's own browser — so **every read of another member's kits must filter on it**. `tags` — keys from `lib/loadout/tags.ts`, always via `normaliseTags`. `ratingAvg`/`ratingCount` — denormalised from `loadout_ratings`, what the shelf sorts/displays on; `ratingSum` is the running total they're derived from, maintained by atomic `$inc`-style delta inside the rating route's aggregation-pipeline update rather than a read-then-recompute. `copyCount` — distinct actors who copied it, from `loadout_copies`. Only `raw` (the ACE arsenal export, verbatim) is stored — `lib/loadout/parse.ts` parses at render, so improving the parser needs no migration. Web-only (not in the monorepo-root `types/`): `User` is shared with apps/bot and an unbounded per-member list has no business bloating every bot fetch of it.
- `LoadoutRating` — `{_id, loadoutId, userId, stars: 1-5, createdAt, updatedAt}`. Unique on `{loadoutId, userId}` — that index *is* the one-rating-per-member rule. A collection rather than an array on the loadout so a rating carries a value per user and the loadout document (which is sent to the browser wholesale, `raw` included) never has to remember to strip raters to stay anonymous.
- `LoadoutCopy` — `{_id, loadoutId, actorId, copies, firstCopiedAt, lastCopiedAt}`. `actorId` is a Discord id or `anon:<uuid>` for a signed-out visitor. Unique on `{loadoutId, actorId}`. `MemberLoadout.copyCount` counts documents here, not the `copies` field — the headline number is how many people took the kit, not how many times.

### types/meetingNotifQueue.d.ts
- `MeetingNotifQueueRecord` — time-delayed meeting notification queue entry (`fireAt`, `firedAt?`, `recipientUserId` xor `recipientRole`).

### types/meetings.d.ts
- `MeetingDepartment` (`j1`–`j7`).
- `MeetingAttachment`, `MeetingTask`, `MeetingAttendee` (group: `j4|dept_lead|dept_member|invited`; status incl. `confirmed_attended|confirmed_absent`), `MeetingTransferSource`.
- `Meeting` — full meeting document with lock, completion, attendance-confirmation, and notification-target fields.

### types/milpac.d.ts
- `Milpac` — minimal `{_id, title, section}` (legacy/unused shape; the real milpac data lives on `User.milpac`).

### ../../types/optional.d.ts (monorepo-root, **not** apps/web/types — shared with apps/bot)
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
- `ActionCategory` union (`orbat|calendar|member|operation|system|discord|meeting|ticket|task|training|award|teamspeak|J3|board|reminder|deptLinks`).
- `ActionLog` — audit log doc (see `lib/logAction.ts`/`lib/logs.ts`).
- `ErrorLog` — `{path, method, message, stack?, userId?, userDisplayName?, createdAt}`.
- `DiscordLogStatus` (`sent|blocked|failed`), `DiscordLog` — every outbound Discord action attempt (see `lib/discord/bot.ts`).

### types/orbat.d.ts
- `OrbatPosition` — named-slot ORBAT position (`category, sectionTitle, role, roleId, userId, sectionOrder, positionOrder, isSenior?, subTitle?`). `role` is a denormalized display-string copy of the linked `OrbatRole.name` (see `types/orbat-role.d.ts`) — kept in sync by every write path so existing plain-string consumers (public ORBAT board, `getSectionLeaders()` regex matching, milpac profile, etc.) need no changes. `roleId` is `null` for reservist positions (`activeReservist`/`inactiveReservist`, permanently outside the Roles catalog) and for any position not yet matched to a catalog Role.
- `OrbatPositionWithUser` — `+ user: {id,username,displayName,avatarURL}|null`.
- `ReservistPosition` / `ReservistPositionWithUser` — reservist slots (no named role/section).
- `OrbatSectionMeta` — per-section/category metadata (`patch` image filename, `color`, `discordRoleId`, `tsGroupId`).

### types/orbat-role.d.ts
- `OrbatRole` — predefined ORBAT position job-title catalog entry (`_id, name, categories, tag, discordRoleIds, tsGroupIds, permissions, parentRoleId, parentGroupId, createdAt, createdBy, createdByName`). `categories` scopes which ORBAT categories the Role can be assigned in (`[]` = all); two Roles may share a `name` as long as they don't have both an overlapping `categories` scope AND a matching `tag` (`rolesConflict()` in `lib/orbat/categoriesOverlap.ts`). `tag` is an optional short admin-only label (e.g. "MED", "VIC") distinguishing same-named Roles — never read by any public page, only by the admin surfaces (`RolesManagerPanel.tsx`, `ChainOfCommandPanel.tsx`, `RoleSelect.tsx`). `discordRoleIds`/`tsGroupIds` stack on top of (don't replace) the existing section-level Discord role / TeamSpeak server-group grant — actually applied on position assignment/move via `swapRoleDiscordRoles()`/`swapRoleTsGroups()` in `lib/orbat/move.ts` and the inline diff in `PATCH /api/admin/orbat/[positionId]`. `permissions` are keys from `lib/permissions-catalog.ts`'s `PERMISSION_KEYS`, consumed by `lib/orbat/hasPermission.ts`. `parentRoleId`/`parentGroupId` — mutually exclusive chain-of-command parent (Role or Group); routing/escalation metadata only, never consulted for permission checks and never implies permission inheritance; cycle-guarded via `lib/orbat/chainOfCommand.ts`'s `wouldCreateCycle()`. CRUD via `/api/admin/orbat/roles`, managed through `app/dashboard/orbat/OrbatRolesTab.tsx`; chain-of-command edited visually through `app/dashboard/orbat/ChainOfCommandPanel.tsx`.

### types/orbat-role-group.d.ts
- `OrbatRoleGroup` — a named collection of `OrbatRole`s that itself participates in the chain of command as a single node, so other Roles/Groups can target "the group" as their parent instead of one specific Role within it (`_id, name, memberRoleIds, parentRoleId, parentGroupId, createdAt, createdBy, createdByName`). `memberRoleIds` is membership metadata only — never a hierarchy edge and grants no permissions. `parentRoleId`/`parentGroupId` — same mutually-exclusive chain-of-command-parent shape as `OrbatRole`. CRUD via `/api/admin/orbat/groups[/{groupId}]`, managed through `app/dashboard/orbat/ChainOfCommandPanel.tsx`.

### types/board.d.ts
- `BoardColumn` — `{_id, department, title, order, createdAt, createdBy, createdByName}`. `department`-scoped like every other dept-tab data model (only `'j7'` in use as of this writing, see `docs/superpowers/specs/2026-07-14-j7-board-design.md`).
- `BoardCard` — `{_id, department, columnId, title, description?, assigneeId?, assigneeName?, linkedTaskId?, order, createdAt, createdBy, createdByName}`. `linkedTaskId` optionally references a `Db.tasks` doc — resolved live on read (via `?view=mine`+`?view=created`, never the J4-only `?view=all`), never duplicated onto the card. `assigneeId`/`assigneeName` must be set or cleared together (enforced server-side in the cards `PATCH` route) to avoid a card assigned to a member with no displayable name.

### types/department-link.d.ts
- `DepartmentLink`: one managed quick link on a department's (J1-J7) landing rail: `{_id, department, url, fetchedTitle, nameOverride, visibleToRoleIds, order, faviconData, faviconContentType, faviconFetchedAt, faviconStatus, createdAt, createdBy, createdByName, updatedAt?, updatedById?, updatedByName?}`. `nameOverride` is display-only; a URL change never writes it, and setting it never writes `url`/`fetchedTitle`; `null` means "show `fetchedTitle`". `visibleToRoleIds: ObjectId[]` — empty means visible to every department member; non-empty restricts visibility to members holding one of those specific `DepartmentRole` ids (or a manager). `faviconData` is doc-embedded base64 (≤200KB raw, atomic with the rest of the doc, no orphan files).
- `DepartmentLinkListItem`: the wire shape from `GET /api/admin/dept-links`: same fields minus `faviconData`/`createdBy*`/`updated*`, plus `hasFavicon: boolean` and `faviconVersion: number | null` (`faviconFetchedAt.getTime()`, doubles as the favicon route's `?v=` cache buster). `faviconData` never appears in a list response; the bytes are served separately from `GET /api/admin/dept-links/{id}/favicon`.

### types/sops.d.ts
- `SopCategory` union.
- `SopDocument` — `{title, category, description?, ..., yjsState?: Binary}` (collab-editor-backed SOP doc).

### types/stream-json-submodules.d.ts
- Ambient module declarations for `stream-json/filters/pick.js` and `stream-json/streamers/stream-array.js` (untyped npm submodules) — used by `lib/ocap.ts`.

### types/teamspeak.d.ts
- `TsSnapshot` — `{name, auto, createdAt, createdBy, data: raw TS3 snapshot string, sizeBytes}`.

### ../../types/user.d.ts (monorepo-root, **not** apps/web/types — shared with apps/bot)
- `OAuth` — Discord OAuth token response shape.
- `User` — **the** central user document, shared with `apps/bot` (which used to have its own narrower duplicate called `GuildMember`, now merged into this). Key sub-shapes: `guild` (nickname/avatar/roles/joinedTimestamp), `optionals` (per-category mod selections), `discharged` (date/type/reason/approvedBy), `departments`/`teamLeadDepts`, `teamspeak` (linked account), `tsVerifyCode`/`tsPending`, `bio`, and the large `milpac` object (currentRank, callsign, enlistedDate, `promotions[]`, `awards[]`, `operations[]`, `qualifications[]`, `promotionPoints`, `j4Points`, `disciplineDeductions`, `disciplineHistory[]`, `billetCounts` — the full raw-count shape consumed by `lib/military/points.ts`'s `MilpacImportCounts`, `uniformHash`).
- `Role` — Discord role `{id, name, color, rawPosition}` — also shared with `apps/bot`.
- `OAuthUserResponse` — raw Discord `/users/@me` response shape.

See `types/README.md` at the monorepo root for the sharing convention (web is authoritative; both apps' `tsconfig.json` `include` and both Dockerfiles' `COPY types/` step need to know about this directory).

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
- `NotificationType` — the master union of every notification type string (tasks, meetings, tickets, calendar, training, quiz, mission-check, `board_card_assigned`, system) — cross-reference with `lib/notifications/types.ts`'s `NOTIFICATION_TYPES` metadata table.
- `TaskType` (`manual|attendance|application_review|j4_returning_review|extension_review|quiz_assigned|dev_check|orders_check|mission_check`).
- `Task` — the central task document: assignment fields, due/reminder/escalation timestamps, `missionDevCheckId`, `ordersCheckAt`/`ordersCheckStatus`/`ordersCheckProposedAt`, `extensionRequest` (nested workflow object), `reassignmentRequest` (nested workflow object), `deleteRequest` (nested workflow object).
- `TaskStatus` (`pending|in_progress|completed|overdue`).

---

### lib/landing.ts
Server-side loaders for the public home page and footer — direct Mongo, no `/api/*` round-trip.
- `getFeaturedOp()` / `getOperationsLog(limit)` → `LandingOp` — id, title, date, status, department,
  cover, theme, map world, owner name, plus `blurb`, `attending`, `confirmed`, `slots`, `rsvpOpen`,
  `stage`. Reads through `PUBLIC_OP_FIELDS`, which **never** includes `internalNotes`/`zeusNotes`.
- `blurb` is recovered by flattening the first public ProseMirror section — operations have **no**
  summary field.
- `slots` is filled ORBAT positions across the op's `assignedPlatoons`. Nothing in the schema stores
  a total-slots figure, so this is the only defensible denominator; null when the op has no platoon
  assignment.
- `getPlatoonStats()` → per-category member (`distinct` userId) and section counts.
- `getRosterCount()` → distinct members holding a filled slot, excluding `inactiveReservist`.
- `getScreenshotOfMonth()` → the SOTM doc, loaded server-side so the hero paints with its photo.
- `getGalleryTiles(limit)` → random pick from `storage/gallery/featured`, Fisher-Yates shuffled.
Every loader catches independently and degrades to null/empty: the front door should lose one band,
not the whole page.

---

### lib/topo/field.ts
Pure field maths behind `components/ui/Topo`.
- `noise3(x, y, z)` / `fbm3(x, y, z)` → integer-hash value noise and a four-octave sum in 0..1. The
  third axis is time, and the finer octaves advance faster so detail churns while landforms drift.
- `cellSegments(a, b, c, d, level)` → marching squares for one cell, flat `x0,y0,x1,y1` per segment
  in unit coordinates (flat because it runs tens of thousands of times a frame). Corners are a
  top-left, b top-right, c bottom-right, d bottom-left. The two saddle cases resolve on the cell
  centre — picking arbitrarily produces crossed contours.
- `lowestLevel(min, levels)` / `highestLevel(max, levels)` → the inclusive range of contour levels a
  cell's corner range can carry; `highestLevel < lowestLevel` means skip the cell. This is the
  page-performance lever: testing every level against every cell was 726k calls a frame on a large
  band to yield 7.9k segments. Two scalars rather than a tuple because returning a pair allocated
  24k short-lived arrays a frame, which measured as two thirds of the tracing cost.
- Tested throughout: `lib/topo/field.test.ts`, including that the range never excludes a level
  `cellSegments` would have drawn, and that the field's rate of change stays steady over time.

---

### lib/contact/countdown.ts
- `formatUntil(iso, now)` → the contact page's next-op display figure: `2d 14h` · `14h 30m` · `30m`
  · `Running`, null on an unreadable date. Units drop as the target nears and everything floors.
  `now` is a parameter so the server renders one value and the client ticks from it. Deliberately
  not `formatCountdown` (components/nav/useNavStatus) — that is 9.5px page chrome reading
  `T−2D 04H 11M`; this is a 62px display figure. Tested: `lib/contact/countdown.test.ts`.

---

### lib/shell/masthead.ts
Pure helpers for the public page masthead (`components/container.tsx` / `components/ui/Masthead.tsx`).
- `bannerHeightValue(size?: BannerHeight)` → the band's height as a clamped CSS value (`xsm|sm|md|lg`,
  default `md`) — replaces the old `vh`-only Tailwind heights so a 1080p reader isn't shown a photo
  and one word before any content.
- Lives in `lib/` rather than beside the component because vitest only picks up `lib/**/*.test.ts`.

### lib/milpac-kits.ts
- `fetchDefaultKitLines(userIds): Promise<Map<string, MilpacKitLine>>` — each member's default
  **public** kit reduced to `{primary, itemCount}`, in one query for a whole roster page. Filtered on
  `isDefault && shared`; `shared` is the loadout collection's entire privacy boundary, so that half
  is not optional. Each kit's `raw` is parsed inside its own try/catch — it is a verbatim member
  paste, and one malformed export must not take the roster down.
- Sits flat in `lib/` rather than in `lib/loadout/` on purpose: everything in that folder is pure and
  React-free by design (the parser and shelf are unit-tested on that basis) and this is a Mongo read.
  `lib/landing.ts` is the same pattern.

### lib/shell/rail.ts
Pure helpers for the sticky section rail (`components/ui/SectionRail.tsx`), kept out of the client
component so the active-cell rule is unit-testable on its own.
- `RailItem` — `{href, label}`.
- `activeRailIndex(items, pathname)` → index of the active cell by **longest-prefix, segment-aware**
  match, or `-1`. Exact-only matching would leave `/about/rules/appendix` with no active cell; a raw
  `startsWith` would wrongly light `/about` on `/aboutus`.
- `railIndex(i)` → the cell's displayed index, 1-based and zero-padded to two digits.

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
- Default export `FullscreenPage()` — client-only side-effect component; toggles `document.body.classList.add('fullscreen-page')` on mount/unmount. Renders nothing. Hides both the site navbar and the footer (rule in `styles/globals.css`).

#### components/HideSiteNav.tsx
- Default export `HideSiteNav()` — the narrower sibling of `FullscreenPage`: toggles `body.hide-site-nav`, which drops the site navbar and leaves the footer. For a page that brings its own top bar but is still an ordinary scrolling document — currently the operation orders page, which is topped by `OperationBar`. A body class rather than page-scoped CSS because the navbar lives in the root layout, outside anything a route can style.

#### components/info-card.tsx
- Default export `InfoCard({title, children, icon?, accentColor='var(--red)', accentRgb='219,0,29'})` — bordered card with icon+uppercase title header.

#### components/member/avatar.tsx
- Default export `Avatar({user?, borderRadius='100%', sizes='160px'})` — Discord CDN avatar `next/image` with fallback-to-`public/images/fallback_pfp.png` on load error. `sizes` is not optional in practice: this uses `fill`, and `fill` with no `sizes` makes next/image assume `100vw` and emit a srcset up to **3840w**, so browsers were fetching a ~2048px raster to paint a 54px circle. The default covers the largest avatar on the site (the milpac hero, 148px); callers with something smaller should say so.

#### components/member/banner.tsx
- Default export `Banner({user?})` — **currently a no-op stub** (body fully commented out, returns `undefined`). Do not assume it renders anything.

#### components/minigame-scoreboard.tsx
- Default export `MinigameScoreboard({visible, currentUserId?, refreshKey, lastScore?})` — leaderboard overlay for the site minigame; fetches `/api/minigame/score` (top scores) and `/api/minigame/score?all=true` (full leaderboard, portal-rendered modal via `createPortal`). Shows dodged/gems/total/rank stat blocks for the just-finished run.

#### components/signature.tsx
- Default export `Signature({size?, color='#fff'})` — pure inline SVG hand-drawn signature graphic (no logic, just paths).

#### components/tactical-loader.tsx
- Default export `TacticalLoader({label='LOADING'})` — full-page military-HUD-styled loading screen (animated spinner, corner brackets, progress bar). Internal `Corner({position})` helper.

#### components/container.tsx
- **Synchronous server component.** Default export `Container({children?, title?, subtitle?, background?, backgroundUrl?, kicker?, lede?, aside?, rail?, sx?})` — the shell behind every public page that isn't the landing page: a left-anchored `Masthead` band plus a content wrapper, replacing the old centred 60vh banner. `title`/`subtitle`/`background`/`backgroundUrl`/`sx` are unchanged from before the redesign (`sx.bannerHeight` still takes `xsm|sm|md|lg`, now resolved to clamped pixel heights via `lib/shell/masthead.ts` rather than raw `vh`; `sx.maxWidth`/`sx.padding`/`sx.gap` still control the content area). New: `kicker` is the mono label above the title — purely opt-in, since a server component cannot derive it from the route (omit it and no kicker renders); `lede` overrides `subtitle` for the paragraph under the title; `aside` is the masthead's second column (only `/join` passes one); `rail` (`RailItem[]`) renders a `SectionRail` below the masthead (only the About family passes one). Styles in `styles/shell.module.css`, not `./landing.css` (deleted).

#### components/callsign-card.tsx
- `CallsignCard({title, images, children})` (named export) — hoverable image-header card with cursor-tracked diagonal shine effect.

#### components/credits-modal.tsx
- Default export `CreditsModal()` — trigger button + MUI `Dialog` that lazy-fetches `/api/credits` (typed via `lib/credits.ts`'s `CreditsResponse`) and renders contributor cards (`ContributorCard`) + "Special Thanks" list (`ThanksCard`). Internal `Stat({label, value})` helper.

#### components/cursor.tsx
- Default export `CustomCursor()` — custom animated cursor (dot + ring + corner brackets on hover of clickable elements); respects `localStorage('cursor-disabled')` and a `cursor-toggle` window CustomEvent for live toggling from the navbar; suppressed via `body.suppress-custom-cursor` class (watched with `MutationObserver`); no-ops on touch devices.
- **`body.cursor-disabled` is the user's saved preference and belongs to this component alone.** A component that wants the system cursor back over its own modal adds **`suppress-custom-cursor`** instead — both switch off `cursor: none` in `globals.css`, but writing `cursor-disabled` clobbers the preference. `PageSidebar` and `IntelPackageEditor` did exactly that, and because the rail is mounted on every page of the operations editor, a member who had turned the custom cursor off lost the class and was left with no cursor at all in the editor while it worked everywhere else.

#### components/military-grid.tsx
- Default export `MilitaryGrid({gradient?})` — decorative background double-grid overlay (96px primary + 24px sub-grid), optional radial-gradient mask.

#### components/physics-game.tsx
- Default export `PhysicsGame({onActivate, onGameOver?, onRestart?, active?, personalBest?, globalBest?, globalBestName?, liveUserId?, liveAccentColor?})` — large (1800+ line) self-contained canvas minigame (asteroid-dodger with gems/powerups: magnet, slowtime, shield, gemshower, nuke, autopilot). Talks to `/api/minigame/live` (heartbeat POST/DELETE) and `/api/minigame/live/stream` (SSE) for live multiplayer presence panel. No other exports — treat as a sealed component; only the top-level props are a stable integration surface.

#### components/confirm-dialog.tsx
- Default export `ConfirmDialog({open, title, message?, confirmLabel?, danger?, restore?, onConfirm, onCancel})` — generic red/green/neutral-themed confirm modal, used throughout admin UIs in place of `window.confirm`.

#### components/wip-page.tsx
- Default export `WipPage()` — "Under Development" placeholder page with a bypass button that appends `?bypass_wip=1` and reloads. Paired with `middleware.ts`'s `WIP_PATHS` rewrite (see §4).

### components/dashboard/* — the staff portal's kit

The dashboard's own layer on top of the Command Strip vocabulary. **Look here
before writing anything inside `/dashboard`.** Styles live in
`styles/dashboard.module.css`, scoped to `.dash` on `StaffDashboardShell`'s root
so every screen inherits the tokens without importing them.

It exists to fix one systemic problem: every panel on the dashboard was outlined
in red, so container, primary action, destructive action and alert state all
carried the same weight. Depth now comes from a four-step surface scale
(`--ink-1`..`--ink-4`) and red is spent only on action, active state and alert.
The status washes are mixed from the site's `--red`/`--amber`/`--live` with
`color-mix`, so those tokens stay the single source.

That fix has been carried across the existing screens as well as the new ones,
because most of `/dashboard` styles itself with inline objects rather than this
module:

- **Structure is neutral, state is red.** ~290 container edges and 91 section
  kickers moved from red to `--line-2`/`--txt-3`. The sweep worked per style
  *object* rather than per line, so ~190 declarations were left alone: an object
  that paints itself red is an action, an alert or an active state, and the edge
  belongs to it. `borderLeft` is untouched throughout — the 2-4px left bar is a
  state accent on rows and cards, which is exactly what red should still say.
- **One status palette.** ~440 ad-hoc status colours fold onto the unit tokens.
  Bare hexes (`#f59e0b`, `#3b82f6`, `#10b981`…) became `var(--amber)` etc.
  directly; the translucent forms became `color-mix(in srgb, var(--token) N%,
  transparent)`, which is the same alpha expressed against the token. Violet
  (`#a78bfa`) is deliberately left: peer review has no token and is its own
  category, not a second shade of an existing one.

So when you touch a dashboard screen: reach for a kit component if one fits,
and if you are hand-rolling a style, take the colour from a token.

- `surfaces.tsx` — `Panel` (+ `tone`: alert/live/warn, an inset bar rather than a
  full border), `PanelHeader`/`Body`/`Footer`, `SectionLabel` (the `// LABEL`
  rule), `PageHead`, `Grid2`/`Grid3`/`Stack`.
- `controls.tsx` — `Button` in four volumes plus a separate destructive track
  (destructive stays outlined until hover), `Chip` (a toggle that *is* the
  input), `Switch`, `Field`/`Input`/`Textarea`/`Select`, `Stepper`, `PointsLine`.
- `status.tsx` — `Badge` on one palette (live/warn/alert/info/muted), `Meter`
  (promotion, sign-on, course completion — figure first, bar second), `Stats`/`Stat`.
- `data.tsx` — `ListRow` (state as a 3px left edge *and* a badge), `Rows`,
  `Thumb`, `Table`/`TableScroll`/`cell`, `Identity`, `EmptyState`, `Tabs`.
- `tools.tsx` — `ToolCard` tiered by consequence (standard/caution/danger/safe)
  + `ToolGrid`. Pair `danger` with a typed `ConfirmDialog`, always.
- `feedback.tsx` — `ConfirmDialog` (`confirmWord` gates the button),
  `ToastProvider`/`useToast` (one host, in the shell), `SaveBar`.
- `icons.tsx` — the kit's own line icons, so no component waits on an icon prop.

Density: every measurement is a variable, so `.dense` on the root drops padding
and row height by about a third without touching any layout.

### components/ui/* — the shared design system

The Command Strip vocabulary, factored out of the navbar so the landing page,
the footer and the milpac draw the same pieces. **Look here before writing a new
button, badge or bar.** Styles live in `styles/ui.module.css`; surface-specific
choreography stays in that surface's own module.

#### components/ui/Button.tsx
- Default export `Button({variant, size, block, href, external, ...})` — the notched action button.
  Variants `red` (primary/filled) · `ghost` · `amber` (support/donate) · `discord` (ghost that only
  takes brand blue on hover) · `dark` (signed-in primary: dark plate, red leading edge). Sizes
  `md` (46px) / `sm` (38px). Renders `<a>` with `href`, `<button>` otherwise; `external` skips
  next/link and adds the rel guard.
- **Rule:** only one button in a cluster is ever solid-filled — whichever is primary for that state.

#### components/ui/Topo.tsx
- Default export `Topo({opacity, driftSeconds, mask, className, style})` — the contour backdrop, on a
  canvas. **Client component.** Generates the lines every frame via `lib/topo/field.ts` rather than
  translating `public/designs/topo.svg`, so individual contours stretch, split and close into rings;
  the SVG is no longer referenced by anything. Field character (spacing, warp, index contours, depth)
  is fixed in the module — only `opacity` is per-surface, and the seven call sites run 0.045→0.32.
  `GAIN` in the module scales every call site at once; the `opacity` default governs new call sites
  only (all seven pass their own) and is deliberately not a global control. A call site's number is
  not the alpha drawn: `DEPTH` ramps each contour to 0.63–1.19x it, and index contours take
  `INDEX_BOOST` on top.
  `mask` unchanged: `fade` · `edges` · `left` · `none`, still pure CSS. `driftSeconds` is now a rate
  (720 = tuned speed, 1440 = half) and `0` still pins it. Stops via `IntersectionObserver` when
  off-screen and on `visibilitychange`; under `prefers-reduced-motion` it draws one frame and never
  starts the loop. Paces to 30fps and **adapts its own grid**: a rolling frame-cost average coarsens
  the cell size when draws exceed ~5.5ms and refines it again when they do not, up to a ~6x cell
  reduction. Cost scales with area/cell², so tall bands were what stuttered — see the `Cost` block
  in the file for measured figures.

#### components/ui/Pulse.tsx
- Default export `Pulse({tone})` — the live dot. `live` / `amber` / `idle` (dim, animation off, for
  "known not live" as distinct from "unknown").

#### components/ui/SectionHead.tsx
- Default export `SectionHead({kicker, title, more, children})`, plus named `Kicker` and `Lede`.
  The standard section opener; using it everywhere is most of what makes a long page read as one
  document.

#### components/ui/ProgressTrack.tsx
- Default export `ProgressTrack({label, value, pct, accent})` — labelled bar, `pct` clamped 0–100.
  Consumers: operation sign-on, the navbar account menu, `RankProgress`.

#### components/ui/RankProgress.tsx
- Default export `RankProgress({currentRank, progress, accent})` — a member's progress to the next
  rank. Takes exactly what `getPromotionProgress()` (`lib/military/milpac-stats.ts`) returns;
  renders nothing at max rank or on a billet-assigned rank. Used by the milpac file so it and the
  navbar can't draw the same number two ways.

#### components/ui/Countdown.tsx
- Default export `Countdown({target, onElapsed})` — **client**. D/H/M/S, ticking every second
  (unlike the navbar rail's minute resolution). Renders empty until mounted to avoid a hydration
  mismatch.

#### components/ui/EnlistButton.tsx
- Default export `EnlistButton({variant, size})` — **client**. Self-contained "Enlist now": carries
  its own `EnlistFadeOverlay`, so several can be mounted at once and only the pressed one shows.

#### components/ui/icons.tsx
- Named exports `CrateIcon` (donations as resupply, not charity), `ArrowIcon`, `DiscordIcon`,
  `SteamIcon`, `YouTubeIcon`, `MailIcon`. Everything else on the site uses `@mui/icons-material` —
  only add here when the meaning genuinely isn't in that set.

#### components/ui/Masthead.tsx
- Default export `Masthead({title, kicker?, lede?, background?, backgroundUrl?, bannerHeight?, aside?,
  actions?})` — the public page masthead itself: a photo band carrying the landing hero's two-pass
  veil and drifting `Topo`, with title/kicker/lede in the left column and an optional `aside` in the
  right. `actions` is page-level controls under the lede (a different thing from `aside`, which is
  the second column) — `/milpacs` puts its "Manage ORBAT" link there. Rendered by
  `components/container.tsx`, and directly by `app/(landing)/milpacs/page.tsx`, which needs the band
  without the `Container` content column. Styles in `styles/shell.module.css`.

#### components/ui/MastheadAside.tsx
- Default export `MastheadAside({heading, status?, rows: AsideRow[], cta?})` — the masthead's second
  column: a heading row (optional live `status` badge), a stack of label/value rows (`AsideRow.accent`
  picks amber for the row that's the answer, not context), and an optional CTA link. Deliberately
  presentational — takes resolved strings, never a query, which is what keeps `Container` itself
  synchronous for all ten consumers. Used by `/join`.

#### components/ui/SectionRail.tsx
- **Client** (reads `usePathname`). Default export `SectionRail({items: RailItem[]})` — the sticky
  section rail rendered below the masthead when `Container` is passed a `rail` prop. Cells size to
  their labels over a 158px floor (116px below 900px) with their content centred, and the row itself
  is centred (`justify-content: safe center` — plain `center` would push the leading cells past an
  overflow container's scroll origin). Resolves the active cell via
  `activeRailIndex` (`lib/shell/rail.ts`) and scrolls it into view on change, since below ~900px the
  rail overflows to horizontal scroll and the active cell routinely lands offscreen.
  Being a client component here (rather than in the About shell) is what lets `about/shell.tsx` be a
  plain server component.

#### components/ui/Card.tsx
- Default export `Card({title, kicker?, ghost?, icon?, span?: 1|2|3|4|6, children?})` — the content
  card used across the rebuilt About pages, plus named `CardGrid({columns: 4|6, children})`. `span`
  is the fix for the ragged grid the old `InfoCard` produced: a card with more to say spans wider and
  reflows its list into more columns instead of towering over its neighbours. `ghost` renders an
  outlined numeral — only pass one where the number is real.

#### components/ui/List.tsx
- Default export `List({items: React.ReactNode[], columns?: 1|2|3})` — a real `<ul>` with a hanging
  indent and a rule as its marker, replacing the old pattern of sibling `<Typography>` lines each
  opening with a hyphen (which broke both wrapping and screen-reader semantics).

#### components/ui/QaRow.tsx
- Default export `QaRow({index, question, children})` — one FAQ entry (not an accordion — these
  answers are indexed by search engines and found with Ctrl-F). Named `QaStack({columns?: 1|2,
  children})` groups them. Used by `about/faq/page.tsx`.

### components/nav/*

The Command Strip navbar, split out of `app/navbar.tsx` so the desktop bar and
the mobile sheet share one source of truth. Layout and interaction live in
`styles/navbar.module.css`; these files are structure, state and data.

#### components/nav/nav-data.tsx
- `NAV_ITEMS: NavItem[]` — the public navigation tree (six top-level items, MUI icons, each child carrying a `description` for the mega panel). Consumed by both `app/navbar.tsx` and `MobileSheet`. `Support` lives under `Community` (the menu formerly labelled `Our Orbat`; its `href` is still `/community`) rather than at the top level.
- `isItemActive(item, pathname)` — active check that also matches any child href.
- Types `NavItem` / `NavChild`.

#### components/nav/useNavStatus.ts
- `useNavStatus()` — fetches `/api/nav/status` on mount and every 5 minutes. Never throws or exposes an error state; a failed request just leaves rail segments unrendered. Shared by `StatusRail` and the mega panel's "Next Op" card so both quote the same operation.
- `formatOpTime(iso)` → `SAT 20:00` in the reader's timezone; `formatCountdown(iso)` → `T−2D 04H 11M`, or `RUNNING` once the start time passes (minute resolution).

#### components/nav/StatusRail.tsx
- Default export `StatusRail({status, hidden})` — the 28px rail above the bar. Each segment is conditional on its own data; `hidden` collapses it to zero height on scroll. Its leftmost segment is the `MusterCall`, which renders four states off the next op's attendance rather than one number: `Standing by` (no op), `N on deck` + live pulse (running — `confirmed` if any have landed, else `attending`), `RSVP not open` (no attendance doc or still `preparing`), and `N signed on` otherwise. A bare count reads wrongly in three of those.

#### components/nav/AccountMenu.tsx
- Default export `AccountMenu({user})` — account chip + dropdown. Fetches `/api/me/orbat` and `/api/me/promotion-progress` lazily on first open, not on mount. Threads the member's Discord `hexAccentColor` through the `--acct-accent` CSS variable (avatar edge, panel top rule, rank line, progress bar), falling back to `var(--red)`. Owns logout and the impersonation return action.

#### components/nav/MobileSheet.tsx
- Default export `MobileSheet({pathname, user, actions, onNavigate})` — the sub-1200px sheet. `actions` is the DONATE + primary pair, passed in from `app/navbar.tsx` so the two surfaces can't style the same buttons differently.

#### components/nav/CrateIcon.tsx
- Default export `CrateIcon(props)` — the supply-crate glyph on the DONATE button. The only hand-drawn icon in the navbar; every other one is MUI.

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
- **Dev-only “⚙ Template Document” button** beside “+ Add Section”, gated on `NODE_ENV` alone — no prop, since `onProviderReady` is on record as the only prop this component may gain, and the template suits a SOP or workspace doc as well as an operation (all three are the same page/section model). Lazily imports `lib/operations/template-document.ts` so neither the content nor the schema it builds reaches anybody else's bundle.

#### components/editor/content-extensions.ts
- `contentExtensions()` — the schema-defining half of the editor's extension list, split out so anything that *produces* content builds the same ProseMirror schema rather than a lookalike that drifts. A node or mark the schema does not know is dropped silently on load, which reads as data loss. `ResizableImage` deliberately stays behind (it carries a React node view); a schema missing a node the content never uses is harmless.
- Note: StarterKit v3 already provides `link` and `underline`, so mounting an editor logs a duplicate-extension warning. Pre-existing, and the explicit configuration here (`openOnClick: false`, `target=_blank`) is what wins.

#### components/editor/PageSidebar.tsx
- Default export `PageSidebar({ydoc, activePage, onSelectPage, themeColor, orientation='sidebar'|'top', allowedTypes?})` — page-tree navigator for `CollabEditor`'s multi-page operations (`pageType`: `orders|zeus|ocap|staff_orders|aar|separator`); includes hardcoded `STAFF_SECTIONS` (HQ Orders/1PL/2PL/3PL with their sub-unit children) for organizing staff-order pages into a folder-like tree with drag reordering (`DragIndicator`) and duplicate (`ContentCopy`).
- **Reordering** (`dragPropsFor` / `commitDrop` / `showInsertAt`): the insert line is absolutely positioned and the drag source is held by **id, not index**. Both were bugs, and the visible one was the line — as a flow element, drawing it pushed the row under the cursor down by its own height, which moved the row out from under the pointer, which recomputed the position and hid the line again: an above/below flicker that never settled. Clearing on each row's `onDragLeave` compounded it, since a dragleave fires every time the pointer crosses into a child element (the grip, the dot, the label); only leaving the whole list clears now.
- The top and bottom halves of a row are before/after; the middle band nests, and only on rows that can take a child (one level deep, which is all the rail renders). An insert line at either end of the row being dragged is suppressed — it would promise a move that does not happen. Dropping a nested page on a top-level insert line **un-nests** it, which is the only way back out; `unnestPage` was otherwise dead code.


#### components/editor/ImageNodeView.tsx
- Default export `ImageNodeView({node, updateAttributes, selected, editor, getPos}: NodeViewProps)` — TipTap `NodeViewWrapper` custom render for image nodes: floating toolbar (align left/center/right, wrap-left/wrap-right float, free-position drag-anywhere mode, reset size, crop toggle/clear), bottom-right resize-drag handle, top-left drag-to-reorder handle, crop panel (4-directional inset sliders → CSS `clip-path: inset()`). Attrs used: `src, alt, width, data-align, data-crop, data-pos-x, data-pos-y`. Internal `ImgBtn`/`Sep` toolbar helpers, `parseCrop`/`CropVals` helpers.

#### components/editor/SimpleEditor.tsx
- Default export `SimpleEditor({initialContent='', onChange?, readOnly=false, minHeight=300}: Props)` — a non-collaborative (local-state only) TipTap editor for simpler HTML content editing (training docs etc.), reusing `ImageNodeView`. Custom extensions: `MarginLeftExtension` (preserves Google-Docs-imported paragraph/heading/list indentation), `ListClassExtension` (preserves `lst-kix_*` custom-bullet classes), `HeadingIdExtension` (preserves heading `id` for TOC anchors), `TabIndentExtension` (Tab/Shift-Tab → list-item sink/lift or margin-left indent step for non-list blocks). `splitStyleBlock(html)` — extracts a leading `<style>` block (Google Docs list CSS) so it survives editor round-trips; re-prepended on save.

### components/loadout/icons.tsx
- `<LoadoutIcon icon size?>` — 24×24 `currentColor` SVG mark per `IconKey`. `PATHS` is a total `Record<IconKey, string>` on purpose: adding a key to `ICON_KEYS` without drawing it is a compile error rather than a blank square. Our own marks, not Arma's — real `.paa` artwork is out of scope.

### components/loadout/stars.tsx
- `<Stars avg count mine? loadoutId? interactive? size?>` — two modes from one component so the shelf card and the kit page can't drift apart. Read-only (default) shows the average and rating count. `interactive` (the kit's own page, never the shelf) adds hover preview and click-to-rate, showing the *viewer's own* rating rather than the average while interactive — a control that ignored your input to show a crowd's would not be trusted. Clicking the star you already gave withdraws it. Optimistic: updates local state immediately, `PUT`s `/api/loadouts/[id]/rating`, and rolls back on a failed response rather than lying about the result. Re-seeds its internal state when the parent re-renders with fresh `avg`/`count`/`mine` props (the shelf does this on every filter/sort/page change) without clobbering an in-flight optimistic update — React's "adjust state during render" pattern, not an `useEffect`. Deliberately distinct from the default-kit `Star` in `loadout-manager.tsx`: that toggles which kit is the owner's default; this is a five-value score other people set.

### components/loadout/tag-chips.tsx
- `<TagChips tags: KitTag[]>` — a kit's tags as chips, `KIT_TAG_LABELS`-rendered. No client boundary (renders text only). Renders nothing for an untagged kit rather than an empty row, so a card without tags keeps its height. Shared by the shelf card and the kit panel.

---

## 4. Root-level config files

### server.mjs
- Custom Next.js production entry point (`node server.mjs`), co-hosts:
  1. **Hocuspocus** collaborative server (`collab`) on the `/collab` WebSocket path — `onAuthenticate` calls back into the app's own `/api/auth/collab` route over loopback HTTP; `Database` extension `fetch`/`store` handlers persist Yjs state differently per document-name prefix: `sop-{id}` → `Db.sops.yjsState`, `ws-{id}` → `Db.workspaceDocs.yjsState`, `{opId}-map` → `Db.operations.mapYjsState`, else `{opId}` → `Db.operations.yjsState` + derived `sections`/`pages`/`content` fields (single-page legacy, multi-section, or multi-page document shapes all handled). Also tracks per-section text-diff **activity logging** (`operation_activity` collection) with a 15s debounced flush per document, skipped for `sop-`/`ws-` prefixed docs.
  2. **Recruit Session** WebSocket server on `/recruit-session` — in-memory `recruitActiveSessions` map pairs a recruiter connection and applicant connection per `sessionId` (validated against `Db.recruitSessions`), relays a large set of live-preview message types (step navigation, raised-hand, name/background/field/availability/roles preview, rules Q&A, ORBAT highlight, BCT quiz mode/slots, TS-link status, cursor position) bidirectionally; recruiter messages are cached (`mem.cache`) so a reconnecting applicant gets full current state replayed.
  3. Plain Next.js request handling for everything else.
  4. Startup side effects: creates `storage/{j1..j7,hq,all,members}` directories; runs `cleanupOperationImages()` immediately and hourly (deletes orphaned `uploads/operations/*` image files >2h old not referenced by any operation's cover image or section/page content).
  5. Internal cron schedulers (plain `setInterval`/`setTimeout` hitting the app's own `/api/cron/*` routes with `Bearer {CRON_SECRET}`): `calendar-reminders` (1min), `task-reminders` (1min), `operations` (1min), `dev-check-escalation` (1hr), backup scheduler (hourly, hits `/api/cron/backups`, no clock-time alignment needed), TeamSpeak daily snapshot (daily at 3am via `msUntilNext3am()` — **note**: hits `/api/cron/teamspeak-snapshots`, a separate untouched system, not `/api/cron/backups`), TeamSpeak offline-client cache refresh (15min).
  6. Event-loop diagnostics (`lib/diagnostics.mjs`): `startEventLoopWatchdog()` runs once, right before `httpServer.listen(...)`; every HTTP request is registered/deregistered via `registerInFlight` for the request handler's lifetime; every cron trigger above plus the image-cleanup job is wrapped in `trackJob(...)` so a stalled job/request is named in the watchdog's lag warning.

### next.config.ts
- `serverExternalPackages: ['@napi-rs/canvas', 'unzipper', 'archiver', 'ts3-nodejs-library']` — native-binary packages excluded from webpack bundling.
- `webpack()` — aliases `yjs` to the single `node_modules/yjs` install (avoids duplicate-Y.js-instance bugs with TipTap collaboration).
- `images.remotePatterns` — allowlists `cdn.discordapp.com` (avatars/banners), `*.asotmilsim.com`/`asotmilsim.com`/`localhost:3000`/`192.168.0.125:3000` for `/api/gallery/fetch`, `/api/gallery/featured`, `/api/uploads`.
- `headers()` — global security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS, restrictive `Permissions-Policy`).
- `rewrites()` — `/map-assets/:path*` → `/api/maps/assets/:path*`.
- `redirects()` — legacy path redirects (`/dashboard/gallery`→`/dashboard/j5`, `/community/tickets*`→`/tickets*`, `/feedback*`→`/tickets*`, `/ts`→`ts3server://` protocol link), plus canonical-host redirects (`www.asotmilsim.net`, `asotmilsim.net`, `asotmilsim.com` all → `NEXT_PUBLIC_BASEURL`) and http→https upgrade via `x-forwarded-proto` header check.

### middleware.ts
- `middleware(req)` — one responsibility: rewrites the work-in-progress routes in `config.matcher` (and their subpaths) to `/wip` (renders `components/wip-page.tsx`) unless the `?bypass_wip` query param is present. It sets no headers — it used to set an `x-pathname` *response* header, which no server component could have read.
- `config.matcher` — deliberately narrow: `/retired`, `/bios` and their subpaths, and nothing else (ORBAT was on the list until it was released; the whole `/community/*` tree was flattened to the top level, and a catch-all redirect in `next.config.ts` — not this matcher — is what keeps the old URLs working). It ran app-wide once, which also ran it on the internal `_rsc` requests a client navigation makes and made some of them fail silently (vercel/next.js#91723) — that was what broke the milpac profile tabs. Do not widen it; a server component that needs the current path must be passed it.

### themes/unit.ts
- Default export: MUI dark theme (`createTheme`) — `primary.main:'#c90620'`, `secondary.main:'#242424'`, custom palette extensions `secondaryGrey` (`#3a629c`) and `light` (`#ffffff`) declared via TypeScript module augmentation (`declare module '@mui/material/styles'` + `'@mui/material/Button'` `ButtonPropsColorOverrides`). Typography: `Inter` base font, `Montserrat` for buttons, `h2` fontSize 34px. `MuiPaper` default `borderRadius:3`. Import as `UnitTheme` per CLAUDE.md convention (applied in root layout `ThemeProvider`).
