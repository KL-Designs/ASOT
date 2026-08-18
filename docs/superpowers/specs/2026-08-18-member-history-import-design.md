# Member History Import — Design

Replaces every serving member's promotion history and awards with an accurate
record extracted from the unit's pre-website systems, supplied as
`ASOT_Member_History_Master_Batch_12.csv` (1,858 rows, 187 members,
2020-08-14 → 2026-06-05).

## Goal

The `milpac.promotions` and `milpac.awards` arrays on `User` were populated by
the Billet Mastersheet import, which carries no dates for promotions and no
issuing officer for anything. The CSV has both. This is a one-off backfill: for
every member the CSV covers unambiguously, drop what is stored and write the
CSV's record in its place, with the issuing officer derived from the date.

Three problems stand between the file and the database, and the design is
mostly about them:

- **The CSV's vocabulary is not the codebase's vocabulary.** 16 rank spellings
  and 22 award spellings in the file match nothing in `RANK_GROUPS` or
  `AWARDS`. Some are typos (`Signallar`, `Lance Bombadier`), some are older
  names (`Warrant Officer Class One`, `Long Term Service Citation`), and one
  whole family uses a different numbering scheme (`Tier 2 First Clasp` is what
  the codebase calls `Fifth Clasp`).
- **Member names are not identifiers.** 8 of the 187 names are claimed by two
  or three users each, and 3 more are misspelled in the CSV. Writing to the
  wrong "Bones" is unrecoverable once the old record is gone.
- **The CSV's own `Award Type` column is unusable.** It carries 15 spellings
  for what should be 5 types, including `Operation Service Citation` and
  `Non Operational Award`. `awards[].type` drives ribbon rendering, so a
  mis-typed award is a wrong uniform.

## Non-Goals

- **A dashboard UI.** This runs once against historical data. `scripts/` is
  where this repo puts data migrations, and that is where this goes.
- **Resolving the 11 ambiguous or misspelled names.** They are skipped, named
  in the report, and left holding whatever they hold today. Guessing which
  "Goose" earned a medal is worse than importing nothing for Goose.
- **Members the CSV does not cover.** 4 members hold promotion or award data
  and appear nowhere in the file (Jazzbot, Jetz, crustymuffin69, NakedSnake).
  They are never read and never written.
- **`milpac.promotionPoints`** — see §7.
- **`milpac.enlistedDate`, `milpac.currentRank`, `milpac.qualifications`,
  `milpac.billetCounts`.** The Mastersheet import owns those fields and this
  importer does not touch them, even where the CSV implies a value.

---

## 1. What the run does

Two collections of writes, per member, in one `bulkWrite`:

```
{ $set: { 'milpac.promotions': [...], 'milpac.awards': [...] } }
```

There is no separate "clear" pass. `$set` of a whole array replaces it, which
*is* the clear — a member the importer touches ends the run holding exactly
what the CSV says and nothing else. A member the importer does not touch is
never in the `bulkWrite` at all.

**Dry run is the default.** The importer reports and exits. `--commit` is
required to write. This is the single most destructive operation in the repo
that is not the backup restore, and it must not be possible to run it by
autocomplete.

Expected outcome, verified against the live `ASOT` database:

| | |
|---|---|
| Members rewritten | 176 |
| Promotions written | 1,137 |
| Awards written | 635 |
| Rows skipped — unresolvable member name | 84 (11 names) |
| Rows skipped — unusable row data | 2 |

The 2 unusable rows are Talon's promotion with an empty `Date` cell, and
Stone's row where the member's *name* was pasted into the `Rank` column
(`Stone,Promotion/Role,13 May 2026,,,Stone,Reservist`).

## 2. Dates

The CSV writes `16 January 2026`. `milpac.promotions[].date` and
`milpac.awards[].date` already store exactly that format — `15 August 2020` is
what is in the database today. **The date is stored verbatim after trimming.**
No parsing, no reformatting, no `Date` round-trip.

This matters beyond convenience: `parseMilpacDate` is lenient, and putting a
reformatting step in the path would create a second date format for the same
field the moment it disagreed with the first.

A row whose `Date` cell is empty is skipped. Dates are parsed *only* to select
the issuing officer (§3), never to produce the stored value.

## 3. Issuing officer

Derived from the record's date. All five windows resolve to a real user, so
`issuedById` is a genuine Discord id and the milpac's "Issued by" line links
to a real member.

Windows are **half-open — `[start, end)`** — so the shared boundary dates in
the source mapping (`01/01/2023` ends Thomas and starts Trew) belong to the
later officer.

| From | Until | `issuedById` | `issuedByName` | `issuedByRank` |
|---|---|---|---|---|
| *(unbounded)* | 2023-01-01 | `224086573560365057` | `Thomas` | `Major` |
| 2023-01-01 | 2023-09-02 | `187854741047345152` | `Trew` | `Major` |
| 2023-09-02 | 2025-01-01 | `112039501219586048` | `Jazz` | `Major` |
| 2025-01-01 | 2026-01-01 | `325502946781691916` | `Six` | `Brigadier` |
| 2026-01-01 | *(unbounded)* | `325502946781691916` | `Six` | `Major General` |

The first window is unbounded at the start by decision: 23 records predate the
supplied mapping's `11/01/2021` start, the earliest being 2020-08-14, and they
fold into Thomas's window rather than importing with no officer.

**`issuedByName` is the bare name and `issuedByRank` the full rank name.**
`signatoryFor()` in `app/api/milpac/certificate/[username]/route.ts` composes
the signature as `{rankAbbrFromName(issuedByRank)} {issuedByName}`, so storing
`"MAJ Thomas"` in the name field would render `MAJ MAJ Thomas`. Records
already in the database store a decorated Discord nickname there
(`PTE(S) Koda [J7]`), but those carry no `issuedByRank` and so fall back to the
unit signatory instead of rendering — this importer is the first writer to
populate both halves, and it populates them the way the renderer reads them.

Ranks in the table are the ranks held **at the time**, not today's. Thomas is
now LTGEN and Trew is now PTE(SL); a 2022 certificate signed `LTGEN Thomas`
would be a forgery of a document that never existed.

## 4. Vocabulary normalisation

Three alias tables, each mapping a CSV spelling to a value that must exist in
the canonical list. Anything not in the canonical list and not in an alias
table is **skipped and named in the report** — never written through, never
guessed.

### 4.1 Ranks → `RANK_GROUPS[].ranks[].name`

`promotions[].rank` stores the full rank name, which is also what the CSV
supplies, so only the 16 mismatches need a table.

| CSV | Canonical |
|---|---|
| `Air Commodore` | `Commodore` |
| `Aircraftman` | `Aircraftsman` |
| `Game Master Senior` | `Senior Game Master` |
| `Lance Bombadier` | `Lance Bombardier` |
| `Leading Senior Private` | `Senior Leading Private` |
| `Regimental Sergeant Major of ASOT` | `RSM of ASOT` |
| `Second Lieutenant` | `2nd Lieutenant` |
| `Senior Bombadier` | `Senior Bombardier` |
| `Senior Lance Bombadier` | `Senior Lance Bombardier` |
| `Senior Sergeant At Arms` | `Senior Sergeant-at-Arms` |
| `Sergeant At Arms` | `Sergeant-at-Arms` |
| `Signallar` | `Signaller` |
| `Trooper Senior` | `Senior Trooper` |
| `Warrant Officer Class One` | `Warrant Officer 1` |
| `Warrant Officer Class Two` | `Warrant Officer 2` |
| `Stone` | *(none — data error, row skipped)* |

### 4.2 Awards → `AWARDS[].label`

| CSV | Canonical |
|---|---|
| `1 Year Citation` | `1 Year Service Citation` |
| `1 Year of Service Citation` | `1 Year Service Citation` |
| `1 Year service Citation` | `1 Year Service Citation` |
| `One Year Service Citation` | `1 Year Service Citation` |
| `Year Service Citation` | `1 Year Service Citation` |
| `4 Year Service Citation` | `4 Year+ Service Citation` |
| `Long Term Service Citation` | `4 Year+ Service Citation` |
| `Beyond Award` | `ASOT Beyond Award` |
| `Bronze Soldier Medallion` | `Bronze Soldiers Medallion` |
| `Bronze Soldier Medallion Certtificate` | `Bronze Soldiers Medallion` |
| `Founding Member Award` | `Founding Member` |
| `Group Development` | `Group Development Award` |
| `Junior Leadership` | `Junior Leadership Award` |
| `Campaign Medallion First Clasp` | `Campaign Medallion, First Clasp` |
| `Campaign Medallion Tier 2, First Clasp` | `Campaign Medallion, Fifth Clasp` |
| `Campaign Medallion, Tier 2 First Clasp` | `Campaign Medallion, Fifth Clasp` |
| `Campaign Medallion Tier 2, Second Clasp` | `Campaign Medallion, Sixth Clasp` |
| `Campaign Medallion, Tier 2 Second Clasp` | `Campaign Medallion, Sixth Clasp` |
| `Campaign Medallion Tier 2, Third Clasp` | `Campaign Medallion, Seventh Clasp` |
| `Campaign Medallion, Tier 2 Third Clasp` | `Campaign Medallion, Seventh Clasp` |
| `Campaign Medallion Tier 2, Fourth Clasp` | `Campaign Medallion, Eighth Clasp` |
| `Campaign Medallion, Tier 2 Fourth Clasp` | `Campaign Medallion, Eighth Clasp` |

Two of these deserve their reasoning recorded, because both look like guesses
and neither is:

- **The Tier 2 family.** `AWARDS` already carries this mapping in its
  `csvHeader` column — `csvHeader: 'Campaign Medallion, Tier 2 First Clasp'`
  sits on the row whose `label` is `'Campaign Medallion, Fifth Clasp'`. The
  Second/Third/Fourth rows only fail to resolve automatically because their
  `csvHeader` values contain the typo `Campagin`. The alias table restates
  what `awards.ts` already asserts.
- **`Long Term Service Citation` → `4 Year+`.** Corroborated independently by
  `CERTIFICATE_CODE_OVERRIDES` in `lib/maps.ts`, which maps the `4year`
  citation to the certificate code `longterm`.

**`type` is read from the matched `AWARDS` entry, never from the CSV's
`Award Type` column.** That column is discarded on parse.

### 4.3 Roles

`promotions[].role` is free text with no canonical list, displayed verbatim.
Only unambiguous typos are corrected; distinct historical titles
(`Section Leader` vs `Section Commander`, `Squadron Commander` vs
`Squadron Commanding Officer`) are left exactly as written.

| CSV | Stored |
|---|---|
| `Adjudant` | `Adjutant` |
| `FireTeam Leader` | `Fireteam Leader` |
| `Platoon Signallar` | `Platoon Signaller` |
| `Machinegunner` | `Machine Gunner` |
| `Driver / Rifleman` | `Driver/Rifleman` |
| `Driver/ Rifleman` | `Driver/Rifleman` |

An empty `Role` cell stores `''`, matching what the field already holds for
records imported without one.

## 5. Member resolution

`client.buildOrbatLookup()` is not reused. It keys members by
`name || nickname || globalName` and silently lets a later member overwrite an
earlier one on a key collision — which is how "Bones" resolves to the
`isobones` account that joined in 2026 rather than the `reality_bites` account
holding 7 promotions. For an ORBAT import that mis-seats someone until the next
sync, that is tolerable. For a one-way overwrite of a service record it is not.

This importer builds its own index that **collects all claimants per key
instead of overwriting**, and treats a contested key as unresolved. Keys per
member, all lowercased and stripped of `[...]` and `(...)` decorations:

- `name`
- `guild.nickname`
- `guild.nickname` with a leading known rank abbreviation removed
- `globalName`
- `username`

That rank-stripping key is what lets `Dave` and `Grubby` resolve — both have no
`name` and a nickname of `REC Dave` / `REC Grubby`.

Against the live database this yields **176 unique, 8 contested, 3 unmatched**.
All 11 are skipped and named. The importer never creates a user and never
writes to a member it did not resolve to exactly one candidate.

| Outcome | Names |
|---|---|
| Contested | Billy, Bones, Enfield, Formula, Goose, Odin, Sal, Wedgetail |
| Unmatched | BobbittiHaxs, Gyphorim, Nutpriom |

## 6. Ordering

Records are written **sorted ascending by date**, ties broken by the order the
rows appear in the file. The CSV groups each member's rows by record type and
then alphabetically by award name, which would otherwise store a member's
history in an order that reads as nonsense and, worse, would make
`rankAbbrAt()` in the certificate route scan an unsorted list.

Rows with an unparseable date sort last — but the only such row is skipped
anyway, so this is a property of the sort, not a case that occurs.

## 7. Fields deliberately left alone

**`milpac.promotionPoints`.** `resolvePromotionPoints()` recomputes the total
live from `milpac.awards` whenever `milpac.billetCounts` exists, so replacing
the awards array already updates every points figure the site displays. Only
2 members repo-wide hold promotion or award data without `billetCounts`, and
one of them (Goose) is a contested name this importer never touches — so
**exactly one member, Selmesy, ends the run with a stale stored scalar.**
Writing a recomputed value would invent a number from counts that do not
exist; the report names the affected members so J4 can correct them by hand.

The report derives that list — resolved members lacking `billetCounts` — from
the run itself rather than restating the name above, so it stays correct if the
data changes before the importer is run.

**`milpac.uniformHash`.** No action needed. `milpac-file.tsx` compares a freshly
computed hash against the stored one on every profile view and regenerates the
portrait when they differ, so replaced awards produce a correct uniform on next
view without the importer touching the field.

## 8. Code layout

The alias tables must be *validated against* `AWARDS` and `RANK_GROUPS`. A
plain `.mjs` under `scripts/` cannot import either, and restating 44 award
labels inside a migration script is precisely the drift `lib/README.md` exists
to prevent. So the logic lives in `apps/web/lib` as TypeScript and the runner
becomes a TypeScript script.

| File | Responsibility | Depends on |
|---|---|---|
| `apps/web/lib/military/history-import.ts` | CSV parse, the three alias tables, issuer-by-date, record building. Pure — no DB, no fs, no clock. | `@asot/lib` (ranks), `./awards` |
| `apps/web/lib/military/history-match.ts` | Member key index, contested/unmatched detection. Pure — takes plain objects, not a DB handle. | `@asot/lib` (rank abbreviations) |
| `apps/web/lib/military/history-import.test.ts` | Unit tests for both modules. | vitest |
| `apps/web/scripts/import-member-history.ts` | Runner: reads the CSV, connects to Mongo, prints the report, writes only under `--commit`. | both modules, `mongodb` |

`apps/web/lib/military/history-import.test.ts` is collected by the existing
`npm run test:unit` (`include: ['lib/**/*.test.ts']`) with no config change.

### Running it

`tsx` is added to `apps/web` devDependencies — the repo has no TypeScript
script runner today, and Node's `--experimental-strip-types` will not resolve
the `@asot/lib` and `@/` path aliases these modules use.

```jsonc
// apps/web/package.json
"import:history": "dotenv -e ../../.env -- tsx scripts/import-member-history.ts"
```

The importer is also registered in `scripts/start.mjs` under Migrations, since
`npm start` is this repo's stated front door for running anything.

```
npm --prefix apps/web run import:history -- ../../ASOT_Member_History_Master_Batch_12.csv
npm --prefix apps/web run import:history -- ../../ASOT_Member_History_Master_Batch_12.csv --commit
```

The CSV path is a required argument. `ASOT_Member_History_*.csv` at the repo
root is git-ignored — it is member data, not source, on the same reasoning as
`/storage`.

## 9. The report

Printed identically on a dry run and a commit, before any write. It is the
audit artifact; the input file is not tracked, so the report is what records
what happened.

```
MEMBER HISTORY IMPORT — DRY RUN (no changes written; pass --commit to write)

Source   ASOT_Member_History_Master_Batch_12.csv
Rows     1858 parsed

Members
  176  resolved            → will be rewritten
    8  contested (skipped)   Billy, Bones, Enfield, Formula, Goose, Odin, Sal, Wedgetail
    3  unmatched (skipped)   BobbittiHaxs, Gyphorim, Nutpriom

Records
  1137  promotions
   635  awards
    84  rows skipped — unresolvable member
     2  rows skipped — unusable row
           Talon      no date
           Stone      unknown rank "Stone"

Normalisation
    28  rank spellings corrected     (14 distinct)
    65  award spellings corrected    (22 distinct)
    34  role spellings corrected      (6 distinct)

Issuers
   199  Thomas (Major)          → 2023-01-01
   184  Trew (Major)     2023-01-01 → 2023-09-02
   540  Jazz (Major)     2023-09-02 → 2025-01-01
   580  Six (Brigadier)  2025-01-01 → 2026-01-01
   270  Six (Major General)  2026-01-01 →

Warnings
     1  rewritten member has no billetCounts; their stored promotionPoints
        will be stale after this run and needs a manual J4 correction:
           Selmesy (dealak)
```

The rank table in §4.1 lists all 16 CSV variants, but only 14 fire against the
resolved set — the remaining two appear solely on rows belonging to skipped
members. The table stays complete on purpose: it documents the file, and it is
already correct if one of those names is resolved later.

Every count in that block is derived, not asserted — a discrepancy between the
report and the run is impossible because the report is printed from the same
built records the write consumes.

## 10. Testing

Unit tests, in `history-import.test.ts`, run by `npm run test:unit`. No test
touches Mongo; the runner is thin by design and is exercised by its own dry run
against the real database.

**The load-bearing tests — the ones that catch a wrong import rather than a
broken function:**

- Every value in `RANK_ALIASES` exists in `RANKS_FLAT`. Every value in
  `AWARD_ALIASES` exists as an `AWARDS[].label`. These fail the suite if an
  award or rank is ever renamed, instead of the importer silently writing a
  label that renders no ribbon.
- No alias *key* is itself already canonical — a redundant entry means the
  canonical list moved and the table was not updated.
- An award resolves to the `type` from `AWARDS`, and a record whose CSV
  `Award Type` cell contradicts it still gets the canonical type.
- A date on a window boundary (`2023-01-01`, `2025-01-01`, `2026-01-01`)
  resolves to the *later* officer.
- A date before the mapping's start (2020-08-14) resolves to Thomas.
- An unknown rank, an unknown award and an empty date each produce a skip with
  a reason, and no partial record.
- The stored date string is byte-identical to the CSV cell.
- Records come back sorted ascending by date.
- A key claimed by two members resolves to neither, and both are reported —
  the `buildOrbatLookup` bug this module exists to avoid.
- A member whose only identifying field is a rank-prefixed nickname
  (`REC Dave`) resolves.
- CSV parsing handles the quoted commas that every `Campaign Medallion, Nth
  Clasp` row contains, and strips the file's UTF-8 BOM.

## 11. Rollback

A backup is taken through the existing J4 backups tab before the `--commit`
run. The importer does not take its own — the backup system already covers
exactly this, and a second half-implemented snapshot mechanism would be worse
than using the one that is tested.
