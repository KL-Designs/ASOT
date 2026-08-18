/**
 * Reading qualifications out of the TeamSpeak server's group membership.
 *
 * TeamSpeak is where qualifications are actually recorded day to day: an
 * instructor grants the group when someone passes the course. The website's
 * copy has drifted, so the groups are the authority.
 *
 * Two things make the match harder than the ORBAT's. Only eleven members have
 * ever linked their TeamSpeak account, so almost everyone has to be matched by
 * nickname; and the client database keeps every account that ever connected,
 * including alts and long-dead duplicates, so a name can answer to several
 * client IDs.
 *
 * Pure: no database, no network, no clock (the caller passes `now`).
 */
import { parseMilpacDate } from './milpac-dates'

/**
 * TeamSpeak server group → the `label` it is stored as in
 * milpac.qualifications[].qualification.
 *
 * Only groups that name a course belong here. The server also carries rank
 * groups, award groups, department groups and section separators, and none of
 * those are qualifications — anything absent from this map is ignored, which
 * is what keeps the other ~300 groups out.
 */
export const TS_GROUP_TO_QUALIFICATION: Record<string, string> = {
    'BCT Stage 1':                    'BCT 1',
    'BCT Stage 2':                    'BCT 2',
    'Basic CQB Course':               'Basic CQB Course',
    'Basic Medical Course':           'Basic Medical Course',
    'Advanced Medical Course':        'Advanced Medical Course',
    'Basic Indirect Fire Course':     'Basic Indirect Fires Course',
    'Basic DFSW Course':              'Direct Fires Support Weapons Course',
    'Basic Rotary Wing Course':       'Basic Rotary Wing Course',
    'Basic Rotary Wing Assessment':   'Basic Rotary Wing Assessment (Wings)',
    'Advanced Rotary Course':         'Advanced Rotary Wing Course',
    'Basic CAS and RECON course':     'Basic CAS and RECON Course',
    'Advanced CAS Course':            'Advanced CAS Course',
    'RTO Course':                     'Radio Telecommunications Operator Course',
    'Forward Observer Course':        'Forward Observer Course',
    'Basic Staff Training Course':    'Basic Staff (NCO) Course',
    'NCO Assessor Course':            'NCO Assessor Course',
    'Static Line Paratrooper Course': 'Static Line Paratrooper Course',
    'Vehicle Checkpoint Course':      'VCP',
    'Rifleman Proficiency Course':    'Rifleman Proficiency',
    'MG Proficiency Course':          'Machine Gunner Proficiency',
    'AT Proficiency Course':          'AT Gunner Proficiency',
    'GLA Proficiency':                'Grenadier Proficiency',
    'Pistol Proficiency Course':      'Pistol Sharpshooter Proficiency',
    // The two armoured-crew groups. Confirmed by the unit: "(Driver Basic)" is
    // the basics course, "(Driver) Course" the formations and tactics one,
    // despite the latter having the larger membership.
    'Armed Veh Crew (Driver Basic)':  'Driver Basics Course',
    'Armed Veh Crew (Driver) Course': 'Driver Formations and Tactics Course',
}

/**
 * The award every member earns at six months, granted on the server as the
 * "PTE(P) Qualified" group. The group is not read: it is incomplete, and the
 * enlistment date says who has earned it far more reliably than whether an
 * instructor remembered to click.
 */
export const UNIT_PROFICIENCY = { name: 'Unit Proficiency', type: 'Service Citation' } as const

/** Months of service before UNIT_PROFICIENCY is earned. */
export const UNIT_PROFICIENCY_MONTHS = 6

/**
 * Strips the rank prefix from a TeamSpeak nickname.
 *
 * Deliberately looser than the ORBAT's rank check. The server's nicknames
 * carry abbreviations the catalog does not have — CLT, SLT, JCPL, JLCPL,
 * GPTCPT, BSGT — and for matching purposes such a token only has to be
 * removed, not understood. Anything that looks like an abbreviation (all-caps,
 * two to seven letters, optionally with a proficiency suffix) goes.
 */
export function stripTsRank(nickname: string): string {
    const value = nickname.replace(/\s+/g, ' ').trim()

    // "PTE(S)Titan" and "REC.Flanker" have no separator at all.
    const glued = /^([A-Z]{2,7}\([A-Z]{1,2}\))\s*(?=\S)/.exec(value)
    if (glued) return value.slice(glued[0].length).trim()

    const spaced = /^([A-Z][A-Z/]{1,6}(?:\([A-Z]{1,2}\))?)[.\s]+(\S.*)$/.exec(value)
    return spaced ? spaced[2].trim() : value
}

/**
 * Strips the decorations members hang off a nickname — department tags,
 * bracketed status, and the emoji and symbols that survive neither.
 */
export function stripDecorations(name: string): string {
    return name
        .replace(/\s*\[[^\]]*\]/g, '')
        .replace(/\s*\{[^}]*\}/g, '')
        .replace(/[^\p{L}\p{N}_. ]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

/** A TeamSpeak nickname reduced to the bare name to match a member on. */
export function tsMatchName(nickname: string): string {
    return stripDecorations(stripTsRank(nickname))
}

export type TsAccount = {
    cldbid: number
    nickname: string
    /** Unix seconds, 0 when the client has never connected. */
    lastConnected: number
    /** How many mapped qualification groups this account holds. */
    qualCount: number
}

/**
 * Which of several same-named TeamSpeak accounts is the member's real one.
 *
 * The rule the unit gave: the most recent account wins, unless it holds little
 * or nothing next to an older sibling — someone who made a fresh account last
 * month has not lost the fourteen courses their old one records.
 *
 * "Little or nothing next to" is read as holding fewer than half the older
 * account's qualifications. A newer account within half of its sibling is
 * treated as a genuine move and keeps the win; below that, the richer account
 * is assumed to be the real service record.
 */
export function chooseAccount(accounts: TsAccount[]): TsAccount {
    if (accounts.length === 1) return accounts[0]

    const newest = [...accounts].sort((a, b) => (b.lastConnected - a.lastConnected) || (b.cldbid - a.cldbid))[0]
    const richest = [...accounts].sort((a, b) => (b.qualCount - a.qualCount) || (b.lastConnected - a.lastConnected))[0]

    return newest.qualCount * 2 < richest.qualCount ? richest : newest
}

/**
 * Groups accounts by the name they match on, and picks one per name.
 *
 * Returns the winners keyed by match name, plus every account that lost, so
 * the run can report which alts it collapsed rather than discarding them
 * silently.
 */
export function collapseAlts(accounts: TsAccount[]): {
    chosen: Map<string, TsAccount>
    discarded: { name: string; kept: TsAccount; dropped: TsAccount[] }[]
} {
    const byName = new Map<string, TsAccount[]>()
    for (const account of accounts) {
        const key = tsMatchName(account.nickname).toLowerCase()
        if (!key) continue
        byName.set(key, (byName.get(key) ?? []).concat(account))
    }

    const chosen = new Map<string, TsAccount>()
    const discarded: { name: string; kept: TsAccount; dropped: TsAccount[] }[] = []
    for (const [key, list] of byName) {
        const kept = chooseAccount(list)
        chosen.set(key, kept)
        if (list.length > 1) discarded.push({ name: key, kept, dropped: list.filter(a => a !== kept) })
    }
    return { chosen, discarded }
}

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

/** A date in the "04 October 2025" form every stored milpac date uses. */
export function formatMilpacDate(date: Date): string {
    return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * When a member earned UNIT_PROFICIENCY, or null when they have not yet or
 * their enlistment date cannot be read.
 *
 * `now` is a parameter rather than a call to the clock so the boundary is
 * testable — a member enlisting exactly six months ago has earned it today.
 */
export function unitProficiencyDate(enlistedDate: string | null | undefined, now: Date): string | null {
    const enlisted = parseMilpacDate(enlistedDate)
    if (!enlisted) return null

    const due = new Date(enlisted)
    due.setMonth(due.getMonth() + UNIT_PROFICIENCY_MONTHS)

    // setMonth overflows a day that the target month does not have (31 August
    // + 6 months is 31 February, which becomes 3 March). Clamp to the last day
    // of the intended month instead, so the award lands in February.
    if (due.getMonth() !== (enlisted.getMonth() + UNIT_PROFICIENCY_MONTHS) % 12) due.setDate(0)

    return due > now ? null : formatMilpacDate(due)
}
