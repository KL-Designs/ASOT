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
