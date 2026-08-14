# E2E test suite

Playwright, run against a real Next.js dev server and a real (in-memory) MongoDB.

```bash
npm run test:e2e            # headless, all projects
npm run test:e2e:headed     # watch it drive a browser
npm run test:e2e:ui         # Playwright UI mode
npm run test:e2e:report     # open the last HTML report
npx playwright test -g "impersonation"   # single pattern
```

First run downloads a `mongod` binary, cached at
`node_modules/.cache/mongodb-memory-server/mongod-x64-win32-<version>.exe` (so it is
covered by the existing `/node_modules` ignore). You also need `npx playwright install
chromium` once.

---

## Why there is a database

The dashboard gate lives in a **server component** — `app/dashboard/layout.tsx` calls
`client.fetchMe()` and `hasPermission()` before rendering anything. Playwright's
`page.route()` only intercepts requests the *browser* makes, so it cannot stub a
server-side call. There is no seam to mock; the only way to exercise the real gate is
to give the server a real database to resolve the session against.

That turns out to be cheap. `fetchMe()` **never calls Discord**
(`lib/discord/index.ts:39-70`) — it reads the `token` cookie, then `Db.users` and
`Db.roles`. So:

> a seeded Mongo user + a `token` cookie == a complete, fully-authenticated session.

No OAuth round-trip, no bot token, no live Discord, no Docker. `tests/fixtures/asot.ts`
is therefore about ten lines of "add a cookie".

## How the harness fits together

| File | Role |
|---|---|
| `constants.ts` | Fixed ports, seeded role IDs, the persona table |
| `global-setup.ts` | Boots `mongodb-memory-server` on a fixed port, seeds it |
| `global-teardown.ts` | Stops it |
| `seed.ts` | Fixture data + `withDb()` for direct assertions |
| `fixtures/asot.ts` | `adminPage` / `memberPage` / `pageAs(persona)` |

**Ports are fixed, not auto-allocated** (`MONGO_PORT = 27018`, `WEB_PORT = 3100`).
This is deliberate: Playwright starts `webServer` *before* `globalSetup`, so a
dynamically-allocated Mongo URI would not exist yet when `playwright.config.ts` builds
`webServer.env`. Fixed ports remove the ordering dependency entirely. 27018/3100 rather
than 27017/3000 so a real local dev stack can keep running alongside the suite.

`DISCORD_BOT_TOKEN` is deliberately set to `''` so `checkDiscord()` short-circuits to
`false` without a network call — the status route is then fully deterministic and no
test ever touches discord.com.

## Personas

| Persona | Discord roles | Departments | Reaches /dashboard? |
|---|---|---|---|
| `override` | *(none)* | *(none)* | Yes — purely via the `OVERRIDE` env var |
| `j4` | `J4-Administration`, `J4 - Administration`, `ASOT Member` | `j4` | Yes |
| `j3` | `J3 - Training`, `ASOT Member` | `j3` | Yes |
| `plainMember` | `ASOT Member` | *(none)* | **No** — bounced to `/me` |
| `discharged` | J4 roles | `j4` | **No** — bounced to `/login` |

`override` deliberately holds **zero** Discord roles. Anything it can reach, it reaches
purely because its ID is in `OVERRIDE` — which makes it a clean probe for whether that
bypass is actually wired up, rather than a user that would have passed anyway.

`plainMember` is the regression guard for the permission-system migration: holding the
`ASOT Member` Discord role is **no longer sufficient** to reach `/dashboard`. The real
gate is `hasDashboardAccess()` — implicit for department membership, a department
sub-role, or an ORBAT position (including Reservists), not a `hasPermission()` key at all.

## Coverage

| Spec | Covers |
|---|---|
| `dashboard.spec.ts` | Shell, sidebar sections, collapse/expand, status strip, all 7 J-department pages, 9 sub-pages (load + no runtime errors) |
| `dashboard.permissions.spec.ts` | Layout gate (anon / discharged / plain member / department member), sidebar visibility matrix, direct navigation to gated pages |
| `devmode.spec.ts` | Discord + TeamSpeak dev mode: 401/403 gates, explicit set, bodyless toggle, `site_settings` persistence, action logging, reflection in `/api/dashboard/status` |
| `hidden-functions.spec.ts` | `/api/dev/*` back doors, `OVERRIDE` bypass, the two J4 role spellings, full impersonation round-trip, task lockout force-redirect, anonymous probes of privileged routes |

---

## Findings raised by writing these (app issues, not test issues)

These are **not** fixed here — the specs document current behaviour so the gaps are
visible in CI rather than implicit.

1. **`/api/dev/grant-all-roles` and `/api/dev/test-application` have no authorisation
   check and no `NODE_ENV` guard.** They verify only that the caller is *logged in*.
   Any authenticated member can invoke them; `grant-all-roles` escalates the caller to
   every department and lead role in the guild. Both files carry a
   `DELETE THIS FILE before deploying to production` comment, which is a process control
   rather than a technical one — nothing fails the build if they ship. Suggested fix: an
   early `if (process.env.NODE_ENV === 'production') return 404`, plus a
   `PERMISSIONS.departments.j4` check.

2. **Two near-identical J4 role names.** `client.hasRoles()` hardcodes its global bypass
   on the role named `J4-Administration` (no spaces); `PERMISSIONS.departments.j4` is
   `['J4 - Administration']` (with spaces). `DEFAULT_LOCKOUT_GROUPS` uses the unspaced
   form too. A Discord admin renaming either role silently changes who holds god-mode.
   Covered by the `J4 role-name distinction` block so a rename trips a test.

3. **`?bypass_wip` is unauthenticated** (`middleware.ts:13`). Anyone who knows the
   parameter can view WIP pages. Fine if the gate is cosmetic; worth knowing if it isn't.

4. **`client.updateRoles()` is fire-and-forget at module load** (`lib/discord/index.ts:130`).
   Until that promise resolves, `client.roles` is `[]` and every `hasRoles()` call returns
   false (bar the `OVERRIDE` bypass). On a cold server the first request or two can
   therefore under-grant permissions. Not observed to flake this suite, but it is a real
   boot race.

5. **`app/me/page.tsx:65` passes a non-serializable prop into a Client Component.**
   `<Avatar user={me} />` hands the whole `me` object to `Avatar` (`'use client'`), and
   `me.roles` is the raw `Db.roles` documents — including MongoDB's `ObjectId` `_id` —
   attached by `fetchMe()`. Next logs `Only plain objects can be passed to Client
   Components...` on every visit to `/me` in dev mode (seen running this suite; does not
   fail a test or visibly break the page — React silently drops what it can't serialize).
   Suggested fix: pass only the specific fields `Avatar` actually reads, not the full `me`.

---

## Two behaviours that will bite you when writing specs

**1. A page gate returns 200 before it redirects.** The department pages opt into dynamic
rendering (`await connection()`), so Next streams `loading.tsx` with a **200 at the gated
URL** and the `redirect()` only lands afterwards, as a client transition. Asserting on
`goto()`'s response status or on `page.url()` immediately will tell you access was granted
when it wasn't. Assert on the *settled* URL with `await expect(page).toHaveURL(...)`,
which retries. (The early response contains only the loading skeleton — no gated data.)

**2. Match sidebar items by `href`, not by accessible name.** Two traps:
- every NavRow link opens with a `▸` glyph *inside* the anchor, so the accessible name is
  `"▸ Calendar"` — any `exact: true` name match silently finds nothing;
- names are not unique across the page. `getByRole('link', { name: 'ORBAT' })` also
  matches the public navbar's **"OUR ORBAT"**, and `/dashboard/tasks` is rendered twice
  (`TasksShortcutButton` plus the Unit section).

`dashboard.permissions.spec.ts` has `navLink()` / `expectNavVisible()` /
`expectNavAbsent()` helpers that do this correctly — reuse them.

---

## Known failure mode: a dead mongod looks like 50 broken tests

If a run suddenly produces a large block of failures — some timing out at 30s, others
failing in ~30ms — check the log for:

```
[WebServer] MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:27018
```

That means the in-memory `mongod` died mid-run and every subsequent test failed against a
server that could no longer resolve a session. It is not a regression in the specs.

Observed cause on this machine: **memory pressure**. `next dev` sits around 4 GB for this
app, and with a browser and editor open the box ran to ~2 GB free, at which point mongod
was killed. The same suite went 70/75 with ~11 GB free and 18/77 with ~2 GB free, on
identical code.

Mitigations, in order of effort:
- close memory-hungry apps before a full run, or run a single spec file at a time;
- `npx playwright test devmode.spec.ts` etc. — each file is independently runnable;
- the config already sets `NODE_OPTIONS=--max-old-space-size=4096` for the dev server.

Ports are fixed (27018 / 3100), so **two runs cannot overlap**. Check both are free before
starting if a previous run was interrupted.

**A single, isolated failure with `read ECONNRESET` is the same root cause, smaller
blast radius.** Rather than mongod dying outright, `next dev` sometimes logs
`⚠ Server is approaching the used memory threshold, restarting...` and restarts itself
mid-run; whichever request lands in that window gets `ECONNRESET` instead of a response.
Seen twice writing the config: two full runs, one flaky failure each, a *different* test
both times, and both passed cleanly on their own in isolation immediately after. If a lone
failure shows that log line right above it, re-run just that test before assuming
anything's broken — `npx playwright test -g "<test name>"`.

---

## Merge note

A separate **public-pages** suite (navbar, footer, home, about, static pages, gallery,
WIP gate) was written on another machine and has not been pushed. When the two meet:

- This `playwright.config.ts` is the one to keep — it carries the Mongo
  `globalSetup`/`webServer` wiring. The public specs can adopt it unchanged; an unused
  seeded database costs them nothing.
- Project names (`chromium`, `mobile`) and the `mobile` `testMatch`
  (`*.mobile.spec.ts`) were chosen to match that suite, so merging should be a
  file-copy rather than a reconciliation.
- Spec filenames do not overlap. The WIP-gate and gallery specs live over there;
  nothing here duplicates them.
- That suite stubs data with `page.route()`. That remains correct for public pages —
  but note it cannot work for anything behind the dashboard gate, for the reason at the
  top of this file.
