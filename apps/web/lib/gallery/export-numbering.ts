import type { Document } from 'mongodb'

import { splitOperation } from './naming'

/**
 * Putting the order prefix back on, but only inside a downloaded backup.
 *
 * Folders on disk are minted without a "{n}. " prefix (see relocate.ts): the
 * number was insertion order dressed up as a sequence, and the real ordering
 * lives in the database as each item's `takenAt`. But the numbers existed for
 * a reason — a backup zip is browsed and reorganised in a file manager, with
 * no database and no website to sort anything — so the export puts them back,
 * ranked by date, for readability.
 *
 * The zip is therefore the one place the two spellings of a folder name meet,
 * and the round trip is what constrains every rule below: a numbered folder
 * re-imported from an export has to reconcile back to the SAME documents
 * rather than reading as a new set of operations.
 *
 *   - A folder that already carries a prefix is left byte-identical. That is
 *     not cosmetic: re-exporting a previously imported archive is normal, and
 *     more importantly the entire legacy archive is numbered and its documents
 *     are matched by PATH (`legacy:{year}/{op}/...`), not by an id in the
 *     filename. Renaming one of those folders would take every document in it
 *     past reconcile's rule 2 and out the other side as a missing file.
 *   - A folder is renamed only when every document filed in it can be found
 *     again by the id in its own FILENAME — reconcile's rule 1, which is what
 *     survives a folder rename. `idNamed` below is that test, asked of the
 *     database rather than assumed from the folder's name.
 *   - A rename that would collide with another folder in the same year is
 *     skipped, so an export can never merge two distinct operations into one
 *     folder on the way out.
 *
 * Pure apart from the pipeline constant: the caller runs the aggregation, so
 * nothing here imports `@/lib/mongo` (lib/backups.ts must stay importable
 * without a live Mongo connection, which that module's module-level client
 * would take away).
 */

/** One top-level-within-year folder of storage/gallery/content, as the
 *  database describes it. */
export type ExportFolderRow = {
    year: string
    /** The folder directly under the year: the `campaign` facet when the item
     *  has one, the `operation` facet otherwise — the same choice
     *  buildContentPath makes when it writes the path. */
    folder: string
    /** The earliest operation date in the folder, or null when nothing in it
     *  is dated. Null ranks LAST, matching the gallery's own rule that an
     *  unknown operation is missing information, not the beginning of time. */
    earliest: Date | null
    /** True when EVERY document in the folder is `content:`-keyed and carries
     *  its media id in the filename, i.e. reconcile can re-find all of them by
     *  id after the folder is renamed. False for any folder still holding a
     *  path-matched legacy document. */
    idNamed: boolean
}

/**
 * The aggregation that produces the rows above. Exported as data rather than
 * run here so this module stays free of a database import; the download route
 * runs it against `Db.galleryMedia`.
 *
 * Every content-tree document counts, not just `status: 'live'` ones — a
 * hidden item's bytes are in the same folder, and one path-matched legacy
 * document among a thousand id-named ones is enough to make renaming that
 * folder unsafe.
 */
export const EXPORT_FOLDER_PIPELINE: Document[] = [
    {
        $match: {
            storageKey: { $regex: /^(content|legacy):/ },
            year: { $type: 'string' },
            operation: { $type: 'string' },
        },
    },
    {
        $group: {
            _id: { year: '$year', folder: { $ifNull: ['$campaign', '$operation'] } },
            earliest: { $min: '$takenAt' },
            /* $min over booleans is the "all of them" test — false sorts below
               true in BSON, so one document that fails either check drags the
               whole folder to false. The filename regex is deliberately the
               same shape parseMediaFilename (lib/gallery/filenames.ts) reads,
               because rule 1 of reconcile is the thing this is really asking
               about. */
            idNamed: {
                $min: {
                    $and: [
                        { $regexMatch: { input: '$storageKey', regex: /^content:/ } },
                        { $regexMatch: { input: '$storageKey', regex: /\[[0-9a-f]{24}\]\.[A-Za-z0-9]{2,5}$/ } },
                    ],
                },
            },
        },
    },
]

/**
 * Narrow the aggregation's output without asserting it.
 *
 * A row whose shape does not hold is dropped rather than repaired: the only
 * consequence is a folder that keeps its unnumbered name in the zip, which is
 * exactly the behaviour for a folder the database has never heard of.
 */
export function foldersFromAggregate(raw: readonly unknown[]): ExportFolderRow[] {
    const rows: ExportFolderRow[] = []

    for (const entry of raw) {
        if (typeof entry !== 'object' || entry === null) continue
        const row: Record<string, unknown> = { ...entry }
        const id = row._id
        if (typeof id !== 'object' || id === null) continue
        const key: Record<string, unknown> = { ...id }

        const year = key.year
        const folder = key.folder
        if (typeof year !== 'string' || !year) continue
        if (typeof folder !== 'string' || !folder) continue

        rows.push({
            year,
            folder,
            earliest: row.earliest instanceof Date ? row.earliest : null,
            // Anything but an explicit `true` is treated as unsafe. An older
            // MongoDB that returned null for the $min, or a field that is
            // simply absent, must not be read as permission to rename.
            idNamed: row.idNamed === true,
        })
    }

    return rows
}

/**
 * `{year}/{folder}` -> the numbered name that folder takes inside the zip.
 *
 * Only folders that are actually being renamed appear; everything else keeps
 * the name it has on disk, which is what a caller does when the lookup misses.
 *
 * Ranking spans the whole year — numbered folders included — so the numbers a
 * reader sees follow the year's real chronology rather than counting only the
 * folders that happened to be renameable. Two folders can therefore end up
 * sharing a number (a legacy "3. Op X" beside a newly numbered "3. Op Y"),
 * which is a readability wrinkle in a zip, not a correctness problem: the
 * names are still distinct, and the collision guard below is what actually
 * keeps two folders from becoming one.
 */
export function buildFolderNumbering(rows: readonly ExportFolderRow[]): Map<string, string> {
    const byYear = new Map<string, ExportFolderRow[]>()
    for (const row of rows) {
        const list = byYear.get(row.year)
        if (list) list.push(row)
        else byYear.set(row.year, [row])
    }

    const numbering = new Map<string, string>()

    for (const [year, list] of byYear) {
        const taken = new Set(list.map(r => r.folder))

        /* Undated folders last, then folder name as the tiebreak so the same
           archive always numbers the same way — two folders of one weekend
           share a date exactly, and `numeric` keeps "2. …" before "10. …" for
           the legacy folders that already carry numbers. */
        const ranked = [...list].sort((a, b) => {
            const x = a.earliest ? a.earliest.getTime() : null
            const y = b.earliest ? b.earliest.getTime() : null
            if (x !== y) {
                if (x === null) return 1
                if (y === null) return -1
                return x - y
            }
            return a.folder.localeCompare(b.folder, undefined, { numeric: true })
        })

        ranked.forEach((row, index) => {
            // Already numbered — left exactly as it is, so a re-export is
            // idempotent and a path-matched legacy document still finds its
            // file at the path its storageKey names.
            if (splitOperation(row.folder).order !== Number.MAX_SAFE_INTEGER) return
            // Something in here can only be found again by its path.
            if (!row.idNamed) return

            const numbered = `${index + 1}. ${row.folder}`
            // Never merge two folders. Extracting a zip that named two
            // distinct operations identically would put both operations'
            // photographs in one folder, and reconcile would then rewrite one
            // set of documents to the other's facets.
            if (taken.has(numbered)) return

            taken.add(numbered)
            numbering.set(`${year}/${row.folder}`, numbered)
        })
    }

    return numbering
}

/**
 * Rewrite one tar entry's path — relative to the gallery subtree, so
 * `content/{year}/{folder}/…` — with the numbered folder name.
 *
 * `isDirectory` is required rather than inferred from the segment count
 * because `content/2026/Op Foo` is a folder to rename while
 * `content/2026/loose.jpg` is a file that merely sits at the same depth, and
 * the path alone cannot tell them apart. Everything outside `content/` (the
 * flat `media/`, `staging/`, `featured/`, `sotm/` trees) is returned
 * untouched: those hold no operation folders.
 */
export function numberContentEntry(
    name: string,
    isDirectory: boolean,
    numbering: ReadonlyMap<string, string>,
): string {
    const parts = name.split('/')
    if (parts[0] !== 'content') return name
    if (parts.length < 4 && !(isDirectory && parts.length === 3)) return name

    const numbered = numbering.get(`${parts[1]}/${parts[2]}`)
    if (!numbered) return name

    parts[2] = numbered
    return parts.join('/')
}
