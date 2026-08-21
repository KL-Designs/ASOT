import { existsSync, readdirSync, statSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * A member's cover photo, as the milpac page and the share card each need it.
 *
 * The storage path was hardcoded in both callers; it lives here now so a change
 * to the layout is one edit. (`app/api/uploads/cover/route.ts` still writes it
 * via its own cwd-relative string — that route reads no member id from a
 * caller, and its convention is left alone deliberately.)
 */

/** Where apps/web's upload route drops covers, relative to the app's cwd. */
export function coverPath(memberId: string): string {
    return join(process.cwd(), '..', '..', 'storage', 'uploads', 'cover', `${memberId}.png`)
}

export function hasCover(memberId: string): boolean {
    return existsSync(coverPath(memberId))
}

/** The directory `hasCover` looks in — one level up from `coverPath`. */
function coverDir(): string {
    return join(process.cwd(), '..', '..', 'storage', 'uploads', 'cover')
}

/**
 * Every member id that has a cover, from a single directory read.
 *
 * `hasCover` is right for one member and wrong for a roster: /milpacs renders
 * 163 cards, and asking the filesystem 163 separate questions to answer one is
 * the sort of thing that only shows up as a slow page under load. Missing
 * directory (a fresh install with no uploads yet) is an empty set, not a throw.
 */
export function coverIds(): Set<string> {
    try {
        return new Set(
            readdirSync(coverDir())
                .filter(name => name.endsWith('.png'))
                .map(name => name.slice(0, -'.png'.length)),
        )
    } catch {
        return new Set()
    }
}

/**
 * A ceiling on what we will hand to the decoder, not on what a member may
 * upload. The upload route stores the file whole and the page serves it whole;
 * this only bounds the pixels the *renderer* has to hold in memory, since
 * decoding is where an oversized or maliciously-crafted image actually costs
 * something.
 */
export const MAX_COVER_BYTES = 25 * 1024 * 1024

/** The card the cover is drawn into — matches opengraph-image.tsx's `size`. */
const CARD = { width: 1300, height: 630 }

export type CropRect = { sx: number; sy: number; sw: number; sh: number }

/**
 * `object-fit: cover` as a source rectangle: the largest centred crop of the
 * source that has the box's aspect ratio. Returned in source pixels so it can
 * be passed straight to drawImage, which fills the box without distorting.
 */
export function fitCover(srcW: number, srcH: number, boxW: number, boxH: number): CropRect {
    // A failed decode can report zero dimensions. Dividing by that yields NaN
    // geometry that drawImage accepts silently and draws as nothing, so the
    // degenerate case is returned as-is for the caller to reject.
    if (srcW <= 0 || srcH <= 0) return { sx: 0, sy: 0, sw: srcW, sh: srcH }

    // Cross-multiplied rather than compared as two ratios, and each edge
    // derived with a single multiply-then-divide: dividing by a ratio makes a
    // source already at the box's aspect come back as 1259.9999999999998.
    if (srcW * boxH > srcH * boxW) {
        // Wider than the box: full height, crop the sides.
        const sw = srcH * boxW / boxH
        return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH }
    }

    // Taller than the box (or equal): full width, crop top and bottom.
    const sh = srcW * boxH / boxW
    return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh }
}

/**
 * The cover, cropped and re-encoded to exactly the card's dimensions, as a data
 * URI — or null if there isn't one, or it cannot be read.
 *
 * A data URI rather than a URL because the card renders through satori, which
 * resolves neither a relative path nor `background-image: url()`. Re-encoding
 * rather than embedding the original is what keeps that string small: covers
 * are uploaded unresized, and base64 inflates by a third, so a 6MB upload would
 * otherwise be an 8MB string decoded on every single request.
 *
 * Returns null rather than throwing on any failure. This feeds an OpenGraph
 * route that currently cannot fail, and one member's malformed upload must
 * degrade to the drawn card, not 500 the whole share image.
 */
export async function readCoverImage(memberId: string, box = CARD): Promise<string | null> {
    const path = coverPath(memberId)

    try {
        if (!existsSync(path)) return null
        if (statSync(path).size > MAX_COVER_BYTES) return null

        // Imported here rather than at module scope: this file is also imported
        // by the page for its one-line hasCover(), which should not pull a
        // native binary in behind it.
        const { createCanvas, loadImage } = await import('@napi-rs/canvas')

        // loadImage sniffs the real format, so it does not matter that the
        // upload route writes every file under a .png name whatever it was.
        const image = await loadImage(readFileSync(path))

        const crop = fitCover(image.width, image.height, box.width, box.height)
        if (crop.sw <= 0 || crop.sh <= 0) return null

        const canvas = createCanvas(box.width, box.height)
        canvas.getContext('2d').drawImage(
            image,
            crop.sx, crop.sy, crop.sw, crop.sh,
            0, 0, box.width, box.height,
        )

        // JPEG, not PNG: this is a photograph behind a heavy scrim, where PNG
        // would cost several times the bytes to preserve detail the scrim hides.
        return `data:image/jpeg;base64,${canvas.toBuffer('image/jpeg', 80).toString('base64')}`
    } catch {
        return null
    }
}
