import sharp from 'sharp'
import { existsSync, readdirSync } from 'fs'
import { rename, writeFile } from 'fs/promises'
import { join } from 'path'

/**
 * A map's preview image, made from its own satellite tiles.
 *
 * The maps list shows `preview.jpg` from each world's folder, and until now
 * that file only existed if somebody had made one by hand and copied it in —
 * so most worlds showed "NO PREVIEW". Every world that can be opened at all
 * has satellite tiles, and a small mosaic of those is a perfectly good
 * preview, so one is built the first time it is asked for and kept.
 *
 * A hand-made `preview.jpg` always wins: this only ever writes the file when
 * it is missing.
 */

/** Wide enough for the largest card the list draws at 2x; no larger, because
 *  every source tile is decoded to build it. */
const WIDTH = 1280
const HEIGHT = 720

/** The tile grid is GRAD Meh's: `sat/{col}/{row}.jpg`, row 0 northernmost. */
function tileGrid(worldDir: string): { n: number; file: (col: number, row: number) => string | null } {
    const satDir = join(worldDir, 'sat')
    const n = existsSync(satDir)
        ? readdirSync(satDir, { withFileTypes: true }).filter(e => e.isDirectory()).length
        : 0
    return {
        n,
        file: (col, row) => {
            for (const ext of ['jpg', 'png']) {
                const p = join(satDir, String(col), `${row}.${ext}`)
                if (existsSync(p)) return p
            }
            return null
        },
    }
}

/** Whether a preview exists or could be made — what the list uses to decide
 *  between an image and the "NO PREVIEW" placeholder. Cheap: two stats. */
export function previewAvailable(worldDir: string): boolean {
    if (existsSync(join(worldDir, 'preview.jpg'))) return true
    const grid = tileGrid(worldDir)
    return grid.n > 0 && grid.file(0, 0) !== null
}

/** One build per world at a time. The list page asks for every preview at
 *  once, and two requests for the same missing file must not both decode a
 *  few hundred megapixels of tiles to write the same bytes. */
const building = new Map<string, Promise<boolean>>()

/**
 * Make sure `preview.jpg` exists for this world, building it if it does not.
 * Resolves false when there are no tiles to build one from. Never throws.
 */
export function ensurePreview(worldDir: string): Promise<boolean> {
    if (existsSync(join(worldDir, 'preview.jpg'))) return Promise.resolve(true)

    const running = building.get(worldDir)
    if (running) return running

    const job = build(worldDir)
        .catch(err => { console.error('[maps] preview generation failed for', worldDir, err); return false })
        .finally(() => building.delete(worldDir))
    building.set(worldDir, job)
    return job
}

async function build(worldDir: string): Promise<boolean> {
    const { n, file } = tileGrid(worldDir)
    if (n === 0) return false

    // Each tile is shrunk to its cell before anything is composited, so the
    // working image is never larger than the output plus one cell of rounding.
    const cell = Math.ceil(WIDTH / n)
    const side = cell * n
    const layers: sharp.OverlayOptions[] = []

    for (let col = 0; col < n; col++) {
        for (let row = 0; row < n; row++) {
            const src = file(col, row)
            if (!src) continue
            const input = await sharp(src).resize(cell, cell, { fit: 'fill' }).toBuffer()
            layers.push({ input, left: col * cell, top: row * cell })
        }
    }
    if (layers.length === 0) return false

    const mosaic = await sharp({ create: { width: side, height: side, channels: 3, background: '#0d0d0d' } })
        .composite(layers)
        .png()
        .toBuffer()

    // The world is square and the card is 16:9, so the middle band is kept.
    const jpeg = await sharp(mosaic)
        .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer()

    // Written beside the target and renamed over it, so a request that arrives
    // mid-write is served either nothing or the whole file — never half of one.
    const target = join(worldDir, 'preview.jpg')
    const partial = `${target}.${process.pid}.tmp`
    await writeFile(partial, jpeg)
    await rename(partial, target)
    return true
}
