#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as p from '@clack/prompts'
import figlet from 'figlet'

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

// Backspace now cancels the current prompt exactly like Escape/Ctrl-C already
// do — the main loop below already treats a cancelled item-select as "go
// back to the category list" and a cancelled category-select as "quit", so
// this makes Backspace behave like the "← Back" option without needing a
// custom keypress handler.
p.updateSettings({ aliases: { backspace: 'cancel' } })

// Ignore SIGINT at the parent level so Ctrl-C during a spawned child (e.g. a
// dev server) kills the child and returns to the menu, instead of also
// killing this process. The child still receives and handles the same
// SIGINT normally — it's in the same terminal foreground group.
process.on('SIGINT', () => {})

// ─── Process spawning ───────────────────────────────────────────────────────

function spawnChild(command, args, opts = {}) {
    return spawn(command, args, {
        stdio: 'inherit',
        shell: true,
        env: ENV,
        cwd: ROOT,
        ...opts,
    })
}

function run(command, args, opts = {}) {
    return new Promise(resolve => {
        const child = spawnChild(command, args, opts)
        child.on('exit', (code, signal) => resolve(signal ? 'signal' : (code ?? 1)))
        child.on('error', err => {
            console.error(`\n  Failed to start "${command}": ${err.message}`)
            resolve(1)
        })
    })
}

// Runs several commands concurrently (e.g. both dev servers at once).
// Resolves as soon as any one of them exits, killing the rest — otherwise a
// crashed/stopped process would leave its sibling as an orphan still
// attached to the terminal while the menu tries to render the next prompt.
function runAll(commands) {
    return new Promise(resolve => {
        const children = commands.map(([command, args, opts]) => spawnChild(command, args, opts))
        let settled = false

        function finish(code) {
            if (settled) return
            settled = true
            for (const child of children) child.kill()
            resolve(code)
        }

        for (const child of children) {
            child.on('exit', (code, signal) => finish(signal ? 'signal' : (code ?? 1)))
            child.on('error', err => {
                console.error(`\n  Failed to start a process: ${err.message}`)
                finish(1)
            })
        }
    })
}

function reportExit(code) {
    if (code !== 0 && code !== 'signal') p.log.error(`exited with code ${code}`)
}

// ─── Display ────────────────────────────────────────────────────────────────

const C = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    // True-color (24-bit) so the logo renders as ASOT's actual colors rather
    // than whatever red/white the terminal theme happens to remap the
    // standard 16 ANSI colors to.
    bannerRed: '\x1b[38;2;196;30;40m',
    bannerWhite: '\x1b[38;2;245;245;245m',
}

const dim = s => `${C.dim}${s}${C.reset}`
const cyan = s => `${C.cyan}${s}${C.reset}`
const green = s => `${C.green}${s}${C.reset}`
const yellow = s => `${C.yellow}${s}${C.reset}`
const red = s => `${C.red}${s}${C.reset}`
const blue = s => `${C.blue}${s}${C.reset}`

// One color per category, applied to that category's items on the "Pick one"
// screen so the whole list reads as belonging to the category you picked.
const CATEGORY_COLOR = { docker: blue, run: cyan, production: red, setup: green, migrations: yellow }

// Wide-tracked "AUSTRALIAN SPECIAL OPERATIONS TASKFORCE" subtitle — letters
// spaced out, words separated further, echoing the stencil-style lettering
// on the unit's actual banner.
function trackOut(text) {
    return text.split(' ').map(word => word.split('').join(' ')).join('   ')
}

// ─── Connection status ──────────────────────────────────────────────────────
// Live reachability checks for the banner's status lines. Each resolves to
// { ok, detail } — never throws, never blocks longer than its own timeout,
// so one down service can't hang the menu from starting.

function checkTcp(host, port, timeoutMs = 2000) {
    return new Promise(resolve => {
        if (!host || !port) return resolve(false)
        const socket = createConnection({ host, port, timeout: timeoutMs })
        const finish = ok => {
            socket.destroy()
            resolve(ok)
        }
        socket.once('connect', () => finish(true))
        socket.once('timeout', () => finish(false))
        socket.once('error', () => finish(false))
    })
}

function parseHostPort(uri, fallbackPort) {
    try {
        const u = new URL(uri)
        return { host: u.hostname, port: Number(u.port) || fallbackPort }
    } catch {
        return null
    }
}

// Host only — never the full MONGO_URI, which may carry credentials.
async function checkMongo() {
    const parsed = ENV.MONGO_URI ? parseHostPort(ENV.MONGO_URI, 27017) : null
    if (!parsed) return { ok: false, detail: 'not configured' }
    const ok = await checkTcp(parsed.host, parsed.port)
    return { ok, detail: `"${ENV.MONGO_DB}" @ ${parsed.host}:${parsed.port}` }
}

async function checkTeamSpeak() {
    if (!ENV.TS_HOST) return { ok: false, detail: 'not configured' }
    const port = Number(ENV.TS_QUERY_PORT) || 10022
    const ok = await checkTcp(ENV.TS_HOST, port)
    return { ok, detail: `${ENV.TS_HOST}:${port}` }
}

// Hits Discord's REST API directly with the bot token rather than checking
// whether apps/bot happens to be running locally — this way it reports the
// same thing whether the bot lives on this machine, a server, or isn't
// started yet, and doubles as confirmation the token itself is valid.
async function checkDiscord() {
    if (!ENV.DISCORD_BOT_TOKEN) return { ok: false, detail: 'no bot token configured' }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    try {
        const res = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bot ${ENV.DISCORD_BOT_TOKEN}` },
            signal: controller.signal,
        })
        if (!res.ok) return { ok: false, detail: `Discord API returned ${res.status}` }
        const data = await res.json()
        return { ok: true, detail: `logged in as ${data.username}` }
    } catch {
        return { ok: false, detail: 'unreachable' }
    } finally {
        clearTimeout(timeout)
    }
}

// Plain text is padded before coloring — padding an already-ANSI-wrapped
// string counts the invisible escape codes toward its length and throws the
// column alignment off.
function statusLine(label, { ok, detail }) {
    const color = ok ? green : red
    const state = `${ok ? '✓' : '✗'} ${ok ? 'Connected' : 'Unreachable'}`.padEnd(14)
    return `   ${label.padEnd(13)}${color(state)}${dim(detail)}`
}

function printBanner(status) {
    // Clear the screen so the banner starts fresh at the top regardless of
    // terminal height, instead of sitting cramped right under the "> npm
    // start" preamble (a handful of blank lines wouldn't fill a tall window).
    console.clear()

    // Sub-Zero's slanted outline letterforms, rendered in one flat color —
    // white for the wordmark, matching the unit's actual banner, where red
    // is confined to the accent stripe, never the letters themselves.
    const lines = figlet.textSync('ASOT', { font: 'Sub-Zero' }).split('\n').filter(line => line.trim())
    // A solid red bar stands in for the diagonal accent stripe on the unit's
    // actual banner — a real diagonal doesn't hold up across terminal fonts.
    const bar = `${C.bannerRed}▐▐${C.reset} `
    for (const line of lines) console.log(`${bar}${C.bold}${C.bannerWhite}${line}${C.reset}`)
    console.log()
    console.log(`   ${C.bold}${C.bannerWhite}${trackOut('AUSTRALIAN SPECIAL OPERATIONS TASKFORCE')}${C.reset}`)
    console.log()
    console.log(`   ${dim('asotmilsim.com  •  Support: Koda — Discord @itskodas')}`)
    console.log()
    console.log(statusLine('Database', status.mongo))
    console.log(statusLine('Discord Bot', status.discord))
    console.log(statusLine('TeamSpeak', status.teamspeak))
    console.log()
    console.log(`   ${dim('─'.repeat(50))}`)
    console.log()
}

// ─── Menu items ─────────────────────────────────────────────────────────────

const DOCKER_ITEMS = [
    { label: '🏗️  Build & Start', run: () => run('docker', ['compose', 'up', '-d', '--build', '--remove-orphans']) },
    { label: '🛑 Stop', run: () => run('docker', ['compose', 'down']) },
]

const RUN_ITEMS = [
    { label: '🌏 Website', run: () => run('npm', ['--prefix', 'apps/web', 'run', 'dev-collab']) },
    { label: '🤖 Discord', run: () => run('npm', ['run', 'dev', '--workspace=apps/bot']) },
    { label: '🔀 Both', run: () => runAll([
        ['npm', ['--prefix', 'apps/web', 'run', 'dev-collab']],
        ['npm', ['run', 'dev', '--workspace=apps/bot']],
    ]) },
]

const PRODUCTION_ITEMS = [
    { label: '🏗️ Build Website', run: () => run('npm', ['--prefix', 'apps/web', 'run', 'build']) },
    { label: '🚀 Start Website', run: () => run('npm', ['--prefix', 'apps/web', 'run', 'start']) },
    { label: '🚀 Start Discord', run: () => run('npm', ['run', 'start', '--workspace=apps/bot']) },
]

const SETUP_ITEMS = [
    { label: '📦 Install All Dependencies', run: () => run('npm', ['run', 'install:all']) },
    { label: '🧙 Run First-time Setup', run: () => run('node', ['apps/web/scripts/init-db.mjs']) },
    { label: '🗺️ Generate Terrain', run: () => run('node', ['scripts/generate-terrain.mjs'], { cwd: WEB }) },
    { label: '🧹 Lint Website', run: () => run('npm', ['exec', '--', 'next', 'lint'], { cwd: WEB }) },
]

const MIGRATION_ITEMS = [
    { label: '🗃️ Migrate ORBAT roles (web)', script: 'scripts/migrate-orbat-roles.mjs', cwd: WEB },
    { label: '🗃️ Backfill mastersheet date sort (web)', script: 'scripts/backfill-mastersheet-date-sort.mjs', cwd: WEB },
    { label: '🗃️ Migrate: batch1 permissions', script: 'scripts/migrate-batch1-permissions.mjs', cwd: ROOT },
    { label: '🗃️ Migrate: batch2 permissions', script: 'scripts/migrate-batch2-permissions.mjs', cwd: ROOT },
    { label: '🗃️ Migrate: department leadership', script: 'scripts/migrate-department-leadership.mjs', cwd: ROOT },
    { label: '🗃️ Migrate: pages.member permission', script: 'scripts/migrate-pages-member-permission.mjs', cwd: ROOT },
    { label: '🗃️ Migrate: pages.dashboard cleanup', script: 'scripts/migrate-pages-dashboard-cleanup.mjs', cwd: ROOT },
    { label: '🗃️ Migrate: reminders schema', script: 'scripts/migrate-reminders-schema.mjs', cwd: ROOT },
    { label: '🗃️ Migrate: reservist role', script: 'scripts/migrate-reservist-role.mjs', cwd: ROOT },
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
    const s = p.spinner()
    s.start('Checking connections')
    const [mongo, discord, teamspeak] = await Promise.all([checkMongo(), checkDiscord(), checkTeamSpeak()])
    s.stop('Connections checked')

    printBanner({ mongo, discord, teamspeak })

    while (true) {
        const category = await p.select({
            message: 'What do you want to do?',
            options: [
                { value: 'run', label: cyan('🧪 Development') },
                { value: 'production', label: red('🚀 Production') },
                { value: 'docker', label: blue('🐳 Docker') },
                { value: 'setup', label: green('🛠️ Setup') },
                { value: 'migrations', label: yellow('🗃️ Migrations') },
                { value: 'quit', label: dim('🚪 Quit') },
            ],
        })

        if (p.isCancel(category) || category === 'quit') break

        const items = { docker: DOCKER_ITEMS, run: RUN_ITEMS, production: PRODUCTION_ITEMS, setup: SETUP_ITEMS, migrations: MIGRATION_ITEMS }[category]
        const itemColor = CATEGORY_COLOR[category]

        const choice = await p.select({
            message: 'Pick one',
            options: [
                ...items.map((item, i) => ({ value: i, label: itemColor(item.label) })),
                { value: 'back', label: dim('← Back') },
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
