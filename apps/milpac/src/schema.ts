/**
 * Request schemas. Every body is parsed through zod before a route touches it,
 * so a malformed payload is a 400 naming the offending field rather than a
 * thrown loadImage surfacing as a 500 with a stack trace in the response.
 *
 * The value unions here are deliberately loose where the authoritative list
 * lives in apps/web — ranks especially. Mirroring 99 rank strings into this
 * service is the drift PLAN.md section 4 warns about, so rank is a plain string
 * and an unrecognised one becomes a 422 from the asset layer.
 */

import { z } from 'zod'
import { BADGES } from '@asot/lib'

const UNIFORM_COLOURS = ['Blue', 'Brown'] as const

const RIFLEMAN_BADGES = ['PTE', 'PTEP', ''] as const

/**
 * Asset basenames are interpolated into filesystem paths. Even though this
 * service writes nothing and only ever reads from its own assets directory, a
 * `../` in one of these would let a caller read outside the tree — so every
 * asset-name field is constrained to the characters real asset names use.
 * The originals interpolated unchecked client input straight into paths; see
 * PLAN.md section 9 findings 2 and 3.
 */
const assetName = z.string().regex(/^[A-Za-z0-9 _-]*$/, 'must not contain path characters')

/** Rank abbreviations additionally allow the parentheses and separators ranks.ts uses. */
const rankName = z.string().regex(/^[A-Za-z0-9()/-]*$/, 'must not contain path characters')

export const uniformSchema = z.object({
    displayName: z.string().min(1).max(64),
    rank: rankName,
    Uniform: z.enum(UNIFORM_COLOURS),
    badge: z.enum(BADGES),
    RifleManBadge: z.enum(RIFLEMAN_BADGES),
    medallions: z.array(assetName).max(3),
    citations: z.array(assetName).max(64),
    TrainingMedals: z.array(assetName).max(64),
})

export const boxSchema = z.object({
    medals: z.array(assetName).max(64),
})

/**
 * Certificate fields. These are the ten placeholders the .pptx templates
 * actually use, confirmed by extraction across all 158 slides — no more, no
 * fewer. `cert` selects the layout and `type` selects which template's layout
 * set it comes from, exactly as the original picked a template and a slide.
 *
 * Every field is free text rather than a constrained code because these are
 * names and dates, not asset references — nothing here is interpolated into a
 * path. `cert` is the exception and is constrained accordingly.
 */
export const certificateSchema = z.object({
    type: z.enum(['promotion', 'award']),
    cert: assetName.min(1),

    name: z.string().max(120),
    date: z.string().max(60).default(''),
    dateNumber: z.string().max(8).default(''),
    suffix: z.string().max(8).default(''),
    signaturer: z.string().max(120).default(''),
    signaturerRankShort: z.string().max(40).default(''),
    signaturerRankFull: z.string().max(80).default(''),
    jddate: z.string().max(60).default(''),
    jdnum: z.string().max(8).default(''),
    jdsuffix: z.string().max(8).default(''),
})

export type UniformPayload = z.infer<typeof uniformSchema>
export type BoxPayload = z.infer<typeof boxSchema>
export type CertificatePayload = z.infer<typeof certificateSchema>
