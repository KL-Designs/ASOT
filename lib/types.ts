/**
 * Shared unit vocabulary — the codes that identify a ribbon, badge or corps.
 *
 * These are shared because more than one app has to agree on them: apps/web
 * derives them from member records, and apps/milpac draws the artwork they name.
 * A code added on one side and not the other is a silently missing layer on a
 * uniform, which is exactly the failure this directory exists to prevent.
 *
 * Deliberately NOT here:
 *   - Rank-to-filename mapping. That describes apps/milpac's asset tree and
 *     lives beside it, in apps/milpac/src/assets.ts. An asset rename should
 *     touch one app, not three.
 *   - The render payload shape. That is the milpac service's HTTP contract,
 *     defined by its zod schemas.
 */

/**
 * Corps badge worn on the collar, derived from the member's ORBAT section.
 *
 * Exported as a value as well as a type so apps/milpac can build a zod enum
 * from it rather than restating the list — a badge added here then reaches the
 * renderer's request validation automatically.
 */
export const BADGES = [
    'Command', 'Echo', 'GM', 'Golf', 'Hotel',
    'Infantry', 'Mike', 'Pronto', 'Victor',
] as const

export type Badge = (typeof BADGES)[number]

/** Ribbon code. One per awardable citation; see maps.ts for the award mapping. */
export type Citation =
    | 'campaign' | 'campaign1' | 'campaign2' | 'campaign3' | 'campaign4'
    | 'campaign5' | 'campaign6' | 'campaign7' | 'campaign8' | 'campaign9'
    | 'campaign10' | 'campaign11' | 'campaign12' | 'campaign13' | 'campaign14'
    | 'campaign15' | 'campaign16'
    | '1year' | '2year' | '3year' | '4year'
    | 'aviation' | 'medical' | 'protagonist'
    | 'juniorleadership' | 'seniorleadership'
    | 'atlas' | 'instructor' | 'watchman' | 'architect' | 'brokenlance'
    | 'diplomat' | 'publicrelation' | 'groupdevelopment'
    | 'founders' | 'gallantry' | 'crossofvalour' | 'starofcourage' | 'beyond'

/** Training badge code, earned via qualifications; see maps.ts. */
export type TrainingBadge =
    | 'RE' | 'PT' | 'HALO' | 'JM'
    | 'BIDF' | 'AIDF' | 'BCIDF'
    | 'NCO' | 'Platoon' | 'Company'
    | 'Ranger' | 'Commando' | 'SASR'
    | 'BR' | 'AdvR' | 'ExpR'
    | 'BF' | 'AF' | 'ExpF'
    | 'BCQB' | 'ACQB' | 'ECQB'
    | 'BM' | 'PR'
    | 'Driver' | 'Gunner' | 'Commander'
    | 'FO' | 'JTAC'
    | 'BRifle' | 'BPistol' | 'BAT' | 'BSniper' | 'BMG' | 'BGLA'
    | 'AdvM' | 'ExpM'
    | 'ExpMG' | 'ExpRifle' | 'ExpPistol' | 'ExpSniper' | 'ExpAT'

/**
 * Chest medallion. The numeric suffix is a horizontal slot, not a tier —
 * 1 = left, 2 = centre, 3 = right — assigned by how many the member holds.
 */
export type Medallion =
    | '' | 'Bronze1' | 'Silver1' | 'Gold1'
    | 'Bronze2' | 'Silver2' | 'Gold2'
    | 'Bronze3' | 'Silver3' | 'Gold3'
    | 'bronzemedallion' | 'silvermedallion' | 'goldmedallion'
