/**
 * The numbers that bound an uploaded image, and the presets each upload uses.
 *
 * Split from `image.ts` because that module imports sharp, a native binary that
 * cannot be pulled into a client bundle — and upload controls need to quote the
 * limit they are enforcing. One definition, so the message a member reads and
 * the rule the server applies cannot drift apart.
 */

/**
 * The hard ceiling on an upload, checked before anything decodes the file.
 *
 * Generous on purpose: a photo straight off a phone or camera is routinely
 * 5-15MB and its owner has done nothing wrong. Anything past this is not a
 * photo, it is a problem.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/** The same, for interface copy. */
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / 1024 / 1024

/**
 * The dimensional ceiling — a decompression-bomb guard, not a quality one.
 *
 * It has to sit above any real camera (200MP phone sensors exist, and the
 * 16320x7612 upload that prompted this work is 124MP) while still refusing the
 * gigapixel images a small crafted file can expand into. sharp's own default is
 * around 268MP; this is deliberately in the same territory rather than tighter,
 * because the resize is what actually protects the page.
 */
export const MAX_INPUT_PIXELS = 300_000_000

/**
 * How a preset wants stills encoded.
 *
 * `jpeg` — always JPEG. For photographs whose stored filename does not carry a
 * format (covers are `{id}.png` whatever they are, and the serving route
 * sniffs), so the format is a free choice and JPEG is the right one.
 *
 * `preserve` — keep the source format, so a file stored under its original
 * extension still matches its bytes, and an image with transparency keeps it.
 * Required for anything with alpha: ORBAT patches are insignia on a
 * transparent ground, and flattening them onto a colour would put a box behind
 * every patch on the site.
 */
export type StillFormat = 'jpeg' | 'preserve'

export type ImagePreset = {
    /** Used in error messages the member reads. */
    label: string
    /** What the image is scaled to fit inside. */
    box: { width: number; height: number }
    /** What a stored file has to come in under. */
    maxStoredBytes: number
    stillFormat: StillFormat
    /**
     * `preserve` keeps an uploaded GIF animating. `flatten` takes the first
     * frame — correct only where the destination cannot represent an animation
     * anyway, which today means the bio photo: it is written as `{id}.jpg` and
     * served as `image/jpeg` unconditionally, so a GIF stored there would be a
     * file whose bytes and content-type disagree.
     */
    animated: 'preserve' | 'flatten'
}

/**
 * A milpac cover photo.
 *
 * The largest a cover is ever drawn is the 1300x630 OpenGraph card; the roster
 * tile is 480 wide. 2560 leaves room for high-DPI displays and nothing more.
 */
export const COVER_PRESET: ImagePreset = {
    label: 'cover photo',
    box: { width: 2560, height: 1440 },
    maxStoredBytes: 3 * 1024 * 1024,
    stillFormat: 'jpeg',
    animated: 'preserve',
}

/** A member's bio portrait. Drawn small and never full-bleed. */
export const BIO_PRESET: ImagePreset = {
    label: 'bio photo',
    box: { width: 1600, height: 1600 },
    maxStoredBytes: 2 * 1024 * 1024,
    stillFormat: 'jpeg',
    animated: 'flatten',
}

/**
 * An ORBAT section patch. Small, and `preserve` is not negotiable — these are
 * insignia with transparent backgrounds, drawn onto the page's own plate.
 */
export const PATCH_PRESET: ImagePreset = {
    label: 'patch',
    box: { width: 1024, height: 1024 },
    maxStoredBytes: 1 * 1024 * 1024,
    stillFormat: 'preserve',
    animated: 'preserve',
}

/**
 * An operation image (maps, briefing graphics). `preserve` because the route
 * stores the file under its uploaded extension and serves it back by that same
 * extension — changing the format would leave the two disagreeing.
 */
export const OPERATION_PRESET: ImagePreset = {
    label: 'operation image',
    box: { width: 3000, height: 3000 },
    maxStoredBytes: 4 * 1024 * 1024,
    stillFormat: 'preserve',
    animated: 'preserve',
}

/**
 * Gallery uploads are deliberately NOT normalised.
 *
 * The gallery is the one place on this site whose entire purpose is the picture
 * itself — screenshots people took and want to look at full size. Everywhere
 * else an image is decoration around information, and shrinking it costs
 * nothing anyone will notice. Left as an explicit named decision rather than an
 * omission, so it reads as a choice and not as a route that was missed.
 */
export const GALLERY_IS_EXEMPT = true
