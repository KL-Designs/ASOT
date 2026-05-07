/**
 * Maps every TeamSpeak server group name to its website concept.
 *
 * Spacer roles (~~~ ... ~~~) are real TS server groups that act as visual
 * dividers. Any member who holds a role in a given category must also hold
 * that category's spacer group(s). The `spacers` field on each entry lists
 * exactly which spacer groups must be present alongside it.
 */

import type { Award } from '@/lib/awards'
import type { Certification } from '@/lib/certifications'
import type { RankEntry } from '@/lib/ranks'

export type TsCategory =
    | 'award'          // Citations & Awards
    | 'operation'      // Campaign Medals (operation attendance)
    | 'certification'  // Certifications / qualifications
    | 'rank'           // Rank groups
    | 'administration' // Admin / staff roles
    | 'unit'           // Unit membership
    | 'spacer'         // Visual divider — no website concept
    | 'ignore'         // Discipline, junk, templates

export interface TsGroupMapping {
    /** Exact TeamSpeak server group name */
    tsName: string
    category: TsCategory
    /** Spacer group names that must be present whenever this role is active */
    spacers: string[]
    /** Links to RANKS_FLAT[].abbr */
    rankAbbr?: RankEntry['abbr']
    /** Links to AWARDS[].label */
    awardLabel?: Award['label']
    /** Links to CERTIFICATIONS[].label */
    certLabel?: Certification['label']
    /** Operation display name for campaign medals */
    operationName?: string
}

// ── Spacer names ──────────────────────────────────────────────────────────────

export const SPACER = {
    CITATIONS:    '~~~ CITATIONS & AWARDS ~~~',
    ADMIN:        '~~~ ADMINISTRATION ~~~',
    CERTS:        '~~~ CERTIFICATIONS ~~~',
    RANK:         '~~~ Rank ~~~',
    RECRUIT:      '~~~ Recruit ~~~',
    PTE:          '~~~ PTE ~~~',
    LCPL:         '~~~ LCPL ~~~',
    CPL:          '~~~ CPL ~~~',
    SGT:          '~~~ SGT ~~~',
    LT:           '~~~ LT ~~~',
    HOTEL_CREW:   '~~~ Hotel Crew ~~~',
    HOTEL_PILOTS: '~~~ Hotel Pilots ~~~',
    HOTEL_STAFF:  '~~~ Hotel Staff ~~~',
    HOTEL_PHQ:    '~~~ Hotel PHQ ~~~',
    CHQ:          '~~~ CHQ ~~~',
    WO:           '~~~ WO ~~~',
    OFFICER:      '~~~ OFFICER ~~~',
    UNIT:         '~~~ Unit ~~~',
    CAMPAIGN:     '~~~ Campaign Medals ~~~',
    JUNK:         '~~~ Random Junk ~~~',
    DISCIPLINE:   '~~~ Discipline Roles ~~~',
    TEMPLATES:    '~~~ Templates ~~~',
} as const

export const TS_SPACER_NAMES = new Set<string>(Object.values(SPACER))

// ── Full mapping ──────────────────────────────────────────────────────────────

export const TS_GROUP_MAPPINGS: TsGroupMapping[] = [

    // ── Spacers (no website concept) ──────────────────────────────────────────
    ...Object.values(SPACER).map(s => ({ tsName: s, category: 'spacer' as const, spacers: [] })),

    // ── Citations & Awards ────────────────────────────────────────────────────
    { tsName: 'Paddling Award',                   category: 'award', spacers: [SPACER.CITATIONS] },
    { tsName: 'ASOT Beyond Award',                category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'ASOT Beyond Award' },
    { tsName: 'ASOT Cross of Valour',             category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'ASOT Cross of Valour' },
    { tsName: 'Star of Courage',                  category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Star of Courage' },
    { tsName: 'Gallantry Award',                  category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Gallantry Award' },
    { tsName: 'Founding Member',                  category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Founding Member' },
    { tsName: 'Group Development Award',          category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Group Development Award' },
    { tsName: 'Public Relations Award',           category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Public Relations Award' },
    { tsName: 'Diplomat Award',                   category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Diplomat Award' },
    { tsName: 'Broken Lance Award',               category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Broken Lance Award' },
    { tsName: 'Architect Award',                  category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Architect Award' },
    { tsName: 'Watchman Award',                   category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Watchman Award' },
    { tsName: 'Watchman Award (2)',               category: 'award', spacers: [SPACER.CITATIONS] },
    { tsName: 'Instructor Award',                 category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Instructor Award' },
    { tsName: 'Atlas Award',                      category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Atlas Award' },
    { tsName: 'Senior Leadership Award',          category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Senior Leadership Award' },
    { tsName: 'Junior Leadership Award',          category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Junior Leadership Award' },
    { tsName: 'Protagonist Award',                category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Protagonist Award' },
    { tsName: 'Medical Medal',                    category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Medical Medallion' },
    { tsName: 'Rotary Aviation Medal',            category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Rotary Aviation Medal' },
    { tsName: 'Long Term Service Citation',       category: 'award', spacers: [SPACER.CITATIONS], awardLabel: '4 Year+ Service Citation' },
    { tsName: '3 Year Service Citation',          category: 'award', spacers: [SPACER.CITATIONS], awardLabel: '3 Year Service Citation' },
    { tsName: '2 Year Service Citation',          category: 'award', spacers: [SPACER.CITATIONS], awardLabel: '2 Year Service Citation' },
    { tsName: '1 Year Service Citation',          category: 'award', spacers: [SPACER.CITATIONS], awardLabel: '1 Year Service Citation' },
    { tsName: 'Campaign',                         category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Campaign Medallion' },
    { tsName: 'Campaign First Clasp',             category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Campaign Medallion, First Clasp' },
    { tsName: 'Campaign Second Clasp',            category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Campaign Medallion, Second Clasp' },
    { tsName: 'Campaign Third Clasp',             category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Campaign Medallion, Third Clasp' },
    { tsName: 'Campaign Fourth Clasp',            category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Campaign Medallion, Fourth Clasp' },
    { tsName: 'Campaign Tier 2 First Clasp',      category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Campaign Medallion, Fifth Clasp' },
    { tsName: 'Campaign Tier 2 Second Clasp',     category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Campaign Medallion, Sixth Clasp' },
    { tsName: 'Campaign Tier 2 Third Clasp',      category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Campaign Medallion, Seventh Clasp' },
    { tsName: 'Campaign Tier 2 Fourth Clasp',     category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Campaign Medallion, Eighth Clasp' },
    { tsName: "Bronze Soldier's Medalion",        category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Bronze Soldiers Medallion' },
    { tsName: "Silver Soldier's Medalion",        category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Silver Soldiers Medallion' },
    { tsName: "Gold Soldier's Medalion",          category: 'award', spacers: [SPACER.CITATIONS], awardLabel: 'Gold Soldiers Medallion' },
    { tsName: '2020 PvP Competition Winners',     category: 'award', spacers: [SPACER.CITATIONS] },
    { tsName: '2022 PvP Competition Winners',     category: 'award', spacers: [SPACER.CITATIONS] },
    { tsName: '2023 PvP Competition Winners',     category: 'award', spacers: [SPACER.CITATIONS] },
    { tsName: '2024 PvP Competition Winners',     category: 'award', spacers: [SPACER.CITATIONS] },
    { tsName: '2025 PvP Battle Royal Winners',    category: 'award', spacers: [SPACER.CITATIONS] },
    { tsName: '2025 PvP Competition Winners',     category: 'award', spacers: [SPACER.CITATIONS] },

    // ── Administration ────────────────────────────────────────────────────────
    { tsName: 'Whitelist',                        category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'Server Admin',                     category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J1 | Recruitment Staff',           category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J1 | Recruitment',                 category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J2 | Mission Making Lead',         category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J2 | Mission Making',              category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J3 | Training Lead',               category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J3 | Training Admin',              category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J3 | Training',                    category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J4 | Administraton',               category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J5 | Media Lead',                  category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J5 | Media',                       category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J6 | Game Masters Lead',           category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J6 | Game Masters',                category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J7 | Development Lead',            category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J7 | Community Development',       category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J7 | Mod Development',             category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J7 | Server Development',          category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J7 | Website Development',         category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'J7 | Teamspeak Development',       category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'Chaplain',                         category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'GD | General Discharge',           category: 'administration', spacers: [SPACER.ADMIN] },
    { tsName: 'HD | Honorable Discharge',         category: 'administration', spacers: [SPACER.ADMIN] },

    // ── Certifications ────────────────────────────────────────────────────────
    { tsName: 'BCT Stage 1',                         category: 'certification', spacers: [SPACER.CERTS], certLabel: 'BCT 1' },
    { tsName: 'BCT Stage 2',                         category: 'certification', spacers: [SPACER.CERTS], certLabel: 'BCT 2' },
    { tsName: 'PTE(P) Qualified',                    category: 'certification', spacers: [SPACER.CERTS] },
    { tsName: 'Section Weapons Course',              category: 'certification', spacers: [SPACER.CERTS] },
    { tsName: 'Rifleman Proficiency Course',         category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Rifleman Proficiency' },
    { tsName: 'MG Proficiency Course',               category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Machine Gunner Proficiency' },
    { tsName: 'AT Proficiency Course',               category: 'certification', spacers: [SPACER.CERTS], certLabel: 'AT Gunner Proficiency' },
    { tsName: 'Pistol Proficiency Course',           category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Pistol Sharpshooter Proficiency' },
    { tsName: 'GLA Proficiency',                     category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Grenadier Proficiency' },
    { tsName: 'Basic CQB Course',                    category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Basic CQB Course' },
    { tsName: 'Armed Veh Crew (Driver Basic)',       category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Driver Basics Course' },
    { tsName: 'Armed Veh Crew (Driver) Course',      category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Driver Formations and Tactics Course' },
    { tsName: 'Static Line Paratrooper Course',      category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Static Line Paratrooper Course' },
    { tsName: 'Basic Medical Course',                category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Basic Medical Course' },
    { tsName: 'Advanced Medical Course',             category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Advanced Medical Course' },
    { tsName: 'Basic Staff Training Course',         category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Basic Staff (NCO) Course' },
    { tsName: 'NCO Assessor Course',                 category: 'certification', spacers: [SPACER.CERTS] },
    { tsName: 'RTO Course',                          category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Radio Telecommunications Operator Course' },
    { tsName: 'Forward Observer Course',             category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Forward Observer Course' },
    { tsName: 'Vehicle Checkpoint Course',           category: 'certification', spacers: [SPACER.CERTS], certLabel: 'VCP' },
    { tsName: 'Basic Rotary Wing Course',            category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Basic Rotary Wing Course' },
    { tsName: 'Basic Rotary Wing Assessment',        category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Basic Rotary Wing Assessment (Wings)' },
    { tsName: 'Basic CAS and RECON course',          category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Basic CAS and RECON Course' },
    { tsName: 'Advanced Rotary Course',              category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Advanced Rotary Wing Course' },
    { tsName: 'Advanced CAS Course',                 category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Advanced CAS Course' },
    { tsName: 'Basic Indirect Fire Course',          category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Basic Indirect Fires Course' },
    { tsName: 'Basic DFSW Course',                   category: 'certification', spacers: [SPACER.CERTS], certLabel: 'Direct Fires Support Weapons Course' },
    { tsName: 'J1 Qualified',                        category: 'certification', spacers: [SPACER.CERTS] },
    { tsName: 'J2 Qualified',                        category: 'certification', spacers: [SPACER.CERTS] },
    { tsName: 'J3 Qualified',                        category: 'certification', spacers: [SPACER.CERTS] },
    { tsName: 'J6 Qualified',                        category: 'certification', spacers: [SPACER.CERTS] },

    // ── Ranks — Recruit ───────────────────────────────────────────────────────
    { tsName: 'REC - Recruit',                    category: 'rank', spacers: [SPACER.RANK, SPACER.RECRUIT], rankAbbr: 'REC' },
    { tsName: 'GM - Game Master Recruit',         category: 'rank', spacers: [SPACER.RANK, SPACER.RECRUIT] },

    // ── Ranks — PTE ───────────────────────────────────────────────────────────
    { tsName: 'PTE - Private',                    category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'PTE' },
    { tsName: 'PTE(P) - Private Proficient',      category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'PTE(P)' },
    { tsName: 'PTE(L) - Leading Private',         category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'PTE(L)' },
    { tsName: 'PTE(S) - Senior Private',          category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'PTE(S)' },
    { tsName: 'PTE(SL) - Snr Leading Private',    category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'PTE(SL)' },
    { tsName: 'SAP - Sapper',                     category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'SAP' },
    { tsName: 'SAP(P) - Sapper Proficient',       category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'SAP(P)' },
    { tsName: 'SAP(L) - Leading Sapper',          category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'SAP(L)' },
    { tsName: 'SAP(S) - Senior Sapper',           category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'SAP(S)' },
    { tsName: 'SAP(SL) - Snr Leading Sapper',     category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'SAP(SL)' },
    { tsName: 'GNR - Gunner',                     category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'GNR' },
    { tsName: 'GNR(P) - Gunner Proficient',       category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'GNR(P)' },
    { tsName: 'GNR(L) - Leading Gunner',          category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'GNR(L)' },
    { tsName: 'GNR(S) - Senior Gunner',           category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'GNR(S)' },
    { tsName: 'GNR(SL) - Snr Leading Gunner',     category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'GNR(SL)' },
    { tsName: 'TPR - Trooper',                    category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'TPR' },
    { tsName: 'TPR(P) - Trooper Proficient',      category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'TPR(P)' },
    { tsName: 'TPR(L) - Leading Trooper',         category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'TPR(L)' },
    { tsName: 'TPR(S) - Senior Trooper',          category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'TPR(S)' },
    { tsName: 'TPR(SL) - Snr Leading Trooper',    category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'TPR(SL)' },
    { tsName: 'SIG - Signaller',                  category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'SIG' },
    { tsName: 'SIG(P) - Signaller Proficient',    category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'SIG(P)' },
    { tsName: 'SIG(L) - Leading Signaller',       category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'SIG(L)' },
    { tsName: 'SIG(S) - Senior Signaller',        category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'SIG(S)' },
    { tsName: 'SIG(SL) - Snr Leading Sig',        category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'SIG(SL)' },
    { tsName: 'GM - Game Master',                 category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'GM' },
    { tsName: 'GM(P) - Game Master Proficient',   category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'GM(P)' },
    { tsName: 'GM(S) - Game Master Senior',       category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'GM(S)' },
    { tsName: 'GM(G) - Grand Game Master',        category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'GM(G)' },
    { tsName: 'GM(D) - Distinguished GM',         category: 'rank', spacers: [SPACER.RANK, SPACER.PTE], rankAbbr: 'GM(D)' },

    // ── Ranks — LCPL ─────────────────────────────────────────────────────────
    { tsName: 'LCPL(J) -Junior Lance Corporal',   category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LCPL(J)' },
    { tsName: 'LCPL - Lance Corporal',             category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LCPL' },
    { tsName: 'LCPL(P) - LCPL Proficient',         category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LCPL(P)' },
    { tsName: 'LCPL(L) - LCPL Leading',            category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LCPL(L)' },
    { tsName: 'LCPL(S) - LCPL Senior',             category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LCPL(S)' },
    { tsName: 'LBDR(J) - Junior Lance BDR',        category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LBDR(J)' },
    { tsName: 'LBDR - Lance Bombardier',           category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LBDR' },
    { tsName: 'LBDR(P) - LBDR Profiecient',        category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LBDR(P)' },
    { tsName: 'LBDR(L) - LBDR Leading',            category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LBDR(L)' },
    { tsName: 'LBDR(S) - LBDR Senior',             category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LBDR(S)' },
    // (V) variants — same website rank
    { tsName: 'LCPL(J) - Junior LCPL (V)',         category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LCPL(J)' },
    { tsName: 'LCPL - Lance Corporal (V)',         category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LCPL' },
    { tsName: 'LCPL(P) - LCPL Proficient (V)',     category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LCPL(P)' },
    { tsName: 'LCPL(L) - LCPL Leading (V)',        category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LCPL(L)' },
    { tsName: 'LCPL(S) - LCPL Senior (V)',         category: 'rank', spacers: [SPACER.RANK, SPACER.LCPL], rankAbbr: 'LCPL(S)' },

    // ── Ranks — CPL ──────────────────────────────────────────────────────────
    { tsName: 'CPL(J) - Junior Corporal',          category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'CPL(J)' },
    { tsName: 'CPL - Corporal',                    category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'CPL' },
    { tsName: 'CPL(P) - CPL Proficient',           category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'CPL(P)' },
    { tsName: 'CPL(L) - CPL Leading',              category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'CPL(L)' },
    { tsName: 'CPL(S) - CPL Senior',               category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'CPL(S)' },
    { tsName: 'BDR(J) - Junior Bombardier',        category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'BDR(J)' },
    { tsName: 'BDR - Bombardier',                  category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'BDR' },
    { tsName: 'BDR(P) - BDR Proficient',           category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'BDR(P)' },
    { tsName: 'BDR(L) - BDR Leading',              category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'BDR(L)' },
    { tsName: 'BDR(S) - BDR Senior',               category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'BDR(S)' },
    // (V) variants
    { tsName: 'CPL(J) - Junior Corporal (V)',      category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'CPL(J)' },
    { tsName: 'CPL - Corporal (V)',                category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'CPL' },
    { tsName: 'CPL(P) - CPL Proficient (V)',       category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'CPL(P)' },
    { tsName: 'CPL(L) - CPL Leading (V)',          category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'CPL(L)' },
    { tsName: 'CPL(S) - CPL Senior (V)',           category: 'rank', spacers: [SPACER.RANK, SPACER.CPL], rankAbbr: 'CPL(S)' },

    // ── Ranks — SGT ──────────────────────────────────────────────────────────
    { tsName: 'SGT - Sergeant',                    category: 'rank', spacers: [SPACER.RANK, SPACER.SGT], rankAbbr: 'SGT' },
    { tsName: 'SSGT - Staff Sergeant',             category: 'rank', spacers: [SPACER.RANK, SPACER.SGT], rankAbbr: 'SSGT' },
    { tsName: 'SAM - Sergeant at arms',            category: 'rank', spacers: [SPACER.RANK, SPACER.SGT], rankAbbr: 'SAM' },
    { tsName: 'SSAM - Snr Sergeant at arms',       category: 'rank', spacers: [SPACER.RANK, SPACER.SGT], rankAbbr: 'SSAM' },
    { tsName: 'PSM - Platoon Sergeant Major',      category: 'rank', spacers: [SPACER.RANK, SPACER.SGT], rankAbbr: 'PSM' },
    { tsName: 'PTSG - Platoon Technician Sgt',     category: 'rank', spacers: [SPACER.RANK, SPACER.SGT], rankAbbr: 'PTSG' },
    { tsName: 'B/SGT - Battery Sergeant',          category: 'rank', spacers: [SPACER.RANK, SPACER.SGT], rankAbbr: 'B/SGT' },
    // (V) variants
    { tsName: 'SGT - Sergeant (V)',                category: 'rank', spacers: [SPACER.RANK, SPACER.SGT], rankAbbr: 'SGT' },
    { tsName: 'SSGT - Staff Sergeant (V)',         category: 'rank', spacers: [SPACER.RANK, SPACER.SGT], rankAbbr: 'SSGT' },
    { tsName: 'SAM - Sergeant at arms (V)',        category: 'rank', spacers: [SPACER.RANK, SPACER.SGT], rankAbbr: 'SAM' },
    { tsName: 'SSAM - Snr SGT at arms (V)',        category: 'rank', spacers: [SPACER.RANK, SPACER.SGT], rankAbbr: 'SSAM' },
    { tsName: 'T/SGM - Troop SGT Major (V)',       category: 'rank', spacers: [SPACER.RANK, SPACER.SGT], rankAbbr: 'T/SGM' },

    // ── Ranks — LT ───────────────────────────────────────────────────────────
    { tsName: 'OCDT - Officer Cadet',              category: 'rank', spacers: [SPACER.RANK, SPACER.LT], rankAbbr: 'OCDT' },
    { tsName: '2LT - 2nd Lieutenant',              category: 'rank', spacers: [SPACER.RANK, SPACER.LT], rankAbbr: '2LT' },
    { tsName: 'LT - Lieutenant',                   category: 'rank', spacers: [SPACER.RANK, SPACER.LT], rankAbbr: 'LT' },
    { tsName: 'LT(S) - Senior Lieutenant',         category: 'rank', spacers: [SPACER.RANK, SPACER.LT], rankAbbr: 'LT(S)' },
    { tsName: 'LT(C) - Commanding Lieutenant',     category: 'rank', spacers: [SPACER.RANK, SPACER.LT], rankAbbr: 'LT(C)' },
    // (V) variants
    { tsName: 'OCDT - Officer Cadet (V)',          category: 'rank', spacers: [SPACER.RANK, SPACER.LT], rankAbbr: 'OCDT' },
    { tsName: '2LT - 2nd Lieutenant (V)',          category: 'rank', spacers: [SPACER.RANK, SPACER.LT], rankAbbr: '2LT' },
    { tsName: 'LT - Lieutenant (V)',               category: 'rank', spacers: [SPACER.RANK, SPACER.LT], rankAbbr: 'LT' },
    { tsName: 'LT(S) - Senior Lieutenant (V)',     category: 'rank', spacers: [SPACER.RANK, SPACER.LT], rankAbbr: 'LT(S)' },
    { tsName: 'LT(C) - Commanding LT (V)',         category: 'rank', spacers: [SPACER.RANK, SPACER.LT], rankAbbr: 'LT(C)' },

    // ── Ranks — Hotel Crew ────────────────────────────────────────────────────
    { tsName: 'AC - Aircraftsman',                 category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_CREW], rankAbbr: 'AC' },
    { tsName: 'LAC - Leading Aircraftsman',        category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_CREW], rankAbbr: 'LAC' },
    { tsName: 'LM - Loadmaster',                   category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_CREW], rankAbbr: 'LM' },
    { tsName: 'SLM - Senior Loadmaster',           category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_CREW], rankAbbr: 'LM(S)' },
    { tsName: 'FSGT - Flight Sergeant',            category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_CREW], rankAbbr: 'FSGT' },

    // ── Ranks — Hotel Pilots ──────────────────────────────────────────────────
    { tsName: 'OCDT - Officer Cadet (AVV)',        category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_PILOTS], rankAbbr: 'OFFCDT' },
    { tsName: 'POF - Pilot Officer',               category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_PILOTS], rankAbbr: 'POF' },
    { tsName: 'FOF - Flying Officer',              category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_PILOTS], rankAbbr: 'FOF' },
    { tsName: 'FLT - Flight Lieutenant',           category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_PILOTS], rankAbbr: 'FLT' },
    { tsName: 'FLTS -Senior Flight Lieutenant',    category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_PILOTS], rankAbbr: 'FLT(S)' },

    // ── Ranks — Hotel Staff ───────────────────────────────────────────────────
    { tsName: 'FLL - Flight Leader',               category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_STAFF], rankAbbr: 'FLL' },
    { tsName: 'SQLD - Squadron Leader',            category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_STAFF], rankAbbr: 'SQLD' },
    { tsName: 'WGCP - Wing Captain',               category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_STAFF], rankAbbr: 'WGCP' },
    { tsName: 'WGCO - Wing Commander',             category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_STAFF], rankAbbr: 'WGCO' },
    // Note: TS uses 'GPCPT', ranks.ts uses abbr 'GPCAPT'
    { tsName: 'GPCPT - Group Captain',             category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_STAFF], rankAbbr: 'GPCAPT' },

    // ── Ranks — Hotel PHQ ─────────────────────────────────────────────────────
    { tsName: 'COM - Commodore',                   category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_PHQ], rankAbbr: 'COM' },
    { tsName: 'AVM - Air Vice Marshal',            category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_PHQ], rankAbbr: 'AVM' },
    { tsName: 'AM - Air Marshal',                  category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_PHQ], rankAbbr: 'AM' },
    { tsName: 'ACM - Air Chief Marshal',           category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_PHQ], rankAbbr: 'ACM' },
    { tsName: 'SACM - Snr Air Chief Marshal',      category: 'rank', spacers: [SPACER.RANK, SPACER.HOTEL_PHQ], rankAbbr: 'SACM' },

    // ── Ranks — WO (under ~~~ CHQ ~~~) ───────────────────────────────────────
    { tsName: 'WO2 - Warrant Officer Class 2',     category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.WO], rankAbbr: 'WO2' },
    { tsName: 'WO1 - Warrant Officer Class 1',     category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.WO], rankAbbr: 'WO1' },
    { tsName: 'CSM - Company Sergeant Major',      category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.WO], rankAbbr: 'CSM' },
    { tsName: 'RSM - Regimental Sgt Major',        category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.WO], rankAbbr: 'RSM' },
    { tsName: 'RSM-A - RGMT SGT MAJ-ASOT',         category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.WO], rankAbbr: 'RSM-A' },

    // ── Ranks — Officer/Command (under ~~~ CHQ ~~~) ───────────────────────────
    { tsName: 'SCAPT - Staff Captain',             category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.OFFICER], rankAbbr: 'SCAPT' },
    { tsName: 'CAPT - Captain',                    category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.OFFICER], rankAbbr: 'CAPT' },
    { tsName: 'MAJ - Major',                       category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.OFFICER], rankAbbr: 'MAJ' },
    { tsName: 'LTCOL - Lieutenant Colonel',        category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.OFFICER], rankAbbr: 'LTCOL' },
    { tsName: 'COL - Colonel',                     category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.OFFICER], rankAbbr: 'COL' },
    { tsName: 'BRIG - Brigadier',                  category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.OFFICER], rankAbbr: 'BRIG' },
    { tsName: 'MAJGEN - Major General',            category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.OFFICER], rankAbbr: 'MAJGEN' },
    { tsName: 'LTGEN - Lieutenant General',        category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.OFFICER], rankAbbr: 'LTGEN' },
    { tsName: 'GEN - General',                     category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.OFFICER], rankAbbr: 'GEN' },
    { tsName: 'Chief of ASOT',                     category: 'rank', spacers: [SPACER.RANK, SPACER.CHQ, SPACER.OFFICER], rankAbbr: 'CA' },

    // ── Unit ──────────────────────────────────────────────────────────────────
    { tsName: 'ASOT',                     category: 'unit', spacers: [SPACER.UNIT] },
    { tsName: 'Friend of Unit',           category: 'unit', spacers: [SPACER.UNIT] },
    { tsName: 'Verified Ghostbuster',     category: 'unit', spacers: [SPACER.UNIT] },
    { tsName: 'ACOM',                     category: 'unit', spacers: [SPACER.UNIT] },
    { tsName: 'ATOG',                     category: 'unit', spacers: [SPACER.UNIT] },
    { tsName: 'SOLA',                     category: 'unit', spacers: [SPACER.UNIT] },
    { tsName: 'AAF',                      category: 'unit', spacers: [SPACER.UNIT] },
    { tsName: 'APCA',                     category: 'unit', spacers: [SPACER.UNIT] },
    { tsName: 'AAS',                      category: 'unit', spacers: [SPACER.UNIT] },
    { tsName: 'PCG',                      category: 'unit', spacers: [SPACER.UNIT] },
    { tsName: '48th MI',                  category: 'unit', spacers: [SPACER.UNIT] },
    { tsName: 'T1M',                      category: 'unit', spacers: [SPACER.UNIT] },
    { tsName: 'OCR',                      category: 'unit', spacers: [SPACER.UNIT] },

    // ── Campaign Medals ───────────────────────────────────────────────────────
    { tsName: "- Operation Promulgate '20",        category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Promulgate '20" },
    { tsName: "- Operation Retribution '20",       category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Retribution '20" },
    { tsName: "- Operation Saviour '20",           category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Saviour '20" },
    { tsName: "- Operation Overlord '21",          category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Overlord '21" },
    { tsName: "- Operation Geneva '21",            category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Geneva '21" },
    { tsName: "- Operation Uprising '21",          category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Uprising '21" },
    { tsName: "- Operation Rushing Shield '21",    category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Rushing Shield '21" },
    { tsName: "- Operation August '21",            category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation August '21" },
    { tsName: '- Operation Armoured Spearhead',    category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: 'Operation Armoured Spearhead' },
    { tsName: "- Operation Desert Tiger '21",      category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Desert Tiger '21" },
    { tsName: "- Operation Desert Fire '21",       category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Desert Fire '21" },
    { tsName: "- Operation Marah '22",             category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Marah '22" },
    { tsName: "- Operation Lost Dawn '22",         category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Lost Dawn '22" },
    { tsName: "- Operation Gate Crash '22",        category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Gate Crash '22" },
    { tsName: "- Operation Special '22",           category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Special '22" },
    { tsName: "- Operation Dark Horse '22",        category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Dark Horse '22" },
    { tsName: "- Operation Salvation '22",         category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Salvation '22" },
    { tsName: "- Operation Long Reach '22",        category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Long Reach '22" },
    { tsName: "- Operation Afrene Freedom '22",    category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Afrene Freedom '22" },
    { tsName: "- Operation Sisu '22",              category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Sisu '22" },
    { tsName: "- Operation Extinction '23",        category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Extinction '23" },
    { tsName: "- Operation Ultimatum '23",         category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Ultimatum '23" },
    { tsName: "- Operation Basilisk '23",          category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Basilisk '23" },
    { tsName: "- Operation Freiheit '23",          category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Freiheit '23" },
    { tsName: "- Operation Atilla '23",            category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Atilla '23" },
    { tsName: "- Operation Pastor '23",            category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Pastor '23" },
    { tsName: "- Operation Lost State '23",        category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Lost State '23" },
    { tsName: "- Operation Helljumpers '23",       category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Helljumpers '23" },
    { tsName: "- Operation Anizay Freedom '23",    category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Anizay Freedom '23" },
    { tsName: "- Operation Windstom '24",          category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Windstom '24" },
    { tsName: "- Operation Invictus '24",          category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Invictus '24" },
    { tsName: "- Operation Radiant '24",           category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Radiant '24" },
    { tsName: '- Operation Mountain Guardian',     category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: 'Operation Mountain Guardian' },
    { tsName: "- Operation Kingfisher '24",        category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Kingfisher '24" },
    { tsName: "- Operation Thunder Run '24",       category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Thunder Run '24" },
    { tsName: "- Operation Havel '24",             category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Havel '24" },
    { tsName: "- Operation Pacific Tide '24",      category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Pacific Tide '24" },
    { tsName: "- Operation Grey Field '24",        category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Grey Field '24" },
    { tsName: "- Operation Blackout '25",          category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Blackout '25" },
    { tsName: "- Operation Aviano '25",            category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Aviano '25" },
    { tsName: "- Operation Hello World '25",       category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Hello World '25" },
    { tsName: "- Operation Most Wanted '25",       category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Most Wanted '25" },
    { tsName: "- Operation Atash '25",             category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Atash '25" },
    { tsName: "- Operation Pandoras Box '25",      category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Pandoras Box '25" },
    { tsName: "- Operation Eastern Wind '25",      category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Eastern Wind '25" },
    { tsName: "- Operation Southern Sabre '25",    category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Southern Sabre '25" },
    { tsName: "- Operation Kurylenko '25",         category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Kurylenko '25" },
    { tsName: "- Operation Trinity '26",           category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Trinity '26" },
    { tsName: "- Operation Katsu-Go '26",          category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Katsu-Go '26" },
    { tsName: "- Operation Northern Wall '26",     category: 'operation', spacers: [SPACER.CAMPAIGN], operationName: "Operation Northern Wall '26" },

    // ── Ignored groups ────────────────────────────────────────────────────────
    { tsName: 'New! Please Wait',           category: 'ignore', spacers: [] },
    { tsName: 'The Share Bear',             category: 'ignore', spacers: [] },
    { tsName: 'mobile account',             category: 'ignore', spacers: [] },
    { tsName: 'Please See Staff',           category: 'ignore', spacers: [] },
    { tsName: "Apex's Pace Stick",          category: 'ignore', spacers: [] },
    { tsName: 'Warning',                    category: 'ignore', spacers: [] },
    { tsName: 'Mute',                       category: 'ignore', spacers: [] },
    { tsName: 'Sticky',                     category: 'ignore', spacers: [] },
    { tsName: 'Temp Sticky',                category: 'ignore', spacers: [] },
    { tsName: 'No Perms Template',          category: 'ignore', spacers: [] },
    { tsName: 'Rank Teamplate',             category: 'ignore', spacers: [] },
]

// ── Lookup maps (built once at module load) ───────────────────────────────────

const _byTsName = new Map<string, TsGroupMapping>(
    TS_GROUP_MAPPINGS.map(m => [m.tsName, m])
)

const _byRankAbbr = new Map<string, TsGroupMapping>()
for (const m of TS_GROUP_MAPPINGS) {
    if (m.rankAbbr && !_byRankAbbr.has(m.rankAbbr)) {
        // First entry wins — the non-(V) variant is listed first
        _byRankAbbr.set(m.rankAbbr, m)
    }
}

const _byAwardLabel = new Map<string, TsGroupMapping>(
    TS_GROUP_MAPPINGS.filter(m => m.awardLabel).map(m => [m.awardLabel!, m])
)

const _byCertLabel = new Map<string, TsGroupMapping>(
    TS_GROUP_MAPPINGS.filter(m => m.certLabel).map(m => [m.certLabel!, m])
)

const _byOperationName = new Map<string, TsGroupMapping>(
    TS_GROUP_MAPPINGS.filter(m => m.operationName).map(m => [m.operationName!, m])
)

// ── Public API ────────────────────────────────────────────────────────────────

/** Look up mapping metadata for an exact TS group name. */
export function mappingForTsGroup(tsName: string): TsGroupMapping | undefined {
    return _byTsName.get(tsName)
}

/** Return spacer group names required alongside the given TS group. */
export function getSpacersForGroup(tsName: string): string[] {
    return _byTsName.get(tsName)?.spacers ?? []
}

/** Return the primary TS group name for a rank abbreviation (non-(V) variant). */
export function tsGroupNameForRank(abbr: string): string | undefined {
    return _byRankAbbr.get(abbr)?.tsName
}

/** Return the TS group name that corresponds to an award label. */
export function tsGroupNameForAward(label: string): string | undefined {
    return _byAwardLabel.get(label)?.tsName
}

/** Return the TS group name that corresponds to a certification label. */
export function tsGroupNameForCert(certLabel: string): string | undefined {
    return _byCertLabel.get(certLabel)?.tsName
}

/** Return the TS group name for an operation attendance medal. */
export function tsGroupNameForOperation(operationName: string): string | undefined {
    return _byOperationName.get(operationName)?.tsName
}
