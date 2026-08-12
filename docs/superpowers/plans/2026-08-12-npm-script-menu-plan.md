# NPM Script Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace most of the monorepo's scattered npm scripts with a single interactive menu (`npm run menu`) covering dev/build/start, one-off setup, and migrations across `apps/web`, `apps/bot`, and the root `scripts/` folder.

**Architecture:** A new `scripts/menu.mjs` at the repo root uses `@clack/prompts` for a two-level select menu (category → item). Each item spawns the underlying command as a child process with `stdio: 'inherit'`, using a root-level `.env` parsed by the menu itself. "Run" items shell out to npm scripts that remain in `apps/web`/`apps/bot`'s own `package.json` (Docker depends on those directly). "Setup" and "Migration" items invoke the target `.mjs` files directly, since their npm-script wrappers are being removed.

**Tech Stack:** Node.js (ESM, `.mjs`), `@clack/prompts` (new dependency), Node's built-in `child_process`/`fs`/`path`. No test framework — this repo has none for either app; verification is manual (`npm run menu`, exercise each entry).

## Global Constraints

- Docker's `CMD ["npm", "start"]` in both `apps/web/dockerfile` and `apps/bot/dockerfile`, and `apps/web/dockerfile`'s build-time `RUN ... npm run build`, depend on `dev`, `dev-collab`, `build`, `start` staying exactly as-is in `apps/web/package.json`, and `start` staying in `apps/bot/package.json`. Never remove or rename these.
- `apps/bot/package.json` is not touched by this plan at all.
- `apps/web/scripts/scrape-milpacs.mjs`, `apps/web/scripts/import-a3-markers.ps1`, and `apps/web/scripts/import-metis-markers.ps1` are out of scope — do not add menu entries for them, do not modify them.
- No CLI-argument passthrough (e.g. `npm run menu -- init-db`) — out of scope.
- The repo root `scripts/` folder already holds the six ungrouped `migrate-*.mjs` files (`migrate-batch1-permissions.mjs`, `migrate-batch2-permissions.mjs`, `migrate-department-leadership.mjs`, `migrate-pages-member-permission.mjs`, `migrate-reminders-schema.mjs`, `migrate-reservist-role.mjs`) — all take no flags for a dry run and `--apply` to write.
- `apps/web/scripts/migrate-orbat-roles.mjs` and `apps/web/scripts/backfill-mastersheet-date-sort.mjs` follow the same dry-run/`--apply` convention.
- Windows line endings: this repo's git config normalizes LF→CRLF on checkout (seen as a warning on every commit) — this is expected, not an error.

---

### Task 1: Menu core — root package.json, `scripts/menu.mjs` skeleton, and the "Run" category

**Files:**
- Modify: `package.json` (repo root)
- Create: `scripts/menu.mjs`

**Interfaces:**
- Produces (used by Tasks 2 and 3): `ROOT` and `WEB` path constants, `ENV` object, `run(command, args, opts)` → `Promise<number>` (spawns with `stdio:'inherit'`, `shell:true`, resolves the child's exit code), `reportExit(code)`, and the category/select main loop that Tasks 2–3 add items to by appending to `SETUP_ITEMS` / `MIGRATION_ITEMS` arrays and adding a `case` in the category switch.

- [ ] **Step 1: Add the `@clack/prompts` dependency and `menu` script to root `package.json`, remove the five convenience scripts it replaces**

Current root `package.json`:
```json
{
  "name": "asot-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/bot"
  ],
  "scripts": {
    "install:all": "npm install && npm --prefix apps/web install",
    "dev:web:collab": "npm --prefix apps/web run dev-collab",
    "build:web": "npm --prefix apps/web run build",
    "start:web": "npm --prefix apps/web run start",
    "dev:bot": "npm run dev --workspace=apps/bot",
    "start:bot": "npm run start --workspace=apps/bot"
  }
}
```

Replace its `scripts` block and add a `dependencies` block:
```json
{
  "name": "asot-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/bot"
  ],
  "scripts": {
    "install:all": "npm install && npm --prefix apps/web install",
    "menu": "node scripts/menu.mjs"
  },
  "dependencies": {
    "@clack/prompts": "^1.7.0"
  }
}
```

- [ ] **Step 2: Install the new dependency**

Run: `npm install`
Expected: `package-lock.json` at the repo root gains `@clack/prompts` (and its transitive deps) and the command exits 0.

- [ ] **Step 3: Create `scripts/menu.mjs`**

```javascript
#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as p from '@clack/prompts'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(__dirname, '..')
export const WEB = join(ROOT, 'apps', 'web')

// ─── Env ────────────────────────────────────────────────────────────────────
// Same hand-rolled .env parsing apps/web/scripts/init-db.mjs already uses —
// no dotenv dependency needed just to merge a few vars into a child's env.

function loadRootEnv() {
    const envPath = join(ROOT, '.env')
    if (!existsSync(envPath)) return {}
    const result = {}
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx === -1) continue
        const key = trimmed.slice(0, eqIdx).trim()
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '')
        result[key] = value
    }
    return result
}

export const ENV = { ...process.env, ...loadRootEnv() }

// Ignore SIGINT at the parent level so Ctrl-C during a spawned child (e.g. a
// dev server) kills the child and returns to the menu, instead of also
// killing this process. The child still receives and handles the same
// SIGINT normally — it's in the same terminal foreground group.
process.on('SIGINT', () => {})

// ─── Process spawning ───────────────────────────────────────────────────────

export function run(command, args, opts = {}) {
    return new Promise(resolve => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            env: ENV,
            cwd: ROOT,
            ...opts,
        })
        child.on('exit', code => resolve(code ?? 1))
        child.on('error', err => {
            console.error(`\n  Failed to start "${command}": ${err.message}`)
            resolve(1)
        })
    })
}

export function reportExit(code) {
    if (code !== 0) p.log.error(`exited with code ${code}`)
}

// ─── Menu items ─────────────────────────────────────────────────────────────

const RUN_ITEMS = [
    { label: 'Dev — web', run: () => run('npm', ['--prefix', 'apps/web', 'run', 'dev']) },
    { label: 'Dev — web (collab)', run: () => run('npm', ['--prefix', 'apps/web', 'run', 'dev-collab']) },
    { label: 'Dev — bot', run: () => run('npm', ['run', 'dev', '--workspace=apps/bot']) },
    { label: 'Build — web', run: () => run('npm', ['--prefix', 'apps/web', 'run', 'build']) },
    { label: 'Start — web (prod)', run: () => run('npm', ['--prefix', 'apps/web', 'run', 'start']) },
    { label: 'Start — bot (prod)', run: () => run('npm', ['run', 'start', '--workspace=apps/bot']) },
]

export const SETUP_ITEMS = []
export const MIGRATION_ITEMS = []

// ─── Main loop ──────────────────────────────────────────────────────────────

async function runMigration(item) {
    p.log.step(`Dry run: ${item.label}`)
    const dryCode = await run('node', [item.script], { cwd: item.cwd })
    if (dryCode !== 0) {
        p.log.error(`dry run exited with code ${dryCode} — not offering to apply`)
        return
    }

    const apply = await p.confirm({ message: 'Apply these changes?', initialValue: false })
    if (p.isCancel(apply) || !apply) {
        p.log.info('Skipped — no changes applied')
        return
    }

    p.log.step(`Applying: ${item.label}`)
    const applyCode = await run('node', [item.script, '--apply'], { cwd: item.cwd })
    reportExit(applyCode)
}

async function main() {
    p.intro('ASOT — Project Menu')

    while (true) {
        const category = await p.select({
            message: 'What do you want to do?',
            options: [
                { value: 'run', label: 'Run' },
                { value: 'setup', label: 'Setup / one-off' },
                { value: 'migrations', label: 'Migrations' },
                { value: 'quit', label: 'Quit' },
            ],
        })

        if (p.isCancel(category) || category === 'quit') break

        const items = { run: RUN_ITEMS, setup: SETUP_ITEMS, migrations: MIGRATION_ITEMS }[category]

        if (items.length === 0) {
            p.log.warn('Nothing here yet.')
            continue
        }

        const choice = await p.select({
            message: 'Pick one',
            options: [
                ...items.map((item, i) => ({ value: i, label: item.label })),
                { value: 'back', label: '← Back' },
            ],
        })

        if (p.isCancel(choice) || choice === 'back') continue

        const item = items[choice]
        if (category === 'migrations') {
            await runMigration(item)
        } else {
            reportExit(await item.run())
        }
    }

    p.outro('Bye!')
}

main()
```

- [ ] **Step 4: Verify the menu launches and the Run category works**

Run: `npm run menu`
Expected: A clack intro banner, then a "What do you want to do?" select with Run / Setup / one-off / Migrations / Quit. Select **Run** with arrow keys + Enter → select **Dev — web** → confirm `next dev` starts (server boots, prints its usual "Ready" output). Press Ctrl-C → confirm it stops the dev server and returns to the top-level "What do you want to do?" prompt rather than exiting the whole menu process. Select **Quit** → confirm a clean exit with no stack trace.

Also confirm **Setup / one-off** and **Migrations** currently show "Nothing here yet." (they're wired up in Tasks 2 and 3) rather than crashing.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/menu.mjs
git commit -m "feat(menu): add interactive script menu with Run category"
```

---

### Task 2: "Setup / one-off" category — init-db, generate-terrain, lint

**Files:**
- Modify: `scripts/menu.mjs` (populate `SETUP_ITEMS`)
- Modify: `apps/web/package.json` (remove `lint`, `init-db`, `generate-terrain` scripts)

**Interfaces:**
- Consumes from Task 1: `WEB`, `ROOT`, `run(command, args, opts)`, `SETUP_ITEMS` (exported empty array to push into).

- [ ] **Step 1: Remove the three scripts from `apps/web/package.json`**

Current:
```json
  "scripts": {
    "dev": "dotenv -e ../../.env -- next dev",
    "dev-collab": "dotenv -v NODE_ENV=development -e ../../.env -- node --max-old-space-size=4096 server.mjs",
    "build": "dotenv -e ../../.env -- next build",
    "start": "dotenv -v NODE_ENV=production -e ../../.env -- node server.mjs",
    "lint": "next lint",
    "generate-terrain": "node scripts/generate-terrain.mjs",
    "init-db": "node scripts/init-db.mjs",
    "migrate-orbat-roles": "dotenv -e ../../.env -- node scripts/migrate-orbat-roles.mjs",
    "backfill-mastersheet-date-sort": "dotenv -e ../../.env -- node scripts/backfill-mastersheet-date-sort.mjs"
  },
```

Replace with (leaves the two migration scripts for Task 3 to remove):
```json
  "scripts": {
    "dev": "dotenv -e ../../.env -- next dev",
    "dev-collab": "dotenv -v NODE_ENV=development -e ../../.env -- node --max-old-space-size=4096 server.mjs",
    "build": "dotenv -e ../../.env -- next build",
    "start": "dotenv -v NODE_ENV=production -e ../../.env -- node server.mjs",
    "migrate-orbat-roles": "dotenv -e ../../.env -- node scripts/migrate-orbat-roles.mjs",
    "backfill-mastersheet-date-sort": "dotenv -e ../../.env -- node scripts/backfill-mastersheet-date-sort.mjs"
  },
```

- [ ] **Step 2: Populate `SETUP_ITEMS` in `scripts/menu.mjs`**

Find the line:
```javascript
export const SETUP_ITEMS = []
```

Replace with:
```javascript
export const SETUP_ITEMS = [
    { label: 'First-time setup (init-db)', run: () => run('node', ['scripts/init-db.mjs'], { cwd: WEB }) },
    { label: 'Generate terrain', run: () => run('node', ['scripts/generate-terrain.mjs'], { cwd: WEB }) },
    { label: 'Lint — web', run: () => run('npm', ['exec', '--prefix', 'apps/web', '--', 'next', 'lint']) },
]
```

(`npm exec --prefix apps/web -- next lint` resolves and runs `apps/web`'s local `next` binary correctly on both Windows and POSIX without needing to hand-resolve `.bin/next` vs `.bin/next.cmd` — verified working via `npm exec --prefix apps/web -- next --version` before writing this plan. `run`'s default `cwd: ROOT` is correct here since `--prefix` does the directory targeting.)

- [ ] **Step 3: Verify each Setup item**

Run: `npm run menu`, select **Setup / one-off**.

- **First-time setup (init-db)** — confirm it launches the exact same interactive wizard `npm --prefix apps/web run init-db` used to (banner, "[1/4] Site Configuration" prompt etc.). Ctrl-C or complete/abandon the wizard, confirm it returns to the menu.
- **Generate terrain** — confirm it runs and prints the same output `node apps/web/scripts/generate-terrain.mjs` produces when run directly (process all worlds).
- **Lint — web** — confirm it runs ESLint and prints the same output `npm --prefix apps/web run lint` used to (or would, before removal) — compare against running `apps/web/node_modules/.bin/next lint` directly from `apps/web` if in doubt.

- [ ] **Step 4: Commit**

```bash
git add scripts/menu.mjs apps/web/package.json
git commit -m "feat(menu): add setup/one-off category (init-db, generate-terrain, lint)"
```

---

### Task 3: "Migrations" category — all 8 migration scripts

**Files:**
- Modify: `scripts/menu.mjs` (populate `MIGRATION_ITEMS`)
- Modify: `apps/web/package.json` (remove `migrate-orbat-roles`, `backfill-mastersheet-date-sort` scripts)

**Interfaces:**
- Consumes from Task 1: `ROOT`, `WEB`, `run`, `runMigration(item)` (already implemented in Task 1 — expects `{ label, script, cwd }`), `MIGRATION_ITEMS` (exported empty array to push into).

- [ ] **Step 1: Remove the two remaining scripts from `apps/web/package.json`**

Current `scripts` block (after Task 2's edit):
```json
  "scripts": {
    "dev": "dotenv -e ../../.env -- next dev",
    "dev-collab": "dotenv -v NODE_ENV=development -e ../../.env -- node --max-old-space-size=4096 server.mjs",
    "build": "dotenv -e ../../.env -- next build",
    "start": "dotenv -v NODE_ENV=production -e ../../.env -- node server.mjs",
    "migrate-orbat-roles": "dotenv -e ../../.env -- node scripts/migrate-orbat-roles.mjs",
    "backfill-mastersheet-date-sort": "dotenv -e ../../.env -- node scripts/backfill-mastersheet-date-sort.mjs"
  },
```

Replace with:
```json
  "scripts": {
    "dev": "dotenv -e ../../.env -- next dev",
    "dev-collab": "dotenv -v NODE_ENV=development -e ../../.env -- node --max-old-space-size=4096 server.mjs",
    "build": "dotenv -e ../../.env -- next build",
    "start": "dotenv -v NODE_ENV=production -e ../../.env -- node server.mjs"
  },
```

- [ ] **Step 2: Populate `MIGRATION_ITEMS` in `scripts/menu.mjs`**

Find the line:
```javascript
export const MIGRATION_ITEMS = []
```

Replace with:
```javascript
export const MIGRATION_ITEMS = [
    { label: 'Migrate ORBAT roles (web)', script: 'scripts/migrate-orbat-roles.mjs', cwd: WEB },
    { label: 'Backfill mastersheet date sort (web)', script: 'scripts/backfill-mastersheet-date-sort.mjs', cwd: WEB },
    { label: 'Migrate: batch1 permissions', script: 'scripts/migrate-batch1-permissions.mjs', cwd: ROOT },
    { label: 'Migrate: batch2 permissions', script: 'scripts/migrate-batch2-permissions.mjs', cwd: ROOT },
    { label: 'Migrate: department leadership', script: 'scripts/migrate-department-leadership.mjs', cwd: ROOT },
    { label: 'Migrate: pages.member permission', script: 'scripts/migrate-pages-member-permission.mjs', cwd: ROOT },
    { label: 'Migrate: reminders schema', script: 'scripts/migrate-reminders-schema.mjs', cwd: ROOT },
    { label: 'Migrate: reservist role', script: 'scripts/migrate-reservist-role.mjs', cwd: ROOT },
]
```

- [ ] **Step 3: Verify the migration flow without mutating data**

Run: `npm run menu`, select **Migrations**, pick any entry (e.g. **Migrate: reservist role** — it's already been run historically in this repo, so its dry run should report nothing to change, making it the safest one to exercise).

Expected: it prints "Dry run: ..." then the script's own dry-run report, then a "Apply these changes?" confirm defaulting to **No**. Press Enter (accept the default `No`) — confirm it prints "Skipped — no changes applied" and returns to the menu without running `--apply`. This validates the full prompt flow without writing to the database. (Do not accept "Yes" during this verification unless you intend to actually apply that specific migration.)

Also verify a genuinely no-op-safe one end-to-end if you have a disposable dev database available: run its dry run, confirm apply, and check the script's own "N updated" output matches what a second dry run afterward reports (0 remaining).

- [ ] **Step 4: Commit**

```bash
git add scripts/menu.mjs apps/web/package.json
git commit -m "feat(menu): add migrations category with dry-run/apply confirm flow"
```

---

### Task 4: Documentation

**Files:**
- Modify: `CLAUDE.md` (repo root)
- Modify: `apps/web/CLAUDE.md`

**Interfaces:** None — doc-only task, no code.

- [ ] **Step 1: Update the root `CLAUDE.md` Commands section**

Find:
```markdown
## Commands (from repo root)

```bash
npm run install:all     # installs root deps + apps/web deps (apps/bot is an npm workspace, installed by root install)
npm run dev:web:collab  # apps/web dev server + collaborative editor
npm run dev:bot         # apps/bot dev (tsx watch)
npm run build:web       # apps/web production build
npm run start:web       # apps/web production server
npm run start:bot       # apps/bot production
```

For lint/typecheck/single-test-equivalent commands, see each app's own `CLAUDE.md` — they're not unified at the root.
```

Replace with:
```markdown
## Commands (from repo root)

```bash
npm run install:all     # fresh clone: installs root deps + apps/web deps (apps/bot is an npm workspace, installed by root install)
npm run menu             # interactive menu — dev/build/start for both apps, first-time setup (init-db), migrations
```

`npm run menu` (`scripts/menu.mjs`) is the primary way to run anything in this repo day-to-day — it replaces what used to be a long list of separate npm scripts. See its own source for the full item list; categories are Run, Setup / one-off, and Migrations.

For lint/typecheck commands, see each app's own `CLAUDE.md` — they're not unified at the root.
```

- [ ] **Step 2: Update `apps/web/CLAUDE.md`'s Commands section**

Find:
```markdown
## Commands

```bash
npm run dev           # Standard dev server (no collab WebSocket)
npm run dev-collab    # Dev server + Hocuspocus WebSocket (required for collaborative editor)
npm run build         # Production build
npm start             # Production server (Next.js + Hocuspocus on same port via server.mjs)
npm run lint          # ESLint
npm run generate-terrain   # Pre-generate terrain images from ../../storage/maps DEM data (run once after install)
npm run init-db            # Interactive setup wizard — generates .env and seeds first admin user
```

**No test suite exists.** The `.test/` directory holds Playwright scripts for manual verification only.
```

Replace with:
```markdown
## Commands

```bash
npm run dev           # Standard dev server (no collab WebSocket)
npm run dev-collab    # Dev server + Hocuspocus WebSocket (required for collaborative editor)
npm run build         # Production build
npm start             # Production server (Next.js + Hocuspocus on same port via server.mjs)
```

Lint, the first-time setup wizard (init-db), terrain generation, and the migration scripts in `scripts/` are no longer separate npm scripts here — run them from the repo root's `npm run menu` instead (see root `CLAUDE.md`).

**No test suite exists.** The `.test/` directory holds Playwright scripts for manual verification only.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md apps/web/CLAUDE.md
git commit -m "docs: point CLAUDE.md commands at npm run menu"
```
