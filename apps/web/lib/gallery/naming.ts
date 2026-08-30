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
const ORDER_PREFIX = /^\s*(\d+)\s*[.)\-–]?\s*/

export function splitOperation(folder: string): { label: string, order: number } {
    const match = folder.match(ORDER_PREFIX)
    if (!match) return { label: folder.trim(), order: Number.MAX_SAFE_INTEGER }
    return {
        label: folder.slice(match[0].length).trim() || folder.trim(),
        order: parseInt(match[1], 10),
    }
}

/**
 * Reduce a folder label or an operation title to a comparable core.
 *
 * The two sides are structurally different, not merely formatted differently:
 * operations are recorded per session day ("OPERATION Lost Army IV — Sun")
 * while the gallery keeps one folder per weekend, abbreviated ("18. Op
 * Atlantic Shield"). Exact matching between them finds nothing at all.
 *
 * Does not touch a trailing parenthetical. Stripping it unconditionally would
 * let "Op Copper Ridge (Lanze Verde)" collide with a plain, unrelated "Op
 * Copper Ridge" — a real pair of folders in this archive.
 *
 * Duplicated in scripts/index-gallery.mjs, which cannot import TypeScript.
 * Both copies are pinned by tests.
 */
export function normalizeKey(s: string): string {
    return String(s)
        .toLowerCase()
        .replace(/\s*[\u2014\u2013-]\s*(sat|sun|saturday|sunday)\s*$/i, '')
        .replace(/^(operation|op|ftx|tvt)\s+/i, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}
