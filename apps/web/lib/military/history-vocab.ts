/**
 * The CSV's vocabulary, mapped onto the codebase's.
 *
 * `ASOT_Member_History_Master_Batch_12.csv` was extracted from the unit's
 * pre-website systems and spells 16 ranks, 22 awards and 20 roles differently
 * from `RANK_GROUPS`, `AWARDS` and the live ORBAT. Some are typos, some are
 * older names, and one whole family uses a different numbering scheme.
 *
 * This module exists in lib/ rather than beside the importer script for one
 * reason: the tables must be *checked against* the canonical lists, and a
 * .mjs migration script cannot import them. See history-vocab.test.ts — the
 * guard tests there are the point of the file.
 */
import { RANKS_FLAT } from '@asot/lib'
import { AWARDS } from './awards'

/** CSV rank spelling → the name in RANK_GROUPS. */
export const RANK_ALIASES: Record<string, string> = {
    'Air Commodore':                     'Commodore',
    'Aircraftman':                       'Aircraftsman',
    'Game Master Senior':                'Senior Game Master',
    'Lance Bombadier':                   'Lance Bombardier',
    'Leading Senior Private':            'Senior Leading Private',
    'Regimental Sergeant Major of ASOT': 'RSM of ASOT',
    'Second Lieutenant':                 '2nd Lieutenant',
    'Senior Bombadier':                  'Senior Bombardier',
    'Senior Lance Bombadier':            'Senior Lance Bombardier',
    'Senior Sergeant At Arms':           'Senior Sergeant-at-Arms',
    'Sergeant At Arms':                  'Sergeant-at-Arms',
    'Signallar':                         'Signaller',
    'Trooper Senior':                    'Senior Trooper',
    'Warrant Officer Class One':         'Warrant Officer 1',
    'Warrant Officer Class Two':         'Warrant Officer 2',
}

/**
 * CSV award spelling → the label in AWARDS.
 *
 * Two of these look like guesses and are not. The Tier 2 family is restating
 * what awards.ts already asserts in its own `csvHeader` column — the
 * Second/Third/Fourth rows only fail to resolve automatically because those
 * csvHeader values contain the typo "Campagin". And Long Term Service Citation
 * is corroborated by lib/maps.ts, which maps the `4year` citation to the
 * certificate code `longterm`.
 */
export const AWARD_ALIASES: Record<string, string> = {
    '1 Year Citation':                          '1 Year Service Citation',
    '1 Year of Service Citation':               '1 Year Service Citation',
    '1 Year service Citation':                  '1 Year Service Citation',
    'One Year Service Citation':                '1 Year Service Citation',
    'Year Service Citation':                    '1 Year Service Citation',
    '4 Year Service Citation':                  '4 Year+ Service Citation',
    'Long Term Service Citation':               '4 Year+ Service Citation',
    'Beyond Award':                             'ASOT Beyond Award',
    'Bronze Soldier Medallion':                 'Bronze Soldiers Medallion',
    'Bronze Soldier Medallion Certtificate':    'Bronze Soldiers Medallion',
    'Founding Member Award':                    'Founding Member',
    'Group Development':                        'Group Development Award',
    'Junior Leadership':                        'Junior Leadership Award',
    'Campaign Medallion First Clasp':           'Campaign Medallion, First Clasp',
    'Campaign Medallion Tier 2, First Clasp':   'Campaign Medallion, Fifth Clasp',
    'Campaign Medallion, Tier 2 First Clasp':   'Campaign Medallion, Fifth Clasp',
    'Campaign Medallion Tier 2, Second Clasp':  'Campaign Medallion, Sixth Clasp',
    'Campaign Medallion, Tier 2 Second Clasp':  'Campaign Medallion, Sixth Clasp',
    'Campaign Medallion Tier 2, Third Clasp':   'Campaign Medallion, Seventh Clasp',
    'Campaign Medallion, Tier 2 Third Clasp':   'Campaign Medallion, Seventh Clasp',
    'Campaign Medallion Tier 2, Fourth Clasp':  'Campaign Medallion, Eighth Clasp',
    'Campaign Medallion, Tier 2 Fourth Clasp':  'Campaign Medallion, Eighth Clasp',
}

/**
 * CSV role → the name the live ORBAT uses for the same job.
 *
 * Only roles that still exist appear here. A billet the unit no longer has —
 * `Battery Commander`, `Wing Leader`, `Gunnery Sergeant` and the rest — is
 * stored exactly as written, because a service record states what the member
 * actually held.
 */
export const ROLE_ALIASES: Record<string, string> = {
    'Machine Gunner':               'Machinegunner',
    'Section Medic':                'Rifleman (CFA)',
    'Sapper Medic':                 'Sapper (CFA)',
    'Rifleman/Driver':              'Rifleman',
    'Driver/Rifleman':              'Rifleman',
    'Driver / Rifleman':            'Rifleman',
    'Driver/ Rifleman':             'Rifleman',
    'Game Master':                  'Zeus',
    'Game Master Lead':             'Zeus - Team Leader',
    'Game Master 2iC':              'Zeus - Team Leader',
    'Aircrewman':                   'Crewman',
    'Engineer':                     'Sapper',
    'Squadron Commanding Officer':  'Squadron CO',
    'Squadron Executive Officer':   'Squadron XO',
    'Section Leader':               'Section Commander',
    'Company Officer Commanding':   'Officer Commanding',
    'Platoon Signallar':            'Platoon Signaller',
    'FireTeam Leader':              'Fireteam Leader',
    'Adjudant':                     'Adjutant',
    'Engineering Sergeant':         'Engineer Sergeant',
}

const RANK_NAMES = new Set(RANKS_FLAT.map(r => r.name))
const AWARD_BY_LABEL = new Map(AWARDS.map(a => [a.label as string, a]))

/** Canonical rank name, or null when the cell holds something that is not a rank. */
export function resolveRank(raw: string): string | null {
    const value = raw.trim()
    if (!value) return null
    const canonical = RANK_ALIASES[value] ?? value
    return RANK_NAMES.has(canonical) ? canonical : null
}

/**
 * Canonical award label and its type, or null when unknown.
 *
 * The type always comes from AWARDS. The CSV's own `Award Type` column carries
 * 15 spellings for what should be 5 types, and `awards[].type` drives ribbon
 * rendering — trusting it would put the wrong ribbon on a uniform.
 */
export function resolveAward(raw: string): { name: string; type: string } | null {
    const value = raw.trim()
    if (!value) return null
    const entry = AWARD_BY_LABEL.get(AWARD_ALIASES[value] ?? value)
    return entry ? { name: entry.label, type: entry.type } : null
}

/** The role to store. Unknown roles pass through — see ROLE_ALIASES. */
export function resolveRole(raw: string): string {
    const value = raw.trim()
    return ROLE_ALIASES[value] ?? value
}
