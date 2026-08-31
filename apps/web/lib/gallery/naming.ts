/**
 * Reading an operation's name out of its storage folder.
 *
 * Operations are stored as "1. Op Black Hill", "9. Op Copper Ridge (Lanze
 * Verde)" — the leading number is the storage layer's ordering leaking into the
 * interface, and it makes a set of choices read as a numbered list. It is
 * genuinely useful for *sorting*, so it is parsed out and kept rather than
 * thrown away, but nothing prints it.
 *
 * This lives in lib/ rather than beside the gallery page because
 * scripts/index-gallery.mjs has to agree with the page about what an operation
 * is called, and a script at the repo root cannot import a client module.
 */
/**
 * A leading order number, and the separator that proves it is one.
 *
 * The separator used to be OPTIONAL (`[.)\-–]?`), which made every leading run
 * of digits a prefix: "1st Recon Sweep" split to the label "st Recon Sweep",
 * and "12" to order 12. That was survivable while nothing ACTED on the answer
 * — the folder-numbering report flagged it as a latent display bug and left it
 * — but scripts/strip-folder-numbers.ts renames the folder it is told carries
 * a prefix, and renaming "1st Recon Sweep" to "st Recon Sweep" would turn a
 * real operation's name into nonsense on disk and in every document under it.
 *
 * Either an explicit separator (with optional whitespace around it) or
 * whitespace on its own counts. "9. …", "9) …", "9 - …" and "9 Op Copper
 * Ridge" are all spellings that exist in this archive and all still split;
 * naming.test.ts pins the four.
 *
 * A folder whose whole name is digits ("12") is now a NAME rather than an
 * order. `label` was already "12" either way — splitOperation falls back to
 * the whole folder when the label would be empty — so only `order` changes,
 * and its one remaining consumer is export-numbering's "already numbered"
 * guard, which will now offer to number it. The round trip survives that:
 * splitOperation("3. 12").label is "12".
 */
const ORDER_PREFIX = /^\s*(\d+)(?:\s*[.)\-–]\s*|\s+)/

/** A trailing "(...)" and the whitespace before it. Only ever removed by
 *  strippedKey below, never by normalizeKey. */
const TRAILING_PARENTHETICAL = /\s*\([^)]*\)\s*$/

export function splitOperation(folder: string): { label: string, order: number } {
    const match = folder.match(ORDER_PREFIX)
    if (!match) return { label: folder.trim(), order: Number.MAX_SAFE_INTEGER }
    return {
        label: folder.slice(match[0].length).trim() || folder.trim(),
        order: parseInt(match[1], 10),
    }
}

/**
 * The operation name to SHOW for one piece of media.
 *
 * `opLabel` is already the prefix-stripped form — every producer writes it as
 * `splitOperation(folder).label` — so it is returned as it is rather than
 * re-split, which would eat the leading digits of a name that legitimately
 * starts with one. The RAW folder name is only ever the fallback, for a
 * migrated document written before `opLabel` existed, and that is the one that
 * still has to be stripped: without this, the J5 console showed
 * "15. Op Black Hills" in the media table, the inspector and the viewer.
 *
 * A number in a folder name is a storage detail. Nothing user-facing prints
 * it; the whole point of moving the ordering into the database is that it
 * stopped being part of the name at all.
 */
export function operationDisplayName(
    opLabel: string | null | undefined,
    operation: string | null | undefined,
): string | null {
    if (opLabel) return opLabel
    if (operation) return splitOperation(operation).label
    return null
}

/**
 * Reduce a folder label or an operation title to a comparable core.
 *
 * The two sides are structurally different, not merely formatted differently:
 * operations are recorded per session day ("OPERATION Lost Army IV — Sun")
 * while the gallery keeps one folder per weekend, abbreviated ("18. Op
 * Atlantic Shield"). Exact matching between them finds nothing at all.
 *
 * Does not touch a trailing parenthetical — that is fullKey/strippedKey's
 * job below. Stripping it unconditionally HERE would let "Op Copper Ridge
 * (Lanze Verde)" collide with a plain, unrelated "Op Copper Ridge" — a real
 * pair of folders in this archive.
 *
 * Duplicated in scripts/index-gallery.mjs and scripts/relocate-flat-media.mjs,
 * neither of which can import TypeScript. Every copy is pinned by tests.
 */
export function normalizeKey(s: string): string {
    return String(s)
        .toLowerCase()
        .replace(/\s*[\u2014\u2013-]\s*(sat|sun|saturday|sunday)\s*$/i, '')
        .replace(/^(operation|op|ftx|tvt)\s+/i, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

/**
 * Matching a gallery folder to an operation, in two tiers.
 *
 * `fullKey` keeps a trailing parenthetical, so it only matches a title that
 * carries the same detail. `strippedKey` drops it, because an operation's own
 * title rarely repeats a gallery folder's parenthetical verbatim — the archive
 * has "9. Op Copper Ridge (Lanze Verde)" and "12. MW Training (CAG)" against
 * operations titled without either.
 *
 * The ORDER is the whole safety property, and it is why normalizeKey does not
 * strip parentheses itself. Tried specific-first, "Op Copper Ridge (Lanze
 * Verde)" can only reach a plain, unrelated "Op Copper Ridge" once nothing
 * more specific has matched. Strip unconditionally, or try the stripped key
 * first, and those two real folders collapse onto one operation.
 *
 * All three matchers share this pair: scripts/index-gallery.mjs (which had it
 * first), reconcile.ts and relocate.ts. The last two knew only the full key,
 * and the mismatch was not theoretical — a file the migration linked through
 * the stripped key, moved by hand into "9. Op Copper Ridge (Lanze Verde)",
 * reached reconcile's operationFor(), found no candidate, and had its
 * operationId UNSET; and resolveOperationFolder could not see that folder
 * either, so accepting a submission for the operation created a duplicate
 * numbered folder beside it and split the facet rail.
 */
export function fullKey(s: string): string {
    return normalizeKey(s)
}

export function strippedKey(s: string): string {
    return normalizeKey(String(s).replace(TRAILING_PARENTHETICAL, ''))
}

/**
 * The candidate whose own label names `label`, specific tier first.
 *
 * Each tier is swept across ALL candidates before the next is tried. A
 * per-candidate "full or stripped" test would let an earlier candidate win on
 * the loose key while a later one matched exactly.
 */
export function findByOperationKey<T>(
    label: string,
    candidates: readonly T[],
    labelOf: (candidate: T) => string,
): T | undefined {
    const full = fullKey(label)
    const exact = candidates.find(c => fullKey(labelOf(c)) === full)
    if (exact) return exact

    const stripped = strippedKey(label)
    return candidates.find(c => strippedKey(labelOf(c)) === stripped)
}
