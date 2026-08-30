#!/usr/bin/env node
/**
 * Move anything still flat in storage/gallery/media into the content tree.
 *
 * New submissions are filed into content/ on publish, but anything published
 * before that shipped is still sitting flat under an opaque hex filename. This
 * gives those files the same readable name and location as everything else.
 *
 * Posters are skipped. They are regenerable derivatives of a video, nobody
 * organises them by hand, and they stay flat by design.
 *
 * Only PUBLISHED media moves. The content tree holds archive material and
 * nothing else — gallery-media.d.ts states that as an invariant — so a pending
 * submission awaiting review, or one already rejected, must stay flat under
 * media/ where the review tab and the reject path expect it. Without the
 * status filter this quietly promoted every unreviewed upload into the public
 * archive tree.
 *
 * Idempotent: a file already in the content tree has a content: key and is
 * never seen by the media: query below.
 *
 * Dry-run by default. Pass --apply to write.
 */

import { MongoClient, ObjectId } from 'mongodb'
import { copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync, renameSync, unlinkSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const GALLERY = resolve(process.cwd(), 'storage/gallery')
const CONTENT = join(GALLERY, 'content')
const MEDIA = join(GALLERY, 'media')

/* Kept in step with apps/web/lib/gallery/filenames.ts and content-path.ts. A
   root-level .mjs cannot import TypeScript, so this is the same duplication
   the sibling migration already carries for splitOperation, and both copies
   are pinned by tests — this one by relocate-flat-media.test.ts, which
   asserts buildName produces byte-identical output to buildMediaFilename
   across a table of inputs. */
const MAX_NAME_PART = 80
const SEPARATOR = ' — '
const ILLEGAL = /[/\\:*?"<>|[\]\u0000-\u001f]/g

/** Mirrors sanitizeFilePart's pipeline exactly, in the same order: collapse
 *  whitespace and trim FIRST, then strip illegal characters (ILLEGAL's control
 *  range includes tab/newline — stripping before collapsing would delete them
 *  outright instead of folding them into a space), collapse and trim again
 *  (stripping ILLEGAL can leave two spaces touching, e.g. "shot [ image]"),
 *  and finally strip trailing dots/spaces, which Windows would otherwise drop
 *  silently and leave the on-disk name differing from the database's. */
function sanitize(raw) {
    if (!raw) return ''
    return String(raw)
        .replace(/\s+/g, ' ')
        .trim()
        .replace(ILLEGAL, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/, '')
}

/** Mirrors truncateOnWord exactly, including the surrogate-pair guard: slice()
 *  counts UTF-16 code units, so cutting at `max` can land inside an astral
 *  character (an emoji) and leave a lone high surrogate — not valid UTF-8 and
 *  not a name a filesystem will accept. That half is dropped rather than
 *  emitted; the whole character disappearing is fine, since it was going to
 *  be cut anyway. */
function truncateOnWord(s, max) {
    if (s.length <= max) return s
    let cut = s.slice(0, max)

    const lastUnit = cut.charCodeAt(cut.length - 1)
    if (lastUnit >= 0xd800 && lastUnit <= 0xdbff) cut = cut.slice(0, -1)

    const space = cut.lastIndexOf(' ')
    const out = space > 0 && space >= max - 12 ? cut.slice(0, space) : cut
    return out.replace(/[. ]+$/, '')
}

/** Kept in step with apps/web/lib/gallery/naming.ts, same duplication as
 *  buildName above and pinned by the same test file. */
function splitOperation(folder) {
    const match = folder.match(/^\s*(\d+)\s*[.)\-\u2013]?\s*/)
    if (!match) return folder.trim()
    return folder.slice(match[0].length).trim() || folder.trim()
}

function normalizeKey(s) {
    return String(s)
        .toLowerCase()
        .replace(/\s*[\u2014\u2013-]\s*(sat|sun|saturday|sunday)\s*$/i, '')
        .replace(/^(operation|op|ftx|tvt)\s+/i, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

const fullKey = s => normalizeKey(s)
const strippedKey = s => normalizeKey(String(s).replace(/\s*\([^)]*\)\s*$/, ''))

/**
 * The folder inside `content/{year}` this item belongs in.
 *
 * `doc.operation` is NOT trusted as a folder name. A document written before
 * the folder-resolving accept path shipped carries the operation's raw title
 * ("OPERATION Copper Ridge — Sat"), and using that verbatim mints a brand new
 * directory beside the numbered one already holding that operation's
 * photographs — a duplicate folder, and the split facet rail this whole
 * feature exists to stop.
 *
 * Two-tier, matching naming.ts's fullKey/strippedKey and index-gallery.mjs:
 * the folder whose label carries the same trailing parenthetical first, then
 * one that matches with it dropped ("9. Op Copper Ridge (Lanze Verde)" and
 * "12. MW Training (CAG)" are the two real folders that need the fallback).
 * The order is the safety property — see naming.ts.
 *
 * Falls back to `doc.operation` itself when no folder matches, which is the
 * genuinely new operation case.
 */
export function resolveFolder(contentDir, year, operation) {
    let existing = []
    try {
        existing = readdirSync(join(contentDir, year), { withFileTypes: true })
            .filter(e => e.isDirectory()).map(e => e.name)
    } catch {
        // The year folder does not exist yet — nothing to reuse.
    }

    const wantedFull = fullKey(operation)
    const exact = existing.find(f => fullKey(splitOperation(f)) === wantedFull)
    if (exact) return exact

    const wantedStripped = strippedKey(operation)
    return existing.find(f => strippedKey(splitOperation(f)) === wantedStripped) ?? operation
}

export function buildName({ id, ext, author, caption }) {
    const normalizedExt = String(ext).replace(/^\./, '').toLowerCase()

    const stem = truncateOnWord(
        [sanitize(author), sanitize(caption)].filter(Boolean).join(SEPARATOR),
        MAX_NAME_PART,
    )

    return stem ? `${stem} [${id}].${normalizedExt}` : `${id}.${normalizedExt}`
}

async function main() {
    const APPLY = process.argv.includes('--apply')
    const MONGO_URI = process.env.MONGO_URI
    const MONGO_DB = process.env.MONGO_DB

    if (!MONGO_URI || !MONGO_DB) {
        console.error('MONGO_URI and MONGO_DB env vars are required.')
        process.exit(1)
    }

    if (!existsSync(MEDIA)) {
        console.log(`No flat media directory at ${MEDIA} — nothing to relocate.`)
        process.exit(0)
    }

    const client = new MongoClient(MONGO_URI)

    try {
        await client.connect()
        const media = client.db(MONGO_DB).collection('gallery_media')

        // Published items only — see the module doc comment. Posters included;
        // the poster/original split happens below, not in this query.
        const docs = await media.find({ storageKey: { $regex: '^media:' }, status: 'live' }).toArray()

        let moved = 0, skipped = 0, missing = 0

        for (const doc of docs) {
            const file = doc.storageKey.slice('media:'.length)
            // A poster's key ends in _poster and stays flat by design — see
            // the module doc comment for why.
            if (file.includes('_poster.')) { skipped++; continue }

            const source = join(MEDIA, file)
            if (!existsSync(source)) {
                // Reported, never resolved by deleting the record: that is a
                // human's decision, made from the reconcile report (the start
                // menu's Migrations -> Reconcile: gallery disk).
                console.warn(`missing file for ${doc._id}: ${doc.storageKey}`)
                missing++
                continue
            }

            const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
            const name = buildName({ id: doc._id.toString(), ext, author: doc.authorName, caption: doc.caption })

            const relative = doc.year && doc.operation
                ? `${doc.year}/${resolveFolder(CONTENT, doc.year, doc.operation)}/${name}`
                : `Unknown/${name}`
            const destination = join(CONTENT, ...relative.split('/'))
            const key = `content:${relative}`

            if (!APPLY) {
                console.log(`[dry-run] would move ${doc.storageKey} -> ${key}`)
                moved++
                continue
            }

            mkdirSync(dirname(destination), { recursive: true })
            try {
                renameSync(source, destination)
            } catch (err) {
                if (err?.code !== 'EXDEV') throw err
                copyFileSync(source, destination)
                unlinkSync(source)
            }

            await media.updateOne({ _id: new ObjectId(doc._id) }, { $set: { storageKey: key } })
            moved++
        }

        console.log(`\n${APPLY ? 'moved' : 'would move'}: ${moved}   posters skipped: ${skipped}   missing files: ${missing}`)
        if (!APPLY) console.log('\nDry run. Re-run with --apply to write.')
    } finally {
        await client.close()
    }
}

// Guard against import-time execution: relocate-flat-media.test.ts imports
// buildName directly to pin it against buildMediaFilename, and that must not
// touch Mongo or read env vars — only running this file as a script
// (`node scripts/relocate-flat-media.mjs`) should.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main()
}
