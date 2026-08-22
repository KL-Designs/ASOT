import { existsSync, readdirSync, statSync, readFileSync, openSync, readSync, closeSync } from 'fs'
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
                .map(name => name.slice(0, -'.png'.length))
                // Snowflakes only. Covers are written as `{me.id}.png` by an
                // authenticated upload, so anything else in this directory is
                // not a member's cover — and these ids are interpolated into a
                // URL that the roster card hands to CSS `url()`, which is not a
                // place to forward an arbitrary filename. The serving route
                // rejects the same shape, so such a file is unreachable anyway.
                .filter(id => /^\d{5,25}$/.test(id)),
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

/**
 * Which of those covers are animated.
 *
 * The upload route writes every cover to `{id}.png` and serves it as
 * `image/png` whatever was actually uploaded, so the extension says nothing —
 * a member who uploads a GIF gets a GIF stored under a .png name, and browsers
 * sniff the real format and animate it regardless of the header we send.
 *
 * The roster needs to know because an animated cover is the same problem as an
 * animated avatar: next/image passes animated images straight through, so the
 * card ends up repainting a full-size GIF behind every visible tile forever.
 * Knowing which covers animate lets the card ask for a still and hold the
 * animation back until hover.
 *
 * GIF only, deliberately. It is the format members actually upload and the only
 * one Discord itself produces; animated WebP and APNG would need real container
 * parsing to detect and would still be served correctly here, just without the
 * hover treatment.
 */
export function animatedCoverIds(ids: Iterable<string>): Set<string> {
    const animated = new Set<string>()

    for (const id of ids) {
        // Six bytes per cover, not the whole file: this runs for every member
        // with a cover on every render of the roster, and the magic number is
        // the first six bytes of a GIF ("GIF87a" / "GIF89a").
        let fd: number | undefined
        try {
            fd = openSync(coverPath(id), 'r')
            const head = Buffer.alloc(6)
            readSync(fd, head, 0, 6, 0)
            if (head.toString('latin1').startsWith('GIF8')) animated.add(id)
        } catch {
            // Unreadable or vanished between the readdir and here — not
            // animated as far as the page is concerned.
        } finally {
            if (fd !== undefined) try { closeSync(fd) } catch { }
        }
    }

    return animated
}
