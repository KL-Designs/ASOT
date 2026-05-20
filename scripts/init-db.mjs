#!/usr/bin/env node
/**
 * Setup wizard — generates .env and creates your user account in MongoDB.
 *
 * Usage:
 *   npm run init-db
 */

import { createServer }                          from 'http'
import { MongoClient }                           from 'mongodb'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { parse as parseUrl }                     from 'url'
import { exec }                                  from 'child_process'
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

function writeEnvFile(v) {
    const lines = [
        `NODE_ENV=development`,
        ``,
        `# Site`,
        `NEXT_PUBLIC_BASEURL=${v.NEXT_PUBLIC_BASEURL}`,
        `NEXT_PUBLIC_COLLAB_WS_URL=${v.NEXT_PUBLIC_COLLAB_WS_URL}`,
        ``,
        `# MongoDB`,
        `MONGO_URI=${v.MONGO_URI}`,
        `MONGO_DB=${v.MONGO_DB}`,
        ``,
        `# Discord`,
        `DISCORD_GUILD_ID=${v.DISCORD_GUILD_ID}`,
        `DISCORD_CLIENT_ID=${v.DISCORD_CLIENT_ID}`,
        `DISCORD_CLIENT_SECRET=${v.DISCORD_CLIENT_SECRET}`,
        `DISCORD_BOT_TOKEN=${v.DISCORD_BOT_TOKEN}`,
        `DISCORD_REDIRECT_URI=${v.DISCORD_REDIRECT_URI}`,
        `DISCORD_SCOPE=identify`,
        ``,
        `# Development`,
        `CRON_SECRET=${v.CRON_SECRET}`,
        `ANALYZE=false`,
        v.OVERRIDE ? `OVERRIDE=${v.OVERRIDE}` : `# OVERRIDE=`,
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
    if (process.platform === 'win32') exec(`start "" "${url}"`)
    else if (process.platform === 'darwin') exec(`open "${url}"`)
    else exec(`xdg-open "${url}"`)
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
    console.log(`\n  ${head('[1/4] Site Configuration')}\n`)

    const baseUrl = await ask('Base URL', existing.NEXT_PUBLIC_BASEURL || 'http://localhost:3000')

    const u = new URL(baseUrl)
    const collabWsUrl = `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}/collab`
    console.log(`\n  ${ok(`Collab WS URL → ${collabWsUrl}`)}`)

    return { baseUrl, collabWsUrl }
}

async function stepMongo(existing) {
    console.log(`\n\n  ${head('[2/4] MongoDB')}\n`)

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
    console.log(`\n\n  ${head('[3/4] Discord Application')}\n`)

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

async function stepUser(vars) {
    console.log(`\n\n  ${head('[4/4] Create Your User Account')}\n`)
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
    }

    let vars = { ...existing }

    if (!envExists || Object.keys(existing).length === 0) {
        const { baseUrl, collabWsUrl } = await stepSite(existing)
        const { mongoUri, mongoDb }    = await stepMongo(existing)
        const { guildId, clientId, clientSecret, botToken, redirectUri } = await stepDiscord(existing, baseUrl)

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
            CRON_SECRET:               existing.CRON_SECRET || randomBytes(24).toString('hex'),
            OVERRIDE:                  existing.OVERRIDE || '',
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
