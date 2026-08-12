# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Community management platform for the **Australian Special Operations Taskforce (ASOT)** — an ARMA 3 milsim unit. Staff portal and public-facing site: operations management, member milpacs, an ORBAT, ticketing, training, attendance tracking, and more.

This is a monorepo with two deployable apps sharing a `types/` directory and a bind-mounted `storage/` directory. **Each app has its own `CLAUDE.md` with architecture detail — read it before working in that app:**

- **`apps/web`** ([CLAUDE.md](apps/web/CLAUDE.md)) — Next.js 15 App Router site. Staff dashboard, public pages, operations board, all API routes, and a Hocuspocus WebSocket server for the real-time collaborative document editor.
- **`apps/bot`** ([CLAUDE.md](apps/bot/CLAUDE.md)) — Discord bot (discord.js v14): slash commands, interactions, guild event handling, scheduled member/role sync.

This file only covers what's shared across both.

---

## Commands (from repo root)

```bash
npm run install:all     # fresh clone: installs root deps + apps/web deps (apps/bot is an npm workspace, installed by root install)
npm run menu            # interactive menu — dev/build/start for both apps, first-time setup (init-db), migrations
```

`npm run menu` (`scripts/menu.mjs`) is the primary way to run anything in this repo day-to-day — it replaces what used to be a long list of separate npm scripts. See its own source for the full item list; categories are Run, Setup / one-off, and Migrations.

For lint/typecheck commands, see each app's own `CLAUDE.md` — they're not unified at the root.

---

## Shared Infrastructure

### `types/` — shared MongoDB document shapes

Ambient global type declarations used by **both** apps against the same collections (`User`, `Role`, `Optional`, `Reminder`). Both apps' `tsconfig.json` include this directory alongside their own local `types/`, and both Dockerfiles `COPY types/` into the image. **`apps/web`'s shape is authoritative** when the two apps' concepts diverge — see `types/README.md` for the full sharing convention before adding or editing a file here.

### `.env` — one file, both apps

A single `.env` at the repo root is read by both apps (`apps/*/package.json` dev/start scripts load it via `dotenv -e ../../.env`). `.env.template` documents every variable and marks which are shared (Mongo connection, Discord bot token/guild) vs. app-only. Copy it to `.env` for local dev — see `apps/web/CLAUDE.md`'s env table and `apps/bot/CLAUDE.md`'s env table for what each variable does.

### `storage/` — bind-mounted assets

Upload/asset storage (maps, gallery, milpacs, per-department files, bot data) shared between the host and both containers, kept out of the built images (mounted via `docker-compose.yml`, not `COPY`'d). Not tracked in git except `storage/README.md`, which documents the layout.

### `scripts/` — one-off Mongo migrations

Standalone `.mjs` scripts for schema/data migrations, run manually (not part of any app's build or startup).

---

## Deployment

`docker-compose.yml` builds `web` and `bot` as separate containers from the same build context (repo root), both reading the shared `.env` and the bind-mounted `storage/` tree. `.github/workflows/deploy.yml` deploys on every push to `main`: SSHes into the server, `git pull`s, and runs `docker compose up -d --build --remove-orphans`. There is no CI test/build gate before deploy — pushing to `main` deploys directly.
