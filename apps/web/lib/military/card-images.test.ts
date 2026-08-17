/**
 * The card must survive a member whose artwork failed to render. Every failure
 * here degrades to null so the card draws without the image, rather than
 * turning one bad PNG into a failed Discord command.
 */
import { describe, test, expect } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { toCardImage } from './card-images'

const png = (w: number, h: number): Buffer => {
    const canvas = createCanvas(w, h)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#556b2f'
    ctx.fillRect(0, 0, w, h)
    return canvas.toBuffer('image/png')
}

describe('toCardImage', () => {
    test('returns a PNG data URI', async () => {
        const uri = await toCardImage(png(1398, 1000), { width: 560, height: 400 })
        expect(uri?.startsWith('data:image/png;base64,')).toBe(true)
    })

    test('the result is smaller than the source it was made from', async () => {
        const source = png(1398, 1000)
        const uri = await toCardImage(source, { width: 560, height: 400 })
        const bytes = Buffer.from(uri!.split(',')[1], 'base64')
        expect(bytes.length).toBeLessThan(source.length)
    })

    test('missing bytes yield null rather than throwing', async () => {
        expect(await toCardImage(null, { width: 560, height: 400 })).toBeNull()
        expect(await toCardImage(undefined, { width: 560, height: 400 })).toBeNull()
    })

    test('undecodable bytes yield null rather than throwing', async () => {
        expect(await toCardImage(Buffer.from('not a png'), { width: 560, height: 400 })).toBeNull()
    })
})
