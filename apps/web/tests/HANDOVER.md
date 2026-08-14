# Handover: running the dashboard E2E suite

Playwright suite covering the authenticated `/dashboard`: the permission gate, sidebar
visibility per role, the Discord/TeamSpeak dev-mode toggles, and the privileged/hidden
functions (`/api/dev/*`, impersonation, `OVERRIDE`, task lockout). Roughly 75 tests.

The good news for setup: it needs **no Docker, no `.env`, no Discord bot token and no
OAuth**. `globalSetup` starts a real in-memory MongoDB and seeds five permission personas,
and `playwright.config.ts` injects every env var the app needs. Clone, install, run.

---

## 0. Read this first: the code is not in git yet

As of 14 Aug 2026 the suite is **untracked on my machine**. `git status` shows:

```
 M apps/web/package.json          # adds the 4 test:e2e scripts + 2 devDependencies
?? apps/web/playwright.config.ts
?? apps/web/tests/
```

So you cannot pull it. Pick one:

**Option A, preferred: I push a branch.** Say the word and I will commit these to
`feat/e2e-dashboard` and push. You then `git fetch && git checkout feat/e2e-dashboard`
and skip to step 2.

**Option B: I send you the files.** Eleven files, all under `apps/web/`. Drop them into
your checkout preserving the paths:

```
apps/web/playwright.config.ts
apps/web/tests/constants.ts
apps/web/tests/global-setup.ts
apps/web/tests/global-teardown.ts
apps/web/tests/seed.ts
apps/web/tests/fixtures/asot.ts
apps/web/tests/dashboard.spec.ts
apps/web/tests/dashboard.permissions.spec.ts
apps/web/tests/devmode.spec.ts
apps/web/tests/hidden-functions.spec.ts
apps/web/tests/README.md
```

Then hand-apply the `package.json` change (step 2 lists it).

### Second caveat: my checkout is 9 commits behind `origin/main`

The specs were written against that older tree. If you run them on current `main` and see
failures, they are as likely to be **drift** (a renamed route, a changed selector, a moved
nav item) as a real regression. Note which ones and we will triage together. Do not assume
a red run means the app is broken.

---

## 1. Prerequisites

| Need | Version / note |
|---|---|
| Node | 20+. I am on **v24.15.0**, npm **11.12.1** |
| Git | any |
| Free RAM | **~5 GB free before you start**. This matters, see troubleshooting |
| Internet | first run only, to download a mongod binary and Chromium |
| Free ports | **27018** and **3100** |

No Docker. No MongoDB installed locally. No `.env` file.

---

## 2. Setup

```bash
git clone https://github.com/KL-Designs/ASOT.git
cd ASOT
npm run install:all            # root deps + apps/web deps
```

If you took **Option B**, add these to `apps/web/package.json` before installing:

```jsonc
"scripts": {
  "test:e2e":        "playwright test",
  "test:e2e:ui":     "playwright test --ui",
  "test:e2e:headed": "playwright test --headed",
  "test:e2e:report": "playwright show-report"
},
"devDependencies": {
  "@playwright/test":      "^1.62.1",
  "mongodb-memory-server": "^10.4.3"
}
```

Then, once:

```bash
cd apps/web
npx playwright install chromium
```

First `npm run test:e2e` also downloads a `mongod` binary to
`node_modules/.cache/mongodb-memory-server/`. It is inside `node_modules`, so it is
already gitignored. That download makes the first run noticeably slower than later ones.

---

## 3. Run

```bash
cd apps/web

npm run test:e2e            # headless, everything
npm run test:e2e:headed     # watch it drive a browser
npm run test:e2e:ui         # Playwright UI mode, best for triage
npm run test:e2e:report     # open the HTML report from the last run

npx playwright test devmode.spec.ts        # one file
npx playwright test -g "impersonation"     # one pattern
```

Each spec file is independently runnable. If RAM is tight, run them one at a time.

**Expect the first run to be slow.** It runs against `next dev`, and the first hit on a
J-department panel is a cold compile of 30 to 60 seconds. That is why the config sets a
120s test timeout and a 300s webServer timeout. It is not hung.

A healthy start prints:

```
[e2e] in-memory mongod ready on mongodb://127.0.0.1:27018/ (db: asot_e2e)
```

The run is serial by design (`fullyParallel: false`, `workers: 1`). The specs mutate
shared `site_settings`, so do not raise the worker count.

---

## 4. Troubleshooting

**A big block of failures, some timing out at 30s, others dying in ~30ms.**
Look in the log for:

```
[WebServer] MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:27018
```

That is the in-memory mongod having been killed mid-run, after which every test fails
against a server that can no longer resolve a session. It is not a regression in the specs.

Cause on my box was **memory pressure**: `next dev` sits around 4 GB for this app, and with
a browser and editor open I was down to ~2 GB free and mongod got killed. Same code, same
suite: **70/75 passing with ~11 GB free, 18/77 with ~2 GB free.** Close things and rerun
before you report anything.

**`EADDRINUSE` on 27018 or 3100.** Ports are fixed, so two runs cannot overlap. Check a
previous run is not still alive:

```bash
netstat -ano | findstr "27018 3100"      # Windows
lsof -i :27018 -i :3100                  # macOS/Linux
```

**Everything fails at the auth gate.** Confirm you did not point it at a real database.
It should only ever touch 27018 / `asot_e2e`.

---

## 5. What to send back

- Console output of the full run, or the HTML report folder (`playwright-report/`).
- Your free RAM at the start, so I can rule the mongod issue in or out.
- The commit SHA you ran against: `git rev-parse --short HEAD`.

Failures come with a trace (`trace: 'retain-on-failure'`) and a screenshot
(`screenshot: 'only-on-failure'`). Traces are the fastest way for me to diagnose remotely:
`npx playwright show-trace <path-to-trace.zip>`.

---

## 6. Before you edit or add specs

Read `tests/README.md`. It has the design rationale and, importantly, two traps that will
waste an hour each:

1. **A gated page returns 200 before it redirects.** Department pages opt into dynamic
   rendering, so Next streams `loading.tsx` with a 200 at the gated URL and the redirect
   lands afterwards as a client transition. Assert on the settled URL with
   `await expect(page).toHaveURL(...)`, never on `goto()`'s status or an immediate
   `page.url()`.
2. **Match sidebar items by `href`, not accessible name.** Every NavRow link opens with a
   `▸` glyph inside the anchor, so the accessible name is `"▸ Calendar"` and any
   `exact: true` name match finds nothing. Names are also not unique: `name: 'ORBAT'` also
   matches the public navbar's "OUR ORBAT". Reuse the `navLink()` / `expectNavVisible()` /
   `expectNavAbsent()` helpers in `dashboard.permissions.spec.ts`.

That README also lists **four app-level findings** the suite documents rather than fixes,
including two `/api/dev/*` routes with no authorisation check at all. Those tests assert
current (bad) behaviour on purpose, so the gap is visible in CI. If you fix the app, those
specs are meant to fail. Do not treat them as passing-forever.

---

## 7. Loose end

A separate **public-pages** suite (navbar, footer, home, about, gallery, WIP gate) was
written on another machine and never pushed. If you have it, the merge note in
`tests/README.md` covers it: this `playwright.config.ts` is the one to keep, project names
and the mobile `testMatch` were chosen to line up, and no spec filenames collide. It should
be a file copy rather than a reconciliation.
