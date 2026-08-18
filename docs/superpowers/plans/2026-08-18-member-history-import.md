# Member History Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-off importer that replaces all 187 covered members' `milpac.promotions` and `milpac.awards` with the accurate record from `ASOT_Member_History_Master_Batch_12.csv`, deriving the issuing officer from each record's date.

**Architecture:** Three pure TypeScript modules under `apps/web/lib/military/` (vocabulary tables, CSV parse + issuer + record building, member matching) hold every decision and are unit-tested by the existing vitest suite. A thin runner at `apps/web/scripts/import-member-history.ts` connects to Mongo, prints a report, and writes only under `--apply`. The logic lives in `lib` rather than `scripts/*.mjs` because the alias tables must be *validated against* `AWARDS` and `RANK_GROUPS`, which a `.mjs` file cannot import.

**Tech Stack:** TypeScript, vitest (existing `npm run test:unit`), `mongodb` driver, `tsx` (new devDependency — the repo has no TypeScript script runner).

**Spec:** `docs/superpowers/specs/2026-08-18-member-history-import-design.md`

## Global Constraints

- **Dry run is the default.** The importer reports and exits. Writing requires `--apply`.
- **Dates are stored verbatim after trimming.** The CSV's `16 January 2026` is already the stored format. No parsing, no reformatting, no `Date` round-trip. Dates are parsed *only* to select an issuer.
- **Award `type` comes from the matched `AWARDS` entry, never from the CSV's `Award Type` column.** That column is discarded on parse.
- **Nothing is guessed.** A value not in the canonical list and not in an alias table is skipped with a reason and reported. No fuzzy matching, no scoring, no heuristic fallback.
- **Every row is accounted for.** written + skipped must equal rows parsed; the runner asserts this and aborts before writing if it fails.
- **`issuedByName` is the bare name; `issuedByRank` is the full rank name.** The certificate renderer composes `{rankAbbrFromName(issuedByRank)} {issuedByName}` itself.
- **Records are written sorted ascending by date**, ties broken by file order.
- **Only `milpac.promotions`, `milpac.awards` and (conditionally) `milpac.promotionPoints` are written.** Never `enlistedDate`, `currentRank`, `qualifications`, `billetCounts`, `uniformHash`.
- Indentation is 4 spaces, no semicolons — match the surrounding files.

---

### Task 1: Vocabulary tables and resolvers

The three alias tables plus the guard tests that keep them honest. This task exists on its own because the tests are the load-bearing part: they fail the suite if an award or rank is ever renamed, instead of letting the importer silently write a label that renders no ribbon.

**Files:**
- Create: `apps/web/lib/military/history-vocab.ts`
- Create: `apps/web/lib/military/history-vocab.test.ts`

**Interfaces:**
- Consumes: `RANKS_FLAT` from `@asot/lib`, `AWARDS` from `@/lib/military/awards`
- Produces:
  - `RANK_ALIASES: Record<string, string>`, `AWARD_ALIASES: Record<string, string>`, `ROLE_ALIASES: Record<string, string>`
  - `resolveRank(raw: string): string | null` — canonical rank name, or null if unknown
  - `resolveAward(raw: string): { name: string; type: string } | null`
  - `resolveRole(raw: string): string` — never null; unknown roles pass through unchanged

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/military/history-vocab.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { RANKS_FLAT } from '@asot/lib'
import { AWARDS } from './awards'
import {
    RANK_ALIASES, AWARD_ALIASES, ROLE_ALIASES,
    resolveRank, resolveAward, resolveRole,
} from './history-vocab'

const RANK_NAMES = new Set(RANKS_FLAT.map(r => r.name))
const AWARD_LABELS = new Set<string>(AWARDS.map(a => a.label))

describe('alias tables point at values that exist', () => {
    // The whole reason this module lives in lib/ rather than in a .mjs
    // migration script: an award renamed in awards.ts breaks the suite here
    // instead of silently importing a label that renders no ribbon.
    test('every rank alias resolves to a real rank name', () => {
        for (const [from, to] of Object.entries(RANK_ALIASES)) {
            expect(RANK_NAMES.has(to), `${from} -> ${to}`).toBe(true)
        }
    })

    test('every award alias resolves to a real award label', () => {
        for (const [from, to] of Object.entries(AWARD_ALIASES)) {
            expect(AWARD_LABELS.has(to), `${from} -> ${to}`).toBe(true)
        }
    })

    // A key that is already canonical means the canonical list moved and the
    // table was not updated — the alias is now shadowing a real value.
    test('no alias key is itself already canonical', () => {
        for (const from of Object.keys(RANK_ALIASES)) {
            expect(RANK_NAMES.has(from), `rank alias key ${from}`).toBe(false)
        }
        for (const from of Object.keys(AWARD_ALIASES)) {
            expect(AWARD_LABELS.has(from), `award alias key ${from}`).toBe(false)
        }
    })

    test('no alias maps a value to itself', () => {
        for (const [from, to] of Object.entries({ ...RANK_ALIASES, ...AWARD_ALIASES, ...ROLE_ALIASES })) {
            expect(from).not.toBe(to)
        }
    })
})

describe('resolveRank', () => {
    test('passes through a canonical name', () => {
        expect(resolveRank('Private Proficient')).toBe('Private Proficient')
    })

    test('corrects a known misspelling', () => {
        expect(resolveRank('Signallar')).toBe('Signaller')
        expect(resolveRank('Lance Bombadier')).toBe('Lance Bombardier')
    })

    test('corrects a renamed rank', () => {
        expect(resolveRank('Warrant Officer Class One')).toBe('Warrant Officer 1')
        expect(resolveRank('Second Lieutenant')).toBe('2nd Lieutenant')
        expect(resolveRank('Regimental Sergeant Major of ASOT')).toBe('RSM of ASOT')
    })

    test('trims surrounding whitespace', () => {
        expect(resolveRank('  Corporal  ')).toBe('Corporal')
    })

    // "Stone" is the member's own name pasted into the Rank column.
    test('returns null for an unknown rank', () => {
        expect(resolveRank('Stone')).toBeNull()
        expect(resolveRank('')).toBeNull()
    })
})

describe('resolveAward', () => {
    test('passes through a canonical label and supplies its type', () => {
        expect(resolveAward('Campaign Medallion')).toEqual({
            name: 'Campaign Medallion',
            type: 'Operational Service Citation',
        })
    })

    test('collapses the five spellings of the 1 year citation', () => {
        for (const spelling of [
            '1 Year Citation', '1 Year of Service Citation', '1 Year service Citation',
            'One Year Service Citation', 'Year Service Citation',
        ]) {
            expect(resolveAward(spelling)?.name).toBe('1 Year Service Citation')
        }
    })

    test('maps the Tier 2 clasps onto the Fifth-to-Eighth numbering', () => {
        expect(resolveAward('Campaign Medallion, Tier 2 First Clasp')?.name).toBe('Campaign Medallion, Fifth Clasp')
        expect(resolveAward('Campaign Medallion Tier 2, Second Clasp')?.name).toBe('Campaign Medallion, Sixth Clasp')
        expect(resolveAward('Campaign Medallion, Tier 2 Third Clasp')?.name).toBe('Campaign Medallion, Seventh Clasp')
        expect(resolveAward('Campaign Medallion Tier 2, Fourth Clasp')?.name).toBe('Campaign Medallion, Eighth Clasp')
    })

    test('maps Long Term Service Citation to the 4 Year+ award', () => {
        expect(resolveAward('Long Term Service Citation')?.name).toBe('4 Year+ Service Citation')
        expect(resolveAward('4 Year Service Citation')?.name).toBe('4 Year+ Service Citation')
    })

    test('returns null for an unknown award', () => {
        expect(resolveAward('Order of the Phoenix')).toBeNull()
        expect(resolveAward('')).toBeNull()
    })
})

describe('resolveRole', () => {
    test('aliases a role that still exists under another name', () => {
        expect(resolveRole('Machine Gunner')).toBe('Machinegunner')
        expect(resolveRole('Section Medic')).toBe('Rifleman (CFA)')
        expect(resolveRole('Game Master')).toBe('Zeus')
        expect(resolveRole('Aircrewman')).toBe('Crewman')
        expect(resolveRole('Engineer')).toBe('Sapper')
    })

    test('collapses every driver/rifleman spelling to Rifleman', () => {
        for (const spelling of ['Rifleman/Driver', 'Driver/Rifleman', 'Driver / Rifleman', 'Driver/ Rifleman']) {
            expect(resolveRole(spelling)).toBe('Rifleman')
        }
    })

    // A service record states what the member actually held. Bending
    // "Battery Commander" into a surviving catalog entry would record a
    // posting that never happened.
    test('preserves a billet the unit no longer has', () => {
        for (const historical of [
            'Battery Commander', 'Battery 3IC', 'Aviation Commander', 'Wing Leader',
            'Company Executive Officer', 'Trooper', 'Trooper/Driver', 'Driver',
            'Gunnery Sergeant', 'Sapper (CFA)', 'Engineer Sergeant',
        ]) {
            expect(resolveRole(historical)).toBe(historical)
        }
    })

    test('returns an empty string for an empty cell', () => {
        expect(resolveRole('')).toBe('')
        expect(resolveRole('   ')).toBe('')
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix apps/web run test:unit -- history-vocab`
Expected: FAIL — `Failed to resolve import "./history-vocab"`

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/military/history-vocab.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix apps/web run test:unit -- history-vocab`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/military/history-vocab.ts apps/web/lib/military/history-vocab.test.ts
git commit -m "feat(import): map the history CSV's vocabulary onto the codebase's"
```

---

### Task 2: CSV parsing and issuer resolution

**Files:**
- Create: `apps/web/lib/military/history-import.ts`
- Create: `apps/web/lib/military/history-import.test.ts`

**Interfaces:**
- Consumes: `parseRow` from `@/lib/orbat/csv-parser`
- Produces:
  - `type HistoryRow = { member: string; type: 'promotion' | 'award'; date: string; award: string; rank: string; role: string; line: number }`
  - `parseHistoryCsv(text: string): HistoryRow[]`
  - `type Issuer = { issuedById: string; issuedByName: string; issuedByRank: string }`
  - `ISSUER_WINDOWS: readonly { until: string | null; issuer: Issuer }[]`
  - `resolveIssuer(date: string): Issuer | null`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/military/history-import.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
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
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix apps/web run test:unit -- history-import`
Expected: FAIL — `Failed to resolve import "./history-import"`

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/military/history-import.ts`:

```ts
/**
 * Reading the pre-website member history CSV, and working out who signed each
 * record.
 *
 * See docs/superpowers/specs/2026-08-18-member-history-import-design.md.
 * Pure: no database, no filesystem, no clock.
 */
import { parseRow } from '@/lib/orbat/csv-parser'

export type HistoryRow = {
    member: string
    type: 'promotion' | 'award'
    /** Verbatim from the file. Never reformatted — see the module spec §2. */
    date: string
    award: string
    rank: string
    role: string
    /** 1-based line in the source file, so a skipped row can be traced back. */
    line: number
}

/**
 * Splits the history CSV into rows.
 *
 * Line-splitting before field-splitting is safe for this file specifically:
 * it has no newlines inside quoted fields (1,859 lines for 1,858 records plus
 * a header). `parseRow` handles the quoted commas that every
 * "Campaign Medallion, Nth Clasp" row contains.
 *
 * The `Award Type` column is deliberately not read. It carries 15 spellings
 * for what should be 5 types; the type comes from AWARDS instead.
 */
export function parseHistoryCsv(text: string): HistoryRow[] {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/)
    const rows: HistoryRow[] = []

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue
        const cells = parseRow(lines[i])
        const member = (cells[0] ?? '').trim()
        if (!member) continue

        rows.push({
            member,
            type: (cells[1] ?? '').trim() === 'Award' ? 'award' : 'promotion',
            date: (cells[2] ?? '').trim(),
            award: (cells[3] ?? '').trim(),
            rank: (cells[5] ?? '').trim(),
            role: (cells[6] ?? '').trim(),
            line: i + 1,
        })
    }
    return rows
}

export type Issuer = {
    issuedById: string
    issuedByName: string
    issuedByRank: string
}

/**
 * Who signed a record, by date.
 *
 * `until` is exclusive, so the shared boundary dates in the source mapping
 * (01/01/2023 both ends Thomas and starts Trew) belong to the later officer.
 * A null `until` closes the list.
 *
 * The ranks are the ranks held *at the time*, not today's — Thomas is now
 * LTGEN and Trew is now PTE(SL), and a 2022 certificate signed "LTGEN Thomas"
 * would be a forgery of a document that never existed.
 *
 * `issuedByName` is the bare name and `issuedByRank` the full rank name,
 * because signatoryFor() in the certificate route composes the signature as
 * `{rankAbbrFromName(issuedByRank)} {issuedByName}` itself.
 */
export const ISSUER_WINDOWS: readonly { until: string | null; issuer: Issuer }[] = [
    { until: '2023-01-01', issuer: { issuedById: '224086573560365057', issuedByName: 'Thomas', issuedByRank: 'Major' } },
    { until: '2023-09-02', issuer: { issuedById: '187854741047345152', issuedByName: 'Trew',   issuedByRank: 'Major' } },
    { until: '2025-01-01', issuer: { issuedById: '112039501219586048', issuedByName: 'Jazz',   issuedByRank: 'Major' } },
    { until: '2026-01-01', issuer: { issuedById: '325502946781691916', issuedByName: 'Six',    issuedByRank: 'Brigadier' } },
    { until: null,         issuer: { issuedById: '325502946781691916', issuedByName: 'Six',    issuedByRank: 'Major General' } },
]

/**
 * The officer of record for a date, or null when the date does not parse.
 *
 * The first window is unbounded at the start on purpose: 23 records predate
 * the supplied mapping and fold into Thomas's window rather than importing
 * with no officer.
 */
export function resolveIssuer(date: string): Issuer | null {
    const at = Date.parse(date)
    if (Number.isNaN(at)) return null

    for (const window of ISSUER_WINDOWS) {
        if (window.until === null || at < Date.parse(window.until)) return window.issuer
    }
    return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix apps/web run test:unit -- history-import`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/military/history-import.ts apps/web/lib/military/history-import.test.ts
git commit -m "feat(import): parse the history CSV and derive each record's issuer"
```

---

### Task 3: Building the records

Turns rows into the arrays that go into `milpac.promotions` and `milpac.awards`, grouped by the CSV's member name, with every skipped row given a reason.

**Files:**
- Modify: `apps/web/lib/military/history-import.ts` (append; do not rewrite Task 2's contents)
- Modify: `apps/web/lib/military/history-import.test.ts` (append)

**Interfaces:**
- Consumes: `HistoryRow`, `resolveIssuer` (Task 2); `resolveRank`, `resolveAward`, `resolveRole` (Task 1)
- Produces:
  - `type PromotionRecord = { date: string; rank: string; role: string; issuedById: string; issuedByName: string; issuedByRank: string }`
  - `type AwardRecord = { date: string; name: string; type: string; issuedById: string; issuedByName: string; issuedByRank: string }`
  - `type MemberHistory = { promotions: PromotionRecord[]; awards: AwardRecord[] }`
  - `type SkippedRow = { line: number; member: string; reason: string }`
  - `type BuiltHistory = { byMember: Map<string, MemberHistory>; skipped: SkippedRow[]; corrections: { rank: number; award: number; role: number } }`
  - `buildHistory(rows: HistoryRow[]): BuiltHistory`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/lib/military/history-import.test.ts`:

```ts
import { buildHistory, type HistoryRow } from './history-import'

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
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix apps/web run test:unit -- history-import`
Expected: FAIL — `buildHistory is not exported`

- [ ] **Step 3: Write the implementation**

Append to `apps/web/lib/military/history-import.ts`:

```ts
import { resolveRank, resolveAward, resolveRole } from './history-vocab'

export type PromotionRecord = {
    date: string
    rank: string
    role: string
    issuedById: string
    issuedByName: string
    issuedByRank: string
}

export type AwardRecord = {
    date: string
    name: string
    type: string
    issuedById: string
    issuedByName: string
    issuedByRank: string
}

export type MemberHistory = { promotions: PromotionRecord[]; awards: AwardRecord[] }
export type SkippedRow = { line: number; member: string; reason: string }

export type BuiltHistory = {
    /** Keyed by the CSV's member name — resolving that to a user is history-match's job. */
    byMember: Map<string, MemberHistory>
    skipped: SkippedRow[]
    corrections: { rank: number; award: number; role: number }
}

/**
 * Rows in, the arrays that go into milpac.promotions/awards out.
 *
 * Every row leaves here exactly once, either as a record or as a skip with a
 * reason. Nothing is dropped silently and nothing is guessed: a rank or award
 * that resolves to nothing is a skip, not a best effort.
 */
export function buildHistory(rows: HistoryRow[]): BuiltHistory {
    const byMember = new Map<string, MemberHistory>()
    const skipped: SkippedRow[] = []
    const corrections = { rank: 0, award: 0, role: 0 }

    // Date first, file order second. Sorting up front rather than per member
    // keeps the tie-break stable without threading an index through.
    const ordered = rows
        .map((row, index) => ({ row, index, at: Date.parse(row.date) }))
        .sort((a, b) => (a.at - b.at) || (a.index - b.index))

    const historyFor = (member: string): MemberHistory => {
        const existing = byMember.get(member)
        if (existing) return existing
        const fresh: MemberHistory = { promotions: [], awards: [] }
        byMember.set(member, fresh)
        return fresh
    }

    for (const { row } of ordered) {
        const issuer = resolveIssuer(row.date)
        if (!issuer) {
            skipped.push({ line: row.line, member: row.member, reason: 'no date' })
            continue
        }

        if (row.type === 'promotion') {
            const rank = resolveRank(row.rank)
            if (!rank) {
                skipped.push({ line: row.line, member: row.member, reason: `unknown rank "${row.rank}"` })
                continue
            }
            if (rank !== row.rank.trim()) corrections.rank++

            const role = resolveRole(row.role)
            if (role !== row.role.trim()) corrections.role++

            historyFor(row.member).promotions.push({ date: row.date, rank, role, ...issuer })
        } else {
            const award = resolveAward(row.award)
            if (!award) {
                skipped.push({ line: row.line, member: row.member, reason: `unknown award "${row.award}"` })
                continue
            }
            if (award.name !== row.award.trim()) corrections.award++

            historyFor(row.member).awards.push({ date: row.date, name: award.name, type: award.type, ...issuer })
        }
    }

    return { byMember, skipped, corrections }
}
```

Note: move the `import { resolveRank, ... }` line up to join the other imports at the top of the file rather than leaving it mid-file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix apps/web run test:unit -- history-import`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/military/history-import.ts apps/web/lib/military/history-import.test.ts
git commit -m "feat(import): build sorted promotion and award records from history rows"
```

---

### Task 4: Member matching

**Files:**
- Create: `apps/web/lib/military/history-match.ts`
- Create: `apps/web/lib/military/history-match.test.ts`

**Interfaces:**
- Consumes: `RANKS_FLAT` from `@asot/lib`
- Produces:
  - `type MatchCandidate = { _id: string; username: string; name?: string; globalName?: string; nickname?: string }`
  - `MEMBER_OVERRIDES: Record<string, string>` — CSV name → username
  - `buildMemberIndex(members: MatchCandidate[]): Map<string, MatchCandidate[]>`
  - `validateOverrides(members: MatchCandidate[]): string[]` — error messages, empty when valid
  - `resolveMembers(csvNames: string[], members: MatchCandidate[]): { resolved: Map<string, MatchCandidate>; unresolved: string[]; errors: string[] }`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/military/history-match.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { buildMemberIndex, resolveMembers, validateOverrides, type MatchCandidate } from './history-match'

const member = (over: Partial<MatchCandidate> & { _id: string; username: string }): MatchCandidate => ({ ...over })

describe('buildMemberIndex', () => {
    test('indexes a member by name, nickname, globalName and username', () => {
        const m = member({ _id: '1', username: 'itskodas', name: 'Koda', globalName: 'kd', nickname: 'PTE(S) Koda [J7]' })
        const index = buildMemberIndex([m])
        for (const key of ['koda', 'itskodas', 'kd']) {
            expect(index.get(key), key).toEqual([m])
        }
    })

    test('strips [tags] and (parens) from a nickname', () => {
        const m = member({ _id: '1', username: 'a', nickname: 'Etched [OLD ACC]' })
        expect(buildMemberIndex([m]).get('etched')).toEqual([m])
    })

    // Dave and Grubby have no `name` and a nickname of "REC Dave" / "REC
    // Grubby". Without this key they do not resolve at all.
    test('also indexes a nickname with its rank abbreviation removed', () => {
        const m = member({ _id: '1', username: 'daveuhh', nickname: 'REC Dave' })
        expect(buildMemberIndex([m]).get('dave')).toEqual([m])
    })

    test('does not strip a leading word that is not a rank', () => {
        const m = member({ _id: '1', username: 'a', nickname: 'Big Dave' })
        const index = buildMemberIndex([m])
        expect(index.get('big dave')).toEqual([m])
        expect(index.get('dave')).toBeUndefined()
    })

    // buildOrbatLookup() overwrites on collision, which is how "Bones"
    // resolved to an account that joined in 2026 rather than the one holding
    // seven promotions. Collecting instead of overwriting is the entire
    // reason this module exists.
    test('collects every claimant of a contested key instead of overwriting', () => {
        const a = member({ _id: '1', username: 'reality_bites', name: 'Bones' })
        const b = member({ _id: '2', username: 'isobones', name: 'Bones' })
        expect(buildMemberIndex([a, b]).get('bones')).toEqual([a, b])
    })
})

describe('validateOverrides', () => {
    test('reports an override naming a username that does not exist', () => {
        const errors = validateOverrides([member({ _id: '1', username: 'bobittihaxs' })])
        expect(errors.some(e => e.includes('.gryphorim.'))).toBe(true)
    })

    test('passes when every override target is present', () => {
        const usernames = ['bobittihaxs', '.gryphorim.', 'nutpirom', 'salpacino', 'mastergoose123',
            'odinv9.', 'tally.enfield', 'reality_bites', 'falcon7589', 'farmingtons9', 'rjfrg']
        const members = usernames.map((username, i) => member({ _id: String(i), username }))
        expect(validateOverrides(members)).toEqual([])
    })
})

describe('resolveMembers', () => {
    const koda = member({ _id: '1', username: 'itskodas', name: 'Koda' })

    test('resolves a uniquely claimed name', () => {
        const { resolved, unresolved } = resolveMembers(['Koda'], [koda])
        expect(resolved.get('Koda')).toEqual(koda)
        expect(unresolved).toEqual([])
    })

    test('leaves a contested name unresolved rather than picking one', () => {
        const a = member({ _id: '1', username: 'a', name: 'Goose' })
        const b = member({ _id: '2', username: 'b', name: 'Goose' })
        const { resolved, unresolved } = resolveMembers(['Goose'], [a, b])
        expect(resolved.has('Goose')).toBe(false)
        expect(unresolved).toEqual(['Goose'])
    })

    test('an override beats a contested key', () => {
        const chosen = member({ _id: '1', username: 'mastergoose123', name: 'Goose' })
        const other = member({ _id: '2', username: 'goosethetwingo', name: 'Goose' })
        const { resolved, unresolved } = resolveMembers(['Goose'], [chosen, other])
        expect(resolved.get('Goose')).toEqual(chosen)
        expect(unresolved).toEqual([])
    })

    test('an override resolves a name the index cannot match at all', () => {
        const target = member({ _id: '1', username: 'nutpirom', name: 'Nutpirom' })
        expect(resolveMembers(['Nutpriom'], [target]).resolved.get('Nutpriom')).toEqual(target)
    })

    // Both of these silently merge two people's service records, and the
    // damage is unrecoverable once the old arrays are gone.
    test('errors when two CSV names resolve to the same member', () => {
        const dup = member({ _id: '1', username: 'nutpirom', name: 'Nutpirom' })
        const { errors } = resolveMembers(['Nutpriom', 'Nutpirom'], [dup])
        expect(errors.some(e => e.includes('Nutpriom') && e.includes('Nutpirom'))).toBe(true)
    })

    test('errors when an override target is missing', () => {
        const { errors } = resolveMembers(['Koda'], [koda])
        expect(errors.length).toBeGreaterThan(0)
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix apps/web run test:unit -- history-match`
Expected: FAIL — `Failed to resolve import "./history-match"`

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/military/history-match.ts`:

```ts
/**
 * Resolving a name in the history CSV to a member.
 *
 * `client.buildOrbatLookup()` is deliberately not reused. It keys members by
 * `name || nickname || globalName` and lets a later member silently overwrite
 * an earlier one on a key collision — which is how "Bones" resolves to the
 * account that joined in 2026 rather than the one holding seven promotions.
 * For an ORBAT import that mis-seats someone until the next sync, that is
 * tolerable. For a one-way overwrite of a service record it is not.
 *
 * So this index collects every claimant per key, and a contested key resolves
 * to nobody unless an override says otherwise.
 */
import { RANKS_FLAT } from '@asot/lib'

export type MatchCandidate = {
    _id: string
    username: string
    name?: string
    globalName?: string
    /** `guild.nickname` — the caller flattens it. */
    nickname?: string
}

/**
 * The eleven names the index cannot settle, adjudicated by hand against
 * Discord join dates, stored history, ORBAT seating and the rank each record
 * ends on. See spec §5 for the evidence behind each one.
 *
 * This is an input, not a fallback: a contested name absent from this table is
 * skipped rather than guessed.
 */
export const MEMBER_OVERRIDES: Record<string, string> = {
    BobbittiHaxs: 'bobittihaxs',
    Gyphorim:     '.gryphorim.',
    Nutpriom:     'nutpirom',
    Sal:          'salpacino',
    Goose:        'mastergoose123',
    Odin:         'odinv9.',
    Enfield:      'tally.enfield',
    Bones:        'reality_bites',
    Wedgetail:    'falcon7589',
    Billy:        'farmingtons9',
    Formula:      'rjfrg',
}

const RANK_ABBRS = new Set(RANKS_FLAT.map(r => r.abbr.toLowerCase()))

/** Lowercased, with `[tags]` and `(parens)` removed. */
function normalise(value: string): string {
    return value.replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase()
}

export function buildMemberIndex(members: MatchCandidate[]): Map<string, MatchCandidate[]> {
    const index = new Map<string, MatchCandidate[]>()

    const claim = (key: string, member: MatchCandidate) => {
        const held = index.get(key)
        if (held) {
            if (!held.includes(member)) held.push(member)
        } else {
            index.set(key, [member])
        }
    }

    for (const member of members) {
        for (const raw of [member.name, member.nickname, member.globalName, member.username]) {
            if (!raw) continue
            const key = normalise(raw)
            if (!key) continue
            claim(key, member)

            // "REC Dave" also claims "dave". Dave and Grubby have no `name`
            // and would not resolve at all without this.
            const space = key.indexOf(' ')
            if (space > 0 && RANK_ABBRS.has(key.slice(0, space))) {
                const bare = key.slice(space + 1).trim()
                if (bare) claim(bare, member)
            }
        }
    }
    return index
}

/** Empty when every override names a member that exists. */
export function validateOverrides(members: MatchCandidate[]): string[] {
    const usernames = new Set(members.map(m => m.username))
    return Object.entries(MEMBER_OVERRIDES)
        .filter(([, username]) => !usernames.has(username))
        .map(([csvName, username]) => `override "${csvName}" names username "${username}", which does not exist`)
}

/**
 * CSV names to members.
 *
 * `errors` is fatal — the caller must abort rather than write. Both cases it
 * reports (a missing override target, two names landing on one member) merge
 * two people's service records, which is unrecoverable once the old arrays
 * have been replaced.
 */
export function resolveMembers(csvNames: string[], members: MatchCandidate[]): {
    resolved: Map<string, MatchCandidate>
    unresolved: string[]
    errors: string[]
} {
    const errors = validateOverrides(members)
    const byUsername = new Map(members.map(m => [m.username, m]))
    const index = buildMemberIndex(members)

    const resolved = new Map<string, MatchCandidate>()
    const unresolved: string[] = []

    for (const csvName of csvNames) {
        const override = MEMBER_OVERRIDES[csvName]
        if (override) {
            const member = byUsername.get(override)
            if (member) resolved.set(csvName, member)
            else unresolved.push(csvName)
            continue
        }

        const claimants = index.get(normalise(csvName)) ?? []
        if (claimants.length === 1) resolved.set(csvName, claimants[0])
        else unresolved.push(csvName)
    }

    const claimedBy = new Map<string, string[]>()
    for (const [csvName, member] of resolved) {
        const names = claimedBy.get(member._id) ?? []
        names.push(csvName)
        claimedBy.set(member._id, names)
    }
    for (const names of claimedBy.values()) {
        if (names.length > 1) errors.push(`CSV names ${names.map(n => `"${n}"`).join(' and ')} both resolve to one member`)
    }

    return { resolved, unresolved, errors }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix apps/web run test:unit -- history-match`
Expected: PASS

- [ ] **Step 5: Run the whole unit suite to check nothing else broke**

Run: `npm --prefix apps/web run test:unit`
Expected: PASS — all files green

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/military/history-match.ts apps/web/lib/military/history-match.test.ts
git commit -m "feat(import): resolve CSV member names without overwriting on collision"
```

---

### Task 5: The runner

**Files:**
- Create: `apps/web/scripts/import-member-history.ts`
- Modify: `apps/web/package.json` (add `tsx` devDependency and an `import:history` script)
- Modify: `scripts/start.mjs` (register the importer under Migrations)

**Interfaces:**
- Consumes: everything from Tasks 1–4, plus `calculatePromotionPoints` and `MilpacImportCounts` from `@/lib/military/points`
- Produces: a CLI. No exports.

- [ ] **Step 1: Add the TypeScript script runner**

Node has no TypeScript runner in this repo and `--experimental-strip-types` will not resolve the `@asot/lib` and `@/` path aliases these modules use, so add `tsx`:

```bash
npm --prefix apps/web install --save-dev tsx
```

Then add to the `"scripts"` block of `apps/web/package.json`, after `"lint"`:

```jsonc
"import:history": "dotenv -e ../../.env -- tsx scripts/import-member-history.ts",
```

- [ ] **Step 2: Write the runner**

Create `apps/web/scripts/import-member-history.ts`:

```ts
/**
 * One-off backfill: replace every covered member's promotion history and
 * awards with the record extracted from the unit's pre-website systems.
 *
 *   npm --prefix apps/web run import:history -- <csv>            # dry run
 *   npm --prefix apps/web run import:history -- <csv> --apply   # writes
 *
 * Dry run is the default because this is the most destructive operation in
 * the repo that is not a backup restore. Take a backup through the J4 backups
 * tab before running with --apply.
 *
 * See docs/superpowers/specs/2026-08-18-member-history-import-design.md.
 */
import { readFileSync } from 'fs'
import { MongoClient } from 'mongodb'
import { parseHistoryCsv, buildHistory, ISSUER_WINDOWS } from '@/lib/military/history-import'
import { resolveMembers, type MatchCandidate } from '@/lib/military/history-match'
import { calculatePromotionPoints, type MilpacImportCounts } from '@/lib/military/points'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const csvPath = args.find(a => !a.startsWith('--'))

function die(message: string): never {
    console.error(`\n  ERROR  ${message}\n`)
    process.exit(1)
}

if (!csvPath) die('usage: import:history -- <path-to-csv> [--apply]')

const { MONGO_URI, MONGO_DB } = process.env
if (!MONGO_URI || !MONGO_DB) die('MONGO_URI and MONGO_DB must be set')

/**
 * The awards-only total, for members with no billetCounts.
 *
 * resolvePromotionPoints() recomputes live from billetCounts when it exists
 * and otherwise falls back to this stored scalar. 18 members have neither,
 * so without this they would import their awards and still display 0. Their
 * score is entirely awards, which is what zeroed counts produce.
 */
function awardsOnlyPoints(member: User, awards: { name: string }[]): number {
    const counts: MilpacImportCounts = {
        primaryNightOps: 0, secondaryNightOps: 0, primaryNightFTX: 0, secondaryNightFTX: 0,
        platoonTraining: 0, sectionTraining: 0, meetings: 0, campaignMedals: 0,
        j1Interviews: 0, j1InterviewBonus: 0, j2MissionsRun: 0, j3Bct12: 0,
        j3OtherTrainings: 0, j5ContentCreated: 0, j5MilpacsGenerated: 0, j5OfficialPR: 0,
        awards,
        qualifications: (member.milpac?.qualifications ?? []).map(q => ({ qualification: q.qualification })),
        j4Points: member.milpac?.j4Points ?? 0,
        disciplineDeductions: member.milpac?.disciplineDeductions ?? 0,
    }
    return calculatePromotionPoints(counts)
}

async function main() {
    const rows = parseHistoryCsv(readFileSync(csvPath!, 'utf-8'))
    const { byMember, skipped, corrections } = buildHistory(rows)

    const client = new MongoClient(MONGO_URI!)
    await client.connect()
    try {
        const users = await client.db(MONGO_DB!).collection<User>('users').find({}).toArray()
        const candidates: MatchCandidate[] = users.map(u => ({
            _id: u._id, username: u.username, name: u.name,
            globalName: u.globalName, nickname: u.guild?.nickname,
        }))

        const { resolved, unresolved, errors } = resolveMembers([...byMember.keys()], candidates)
        if (errors.length) die(`member resolution failed:\n         ${errors.join('\n         ')}`)
        if (unresolved.length) die(`${unresolved.length} member(s) did not resolve: ${unresolved.join(', ')}\n         Add them to MEMBER_OVERRIDES in lib/military/history-match.ts.`)

        const byId = new Map(users.map(u => [u._id, u]))
        const written = [...byMember.values()].reduce((n, h) => n + h.promotions.length + h.awards.length, 0)

        // Nothing may be dropped silently. This is the guarantee, not a summary.
        if (written + skipped.length !== rows.length) {
            die(`accounting failed: ${written} written + ${skipped.length} skipped != ${rows.length} rows`)
        }

        const updates = []
        let pointsWritten = 0
        for (const [csvName, history] of byMember) {
            const member = byId.get(resolved.get(csvName)!._id)!
            const set: Record<string, unknown> = {
                'milpac.promotions': history.promotions,
                'milpac.awards': history.awards,
            }
            // Only when the live path cannot recompute — writing one otherwise
            // leaves a misleading number the site already ignores.
            if (!member.milpac?.billetCounts) {
                set['milpac.promotionPoints'] = awardsOnlyPoints(member, history.awards)
                pointsWritten++
            }
            updates.push({ updateOne: { filter: { _id: member._id } as never, update: { $set: set } } })
        }

        const promotions = [...byMember.values()].reduce((n, h) => n + h.promotions.length, 0)
        const awards = [...byMember.values()].reduce((n, h) => n + h.awards.length, 0)

        console.log(`\nMEMBER HISTORY IMPORT — ${apply ? 'APPLYING' : 'DRY RUN (no changes written; pass --apply to write)'}\n`)
        console.log(`Source   ${csvPath}`)
        console.log(`Rows     ${rows.length} parsed\n`)
        console.log('Members')
        console.log(`  ${String(resolved.size).padStart(4)}  resolved`)
        console.log(`  ${String(unresolved.length).padStart(4)}  unresolved\n`)
        console.log('Records')
        console.log(`  ${String(promotions).padStart(4)}  promotions`)
        console.log(`  ${String(awards).padStart(4)}  awards`)
        console.log(`  ${String(skipped.length).padStart(4)}  rows skipped`)
        for (const s of skipped) console.log(`          line ${s.line}  ${s.member}  ${s.reason}`)
        console.log(`  ${String(written + skipped.length).padStart(4)}  accounted for   OK matches rows parsed\n`)
        console.log('Normalisation')
        console.log(`  ${String(corrections.rank).padStart(4)}  rank spellings corrected`)
        console.log(`  ${String(corrections.award).padStart(4)}  award spellings corrected`)
        console.log(`  ${String(corrections.role).padStart(4)}  role spellings corrected\n`)
        console.log('Issuers')
        for (const w of ISSUER_WINDOWS) {
            const n = [...byMember.values()]
                .flatMap(h => [...h.promotions, ...h.awards])
                .filter(r => r.issuedByName === w.issuer.issuedByName && r.issuedByRank === w.issuer.issuedByRank)
                .length
            console.log(`  ${String(n).padStart(4)}  ${w.issuer.issuedByName} (${w.issuer.issuedByRank})  until ${w.until ?? '—'}`)
        }
        console.log('\npromotionPoints')
        console.log(`  ${String(byMember.size - pointsWritten).padStart(4)}  recomputed live from billetCounts — not written`)
        console.log(`  ${String(pointsWritten).padStart(4)}  written (awards-only total; member has no billetCounts)\n`)

        if (!apply) {
            console.log('Dry run — nothing written. Re-run with --apply to apply.\n')
            return
        }

        const result = await client.db(MONGO_DB!).collection<User>('users').bulkWrite(updates as never)
        console.log(`Wrote ${result.modifiedCount} member(s).\n`)
    } finally {
        await client.close()
    }
}

main().catch(err => die(err instanceof Error ? err.message : String(err)))
```

- [ ] **Step 3: Verify it typechecks**

Run: `npm --prefix apps/web run lint`
Expected: no errors from `scripts/import-member-history.ts`

- [ ] **Step 4: Let a migration item run something other than `node`**

`npm start` is this repo's front door, and its Migrations flow is already exactly right for this importer: `runMigration()` runs the migration bare for a dry run, asks for confirmation naming the target database, then re-runs it with `--apply`. That is why this importer uses `--apply` rather than inventing a second flag name.

It only needs to stop hardcoding `node`. In `scripts/start.mjs`, rewrite `runMigration()` (currently lines 810-827) as:

```js
async function runMigration(item) {
    // Most migrations are `node scripts/foo.mjs`. An item may override both
    // halves — the member history importer runs through npm so it picks up
    // tsx and the shared .env, and it takes the CSV path as an argument.
    const command  = item.command ?? 'node'
    const baseArgs = item.args ?? [item.script]

    p.log.step(`Dry run: ${item.label}`)
    const dryCode = await run(command, baseArgs, { cwd: item.cwd })
    if (dryCode !== 0) {
        p.log.error(`dry run exited with code ${dryCode} — not offering to apply`)
        return
    }

    const apply = await p.confirm({ message: `Apply these changes to "${ENV.MONGO_DB}"?`, initialValue: false })
    if (p.isCancel(apply) || !apply) {
        p.log.info('Skipped — no changes applied')
        return
    }

    p.log.step(`Applying: ${item.label}`)
    const applyCode = await run(command, [...baseArgs, '--apply'], { cwd: item.cwd })
    reportExit(applyCode)
}
```

Every existing entry has neither `command` nor `args`, so all nine keep running `node <script>` exactly as before.

- [ ] **Step 5: Add the menu entry**

Append to the `MIGRATION_ITEMS` array in `scripts/start.mjs` (currently ending at line 806), after the `reservist role` entry:

```js
    {
        label: '🗃️ Import: member history CSV',
        command: 'npm',
        args: ['--prefix', 'apps/web', 'run', 'import:history', '--', '../../ASOT_Member_History_Master_Batch_12.csv'],
        cwd: ROOT,
    },
```

`--prefix apps/web` makes npm run the script with `apps/web` as its working directory, so both `../../.env` in the package script and the `../../` CSV path resolve from there.

- [ ] **Step 6: Verify the menu parses and existing migrations are unaffected**

Run: `node --check scripts/start.mjs`
Expected: no output, exit 0

Then confirm the defaults survived — an item with no `command`/`args` must still run `node <script>`:

Run: `npm --prefix apps/web run test:unit` — unaffected, but confirms nothing else broke.

Manually verify by reading `runMigration()` back: the `??` fallbacks must be present, and no existing `MIGRATION_ITEMS` entry may have gained a `command` or `args` key.

- [ ] **Step 7: Commit**

```bash
git add apps/web/scripts/import-member-history.ts apps/web/package.json apps/web/package-lock.json scripts/start.mjs
git commit -m "feat(import): add the member history importer, dry-run by default"
```

---

### Task 6: Verify the dry run against the live database

The unit tests prove the modules behave. This task proves the *data* behaves — that the importer's own numbers match what the spec predicts. It writes nothing.

**Files:** none — this task runs the importer and checks its output.

**Interfaces:**
- Consumes: the CLI from Task 5

- [ ] **Step 1: Run the dry run**

```bash
npm --prefix apps/web run import:history -- ../../ASOT_Member_History_Master_Batch_12.csv
```

- [ ] **Step 2: Check every number against the spec**

The output must match these exactly. Any mismatch is a bug in the importer, not a stale expectation — the spec's figures were derived from this same database.

| Line | Expected |
|---|---|
| Rows parsed | 1858 |
| Members resolved | 187 |
| Members unresolved | 0 |
| Promotions | 1201 |
| Awards | 655 |
| Rows skipped | 2 — Talon (no date), Stone (unknown rank "Stone") |
| Accounted for | 1858, matching rows parsed |
| Rank corrections | 30 |
| Award corrections | 66 |
| Role corrections | 159 |
| Thomas (Major) | 201 |
| Trew (Major) | 164 |
| Jazz (Major) | 581 |
| Six (Brigadier) | 613 |
| Six (Major General) | 297 |
| promotionPoints written | 18 |
| promotionPoints not written | 169 |

- [ ] **Step 3: Confirm nothing was written**

```bash
node -e "const {MongoClient}=require('mongodb');(async()=>{const c=new MongoClient(process.env.MONGO_URI||'mongodb://127.0.0.1:27017');await c.connect();const n=await c.db(process.env.MONGO_DB||'ASOT').collection('users').countDocuments({'milpac.promotions.0':{\$exists:true}});console.log('members with promotions:',n);await c.close()})()"
```

Expected: `138` — unchanged from before the run. A dry run that modified the database is a release blocker.

- [ ] **Step 4: Report the result**

Report the full dry-run output and whether every figure matched. **Do not run `--apply`** — that is the user's call, after they have taken a backup through the J4 backups tab.

---

## Handover notes

- The importer is intentionally **not** wired into any dashboard UI, cron, or API route. It runs by hand — from the command line, or from `npm start` → Migrations, which adds the dry-run → confirm → apply prompt around it.
- `spawnChild()` in `start.mjs` already uses `shell: true` and passes the loaded `.env`, so an `npm` command works there on Windows without further changes.
- `ASOT_Member_History_*.csv` at the repo root is git-ignored. The dry-run report is the audit artifact, not the input file.
- Four members hold promotion or award data and are not covered by the CSV — Jazz (`jazzbot`), Jetz (`bone_daddy0117`), Taye (`crustymuffin69`), NakedSnake (`brownakira`). They are never read and never written, by design.
- Formula and Goose each have a superseded duplicate Discord account that keeps a partial record after the run. Both have left the unit; see spec §12.
- Odin and Bones resolved to the account holding their history, but the *other* account is the one currently seated in the ORBAT. That is a pre-existing ORBAT mis-match, out of scope here, and worth fixing separately.
