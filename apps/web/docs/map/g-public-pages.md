# Part G — Public-facing pages

Scope: `app/(landing)/**`, `app/operations/**`, `app/members/**`, `app/tickets/**`, `app/maps/**`,
`app/optionals/**`, `app/login/**`, `app/me/**`, `app/recruit-session/**`, `app/services-asot/**`,
`app/shoot/**`, `app/wip/**`, plus `app/layout.tsx`, `middleware.ts`. (No root `app/page.tsx` exists —
`/` is served by `app/(landing)/page.tsx`.)

---

## Root

#### middleware.ts
Rewrites the work-in-progress routes in its own narrow `config.matcher` (`/retired`, `/bios` and
their subpaths) to `/wip`, unless the URL has `?bypass_wip`. ORBAT was on this list until it was
released. It runs on nothing else and sets no headers — see part H for why the app-wide matcher
and its `x-pathname` header are both gone.

#### app/layout.tsx
Root HTML layout: MUI `ThemeProvider` with `UnitTheme`, `CustomCursor`, and the site
`Navbar`/`Footer` (from `app/navbar.tsx` / `app/footer.tsx`) wrapping `{children}` for the entire
app (both landing and dashboard trees share this shell). Sets dynamic `metadataBase` from request
headers. Public.

Fonts: Montserrat stays the `<body>` font. Barlow Condensed, Oswald, JetBrains Mono and Inter are
also loaded via `next/font/google` and exposed as CSS variables on `<html>`; `styles/globals.css`
wraps each in a `--font-cond` / `--font-disp` / `--font-mono` / `--font-ui` alias with its fallback
stack, and components reference only those. Declared site-wide rather than scoped to the navbar so
other surfaces can adopt the display/mono faces.

#### app/navbar.tsx
The **Command Strip** site navigation (client component) — three bands: a `StatusRail` carrying the
next operation and live presence, the 66px bar itself, and a `MobileSheet` below 1200px. Fetches
`/api/me` on mount for auth state and `useNavStatus()` for the rail. Renders the brand plate, the
six-item menu with hover-opened mega panels (912px, or 640px "compact" for short menus; the `<li>`
is `position: static` so a panel anchors to the bar and can never be pushed off-screen), the right
cluster (icon buttons, DONATE, the auth-dependent primary action, `AccountMenu`), and the
scroll-to-top button. Sub-components live in `components/nav/*`; all layout in
`styles/navbar.module.css`. Public — signed-out visitors get ENLIST (`/join`) in the primary slot.

**Right-cluster hierarchy is deliberate:** only one element is ever solid-filled — whichever is the
primary action for the current auth state. DONATE stays an amber ghost so it never competes with it.
Don't add a second filled button without re-thinking the whole cluster.

---

### /  — Landing Home
#### app/(landing)/layout.tsx
Route-group layout for all `(landing)` pages; sets default OG/Twitter image. No auth gate — public.

#### app/(landing)/page.tsx
The public home page — a **server component** (`force-dynamic`). Every figure comes out of Mongo
through `lib/landing.ts`, so the page renders complete instead of filling in after mount. Sections
in order: hero, stat readout, intel board, why, platoons, gallery strip, enlist band. Sub-components
live in `app/(landing)/_components/`; layout in `styles/landing.module.css`; the shared vocabulary
(notched buttons, pulses, section heads, progress tracks, topo) in `components/ui/` +
`styles/ui.module.css`. Fully public, no auth.

**The page leads with what is happening next.** The version it replaced was an about page: it
explained who the unit is four separate times and never told a returning member anything
actionable, and its operations section was headed "Recent & Upcoming" above three cards all marked
COMPLETED. Don't reintroduce a layout that buries the next operation.

#### app/(landing)/_components/*
- `Hero.tsx` — **client**. Variant A "overlay": copy lower-left over the Screenshot of the Month,
  the `public/ASOT.svg` lockup, CTAs, live roster facts. Hosts the physics minigame (`PhysicsGame`,
  `MinigameScoreboard`, `FireEmbers`) and the `id10t` keyboard easter egg, fading the copy out while
  the game is active. Takes the next-op card as a prop so that card stays server-rendered.
- `NextOpCard.tsx` — next operation with a live `Countdown` and sign-on track. The block that gives
  the page a job.
- `StatReadout.tsx` — four-up figure bar. Only the roster figure is live.
- `IntelBoard.tsx` — featured operation + operations log (upcoming ahead of completed, status dot
  per row).
- `WhySection.tsx` — lead card + four cards, replacing ~4,800px of alternating text/image blocks.
- `Platoons.tsx` — three platoon cards with live member/section counts from the ORBAT.
- `GalleryStrip.tsx` — six images drawn at random from `storage/gallery/featured`. Captions are
  filenames tidied up; the gallery stores no titles, dates or photographer credits.
- `EnlistBand.tsx` — the three-step enlistment path above the final CTA.

#### app/footer.tsx
The site footer ("Command") — a **server component**. Five columns: brand + socials, three link
columns, and a live unit-status panel (next op, sign-ons, roster, applications) that bookends the
navbar's status rail at the other end of the page. Reads `getFeaturedOp()`/`getRosterCount()` from
`lib/landing.ts`. Styles in `styles/footer.module.css`. Keeps `CreditsModal` and the Dakoda
`Signature`, the latter on a proper plate rather than floating in the legal text.

---

### /about — Unit Info, on the Section Rail
#### app/(landing)/about/shell.tsx
**Server component**, rendered by each of the six About pages rather than as a segment layout —
there is no `about/layout.tsx`. Holds the `ABOUT_PAGES` table (key/href/label/kicker/subtitle/
background) that drives both the masthead copy and the rail, and takes the page as an explicit `page`
key (`index|callsigns|contact|rules|values|faq`) because a server component cannot read the current
path. It renders everything through `Container`, passing `rail={ABOUT_PAGES}`. No page in the family
passes an `aside` — none has a live figure worth a second masthead column, so all six render a
full-width masthead. `about/page.tsx` no longer needs its `force-dynamic` either, now that the
roster query is gone; in practice all six still build as dynamic, because the shared root layout's
footer reads Mongo. Public.

#### app/(landing)/about/page.tsx
"Who We Are" on the card grid (`Card`/`CardGrid`, `MedalIcon`/`TargetIcon`), lead card carries the
unit photo and copy; the schedule card embeds `<TimeZones/>`. Public, no API calls.

#### app/(landing)/about/callsigns/page.tsx
Callsign registry (India 0A, 1-0, Gamemasters, 1-1/1-2/1-3 platoons, Reservists) via `CallsignCard` +
`List`. Public, purely static content.

#### app/(landing)/about/contact/page.tsx
Opens on the live presence panel (`.presence*` in shell.module.css) — TeamSpeak online, active
roster, next-op countdown — then four `.channel` cards (Discord, TeamSpeak, Email, Facebook).
`force-dynamic`; reads `getFeaturedOp`/`getRosterCount` (lib/landing) and `getOnlineCache`
(lib/teamspeak/cache) directly rather than through /api/nav/status, which serves the navbar rail the
same three figures. Replaced the embedded Discord widget iframe, which published members' display
names to anyone loading the page. Public.

#### app/(landing)/about/contact/next-op-figure.tsx
Client component: the countdown tile's figure. Takes the server-rendered string as `initial` so the
first client render matches the server HTML, then re-derives via `formatUntil` every 30s.

#### app/(landing)/about/faq/page.tsx
FAQ grouped into three `Card`s (`Joining ASOT` / `Game & setup` / `Playing with us`) of `QaRow`/
`QaStack` entries, not an accordion — answers stay indexed by search engines and found with Ctrl-F.
Public.

#### app/(landing)/about/rules/page.tsx
Rules/expectations as real `List`s inside `Card`/`CardGrid` (General, Attendance, TeamSpeak, …).
Public.

#### app/(landing)/about/timezones.tsx
Client component: computes and displays op load-in/briefing/step-off times converted to the
visitor's local timezone (standard vs. daylight saving) as a two-column schedule table, using
`luxon`. Used inside `about/page.tsx`'s schedule `Card`.

#### app/(landing)/about/values/page.tsx
"Principles & Values" on the card grid (`Card`/`CardGrid`, one grid for values, one for operating
principles). Public.

None of the six About pages use `components/info-card.tsx` any more — they were the last public
consumers before this rebuild; `InfoCard` itself is still current, used by `/partnerships` and
`/support` below.

---

### /bios, /hof, /kits, /orbat, /quiz, /retired — the community pages
These five trees plus the quiz sat under `/community/*` until they were flattened to the top level
(`/community/orbat` is `/orbat`, and so on). A catch-all `permanent` redirect in `next.config.ts`
keeps every old URL working — indexed pages, Discord links, stored notification `actionUrl`s.
#### app/(landing)/bios/page.tsx
Server component: queries `Db.users` for HQ leadership roles, resolves ORBAT entries/profile via
`resolveMilpacProfile`, renders bio cards with `/api/uploads/bio?id=` photo. Gated by
`WIP_PAGES` env flag (shows `<WipPage/>`) — also intercepted by middleware's matcher rewrite.
Public read (no login required to view).

#### app/(landing)/bios/loading.tsx
`TacticalLoader` Suspense fallback ("LOADING BIO DATA").

#### app/(landing)/hof/layout.tsx
Hall of Fame banner/container layout.

#### app/(landing)/hof/page.tsx
Hall of Fame — currently **hardcoded example data** (5 fake members), TODO comment says to swap
for a real `Db.users` query keyed on a HOF Discord role. Public, static for now.

#### app/(landing)/kits/page.tsx
The unit's shared-kit shelf, reached from the navbar's "Community" menu. Server component: reads
`Db.loadouts.find({shared: true})` (newest first) and `client.fetchAllMembers()`, builds one
`CardData` per kit (name, `description`, `tags` via `normaliseTags`, `ratingAvg`/`ratingCount` plus
`ratingScore` = `weightedScore()` computed once here, `copyCount`, the primary weapon with its
attachments, headgear/uniform/vest/pack, an item count from `summariseLoadout`
(`@/lib/loadout/summary`), and a lowercased `|`-joined `haystack` for client-side search), then hands
the list to `<Shelf>`. Server-side for the same reason `loadout-panel.tsx` is: `resolveItemName` reads
a ~2.7MB dictionary that must never reach the browser — only resolved strings and each shared kit's
`raw` export cross into the client component. A kit whose owner is no longer on the roster is
skipped, as is one that fails to parse — neither may take down everyone else's shelf. Borrows the
milpac's design system wholesale — `profile.module.css` supplies `.shell`/`.panel`/`.btn` and the
custom properties they define, `kits.module.css` only the shelf and card layout. `--acc` is per card,
set to the owner's own Discord accent; the page chrome uses the unit red. Public, no login required.

#### app/(landing)/kits/shelf.tsx
`'use client'` — the shelf's controls and grid: search box, the four sorts (Newest / Top rated /
Most copied / A-Z, `SHELF_SORTS`), an AND tag filter bar with per-tag counts (`tagCounts`, counted
over every card so a chip's number doesn't shift as you type), and 24-per-page numbered paging
(`KITS_PER_PAGE`). Filtering/sorting/paging all happen client-side over the cards the server already
shipped — a keystroke costs no round-trip — using the pure functions in `lib/loadout/shelf.ts`
(`matchesQuery`, `matchesTags`, `sortCards`, `pageCount`, `paginate`); this file is state and markup
only. Any change to query/tags/sort resets to page 1. Filter state is not mirrored into the URL, so a
filtered shelf is not linkable. Renders one `<KitCard>` per shown kit, staggered entrance delay capped
at 8 cards.

#### app/(landing)/kits/kit-card.tsx
`'use client'` — one kit on the shelf: owner avatar/name, `<TagChips>`, the owner's `description` when
written, primary weapon + attachments, the gear grid, a read-only `<Stars avg count>` row
(`components/loadout/stars.tsx`), and a footer with item count, copy count (seeded from the server,
corrected by the copy endpoint's own answer), a "View" link to `/milpacs/<canonical>/kits/<id>`, and
`<CopyKitButton>` (`copy-kit.tsx`). `CardData` (`ShelfCard` from `lib/loadout/shelf.ts` plus the
rendered fields) is exported for `shelf.tsx` and `page.tsx` to share.

#### app/(landing)/kits/copy-kit.tsx
Client `CopyKitButton`: copies a shared kit's raw ACE arsenal export via `copyText`
(`@/lib/clipboard`), showing "Copied" for 1.8s. Borrows `.btn` from `profile.module.css`.

#### app/(landing)/orbat/loading.tsx
`TacticalLoader` Suspense fallback ("LOADING ORBAT DATA").

#### app/(landing)/orbat/page.tsx
The full public ORBAT board: Company HQ hero, 1-1/1-2/1-3 platoon columns (`PlatoonColumn`,
`UnitCard`, `MemberRow`), Gamemasters/Reservists cards. Pulls `fetchORBAT()` from `@/lib/orbat`,
per-section colour/patch metadata from `Db.orbatSectionMeta`, links member names to
`/milpacs/[username]`. Shows a "⚙ Manage ORBAT" link to `/dashboard/orbat` if
`PERMISSIONS.admin.manageOrbat`. Intercepted by middleware `WIP_PATHS`. Public read.

#### app/(landing)/quiz/[attemptId]/page.tsx
Server page for an in-progress/completed quiz attempt. Requires login (`redirect('/login')` if no
`me`), validates the attempt belongs to the current user, shows static pass/fail/under-review
screens or renders `<QuizClient/>` for an in-progress attempt. Reads/writes `Db.quizAttempts`.

#### app/(landing)/quiz/[attemptId]/quiz-client.tsx
Client quiz-taking UI: section sidebar (`QuizSectionSidebar`), timer panel (`QuizTimerPanel`),
question cards (`QuizQuestionCard`), instruction modal. Debounced auto-save + start/submit via
`PATCH /api/community/quiz/[attemptId]` (`action: 'save'|'start'|'submit'`). Auto-submits on timer
expiry.

#### app/(landing)/retired/layout.tsx
Sets metadata for the Retired Members wall.

#### app/(landing)/retired/page.tsx
Thin wrapper — renders `<RetiredWall/>` (or `<WipPage/>` if `WIP_PAGES=true`). Also intercepted by
middleware matcher rewrite (note: `/retired` is still in that matcher).

#### app/(landing)/retired/RetiredWall.tsx
Large client component: a pannable/zoomable "memorial wall" of plaques for honourably (HD) and
generally (GD) discharged members, laid out via a custom grid-packing algorithm. Fetches member
list from `/api/community/retired`, and on plaque click fetches a discharge snapshot from
`/api/community/retired/snapshot?discordId=`. Shows archived MILPAC images
(`/api/milpacs/[userId]-discharge`), promotion/qualification/award tables. Supports deep-linking via
`?member={discordId}`. Public.

---

### /credits, /donate, /partnerships, /preferences, /support, /thomo — Static/Utility Pages
#### app/(landing)/credits/page.tsx
Server page: `getCreditsData()` from `@/lib/credits` builds contributor cards (avatar, ORBAT
role, milpac stats) and a "Special Thanks" section, plus a static tech-stack footer. Public.

#### app/(landing)/donate/page.tsx
Static PayPal donation page (info cards + conditions list). Public.

#### app/(landing)/partnerships/page.tsx
Static sister-unit partnership cards (ACOM, APCA, 7th Cavalry, 2nd Airmobile). Public.

#### app/(landing)/preferences/page.tsx
Client "Member Settings" page: toggles custom cursor (persisted to `localStorage` + a
`cursor-toggle` custom event) and per-notification-type website/Discord delivery toggles, backed
by `GET/PUT /api/preferences`. Requires an authenticated user implicitly (fetch will fail/redirect
upstream if not logged in — no explicit guard visible in this file, relies on `/api/preferences`).

#### app/(landing)/support/page.tsx
Static mental-health/crisis-support resource page (Lifeline, Beyond Blue, etc.) with `SupportCard`.
Public.

#### app/(landing)/thomo/page.tsx
Client joke/meme page — grid of static images from `/public/thomo/`. Public, no logic.

---

### /gallery — Operation Screenshot Gallery
Public. Side rail of filters against a masonry grid, styled from `styles/gallery.module.css`.
Data from `GET /api/gallery` (nested `years[].operations[].stages[].media[]`) plus
`GET /api/gallery/sotm`; images served via `/api/gallery/fetch?...`, `/api/gallery/featured?img=`
and `/api/gallery/sotm/image`.

Storage holds years → operations → missions → filenames and nothing else, so there is no
photographer, tag or like data anywhere on the page — those facets don't exist rather than
rendering empty.

#### app/(landing)/gallery/layout.tsx
Metadata only. Deliberately does **not** wrap the route in `Container` — the page renders its own
banner, and it runs edge-to-edge so the featured strip can overflow the viewport.

#### app/(landing)/gallery/page.tsx
Client orchestrator (~200 lines): loads the archive + SOTM, owns filter/sort/view/paging state and
the lightbox, composes the components below. Page size 48.

#### app/(landing)/gallery/gallery-data.ts
Pure helpers, no React. `flatten()` turns the storage tree into a flat `Photo[]`;
`splitOperation()` strips the `"1. "` ordering prefix off folder names (kept for sorting, never
printed); `matches(photo, filters, skip)` — `skip` is what makes facet counts mean "how many if I
tick this"; `sortPhotos`, `groupByOperation`, `archiveStats`.

#### app/(landing)/gallery/_components/
- `GalleryBanner.tsx` — half-height header: crumb, title, archive figures (photographs /
  operations / missions / earliest year, all counted from the tree) and the screenshot of the
  month. Drops the SOTM column entirely when none is set.
- `FeaturedRail.tsx` — auto-scrolling featured strip. Drives `scrollLeft` on a real scroller via
  rAF (not a CSS marquee) so the drift, the arrows and a trackpad swipe all move the same thing;
  list rendered twice and wrapped at the halfway point for a seamless loop. Pauses on
  hover/focus/pointer-down, off entirely under `prefers-reduced-motion`.
- `Toolbar.tsx` — search, running result count, sort, view switcher, and active filters as
  removable pills. Exports `GridView` / `SortKey`.
- `FacetRail.tsx` — Year / Operation / Mission facets as checkbox rows with live counts.
  Mission only appears once an operation is selected.
- `PhotoGrid.tsx` — masonry / contact sheet / grouped-by-operation. Masonry spans are computed
  from the measured column width and each image's real `naturalWidth/naturalHeight`; plain
  lazy `<img>` rather than `next/image` (thousands of files, and the ratio is needed).
- `Lightbox.tsx` — generic over archive photo / featured shot / SOTM. Download + copy link.
- `icons.tsx` — the line icon set, kept off MUI so the toolbar reads as one kit.

---

### /join — Application Form
#### app/(landing)/join/page.tsx
Server page: shows Screenshot-of-the-Month banner (from `Db.siteSettings` `screenshotOfMonth`
doc) then renders `<JoinForm/>` inside a `Suspense`, plus a dev-only `<DevTestApplicationButton/>`
when `NODE_ENV==='development'`. `Container` gets an `aside` (`MastheadAside`: Applications/Open,
minimum age, cost, location) — one of only two consumers that pass one, alongside `/about`.
Public — no auth (this is the pre-membership application).

#### app/(landing)/join/JoinForm.tsx
Large client multi-step (7-step) application wizard: Discord OAuth verification
(`/api/applications/discord-login`, session check via `/api/applications/discord-session`), Steam
account linking/resolution (`/api/applications/resolve-steam`, Steam OpenID via
`/api/applications/steam-callback`), in-game name availability/offensive-word check
(`/api/applications/check-name`), background/availability/role questions, final submission to
`POST /api/applications`. Has dev-mode mock buttons for Discord/Steam when `NODE_ENV==='development'`.

#### app/(landing)/join/DeptInfoTabs.tsx
Static client tab widget describing J1–J7 departments; used inside the JoinForm's role-selection
step.

#### app/(landing)/join/DevTestApplicationButton.tsx
Dev-only button: `POST /api/dev/test-application` to seed a fake application, then redirects to
`/dashboard/j1?tab=1&app={id}`. Only rendered when `NODE_ENV==='development'`.

---

### /milpacs — Public Personnel Records
#### app/(landing)/milpacs/layout.tsx
Sets page metadata ("MILPACS").

#### app/(landing)/milpacs/loading.tsx
`TacticalLoader` fallback ("LOADING PERSONNEL RECORDS").

#### app/(landing)/milpacs/page.tsx
The MILPACs index/roster. Renders the shared `Masthead` (not a bespoke banner any more — same veil,
topo and clamped height as every other public page), passing the "Manage ORBAT" link for users with
`PERMISSIONS.admin.manageOrbat` through its `actions` slot; then the sticky `<MilpacsNav/>` jump-nav,
then a section per callsign: India Company HQ, 1st/2nd/Support Platoon, **Gamemasters (1-0 Zulu)**
and Reservists, all from `fetchORBAT()`. Section colours/patches come from `Db.orbatSectionMeta`.
**Live** — both WIP gates were removed (the `WIP_PAGES` check here and `/milpacs` in middleware's
matcher, which also covered `/milpacs/[username]`). Public read.

Layout is in `roster.module.css`: no section boxes and no max-width column — the card grid runs the
full page width and each platoon's header pins under the jump-nav (at `--milpacs-nav-h`, which
`nav.tsx` measures itself into, because that bar wraps and its height is not a constant). Cards sit
in a left-aligned `auto-fill` grid so the columns line up from one callsign to the next down the
page; a centred flex-wrap was tried and reverted, since tidying the last row cost that alignment.

`orbat.gamemasters` was returned by `fetchORBAT()` and rendered by `/orbat` long before this page
read it — Zeus was missing from the roster purely because the key was never used here. Don't drop it
again when adding a callsign.

One query feeds every card's kit: `fetchDefaultKitLines()` (`lib/milpac-kits.ts`), filtered on
`shared: true`.

#### app/(landing)/milpacs/card.tsx
**Server** component (it was `'use client'` only to run a mouse-tilt; the hover treatment is CSS now,
so 163 cards no longer ship a component of JS each). Links to the member's canonical milpac path via
an optional `href` prop (the index builds these with `buildSlugIndex`/`canonicalSegment` so cards
skip the redirect); falls back to `/milpacs/[username]`. Shows the member's Discord accent
(`resolveMemberAccent` — their own pick first, then Discord, then unit red) as the card's `--acc`, their milpac cover photo, avatar (`Avatar` from
`@/components/member/avatar`), rank abbreviation, name, billet, a 3-line-clamped `bio.content`, and
their default public kit as a `MilpacKitLine`.

The banner is the **milpac cover** (`/api/uploads/cover?id=`, the image a member uploads to their own
file), not `member.bannerURL` — Discord banners were tried and are wrong twice over: Nitro-only, and
only ever written when the member happens to log into the website. The page resolves them with
`coverIds()` (one readdir) rather than `hasCover()` per card. Members with no cover fall back to a
gradient built from their own accent rather than a blank plate; the same applies to `hexAccentColor`,
written by that same login path and reading `#888888` via `ensureVisible` for anyone who has never
signed in. Styles in `roster.module.css`.

**Animated avatars and covers are stills until hover.** Members with a Nitro avatar cluster at the
top of this page (Command first), and `next/image` passes animated images through unoptimised, so the
roster was painting full-size GIFs behind every 54px circle and repainting them for as long as the
page stayed open — a performance trace showed a steady drumbeat of long compositor commits that
stopped the moment the top of the roster scrolled away. The card renders stills (`stillAvatarURL`,
and `?still=1` for GIF covers) and hands the animated URL to CSS as `--anim-avatar` / `--anim-cover`,
which `roster.module.css` resolves *only* inside its `:hover`/`:focus-visible` rules. That placement
is the mechanism, not a detail: a `url()` parked in an unused custom property is never fetched, so an
idle roster downloads no GIFs at all and a hovered card fetches exactly one. Rendering both images
and toggling `display` would have downloaded every GIF up front. Gated behind `hover: hover` (on
touch, `:hover` sticks after a tap) and disabled under `prefers-reduced-motion`.

#### app/(landing)/milpacs/nav.tsx
Client sticky nav bar with dropdown sub-sections; smooth-scrolls to `#section-id` anchors on the
milpacs index page.

### app/(landing)/ace/ — HZN-MED

`/ace`. A parody of ARMA's ACE + KAT medical interface, and the only thing on the site
that is a game: you are handed a casualty off the ORBAT and have to keep them alive.
Began as a modal inside one member's milpac and outgrew it. **Unlisted rather than
gated** — no nav entry and `robots: noindex`; the milpac link above is how you are
meant to find it. Public read, no writes, nothing persisted: close the page and the
casualty is gone.

- `page.tsx` — server. Samples the roster and renders the client half. Metadata only.
- `ace-client.tsx` — `next/dynamic({ ssr: false })` around the menu, because it is
  entirely a client machine (AudioContext, animation frame, 250 ms sim loop). Answers
  the menu's Close with a navigation back to `/milpacs/res`.
- `casualties.ts` — server-only. Samples up to 40 names off the ORBAT
  (`Db.orbatPositions` → `Db.users`, projected) so the patient is somebody in the unit,
  with rank, callsign and avatar. Deliberately **not** `fetchORBAT()` — that loads the
  whole collection for four fields.
- `model.ts` — the casualty and the rules about them. Pure and serialisable: wound
  types and the bandage chart, fluids and dilution, the drug table with onsets/durations
  /overdose thresholds, rhythms, the airway, consciousness, what counts as stable.
  **The place to change how anything behaves.**
- `actions.ts` — the treatment tables (`TOOLS`, `ACTIONS`, `visibleRows`, `blockedBy`)
  and `simulate()`, the 250 ms tick. Every `run` mutates the casualty it is handed and
  returns what to say about it; the component clones first, which is also the seam a
  server would slot into.
- `MedicalMenu.tsx` — the whole UI. A `live` ref keeps the sim loop and your clicks
  from forking off the same render; the ECG runs on its own animation frame rather than
  React state.
- `audio.ts` — the monitor's voice. Synthesised (oscillators + one noise buffer),
  context created lazily inside a user gesture, and nothing in it throws.
- `icons.tsx` / `medical-menu.module.css` — toolbar glyphs, and the standalone
  document's CSS scoped onto a `.root` class.

#### app/(landing)/milpacs/[username]/layout.tsx
Clears default OG/Twitter images (overridden per-profile by `opengraph-image.tsx`).
**There is deliberately no `loading.tsx` beside it** — unlike the other landing routes. Now that each
section is its own route, a Suspense boundary here fires on every tab switch, replacing the whole
profile with a full-screen `TacticalLoader` and back, twice a click. Without one, Next holds the
current section on screen until the next is ready, which at this page's 0.3–0.6s render reads as a
navigation rather than a reload. The better fix is to lift the hero and tab strip into the layout so
only the section below swaps, and put a boundary with the sections; that needs `MilpacFile` split in
two first.

#### app/(landing)/milpacs/[username]/tabs.tsx
Server component rendering the profile's section tabs (Overview / Service Record / Kits) on the rule beneath the hero stat strip. Real `<Link>`s to real **routes** — `/milpacs/koda`, `/milpacs/koda/record`, `/milpacs/koda/kits` — not client state and not `?tab=`. **The path is load-bearing:** the App Router silently aborts a navigation that changes only the query string on the same path (segment tree unchanged → RSC fetch cancelled → nothing commits, no error anywhere), which made the earlier `?tab=` links take 2–8 clicks in production while ordinary cross-path links committed first time, every time. Paths come from `tabPath` (`lib/military/milpac-tabs.ts`). "Kits" is the unit's word; the code below the surface still says loadout (collection, API routes, `lib/loadout/`), ARMA's own term for the exported array. `scroll={false}` keeps the reader where they are; each navigation remounts the panels, so their `.rise` entrance stagger replays.

#### app/(landing)/milpacs/[username]/copy-link.tsx
Client button in the top bar beside the crumb: copies the profile's canonical absolute URL. Uses
`navigator.clipboard` when the page is a secure context, otherwise an off-screen-textarea
`execCommand('copy')` fallback; shows "Copied" for 1.8s, or "Press Ctrl+C" if both paths fail.

#### app/(landing)/milpacs/[username]/milpac-file.tsx
`MilpacFile` — the full individual MILPAC profile (largest file in this group, ~650 lines), rendered by four thin route files that each pass a `tab`: `page.tsx` (overview, the bare URL), `record/page.tsx`, `kits/page.tsx` and `kits/[kit]/page.tsx` (one specific kit, so a link to it survives Discord). They also re-export its `generateMetadata`/`generateViewport`. The split exists because of the App Router's aborted-query-string-navigation behaviour — see the `tabs.tsx` entry above. A kit id that does not resolve falls back to the member's default rather than 404ing (`pickLoadoutId`), and the canonical-segment `redirect()` carries the section across via `tabSuffix`, so a shared link to a tab lands on that tab. **The `[username]`
segment is resolved by `resolveSegment` (`lib/military/milpac-slug.ts`) — Discord username first,
then name slug — and the page `redirect()`s to the canonical segment when reached by the other form,
so `/milpacs/itskodas` lands on `/milpacs/koda`.** Note the redirect is temporary, not permanent: a
nickname change moves the canonical slug. Everything downstream (the `uniformHash` write, the
`/api/milpac/certificate/*` links, the editor's `/api/members/*` calls) keys on `member.username`,
**not** the URL segment. Then `resolveMilpacProfile`, **auto-regenerates** the uniform
PNG/medal-box PNG (`renderUniform`/`renderBox` from `@/lib/milpac-gen/client`, rendered by the `apps/milpac` service) on the server when a
content hash mismatches (`member.milpac.uniformHash`), computes promotion progress, enlisted date,
and confirmed-operation history grouped by campaign, displays Service Record / Promotions /
Qualifications / Awards / Operation History sections. **Certificates**: for a logged-in viewer,
each award row that maps to a certificate slide, and every row of the promotion history, is a click
target that opens the certificate full-screen (`<CertificateViewer/>` → `GET
/api/milpac/certificate/[username]`); nothing is fetched until a row is clicked. Awards are a flex
column so the whole row is the button; promotions are a `<table>` (a `<tr>` cannot sit inside a
`<button>`) so each row gets a trailing trigger cell instead. The Service Record rank row carries the
same trigger, but only when the promotion history does not already offer that rank. Edit affordances: "Edit" link to
`/members/[username]` shown to `J5-Media`; biography editable inline by the profile owner
(`<BiographyEditor/>` posts to `/api/me`); cover photo upload by owner (`<CoverUpload/>` posts to
`/api/uploads/cover`); accent colour set by owner (`<AccentPicker/>` posts to `/api/me/accent`);
`<RequestAwardButton/>` lets any other logged-in member nominate an award
(`POST /api/award-request`). Public read (no login required to view a profile), but edit actions
require login/role.

#### app/(landing)/milpacs/[username]/medical-menu-link.tsx
The only link to `/ace`. Rendered at the foot of one member's overview — see the
`MEDICAL_MENU_MEMBER` gate in `milpac-file.tsx` — as a dim caduceus that only unrolls
into a label on hover. A plain `<Link>` with its own CSS module, so every other milpac
carries nothing at all for it.

#### app/(landing)/milpacs/[username]/RequestAwardButton.tsx
Client modal: lets a logged-in member (not the profile owner) nominate an award for this member,
grouped by award type from `@/lib/military/awards`. Posts `POST /api/award-request`.

#### app/(landing)/milpacs/[username]/bio-editor.tsx
Client `BiographyEditor`: inline edit/save biography text (max 2000 chars), `POST /api/me`. Only
rendered for the profile owner (`isOwn`). **Its read state uses `.bio` from
`profile.module.css` — the same class the public view renders with**, and not an inline lookalike:
the lookalike it replaced omitted `white-space: pre-wrap`, so a member saw their own paragraphs
collapsed into one block while everyone else saw them laid out. The only thing that should differ
between the two views is the Edit button. A biography is plain text typed into a textarea, so the
newlines are its only structure — every full rendering of it needs `pre-wrap` (`/bios` too). The
roster card (`milpacs/card.tsx`) deliberately does not: it is a three-line clamp, where collapsing
newlines to spaces is what makes the teaser useful.

#### app/(landing)/milpacs/[username]/cover-upload.tsx
Client `CoverUpload`: file input to upload (`POST /api/uploads/cover`, multipart) or remove
(`DELETE /api/uploads/cover`) the profile's cover banner image. Owner-only.

#### app/(landing)/milpacs/[username]/accent-picker.tsx
Client `AccentPicker`: a native colour input styled as the file's mono chips, in the banner badge row
beside `CoverUpload` (the page's other owner-only control). `PUT /api/me/accent` to set,
`DELETE` to clear. Saves on `change`, not `input` — a colour input fires `input` continuously while
the pointer moves, which would be a write per pixel dragged. Reloads after saving, because the accent
is painted server-side into `--acc` and into every other surface showing that member. Owner-only.

#### app/(landing)/milpacs/[username]/certificate-link.tsx
Client `CertificateViewer`: wraps arbitrary content (an award row, or a chip on the rank row) in a
click target that opens that member's certificate full-screen, with a download link. Renders no
`<img>` until opened — certificates are drawn on demand and never persisted, so a member with 30
awards would otherwise trigger 30 renders per profile view. A failed render drops back to the plain
content rather than leaving a dead click target. `inline` switches it from a full-width row trigger
to an inline chip.

#### app/(landing)/milpacs/[username]/loadout-panel.tsx
Server `LoadoutPanel`: renders a member's imported ACE arsenal loadout in the arsenal's own
arrangement — weapons (primary/launcher/sidearm, each with its magazine and attachments) across the
top, the three containers (uniform/vest/backpack) with their contents below, then what is worn and
carried (headgear, facewear, binoculars, map/GPS/radio/compass/watch/NVG). Calls `parseLoadout`
(`@/lib/loadout/parse`) and `resolveItemName` (`@/lib/loadout/names`) — kept server-side because the
name dictionary the latter reads is ~2.7MB and must never reach the browser; only the resolved
strings are sent. A parse failure (e.g. an old row a parser change now rejects) renders a fallback
message rather than taking down the whole profile. Empty slots render as "—" rather than being
omitted. Accepts an `actions` slot (rendered above the kit) — `page.tsx` passes `<LoadoutManager/>`
into it.

#### app/(landing)/milpacs/[username]/loadout-manager.tsx
Client `LoadoutManager`: the picker (a row of chips when a member has more than one loadout, shown to
every visitor — each chip is a `<Link>` to `/milpacs/<name>/kits/<id>`, since `LoadoutPanel` is a
server component and switching kit has to be a navigation; `pickLoadoutId` in `@/lib/loadout/select`
resolves the param server-side). Each chip carries a star: lit and non-interactive on the member's
default, and for the owner only, pressable on the others to nominate a new default via `PATCH
/api/loadouts/[id]` with `{isDefault:true}`. Viewing and nominating are separate actions — the
`<select>` this replaced set `isDefault` purely to change what was on screen, so a member could not
look at a second loadout without demoting their first. The selected kit's `description`, when it has
one, renders as a line of prose under the picker.

The kit row doubles as the panel header: chips on the left, **Import kit** pinned to the far right,
and it renders for the owner even with no kits at all — that is exactly when Import is the only thing
to do there. Each chip carries the kit's chosen badge (`KitIcon`, `lib/loadout/kit-icons.ts`).

Controls are grouped by consequence, not by permission: the **Public/Private** toggle (`PATCH
{shared}`, green with a lit dot when public — `--good`, not the member's accent, so every reader
decodes the state the same way whatever colour their file is) and **Copy kit** on the left, with
**Delete** pushed right via `margin-left:auto` so it does not sit in misclick range of the visibility
toggle. Copy is offered to the owner for a private kit too — it is their own export; visitors only
ever hold public ones. It uses the same off-screen-textarea `execCommand('copy')` fallback as
`copy-link.tsx`. Every control carries a `UiIcon`; the visibility toggle's glyph is its status dot.

The owner can edit a kit's **icon and description at any time** from the inline editor behind the
`Edit` link on the description line (`PATCH {description, icon}`) — not only at import, which
otherwise made a typo permanent-until-reimport. Saving an empty description removes it.

The owner-only import form (`POST /api/loadouts` with `{raw, name, description, shared}`) asks four
labelled things: name, badge (a radiogroup over `KIT_ICON_KEYS`), optional one-line description,
visibility (defaulting to **private**, with the consequence stated beside the toggle rather than as a
blanket warning above the form), and the export itself. `MAX_NAME`/`MAX_DESCRIPTION` come from `lib/loadout/limits.ts`, the same module the route
truncates with.

Every action reloads the page on success rather than patching local state, keeping this component free
of any loadout-shape knowledge. **Privacy is enforced in `page.tsx`, not here** — it filters
`isOwn || l.shared` before building the summaries, so another member's private kit never reaches the
browser as a name, a description or an export string, and `/kits/<private id>` cannot reach it either
because everything downstream reads that filtered list.

#### app/(landing)/milpacs/[username]/image-lightbox.tsx
Generic client `ImageLightbox`: click-to-zoom full-screen overlay for an `<img>`, closes on
Escape/backdrop click. Used for the uniform and medals images.

#### app/(landing)/milpacs/[username]/opengraph-image.tsx
Dynamic OG image (`next/og` `ImageResponse`, 1300×630) — avatar, rank, name, ORBAT role/section,
username, enlisted date, themed by `resolveMilpacProfile`'s accent colour.

---

### /login — Discord OAuth
#### app/login/route.ts
`GET` route: builds the Discord OAuth authorize URL and redirects. Stores an optional `returnTo`
path in a short-lived `login_return_to` cookie (validated to be a relative path only). Public
entry point.

#### app/login/callback/route.ts
`GET` route: OAuth callback — exchanges the `code` for a Discord token (`ExchangeToken`), fetches
the Discord user (`GetUser`), then **refreshes the stored profile** (`Db.users.updateOne` —
`username`/`globalName`/`tag`/`avatar`/`avatarURL`/`banner`/`bannerURL`/`hexAccentColor`/
`accentColor`, built the same way as the initial-seed logic in `scripts/init-db.mjs`) before
resolving the internal member via `client.fetchMember(user.id)` — `fetchMember` only reads the
existing DB record and never syncs from Discord itself, so without this refresh the profile stays
frozen at whatever it was when the account record was first created. Best-effort (`.catch()`
logs and continues — a refresh failure must not block login). Sets the httpOnly `token` cookie
(30-day maxAge), then redirects to the stored `returnTo` (default `/me`). Public entry point;
this is the core of the site's auth flow described in CLAUDE.md. Note: this only refreshes the
Discord *global* profile (from the OAuth `/users/@me` response) — a per-server ("guild") avatar
or nickname override, stored separately under `guild.*`, is not touched here and has no existing
sync path.

---

### /maps — Interactive World Map Browser
#### app/maps/page.tsx
Client world-selector grid: fetches `/api/maps/worlds`, shows preview thumbnails, navigates to
`/maps/[name]` on click. Prefetches the Leaflet/`OperationMap` bundle in the background. Public
(no auth check in this file — general map browsing).

#### app/maps/[name]/page.tsx
Server page: resolves the requested world via `getAvailableWorlds()` (404s via `notFound()` if
unknown), sets dynamic OG metadata, renders `<MapViewer world={world}/>`.

#### app/maps/[name]/MapViewer.tsx
Client full-screen interactive map viewer wrapping the dynamically-imported
`components/operations/map/OperationMap` (Leaflet-based), with a mode switcher (`sat` / `map` /
`terrain`, gated by `world.hasGeoJSON`/`hasTerrain`) and a "← Maps" back button. Uses
`<FullscreenPage/>` to hide chrome. This is the standalone (non-operation-scoped) map browser —
compare with `app/operations/[id]/map/page.tsx` which reuses the same `MapSection` component
scoped to one operation.

---

### /members — Staff Member Directory & Editor (requires roles)
#### app/members/layout.tsx
No-op wrapper div.

#### app/members/page.tsx
Server page: redirects to `/login` if not authenticated, to `/me` if lacking
`PERMISSIONS.pages.members`. Fetches `client.fetchAllMembers()`, sorts alphabetically, builds an
ORBAT lookup (`getOrbatEntriesForUsers`), renders `<MemberList/>`. Passes `isAdmin` (based on
`PERMISSIONS.admin.impersonate`) to enable "Login As" impersonation.

#### app/members/MemberList.tsx
Client searchable/filterable member list (search by name/username, filter by ORBAT role
checkboxes). Each row links to `/milpacs/[username]` (View) and `/members/[username]` (Edit); if
`isAdmin`, an extra "Login As" button posts `POST /api/admin/impersonate` then redirects to `/me`.

#### app/members/[username]/page.tsx
Server page gated by `PERMISSIONS.members.editStandard` (redirects `/login`/`/me` otherwise).
Resolves the target member, fetches confirmed-attendance-derived operation history, renders
`<MilpacEditor/>` with `canEditRestricted`/`canEditStandard` flags (from
`PERMISSIONS.members.editRestricted`/`editStandard`).

#### app/members/[username]/MilpacEditor.tsx
Large client staff-editing form for a member's MILPAC record: rank (drag-reorderable via
`@dnd-kit`), promotions/awards/qualifications history (with duplicate-detection colour coding),
promotion-point calculation (`calculatePromotionPoints`/`calculateOpPoints` from
`@/lib/military/points`), suggested-rank helper (`getSuggestedRank`).

Built on the dashboard kit (`@/components/dashboard`); its root carries `.dash` so the staff
palette applies here too, on what is otherwise a public route. Billet Points is a stack of
`PointsLine` rows — label, the rate it earns, a `Stepper`, and its contribution — with the two
attendance-derived rows `locked`, since a stepper there would imply an edit that cannot stick. A
`Meter` fed by `getNextThreshold` shows the total against the next rank on the member's track, and
award/qualification contributions are read-only `Chip`s rather than the paragraph of running text
that used to act as a legend. Save is a sticky `SaveBar` at the foot of the form rather than a
permanent button in the header: it appears once something is dirty and counts the *fields* that
will change, diffing a `snapshot()` of the payload against a `baseline` ref that moves on a
successful save — so touching a promotion and undoing it returns the count to zero. Discard
restores every field from the `member` prop. Promotions and awards each
carry an **Issued By** rank + name (`issuedByRank` stores the full rank name, `RankSelect`'s value
contract) — that pair signs the member's rendered certificate, so it is a record of who authorised
the award, not just a note. `PUT /api/members/[username]` stamps both from the editing staffer when
a new row leaves them blank. This is the internal counterpart to the public read-only
`/milpacs/[username]` profile page.

---

### /operations — Public Operations Board
#### app/operations/layout.tsx
Sets page metadata ("Operations"); no auth gate (public board).

#### app/operations/page.tsx
Server page, deliberately thin: resolves `editAccess` via `PERMISSIONS.pages.operationsEdit` for
the Mission Making link, then hands everything else to `<OperationsBoard/>`. The board's content
is per-viewer (your RSVP, which operations you were on, whether the staff line shows) *and* paged,
so it is resolved client-side rather than rendered here and contradicted a moment later.

#### app/operations/board/ — the board itself
Replaced the old three-column layout (a single upcoming card beside a flat month-at-a-time list
beside twelve month buttons). Two halves with different jobs:

- **`OperationsBoard.tsx`** — the shell: skeleton, error state, and the two sections below.
- **`useBoard.ts`** — one request to `/api/operations/board` for the whole page. The filter lives
  in the URL via `replaceState` (not `push`, so Back still leaves the page) so a filtered view can
  be pasted into Discord — "every operation 1-3 was on" is a useful thing to be able to send.
  Nothing fetches until the deep link has been read, so a shared link is one request, not two.
- **`UpcomingBand.tsx`** — everything not yet run, as a wrapping grid rather than a featured card:
  more than one operation upcoming is the normal case, and a layout that promotes the first is
  wrong every time there are two. **One card per campaign *mission*, not per campaign** — a
  mission's Saturday and Sunday are one decision and share a card, but a campaign with two
  missions still to run is two cards. Carries the countdown, the units called, turnout so far and
  the viewer's own RSVP. **Operations in development never appear**: nobody can answer one, so it
  has no business on the page whose job is answering.
- **`ArchiveFilters.tsx`** — search (debounced), facets that carry their own counts, the applied
  filters as individually removable chips, and a month histogram you drag a range across. The
  histogram replaces the old month picker and does a second job it could not: it shows where the
  weight of the unit's history sits. Bars outside a selection dim rather than disappear.
- **`Archive.tsx`** — the past, grouped by campaign. A campaign is a bracket, its numbered
  missions are the rows, and each mission's two nights are two slots on that row. Straight halving
  of the row count for a campaign, and the only view that can show a night that *didn't* run
  (a dashed empty slot). Grouping runs over everything loaded so far, so a campaign straddling a
  page boundary is still one bracket.
- **`MissionMakingButton.tsx`** — the staff link, extracted when `list.tsx` was retired. Staff
  quick-links (Edit · Map · View on every row) are gone with it: one dashed line under the band
  carries the in-development count and a route to the J2 dashboard, and only with the permission.

#### app/operations/[id]/layout.tsx
Sets dynamic `<Metadata>`/`<Viewport>` (theme colour) from `Db.operations` for the given id.

#### Operation URL structure
The operation's four views are **sibling paths under it**: `/operations/[id]` (**Orders** — the
page anybody can read) · `/map` · `/schedule` · `/attendance`. `/operations/[id]/edit` is
deliberately **not** a fifth view: it is the editor opened *on* the Orders view, reached only from
the Orders tab's own menu and only by people who can use it. `/edit` therefore lights the
Orders tab — same view, opened for writing rather than reading.

**Orders is a split tab for anyone who can edit**: the label opens the orders, and a caret beside it
opens a two-item menu — **Read** and **Edit** — with the current one ticked and drawn in the accent.
Two items rather than one because reading and writing are two modes of a single view, so the menu
doubles as the answer to which of them you are in; it works the same in both directions, and the
header does not change shape as you move between them. The caret only appears once Orders is the
active tab (nothing to offer from Map) and only with `pages.operationsEdit`. It carries the accent
underline itself so the tab's underline runs unbroken across both halves. The strip has no
horizontal scrolling — a scrolling box clips on *both* axes and would cut the menu off at the
header's edge — which four eight-character tabs did not need anyway; the operation title beside it
ellipsizes instead.

**The mode is sticky per session** (`readOrdersMode`/`rememberOrdersMode` in `tabs.ts`,
`sessionStorage` keyed by operation id). Switch to Map mid-edit and back, and Orders returns you to
the editor rather than dropping you on the read-only page — you never asked to stop editing, and the
socket is still up. Whenever Orders *is* the active tab the URL is authoritative and the mode is
re-recorded from it; everywhere else it is read back. It starts at `read`, which is what the server
renders, so the remembered value only ever arrives after mount and only ever changes an href. The
mode also decides whether a click stays in the shell: `OperationTabs` calls `onSwitch('orders')`
only in edit mode, which is why `useEditorTab` can now handle Orders in-shell instead of always
refusing it. `sessionStorage` and not a saved preference — a new tab should start you reading.

**The mode switch is a pair of buttons in one corner.** The editor's "⊡ Preview" (bottom-right of
the editor column, `EditorShell.tsx`) and the orders page's "✎ Edit" (`EditOrdersButton.tsx`,
`isHQ` only) share `mode-switch.module.css` — same skin, same corner, so flipping between reading
and writing is one place to click from either side. Preview *switches in place* rather than opening
a second tab, which is what it used to do and which left people editing in one tab and reading a
stale copy in another. The Orders menu still does the same job; the menu is where you choose a
mode, these are the one-click flip for somebody going back and forth.

The model lives in **`app/operations/[id]/tabs.ts`** (a plain module, so the public server page and
the editor's client header can both read it) and the strip itself in **`OperationTabs.tsx`**, shared
by both. The tab key is `orders`, not `brief`: "Brief" was the editor's name for its own first tab
and nobody outside the editor used it. `?tab=brief` and `?tab=development` are aliased for the
bookmarks already out there.

**Who sees which tab:** Orders and Map are for everyone (both have public routes). Schedule needs
`pages.operationsEdit`, since its own page redirects anyone else away and offering a door that
closes in your face is worse than not offering it. **Attendance opens for any signed-in member** —
`visibleTabs(canEdit, signedIn)` — because the board is how they RSVP and claim a position, and the
Modern rebuild moved it off the orders page and put a button here in its place. `/attendance` serves
both audiences from one path: staff get `<EditorPage/>`, a member gets `attendance/MemberBoard.tsx`
(the same board in read-and-claim mode under the same `OperationBar`, `canManage={false}` by
construction — it is the branch a viewer *without* those rights fell through to). Rendering the
editor for them would mount a Hocuspocus socket, a mission deck and a document rail to show one
panel. A logged-out visitor is still sent back to the operation's public page.

**Switching between the in-shell tabs never navigates.** `useEditorTab` (`edit/EditorShell.tsx`)
rewrites the URL with `replaceState`, because a real navigation would tear down the Hocuspocus
socket and force the Y.Doc to reconnect. **Orders is the exception and navigates for real** — it
leaves the editor for the operation's own page, and the socket goes with it. `onSwitch` returns
whether it handled the change, which is how one strip serves both cases; the tabs are links rather
than buttons so that middle-click and open-in-new-tab work, which the buttons had quietly removed.

**`OperationBar.tsx`** is the slim bar over the public orders page: back link, title, status pill
and the same strip. It *replaces* the site navbar rather than sitting under it — `<HideSiteNav/>`
(`components/HideSiteNav.tsx`, a body class since the navbar lives in the root layout) drops it, and
the bar's own "← Back" is the way out. Narrower than `FullscreenPage`, which also takes the footer:
the orders page is still a document you scroll to the end of. Deliberately *not* the editor's
header — no save state, no Publish, no delete menu. Those belong to somebody who has opened the editor, and putting them on a page every member
can read would be showing controls that either do nothing or should not be there.

`/operations/[id]/map` serves **both audiences from one path**: the editor's Map tab to anyone
with `pages.operationsEdit`, and the read-only fullscreen viewer to everyone else. Splitting it
would mean the link people paste to each other only works for half of them.
`/schedule` and `/attendance` redirect a viewer without edit rights to `/operations/[id]` — they
asked for *this* operation, and the public page is the version of it they can see.

#### app/operations/[id]/page.tsx
**Fetches and gates; renders almost nothing.** Server component: loads the operation + current
user, computes every role flag (`isHQ` via `operationsEdit`, `isAllStaff` via `attendance.confirm`,
`isJ6` via `departments.j6`, `canManageAttendance` three-armed off `attendance.manage`,
`isSectionLeader` via `Db.orbatPositions`), then **dispatches on `pageTheme` to a component under
`themes/`**. Keeping the gates in one file is the point — three copies of a three-armed permission
check drifting apart is a bug nobody notices until somebody sees something they shouldn't.

For Modern it additionally runs `readAttendance()`: one projected query over `Db.operationAttendance`
(`records`, `roster`, `rsvpOpen`) yielding attending count, seats/filled, the viewer's own RSVP and
the position they hold. Server-side deliberately — that page states what the member owes *in its
header*, and a header that fills in a second after paint is worse than one that never moved. The
board's own payload (every record, every section's roles, a user lookup each) is far too much work
to answer "are you coming, and do you have a position yet".

#### app/operations/[id]/themes/
One file per page theme, because Modern was rebuilt and the other two were not — a single component
full of three-way ternaries meant every change to one theme risked the two nobody had asked to
touch. `theme-props.ts` carries the shared `ThemePageProps` (plus `OrdersAttendance` /
`ModernPageProps`); themes are pure renderers with no `await`, no `Db`, no `fetchMe`.

- **`ClassicPage.tsx`** — the page as it always looked, lifted out unchanged, now serving
  `oldfashioned` and `scifi` only. Hero banner, `<SectionNav/>`, `<PageNavClient/>`,
  `<OperationStatusBar/>`, `<PagedView/>` when `operation.pages.length > 1`, framed sections via
  `<DocBody/>`, `<AttendanceDrawer/>` sidebar, the full-width `<AttendanceBoard/>` beneath, Zeus and
  OCAP tabs. Its `isModern` branches are dead (the dispatch never sends Modern here) and are left in
  place on purpose: pruning them by hand through that many nested ternaries is exactly the edit that
  silently breaks two themes nobody asked to change. Splitting it into `OldFashionedPage` and
  `SciFiPage` is the next step, and lets the dead branches fall out on their own.
- **`ModernPage.tsx` + `modern.module.css`** — the rebuild, "**Warning Order**". The reordering *is*
  the design: what a member owes comes above the document rather than beside or below it. A
  `clamp(300px, 38vh, 430px)` cover **band** (not a screen) carrying the operation's lineage —
  department, campaign, mission number, day serial (`readLineage()` in page.tsx; `campaignId`/
  `campaignMissionId` have been on the operation since campaigns existed and no public page ever
  showed either, so "Saturday serial" named a night without saying a night *of* what) — plus
  `<StepOff/>`, a locally-ticking countdown to the operation itself. That is a *different* clock
  from the ledger's, which counts to the RSVP deadline; on an op a fortnight out the two are hours
  apart. Below it the facts are welded to the band's bottom edge as an auto-fit
  **ledger** (step off via `<LocalDate/>`, in-game date, terrain, positions filled, and one live
  cell); then an **action band** pairing the acknowledgement prompt with the attendance call; then
  the document, centred at 920px. **The section formatting mirrors the editor's**: the header band
  is `CollabEditor.tsx`'s — document eyebrow, 26px spaced title, the 36x2 accent rule, a full-width
  hairline — and `.reader :global(.op-doc)` restates `.op-editor`'s card (ground, hairline border,
  `28px 36px`, `0.92rem/1.75`). Writing something and then finding it laid out differently once
  published is exactly the surprise a document editor should not produce. What did go is the *frame
  around the frame*: sections used to sit in a bordered plate stamped `ASOT // SECTION` in both
  bottom corners, on top of the body's own card. The card override is scoped to Modern rather than
  folded into the global `.op-doc`, because the other two themes draw their own frames and would end
  up with two. Multi-document operations navigate by `?page=`, server-rendered, so every document has
  a URL somebody can paste (Modern does not use `<PagedView/>`).
- **`ColdWarPage.tsx` + `coldwar.module.css` + `FileTabs.tsx`** — the `coldwar` era, "**Declassified**".
  The orders as a released file: a typed sheet (Courier, fixed paper/carbon/stamp palette) on a dark
  desk, classification banners at both ends, a rotated rubber stamp over the header, and the cover
  art pasted in as a captioned photographic plate rather than bled to the edges. **Only the sheet is
  paper** — the desk stays dark, which is what lets `OperationBar` and the Zeus/OCAP panels keep the
  chrome they wear everywhere else and sit on the bare desk when selected.
  Two things no other theme does: **redaction** (a logged-out reader gets the document with the
  paragraphs they are not cleared for struck out *in place*, rather than one banner at the bottom —
  truer to the fiction and more useful, since they can see how much is withheld and where), and a
  **routing slip** (the acknowledgement and attendance call as the form a real file carries — a line
  to sign, a line saying what you are detailed to). `FileTabs.tsx` is the navigation: a sheet of
  paper has no sidebar, so the documents become tabs cut into the folder's edge, the open one cut
  from the sheet's own stock and reaching across the seam. Its palette is **fixed, not the
  operation's `--acc`**: a typed page does not change colour per operation, and one themed pale blue
  would print invisibly on paper.
  `coldwar` was already a selectable era (`/api/admin/era-options`) with no rendering of its own,
  which is why choosing it used to give you Modern. **`wwii`, `vietnam` and `fantasy` still do** —
  they are offered in the picker and fall through to `ClassicPage`.
**Zeus Notes pages are ordinary documents.** Same sections, same schema, same collaborative editor;
the only thing that sets one apart is `operations.zeus`, checked two-armed in `page.tsx` (the grant,
or the legacy `departments.j6` role) and passed to every theme as `canZeus`. Without it the page is
filtered out of the document list, so there is nothing to click. In the editor the same permission
drives `PageSidebar`'s `hiddenTypes` — the page is dropped from the rail rather than disabled, since
a document you cannot read should not advertise that it exists, and `ActiveEditor` bounces off one if
it somehow becomes active. **Not a security boundary on its own**: the content lives in the same
Y.Doc as the rest of the operation, so anyone who can open the editor can still reach it over the
wire. Modern and Cold War no longer render `<ZeusNotesPanel/>` at all — that panel edits
`operation.zeusNotes`, a free-text field belonging to the J6 dashboard's own Zeus Notes tab, which
had been mirrored onto the operation page and confused with the document of the same name.

**The After Action Review document type is gone** — removed from `PageSidebar`'s type menu, its
`addPage` union, its colour and label special-cases, and the dev template. AARs will arrive as a tab
of their own. Existing `pageType: 'aar'` pages are left alone and render as ordinary documents;
nothing deletes them.

- **`OrdersSpine.tsx`** — one outline replacing two navigations. Documents are `?page=` links;
  the open one's sections nest beneath it as scroll-to buttons with an `IntersectionObserver`
  scroll-spy. The nesting is information, not decoration: "Situation" is *part of* CHQ Orders, not a
  sibling of it, which the old flat document-rail-plus-section-strip pair said otherwise.
- **`RsvpCell.tsx`** / **`PaperRsvp.tsx`** — the same live cell, drawn by Modern and Cold War
  respectively. The rules are in **`useRsvpCountdown.ts`**, shared: it polls `live-status` (30s) and
  ticks its own clock every second in between, and lives in one place so two themes cannot end up
  disagreeing about the same operation. The old page gave the single most time-critical fact on the
  screen a wide strip at the same weight as everything around it; here it is one cell, and the only
  one carrying the accent.

**The attendance rail is gone from Modern.** It duplicated the Attendance tab and held a quarter of
the window open for a control used once per operation. In its place is one call to action stating
the *member's* position ("You're in — Rifleman", "You're attending, with no position yet") rather
than the rail's headline figure, which answered a question staff ask and members don't. Classic
keeps its drawer and full-width board, since only Modern was redesigned.

Hidden (`isPublic: false`) sections still show a "Classified — Login to Access" banner to logged-out
visitors in both. Public read; `<EditOrdersButton/>` shown to `isHQ`.

#### app/operations/[id]/doc-body.tsx
Client: renders TipTap ProseMirror JSON as themed HTML (`.op-doc` CSS varies per `pageTheme` —
`modern` / `oldfashioned` / `scifi` / `coldwar`, the last being **the only light palette on the
site**, fixed rather than derived from the operation's accent) via `generateHTML` from
`@tiptap/core`. Used by the single-page view, `PagedView`/`StaffView` and the
Modern theme.

**Its schema is `contentExtensions()` — the editor's own** (`components/editor/content-extensions.ts`),
and that is not tidiness. This file used to keep a hand-written lookalike beside it, missing
`TextStyle` and the `FontSize` global attribute that rides on it. ProseMirror refuses to parse a
document carrying a mark its schema has never heard of, so the moment an author set a font size
anywhere in a section, the *whole* section threw on load and readers were shown "No document body
yet" over content sitting in Mongo — 40kB of live orders on Operation New Winter, invisible for as
long as nobody compared the two lists. `ContentImage` (the `ResizableImage` attributes, minus the
React node view that only the editor needs) moved into that shared list for the same reason.
`lib/operations/doc-schema.test.ts` pins it at the parse step, including a control case that must
still throw. Two lists describing one document format will always end up describing two.

The failure is also no longer silent: the `catch` logs, and a section that *could not be rendered*
now says so instead of borrowing the "nothing written yet" message — telling a reader a section is
empty when it is not is how this stayed hidden.

#### app/operations/[id]/DocAcknowledgeCard.tsx
Client read-receipt widget: fetches ack state from `GET
/api/operations/[id]/acknowledge?pageId=`, shows an "Acknowledge" button (`POST` same endpoint)
and an expandable acknowledged/not-acknowledged member list. Rendered for `isAllStaff` viewers
while the op is `Upcoming`.

#### app/operations/[id]/OcapLinkPanel.tsx
Client (HQ-only) panel to search OCAP recordings (`GET /api/operations/ocap/recordings`), inspect
raw format (`GET /api/operations/ocap/inspect?filename=`), and sync a recording to the operation
via a streamed SSE-style `POST /api/operations/ocap/sync` (stages: downloading → parsing →
matching → saving → complete), with reconnect/poll support via `GET
/api/operations/ocap/sync-status?operationId=`.

#### app/operations/[id]/OcapStatsPanel.tsx
Client OCAP statistics viewer with two tabs: **ORBAT view** (kills/deaths/K-D/accuracy grouped by
company/platoon/section, colour-coded via `Db.orbatSectionMeta`, fetched through `GET
/api/operations/[id]/attendance`) and **Leaderboard view** (ranked player stats with medal icons,
linking to `/milpacs/[username]`). Shown to any logged-in user once `operation.ocap` exists.

#### app/operations/[id]/PageNavClient.tsx
Client left-rail page/tab navigator for multi-page operations (updates the `?page=` search param);
also renders special Zeus/OCAP tab entries with custom accent colours. Sticky sidebar, desktop only.

#### app/operations/[id]/ZeusNotesPanel.tsx
**Legacy on the operation page** — Modern and Cold War no longer render it, since it edits
`operation.zeusNotes` (the J6 dashboard's free-text field) and was being confused with the Zeus Notes
*document*, which is now an ordinary page gated on `operations.zeus`. Still reached by
`PagedView`/`ClassicPage` for the `oldfashioned` and `scifi` themes.
Client J6-only notes panel: view/edit free-text Zeus notes for the operation, `POST
/api/operations/zeus-notes`.

#### app/operations/[id]/local-date.tsx
Tiny client component: formats an ISO date string in `en-AU` with timezone abbreviation
(uppercased). Used for the "Operation Date" meta chip.

#### app/operations/[id]/opengraph-image.tsx
Dynamic OG image (`next/og`, 1200×630) for an operation: reads the cover image straight off disk
(`./uploads/operations/{id}.{ext}`), themed corner brackets/badges by `operation.themeColor`.

#### app/operations/[id]/paged-view.tsx
Client `PagedView`: renders a multi-page operation (`operation.pages.length > 1`) with responsive
mobile (horizontal tab strip) vs. desktop (nav handled by the parent `PageNavClient`) layouts.
Reuses `<DocBody/>`, `<SectionNav/>`, `<ZeusNotesPanel/>`, `<OcapStatsPanel/>`,
`<OcapLinkPanel/>`, `<DocAcknowledgeCard/>`. Contains the shared `SectionCard` renderer used by
both mobile and desktop branches.

#### app/operations/[id]/print-button.tsx
Client "Export PDF" button: injects a `@media print` stylesheet sized to the content, hides
nav/footer/cursor, then calls `window.print()`.

#### app/operations/[id]/section-nav.tsx
Client sticky in-page section nav (single-page operations with >1 section): IntersectionObserver
active-section tracking, horizontal scroll-into-view, themed per `pageTheme`.

#### app/operations/[id]/map/page.tsx
Server page: fetches the operation's `mapWorld` and resolves it via `getAvailableWorlds()`, then
renders the same `<MapSection/>` (from `@/components/operations/map/MapSection`) used elsewhere,
scoped to this operation (`operationId`, `canEdit` = `isHQ`). Full-screen (`<FullscreenPage/>`),
simple back-link header. This is the operation-scoped counterpart to `/maps/[name]`.

#### app/operations/[id]/edit/layout.tsx
Server layout: redirects to `/operations` unless the user has `PERMISSIONS.pages.operationsEdit`.
Gates the entire edit subtree.

#### app/operations/[id]/edit/page.tsx
Very large (~1,050 line) client operation-editor page — the main HQ/J2 authoring surface. Covers:
meta fields (title/department/date/lore-date/theme colour/page theme/status), cover image
upload, mission-development check tracker (5 or 6 milestone checks counting back from op/campaign
date, completable by J2 leads via `POST /api/operations/[id]/mission-development`), "Orders Check
Request" workflow (`/api/operations/[id]/orders-check`), publish flow (`In Development` →
`Upcoming` via `POST /api/operations/[id]/publish`), attendance/RSVP automation stage machine
(`preparing → rsvp_open → rsvp_closed → op_running → confirmations_open → completed`, both
client-side auto-fire timers and manual stage buttons, persisted via `POST
/api/operations/[id]/attendance/platoons`), acknowledgement summary, custom attendance units,
delete confirmation, and embeds the TipTap collaborative `<OperationEditor
documentId={opID}/>` (dynamic import of `@/components/editor/CollabEditor`) for the actual orders
content. Also toggles a right-hand `<ActivityLog/>` panel. The `<iframe>` "Live Preview" drawer that
used to sit beside it is **gone** — nothing had opened it since Preview became a link, and leaving a
second, stale idea of "preview" next to the new one was worse than the feature was worth.

Composed via `edit/EditorShell.tsx` as the operation's four views (Orders / Map / Schedule /
Attendance — the last two `isHQ`-only), where Orders is the collaborative editor mounted on
`/edit` and the tab itself points at the public page; see "Operation URL structure" above. Plus a
right-hand mission deck (`edit/deck/`: CountdownStrip, DetailsCard —
the latter no longer carries the lifecycle Status selector, see the Schedule tab below).
**All attendance controls live in the Attendance tab** (`edit/tabs/AttendanceTab.tsx`):
assigned units + custom units, the Discord ping toggle and its per-role targets, and the
acknowledgement summary. **The operation's lifecycle lives in the Schedule tab**
(`edit/tabs/schedule/`), rebuilt as one horizontal *phase ribbon* covering the whole life of the
operation — pre-production → lead-up → RSVP window → final hour → op & confirmation:

- `ScheduleTab.tsx` — composes the ribbon panel and `LifecycleOverride`; owns the
  selected-phase state and its own coarse 30s clock.
- `AnchorBar.tsx` — the operation date, permanently visible above the ribbon and now its **only**
  control (it was previously duplicated in the deck's Details card). Carries the
  `schedule-op-date-input` testid the E2E date-edit spec selects.
- `PhaseRibbon.tsx` + `ribbon.module.css` — the ribbon: boundaries (transitions) above, milestones
  below, a `now` line, and an inverted-phase hatch for an out-of-order schedule.
- `PhaseStrip.tsx` — the five-phase selector under the ribbon.
- `PreProductionInspector.tsx` — development gates with their checklists visible inline, the
  completion modal, and the Orders Check request/cancel/reminder block.
- `RsvpWindowInspector.tsx` — both ends of the RSVP window edited together as one object, and both expressed the same way: minutes before the op date, preset select + `Custom…` picker. There is no Manual/Scheduled toggle — an unset open offset simply means no automatic open, and the lifecycle panel's Advance is the by-hand path.
- `LifecycleOverride.tsx` — the two manual overrides on the automation, in one panel: operation
  status + Complete Mission (moved out of the deck's Details card), and the six-step attendance
  stage machine (the retired `StagePanel`). Gated in two halves — **Advance** is ordinary forward
  progression and stays open to anyone who reaches the tab, while **status changes and clicking a
  stage segment** (which can jump backwards) need `operations.overrideLifecycle`. Stage-change
  confirms live in `page.tsx`'s `requestStageChange`, not here.
- `controls.ts` — the shared button/pill/field/chip styles the inspectors use.

All of it renders from `lib/operations/phases.ts` (pure, clock-injected). A legacy
`?tab=development` deep link resolves to Schedule.

#### app/operations/[id]/edit/activity-log.tsx
Client `ActivityLog` panel: polls `GET /api/operations/activity?id=` every 30s, shows a
word-level diff (`before`/`after`) per edit entry when expanded, relative timestamps.

#### app/operations/[id]/staff/page.tsx
Server page: requires login (`hasPermission(user, 'pages.member')`, else redirect `/login`), fetches a
minimal operation projection, renders `<StaffView/>`.

#### app/operations/[id]/staff/StaffView.tsx
Client "Staff View" — a second, restricted-scope TipTap editor
(`allowedTypes={['orders','staff_orders','separator']}`) on the *same* Y.js document as the main
op editor, for staff-only content blocks (per `documentId={opId}`, same collab doc as
`operations/[id]/edit`). Header shows status/date/department, back-link to `/operations/[id]`.

---

### /optionals — Optional Mod List Manager
#### app/optionals/layout.tsx
Server layout: `redirect('/login')` if not authenticated (via `client.fetchMe()`), otherwise
centers `{children}`.

#### app/optionals/page.tsx
Client page (top ~60 lines shown): per-category (`qol`, `gfx`, `zeus`, `j2`, `j5`) mod toggle
list with per-mod enable/disable switches, GFX-mod acknowledgement gate (`localStorage` flag),
admin edit-mode to add/remove mods and set Steam Workshop dependency IDs. Talks to the sibling
route handlers below (not `app/api/*` — these live directly under `app/optionals/*/route.ts`).

#### app/optionals/context.tsx
Client-side `AuthProps` context/interface scaffold (token, user, theme, server status, Login/
Logout/ChangeTheme). Appears to be a legacy/alternate auth context — not clearly wired into the
current cookie-based auth flow described in CLAUDE.md; treat as possibly-unused infrastructure.

#### app/optionals/bulk/route.ts
`POST` route handler (not under `/api`): bulk enable-all/disable-all a mod category for the
current user (`Db.users.optionals.{type}`). Requires login (throws otherwise).

#### app/optionals/callback/route.ts
`GET` route: alternate token-based login callback specific to the optionals flow — accepts a
`?token=` query param, resolves the member via `client.fetchMember(token)`, sets the `token`
cookie, redirects to `/optionals`.

#### app/optionals/fetch/route.ts
`GET` route: returns the full mod list for a given `type` from `Db.optionals`. Public data read
(no auth check in the shown portion) but requires `?type=` one of `qol|gfx|zeus|j2|j5`.

#### app/optionals/manage/route.ts
`POST` route: admin-only (`hasPermission(user, 'optionals.manage')`) add/remove/set-deps operations on the
master `Db.optionals` list for a category; `remove` also pulls the mod from every user's enabled
list.

#### app/optionals/me/route.ts
`GET` route: per-user optionals state — `mode=all` (full record + `isAdmin` flag), `mode=check`
(is a specific mod id enabled), plus `add`/`remove` modes (truncated in view but implied by the
`mode` param).

#### app/optionals/reset/route.ts
`GET` route: resets all 5 optional-mod categories to empty arrays for the current user.

---

### /me — Own Member Profile
#### app/me/layout.tsx
No-op `h-full` wrapper.

#### app/me/page.tsx
Server page: `redirect('/login')` if not authenticated. Shows the current user's own profile card
(avatar, rank, callsign, role via `getOrbatEntryByUserId`), embeds `<BioSections/>`,
`<TimezoneSelector/>`, `<TSLinkButton/>`, and `<ResetTokenButton/>`. Also surfaces `isHQ`/`isJ5`
flags (not fully shown but present) likely for quick-link buttons (dashboard/preferences/calendar/
member-management icons imported: `Api`, `Tune`, `CalendarToday`, `ManageAccounts`).

#### app/me/bio.tsx
Client `BioSections`: fetches/saves the current user's biography text via `GET/POST /api/me`.

#### app/me/TimezoneSelector.tsx
Client widget: MUI select of all IANA zones (`Intl.supportedValuesOf('timeZone')`) for the user's
`timezone` (used to interpret times entered when creating reminders, on both the website and the
Discord bot), saved via `POST /api/me` with a top-level `{ timezone }` body (validated server-side
against `Intl.supportedValuesOf('timeZone')`, distinct from the `bio.*`-nesting body shape used
elsewhere on this route). On mount, if the user has no `timezone` saved yet, silently auto-detects
and saves it from the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`, showing a
"Detected as…" note until the user manually overrides it.

#### app/me/TSLinkButton.tsx
Client TeamSpeak account-linking widget: multi-step flow (`searching → confirm/manual →
awaiting-code → success/error`) driving `POST /api/me/teamspeak` with `action: 'init'` etc. Reused
verbatim inside the recruit-session applicant view (`app/recruit-session/[id]/ApplicantSessionPage.tsx`
imports this same component).

#### app/me/ResetTokenButton.tsx
Client "Log Out of All Devices" widget (inline confirm step, no modal). Calls
`POST /api/me/reset-token`, which regenerates the user's `token` field in `Db.users` — since auth
is a single random token per user (no per-device session table, see CLAUDE.md Auth section),
regenerating it invalidates every other browser/device's cookie in one shot. The response sets the
new token as this browser's `token` cookie too, so the current session stays logged in without a
reload (the fetch's `Set-Cookie` header is applied by the browser automatically).

---

### /recruit-session — Live Onboarding/Interview Session (WebSocket-driven)
#### app/recruit-session/ApplicantPageView.tsx
Client presentational component: renders the applicant-facing view for each of 14 named
interview/onboarding steps (`STEP_LABELS`), driven entirely by props (`step`, `introProgress`,
`livePreview`, `rulesAnswers`) pushed from the recruiter's session over WebSocket. No direct API
calls itself — pure view.

#### app/recruit-session/OrbatOnboarding.tsx
Client static-data component: a simplified read-only ORBAT diagram (role titles only, no real
members) mirroring `/orbat`'s visual style, used during the "ORBAT Overview" onboarding
step. Purely static `PLATOONS` data structure.

#### app/recruit-session/StepContent.tsx
Client: shared types (`IntroProgress`, `BgProgress`, `LivePreview`, `BCTSlotPreview`) and the
`SECTION_MAP`/`RULES_QUESTIONS` constants plus a `StepContent` renderer that lazy-loads
`BCTAvailabilityCalendar` from `app/dashboard/j1/tabs/`. Central content dispatcher used by
`ApplicantPageView`.

#### app/recruit-session/[id]/layout.tsx
Sets static metadata ("ASOT Recruitment") and dark page background.

#### app/recruit-session/[id]/page.tsx
Server page: looks up `Db.recruitSessions` by `sessionId`, 404s if missing, shows a "Session
Expired" screen if past `expiresAt`, otherwise renders `<ApplicantSessionPage/>`. Public (no login
— this is the pre-membership applicant's live view during their recruiter interview).

#### app/recruit-session/[id]/ApplicantSessionPage.tsx
Client: opens a WebSocket to `/recruit-session?id=&role=applicant` (derived from
`NEXT_PUBLIC_BASEURL`), syncs `step`/`raisedHand`/`introProgress`/`livePreview`/`rulesAnswers`
state pushed by the recruiter in real time, throttled cursor-position broadcast, reconnect logic,
embeds `<ApplicantPageView/>` and the shared `<TSLinkButton/>`.

---

### /services-asot — Easter-egg / Unit-Specific Utility Page
#### app/services-asot/page.tsx
Server page gated to the `1-2` Discord role (`redirect('/')` otherwise; `redirect('/login')` if
not authenticated). Renders `<DriversLicense canEdit={hasRole('1-2-0 Command')}/>`. Comment
credits "Assassin's Idea" — a niche in-unit feature, not general platform functionality.

#### app/services-asot/DriversLicense.tsx
Client CRUD-ish list of "driver's license" entries (name/section/status: Active / Under Review /
Revoked) grouped by section (PHQ/Alpha/Bravo/Charlie). Fetches `GET
/api/services-asot/drivers-license`. Edit mode gated by `canEdit` prop.

---

### /shoot — Standalone 3D Minigame
#### app/shoot/page.tsx
Client Babylon.js-powered shooting range/minigame (`@babylonjs/core`: Engine, Scene, camera,
lights, procedural gunshot/hit sound synthesis via Web Audio API). Self-contained; not part of the
member/staff workflow — a standalone diversion page. Public, no data fetching shown in the
truncated portion.

---

### /wip — Work-In-Progress Placeholder
#### app/wip/page.tsx
Trivial wrapper rendering `<WipPage/>` (from `@/components/wip-page`). This is the rewrite target
for `middleware.ts`'s matcher (now `/retired` and `/bios`; `/milpacs` and `/orbat` have both been
released) — visiting those paths without `?bypass_wip` serves this page's content instead
(via Next.js rewrite, so the URL bar still shows the original path).

---

## Cross-cutting notes for future sessions

- **Public vs. auth boundary**: almost everything under `(landing)` is public read (milpacs,
  ORBAT, gallery, about/rules/faq, credits, donate, partnerships, support, join, community/*).
  Auth-gated trees are `/members`, `/optionals`, `/tickets`, `/me`, `/services-asot`, and the
  `/operations/[id]/edit` + `/operations/[id]/staff` subtrees. `/operations` and
  `/operations/[id]` themselves are public-read with extra content/actions unlocked once logged
  in (`isLoggedIn`, `isHQ`, `isJ6`, `isAllStaff`, `isSectionLeader` flags computed per-request).
- **WIP gate**: `WIP_PAGES` env var (checked inside individual page components) and
  `middleware.ts`'s `WIP_PATHS` rewrite are two *independent* mechanisms — don't assume one implies
  the other is wired up. They now target retired/bios only; **milpacs was released and needed both
  removed**, since the middleware rewrite alone would still have hidden the whole tree, and **ORBAT
  was released and needed only the middleware entry**, having never carried a `WIP_PAGES` check.
  `bios/page.tsx` checks `WIP_PAGES` explicitly; `retired/page.tsx` checks it via its child render.
- **Operation theming**: `pageTheme` (`modern` | `oldfashioned` | `scifi`) is threaded through
  almost every operations component (`doc-body.tsx`, `paged-view.tsx`, `section-nav.tsx`,
  `PageNavClient.tsx`, the main `[id]/page.tsx`) — any new operation-page component should accept
  and respect this prop for visual consistency.
- **Collab editor reuse**: `components/editor/CollabEditor` (dynamic-imported) backs three
  distinct surfaces here: `operations/[id]/edit/page.tsx` (main orders, `documentId={opID}`),
  `operations/[id]/staff/StaffView.tsx` (staff-only blocks, *same* `documentId` but restricted
  `allowedTypes`), confirming CLAUDE.md's note that Y.js docs are keyed by `{operationId}` with
  role-based content filtering rather than separate documents.
- **Map component reuse**: `components/operations/map/MapSection` (op-scoped) and
  `components/operations/map/OperationMap` (standalone, dynamic-imported) are shared between
  `/maps/[name]` (world browser) and `/operations/[id]/map` (op-scoped map) — check there before
  building new map UI.
- **`app/tickets/_shared/`**: `constants.ts` (status/tag/category metadata + shared input styles),
  `MediaUpload.tsx`, `MemberSelect.tsx` are the reusable building blocks for the community-ticket
  system (`/tickets`, `/tickets/new`, `/tickets/[id]`) — a public-facing feedback/bug/mission-pitch
  system distinct from the internal staff ticketing under `app/dashboard`.
