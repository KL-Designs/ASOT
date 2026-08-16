/**
 * Medal display box.
 *
 * Medals are drawn in one overlapping row, centred in the case. Two details
 * differ between the two prior implementations and PLAN.md decision 4 settles
 * both in favour of Fulcrum's original:
 *
 *   Draw order is right to left, so the LEFTMOST medal ends up on top. The web
 *   port drew left to right, putting the rightmost on top instead.
 *
 *   Centring uses `count * STEP` and ignores the width of the medal artwork.
 *   The web port used `(count - 1) * STEP + WIDTH`, which centres the visual
 *   extent rather than the step run. The unit confirmed the original reads
 *   correctly, so the row sits fractionally left of true centre by design.
 */

import { createCanvas } from '@napi-rs/canvas'
import { boxMedalIndex, files } from '../assets'
import { BOX_HEIGHT, BOX_WIDTH, drawLayer, load, requireAsset } from './layers'
import { loadLines } from './ribbons'
import type { BoxPayload } from '../schema'

/** Inner edges of the case backboard, measured from the artwork. */
const CASE_LEFT = 84
const CASE_RIGHT = 795
const MEDAL_TOP = 102

/** Drawn size of one medal. Wider than STEP, which is what makes them overlap. */
const MEDAL_WIDTH = 74
const MEDAL_HEIGHT = 155

/** Horizontal advance per medal — roughly half a medal, so each overlaps its neighbour. */
const MEDAL_STEP = 34

export async function renderBox(payload: BoxPayload): Promise<Buffer> {
    const canvas = createCanvas(BOX_WIDTH, BOX_HEIGHT)
    const ctx = canvas.getContext('2d')

    await drawLayer(ctx, files.boxBackboard, BOX_WIDTH, BOX_HEIGHT)

    // Medals run in reverse precedence order — lowest line first — so the
    // highest-precedence medal ends up leftmost and therefore on top.
    const conjoined = loadLines(files.medalsJson)
        .map(line => [...line].reverse())
        .reverse()
        .flat()

    const held = new Set(payload.medals)
    const found = conjoined.filter(medal => held.has(medal)).reverse()

    if (found.length > 0) {
        const caseWidth = CASE_RIGHT - CASE_LEFT
        const runWidth = found.length * MEDAL_STEP
        const startX = CASE_RIGHT - (caseWidth - runWidth) / 2

        // Right to left: the first medal drawn sits furthest right and lowest
        // in the stacking order, so the last one drawn is leftmost and on top.
        for (const [position, medal] of found.entries()) {
            const image = await load(requireAsset(boxMedalIndex, medal, 'box-medal'))
            ctx.drawImage(
                image,
                startX - position * MEDAL_STEP,
                MEDAL_TOP,
                MEDAL_WIDTH,
                MEDAL_HEIGHT,
            )
        }
    }

    await drawLayer(ctx, files.boxGlass, BOX_WIDTH, BOX_HEIGHT)
    await drawLayer(ctx, files.boxBorder, BOX_WIDTH, BOX_HEIGHT)

    return canvas.toBuffer('image/png')
}
