/**
 * Uniform compositing.
 *
 * Roughly forty full-canvas PNGs stacked in a fixed order. The order is load
 * bearing — the collar overlays the ribbon block, the rank border overlays the
 * rank, and the RE badge is drawn after the collar specifically so it sits over
 * the lapel. Changing the sequence changes the output even though every layer
 * is drawn at the same coordinates.
 *
 * This service does no rank rewriting. Web sends the member's rank verbatim
 * from apps/web/lib/military/ranks.ts and assets.ts turns it into a filename.
 * The greedy regexes that collapsed every corps rank to a bare PTE and then
 * blanked it — PLAN.md section 3 — have no equivalent here by design.
 */

import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas'
import fs from 'fs'
import {
    badgeIndex, corpsIndex, embellishIndex, files,
    medallionIndex, rankIndex, resolveRankAsset, ribbonIndex,
} from '../assets'
import {
    UNIFORM_HEIGHT, UNIFORM_WIDTH,
    drawUniformLayer, load, MissingAssetError, requireAsset,
} from './layers'
import { layoutRibbons, loadLines } from './ribbons'
import type { UniformPayload } from '../schema'

if (fs.existsSync(files.fontTimes)) {
    GlobalFonts.registerFromPath(files.fontTimes, 'Times New Roman')
}

/** Ranks that use the alternate, more ornate corps badge artwork. */
const HIGH_RANKS = new Set(['COL', 'LTGEN', 'GEN', 'MAJGEN', 'BRIG'])

/** Name tag geometry. The tag artwork is part of the base uniform. */
const NAME_X = 475
const NAME_Y = 512
const NAME_MAX_WIDTH = 120
const NAME_MAX_FONT = 20
const NAME_MIN_FONT = 8

/**
 * Draws the name tag, shrinking the type until it fits the tag. The original
 * had no lower bound and would happily reach a zero or negative font size on a
 * long enough name; this stops at NAME_MIN_FONT and lets it overflow instead,
 * which is at least legible.
 */
function drawNameTag(ctx: SKRSContext2D, displayName: string) {
    const text = displayName.toUpperCase()
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'

    let fontSize = NAME_MAX_FONT
    ctx.font = `bold ${fontSize}px Times New Roman`
    while (ctx.measureText(text).width > NAME_MAX_WIDTH && fontSize > NAME_MIN_FONT) {
        fontSize--
        ctx.font = `bold ${fontSize}px Times New Roman`
    }

    ctx.fillText(text, NAME_X, NAME_Y)
}

export async function renderUniform(payload: UniformPayload): Promise<Buffer> {
    const canvas = createCanvas(UNIFORM_WIDTH, UNIFORM_HEIGHT)
    const ctx = canvas.getContext('2d')

    // 1. Base uniform
    await drawUniformLayer(ctx, payload.Uniform === 'Blue' ? files.baseBlue : files.baseBrown)

    // 2. Rifleman badge. Carries the tier for ranks that draw no insignia.
    if (payload.RifleManBadge) {
        await drawUniformLayer(ctx, requireAsset(embellishIndex, payload.RifleManBadge, 'embellishment'))
    }

    // 3. Name tag
    drawNameTag(ctx, payload.displayName)

    // 4. Corps badge. High ranks use a more ornate variant, but only Command2
    // was ever drawn — every other corps has just the plain badge. High ranks
    // sit in India Company HQ in practice, so this rarely comes up, but a
    // general posted to another section should get their corps badge rather
    // than a failed render.
    const ornate = `${payload.badge}2`
    const badgeName = HIGH_RANKS.has(payload.rank) && corpsIndex.has(ornate) ? ornate : payload.badge
    await drawUniformLayer(ctx, requireAsset(corpsIndex, badgeName, 'corps-badge'))

    // 5. Medallions
    for (const medallion of payload.medallions) {
        if (!medallion) continue
        await drawUniformLayer(ctx, requireAsset(medallionIndex, medallion, 'medallion'))
    }

    // 6. Training badges
    for (const badge of payload.TrainingMedals) {
        await drawUniformLayer(ctx, requireAsset(badgeIndex, badge, 'training-badge'))
    }

    // 7. Ribbon block
    const placements = layoutRibbons(loadLines(files.medalsJson), payload.citations)
    for (const placement of placements) {
        const image = await load(requireAsset(ribbonIndex, placement.citation, 'ribbon'))
        ctx.drawImage(image, placement.x, placement.y, placement.width, placement.height)
    }

    // 8. Collar and uniform border, over the ribbon block
    await drawUniformLayer(ctx, payload.Uniform === 'Blue' ? files.collarBlue : files.collarBrown)
    await drawUniformLayer(ctx, files.uniBorder)

    // 9. RE sits over the lapel, so it is redrawn after the collar
    if (payload.TrainingMedals.includes('RE')) {
        await drawUniformLayer(ctx, requireAsset(badgeIndex, 'RE', 'training-badge'))
    }

    // 10. Rank insignia and its border. A null mapping means this rank draws no
    // insignia at all — the rifleman badge from step 2 carries it instead.
    const rankAsset = resolveRankAsset(payload.rank)
    if (rankAsset === undefined) throw new MissingAssetError(`rank/${payload.rank}`)
    if (rankAsset !== null) {
        await drawUniformLayer(ctx, requireAsset(rankIndex, rankAsset, 'rank'))
        await drawUniformLayer(ctx, files.rankBorder)
    }

    return canvas.toBuffer('image/png')
}
