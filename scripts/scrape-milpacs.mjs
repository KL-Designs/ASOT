#!/usr/bin/env node
/**
 * scrape-milpacs.mjs
 *
 * Uses Playwright to render each member's ASOT profile page in a headless
 * browser, takes a full-page screenshot, then passes that image to a local
 * Ollama vision model to extract Awards, Promotions, and Campaigns.
 * Writes results directly into the MongoDB users collection.
 *
 * Usage:
 *   node scripts/scrape-milpacs.mjs [names...]
 *   node scripts/scrape-milpacs.mjs --input "Billet Mastersheet.csv"
 *   node scripts/scrape-milpacs.mjs --all
 *   node scripts/scrape-milpacs.mjs Koda Thomas --model minicpm-v
 *
 * Options:
 *   --input  <file>   CSV file to read names from (col 0, skips header rows)
 *   --all             Scrape every user currently in the database
 *   --output <file>   Also write JSON snapshot (default: milpacs-scraped.json, use 'none' to skip)
 *   --model  <name>   Ollama vision model (default: minicpm-v)
 *   --ollama <url>    Ollama base URL (default: http://localhost:11434)
 *   --delay  <ms>     Delay between requests in ms (default: 500)
 *   --concurrency <n> Parallel requests (default: 1)
 *   --mongo-uri <uri> MongoDB URI (overrides .env.local)
 *   --mongo-db  <db>  MongoDB database name (overrides .env.local)
 *   --timeout  <s>    Ollama response timeout in seconds (default: 600)
 *   --dry-run         Fetch and extract but do not write to the database
 *   --debug-page      Save screenshot to debug-<name>.png then exit
 *
 * Requires:
 *   npm install playwright
 *   npx playwright install chromium
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { MongoClient } from 'mongodb'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Load .env.local ───────────────────────────────────────────────────────────

function loadEnv() {
    const envPath = join(__dirname, '..', '.env')
    if (!existsSync(envPath)) return
    const lines = readFileSync(envPath, 'utf-8').split(/\r?\n/)
    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq < 0) continue
        const key = trimmed.slice(0, eq).trim()
        const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
        if (!(key in process.env)) process.env[key] = val
    }
}

loadEnv()

// ── CLI argument parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2)
const names = []
let inputFile    = null
let outputFile   = 'milpacs-scraped.json'
let model        = 'huihui_ai/qwen3-abliterated:30b'
let ollamaUrl    = 'http://localhost:11434'
let delay        = 500
let concurrency  = 1
let mongoUri     = process.env.MONGO_URI  ?? null
let mongoDb      = process.env.MONGO_DB   ?? null
let scrapeAll    = false
let dryRun       = false
let debugPage    = false
let ollamaTimeout = 600000

for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
        case '--input':       inputFile    = args[++i]; break
        case '--output':      outputFile   = args[++i]; break
        case '--model':       model        = args[++i]; break
        case '--ollama':      ollamaUrl    = args[++i]; break
        case '--delay':       delay        = parseInt(args[++i], 10); break
        case '--concurrency': concurrency  = parseInt(args[++i], 10); break
        case '--mongo-uri':   mongoUri     = args[++i]; break
        case '--mongo-db':    mongoDb      = args[++i]; break
        case '--timeout':     ollamaTimeout = parseInt(args[++i], 10) * 1000; break
        case '--all':         scrapeAll    = true; break
        case '--dry-run':     dryRun       = true; break
        case '--debug-page':  debugPage    = true; break
        default:
            if (!args[i].startsWith('--')) names.push(args[i])
    }
}

if (!mongoUri) {
    console.error('MongoDB URI not found. Set MONGO_URI in .env.local or pass --mongo-uri')
    process.exit(1)
}
if (!mongoDb) {
    console.error('MongoDB DB name not found. Set MONGO_DB in .env.local or pass --mongo-db')
    process.exit(1)
}

// ── Connect to MongoDB ────────────────────────────────────────────────────────

const mongo = new MongoClient(mongoUri)
await mongo.connect()
const db    = mongo.db(mongoDb)
const users = db.collection('users')

console.log(`Connected to MongoDB: ${mongoDb}`)

// ── Load names ────────────────────────────────────────────────────────────────

if (scrapeAll) {
    const allUsers = await users.find({}, { projection: { name: 1, username: 1 } }).toArray()
    let skipped = 0
    for (const u of allUsers) {
        if (u.name) {
            names.push(u.name)
        } else {
            console.warn(`  Skipping user ${u.username ?? u._id} — no name set`)
            skipped++
        }
    }
    console.log(`Loaded ${names.length} names from database (${skipped} skipped — no name)`)
}

if (inputFile) {
    const csvPath = resolve(inputFile)
    if (!existsSync(csvPath)) {
        console.error(`Input file not found: ${csvPath}`)
        await mongo.close()
        process.exit(1)
    }
    const lines = readFileSync(csvPath, 'utf-8').split(/\r?\n/)
    for (const line of lines) {
        const col0 = line.split(',')[0].replace(/^"|"$/g, '').trim()
        if (!col0 || col0.toLowerCase() === 'name' || /^[\d,]/.test(col0)) continue
        names.push(col0)
    }
}

if (names.length === 0) {
    console.error('No names provided. Use positional args, --input <csv>, or --all')
    await mongo.close()
    process.exit(1)
}

console.log(`Scraping ${names.length} members using model "${model}" at ${ollamaUrl}`)
if (dryRun) console.log('DRY RUN — no database writes will occur')

// ── Browser management ────────────────────────────────────────────────────────

let _browser = null

async function getBrowser() {
    if (!_browser) {
        _browser = await chromium.launch({ headless: true })
    }
    return _browser
}

// ── Fetch profile — visual position text extraction via Playwright ────────────
//
// The DOM order on Squarespace pages is completely scrambled — each table cell
// is an isolated block and their DOM ordering does not match the visual layout.
// The only reliable approach is to read every text node's actual on-screen
// position via getBoundingClientRect(), sort by Y then X, and group into rows.

async function fetchProfile(name) {
    const slug = name.toLowerCase().replace(/\s+/g, '')
    const url  = `https://www.australianspecialoperationstaskforce.com/${slug}`

    const browser = await getBrowser()
    const context = await browser.newContext({
        viewport: { width: 1280, height: 4000 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    try {
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
        if (!response.ok()) throw new Error(`HTTP ${response.status()} for ${url}`)

        const result = await page.evaluate(() => {
            const SKIP = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT', 'SVG'])
            const items = []

            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode(n) {
                    for (let p = n.parentElement; p; p = p.parentElement) {
                        if (SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT
                        const s = getComputedStyle(p)
                        if (s.display === 'none' || s.visibility === 'hidden') return NodeFilter.FILTER_REJECT
                    }
                    return NodeFilter.FILTER_ACCEPT
                }
            })

            let node
            while ((node = walker.nextNode())) {
                const t = node.textContent.trim()
                if (!t) continue
                const range = document.createRange()
                range.selectNodeContents(node)
                const rect = range.getBoundingClientRect()
                if (rect.height === 0) continue
                items.push({ t, x: Math.round(rect.left), y: Math.round(rect.top) })
            }

            // Sort by Y position (top-to-bottom), then X (left-to-right within a row)
            items.sort((a, b) => a.y - b.y || a.x - b.x)

            // Group items that appear on the same visual row (within Y_TOL pixels)
            const Y_TOL = 10
            const rows = []
            for (const item of items) {
                const last = rows[rows.length - 1]
                if (!last || item.y - last[0].y > Y_TOL) {
                    rows.push([item])
                } else {
                    last.push(item)
                }
            }

            const text  = rows.map(r => r.map(i => i.t).join(' | ')).join('\n')
            const debug = rows.map(r =>
                `y=${String(r[0].y).padStart(4)}: ` +
                r.map(i => `[x=${String(i.x).padStart(4)}] ${i.t}`).join('   ')
            ).join('\n')

            return { text, debug }
        })

        return result
    } finally {
        await context.close()
    }
}

// ── Ollama text extraction ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a data extraction assistant. Extract structured military records from an ASOT (Australian Special Operations Taskforce) personnel profile page.

The text below was extracted from the rendered page in visual reading order. Each line is one visual row; columns within a row are separated by " | ".

The page contains three tables to extract:

1. AWARDS AND CITATIONS
   - Columns: Date | Award Name | Type
   - Type is one of: "Operational Service Citation", "Service Citation", "Non-Operational Award"
   - If type column is missing, infer it: "X Year Service Citation" → "Service Citation", anything with "Campaign Medallion" → "Operational Service Citation", all others → "Non-Operational Award"
   - Skip the header row (Date / Award / Type)

2. PROMOTIONS AND ROLES
   - Columns: Date | Rank | Role
   - Rank examples: Recruit, Private, Private Proficient, Leading Private, Senior Private, Corporal, Sergeant, Lieutenant, etc.
   - Role examples: Reservist, Rifleman (CFA), Section Medic, Fireteam Leader, Section Commander, Medical Officer, etc.
   - IMPORTANT: Due to layout quirks, the Rank and Role values may sometimes appear swapped in the extracted text. Use your knowledge of the distinction to correct this before outputting: Rank is a military grade (Private, Corporal, Sergeant…), Role is a position or specialty (Rifleman, Section Medic, Reservist…). If the extracted "rank" looks like a role and vice versa, swap them.
   - Skip the header row (Date / Rank / Role)

3. CAMPAIGNS
   - Columns: Date Range | Operation Name
   - Date ranges look like "28 Sep 2024 - 20 Oct 2024" — split on " - " for from/to fields
   - Skip the header row (Date / Campaign)

Return ONLY a single valid JSON object:
{
  "awards":     [{ "name": string, "date": string, "type": string }],
  "promotions": [{ "date": string, "rank": string, "role": string }],
  "campaigns":  [{ "name": string, "from": string, "to": string }]
}

RULES:
- Use [] for any section with no data
- Do not invent data — only extract what is present on the page
- No markdown or text outside the JSON`

async function extractWithOllama(pageText, name) {
    const prompt = `Extract the military records for ${name} from this profile page:\n\n${pageText.slice(0, 16000)}`

    const res = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            prompt,
            system: SYSTEM_PROMPT,
            stream: true,
            format: 'json',
            options: { temperature: 0.1, num_predict: 4096 },
        }),
        signal: AbortSignal.timeout(ollamaTimeout),
    })

    if (!res.ok) throw new Error(`Ollama error: ${res.status}`)

    // Stream and print the response live
    console.log('')
    let raw = ''
    const decoder = new TextDecoder()
    for await (const chunk of res.body) {
        const lines = decoder.decode(chunk).split('\n').filter(l => l.trim())
        for (const line of lines) {
            try {
                const obj = JSON.parse(line)
                const token = obj.message?.content ?? obj.response ?? ''
                if (token) {
                    raw += token
                    process.stdout.write(token)
                }
            } catch { /* ignore malformed chunks */ }
        }
    }
    console.log('\n')

    // Strip any thinking blocks (e.g. <think>...</think> from reasoning models)
    const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

    const jsonMatch = stripped.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error(`No JSON found in Ollama response for ${name}`)

    const parsed = JSON.parse(jsonMatch[0])
    return {
        awards:     Array.isArray(parsed.awards)     ? parsed.awards     : [],
        promotions: Array.isArray(parsed.promotions) ? parsed.promotions : [],
        campaigns:  Array.isArray(parsed.campaigns)  ? parsed.campaigns  : [],
    }
}

// ── Write extracted data to MongoDB ──────────────────────────────────────────

async function writeToDb(name, data) {
    // Match user by guild nickname, display name, or username (case-insensitive)
    const nameRegex = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    const user = await users.findOne({
        $or: [
            { 'guild.nickname': nameRegex },
            { name: nameRegex },
            { username: nameRegex },
        ]
    })

    if (!user) return { matched: false }

    // Map campaigns → milpac.operations format
    const operations = data.campaigns.map(c => ({
        name: c.name ?? '',
        startToEndDate: [c.from, c.to].filter(Boolean).join(' - '),
    }))

    await users.updateOne(
        { _id: user._id },
        {
            $set: {
                'milpac.awards':      data.awards,
                'milpac.promotions':  data.promotions,
                'milpac.operations':  operations,
            }
        }
    )

    return { matched: true, userId: user._id }
}

// ── ETA tracking ─────────────────────────────────────────────────────────────

const etaTimes = []
let etaCompleted = 0

function formatDuration(ms) {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`
    const m = Math.floor(ms / 60000)
    const s = Math.round((ms % 60000) / 1000)
    return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function etaLine() {
    if (etaTimes.length === 0 || etaCompleted >= names.length) return ''
    const avg = etaTimes.reduce((a, b) => a + b, 0) / etaTimes.length
    const remaining = names.length - etaCompleted
    const eta = avg * remaining
    return ` | avg ${formatDuration(avg)} each, ~${formatDuration(eta)} remaining (${etaCompleted}/${names.length})`
}

// ── Process a single name ─────────────────────────────────────────────────────

async function processName(name) {
    const start = Date.now()
    process.stdout.write(`  ${name}... `)
    try {
        const { text: pageText, debug: pageDebug } = await fetchProfile(name)

        if (debugPage) {
            console.log('\n─── VISUAL POSITIONS (y / x / text) ─────────────────────\n')
            console.log(pageDebug.slice(0, 8000))
            console.log('\n─── PAGE TEXT (row-grouped) ──────────────────────────────\n')
            console.log(pageText.slice(0, 8000))
            console.log('\n──────────────────────────────────────────────────────────\n')
            if (_browser) await _browser.close()
            await mongo.close()
            process.exit(0)
        }

        const result = await extractWithOllama(pageText, name)

        let dbStatus = 'skipped (dry-run)'
        if (!dryRun) {
            const { matched } = await writeToDb(name, result)
            dbStatus = matched ? 'saved to DB' : 'no DB match'
        }

        const elapsed = Date.now() - start
        etaTimes.push(elapsed)
        etaCompleted++

        const counts = `${result.awards.length} awards, ${result.promotions.length} promotions, ${result.campaigns.length} campaigns`
        console.log(`✓ (${counts}) [${dbStatus}] ${formatDuration(elapsed)}${etaLine()}`)
        return { name, data: result, error: null }
    } catch (err) {
        const elapsed = Date.now() - start
        etaTimes.push(elapsed)
        etaCompleted++
        console.log(`✗ ${err.message} ${formatDuration(elapsed)}${etaLine()}`)
        return { name, data: null, error: err.message }
    }
}

// ── Concurrency-limited runner ────────────────────────────────────────────────

async function runWithConcurrency(items, fn, limit, delayMs) {
    const results = []
    let idx = 0

    async function worker() {
        while (idx < items.length) {
            const i = idx++
            results[i] = await fn(items[i])
            if (idx < items.length && delayMs > 0) {
                await new Promise(r => setTimeout(r, delayMs))
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
    return results
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('')
const processed = await runWithConcurrency(names, processName, concurrency, delay)

let succeeded = 0
let failed    = 0
const output  = {}

for (const { name, data, error } of processed) {
    if (data) {
        output[name] = data
        succeeded++
    } else {
        output[name] = { error, awards: [], promotions: [], campaigns: [] }
        failed++
    }
}

// Optionally write JSON snapshot
if (outputFile !== 'none') {
    let existing = {}
    if (existsSync(outputFile)) {
        try { existing = JSON.parse(readFileSync(outputFile, 'utf-8')) } catch { /* ignore */ }
    }
    writeFileSync(outputFile, JSON.stringify({ ...existing, ...output }, null, 2), 'utf-8')
    console.log(`\nJSON snapshot written to: ${resolve(outputFile)}`)
}

console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`)

if (_browser) await _browser.close()
await mongo.close()
