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
 * of `content:{year}/{operation}/{mission}/{file}` — or, for a published
 * submission with no mission, `content:{year}/{operation}/{file}`, or for
 * anything with no resolvable operation, `content:Unknown/{file}` — and the
 * serving route reads the same file from the same place it always has.
 * `featured/` and `sotm/` get their own `featured:{file}` / `sotm:{file}` keys,
 * since those two directories predate media ids entirely.
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
 * entire legacy archive to 1 January. Does not touch a trailing parenthetical
 * — that is fullKey/strippedKey's job below, since stripping it here
 * unconditionally would let "Op Copper Ridge (Lanze Verde)" collide with a
 * plain, unrelated "Op Copper Ridge" — a real pair of folders in the archive.
 */
function normalizeKey(s) {
    return String(s)
        .toLowerCase()
        .replace(/\s*[—–-]\s*(sat|sun|saturday|sunday)\s*$/i, '')
        .replace(/^(operation|op|ftx|tvt)\s+/i, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

/** The specific key: a trailing parenthetical is kept, so it only matches an
 *  operation title that carries the same detail. Tried first. */
const fullKey = s => normalizeKey(s)

/** The fallback key: a trailing parenthetical is dropped, since an
 *  operation's own title rarely repeats a gallery folder's parenthetical
 *  verbatim. Tried only once the full key finds nothing. */
const strippedKey = s => normalizeKey(String(s).replace(/\s*\([^)]*\)\s*$/, ''))

const SEED_TAGS = [
    'Funny', 'Cinematic', 'Cool', 'Rare moment', 'Teamwork', 'Close call',
    'Explosion', 'Aftermath', 'Night op', 'Air', 'Armour', 'Breach',
    'Fail', 'Scenery', 'Portrait',
]

const slugify = label => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// .jfif is plain JPEG under a different extension — three real photographs
// in the archive are saved this way and were silently dropped before this.
const MEDIA_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.jfif', '.mp4', '.webm', '.mov'])

/** The subset of MEDIA_EXT that gets kind: 'video' and no sharp probe — sharp
 *  reads image formats only, and a probe attempt against a video would just
 *  be a second, noisier way to fail than the try/catch already handles. */
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov'])

const extOf = name => {
    const dot = name.lastIndexOf('.')
    return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

/* Some year folders are a range ("2022 - 2023") rather than a bare year —
   Number(year) on one of those is NaN, and Date.UTC with a NaN silently
   produces an Invalid Date rather than throwing. Read just the leading four
   digits instead, and treat a folder with none (or no year at all, as for
   Unknown/featured/sotm) as genuinely undated rather than guessing. Shared by
   the walk below, which needs it to pick an operation candidate, and by
   indexOne, which needs it again for the takenAt fallback — one parse, both
   call sites, rather than two copies quietly drifting apart. */
function parseYearNum(year) {
    if (!year) return null
    const match = year.match(/^(\d{4})/)
    return match ? Number(match[1]) : null
}

/* Both wrapped: an unreadable directory (permissions, a broken symlink, a
   Windows path over 260 characters) must not kill a migration that may
   already be most of the way through a five-year archive. Skipped and
   counted (see `unreadable` below) rather than left to throw. */
let unreadable = 0
const dirs = path => {
    try {
        return readdirSync(path, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
    } catch {
        unreadable++
        return []
    }
}
const files = path => {
    try {
        return readdirSync(path, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name)
    } catch {
        unreadable++
        return []
    }
}

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

    /* Grouped under both keys, because operations are recorded one per
       session day: "OPERATION Copper Ridge — Sat" and "— Sun" both reduce to
       the same key. Every operation sharing a key is kept (not just the
       earliest) and sorted by date ascending, because a year folder is a
       season rather than a calendar year — one is literally named
       "2022 - 2023" — so which candidate is "the" match depends on the
       folder's own year too; see pickOperation below. Empty keys are skipped
       rather than clobbering every other empty-keyed op. */
    const byFullKey = new Map()
    const byStrippedKey = new Map()
    const addTo = (map, key, op) => {
        if (!key) return
        const list = map.get(key)
        if (list) list.push(op)
        else map.set(key, [op])
    }
    for (const op of operations) {
        if (!op.title) continue
        addTo(byFullKey, fullKey(op.title), op)
        addTo(byStrippedKey, strippedKey(op.title), op)
    }
    for (const list of byFullKey.values()) list.sort((a, b) => new Date(a.date) - new Date(b.date))
    for (const list of byStrippedKey.values()) list.sort((a, b) => new Date(a.date) - new Date(b.date))

    /** Within one key's candidates, prefer an exact year match and fall back
     *  to one adjacent year either side — see pickOperation for why. */
    function findInBucket(map, key, yearNum) {
        const candidates = key ? map.get(key) : undefined
        if (!candidates) return undefined
        const exact = candidates.find(op => new Date(op.date).getUTCFullYear() === yearNum)
        if (exact) return exact
        return candidates.find(op => Math.abs(new Date(op.date).getUTCFullYear() - yearNum) === 1)
    }

    /**
     * Resolve a folder label to an operation: full key first, then the
     * parenthetical-stripped fallback — each tried exact-year before
     * ±1-year. The full key is tried first so "Op Copper Ridge (Lanze
     * Verde)" cannot resolve to a plain, unrelated "Op Copper Ridge"; it
     * only falls through to the stripped key once the specific one finds
     * nothing, which is the common case since an operation's own title
     * rarely repeats a gallery folder's parenthetical verbatim.
     *
     * The year tolerance exists because a folder's parsed year is a season
     * label, not a guarantee: "2021" holds sessions that actually ran into
     * January 2022, and "2022 - 2023" spans two calendar years outright.
     * Requiring exact equality punishes that normal case, so a session one
     * year off is still accepted — but nothing further, since that is the
     * real collision the guard exists to catch (the same codename reused for
     * an unrelated operation years later). Candidates within each bucket are
     * pre-sorted ascending, so the first to match a predicate is the
     * earliest session there.
     */
    function pickOperation(label, yearNum) {
        if (yearNum === null) return undefined
        return findInBucket(byFullKey, fullKey(label), yearNum)
            ?? findInBucket(byStrippedKey, strippedKey(label), yearNum)
    }

    /* Prefetched once so a dry run can report how many files are actually
       new vs. already indexed by querying the collection, rather than
       deriving it from `inserted` — which in a dry run never leaves 0, since
       nothing is written, and would print the entire archive as "already
       indexed" otherwise. */
    const existingKeys = new Set(
        (await media.find({}, { projection: { storageKey: 1 } }).toArray())
            .map(d => d.storageKey)
            .filter(Boolean),
    )

    // ── Walk ─────────────────────────────────────────────────────────────────
    let seen = 0, inserted = 0, skipped = 0, matched = 0, wouldInsert = 0, alreadyIndexed = 0

    /**
     * Index one file: stat it, probe its dimensions (images only), and either
     * upsert it or report what a dry run would have done. Shared by every
     * pass below — the mission loop, the no-mission submission pass, Unknown,
     * and featured/sotm — so the stat, the sharp probe and the upsert exist
     * once each rather than five times over.
     *
     * `relative` is the storage key's path portion, joined onto `content:` —
     * unless `facets.keyIsAbsolute` is set, in which case `relative` IS the
     * whole key already (`featured:{file}` / `sotm:{file}`), because those two
     * directories have no year/operation/mission to build a content path from.
     * `facets.extra` is merged into $setOnInsert as-is, which is how
     * featuredOrder reaches the document without indexOne knowing anything
     * about the featured rail.
     */
    async function indexOne(relative, absolute, facets) {
        const { year, operation, label, op, mission, keyIsAbsolute, extra } = facets
        const storageKey = keyIsAbsolute ? relative : `content:${relative}`

        let bytes
        try {
            bytes = statSync(absolute).size
        } catch {
            /* Gone between the readdir and the stat, a broken
               symlink, or a Windows path too long to open — the
               file is unreachable, not corrupt, so it is counted
               and skipped rather than aborting a migration that
               may already be most of the way through the
               archive. Distinct from a sharp failure below: this
               file was never read at all. */
            unreadable++
            return
        }
        seen++

        const isVideo = VIDEO_EXT.has(extOf(absolute))
        const kind = isVideo ? 'video' : 'image'

        let width, height
        if (sharp && !isVideo) {
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
            if (existingKeys.has(storageKey)) alreadyIndexed++
            else wouldInsert++
            console.log(`[dry-run] would index ${storageKey}`)
            return
        }

        const yearNum = parseYearNum(year)

        const result = await media.updateOne(
            { storageKey },
            {
                $setOnInsert: {
                    kind,
                    source: 'upload',
                    storageKey,
                    // All present together on a matched folder, all absent
                    // together on Unknown/featured/sotm — GalleryMedia's own
                    // doc comment promises exactly that, so these are never
                    // written as `null`, only omitted.
                    ...(year ? { year } : {}),
                    ...(operation ? { operation } : {}),
                    ...(label ? { opLabel: label } : {}),
                    ...(mission ? { mission } : {}),
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
                    bytes,
                    status: 'live',
                    up: 0,
                    down: 0,
                    createdAt: new Date(),
                    ...(extra || {}),
                },
            },
            { upsert: true },
        )
        if (result.upsertedCount) inserted++
    }

    for (const year of dirs(CONTENT)) {
        const yearNum = parseYearNum(year)

        for (const operation of dirs(join(CONTENT, year))) {
            const { label } = splitOperation(operation)
            const op = pickOperation(label, yearNum)
            if (op) matched++

            for (const mission of dirs(join(CONTENT, year, operation))) {
                const missionDir = join(CONTENT, year, operation, mission)

                for (const file of files(missionDir)) {
                    if (!MEDIA_EXT.has(extOf(file))) { skipped++; continue }
                    await indexOne(`${year}/${operation}/${mission}/${file}`, join(missionDir, file), {
                        year, operation, label, op, mission,
                    })
                }
            }

            /* Files directly inside an operation folder — a published
               submission has no mission, so the mission loop above never sees
               them. Same rules otherwise. */
            for (const file of files(join(CONTENT, year, operation))) {
                if (!MEDIA_EXT.has(extOf(file))) { skipped++; continue }
                await indexOne(`${year}/${operation}/${file}`, join(CONTENT, year, operation, file), {
                    year, operation, label, op, mission: null,
                })
            }
        }
    }

    /* The Unknown bucket sits beside the year folders, holding files with no
       operation. Two segments, no year — see the content-path grammar. */
    for (const file of files(join(CONTENT, 'Unknown'))) {
        if (!MEDIA_EXT.has(extOf(file))) { skipped++; continue }
        await indexOne(`Unknown/${file}`, join(CONTENT, 'Unknown', file), {
            year: null, operation: null, label: null, op: null, mission: null,
        })
    }

    /* The two directories whose files predate media ids. Bytes stay where they
       are; they gain documents so they appear in the library like anything
       else and can be given an operation later. featuredOrder is assigned in
       readdir order, which is the order the rail showed them in before it had
       any order at all. */
    for (const [dir, prefix, extra] of [
        ['featured', 'featured', i => ({ featuredOrder: i })],
        ['sotm', 'sotm', () => ({})],
    ]) {
        const root = resolve(process.cwd(), `storage/gallery/${dir}`)
        if (!existsSync(root)) continue

        let i = 0
        for (const file of files(root)) {
            if (!MEDIA_EXT.has(extOf(file))) { skipped++; continue }
            await indexOne(`${prefix}:${file}`, join(root, file), {
                year: null, operation: null, label: null, op: null, mission: null,
                keyIsAbsolute: true, extra: extra(i++),
            })
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

    /* Two different lines, not one derived from `inserted` in both modes:
       in a dry run `inserted` never leaves 0 (nothing is written), so
       `seen - inserted` would print the entire archive as "already indexed"
       — the one line an operator reads before deciding to write, so it does
       not get to lie. `wouldInsert`/`alreadyIndexed` come from the
       `existingKeys` query above, not from subtraction. */
    if (APPLY) {
        console.log(`\nfiles seen: ${seen}   inserted: ${inserted}   already indexed: ${seen - inserted}   non-media skipped: ${skipped}   skipped (unreadable): ${unreadable}`)
    } else {
        console.log(`\nfiles seen: ${seen}   would insert: ${wouldInsert}   already indexed: ${alreadyIndexed}   non-media skipped: ${skipped}   skipped (unreadable): ${unreadable}`)
    }
    console.log(`operation folders matched to a real operation: ${matched}`)
    if (!APPLY) console.log('\nDry run. Re-run with --apply to write.')
} finally {
    await client.close()
}
