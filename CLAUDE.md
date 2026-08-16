# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Community management platform for the **Australian Special Operations Taskforce (ASOT)** — an ARMA 3 milsim unit. Staff portal and public-facing site: operations management, member milpacs, an ORBAT, ticketing, training, attendance tracking, and more.

This is a monorepo with three deployable apps sharing a `types/` directory, a `lib/` directory, and a bind-mounted `storage/` directory. **Each app has its own `CLAUDE.md` with architecture detail — read it before working in that app:**

- **`apps/web`** ([CLAUDE.md](apps/web/CLAUDE.md)) — Next.js 15 App Router site. Staff dashboard, public pages, operations board, all API routes, and a Hocuspocus WebSocket server for the real-time collaborative document editor.
- **`apps/bot`** ([CLAUDE.md](apps/bot/CLAUDE.md)) — Discord bot (discord.js v14): slash commands, interactions, guild event handling, scheduled member/role sync.
- **`apps/milpac`** ([CLAUDE.md](apps/milpac/CLAUDE.md)) — stateless MilPac image renderer: composites uniforms, medal boxes and certificates from layered PNGs and returns bytes over HTTP. Holds no database connection and writes nothing to disk — `apps/web` builds the payload and persists the result. [PLAN.md](apps/milpac/PLAN.md) additionally records *why* it looks the way it does: the original it replaces, the bugs that motivated the rewrite, and the asset audits.

This file only covers what's shared across both.

---

## Commands (from repo root)

```bash
npm run install:all     # fresh clone: installs root deps + apps/web deps (apps/bot is an npm workspace, installed by root install)
npm start               # interactive menu — dev/build/start for both apps, first-time setup (init-db), migrations
node scripts/start.mjs  # same menu, invoked directly — see the Windows note below
```

`npm start` (`scripts/start.mjs`) is the primary way to run anything in this repo day-to-day — it replaces what used to be a long list of separate npm scripts. See its own source for the full item list; categories are Run, Setup / one-off, and Migrations. The `.vscode/launch.json` "Start Menu" config runs it too (as `node scripts/start.mjs` directly, for the reason below).

**Windows: Ctrl-C cannot reliably stop just a running dev server from inside the menu** — it was observed taking down the whole menu (and sometimes the whole terminal) regardless of launch method, since Windows broadcasts Ctrl-C to every process sharing the console rather than just the intended child. `scripts/start.mjs` works around this itself rather than depending on the launch method: while a child (dev server, build, etc.) is running, it reads its own stdin directly and treats **Esc, Backspace, or Ctrl-C** as "stop this and return to the menu" and **R** as "restart this in place," then force-kills the child's whole process tree via `taskkill /T` (plain `child.kill()` only signals the immediate `cmd.exe` wrapper `shell: true` introduces, not the actual dev server underneath it) before re-spawning if it was a restart. See `watchControlKeys`/`runOnce`/`runItem`/`killTree` in `scripts/start.mjs`. `runItem` also pins a live header (banner, live Mongo/Discord/TeamSpeak status, PID/port/uptime/CPU/memory, and the same keybind hint) above the item's own scrolling output via a VT100 scroll region, dropping to a compact variant or no header at all in a short terminal — see `buildHeaderLines`/`COMPACT_HEADER_ROWS` in the same file.

For lint/typecheck commands, see each app's own `CLAUDE.md` — they're not unified at the root.

---

## Shared Infrastructure

### `types/` — shared MongoDB document shapes

Ambient global type declarations used by **both** apps against the same collections (`User`, `Role`, `Optional`, `Reminder`). Both apps' `tsconfig.json` include this directory alongside their own local `types/`, and both Dockerfiles `COPY types/` into the image. **`apps/web`'s shape is authoritative** when the two apps' concepts diverge — see `types/README.md` for the full sharing convention before adding or editing a file here.

### `lib/` — shared domain model

Ranks, corps badges, awards and qualifications — the unit vocabulary more than
one app has to agree on. Imported as `@asot/lib` via a tsconfig path alias, the
same convention `types/` uses. **Read `lib/README.md` before adding to it** — it
documents what belongs there and, as importantly, what doesn't (asset filenames
stay with the app that owns the assets; unit policy stays with the app that
applies it).

Adding a consumer takes three steps and two of them fail quietly if skipped: the
tsconfig `paths` + `include` entries, and a `COPY lib/ ./lib/` in that app's
`dockerfile`. Miss the first and the editor resolves it but the build fails;
miss the second and it builds locally and fails in the container.

`RANK_GROUPS` is declared `as const` so `RankAbbr` is a real union of the 99
abbreviations rather than `string`. That is the point: web previously carried a
second rank list in `lib/military/promotion-requirements.ts` that had drifted
out of step, and typing the field made the divergence a compile error.

### `.env` — one file, both apps

A single `.env` at the repo root is read by both apps (`apps/*/package.json` dev/start scripts load it via `dotenv -e ../../.env`). `.env.template` documents every variable and marks which are shared (Mongo connection, Discord bot token/guild) vs. app-only. Copy it to `.env` for local dev — see `apps/web/CLAUDE.md`'s env table and `apps/bot/CLAUDE.md`'s env table for what each variable does.

### `storage/` — bind-mounted assets

Upload/asset storage (maps, gallery, milpacs, per-department files, bot data) shared between the host and both containers, kept out of the built images (mounted via `docker-compose.yml`, not `COPY`'d). Not tracked in git except `storage/README.md`, which documents the layout.

### `scripts/` — one-off Mongo migrations

Standalone `.mjs` scripts for schema/data migrations, run manually (not part of any app's build or startup).

---

## Deployment

`docker-compose.yml` builds `web` and `bot` as separate containers from the same build context (repo root), both reading the shared `.env` and the bind-mounted `storage/` tree. `.github/workflows/deploy.yml` deploys on every push to `main`: SSHes into the server, `git pull`s, and runs `docker compose up -d --build --remove-orphans`. There is no CI test/build gate before deploy — pushing to `main` deploys directly.

**Build any large or multi-step feature/implementation on its own branch, not directly on `main`.** Because a push to `main` deploys immediately with no CI gate, committing straight to `main` mid-implementation would ship an unfinished change live. Branch, do the work, and merge to `main` only once it's ready to deploy.
