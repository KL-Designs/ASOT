import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import { COVER_PRESET, MAX_UPLOAD_BYTES, normaliseImage, sniffImageMime } from './image'

/** Every test here exercises the cover preset; it is the one the incident was
 *  about, and the strictest of the photo presets. */
const BOX = COVER_PRESET.box
const MAX_STORED_BYTES = COVER_PRESET.maxStoredBytes

const normalise = (input: Buffer, opts?: { maxPixels?: number; maxBytes?: number }) =>
    normaliseImage(input, COVER_PRESET, opts)

/*
   Real image bytes throughout — sharp is what the implementation uses, so
   fixtures it produces are the same thing an upload actually carries.
*/
const solid = (width: number, height: number, format: 'png' | 'jpeg' | 'gif' | 'webp' = 'png') =>
    sharp({ create: { width, height, channels: 3, background: '#3a5f8a' } }).toFormat(format).toBuffer()

/*
   A stand-in for a real photograph: mild noise so it does not compress to
   nothing (which would make the size assertions meaningless), encoded as JPEG
   so the fixture itself stays well under the upload limit.
*/
const photo = (width: number, height: number) =>
    sharp({
        create: {
            width, height, channels: 3,
            background: '#3a5f8a',
            noise: { type: 'gaussian', mean: 128, sigma: 18 },
        },
    }).jpeg({ quality: 80 }).toBuffer()

let png: Buffer, jpeg: Buffer, gif: Buffer, webp: Buffer

beforeAll(async () => {
    ;[png, jpeg, gif, webp] = await Promise.all([
        solid(8, 8, 'png'), solid(8, 8, 'jpeg'), solid(8, 8, 'gif'), solid(8, 8, 'webp'),
    ])
}, 30_000)

describe('sniffImageMime', () => {
    it('identifies each format from its magic bytes', () => {
        expect(sniffImageMime(png)).toBe('image/png')
        expect(sniffImageMime(jpeg)).toBe('image/jpeg')
        expect(sniffImageMime(gif)).toBe('image/gif')
        expect(sniffImageMime(webp)).toBe('image/webp')
    })

    it('rejects things that are not images', () => {
        expect(sniffImageMime(Buffer.from('<?php echo 1; ?>'))).toBeNull()
        expect(sniffImageMime(Buffer.alloc(0))).toBeNull()
        // Truncated below the length each check needs, rather than wrong.
        expect(sniffImageMime(Buffer.from([0xff, 0xd8]))).toBeNull()
        expect(sniffImageMime(Buffer.from('RIFF????NOPE'))).toBeNull()
    })
})

describe('normaliseImage — everything is bounded', () => {
    /*
       The whole point: whatever goes in, what lands on disk is inside the box
       and under the ceiling. These are the invariants the roster relies on.
    */
    const cases: [string, () => Promise<Buffer>][] = [
        ['an oversized photo', () => photo(4000, 2500)],
        ['a small photo', () => photo(480, 136)],
        ['a PNG', () => solid(900, 400, 'png')],
        ['a WebP', () => solid(900, 400, 'webp')],
        ['a GIF', () => solid(900, 400, 'gif')],
        ['an oversized GIF', () => solid(3400, 1800, 'gif')],
    ]

    it.each(cases)('bounds %s', async (_label, make) => {
        const res = await normalise(await make())

        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.image.width).toBeLessThanOrEqual(BOX.width)
        expect(res.image.height).toBeLessThanOrEqual(BOX.height)
        expect(res.image.buffer.length).toBeLessThanOrEqual(MAX_STORED_BYTES)
    }, 60_000)

    it('re-encodes even a cover that would already have fit', async () => {
        // A PNG small enough to pass unchanged still comes back as JPEG: one
        // invariant for every file on disk beats a long tail of "fine on its
        // own" uploads.
        const res = await normalise(await solid(400, 200, 'png'))

        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(sniffImageMime(res.image.buffer)).toBe('image/jpeg')
    })

    it('scales down without distorting, and never enlarges', async () => {
        const big = await normalise(await photo(4000, 2500))
        expect(big.ok).toBe(true)
        if (big.ok) expect(big.image.width / big.image.height).toBeCloseTo(4000 / 2500, 1)

        const small = await normalise(await photo(480, 136))
        expect(small.ok).toBe(true)
        if (small.ok) {
            expect(small.image.width).toBe(480)
            expect(small.image.height).toBe(136)
        }
    }, 60_000)
})

describe('normaliseImage — GIFs stay GIFs', () => {
    /*
       The roster animates covers on hover, so a GIF has to survive as a GIF.
       Flattening one to a still JPEG would silently delete something the member
       chose, which is why the implementation routes on the format rather than
       on the frame count — sharp misreporting `pages` once would otherwise cost
       someone their animation with no way to tell why.

       Caveat worth stating: sharp 0.33.5 cannot *construct* a multi-frame GIF
       (`pageHeight` is metadata it reads, not an input option, and `join`
       does not exist in this version), so these fixtures are single-frame. What
       is covered is the format-preserving path and the resize; that frames
       survive that path rests on sharp's `animated: true` read, which is
       exercised here but not asserted frame-by-frame.
    */
    it('keeps a GIF as a GIF rather than converting it to a still', async () => {
        const res = await normalise(await solid(900, 400, 'gif'))

        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.image.format).toBe('gif')
        expect(sniffImageMime(res.image.buffer)).toBe('image/gif')
    })

    it('reports frame count honestly rather than assuming animation', async () => {
        const res = await normalise(await solid(900, 400, 'gif'))
        expect(res.ok).toBe(true)
        // A single-frame GIF is stored as a GIF but does not animate, and the
        // roster reads this flag to decide whether to wire up hover at all.
        if (res.ok) expect(res.image.animated).toBe(false)
    })

    it('shrinks an oversized GIF rather than refusing it', async () => {
        const res = await normalise(await solid(3400, 1800, 'gif'))

        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.image.width).toBeLessThanOrEqual(BOX.width)
        expect(res.image.buffer.length).toBeLessThanOrEqual(MAX_STORED_BYTES)
    }, 60_000)
})

describe('normaliseImage — what it turns away', () => {
    /*
       The upload that started it: 16320x7612 at 13.2MB. That file is accepted
       now and compressed (it is a real photo), so what remains rejectable is
       the decompression bomb — an image whose pixel count alone is absurd. The
       ceiling is lowered here rather than building a gigapixel fixture; the
       branch is the same one, reached from the header without decoding.
    */
    it('refuses an image with too many pixels, before decoding it', async () => {
        const res = await normalise(await solid(1200, 900), { maxPixels: 100_000 })

        expect(res.ok).toBe(false)
        if (res.ok) return
        expect(res.error).toContain('1200x900')
        expect(res.error).toMatch(/megapixels/)
        // The message has to tell the member what to do about it.
        expect(res.error).toContain(`${BOX.width}x${BOX.height}`)
    })

    it('refuses a file past the upload ceiling, before reading its header', async () => {
        const res = await normalise(Buffer.alloc(MAX_UPLOAD_BYTES + 1))
        expect(res.ok).toBe(false)
        if (!res.ok) expect(res.error).toMatch(/largest cover/i)
    })

    it('rejects an empty file', async () => {
        const res = await normalise(Buffer.alloc(0))
        expect(res.ok).toBe(false)
        if (!res.ok) expect(res.error).toMatch(/empty/i)
    })

    it('rejects a non-image, whatever it claims to be', async () => {
        const res = await normalise(Buffer.from('#!/bin/sh\nrm -rf /\n'))
        expect(res.ok).toBe(false)
        if (!res.ok) expect(res.error).toMatch(/not a PNG/i)
    })
})
