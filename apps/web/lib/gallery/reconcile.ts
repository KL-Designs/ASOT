import type { Collection, Filter, FindOptions, ObjectId, UpdateFilter } from 'mongodb'
import { readdirSync, statSync } from 'fs'
import type { Dirent } from 'fs'
import path from 'path'

import { parseContentPath } from './content-path'
import type { ContentFacets } from './content-path'
import { parseMediaFilename } from './filenames'
import { normalizeKey, splitOperation } from './naming'
import { CONTENT_DIR, contentKey } from './paths'

/**
 * Making the database and the disk agree.
 *
 * Runs when a backup is imported and when a human presses Re-scan disk. Never
 * on a timer, and never as a side effect of anything else.
 *
 * Four rules, in this order:
 *   1. the filename carries `[id]` and that record exists -> match by id, and
 *      re-read year/operation/mission from the folders it now sits in;
 *   2. no id, but the path is some record's storageKey    -> match by path
 *      (legacy files, which were never renamed);
 *   3. the file matches no record either way              -> report it;
 *   4. a record's storageKey has no file behind it        -> report it.
 *
 * Nothing here deletes a record or a file. A restore that fails partway leaves
 * a tree missing most of its files; a reconcile that deleted records for
 * missing files would then destroy the index of the entire archive — captions,
 * tags, authors and votes for 4,781 items — in response to a transient
 * condition. Every destructive resolution is a button a human presses.
 */

export type ReconcileReport = {
    scanned: number
    matchedById: number
    matchedByPath: number
    relocated: { id: string, from: string, to: string, operation: string | null }[]
    notIndexed: { path: string, bytes: number, proposedOperation: string | null }[]
    missingFiles: { id: string, storageKey: string, caption: string | null }[]
    failedProcessing: { id: string, error: string }[]
    unreadable: number
    at: Date
}

/**
 * The fields reconcile reads off a media document.
 *
 * Typed `unknown` rather than `string` on purpose. It is what lets BOTH a real
 * `Collection<GalleryMedia>` (whose `storageKey` is `string | undefined`) and a
 * plain object literal in a test (whose fields arrive through a
 * `Record<string, unknown>` index signature) satisfy `ReconcileDeps` with no
 * cast on either side: `string` here would reject the fixture, and a
 * `Record<string, unknown>` document type would reject the driver, because an
 * interface never gets an implicit index signature. Every read below is
 * `typeof`-guarded regardless, which is what a document written by an older
 * build of this application deserves.
 */
export type ReconcileMediaDoc = {
    _id: ObjectId
    storageKey?: unknown
    caption?: unknown
    processingError?: unknown
}

/** The two fields the folder-to-operation match needs. Same reasoning. */
export type ReconcileOperationDoc = {
    _id: ObjectId
    title?: unknown
    date?: unknown
}

/**
 * `find`/`updateOne` are declared with method syntax (`foo(x): y`, not
 * `foo: (x) => y`) so TypeScript checks their parameter types bivariantly —
 * the same reason RelocateDeps does it. That is what lets a test fixture
 * declare `updateOne(filter: { _id: ObjectId }, …)`, which is all this module
 * ever passes, while the real driver keeps its full `Filter`/`UpdateFilter`
 * signature.
 *
 * `find` is declared as returning a cursor rather than a promise because that
 * is the shape `Collection.find` actually has; a promise-returning `find`
 * would make `{ media: db.galleryMedia }` a type error and force a cast at the
 * one call site that matters. `acceptsRealCollections` below pins that.
 */
export type ReconcileDeps = {
    media: {
        find(filter: Filter<GalleryMedia>, options?: FindOptions): { toArray(): Promise<ReconcileMediaDoc[]> }
        updateOne(filter: Filter<GalleryMedia>, update: UpdateFilter<GalleryMedia>): Promise<unknown>
    }
    operations: {
        find(filter: Filter<Operation>, options?: FindOptions): { toArray(): Promise<ReconcileOperationDoc[]> }
    }
    /** Defaults to the real tree. Tests point this at a fixture. */
    contentDir?: string
}

/** Extensions the archive actually contains. `.jfif` is plain JPEG under a
 *  different extension — three real photographs are saved that way. */
const MEDIA_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'jfif', 'mp4', 'webm', 'mov'])

/** An operation's date, whatever the document happens to hold. Mongo hands
 *  back a Date, but a record written by an import may hold the ISO string, and
 *  sorting those as NaN would pick the wrong session day of a repeated
 *  operation name and date the media to it. */
function toDate(value: unknown): Date | null {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value)
        return Number.isNaN(parsed.getTime()) ? null : parsed
    }
    return null
}

export async function reconcile(deps: ReconcileDeps): Promise<ReconcileReport> {
    const contentDir = deps.contentDir ?? CONTENT_DIR

    const report: ReconcileReport = {
        scanned: 0, matchedById: 0, matchedByPath: 0,
        relocated: [], notIndexed: [], missingFiles: [], failedProcessing: [],
        unreadable: 0, at: new Date(),
    }

    const docs = await deps.media.find({}).toArray()

    const byId = new Map<string, ReconcileMediaDoc>()
    const byKey = new Map<string, ReconcileMediaDoc>()
    for (const doc of docs) {
        byId.set(doc._id.toString(), doc)
        if (typeof doc.storageKey === 'string') byKey.set(doc.storageKey, doc)
    }

    /* Operations grouped by normalised title, so a folder name can be resolved
       back to a real operation — the same match the migration makes, and the
       reason a file dragged into "4. Op Silent Ridge" gets that operation's
       date. Sorted ascending within a key because operations are recorded per
       session day and the earliest is the weekend's start. */
    const operations = await deps.operations.find(
        { deletedAt: { $exists: false } },
        { projection: { title: 1, date: 1 } },
    ).toArray()

    const opsByKey = new Map<string, ReconcileOperationDoc[]>()
    for (const op of operations) {
        const key = normalizeKey(String(op.title ?? ''))
        if (!key) continue
        const list = opsByKey.get(key)
        if (list) list.push(op)
        else opsByKey.set(key, [op])
    }
    for (const list of opsByKey.values()) {
        // A dateless operation sorts last rather than first, so it never wins
        // the candidates[0] fallback over one that can actually date the media.
        list.sort((a, b) => (toDate(a.date)?.getTime() ?? Number.MAX_SAFE_INTEGER)
            - (toDate(b.date)?.getTime() ?? Number.MAX_SAFE_INTEGER))
    }

    /** The operation a folder label names, preferring one from the same year. */
    function operationFor(folder: string | null, year: string | null): ReconcileOperationDoc | null {
        if (!folder) return null
        const candidates = opsByKey.get(normalizeKey(splitOperation(folder).label))
        if (!candidates?.length) return null

        const yearNum = year ? Number(year.slice(0, 4)) : NaN
        if (Number.isNaN(yearNum)) return candidates[0]

        // A year folder is a season, not a calendar year — "2022 - 2023" spans
        // two outright — so one year either side still counts.
        const yearOf = (op: ReconcileOperationDoc) => toDate(op.date)?.getUTCFullYear() ?? NaN
        return candidates.find(op => yearOf(op) === yearNum)
            ?? candidates.find(op => Math.abs(yearOf(op) - yearNum) === 1)
            ?? candidates[0]
    }

    /* A file was found on disk for this key / for this document. Both are
       tracked: the key answers "is there a file at this path", while the id
       answers "was this record accounted for at all" — which is the question
       rule 4 actually asks about a document whose file moved. */
    const seenKeys = new Set<string>()
    const seenIds = new Set<string>()

    /* Relocations are collected here and applied after the walk rather than
       inside it, so one failing write cannot abandon a half-finished scan. */
    const pending: {
        doc: ReconcileMediaDoc
        key: string
        facets: ContentFacets
        from: string
    }[] = []

    /* Walked with an explicit depth cap rather than unbounded recursion: the
       tree is at most year/operation/mission deep, and a symlink loop in a
       restored backup must not spin forever. (withFileTypes reports a symlink
       as neither a file nor a directory, so those are already skipped; the cap
       is what survives a junction or bind mount that reports as a real one.) */
    walk(contentDir, [], 0)

    function walk(dir: string, trail: string[], depth: number): void {
        if (depth > 3) return

        let entries: Dirent[]
        try {
            entries = readdirSync(dir, { withFileTypes: true })
        } catch {
            // An unreadable directory — permissions, a broken symlink, a
            // Windows path over 260 characters. Counted, not fatal: a
            // reconcile over a five-year archive must not die on one folder.
            report.unreadable++
            return
        }

        for (const entry of entries) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) { walk(full, [...trail, entry.name], depth + 1); continue }
            if (!entry.isFile()) continue

            const relative = [...trail, entry.name].join('/')
            const facets = parseContentPath(relative)
            if (!facets) continue

            const { id, ext } = parseMediaFilename(entry.name)
            if (!MEDIA_EXT.has(ext)) continue

            report.scanned++

            let bytes = 0
            try { bytes = statSync(full).size } catch { report.unreadable++; continue }

            const key = contentKey(relative)

            // Rule 1 — by id. Before the path rule, because a file that MOVED
            // has both a resolvable id and a stale path, and matching by path
            // first would fail to notice it moved.
            const byIdDoc = id ? byId.get(id) : undefined
            if (byIdDoc) {
                report.matchedById++
                seenKeys.add(key)
                seenIds.add(byIdDoc._id.toString())
                if (byIdDoc.storageKey !== key) {
                    pending.push({
                        doc: byIdDoc,
                        key,
                        facets,
                        from: typeof byIdDoc.storageKey === 'string' ? byIdDoc.storageKey : '',
                    })
                }
                continue
            }

            // Rule 2 — by path. Legacy files, never renamed.
            const byKeyDoc = byKey.get(key)
            if (byKeyDoc) {
                report.matchedByPath++
                seenKeys.add(key)
                seenIds.add(byKeyDoc._id.toString())
                continue
            }

            // Rule 3 — nothing matches. Reported, never inserted.
            report.notIndexed.push({ path: relative, bytes, proposedOperation: facets.operation })
        }
    }

    // Applied after the walk rather than inside it, so one failing write
    // cannot abandon the rest of the scan half-done.
    for (const item of pending) {
        const op = operationFor(item.facets.operation, item.facets.year)

        const set: Record<string, unknown> = { storageKey: item.key }
        const unset: Record<string, ''> = {}

        if (item.facets.year) set.year = item.facets.year; else unset.year = ''
        if (item.facets.operation) {
            set.operation = item.facets.operation
            set.opLabel = splitOperation(item.facets.operation).label
        } else {
            unset.operation = ''
            unset.opLabel = ''
        }
        if (item.facets.mission) set.mission = item.facets.mission; else unset.mission = ''

        if (op) {
            set.operationId = op._id
            set.takenAt = toDate(op.date)
        } else {
            unset.operationId = ''
            // Deliberately does NOT null takenAt. A folder this pass cannot
            // resolve to an operation may still be one a reviewer dated by
            // hand, and discarding that loses real work. relocateMedia *does*
            // null it, and the two agree in intent: there the DATABASE is the
            // source of truth and an Unknown item is a decision someone made,
            // whereas here the DISK is, and an unmatched folder means "could
            // not tell", not "there is no operation".
        }

        await deps.media.updateOne({ _id: item.doc._id }, {
            $set: set,
            ...(Object.keys(unset).length ? { $unset: unset } : {}),
        })

        report.relocated.push({
            id: item.doc._id.toString(),
            from: item.from,
            to: item.key,
            operation: item.facets.operation,
        })
    }

    // Rule 4 — records with no file. Only content keys: a `media:` key is a
    // pending item that has not been published yet, it lives in a directory
    // this walk never visits, and it is out of scope rather than broken.
    for (const doc of docs) {
        const key = doc.storageKey
        if (typeof key !== 'string') continue
        if (!key.startsWith('content:') && !key.startsWith('legacy:')) continue
        if (seenKeys.has(key)) continue

        // A document this run relocated still holds its OLD key here — `docs`
        // is the snapshot read before the writes above — and only its new key
        // is in seenKeys. Without this, every file a human moved would be
        // reported missing by the same pass that successfully moved it. Keyed
        // on the id rather than scanning report.relocated, which would be
        // 4,781 × 4,781 comparisons on a full re-import.
        if (seenIds.has(doc._id.toString())) continue

        report.missingFiles.push({
            id: doc._id.toString(),
            storageKey: key,
            caption: typeof doc.caption === 'string' ? doc.caption : null,
        })
    }

    for (const doc of docs) {
        if (typeof doc.processingError === 'string' && doc.processingError) {
            report.failedProcessing.push({ id: doc._id.toString(), error: doc.processingError })
        }
    }

    return report
}

/**
 * Compile-time only: a real `Collection<GalleryMedia>` and `Collection<Operation>`
 * satisfy ReconcileDeps with no cast. Never called — it exists so that a change
 * to the types above which would force an `as` at the real call site fails the
 * typecheck here instead, where the test fixture is the only other thing that
 * has to keep satisfying them.
 */
export function acceptsRealCollections(
    media: Collection<GalleryMedia>,
    operations: Collection<Operation>,
): ReconcileDeps {
    return { media, operations }
}
