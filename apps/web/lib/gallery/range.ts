/**
 * Parsing an HTTP `Range` header against a known file size.
 *
 * Kept separate from the route that uses it because this arithmetic — reading
 * the suffix form backwards, clamping an over-long `end` instead of rejecting
 * it, refusing anything we don't support rather than guessing at it — is the
 * part most likely to be subtly wrong, and it is pure enough to test without
 * a filesystem or a request object anywhere nearby.
 *
 * We only understand a single `bytes=start-end` range, each side optional.
 * Per RFC 7233 §3.1, a server is free to ignore a Range it does not support
 * and answer with the whole entity instead of an error — so a malformed
 * header, an unrecognised unit, or a multi-range request like
 * `bytes=0-99,200-299` all fall through to `full` rather than
 * `unsatisfiable`. `unsatisfiable` is reserved for a header we understood
 * but that names no valid slice of this file (a start past the end, or a
 * suffix request against an empty file).
 */

export type RangeResult =
    | { kind: 'full' }
    | { kind: 'range'; start: number; end: number }
    | { kind: 'unsatisfiable' }

export function parseRange(header: string | null, size: number): RangeResult {
    if (!header) return { kind: 'full' }

    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
    if (!match) return { kind: 'full' }

    const [, startStr, endStr] = match
    if (!startStr && !endStr) return { kind: 'full' } // "bytes=-" names nothing

    // Nothing in an empty file satisfies any byte-range, suffix or otherwise.
    if (size === 0) return { kind: 'unsatisfiable' }

    let start: number
    let end: number

    if (!startStr) {
        // Suffix form: "bytes=-500" means the LAST 500 bytes, not "from byte
        // 500 to the end" — the sign is what makes this form easy to get
        // backwards. A suffix longer than the file just means the whole file.
        const suffixLength = parseInt(endStr, 10)
        if (suffixLength <= 0) return { kind: 'unsatisfiable' }
        start = Math.max(0, size - suffixLength)
        end = size - 1
    } else {
        start = parseInt(startStr, 10)
        end = endStr ? parseInt(endStr, 10) : size - 1
    }

    if (start >= size || start > end) return { kind: 'unsatisfiable' }

    // An end past the last byte is clamped, not rejected — it is still a
    // satisfiable range, just shorter than the client asked for.
    return { kind: 'range', start, end: Math.min(end, size - 1) }
}
