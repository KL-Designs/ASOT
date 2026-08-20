# Public Page Shell — Design

Replaces `apps/web/components/container.tsx` — the banner-and-body shell behind
every public page that is not the landing page — and rebuilds the six `/about`
pages on top of it in the Command Strip language the landing page and the navbar
already use.

`Container` is shared, so this is not an `/about` change that happens to touch a
component. Nine other pages render the same shell, and all nine inherit the new
masthead the moment it lands. The section rail is the one piece that is
About-only.

## Goal

The public pages outside the landing page are the last surface still on the old
visual language, and the shell is why.

**The first screen is a photograph.** `Container`'s `bannerHeight` maps onto
`vh` units in `tailwind.config.ts` — `md` is `40vh` mobile / `60vh` desktop.
Add the navbar (28px status strip + 66px bar = 94px) and a reader on a 1080p
display sees roughly 742px of banner, a centred title and a decorative rule
before any content at all. Six of the ten consumers ask for `md` or `lg`.

**The tab rail is unattached.** `about/layout.tsx` renders a centred row of
12.5px links on a 1px hairline, with nothing above or below to seat it. It is
not sticky, so on Rules — the longest page in the family — it is gone within one
scroll and there is no way back to the other five sections without returning to
the top.

**Every block has equal weight.** Each About page is one
`grid-cols-1 md:grid-cols-2` of identical `InfoCard`s. The unit's thesis and a
one-line FAQ answer get the same box, and because the boxes stretch to their
row, unequal content leaves visible holes — "Who We Play As" ends half a card
early beside "Who Are We?" today.

**Lists are not lists.** Rules § 4 is thirteen `<Typography>` elements each
opening with a hyphen. No `<ul>`, no `<li>`, no hanging indent, so a wrapped
line runs back underneath its own dash. The same pattern appears in every Rules
section, in six of the twelve callsigns, and in the FAQ's "How often do you
play?".

**None of the site's own vocabulary is present.** Body copy falls back to the
`Arial, Helvetica, sans-serif` on `body`; headings are MUI defaults. The four
type roles (`--font-disp`, `--font-cond`, `--font-mono`, `--font-ui`), the
graded ink levels, the two hairline weights, the notched button, the topo
backdrop and the two-pass veil are all defined in `styles/globals.css`,
`styles/ui.module.css` and `styles/landing.module.css` — and none of them are
used here.

The redesign carries the landing page's language across, in full, without
rewriting a word of the content.

## Non-Goals

- **Rewriting the copy.** Every paragraph, bullet, question and answer stays
  verbatim. The single exception is §4.3: grouping fourteen FAQ entries needs
  three group headings and three kickers, six short labels that do not exist
  today. Nothing else is added, cut or reworded.
- **Changing URLs.** All six About routes keep their paths. No redirects, no
  consolidation.
- **Redesigning the landing page or the navbar.** This branch is cut from
  `feat/navbar-redesign` and consumes what it built. `styles/navbar.module.css`,
  `styles/landing.module.css` and the `(landing)/_components/*` tree are read,
  not edited.
- **Redesigning milpacs.** `milpacs/[username]` has its own design system in
  `profile.module.css` and is deliberately left alone; it is a reference for
  tone, not a component source.
- **Touching the Discord widget iframe** on `/about/contact`, the luxon
  timezone conversion in `about/timezones.tsx`, or `CallsignCard`'s lightbox
  behaviour. Their surroundings change; their behaviour does not.
- **A light theme.** The site is dark-only and stays that way.

## 1. The masthead

`Container`'s banner becomes the landing hero's composition at content-page
scale: a photo band carrying the two-pass veil and the drifting topo, with the
title, kicker and lede in the left column and an optional aside in the right.

### 1.1 The band

Fixed heights replace the `vh` mapping. `bannerHeight` keeps its four-value
vocabulary so no call site changes, but the values move onto clamps:

| `bannerHeight` | today (mobile / desktop) | new |
|---|---|---|
| `xsm` | 10vh / 20vh | `clamp(110px, 16vh, 150px)` |
| `sm` | 20vh / 40vh | `clamp(170px, 24vh, 250px)` |
| `md` | 40vh / 60vh | `clamp(230px, 34vh, 340px)` |
| `lg` | 60vh / 80vh | `clamp(280px, 44vh, 420px)` |

`md` going from 60vh to a 340px ceiling is the largest single change any
consumer sees, and it is the point of the exercise.

The veil is two passes, lifted from `.heroVeilSolo` in `landing.module.css`: a
horizontal vignette dark at both edges and clear through the middle, and a
vertical pass whose ramps sit tight against the top and bottom so the band seats
under the navbar and lands on `--ink-0` rather than on a hard seam. The topo
uses the existing `Topo` component (`components/ui/Topo.tsx`) with the
`topoEdges` mask, which shares its stops with the vignette — the two have to
agree or the contours outlive the darkening and read as a separate layer.

### 1.2 The copy column

- **Kicker** — `--font-mono`, 10px, `.26em` tracking, `--red`, with a leading
  rule and a trailing gradient rule. Set from the new `kicker` prop; falls back
  to a label derived from the route segment.
- **Title** — `--font-disp` 700, uppercase, `clamp(38px, 6vw, 72px)`, dropping
  to `clamp(32px, 4.4vw, 52px)` for the longer sub-page titles.
- **Lede** — `--font-ui`, 15.5px, `#c4c9cf`, capped at 52ch, separated from the
  title by a 1px top rule. Resolution order is `lede` prop → `subtitle` prop →
  the page's own `metadata.description`.

That last fallback matters: all six About pages already export a
`metadata.description` written to describe the page in one sentence, which is
exactly what the slot wants. Four of the six also already carry a `subtitle` in
`about/layout.tsx`'s `Pages` array. **No page needs new copy for its lede.**

### 1.3 The aside

The optional right column, 330px, `rgba(9,10,12,.84)` with a 10px backdrop blur,
`--line-2` border and a 2px `--red` top edge — the `.opcard` treatment from the
landing hero. A live dot and header, a rule-separated list of label/value rows,
and an optional notched CTA.

Only `/about` and `/join` take one. Every other consumer renders the band solo,
and the grid collapses to a single centred-left column — the same fallback
`.heroInnerSolo` uses when there is no operation to feature. A 340px band with
an empty right half would read as the two-column composition with a hole in it.

**The aside receives values as props.** `Container` stays a presentational
component and does not fetch. `/about` and `/join` are already server
components; they resolve roster, next-op and application state themselves and
pass them down. Making `Container` async to fetch its own would push that cost
onto all ten consumers, nine of which have no aside.

## 2. The section rail

A new `SectionRail` component, rendered by `Container` when a `rail` prop is
present. Today only `about/layout.tsx` passes one.

An instrument strip between two `--line-1` rules on `#0a0b0d`: one cell per
page, each a two-line stack of a mono index (`01`–`06`) over a
`--font-cond` 15px uppercase label, cells divided by hairlines.

**Cells auto-fit to their label rather than dividing the width equally.** Six
equal columns forces "Rules & Expectations" and "Principles & Values" to be
abbreviated in the rail but not in the page title, and locks the family at six.
Auto-fit keeps every real title and makes a seventh page a seventh cell.

The active cell takes a 2px `--red` top border with a soft glow, a
`rgba(219,0,29,.12)` top-down wash, `--txt-1` on the label and `--red` on the
index.

**Sticky under the navbar.** The navbar is 94px tall in its full state, so the
rail pins beneath it and stays reachable at any scroll depth. This is the fix
for Rules and FAQ specifically, where the rail currently disappears immediately.

`SectionRail` is a client component — it resolves the active item from
`usePathname()` itself. That lets `about/layout.tsx` **stop being a client
component**: it currently carries `'use client'` solely to read the pathname and
pick the active tab and banner.

## 3. Content primitives

`InfoCard` (`components/info-card.tsx`) is replaced for these pages by three
primitives. It stays in the tree until nothing imports it (§8).

### 3.1 The card

`--ink-1` on a `--line-1` hairline, 22px padding, hover lifting to `--ink-2` /
`--line-2`. Optional parts, in order: an outlined ghost numeral pinned top-right
(`--font-disp` 80px, `transparent` fill, 1px `#1a1d23` stroke), a mono kicker, a
30px `--red` icon, an `--font-disp` heading, and a body.

**The ghost numeral is only used where the number is real.** Rules already calls
its own blocks "Section 1 — General", and the FAQ groups are numbered by the
rail index. Callsigns get none — "India 0A" is already the identifier and a
second number beside it is noise.

Cards declare a column span. That is the mechanism that fixes the ragged grid:
a long card spans wider and flows its list into more columns, so its height
drops to match its neighbours instead of towering over them.

### 3.2 The list

A real `<ul>`, `list-style: none`, each `<li>` with `padding-left: 20px` and a
9×1px `--red` rule as its marker via `::before`. Hanging indent, so wrapped
lines align under the text rather than under the marker.

Multi-column variants use CSS `columns` with `break-inside: avoid` on the item,
not a grid — the list reflows to one column on narrow screens with no markup
change and no item split across a column break.

### 3.3 The Q&A row

For the FAQ: a `30px | 1fr` grid of a mono index and a block of
`--font-cond` question plus `--font-ui` answer, rows divided by `--line-1`
hairlines, and the whole stack optionally flowed into two columns.

Answers stay in the DOM. No accordion — these pages are indexed and Ctrl-F'd.

## 4. The six About pages

### 4.1 About

`bGrid` of 4 columns. A lead card spanning 2×2 carries "Who Are We?" over a
photograph — the `.whyLead` composition from `WhySection`. "Who We Play As" and
"Mission Types and Styles" are single-span ghost-numbered cards. "When Do We Run
Missions?" spans 2, so `timezones.tsx`'s two DST windows sit side by side as a
schedule table rather than stacking.

The schedule stops being bold labels followed by grey `<span>` chips: two
columns of label/time rows, `--font-mono` `tabular-nums` figures, step-off in
`--red-hi`, DST window in a mono sub-label. `timezones.tsx` keeps its luxon
conversion and its `'use client'` boundary; only its markup changes.

### 4.2 Rules

`bGrid6` of 6 columns. Spans follow content length so the rows sit flush:

| § | Section | Clauses | Span | List columns |
|---|---|---|---|---|
| 1 | General | 6 | 3 | 1 |
| 2 | Attendance | 4 | 3 | 1 |
| 3 | TeamSpeak | 6 | 2 | 1 |
| 4 | Operations & Missions | 13 | 4 | 2 |
| 5 | Discord & Media | 5 | 6 | 3 |

Thirteen bullets in a four-wide card flowed into two columns is roughly the
height of six bullets in a two-wide card, which is what lets § 3 and § 4 share a
row. Source order is preserved — a rules page whose sections are out of order
would be worse than a ragged one.

### 4.3 FAQ

Fourteen `InfoCard`s become three wide cards of Q&A rows, spans 3 / 3 / 6:

| Group | Kicker | Entries |
|---|---|---|
| Joining ASOT | Eligibility | 4 — age, location, microphone, other MILSIM communities |
| Game & setup | Requirements | 4 — first person, paid ARMA 3, DLC, mods |
| Playing with us | Life in the unit | 6 — PvP, cost, how often, member count, non-members, joint ops |

**These six labels are the only new words in the redesign.** The alternative
considered and rejected: a single full-width card holding all fourteen rows in
two columns, which adds nothing but produces one very long undifferentiated
card. The grouping was approved on 2026-08-21.

### 4.4 Callsigns

Twelve cards — not thirteen; `India 0A`, `India 1-0`, `1-0 Zulu / Game Masters`,
`India 1-1`, `India 1-2`, `India 1-3-0`, `1-3 Echo`, `1-3 Golf`, `1-3 Hotel`,
`1-3 Mike`, `1-3 Victor`, `Reservists`.

Kept as a 3-across grid, restyled: the photo band gets a bottom fade into
`--ink-1`, the designation sits over it in `--font-disp` 24px, a mono role chip
pins top-right, and each card's duty bullets become a real list. No ghost
numerals. `CallsignCard`'s existing image handling is preserved.

### 4.5 Contact

Three channel cards keeping their brand accents — Discord `#5865f2`, TeamSpeak
`#00bcd4`, email `--red` — as a `--acc` custom property on the card rather than
the current five hardcoded `accentColor`/`accentRgb` prop pairs. This is the one
place on these pages where a non-red accent carries meaning.

The Discord iframe widget keeps its own full-width card below.

### 4.6 Values

Already ships two named groups of four — "Core Values" and "Operating
Principles" — which is exactly the section structure the redesign wants. Each
group becomes a `SectionHead` plus a 4-across card grid with ghost numerals
01–04.

One fix: the card kicker currently repeats the card title (`Community` /
`Community`). The kicker carries the group instead — `Core value` /
`Operating principle` — or drops. **Open (§11).**

## 5. The ten consumers

`Container` is rendered by ten files. `app/me/layout.tsx` imports `Container`
and a banner image and renders **neither** — dead imports left from an earlier
revision. It is not a consumer, and the imports are deleted (§8).

| File | `bannerHeight` | Notes |
|---|---|---|
| `about/layout.tsx` | `md` | The only `rail` consumer. Aside: live. |
| `join/page.tsx` | `sm` | Aside: applications open, min age, response time. Uses `backgroundUrl` (SOTM image) rather than a static import. |
| `donate/page.tsx` | `md` | Solo band. |
| `partnerships/page.tsx` | `md` | Solo band. Uses a local `SectionHeader` that should become the shared `SectionHead`. |
| `support/page.tsx` | `md` | Solo band. Same local `SectionHeader`. |
| `credits/page.tsx` | `sm` | Solo band. Passes `gap-14`, `padding: '3rem 2rem'`. |
| `community/orbat/page.tsx` | `sm` | Solo band. `maxWidth: 'max-w-[1400px]'`. |
| `community/bios/page.tsx` | `sm` | Solo band. `maxWidth: 'max-w-[960px]'`. |
| `community/hof/layout.tsx` | `sm` | Solo band. Passes `padding: '0px'` and lays out its own inner padding — the most likely to break. |
| `thomo/page.tsx` | `lg` | Easter egg. `maxWidth: 'max-w-xl'`. Left as-is beyond inheriting the band. |

Partnerships and Support both use `InfoCard` heavily and both argue a case
rather than answer a question — they are the natural second wave for the
ghost-numbered card grid, but that is follow-up work, not this branch.

## 6. Component decomposition

```
styles/shell.module.css          new — masthead, aside, rail, section grid
components/ui/Masthead.tsx       new — band + veil + topo + copy column + aside
components/ui/SectionRail.tsx    new — client; resolves active from usePathname
components/ui/Card.tsx           new — ghost numeral, kicker, icon, span
components/ui/List.tsx           new — <ul> with rule markers, column variants
components/ui/QaRow.tsx          new — FAQ question/answer row
components/container.tsx         rebuilt on Masthead; props extended
components/info-card.tsx         retained until unreferenced
```

`SectionHead` (`components/ui/SectionHead.tsx`) already exists and is used
unchanged. `Topo`, `components/ui/icons` and `ui.module.css`'s `.btn` are
consumed as-is.

`Container`'s signature, with everything above the rule unchanged:

```ts
Container({
  title, subtitle, background, backgroundUrl,
  sx: { maxWidth, bannerHeight, padding, gap },
  // ───────────────────────────────────────────
  kicker?: string          // falls back to a label derived from the route
  lede?:   string          // falls back to subtitle, then metadata.description
  aside?:  AsideProps      // omit for a solo band
  rail?:   RailItem[]      // sticky section rail
  scene?:  'ridge' | 'town'  // drawn fallback where a page has no photograph
})
```

Every new prop is optional. All ten call sites keep compiling untouched, and a
page passing none of them still gets the new masthead with a route-derived
kicker.

`scene` covers the case a page has no banner image — an inline SVG rather than
the current `/images/fallback.webp`, following the precedent of `BannerScene` in
`milpacs/[username]/hero.tsx`, where a drawn scene reads as the page's own
furniture and a repeated photograph reads as a missing upload.

## 7. Responsive behaviour

- **≤1180px** — the aside is dropped and the copy column takes the full width;
  4-column grids become 2; 6-column spans clamp to 2; 3-column lists become 2.
- **≤900px** — the rail overflows to a horizontal scroll with the active cell
  scrolled into view on mount, scrollbar hidden.
- **≤860px** — all grids become single-column, all list and Q&A column flows
  become one, the schedule table stacks its two DST windows.
- **Reduced motion** — the topo drift is already gated in `ui.module.css`; the
  card and rail transitions are gated the same way.

## 8. What is deleted

- **`bannerHeight`'s `vh` values** in `tailwind.config.ts` (`banner-xsm`
  through `banner-lg-md`) once nothing references them.
- **`'use client'` in `about/layout.tsx`**, along with `usePathname` — the rail
  owns active-state resolution.
- **The sibling-image preload block** in `about/layout.tsx`. It renders a hidden
  `<Image>` per sibling page at `width={1} height={1}` with `priority`. Because
  `next/image` builds its srcset from the declared width, this appears to be
  requesting a ~16px-wide variant rather than warming the full-size banner the
  next page actually renders — i.e. it likely does nothing for the case it was
  written for. **Confirm against the network panel during implementation**;
  replace with an explicit `<link rel="preload">` if the intent is worth
  keeping, otherwise drop it.
- **The dead `Container` and `Banner` imports** in `app/me/layout.tsx`.
- **`components/info-card.tsx`**, only once no page imports it. Partnerships and
  Support still will after this branch, so it survives for now.

## 9. Testing

`apps/web/tests/` is a Playwright E2E suite covering gates, permissions and
route visibility. **Ask before running it** — it spawns a real `next dev` server
that hot-reloads on save, so a run overlapping an edit produces spurious
failures.

- Grep the suite for assertions against the old shell — `container-h1`,
  centred-banner selectors, or the About tab markup — and update any that break.
- These pages are public and mostly static, so the suite has little to say about
  them. If nothing asserts on them today, add one spec that walks all six About
  routes and checks the rail marks the right cell active — the one piece of real
  behaviour the redesign introduces.
- `npm run lint` and `npm run build` from `apps/web` before the branch is
  considered done.

## 10. Rollout

Sequenced so the About family proves the shell before nine other pages inherit
it. On `feat/public-page-shell`, cut from `feat/navbar-redesign` at `36d4e482`.

1. **Shell primitives** — `shell.module.css`, `Masthead`, `SectionRail`.
   Nothing consumes them yet.
2. **`Container` rebuilt** on `Masthead`, props extended, `bannerHeight`
   remapped. All ten call sites still compile; every page's banner shortens.
   Visual check of all ten before going further.
3. **Content primitives** — `Card`, `List`, `QaRow`.
4. **The six About pages** — rail into the layout, then each page's content onto
   the new primitives, in the order About → Values → Rules → FAQ → Callsigns →
   Contact. Values first among the rebuilds because it already has the right
   section structure and is the cheapest confirmation the card grid works.
5. **Hall of Fame and Join** — the two consumers most likely to break, checked
   by hand. HoF passes `padding: '0px'`; Join uses `backgroundUrl`.
6. **Docs and suite** — update `docs/map/*` for every added, removed or changed
   component and page, per the repo's map discipline. Update or add Playwright
   coverage per §9.

Not one commit to all ten consumers. Step 2 is the risky one and gets its own
commit and its own visual pass.

## 11. Open questions

- **The Values kicker.** Does the card kicker carry the group name (`Core value`
  / `Operating principle`) or drop entirely? Cosmetic, decidable during step 4.
- **Whether `/about`'s aside pulls a real next-op.** The landing page already
  fetches one; reusing that query on `/about` is cheap, but if the aside is
  showing "no operation scheduled" most of the week it may be better as three
  static rows plus the roster. Decide once it is on screen with real data.
- **Whether Partnerships and Support get the card grid** in a follow-up branch.
  Both argue a case and both are still on `InfoCard`; neither is in scope here.
- **Whether `thomo` should keep `lg`.** It is an easter egg built around a
  full-bleed image, and a 420px ceiling may undercut the joke.
