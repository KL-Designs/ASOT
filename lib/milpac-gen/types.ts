// Types ported from F:\Projects\milpac-gen\src\types.ts

export type TrainingBadge =
    | 'RE' | 'PT' | 'HALO' | 'JM'
    | 'BIDF' | 'AIDF' | 'BCIDF'
    | 'NCO' | 'Platoon' | 'Company'
    | 'Ranger' | 'Commando' | 'SASR'
    | 'BR' | 'AdvR' | 'ExpR'
    | 'BF' | 'AdvF' | 'ExpF'
    | 'BCQB' | 'ACQB' | 'ECQB'
    | 'BM' | 'PR'
    | 'Driver' | 'Gunner' | 'Commander'
    | 'FO' | 'JTAC'
    | 'BRifle' | 'BPistol' | 'BAT' | 'BSniper' | 'BMG'
    | 'AdvM' | 'ExpM'
    | 'ExpMG' | 'ExpRifle' | 'ExpPistol' | 'ExpSniper' | 'ExpAT'

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

export type Medallion =
    | '' | 'Bronze1' | 'Silver1' | 'Gold1'
    | 'Bronze2' | 'Silver2' | 'Gold2'
    | 'Bronze3' | 'Silver3' | 'Gold3'
    | 'bronzemedallion' | 'silvermedallion' | 'goldmedallion'

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

export type Badge =
    | 'Command' | 'Echo' | 'GM' | 'Golf' | 'Hotel' | 'Infantry' | 'Mike' | 'Pronto' | 'Victor'

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
    medals: string[]
}
