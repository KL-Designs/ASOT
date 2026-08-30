import { NextRequest, NextResponse } from 'next/server'
import type { Filter, UpdateFilter } from 'mongodb'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { contentKey } from '@/lib/gallery/paths'

const CONTENT_BASE = path.resolve('../../storage/gallery/content')

function resolveSafe(year: string, operation: string, stage: string): string {
    for (const part of [year, operation, stage]) {
        if (!part || part.includes('/') || part.includes('\\') || part.includes('\x00') || part === '..' || part === '.') {
            throw new Error('Invalid path component')
        }
    }
    const resolved = path.resolve(CONTENT_BASE, year, operation, stage)
    if (!resolved.startsWith(CONTENT_BASE + path.sep)) throw new Error('Path escapes content directory')
    return resolved
}

/** POST — rename files in a stage directory to enforce a given display order */
export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasPermission(me, 'gallery.manage'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const { year, operation, stage, order } = body as {
        year: string; operation: string; stage: string; order: string[]
    }

    if (!year || !operation || !stage || !Array.isArray(order) || !order.length)
        return NextResponse.json({ error: 'year, operation, stage and order are required' }, { status: 400 })

    let targetDir: string
    try { targetDir = resolveSafe(year, operation, stage) }
    catch { return NextResponse.json({ error: 'Invalid path' }, { status: 400 }) }

    const existing = new Set(fs.readdirSync(targetDir))

    // Sanitize and filter to only files that exist in the directory
    const validOrder = order
        .map(name => path.basename(name))
        .filter(name => existing.has(name))

    if (!validOrder.length) return NextResponse.json({ success: true, renamed: 0 })

    const ts = Date.now()
    const steps = validOrder.map((original, i) => ({
        from: original,
        tmp: `__reorder_${ts}_${i}`,
        // Strip any existing numeric prefix (e.g. "0003_") before adding the new one
        to: `${String(i + 1).padStart(4, '0')}_${original.replace(/^\d+_/, '')}`,
    }))

    /* Two-pass rename prevents collisions when new names overlap old names —
       and gallery_media follows the file at BOTH passes, in lockstep, for the
       same reason. A one-shot rewrite at the end can transiently give two
       documents the same storageKey (file A takes B's old name while B still
       holds it), which the unique index rejects; and if the process dies
       between the passes, a key written only at the end names a file that is
       no longer there under any name.

       Following the file at all is the fix for a defect this route has had
       since long before the readable content tree: renaming to "0001_name"
       broke the storageKey of every indexed file in the folder, and for a
       LEGACY file — no [id] in its name — reconcile cannot heal it either.
       Rule 1 needs the id and rule 2 needs the path, so the file landed in
       notIndexed and the record in missingFiles, permanently, taking its
       caption, tags, author and votes with it. */
    for (const { from, tmp } of steps) {
        fs.renameSync(path.join(targetDir, from), path.join(targetDir, tmp))
    }
    await followRename(year, operation, stage, steps.map(s => ({ from: s.from, to: s.tmp })))

    for (const { tmp, to } of steps) {
        fs.renameSync(path.join(targetDir, tmp), path.join(targetDir, to))
    }
    await followRename(year, operation, stage, steps.map(s => ({ from: s.tmp, to: s.to })))

    return NextResponse.json({ success: true, renamed: steps.length })
}

/** Method syntax, so a test's narrower stand-in and the real driver's full
 *  `Filter`/`UpdateFilter` signature both satisfy it — the same bivariance
 *  trick RelocateDeps and ReconcileDeps use, and for the same reason. */
type ReorderMedia = {
    updateOne(filter: Filter<GalleryMedia>, update: UpdateFilter<GalleryMedia>): Promise<unknown>
}

/**
 * Point each renamed file's document at its new path.
 *
 * `legacy:` as well as `content:`: they name the same directory, and a
 * developer database indexed before the rename still holds the old spelling —
 * missing it would leave exactly the legacy records this exists to protect
 * still orphaned. The new key is always written as `content:`, the spelling
 * everything writes now.
 *
 * A file with no document (never indexed) simply matches nothing. Serialised
 * rather than bulkWritten so each key move is its own atomic step against the
 * unique index, with no window in which two documents claim one key.
 *
 * Exported, with the collection injectable, so route.test.ts can pin the key
 * rewriting against a real mongod: CONTENT_BASE is resolved at module load
 * from the process's working directory, so exercising POST itself would mean
 * renaming files in the developer's actual archive.
 */
export async function followRename(
    year: string,
    operation: string,
    stage: string,
    moves: { from: string, to: string }[],
    media: ReorderMedia = Db.galleryMedia,
): Promise<void> {
    const keyFor = (name: string) => `${year}/${operation}/${stage}/${name}`
    for (const { from, to } of moves) {
        await media.updateOne(
            { storageKey: { $in: [contentKey(keyFor(from)), `legacy:${keyFor(from)}`] } },
            { $set: { storageKey: contentKey(keyFor(to)) } },
        )
    }
}
