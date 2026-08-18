# Kit Ratings, Tags and Shelf — Design

Three changes to the kit feature, sharing one branch because they all land on
the same two pages and the same collection: members can **rate** each other's
kits 1–5 stars, kits carry **tags** from a fixed vocabulary, and
`/community/kits` becomes a **searchable, filterable, sortable, paged shelf**
that also reports how many people have copied each kit.

## Goal

The shelf currently renders every shared kit as one flat list, newest first,
with no way to find anything. A member looking for a machinegunner's kit reads
all of them. Nothing on the page says which kits the unit actually rates or
uses, so a well-built kit and an abandoned import look identical.

This design adds the three signals that let the shelf be navigated — what a kit
is *for* (tags), what members *think* of it (ratings), and what people actually
*take* (copy count) — and the controls to search, filter, sort and page by them.

It also closes a gap in the owner's own controls: a kit's name currently cannot
be edited after import, only its icon and description.

## Non-Goals

- **Written reviews.** A star and a count. Comment threads on kits are a
  different feature with moderation questions attached.
- **Notifying owners.** No Discord DM or site notification when a kit is rated
  or copied. The numbers sit on the page.
- **Rating or tagging unshared kits.** A private kit is not addressable by
  anyone but its owner; the rating route 404s on one.
- **Exposing raters.** Ratings are anonymous — see §3.
- **An admin UI for the tag list.** The vocabulary is a code constant (§2).
  Adding a tag is a one-line commit, the same as adding a kit icon.
- **Editing the kit itself.** `raw` stays unwritable after import, by explicit
  decision — changing what a kit *contains* means re-exporting from the arsenal
  and re-importing. Only the metadata around it is editable.

---

## 1. Data model

`MemberLoadout` (`apps/web/types/loadout.d.ts`) gains four optional fields:

| Field | Type | Meaning |
|---|---|---|
| `tags` | `string[]` | Tag keys from §2. Unknown values are ignored on read, never written. |
| `ratingAvg` | `number` | Mean of every rating, 2dp. `0` when unrated. |
| `ratingCount` | `number` | How many members have rated it. |
| `copyCount` | `number` | Distinct actors who have copied it (§4). |

All four are optional and absent on every existing document. Reads default to
`[]`, `0`, `0`, `0`, so **no backfill is needed** — only an index migration.

The three counters are denormalised onto the loadout rather than aggregated per
request, because the shelf sorts on them and would otherwise need a lookup per
card. This follows the pattern already used for `voteScore` on community
tickets (`app/api/tickets/[id]/vote/route.ts`).

Two new collections, both registered in `apps/web/lib/mongo.ts`:

**`loadout_ratings`** (`Db.loadoutRatings`) — one document per rater per kit.

```ts
interface LoadoutRating {
    _id: ObjectId
    loadoutId: ObjectId
    userId: string        // Discord id — always a member, never anonymous
    stars: 1 | 2 | 3 | 4 | 5
    createdAt: Date
    updatedAt: Date
}
```

Unique compound index on `{ loadoutId: 1, userId: 1 }`. That index *is* the
one-rating-per-member rule; the route relies on it rather than checking first.

**`loadout_copies`** (`Db.loadoutCopies`) — one document per distinct actor per
kit.

```ts
interface LoadoutCopy {
    _id: ObjectId
    loadoutId: ObjectId
    actorId: string       // Discord id, or `anon:<uuid>` — see §4
    copies: number        // repeat copies by the same actor, for interest only
    firstCopiedAt: Date
    lastCopiedAt: Date
}
```

Unique compound index on `{ loadoutId: 1, actorId: 1 }`.

**Why separate collections rather than arrays on the loadout.** The ticket-vote
pattern stores voter ids in arrays on the voted document. That is wrong here for
two reasons. A rating carries a *value* per user, not just membership. And the
shelf page sends each loadout's `raw` to the browser — if rater ids lived on that
document, keeping ratings anonymous would depend on every future projection
remembering to exclude them. In a separate collection the anonymity is
structural: there is no field to leak.

---

## 2. The tag vocabulary

`apps/web/lib/loadout/tags.ts`, modelled directly on the neighbouring
`kit-icons.ts` — an `as const` array giving a real `KitTag` union rather than
`string`, an `isKitTag` guard the API routes validate against, and no JSX (the
routes import this file, and a route handler must not pull in components).

Tags live in `apps/web/lib/`, not the shared root `lib/`. Per `lib/README.md`
the root is for vocabulary more than one app must agree on; the bot has no
concept of a kit. This sits beside `kit-icons.ts`, which made the same call.

```ts
export const KIT_TAGS = [
    // Role
    { key: 'staff',     label: 'Staff',             group: 'Role' },
    { key: 'sc',        label: 'Section Commander', group: 'Role' },
    { key: 'ftl',       label: 'Fireteam Leader',   group: 'Role' },
    { key: 'rifleman',  label: 'Rifleman',          group: 'Role' },
    { key: 'medical',   label: 'Medical',           group: 'Role' },
    { key: 'engineer',  label: 'Engineer',          group: 'Role' },
    { key: 'signaller', label: 'Signaller',         group: 'Role' },
    { key: 'jtac',      label: 'JTAC/FO',           group: 'Role' },
    { key: 'marksman',  label: 'Marksman',          group: 'Role' },
    { key: 'sniper',    label: 'Sniper',            group: 'Role' },
    { key: 'zeus',      label: 'Zeus',              group: 'Role' },
    // Weapon
    { key: 'mg',        label: 'MG',                group: 'Weapon' },
    { key: 'lmg',       label: 'LMG',               group: 'Weapon' },
    { key: 'mat',       label: 'MAT',               group: 'Weapon' },
    { key: 'hat',       label: 'HAT',               group: 'Weapon' },
    { key: 'grenadier', label: 'Grenadier',         group: 'Weapon' },
    { key: 'aa',        label: 'AA',                group: 'Weapon' },
    { key: 'dfsw',      label: 'DFSW',              group: 'Weapon' },
    { key: 'idf',       label: 'IDF',               group: 'Weapon' },
    // Vehicle
    { key: 'pilot',     label: 'Pilot',             group: 'Vehicle' },
    { key: 'crewman',   label: 'Crewman',           group: 'Vehicle' },
    { key: 'armour',    label: 'Armoured Crew',     group: 'Vehicle' },
    // Setting
    { key: 'night',     label: 'Night',             group: 'Setting' },
    { key: 'cqb',       label: 'CQB',               group: 'Setting' },
    { key: 'recon',     label: 'Recon',             group: 'Setting' },
    { key: 'para',      label: 'Paratrooper',       group: 'Setting' },
    { key: 'diver',     label: 'Diver',             group: 'Setting' },
    { key: 'winter',    label: 'Winter',            group: 'Setting' },
    { key: 'desert',    label: 'Desert',            group: 'Setting' },
] as const
```

Stored keys are short and stable; labels are free to be re-worded without a
migration. `MAX_KIT_TAGS = 4`.

`normaliseTags(input: unknown): KitTag[]` is the single gate every write goes
through: rejects non-arrays, drops non-strings and unknown keys, de-duplicates,
caps at `MAX_KIT_TAGS`, and returns them **in `KIT_TAGS` declared order** so
chips render in the same order on every card regardless of what order the owner
clicked them.

A tag removed from `KIT_TAGS` later disappears from existing kits on read
without erroring, because rendering maps over the vocabulary, not over the
stored array.

---

## 3. Rating

**Route:** `app/api/loadouts/[id]/rating/route.ts`, `PUT` only.

Body is `{ stars: 1–5 }` to set or change, or `{ stars: null }` to withdraw.
There is no `GET`: both pages that display a rating are server components and
read Mongo directly.

Guards, in order:

1. `client.fetchMe()` — 401 if not signed in.
2. `ObjectId.isValid(id)` — 404 if not.
3. Loadout exists **and** `shared: true` — 404 if not. An unshared kit is not
   addressable, and saying so would confirm it exists.
4. `doc.userId === me.id` — 403. Nobody rates their own kit.
5. `stars` is `null` or an integer 1–5 — 400 otherwise.

Then upsert (or delete, for `null`) into `loadout_ratings`, recompute with a
`$group` over the kit's ratings, and `$set { ratingAvg, ratingCount }` onto the
loadout. Response: `{ mine, avg, count }`.

**Anonymity.** Only `avg` and `count` ever leave the server. Nothing in the API
or the pages exposes who rated a kit, including to its owner.

**Ranking.** Sorting "Top rated" on the raw mean puts a kit with a single
5-star rating above one averaging 4.8 across thirty. `lib/loadout/rating.ts`
therefore exports a weighted score used *only* for sorting:

```
score = (count / (count + M)) * avg + (M / (count + M)) * PRIOR
M = 3, PRIOR = 3.5
```

A kit is pulled toward the prior until a few people have rated it, and reaches
its true mean as ratings accumulate. `M` and `PRIOR` are named constants with
this rationale beside them. The displayed number is always the plain mean — the
weighting decides order, never what the page claims.

`lib/loadout/rating.ts` is pure and holds all of it: `isStars`, `summarise`
(`{avg, count}` from a set of ratings), `weightedScore`, and `formatAvg` (one
decimal, an em dash at zero ratings).

---

## 4. Copy counting

**Route:** `app/api/loadouts/[id]/copy/route.ts`, `POST`.

The actor is resolved as: the signed-in member's Discord id if there is one,
otherwise an id read from a `kit_visitor` cookie — set by this route when
absent, `anon:<randomUUID>`, `httpOnly`, `sameSite: 'lax'`, one year.

Guards: loadout exists and is `shared: true` (404), and the owner's own copies
are not counted (the route returns the current count unchanged) — the same rule
as rating.

The upsert `$inc`s `copies` and `$set`s `lastCopiedAt` on the actor's document;
`copyCount` on the loadout is `$inc`'d by one **only when the upsert inserted**,
which is what makes the headline number distinct-actors rather than total
copies. Response: `{ copyCount }`.

**Accuracy.** This is a popularity signal, not an audit. An anonymous visitor
who clears cookies is counted again, and the endpoint is open. That was an
accepted trade for counting the logged-out visitors who make up much of the
public shelf's traffic; the alternatives were undercounting them entirely or
putting a login wall in front of the shelf's whole purpose.

**Client behaviour.** `CopyKitButton` writes to the clipboard **first**, from
the `raw` already in its props, then fires the POST with `keepalive` and ignores
failures. The write must not sit behind an `await` on the network: browsers
grant clipboard access on the user gesture, and an intervening round-trip is
what breaks it. A failed count is invisible; a failed copy is the feature not
working.

---

## 5. Editing a kit

`PATCH /api/loadouts/[id]` already accepts `name`, `description` and `icon`, and
already ignores `raw`. Two changes:

- Accept `tags`, through `normaliseTags`.
- The route keeps a comment stating that `raw` is deliberately not writable, so
  the omission reads as a decision rather than an oversight.

In `loadout-manager.tsx`, the existing inline edit block (icon + description)
gains a **Name** input, bounded by `MAX_NAME` and refusing to save empty, and a
**Tags** picker. `saveDetails` patches all four fields at once. The import
dialog gets the same tag picker, so a kit can be tagged on the way in.

The tag picker sits beside `IconPicker` and shares its grid styling, but is a
multi-select group rather than a radiogroup: unselected tags disable once four
are chosen, so the cap is visible rather than an error after the fact.

---

## 6. The shelf

`/community/kits` becomes: a control bar (search, sort, tag filter), the grid,
and a page bar.

**Rendering model.** The page stays a server component and resolves everything
display-ready — item names come from a ~2.7MB dictionary that must never reach
the browser, so `resolveItemName` and `iconFor` run server-side and the client
receives resolved strings and icon keys. That resolved data is handed to a new
client component, `shelf.tsx`, which owns search, filtering, sorting and paging
entirely in the browser with no round-trip. Typing filters as you type.

This costs no extra payload: the page already sends every shared kit's `raw` and
every resolved name to the browser today.

**Search** matches a case-insensitive substring against a per-card `haystack`
string built server-side from: kit name, description, owner label (rank + name),
tag labels, and the primary weapon's resolved name. Not the full item list — the
summary carries only a handful of resolved names, and searching raw class names
would match noise.

**Sorts:** Newest (`updatedAt` desc, the default), Top rated (weighted score
desc, §3), Most copied (`copyCount` desc), and A–Z. Every sort breaks ties on
`updatedAt` desc so ordering is stable.

**Tag filter:** a row of chips; selecting several narrows to kits carrying
**all** of them (AND, not OR — the point is to find the medic *night* kit).
Only tags carried by at least one kit currently on the shelf get a chip, each
with the number of kits holding it — a bar of 29 chips, most of them matching
nothing, is a worse control than a short one that always leads somewhere.

**Paging:** 24 per page, numbered bar under the grid, applied to the
filtered-and-sorted set. Any change to search, sort or filter resets to page 1.

Filter state is component-local and not mirrored into the URL, so a filtered
view is not linkable and `/community/kits` always opens unfiltered. Accepted:
the alternative makes every keystroke a navigation.

**Known limit.** Shipping every card keeps search instant but scales linearly.
`MAX_PER_MEMBER` is 12, so the ceiling is real but distant. If the shelf ever
passes ~300 shared kits, `raw` should move to an on-demand fetch from the copy
route rather than being inlined — noted here so the trigger is recorded rather
than rediscovered.

The pure logic — `matchesQuery`, `sortCards`, `paginate` — lives in
`lib/loadout/shelf.ts`, so it is unit-testable without rendering React.

**Cards** show, in addition to what they show now: tag chips, read-only stars
with the count, and the copy count beside the item count. The kit detail page
(`LoadoutPanel`) carries the *interactive* stars, shown only when the kit is
shared, the viewer is signed in, and the viewer is not the owner.

---

## 7. Components

Two new files under `components/loadout/`:

- **`stars.tsx`** (client) — read-only display, or interactive with hover
  preview, click to set, click the same star again to withdraw. Optimistic
  update, reverting on a failed `PUT`.
- **`tag-chips.tsx`** (pure render, no client boundary) — a kit's tags as chips,
  used by both the shelf cards and the kit panel.

Star glyphs are inline SVG in the `kit-icons.tsx` idiom. `loadout-manager.tsx`
already has a `Star` component for the default-kit control; the two are visually
different things (a nomination toggle vs. a rating) and stay separate.

---

## 8. Testing

Vitest (`npm run test:unit` in `apps/web`), beside the existing
`kit-icons.test.ts` and `kit-line.test.ts`:

- **`lib/loadout/tags.test.ts`** — `normaliseTags` de-duplicates, drops unknown
  keys, caps at four, returns declared order, and survives non-array input.
- **`lib/loadout/rating.test.ts`** — star validation rejects `0`, `6`, `3.5` and
  strings; `summarise` averages and rounds; `weightedScore` ranks a 4.8-from-30
  above a 5.0-from-1; `formatAvg` renders an em dash at zero.
- **`lib/loadout/shelf.test.ts`** — search matches name/owner/tag/weapon and is
  case-insensitive; multi-tag filtering is AND; each sort orders correctly and
  ties break on recency; `paginate` slices and clamps an out-of-range page.

Then `npm run lint` and a typecheck, and a manual pass through `npm start`:
import a kit, tag and rename it, publish it, rate it from a second account,
confirm self-rating is refused, copy it signed out and confirm the count moves
once and not twice.

---

## 9. Files

**New**

- `apps/web/lib/loadout/tags.ts` + `tags.test.ts`
- `apps/web/lib/loadout/rating.ts` + `rating.test.ts`
- `apps/web/lib/loadout/shelf.ts` + `shelf.test.ts`
- `apps/web/app/api/loadouts/[id]/rating/route.ts`
- `apps/web/app/api/loadouts/[id]/copy/route.ts`
- `apps/web/app/(landing)/community/kits/shelf.tsx`
- `apps/web/components/loadout/stars.tsx`
- `apps/web/components/loadout/tag-chips.tsx`
- `scripts/2026-08-19-kit-rating-indexes.mjs`

**Changed**

- `apps/web/types/loadout.d.ts` — four new fields, two new interfaces
- `apps/web/lib/mongo.ts` — `loadoutRatings`, `loadoutCopies`
- `apps/web/app/api/loadouts/route.ts` — accept `tags` at import
- `apps/web/app/api/loadouts/[id]/route.ts` — accept `tags`; document `raw`
- `apps/web/app/(landing)/community/kits/page.tsx` — build card data, render shelf
- `apps/web/app/(landing)/community/kits/copy-kit.tsx` — report the copy
- `apps/web/app/(landing)/community/kits/kits.module.css` — controls, chips, pager
- `apps/web/app/(landing)/milpacs/[username]/loadout-manager.tsx` — name + tags
- `apps/web/app/(landing)/milpacs/[username]/loadout-panel.tsx` — stars, chips
- `apps/web/app/(landing)/milpacs/[username]/milpac-file.tsx` — pass rating through
- `apps/web/app/(landing)/milpacs/[username]/profile.module.css` — stars, chips
