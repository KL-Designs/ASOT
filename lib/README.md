# `lib/` — shared domain model

Code shared by more than one app, imported as `@asot/lib`. Sits alongside
`types/` (shared MongoDB document shapes) and `scripts/` (one-off migrations) as
a repo-root concern rather than any single app's.

Currently the unit's military domain model: ranks, corps badges, awards and
qualifications.

## Why this exists

`apps/web` used to hold two independent rank lists: `lib/military/ranks.ts` and
`lib/military/promotion-requirements.ts`. They had drifted. `ranks.ts` renamed
Senior and Commanding Lieutenant to `LT(S)` and `LT(C)`; the promotion tracks
still said `SLT` and `CLT`. The result was two promotion tracks pointing at
ranks that no longer existed, and two real ranks with no promotion path at all.
Nothing caught it, because both files typed an abbreviation as `string`.

`RANK_GROUPS` is declared `as const`, so `RankAbbr` is a union of the 99 real
abbreviations. Typing a field as `RankAbbr` instead of `string` makes that class
of divergence a compile error — which is how the drift above was found and
fixed.

## Why a source directory, not an npm workspace package

`apps/web` is deliberately **not** an npm workspace member — it has its own
lockfile and a hoisting-sensitive Next build, documented in `apps/web/dockerfile`
and `next.config.ts`'s `outputFileTracingRoot`. A workspace package would
therefore be resolvable from `apps/bot` and `apps/milpac` but not from web,
which is the app that needs it most.

So this is plain shared source, consumed through a tsconfig path alias — the
same convention `types/` already uses, and the same mechanism `apps/bot` already
uses for all its imports.

## Files

| File | Contents |
|---|---|
| `ranks.ts` | `RANK_GROUPS`, `RANKS_FLAT`, `RankAbbr`, and the abbr ↔ name helpers |
| `types.ts` | `BADGES`/`Badge`, `Citation`, `TrainingBadge`, `Medallion` |
| `maps.ts` | award name → citation, qualification → badge, ORBAT section → corps badge |
| `index.ts` | barrel — import from here, not from the individual files |

## Adding a consumer

Three things, all required:

1. **`tsconfig.json`** — add the path alias and include the source:
   ```jsonc
   "paths":   { "@asot/lib": ["../../lib/index.ts"] },
   "include": ["../../lib/**/*.ts"]
   ```
2. **`dockerfile`** — add `COPY lib/ ./lib/`. The build context is already the
   repo root for all three apps, so no compose change is needed.
3. **Import it** — `import { RANK_GROUPS, type RankAbbr } from '@asot/lib'`.

Miss step 1 and the editor resolves it but the build fails; miss step 2 and it
builds locally and fails in the container. Both failure modes are quiet, so
check both when adding an app.

Current consumers: `apps/web`, `apps/milpac`. `apps/bot` does not import this
yet — its `config/ranks.json` is a one-entry stub, and it should switch to
`@asot/lib` if it ever grows real rank handling.

## What belongs here

Vocabulary two or more apps must **agree** on — where a change on one side and
not the other is a silent bug.

## What does not

- **Rank-to-filename mapping.** That describes `apps/milpac`'s asset tree and
  lives beside it in `apps/milpac/src/assets.ts`. An asset rename should touch
  one app, not three.
- **Promotion thresholds.** Unit policy, web-only. It imports `RankAbbr` from
  here so it stays in step, but the point values are not shared vocabulary.
- **TeamSpeak tag mapping.** web-only, same reasoning.
- **The milpac render payload.** That is the service's HTTP contract, defined by
  its zod schemas in `apps/milpac/src/schema.ts`.

The distinction that matters: this holds things apps must agree on, not things
that merely look reusable. A shared directory that accumulates the latter
becomes something all three apps have to rebuild for, and the reason to keep it
narrow is the same reason it exists.
