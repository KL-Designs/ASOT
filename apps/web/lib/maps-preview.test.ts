import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import sharp from 'sharp'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ensurePreview, previewAvailable } from './maps-preview'

let world: string

/** A 2x2 world: one solid colour per tile, so the mosaic's layout is checkable. */
async function writeTiles(colours: Record<string, string>) {
    for (const [key, background] of Object.entries(colours)) {
        const [col, row] = key.split(',')
        mkdirSync(join(world, 'sat', col), { recursive: true })
        const jpg = await sharp({ create: { width: 64, height: 64, channels: 3, background } }).jpeg().toBuffer()
        writeFileSync(join(world, 'sat', col, `${row}.jpg`), jpg)
    }
}

beforeEach(() => { world = mkdtempSync(join(tmpdir(), 'asot-map-')) })
afterEach(() => { rmSync(world, { recursive: true, force: true }) })

describe('map previews', () => {
    test('a world with no tiles has no preview and none is made', async () => {
        expect(previewAvailable(world)).toBe(false)
        expect(await ensurePreview(world)).toBe(false)
        expect(existsSync(join(world, 'preview.jpg'))).toBe(false)
    })

    test('tile folders with nothing in them do not count as a preview', async () => {
        mkdirSync(join(world, 'sat', '0'), { recursive: true })
        mkdirSync(join(world, 'sat', '1'), { recursive: true })
        expect(previewAvailable(world)).toBe(false)
        expect(await ensurePreview(world)).toBe(false)
    })

    test('builds a 16:9 jpeg from the tiles, west on the left', async () => {
        // col 0 is west, col 1 is east; row 0 is north.
        await writeTiles({ '0,0': '#ff0000', '0,1': '#ff0000', '1,0': '#0000ff', '1,1': '#0000ff' })
        expect(previewAvailable(world)).toBe(true)
        expect(await ensurePreview(world)).toBe(true)

        const image = sharp(join(world, 'preview.jpg'))
        const meta = await image.metadata()
        expect([meta.width, meta.height, meta.format]).toEqual([1280, 720, 'jpeg'])

        const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })
        const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)]
        const [lr, , lb] = pixel(100, 360)
        const [rr, , rb] = pixel(1180, 360)
        expect(lr).toBeGreaterThan(200); expect(lb).toBeLessThan(60)
        expect(rb).toBeGreaterThan(200); expect(rr).toBeLessThan(60)
    })

    test('never replaces a preview that is already there', async () => {
        await writeTiles({ '0,0': '#00ff00' })
        writeFileSync(join(world, 'preview.jpg'), 'hand-made')
        expect(await ensurePreview(world)).toBe(true)
        expect(readFileSync(join(world, 'preview.jpg'), 'utf8')).toBe('hand-made')
    })

    test('two requests at once share one build', async () => {
        await writeTiles({ '0,0': '#00ff00' })
        const [a, b] = await Promise.all([ensurePreview(world), ensurePreview(world)])
        expect([a, b]).toEqual([true, true])
    })
})
