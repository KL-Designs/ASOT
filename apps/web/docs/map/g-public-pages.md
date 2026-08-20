# Part G — Public-facing pages

Scope: `app/(landing)/**`, `app/operations/**`, `app/members/**`, `app/tickets/**`, `app/maps/**`,
`app/optionals/**`, `app/login/**`, `app/me/**`, `app/recruit-session/**`, `app/services-asot/**`,
`app/shoot/**`, `app/wip/**`, plus `app/layout.tsx`, `middleware.ts`. (No root `app/page.tsx` exists —
`/` is served by `app/(landing)/page.tsx`.)

---

## Root

#### middleware.ts
Injects `x-pathname` header on every request (except `_next` assets). Also intercepts `WIP_PATHS`
(`/community/orbat`, `/milpacs`, `/community/retired`, `/community/bios`) and rewrites them to `/wip`
unless the URL has `?bypass_wip`. Public, runs on every route.

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
#### app/(landing)/about/layout.tsx
**Async server component** (no longer `'use client'` — that was only ever there to pick the active
tab, which `SectionRail` now owns itself). Holds the `ABOUT_PAGES` table (href/label/kicker/subtitle/
background) that drives both the masthead copy and the rail; resolves the current page via
`activeRailIndex` against `x-pathname` and renders everything through `Container`, passing
`rail={ABOUT_PAGES}`. Only `/about` itself gets an `aside` (`MastheadAside`, live roster count via
`getRosterCount()`, force-dynamic) — the five sub-pages have no live figures worth a second masthead
column. Public.

#### app/(landing)/about/page.tsx
"Who We Are" on the card grid (`Card`/`CardGrid`, `MedalIcon`/`TargetIcon`), lead card carries the
unit photo and copy; the schedule card embeds `<TimeZones/>`. Public, no API calls.

#### app/(landing)/about/callsigns/page.tsx
Callsign registry (India 0A, 1-0, Gamemasters, 1-1/1-2/1-3 platoons, Reservists) via `CallsignCard` +
`List`. Public, purely static content.

#### app/(landing)/about/contact/page.tsx
Contact cards (TeamSpeak, Facebook, Email, own `Channel` helper) + embedded Discord widget iframe.
Public.

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

### /community — Bios, Hall of Fame, ORBAT, Quiz, Retired Wall
#### app/(landing)/community/bios/page.tsx
Server component: queries `Db.users` for HQ leadership roles, resolves ORBAT entries/profile via
`resolveMilpacProfile`, renders bio cards with `/api/uploads/bio?id=` photo. Gated by
`WIP_PAGES` env flag (shows `<WipPage/>`) — also intercepted by middleware's `WIP_PATHS` rewrite.
Public read (no login required to view).

#### app/(landing)/community/bios/loading.tsx
`TacticalLoader` Suspense fallback ("LOADING BIO DATA").

#### app/(landing)/community/hof/layout.tsx
Hall of Fame banner/container layout.

#### app/(landing)/community/hof/page.tsx
Hall of Fame — currently **hardcoded example data** (5 fake members), TODO comment says to swap
for a real `Db.users` query keyed on a HOF Discord role. Public, static for now.

#### app/(landing)/community/kits/page.tsx
The unit's shared-kit shelf, reached from the navbar's "Our Orbat" menu. Server component: reads
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

#### app/(landing)/community/kits/shelf.tsx
`'use client'` — the shelf's controls and grid: search box, the four sorts (Newest / Top rated /
Most copied / A-Z, `SHELF_SORTS`), an AND tag filter bar with per-tag counts (`tagCounts`, counted
over every card so a chip's number doesn't shift as you type), and 24-per-page numbered paging
(`KITS_PER_PAGE`). Filtering/sorting/paging all happen client-side over the cards the server already
shipped — a keystroke costs no round-trip — using the pure functions in `lib/loadout/shelf.ts`
(`matchesQuery`, `matchesTags`, `sortCards`, `pageCount`, `paginate`); this file is state and markup
only. Any change to query/tags/sort resets to page 1. Filter state is not mirrored into the URL, so a
filtered shelf is not linkable. Renders one `<KitCard>` per shown kit, staggered entrance delay capped
at 8 cards.

#### app/(landing)/community/kits/kit-card.tsx
`'use client'` — one kit on the shelf: owner avatar/name, `<TagChips>`, the owner's `description` when
written, primary weapon + attachments, the gear grid, a read-only `<Stars avg count>` row
(`components/loadout/stars.tsx`), and a footer with item count, copy count (seeded from the server,
corrected by the copy endpoint's own answer), a "View" link to `/milpacs/<canonical>/kits/<id>`, and
`<CopyKitButton>` (`copy-kit.tsx`). `CardData` (`ShelfCard` from `lib/loadout/shelf.ts` plus the
rendered fields) is exported for `shelf.tsx` and `page.tsx` to share.

#### app/(landing)/community/kits/copy-kit.tsx
Client `CopyKitButton`: copies a shared kit's raw ACE arsenal export via `copyText`
(`@/lib/clipboard`), showing "Copied" for 1.8s. Borrows `.btn` from `profile.module.css`.

#### app/(landing)/community/orbat/loading.tsx
`TacticalLoader` Suspense fallback ("LOADING ORBAT DATA").

#### app/(landing)/community/orbat/page.tsx
The full public ORBAT board: Company HQ hero, 1-1/1-2/1-3 platoon columns (`PlatoonColumn`,
`UnitCard`, `MemberRow`), Gamemasters/Reservists cards. Pulls `fetchORBAT()` from `@/lib/orbat`,
per-section colour/patch metadata from `Db.orbatSectionMeta`, links member names to
`/milpacs/[username]`. Shows a "⚙ Manage ORBAT" link to `/dashboard/orbat` if
`PERMISSIONS.admin.manageOrbat`. Intercepted by middleware `WIP_PATHS`. Public read.

#### app/(landing)/community/quiz/[attemptId]/page.tsx
Server page for an in-progress/completed quiz attempt. Requires login (`redirect('/login')` if no
`me`), validates the attempt belongs to the current user, shows static pass/fail/under-review
screens or renders `<QuizClient/>` for an in-progress attempt. Reads/writes `Db.quizAttempts`.

#### app/(landing)/community/quiz/[attemptId]/quiz-client.tsx
Client quiz-taking UI: section sidebar (`QuizSectionSidebar`), timer panel (`QuizTimerPanel`),
question cards (`QuizQuestionCard`), instruction modal. Debounced auto-save + start/submit via
`PATCH /api/community/quiz/[attemptId]` (`action: 'save'|'start'|'submit'`). Auto-submits on timer
expiry.

#### app/(landing)/community/retired/layout.tsx
Sets metadata for the Retired Members wall.

#### app/(landing)/community/retired/page.tsx
Thin wrapper — renders `<RetiredWall/>` (or `<WipPage/>` if `WIP_PAGES=true`). Also intercepted by
middleware `WIP_PATHS` rewrite (note: `/community/retired` is in the WIP_PATHS list).

#### app/(landing)/community/retired/RetiredWall.tsx
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
The MILPACs index/roster: hero banner, sticky `<MilpacsNav/>` jump-nav, then sections for India
Company HQ, 1st/2nd/Support Platoon (from `fetchORBAT()`), Reservists — each member rendered via
`<Card/>`. Section colours/patches come from `Db.orbatSectionMeta`. Shows "⚙ Manage ORBAT" link
to `/dashboard/orbat` for users with `PERMISSIONS.admin.manageOrbat`. **Live** — both WIP gates were
removed (the `WIP_PAGES` check here and `/milpacs` in middleware's `WIP_PATHS`, which also covered
`/milpacs/[username]`). Public read.

#### app/(landing)/milpacs/card.tsx
Client member card: tilt-on-hover 3D effect, links to the member's canonical milpac path via an
optional `href` prop (the index builds these with `buildSlugIndex`/`canonicalSegment` so cards skip
the redirect); falls back to `/milpacs/[username]`. Displays avatar
(`Avatar` from `@/components/member/avatar`), rank abbreviation, name, role. Used by both the
milpacs index and (indirectly via similar pattern) other roster pages.

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
`/api/uploads/cover`); `<RequestAwardButton/>` lets any other logged-in member nominate an award
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
rendered for the profile owner (`isOwn`).

#### app/(landing)/milpacs/[username]/cover-upload.tsx
Client `CoverUpload`: file input to upload (`POST /api/uploads/cover`, multipart) or remove
(`DELETE /api/uploads/cover`) the profile's cover banner image. Owner-only.

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
Server page: determines `editAccess` via `PERMISSIONS.pages.operationsEdit`, renders header +
`<SearchBar/>` + conditional `<CreateButton/>` + `<OperationsBoard editAccess/>` — all from
`./list.tsx`. Public read; create/edit UI only shown to staff.

#### app/operations/list.tsx
Large (1158-line) client module exporting the three board building blocks used by
`operations/page.tsx`:
- **`SearchBar`** — debounced live search hitting `/api/operations?search=`, dropdown results.
- **`CreateButton`** — modal to create a new mission: single (`GET /api/operations/new` →
  redirects to edit) or campaign-linked (existing campaign via `GET
  /api/operations/campaign-missions?campaignId=` + `POST` to add a mission, or brand-new campaign
  via `POST /api/operations/campaigns`). Roman-numeral mission naming (`toRoman`).
- **`OperationsBoard`** (exported, used by the page) — 3-column layout: left
  `ActiveMissionsPanel` (polls `/api/operations?status=Active,Upcoming` every 5s), centre
  `MonthlyMissionsPanel` (fetches `/api/operations?year=&month=` + `/api/operations/campaigns` +
  per-campaign `/api/operations/campaign-missions`, groups ops into campaign hierarchies with
  Saturday/Sunday slot detection via title parsing), right `CalendarPicker` (year/month browser).
  Also renders `CampaignsBand`/`CampaignEntry`/`MissionRow` sub-components with J2/Edit/Map/View
  quick-links for staff (`hasAccess`).

#### app/operations/[id]/layout.tsx
Sets dynamic `<Metadata>`/`<Viewport>` (theme colour) from `Db.operations` for the given id.

#### app/operations/[id]/page.tsx
The main public operation-orders viewer (very large, themeable — `modern`/`oldfashioned`/`scifi`
page themes). Server component: fetches the operation + current user, computes role flags
(`isHQ` via `operationsEdit`, `isAllStaff` via `attendance.confirm`, `isJ6` via `departments.j6`,
`isSectionLeader` via `Db.orbatPositions`), renders hero banner (cover photo, department badge,
title, op/lore dates), section-nav or paged-view content (delegates to `<PagedView/>` when
`operation.pages.length > 1`, otherwise renders sections/legacy single body inline via
`<DocBody/>`), an `<AttendanceDrawer/>` sidebar, Zeus Notes tab (J6-only), OCAP tab
(`<OcapLinkPanel/>` for HQ to sync, `<OcapStatsPanel/>` for anyone logged in once synced), and
`<DocAcknowledgeCard/>` read-receipt banner+footer when `isAllStaff && status === 'Upcoming'`.
Hidden (`isPublic: false`) sections show a "Classified — Login to Access" banner to logged-out
visitors. Public read; edit link shown to `isHQ`.

#### app/operations/[id]/doc-body.tsx
Client: renders TipTap ProseMirror JSON (`generateHTML` from `@tiptap/core` + StarterKit,
Underline, Image, Link, TextAlign, Highlight) as themed HTML (`.op-doc` CSS varies per
`pageTheme`). Used by both the single-page view and `PagedView`/`StaffView`.

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
Very large (2400+ line) client operation-editor page — the main HQ/J2 authoring surface. Covers:
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
content. Also toggles a right-hand `<ActivityLog/>` panel and a live `<iframe>` preview pane.

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
members) mirroring `/community/orbat`'s visual style, used during the "ORBAT Overview" onboarding
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
for `middleware.ts`'s `WIP_PATHS` list (`/community/orbat`, `/milpacs`, `/community/retired`,
`/community/bios`) — visiting those paths without `?bypass_wip` serves this page's content instead
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
  the other is wired up. They now target orbat/retired/bios only; **milpacs was released and needed
  both removed**, since the middleware rewrite alone would still have hidden the whole tree.
  `community/bios/page.tsx` checks `WIP_PAGES` explicitly; `community/retired/page.tsx` checks it
  via its child render.
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
