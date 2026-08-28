#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as p from '@clack/prompts'
import figlet from 'figlet'
import pidusage from 'pidusage'
import pidtree from 'pidtree'

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

// SIGINT is *not* a reliable "stop the child" signal on Windows: `npm run
// <script>` groups the whole process tree into one job object, and even
// invoked directly, Ctrl-C is broadcast to every process sharing the console
// — both were observed to take the entire menu down with the child instead
// of just the child. Kept as a harmless backstop in case some launch path
// still delivers a real SIGINT to this process.
process.on('SIGINT', () => {})

// ─── Process spawning ───────────────────────────────────────────────────────

function spawnChild(command, args, opts = {}) {
    return spawn(command, args, {
        // stdin is piped (not inherited) so watchControlKeys() below can
        // read keystrokes itself instead of relying on OS signal delivery.
        stdio: ['pipe', 'inherit', 'inherit'],
        shell: true,
        env: ENV,
        cwd: ROOT,
        ...opts,
    })
}

// Forcefully kills a spawned child and everything under it. Plain
// `child.kill()` only signals the immediate process — on Windows that's
// just the `cmd.exe` wrapper `shell: true` introduces, leaving the actual
// dev server (a grandchild) running and orphaned. `taskkill /T` walks the
// whole tree instead.
function killTree(child) {
    if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
        try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
    }
}

const STOP_BYTES = new Set([0x1b, 0x03, 0x08, 0x7f]) // Esc, Ctrl-C, Backspace (BS or DEL)
const RESTART_BYTES = new Set([0x72, 0x52]) // r, R

// Reads our own stdin directly while `forwardTo` (a child process, or null)
// is in the foreground, forwarding ordinary keystrokes through to it and
// calling `onStop`/`onRestart` the moment their trigger key shows up — this
// is what actually stops/restarts a running dev server, since none of those
// keys can be trusted to reach the child via OS signals alone (see the
// SIGINT comment above). Returns a cleanup function that restores stdin to
// its normal (cooked) mode for the next @clack/prompts prompt.
function watchControlKeys(forwardTo, { onStop, onRestart }) {
    if (!process.stdin.isTTY) return () => {}

    let armed = true
    process.stdin.setRawMode(true)
    process.stdin.resume()

    function onData(chunk) {
        if (!armed) return
        for (let i = 0; i < chunk.length; i++) {
            const byte = chunk[i]
            const trigger = STOP_BYTES.has(byte) ? onStop : RESTART_BYTES.has(byte) ? onRestart : null
            if (!trigger) continue
            if (i > 0) forwardTo?.stdin?.write(chunk.subarray(0, i))
            armed = false
            cleanup()
            trigger()
            return
        }
        forwardTo?.stdin?.write(chunk)
    }

    function cleanup() {
        process.stdin.off('data', onData)
        process.stdin.setRawMode(false)
        process.stdin.pause()
    }

    process.stdin.on('data', onData)
    return cleanup
}

// Migrations only ever need stop, never restart (mid dry-run/apply restarts
// aren't a meaningful operation) — thin wrapper so `run()` below stays simple.
function watchStopKey(forwardTo, onStop) {
    return watchControlKeys(forwardTo, { onStop, onRestart: () => {} })
}

// Runs one command to completion — used by the migration flow, which needs
// a single dry-run/apply invocation rather than the restart-capable loop
// `runOnce`/`runItem` below provide for the main dev/production/setup items.
function run(command, args, opts = {}, onSpawn) {
    return new Promise(resolve => {
        const child = spawnChild(command, args, opts)
        onSpawn?.(child)
        let stoppedByUser = false

        const cleanup = watchStopKey(child, () => {
            stoppedByUser = true
            p.log.info('Stopping…')
            killTree(child)
        })
        if (process.stdin.isTTY) p.log.info('Press Esc, Backspace, or Ctrl-C to stop and return to the menu')

        child.on('exit', (code, signal) => {
            cleanup()
            resolve(stoppedByUser || signal ? 'signal' : (code ?? 1))
        })
        child.on('error', err => {
            cleanup()
            console.error(`\n  Failed to start "${command}": ${err.message}`)
            resolve(1)
        })
    })
}

function spawnAllFor(item) {
    if (item.commands) return item.commands.map(([command, args, opts]) => spawnChild(command, args, opts))
    return [spawnChild(item.command, item.args, item.opts)]
}

// Spawns `item` and settles once it stops being "this run" — either it
// exited on its own (crash or clean completion: outcome 'exit'), the user
// asked to stop (Esc/Backspace/Ctrl-C: outcome 'stop'), or the user asked to
// restart (R: outcome 'restart', with the same command re-spawned by the
// caller — see `runItem`). For a multi-command item ("Both"), one process
// exiting unprompted stops its sibling too, same as the old runAll() did.
function runOnce(item, onSpawn, { showHint = true } = {}) {
    return new Promise(resolve => {
        const children = spawnAllFor(item)
        onSpawn(children)

        let settled = false
        let pending = null // 'stop' | 'restart', set the moment a trigger fires

        function settle(outcome, code) {
            if (settled) return
            settled = true
            cleanupStdin()
            resolve({ outcome, code })
        }

        const cleanupStdin = watchControlKeys(children.length === 1 ? children[0] : null, {
            onStop: () => {
                if (pending) return
                pending = 'stop'
                p.log.info('Stopping…')
                for (const child of children) killTree(child)
            },
            onRestart: () => {
                if (pending) return
                pending = 'restart'
                p.log.info('Restarting…')
                for (const child of children) killTree(child)
            },
        })
        // Skipped when the pinned header is up (runItem) — it already shows
        // this as a "Controls" line that doesn't scroll away.
        if (showHint && process.stdin.isTTY) p.log.info('Esc, Backspace, or Ctrl-C to stop  •  R to restart')

        let exitCount = 0
        for (const child of children) {
            child.on('exit', (code, signal) => {
                exitCount++
                if (!pending && exitCount === 1 && children.length > 1) {
                    pending = 'stop'
                    for (const sibling of children) if (sibling !== child) killTree(sibling)
                }
                if (exitCount >= children.length) settle(pending ?? 'exit', signal ? 'signal' : (code ?? 1))
            })
            child.on('error', err => {
                console.error(`\n  Failed to start "${item.label}": ${err.message}`)
                exitCount++
                if (exitCount >= children.length) settle(pending ?? 'exit', 1)
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
    magenta: '\x1b[35m',
    // True-color (24-bit) so the logo renders as ASOT's actual colors rather
    // than whatever red/white the terminal theme happens to remap the
    // standard 16 ANSI colors to.
    bannerRed: '\x1b[38;2;196;30;40m',
    bannerWhite: '\x1b[38;2;245;245;245m',
    // Tank art palette — distinct tones per part so it reads as a little
    // scene rather than a flat silhouette.
    olive: '\x1b[38;2;94;104;72m',  // hull/turret
    khaki: '\x1b[38;2;150;140;100m', // hull fill shading
    track: '\x1b[38;2;70;70;70m',   // wheels/treads
    dirt: '\x1b[38;2;120;95;60m',   // ground
    sand: '\x1b[38;2;150;130;95m',  // Bushmaster escort body
}

const dim = s => `${C.dim}${s}${C.reset}`
const cyan = s => `${C.cyan}${s}${C.reset}`
const green = s => `${C.green}${s}${C.reset}`
const yellow = s => `${C.yellow}${s}${C.reset}`
const red = s => `${C.red}${s}${C.reset}`
const blue = s => `${C.blue}${s}${C.reset}`
const magenta = s => `${C.magenta}${s}${C.reset}`

// One color per category, applied to that category's items on the "Pick one"
// screen so the whole list reads as belonging to the category you picked.
const CATEGORY_COLOR = { docker: blue, run: cyan, production: red, setup: green, migrations: yellow, testing: magenta }

// Wide-tracked "AUSTRALIAN SPECIAL OPERATIONS TASKFORCE" subtitle — letters
// spaced out, words separated further, echoing the stencil-style lettering
// on the unit's actual banner.
function trackOut(text) {
    return text.split(' ').map(word => word.split('').join(' ')).join('   ')
}

function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs((h / 60) % 2 - 1))
    const m = l - c / 2
    const [r, g, b] =
        h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
        h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
    return `\x1b[38;2;${Math.round((r + m) * 255)};${Math.round((g + m) * 255)};${Math.round((b + m) * 255)}m`
}

const LOGO_LETTERS = ['A', 'S', 'O', 'T']
const LOGO_STEP_TICKS = 4 // animation ticks each letter spends "active" before the bump moves to the next one

// The big figlet "ASOT" wordmark, animated as a simple traveling bump: one
// letter at a time sits raised a row; every other letter — including
// whichever one was raised last — sits at its normal resting row. Only 2
// positions per letter (neutral, raised), not 3 (neutral, raised, dropped).
// Whole letters move as a unit (not individual columns, which sheared the
// glyphs apart in an earlier version), colored by a rainbow hue that
// depends on both column and row so the gradient sweeps diagonally as the
// bump travels. Individual letters are generated separately rather than
// sliced out of the combined word — confirmed they concatenate to exactly
// the same output for this font, so there's no kerning-mismatch risk, and
// it's what makes clean per-letter boundaries possible at all.
function buildWaveLogoRows(tick) {
    const letterGrids = LOGO_LETTERS.map(ch => figlet.textSync(ch, { font: 'Sub-Zero' }).split('\n').filter(line => line.trim()))
    const rowCount = letterGrids[0].length
    const letterWidths = letterGrids.map(rows => Math.max(...rows.map(row => [...row].length)))
    const totalWidth = letterWidths.reduce((a, b) => a + b, 0)

    const activeIdx = Math.floor(tick / LOGO_STEP_TICKS) % LOGO_LETTERS.length

    const height = rowCount + 1 // one spare row on top for the raised letter
    const outChars = Array.from({ length: height }, () => Array(totalWidth).fill(' '))
    const outColors = Array.from({ length: height }, () => Array(totalWidth).fill(null))

    let colOffset = 0
    for (let li = 0; li < LOGO_LETTERS.length; li++) {
        const rowShift = li === activeIdx ? -1 : 0
        for (let r = 0; r < letterGrids[li].length; r++) {
            const chars = [...letterGrids[li][r]]
            for (let c = 0; c < chars.length; c++) {
                if (chars[c] === ' ') continue
                const outRow = r + 1 + rowShift
                const outCol = colOffset + c
                const hue = (outCol * 6 + outRow * 30 + tick * 6) % 360
                outChars[outRow][outCol] = chars[c]
                outColors[outRow][outCol] = hslToRgb(hue, 0.7, 0.6)
            }
        }
        colOffset += letterWidths[li]
    }

    const bar = `${C.bannerRed}▐▐${C.reset} `
    return outChars.map((rowChars, r) => {
        let out = ''
        for (let c = 0; c < totalWidth; c++) {
            out += rowChars[c] === ' ' ? ' ' : `${outColors[r][c]}${C.bold}${rowChars[c]}${C.reset}`
        }
        return `${bar}${out}`
    })
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

// Builds the banner as an array of lines rather than printing directly, so
// both the idle menu screen and the live header for a running item (see
// runItem, and main()'s own drawMenuHeader) render from one definition
// instead of copies drifting apart. `running`, when given, adds the
// "Running"/"Resources" lines for the item currently executing. `compact`
// drops the figlet wordmark and most blank-line padding — for the live
// header specifically, in a terminal too short to fit the full ~20-line
// banner above a usable scroll region (see runItem's draw()).
function buildHeaderLines(status, running, { compact = false } = {}, tick = 0) {
    const lines = []

    if (compact) {
        lines.push(`   ${C.bold}${C.bannerWhite}ASOT${C.reset}  ${dim('•  asotmilsim.com  •  Support: Koda — Discord @itskodas')}`)
    } else {
        // Sub-Zero's slanted outline letterforms — animated, see
        // buildWaveLogoRows(); a solid red bar stands in for the diagonal
        // accent stripe on the unit's actual banner (a real diagonal
        // doesn't hold up across terminal fonts).
        for (const line of buildWaveLogoRows(tick)) lines.push(line)
        lines.push('')
        lines.push(`   ${C.bold}${C.bannerWhite}${trackOut('AUSTRALIAN SPECIAL OPERATIONS TASKFORCE')}${C.reset}`)
        lines.push('')
        lines.push(`   ${dim('asotmilsim.com  •  Support: Koda — Discord @itskodas')}`)
        lines.push('')
    }

    lines.push(statusLine('Database', status.mongo))
    lines.push(statusLine('Discord Bot', status.discord))
    lines.push(statusLine('TeamSpeak', status.teamspeak))

    if (running) {
        if (!compact) lines.push('')
        const bits = [running.label, running.pid && `PID ${running.pid}`, running.port && `Port ${running.port}`, `Up ${formatUptime(running.uptimeMs)}`].filter(Boolean)
        lines.push(`   ${'Running'.padEnd(13)}${cyan(bits.join('  •  '))}`)
        const usageText = running.usage ? `CPU ${running.usage.cpu.toFixed(1)}%  •  Mem ${running.usage.memMB.toFixed(0)} MB` : dim('—')
        lines.push(`   ${'Resources'.padEnd(13)}${usageText}`)
        lines.push(`   ${'Controls'.padEnd(13)}${dim('Esc / Backspace / Ctrl-C to stop  •  R to restart')}`)
    }

    if (!compact) lines.push('')
    lines.push(`   ${dim('─'.repeat(50))}`)
    lines.push('')
    return lines
}

const ANSI_RE = /\x1b\[[0-9;]*m/g
const visibleLength = str => str.replace(ANSI_RE, '').length
const padVisible = (str, width) => str + ' '.repeat(Math.max(0, width - visibleLength(str)))
const repeatToLength = (pattern, len) => pattern.repeat(Math.ceil(len / pattern.length)).slice(0, len)

// Side-profile tank silhouette for the empty space to the right of the
// header on a wide terminal — purely decorative. The hull is static; the
// tread and ground rows are generated per animation tick by tankFrame()
// below (see it for how the tank, its Bushmaster escort, and the ground
// each move independently). Barrel faces right (toward the log/output) —
// mirror image of the muzzle-left silhouette this started as.
// All rows (hull + tread + ground below) share one 49-column coordinate
// system so they line up — these are the original muzzle-left rows padded
// to that width *then* mirrored as a block, not reversed individually
// (reversing each string on its own loses each row's alignment relative to
// the others, which is what happened the first time around).
const TANK_HULL = [
    ['                 ▄██████████████████▄▄▄▄▄▄▄▄▄▄▄▄▄', C.olive],
    ['            ▄███████████████████████▄            ', C.olive],
    ['        ▄▄▄▄██████████████████████████▄▄▄▄▄      ', C.olive],
    ['       █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░█     ', C.khaki],
    ['      ▀███████████████████████████████████▀      ', C.olive],
]
const TANK_INDENT = '      '
// 37, not the hull row's own 49 — the tread sits directly under the hull
// skirt (the row right above it), which only spans columns 6-42 within that
// 49-wide frame. Matching the tread to the *hull row string length* instead
// of the skirt's actual visible span was what made the tread overhang
// wider than the hull sitting on it.
const TREAD_WIDTH = 37
const TANK_WIDTH = TANK_HULL[0][0].length // 49 — the barrel (widest row) reaches the full padded frame; escort anchoring is relative to this, not the (now narrower) tread
const GROUND_TILE = '‾_.°_‾..°_‾.°_‾_..°'

// A Bushmaster PMV escort, driving just ahead of the tank (to its right,
// since the tank's barrel faces right = the direction of travel). 6 rows —
// roof, windscreen, side windows, body, lower hull, wheels — aligned 1:1
// against the tank's 5 hull rows plus its tread row in tankFrame() below.
// Mirrored (front/windshield on the right) from the original muzzle-left-
// style draft so it faces the same way as the tank's barrel — reversing
// each row is safe here (unlike the tank hull) because every row already
// shares the same padded width.
const BUSHMASTER = [
    ['▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄        ', C.sand],
    [' █▀▀▀▀▀▀▀▀▀▀▀▀▀▀█▄      ', C.sand],
    [' █░░░░░░[]░[]░[]░██▄    ', C.khaki],
    [' █░░░░░░░░░░░░░░░░░░█   ', C.khaki],
    [' ▀▀▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▀▀   ', C.sand],
    ['   ●            ●       ', C.track],
]
const ESCORT_GAP = 6 // columns between the tank's (unjittered) right edge and the escort's own anchor
const JITTER_MARGIN = 2 // headroom on the left/right of each vehicle's anchor so ±1 jitter never collides with the other or clips the scene edge

// Small looping bump patterns rather than continuous randomness — mostly
// flat with an occasional ±1 nudge. Two different patterns (different
// lengths too, so they drift out of phase) give the tank and the escort
// independent side-to-side wobbles rather than swaying in lockstep.
const TANK_H_JITTER = [0, 0, 1, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0]
const ESCORT_H_JITTER = [0, -1, 0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, 0, -1, 0, 1, 0]

// Places pre-colored `segments` (`{ col, text, color }`, `text` plain/
// uncolored so its length is its true visible width) onto a blank canvas of
// `width` columns, left to right, padding the gaps with spaces. This is what
// lets the tank and the escort share the same rows while each sits at its
// own independently-jittering column.
function buildRow(width, segments) {
    let out = ''
    let cursor = 0
    for (const seg of [...segments].sort((a, b) => a.col - b.col)) {
        if (seg.col <= cursor) continue // defensive: never let one segment overwrite another
        out += ' '.repeat(seg.col - cursor) + `${seg.color}${seg.text}${C.reset}`
        cursor = seg.col + seg.text.length
    }
    if (cursor < width) out += ' '.repeat(width - cursor)
    return out
}

// One frame of the animation. `tick` only needs to keep advancing — the
// tread alternates phase every tick (reads as tracks turning), the ground
// pattern shifts by one character per tick (reads as terrain scrolling past
// underneath both vehicles), and the tank/escort each apply their own
// jitter pattern to their own column anchor. The ground spans the full
// scene width and never jitters — only scrolls — so the road stays put
// under whichever vehicle is currently drifting over it.
function tankFrame(tick) {
    const escortWidth = BUSHMASTER[0][0].length
    const tankCol = JITTER_MARGIN + TANK_H_JITTER[tick % TANK_H_JITTER.length]
    const escortAnchor = JITTER_MARGIN + TANK_WIDTH + ESCORT_GAP
    const escortCol = escortAnchor + ESCORT_H_JITTER[tick % ESCORT_H_JITTER.length]
    const sceneWidth = escortAnchor + escortWidth + JITTER_MARGIN

    const tread = TANK_INDENT + repeatToLength(tick % 2 === 0 ? '●─' : '─●', TREAD_WIDTH)
    const groundOffset = tick % GROUND_TILE.length
    const ground = repeatToLength(GROUND_TILE.slice(groundOffset) + GROUND_TILE, sceneWidth)

    // 6 combined tank rows (5 hull + tread), 1:1 against BUSHMASTER's own 6.
    const tankRows = [...TANK_HULL, [tread, C.track]]

    const rows = tankRows.map(([text, color], i) => {
        const [escText, escColor] = BUSHMASTER[i]
        return buildRow(sceneWidth, [
            { col: tankCol, text, color },
            { col: escortCol, text: escText, color: escColor },
        ])
    })
    rows.push(`${C.dirt}${ground}${C.reset}`)
    return rows
}

const ART_GUTTER = 10 // blank columns between the header text and the art
const ART_MARGIN = 6 // extra breathing room beyond art's own width before it's worth showing at all

// Pairs `art` (already-composited plain rows from tankFrame — vehicle
// jitter is handled internally there, not here) alongside `lines` row-by-
// row, right-padding each line to the widest one first (so ragged status/
// running text doesn't shift the art left and right between redraws) and
// vertically centering the (usually shorter) art block next to the taller
// header. Returns `lines` unchanged if the terminal isn't wide enough for
// both columns plus a margin.
function withArt(lines, art) {
    const maxLeftWidth = Math.max(...lines.map(visibleLength))
    const artWidth = Math.max(...art.map(visibleLength))
    const columns = process.stdout.columns || 80
    if (columns < maxLeftWidth + ART_GUTTER + artWidth + ART_MARGIN) return lines

    const totalRows = Math.max(lines.length, art.length)
    const artStartRow = Math.max(0, Math.floor((lines.length - art.length) / 2))

    const out = []
    for (let i = 0; i < totalRows; i++) {
        const left = lines[i] ?? ''
        const artIdx = i - artStartRow
        const artLine = (artIdx >= 0 && artIdx < art.length) ? art[artIdx] : ''
        out.push(artLine ? `${padVisible(left, maxLeftWidth + ART_GUTTER)}${artLine}` : left)
    }
    return out
}

function formatUptime(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000))
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0')
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0')
    const s = String(totalSec % 60).padStart(2, '0')
    return `${h}:${m}:${s}`
}

// Sums CPU% and memory across a child's whole process tree (not just the
// immediate `cmd.exe` shell: true introduces) via pidtree + pidusage. Best
// effort — returns null (rendered as "—") if either fails, e.g. in the
// brief window right after spawn before the tree is fully up.
async function sampleUsage(children) {
    const roots = children.map(c => c.pid).filter(Boolean)
    if (!roots.length) return null
    try {
        const pidLists = await Promise.all(roots.map(pid => pidtree(pid, { root: true })))
        const stats = await pidusage(pidLists.flat())
        const values = Object.values(stats)
        return {
            cpu: values.reduce((sum, s) => sum + s.cpu, 0),
            memMB: values.reduce((sum, s) => sum + s.memory, 0) / 1024 / 1024,
        }
    } catch {
        return null
    }
}

const HEADER_REFRESH_MS = 4000 // real data: connection checks + CPU/memory sampling — too expensive to run every animation tick
const ANIM_INTERVAL_MS = 220 // tank animation frame — cheap, just string building + a few writes
const MIN_LOG_ROWS = 5 // rows to guarantee below the header before falling back to the compact variant, or dropping it entirely

// Fixed line count of the compact header — independent of its actual
// content (status/running text fills fixed lines, never adds or removes
// one), so measuring it once against placeholder data is safe and avoids a
// magic number drifting out of sync with buildHeaderLines' layout.
const COMPACT_HEADER_ROWS = buildHeaderLines(
    { mongo: { ok: false, detail: '' }, discord: { ok: false, detail: '' }, teamspeak: { ok: false, detail: '' } },
    { label: '', uptimeMs: 0 },
    { compact: true },
).length

// No pinned header at all — used when the terminal is too short for even
// the compact one to leave room for a visible log (see runItem). Stop and
// restart still work exactly the same; the item's output just scrolls
// normally, like before the live-header feature existed.
async function runItemPlain(item) {
    let outcome, code
    do {
        const result = await runOnce(item, () => {})
        outcome = result.outcome
        code = result.code
    } while (outcome === 'restart')
    return outcome === 'stop' ? 'signal' : code
}

// Runs `item` with a header pinned to the top of the screen (banner, live
// connection status, and Running/Resources info for whatever's currently
// spawned) while the item's own output scrolls in a confined region below
// it — using a VT100 scroll region (`ESC[<top>;<bottom>r`) so the terminal
// itself keeps the two areas separate regardless of which process is
// writing. Loops on 'restart' (the R key, handled in runOnce) by re-spawning
// the same item in place; the header keeps running across the restart, only
// PID/uptime resetting. Returns the same code/'signal' shape `main()`
// already expects from a single run.
async function runItem(item) {
    // Decided once, at the size the terminal is when the item starts — even
    // the compact header (~8 lines) plus a handful of log lines needs more
    // room than a small panel like a VS Code terminal dock often has. Below
    // that, don't try to pin anything; a broken sliver of a header that
    // crowds out the log it's supposed to sit above is worse than no header.
    if ((process.stdout.rows || 40) < COMPACT_HEADER_ROWS + MIN_LOG_ROWS) return runItemPlain(item)

    let children = []
    let startedAt = Date.now()
    let liveStatus = null
    let cachedUsage = null
    let headerRowCount = 0
    let firstSpawn = true
    let tick = 0

    // The expensive stuff — network connection checks and shelling out to
    // pidtree/pidusage for CPU/memory — runs only on the slow timer/on
    // (re)spawn. render() below runs far more often for the animation and
    // must stay synchronous, so it always paints whatever these last found.
    async function refreshData() {
        const [mongo, discord, teamspeak] = await Promise.all([checkMongo(), checkDiscord(), checkTeamSpeak()])
        liveStatus = { mongo, discord, teamspeak }
        cachedUsage = await sampleUsage(children)
    }

    // Redraws the header in place without disturbing the item's own output.
    // `\x1b7`/`\x1b8` (save/restore cursor) bracket the header writes so the
    // cursor ends up back wherever the item last left it — critical, since
    // the item is writing to the same terminal concurrently via its own
    // inherited stdout/stderr and has no idea we just borrowed the cursor.
    // Guarded on `children.length` too, not just `liveStatus` — otherwise
    // the animation timer (started before the very first spawn resolves)
    // could paint a frame before there's anything running, stealing the
    // firstSpawn cursor-placement branch from the real first paint.
    function render() {
        if (!liveStatus || !children.length) return
        const rows = process.stdout.rows || 40
        const runningMeta = { label: item.label, pid: children[0]?.pid, port: item.port, uptimeMs: Date.now() - startedAt, usage: cachedUsage }

        // The full banner (~20 lines) leaves nothing for the log in a short
        // terminal — drop to the compact header (~8 lines) once there isn't
        // room for it plus a handful of visible log lines underneath.
        let lines = buildHeaderLines(liveStatus, runningMeta, { compact: false }, tick)
        if (rows < lines.length + MIN_LOG_ROWS) lines = buildHeaderLines(liveStatus, runningMeta, { compact: true })
        lines = withArt(lines, tankFrame(tick))
        headerRowCount = lines.length

        if (!firstSpawn) process.stdout.write('\x1b7')
        lines.forEach((line, i) => process.stdout.write(`\x1b[${i + 1};1H\x1b[2K${line}`))
        // Re-issuing the scroll region every redraw is deliberate: if the
        // item clears the screen itself (Next.js/tsx watch do this on
        // rebuild), this is what re-establishes the pinned header and
        // confined log area within one refresh interval instead of staying
        // broken for the rest of the run.
        if (rows > headerRowCount + 2) process.stdout.write(`\x1b[${headerRowCount + 1};${rows}r`)
        if (firstSpawn) {
            process.stdout.write(`\x1b[${headerRowCount + 1};1H`)
            firstSpawn = false
        } else {
            process.stdout.write('\x1b8')
        }
    }

    console.clear()
    await refreshData()

    const animTimer = setInterval(() => { tick++; render() }, ANIM_INTERVAL_MS)
    const dataTimer = setInterval(async () => { await refreshData(); render() }, HEADER_REFRESH_MS)

    let outcome, code
    do {
        const result = await runOnce(item, async spawned => {
            children = spawned
            startedAt = Date.now()
            await refreshData() // pick up the new PID's own usage right away rather than waiting up to 4s
            render()
        }, { showHint: false })
        outcome = result.outcome
        code = result.code
    } while (outcome === 'restart')

    clearInterval(animTimer)
    clearInterval(dataTimer)
    process.stdout.write('\x1b[r') // reset the scroll region to full-screen before handing back to the menu
    return outcome === 'stop' ? 'signal' : code
}

// ─── Menu items ─────────────────────────────────────────────────────────────

const WEB_PORT = Number(ENV.PORT) || 3000
// MILPAC_PORT, not PORT — both apps read the same root .env and PORT is web's.
const MILPAC_PORT = Number(ENV.MILPAC_PORT) || 42070

const DOCKER_ITEMS = [
    { label: '🏗️  Build & Start', command: 'docker', args: ['compose', 'up', '-d', '--build', '--remove-orphans'] },
    { label: '🛑 Stop', command: 'docker', args: ['compose', 'down'] },
]

const RUN_ITEMS = [
    { label: '🌏 Website', command: 'npm', args: ['--prefix', 'apps/web', 'run', 'dev-collab'], port: WEB_PORT },
    { label: '🤖 Discord', command: 'npm', args: ['run', 'dev', '--workspace=apps/bot'] },
    { label: '🎖️ MilPac', command: 'npm', args: ['run', 'dev', '--workspace=apps/milpac'], port: MILPAC_PORT },
    {
        label: '🔀 All', port: WEB_PORT, commands: [
            ['npm', ['--prefix', 'apps/web', 'run', 'dev-collab']],
            ['npm', ['run', 'dev', '--workspace=apps/bot']],
            ['npm', ['run', 'dev', '--workspace=apps/milpac']],
        ],
    },
]

const PRODUCTION_ITEMS = [
    { label: '🏗️ Build Website', command: 'npm', args: ['--prefix', 'apps/web', 'run', 'build'] },
    { label: '🚀 Start Website', command: 'npm', args: ['--prefix', 'apps/web', 'run', 'start'], port: WEB_PORT },
    { label: '🚀 Start Discord', command: 'npm', args: ['run', 'start', '--workspace=apps/bot'] },
    // No 'Build MilPac' — that app runs TypeScript directly via tsx, like apps/bot.
    { label: '🚀 Start MilPac', command: 'npm', args: ['run', 'start', '--workspace=apps/milpac'], port: MILPAC_PORT },
    // The built site with the developer tools still on it — a staging box, or a
    // look at the real build with the data generators still reachable. Both
    // halves need the flag: it is NEXT_PUBLIC_*, so the client's copy is baked
    // in at build time, and building without it leaves no buttons to press.
    // See apps/web/lib/dev-tools.ts.
    { label: '🏗️ Build Website (dev tools)', command: 'npm', args: ['--prefix', 'apps/web', 'run', 'build:devtools'] },
    { label: '🚀 Start Website (dev tools)', command: 'npm', args: ['--prefix', 'apps/web', 'run', 'start:devtools'], port: WEB_PORT },
]

const SETUP_ITEMS = [
    { label: '📦 Install All Dependencies', command: 'npm', args: ['run', 'install:all'] },
    { label: '🔐 Ensure Restic Binary', command: 'node', args: ['scripts/ensure-restic.mjs'] },
    { label: '🧙 Run First-time Setup', command: 'node', args: ['apps/web/scripts/init-db.mjs'] },
    { label: '🗺️ Generate Terrain', command: 'node', args: ['scripts/generate-terrain.mjs'], opts: { cwd: WEB } },
    { label: '🧹 Lint Website', command: 'npm', args: ['exec', '--', 'next', 'lint'], opts: { cwd: WEB } },
    // `start ""` — the empty string is the (unused) window title `start` expects
    // as its first argument; without it, a quoted path gets misread as one.
    { label: '📊 View Site Flow Chart', command: 'cmd', args: ['/c', 'start', '', join(WEB, 'docs', 'site-flow.html')] },
]

// Playwright E2E suite (apps/web/tests) — a real Next dev server on :3100
// plus an in-memory MongoDB on :27018, both spun up by playwright.config.ts
// itself, so no local .env/Docker/Mongo is needed. See apps/web/tests/README.md.
const TESTING_ITEMS = [
    { label: '🎭 Run E2E Suite', command: 'npm', args: ['run', 'test:e2e'], opts: { cwd: WEB } },
    { label: '🖥️ Run E2E Suite (headed)', command: 'npm', args: ['run', 'test:e2e:headed'], opts: { cwd: WEB } },
    { label: '🕹️ Run E2E Suite (UI mode)', command: 'npm', args: ['run', 'test:e2e:ui'], opts: { cwd: WEB } },
    { label: '📊 Open Last E2E Report', command: 'npm', args: ['run', 'test:e2e:report'], opts: { cwd: WEB } },
    // apps/milpac's own unit tests (node:test via tsx) — no server, no DB, fast.
    { label: '🎖️ Run MilPac Tests', command: 'npm', args: ['run', 'test', '--workspace=apps/milpac'] },
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
    // Dry-run by default, `--apply` to write — same as every other item here,
    // via runMigration's own dry-run-then-confirm flow. Creates the unique
    // indexes the kit rating/copy routes upsert against; must run before this
    // feature ships.
    { label: '🗃️ Create indexes: kit ratings & copies', script: 'scripts/2026-08-19-kit-rating-indexes.mjs', cwd: ROOT },
    {
        label: '🗃️ Import: member history CSV',
        command: 'npm',
        args: ['--prefix', 'apps/web', 'run', 'import:history', '--', '../../ASOT_Member_History_Master_Batch_12.csv'],
        cwd: ROOT,
    },
    {
        label: '🗃️ Sync: member ranks from ORBAT CSV',
        command: 'npm',
        args: ['--prefix', 'apps/web', 'run', 'sync:ranks', '--', '../../ASOT - ORBAT - ASOT - ORBAT.csv'],
        cwd: ROOT,
    },
    {
        label: '🗃️ Import: qualifications from TeamSpeak',
        command: 'npm',
        args: ['--prefix', 'apps/web', 'run', 'import:quals'],
        cwd: ROOT,
    },
]

// ─── Main loop ──────────────────────────────────────────────────────────────

async function runMigration(item) {
    // Most migrations are `node scripts/foo.mjs`. An item may override both
    // halves — the member history importer runs through npm so it picks up
    // tsx and the shared .env, and it takes the CSV path as an argument.
    const command  = item.command ?? 'node'
    const baseArgs = item.args ?? [item.script]

    p.log.step(`Dry run: ${item.label}`)
    const dryCode = await run(command, baseArgs, { cwd: item.cwd })
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
    const applyCode = await run(command, [...baseArgs, '--apply'], { cwd: item.cwd })
    reportExit(applyCode)
}

async function main() {
    const s = p.spinner()
    s.start('Checking connections')
    const [mongo, discord, teamspeak] = await Promise.all([checkMongo(), checkDiscord(), checkTeamSpeak()])
    s.stop('Connections checked')

    // Same pinned-header machinery runItem() uses for a running item, applied
    // to the idle menu screen too — a scroll region confines @clack/prompts'
    // own rendering to the rows below the header, so the tank keeps animating
    // continuously (tick/data timers) while the user is just sitting at a
    // prompt, not only while something is actually running.
    let liveStatus = { mongo, discord, teamspeak }
    let tick = 0
    let headerRowCount = 0
    let firstDraw = true
    let headerActive = false
    let animTimer = null
    let dataTimer = null

    async function refreshMenuStatus() {
        const [mongo, discord, teamspeak] = await Promise.all([checkMongo(), checkDiscord(), checkTeamSpeak()])
        liveStatus = { mongo, discord, teamspeak }
    }

    function drawMenuHeader() {
        const rows = process.stdout.rows || 40
        let lines = buildHeaderLines(liveStatus, null, { compact: false }, tick)
        if (rows < lines.length + MIN_LOG_ROWS) lines = buildHeaderLines(liveStatus, null, { compact: true })
        lines = withArt(lines, tankFrame(tick))
        headerRowCount = lines.length

        if (!firstDraw) process.stdout.write('\x1b7')
        lines.forEach((line, i) => process.stdout.write(`\x1b[${i + 1};1H\x1b[2K${line}`))
        if (rows > headerRowCount + 2) process.stdout.write(`\x1b[${headerRowCount + 1};${rows}r`)
        if (firstDraw) {
            process.stdout.write(`\x1b[${headerRowCount + 1};1H`)
            firstDraw = false
        } else {
            process.stdout.write('\x1b8')
        }
    }

    // No-op if already active — safe to call on every 'back' regardless of
    // whether the header is already running. Terminal too short even for
    // the compact header (see runItem's identical check): fall back to a
    // single static print with no scroll region/timers, same as before this
    // screen animated at all — a broken sliver of a pinned header is worse
    // than no header.
    function resumeMenuHeader() {
        if (headerActive) return
        if ((process.stdout.rows || 40) < COMPACT_HEADER_ROWS + MIN_LOG_ROWS) {
            console.clear()
            for (const line of withArt(buildHeaderLines(liveStatus, null, { compact: true }), tankFrame(tick))) console.log(line)
            return
        }
        headerActive = true
        firstDraw = true
        console.clear()
        drawMenuHeader()
        animTimer = setInterval(() => { tick++; drawMenuHeader() }, ANIM_INTERVAL_MS)
        dataTimer = setInterval(async () => { await refreshMenuStatus(); drawMenuHeader() }, HEADER_REFRESH_MS)
    }

    // Hands the terminal off to a child item/migration cleanly — resets the
    // scroll region so their own output isn't confined to the header's band.
    function pauseMenuHeader() {
        if (!headerActive) return
        headerActive = false
        clearInterval(animTimer)
        clearInterval(dataTimer)
        process.stdout.write('\x1b[r')
    }

    resumeMenuHeader()

    while (true) {
        const category = await p.select({
            message: 'What do you want to do?',
            options: [
                { value: 'run', label: cyan('🧪 Development') },
                { value: 'production', label: red('🚀 Production') },
                { value: 'docker', label: blue('🐳 Docker') },
                { value: 'setup', label: green('🛠️ Setup') },
                { value: 'testing', label: magenta('🎭 Playwright') },
                { value: 'migrations', label: yellow('🗃️ Migrations') },
                { value: 'quit', label: dim('🚪 Quit') },
            ],
        })

        if (p.isCancel(category) || category === 'quit') break

        const items = { docker: DOCKER_ITEMS, run: RUN_ITEMS, production: PRODUCTION_ITEMS, setup: SETUP_ITEMS, testing: TESTING_ITEMS, migrations: MIGRATION_ITEMS }[category]
        const itemColor = CATEGORY_COLOR[category]

        const choice = await p.select({
            message: 'Pick one',
            options: [
                ...items.map((item, i) => ({ value: i, label: itemColor(item.label) })),
                { value: 'back', label: dim('← Back') },
            ],
        })

        // The header keeps animating on its own through 'back' — this just
        // restarts it in the (rare) case it was left paused after a crash
        // below.
        if (p.isCancel(choice) || choice === 'back') {
            resumeMenuHeader()
            continue
        }

        const item = items[choice]
        pauseMenuHeader()
        if (category === 'migrations') {
            await runMigration(item)
            resumeMenuHeader()
        } else {
            const code = await runItem(item)
            reportExit(code)
            // Only resume (which clears the screen) on a clean stop (exit 0
            // or Ctrl-C). A genuine crash's output/error stays on screen
            // instead of being wiped out from under the user — the header
            // resumes next time they complete a cycle from here.
            if (code === 0 || code === 'signal') resumeMenuHeader()
        }
    }

    pauseMenuHeader()
    p.outro('Bye!')
}

main().catch(err => {
    p.log.error(err.message)
    process.exit(1)
})
