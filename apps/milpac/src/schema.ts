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

export type UniformPayload = z.infer<typeof uniformSchema>
export type BoxPayload = z.infer<typeof boxSchema>
