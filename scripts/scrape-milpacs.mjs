#!/usr/bin/env node
/**
 * scrape-milpacs.mjs
 *
 * Fetches each member's ASOT profile page, uses a local Ollama instance to
 * extract Awards & Citations, Promotions & Roles, and Campaigns, then writes
 * the results directly into the MongoDB users collection.
 *
 * Usage:
 *   node scripts/scrape-milpacs.mjs [names...]
 *   node scripts/scrape-milpacs.mjs --input "Billet Mastersheet.csv"
 *   node scripts/scrape-milpacs.mjs --all
 *   node scripts/scrape-milpacs.mjs Koda Thomas --model llama3.2
 *
 * Options:
 *   --input  <file>   CSV file to read names from (col 0, skips header rows)
 *   --all             Scrape every user currently in the database
 *   --output <file>   Also write JSON snapshot (default: milpacs-scraped.json, use 'none' to skip)
 *   --model  <name>   Ollama model (default: llama3.2)
 *   --ollama <url>    Ollama base URL (default: http://localhost:11434)
 *   --delay  <ms>     Delay between requests in ms (default: 500)
 *   --concurrency <n> Parallel requests (default: 1)
 *   --mongo-uri <uri> MongoDB URI (overrides .env.local)
 *   --mongo-db  <db>  MongoDB database name (overrides .env.local)
 *   --dry-run         Fetch and extract but do not write to the database
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { MongoClient } from 'mongodb'

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
let inputFile   = null
let outputFile  = 'milpacs-scraped.json'
let model       = 'llama3.2:3b'
let ollamaUrl   = 'http://localhost:11434'
let delay       = 500
let concurrency = 1
let mongoUri    = process.env.MONGO_URI  ?? null
let mongoDb     = process.env.MONGO_DB   ?? null
let scrapeAll   = false
let dryRun      = false

for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
        case '--input':       inputFile   = args[++i]; break
        case '--output':      outputFile  = args[++i]; break
        case '--model':       model       = args[++i]; break
        case '--ollama':      ollamaUrl   = args[++i]; break
        case '--delay':       delay       = parseInt(args[++i], 10); break
        case '--concurrency': concurrency = parseInt(args[++i], 10); break
        case '--mongo-uri':   mongoUri    = args[++i]; break
        case '--mongo-db':    mongoDb     = args[++i]; break
        case '--all':         scrapeAll   = true; break
        case '--dry-run':     dryRun      = true; break
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

const mongo  = new MongoClient(mongoUri)
await mongo.connect()
const db     = mongo.db(mongoDb)
const users  = db.collection('users')

console.log(`Connected to MongoDB: ${mongoDb}`)

// ── Load names ────────────────────────────────────────────────────────────────

if (scrapeAll) {
    const allUsers = await users.find({}, { projection: { 'guild.nickname': 1, username: 1, name: 1 } }).toArray()
    for (const u of allUsers) {
        const n = u.guild?.nickname || u.name || u.username
        if (n) names.push(n)
    }
    console.log(`Loaded ${names.length} names from database`)
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

// ── HTML stripping ────────────────────────────────────────────────────────────

function stripHtml(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&mdash;/g, '—')
        .replace(/&ndash;/g, '–')
        .replace(/\s+/g, ' ')
        .trim()
}

// ── Fetch profile page ────────────────────────────────────────────────────────

async function fetchProfile(name) {
    const slug = name.toLowerCase().replace(/\s+/g, '')
    const url  = `https://www.australianspecialoperationstaskforce.com/${slug}`
    const res  = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return stripHtml(await res.text())
}

// ── Ollama extraction ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a data extraction assistant. Given the text of a military personnel profile page, extract:
1. Awards and Citations: array of { name, date, type } where type is one of "Service Citation", "Non-Operational Award", "Operational Service Citation"
2. Promotions and Roles: array of { date, rank, role }
3. Campaigns/Operations: array of { name, from, to }

Rules:
- Return ONLY a single valid JSON object with keys: awards, promotions, campaigns
- Use empty arrays if no data found for a section
- Dates should be in "DD Mon YYYY" format where available, or empty string if unknown
- Do not include any explanation or text outside the JSON`

async function extractWithOllama(pageText, name) {
    const userMessage = `Extract the military records from this profile page for ${name}:\n\n${pageText.slice(0, 8000)}`

    const res = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            prompt: userMessage,
            system: SYSTEM_PROMPT,
            stream: false,
            format: 'json',
            options: { temperature: 0.1, num_predict: 2048 },
        }),
        signal: AbortSignal.timeout(120000),
    })

    if (!res.ok) throw new Error(`Ollama error: ${res.status}`)
    const data = await res.json()
    const raw  = data.response?.trim() ?? ''

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
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

// ── Process a single name ─────────────────────────────────────────────────────

async function processName(name) {
    process.stdout.write(`  ${name}... `)
    try {
        const pageText = await fetchProfile(name)
        const result   = await extractWithOllama(pageText, name)

        let dbStatus = 'skipped (dry-run)'
        if (!dryRun) {
            const { matched } = await writeToDb(name, result)
            dbStatus = matched ? 'saved to DB' : 'no DB match'
        }

        const counts = `${result.awards.length} awards, ${result.promotions.length} promotions, ${result.campaigns.length} campaigns`
        console.log(`✓ (${counts}) [${dbStatus}]`)
        return { name, data: result, error: null }
    } catch (err) {
        console.log(`✗ ${err.message}`)
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

await mongo.close()
