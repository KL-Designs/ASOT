/**
 * Deciding which document each featured file should hand its rail slot to.
 *
 * The rail reads exactly one field — `featuredOrder` on `gallery_media`
 * (`/api/gallery/route.ts`) — and no document in the live database carries it.
 * `scripts/index-gallery.mjs` does compute one for every file in
 * `storage/gallery/featured`, but it merges its facets into `$setOnInsert`,
 * which is correct for a caption or a tag (a re-run must not stomp a reviewer's
 * edit) and is why `featuredOrder` never landed: the `featured:` documents were
 * inserted by an earlier run that did not carry the field, so every run since
 * has been a deliberate no-op on them. Hence a migration, and hence `$set`.
 *
 * The judgement this module holds is the second half of that problem. Several
 * of the 58 files in `featured/` are the same photograph that already sits in
 * the archive — see the header comment on `app/api/gallery/route.test.ts`. The
 * archive copy carries a year, an operation, an author and a caption; the
 * `featured:` copy carries none of them, because that directory predates media
 * ids entirely. Featuring the `featured:` copy therefore yields a bare tile
 * with no credit, beside an archive that knows exactly who took the picture.
 * So where a featured file can be identified with an archive original, the rail
 * slot goes to the ARCHIVE document instead.
 *
 * HOW A MATCH IS MADE, and why it is not a hash. Byte size and pixel
 * dimensions, all three exact, all three read off fields `index-gallery.mjs`
 * already wrote — so the whole plan is one database query and reads no image
 * files at all. A content hash would be exact, but it means reading every
 * candidate: ~4,800 files averaging 3.8MB is roughly 18GB off disk for a
 * one-time backfill, and the hashes would have to be stored somewhere to make a
 * second run cheap. Size-plus-dimensions is near-exact in the direction that
 * matters: two DIFFERENT screenshots sharing a byte count to the byte AND an
 * identical pixel width and height is vanishingly unlikely at these file sizes,
 * and the criterion's real failure mode is the safe one — a featured copy that
 * was re-encoded or resized on its way into the directory simply matches
 * nothing and keeps its own tile.
 *
 * Pure: no `fs`, no `mongodb`. Same split as strip-folder-numbers.ts — the
 * script does the I/O, this decides, and the decision is what the tests
 * exercise.
 */

/** One `featured:`-keyed document — a file in storage/gallery/featured. */
export interface FeaturedCandidate {
    id: string
    /** The filename behind the `featured:` key. The rail's order is this,
     *  ascending: it is the order readdir gave the directory, which is the
     *  order the rail showed before it had one at all. */
    file: string
    bytes?: number
    width?: number
    height?: number
}

/** One archive document — a `content:`/`legacy:`-keyed item that a visitor can
 *  already find in the grid, dated and attributed. */
export interface ArchiveCandidate {
    id: string
    key: string
    bytes?: number
    width?: number
    height?: number
}

/** Why a featured file kept its own tile rather than handing it to an archive
 *  original. Reported per file, because deciding whether the matching is
 *  trustworthy is the whole point of the dry run. */
export type SelfReason =
    /** No archive document had the same bytes and dimensions. */
    | 'no-match'
    /** More than one did — indistinguishable on these facts, so neither is
     *  chosen. */
    | 'ambiguous'
    /** The featured document is missing a byte count or dimensions, so there
     *  was nothing to match on. `index-gallery.mjs` omits width/height for a
     *  file sharp could not read. */
    | 'unmeasured'
    /** Its match was already claimed by an earlier featured file. Two featured
     *  copies of one archive photograph would otherwise write two different
     *  `featuredOrder` values to the same document, and the rail would come out
     *  one tile short with a hole in the sequence. */
    | 'archive-claimed'

export type FeaturedPlacement =
    | {
        target: 'archive'
        featuredId: string
        featuredFile: string
        /** The document that gets `featuredOrder` — never touched otherwise. */
        archiveId: string
        archiveKey: string
        order: number
    }
    | {
        target: 'self'
        featuredId: string
        featuredFile: string
        order: number
        reason: SelfReason
        /** The archive keys that matched, for a reader to judge. Empty for
         *  'no-match' and 'unmeasured'; the rival candidates for 'ambiguous';
         *  the single claimed key for 'archive-claimed'. */
        candidates: string[]
    }

export interface FeaturedOrderPlan {
    /** One per featured document, in rail order — `order` is the index, so the
     *  sequence is always contiguous from 0 no matter how the buckets fell. */
    placements: FeaturedPlacement[]
}

/** The three facts a match is made on, as one key. Undefined in any of them
 *  means the document cannot be matched at all — `0` is not treated as a valid
 *  measurement either, since a zero-byte or zero-pixel record is a broken probe
 *  rather than a photograph, and letting those group would match every broken
 *  record to every other one. */
function fingerprint(doc: { bytes?: number, width?: number, height?: number }): string | null {
    const { bytes, width, height } = doc
    if (!bytes || !width || !height) return null
    return `${bytes}x${width}x${height}`
}

/** Byte-for-byte ordering, not `localeCompare`. The order only has to be the
 *  same on every machine that runs this — a locale-sensitive comparison would
 *  give a different rail on a different host, and the sequence is then written
 *  into the database where nobody would ever suspect the collation. */
function byFilename(a: FeaturedCandidate, b: FeaturedCandidate): number {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1
    // Unreachable while the unique index on storageKey holds, since the key IS
    // `featured:{file}`. Here so the sort is total regardless.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Assign every featured file a rail position, and decide which document holds
 * it.
 *
 * `archive` should already be narrowed to live, `content:`/`legacy:`-keyed
 * images by the caller — this function does not know what a storage key means
 * and will happily match anything it is handed.
 */
export function planFeaturedOrder(
    featured: FeaturedCandidate[],
    archive: ArchiveCandidate[],
): FeaturedOrderPlan {
    const byPrint = new Map<string, ArchiveCandidate[]>()
    for (const doc of archive) {
        const print = fingerprint(doc)
        if (!print) continue
        const bucket = byPrint.get(print)
        if (bucket) bucket.push(doc)
        else byPrint.set(print, [doc])
    }

    /* An archive document may hold at most one rail slot. Without this, two
       featured copies of the same photograph both resolve to it and the second
       `$set` overwrites the first — 58 placements collapsing to 57 tiles, with
       a gap in the sequence that nothing in the rail would explain. */
    const claimed = new Map<string, string>()

    const placements: FeaturedPlacement[] = []
    const ordered = [...featured].sort(byFilename)

    for (let order = 0; order < ordered.length; order++) {
        const item = ordered[order]
        const base = { featuredId: item.id, featuredFile: item.file, order } as const

        const print = fingerprint(item)
        if (!print) {
            placements.push({ target: 'self', ...base, reason: 'unmeasured', candidates: [] })
            continue
        }

        const matches = byPrint.get(print) ?? []
        if (matches.length === 0) {
            placements.push({ target: 'self', ...base, reason: 'no-match', candidates: [] })
            continue
        }
        if (matches.length > 1) {
            placements.push({
                target: 'self', ...base,
                reason: 'ambiguous',
                candidates: matches.map(m => m.key),
            })
            continue
        }

        const match = matches[0]
        const takenBy = claimed.get(match.id)
        if (takenBy !== undefined) {
            placements.push({
                target: 'self', ...base,
                reason: 'archive-claimed',
                candidates: [`${match.key} (already held by ${takenBy})`],
            })
            continue
        }

        claimed.set(match.id, item.file)
        placements.push({
            target: 'archive', ...base,
            archiveId: match.id,
            archiveKey: match.key,
        })
    }

    return { placements }
}
