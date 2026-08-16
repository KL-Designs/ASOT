# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Is

A **stateless image renderer** for the ASOT platform. It composites member uniforms, medal display boxes and certificates from layered artwork and returns PNG bytes over HTTP. See the repo-root `CLAUDE.md` for how it fits the monorepo.

It holds **no database connection, no credentials beyond one shared token, and no session state**, and it **writes nothing to disk**. `apps/web` reads the member data, builds the payload, posts it, and persists the bytes that come back.

**`PLAN.md` is the authority on why this app looks the way it does.** It documents the original it replaces, the bugs that motivated the rewrite, the decisions the unit made, and the asset audits. Read the relevant section before changing behaviour — several things that look like oddities are load-bearing and recorded there.

---

## Commands

```bash
npm run dev              # tsx watch, loads ../../.env via dotenv-cli
npm start                # tsx (production — no build step, runs TS directly)
npm run typecheck        # tsc --noEmit
npm run extract-layouts  # regenerate certificate layouts from the .pptx templates
```

From the repo root: `npm start` → **🎖️ MilPac** (dev) or **🚀 Start MilPac** (prod). This app is an npm workspace, so the root `npm install` installs it.

**No test suite exists.** Verification so far has been by rendering against the reference images in `certificates/` and `milpac/` — see PLAN.md §11.

---

## Architecture

### Why stateless

The mapping from awards, qualifications and ORBAT sections to ribbons and badges depends on web's schema. Duplicating it here is precisely how the two implementations drifted apart before (PLAN.md §3). Keeping it in exactly one place is what prevents a repeat — so this app never learns what a member is, only what to draw.

The practical consequence: **if you find yourself wanting a `MONGO_URI` here, the change belongs in `apps/web` instead.**

### Request flow

```
POST /render/uniform      →  compose ~40 full-canvas PNG layers      →  image/png
POST /render/box          →  compose the medal case                  →  image/png
POST /render/certificate  →  draw art + text from extracted layouts  →  image/png
GET  /fingerprint         →  {fingerprint} — digest of the artwork
GET  /health              →  200 {ok:true}   (the only unauthenticated route)
```

`/fingerprint` exists for one reason: web caches uniform and medal-box renders against a hash of the member's data, which cannot notice new *artwork*. Swap a base uniform PNG and every cached image would be stale forever. Web folds this digest into its cache key, so new art redraws the whole estate. It is path + byte size per asset, plus a `RENDERER_REVISION` constant in `src/assets.ts` — **bump that constant when a drawing change alters output without any asset changing**, or the change will not reach members who already have a cached render. Deliberately not mtime, which every container rebuild resets.

Every route except `/health` requires `Authorization: Bearer ${MILPAC_SERVICE_TOKEN}`, enforced by shared middleware in `src/middleware/auth.ts` — not per route.

### Error contract

Callers depend on these, and `apps/web/lib/milpac-gen/client.ts` surfaces them:

| Status | Meaning |
|---|---|
| `400` | Body failed zod validation. Names the offending field, nothing else. |
| `401` | Missing or wrong bearer token. |
| `422` | Body was valid but named an asset that does not exist. Names the asset. |
| `500` | Generic message plus a `correlationId` matching a server log line. |

**No error object is ever serialised into a response** (PLAN.md §9 rule 4). The original returned `JSON.stringify(err, Object.getOwnPropertyNames(err))`, handing callers stack traces and absolute filesystem paths.

### Source layout

| Path | Role |
|---|---|
| `src/server.ts` | Express bootstrap. Runs the asset preflight *before* opening the port. |
| `src/config.ts` | Env parsing, fail-fast at import. |
| `src/schema.ts` | zod request schemas. |
| `src/assets.ts` | Asset indexing, `RANK_TO_ASSET`, and the boot preflight. |
| `src/errors.ts` | The correlation-id failure response. |
| `src/render/*` | `uniform`, `box`, `certificate`, plus `layers` and `ribbons` helpers. |
| `scripts/extract-certificate-layouts.ts` | Build-time: `.pptx` → `certificate-layouts.json`. |

---

## Things that will bite you

### Assets are validated at boot, and uniqueness matters

`preflight()` asserts every mapped asset exists **and that no basename is ambiguous**. The uniqueness check is not paranoia: `FLT` and `SQLD` existed twice with *different artwork*, and both prior implementations globbed the tree and took whichever match came first, so which one rendered was incidental (PLAN.md §10). A presence check cannot catch that.

If the service refuses to start, it prints every problem at once. `MILPAC_ALLOW_MISSING_ASSETS=true` downgrades that to a warning — **local asset work only**, never the container, because the failure mode it re-enables is a silently wrong uniform.

### `RANK_TO_ASSET` is the only place a rank becomes a filename

Web sends the rank abbreviation verbatim from `lib/ranks.ts` (`PTE(S)`, `B/SGT`, `RSM-A`). The default rule is "strip parentheses", which covers 72 of 99 ranks; the rest are explicit exceptions in `src/assets.ts`, each commented with why.

**Do not "fix" the mismatches by renaming asset files.** `SLT.png` and `CLT.png` are correctly-named art for ranks the unit has since rewritten as `LT(S)` and `LT(C)`. Renaming destroys the only record of the older naming.

A `null` mapping means the rank intentionally draws no insignia — the rifleman badge carries the tier instead.

### The renderer does no rank rewriting

This is the fix for PLAN.md §3. Web's greedy regexes collapsed every corps rank to a bare `PTE` and then blanked it, so signallers, troopers, sappers, gunners and every Game Master rendered with no insignia at all. **If you are about to add a `.replace()` to a rank, stop and read §3.**

### Layer order is load-bearing

Uniform layers are all full-canvas PNGs drawn at the same coordinates, so the sequence is the only thing distinguishing them. The collar overlays the ribbon block; the rank border overlays the rank; `RE` is redrawn *after* the collar specifically so it sits over the lapel.

The medal box draws **right to left** so the leftmost medal overlaps its neighbour, and centres with `n * step` ignoring medal width. Both are deliberate (PLAN.md decision 4) — the web port did the opposite and that was the regression, so don't "improve" it back.

### Certificates never open a `.pptx` at runtime

`assets/templates/certificate-layouts.json` is generated from the templates by `npm run extract-layouts`, and the artwork is unpacked alongside it into `assets/templates/media/`. The templates stay in the repo as the source that JSON derives from and as the regression baseline.

Re-run the extractor if a template changes. Its header comments document the five OOXML details that make a naive parse wrong — split placeholder runs, `<a:br/>`, picture placement on both `<p:pic>` and `<p:sp>`, rotation/`srcRect`, and the signature rule being a `<p:cxnSp>` connector rather than a shape.

The extractor's summary line counts each element kind. There is exactly **one line element per certificate** (the signature rule) — if that count drops, a connector has stopped being parsed.

**The JSON is read once at module scope.** A running service will not pick up a re-extract until it is restarted, which is easy to mistake for the extractor not having worked.

### `medals.json` ordering is mutable state waiting to happen

The original reversed the imported JSON arrays **in place at module scope**, which mutated the same objects the uniform renderer read from and made ribbon order depend on which module was imported first. `loadLines()` returns fresh arrays for this reason. Don't reverse them in place.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `MILPAC_SERVICE_TOKEN` | Shared bearer token. Required — the service refuses to start without it. |
| `MILPAC_PORT` | Listen port, default `42070`. **Not `PORT`** — both apps read the same root `.env` and `PORT` is already web's `3000`. |
| `MILPAC_ALLOW_MISSING_ASSETS` | Downgrades preflight failures to warnings. Local only. |

`MILPAC_SERVICE_URL` is web's variable, not this app's.

---

## Deployment

A compose service on the internal network with **no published port** — web reaches it by service name. It bind-mounts nothing from `storage/`, because it writes nothing. Both absences are commented in `docker-compose.yml`; they are design decisions, not oversights.

The image is `node:22-alpine` (~470 MB). The original needed `node:bookworm` plus LibreOffice, ghostscript and the cairo build chain (~1.5 GB) for `node-canvas` and the pptx pipeline; `@napi-rs/canvas` ships prebuilt binaries and the pptx pipeline is gone.

**The imported original must never be deployed.** PLAN.md §9 catalogues seven security findings in it, all closed by construction here.
