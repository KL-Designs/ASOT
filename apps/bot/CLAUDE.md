# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Is

The Discord bot (discord.js v14) for the ASOT community platform: slash commands, button/modal/select-menu interactions, guild event handling, and scheduled sync jobs against the same MongoDB database as `apps/web`. See the repo-root `CLAUDE.md` for how this app fits into the monorepo.

---

## Commands

```bash
npm run dev         # tsx watch index.ts, loads ../../.env via dotenv-cli
npm start            # tsx index.ts (production — no build step, runs TS directly)
npm run typecheck    # tsc --noEmit
```

From the repo root: `npm run menu` (`Dev — bot` / `Start — bot (prod)` under the **Run** category) — this app is the sole entry in the root `package.json` workspaces array.

**No test suite exists.**

---

## Architecture Overview

### Startup and event wiring (`app/index.ts`, `index.ts`)

`index.ts` just imports `app` (constructs the `Discord.Client` and logs in) and `mongo` (fires a connection check). `app/index.ts` does the real wiring:

- All interaction types (`interactionCreate`) are routed to `app/handleInteractions.ts`, which dispatches by interaction kind (chat command, user context command, autocomplete, button, modal, string/mentionable select menu).
- **Custom event handlers in `app/events/*` are wired via a monkey-patched `client.emit`, not `client.on`.** `app/index.ts` overrides `client.emit` so every internal discord.js emit first tries `Events[event](...args)` (silently no-ops if there's no handler for that event name — wrapped in a bare `try/catch`), then proceeds to the real emit. Only `ready`, `error`, `shardError`, `invalidated`, `reconnecting`, `disconnect` are wired the normal way via `client.on(...)`.
- `app/modules/*` are mounted immediately at startup (not gated behind `ready`) by calling `Modules[mod](client)` in a loop; each mount is wrapped in try/catch so one failing module doesn't stop the others or crash the bot.

### `ready.ts` — slash command registration and scheduled jobs

On `ready`:
1. Registers all slash commands (`app.client.application.commands.set(Commands)`) and dumps the result to `commands.json` (generated, gitignored — don't hand-edit).
2. Starts recurring intervals, each independent of the others:
   - `updateStatus` — every 5 min, edits a live status message (channel/message ID stored in `Db.data` under `_id: 'status'`) with server stats from `commands/stats/dig.ts`.
   - `processRoles` — hourly, mirrors every guild role into `Db.roles`.
   - `processMembers` — hourly (`MEMBERS_SYNC_INTERVAL_MS`), syncs guild members into `Db.users` in batches of 10 with a 2s delay between batches (Discord rate limits). Throttled two ways so a bot restart doesn't trigger a redundant full resync: a run-level check against `Db.data._id: 'membersLastSynced'`, and a per-member check against `User.syncedAt`.
   - `processReminders` — every 30s, guarded by an in-memory `processRemindersRunning` flag so a slow run is never re-entered by the next tick.

### Commands (`app/commands/`)

Each command directory exports a `data` (`Discord.SlashCommandBuilder`) + `execute` pair, collected into `ChatCommands`/`UserContextCommands` in `app/commands/index.ts`. `handleInteractions.ts` resolves nested subcommands/subcommand groups by walking `interaction.options.data` for the subcommand path before calling `execute`. Several commands (`recruitment`, `promote`, `award`) are defined but commented out of the exported array — present in the tree, not currently registered.

### `/milpac` — rendering goes through `apps/web`, not the render service

`app/commands/milpac/` (`uniform`, `medals`, both with an optional `member` defaulting to the caller) posts to `apps/web`'s `/api/bot/milpac/{discordId}` and attaches the PNG that comes back. It regenerates every time, so what a member is shown is current as of the moment they asked.

**Do not point this at `apps/milpac` directly.** The render payload — awards to ribbons, qualifications to badges, ORBAT section to corps badge, rank tier to rifleman badge — is derived from web's schema by web's `lib/milpac-gen/data-mapper.ts`. A second implementation here is exactly the drift `apps/milpac/PLAN.md` §3 and §4 describe, where two copies disagreed and every corps rank rendered with no insignia for months. The bot deliberately knows only a Discord id and which of two images it wants.

Two config values matter and are easy to confuse:

- `config.api` (`NEXT_PUBLIC_BASEURL`) — the **public** URL. Anything a member clicks.
- `config.apiInternal` (`WEB_INTERNAL_URL`) — where to reach web **server-to-server**. `docker-compose.yml` overrides it to `http://web:3000` on the bot service so the call stays on the compose network instead of going out through the reverse proxy and back.

`config.apiSecret` (`BOT_API_SECRET`) authenticates the call and must match web's. It is deliberately **not** `required()` — an unset secret leaves the bot running and the commands explain themselves, rather than taking the whole bot down over one feature.

### Interactions (`app/interactions/{buttons,modals,stringSelectMenus,mentionableSelectMenus}/`)

Dispatch is by **custom ID convention**, not per-component registration: `customId` is split on `.`, the first segment is looked up in a flat handler map (e.g. `app/interactions/buttons/index.ts`), and the remaining segments are passed to the handler as a `string[]` of args. When adding a new button/modal/menu, pick a unique first segment and add it to that type's index map — there's no central registry beyond these four files.

### Config and environment (`lib/config.ts`, `config/`)

`lib/config.ts` builds a single `Config` object (typed via ambient `config.d.ts`) from `process.env`, throwing via `required()` if a var used across both apps (Mongo, bot token/guild) is missing. `config/` holds static, non-secret feature config committed to the repo (e.g. `recruiting.ts` channel IDs, `ranks.json`) — distinct from `lib/config.ts`'s env-derived runtime config.

### Database (`lib/mongo.ts`)

Exports a `Db` singleton the same way `apps/web`'s `lib/mongo.ts` does. `Db.users`, `Db.roles`, `Db.optionals`, `Db.reminders` are **shared collections with `apps/web`** — schema lives in the monorepo-root `types/` dir, and web's shape is authoritative (see `types/README.md`). `Db.data` is bot-only: a key-value collection keyed by `_id` (`StatusData`, `SyncStateData` — typed in `apps/bot/types/data.d.ts`).

### Path aliases (non-standard — `apps/bot/tsconfig.json`)

This app does **not** use a `@/` prefix like `apps/web`. Instead `tsconfig.json`'s `baseUrl`/`paths` map bare specifiers to specific files/dirs, e.g. `import App from 'app'` → `app/index.ts`, `import Db from 'mongo'` → `lib/mongo.ts`, `import Commands from 'discord/commands'` → `app/commands/index.ts`. Check `tsconfig.json`'s `paths` block before assuming an import is a package or a relative path.

### Ambient global types (`types/*.d.ts`, `config.d.ts`)

Like `apps/web`, types are declared in `global` scope — no imports needed. Bot-local: `Config`, `Modlist` (`config.d.ts`), `StatusData`, `SyncStateData` (`types/data.d.ts`), plus `gamedig.d.ts`/`players.d.ts`/`ranks.d.ts`. Shared with web (`User`, `Role`, `Optional`, `Reminder`): the monorepo-root `types/` dir, included via this app's `tsconfig.json`.

### Song submission (`app/commands/song/`)

Shells out to `yt-dlp`/`ffmpeg` (installed separately in `dockerfile`, not an npm dependency) — if working on this command locally outside Docker, both need to be on `PATH`.

---

## Environment Variables

Shared with `apps/web` (same names, same `.env` — see `apps/web/CLAUDE.md`): `MONGO_URI`, `MONGO_DB`, `DISCORD_GUILD_ID`, `DISCORD_BOT_TOKEN`, `NEXT_PUBLIC_BASEURL` (used as the bot's `config.api`).

Bot-only:

| Variable | Purpose |
|---|---|
| `DISCORD_MEMBER_ROLE_ID` | Role ID used for member-gated logic |
| `DISCORD_ADMIN_ROLE_ID` | Role ID used for admin-gated logic |
| `DISCORD_NOTIFICATION_CHANNEL_ID` | Channel for bot notifications |
| `DISCORD_SONG_SUBMISSION_CHANNEL_ID` | Channel for the song-submission command |
| `BOT_API_SECRET` | Shared secret for server-to-server calls to `apps/web` (`/milpac`). Must match web's value. Unset closes the route and the commands say so. |
| `WEB_INTERNAL_URL` | Where to reach web for those calls. Defaults to `NEXT_PUBLIC_BASEURL`; compose overrides it to `http://web:3000`. Never use it in a member-facing link. |
