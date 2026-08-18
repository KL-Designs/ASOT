import { beforeAll, afterAll, describe, test, expect } from 'vitest'
import { parseHistoryCsv, resolveIssuer, buildHistory, type HistoryRow } from './history-import'

const HEADER = 'Member Name,Record Type,Date,Award,Award Type,Rank,Role,Source File'

describe('parseHistoryCsv', () => {
    test('reads a promotion row', () => {
        const rows = parseHistoryCsv(`${HEADER}\nAbdul,Promotion/Role,16 January 2026,,,Private,Reservist,Abdul.png`)
        expect(rows).toEqual([{
            member: 'Abdul', type: 'promotion', date: '16 January 2026',
            award: '', rank: 'Private', role: 'Reservist', line: 2,
        }])
    })

    test('reads an award row', () => {
        const rows = parseHistoryCsv(`${HEADER}\nAgentDove,Award,05 April 2025,Broken Lance Award,Non-Operational Award,,,AgentDove1.png`)
        expect(rows[0]).toMatchObject({ member: 'AgentDove', type: 'award', award: 'Broken Lance Award', date: '05 April 2025' })
    })

    // Every "Campaign Medallion, Nth Clasp" row in the file is quoted because
    // the label contains a comma. Splitting on commas naively shifts every
    // later column by one.
    test('handles a quoted field containing a comma', () => {
        const rows = parseHistoryCsv(`${HEADER}\nAgentDove,Award,14 November 2021,"Campaign Medallion, First Clasp",Operational Service Citation,,,AgentDove1.png`)
        expect(rows[0].award).toBe('Campaign Medallion, First Clasp')
        expect(rows[0].member).toBe('AgentDove')
    })

    test('strips the UTF-8 BOM the file starts with', () => {
        const rows = parseHistoryCsv(`﻿${HEADER}\nAbdul,Promotion/Role,16 January 2026,,,Private,Reservist,Abdul.png`)
        expect(rows[0].member).toBe('Abdul')
    })

    test('handles CRLF line endings and ignores blank trailing lines', () => {
        const rows = parseHistoryCsv(`${HEADER}\r\nAbdul,Promotion/Role,16 January 2026,,,Private,Reservist,Abdul.png\r\n\r\n`)
        expect(rows).toHaveLength(1)
    })

    test('records the 1-based file line so a skip can be traced back', () => {
        const rows = parseHistoryCsv([
            HEADER,
            'Abdul,Promotion/Role,16 January 2026,,,Private,Reservist,Abdul.png',
            'Abuza,Promotion/Role,04 February 2026,,,Recruit,Reservist,Abuza.png',
        ].join('\n'))
        expect(rows.map(r => r.line)).toEqual([2, 3])
    })

    test('drops rows with no member name rather than importing a blank member', () => {
        const rows = parseHistoryCsv(`${HEADER}\n,Promotion/Role,16 January 2026,,,Private,Reservist,x.png`)
        expect(rows).toEqual([])
    })
})

describe('resolveIssuer', () => {
    test('a 2022 record is signed by Thomas as a Major', () => {
        expect(resolveIssuer('14 June 2022')).toEqual({
            issuedById: '224086573560365057', issuedByName: 'Thomas', issuedByRank: 'Major',
        })
    })

    // The supplied mapping starts 11/01/2021 but 23 records predate it, the
    // earliest 2020-08-14. They fold into Thomas's window rather than
    // importing with no officer at all.
    test('a record predating the mapping still resolves to Thomas', () => {
        expect(resolveIssuer('14 August 2020')?.issuedByName).toBe('Thomas')
    })

    // Windows are half-open, so the shared boundary dates in the source
    // mapping belong to the later officer.
    test('a boundary date belongs to the later officer', () => {
        expect(resolveIssuer('01 January 2023')?.issuedByName).toBe('Trew')
        expect(resolveIssuer('31 December 2022')?.issuedByName).toBe('Thomas')
        expect(resolveIssuer('02 September 2023')?.issuedByName).toBe('Jazz')
        expect(resolveIssuer('01 January 2025')?.issuedByName).toBe('Six')
    })

    test('Six is a Brigadier in 2025 and a Major General in 2026', () => {
        expect(resolveIssuer('07 June 2025')?.issuedByRank).toBe('Brigadier')
        expect(resolveIssuer('01 January 2026')?.issuedByRank).toBe('Major General')
    })

    test('returns null for an unparseable date', () => {
        expect(resolveIssuer('')).toBeNull()
        expect(resolveIssuer('sometime')).toBeNull()
    })

    // One award in the source file is dated "November 2021" — month and year,
    // with no day. Rejecting it would silently drop a real award.
    test('accepts a month-and-year date, treating it as the first of the month', () => {
        expect(resolveIssuer('November 2021')?.issuedByName).toBe('Thomas')
    })

    // The bug this guards: Date.parse('01 January 2023') is local midnight while
    // Date.parse('2023-01-01') is UTC midnight, so east of Greenwich the boundary
    // date fell into the previous officer's window. Pinning the zone is what makes
    // these assertions fail if resolveIssuer ever goes back to Date.parse — on a
    // UTC runner the bug simply does not reproduce, and the test would pass either way.
    describe('resolveIssuer at a window boundary, in a timezone east of UTC', () => {
        const realTz = process.env.TZ
        beforeAll(() => { process.env.TZ = 'Australia/Sydney' })
        // Assigning undefined would set the literal string "undefined", which Node
        // resolves to GMT — the one zone where the bug above stops reproducing.
        afterAll(() => {
            if (realTz === undefined) delete process.env.TZ
            else process.env.TZ = realTz
        })

        test('a boundary date still belongs to the later officer', () => {
            expect(resolveIssuer('01 January 2023')?.issuedByName).toBe('Trew')
            expect(resolveIssuer('02 September 2023')?.issuedByName).toBe('Jazz')
            expect(resolveIssuer('01 January 2025')?.issuedByRank).toBe('Brigadier')
            expect(resolveIssuer('01 January 2026')?.issuedByRank).toBe('Major General')
        })
    })

    test('rejects a date that is neither format', () => {
        expect(resolveIssuer('sometime in 2019')).toBeNull()
        expect(resolveIssuer('2021')).toBeNull()
    })
})

// Guards the restore above: a leaked TZ would silently re-zone every test file
// that runs after this one.
test('the pinned timezone does not leak out of this file', () => {
    expect(process.env.TZ).not.toBe('Australia/Sydney')
    expect(process.env.TZ).not.toBe('undefined')
})

const row = (over: Partial<HistoryRow>): HistoryRow => ({
    member: 'Test', type: 'promotion', date: '14 June 2022',
    award: '', rank: 'Private', role: 'Rifleman', line: 2, ...over,
})

describe('buildHistory', () => {
    test('builds a promotion with its issuer attached', () => {
        const { byMember } = buildHistory([row({})])
        expect(byMember.get('Test')!.promotions).toEqual([{
            date: '14 June 2022', rank: 'Private', role: 'Rifleman',
            issuedById: '224086573560365057', issuedByName: 'Thomas', issuedByRank: 'Major',
        }])
    })

    test('builds an award with the type from AWARDS, not from the row', () => {
        const { byMember } = buildHistory([row({ type: 'award', award: 'Campaign Medallion' })])
        expect(byMember.get('Test')!.awards[0]).toMatchObject({
            name: 'Campaign Medallion', type: 'Operational Service Citation',
        })
    })

    test('stores the date byte-identical to the source cell', () => {
        const { byMember } = buildHistory([row({ date: '04 February 2026' })])
        expect(byMember.get('Test')!.promotions[0].date).toBe('04 February 2026')
    })

    test('applies vocabulary aliases', () => {
        const { byMember, corrections } = buildHistory([
            row({ rank: 'Warrant Officer Class One', role: 'Machine Gunner' }),
            row({ type: 'award', award: 'Long Term Service Citation', line: 3 }),
        ])
        expect(byMember.get('Test')!.promotions[0]).toMatchObject({
            rank: 'Warrant Officer 1', role: 'Machinegunner',
        })
        expect(byMember.get('Test')!.awards[0].name).toBe('4 Year+ Service Citation')
        expect(corrections).toEqual({ rank: 1, award: 1, role: 1 })
    })

    // The source groups each member's rows by record type and then
    // alphabetically by award name, so it arrives badly out of order.
    test('sorts records ascending by date', () => {
        const { byMember } = buildHistory([
            row({ date: '04 October 2025', line: 2 }),
            row({ date: '07 June 2025', line: 3 }),
            row({ date: '06 December 2025', line: 4 }),
        ])
        expect(byMember.get('Test')!.promotions.map(p => p.date))
            .toEqual(['07 June 2025', '04 October 2025', '06 December 2025'])
    })

    test('breaks a date tie by file order', () => {
        const { byMember } = buildHistory([
            row({ date: '15 August 2020', role: 'first', line: 2 }),
            row({ date: '15 August 2020', role: 'second', line: 3 }),
        ])
        expect(byMember.get('Test')!.promotions.map(p => p.role)).toEqual(['first', 'second'])
    })

    test('skips a row with no date and says why', () => {
        const { byMember, skipped } = buildHistory([row({ date: '', line: 9 })])
        expect(byMember.has('Test')).toBe(false)
        expect(skipped).toEqual([{ line: 9, member: 'Test', reason: 'no date' }])
    })

    test('skips a row whose rank is not a rank and says why', () => {
        const { skipped } = buildHistory([row({ rank: 'Stone', line: 5 })])
        expect(skipped).toEqual([{ line: 5, member: 'Test', reason: 'unknown rank "Stone"' }])
    })

    test('skips a row whose award is unknown and says why', () => {
        const { skipped } = buildHistory([row({ type: 'award', award: 'Order of the Phoenix', line: 7 })])
        expect(skipped).toEqual([{ line: 7, member: 'Test', reason: 'unknown award "Order of the Phoenix"' }])
    })

    test('a skipped row contributes no partial record', () => {
        const { byMember, skipped } = buildHistory([
            row({ rank: 'Stone', line: 2 }),
            row({ rank: 'Private', line: 3 }),
        ])
        expect(byMember.get('Test')!.promotions).toHaveLength(1)
        expect(skipped).toHaveLength(1)
    })

    // written + skipped === rows in. The runner asserts this before writing;
    // this test is what makes the property true rather than hoped for.
    test('every row is either built or skipped', () => {
        const rows = [
            row({ line: 2 }),
            row({ type: 'award', award: 'Campaign Medallion', line: 3 }),
            row({ date: '', line: 4 }),
            row({ rank: 'Stone', line: 5 }),
            row({ member: 'Other', line: 6 }),
        ]
        const { byMember, skipped } = buildHistory(rows)
        const built = [...byMember.values()].reduce((n, m) => n + m.promotions.length + m.awards.length, 0)
        expect(built + skipped.length).toBe(rows.length)
    })

    test('keeps members separate', () => {
        const { byMember } = buildHistory([row({ member: 'Abdul' }), row({ member: 'Abuza', line: 3 })])
        expect([...byMember.keys()]).toEqual(['Abdul', 'Abuza'])
    })

    // Regression: Date.parse('') is NaN, and NaN made every comparison falsy,
    // so the comparator fell through to file order for that pair alone — which
    // is non-transitive, and V8 then scrambles rows belonging to members that
    // have no bad row at all. Exactly this happened on the real file: its one
    // undated row (Talon's) misordered Thomas's awards.
    //
    // The row order below is the shape that reproduces it: the undated row must
    // sit BETWEEN a later date and an earlier one. Move it to the end and the
    // bug hides, which is why an earlier version of this test passed against
    // the broken sort.
    test('an undated row does not disturb the order of another member', () => {
        const { byMember, skipped } = buildHistory([
            row({ member: 'A', date: '03 January 2022', role: 'later',   line: 2 }),
            row({ member: 'B', date: '',                                 line: 3 }),
            row({ member: 'A', date: '01 January 2022', role: 'earlier', line: 4 }),
        ])
        expect(byMember.get('A')!.promotions.map(p => p.role)).toEqual(['earlier', 'later'])
        expect(skipped.map(s => s.line)).toEqual([3])
    })
})
