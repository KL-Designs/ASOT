/**
 * JSON safe to put in an HTTP header value.
 *
 * Header values are ByteStrings — latin-1 only — so a raw non-ASCII character
 * makes `Response` throw "Cannot convert argument to a ByteString" at
 * construction, which surfaces as an opaque 500 rather than anything naming the
 * header. Emoji are the case that bit us: one is a surrogate pair well past 255.
 *
 * `\uXXXX` escapes are part of JSON itself, so the receiver's ordinary
 * `JSON.parse` decodes them back to the original characters — surrogate pairs
 * included — with nothing to do at the other end.
 */
export function asciiJson(value: unknown): string {
    return JSON.stringify(value).replace(
        /[^\x00-\x7f]/g,
        c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
    )
}
