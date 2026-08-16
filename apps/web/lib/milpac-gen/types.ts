// Types ported from F:\Projects\milpac-gen\src\types.ts
//
// Badge, Citation, TrainingBadge and Medallion moved to lib/ —
// apps/milpac has to agree with web on them, so they are shared vocabulary
// rather than web's private types. Re-exported here so existing `./types`
// imports keep working.

import type { Badge, Citation, Medallion, TrainingBadge } from '@asot/lib'

export type { Badge, Citation, Medallion, TrainingBadge }

/**
 * Stale. This union is Fulcrum's original rank list, not the unit's current
 * one — it still carries the Victor-suffixed ranks (`CPLV`, `SGTV`, …) that
 * `lib/`'s RANK_GROUPS no longer has, and lacks the current
 * parenthesised forms (`PTE(S)`, `LT(C)`). `data-mapper.ts` casts to it after
 * stripping parentheses, so the cast asserts something untrue.
 *
 * Phase 3 of apps/milpac/PLAN.md replaces this with `RankAbbr` from
 * `@asot/lib` when buildUniformData is rewritten to send the rank verbatim.
 * Left in place until then so this change stays scoped to moving shared
 * vocabulary rather than rewriting the uniform data path.
 */
export type Rank =
    | 'REC' | 'SIG' | 'SIGL' | 'SIGS' | 'SIGSL'
    | 'LCPLJ' | 'LCPL' | 'LCPLP' | 'LCPLL' | 'LCPLS' | 'LCPLJV' | 'LCPLV' | 'LCPLVL' | 'LCPLVS' | 'LCPLVP'
    | 'CPLJ' | 'CPL' | 'CPLP' | 'CPLL' | 'CPLS' | 'CPLJV' | 'CPLV' | 'CPLVP' | 'CPLVL' | 'CPLVS'
    | 'SGT' | 'SSGT' | 'SAM' | 'SSAM' | 'PSM' | 'SGTV' | 'SSGTV' | 'SAMV' | 'SSAMV' | 'PSMV'
    | 'WO2' | 'WO1' | 'CSM' | 'CSMA'
    | 'OCDT' | 'SECLTV' | 'SECLT' | 'CLT' | 'CLTV' | 'OCDTV'
    | 'SLT' | 'SLTV' | 'LT' | 'LTV'
    | 'CAPT' | 'SCAPT' | 'MAJ' | 'LTCOL' | 'COL' | 'BRIG' | 'MAJGEN' | 'LTGEN' | 'GEN'
    | '2LT' | '2LTV'
    | 'RSM' | 'RSMA'
    | 'CA' | 'WGCO' | 'GCPT' | 'SIGP' | 'GM' | 'TPR' | 'TPRP'
    | 'PTE' | 'PTEL' | 'PTES' | 'PTESL' | 'PTEP'
    | 'TPRL' | 'TPRS' | 'TPRSL'
    | 'SAP' | 'SAPL' | 'SAPS' | 'SAPSL' | 'SAPP'
    | 'GNR' | 'GNRP' | 'GNRL' | 'GNRS' | 'GNRSL'
    | 'LBDR' | 'LBDRP' | 'LBDRL' | 'LBDRS' | 'LBDRJ'
    | 'BDR' | 'BDRP' | 'BDRL' | 'BDRS' | 'BDRJ'
    | 'GMP' | 'GMS' | 'GMG' | 'GMD'
    | 'AC' | 'LM' | 'LAC' | 'SLM' | 'FSGT' | 'HOCDT' | 'POF' | 'FOF'
    | 'FLT' | 'SFLT' | 'FLL' | 'SQLD' | 'WGCP' | 'WGCDR' | 'GPCAPT'
    | 'COM' | 'AVM' | 'HAM' | 'ACM' | 'SACM'
    | ''

export interface UniformData {
    name: string        // Discord ID — used as output filename
    displayName: string // Name shown on the uniform name tag
    rank: Rank
    medallions: Medallion[]
    citations: Citation[]
    TrainingMedals: TrainingBadge[]
    Uniform: 'Blue' | 'Brown'
    RifleManBadge: 'PTE' | 'PTEP' | ''
    badge: Badge
}

export interface BoxData {
    name: string
    /**
     * Citation codes, not award display names. The renderer matches these
     * against medals.json and its schema rejects anything with path characters,
     * so a display name like "Campaign Medallion, First Clasp" is a 400.
     * Typed narrowly so that mistake cannot compile.
     */
    medals: Citation[]
}
