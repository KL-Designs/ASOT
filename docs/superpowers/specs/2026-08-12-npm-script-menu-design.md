# NPM Script Menu — Design

**Date:** 2026-08-12
**Status:** Approved, pending implementation plan

## Problem

The monorepo's npm scripts are spread across three `package.json` files (root, `apps/web`, `apps/bot`) and have accumulated to the point of clutter — 17 scripts across the three files, several of them one-off setup/migration scripts (`init-db`, `generate-terrain`, `migrate-orbat-roles`, `backfill-mastersheet-date-sort`) that get run rarely and are easy to forget the exact name/flags of. A separate six one-off migration scripts in the root `scripts/` folder aren't even wired to npm scripts at all — they're only runnable by remembering the bare `node scripts/migrate-x.mjs --env-file=.env [--apply]` invocation.

## Goal

Replace most of these scripts with a single interactive menu, reachable via `npm run menu` from the repo root, that lists every dev/build/start/setup/migration action in the monorepo and runs the selected one. Scripts that Docker or other tooling depend on directly stay exactly as they are; everything else becomes menu-only.

## Non-goals

- `apps/web/scripts/scrape-milpacs.mjs` is out of scope. It needs a local Ollama server (not something `npm install` can provide) and takes a dozen-plus flags, and isn't currently wired to any npm script. It stays a manually-run advanced script.
- `apps/web/scripts/import-a3-markers.ps1` and `import-metis-markers.ps1` are out of scope — different runtime (PowerShell, not Node), not part of this cleanup.
- No CLI-argument passthrough for scripting/automation (e.g. `npm run menu -- init-db` to skip navigation). The menu is a human-facing convenience tool; nothing currently needs to drive it non-interactively.
- No changes to `apps/bot/package.json` — it's already minimal (`dev`, `start`, `typecheck`) and none of its scripts move.

## Design

### Entry point

A new `scripts/menu.mjs` at the repo root, run via `npm run menu`. Built on [`@clack/prompts`](https://github.com/natemoo-re/clack) for an arrow-key select list (new dependency, added to root `package.json`, currently empty of dependencies).

On startup the menu parses the root `.env` file (reusing the same hand-rolled `parseDotEnv` approach `apps/web/scripts/init-db.mjs` already uses — no new `dotenv` dependency needed at the root) and merges the result into `process.env` for whatever child process it spawns. This replaces the `dotenv-cli` (`dotenv -e ../../.env --`) wrapping that removed npm scripts used to provide.

### Menu structure

```
Run
  Dev — web
  Dev — web (collab)
  Dev — bot
  Build — web
  Start — web (prod)
  Start — bot (prod)
Setup / one-off
  First-time setup (init-db)
  Generate terrain
  Lint — web
Migrations
  Migrate ORBAT roles (web)
  Backfill mastersheet date sort (web)
  Migrate: batch1 permissions
  Migrate: batch2 permissions
  Migrate: department leadership
  Migrate: pages.member permission
  Migrate: reminders schema
  Migrate: reservist role
Quit
```

After any item finishes (or is interrupted with Ctrl-C), control returns to the top-level menu so multiple actions can be run in one session without relaunching `node`.

### Execution model

Three kinds of menu item, each spawning a child process with `stdio: 'inherit'` so the underlying script's own output/prompts (e.g. `init-db.mjs`'s interactive wizard) work unmodified:

1. **Run** — shells out to the script that still lives in `apps/web`'s or `apps/bot`'s own `package.json` (e.g. `npm --prefix apps/web run dev-collab`, `npm run start --workspace=apps/bot`). These wrapper scripts are unchanged; the menu is just a friendlier way to reach them.
2. **Setup/one-off** — invokes the underlying file directly with the right `cwd` and merged env (e.g. `node scripts/init-db.mjs` with `cwd: apps/web`), since these no longer have an npm-script wrapper.
3. **Migrations** — all eight migration scripts (both `apps/web`'s and the root's) already follow the same dry-run-by-default + `--apply` convention. The menu runs the script once with no flags, shows its report, then asks "Apply these changes? (y/N)" via a `@clack/prompts` confirm — if yes, re-runs the same script with `--apply`. A failed dry run (non-zero exit) skips the confirm and returns to the menu with an error indicator instead of offering to apply.

Any spawned process exiting non-zero prints a clear `✗ exited with code N` and returns to the menu — it does not crash the menu process or throw a raw stack trace. Ctrl-C/Esc during a `@clack/prompts` selection (`isCancel`) exits the menu cleanly.

### package.json changes

| File | Removed | Kept |
|---|---|---|
| `apps/web/package.json` | `lint`, `init-db`, `generate-terrain`, `migrate-orbat-roles`, `backfill-mastersheet-date-sort` | `dev`, `dev-collab`, `build`, `start` |
| root `package.json` | `dev:web:collab`, `build:web`, `start:web`, `dev:bot`, `start:bot` | `install:all`, adds `menu` |
| `apps/bot/package.json` | — | unchanged |

`apps/web`'s `dev`/`dev-collab`/`build`/`start` stay because Docker's `CMD ["npm", "start"]` (both `apps/web/dockerfile` and `apps/bot/dockerfile`) depends on `npm start` resolving inside each app directory, independent of anything at the root.

### Documentation

- Root `CLAUDE.md`'s Commands section: replace the `dev:web:collab`/`build:web`/`start:web`/`dev:bot`/`start:bot` list with `npm run install:all` (fresh clone) and `npm run menu` (everything else).
- `apps/web/CLAUDE.md`'s Commands section: drop `lint`/`generate-terrain`/`init-db` from the code block, note they're reachable via the root menu instead.

## Testing

No automated tests exist for scripts in this repo (confirmed: neither app has a test suite). Verification is manual: run `npm run menu` and exercise each category —
- a **Run** item (e.g. Dev — web) starts correctly and Ctrl-C returns to the menu;
- **First-time setup** launches `init-db.mjs`'s existing interactive wizard unmodified;
- **Generate terrain** runs and completes;
- a **Migration** item dry-runs, shows output, prompts to apply, and applying re-runs with `--apply` and reflects the change;
- selecting **Quit** or pressing Ctrl-C at the top level exits cleanly with no stack trace.
