# `/milpac profile` — the Discord dossier card

**Date:** 2026-08-18
**Status:** design approved, not yet implemented
**Apps touched:** `apps/bot`, `apps/web`

A third subcommand under the existing `/milpac` group that posts a single
composited image of a member — uniform, medal box, service statistics and their
favourite kit — with link buttons to each section of their milpac.

---

## 1. Why this shape

The request was "everything about that member, cinematically, ideally as one
image". Three findings shaped the answer.

**The card mostly exists already.** `app/(landing)/milpacs/[username]/opengraph-image.tsx`
is a 1300x630 share card rendered through satori that already does the cover
photo backdrop with three tuned scrims, the accent sun, the avatar with its rank
tab, the identity block and a stat strip. Its scrim values were tuned against
real uploads and are not worth re-deriving.

**It is deliberately not reused as-is.** That card is the OpenGraph link
preview — it is what every milpac URL pasted anywhere renders as. Growing it
into the dossier would change every existing link preview across Discord and
social. The dossier is therefore a **separate card that shares the treatment**,
and `opengraph-image.tsx` is not modified by this work.

**The drawing belongs in `apps/web`, not `apps/milpac`.** The renderer
composites layered artwork against fixed coordinates and holds no member data by
design (`apps/milpac/CLAUDE.md`, PLAN.md §3). A dossier route there would mean
shipping it every string plus the cover bytes, and duplicating the unit's design
language into an app that has none of it. Web already draws this class of card
twice, in the two `opengraph-image.tsx` routes.

A rejected third option: screenshotting the real profile page headlessly.
Perfect fidelity, but it puts a browser in the container and costs seconds per
render.

---

## 2. What the card contains

Settled deliberately, after a first pass that was agreed to be too dense:

| Element | Source |
|---|---|
| Backdrop | The member's uploaded cover photo, under the share card's scrims. Falls back to the drawn ridgeline. |
| Identity | Full rank, name, and `platoon · section · role` |
| Uniform artwork | Rendered fresh per request |
| Medal box artwork | Rendered fresh per request |
| Statistics | Operations attended, time in service, awards, qualifications, promotion points |
| Kit | One line: kit name, primary weapon, vest, item count |

**Explicitly excluded**, having been considered and cut: the biography excerpt
(unpredictable free text needing hard truncation) and last-promotion /
latest-award recency lines (two more lines competing with a stat strip that
already reports awards and time in service).

### Layout

Approximately 1400x860. The two artwork pieces have fixed aspect ratios that
drive the arrangement — the uniform is 1398x1000 and the medal box is 951x340,
so the uniform reads as a block and the medals as a band beside it.

```
┌──────────────────────────────────────────────────────────────┐
│░░░ cover photo, three scrims ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│  AUSTRALIAN SPECIAL OPERATIONS TASKFORCE          SERVING    │
│ ─────────────────────────────────────────────────────────────│
│  ┌──────────────────┐   CORPORAL                             │
│  │                  │   J. THOMAS                            │
│  │   uniform art    │   1 PL · 2 SECT · Rifleman             │
│  │   560 × 400      │   ┌────────────────────────────────┐   │
│  │                  │   │  medal box art   700 × 250     │   │
│  └──────────────────┘   └────────────────────────────────┘   │
│ ─────────────────────────────────────────────────────────────│
│   48    │  2.4Y    │   11    │    6     │   340              │
│  OPS    │ SERVICE  │ AWARDS  │  QUALS   │  POINTS            │
│ ─────────────────────────────────────────────────────────────│
│  KIT · Breacher — Mk18 CQBR · Plate Carrier · 64 items       │
└──────────────────────────────────────────────────────────────┘
```

Pixel values are a starting point to be tuned by eye against a real member, not
a contract. The proportions are the design; the exact numbers are not.

---

## 3. Which kit is shown

Anyone may run the command on anyone, and the reply can land in a public
channel. A kit the member marked private must never be published by someone
else's command.

The rule, in order:

1. Their default kit, if it is marked public.
2. Otherwise, their most recently updated public kit.
3. Otherwise, no kit line at all — the layout closes up.

This matches the milpac page, which already hides private kits from everyone but
their owner. The same predicate decides whether the **Kits** button appears, so
there is exactly one notion of "has kits worth showing".

---

## 4. Data flow

```
/milpac profile  (bot)
  └→ POST /api/bot/milpac/{discordId}?type=dossier
       Authorization: Bearer ${BOT_API_SECRET}

       generateMilpacForUser()  → uniform + medals PNG bytes
       readCoverImage()         → data URI, or null
       resolveMilpacProfile()   → accent, name, full rank
       getOrbatEntryByUserId()  → role, section, platoon
       (stats)                  → ops, service, awards, quals, points
       pickCardKit()            → public default | newest public | null

       └→ new ImageResponse(<DossierCard …/>)

  ← image/png
  ← X-Milpac-Links: [{"label":"Overview","path":"/milpacs/thomas"}, …]
```

The bot gains one `type` value on a route it already calls. It continues to know
only a Discord ID and which image it wants — the constraint `apps/bot/CLAUDE.md`
sets out, and the drift `apps/milpac/PLAN.md` §3 and §4 record.

### Artwork comes from the return value, not from disk

`generateMilpacForUser()` already returns both buffers as well as persisting
them. The dossier route uses the returned bytes rather than re-reading
`storage/milpacs/`, which keeps the bot's existing promise that what a member is
shown is current as of the moment they asked.

### Images are downscaled before embedding

Satori takes images as data URIs, and base64 inflates by a third. The uniform is
1.4 megapixels; embedded raw, two artwork images plus a cover would be several
megabytes of string decoded on every invocation.

Each is re-encoded to its draw size first, the way `readCoverImage()` already
does for covers — reusing `fitCover()` from `lib/military/milpac-cover.ts`.
PNG rather than JPEG for the two artwork pieces, to preserve any alpha the
uniform layers carry.

---

## 5. The link buttons

Three link buttons on the reply: Overview, Service Record, Kits. These are
exactly the sections in `lib/military/milpac-tabs.ts`, so the route derives them
from `MILPAC_TABS` and `tabPath()` rather than hardcoding three.

Returned as a single `X-Milpac-Links` header holding a JSON array of
`{label, path}`. Consequences, all deliberate:

- **The Kits entry is omitted when there is no public kit**, by the same
  predicate as §3. "If they have any" needs no second definition.
- **A fourth section added to the site produces a fourth button** with no bot
  change.
- **Link buttons carry no `customId`**, so they need no handler and do not touch
  the bot's dispatch-by-custom-ID map.

### Deriving the segment

The paths are built on the member's **canonical segment** — their name slug when
they hold one, otherwise their Discord username — so a button lands on the same
URL the site would redirect to rather than eating a 307 on every click.

`canonicalSegment(member, index)` needs a slug index built from the whole
roster, so the route calls `client.fetchAllMembers()` and
`buildSlugIndex(members.map(toSlugCandidate))`, exactly as
`opengraph-image.tsx` and the profile page already do. The route looks the
member up by Discord ID as it does today; the roster fetch is for the index
alone.

Two encoding rules the header depends on:

**Paths, not absolute URLs.** The bot prefixes `config.api`. Web would otherwise
build the absolute URL from its own environment; keeping the join on the bot
side makes it structurally impossible for `config.apiInternal` to reach a
member-facing link, which `apps/bot/CLAUDE.md` forbids.

**The canonical segment is percent-encoded.** It derives from a Discord
nickname and can contain non-ASCII, which HTTP headers cannot carry. It needs
encoding to be a valid URL regardless.

Because the Overview button is the milpac link, the message text does not repeat
it. The reply is the card, the buttons, and one short line naming the member.

---

## 6. The `hidden` option

An optional boolean, defaulting to false, that makes the reply visible only to
the caller.

**Discord fixes a reply's visibility at deferral**, which `render.ts` already
documents — it is why `fail()` currently withdraws the public placeholder and
follows up privately. So `hidden` must be read *before* `deferReply`, and the
current code defers on its first line:

```ts
const hidden = interaction.options.getBoolean('hidden') ?? false
await interaction.deferReply({ ephemeral: hidden })
```

This also simplifies the failure path: with an already-ephemeral reply there is
no public placeholder to withdraw, so `fail()` edits the reply instead of the
delete-then-follow-up dance. Conditional, rather than leaving a redundant delete
in place.

`apps/bot` pins `discord.js ^14.16.3`, where `ephemeral: true` is still valid and
is what `fail()` uses. Check what the lockfile actually resolved before writing
it — past 14.17 the field is deprecated in favour of `MessageFlags.Ephemeral`,
and the file should use one or the other consistently, not both.

Scoped to the new subcommand only. Extending it to `/milpac uniform` and
`/milpac medals` is nearly free, since all three share `memberOption` and the
same render body, but is not part of this work.

---

## 7. Failure behaviour

**If the render service is down, draw the card anyway**, without the two artwork
images. Identity, statistics and the kit line still make a good card, and a dead
renderer should not turn the whole command into an error. This is the one place
the dossier route deliberately diverges from the existing `type=uniform` path,
which has nothing left to return without the render and correctly fails.

Everything else follows the route's existing contract:

| Case | Behaviour |
|---|---|
| No milpac on record | 404; the bot already relays this as "has no milpac on record" |
| Discharged member | Excluded by the route's existing `discharged: { $exists: false }` filter |
| No cover photo | The drawn ridgeline, same fallback as the share card |
| No public kit | Kit line omitted, Kits button omitted |
| `BOT_API_SECRET` unset | The route is closed and the bot says so — existing behaviour |

---

## 8. Files

**New**

| Path | Role |
|---|---|
| `apps/web/lib/military/dossier-card.tsx` | The satori component and its size constant |
| `apps/web/lib/military/dossier-data.ts` | Assembles everything the card draws for one member |
| `apps/bot/app/commands/milpac/profile.ts` | The subcommand |

**Modified**

| Path | Change |
|---|---|
| `apps/web/app/api/bot/milpac/[discordId]/route.ts` | Accept `type=dossier`; set `X-Milpac-Links` |
| `apps/bot/app/commands/milpac/render.ts` | `hidden` handling, deferral ordering, link buttons, `dossier` in the type union |
| `apps/bot/app/commands/milpac/index.ts` | Register the subcommand |
| `apps/web/lib/loadout/select.ts` | Add `pickCardKit` |
| `apps/web/docs/map/*` | Route and lib entries, per the repo's site-map discipline |

`apps/milpac` is not touched. `opengraph-image.tsx` is not touched.

---

## 9. Testing

`pickCardKit` and the kit-line formatter are pure functions in `lib/loadout/`
and get vitest coverage alongside the existing `pickLoadoutId` tests — that is
where the rule with real consequences lives, since it is what keeps a private
kit out of a public channel.

The card itself is verified by eye against a real member. There is no meaningful
automated assertion on a PNG, and `apps/bot` has no test suite at all.

The Playwright suite covers page gates and does not reach this route; no spec
there needs adding or changing.

---

## 10. Risks

**R1 — Memory per invocation.** Three decoded images plus a satori render.
Mitigated by downscaling before embedding (§4), but worth watching if the
command becomes popular.

**R2 — Layout against real data.** Long names, long role titles and long ARMA
display names all threaten the identity block and the kit line. The share card
already scales its name size by length; the dossier needs the same treatment,
and the kit line needs a truncation rule.

**R3 — Cover photos are unconstrained.** The scrims were tuned for the 1300x630
share card. At 1400x860 with artwork over the top, they may need retuning — a
bright daylight cover behind the stat strip is the case to check.

**R4 — Renders are not cached.** Every invocation re-renders the uniform and
medal box through the render service. This matches `type=uniform` today and is a
deliberate freshness guarantee, but the dossier does two renders where the
existing commands do two and discard one.
