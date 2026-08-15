type TrainingBadge =
  | "RE"
  | "PT"
  | "HALO"
  | "JM"
  | "BIDF"
  | "AIDF"
  | "BCIDF"
  | "NCO"
  | "Platoon"
  | "Company"
  | "Ranger"
  | "Commando"
  | "SASR"
  | "BR"
  | "AdvR"
  | "ExpR"
  | "BF"
  | "AdvF"
  | "ExpF"
  | "BCQB"
  | "ACQB"
  | "ECQB"
  | "BM"
  | "PR"
  | "Driver"
  | "Gunner"
  | "Commander"
  | "FO"
  | "JTAC"
  | "BRifle"
  | "BPistol"
  | "BAT"
  | "BSniper"
  | "BMG"
  | "AdvM"
  | "ExpM"
  | "ExpMG"
  | "ExpRifle"
  | "ExpPistol"
  | "ExpSniper"
  | "ExpAT";

type Rank =
  | "REC"
  | "SIG"
  | "SIGL"
  | "SIGS"
  | "SIGSL"
  | "LCPLJ"
  | "LCPL"
  | "LCPLP"
  | "LCPLL"
  | "LCPLS"
  | "LCPLJV"
  | "LCPLV"
  | "LCPLVL"
  | "LCPLVS"
  | "LCPLJV"
  | "LCPLVP"
  | "CPLJ"
  | "CPL"
  | "CPLP"
  | "CPLL"
  | "CPLS"
  | ""
  | "CPLJV"
  | "CPLV"
  | "CPLVP"
  | "CPLVL"
  | "CPLVS"
  | "SGT"
  | "SSGT"
  | "SAM"
  | "SSAM"
  | "PSM"
  | "SGTV"
  | "SSGTV"
  | "SAMV"
  | "SSAMV"
  | "PSMV"
  | "WO2"
  | "WO1"
  | "CSM"
  | "CSMA"
  | "OCDT"
  | "SECLTV"
  | "SECLT"
  | "CLT"
  | "CLTV"
  | "OCDTV"
  | "SLT"
  | "SLTV"
  | "LT"
  | "LTV"
  | "CAPT"
  | "BRIG"
  | "GEN"
  | "MAJGEN"
  | "LTGEN"
  | "SCAPT"
  | "MAJ"
  | "COL"
  | "LTCOL"
  | "PTEP"
  | "SAPP"
  | "SAP"
  | "SAPL"
  | "SAPS"
  | "SAPSL"
  | "GNR"
  | "GNRP"
  | "GNRL"
  | "GNRS"
  | "GNRSL"
  | "LBDR"
  | "LBDRP"
  | "LBDRL"
  | "LBDRS"
  | "LBDRJ"
  | "BDR"
  | "BDRP"
  | "BDRL"
  | "BDRS"
  | "BDRJ"
  | "2LT"
  | "2LTV"
  | "RSM"
  | "RSMA"
  | "CA"
  | "WGCO"
  | "GCPT"
  | "SIGP"
  | "GM"
  | "TPR"
  | "TPRP"
  | "PTE"
  | "PTEL"
  | "PTES"
  | "PTESL"
  | "TPRL"
  | "TPRS"
  | "TPRSL"
  | "GMP"
  | "GMS"
  | "GMG"
  | "GMD"
  | "AC"
  | "LM"
  | "LAC"
  | "SLM"
  | "FSGT"
  | "HOCDT"
  | "POF"
  | "FOF"
  | "FLT"
  | "SFLT"
  | "FLL"
  | "SQLD"
  | "WGCP"
  | "WGCDR"
  | "GPCAPT"
  | "COM"
  | "AVM"
  | "HAM"
  | "ACM"
  | "SACM";

type Medallion =
  | ""
  | "Bronze1"
  | "Silver1"
  | "Gold1"
  | "Bronze2"
  | "Silver2"
  | "Gold2"
  | "Bronze3"
  | "Silver3"
  | "Gold3"
  | "bronzemedallion"
  | "silvermedallion"
  | "goldmedallion";

type Citation =
  | "campaign"
  | "campaign1"
  | "campaign2"
  | "campaign3"
  | "campaign4"
  | "campaign5"
  | "campaign6"
  | "campaign7"
  | "campaign8"
  | "campaign9"
  | "campaign10"
  | "campaign11"
  | "campaign12"
  | "campaign13"
  | "campaign14"
  | "campaign15"
  | "campaign16"
  | "1year"
  | "2year"
  | "3year"
  | "4year"
  | "aviation"
  | "medical"
  | "protagonist"
  | "juniorleadership"
  | "seniorleadership"
  | "atlas"
  | "instructor"
  | "watchman"
  | "architect"
  | "brokenLance"
  | "diplomat"
  | "publicrelation"
  | "groupdevelopment"
  | "founders"
  | "gallantry"
  | "crossofvalour"
  | "starofcourage"
  | "beyond";

type Badge =
  | "Command"
  | "Echo"
  | "GM"
  | "Golf"
  | "Hotel"
  | "Infantry"
  | "Mike"
  | "Pronto"
  | "Victor";

type Certificate = Citation | Rank | Medallion;
interface certDataRaw {
  name: string;
  signaturer: string;
  jddate: string;
  jdsuffix: string;
  jdnum: string;
  dateNumber: string;
  date: string;
  suffix: string;
  cert: Certificate;
  type: string;
}
interface certDataProcessed extends certDataRaw {
  signaturerRankShort: string;
  signaturerRankFull: string;
}
interface uniformDataRaw {
  name: string;
  rank: Rank;
  medallions: Medallion[];
  citations: Citation[];
  TrainingMedals: TrainingBadge[];
  Uniform: "Blue" | "Brown";
  RifleManBadge: "PTE" | "PTEP" | "";
  badge: Badge;
}
interface boxDataRaw {
  name: string;
  medals: string[];
}

export type {
  certDataRaw,
  certDataProcessed,
  uniformDataRaw,
  boxDataRaw,
  Rank,
  Medallion,
  Citation,
  TrainingBadge,
  Badge,
  Certificate,
};
