# MilPac Public Profile Redesign — Investigation & Plan

**Branch:** `feat/milpac-profile-redesign`
**Status:** investigation + plan only. **No repo files were edited, created or deleted.**
**Date:** 2026-08-17

**Target design:** `d:\Projects\ASOT\profile.html` (untracked, 1074 lines, standalone mockup)
**Current page:** `apps/web/app/(landing)/milpacs/[username]/page.tsx` (820 lines)

Legend used throughout:
- **VERIFIED** — I read the code/asset and confirmed it.
- **INFERRED** — reasoned from what I read, not directly confirmed.
- **EXISTS** — the data is in the DB / derivable today, no backend work.
- **NEEDS BACKEND** — new schema field, new route, or new derivation logic required.
- **DROP** — mockup-only invention with no real source; recommend removing.
- **DECISION** — the user must choose; cannot be resolved automatically.

---

## 0. Executive summary

The mockup is a *pretty shell around a hand-typed JSON blob*. Every panel renders
from one `DEFAULT` object (`profile.html:617-678`) that an Edit Profile drawer
writes back into (`profile.html:1014-1062`). Nothing is fetched.

The good news: **the majority of what the mockup displays already exists in the
database**, and the current page already renders most of it — often with better
fidelity than the mockup (real ribbon PNGs vs CSS gradients, real rank artwork vs
hand-drawn SVG chevrons).

The three panels with **no real data behind them at all** are:
- **Assigned Loadout** (8 kit rows) — nothing in any collection records a member's gear.
- **Commendations & Remarks** (free-text citations from named officers) — the closest
  real data is staff-only ticket text; publishing it is a privacy decision.
- **Notable Operations** (narrative paragraphs per op) — op names/dates exist, the
  narrative does not.

Plus a handful of individual invented fields: service number, field hours, ops led,
attendance %, YouTube/Twitch links, and the `available`/"of N scheduled" denominator
in the Combat Record chart.

**Counts (see §1 for the table):** 66 distinct display fields inventoried —
**41 EXISTS** (in the DB or derivable with no schema change), **17 NEEDS BACKEND**,
**8 DROP**. 14 carry a **DECISION** the user must resolve (§8).

Two findings worth reading first:
- **`getOrbatEntryByUserId()` throws away data the redesign needs.** It reads the full
  `OrbatPosition` but returns only `{ role, section }`
  (`apps/web/lib/orbat/index.ts:22-25, 115-126`), discarding `category` — which is
  simultaneously the *platoon name* (#3) and the *active-vs-inactive reservist status*
  (#18). One field on the return type unlocks both.
- **The corps badge is already computed on the page and never rendered** —
  `const badge = uniformData.badge` at `page.tsx:186` is dead. That is the mockup's
  "MOS" field (#61), available at zero cost.

---

## 1. (a) Field-by-field inventory

Column meanings:
- *Mockup source* — where `profile.html` gets it.
- *Real source today* — exact collection + field path, verified against
  `types/user.d.ts`, `apps/web/types/*.d.ts` and `lib/`.

### 1.1 Theme / chrome

| # | Field | Mockup source | Real source today | Verdict |
|---|---|---|---|---|
| 1 | Accent colour | `DEFAULT.accent` `#d4a03a` + drawer swatch picker (`profile.html:717`, `1024-1028`) | `Db.users` → `hexAccentColor` (root `types/user.d.ts:28`), passed through `ensureVisible()` (`apps/web/lib/discord/color.ts:9`) by `resolveMilpacProfile()` (`apps/web/lib/military/milpac-profile.ts:6`). Synced from Discord by `apps/bot`. Fallback `#db001d`. | **EXISTS** — the mockup's fixed palette must be replaced by CSS custom properties fed from `accent`. See §6.1. |
| 2 | `--acc-rgb` (rgba tints) | `hexToRgb()` at render (`profile.html:822-823`) | Derive from the same `accent`. Current page instead uses hex-alpha suffixes (`${accent}cc`, `${accent}80`, `${accent}18`…) — 40+ occurrences in `page.tsx`. | **EXISTS** |
| 3 | Unit / crest strapline `"2-44 IN · TASK FORCE RAVEN"` | `DEFAULT.unit`, drawer-editable | **Fully derivable and currently discarded.** `OrbatPosition.category` (`apps/web/types/orbat.d.ts:34`) maps to a human platoon label via `PLATOON_CATEGORIES` (`apps/web/lib/orbat/constants.ts:1-7`): `companyHQ`→"India Company HQ", `platoon11`→"Platoon 1-1 Infantry", `platoon12`→"Platoon 1-2 Infantry", `support`→"Platoon 1-3 Support", `gamemaster`→"Gamemasters". `getOrbatEntryByUserId()` reads the position but **returns only `{role, section}`** (`apps/web/lib/orbat/index.ts:22-25, 115-126`). | **EXISTS** — one extra field on `OrbatEntry`. Render as `{platoon} · {section}`. |
| 4 | Breadcrumb `PERSONNEL / R-0127` | `DEFAULT.svcNum` | No service number exists (see #26). | **DROP** or NEEDS BACKEND |
| 5 | Film grain / vignette / `rise` animations | pure CSS (`profile.html:43-46`, `348-353`) | n/a | **EXISTS** (pure frontend) |

### 1.2 Hero

| # | Field | Mockup source | Real source today | Verdict |
|---|---|---|---|---|
| 6 | Banner image | `DEFAULT.banner` — drawer URL field + file upload → data URI (`profile.html:551-554`, `1038-1046`) | `storage/uploads/cover/{member.id}.png`, served by `GET /api/uploads/cover?id=` (`apps/web/app/api/uploads/cover/route.ts:6`). Existence checked at `page.tsx:227`. Fallback `public/images/home/Droneteam7.png` (`page.tsx:15,304`). Self-upload only, via `CoverUpload` gated on `isOwn` (`page.tsx:306`). | **EXISTS** — drawer's URL field must go; keep the existing upload button. |
| 7 | Built-in SVG banner scene (when no image) | inline SVG (`profile.html:407-435`) | Current fallback is a real photo. | **DECISION** — keep the photo (recommended) or adopt the SVG scene. |
| 8 | Avatar | `DEFAULT.avatar` — drawer URL + upload | `Db.users` → `avatarURL` / `avatar` (root `types/user.d.ts:31-32`), rendered by `components/member/avatar` (`page.tsx:358`). Discord-driven. OG image builds the CDN URL directly (`opengraph-image.tsx:36-38`). | **EXISTS** — satisfies requirement 5 (Discord identity, never user-editable). Drop the drawer's avatar fields. |
| 9 | Silhouette placeholder avatar | inline SVG (`profile.html:775-791`) | `defaultAvatarURL()` in `lib/discord/avatar` (`opengraph-image.tsx:5`) | **EXISTS** |
| 10 | Rank abbreviation | `DEFAULT.rank` — drawer `<select>` of 13 US Army ranks (`profile.html:560`, `701-715`) | `Db.users` → `milpac.currentRank` (root `types/user.d.ts:101`); fallback = first token of the stripped Discord nickname (`milpac-profile.ts:14,21`). Canonical rank list is `RANK_GROUPS` in `lib/ranks.ts` (99 abbreviations, `as const`), exported via `@asot/lib`. | **EXISTS** — the mockup's `RANKS` table must be deleted and replaced by `@asot/lib`. Rank is J4-only editable (`PERMISSIONS.members.editRestricted`), never self-service. |
| 11 | Full rank name | `RANKS[abbr].full` | `rankNameFromAbbr()` (`lib/ranks.ts:240`), with a fallback chain in `milpac-profile.ts:17-19`. | **EXISTS** |
| 12 | Rank insignia graphic | hand-drawn SVG chevrons/bars (`profile.html:752-773`) | **Real artwork exists**: `apps/web/public/milpac-assets/imge/Rank/{ABBR}/{ABBR}*.png` (VERIFIED: `Rank/CPL/` holds `CPL.png CPLJ CPLL CPLP CPLS CPLV…`). **Caveat (VERIFIED):** these are **1398×1000 full-canvas uniform layers**, not standalone icons. | **EXISTS but needs a crop** — same class of problem `MEDALLION_CROP` already solves in `page.tsx:97-121`. See §7 risk R6. |
| 13 | Name (`first` / `last`) | two drawer inputs, rendered as `${rank} ${last}, ${first}` (`profile.html:850`) | Single field: `Db.users` → `name`, else parsed from the stripped Discord nickname (`milpac-profile.ts:8-13`). Editable only via `PUT /api/members/[username]` under `members.editStandard`. | **EXISTS** — must become a single `name`; there is no first/last split and inventing one is a migration nobody needs. |
| 14 | Callsign | drawer input | `User.milpac.callsign` **is declared** (root `types/user.d.ts:102`) but **VERIFIED: nothing anywhere writes it** — no route, script, importer, or the MilpacEditor. It is read in exactly one place, `apps/web/app/me/page.tsx:38`, where it is therefore always null. What the profile page labels "callsign" is really the section: `callsign = orbatEntry?.section` (`milpac-profile.ts:23`). | **EXISTS (as section)** + **DECISION** — `milpac.callsign` is dead code. Either delete it or make it a real, writable field (NEEDS BACKEND). |
| 15 | Billet / role | drawer input | `getOrbatEntryByUserId()` → `OrbatEntry.role` (`apps/web/lib/orbat/index.ts:22-25`), from `Db.orbatPositions`. Distinct from the J4 "billet" concept (`BilletExtra.billet`, `apps/web/types/mastersheet.d.ts:4-13`), which is free text from a CSV import and is J4-gated. | **EXISTS** |
| 16 | Element | drawer input | `OrbatEntry.section` — a *derived label*, not the raw field: `companyHQ`→"India Company HQ", `activeReservist`/`inactiveReservist`→**both collapsed to** "Company Reservists" (`lib/orbat/index.ts:119-125`), `gamemaster`→"Gamemasters", else `pos.sectionTitle`. | **EXISTS** — note the reservist collapse discards the active/inactive distinction (see #18). |
| 16b | Section patch image + section colour | not in the mockup | `Db.orbatSectionMeta` → `OrbatSectionMeta.patch` (patch image filename) and `.color` (hex) (`apps/web/types/orbat.d.ts:49-57`). Already used by the `/milpacs` roster and the public ORBAT board — **unused on the profile page**. | **EXISTS — new opportunity.** A real section patch beside the corps badge would carry the mockup's "unit crest" idea with genuine artwork. |
| 17 | Timezone | drawer input, free text `"UTC+10 AEST"` | `Db.users` → `timezone` (IANA, root `types/user.d.ts:80`), set at `/me` via `TimezoneSelector` → `POST /api/me` (`apps/web/app/api/me/route.ts:30-36`). | **EXISTS** — but **DECISION**: it is currently a private setting used for reminder scheduling. Publishing it is a new disclosure. See §7 R2. |
| 18 | Status pill (ACTIVE / LOA / PROBATIONARY) | drawer `<select>` (`profile.html:561-563`) | Currently **hardcoded** `'Active'` (`page.tsx:496`). **VERIFIED: there is no unified member-status field.** Signals that do exist: `User.discharged` (root `types/user.d.ts:61-69`; the app-wide "active" filter is `discharged: { $exists: false }`, e.g. `apps/web/app/api/community/members/route.ts:17`); `OrbatPosition.category === 'activeReservist' \| 'inactiveReservist'` (`apps/web/lib/orbat/constants.ts:9-12`) — **the closest thing to an active/inactive status, and `getOrbatEntryByUserId` currently throws the distinction away**; `isSkeletonAccount` (root `types/user.d.ts:24`); `ClassificationSignals.finalClassification: 'active'\|'discharged'` (`apps/web/types/mastersheet.d.ts:15-23`, computed J4-side). **LOA exists only per-event** — `attendanceType: 'LOA'` on one op's record (`apps/web/types/attendance.d.ts:16-17`), an `loa` meeting RSVP status, and a trailing plain-text `"LOA"`/`"AWOL"` on the Discord nickname that is parsed only to *strip* it (`apps/web/lib/discord/index.ts:~105`). **PROBATIONARY does not exist at all** — zero repo hits outside the mockup. | **NEEDS BACKEND** + **DECISION** — see §3.1. |
| 19 | File pill / footer stamp | `DEFAULT.svcNum` | none | **DROP** (see #26) |
| 20 | Steam link | drawer URL input | **Not on the user document.** `steamId64` / `steamUrl` live on `Db.j1Applications` (`apps/web/types/j1.d.ts:20-21`), written by the public join flow (`apps/web/app/api/applications/route.ts:93-94`) which also stamps `linkedUserId: discordSession.id` (`:85`). So for site-era joiners it *is* recoverable. | **NEEDS BACKEND** — see §4. |
| 21 | Discord link | drawer input (`username or invite URL`) | `Db.users` → `username` / `id`. Link target `https://discord.com/users/{id}`. | **EXISTS** — satisfies requirement 5. Delete the drawer field. |
| 22 | YouTube link | drawer input | **Nothing anywhere.** | **NEEDS BACKEND** + **DECISION** — cannot be automatic. See §3.6. |
| 23 | Twitch link | drawer input | **Nothing anywhere.** | **NEEDS BACKEND** + **DECISION** — same. |

### 1.3 Stat strip (5 tiles) — `profile.html:872-880`

| # | Tile | Mockup source | Real source today | Verdict |
|---|---|---|---|---|
| 24 | Operations attended | `DEFAULT.ops` number input | `confirmedOps.length` from `Db.operationAttendance.find({ records: { $elemMatch: { userId, confirmed: true } } })` (`page.tsx:230-252`). Already the "Operations" stat tile (`page.tsx:407`). | **EXISTS** |
| 25 | Attendance rate % | `DEFAULT.attendance` number input | **Nothing computes this.** No denominator exists reliably across history — VERIFIED: `OperationAttendance.records[]` only contains a full roster for ops confirmed through the modern flow (`.../attendance/confirm/route.ts:61-73`); CSV-imported ops hold attendee-only rows (`.../attendance-import/route.ts:210-221`). | **NEEDS BACKEND** + **DECISION** — see §5.2. |
| 26 | Service number | `DEFAULT.svcNum` `"R-0127"` | **Nothing.** No member/file/service number concept in any collection. | **DROP** (recommended) or NEEDS BACKEND + migration to backfill every member. |
| 27 | Time in service | `span(enlisted, AS_OF)` | Derive from `milpac.enlistedDate` (root `types/user.d.ts:103`) falling back to `guild.joinedTimestamp` (`:44`) — the exact fallback already at `page.tsx:276-279`. | **EXISTS** (derived) |
| 28 | Awards & decorations count | `P.awards.length` | `milpac.awards[].length` (root `types/user.d.ts:118-126`) | **EXISTS** |
| 29 | Qualifications held count | `P.quals.filter(k!=="wip").length` | `milpac.qualifications[].length` (root `types/user.d.ts:131-136`) | **EXISTS** — the "wip"/in-progress notion has no source; see #45. |

### 1.4 Personnel Summary panel

| # | Field | Mockup source | Real source today | Verdict |
|---|---|---|---|---|
| 30 | Biography text | `DEFAULT.bio` drawer textarea | `Db.users` → `bio.content` (root `types/user.d.ts:96-98`). Self-edited inline by `BiographyEditor` → `POST /api/me` (`bio-editor.tsx:16-20`), 2000-char cap. Also used as the page `description` metadata (`page.tsx:164`). | **EXISTS** — this is the one field that legitimately stays user-authored. Keep the existing inline editor rather than a drawer. |
| 31 | Panel tag `"SFC Vasquez · R-0127"` | rank + last + svcNum | rank + name (drop svcNum) | **EXISTS** (partial) |

### 1.5 Combat Record panel

| # | Field | Mockup source | Real source today | Verdict |
|---|---|---|---|---|
| 32 | 12-month bar chart — *attended* per month | `DEFAULT.activity[i][1]`, hardcoded | Derivable: attendance docs → `operationId` → `Db.operations.date` (`apps/web/types/operation.d.ts:247`), bucket by month. | **EXISTS** (needs new aggregation code — see §5) |
| 33 | 12-month bar chart — *available/scheduled* per month (the grey capacity track) | `DEFAULT.activity[i][2]`, hardcoded | **No reliable denominator.** See #25. | **NEEDS BACKEND** + **DECISION** |
| 34 | Chart month labels / tooltip | computed | computed | **EXISTS** |
| 35 | Substat: Ops attended | `DEFAULT.ops` | same as #24 | **EXISTS** |
| 36 | Substat: Ops led | `DEFAULT.opsLed` number input | Partial signals only: `OperationAttendance.leadZeus` (`apps/web/types/attendance.d.ts:40`) = ops zeused; `Operation.ownedBy` (`apps/web/types/operation.d.ts:295`) = missions authored; `milpac.billetCounts.j2MissionsRun` = a hand-maintained counter. None is "led a section/platoon". | **NEEDS BACKEND** + **DECISION** — pick a definition (§3.4). |
| 37 | Substat: Deployments | `DEFAULT.deployments` hardcoded | Closest real concept: `Db.operationCampaigns` / `Operation.campaignId` (`apps/web/types/operation.d.ts:279`), or the fuzzy op-name grouping the current page already does (`page.tsx:695-723`). | **DECISION** — redefine as "campaigns" or drop. |
| 38 | Substat: Field hours | `DEFAULT.hours` `412` | **Nothing tracks play hours.** OCAP (`lib/ocap.ts`, `OCAP_API_URL`) records op replays and *might* expose durations, but nothing per-member exists in this repo. | **DROP** (recommended) |
| 39 | Substat: Citations | `DEFAULT.citations` `9` | Derivable: count `milpac.awards[]` whose `type` contains "Citation" — the `type` values come from `AWARDS` in `apps/web/lib/military/awards.ts` (`Service Citation`, `Operational Service Citation`, `Non-Operational Award`). | **EXISTS** (derived) |
| 40 | Substat: Attendance % | `DEFAULT.attendance` | see #25 | **NEEDS BACKEND** |

### 1.6 Notable Operations panel

| # | Field | Mockup source | Real source today | Verdict |
|---|---|---|---|---|
| 41 | Op date label | `DEFAULT.notableOps[].d` | `Db.operations.date` | **EXISTS** |
| 42 | Op title | `.t` | `Db.operations.title` (`apps/web/types/operation.d.ts:245`) | **EXISTS** |
| 43 | Narrative paragraph (`"Platoon sergeant, main effort. Held the eastern cut…"`) | `.x`, hand-written | **Nothing.** No per-member per-op narrative field. The op briefing is a collaborative Y.js doc gated to J2. **But:** `OperationAttendanceRecord` snapshots `unit`, `orbatSection` and `orbatRole` *as at that operation* (`apps/web/types/attendance.d.ts:9-11`) — a real, automatic third line ("1-1 Alpha · Section 2IC"). | **NEEDS BACKEND** or **DROP** — see §3.5. Option A is genuinely automatic. |
| 44 | `hi` highlight flag / "notable" | `.hi`, hand-set | **VERIFIED: no `notable`/`featured`/`highlight` field on `Operation`** (the repo's `featured` is gallery-only, `lib/permissions.ts:451,464`), and **no award is tied to an operation** — `milpac.awards[]` has no `operationId`. Automatic proxies that do exist: `Operation.ocap` (has an after-action recording → objectively a recorded op, links out via `OCAP_VIEWER_URL`), `Operation.campaignId`/`campaignMissionId` (campaign vs one-off), and `Operation.coverImage` + `themeColor` (`apps/web/types/operation.d.ts:219-222`) which give **real per-op artwork for a timeline card**. | **DECISION** — derive from `ocap`/`campaignId`, or NEEDS BACKEND. |

### 1.7 Qualifications panel

| # | Field | Mockup source | Real source today | Verdict |
|---|---|---|---|---|
| 45 | Qualification name | `DEFAULT.quals[].t` hardcoded | `milpac.qualifications[].qualification` (root `types/user.d.ts:133`). Canonical list = `CERTIFICATIONS` (`apps/web/lib/military/certifications.ts:7`, 24 entries with point values). | **EXISTS** |
| 46 | Qual "kind" chip styling (`lead` / `badge` / `wip`) | hand-tagged | No category field on a qualification. Could be derived from `CERTIFICATIONS[].points` tiers or from `QUAL_TO_BADGE` membership. "wip"/in-progress would need `Db.trainingRequests` / `Db.courseCandidates`. | **DECISION** — derive a category, or flatten all chips to one style. |
| 47 | Qual date | *(mockup drops it)* | `milpac.qualifications[].date` | **CARRY-OVER** (current page shows it) |
| 48 | Qual issued-by | *(mockup drops it)* | `milpac.qualifications[].issuedByName` | **CARRY-OVER** |
| 49 | Qual training-badge image | *(mockup drops it)* | `QUAL_TO_BADGE[qual]` → `trainingBadgeUrl()` (`page.tsx:45-50`) → `/milpac-assets/imge/Training Badges/{folder}/{code}.png`. **VERIFIED: these PNGs are 1398×1000 full-canvas layers** yet are drawn at 28×28 `objectFit: contain` (`page.tsx:601`). | **CARRY-OVER** + **BUG (INFERRED)** — the badge almost certainly renders as a near-invisible speck. See §7 R6. |

### 1.8 Awards & Decorations panel

| # | Field | Mockup source | Real source today | Verdict |
|---|---|---|---|---|
| 50 | Ribbon artwork | CSS `linear-gradient` stripes from a hand-written `RIBBONS` table (`profile.html:683-698`) | **Real ribbon PNGs**: `/milpac-assets/imge/Ribbons/{citation}.png` (VERIFIED 43×13 standalone icons), resolved by `AWARD_TO_CITATION` (`lib/maps.ts`, exported via `@asot/lib`). Already used at `page.tsx:638`. | **EXISTS — and strictly better than the mockup.** Keep the real art, keep the mockup's *rack* layout. |
| 51 | Award name / hover citation | `RIBBONS[code].n` | `milpac.awards[].name` | **EXISTS** |
| 52 | Award devices (oak leaf clusters, stars, numerals) | `DEFAULT.awards[i][1]` `{oak:2}` etc. | **No device concept.** Repeat awards are modelled as *separate award entries* (campaign clasps: `Campaign Medallion, First Clasp` … `Sixteenth Clasp`, `apps/web/lib/military/awards.ts:32-48`), and the renderer collapses them to the highest held (`data-mapper.ts:56-82`). | **DROP** — devices would duplicate the clasp model. |
| 53 | Medallions (Bronze/Silver/Gold Soldiers) | not modelled | `MEDALLION_ART` + `MEDALLION_CROP` crop of a 1398×1000 layer (`page.tsx:90-121`) | **CARRY-OVER** — the mockup rack has no slot for these. |
| 54 | Award type chip, issued-by, date | not modelled | `milpac.awards[].type` / `.issuedByName` / `.date` | **CARRY-OVER** |
| 55 | Award certificate viewer | not modelled | `CertificateViewer` → `GET /api/milpac/certificate/{username}?type=award&cert=…`, gated to logged-in members (`page.tsx:223,632`) | **CARRY-OVER** |

### 1.9 Service Data panel

| # | Field | Mockup source | Real source today | Verdict |
|---|---|---|---|---|
| 56 | Service number | drawer | none | **DROP** |
| 57 | Enlisted | drawer date | `milpac.enlistedDate` ‖ `guild.joinedTimestamp` (`page.tsx:276-279`). Written by mass-import (`.../mass-import/route.ts:396,441`), the J4 mastersheet inline edit (`.../j4/mastersheet/member-milpac/route.ts:61-62`) and `MilpacEditor.tsx:477,554`. **Free-form string** — see R11. | **EXISTS** |
| 58 | Time in service | derived | Derived from #57. A helper already exists: `serviceYears()` at `apps/web/app/api/admin/j4/mastersheet/billet/route.ts:8-18` (returns `"7M"` / `"2.4Y"`, handles both `DD/MM/YYYY` and `DD-MM-YYYY`). Staff-side today, trivially reusable. | **EXISTS** (derived) |
| 58b | Prior service / re-enlistment | not modelled | `Db.dischargeSnapshots` → `DischargeSnapshot` (`apps/web/types/discharge-snapshot.d.ts:1-18`): `enlistedDate`, `dischargeDate`, `dischargeType`, `rankAtDischarge`, `pointsAtDischarge`, a full `milpac` copy, and `archivedUniformPath`/`archivedMedalPath`. Plus `LeavingHistoryRecord` (`apps/web/types/mastersheet.d.ts:25-40`). J4-gated. | **EXISTS but staff-gated** — **DECISION** whether a returning member's prior service is public. |
| 59 | Time in grade | `DEFAULT.grade` hardcoded `2025-09-07` (no drawer field!) | Derive from the last entry of `milpac.promotions[].date` (root `types/user.d.ts:104-117`); the array is already treated as chronological (`milpac-profile.ts:18`). **VERIFIED: nothing computes this today.** Same free-form date caveat — see R11. | **EXISTS** (derived) |
| 60 | Element | drawer | `orbatEntry.section` | **EXISTS** |
| 61 | MOS `"11B — Infantryman"` | drawer input | Nearest real equivalent = **corps badge**, derived from the ORBAT section: `SECTION_TO_BADGE` (`lib/maps.ts:80-89`) → one of `BADGES` (`lib/types.ts:24-27`: Command, Echo, GM, Golf, Hotel, Infantry, Mike, Pronto, Victor), default `Infantry` (`lib/maps.ts:91`). Artwork at `/milpac-assets/imge/Corps/Corps Badges/{Badge}.png` (VERIFIED — 1398×1000, see R6). **It is already computed on the page and thrown away**: `const badge = uniformData.badge` at `page.tsx:186` is never rendered. | **EXISTS** (derived, zero new queries) — relabel "MOS" → "Corps". |
| 62 | Timezone / Status rows | drawer | see #17, #18 | mixed |

### 1.10 Assigned Loadout panel

| # | Field | Mockup source | Real source today | Verdict |
|---|---|---|---|---|
| 63 | 8 kit rows (primary, optic, sidearm, support, uniform, plate carrier, comms, ruck) | `DEFAULT.kit`, fully hardcoded (`profile.html:657-666`) | **Nothing.** No collection, field, or bot command records a member's loadout anywhere in the monorepo. | **DROP** (recommended) or a substantial **NEEDS BACKEND** — see §3.3. |

### 1.11 Commendations & Remarks panel

| # | Field | Mockup source | Real source today | Verdict |
|---|---|---|---|---|
| 64 | Author (`"CPT AINSLEY, M."`) | `DEFAULT.feed[].who` | Partially real: `milpac.awards[].issuedByName` + `.issuedByRank`; `milpac.promotions[].issuedByName`. | **EXISTS (partial)** |
| 65 | Date | `.when` | award/promotion `.date` | **EXISTS** |
| 66 | Type chip (Citation / Remark) | `.type` | award `.type` | **EXISTS (partial)** |
| 67 | Free-text remark body | `.x` | **Nothing public. VERIFIED: the word "commendation" does not appear anywhere in the repo.** Every written remark about a member is staff-gated: performance-report tickets (`Ticket.type: 'performance-report'` with `performanceReason`/`notes`/`actionNotes`, `apps/web/types/tickets.d.ts:3,44`; created at `.../admin/tickets/route.ts:421-453`, read gated by `PERMISSIONS.pages.admin` at `:32-34`); `milpac.disciplineHistory[].reason` (root `types/user.d.ts:140-148`) — **strictly never publishable**; `CandidateEventFeedback.positiveObservations`/`negativeObservations` (`apps/web/types/course-workspace.d.ts:66-79`); `PeerReviewSubmission.feedback` (`:153-178`); `CourseCandidate.notes` (`:29`). Awards carry `issuedByName`/`issuedByRank` but **no free-text citation body** — the "certificate" is a rendered template keyed off the award code. | **NEEDS BACKEND** + **hard privacy DECISION**. See §3.2 and §7 R1. |

---

## 2. (b) Carry-over list — everything the current page shows that the mockup has no slot for

Requirement 6: nothing currently displayed may be lost. All verified in
`apps/web/app/(landing)/milpacs/[username]/page.tsx`.

| # | Current feature | Where it lives now | Proposed home in the new layout |
|---|---|---|---|
| C1 | **Rendered uniform image** + click-to-zoom lightbox | `page.tsx:447-461`, `/api/milpacs/{id}`, `ImageLightbox` | **This is the page's centrepiece and the mockup has no slot at all.** Give it a dedicated left-rail panel above Service Data, or a new full-width "Service Dress" panel opposite Combat Record. |
| C2 | **Rendered medal box image** + lightbox | `page.tsx:462-473`, `/api/milpacs/{id}?type=medals` | Inside the Awards & Decorations panel, above the ribbon rack. |
| C3 | **Auto-regeneration side effect** — recompute `computeUniformHash`, re-render uniform + box, write to `storage/milpacs/`, persist `milpac.uniformHash` | `page.tsx:189-215` | Must be preserved verbatim, including the `try/catch` that stops a render-service outage 500-ing the page (`page.tsx:211-215`). |
| C4 | **Promotion history table** — date, rank, role, issued-by, per-row certificate ⤢ | `page.tsx:525-575` | New "Service Record" / "Promotions" panel in the main column, or a sub-table inside Service Data. The mockup's `Notable Operations` timeline component is a natural visual host. |
| C5 | **Promotion certificate viewer** (rank row + each history row) | `page.tsx:502-520`, `555-566` | Preserve, including the "only show the rank-row certificate when it isn't already in the history" logic (`page.tsx:504-507`). |
| C6 | **Promotion points** (`Points` row) | `page.tsx:521` | Service Data rows. |
| C7 | **Promotion progress bar** — current rank → next rank, `x/y pts`, accent-filled | `page.tsx:418-435`, driven by `getPromotionProgress()` (`page.tsx:124-139`) + `RANK_TRACKS` (`lib/military/promotion-requirements.ts`) | Under the stat strip, where the mockup's strip already spans full width. |
| C8 | **Live promotion-point recalculation** — `calculatePromotionPoints(billetCounts…) + calculateOpPoints(confirmedOps)` | `page.tsx:254-273` | Preserve as-is. |
| C9 | **Request Award button** (modal, award picker, notes) | `RequestAwardButton.tsx`, gated `me !== null && me.id !== member.id && !member.isSkeletonAccount` (`page.tsx:226`) | Hero action row, next to the Steam/Discord link chips. |
| C10 | **"View Original ↗"** link to `australianspecialoperationstaskforce.com/{name}` | `page.tsx:334-346` | Top bar, next to the crumb. |
| C11 | **"← Milpacs"** back link | `page.tsx:314-322` | Top bar (mockup has a crest + crumb there already). |
| C12 | **"Edit"** link to `/members/{username}` | `page.tsx:323-333`, gated `client.hasRoles(me, ['J5-Media'])` — **a hardcoded Discord role array, not a `PERMISSIONS` key** | Top bar. **Flag:** this bypasses `lib/permissions.ts` entirely (see §7 R5). |
| C13 | **Cover upload / remove** buttons | `CoverUpload`, gated `isOwn` (`page.tsx:306`) | Banner hover affordance — replaces the drawer's banner URL + upload fields. |
| C14 | **Inline biography editor** | `BiographyEditor`, gated `isOwn` (`page.tsx:481-482`) | Personnel Summary panel — replaces the drawer's bio textarea. |
| C15 | **Operation History**, grouped by fuzzy base name, `×N` expandable `<details>`, each linking to `/operations/{id}` | `page.tsx:694-768` (incl. `baseName()` normaliser at `:695-703`) | The mockup's Notable Operations timeline is a *display* upgrade but drops the grouping and the links. Keep a full "Operation History" panel below Combat Record. |
| C16 | **Stat bar**: Enlisted / Rank / Operations / Section | `page.tsx:404-414` | Absorbed by the mockup's 5-tile strip — verify all four survive. |
| C17 | **Qualification date + issued-by columns + badge image** | `page.tsx:584-611` | Qualifications panel — mockup chips must expand to carry these (tooltip or expandable rows). |
| C18 | **Award type chip, issued-by, date** | `page.tsx:653-667` | Awards panel — ribbon rack alone loses all three; add a list beneath the rack. |
| C19 | **Empty-state placeholders** ("No biography on record." etc.) | `Placeholder` at `page.tsx:814-820`, 5 call sites | Every panel in the new design needs one. |
| C20 | **`generateMetadata`** — title, description from bio, OG `siteName` = orbat role, Twitter card | `page.tsx:158-172` | Unchanged. |
| C21 | **`generateViewport`** — `themeColor` = accent | `page.tsx:151-155` | Unchanged. |
| C22 | **`opengraph-image.tsx`** — the 1300×630 accent-themed OG card | whole file | Unchanged; consider aligning its visual language with the new design. |
| C23 | **`loading.tsx`** | `apps/web/app/(landing)/milpacs/[username]/loading.tsx` | Unchanged. |
| C24 | **Medallion crop rendering** for the three Soldiers Medallions | `page.tsx:90-121` | Awards panel. |
| C25 | **`canViewCertificates` gate** (`me !== null`) | `page.tsx:223` | Preserve — anonymous visitors must not get click targets that 401. |

---

## 3. (c) What needs new backend, itemised

Each item states: the schema change, the route change, the permission key, the
migration, and — where the answer cannot be derived — the **DECISION** the user must make.

### 3.1 Member status (ACTIVE / LOA / PROBATIONARY / RESERVIST / DISCHARGED)

- **Schema:** new `User.memberStatus?: 'active' | 'loa' | 'probationary' | 'reservist_active' | 'reservist_inactive'` plus optional `loaUntil?: Date`, `loaReason?: string`.
- **Route:** a J1/J4-gated `PATCH` (new key, e.g. `members.setStatus`), plus a self-service "request LOA" path if wanted.
- **Migration:** backfill `active` for everyone; backfill reservists from ORBAT `activeReservists`/`inactiveReservists`; backfill `discharged` from the existing `User.discharged` sub-document.
- **Free today, no new field:** *discharged* (`User.discharged`), *skeleton* (`isSkeletonAccount`), and — with a one-line change — *active vs inactive reservist*. `getOrbatEntryByUserId()` reads `OrbatPosition.category` and then collapses `'activeReservist'` and `'inactiveReservist'` into the single label `'Company Reservists'` (`apps/web/lib/orbat/index.ts:119-125`). Returning `category` alongside `role`/`section` gives you the distinction for free, and also unlocks the platoon name (#3).
- **NOT derivable:** LOA and probationary. LOA exists only as (a) an `attendanceType: 'LOA'` on a single op's record, (b) an `loa` meeting-RSVP status, and (c) a *plain-text suffix on the Discord nickname* that is currently parsed only in order to strip it (`apps/web/lib/discord/index.ts:~105`). **Probationary has zero repo hits outside the mockup.**
- **DECISION 1:** Do you want a real LOA field, or should the status pill only ever show Active / Active Reservist / Inactive Reservist / Discharged (**fully automatic today** once `category` is returned)? Parsing the Discord nickname suffix is a third, cheap-but-fragile option.

### 3.2 Commendations & Remarks

- The mockup's central emotional payload. **Nothing publishable exists.**
- Real candidates, all staff-gated: `Db.tickets` performance-report / promotion tickets (`apps/web/types/tickets.d.ts`), `milpac.disciplineHistory[].reason` (**never publish**), `Db.candidateEventFeedback` (course feedback), `Db.peerReviewSubmissions`.
- **Option A (recommended, zero new schema):** synthesise the feed from what already carries an author, a date and a type — awards (`issuedByName` + `issuedByRank` + `type` + `date`) and promotions (`issuedByName` + `rank` + `role` + `date`). No free text, but real, automatic, and safe.
- **Option B:** new `User.milpac.commendations[]: { date, authorId, authorName, authorRank, type, text, visibility }` + a new gated write route (`members.commend`) + a `visibility: 'public' | 'staff'` flag defaulting to `staff`.
- **DECISION 2:** A or B? If B, who may write one, and is it public by default?

### 3.3 Assigned Loadout

- **Nothing exists. VERIFIED** by searching `loadout|kit|gear|arsenal|weapon|primary` across `apps/web`, `apps/bot`, `apps/milpac`, `lib/`, `types/` and `scripts/` — `apps/bot` has **zero** case-insensitive matches. A real implementation means a new `loadouts` collection or `User.loadout: { slot, item }[]`, an editor UI, and a maintenance burden on every member.
- **Option A (recommended):** **DROP** the panel and reuse its slot for the uniform image (C1) — the ASOT-native equivalent of "what this soldier looks like kitted".
- **Option B (the honest automatic substitute):** re-skin the panel as **Weapon Qualifications** using the `Weapons` group of `BADGE_SUBFOLDER` (`page.tsx:36-39`: `BRifle`, `BMG`, `BAT`, `BGLA`, `BPistol`, `BSniper` and their `Exp*` expert tiers), sourced from `milpac.qualifications[]`. Same visual rhythm — icon + slot label + value — with entirely real data. Plus `Db.driversLicense` (`DriverLicenseEntry`) for vehicle quals.
- **Option C:** full per-member gear schema + editor. Contradicts requirement 3 (automation).
- **DECISION 3:** A, B or C? (B keeps the mockup's layout intact at zero data cost.)

### 3.4 "Ops led"

- Three partial signals (§1.5 #36). None means "led a section".
- **Option A:** count `Db.operationAttendance.find({ leadZeus: userId })` → "Ops zeused". Clean top-level scalar, cheap query.
- **Option B:** count `Db.operations.find({ ownedBy: userId, deletedAt: { $exists: false } })` → "Missions authored".
- **Option C:** count attendance records where `orbatRole` matches a leadership pattern (`/Leader|Commander|2IC|Sergeant/`). Fuzzy.
- **DECISION 4:** which metric, and what to call it.

### 3.5 Notable Operations narrative

- **Option A (recommended):** rename the panel to **Recent Operations** and render op title + date + the member's `unit`/`orbatSection`/`orbatRole` **as at that operation** (snapshotted per-record, `apps/web/types/attendance.d.ts:9-11`) as the third line. Fully automatic, genuinely informative, and it shows career progression. Dress each entry with `Operation.coverImage` / `themeColor` (`apps/web/types/operation.d.ts:219-222`) for real artwork, and mark entries with `Operation.ocap` set as the "highlighted" (`.hi`) ones — an OCAP recording is an objective, already-stored marker of a significant op, and it gives the timeline a live link out via `OCAP_VIEWER_URL`.
- **Option B:** a `notable?: boolean` + `citation?: string` on the attendance record, written by staff.
- **DECISION 5:** A or B?

### 3.6 YouTube / Twitch links

- No source. Cannot be automatic — these are personal accounts the member alone knows.
- **DECISION 6:** drop them entirely, or accept a *small* self-service exception (a "Links" section on `/me`, not a drawer on the public page). If accepted: new `User.links?: { youtube?: string; twitch?: string }` + URL-scheme validation + a whitelist in `POST /api/me` (see R4).

### 3.7 Service number

- **DECISION 7:** drop, or add `User.milpac.serviceNumber` + a migration that assigns one deterministically (e.g. sequence by `enlistedDate`). Only cosmetic value.

### 3.8 Attendance % and the chart's "scheduled" denominator

- See §5.2. **DECISION 8:** pick a denominator definition, or drop the percentage and the grey capacity track (the chart still reads fine as a plain bar series).

### 3.9 Performance / indexing (not user-facing, but required)

- **VERIFIED: there are zero indexes on `operations` and `operation_attendance`** — the only `createIndex` calls in the repo target `orbat_positions` (`apps/web/lib/backups.ts:634,638`; `apps/web/app/api/admin/mass-import/route.ts:466,470`). `apps/web/scripts/init-db.mjs` creates none.
- The public profile therefore runs an unindexed COLLSCAN with no projection on every request (`page.tsx:230-232`), and `client.fetchAllMembers()` (`lib/discord/index.ts:86-89`) loads **every user document** — including each user's `token` — just to find one by `username`.
- **Recommended (new migration script in `scripts/`):**
  - `operation_attendance`: `{ 'records.userId': 1, 'records.confirmed': 1 }` (multikey; serves all three existing call sites), `{ operationId: 1 }`, `{ leadZeus: 1 }` if §3.4 Option A wins.
  - `operations`: `{ date: -1 }`, `{ deletedAt: 1 }`.
  - `users`: `{ username: 1 }`.
- **Also recommended:** replace `fetchAllMembers().find(...)` with `Db.users.findOne({ username })` in `resolveProfile()` (`page.tsx:143-145`) and in `opengraph-image.tsx:13-14`.

### 3.10 Permission keys

No new permission key is needed for the *page* (it stays public). New keys would be
needed only for §3.1 (`members.setStatus`) and §3.2 Option B (`members.commend`).
Per `apps/web/CLAUDE.md`, add them to `PERMISSIONS` in `lib/permissions.ts` with JSDoc,
gate via `hasPermission(user, 'members.commend')` (`lib/orbat/hasPermission.ts`) rather
than a Discord-role array, and they flow into `PERMISSION_KEYS` automatically.

---

## 4. (d) Steam linking

### 4.1 What exists today — VERIFIED

| Piece | File | Note |
|---|---|---|
| Steam OpenID callback | `apps/web/app/api/applications/steam-callback/route.ts` | **Fully working OpenID 2.0 flow.** Extracts SteamID64 from `openid.claimed_id`, re-verifies the assertion against `https://steamcommunity.com/openid/login` with `check_authentication` (`:24-32`), then redirects to `/join?steamId64=…` (`:38`). Public, no auth. |
| Vanity-URL / profile-URL resolver | `apps/web/app/api/applications/resolve-steam/route.ts` | Accepts a raw SteamID64, `/profiles/{id}`, or `/id/{vanity}` (resolved via the keyless Steam XML endpoint, `:30-36`). |
| Where the ID is stored | `apps/web/types/j1.d.ts:20-21` — `J1Application.steamUrl` / `steamId64` | On the **application**, never on the user. |
| Written by | `apps/web/app/api/applications/route.ts:93-94` (public join), `apps/web/app/api/admin/j1/applications/route.ts:82` (direct recruit), `apps/web/app/api/admin/j1/import/route.ts:113,133-134` (CSV import) | |
| Link to the member | `apps/web/app/api/applications/route.ts:85` — `linkedUserId: discordSession.id` | **Key finding:** the public join flow requires Discord login and stamps the Discord ID onto the application. So for anyone who joined through the site, their SteamID64 **is already recoverable** by `Db.j1Applications.findOne({ linkedUserId: member.id, steamId64: { $exists: true } })`. |
| Used for | Returning-member checks (`apps/web/app/api/admin/j1/check-returning/route.ts:21-29`), J1/J4 mastersheet display | |
| **On `User`** | root `types/user.d.ts` | **No steam field of any kind.** VERIFIED by full-repo grep. |

### 4.2 The precedent to copy — TeamSpeak

`apps/web/app/me/TSLinkButton.tsx` is exactly the shape the user described: a card
that shows **"No TeamSpeak account linked" + a single [Link Account] button** when
unlinked, and a linked state when set. Backed by `User.teamspeak: { uid, cldbid,
nickname, linkedAt }` + `tsVerifyCode` + `tsPending` (root `types/user.d.ts:82-94`)
and a single action-dispatch route `/api/me/teamspeak` (`init` / `list` / `poke` /
`verify` / `DELETE`).

**Difference the user asked for:** TeamSpeak exposes *Change* and *Unlink* buttons
(`TSLinkButton.tsx:180-187`). **Steam must not.** Link once, then immutable.

### 4.3 What the link-once-then-immutable flow needs

1. **Schema:** `User.steam?: { id64: string; profileUrl?: string; linkedAt: number; source: 'openid' | 'application' | 'staff' }`.
2. **Migration** (`scripts/`, one-off, read-only over `j1_applications`):
   backfill `User.steam` from `Db.j1Applications` where `linkedUserId` matches and
   `steamId64` is present, with `source: 'application'`. This is what makes the link
   "already established by the system" for most existing members.
3. **New route `POST /api/me/steam`** — starts the OpenID redirect (reuse the
   existing verification logic; generalise `steam-callback` to accept a `return`
   target so it can serve both `/join` and `/me`).
   - **Immutability guard, server-side:** `if (me.steam?.id64) return 409` — refuse
     to overwrite. This must live in the route, not only in the UI.
   - **Uniqueness guard:** reject a `id64` already claimed by another user
     (a `{ 'steam.id64': 1 }` unique index; alt-account abuse vector).
   - `logAction({ action: 'member.steamLink', category: … })` via `lib/logAction.ts`.
4. **No `DELETE`.** Unlinking is a staff action only — a J4-gated route or a manual
   DB fix, so a member cannot rotate accounts to dodge a returning-member check.
5. **UI:**
   - **Public profile:** if `member.steam?.id64` → a Steam chip linking to
     `https://steamcommunity.com/profiles/{id64}`. If absent **and** `isOwn` → a
     `[Link Steam]` button. If absent and not own → render the chip in the mockup's
     existing `.lnk.off` disabled style (`profile.html:154`).
   - **`/me`:** a Steam card mirroring the TeamSpeak card, minus Change/Unlink.
6. **Privacy DECISION 9:** does the public page show the *SteamID64* (a stable
   cross-site identifier) or only a "Steam" link chip? Recommend chip-only, with the
   raw ID never rendered as text.

---

## 5. (e) Combat Record chart — data, cost, feasibility

### 5.1 The data path (VERIFIED, exists today)

```
Db.operationAttendance.find({ records: { $elemMatch: { userId, confirmed: true } } })
  → operationId[]
  → Db.operations.find({ _id: { $in: operationIds } })   // add: deletedAt: {$exists:false}
  → bucket Operation.date into the last 12 calendar months
```

This is *the exact query the page already runs* (`page.tsx:230-252`). The chart needs
**no new field and no new collection** — only a month-bucketing pass over data already
in memory. Three existing call sites use this identical pattern:
`page.tsx:230`, `apps/web/app/members/[username]/page.tsx:25`,
`apps/web/app/api/members/[username]/confirmed-ops/route.ts:18`.

**Use `Operation.date`, not `records[].confirmedAt`** — `confirmedAt` is when the
section leader clicked confirm, not when the op ran (`apps/web/types/attendance.d.ts:15`).

### 5.2 The denominator problem (the mockup's grey "capacity" track)

The mockup renders `attended of N scheduled` (`profile.html:1000`). **N is not
reliably derivable.** VERIFIED:
- `OperationAttendance.assignedPlatoons` (`apps/web/types/attendance.d.ts:24`) says
  which ORBAT categories were assigned — but at the *category* level, not per member.
- After a modern confirmation run, `records[]` does contain a row for every ORBAT
  member in the confirming section, including `confirmed: false`
  (`apps/web/app/api/operations/[id]/attendance/confirm/route.ts:61-73`) — so
  "a record exists for me" ≈ "I was on the roster".
- **But** the live roster shown in the UI is rebuilt from *current* ORBAT positions
  at read time (`.../attendance/route.ts:38-80`), and CSV-imported historical ops only
  insert rows for members named in the sheet (`.../attendance-import/route.ts:210-221`).
  So historical coverage is attendee-only.

**Options for N:**
- **(i)** `N = count of ops in that month where a record exists for this member` —
  honest, self-consistent, degrades gracefully on imported history. **Recommended.**
- **(ii)** `N = all non-deleted ops with status 'Completed' in that month` — a unit-wide
  denominator; simple, but punishes reservists and members who joined mid-year.
- **(iii)** Drop the capacity track and the attendance %. The chart is a clean
  single-series bar chart without them; the mockup's own code already handles
  `gapH <= 2` by drawing nothing (`profile.html:973`).

**DECISION 8 (restated):** (i), (ii) or (iii)?

### 5.3 Cost

- **VERIFIED: no indexes exist on `operation_attendance` or `operations`.** Today's
  query is a full COLLSCAN with no projection, pulling every matched doc's entire
  `records[]` (≈40–80 members each) into Node — on a **public, uncached, dynamic** page.
- **INFERRED scale:** one attendance doc per operation, and the CSV importer creates
  up to two ops per weekend (`.../attendance-import/route.ts:64-65`) → low hundreds of
  docs. Absolute cost is small *today*; it grows linearly and is trivially fixable.
- **Verdict: queryable today at acceptable cost**, but ship the index migration (§3.9)
  in the same release, and add a `$project` limiting the fetch to
  `{ operationId: 1, 'records.$': 1 }`.

### 5.4 Also fix while in here

None of the three existing call sites filter `deletedAt` on the operations lookup —
**soft-deleted operations currently appear in public op history** (VERIFIED). Add
`{ deletedAt: { $exists: false } }` per the convention in `apps/web/CLAUDE.md` and
`apps/web/app/api/operations/route.ts:34`.

---

## 6. (f) Staged implementation plan

Each stage is independently reviewable and independently shippable. Stages marked
**[FE]** are pure frontend on data that already exists — safe to start immediately.
Stages marked **[BLOCKED]** need a decision from §3 first.

### Stage 0 — Decisions **[BLOCKED — user input]**
Answer DECISIONS 1–9 (§3, §4.3, §5.2). Nothing below Stage 4 can be finalised without them.
*Deliverable: a decision list appended to this document.*

### Stage 1 — Accent-driven design system **[FE]**
Port the mockup's CSS to a Next.js server component, replacing the fixed
`:root` palette with variables derived from `accent`:
`--acc: {accent}`, `--acc-rgb: {r,g,b}` computed server-side from
`ensureVisible(member.hexAccentColor)`. Keep `--bg/--s1/--s2/--s3/--ink*` neutral so
the accent stays the only member-specific hue. Delete the drawer's swatch picker.
*Review gate: a static profile renders with the correct member accent, light/dark
neutrals unchanged, no data changes.*

### Stage 2 — Hero + stat strip on existing data **[FE]**
Banner (cover upload C13), avatar, rank chip with **real** `Rank/` artwork (cropped,
§7 R6), name, full rank, role, section, Discord chip, back/edit/original links
(C10–C12), and the 5-tile strip using only EXISTS fields: ops attended, time in
service, awards count, quals count + **promotion progress bar (C7)** in the tile the
mockup gives to attendance %.
*Review gate: hero matches the mockup visually; every currently-shown hero element
survives.*

### Stage 3 — Panels on existing data **[FE]**
- **Widen `OrbatEntry`** (`apps/web/lib/orbat/index.ts:22-25`) to also return
  `category` — unlocks the platoon name (#3), the section patch/colour (#16b) and
  active-vs-inactive reservist (#18) with no schema change. Check the other
  `getOrbatEntryByUserId` consumers (`opengraph-image.tsx:27`, `app/me/page.tsx`,
  `community/bios`) still typecheck.
- Personnel Summary + inline `BiographyEditor` (C14)
- Service Data rows: enlisted, time in service, time in grade (both via a shared,
  format-tolerant date parser — R11), element, platoon, **corps badge** (#61, already
  computed and currently discarded at `page.tsx:186`), status
- Qualifications chips carrying date + issued-by + badge (C17, C49)
- Awards rack with **real ribbon PNGs**, medallions (C24), plus the detail list with
  type/issued-by/date (C18) and the certificate viewer (C55/C5)
- Promotion history table + certificates (C4, C5, C6)
- Operation History with grouping and links (C15)
- Uniform + medal box panels with lightbox (C1, C2) and the regeneration side
  effect preserved verbatim (C3)
- Request Award button (C9)
- Empty-state placeholders everywhere (C19)
*Review gate: side-by-side diff against the current page — **zero** information lost.*

### Stage 4 — Combat Record chart **[FE, if DECISION 8 = (iii)]** / **[BLOCKED otherwise]**
Month-bucket the confirmed ops already loaded in Stage 3 into a 12-month series;
port the mockup's SVG chart (`profile.html:941-1008`) to a client component with the
accent-driven fill. Add `deletedAt` filtering (§5.4).
*Review gate: chart totals reconcile exactly with the Operation History count.*

### Stage 5 — Query hygiene + indexes **[FE-adjacent, no schema change]**
`findOne({ username })` instead of `fetchAllMembers()` (both `page.tsx:143` and
`opengraph-image.tsx:13`); projection on the attendance query; new
`scripts/add-milpac-indexes.mjs` migration (§3.9). Update `docs/map/*` per
`apps/web/CLAUDE.md`.
*Review gate: page renders identically; measured query count and payload drop.*

### Stage 6 — Steam link **[BLOCKED on DECISION 9]**
Schema field, backfill migration from `j1_applications`, generalised OpenID callback,
`POST /api/me/steam` with the 409 immutability guard + unique index, the `/me` card,
and the public chip / `[Link Steam]` button. `logAction` on link. Add e2e coverage for
"cannot relink" per the testing discipline in `apps/web/CLAUDE.md`.
*Review gate: linking twice returns 409; a second user cannot claim the same id64.*

### Stage 7 — Member status **[BLOCKED on DECISION 1]**
Status field + backfill + status pill + the reservist/discharged derivations.
*Review gate: pill correct for an active member, a reservist, and a discharged member.*

### Stage 8 — Commendations, Notable Ops, Loadout, Ops-led, Attendance % **[BLOCKED on DECISIONS 2–5, 8]**
Whatever survives the decisions. If all four are dropped, the layout must be
re-balanced — Stage 3's uniform panel is the natural filler for the Loadout slot.

### Stage 9 — Cleanup
Delete `profile.html` from the repo root (or move it to `docs/`), update
`apps/web/docs/map/g-public-pages.md` and `h-lib-types-components.md`, update
`apps/web/tests/` if any gate changed, and update `apps/web/CLAUDE.md` if a new
convention was introduced.

---

## 7. (g) Risks and regressions

### R1 — **PUBLIC PAGE: privacy is the dominant risk** 🔴
`app/(landing)/milpacs/[username]/page.tsx` has **no auth check whatsoever**, and
VERIFIED: `/milpacs` is **not** in `middleware.ts`'s `WIP_PATHS`
(`apps/web/middleware.ts:3` — only `/community/orbat`, `/community/retired`,
`/community/bios`). Anyone on the internet sees this page.

What the current page already exposes publicly, and gates only these:
| Data | Current gate |
|---|---|
| Certificates (award + promotion) | `canViewCertificates = me !== null` (`page.tsx:223`) |
| "Edit" link | `client.hasRoles(me, ['J5-Media'])` (`page.tsx:224`) |
| Cover upload / bio editor | `isOwn` (`page.tsx:225`) |
| Request Award | logged-in, not self, not skeleton (`page.tsx:226`) |
| **Everything else — including full confirmed operation history and promotion points — is unauthenticated.** | none |

**Notable existing inconsistency (VERIFIED):** the identical confirmed-ops query is
gated behind `PERMISSIONS.members.edit` (= `J4 - Administration`) when served through
`GET /api/members/[username]/confirmed-ops` (`route.ts:10`), yet is rendered publicly
by this page. Not a new regression, but the redesign is the moment to decide
deliberately.

**Things the mockup would newly expose — each needs a conscious call:**
- **Timezone** (#17) — currently a private scheduling preference. Publishing it
  narrows a member's real-world location.
- **Steam ID** (#20) — a stable cross-site identifier. Recommend chip-only (§4.3).
- **Attendance %** (#25) — a performance metric; publicly shaming low-attendance
  members is a social risk as much as a technical one.
- **Commendations / remarks** (#67) — **the discipline history
  (`milpac.disciplineHistory[].reason`) must never surface here.** If §3.2 Option B is
  chosen, the `visibility` flag must default to `staff` and the public renderer must
  filter, not merely omit.
- **Status = LOA** (#18) — discloses a member's absence.

### R2 — Discharged members are publicly viewable
`resolveProfile()` calls `client.fetchAllMembers()` → `Db.users.find({})`
(`lib/discord/index.ts:87`) with **no `discharged` filter**, so a discharged member's
profile still resolves. `fetchMember()` *does* reject discharged users for *login*
(`lib/discord/index.ts:70`), so the behaviour is inconsistent. The redesign's status
pill will make this newly visible — decide whether to 404, show a "Discharged" state,
or redirect to the retired wall (`/community/retired` already exists for this).

### R3 — `fetchAllMembers()` leaks tokens into memory
`Db.users.find({}).toArray()` returns **every user document unprojected, including
each user's auth `token`** (root `types/user.d.ts:18`), on every public profile view.
Nothing serialises it to the client today, but it is one careless prop-spread away
from doing so — and the current page is careful about exactly this (`page.tsx:356-358`
passes only `{ id, avatarURL }` to `<Avatar>`). Fix in Stage 5.

### R4 — `POST /api/me` accepts arbitrary keys
`apps/web/app/api/me/route.ts:38-43` loops over **every** body key and writes
`bio.{key}`. Any logged-in user can set any `bio.*` field on themselves. If new
public profile fields (YouTube/Twitch links, §3.6) are stored under `bio.`, this
becomes a self-service injection point onto a public page — including stored-XSS-shaped
content if any field is ever rendered as HTML. **Add a field whitelist before adding
any new self-editable field.**

### R5 — The "Edit" link uses a hardcoded Discord role
`page.tsx:224` — `client.hasRoles(me, ['J5-Media'])` — bypasses `lib/permissions.ts`
entirely. Meanwhile the page it links to (`/members/{username}`) is gated by
`PERMISSIONS.members.editStandard` = `['J4 - Administration']`
(`apps/web/lib/permissions.ts:290`). **So J5-Media users are shown an Edit link to a
page that redirects them to `/me`.** Pre-existing bug; fix it in Stage 2 by using the
same key the target page uses.

### R6 — Asset dimensions: rank, corps and training badges are full-canvas layers
**VERIFIED PNG headers:**
| Asset | Size |
|---|---|
| `Rank/CPL/CPL.png` | 1398×1000 |
| `Corps/Corps Badges/Infantry.png` | 1398×1000 |
| `Training Badges/RE.png` | **1398×1000** |
| `Ribbons/protagonist.png` | 43×13 (a real icon) |

The current page draws training badges at `width: 28, height: 28, objectFit: 'contain'`
(`page.tsx:601`). **INFERRED: they therefore render as a near-invisible speck** —
exactly the problem the `MEDALLION_CROP` machinery (`page.tsx:96-121`) was written to
solve for medallions, whose comment explicitly notes "there is no standalone icon
anywhere in the asset tree". Any new rank chip / corps badge / qual chip must use the
same crop-a-known-region technique, and the existing training-badge rendering should
be fixed as part of the work. **This is worth confirming visually before building on it.**

### R7 — Losing information while "simplifying"
The mockup's chip/rack aesthetics drop columns the current page shows (dates,
issued-by, certificate targets, op links, ×N grouping). Requirement 6 makes these
non-negotiable. Stage 3's review gate must be an explicit side-by-side field diff, not
a visual impression.

### R8 — The uniform regeneration side effect
`page.tsx:189-215` performs a **write** during a GET render: it re-renders the uniform
and medal box and persists `milpac.uniformHash`. A restructure that changes when
`buildUniformData`/`buildBoxData` are called, or that moves the page to a cached/static
render, will either break regeneration or start re-rendering on every request. Keep it
in the server component, keep the `try/catch`, and do not add `revalidate`.

### R9 — Test and map maintenance
`apps/web/tests/milpac.spec.ts` covers the milpac **API routes**, not the page — so it
should keep passing, but any new gated route (Steam, status) needs coverage per
`apps/web/CLAUDE.md`. **Per the project convention and the user's standing preference,
do not run `npm run test:e2e` without asking.** `docs/map/g-public-pages.md` (§/milpacs)
and `docs/map/h-lib-types-components.md` must be updated in the same change.

### R11 — Free-form date strings break every derived duration 🟠
`milpac.enlistedDate` (root `types/user.d.ts:103`) and `milpac.promotions[].date`
(`:105`) are **`string`, not `Date`**, and are populated by CSV imports and hand entry.
The only parser in the repo, `serviceYears()`
(`apps/web/app/api/admin/j4/mastersheet/billet/route.ts:8-18`), has to cope with both
`DD/MM/YYYY` and `DD-MM-YYYY`. Meanwhile `page.tsx:276-279` formats the
`joinedTimestamp` *fallback* as `en-AU` `"17 Aug 2026"` — a **third** format that then
sits in the same field position.

The mockup's `span()` helper (`profile.html:743-750`) assumes strict ISO `YYYY-MM-DD`
and would silently produce `NaN` for most real members. **Time in service (#58) and
time in grade (#59) both depend on parsing these.** Reuse/extend `serviceYears()`
rather than writing a fourth parser, and render an em-dash rather than `NaN` when a
date will not parse.

### R10 — Deployment
`main` deploys on push with **no CI gate** (root `CLAUDE.md`). All of this stays on
`feat/milpac-profile-redesign` and merges only when a stage is genuinely complete.

---

## 8. Decisions the user must make (consolidated)

| # | Decision | Options | Blocks |
|---|---|---|---|
| 1 | Member status source | derive-only, **free today** (Active / Active-Reservist / Inactive-Reservist / Discharged) · new `memberStatus` + LOA field · parse Discord nickname suffix | Stage 7 |
| 2 | Commendations & Remarks | synthesise from awards/promotions (safe, automatic) · new `commendations[]` + gated write + `visibility` flag · drop panel | Stage 8 |
| 3 | Assigned Loadout | drop (use slot for uniform) · **re-skin as Weapon Qualifications** (real data, same layout) · full per-member gear schema | Stage 8, layout |
| 4 | "Ops led" definition | Lead Zeus count · missions authored (`Operation.ownedBy`) · leadership-role attendance · drop | Stage 8 |
| 5 | Notable Operations | rename to Recent Operations, auto, highlight ops with an OCAP recording · staff-flagged notable+citation · drop | Stage 8 |
| 6 | YouTube / Twitch | drop · self-service on `/me` with a whitelisted write | Stage 8 |
| 7 | Service number | drop · new field + backfill migration | Stage 2 (cosmetic) |
| 8 | Chart denominator / attendance % | per-member roster presence · unit-wide completed ops · drop both | Stage 4 |
| 9 | Steam public display | link chip only (recommended) · chip + visible SteamID64 | Stage 6 |
| 10 | Discharged member profiles | 404 · "Discharged" state · redirect to retired wall | Stage 7, R2 |
| 11 | Timezone publicly visible? | yes · no · opt-in | Stage 3, R1 |
| 12 | Public op history & promotion points | keep public (status quo) · gate to logged-in members | Stage 3, R1 |
| 13 | `milpac.callsign` (dead field, never written) | delete it · make it a real writable field · leave as-is | Stage 3 |
| 14 | Prior service of returning members (`DischargeSnapshot`) | keep J4-only (status quo) · surface publicly | Stage 3, R1 |

---

## 9. Verification notes

**Verified by reading code/assets:** every file:line citation above; the absence of
`steam`/`loadout`/`serviceNumber`/`commendation`/`probationary`/`attendanceRate` on
`User` and across the monorepo; the absence of any index on `operations` /
`operation_attendance`; the four PNG dimension readings in R6; the three identical
`$elemMatch` attendance call sites; `/milpacs` not being in `middleware.ts`'s
`WIP_PATHS`; `fetchAllMembers()` returning unprojected user documents; the
`POST /api/me` arbitrary-key write; the `J5-Media` vs `members.editStandard` gate
mismatch; and `milpac.callsign` having no write site.

**Inferred, not directly confirmed:**
- That the training-badge images render as a near-invisible speck (R6) — the PNG
  dimensions and the 28×28 `objectFit: contain` render are both verified, but I did
  not run the page to see it. **Confirm visually before acting on it.**
- The size of the `operation_attendance` collection (§5.3) — estimated from the
  CSV importer's two-ops-per-weekend cadence, not measured.
- That the rank/corps artwork needs the same crop treatment as medallions — the
  1398×1000 dimensions are verified; the exact crop rectangle for each was not measured.

**Not done (deliberately):** the Playwright e2e suite was **not** run, per the
project's standing instruction. No repo file was created, edited or deleted.

---

## 10. Decisions taken (2026-08-17)

Answered by the user; supersedes the options listed in §8.

| # | Decision | Chosen | Consequence |
|---|---|---|---|
| 2 | Commendations & Remarks | **New `commendations[]` field, written by staff at the end of an operation** | Real schema + gated write route + permission key. Not synthesised from awards. Tied to an operation, since that is when they are written. |
| 3 | Assigned Loadout | **Keep the panel** | Not dropped and not re-skinned. The user intends to import a kit from Arma to generate it, and will supply that plan separately. Build the panel with a real empty state now, shaped so generated kit data drops straight in. |
| 5 | Notable Operations | **Auto "Recent Operations"** | Op title + date + the member's unit/section/role *as at that operation* from the attendance snapshot. Cover image + theme colour per entry; ops with an OCAP recording are the highlighted ones and link out. |
| 11 | Timezone public | **Yes** | New disclosure, accepted. |
| 12 | Op history + promotion points public | **Yes — keep public** | Status quo retained deliberately. Note the API route for the same data is J4-gated; the page and the API remain inconsistent by choice. |
| 14 | Prior service of returning members | **Public** | `DischargeSnapshot` data surfaces on the profile. |

### Defaults taken without asking

Flagged to the user; reversible on request.

| # | Decision | Taken | Why |
|---|---|---|---|
| 1 | Member status | **Derive only** — Active / Active Reservist / Inactive Reservist / Discharged | Free today once `getOrbatEntryByUserId()` returns `category`. No LOA or probationary field invented. |
| 4 | "Ops led" | **Deferred** — omit the substat for now | Three partial signals, none meaning "led a section". Needs its own decision rather than a guess. |
| 6 | YouTube / Twitch | **Drop** | No source, cannot be automatic, and contradicts requirement 3. |
| 7 | Service number | **Drop** | No source; cosmetic only. |
| 8 | Chart denominator | **(i) per-member roster presence** | Honest and self-consistent; degrades gracefully on CSV-imported history. |
| 9 | Steam display | **Link chip only** | The raw SteamID64 is a stable cross-site identifier and is never rendered as text. |
| 10 | Discharged profiles | **Show a "Discharged" state** | Consistent with decision 14 making prior service public. |
| 13 | `milpac.callsign` | **Leave the dead field alone** | Nothing writes it. The page's "callsign" is really the ORBAT section. Deleting it is unrelated cleanup; out of scope here. |

### Still open

- **Commendations specifics** — who may write one (which permission key), and whether a commendation is always tied to an operation or can stand alone. Needed before Stage 8, not before Stage 1.
- **Loadout data shape** — awaiting the user's Arma kit-import plan.
