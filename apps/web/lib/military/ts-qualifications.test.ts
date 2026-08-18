import { describe, test, expect } from 'vitest'
import { CERTIFICATIONS } from './certifications'
import {
    TS_GROUP_TO_QUALIFICATION, UNIT_PROFICIENCY,
    stripTsRank, stripDecorations, tsMatchName,
    chooseAccount, collapseAlts, formatMilpacDate, unitProficiencyDate,
    type TsAccount,
} from './ts-qualifications'

describe('TS_GROUP_TO_QUALIFICATION', () => {
    // The map is only useful if every label it produces is a real
    // certification — a typo here would write a qualification the site cannot
    // score, cannot badge, and will not show.
    test('every mapped label exists in CERTIFICATIONS', () => {
        const known = new Set<string>(CERTIFICATIONS.map(c => c.label))
        const unknown = Object.values(TS_GROUP_TO_QUALIFICATION).filter(label => !known.has(label))
        expect(unknown).toEqual([])
    })

    test('no two groups map to the same qualification', () => {
        const labels = Object.values(TS_GROUP_TO_QUALIFICATION)
        expect(new Set(labels).size).toBe(labels.length)
    })

    // Confirmed by the unit, and counter-intuitive: the advanced course has
    // the larger membership, so the obvious reading by numbers is wrong.
    test('the two armoured-crew groups map the way the unit confirmed', () => {
        expect(TS_GROUP_TO_QUALIFICATION['Armed Veh Crew (Driver Basic)']).toBe('Driver Basics Course')
        expect(TS_GROUP_TO_QUALIFICATION['Armed Veh Crew (Driver) Course']).toBe('Driver Formations and Tactics Course')
    })

    test('the six-month award is not one of the qualification groups', () => {
        expect(Object.keys(TS_GROUP_TO_QUALIFICATION)).not.toContain('PTE(P) Qualified')
        expect(Object.values(TS_GROUP_TO_QUALIFICATION)).not.toContain(UNIT_PROFICIENCY.name)
    })
})

describe('stripTsRank', () => {
    test('removes a catalog rank', () => {
        expect(stripTsRank('PTE(S) Koda')).toBe('Koda')
        expect(stripTsRank('LTGEN Thomas')).toBe('Thomas')
    })

    // The server carries abbreviations the rank catalog does not have. They
    // still have to come off, which is why this is looser than the ORBAT's.
    test('removes an abbreviation the catalog does not have', () => {
        expect(stripTsRank('CLT Jazz')).toBe('Jazz')
        expect(stripTsRank('JCPL Nutpirom')).toBe('Nutpirom')
        expect(stripTsRank('GPTCPT Lobo')).toBe('Lobo')
        expect(stripTsRank('BSGT Keegen')).toBe('Keegen')
    })

    test('handles a rank glued to the name', () => {
        expect(stripTsRank('PTE(S)Titan')).toBe('Titan')
        expect(stripTsRank('LCPL(J)Nixcluster')).toBe('Nixcluster')
    })

    test('handles a dot separator and doubled spaces', () => {
        expect(stripTsRank('REC.Flanker')).toBe('Flanker')
        expect(stripTsRank('CPL(S)  pogo')).toBe('pogo')
        expect(stripTsRank('OCDT   Trey')).toBe('Trey')
    })

    test('keeps a multi-word name after the rank', () => {
        expect(stripTsRank('PTE(L) Killed IRL')).toBe('Killed IRL')
    })

    test('leaves a nickname with no rank alone', () => {
        expect(stripTsRank('Sparkledog')).toBe('Sparkledog')
        expect(stripTsRank('Miss Elvera')).toBe('Miss Elvera')
    })

    // "Mo" is a real member's whole nickname. Stripping it to nothing would
    // resolve to whoever happens to answer to the empty string.
    test('never strips the name away entirely', () => {
        expect(stripTsRank('PTE Mo')).toBe('Mo')
        expect(stripTsRank('REC')).toBe('REC')
        expect(stripTsRank('PTE ')).toBe('PTE')
    })
})

describe('stripDecorations', () => {
    test('removes department tags and bracketed status', () => {
        expect(stripDecorations('Brolof [J7]')).toBe('Brolof')
        expect(stripDecorations('Dab [J2] [J6]')).toBe('Dab')
    })

    test('removes symbols members decorate a nickname with', () => {
        expect(stripDecorations('Frankie[✞]')).toBe('Frankie')
        expect(stripDecorations('Koda ✦')).toBe('Koda')
    })

    test('keeps the dots and digits that are part of a name', () => {
        expect(stripDecorations('tally.enfield')).toBe('tally.enfield')
        expect(stripDecorations('Sharmo123')).toBe('Sharmo123')
    })
})

describe('tsMatchName', () => {
    test('reduces a decorated, ranked nickname to the bare name', () => {
        expect(tsMatchName('PTE(SL) Brolof [J7]')).toBe('Brolof')
        expect(tsMatchName('PTE(L)  Frankie[✞]')).toBe('Frankie')
    })
})

const account = (over: Partial<TsAccount>): TsAccount =>
    ({ cldbid: 1, nickname: 'PTE Someone', lastConnected: 1_700_000_000, qualCount: 0, ...over })

describe('chooseAccount', () => {
    test('a lone account wins by default', () => {
        const only = account({ cldbid: 7 })
        expect(chooseAccount([only])).toBe(only)
    })

    test('the most recent account wins when both are comparably equipped', () => {
        const older = account({ cldbid: 1, lastConnected: 1_600_000_000, qualCount: 8 })
        const newer = account({ cldbid: 2, lastConnected: 1_700_000_000, qualCount: 6 })
        expect(chooseAccount([older, newer])).toBe(newer)
    })

    // The case the rule exists for: a fresh account made last month does not
    // erase the fourteen courses the old one records.
    test('an older, far richer account beats a bare new one', () => {
        const older = account({ cldbid: 1, lastConnected: 1_600_000_000, qualCount: 14 })
        const newer = account({ cldbid: 2, lastConnected: 1_700_000_000, qualCount: 1 })
        expect(chooseAccount([older, newer])).toBe(older)
    })

    test('exactly half the sibling still counts as a genuine move', () => {
        const older = account({ cldbid: 1, lastConnected: 1_600_000_000, qualCount: 10 })
        const newer = account({ cldbid: 2, lastConnected: 1_700_000_000, qualCount: 5 })
        expect(chooseAccount([older, newer])).toBe(newer)
    })

    test('below half, the richer account takes it', () => {
        const older = account({ cldbid: 1, lastConnected: 1_600_000_000, qualCount: 10 })
        const newer = account({ cldbid: 2, lastConnected: 1_700_000_000, qualCount: 4 })
        expect(chooseAccount([older, newer])).toBe(older)
    })

    test('two empty accounts fall back to the most recent', () => {
        const older = account({ cldbid: 1, lastConnected: 1_600_000_000, qualCount: 0 })
        const newer = account({ cldbid: 2, lastConnected: 1_700_000_000, qualCount: 0 })
        expect(chooseAccount([older, newer])).toBe(newer)
    })

    // Never-connected accounts both report 0, and a tie on the clock must not
    // resolve by array order — that would make the result depend on the order
    // TeamSpeak happened to page the client list back in.
    test('a tie on last-connected is broken by client id, not input order', () => {
        const a = account({ cldbid: 5, lastConnected: 0, qualCount: 0 })
        const b = account({ cldbid: 9, lastConnected: 0, qualCount: 0 })
        expect(chooseAccount([a, b])).toBe(b)
        expect(chooseAccount([b, a])).toBe(b)
    })
})

describe('collapseAlts', () => {
    test('groups by match name, ignoring rank and decoration differences', () => {
        const { chosen, discarded } = collapseAlts([
            account({ cldbid: 1, nickname: 'PTE Formula',       lastConnected: 1_600_000_000, qualCount: 11 }),
            account({ cldbid: 2, nickname: 'LCPL(J) Formula',   lastConnected: 1_700_000_000, qualCount: 9  }),
            account({ cldbid: 3, nickname: 'REC Frosty',        lastConnected: 1_650_000_000, qualCount: 2  }),
        ])
        expect(chosen.get('formula')!.cldbid).toBe(2)
        expect(chosen.get('frosty')!.cldbid).toBe(3)
        expect(discarded).toEqual([{
            name: 'formula',
            kept: expect.objectContaining({ cldbid: 2 }),
            dropped: [expect.objectContaining({ cldbid: 1 })],
        }])
    })

    test('a single account is not reported as a collapsed alt', () => {
        const { discarded } = collapseAlts([account({ cldbid: 1, nickname: 'REC Frosty' })])
        expect(discarded).toEqual([])
    })

    test('an account whose nickname reduces to nothing is dropped', () => {
        const { chosen } = collapseAlts([account({ cldbid: 1, nickname: '✦✦✦' })])
        expect(chosen.size).toBe(0)
    })
})

describe('formatMilpacDate', () => {
    test('matches the stored form, zero-padded', () => {
        expect(formatMilpacDate(new Date(2025, 9, 4))).toBe('04 October 2025')
        expect(formatMilpacDate(new Date(2020, 7, 15))).toBe('15 August 2020')
    })
})

describe('unitProficiencyDate', () => {
    const now = new Date(2026, 7, 18)   // 18 August 2026

    test('six months after a day-first enlistment date', () => {
        expect(unitProficiencyDate('25/01/2025', now)).toBe('25 July 2025')
    })

    test('reads the long form too', () => {
        expect(unitProficiencyDate('15 August 2020', now)).toBe('15 February 2021')
    })

    test('a member who has not served six months has not earned it', () => {
        expect(unitProficiencyDate('01/06/2026', now)).toBeNull()
    })

    // Earned exactly today counts. The alternative silently defers everyone
    // whose anniversary is the day the import runs.
    test('the day it falls due counts as earned', () => {
        expect(unitProficiencyDate('18/02/2026', now)).toBe('18 August 2026')
    })

    // 31 August + 6 months is 31 February, which Date rolls forward into March.
    // The award belongs in February.
    test('clamps to the last day when the target month is shorter', () => {
        expect(unitProficiencyDate('31/08/2024', now)).toBe('28 February 2025')
        expect(unitProficiencyDate('31/08/2023', now)).toBe('29 February 2024')
    })

    test('an unreadable or missing enlistment date yields nothing', () => {
        expect(unitProficiencyDate('', now)).toBeNull()
        expect(unitProficiencyDate(undefined, now)).toBeNull()
        expect(unitProficiencyDate('sometime', now)).toBeNull()
        expect(unitProficiencyDate('31/02/2024', now)).toBeNull()
    })
})
