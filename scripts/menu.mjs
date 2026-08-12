#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as p from '@clack/prompts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const WEB = join(ROOT, 'apps', 'web')

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

const ENV = { ...process.env, ...loadRootEnv() }

// Ignore SIGINT at the parent level so Ctrl-C during a spawned child (e.g. a
// dev server) kills the child and returns to the menu, instead of also
// killing this process. The child still receives and handles the same
// SIGINT normally — it's in the same terminal foreground group.
process.on('SIGINT', () => {})

// ─── Process spawning ───────────────────────────────────────────────────────

function run(command, args, opts = {}) {
    return new Promise(resolve => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            env: ENV,
            cwd: ROOT,
            ...opts,
        })
        child.on('exit', (code, signal) => resolve(signal ? 'signal' : (code ?? 1)))
        child.on('error', err => {
            console.error(`\n  Failed to start "${command}": ${err.message}`)
            resolve(1)
        })
    })
}

function reportExit(code) {
    if (code !== 0 && code !== 'signal') p.log.error(`exited with code ${code}`)
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

const SETUP_ITEMS = [
    { label: 'First-time setup (init-db)', run: () => run('node', ['apps/web/scripts/init-db.mjs']) },
    { label: 'Generate terrain', run: () => run('node', ['scripts/generate-terrain.mjs'], { cwd: WEB }) },
    { label: 'Lint — web', run: () => run('npm', ['exec', '--', 'next', 'lint'], { cwd: WEB }) },
]

const MIGRATION_ITEMS = [
    { label: 'Migrate ORBAT roles (web)', script: 'scripts/migrate-orbat-roles.mjs', cwd: WEB },
    { label: 'Backfill mastersheet date sort (web)', script: 'scripts/backfill-mastersheet-date-sort.mjs', cwd: WEB },
    { label: 'Migrate: batch1 permissions', script: 'scripts/migrate-batch1-permissions.mjs', cwd: ROOT },
    { label: 'Migrate: batch2 permissions', script: 'scripts/migrate-batch2-permissions.mjs', cwd: ROOT },
    { label: 'Migrate: department leadership', script: 'scripts/migrate-department-leadership.mjs', cwd: ROOT },
    { label: 'Migrate: pages.member permission', script: 'scripts/migrate-pages-member-permission.mjs', cwd: ROOT },
    { label: 'Migrate: reminders schema', script: 'scripts/migrate-reminders-schema.mjs', cwd: ROOT },
    { label: 'Migrate: reservist role', script: 'scripts/migrate-reservist-role.mjs', cwd: ROOT },
]

// ─── Main loop ──────────────────────────────────────────────────────────────

async function runMigration(item) {
    p.log.step(`Dry run: ${item.label}`)
    const dryCode = await run('node', [item.script], { cwd: item.cwd })
    if (dryCode !== 0) {
        p.log.error(`dry run exited with code ${dryCode} — not offering to apply`)
        return
    }

    const apply = await p.confirm({ message: `Apply these changes to "${ENV.MONGO_DB}"?`, initialValue: false })
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

main().catch(err => {
    p.log.error(err.message)
    process.exit(1)
})
