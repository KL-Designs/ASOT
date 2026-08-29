#!/usr/bin/env node
/**
 * Index the gallery's folder tree into `gallery_media`.
 *
 * The gallery used to be a window onto storage: `GET /api/gallery` walked
 * years/operations/missions with readdirSync and returned the tree. That is why
 * the page carried no author, no tags and no likes — there was nowhere to put
 * them. This writes one document per file so there is.
 *
 * It does not move a single byte. Every migrated document keeps a `storageKey`
 * of `legacy:{year}/{operation}/{mission}/{file}` and the serving route reads
 * the same file from the same place it always has.
 *
 * Idempotent, and it has to be: J5 keeps uploading through their existing
 * dashboard tab, so this is re-run rather than run once. The unique index on
 * storageKey plus `$setOnInsert` is what makes a second run a no-op — note
 * `$setOnInsert` and not `$set`, so a caption or tags a reviewer has since put
 * on a migrated item survive.
 *
 * Dry-run by default. Pass --apply to write.
 */

import { MongoClient } from 'mongodb'
import { readdirSync, statSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { createRequire } from 'module'

const APPLY = process.argv.includes('--apply')
const MONGO_URI = process.env.MONGO_URI
const MONGO_DB = process.env.MONGO_DB

if (!MONGO_URI || !MONGO_DB) {
    console.error('MONGO_URI and MONGO_DB env vars are required.')
    process.exit(1)
}

/* sharp lives in apps/web/node_modules — the repo root has no copy, and adding
   one just for a dimension probe would be a second native binary to keep in
   step. Resolved from there explicitly; if it cannot be found the probe is
   skipped and masonry falls back to its 16:10 default, which is a cosmetic
   loss rather than a failed migration.

   Resolved relative to THIS FILE, not to the working directory. The content
   tree below is found via cwd — that is what lets the test point the script at
   a fixture directory — and resolving sharp the same way would look for it
   inside that fixture and never find it. This script always sits at
   <repo>/scripts/, so apps/web is always its sibling. */
let sharp = null
try {
    const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
    sharp = require('sharp')
} catch {
    console.warn('sharp not resolvable from apps/web — indexing without dimensions.')
}

/* Run from the repo root: that is the cwd scripts/start.mjs gives a migration.
   The app resolves this as '../../storage/...' because it runs from apps/web,
   and confusing the two is the one way this silently indexes nothing — so a
   missing tree is a hard failure rather than an empty run. */
const CONTENT = resolve(process.cwd(), 'storage/gallery/content')
if (!existsSync(CONTENT)) {
    console.error(`No gallery content at ${CONTENT}. Run this from the repo root.`)
    process.exit(1)
}

const ORDER_PREFIX = /^\s*(\d+)\s*[.)\-–]?\s*/

/** Kept in step with apps/web/lib/gallery/naming.ts. A root-level .mjs cannot
 *  import a TypeScript module, so this is the feature's one duplicated
 *  function; naming.test.ts and this script's own test both pin the behaviour. */
function splitOperation(folder) {
    const match = folder.match(ORDER_PREFIX)
    if (!match) return { label: folder.trim(), order: Number.MAX_SAFE_INTEGER }
    return { label: folder.slice(match[0].length).trim() || folder.trim(), order: parseInt(match[1], 10) }
}

/**
 * Reduce a folder label or an operation title to a comparable core.
 *
 * The two sides are structurally different, not merely formatted differently:
 * operations are recorded per session day ("OPERATION Lost Army IV — Sun")
 * while the gallery keeps one folder per weekend, abbreviated ("18. Op
 * Atlantic Shield"). Exact matching finds nothing at all, which would date the
 * entire legacy archive to 1 January.
 */
function matchKey(s) {
    return String(s)
        .toLowerCase()
        .replace(/\s*[—–-]\s*(sat|sun|saturday|sunday)\s*$/i, '')
        .replace(/\s*\([^)]*\)\s*$/, '')
        .replace(/^(operation|op|ftx|tvt)\s+/i, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

const SEED_TAGS = [
    'Funny', 'Cinematic', 'Cool', 'Rare moment', 'Teamwork', 'Close call',
    'Explosion', 'Aftermath', 'Night op', 'Air', 'Armour', 'Breach',
    'Fail', 'Scenery', 'Portrait',
]

const slugify = label => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const extOf = name => {
    const dot = name.lastIndexOf('.')
    return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

const dirs = path => readdirSync(path, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
const files = path => readdirSync(path, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name)

const client = new MongoClient(MONGO_URI)

try {
    await client.connect()
    const db = client.db(MONGO_DB)
    const media = db.collection('gallery_media')
    const tags = db.collection('gallery_tags')

    if (APPLY) {
        await media.createIndex({ storageKey: 1 }, { unique: true, sparse: true, name: 'storageKey_unique' })
        await media.createIndex({ status: 1, takenAt: -1 }, { name: 'status_takenAt' })
        await media.createIndex({ status: 1, createdAt: 1 }, { name: 'status_createdAt' })
        await media.createIndex({ authorId: 1 }, { name: 'authorId' })
        await media.createIndex({ tags: 1 }, { name: 'tags' })
        await db.collection('gallery_votes').createIndex({ mediaId: 1, userId: 1 }, { unique: true, name: 'mediaId_userId_unique' })
        await tags.createIndex({ slug: 1 }, { unique: true, name: 'slug_unique' })
        console.log('indexes ensured')
    } else {
        console.log('[dry-run] would ensure indexes on gallery_media, gallery_votes, gallery_tags')
    }

    // ── Operations, for resolving a folder name to a real date ───────────────
    const operations = await db.collection('operations')
        .find({ deletedAt: { $exists: false } }, { projection: { title: 1, date: 1 } })
        .toArray()

    /* Grouped by matchKey rather than the raw title, because operations are
       recorded one per session day: "OPERATION Copper Ridge — Sat" and
       "— Sun" both reduce to the same key. Every operation sharing a key is
       kept (not just the earliest) and sorted by date ascending, because a
       year folder is a season rather than a calendar year — one is literally
       named "2022 - 2023" — so which candidate is "the" match depends on the
       folder's own year too; see pickOperation below. Empty keys (a title
       matchKey reduces to nothing) are skipped rather than clobbering every
       other empty-keyed op. */
    const byKey = new Map()
    for (const op of operations) {
        if (!op.title) continue
        const key = matchKey(op.title)
        if (!key) continue
        const list = byKey.get(key)
        if (list) list.push(op)
        else byKey.set(key, [op])
    }
    for (const list of byKey.values()) list.sort((a, b) => new Date(a.date) - new Date(b.date))

    /**
     * Pick the operation a folder's normalised key resolves to, preferring an
     * exact year match and falling back to one adjacent year either side.
     *
     * A folder's parsed year is a season label, not a guarantee: "2021"
     * holds sessions that actually ran into January 2022, and "2022 - 2023"
     * spans two calendar years outright. Requiring exact equality punishes
     * that normal case, so a session one year off is still accepted — but
     * nothing further, since that is the real collision the guard exists to
     * catch (the same codename reused for an unrelated operation years
     * later). Candidates are pre-sorted ascending, so the first one to match
     * either predicate is the earliest session in that bucket.
     */
    function pickOperation(key, yearNum) {
        if (yearNum === null) return undefined
        const candidates = byKey.get(key)
        if (!candidates) return undefined
        const exact = candidates.find(op => new Date(op.date).getUTCFullYear() === yearNum)
        if (exact) return exact
        return candidates.find(op => Math.abs(new Date(op.date).getUTCFullYear() - yearNum) === 1)
    }

    // ── Walk ─────────────────────────────────────────────────────────────────
    let seen = 0, inserted = 0, skipped = 0, matched = 0

    for (const year of dirs(CONTENT)) {
        /* Some year folders are a range ("2022 - 2023") rather than a bare
           year — Number(year) on one of those is NaN, and Date.UTC with a
           NaN silently produces an Invalid Date rather than throwing. Read
           just the leading four digits instead, and treat a folder with none
           as genuinely undated rather than guessing. */
        const yearMatch = year.match(/^(\d{4})/)
        const yearNum = yearMatch ? Number(yearMatch[1]) : null

        for (const operation of dirs(join(CONTENT, year))) {
            const { label } = splitOperation(operation)
            const key = matchKey(label)
            const op = key ? pickOperation(key, yearNum) : undefined
            if (op) matched++

            for (const mission of dirs(join(CONTENT, year, operation))) {
                const missionDir = join(CONTENT, year, operation, mission)

                for (const file of files(missionDir)) {
                    if (!IMAGE_EXT.has(extOf(file))) { skipped++; continue }
                    seen++

                    const storageKey = `legacy:${year}/${operation}/${mission}/${file}`
                    const absolute = join(missionDir, file)

                    let width, height
                    if (sharp) {
                        try {
                            const meta = await sharp(absolute).metadata()
                            width = meta.width
                            height = meta.height
                        } catch {
                            // A file sharp cannot read is still a file the
                            // gallery has been serving. Index it without
                            // dimensions rather than dropping it.
                        }
                    }

                    if (!APPLY) {
                        console.log(`[dry-run] would index ${storageKey}`)
                        continue
                    }

                    const result = await media.updateOne(
                        { storageKey },
                        {
                            $setOnInsert: {
                                kind: 'image',
                                source: 'upload',
                                storageKey,
                                year,
                                operation,
                                opLabel: label,
                                mission,
                                ...(op ? { operationId: op._id } : {}),
                                /* 1 January of the folder's year when nothing
                                   matched but the year is readable: the year
                                   is real information, and a null would drop
                                   the whole unmatched archive into the undated
                                   group. But when the folder name is a range
                                   like "2022 - 2023" there is no year to fall
                                   back to — null there, never an Invalid Date,
                                   since the design already sorts undated media
                                   into its own group. */
                                takenAt: op?.date
                                    ? new Date(op.date)
                                    : (yearNum !== null ? new Date(Date.UTC(yearNum, 0, 1)) : null),
                                tags: [],
                                width,
                                height,
                                bytes: statSync(absolute).size,
                                status: 'live',
                                up: 0,
                                down: 0,
                                createdAt: new Date(),
                            },
                        },
                        { upsert: true },
                    )
                    if (result.upsertedCount) inserted++
                }
            }
        }
    }

    // ── Tag vocabulary ───────────────────────────────────────────────────────
    const tagCount = await tags.countDocuments()
    if (tagCount === 0) {
        if (APPLY) {
            await tags.insertMany(SEED_TAGS.map((label, order) => ({ slug: slugify(label), label, order, retired: false })))
            console.log(`seeded ${SEED_TAGS.length} tags`)
        } else {
            console.log(`[dry-run] would seed ${SEED_TAGS.length} tags`)
        }
    } else {
        console.log(`tag vocabulary already has ${tagCount} entries — left alone`)
    }

    console.log(`\nfiles seen: ${seen}   inserted: ${inserted}   already indexed: ${seen - inserted}   non-image skipped: ${skipped}`)
    console.log(`operation folders matched to a real operation: ${matched}`)
    if (!APPLY) console.log('\nDry run. Re-run with --apply to write.')
} finally {
    await client.close()
}
