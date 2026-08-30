import { ObjectId } from 'mongodb'
import type { Filter, FindOptions, UpdateFilter, WithId } from 'mongodb'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'fs'
import path from 'path'

import { buildContentPath, sanitizeSegment } from './content-path'
import { buildMediaFilename } from './filenames'
import { findByOperationKey, splitOperation } from './naming'
import { CONTENT_DIR, MEDIA_DIR, contentKey, resolveStorageKey } from './paths'

/**
 * Moving one piece of media into the readable content tree.
 *
 * This runs when a submission is published, and when a reviewer reassigns an
 * item's operation. Both are the same operation: work out which folder the
 * item belongs in, give the file a name carrying its id, and move it there.
 *
 * It is also the ONLY writer of `year`/`operation`/`opLabel`/`takenAt` for an
 * item that has bytes. An item with none — an embed, or a record whose
 * transcode failed — returns early below without writing anything, so those
 * four fields are decided for it by operationFacets()
 * (lib/gallery/operation-facets.ts) instead. Exactly one producer each; never
 * both on one path.
 *
 * A rename, never a copy — bulk-reassigning three hundred items has to be
 * instant and must not duplicate bytes. The copy path below exists only for
 * EXDEV, which cannot happen while both trees are under storage/gallery but
 * costs nothing to survive.
 *
 * Dependencies are injected rather than imported so this is testable against a
 * fixture directory without changing the process's working directory —
 * paths.ts resolves its roots at module load, so a test that chdir'd would
 * have to re-import the whole module graph.
 */

/**
 * `findOne`/`updateOne` are declared with method syntax (`foo(x): y`, not
 * `foo: (x) => y`) so TypeScript checks their parameter types bivariantly.
 * That is what lets both sides satisfy this type with no cast:
 *   - the real driver's `Collection<GalleryMedia>` (`Db.galleryMedia`), whose
 *     `findOne`/`updateOne` accept the full `Filter`/`UpdateFilter` shape;
 *   - a unit-test fixture whose stand-in only accepts `{ _id: ObjectId }`,
 *     which is all relocate.ts ever passes.
 * Arrow-property syntax would check parameters contravariantly instead, and
 * reject the narrower fixture signature.
 */
export type RelocateDeps = {
    media: {
        findOne(filter: Filter<GalleryMedia>): Promise<WithId<GalleryMedia> | null>
        updateOne(filter: Filter<GalleryMedia>, update: UpdateFilter<GalleryMedia>): Promise<unknown>
    }
    operations: {
        findOne(filter: Filter<Operation>, options?: FindOptions): Promise<WithId<Operation> | null>
    }
    /** Defaults to the real tree. Tests point this at a fixture. */
    contentDir?: string
    mediaDir?: string
}

const ORDER_PREFIX = /^\s*(\d+)/

/**
 * The year an operation's date files under.
 *
 * Reads UTC, never the server's local time. The stored `date` is UTC, so an
 * operation logged near midnight on 1 January must resolve to the same year
 * everywhere it is read, regardless of which timezone the process happens to
 * be running in. Exported so nothing keeps its own copy — two independent
 * `getFullYear()`/`getUTCFullYear()` calls are exactly the kind of thing that
 * quietly disagrees the one day a year it matters, and this and
 * operationFacets() (lib/gallery/operation-facets.ts, the resolver for
 * anything with no bytes) run against the same document minutes apart.
 */
export function operationYear(date: Date): string {
    return String(date.getUTCFullYear())
}

/**
 * Which folder an operation's media belongs in.
 *
 * Reuses an existing folder wherever one matches — that is what puts a new
 * submission beside the legacy files from the same operation rather than in a
 * duplicate folder next to them. Creates nothing on disk; it only returns the
 * names.
 */
export async function resolveOperationFolder(
    deps: RelocateDeps,
    operationId: ObjectId | null,
): Promise<{ year: string | null, operation: string | null }> {
    const contentDir = deps.contentDir ?? CONTENT_DIR
    if (!operationId) return { year: null, operation: null }

    const op = await deps.operations.findOne({ _id: operationId }, { projection: { title: 1, date: 1 } })
    if (!op?.date) {
        // Without a date there is no year folder to sit in, and inventing one
        // would file the item under a year nothing else agrees with — so the
        // bytes go to Unknown/. The operation itself is still returned: the
        // member chose it, and operationFacets()'s own undated branch keeps
        // `operation`/`opLabel` set and unsets only `year` — folding it into
        // a bare Unknown here too would make the two disagree on a document
        // reachable from either path.
        return { year: null, operation: op ? String(op.title ?? '') : null }
    }

    const title = String(op.title ?? '')
    const year = operationYear(new Date(op.date))
    const yearDir = path.join(contentDir, year)

    let existing: string[] = []
    try {
        existing = readdirSync(yearDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
    } catch {
        // The year folder does not exist yet. Not an error — the first
        // operation of a year creates it.
    }

    /* Two-tier: the folder whose label carries the same trailing parenthetical
       first, then one whose label matches with the parenthetical dropped.
       Matching only on the full key could not see "9. Op Copper Ridge (Lanze
       Verde)" from an operation titled "OPERATION Copper Ridge", so accepting
       a submission for it minted "10. Op Copper Ridge" beside the folder that
       already held that operation's photographs — a duplicate folder, and the
       split facet rail this whole feature exists to stop. See naming.ts for
       why the order, not an unconditional strip, is what keeps that safe. */
    const match = findByOperationKey(title, existing, folder => splitOperation(folder).label)
    if (match) return { year, operation: match }

    const highest = existing.reduce((max, folder) => {
        const m = folder.match(ORDER_PREFIX)
        return m ? Math.max(max, parseInt(m[1], 10)) : max
    }, 0)

    // splitOperation's label, not the raw title: the folder convention is
    // "8. Op Brand New", not "8. OPERATION Brand New — Sun".
    const label = title
        .replace(/\s*[\u2014\u2013-]\s*(sat|sun|saturday|sunday)\s*$/i, '')
        .replace(/^operation\s+/i, 'Op ')
        .trim()

    return { year, operation: sanitizeSegment(`${highest + 1}. ${label}`) }
}

/**
 * Move one item's file into the content tree and update its document.
 *
 * Returns the keys it moved between, or null when there was nothing to do —
 * the file is already in the right place, or there is no file behind the key.
 * A missing file returns null WITHOUT rewriting storageKey: pointing a record
 * at a path that has no bytes turns a recoverable problem into a broken tile.
 */
export async function relocateMedia(
    deps: RelocateDeps,
    id: ObjectId,
): Promise<{ from: string | null, to: string } | null> {
    const contentDir = deps.contentDir ?? CONTENT_DIR
    const mediaDir = deps.mediaDir ?? MEDIA_DIR

    const doc = await deps.media.findOne({ _id: id })
    if (!doc) return null

    const fromKey = typeof doc.storageKey === 'string' ? doc.storageKey : null
    if (!fromKey) return null

    const source = resolveFrom(fromKey, contentDir, mediaDir)
    if (!source || !existsSync(source)) return null

    const operationId = doc.operationId instanceof ObjectId ? doc.operationId : null
    const { year, operation } = await resolveOperationFolder(deps, operationId)

    const ext = source.slice(source.lastIndexOf('.') + 1).toLowerCase()
    const file = buildMediaFilename({
        id: id.toString(),
        ext,
        author: typeof doc.authorName === 'string' ? doc.authorName : null,
        caption: typeof doc.caption === 'string' ? doc.caption : null,
    })

    // Mission is preserved when the item already had one — reassigning an
    // operation must not silently flatten a legacy file's mission folder.
    const mission = typeof doc.mission === 'string' && operation ? doc.mission : null
    const relative = buildContentPath({ year, operation, mission, file })
    const toKey = contentKey(relative)

    const destination = path.join(contentDir, ...relative.split('/'))
    if (path.resolve(destination) === path.resolve(source)) return null

    mkdirSync(path.dirname(destination), { recursive: true })
    // If updateOne below throws after this succeeds, the bytes now sit at
    // `destination` but the document still names `source` — a broken tile
    // until something reconciles the two. There is no transaction spanning a
    // filesystem and a database, and moving the file first is still the
    // right order (the alternative loses track of where the bytes went). It
    // self-heals: the new filename still carries [id], so the reconcile pass
    // matches it back to this document by id and rewrites storageKey — the
    // item renders broken until someone runs one (the start menu's
    // Migrations -> Reconcile: gallery disk, or any backup restore). The
    // Health view that will show it without being asked is Plan B.
    move(source, destination)

    const set: Record<string, unknown> = { storageKey: toKey }
    const unset: Record<string, ''> = {}

    if (year) set.year = year; else unset.year = ''
    if (operation) {
        set.operation = operation
        set.opLabel = splitOperation(operation).label
    } else {
        unset.operation = ''
        unset.opLabel = ''
    }
    /* Unset when the path drops it, exactly as reconcile.ts does. `mission` is
       computed above as null whenever there is no operation to hang it off, so
       reassigning a legacy file to Unknown moves the bytes to `Unknown/…`
       while the document kept claiming `mission: 'I'` — a fifth field on which
       the two halves of one operation disagreed, and one the facet rail
       filters on. */
    if (mission) set.mission = mission; else unset.mission = ''

    // takenAt follows the operation, exactly as operationFacets()
    // (lib/gallery/operation-facets.ts) does — the two must never disagree.
    // That function always writes takenAt (null in its Unknown branch, never
    // left alone), so an item relocated to Unknown here must do the same:
    // otherwise a stale date from a previous operation would survive the
    // reassignment and the gallery would keep sorting/grouping the tile on it.
    if (operationId) {
        const op = await deps.operations.findOne({ _id: operationId }, { projection: { date: 1 } })
        set.takenAt = op?.date ? new Date(op.date) : null
    } else {
        set.takenAt = null
    }

    await deps.media.updateOne({ _id: id }, {
        $set: set,
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
    })

    return { from: fromKey, to: toKey }
}

/** resolveStorageKey against the injected roots rather than the real ones. */
function resolveFrom(key: string, contentDir: string, mediaDir: string): string | null {
    if (contentDir === CONTENT_DIR && mediaDir === MEDIA_DIR) return resolveStorageKey(key)

    if (key.startsWith('media:')) {
        const file = key.slice('media:'.length)
        if (!/^[0-9a-f]{24}(_poster)?\.[a-z0-9]{2,5}$/.test(file)) return null
        return path.join(mediaDir, file)
    }
    if (key.startsWith('content:') || key.startsWith('legacy:')) {
        const segments = key.slice(key.indexOf(':') + 1).split('/')
        if (segments.length < 2 || segments.length > 4) return null
        if (segments.some(s => !s || s === '.' || s === '..' || s.includes('\\'))) return null
        return path.join(contentDir, ...segments)
    }
    return null
}

/** Rename where the filesystem allows it; copy-then-unlink across devices. */
function move(source: string, destination: string): void {
    try {
        renameSync(source, destination)
    } catch (err: unknown) {
        if (!isErrno(err, 'EXDEV')) throw err
        copyFileSync(source, destination)
        unlinkSync(source)
    }
}

/** A thrown value is `unknown`, and `in` NARROWS it — where an
 *  `as NodeJS.ErrnoException` only asserted the shape and would have read
 *  `undefined` off any non-Error throw, silently rethrowing nothing useful. */
function isErrno(err: unknown, code: string): boolean {
    return typeof err === 'object' && err !== null && 'code' in err && err.code === code
}
