/**
 * Shared drawing helpers.
 *
 * Every uniform layer is a full-canvas PNG composited at the same size, so the
 * bulk of rendering is "load this file, draw it over everything". That is one
 * helper rather than forty repetitions of the same four arguments.
 */

import { loadImage, type SKRSContext2D } from '@napi-rs/canvas'
import fs from 'fs/promises'

export const UNIFORM_WIDTH = 1398
export const UNIFORM_HEIGHT = 1000

export const BOX_WIDTH = 951
export const BOX_HEIGHT = 340

/**
 * Thrown when a payload names an asset that does not exist. Routes turn this
 * into a 422 naming the asset, distinct from a 400 for a malformed body.
 */
export class MissingAssetError extends Error {
    constructor(public readonly asset: string) {
        super(`Unknown asset: ${asset}`)
        this.name = 'MissingAssetError'
    }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Rebuilds a PNG without its private ancillary chunks.
 *
 * Canva stamps a ~24KB `caBX` chunk into every export, and @napi-rs's *buffer*
 * decoder rejects the whole file over it — while its file-path decoder reads
 * the same bytes happily. So a perfectly valid uniform PNG opened in every
 * image viewer and failed only here, reported as "Invalid SVG image".
 *
 * Which chunks go is decided by the PNG spec's own naming convention rather
 * than a blocklist: byte 0 lowercase means ancillary, byte 1 lowercase means
 * private. Dropping exactly that class keeps every standard chunk — `tRNS`
 * transparency, `gAMA`/`sRGB`/`iCCP` colour — and discards only the vendor
 * payload no renderer is entitled to care about.
 *
 * Returns null when the bytes are not a PNG or are structurally unsound, so a
 * genuinely corrupt file still fails with the original error.
 */
function stripPrivateChunks(bytes: Buffer): Buffer | null {
    if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null

    const kept: Buffer[] = [bytes.subarray(0, 8)]
    let offset = 8
    let dropped = false

    while (offset + 8 <= bytes.length) {
        const length = bytes.readUInt32BE(offset)
        const type = bytes.toString('ascii', offset + 4, offset + 8)
        const end = offset + 12 + length
        if (length < 0 || end > bytes.length) return null

        const ancillary = type[0] === type[0]!.toLowerCase()
        const priv = type[1] === type[1]!.toLowerCase()
        if (ancillary && priv) dropped = true
        else kept.push(bytes.subarray(offset, end))

        offset = end
        if (type === 'IEND') break
    }

    return dropped ? Buffer.concat(kept) : null
}

/**
 * loadImage is given the bytes rather than the path so that a missing file is
 * a plain ENOENT naming it, instead of @napi-rs falling through to treating the
 * path as a URL.
 *
 * The decode is wrapped because @napi-rs reports any failure as "Invalid SVG
 * image" — it tries the bytes as SVG last — and names no file, so a bad asset
 * surfaced as an SVG error inside load-image.js with nothing to say which of
 * forty layers was at fault. The path goes to the server log only: the caller
 * still gets a 500 and a correlation id, never a filesystem path
 * (PLAN.md §9 rule 4).
 */
export async function load(filePath: string) {
    const bytes = await fs.readFile(filePath)
    try {
        return await loadImage(bytes)
    } catch (err) {
        const cleaned = stripPrivateChunks(bytes)
        if (cleaned) {
            try {
                return await loadImage(cleaned)
            } catch { /* fall through to the original failure */ }
        }
        throw new Error(
            `failed to decode ${filePath} (${bytes.length} bytes): ${(err as Error).message}`,
            { cause: err },
        )
    }
}

/** Draws a full-canvas layer over the current composite. */
export async function drawLayer(
    ctx: SKRSContext2D,
    filePath: string,
    width: number,
    height: number,
) {
    ctx.drawImage(await load(filePath), 0, 0, width, height)
}

/** Draws a full-canvas uniform layer at the uniform's fixed dimensions. */
export async function drawUniformLayer(ctx: SKRSContext2D, filePath: string) {
    await drawLayer(ctx, filePath, UNIFORM_WIDTH, UNIFORM_HEIGHT)
}

/**
 * Resolves an asset from an index, raising MissingAssetError rather than
 * returning undefined. The original silently skipped, or threw a raw Error
 * mid-render with the absolute filesystem path in the message.
 */
export function requireAsset(index: Map<string, string>, name: string, category: string): string {
    const file = index.get(name)
    if (!file) throw new MissingAssetError(`${category}/${name}`)
    return file
}
