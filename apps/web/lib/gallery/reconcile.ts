import type { Collection, Filter, FindOptions, ObjectId, UpdateFilter } from 'mongodb'
import { readdirSync, statSync } from 'fs'
import type { Dirent } from 'fs'
import path from 'path'

import { parseContentPath } from './content-path'
import type { ContentFacets } from './content-path'
import { parseMediaFilename } from './filenames'
import { fullKey, splitOperation, strippedKey } from './naming'
import { CONTENT_DIR, contentKey } from './paths'
import { operationYear } from './relocate'

/**
 * Making the database and the disk agree.
 *
 * Runs when a backup is imported, and when someone chooses Migrations ->
 * Reconcile: gallery disk from the repo root's `npm start` menu
 * (apps/web/scripts/reconcile-gallery.ts). Never on a timer, and never as a
 * side effect of anything else. There is no button for it in the app: the
 * Health view that will carry one is Plan B.
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
    /**
     * Things the walk could not read: unreadable *directories* and unreadable
     * *files* both land here, and the count does not distinguish them. A
     * non-zero value means "this report is incomplete by an unknown amount",
     * not "n folders are broken" — anything rendering it should say so rather
     * than imply a count of folders.
     */
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

    /* Two buckets, not one: an operation is filed under both the key that
       keeps a trailing parenthetical and the key that drops it, so a folder
       can be matched specific-first and fall back — the same two-tier match
       scripts/index-gallery.mjs makes. Knowing only the full key is what made
       reconcile UNSET the operationId the migration had established through
       the stripped one, for the two real folders that need it ("9. Op Copper
       Ridge (Lanze Verde)", "12. MW Training (CAG)"). See naming.ts. */
    const opsByFullKey = new Map<string, ReconcileOperationDoc[]>()
    const opsByStrippedKey = new Map<string, ReconcileOperationDoc[]>()
    const fileUnder = (map: Map<string, ReconcileOperationDoc[]>, key: string, op: ReconcileOperationDoc) => {
        if (!key) return
        const list = map.get(key)
        if (list) list.push(op)
        else map.set(key, [op])
    }
    for (const op of operations) {
        const title = String(op.title ?? '')
        if (!title) continue
        fileUnder(opsByFullKey, fullKey(title), op)
        fileUnder(opsByStrippedKey, strippedKey(title), op)
    }
    for (const map of [opsByFullKey, opsByStrippedKey]) {
        for (const list of map.values()) {
            // A dateless operation sorts last rather than first, so it never
            // wins the candidates[0] fallback over one that can date the media.
            list.sort((a, b) => (toDate(a.date)?.getTime() ?? Number.MAX_SAFE_INTEGER)
                - (toDate(b.date)?.getTime() ?? Number.MAX_SAFE_INTEGER))
        }
    }

    // A year folder is a season, not a calendar year — "2022 - 2023" spans two
    // outright — so one year either side still counts.
    //
    // operationYear() rather than a third getUTCFullYear() of its own:
    // relocate.ts and operationFacets() (lib/gallery/operation-facets.ts)
    // already share it,
    // and this is the function that decides whether the folder they chose
    // still names the same operation. A private copy is what quietly disagrees
    // on the one day a year it matters.
    const yearOf = (op: ReconcileOperationDoc) => {
        const date = toDate(op.date)
        return date ? Number(operationYear(date)) : NaN
    }
    const inYear = (candidates: ReconcileOperationDoc[] | undefined, yearNum: number) =>
        candidates?.find(op => yearOf(op) === yearNum)
        ?? candidates?.find(op => Math.abs(yearOf(op) - yearNum) === 1)

    /** The operation a folder label names, preferring one from the same year. */
    function operationFor(folder: string | null, year: string | null): ReconcileOperationDoc | null {
        if (!folder) return null
        const label = splitOperation(folder).label
        const full = opsByFullKey.get(fullKey(label))
        const stripped = opsByStrippedKey.get(strippedKey(label))
        if (!full?.length && !stripped?.length) return null

        const yearNum = year ? Number(year.slice(0, 4)) : NaN

        /* Year-matching is exhausted on the SPECIFIC bucket before the loose
           one is consulted at all, and only then does the undated fallback
           run — so "Op Copper Ridge (Lanze Verde)" can reach a plain,
           unrelated "Op Copper Ridge" only when nothing carrying its own
           parenthetical matched. Reversing these four lines is what collapses
           the two folders onto one operation. */
        return (Number.isNaN(yearNum) ? undefined : inYear(full, yearNum))
            ?? (Number.isNaN(yearNum) ? undefined : inYear(stripped, yearNum))
            ?? full?.[0]
            ?? stripped?.[0]
            ?? null
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

            const { id, ext } = parseMediaFilename(entry.name)
            if (!MEDIA_EXT.has(ext)) continue

            report.scanned++

            /* A media file with no parseable content path — in practice, one
               loose at the ROOT of content/ rather than inside a year or
               Unknown, which is a one-segment path parseContentPath refuses.
               It used to `continue` BEFORE scanned++, so it was not scanned,
               not notIndexed and not unreadable: invisible. For a feature
               whose whole premise is "reorganise this by hand", a misplaced
               file the report never mentions is the one outcome it must never
               produce. No proposed operation, because there is no folder to
               read one out of. */
            const facets = parseContentPath(relative)
            if (!facets) {
                let loose = 0
                try { loose = statSync(full).size } catch { report.unreadable++; continue }
                report.notIndexed.push({ path: relative, bytes: loose, proposedOperation: null })
                continue
            }

            const key = contentKey(relative)

            // Rule 1 — by id. Before the path rule, because a file that MOVED
            // has both a resolvable id and a stale path, and matching by path
            // first would fail to notice it moved.
            //
            // Skipped once that document already has a file: copying instead
            // of moving leaves two files carrying the same [id], which is a
            // normal mistake for a feature that invites reorganising a backup
            // by hand. Without the seenIds test the pair would count twice in
            // matchedById and queue two contradictory relocations of one
            // document, the winner decided by readdir order. The second copy
            // falls through to notIndexed, which is the truthful answer.
            const byIdDoc = id ? byId.get(id) : undefined
            if (byIdDoc && !seenIds.has(byIdDoc._id.toString())) {
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
            //
            // `legacy:` is the former spelling of `content:` and names the
            // same directory; it is still what scripts/index-gallery.mjs
            // writes. Rule 4 admits both spellings, so without the second
            // lookup here a legacy-keyed record could never match, and running
            // this against a database indexed today would report EVERY record
            // missing and EVERY file not-indexed at once — the report exactly
            // inverted, in front of a human holding a delete button.
            const byKeyDoc = byKey.get(key) ?? byKey.get(`legacy:${relative}`)
            if (byKeyDoc) {
                report.matchedByPath++
                seenKeys.add(key)
                // The id as well as the key, because rule 4 tests a document's
                // OWN storageKey and that is the `legacy:` spelling, which
                // seenKeys does not hold.
                seenIds.add(byKeyDoc._id.toString())
                continue
            }

            // Rule 3 — nothing matches. Reported, never inserted.
            //
            // statSync sits here rather than above the rules on purpose: a
            // file that readdir listed but stat cannot read was otherwise
            // counted in `unreadable` and skipped before rules 1 and 2, so its
            // document was reported missing for a file that is physically
            // present. `bytes` is only ever needed on this branch.
            let bytes = 0
            try { bytes = statSync(full).size } catch { report.unreadable++; continue }

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
            // Only when the operation actually carries one. Writing
            // toDate(op.date) unconditionally would null takenAt for a
            // dateless operation — the very loss the else branch below goes
            // out of its way to avoid, and it would overwrite a date a
            // reviewer set by hand.
            const takenAt = toDate(op.date)
            if (takenAt) set.takenAt = takenAt
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
