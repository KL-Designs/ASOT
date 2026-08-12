#!/usr/bin/env node
/**
 * Setup wizard — generates .env and creates your user account in MongoDB.
 *
 * Usage: run via the repo root's `npm run menu` (Setup / one-off → First-time setup).
 */

import { createServer }                          from 'http'
import { MongoClient }                           from 'mongodb'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { parse as parseUrl }                     from 'url'
import { execFile }                              from 'child_process'
import { createInterface }                       from 'readline'
import { randomBytes }                           from 'crypto'

// ─── Terminal ─────────────────────────────────────────────────────────────────

const C = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    dim:    '\x1b[2m',
    cyan:   '\x1b[36m',
    green:  '\x1b[32m',
    yellow: '\x1b[33m',
    red:    '\x1b[31m',
}

const bold  = s => `${C.bold}${s}${C.reset}`
const dim   = s => `${C.dim}${s}${C.reset}`
const head  = s => `${C.bold}${C.cyan}${s}${C.reset}`
const ok    = s => `${C.green}✓${C.reset} ${s}`
const warn  = s => `${C.yellow}!${C.reset} ${s}`
const fail  = s => `${C.red}✗${C.reset} ${s}`

// ─── Readline ─────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout })

function ask(label, defaultValue = '') {
    const hint = defaultValue ? `  ${dim(`(${defaultValue})`)}` : ''
    return new Promise(resolve =>
        rl.question(`  ${label}${hint}\n  > `, ans => resolve(ans.trim() || defaultValue))
    )
}

function askSecret(label, existing = '') {
    const hint = existing ? `  ${dim('(leave blank to keep existing)')}` : ''
    return new Promise(resolve =>
        rl.question(`  ${label}${hint}\n  > `, ans => resolve(ans.trim() || existing))
    )
}

function confirm(label, defaultYes = true) {
    const hint = dim(defaultYes ? '(Y/n)' : '(y/N)')
    return new Promise(resolve =>
        rl.question(`  ${label} ${hint} `, ans => {
            const v = ans.trim().toLowerCase()
            resolve(!v ? defaultYes : v === 'y' || v === 'yes')
        })
    )
}

function pause(msg = 'Press Enter to continue...') {
    return new Promise(resolve => rl.question(`\n  ${dim(msg)} `, () => resolve()))
}

// ─── .env helpers ─────────────────────────────────────────────────────────────

function parseDotEnv(filePath) {
    try {
        const result = {}
        for (const line of readFileSync(filePath, 'utf8').split('\n')) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue
            const eqIdx = trimmed.indexOf('=')
            if (eqIdx === -1) continue
            const key = trimmed.slice(0, eqIdx).trim()
            const value = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '')
            result[key] = value
        }
        return result
    } catch {
        return {}
    }
}

// Unset optional values are written as a commented-out `# KEY=` line instead
// of being omitted entirely — the .env stays a complete reference of every
// variable .env.template documents, not just the ones you filled in.
function optLine(key, value) {
    return value ? `${key}=${value}` : `# ${key}=`
}

function writeEnvFile(v) {
    const lines = [
        `NODE_ENV=development`,
        ``,
        `# ── Shared (used by both apps/web and apps/bot) ────────────────────────────────`,
        `MONGO_URI=${v.MONGO_URI}`,
        `MONGO_DB=${v.MONGO_DB}`,
        `DISCORD_GUILD_ID=${v.DISCORD_GUILD_ID}`,
        `DISCORD_BOT_TOKEN=${v.DISCORD_BOT_TOKEN}`,
        `NEXT_PUBLIC_BASEURL=${v.NEXT_PUBLIC_BASEURL}`,
        ``,
        `# ── apps/web only ───────────────────────────────────────────────────────────────`,
        ``,
        `# AI Providers (optional)`,
        optLine('ANTHROPIC_API_KEY', v.ANTHROPIC_API_KEY),
        optLine('OPENAI_API_KEY', v.OPENAI_API_KEY),
        ``,
        `# Site`,
        `NEXT_PUBLIC_COLLAB_WS_URL=${v.NEXT_PUBLIC_COLLAB_WS_URL}`,
        ``,
        `# Discord OAuth (login flow)`,
        `DISCORD_CLIENT_ID=${v.DISCORD_CLIENT_ID}`,
        `DISCORD_CLIENT_SECRET=${v.DISCORD_CLIENT_SECRET}`,
        `DISCORD_REDIRECT_URI=${v.DISCORD_REDIRECT_URI}`,
        `DISCORD_SCOPE=identify`,
        optLine('DISCORD_J1_RECRUITMENT_CHANNEL_ID', v.DISCORD_J1_RECRUITMENT_CHANNEL_ID),
        optLine('DISCORD_J4_ROLE_ID', v.DISCORD_J4_ROLE_ID),
        ``,
        `# TeamSpeak (optional)`,
        optLine('NEXT_PUBLIC_TS_ADDRESS', v.NEXT_PUBLIC_TS_ADDRESS),
        optLine('TS_HOST', v.TS_HOST),
        optLine('TS_QUERY_PORT', v.TS_QUERY_PORT),
        optLine('TS_SERVER_PORT', v.TS_SERVER_PORT),
        optLine('TS_SERVERADMIN_PASSWORD', v.TS_SERVERADMIN_PASSWORD),
        ``,
        `# OCAP (optional)`,
        optLine('OCAP_API_URL', v.OCAP_API_URL),
        optLine('OCAP_VIEWER_URL', v.OCAP_VIEWER_URL),
        ``,
        `# Cron / dev`,
        `CRON_SECRET=${v.CRON_SECRET}`,
        `ANALYZE=false`,
        `WIP_PAGES=false`,
        v.OVERRIDE ? `OVERRIDE=${v.OVERRIDE}` : `# OVERRIDE=`,
        optLine('TS_OVERRIDE', v.TS_OVERRIDE),
        ``,
        `# ── apps/bot only ────────────────────────────────────────────────────────────────`,
        optLine('DISCORD_MEMBER_ROLE_ID', v.DISCORD_MEMBER_ROLE_ID),
        optLine('DISCORD_ADMIN_ROLE_ID', v.DISCORD_ADMIN_ROLE_ID),
        optLine('DISCORD_NOTIFICATION_CHANNEL_ID', v.DISCORD_NOTIFICATION_CHANNEL_ID),
        optLine('DISCORD_SONG_SUBMISSION_CHANNEL_ID', v.DISCORD_SONG_SUBMISSION_CHANNEL_ID),
    ]
    writeFileSync('.env', lines.join('\n') + '\n', 'utf8')
}

function patchEnvVar(key, value) {
    const raw = readFileSync('.env', 'utf8')
    const pattern = new RegExp(`^(?:#\\s*)?${key}=.*$`, 'm')
    if (pattern.test(raw)) {
        writeFileSync('.env', raw.replace(pattern, `${key}=${value}`), 'utf8')
    } else {
        writeFileSync('.env', raw.trimEnd() + `\n${key}=${value}\n`, 'utf8')
    }
}

// ─── Discord OAuth ────────────────────────────────────────────────────────────

function openBrowser(url) {
    // execFile, not exec — no shell involved, so the URL can't be interpreted
    // as shell syntax no matter what it contains.
    if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', url])
    else if (process.platform === 'darwin') execFile('open', [url])
    else execFile('xdg-open', [url])
}

async function exchangeCode(code, redirectUri) {
    const res = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id:     process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type:    'authorization_code',
            code,
            redirect_uri:  redirectUri,
        }),
    })
    if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
    return res.json()
}

async function fetchDiscordUser(accessToken) {
    const res = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Failed to fetch Discord user: ${await res.text()}`)
    return res.json()
}

async function waitForOAuthCode(port, callbackPath) {
    return new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
            const { pathname, query } = parseUrl(req.url, true)
            if (pathname !== callbackPath) { res.writeHead(404); res.end(); return }

            if (query.error) {
                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end('<h2>Authorization denied.</h2><p>You can close this tab.</p>')
                server.close()
                reject(new Error(`Discord denied authorization: ${query.error}`))
                return
            }

            if (query.code) {
                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end('<h2>Done!</h2><p>You can close this tab and return to your terminal.</p>')
                server.close()
                resolve(query.code)
            }
        })

        server.on('error', err => {
            reject(err.code === 'EADDRINUSE'
                ? new Error(`Port ${port} is already in use. Make sure the dev server is not running.`)
                : err
            )
        })

        server.listen(port, '0.0.0.0', () => console.log(`\n  ${dim(`Waiting for Discord callback on port ${port}...`)}`))
    })
}

// ─── Wizard steps ─────────────────────────────────────────────────────────────

async function stepSite(existing) {
    console.log(`\n  ${head('[1/8] Site Configuration')}\n`)

    const baseUrl = await ask('Base URL', existing.NEXT_PUBLIC_BASEURL || 'http://localhost:3000')

    const u = new URL(baseUrl)
    const collabWsUrl = `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}/collab`
    console.log(`\n  ${ok(`Collab WS URL → ${collabWsUrl}`)}`)

    return { baseUrl, collabWsUrl }
}

async function stepMongo(existing) {
    console.log(`\n\n  ${head('[2/8] MongoDB')}\n`)

    const mongoUri = await ask('Connection URI', existing.MONGO_URI || 'mongodb://127.0.0.1:27017')
    const mongoDb  = await ask('Database name',  existing.MONGO_DB  || 'ASOT')

    process.stdout.write('\n  Testing connection... ')
    try {
        const mc = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 3000 })
        await mc.connect()
        await mc.db(mongoDb).command({ ping: 1 })
        await mc.close()
        console.log(ok('connected'))
    } catch (e) {
        console.log(fail(`${e.message}`))
        console.log(`\n  ${warn('MongoDB unreachable. You can continue, but the app will not work until it is running.')}`)
    }

    return { mongoUri, mongoDb }
}

async function stepDiscord(existing, baseUrl) {
    console.log(`\n\n  ${head('[3/8] Discord Application')}\n`)

    const redirectUri  = '/login/callback'
    const fullRedirect = `${baseUrl}${redirectUri}`

    console.log(`  Go to ${bold('https://discord.com/developers/applications')} and open your application.`)
    console.log(`  Under ${bold('OAuth2 → Redirects')}, make sure this URL is added:\n`)
    console.log(`    ${bold(fullRedirect)}\n`)
    console.log(`  Under ${bold('Bot → Privileged Gateway Intents')}, enable:`)
    console.log(`    Server Members Intent`)
    console.log(`    Message Content Intent`)

    await pause('Press Enter when your application is ready...')
    console.log()

    const guildId      = await ask('Guild (Server) ID',    existing.DISCORD_GUILD_ID     || '')
    const clientId     = await ask('Client ID',            existing.DISCORD_CLIENT_ID    || '')
    const clientSecret = await askSecret('Client Secret',  existing.DISCORD_CLIENT_SECRET || '')
    const botToken     = await askSecret('Bot Token',      existing.DISCORD_BOT_TOKEN    || '')

    return { guildId, clientId, clientSecret, botToken, redirectUri }
}

async function stepDiscordIds(existing) {
    console.log(`\n\n  ${head('[4/8] Discord Roles & Channels')}\n`)
    console.log(`  ${dim('Used for role-gating and notifications across the site and bot. Leave any blank to fill in later.')}\n`)

    const j1Channel     = await ask('J1 recruitment channel ID',                existing.DISCORD_J1_RECRUITMENT_CHANNEL_ID  || '')
    const j4Role        = await ask('J4 role ID',                               existing.DISCORD_J4_ROLE_ID                 || '')
    const memberRole    = await ask('Bot: member role ID',                      existing.DISCORD_MEMBER_ROLE_ID             || '')
    const adminRole     = await ask('Bot: admin role ID',                       existing.DISCORD_ADMIN_ROLE_ID              || '')
    const notifyChannel = await ask('Bot: notification channel ID',             existing.DISCORD_NOTIFICATION_CHANNEL_ID    || '')
    const songChannel   = await ask('Bot: song submission channel ID',          existing.DISCORD_SONG_SUBMISSION_CHANNEL_ID || '')

    return { j1Channel, j4Role, memberRole, adminRole, notifyChannel, songChannel }
}

async function stepAI(existing) {
    console.log(`\n\n  ${head('[5/8] AI Providers')}  ${dim('(optional)')}\n`)

    const hasExisting = Boolean(existing.ANTHROPIC_API_KEY || existing.OPENAI_API_KEY)
    const configure = await confirm('Configure AI provider API keys?', hasExisting)
    if (!configure) {
        return { anthropicKey: existing.ANTHROPIC_API_KEY || '', openaiKey: existing.OPENAI_API_KEY || '' }
    }

    console.log()
    const anthropicKey = await askSecret('Anthropic API Key (leave blank to skip)', existing.ANTHROPIC_API_KEY || '')
    const openaiKey    = await askSecret('OpenAI API Key (leave blank to skip)',    existing.OPENAI_API_KEY    || '')

    return { anthropicKey, openaiKey }
}

async function stepTeamSpeak(existing) {
    console.log(`\n\n  ${head('[6/8] TeamSpeak')}  ${dim('(optional)')}\n`)

    const hasExisting = Boolean(existing.TS_HOST || existing.NEXT_PUBLIC_TS_ADDRESS)
    const configure = await confirm('Configure TeamSpeak integration?', hasExisting)
    if (!configure) {
        return {
            publicAddress: existing.NEXT_PUBLIC_TS_ADDRESS  || '',
            host:          existing.TS_HOST                 || '',
            queryPort:     existing.TS_QUERY_PORT            || '',
            serverPort:    existing.TS_SERVER_PORT           || '',
            adminPassword: existing.TS_SERVERADMIN_PASSWORD  || '',
            override:      existing.TS_OVERRIDE              || '',
        }
    }

    console.log()
    const publicAddress = await ask('Public address (shown to members)',       existing.NEXT_PUBLIC_TS_ADDRESS || '')
    const host          = await ask('ServerQuery host',                       existing.TS_HOST                || '')
    const queryPort     = await ask('ServerQuery port',                      existing.TS_QUERY_PORT           || '10022')
    const serverPort    = await ask('Voice server port',                     existing.TS_SERVER_PORT          || '9987')
    const adminPassword = await askSecret('ServerQuery admin password',      existing.TS_SERVERADMIN_PASSWORD || '')
    const override       = await ask('Override UIDs (comma-separated, optional)', existing.TS_OVERRIDE        || '')

    return { publicAddress, host, queryPort, serverPort, adminPassword, override }
}

async function stepOcap(existing) {
    console.log(`\n\n  ${head('[7/8] OCAP')}  ${dim('(optional)')}\n`)

    const configure = await confirm('Configure OCAP after-action review integration?', Boolean(existing.OCAP_API_URL))
    if (!configure) {
        return { apiUrl: existing.OCAP_API_URL || '', viewerUrl: existing.OCAP_VIEWER_URL || '' }
    }

    console.log()
    const apiUrl    = await ask('OCAP API URL',    existing.OCAP_API_URL    || '')
    const viewerUrl = await ask('OCAP Viewer URL', existing.OCAP_VIEWER_URL || '')

    return { apiUrl, viewerUrl }
}

async function stepUser(vars) {
    console.log(`\n\n  ${head('[8/8] Create Your User Account')}\n`)
    console.log('  A Discord login will open in your browser. After authorising,')
    console.log('  your account will be added to MongoDB and granted admin access.\n')

    const baseUrl      = new URL(vars.NEXT_PUBLIC_BASEURL || 'http://localhost:3000')
    const callbackPath = vars.DISCORD_REDIRECT_URI || '/login/callback'
    const callbackPort = Number(baseUrl.port) || (baseUrl.protocol === 'https:' ? 443 : 80)
    const redirectUri  = `${baseUrl.origin}${callbackPath}`

    console.log(`  ${dim(`Using redirect URI: ${redirectUri}`)}`)

    const authUrl = new URL('https://discord.com/api/oauth2/authorize')
    authUrl.searchParams.set('client_id',     vars.DISCORD_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri',  redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope',         'identify')

    // Close readline before blocking on HTTP server
    rl.close()

    console.log(`\n  Open this URL in your browser to authorise:\n`)
    console.log(`    ${bold(authUrl.toString())}\n`)
    openBrowser(authUrl.toString())

    const code = await waitForOAuthCode(callbackPort, callbackPath)

    process.stdout.write('\n  Fetching your Discord profile... ')
    const tokenData = await exchangeCode(String(code), redirectUri)
    const d = await fetchDiscordUser(tokenData.access_token)
    console.log(ok(`${bold(d.username)} (${d.id})`))

    const avatarURL = d.avatar
        ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.${d.avatar.startsWith('a_') ? 'gif' : 'png'}`
        : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(d.id) >> 22n) % 6}.png`

    const user = {
        _id:          d.id,
        id:           d.id,
        username:     d.username,
        globalName:   d.global_name ?? d.username,
        tag:          d.discriminator && d.discriminator !== '0'
                          ? `${d.username}#${d.discriminator}`
                          : d.username,
        avatar:       d.avatar ?? null,
        avatarURL,
        banner:       d.banner ?? null,
        bannerURL:    d.banner
                          ? `https://cdn.discordapp.com/banners/${d.id}/${d.banner}.${d.banner.startsWith('a_') ? 'gif' : 'png'}`
                          : null,
        hexAccentColor: d.accent_color ? `#${d.accent_color.toString(16).padStart(6, '0')}` : '#000000',
        accentColor:  d.accent_color ?? 0,
        guild: {
            nickname:        d.global_name ?? d.username,
            avatar:          null,
            avatarURL:       null,
            displayName:     d.global_name ?? d.username,
            joinedTimestamp: Date.now(),
            roles:           [],
        },
    }

    process.stdout.write('  Creating user in MongoDB... ')
    const mongo = new MongoClient(vars.MONGO_URI)
    await mongo.connect()
    const users = mongo.db(vars.MONGO_DB).collection('users')
    const existing = await users.findOne({ _id: d.id })

    if (existing) {
        console.log(warn('already exists — skipped'))
    } else {
        await users.insertOne(user)
        console.log(ok('created'))
    }

    await mongo.close()

    // Add to OVERRIDE
    const overrideIds = (vars.OVERRIDE || '').split(',').map(s => s.trim()).filter(Boolean)
    if (!overrideIds.includes(d.id)) {
        overrideIds.push(d.id)
        const newOverride = overrideIds.join(',')
        patchEnvVar('OVERRIDE', newOverride)
        console.log(ok(`added to OVERRIDE in .env`))
    } else {
        console.log(ok(`already in OVERRIDE`))
    }

    return d
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n${head('══════════════════════════════')}\n${head('   ASOT  —  Setup Wizard')}\n${head('══════════════════════════════')}\n`)

    const envExists = existsSync('.env')
    let existing = envExists ? parseDotEnv('.env') : {}

    if (envExists) {
        console.log(`  Found existing ${bold('.env')} file.\n`)
        const reconfigure = await confirm('Reconfigure environment settings?', false)

        if (!reconfigure) {
            console.log()
        } else {
            existing = {}
        }
    } else {
        console.log(`  No ${bold('.env')} found — let\'s create one.\n`)
        console.log(`  You will need:`)
        console.log(`    • MongoDB running locally (or a connection URI)`)
        console.log(`    • A Discord application with a bot`)
        console.log(`  AI provider keys, TeamSpeak, and OCAP are optional — you can skip those sections.`)
    }

    let vars = { ...existing }

    if (!envExists || Object.keys(existing).length === 0) {
        const { baseUrl, collabWsUrl } = await stepSite(existing)
        const { mongoUri, mongoDb }    = await stepMongo(existing)
        const { guildId, clientId, clientSecret, botToken, redirectUri } = await stepDiscord(existing, baseUrl)
        const { j1Channel, j4Role, memberRole, adminRole, notifyChannel, songChannel } = await stepDiscordIds(existing)
        const { anthropicKey, openaiKey } = await stepAI(existing)
        const { publicAddress, host, queryPort, serverPort, adminPassword, override: tsOverride } = await stepTeamSpeak(existing)
        const { apiUrl, viewerUrl } = await stepOcap(existing)

        vars = {
            NEXT_PUBLIC_BASEURL:       baseUrl,
            NEXT_PUBLIC_COLLAB_WS_URL: collabWsUrl,
            MONGO_URI:                 mongoUri,
            MONGO_DB:                  mongoDb,
            DISCORD_GUILD_ID:          guildId,
            DISCORD_CLIENT_ID:         clientId,
            DISCORD_CLIENT_SECRET:     clientSecret,
            DISCORD_BOT_TOKEN:         botToken,
            DISCORD_REDIRECT_URI:      redirectUri,

            DISCORD_J1_RECRUITMENT_CHANNEL_ID:  j1Channel,
            DISCORD_J4_ROLE_ID:                 j4Role,
            DISCORD_MEMBER_ROLE_ID:             memberRole,
            DISCORD_ADMIN_ROLE_ID:              adminRole,
            DISCORD_NOTIFICATION_CHANNEL_ID:    notifyChannel,
            DISCORD_SONG_SUBMISSION_CHANNEL_ID: songChannel,

            ANTHROPIC_API_KEY: anthropicKey,
            OPENAI_API_KEY:    openaiKey,

            NEXT_PUBLIC_TS_ADDRESS:  publicAddress,
            TS_HOST:                 host,
            TS_QUERY_PORT:           queryPort,
            TS_SERVER_PORT:          serverPort,
            TS_SERVERADMIN_PASSWORD: adminPassword,
            TS_OVERRIDE:             tsOverride,

            OCAP_API_URL:    apiUrl,
            OCAP_VIEWER_URL: viewerUrl,

            CRON_SECRET: existing.CRON_SECRET || randomBytes(24).toString('hex'),
            OVERRIDE:    existing.OVERRIDE || '',
        }

        writeEnvFile(vars)
        console.log(`\n\n  ${ok(bold('.env written'))}`)
    }

    // Apply to process.env so OAuth helpers can read them
    for (const [k, v] of Object.entries(vars)) process.env[k] = v

    if (!vars.DISCORD_CLIENT_ID || !vars.DISCORD_CLIENT_SECRET) {
        console.error(`\n  ${fail('DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are not set. Run setup again.')}`)
        process.exit(1)
    }
    if (!vars.MONGO_URI || !vars.MONGO_DB) {
        console.error(`\n  ${fail('MONGO_URI and MONGO_DB are not set. Run setup again.')}`)
        process.exit(1)
    }

    await stepUser(vars)

    console.log(`\n\n  ${C.green}${C.bold}All done!${C.reset}\n`)
    console.log(`  Start the dev server:\n`)
    console.log(`    ${bold('npm run dev')}\n`)
}

main().catch(err => {
    try { rl.close() } catch {}
    console.error(`\n  ${fail(err.message)}`)
    process.exit(1)
})
