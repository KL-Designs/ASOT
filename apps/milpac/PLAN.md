# MilPac Generator — Import & Overhaul Plan

**Status:** Phases 0–4 complete. The service is built, containerised, wired into
compose and the start menu, called by the website, tested and documented.
Nothing in §6 remains. See §12 for what is outstanding outside this plan.

**Branch:** `milpac-service`, branched off `main`. Not pushed.
**Date:** 2026-08-16

---

## 0. Start here

If you are picking this up cold, read §1 for context, then §3 for the defect
that motivates the work, then §6 for what to do.

**What already exists on this branch:**

| Commit | Author | Contents |
|---|---|---|
| `4e6bd956` | Fulcrum | Fulcrum's original generator, imported verbatim apart from three credential redactions. 329 files. |
| `b422195d` and later | Koda | This document. Docs only — no code on top of the import yet. |

Phase 0 is done — the import is committed, secrets are redacted, and the
excluded files are preserved in `storage/milpac-design-source/`. See the table
at the top of §6 for exactly what was moved, deleted, and redacted.

**Do not start Phase 1 by editing `src/server.ts` in place.** The imported code
is an archive of Fulcrum's work, kept for attribution. Phase 1 is a rewrite
against the §4 layout, not a refactor of what is there.

**All §7 decisions are settled** — answered by the unit on 2026-08-16 and
recorded there with their consequences. Nothing in this plan is waiting on an
answer. The three that mattered: corps-specific rank insignia **do** render, the
medal box follows the **original** layering and centring, and the UnitCommander
push is **dropped entirely** rather than moved to web.

**Outside this repo:** the MongoDB Atlas credential and the `UC_API_KEY` JWT
found during the import still require rotation. See the end of §6 Phase 0.

---

## 1. What this is

`apps/milpac` is the original MilPac image generator written by **Fulcrum**
(GitHub [@crackedpotato007](https://github.com/crackedpotato007)), ASOT's former
main developer. It generates three things:

| Output | How | Entry point |
|---|---|---|
| Uniform images | `node-canvas` compositing of ~40 layered PNGs | `src/index.ts` |
| Certificates | `.pptx` template → LibreOffice → PDF → ImageMagick → PNG | `src/cert.ts` |
| Medal display boxes | `node-canvas` compositing | `src/box.ts` |

The website already contains a partial re-implementation at
`apps/web/lib/milpac-gen/` (uniform + box only, no certificates). Its **data
model is authoritative and current** — it derives everything from live
`user.milpac` records, ORBAT sections, awards and qualifications. Its **visual
generation is not** (see §3).

The goal is to keep the website's data model, replace its renderer with
Fulcrum's — properly overhauled — running as a separate container the website
calls over HTTP.

---

## 2. Attribution and sequencing

Fulcrum's work goes in **first, as its own commit, authored by him**, before any
of our changes. Everything else builds on top of that commit.

This constrains the cleanup order. Git history is permanent: anything that lands
in the import commit stays in the repository forever, even if a later commit
deletes it. So **files we don't want in the repo must be excluded from the import
commit itself, not removed afterwards.**

Attribution is preserved through `git commit --author`, plus a commit message
that states exactly what was excluded and why. An import commit omitting a 27 MB
GIMP scratch file is normal practice and does not diminish the attribution.

---

## 3. The bug this fixes

`apps/web/lib/milpac-gen/uniform.ts:61-69` turned Fulcrum's substring replacements
into anchored greedy regexes during the port. This changed their meaning:

```js
// original — data-processor.ts:107   (substring replace, preserves tier suffix)
rank.replace("SIG", "PTE")            // "SIGL" → "PTEL" → draws PTEL.png

// web port — uniform.ts:62           (greedy regex, swallows tier suffix)
rank.replace(/^SIG.*/, 'PTE')         // "SIGL" → "PTE"  → blanked on line 67
```

Because `.*` consumes the tier suffix, every rank collapses to bare `PTE`, and
the `['PTE','PTEP','REC']` check on line 67 then clears it. The result is a
uniform with **no rank insignia at all** for:

- Signallers above base — `SIGL`, `SIGS`, `SIGSL`
- Troopers above base — `TPRL`, `TPRS`, `TPRSL`
- Sappers above base — `SAPL`, `SAPS`, `SAPSL`
- Gunners above base — `GNRL`, `GNRS`, `GNRSL`
- All Game Masters — `GMP`, `GMS`, `GMG`, `GMD` (via `/^GM.*/`)

None of them can currently render. An earlier draft of this section claimed all
the corresponding `.png` files exist; **that is wrong for signallers** — there is
no `SIG*` artwork at any tier, in either asset tree. See §10 for the full audit
and what each group actually resolves to. The `PTSG → PSM` mapping was also
dropped in the port, though `PTSG.png` exists.

**The fix is deletion, not repair.** Under the new architecture the service does
no rank rewriting whatsoever — web's `buildUniformData` emits the final rank
code and the service renders it. The offending regexes go away entirely.

Two smaller divergences to resolve during the overhaul:

- **Medal box draw order is reversed.** The original drew right-to-left so the
  leftmost medal overlapped its neighbour; the web port draws left-to-right so
  the rightmost does. Different layering, visibly different output. **Resolved:
  the original is correct** (§7 decision #4) — draw right-to-left.
- **Medal box centring differs.** The web port accounts for medal width in the
  centring maths (`(n-1)*step + width`); the original did not (`n*step`).
  **Resolved: the original is correct** (§7 decision #4) — `n*step`, medal width
  excluded. In both cases the web port's version is the regression.

---

## 4. Architecture

The service is a **stateless renderer**. It holds no database connection, no
credentials, and no session state. The website builds the payload from its own
authoritative data and posts it; the service draws pixels and returns bytes.

```
apps/web                                   apps/milpac (container)
────────                                   ───────────────────────
Db.users.findOne()
buildUniformData(user, orbatEntry)
maps.ts: award → citation
         qual  → badge
         section → corps badge
        │
        ├── POST /render/uniform  ───────→  compose canvas layers
        │      { rank, badge, … }               │
        │                          ←───────  200 image/png
        │
   write storage/milpacs/{id}.png
```

**Why stateless.** The mapping from awards/qualifications/ORBAT to ribbons and
badges is the part that is current and correct, and it depends on the website's
schema. Duplicating it into a second app is precisely how the two versions drifted
apart in the first place. Keeping it in exactly one place is what prevents a
repeat. It also means the service needs no `MONGO_URL`, no `UC_API_KEY`, and no
schema knowledge — it is testable in complete isolation.

### Target layout

```
apps/milpac/
  src/
    server.ts                  express bootstrap, route mounting
    config.ts                  env parsing, fail-fast on missing vars
    schema.ts                  zod request schemas
    assets.ts                  asset path resolution + boot-time preflight
    routes/
      uniform.ts               POST /render/uniform
      box.ts                   POST /render/box
      certificate.ts           POST /render/certificate
      health.ts                GET  /health
    render/
      uniform.ts               uniform compositing
      box.ts                   medal box compositing
      certificate.ts           certificate compositing (new, canvas-based)
      layers.ts                shared draw helpers
      ribbons.ts               ribbon row cascade logic
  assets/
    imge/                      ribbons, rank, corps, medallions, embellishments,
                               training badges, certificate art
    medal-box-images/          backboard, glass, border, medal art
    fonts/                     Times New Roman, Old English, Brush Script
    templates/                 pptx design source (see §6)
  PLAN.md                      this file
  CLAUDE.md                    per monorepo convention
```

### API contract

All endpoints require `Authorization: Bearer ${MILPAC_SERVICE_TOKEN}` and return
`image/png` on success. The container is on the internal Docker network with **no
published port** — it is not reachable from outside the compose stack.

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/render/uniform` | `UniformPayload` | `image/png` |
| `POST` | `/render/box` | `BoxPayload` | `image/png` |
| `POST` | `/render/certificate` | `CertificatePayload` | `image/png` |
| `GET` | `/health` | — | `200 {ok:true}` |

Validation failures return `400` with the offending field, never a `500` from a
thrown `loadImage`. Unknown asset references return `422` naming the missing
asset.

### Two properties that matter

**The service writes nothing to disk.** It returns bytes; the website persists
them to `storage/milpacs/`. This removes the original's shared-`output.pptx`
race (two concurrent certificate requests clobbered each other's intermediate
file) and its same-name output collisions, without needing locks or temp-dir
juggling.

**Assets are validated at boot.** `assets.ts` walks the rank/ribbon/badge/medal
type unions and asserts every referenced file exists, failing startup with the
full list of what's missing. Today a missing asset surfaces as a runtime
exception mid-render, or — in the web port — a silent `console.warn` and a
uniform that renders wrong without telling anyone.

---

## 5. Working-tree audit

Measured 2026-08-16 against the untracked `apps/milpac/` tree.

### Already handled

Fulcrum's own `.gitignore` correctly excludes all generated output. Verified with
`git check-ignore`:

| Path | Contents | Status |
|---|---|---|
| `certificates/` | 343 rendered member certificates | ignored |
| `milpac/` | 184 rendered member uniforms | ignored |
| `certs-*/` | 16 leftover per-request temp dirs | ignored |
| `medal-box-images/boxes/` | 87 rendered medal boxes | ignored |
| `output.pptx` | 10 MB intermediate | ignored |
| `dist/`, `.env` | build output, secrets | ignored |

**No generated member imagery enters the repository.**

### What would actually commit

347 files, 70 MB on disk. But **295 of those are byte-identical to blobs the
repository already stores** in `apps/web/public/milpac-assets` — verified by
comparing SHA-1 digests across all six asset categories (Ribbons 39/39, Rank
109/109, Medallions 9/9, Training Badges 57/57, Embellishments 16/16, Corps
10/10, all identical). Git addresses objects by content hash, so those cost
effectively nothing in additional pack weight.

Only **52 files are genuinely new, totalling 46 MB** — and 44.6 MB of that is
four files in `templates/`:

| File | Size | Slides | Referenced in code? | Verdict |
|---|---|---|---|---|
| `templates/Milpac 2024.xcf` | 27.4 MB | — | no | **exclude** — GIMP working file for the *uniform*, superseded by its own exported PNGs |
| `templates/awards.pptx` | 9.2 MB | 42 | yes | **keep** — matches the 42 award entries in `server.ts` |
| `templates/Bulk Template.pptx` | 6.3 MB | 116 | yes | **keep** — matches the 116 rank codes in `server.ts` |
| `templates/save.pptx` | 1.7 MB | 16 | no | **exclude** — abandoned partial |
| `imge/Citations - Six_s Idea/` | 8.3 MB | — | no | **exclude** — concept art for citations never built (already duplicated from web, so costs nothing either way; excluded as clutter) |
| `.DS_Store` | 8 KB | — | no | **exclude** |

Excluding `Milpac 2024.xcf` and `save.pptx` takes the import's new weight from
**46 MB → 16.9 MB**. Both are moved to `storage/milpac-design-source/` — preserved
on the bind mount, out of git history.

### On the `.pptx` templates

These stay in the repository permanently, and are **not** optional. They serve two
runtime-adjacent purposes even after the canvas rewrite:

1. They are the only record of which of the 158 slides maps to which rank or
   award, the exact per-certificate wording, and element positioning. That is the
   source the canvas renderer is transcribed from.
2. They are the regression baseline — canvas output gets diffed against
   pptx-produced renders before it replaces anything.

Distinct from these is the certificate **runtime art** (`Background.jpg`,
`Frame.png`, `WaxSealGold.png`, `logo.png`, `Untitled2.png` in
`imge/Certificates/`), which the canvas renderer draws directly on every request.
That art is already unpacked as loose files and is byte-identical to web's copy.

---

## 6. Phases

### Phase 0 — Pristine import

**Preparation — done 2026-08-16, working tree only, nothing committed.**

| # | Action | Result |
|---|---|---|
| 1 | Move `templates/Milpac 2024.xcf` (27.4 MB) and `templates/save.pptx` (1.7 MB) → `storage/milpac-design-source/` | done — preserved off git |
| 2 | Delete `imge/Citations - Six_s Idea/` | done — 7 byte-identical files verified tracked at `apps/web/public/milpac-assets/imge/Citations - Six_s Idea/`, so the art is preserved in git |
| 3 | Delete `.DS_Store` | done |
| 4 | Delete `dist/` | done — stale build output that contained a compiled copy of the Atlas credential |
| 5 | Delete 8 `.DS_Store` files (1 at root, 7 nested under `imge/`) | done — the nested ones were caught only by scanning the staged set, not the working tree |
| 6 | Move `docker-compose.yml` → `storage/milpac-design-source/` | done — it published port 42070 with no auth on any generation endpoint, making the §9 findings live. Superseded by the root stack. `Dockerfile` retained, so the build is still on record. |

**Secret redaction — done.** A scan of every committable file found the
credential in three places, not one:

| Location | Was | Now |
|---|---|---|
| `src/connectDB.ts:5` | Atlas URI with inline password | `process.env.MONGO_URL`, throws if unset |
| `utility/modify.js:6` | same Atlas URI, duplicated | `process.env.MONGO_URL`, throws if unset |
| `src/server.ts:46` | `secret: "fulcrumisagod"` | `process.env.SESSION_SECRET \|\| randomBytes(32)` |
| `dist/connectDB.js` | compiled copy of the URI | directory deleted |

`SESSION_SECRET` is deliberately **not** added to `.env.example` — `dotenv-safe`
treats every key there as required, so adding it would break boot for anyone
whose `.env` predates it. The random fallback means no configuration change is
needed, and `express-session` is removed entirely in Phase 1 anyway.

Post-cleanup the committable set is **338 files**, of which **50 are genuinely
new to the repository, totalling 16.9 MB** — 15.5 MB of that being the two
certificate templates. This matches the §5 projection exactly.

**Still outstanding — requires action outside this repo:**

> **Rotate the MongoDB Atlas credential.** It now survives only in
> `apps/milpac/.env` (gitignored, which is correct), but it sat in plaintext
> across three tracked source files and one build artefact. Treat it as
> compromised. `UC_API_KEY` in the same file is a live JWT and is worth rotating
> on the same pass.

**Commits — done.** Branch `milpac-service` off `main`, staged by explicit path
list so `PLAN.md` was not swept into the import:

```
4e6bd956  Fulcrum <68459855+crackedpotato007@users.noreply.github.com>
          Import the original MilPac generator by Fulcrum (@crackedpotato007)
b422195d  Koda
          docs(milpac): add the import and overhaul plan
```

The ID-prefixed noreply address is deliberate — GitHub resolves it to
`crackedpotato007` reliably, where the bare `crackedpotato007@users.noreply…`
form does not on newer accounts. He appears in the repository's Contributors
list once this branch merges to `main`; that graph is computed from the default
branch only.

**Carried into Phase 1:** add `.DS_Store` to `.gitignore`. It was deliberately
left out of Phase 0 so the import commit changed nothing in Fulcrum's
`.gitignore` beyond the credential redactions elsewhere.

### Phase 1 — Strip to a stateless renderer

Remove: mongoose, passport, passport-local, passport-local-mongoose,
express-session, connect-mongo, cookie-parser, `src/models/`,
`src/connectDB.ts`, `public/` (the four HTML pages), `src/utility/get-uc-id.ts`,
`src/utility/update-uc-uniform.ts`.

Remove with the pptx pipeline: docxtemplater, pizzip, unoconv, `@hckrnews/ppt2pdf`,
pdf-img-convert, pdfjs-dist, pptxgenjs, ppt-png, nodejs-pptx, xlsx, gm,
file-format-converter, custom-soffice-to-pdf, `libs/unoconv`.

Remove as junk: `src` (a package literally named `src`), `node.js`, node-gyp,
rimraf.

Swap `canvas` → `@napi-rs/canvas`, matching web and dropping the native build
chain. Add zod, and a `build` script (`package.json` points `main` at
`dist/server.js` but has no build step today).

Restructure per §4. Note that Phase 0 imports Fulcrum's original flat layout —
`imge/`, `medal-box-images/`, `fonts/` and `templates/` sit at the app root. This
phase is where they are consolidated under `assets/` and the source tree is split
into `routes/` and `render/`. Add boot-time asset preflight. Add bearer-token
auth. Add health endpoint. Delete the `req.headers.host !== "localhost"`
pseudo-auth on `/register` along with registration itself.

Container base goes `node:bookworm` + libreoffice + ghostscript + cairo
(~1.5 GB) → `node:22-alpine` (~200 MB).

**Three deviations from this plan, decided during implementation:**

1. **No build step.** This plan called for adding a `build` script and pointing
   `main` at `dist/server.js`. `apps/bot` runs TypeScript directly through `tsx`
   with no build, and matching the app next door beats matching a plan written
   before that convention was checked. Scripts are `dev` (`tsx watch`), `start`
   (`tsx`) and `typecheck` (`tsc --noEmit`), identical in shape to bot's. This
   also removes a build stage from the container. Consequence: Phase 4c has no
   "Build MilPac" menu item.
2. **`Dockerfile` → `dockerfile` renamed here, not in Phase 4a.** The file was
   being rewritten for the alpine base anyway, so renaming it in the same pass
   avoided touching it twice and avoided a case-only rename landing separately.
3. **Workspace registration done here, not in Phase 4b.** `apps/milpac` had to
   be in the root `workspaces` array before its dependencies could be installed
   and the code typechecked, so it could not wait for Phase 4.

### Phase 2 — Canvas certificate renderer

**Read §11 first** — the original pipeline has been reverse-engineered and the
slide mapping recovered from git history, and two of its findings change what
this phase has to do.

1. Parse `ppt/slides/slideN.xml` out of both templates (they are zip archives) to
   extract text content, positions, and font sizes per slide.
2. Emit `certificate-layouts.json` keyed by cert code, using the recovered
   `assets/templates/slide-map.json` to resolve code → template + slide.
3. Implement `render/certificate.ts`. **The layer list in the original §4 sketch
   — `Background.jpg` → `Frame.png` → text → `WaxSealGold.png` → `logo.png` —
   does not survive contact with the artwork; see §11.** Resolve the canvas
   geometry question before writing the renderer.
4. Render all 158 and diff against pptx-produced references. Nothing replaces the
   old pipeline until this passes review.
5. Once it passes: delete the 614 legacy renders in `certificates/`, `milpac/`
   and `medal-box-images/boxes/` (§7 decision #5). They are kept through this
   phase as visual references and discarded at the end of it, rather than left
   on the bind mount indefinitely.

Expected: 3–6 s per certificate → tens of milliseconds, with no shared-file race
and no `execSync` string interpolation.

### Phase 3 — Website integration

1. Add `apps/web/lib/milpac-gen/client.ts` — typed fetch wrapper.
2. Replace direct renderer calls in four places:
   - `app/(landing)/milpacs/[username]/page.tsx`
   - `app/api/generate/milpac/[username]/route.ts`
   - `app/api/admin/tickets/[id]/route.ts`
   - `lib/milpac-gen/generate-for-user.ts`
3. Move final rank resolution into `buildUniformData` and delete the regexes
   described in §3.
4. Migrate `/api/generate/milpac/[username]` auth from
   `client.hasRoles(me, PERMISSIONS.pages.admin)` to `hasPermission`, per
   `apps/web/CLAUDE.md`.
5. Surface certificates on milpac profiles.
6. Once verified: delete `lib/milpac-gen/uniform.ts` and `lib/milpac-gen/box.ts`.
   Keep `data-mapper.ts` and `maps.ts`.

   **Do not delete `public/milpac-assets/`** — an earlier draft of this step
   said to, and that is wrong. Three pages serve it straight to the browser:
   `app/(landing)/milpacs/[username]/page.tsx` and
   `app/(landing)/community/retired/RetiredWall.tsx` build `<img>` URLs for
   training badges and ribbons out of it, and `app/tickets/new/page.tsx` shows
   an example ribbon and medal. Removing it breaks badge and ribbon display on
   all three. It duplicates the service's copy, but the duplication is the point:
   one copy is composited server-side by the renderer, the other is fetched by
   the browser, and only the first moved.

### Phase 4 — Compose, monorepo tooling and documentation

Phases 1–3 make the service work. Phase 4 makes it a first-class member of the
monorepo: installable, runnable from the start menu, deployable with the stack,
and documented. Until this phase lands, `apps/milpac` is a directory the repo's
own tooling does not know exists — `npm run install:all` does not install it and
`npm start` cannot run it.

#### 4a. Compose

1. Root `docker-compose.yml` gains a `milpac` service, built the same way as the
   other two — `context: .`, `dockerfile: apps/milpac/dockerfile`:
   - **No `ports:` key at all.** Compose puts every service on the same default
     network, so `web` reaches `http://milpac:42070` by service name without
     anything being published to the host. This is the §9 mitigation; do not add
     a port mapping "just for debugging."
   - **No `volumes:` key.** Every other service bind-mounts part of `storage/`;
     this one deliberately does not, because §4 requires it to write nothing to
     disk. An empty `volumes:` list is a signal, not an oversight — say so in a
     comment so nobody "fixes" it later.
   - `env_file: .env` and `restart: unless-stopped`, matching `web` and `bot`.
   - `healthcheck:` against `GET /health`, and `web` gains
     `depends_on: { milpac: { condition: service_healthy } }`.
2. Web gains `MILPAC_SERVICE_URL=http://milpac:42070` and
   `MILPAC_SERVICE_TOKEN`; both documented in `.env.template`, marked shared
   (web reads both, milpac reads the token and its own `PORT`).
3. ~~Rename `apps/milpac/Dockerfile` → `apps/milpac/dockerfile`.~~ **Done in
   Phase 1.** Both existing apps use the lowercase form and the compose
   `dockerfile:` key is case-sensitive on the Linux deploy host, where a
   capitalised name fails the build even though it resolves fine on the Windows
   dev machine. Git on Windows records a case-only rename only via a two-step
   `git mv` through a temporary name.

Note that `apps/milpac/docker-compose.yml` needs no deletion here — Phase 0
already moved it to `storage/milpac-design-source/`, so it never entered git
history.

#### 4b. Workspace registration — **done in Phase 1**

`apps/milpac` was invisible to the root install, so this had to happen before
its dependencies could be installed or its code typechecked. Registered as an
npm workspace alongside `apps/bot`:

```jsonc
// package.json
"workspaces": ["apps/bot", "apps/milpac"]
```

Workspace, not `--prefix`. `apps/web` is installed separately by `install:all`
because Next's dependency tree does not tolerate hoisting; a small express
service has no such constraint, and being a workspace means the root
`npm install` already inside `install:all` picks it up with **no change to the
`install:all` script itself**.

The package was also renamed from `milpac-image` to `milpac`, and its stale
`package-lock.json` deleted — workspace dependencies resolve against the root
lockfile, and a second lockfile in the workspace only drifts.

Phase 4c's menu items invoke `dev` and `start` by name; both exist. There is no
`build` — see the Phase 1 deviations.

#### 4c. Start menu

`scripts/start.mjs` gains milpac in three of its item lists. `MILPAC_PORT` is
read from `ENV` next to the existing `WEB_PORT` constant so the `port:` field
below shows the real port in the live header.

| List | Item | Command |
|---|---|---|
| `RUN_ITEMS` | `🎖️ MilPac` | `npm run dev --workspace=apps/milpac`, `port: MILPAC_PORT` |
| `RUN_ITEMS` | `🔀 Both` → **`🔀 All`** | add the same command as a third entry |
| `PRODUCTION_ITEMS` | `🚀 Start MilPac` | `npm run start --workspace=apps/milpac`, `port: MILPAC_PORT` |

No "Build MilPac" item — this app has no build step, matching `apps/bot`. See
the Phase 1 deviations.

The `🔀 Both` item's label no longer describes what it runs once there are three
apps; rename it and keep it as the "everything at once" entry rather than adding
a fourth permutation. `runItem`'s existing multi-command handling, `taskkill /T`
tree-kill and Esc/Ctrl-C/R keybinds all work unchanged for a third child — no
change to `watchControlKeys`, `runOnce` or `killTree`.

**Do not add a MilPac line to the banner's status block.** The three existing
lines (Database, Discord Bot, TeamSpeak) all report services that are reachable
regardless of what is running on this machine — that is why `checkDiscord` hits
Discord's REST API rather than looking for a local bot process. MilPac is the
first service that is deliberately *unreachable*: in production it has no
published port by design, so a host-side probe would sit permanently red and
train the reader to ignore a red status line. The `port:` field on the menu items
above already surfaces it in the live "Running • PID • Port" header whenever it
is actually running locally, which is the only case a host-side check could ever
report honestly.

#### 4d. Documentation

1. Write `apps/milpac/CLAUDE.md` per monorepo convention.
2. Update root `CLAUDE.md`: three apps rather than two, the shared-`.env` and
   `storage/` sections both need milpac added (noting it reads neither Mongo nor
   `storage/`), and the start-menu paragraph should mention the third app.
3. Update `apps/web/docs/map/` for every changed route and lib file.
4. Update `storage/README.md` for `milpac-design-source/`.
5. Update `.env.template` — see 4a.2.

---

## 7. Decisions

All five are settled. Nothing in this plan is blocked on a further answer.

| # | Decision | Resolution |
|---|---|---|
| 1 | Fulcrum's commit email | **`crackedpotato007@users.noreply.github.com`**, ID-prefixed. Actioned in Phase 0; see §6. |
| 2 | UnitCommander push | **Dropped entirely.** `/update`, `src/utility/get-uc-id.ts` and `src/utility/update-uc-uniform.ts` are deleted in Phase 1 and not reimplemented anywhere. Uniforms live on the site only; nothing is pushed to UnitCommander. This resolves §9 finding 7 by deletion — the code carrying the unvalidated interpolation ceases to exist, and no `UC_API_KEY` is needed by either app. |
| 3 | Corps-specific rank insignia | **Render the corps-specific artwork where it exists** — `TPRL/S/SL`, `SAPL/S/SL`, `GNRL/S/SL` and `GMP/S/G/D` each draw their own PNG. This is what §3's "the fix is deletion" implies: the service does no rank rewriting at all, so the rank code web sends is the file it draws. Corps identity now shows in the rank as well as the corps badge. **Qualified by the §10 audit:** base and `P` tiers of every corps have no artwork and keep the rifleman-badge treatment, and **signallers have no artwork at any tier** — see decision 3a. |
| 3a | Signaller ranks | **Map to the `PTE*` tier equivalents**, done web-side: `SIGL→PTEL`, `SIGS→PTES`, `SIGSL→PTESL`, `SIG`/`SIGP`→rifleman badge. No `SIG*` artwork exists, so this is the only mapping that draws anything. Signallers show generic tier insignia plus their Pronto corps badge, exactly as under Fulcrum's original. The service is unaffected — it still draws precisely the code it is handed. |
| 3b | Duplicate `FLT` / `SQLD` artwork | **The `Airforce*` folders are authoritative.** `imge/Rank/FLT.png` and `imge/Rank/SQLD.png` are deleted; `AirforcePilot/FLT.png` and `AirforceOfficer/SQLD.png` are kept. See §10 — the two pairs are genuinely different images, and which one rendered was decided by glob order. |
| 3c | Base `GM` rank | **Reuse `GM(P)` art** — `GM → GMP.png`. The only Game Master tier without artwork. Base and Proficient look identical on the uniform as a consequence; accepted in preference to a blank rank slot. |
| 3d | `imge/Rank/` root | **Retired entirely**, extending 3b consistently: `GPCAPT → AirforceOfficer/GCPT.png` and `WGCO → AirforceOfficer/WGCDR.png` rather than the loose `Rank/GPCPT.png` and `Rank/WGCO.png`. Only `Pip.png` remains in the root, and it is not a rank. See §10. |
| 4 | Medal box layering and centring | **The original on both counts** — draw right-to-left so the *leftmost* medal overlaps its neighbour, and centre with `n*step`, ignoring medal width. The web port's left-to-right order and `(n-1)*step + width` centring are the regression, not the improvement. |
| 5 | Fate of existing rendered output | **Keep for Phase 2, then discard.** The 614 images (343 certificates, 184 uniforms, 87 boxes) stay on disk as visual references while the canvas certificate renderer is transcribed, and are deleted once Phase 2 passes review. They are gitignored throughout, so this never touches the repository. Phase 2 records the deletion as an explicit step so they don't linger on the bind mount. |

### Consequences worth carrying forward

Decision 2 removes `UC_API_KEY` from the picture for both apps. The rotation
note at the end of §6 Phase 0 still stands — the key sat in a file alongside a
compromised credential and should be rotated regardless — but nothing in the new
architecture consumes it, so rotation is cleanup rather than a prerequisite.

Decision 3 is the reason §3's regex deletion is a behaviour change rather than a
pure bug fix. Members whose rank codes are corps-specific have never had their
own insignia rendered by *either* implementation, so the first correct render
will look different from what the unit is used to. That is intended.

---

## 8. Risks

**Certificate fidelity.** 158 slides transcribed by hand is the largest source of
error in this plan. Mitigated by the diff-against-reference step in Phase 2, and
by the templates staying in-repo so the comparison can be re-run later.

**Silent asset drift.** Consolidating to one asset tree means a missing file
breaks rendering everywhere at once instead of in one app. Mitigated by the
boot-time preflight, which turns a silent wrong-looking uniform into a startup
failure naming the missing file.

**Rollback.** Phase 3 deletes web's renderer. Until Phase 2 has passed review,
web keeps its existing path — the deletion is the last step, not the first.

---

## 9. Security findings in the imported code

An automated security review of `src/server.ts` flagged five issues. All are
genuine, all pre-date this work, and all are in code that Phase 1 deletes. They
are recorded here so the Phase 1 rewrite can be checked against them rather than
rediscovering them.

> **The imported application must never be deployed as-is.** Every finding below
> is live in Fulcrum's original code. Fulcrum's `docker-compose.yml` publishes
> port 42070 with `app.use(cors())` and no authentication on any generation
> endpoint — bringing that stack up exposes an unauthenticated image generator
> with a Mongo connection. Phase 0 moved it out of the app to
> `storage/milpac-design-source/`, so it is not in git history and cannot be
> brought up by accident from a clone. Do not run the copy that is there.
>
> Findings 2 and 3 **compound**: the three write sites interpolate a
> client-controlled `name` into a filesystem path, and none of the routes
> reaching them check authentication. Together that is unauthenticated remote
> arbitrary file write, not three independent medium-severity issues. Treat the
> published port as the whole vulnerability — closing it closes all of them.

| # | Severity | Finding | Eliminated by |
|---|---|---|---|
| 1 | Critical | `/register` gates on `req.headers.host`, a client-controlled value. Anyone can send `Host: localhost` and create an account. | Phase 1 — registration, passport, and the entire session layer are removed; the service becomes stateless with bearer-token auth. |
| 2 | High | **Path traversal at three separate write sites**, each interpolating client-controlled `data.name` into a filesystem path: `server.ts` (`../certificates/${data.name} - ${data.cert}.png`), `index.ts:323` (`__dirname + "/../milpac/" + data.name + ".png"`), and `box.ts:86` (`../medal-box-images/boxes/${data.name}.png`). A `../` in `name` escapes the directory. | Phase 1 — the service writes **nothing** to disk. Filenames are constructed web-side from `user.id` (a Discord snowflake), never from client input. |
| 3 | High | `/update`, `/create-cert`, `/generate-box`, `/data`, `/get-medals` and `/cert-poll` have no authorization check at all — only the HTML page routes call `req.isAuthenticated()`. | Phase 1 — bearer-token middleware on every route, container on the internal Docker network with no published port. |
| 4 | High | `/data` passes `req.headers.name` directly into `findOne({ name: … })`. A non-string header value becomes a query operator. | Phase 1 — `/data` and mongoose are both removed; the service holds no database connection. |
| 5 | Medium | Generation failures return `JSON.stringify(err, Object.getOwnPropertyNames(err))` to the client, leaking stack traces and absolute filesystem paths. | Phase 1 — see the error-handling rule below. |
| 6 | Medium | The session cookie sets only `maxAge` — no `httpOnly`, no `secure`, no `sameSite` — and no CSRF protection guards the state-changing routes. | Phase 1 — `express-session`, `connect-mongo` and `passport` are all removed. A stateless bearer-token service issues no cookies, so neither cookie flags nor CSRF apply. |
| 7 | High | `utility/get-uc-id.ts` interpolates `discordID` straight into the UnitCommander API URL with no validation, and `update-uc-uniform.ts` does the same with `ucID`. A crafted value manipulates the request path against a third-party API carrying our bot credential. | Phase 1 — §7 decision #2 drops the UnitCommander push entirely. Both files are deleted and the feature is not reimplemented on the web side, so the interpolation has nowhere to move to. |

**Finding 7 was the one finding that did not resolve itself,** because §7
decision #2 originally proposed moving the UnitCommander push to the website
rather than deleting it — which would have carried a live SSRF into the app
holding far more sensitive credentials than this service does. The unit has
since decided to drop the feature outright, so the finding closes by deletion.

If that decision is ever revisited, this is the constraint that comes back with
it: validate `discordID` against `/^\d{17,20}$/` (a Discord snowflake) and
`ucID` against the identifier format UnitCommander actually returns, rejecting
anything else *before* composing the URL, and build the URL with `new URL()` or
axios path params rather than string concatenation. Do not resurrect either file
as-is.

A sixth, not flagged by the review but noted during the audit: `cert.ts:202`
builds a shell command by string interpolation and runs it through `execSync`.
The interpolated values are currently server-derived rather than client-derived,
so it is not presently exploitable, but it is one refactor away from being so.
Phase 2 removes the shell invocation entirely.

**Rules the Phase 1 rewrite must satisfy**, each traceable to a finding above:

1. Every route requires `Authorization: Bearer ${MILPAC_SERVICE_TOKEN}`, checked
   by shared middleware rather than per-route. No route opts out except
   `/health`.
2. The service performs **no filesystem writes**. Responses are bytes.
3. All request bodies are parsed through zod. Rejections return `400` with the
   offending field name only.
4. **No error object is ever serialised into a response.** Failures return a
   generic message plus a correlation id; the detail goes to the server log.
   `res.send(JSON.stringify(err, …))` must not reappear.
5. No route reads identity or authorization from a request header other than
   `Authorization` — not `Host`, not a custom `name` header.
6. `cors()` is either removed or given an explicit origin allowlist. The service
   is called server-to-server; no browser origin needs access.

---

## 10. Rank asset audit

Measured 2026-08-16 against **`apps/web/lib/military/ranks.ts`** — the
authoritative rank list, 99 ranks across 19 groups — and every `.png` under
`imge/Rank/` (109 files, 107 unique basenames).
`apps/web/public/milpac-assets/imge/Rank/` was compared file-for-file and is
identical, so every finding applies to both apps.

> An earlier version of this section audited against the `Rank` type union in
> Fulcrum's `src/types.ts`. That was the wrong reference and its conclusions
> were wrong in both directions — it reported live ranks as orphaned art and
> orphaned art as live ranks. Web's rank list is authoritative; Fulcrum's union
> is a snapshot of a rank structure the unit has since changed. Reproduce this
> audit with `scripts/` tooling against `ranks.ts`, never against the union.

### The lookup is by name coincidence, and it mostly misses

Ranks are stored on `user.milpac.currentRank` in web's display form — `PTE(S)`,
`B/SGT`, `RSM-A`, `LT(C)`. `normaliseRank` in `lib/milpac-gen/data-mapper.ts`
strips **parentheses only**, and the result is used directly as a filename. So
slashes, hyphens, and any rank whose art is filed under a differently-ordered
abbreviation all miss silently.

Of 99 ranks, 3 intentionally have no insignia (`REC`, `PTE`, `PTE(P)` — the
rifleman badge carries these), **72 match an asset by name**, and **24 do not**.
The 72 is an upper bound on what renders: §3's regexes then destroy `GM*` and
the corps `L`/`S`/`SL` tiers at runtime, so live output is worse still.

### 12 ranks whose art exists under a different filename

Nothing is missing here — the file is present and the renderer asks for a name
nobody filed it under.

| Rank | Looks for | Art is actually | Cause |
|---|---|---|---|
| `LBDR(S)` | `LBDRS.png` | `LBDR/LDBRS.png` | transposed letters |
| `B/SGT` | `B/SGT.png` | `SGT/BSGT.png` | slash survives normalisation |
| `T/SGM` | `T/SGM.png` | `SGT/TSGM.png` | slash survives normalisation |
| `RSM-A` | `RSM-A.png` | `WO/RSMA.png` | hyphen survives normalisation |
| `LT(S)` | `LTS.png` | `Officer/SLT.png` | art uses prefix form (Senior LT) |
| `LT(C)` | `LTC.png` | `Officer/CLT.png` | art uses prefix form (Commanding LT) |
| `LM(S)` | `LMS.png` | `AirforceGround/SLM.png` | art uses prefix form |
| `FLT(S)` | `FLTS.png` | `AirforcePilot/SFLT.png` | art uses prefix form |
| `OFFCDT` | `OFFCDT.png` | `AirforcePilot/HOCDT.png` | different abbreviation |
| `AM` | `AM.png` | `AirforceCommand/HAM.png` | different abbreviation |
| `GPCAPT` | `GPCAPT.png` | `AirforceOfficer/GCPT.png` | different abbreviation |
| `CA` | `CA.png` | `Command/COA.png` | different abbreviation |

The last four were inferred from rank group and name rather than proven —
`COA` for Chief of ASOT, `HAM` for Air Marshal, `HOCDT` for Aviation Officer
Cadet, `GCPT` for Group Captain. **All four are now confirmed** by rendering
each insignia beside its neighbours in the same seniority ladder:

- `COA` carries the most elaborate insignia in the Command ladder
  (MAJGEN → LTGEN → GEN → COA), consistent with Chief of ASOT.
- `HAM` sits third by stripe count in COM → AVM → HAM → ACM → SACM, which is
  exactly where `ranks.ts` puts Air Marshal.
- `HOCDT` is plain boards with no rank stripes — a cadet, and the most junior
  rank in the pilot ladder, matching Aviation Officer Cadet.
- `GCPT` carries the most stripes in the HOTEL Officer ladder, where
  `ranks.ts` puts Group Captain last.

The same sheet confirms decision 3d: `WGCDR` sits between `WGCP` and `GCPT`,
which is where `ranks.ts` puts Wing Commander.

**Do not fix this by renaming files.** An earlier draft proposed that; it is
wrong, because the mismatch is not a typo in most cases — `SLT` and `CLT` are
correctly-named art for a rank the unit now writes as `LT(S)` and `LT(C)`, and
renaming would destroy the only record of the older naming. Phase 1 introduces
an explicit `RANK_TO_ASSET` map instead, defaulting to the identity mapping and
listing only the exceptions above. Explicit beats coincidence, and the map is
the thing the boot-time preflight validates.

### 12 ranks have no artwork at all

| Group | Ranks | Resolution |
|---|---|---|
| Corps base and `P` tiers | `SAP`, `SAP(P)`, `GNR`, `GNR(P)`, `TPR`, `TPR(P)` | **Forced** — only the `L`/`S`/`SL` tiers of each corps were ever drawn. These keep the rifleman-badge treatment exactly as `PTE`/`PTE(P)` do. Not a decision; there is no file. |
| All signallers | `SIG`, `SIG(P)`, `SIG(L)`, `SIG(S)`, `SIG(SL)` | **Decision 3a** — map to the `PTE*` tier equivalents web-side. |
| Base Game Master | `GM` | **Decision 3c** — reuse `GM(P)` art, so `GM → GMP.png`. Base and Proficient are visually identical as a result; that is accepted rather than leaving base GM blank. |

### `imge/Rank/` root is a superseded generation

The root of `imge/Rank/` holds five loose files — `FLT`, `SQLD`, `GPCPT`,
`WGCO`, `Pip` — that sit outside the per-branch `Airforce*/` folders every other
airforce rank lives in. Two of them, `FLT` and `SQLD`, **collide with different
artwork** of the same name in `AirforcePilot/` and `AirforceOfficer/`:

| Code | `Rank/` | `Airforce*/` |
|---|---|---|
| `FLT` | 138,187 bytes | 106,418 bytes (`AirforcePilot/`) |
| `SQLD` | 142,114 bytes | 121,589 bytes (`AirforceOfficer/`) |

Both renderers glob flat and match on basename, taking whichever the glob
returns first — so which artwork rendered was incidental and could differ
between platforms.

**Decision 3b resolves this in favour of the `Airforce*` folders**, and applying
that rule consistently retires the entire `Rank/` root: `FLT` and `SQLD` to the
`Airforce*` copies, `GPCPT` superseded by `AirforceOfficer/GCPT.png`, `WGCO`
superseded by `AirforceOfficer/WGCDR.png`, leaving only `Pip.png` — a 2,458-byte
UI fragment that is not a rank at all. That every single loose file resolves
away is the strongest evidence the rule is correct.

This is also the clearest argument for the boot-time preflight in §4: a
duplicate basename is not a missing asset, so no amount of "does the file exist"
checking catches it. **The preflight must assert uniqueness as well as
presence.**

### 35 of 109 files are unreachable from web's rank list

The large majority are the **Victor variants** — `CPLV*`, `LCPLV*`, `SGTV`,
`SSGTV`, `SAMV`, `SSAMV`, `PSMV`, `LTV`, `SLTV`, `CLTV`, `OCDTV`, `2LTV` — 19
files for a `V`-suffixed rank structure web no longer has. The rest are the
mismatch targets above (which stop being orphans once `RANK_TO_ASSET` lands),
the retired `Rank/` root, and `PTSG.png`, which **is** live — `PTSG` is
Platoon Technician Sergeant in web's SNCO group and matches by name today.

Nothing is deleted in Phase 1 except the two colliding `Rank/` files that
actively cause wrong output. The rest cost nothing, are already in git history,
and the Victor art in particular may be wanted again if the rank structure
changes back. The preflight reports them as unreferenced rather than failing.

---

## 11. The certificate pipeline, recovered

Phase 1 deleted `src/cert.ts` and `src/server.ts`, which between them held the
only record of how certificates were produced and which slide belonged to which
rank or award. Both were recovered from commit `4e6bd956` and are documented
here so Phase 2 does not have to re-derive them.

### How the original worked

1. `sanitize_certificate` normalised the award or rank into a `cert` code and
   stamped the signatory from `SIGNATURER*` environment variables.
2. `cert.ts` loaded **one of two templates**, chosen by `data.type`:
   `promotion` → `Bulk Template.pptx` (116 slides), anything else →
   `awards.pptx` (42 slides).
3. docxtemplater filled `{name}`, `{date}`, `{signaturer}` and friends across
   **every slide in the template**, and wrote the result to a single shared
   `output.pptx` at the app root.
4. LibreOffice converted that whole file to PDF.
5. ImageMagick extracted one page:
   `convert -density 100 <pdf>[N] output.png`, where `N` is the slide number
   minus one.

Steps 3–5 are why a certificate took 3–6 seconds, why two concurrent requests
clobbered each other (one shared `output.pptx`), and why §9's `execSync` note
matters. Rendering 158 slides to extract one is the whole cost.

### The slide mapping — recovered to `assets/templates/slide-map.json`

The original `SlideNumbers` object held **159 entries in one flat map**, with the
template disambiguated only by `data.type` at the call site. Ranks had quoted
string values and awards had bare numeric ones, which is the only textual clue
that they index different files.

| Type | Template | Codes | Distinct slides |
|---|---|---|---|
| `promotion` | `Bulk Template.pptx` | 117 | 116 |
| `award` | `awards.pptx` | 42 | 42 |

117 codes over 116 slides because **`PSM` and `PTSG` share slide 57** — the same
`PTSG → PSM` equivalence §3 records as dropped during the web port. It was
deliberate here.

### Slide geometry

Slides are `8280400 × 11268075` EMU (914400 EMU per inch, so ~9.06 × 12.32
inches, portrait). Text lives in `<p:sp>` shapes carrying
`<a:xfrm><a:off x y/><a:ext cx cy/></a:xfrm>`; each `<a:p>` has an alignment on
`<a:pPr algn>`, and each `<a:r>` run carries `sz` (hundredths of a point), `b`,
`i`, an `<a:srgbClr>` fill and a `<a:latin typeface>`.

Placeholders are routinely **split across runs** — `{dateNumber}` appears as
three separate `<a:t>` elements, `{`, `dateNumber`, `}` — so the extractor has to
reassemble runs before matching placeholders, and take formatting from the first
run of each.

### Two problems Phase 2 must resolve

**1. Identify which art file is which layer.** An earlier draft of this section
claimed the runtime art "does not match the slide geometry" and called for a
visual decision. That was wrong, and the answer was already on disk: the 343
reference renders §7 decision #5 keeps are the finished article. Measured, they
are **906 × 1232** — aspect 0.7354 against the slides' 0.7348, an exact match.
So the slide geometry maps to the output directly, and the EMU → pixel scale is
simply `906 / 8280400`.

What a reference render shows, outermost first:

1. A **portrait wooden frame** around the whole certificate.
2. A **parchment field** inside it.
3. **Gold decorative scrollwork** insetting each corner and edge.
4. The **Rising Sun badge**, centred at the top.
5. **Text** — a blackletter title (`fonts/OLDENGL.TTF`), a Times New Roman body,
   and a Brush Script signature (`fonts/brushsci.ttf`) over a ruled line.
6. A **red wax seal**, bottom left.

All three bundled fonts are therefore in use, which is why `assets/fonts/` has
to ship. The remaining Phase 2 task is mapping each of those layers onto a file,
which is not obvious from names and dimensions alone:

| File | Size | Orientation |
|---|---|---|

| File | Size | Orientation |
|---|---|---|
| `Background.jpg` | 612 × 359 | landscape |
| `Frame.png` | 1843 × 1306 | landscape |
| `WaxSealGold.png` | 880 × 768 | — |
| `logo.png` | 528 × 546 | — |
| `1011-10110075_decorative-frame-border…png` | 5250 × 7849 | **portrait** |

**Resolved by opening them.** The filenames are actively misleading and the §4
sketch's layer list is wrong in three ways. The actual mapping:

| Layer | File | Notes |
|---|---|---|
| 1. Wooden frame | `Frame.png` | Stretched to fill the canvas. Landscape at 1843 × 1306, but it is a plain rectangular moulding whose grain runs along each edge, so it survives being stretched to portrait. Neither output aspect matches it exactly, so it is stretched in *both* orientations regardless — no rotation. |
| 2. Parchment field | `Background.jpg` | A 612 × 359 *texture* — aged paper with a very faint Australian flag — stretched to fill inside the frame. Its own dimensions are irrelevant. |
| 3. Gold scrollwork | `1011-10110075_decorative-frame-border…png` | 5250 × 7849 portrait, and the only art that already matches the promotion aspect. |
| 4. Rising Sun badge | **`Untitled2.png`** | The "THE AUSTRALIAN ARMY" rising sun, centred at the top. **Not `logo.png`.** |
| 5. Text | — | Blackletter title, Times body, Brush Script signature over a ruled line. |
| 6. Wax seal | `WaxSealGold.png` | Red wax with a gold unit emblem, bottom left, despite the "Gold" in the name. |

`logo.png` (528 × 546) is the unit emblem as a grey-and-red roundel. It does
**not** appear on a promotion certificate — the emblem there is the gold one
embossed into `WaxSealGold.png` — but it **is** used on awards, bottom left,
opposite the wax seal. Confirmed against a rendered award reference.

None of this matters at runtime any more: the renderer draws the artwork
unpacked from `ppt/media/` rather than these loose files, so each layer is
whatever the slide says it is. The table above is a reading aid, not a
dependency.

So the §4 sketch — `Background.jpg` → `Frame.png` → text → `WaxSealGold.png` →
`logo.png` — has the frame *under* the parchment rather than outside it, names
`logo.png` as a layer it is not, and omits the scrollwork and the Rising Sun
entirely. **Treat the reference renders as the specification and that list as a
first guess.**

**2. Award certificate codes are a different namespace from ribbon citation
codes.** Five differ outright:

| Certificate code | Citation code |
|---|---|
| `longterm` | `4year` |
| `valour` | `crossofvalour` |
| `founder` | `founders` |
| `rotary` | `aviation` |
| `courage` | `starofcourage` |

`sanitize_certificate` derived its code by lowercasing the award label and
stripping spaces, which produces the *citation* spelling — `starofcourage`, not
`courage`. Those five never matched a slide, so `SlideNumbers[cert]` returned
undefined and the page index became `NaN`. **Certificates for those five awards
cannot have worked.** Phase 2 needs an explicit certificate-code map rather than
a lowercase-and-strip heuristic, and it belongs next to the other award mapping
in `lib/maps.ts` since web will be choosing the code.

### Phase 2 status — renderer verified against both formats

Both certificate formats now match their reference renders.

- **Promotions** (906 × 1233, portrait). `RETURN` reproduces the frame,
  parchment, scrollwork, Rising Sun, wax seal, every text block, and the
  superscript date.
- **Awards** (1535 × 925, landscape). `1year` reproduces the frame, parchment,
  medal art, unit roundel, wax seal and text. Remaining differences are only the
  test data's dates.
- **All 159 certificate codes render without error.**

Three things had to be taken from the slides rather than assumed, each found by
comparing against a reference rather than by reading the spec:

1. **Artwork is placed by the slide.** `<p:pic>` elements *and* `<p:sp>` shapes
   carrying an `<a:blipFill>` are both pictures — the parchment is a shape, not
   a picture — and their `<a:xfrm>` gives exact position and size.
2. **`rot="5400000"` is a 90° rotation.** The parchment and wooden frame are
   landscape images rotated onto the portrait canvas, not stretched onto it.
3. **`<a:srcRect>` crops the frame** by ~10% horizontally and 12.5%/20%
   vertically. `Frame.png` has transparent padding baked in, and that crop is
   what makes the moulding bleed to the edge rather than float inside the
   certificate.

Run `baseline` is also extracted, so `31st` renders with a raised suffix.

### The systematic diff

A raw pixel diff is meaningless here — the references carry real member data and
a fresh render carries test data — so the comparison masks every text rectangle
from the layout and compares only the artwork. Of the 159 codes, **64 have a
reference**; the other 95 are certificates the unit has never issued.

| Metric | Result |
|---|---|
| Mean art difference | **2.07%** |
| Under 2% | 17 |
| 2–5% | 46 |
| Over 5% | 1 |

There is a ~2.5% floor across the whole set that is not a placement error: the
render is 906 × 1233 against the references' 906 × 1232, so everything sits a
sub-pixel out vertically, and antialiasing differs between a canvas rasteriser
and Ghostscript. High-contrast artwork amplifies it.

The single outlier, `FLL` at 6.77%, was checked visually and is **correct** —
its rank insignia is a large, dark, high-contrast image, which is exactly the
content that turns a sub-pixel offset into a large pixel count. Frame,
parchment, scrollwork, insignia, seal and text all match.

### Remaining Phase 2 work

1. **Fix the five award codes** §11 records as never having resolved —
   `longterm`, `valour`, `founder`, `rotary`, `courage`. The map belongs in
   `lib/maps.ts`, because web chooses the code and the service only draws what
   it is handed. This is really Phase 3 work.
2. **Delete the 614 legacy renders** (§7 decision #5) — *after* someone reviews
   the output, not before. They are the only reference for the 95 codes that
   have never been issued, so deleting them early forecloses ever checking
   those. They are gitignored, so they cost nothing to keep meanwhile.

---

## 12. What is left

Nothing in §6 remains. Everything below is either outside this repository or a
judgement call for the unit.

### Worth doing before this merges

**Fill in the back catalogue.** Every award and promotion filed before
`issuedByRank` existed names no issuing officer, so all of them fall back to the
unit signatory. Nothing is broken by that; it just means historical certificates
are signed by the current OC rather than the officer who actually issued them.

### Decision 6 — who signs a certificate

The templates print `{signaturerRankShort} {signaturer}` above a static
"Officer Commanding / Australian Special Operations Taskforce HQ" line, so the
payload supplies a name and a rank in two forms.

**A certificate is signed by the officer who issued it**, taken from that
award's or promotion's own `issuedByName` + `issuedByRank` in the member's
milpac. `MILPAC_SIGNATORY_NAME`, `_RANK_SHORT` and `_RANK_FULL` — seeded from a
reference render as `Six` / `MAJGEN` / `Major General` — **have been removed**.

The fallback, for records that name nobody, is whoever currently holds a
nominated ORBAT position, chosen in the dashboard under **J4 → Website Settings
→ Certificates** and resolved at render time. Storing the *position* rather than
the person means a change of command needs no edit anywhere. Left unset it
guesses: the first occupied India Company HQ slot whose role matches
"Officer/Commanding", else the first occupied CHQ slot. It deliberately does not
use `isSenior`, which `lib/orbat` documents as set only during mass-import and
not maintained by the ORBAT editor.

Why per-record rather than always the current OC: an officer's rank moves.
Resolving live would reprint a 2021 certificate with the issuer's 2026 rank,
quietly rewriting a historical record every time someone opened it. Storing the
rank on the award freezes it at issue, which is what a certificate is *for*.

`issuedByRank` holds the **full rank name**, matching `promotions[].rank` and
the editor's `RankSelect` value contract — not the abbreviation that
`milpac.currentRank` uses. The short form is derived with `rankAbbrFromName`
rather than stored twice, so the two cannot drift.

A record with a name but no rank falls back to the unit signatory rather than
printing an empty rank next to a real name.

**The member's own name carries their rank too** — `{name}` renders as
"MAJ Thomas", not "Thomas". For an award that is the rank held on the award's
date, derived from the promotion history (the most recent promotion dated on or
before it), falling back to the current rank when no promotion date parses. For
a promotion certificate it is the rank being granted, since that is what the
certificate announces.

### The signature rule

The line under the signature is a `<p:cxnSp>` connector, not a `<p:sp>`, and the
first extractor pass walked only `sp` and `pic` — so all 159 certificates
rendered with the signature floating over nothing. `<p:cxnSp>` is now a third
element kind (`line`), carrying the stroke width and colour from its `<a:ln>`.
A `straightConnector1` runs corner to corner of its frame, so the rule is a box
a few EMU tall and `flipV` is the only part of the transform that changes
anything for it.

The extractor's summary line now counts line elements alongside text and
pictures, so losing them again is visible at a glance: expect one per
certificate.

### Deliberately deferred

**`PERMISSIONS.pages.admin` and `members.editStandard` are still legacy
Discord-role gates.** Phase 3 called for migrating the first, and that migration
was made and then **reverted**: neither key has actually migrated,
`hasPermission` does not fall back to Discord role names, and it does not carry
`hasRoles`' hardcoded `J4-Administration` bypass — so converting a single route
would have locked it to the `OVERRIDE` list alone. Both keys should migrate
everywhere at once, as a permission-system task rather than a milpac one.
`tests/milpac.spec.ts` pins the current behaviour so a partial migration fails
loudly.

**The MongoDB Atlas credential.** Recorded in §6 Phase 0; the unit has chosen
not to action it here. `UC_API_KEY` is unused either way — decision #2 dropped
the UnitCommander integration entirely.

**`apps/bot` does not consume `@asot/lib`.** Its `config/ranks.json` is a
one-entry stub, so there is nothing to migrate yet. See `lib/README.md`.

### Test coverage as it stands

35 unit tests in `apps/milpac` (`npm test --workspace=apps/milpac`) covering rank
resolution, the ribbon cascade, the asset preflight and the generated
certificate layouts. 18 Playwright specs in `apps/web/tests/milpac.spec.ts`
covering who can reach each endpoint, the certificate entitlement check, and the
dashboard status probe.

Two pre-existing flakes elsewhere in the E2E suite — `backups.spec.ts` and
`devmode.spec.ts` — pass on retry and are unrelated to this work.
