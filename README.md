# ASOT

Community management platform for the **Australian Special Operations Taskforce (ASOT)** — an ARMA 3 milsim unit. It's the unit's staff portal and public-facing site: operations management, member milpacs, an ORBAT, ticketing, training, attendance tracking, and more.

## Structure

This is a monorepo with two deployable apps sharing a `types/` directory and a bind-mounted `storage/` directory for uploaded assets:

- **`apps/web`** — Next.js 15 App Router site. Staff dashboard, public pages (milpacs, ORBAT, gallery), operations board, and all API routes. Also hosts a Hocuspocus WebSocket server (via `server.mjs`) for the real-time collaborative document editor used in briefings and SOPs.
- **`apps/bot`** — Discord bot (discord.js v14) handling slash commands, interactions, role sync, and scheduled jobs like reminders.
- **`types/`** — Shared TypeScript types (`User`, `Role`, `Optional`, `Reminder`, etc.) used by both apps against the same MongoDB collections.
- **`storage/`** — Bind-mounted upload/asset storage (maps, gallery, milpacs, per-department files), kept out of the built container images.
- **`scripts/`** — One-off and migration scripts for MongoDB schema changes.

## Running locally

```bash
npm run install:all     # installs root + apps/web dependencies
npm run menu             # interactive menu — dev/build/start for both apps, setup, migrations
```

See each app's own docs for environment variables and setup: `apps/web/CLAUDE.md` and `apps/bot/README.md`.

## Deployment

`docker-compose.yml` builds and runs `web` and `bot` as separate containers, both reading from a shared `.env` file and the bind-mounted `storage/` tree.

## Credits

Built by ASOT community members who volunteered their time and skills. See the in-app **Site Credits** page for the full list of contributors.

Special mention: `AgentDove`, whose creatively-worded README commit is the reason this file finally exists.
