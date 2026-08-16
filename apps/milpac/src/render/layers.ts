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

/**
 * loadImage does not accept Windows drive-letter paths, so files are read to a
 * buffer first. Same workaround the web port uses; it costs nothing on Linux.
 *
 * The decode is wrapped because @napi-rs reports a failed PNG decode as
 * "Invalid SVG image" — it falls back to parsing the bytes as SVG — and names
 * no file. A half-written PNG therefore surfaced as an SVG error pointing at
 * load-image.js, with nothing to say which of forty layers was at fault. The
 * path goes to the server log only: it reaches the caller as a 500 with a
 * correlation id, never in the response body (PLAN.md §9 rule 4).
 */
export async function load(filePath: string) {
    const bytes = await fs.readFile(filePath)
    try {
        return await loadImage(bytes)
    } catch (err) {
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
