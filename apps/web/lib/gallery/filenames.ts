/**
 * The filename a piece of gallery media carries on disk.
 *
 *     {author} — {caption} [{id}].{ext}
 *
 * The bracketed id is load-bearing and everything else is decoration. It is
 * the 24-character ObjectId of the gallery_media document, and it is what
 * survives the file being dragged into a different folder in a file manager:
 * a reconcile pass matches on it first and re-derives the operation from
 * whichever folder the file now sits in. Without it, a moved file is
 * indistinguishable from a new one and loses its caption, tags, author and
 * votes.
 *
 * Nothing here parses the author or caption back out. It does not need to —
 * the database holds both — and it could not do it reliably anyway, since an
 * author's own name may contain the separator. The id is the only thing read
 * back, and it is read from the end of the string.
 *
 * Pure: no fs, no mongodb, no imports. Shared by the server and by
 * scripts/index-gallery.mjs's sibling logic.
 */

/** The combined author-and-caption portion, before the id. Windows gives up
 *  past a 260-character path, and a 120-character directory segment cap plus
 *  this keeps a worst case inside it. */
export const MAX_NAME_PART = 80

/** Em dash with single spaces. Chosen because sanitizeFilePart removes
 *  nothing that could produce it accidentally, so it reads unambiguously. */
const SEPARATOR = ' \u2014 '

/* Path separators, the Windows-reserved set, square brackets (a caption must
   never be able to forge an id suffix) and every control character. */
const ILLEGAL = /[/\\:*?"<>|[\]\u0000-\u001f]/g

export function sanitizeFilePart(raw: string | null | undefined): string {
    if (!raw) return ''
    return String(raw)
        // Whitespace is collapsed *before* illegal characters are stripped:
        // ILLEGAL's control-character range includes tab and newline, so
        // stripping first would delete them outright instead of folding
        // them into a single space.
        .replace(/\s+/g, ' ')
        .trim()
        .replace(ILLEGAL, '')
        // Stripping ILLEGAL can leave two spaces touching where a bracket or
        // control character used to sit between them (e.g. "shot [ image]"),
        // so collapse and trim again rather than trust the first pass.
        .replace(/\s+/g, ' ')
        .trim()
        // Windows silently drops trailing dots and spaces, which would leave
        // the name on disk differing from the name in the database.
        .replace(/[. ]+$/, '')
}

/** Cut to `max`, preferring a word boundary if one falls near the end. */
function truncateOnWord(s: string, max: number): string {
    if (s.length <= max) return s
    let cut = s.slice(0, max)

    // slice() counts UTF-16 code units, so a surrogate pair (an astral
    // character such as an emoji) straddling the boundary is split, leaving
    // a lone high surrogate — not valid UTF-8, and not a name a filesystem
    // will accept. Drop the orphaned half rather than emit it; the whole
    // character disappearing is fine, since it was going to be cut anyway.
    const lastUnit = cut.charCodeAt(cut.length - 1)
    if (lastUnit >= 0xd800 && lastUnit <= 0xdbff) cut = cut.slice(0, -1)

    const space = cut.lastIndexOf(' ')
    const out = space > 0 && space >= max - 12 ? cut.slice(0, space) : cut
    return out.replace(/[. ]+$/, '')
}

export function buildMediaFilename(opts: {
    id: string
    ext: string
    author?: string | null
    caption?: string | null
}): string {
    const ext = opts.ext.replace(/^\./, '').toLowerCase()

    // filter(Boolean) rather than a conditional join: a part that sanitises to
    // nothing must disappear entirely, not leave a dangling " — ".
    const stem = truncateOnWord(
        [sanitizeFilePart(opts.author), sanitizeFilePart(opts.caption)].filter(Boolean).join(SEPARATOR),
        MAX_NAME_PART,
    )

    return stem ? `${stem} [${opts.id}].${ext}` : `${opts.id}.${ext}`
}

/* Anchored at the end, so bracket-shaped text earlier in a caption cannot be
   mistaken for the id. Lowercase hex only — ObjectId.toString() is lowercase,
   and accepting uppercase would make two spellings of the same file. */
const ID_SUFFIX = /\[([0-9a-f]{24})\]\.([A-Za-z0-9]{2,5})$/

// buildMediaFilename omits the brackets entirely when there is neither an
// author nor a caption (the id is already the whole stem), so a bare id is
// its own valid case, not just something ID_SUFFIX failed to find.
const BARE_ID = /^([0-9a-f]{24})\.([A-Za-z0-9]{2,5})$/

export function parseMediaFilename(name: string): { id: string | null, ext: string } {
    const match = name.match(ID_SUFFIX) || name.match(BARE_ID)
    if (match) return { id: match[1], ext: match[2].toLowerCase() }

    const dot = name.lastIndexOf('.')
    return { id: null, ext: dot < 0 ? '' : name.slice(dot + 1).toLowerCase() }
}
