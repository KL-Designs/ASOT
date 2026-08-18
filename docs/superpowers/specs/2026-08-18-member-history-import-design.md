# Member History Import — Design

Replaces every serving member's promotion history and awards with an accurate
record extracted from the unit's pre-website systems, supplied as
`ASOT_Member_History_Master_Batch_12.csv` (1,858 rows, 187 members,
2020-08-14 → 2026-06-05).

## Goal

The `milpac.promotions` and `milpac.awards` arrays on `User` were populated by
the Billet Mastersheet import, which carries no dates for promotions and no
issuing officer for anything. The CSV has both. This is a one-off backfill: for
every member the CSV covers, drop what is stored and write the CSV's record in
its place, with the issuing officer derived from the date.

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
- **Automatic resolution of ambiguous names.** The 11 the index cannot settle
  are decided by hand, once, and recorded in the override table in §5. The
  importer does not fuzzy-match, score candidates, or fall back to a heuristic
  — guessing which "Goose" earned a medal is worse than refusing to import.
- **Members the CSV does not cover.** 6 members hold promotion or award data
  and are not written by this run: Jazz (`jazzbot`), Jetz (`bone_daddy0117`),
  Taye (`crustymuffin69`), NakedSnake (`brownakira`), and the two superseded
  duplicate accounts in §12. They are never read and never written.
- **Merging or cleaning up duplicate Discord accounts** — see §12.
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

**Dry run is the default.** The importer reports and exits. `--apply` is
required to write. This is the single most destructive operation in the repo
that is not the backup restore, and it must not be possible to run it by
autocomplete.

Expected outcome, verified against the live `ASOT` database:

| | |
|---|---|
| Members rewritten | **187 — every member in the file** |
| Promotions written | 1,201 |
| Awards written | 655 |
| Rows skipped — unusable row data | 2 |

Every one of the file's 1,858 rows is accounted for: 1,856 written, 2 skipped.
Nothing is dropped silently, and the importer asserts that identity before it
writes — a row that is neither written nor explicitly skipped is a bug, not a
rounding difference.

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

There is no role list in `lib` at all. The authority is the live ORBAT: the
`orbat_roles` catalog (38 names) and the `role` strings on `orbat_positions`
(39 distinct, of which `Active Reservist` and `Inactive Reservist` exist only
as seats). **34 CSV roles match that union exactly, covering 1,018 rows.**

The remaining 32 split into two kinds, and the split is the whole design here.

**Kind one — a role that still exists under a different name.** Aliased, 159
rows:

| CSV | Stored | Basis |
|---|---|---|
| `Machine Gunner` | `Machinegunner` | catalog; 12 live seats |
| `Section Medic` | `Rifleman (CFA)` | the CFA suffix is the current form |
| `Rifleman/Driver` | `Rifleman` | |
| `Driver/Rifleman` | `Rifleman` | |
| `Driver / Rifleman` | `Rifleman` | |
| `Driver/ Rifleman` | `Rifleman` | |
| `Game Master` | `Zeus` | every `gamemaster` seat is `Zeus` |
| `Game Master Lead` | `Zeus - Team Leader` | catalog; 1 live seat |
| `Game Master 2iC` | `Zeus - Team Leader` | no separate 2iC seat exists |
| `Aircrewman` | `Crewman` | catalog; 11 live seats |
| `Engineer` | `Sapper` | ECHO's catalog role; 8 live seats |
| `Sapper Medic` | `Sapper (CFA)` | same CFA pattern as `Section Medic` |
| `Squadron Commanding Officer` | `Squadron CO` | live seat |
| `Squadron Executive Officer` | `Squadron XO` | live seat |
| `Section Leader` | `Section Commander` | catalog; 11 live seats |
| `Company Officer Commanding` | `Officer Commanding` | catalog; 1 live seat |
| `Platoon Signallar` | `Platoon Signaller` | spelling |
| `FireTeam Leader` | `Fireteam Leader` | spelling |
| `Adjudant` | `Adjutant` | spelling |
| `Engineering Sergeant` | `Engineer Sergeant` | spelling; the target is itself historical |

**Kind two — a billet the unit no longer has.** Stored exactly as written:

`Battery Commander`, `Battery 3IC`, `Engineer Sergeant`, `Aviation Commander`,
`Wing Leader`, `Company Executive Officer`, `Trooper`, `Trooper/Driver`,
`Driver`, `Gunnery Sergeant`, `Sapper (CFA)`.

These are deliberately *not* forced into the nearest surviving catalog entry.
A service record states what the member actually held; bending
`Battery Commander` into `Troop Commander` because artillery was restructured
afterwards would record a posting that never happened. The role field is free
text and rendered verbatim, so preserving them costs nothing.

An empty `Role` cell stores `''`, matching what the field already holds for
records imported without one. Exactly one row has an empty role, and it is
Talon's undated row, which is skipped anyway.

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

Against the live database the index alone yields **176 unique, 8 contested, 3
unmatched**. The 11 it cannot settle are resolved by an explicit override
table, adjudicated one at a time against Discord join dates, existing stored
history, ORBAT seating and the rank each record ends on:

| CSV name | → username | Deciding evidence |
|---|---|---|
| `BobbittiHaxs` | `bobittihaxs` | Stored history and CSV both start 2023-03-10; both end at rank `Air Marshal` |
| `Gyphorim` | `.gryphorim.` | Both start 2025-02-16; both end at `Trooper Proficient` |
| `Nutpriom` | `nutpirom` | Range identical at both ends, 2024-07-28 → 2026-03-07 |
| `Sal` | `salpacino` | Joined 2026-02-21, first record 2026-02-24. The rival `sillysal420` is nicknamed *Zelvtic* — a different person |
| `Goose` | `mastergoose123` | Range identical at both ends, 2025-05-18 → 2025-12-05; the other two joined in 2026 |
| `Odin` | `odinv9.` | Discord join and first record share a day, 2025-02-09 |
| `Enfield` | `tally.enfield` | The rival is nicknamed `Etched [OLD ACC]` |
| `Bones` | `reality_bites` | Holds 7 promotions starting on the CSV's exact first date |
| `Wedgetail` | `falcon7589` | The real Discord member; the rival is a skeleton account from an earlier failed import |
| `Billy` | `farmingtons9` | Stored history starts on the CSV's exact first date; joined the next day |
| `Formula` | `rjfrg` | One person, two accounts with identical nicknames; this is the one seated in the ORBAT |

With the override table applied, **all 187 members resolve** and every row in
the file belongs to someone. The importer still never creates a user, and a
name that is contested *and* absent from the override table is skipped rather
than guessed — the table is an input, not a fallback.

Two of these decisions have a visible consequence, recorded in §12.

**The override table is validated, not trusted.** Each username must exist,
and no two CSV names may resolve to the same member. Both are startup checks
that abort the run, because either failure silently merges two people's
service records.

## 6. Ordering

Records are written **sorted ascending by date**, ties broken by the order the
rows appear in the file.

The source is not in date order and visibly so — Koda's award rows run
04 October 2025, then 07 June 2025, then 06 December 2025. The CSV groups each
member's rows by record type and then alphabetically by award name, which would
otherwise store a service record that reads as nonsense and, worse, would make
`rankAbbrAt()` in the certificate route scan an unsorted list.

Rows with an unparseable date sort last — but the only such row is skipped
anyway, so this is a property of the sort, not a case that occurs.

## 7. Fields deliberately left alone

**`milpac.promotionPoints` — written, but only for members who have no
`billetCounts`.**

`resolvePromotionPoints()` recomputes the total live from `milpac.awards`
whenever `billetCounts` exists, and 169 of the 187 members have it. For those,
replacing the awards array updates every points figure the site shows and
writing the scalar would be redundant.

The other **18 have neither `billetCounts` nor any stored `promotionPoints`**
— they were never in a Billet Mastersheet. `resolvePromotionPoints()` returns
`promotionPoints ?? 0` for them, so as originally specified they would import
their awards and still display **0 points**. That is not a stale number, it is
a visibly wrong one, on 18 profiles.

Because these members have no recorded attendance, awards are their entire
score, so the correct total is exactly what the live formula produces with the
op and department counts at zero:

```
calculatePromotionPoints({ ...allCountsZero, awards, qualifications,
                           j4Points, disciplineDeductions })
```

The importer writes that value **only when `billetCounts` is absent**. A member
who has `billetCounts` never gets the scalar written, because the live path
already ignores it and writing one would leave a misleading number in the
document. Which branch applied is reported per member.

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
| `apps/web/lib/military/history-vocab.ts` | The three alias tables and their resolvers. Pure. | `@asot/lib` (ranks), `./awards` |
| `apps/web/lib/military/history-import.ts` | CSV parse, issuer-by-date, record building and sorting. Pure — no DB, no fs, no clock. | `./history-vocab`, `@/lib/orbat/csv-parser` |
| `apps/web/lib/military/history-match.ts` | Member key index, override table, contested/unmatched detection. Pure — takes plain objects, not a DB handle. | `@asot/lib` (rank abbreviations) |
| `apps/web/lib/military/history-{vocab,import,match}.test.ts` | Unit tests, one per module. | vitest |
| `apps/web/scripts/import-member-history.ts` | Runner: reads the CSV, connects to Mongo, prints the report, writes only under `--apply`. | all three modules, `mongodb` |

The vocabulary tables sit in their own file rather than inside
`history-import.ts` because they are the part with the guard tests, and they
are what a reviewer needs to read on its own — roughly 60 entries whose whole
job is to be checked against the canonical lists.

Those tests are collected by the existing `npm run test:unit`
(`include: ['lib/**/*.test.ts']`) with no config change.

### Running it

`tsx` is added to `apps/web` devDependencies — the repo has no TypeScript
script runner today, and Node's `--experimental-strip-types` will not resolve
the `@asot/lib` and `@/` path aliases these modules use.

```jsonc
// apps/web/package.json
"import:history": "dotenv -e ../../.env -- tsx scripts/import-member-history.ts"
```

The importer is registered in `scripts/start.mjs` under Migrations, since
`npm start` is this repo's stated front door for running anything.

**The flag is `--apply`, matching every other migration in the repo.**
`runMigration()` in `start.mjs` runs a migration once bare for a dry run, asks
for confirmation naming the target database, then re-runs it with `--apply` —
which is exactly this importer's flow. Inventing a second flag name would mean
special-casing the one migration that most needs the confirmation step.

`runMigration()` currently hardcodes `node <script>`, so it gains an optional
`command`/`args` pair on the item, defaulting to today's behaviour. That is
the smallest change that lets a non-`node` migration join the menu.

```
npm --prefix apps/web run import:history -- ../../ASOT_Member_History_Master_Batch_12.csv
npm --prefix apps/web run import:history -- ../../ASOT_Member_History_Master_Batch_12.csv --apply
```

The CSV path is a required argument. `ASOT_Member_History_*.csv` at the repo
root is git-ignored — it is member data, not source, on the same reasoning as
`/storage`.

## 9. The report

Printed identically on a dry run and an apply, before any write. It is the
audit artifact; the input file is not tracked, so the report is what records
what happened.

```
MEMBER HISTORY IMPORT — DRY RUN (no changes written; pass --apply to write)

Source   ASOT_Member_History_Master_Batch_12.csv
Rows     1858 parsed

Members
   176  resolved by index
    11  resolved by override table
     0  unresolved
   187  will be rewritten

Records
  1201  promotions
   655  awards
     2  rows skipped — unusable row
           Talon      no date
           Stone      unknown rank "Stone"
  1858  accounted for (1856 written + 2 skipped)   ✓ matches rows parsed

Normalisation
    30  rank spellings corrected
    66  award spellings corrected
   159  role spellings corrected
    11  historical roles preserved verbatim (no current equivalent)

Issuers
   201  Thomas (Major)          → 2023-01-01
   187  Trew (Major)     2023-01-01 → 2023-09-02
   558  Jazz (Major)     2023-09-02 → 2025-01-01
   613  Six (Brigadier)  2025-01-01 → 2026-01-01
   297  Six (Major General)  2026-01-01 →

promotionPoints
   169  recomputed live from billetCounts — not written
    18  written (awards-only total; member has no billetCounts)
```

Two properties of that block matter more than its contents.

**The `accounted for` line is an assertion, not a summary.** Written plus
skipped must equal rows parsed. The importer checks it and aborts before any
write if it fails, which is what makes "nothing was silently dropped" a
guarantee rather than a hope.

**Every count is derived from the built records the write consumes**, so the
report cannot disagree with what happens next.

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
- An override entry beats a contested key, and an override naming a username
  that does not exist aborts rather than silently resolving to nothing.
- Two CSV names resolving to the same member aborts. This is the failure that
  merges two people's service records, and it is unrecoverable after the write.
- A member whose only identifying field is a rank-prefixed nickname
  (`REC Dave`) resolves.
- A role with no current equivalent (`Battery Commander`) is stored unchanged,
  and a role with one (`Section Medic`) is not.
- `promotionPoints` is written when `billetCounts` is absent and omitted from
  the update when it is present — both branches, since writing the wrong one
  is silent either way.
- CSV parsing handles the quoted commas that every `Campaign Medallion, Nth
  Clasp` row contains, and strips the file's UTF-8 BOM.

## 11. Rollback

A backup is taken through the existing J4 backups tab before the `--apply`
run. The importer does not take its own — the backup system already covers
exactly this, and a second half-implemented snapshot mechanism would be worse
than using the one that is tested.

## 12. Duplicate accounts this surfaced

Adjudicating the contested names turned up people holding two Discord accounts.
Resolving each name to one account necessarily leaves the other holding a
partial record, and this importer does not touch accounts it was not pointed at.

| Person | Written to | Left holding | Why |
|---|---|---|---|
| Formula | `rjfrg` | `rjfarl` — 3 promotions, 1 award | Both nicknamed `PTE(P) Formula [J1] [J5]`; `rjfrg` is the seated account |
| Goose | `mastergoose123` | `goosethetwingo` — 2 awards | `mastergoose123` matches the CSV's date range exactly on both ends |

**Neither Formula nor Goose is still in ASOT, so this is left alone.** The
superseded account keeps its partial record and nobody looks at it. Merging or
discharging an account is a different operation and buys nothing for two people
who have left; if it is ever wanted, it is a separate change and not a
prerequisite for this one.

Two more are worth a separate look for the same reason: **`Odin` and `Bones`
each resolved to the account holding the history, while the *other* account is
the one currently seated in the ORBAT.** That means the ORBAT import matched
the wrong account for both. It does not affect this import — the service record
belongs where the history is — but the seating is wrong today and will stay
wrong until someone fixes it.
