import { fitCover } from './milpac-cover'

/**
 * Artwork prepared for a satori card.
 *
 * Satori takes images as data URIs and base64 inflates by a third. The uniform
 * is 1398x1000; embedded raw, two artwork images plus a cover photo would be
 * several megabytes of string decoded on every invocation of a Discord command.
 * Re-encoding to the draw size first is what keeps that small — the same reason
 * readCoverImage() re-encodes covers.
 *
 * PNG rather than JPEG, unlike covers: these are composited layer stacks that
 * may carry alpha, and a photograph's compression tradeoff does not apply.
 *
 * Every failure returns null. The dossier card draws without its artwork when
 * the render service is down (spec §7), so one undecodable PNG must degrade the
 * card, not fail the command.
 */

export type ImageBox = { width: number; height: number }

export async function toCardImage(
    bytes: Buffer | null | undefined,
    box: ImageBox,
): Promise<string | null> {
    if (!bytes || bytes.length === 0) return null

    try {
        // Imported here rather than at module scope so importing this file does
        // not pull a native binary in behind it.
        const { createCanvas, loadImage } = await import('@napi-rs/canvas')

        const image = await loadImage(bytes)

        // The draw boxes are chosen to match the sources' aspect ratios — the
        // uniform is 1.398:1 drawn at 1.4:1, the medal box 2.797:1 at 2.8:1 —
        // so this crops a sub-pixel sliver rather than cutting the artwork.
        // Cover-fitting anyway means a future box that does not match degrades
        // to a crop rather than to a stretched uniform.
        const crop = fitCover(image.width, image.height, box.width, box.height)
        if (crop.sw <= 0 || crop.sh <= 0) return null

        const canvas = createCanvas(box.width, box.height)
        canvas.getContext('2d').drawImage(
            image,
            crop.sx, crop.sy, crop.sw, crop.sh,
            0, 0, box.width, box.height,
        )

        return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`
    } catch {
        return null
    }
}
