import sharp from 'sharp'

import {
    MAX_INPUT_PIXELS,
    MAX_UPLOAD_BYTES,
    type ImagePreset,
} from './image-limits'

/**
 * Normalising an uploaded image on the way in.
 *
 * Upload routes used to write whatever bytes arrived, unexamined: no type
 * check, no size cap, no resize. A member uploaded a 16320x7612 cover at 13.2MB
 * and the /milpacs roster became unusable — 124 megapixels is around half a
 * gigabyte of bitmap once decoded, in every visitor's browser.
 *
 * It was a server problem too. `readCoverImage` decodes covers to build the
 * OpenGraph share card, so that same image meant a ~500MB allocation per
 * share-card request, and `MAX_COVER_BYTES` (25MB) never stopped it because
 * 13MB is comfortably under 25MB. Bytes alone were the wrong measure.
 *
 * The shape of the fix: accept generously — a photo straight off a phone is
 * routinely 5-15MB and its owner has done nothing wrong — then *compress until
 * it fits* rather than refuse. Only genuinely absurd input is turned away.
 *
 * Every upload is re-encoded, including one that would already have fit. That
 * is deliberate: it makes one invariant true of every file on disk instead of
 * leaving a long tail of whatever members happened to send, each fine on its
 * own and collectively the reason this went wrong once already.
 *
 * The gallery is the sole exception, and an explicit one — see
 * `GALLERY_IS_EXEMPT` in ./image-limits.
 *
 * sharp does all of it and is already a dependency; it is what Next itself uses
 * for image optimisation. It reads dimensions from the header without decoding
 * (the point, when the image is the problem), streams the resize rather than
 * materialising the full bitmap, and resizes animated GIFs without flattening
 * them — which matters, because the roster animates covers on hover.
 */

/** Quality ladders, tried in order. Photographs here sit behind heavy chrome;
 *  this is the wrong place to spend bytes defending fine detail. */
const QUALITY_STEPS = [82, 74, 66, 58, 50, 42]

/** How much smaller to go when the whole ladder still will not fit, and how
 *  many times to try before storing the best effort. */
const SHRINK_FACTOR = 0.7
const SHRINK_ROUNDS = 4

/** JPEG has no alpha. Flatten onto the site's own near-black rather than
 *  letting transparency come out as white fringing. Only ever applied when the
 *  output really is JPEG — a preset that preserves format keeps its alpha. */
const FLATTEN_BG = '#0a0a0a'

const MB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif'

export type NormalisedImage = {
    buffer: Buffer
    format: ImageFormat
    width: number
    height: number
    /** Whether the stored file still animates. */
    animated: boolean
}

export type NormaliseResult =
    | { ok: true; image: NormalisedImage }
    /** Safe to show the member verbatim — these are written to be read by the
     *  person who just picked the file, not by a log. */
    | { ok: false; error: string }

/**
 * The formats an upload may be. Sniffed from magic bytes rather than taken from
 * the upload's content-type, which the client controls, or from the filename,
 * which lies: the cover that started all this was a JPEG stored as `.png`.
 */
export function sniffImageMime(buf: Buffer): string | null {
    if (buf.length >= 6 && buf.subarray(0, 6).toString('latin1').startsWith('GIF8')) return 'image/gif'
    if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
    if (buf.length >= 12
        && buf.subarray(0, 4).toString('latin1') === 'RIFF'
        && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
    return null
}

/**
 * `failOn: 'none'` is not optional here.
 *
 * The 13.2MB cover that prompted this work is a JPEG with a recoverable defect
 * ("1 extraneous bytes before marker 0xd2"). Every browser renders it without
 * complaint; libvips aborts on it by default, which would have meant refusing a
 * file the member can plainly see working. People upload what their phone or
 * their editor produced, and a decoder stricter than every browser is the wrong
 * tool for that.
 */
const readOptions = (maxPixels: number, animated = false) =>
    ({ failOn: 'none' as const, limitInputPixels: maxPixels, ...(animated ? { animated: true } : {}) })

export async function normaliseImage(
    input: Buffer,
    preset: ImagePreset,
    /**
     * Both ceilings are overridable, for the two callers that are not an
     * upload:
     *
     * - `maxPixels` lets a test exercise the guard without allocating a
     *   gigapixel image to prove it works.
     * - the migration script (`scripts/normalise-covers.ts`) raises both, since
     *   its whole job is to fix files that are already over the limit —
     *   refusing them is the upload route's business, not a repair pass's.
     */
    opts: { maxPixels?: number; maxBytes?: number } = {},
): Promise<NormaliseResult> {
    const maxPixels = opts.maxPixels ?? MAX_INPUT_PIXELS
    const maxBytes = opts.maxBytes ?? MAX_UPLOAD_BYTES

    if (input.length === 0) return { ok: false, error: 'That file is empty.' }

    if (input.length > maxBytes)
        return { ok: false, error: `That image is ${MB(input.length)}. The largest ${preset.label} you can upload is ${MB(maxBytes)}.` }

    const mime = sniffImageMime(input)
    if (!mime) return { ok: false, error: 'That file is not a PNG, JPEG, GIF or WebP image.' }

    let width: number, height: number, pages: number
    try {
        // `limitInputPixels: false` deliberately: this reads the header only,
        // which is the safe operation, and the ceiling is then applied to the
        // numbers it returns. Passing the ceiling here instead makes sharp throw
        // first, and an oversized image gets "could not be read" rather than a
        // message saying how big it is and what to do about it.
        const meta = await sharp(input, { failOn: 'none', limitInputPixels: false }).metadata()
        width = meta.width ?? 0
        height = meta.height ?? 0
        pages = meta.pages ?? 1
    } catch {
        return { ok: false, error: 'That image could not be read. It may be corrupt.' }
    }

    if (!width || !height) return { ok: false, error: 'That image could not be read. It may be corrupt.' }

    /*
       Any GIF takes the GIF path, not only a multi-frame one. Routing on the
       frame count instead would mean that the one time sharp misreports `pages`
       for an animation, the image is silently flattened to a still and the
       member's hover animation disappears with no way to tell why. Preserving
       the format they chose is the safer default; `animated` still reports the
       truth about frames.

       An animated GIF costs its pixel area once per frame.
    */
    const isGif = mime === 'image/gif' && preset.animated === 'preserve'
    const totalPixels = width * height * (mime === 'image/gif' ? pages : 1)
    const animated = isGif && pages > 1

    if (totalPixels > maxPixels) {
        const mp = (totalPixels / 1_000_000).toFixed(0)
        return {
            ok: false,
            error: `That image is ${width}x${height}${animated ? ` across ${pages} frames` : ''} — about ${mp} megapixels, which is too large to process. Please resize it to around ${preset.box.width}x${preset.box.height} first.`,
        }
    }

    try {
        return isGif
            ? await compressAnimated(input, maxPixels, pages, preset)
            : await compressStill(input, maxPixels, preset, mime)
    } catch {
        return { ok: false, error: 'That image could not be processed. It may be corrupt or in an unsupported variant.' }
    }
}

/** What a still is written as, given the preset and where it came from. */
function outputFormat(preset: ImagePreset, sourceMime: string): Exclude<ImageFormat, 'gif'> {
    if (preset.stillFormat === 'jpeg') return 'jpeg'
    if (sourceMime === 'image/png') return 'png'
    if (sourceMime === 'image/webp') return 'webp'
    return 'jpeg'
}

const encode = (data: Buffer, raw: { width: number; height: number; channels: 1 | 2 | 3 | 4 }, format: Exclude<ImageFormat, 'gif'>, quality: number) => {
    const pipeline = sharp(data, { raw })
    if (format === 'jpeg') return pipeline.jpeg({ quality, mozjpeg: true }).toBuffer()
    if (format === 'webp') return pipeline.webp({ quality }).toBuffer()
    // `palette` is what actually shrinks a PNG — for insignia and flat graphics
    // it is the difference between a few KB and a few hundred, and it keeps the
    // alpha channel a photograph codec would have thrown away.
    return pipeline.png({ compressionLevel: 9, palette: true, quality }).toBuffer()
}

/**
 * Shrink a still image until it fits.
 *
 * Decoded once. The resized pixels are held raw and every re-encode runs from
 * those, so stepping down the quality ladder costs one encode each rather than
 * re-decoding the original — which for the 124MP case is the difference between
 * one 435ms decode and a dozen of them.
 */
async function compressStill(input: Buffer, maxPixels: number, preset: ImagePreset, sourceMime: string): Promise<NormaliseResult> {
    const format = outputFormat(preset, sourceMime)

    let pipeline = sharp(input, readOptions(maxPixels))
        // Honour EXIF orientation, or portrait phone photos land on their side.
        .rotate()
        .resize({ ...preset.box, fit: 'inside', withoutEnlargement: true })

    // Only when the output cannot carry alpha. A preset that preserves format
    // keeps its transparency, which is the whole point for ORBAT patches.
    if (format === 'jpeg') pipeline = pipeline.flatten({ background: FLATTEN_BG })

    let frame = await pipeline.raw().toBuffer({ resolveWithObject: true })
    let best: { buffer: Buffer; width: number; height: number } | null = null

    for (let round = 0; round < SHRINK_ROUNDS; round++) {
        const raw = { width: frame.info.width, height: frame.info.height, channels: frame.info.channels }

        for (const quality of QUALITY_STEPS) {
            const buffer = await encode(frame.data, raw, format, quality)

            if (!best || buffer.length < best.buffer.length)
                best = { buffer, width: raw.width, height: raw.height }

            if (buffer.length <= preset.maxStoredBytes)
                return { ok: true, image: { buffer, format, width: raw.width, height: raw.height, animated: false } }
        }

        // The whole ladder was not enough — go smaller and run it again,
        // resizing from the pixels already in hand rather than the original.
        frame = await sharp(frame.data, { raw })
            .resize({ width: Math.max(320, Math.round(raw.width * SHRINK_FACTOR)) })
            .raw()
            .toBuffer({ resolveWithObject: true })
    }

    // Every round exhausted. Store the smallest thing produced rather than
    // rejecting someone's photo outright — it is bounded, just not by much.
    if (!best) return { ok: false, error: 'That image could not be processed.' }
    return { ok: true, image: { buffer: best.buffer, format, width: best.width, height: best.height, animated: false } }
}

/**
 * The same, for a GIF.
 *
 * No quality dial exists, so the levers are dimensions and palette size, and
 * every attempt has to re-encode all the frames. It stays a GIF throughout:
 * flattening someone's animation to a still without telling them is worse than
 * storing a slightly larger file, and the roster's hover animation depends on
 * it.
 */
async function compressAnimated(input: Buffer, maxPixels: number, pages: number, preset: ImagePreset): Promise<NormaliseResult> {
    let box = { ...preset.box }
    let best: { buffer: Buffer; width: number; height: number } | null = null

    for (let round = 0; round < SHRINK_ROUNDS; round++) {
        const colours = [256, 128, 64, 32][Math.min(round, 3)]

        const out = await sharp(input, readOptions(maxPixels, true))
            .resize({ ...box, fit: 'inside', withoutEnlargement: true })
            .gif({ colours })
            .toBuffer({ resolveWithObject: true })

        // For animated output sharp reports `height` as every frame stacked into
        // one strip, so the real height is that over the frame count.
        const frameHeight = pages > 1 ? Math.round(out.info.height / pages) : out.info.height

        if (!best || out.data.length < best.buffer.length)
            best = { buffer: out.data, width: out.info.width, height: frameHeight }

        if (out.data.length <= preset.maxStoredBytes)
            return { ok: true, image: { buffer: out.data, format: 'gif', width: out.info.width, height: frameHeight, animated: pages > 1 } }

        box = {
            width: Math.max(320, Math.round(box.width * SHRINK_FACTOR)),
            height: Math.max(180, Math.round(box.height * SHRINK_FACTOR)),
        }
    }

    if (!best) return { ok: false, error: 'That image could not be processed.' }
    return { ok: true, image: { buffer: best.buffer, format: 'gif', width: best.width, height: best.height, animated: pages > 1 } }
}

// Re-exported so callers have one place to import the whole contract.
export * from './image-limits'
