import { beforeAll, afterAll, describe, test, expect } from 'vitest'
import { parseHistoryCsv, resolveIssuer } from './history-import'

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
