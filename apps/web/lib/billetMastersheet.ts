// Shared types and constants for the Billet Mastersheet feature.

export type FieldSource = 'website' | 'imported' | 'calculated'

export interface FieldSourceDef {
    group: string
    fields: string
    source: FieldSource
    websiteRef?: string
    note?: string
}

export const FIELD_SOURCE_MAP: FieldSourceDef[] = [
    { group: 'Name',               fields: 'Member display name',                      source: 'website',    websiteRef: 'users.guild.nickname' },
    { group: 'Rank',               fields: 'Current rank',                             source: 'website',    websiteRef: 'users.milpac.currentRank' },
    { group: 'Enlisted Date',      fields: 'Date joined',                              source: 'website',    websiteRef: 'users.milpac.enlistedDate' },
    { group: 'Promotion Points',   fields: 'Total promotion points',                   source: 'website',    websiteRef: 'users.milpac.promotionPoints' },
    { group: 'J4 Points',          fields: 'J4 awarded points',                        source: 'website',    websiteRef: 'users.milpac.j4Points' },
    { group: 'Discipline Deduct',  fields: 'Discipline point deductions',              source: 'website',    websiteRef: 'users.milpac.disciplineDeductions' },
    { group: 'Attendance',         fields: 'All attendance counts (ops, FTX, training, meetings, campaigns)', source: 'website', websiteRef: 'users.milpac.billetCounts' },
    { group: 'Dept Actions',       fields: 'J1 interviews, J2 missions, J3 training, J5 content', source: 'website', websiteRef: 'users.milpac.billetCounts' },
    { group: 'Certifications',     fields: 'All qualification badges',                 source: 'website',    websiteRef: 'users.milpac.qualifications' },
    { group: 'Awards',             fields: 'All awards and citations',                 source: 'website',    websiteRef: 'users.milpac.awards' },
    { group: 'Billet',             fields: 'Billet designation (e.g. SAP, GM, PTE)',   source: 'imported',   note: 'Imported only — no website source linked. Stored from Billet Mastersheet CSV col 5.' },
    { group: 'Up To Date',         fields: 'Billet status flag',                       source: 'imported',   note: 'Imported only — no website source linked. Stored from Billet Mastersheet CSV col 4.' },
    { group: 'Last Update',        fields: 'Last mastersheet sync date',               source: 'imported',   note: 'Imported only — no website source linked. Stored from Billet Mastersheet CSV notes column.' },
    { group: 'Service Years',      fields: 'Eligible / Current service years',         source: 'calculated', note: 'Derived from enlisted date at query time.' },
]

export interface EmailEntry {
    email: string
    addedAt: Date
    addedByName: string
}

export interface BilletRow {
    id: string
    username: string
    name: string
    rank: string
    enlistedDate: string
    serviceYears: string
    promotionPoints: number
    j4Points: number
    disciplineDeductions: number
    billet: string | null
    upToDate: boolean | null
    lastUpdate: string | null
    hasExtras: boolean
    isActive: boolean
    hasEmail: boolean
    currentEmail: string | null
    emailHistory: EmailEntry[]
    primaryNightOps: number
    secondaryNightOps: number
    primaryNightFTX: number
    secondaryNightFTX: number
    platoonTraining: number
    sectionTraining: number
    meetings: number
    campaignMedals: number
    j1Interviews: number
    j1InterviewBonus: number
    j2MissionsRun: number
    j3Bct12: number
    j3OtherTrainings: number
    j5ContentCreated: number
    j5MilpacsGenerated: number
    j5OfficialPR: number
    certifications: string[]
    awards: string[]
    classificationSignals?: ClassificationSignals
}
