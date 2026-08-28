import type { Badge, Citation, TrainingBadge } from './types'

// Keys below are user-facing labels from apps/web (lib/awards.ts AWARDS,
// lib/certifications.ts CERTIFICATIONS, and the orbat_section_meta collection).
// They live here rather than in web because apps/milpac draws what they resolve
// to — a label renamed on one side without the other is a missing ribbon.

// ── Award name → Citation ribbon code ────────────────────────────────────────
// Keys are the `label` values from lib/awards.ts AWARDS
export const AWARD_TO_CITATION: Record<string, Citation> = {
    '1 Year Service Citation':                              '1year',
    '2 Year Service Citation':                              '2year',
    '3 Year Service Citation':                              '3year',
    '4 Year+ Service Citation':                             '4year',
    'ASOT Beyond Award':                                    'beyond',
    'Broken Lance Award':                                   'brokenlance',
    'Diplomat Award':                                       'diplomat',
    'Instructor Award':                                     'instructor',
    'Public Relations Award':                               'publicrelation',
    'Group Development Award':                              'groupdevelopment',
    'Architect Award':                                      'architect',
    'Watchman Award':                                       'watchman',
    'Atlas Award':                                          'atlas',
    'Founding Member':                                      'founders',
    'Gallantry Award':                                      'gallantry',
    'Star of Courage':                                      'starofcourage',
    'ASOT Cross of Valour':                                 'crossofvalour',
    'Protagonist Award':                                    'protagonist',
    'Junior Leadership Award':                              'juniorleadership',
    'Senior Leadership Award':                              'seniorleadership',
    'Rotary Aviation Medal':                                'aviation',
    'Medical Medallion':                                    'medical',
    'Campaign Medallion':                                   'campaign',
    'Campaign Medallion, First Clasp':                      'campaign1',
    'Campaign Medallion, Second Clasp':                     'campaign2',
    'Campaign Medallion, Third Clasp':                      'campaign3',
    'Campaign Medallion, Fourth Clasp':                     'campaign4',
    'Campaign Medallion, Fifth Clasp':                      'campaign5',
    'Campaign Medallion, Sixth Clasp':                      'campaign6',
    'Campaign Medallion, Seventh Clasp':                    'campaign7',
    'Campaign Medallion, Eighth Clasp':                     'campaign8',
    'Campaign Medallion, Ninth Clasp':                      'campaign9',
    'Campaign Medallion, Tenth Clasp':                      'campaign10',
    'Campaign Medallion, Eleventh Clasp':                   'campaign11',
    'Campaign Medallion, Twelfth Clasp':                    'campaign12',
    'Campaign Medallion, Thirteenth Clasp':                 'campaign13',
    'Campaign Medallion, Fourteenth Clasp':                 'campaign14',
    'Campaign Medallion, Fifteenth Clasp':                  'campaign15',
    'Campaign Medallion, Sixteenth Clasp':                  'campaign16',
}

// Medallion positioning is derived dynamically in data-mapper.ts deriveMedallions().
// Files on disk: Bronze1/2/3, Silver1/2/3, Gold1/2/3 (suffix = chest slot position).

// ── Qualification label → Training badge code ─────────────────────────────────
// Keys are the `label` values from lib/certifications.ts CERTIFICATIONS
export const QUAL_TO_BADGE: Record<string, TrainingBadge> = {
    'Basic CQB Course':                         'BCQB',
    'Basic Medical Course':                     'BM',
    'Advanced Medical Course':                  'AdvM',
    'Basic Indirect Fires Course':              'BIDF',
    // 'Direct Fires Support Weapons Course':      'BCIDF',
    'Basic Rotary Wing Assessment (Wings)':     'BR',
    'Advanced Rotary Wing Course':              'AdvR',
    'Basic CAS and RECON Course':               'BF',
    'Advanced CAS Course':                      'AF',
    'Forward Observer Course':                  'FO',
    'Basic Staff (NCO) Course':                 'NCO',
    'Static Line Paratrooper Course':           'PT',
    'Driver Basics Course':                     'Driver',
    'Rifleman Proficiency':                     'BRifle',
    'Machine Gunner Proficiency':               'BMG',
    'AT Gunner Proficiency':                    'BAT',
    'Pistol Sharpshooter Proficiency':          'BPistol',
    'Grenadier Proficiency':                    'BGLA',
}

// ── ORBAT section title → Corps badge ────────────────────────────────────────
// Keys are exact sectionTitle values from orbat_section_meta collection
export const SECTION_TO_BADGE: Record<string, Badge> = {
    'India Company HQ':                             'Command',
    '1-3 ECHO - COMBAT ENGINEERS':                  'Echo',
    '1-3 GOLF - HEAVY WEAPONS SECTION':             'Golf',
    '1-3 HOTEL - ROTARY WING':                      'Hotel',
    '1-3 MIKE - MEDICAL EMERGENCY RESPONSE TEAM':   'Mike',
    '1-3 MIKE - MEDICAL TEAM':                      'Mike',
    '1-3 VICTOR - CAVALRY / ARMOUR':                'Victor',
    'Gamemasters':                                  'GM',
}

export const DEFAULT_BADGE: Badge = 'Infantry'

// Uniform colour is determined by ORBAT section in data-mapper.ts:
// only '1-3 HOTEL - ROTARY WING' → Blue; all other sections → Brown.

// ── Citation code → certificate code ─────────────────────────────────────────
// The certificate templates use a *different* namespace from the ribbons for
// five awards. The original derived a certificate code by lowercasing the award
// label and stripping spaces, which yields the citation spelling — so those five
// never matched a slide, `SlideNumbers[cert]` came back undefined, and the page
// index became NaN. Certificates for them cannot ever have worked.
// See apps/milpac/PLAN.md §11.
const CERTIFICATE_CODE_OVERRIDES: Record<string, string> = {
    '4year':         'longterm',
    'crossofvalour': 'valour',
    'founders':      'founder',
    'aviation':      'rotary',
    'starofcourage': 'courage',
}

/**
 * Resolves the certificate code for a citation. Identity for all but the five
 * above, which is why this is a lookup with a fallback rather than a full table
 * that would have to be kept in step with every new award.
 */
export function certificateCodeForCitation(citation: string): string {
    return CERTIFICATE_CODE_OVERRIDES[citation] ?? citation
}

/** Medallion awards have their own certificates, keyed off the award name. */
export const MEDALLION_CERTIFICATE_CODES: Record<string, string> = {
    'Bronze Soldiers Medallion': 'bronzemedallion',
    'Silver Soldiers Medallion': 'silvermedallion',
    'Gold Soldiers Medallion':   'goldmedallion',
}
