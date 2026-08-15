# MilPac Generator — Import & Overhaul Plan

**Status:** Phase 0 complete. Phases 1–4 not started.
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
| `b422195d` | Koda | This document. |

Phase 0 is done — the import is committed, secrets are redacted, and the
excluded files are preserved in `storage/milpac-design-source/`. See the table
at the top of §6 for exactly what was moved, deleted, and redacted.

**Do not start Phase 1 by editing `src/server.ts` in place.** The imported code
is an archive of Fulcrum's work, kept for attribution. Phase 1 is a rewrite
against the §4 layout, not a refactor of what is there.

**Three decisions in §7 block implementation and are still unanswered.** #2
(UnitCommander push) blocks Phase 3; #3 (corps-specific rank insignia) and #4
(medal box layering and centring) block finalising the renderer in Phase 1. They
need a person from the unit, not a technical judgement — ask before building
past them.

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

All of the corresponding `.png` files exist in
`public/milpac-assets/imge/Rank/` and none of them can currently render. The
`PTSG → PSM` mapping was also dropped in the port, though `PTSG.png` exists.

**The fix is deletion, not repair.** Under the new architecture the service does
no rank rewriting whatsoever — web's `buildUniformData` emits the final rank
code and the service renders it. The offending regexes go away entirely.

Two smaller divergences to resolve during the overhaul:

- **Medal box draw order is reversed.** The original drew right-to-left so the
  leftmost medal overlapped its neighbour; the web port draws left-to-right so
  the rightmost does. Different layering, visibly different output.
- **Medal box centring differs.** The web port accounts for medal width in the
  centring maths (`(n-1)*step + width`); the original did not (`n*step`). Neither
  has been confirmed correct against what the unit expects.

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

### Phase 2 — Canvas certificate renderer

1. Parse `ppt/slides/slideN.xml` out of both templates (they are zip archives) to
   extract text content, positions, and font sizes per slide.
2. Emit `certificate-layouts.json` keyed by cert code.
3. Implement `render/certificate.ts`: `Background.jpg` → `Frame.png` → text →
   `WaxSealGold.png` → `logo.png`.
4. Render all 158 and diff against pptx-produced references. Nothing replaces the
   old pipeline until this passes review.

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
6. Once verified: delete `lib/milpac-gen/uniform.ts`, `lib/milpac-gen/box.ts`,
   and `public/milpac-assets/`. Keep `data-mapper.ts` and `maps.ts`.

### Phase 4 — Compose and documentation

1. Root `docker-compose.yml` gains a `milpac` service: internal network only, no
   published ports, healthcheck against `/health`.
2. Web gains `MILPAC_SERVICE_URL=http://milpac:42070` and
   `MILPAC_SERVICE_TOKEN`; both documented in `.env.template`.
3. Delete `apps/milpac/docker-compose.yml` (superseded by the root stack).
4. Write `apps/milpac/CLAUDE.md`.
5. Update root `CLAUDE.md` — the monorepo has three apps now, not two.
6. Update `apps/web/docs/map/` for every changed route and lib file.
7. Update `storage/README.md` for `milpac-design-source/`.

---

## 7. Open decisions

| # | Decision | Notes |
|---|---|---|
| 1 | Fulcrum's commit email | Defaulting to `crackedpotato007@users.noreply.github.com`, which attributes correctly on GitHub without exposing a personal address. Override if he'd prefer his real one. |
| 2 | UnitCommander push | `/update` currently POSTs the finished uniform to UC as a profile background. Recommendation: keep the feature, but on the **web** side — web owns the member data and the UC ID lookup, and the service stays a pure renderer with no outbound credentials. **If you action this, read §9 finding 7 first** — `get-uc-id.ts` and `update-uc-uniform.ts` interpolate unvalidated identifiers into the UC API URL, and porting them as-is would carry that flaw into the website. |
| 3 | Corps-specific rank insignia | `TPRL/TPRS/TPRSL`, `SAPL/SAPS/SAPSL`, `GNRL/GNRS/GNRSL` assets exist, but **neither** implementation renders them — Fulcrum's substring replace mapped them onto the `PTE*` equivalents, and the web port blanks them entirely. Needs a unit decision: should corps-specific insignia render, or is the `PTE*` family intentional? |
| 4 | Medal box layering and centring | See §3. Needs a visual decision on which is correct before the renderer is finalised. |
| 5 | Fate of existing rendered output | `certificates/`, `milpac/` and `medal-box-images/boxes/` hold **614** rendered member images (343 + 184 + 87). Gitignored, so not a repo concern — but confirm whether they should be preserved to `storage/` or discarded. |

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
> is live in Fulcrum's original code. `apps/milpac/docker-compose.yml` publishes
> port 42070 with `app.use(cors())` and no authentication on any generation
> endpoint — bringing that stack up exposes an unauthenticated image generator
> with a Mongo connection. It is retained in the import for attribution only and
> is deleted in Phase 4. Do not run it.
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
| 7 | High | `utility/get-uc-id.ts` interpolates `discordID` straight into the UnitCommander API URL with no validation, and `update-uc-uniform.ts` does the same with `ucID`. A crafted value manipulates the request path against a third-party API carrying our bot credential. | **Not automatically resolved — see below.** |

**Finding 7 is tied to open decision #2 and must not be lost.** The two files it
concerns are the UnitCommander integration, and §7 decision #2 proposes moving
that feature to the **web** side rather than deleting it. If it moves, the
unvalidated interpolation moves with it unless someone stops it. Whoever
implements decision #2 must validate `discordID` against `/^\d{17,20}$/` (a
Discord snowflake) and `ucID` against the identifier format UnitCommander
actually returns, rejecting anything else *before* composing the URL — and build
the URL with `new URL()` or axios path params rather than string concatenation.
Porting these two files across as-is would carry a live SSRF into the website,
which holds far more sensitive credentials than this service does.

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
