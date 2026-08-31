import { splitOperation } from './naming'

/**
 * Taking the order prefix OFF the folders that already carry one.
 *
 * relocate.ts stopped minting `{n}. {label}` folders, and the ordering moved
 * into the database as each item's `takenAt`. The folders that already existed
 * were deliberately left alone at the time — `findByOperationKey` matches on
 * `splitOperation(folder).label`, so a numbered folder is still found and
 * reused, and the number simply survives. This is the migration that finishes
 * the job: the number comes off the folder on disk, and off every document
 * filed under it.
 *
 * This module is the PLAN only — pure, no fs and no mongodb, so the decision
 * about which folders may be renamed can be tested without a disk or a
 * database. scripts/strip-folder-numbers.ts is the shell that reads the tree,
 * reads the keys, prints this plan and (only with --apply) carries it out.
 *
 * The four things it refuses to do, each reported rather than silently
 * dropped:
 *
 *   - **Merge two folders.** Stripping `5. Op Northern Wall` when
 *     `Op Northern Wall` already exists in that year would put two
 *     operations' photographs in one folder, and the next reconcile would
 *     rewrite one set of documents to the other's facets. Unrecoverable, so
 *     both folders are left exactly as they are. Same answer when two NUMBERED
 *     folders in one year would strip to the same name.
 *   - **Rename onto a path a document already claims.** Compared without the
 *     `content:`/`legacy:` prefix, because both spell the same directory — a
 *     `legacy:` document and a `content:` document for one file is a condition
 *     index-gallery.mjs already reports, and this must not turn it into two
 *     files.
 *   - **Touch anything but the top-level-within-year slot.** Campaign, mission
 *     and day folders never carried a prefix. Only a directory sitting
 *     directly inside a year (or inside `Unknown`, which is a year-level
 *     folder with the same shape below it) is ever a candidate.
 *   - **Act on a leading number that is not an order.** See MAX_ORDER_DIGITS
 *     below, and naming.ts's ORDER_PREFIX for the half of this that had to be
 *     fixed at the source.
 *
 * Idempotent twice over. A folder with no prefix is not a candidate at all, so
 * a second run plans nothing; and a folder whose directory was renamed by a
 * run that then failed to finish its documents is STILL a candidate, because
 * candidates come from the storage keys as well as from the disk. That is what
 * makes "run it again" the recovery for a half-applied pass rather than a
 * repair by hand.
 */

/** A directory sitting directly inside content/: a year, or `Unknown`. */
export type ContainerListing = {
    name: string
    /** The directory names directly inside it — the slot that carries the
     *  prefix, and the only slot this migration ever renames. */
    folders: readonly string[]
}

export type KeyRewrite = {
    from: string
    to: string
    /**
     * Which facet on the document names the folder being renamed.
     *
     * Exactly the split parseContentPath (content-path.ts) makes: five path
     * segments is the campaign grammar and `dirs[1]` is the CAMPAIGN; anything
     * shallower reads `dirs[1]` as the OPERATION — including
     * `{year}/{campaign}/{Saturday|Sunday}/{file}`, which relocate.ts writes
     * with `campaign: null` on purpose. Derived from the segment count rather
     * than from the document's own fields, so the facet this migration
     * rewrites and the facet reconcile would re-derive from the same path are
     * always the same field.
     */
    facet: 'campaign' | 'operation'
}

export type FolderRename = {
    container: string
    from: string
    to: string
    /**
     * False when the directory has ALREADY been renamed — by a run that
     * renamed it and then failed to update its documents — and only the
     * database is behind. The rename is skipped and the documents are still
     * brought into step, which is what makes a half-applied pass recoverable
     * by running this again.
     */
    renameOnDisk: boolean
    keys: KeyRewrite[]
    /**
     * True when every document in the folder is `content:`-keyed and carries
     * its media id in its filename, i.e. reconcile's rule 1 could re-find all
     * of them after a rename. False means the folder holds at least one
     * path-matched (legacy) document. The rename is still safe — this
     * migration rewrites those documents' keys itself rather than relying on
     * reconcile — but a backup export can never number that folder again
     * (export-numbering.ts's `idNamed` rule), so its number is gone from the
     * zip as well as from the disk. Reported so that is a decision rather than
     * a discovery.
     */
    idNamed: boolean
}

export type FolderSkip = {
    container: string
    folder: string
    reason: string
    documents: number
}

export type StripPlan = { renames: FolderRename[], skips: FolderSkip[] }

/**
 * How many digits a leading number may have and still be treated as an order.
 *
 * The archive's highest folder number is two digits, and naming.ts's
 * ORDER_PREFIX now requires a separator — so `1st Recon Sweep` is not a
 * candidate at all. What the separator rule cannot tell apart is
 * `2021 Recon Sweep`: a real name beginning with a year and a legitimate
 * "number space label" prefix are the same string. A four-digit lead is far
 * more likely to be a year than the four-thousandth operation of one season,
 * so it is refused and REPORTED, rather than either mangled or silently
 * ignored. The refusal lives here and not in splitOperation, so the two never
 * disagree about what a label IS — this migration is only more conservative
 * about acting on one.
 */
export const MAX_ORDER_DIGITS = 3

/** The filename shape parseMediaFilename (filenames.ts) reads an id out of,
 *  and therefore the shape reconcile's rule 1 can re-find after a rename. */
const ID_NAMED = /\[[0-9a-f]{24}\]\.[A-Za-z0-9]{2,5}$/

/** The digits at the head of a folder name, read off the NAME rather than
 *  from splitOperation's parsed `order`, so a leading zero still counts as a
 *  digit. */
const LEADING_DIGITS = /^\s*(\d+)/

type ParsedKey = { key: string, prefix: string, segments: string[] }

/**
 * Split a `content:`/`legacy:` key into its prefix and path segments, or null
 * for anything this migration must not touch.
 *
 * Two to five segments, matching resolveStorageKey (paths.ts) and
 * parseContentPath — a key outside that range names no file this tree can
 * serve, and rewriting one would be inventing a path rather than repairing
 * one. `media:`/`featured:`/`sotm:` keys name flat directories with no folder
 * level at all and are dropped here.
 */
function parseKey(key: string): ParsedKey | null {
    const colon = key.indexOf(':')
    if (colon < 0) return null

    const prefix = key.slice(0, colon)
    if (prefix !== 'content' && prefix !== 'legacy') return null

    const segments = key.slice(colon + 1).split('/')
    if (segments.length < 2 || segments.length > 5) return null
    if (segments.some(s => !s || s === '.' || s === '..' || s.includes('\\'))) return null

    return { key, prefix, segments }
}

/** `{container}/{folder}` — neither part can contain a slash (folder names
 *  come from sanitizeSegment or from readdir, and parseKey rejects a segment
 *  holding a backslash), so this round-trips unambiguously. */
function groupKey(container: string, folder: string): string {
    return `${container}/${folder}`
}

export function planFolderStrip(
    containers: readonly ContainerListing[],
    keys: readonly string[],
): StripPlan {
    const onDisk = new Map<string, Set<string>>()
    for (const container of containers) onDisk.set(container.name, new Set(container.folders))

    /* Every path any document claims, WITHOUT its key prefix. `content:` and
       `legacy:` name the same directory, so comparing whole keys would let a
       rename land a `legacy:` document on the path a `content:` one already
       holds — two records for one file, which is the condition
       index-gallery.mjs reports for a human rather than resolving. */
    const pathsTaken = new Set<string>()
    const byFolder = new Map<string, ParsedKey[]>()

    for (const key of keys) {
        const parsed = parseKey(key)
        if (!parsed) continue

        pathsTaken.add(parsed.segments.join('/'))

        // `Unknown/file.jpg` — two segments, so there is no folder level to
        // rename and nothing under one to rewrite.
        if (parsed.segments.length < 3) continue

        const group = groupKey(parsed.segments[0], parsed.segments[1])
        const list = byFolder.get(group)
        if (list) list.push(parsed)
        else byFolder.set(group, [parsed])
    }

    type Candidate = { container: string, folder: string, to: string, digits: string }
    const candidates = new Map<string, Candidate>()

    /* Candidates come from BOTH sides, and that is deliberate. The disk finds
       a numbered folder whose documents are already correct (or which holds
       none at all); the keys find a folder whose directory a previous,
       half-finished run already renamed, leaving its documents pointing at a
       name that is no longer there. Only the second source makes re-running
       this the repair for a partial failure. */
    const consider = (container: string, folder: string): void => {
        const group = groupKey(container, folder)
        if (candidates.has(group)) return

        const { label, order } = splitOperation(folder)
        // No prefix at all — not a candidate, which is what makes a second run
        // over an already-stripped tree plan nothing.
        if (order === Number.MAX_SAFE_INTEGER) return

        const digits = folder.match(LEADING_DIGITS)
        candidates.set(group, { container, folder, to: label, digits: digits ? digits[1] : '' })
    }

    for (const container of containers) for (const folder of container.folders) consider(container.name, folder)
    for (const group of byFolder.keys()) {
        const slash = group.indexOf('/')
        consider(group.slice(0, slash), group.slice(slash + 1))
    }

    /* How many candidates in one year want the same stripped name. Counted
       before anything is planned, because "5. Op Twin" and "7. Op Twin" are
       symmetrical: neither may win, so both have to be able to see the other. */
    const destinations = new Map<string, number>()
    for (const candidate of candidates.values()) {
        const dest = groupKey(candidate.container, candidate.to)
        destinations.set(dest, (destinations.get(dest) ?? 0) + 1)
    }

    const renames: FolderRename[] = []
    const skips: FolderSkip[] = []

    /* Sorted so the printed plan is the same on every run against the same
       tree — an operator comparing a dry run against the --apply that follows
       it is reading two lists, and a Map's insertion order is readdir's. */
    const ordered = [...candidates.values()].sort((a, b) =>
        a.container.localeCompare(b.container, undefined, { numeric: true })
        || a.folder.localeCompare(b.folder, undefined, { numeric: true }))

    for (const candidate of ordered) {
        const rows = byFolder.get(groupKey(candidate.container, candidate.folder)) ?? []
        const skip = (reason: string): void => {
            skips.push({ container: candidate.container, folder: candidate.folder, reason, documents: rows.length })
        }

        // splitOperation falls back to the whole folder name when the label
        // would be empty, so this one test also covers a folder whose name is
        // nothing but a number.
        if (!candidate.to || candidate.to === candidate.folder) {
            skip('stripping the prefix would leave the name unchanged or empty')
            continue
        }

        /* Defence in depth over sanitizeSegment: the destination is a
           substring of a name readdir returned, so it cannot hold a separator
           today — but it is the one value in this migration that is COMPUTED,
           and it is about to be joined into a filesystem path and into a
           storage key. */
        if (candidate.to.includes('/') || candidate.to.includes('\\')
            || candidate.to === '.' || candidate.to === '..') {
            skip('the stripped name is not a safe single path segment')
            continue
        }

        if (candidate.digits.length > MAX_ORDER_DIGITS) {
            skip(`the leading "${candidate.digits}" reads as a year, not an order`)
            continue
        }

        if ((destinations.get(groupKey(candidate.container, candidate.to)) ?? 0) > 1) {
            skip(`another numbered folder here also strips to "${candidate.to}"`)
            continue
        }

        const folders = onDisk.get(candidate.container) ?? new Set<string>()
        const sourceExists = folders.has(candidate.folder)
        const targetExists = folders.has(candidate.to)

        // Never merge. Two operations' photographs in one folder cannot be
        // told apart again afterwards, so both folders keep their names and a
        // human decides.
        if (sourceExists && targetExists) {
            skip(`"${candidate.to}" already exists in ${candidate.container}`)
            continue
        }
        if (!sourceExists && !targetExists) {
            skip('neither the numbered folder nor its stripped name is on disk')
            continue
        }

        const rewrites: KeyRewrite[] = []
        let claimed = 0
        for (const row of rows) {
            const destination = [row.segments[0], candidate.to, ...row.segments.slice(2)].join('/')
            if (pathsTaken.has(destination)) { claimed++; continue }

            const facet: KeyRewrite['facet'] = row.segments.length === 5 ? 'campaign' : 'operation'
            rewrites.push({ from: row.key, to: `${row.prefix}:${destination}`, facet })
        }

        if (claimed > 0) {
            skip(`${claimed} document(s) already claim the destination path`)
            continue
        }

        renames.push({
            container: candidate.container,
            from: candidate.folder,
            to: candidate.to,
            renameOnDisk: sourceExists,
            keys: rewrites,
            // Vacuously true for a folder holding no documents: there is
            // nothing in it a backup export could fail to number.
            idNamed: rows.every(row => row.prefix === 'content' && ID_NAMED.test(row.segments[row.segments.length - 1])),
        })
    }

    return { renames, skips }
}
