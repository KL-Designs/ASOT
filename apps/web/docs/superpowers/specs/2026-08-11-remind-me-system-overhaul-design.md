# Remind-Me System Overhaul — Timezone-Aware Bot UX + Web Dashboard UI

**Date:** 2026-08-11
**Status:** Approved for planning

## Problem

The Discord bot's `/reminder` system (channel-posted reminders with @mentions, acknowledgement buttons, chase-up pings, and repeat intervals) has two kinds of problems:

1. **Bugs**, found in a code review of `apps/bot/app/{commands,interactions}/**/reminder*`, `apps/bot/app/processReminders.ts`, `apps/bot/lib/reminderSessions.ts`:
   - Date construction calls `setDate()` before `setMonth()`/`setFullYear()`, so entering a day-of-month greater than the current month's length overflows into the wrong month (e.g. creating on Apr 30 for a May 31 target silently saves May 1).
   - Several DB/Discord calls are fired without `await` (`processReminders.ts` send/update/delete, the reminder "disable" button handler) — with no global `unhandledRejection` handler in `apps/bot`, any one rejecting can crash the whole bot process.
   - `/reminder remove`'s autocomplete reads `getString('repeat')` instead of `getString('reminder')`, so it never actually filters by what the user typed.
   - `reminder.enabled === null` is displayed as "✅ Enabled" in the admin UI but is treated identically to `false` (never sent) by the scheduler — reminders can look active and silently never fire.
   - `processReminders.ts` dereferences `App.user(reminder.by)` unguarded; if the creator isn't in the guild-member cache, this throws into a catch block that logs a misleading error and leaves the reminder stuck retrying forever.
   - `setInterval(processReminders, 30_000)` has no overlap guard, so a slow cycle can double-send/double-delete.
   - Setup sessions in `reminderSessions.ts` are only cleaned up lazily; an abandoned setup flow leaks forever.
   - `buildButtonRow` is duplicated verbatim in two files.

2. **UX problems**, independent of the bugs: creating a reminder means typing a `DD/MM/YYYY` date, an `HH:MM` time, and a cryptic `1h/2d`-style repeat string by hand, interpreted against the *bot server's* local time rather than the creator's — there is no timezone concept anywhere in the system. The flow is also several disconnected steps (slash command → ephemeral reply → mention select → chase-up button → confirm button).

This overhaul fixes both, and additionally builds a web dashboard UI so reminders can be created/managed from the site instead of only via Discord slash commands.

## Goals

1. Every user has a saved IANA timezone (set via the web `/me` profile or a new `/reminder timezone` bot command); all reminder date/time input is interpreted in the creating user's timezone and converted correctly to a UTC instant.
2. The bot's create/edit flow replaces typed date/time/repeat strings with quick-pick presets and select menus, cutting the common case down to a handful of clicks with no typing beyond the message itself.
3. All eight bugs listed above are fixed as part of this pass, not deferred.
4. A new `Unit → Reminders` tab on the web dashboard provides full CRUD (create/edit/delete/enable/disable) over the same `reminders` collection the bot's scheduler already polls — no second delivery pipeline.
5. A J4-Administration-only "Channel Access" debug view on that page shows, per Discord channel, whether the bot can view/send — for diagnosing delivery failures without touching the bot's logs.

## Non-goals

- No change to the delivery mechanism itself — reminders are still posted as channel messages with @mentions and acknowledgement/chase-up buttons, not DMs, email, or web push.
- No free-text natural-language time parsing (e.g. "in 2 hours" typed as one string) — presets plus a structured custom modal were chosen over a parsing library to avoid silently-wrong interpretations, which is exactly the class of bug this overhaul removes.
- The new Discord permission-calculation utility is written generically but its UI stays scoped to the reminders admin page — not a standalone "Discord channel permissions" admin tool (that can be a future extension if wanted).
- No reminder history/analytics.

## Data model

### `User.timezone` (new field, shared type)

`types/user.d.ts` (monorepo-root, shared by `apps/web` and `apps/bot`) gets a new field:

```ts
timezone: string | null   // IANA zone name, e.g. "Australia/Sydney"; null = unset
```

Set via:
- Web: a new field on the `/me` profile page (alongside bio/TS-link/reset-token), a searchable `<select>`/autocomplete of `Intl.supportedValuesOf('timeZone')`.
- Bot: new `/reminder timezone` command using the same autocomplete-string-option pattern the codebase already uses for date/time (filters `Intl.supportedValuesOf('timeZone')` by the typed substring).

Both write to the same `User.timezone` field on `Db.users`. If a user starts creating a reminder (bot or web) with `timezone` unset, the flow shows the same timezone picker inline before letting them pick a time, rather than dead-ending.

### `Reminder` type moves to shared `types/`

Currently `apps/bot/types/remindme.d.ts`, bot-only. Since the web app will read/write it directly via `Db.reminders`, it moves to the monorepo-root `types/` dir (same convention as `User`/`Role`/`Optional` — see `types/README.md`), and `apps/web/lib/mongo.ts` gains a `reminders: MongoCollection<Reminder>` entry pointing at the same `reminders` collection the bot already uses (same Mongo DB, both apps already connect via `config.mongo.uri`/`config.mongo.db`).

### Schema changes on `Reminder`

```ts
interface Reminder {
    _id: ObjectId
    enabled: boolean            // was `boolean | null`; see migration below
    expected: Date
    acknowledged: string[] | true | null
    nextCheck: Date | null
    chaseUpOffset: number | null
    repeat: number               // ms; unchanged, still the scheduling source of truth
    repeatLabel: string | null   // was `repeatRaw` (e.g. "1h/2d"); now a display label, e.g. "Daily", "Every 3 days"
    by: string
    who: string[]
    message: string
    channel: string
    messageId: string | null
    sendFailed: boolean
}
```

`repeat` (ms) stays the only value `processReminders.ts` schedules off; `repeatLabel` exists purely so the web/bot UIs can render a human string without re-deriving it from raw milliseconds.

### Migration

A one-off script (run before deploying the new bot/web code):
1. Report how many existing `Reminder` docs have `enabled: null` (and log their `_id`/`message`) before touching anything, since flipping them to `true` changes live scheduling behavior — they'll start firing instead of being silently stuck. Confirm with whoever owns the affected reminders before applying, or manually re-review the reported list.
2. Set `enabled: null` → `true` on all `Reminder` docs.
3. Rename `repeatRaw` → `repeatLabel`, converting the raw `1h/2d` syntax into a display label (or `null` if the existing value doesn't match a known preset — falls back to "Custom").

## Bot redesign

**New `/reminder timezone`** — autocomplete string option, filtered against `Intl.supportedValuesOf('timeZone')`; e.g. typing "syd" surfaces `Australia/Sydney`. Saves directly to `Db.users`.

**`/reminder create message:<string>`** — the slash command now takes only the message. The bot replies (ephemeral) with:
- Quick-pick time buttons: "In 1 hour," "In 3 hours," "Tomorrow 9am," "Next Monday 9am," "Custom time…" Clicking a preset computes the UTC instant directly from the user's saved timezone via `date-fns-tz`'s `fromZonedTime()`. "Custom time…" opens a modal (Date `DD/MM/YYYY` + Time `HH:MM` fields, validated, then run through the same `fromZonedTime()` conversion — this is what fixes the `setDate()`/`setMonth()` overflow bug, since the whole hand-rolled `Date` mutation sequence is replaced).
- If `me.timezone` is `null`, the first click on any preset (or "Custom time…") instead shows the timezone picker (same component `/reminder timezone` uses) inline, then re-shows the time options once set.
- Once a time is set, the ephemeral message updates in place to add: a mentionable select (who to remind), a **Repeat select menu** (`None / 15m / 30m / Hourly / Daily / Weekly / Monthly / Custom…`, with "Custom…" opening a small modal for an oddball interval), a **Chase-up** control with its own presets ("15 min after," "30 min after," "1 hour after," "Custom…"), a Ping-Me toggle, and Confirm.

**`/reminder edit`** reuses the identical component flow, pre-filled from the existing document.

**`/reminder remove`, `/reminder enable`, `/reminder disable`, `/reminder admin`, `/reminder help`** — unchanged in shape, with the `remove` autocomplete bug fixed (reads `getString('reminder')`) and the admin list's enabled/disabled badge now trustworthy since `enabled` is non-nullable.

**Bug fixes bundled into this pass:**
- `await` added to `processReminders.ts`'s `channel.send`/`updateOne`/`deleteOne` calls and the reminder "disable" button's `interaction.update`/`updateOne` calls.
- `App.user(reminder.by)` guarded — if the creator isn't resolvable, the embed falls back to an "Unknown" author label instead of throwing (the reminder still sends).
- `setInterval` in `ready.ts` gets a simple in-flight boolean guard so overlapping cycles can't double-process.
- `reminderSessions.ts` gets a periodic sweep (e.g. every 5 minutes) in addition to the existing lazy cleanup, so abandoned setup sessions don't leak indefinitely.
- `buildButtonRow` de-duplicated into one shared module (e.g. `apps/bot/lib/reminderComponents.ts`), imported by both the button and modal interaction handlers.

**New dependency:** `date-fns-tz` added to both `apps/bot` and `apps/web` (pairs with the `date-fns` v4 already in `apps/web`) for the `fromZonedTime()`/`toZonedTime()` conversions used on both sides.

## Web UI — `Unit → Reminders`

**Sidebar**: new entry in `StaffSidebar.tsx`'s `Unit` section, `{ label: 'Reminders', href: '/dashboard/unit/reminders', visible: true }` — same access tier as Calendar/SOPs (any ASOT member).

**Page structure** (`app/dashboard/unit/reminders/`, following the `CalendarPanel.tsx` pattern — client component fetching from a dedicated API namespace):

- **My Reminders (default view)** — reminders where the current user is `by` or appears in `who`. Card/list per reminder: message, next-due time (rendered via `Intl.DateTimeFormat` in the user's saved `timezone`), repeat label, who's pinged, chase-up status, and Edit / Delete / Enable-Disable actions.
- **Create/Edit modal** — message, channel picker (populated from a new `GET /api/reminders/channels` route wrapping the existing `botRequest()` guild-channels call), date + time fields labelled with the user's timezone (with the inline "set your timezone" prompt if unset, matching the bot), who-to-remind (mentionable multi-select), repeat preset select, chase-up preset select, ping-me toggle. Writes go straight to `Db.reminders` — the existing bot `processReminders` cron is the only consumer, so no new scheduler is needed.
- **All Reminders (J4-Administration only)** — mirrors `/reminder admin`: search by message text, list every reminder in the guild with creator name, same actions.
- **Channel Access (J4-Administration only)** — debug view listing every guild channel with computed "Bot can view" / "Bot can send" status. Backed by a new `lib/discord/permissions.ts` utility that replicates Discord's permission-overwrite algorithm purely over REST (the web app has no live gateway client): base permissions from the bot's guild roles → apply the `@everyone` overwrite → apply the bot's role overwrites → apply any bot-specific member overwrite → check the `VIEW_CHANNEL`/`SEND_MESSAGES` bits. New route: `GET /api/admin/reminders/channel-access`.

**New API routes:**
- `GET/POST /api/reminders` — list mine (+ pinged-in) / create
- `PATCH /api/reminders/[id]`, `DELETE /api/reminders/[id]` — edit (including enable/disable) / delete
- `GET /api/reminders/channels` — channel list for the picker
- `GET /api/admin/reminders/channel-access` — Channel Access panel data (J4 gate)

**Permissions:** new `PERMISSIONS.reminders.admin: ['J4-Administration']` entry in `lib/permissions.ts`, gating the All Reminders and Channel Access views (J4-Administration already bypasses every check via `hasRoles()`'s hardcoded override, so this entry is primarily self-documenting, consistent with how other admin-only keys in that file are recorded).

## Error handling

- Reminder creation/edit on both bot and web validates the computed UTC instant is in the future before saving (reject otherwise with a clear message) — this already implicitly existed via chase-up-after-reminder validation; extend the same check to the reminder time itself.
- `processReminders.ts` failures (channel unreachable, send fails) continue to DM the creator once (`sendFailed` flag, unchanged behavior) — now reliably `await`ed so failures can't crash the process.
- Web API routes wrap all DB/Discord REST calls in try/catch returning structured JSON errors (existing codebase convention); the Channel Access panel treats a per-channel permission-overwrite parse failure as "unknown" (rendered distinctly from true/false) rather than failing the whole page.

## Testing

No automated test suite exists in this repo (`apps/web/CLAUDE.md`: "No test suite exists"). Verification is manual:
- Bot: create/edit/remove a reminder through the new flow across a DST boundary and a month-end date to confirm the date-math fix; confirm a reminder created with no timezone set prompts correctly; confirm `/reminder admin` badges match actual delivery.
- Web: create a reminder from the dashboard and confirm it fires via the existing bot cron; confirm the Channel Access panel's view/send flags match reality for a channel where the bot is deliberately denied access.
- Migration: dry-run the `enabled: null` report step against production data before applying the flip.
