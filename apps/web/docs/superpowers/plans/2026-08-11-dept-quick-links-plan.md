# Department Quick Links (J1-J7) + Members>Settings rename — Build Record

**Companion:** `docs/superpowers/specs/2026-08-11-dept-quick-links-design.md`
**Date:** 2026-08-11
**Status:** Complete — six phased commits on `dept-quick-links`, no push (per brief, push lives in the Reviewer step).

**Goal:** Add per-department managed quick links as data (favicon tile rail on each J1-J7 landing view, manager card in the department header view), rename that header view from Members to Settings, and gate restricted links server-side behind 14 new permission keys.

**Architecture:** New `department_links` flat collection, department-parameterized like every other dept-tab data model. A new `lib/orbat/hasPermissions.ts` batch permission check (`hasPermission.ts` untouched). A new `lib/safe-fetch.ts` SSRF-guarded fetcher — the only outbound-fetch path in the feature — feeding `lib/dept-links/favicon.ts`'s `fetchSiteMeta()` pipeline. Three API routes under `app/api/admin/dept-links/`. Three new client components (`DeptLinksRail`, `DeptLinksManagerCard`, `DeptLinkModal`) plus a `DeptSettingsView` wrapper that replaces the direct `DeptMembersTab` render in all seven panels.

**Tech Stack:** Next.js 15 App Router, MongoDB (native driver v7), React 19 + MUI, `@dnd-kit/core`/`@dnd-kit/sortable` (already a dependency), `undici` (added this build — see Phase 2), TypeScript 5 strict.

## Global constraints (as verified during the build)

- No test suite exists in this repo (`apps/web/CLAUDE.md:36`). Verification is `npx tsc --noEmit` + `npm run lint` after every phase, plus a build attempt at the end — no jest/vitest/Playwright wiring, no committed test file.
- No `git push`/PR/merge — commits only, on `dept-quick-links`.
- `apps/web/playwright-report/` is untracked, off-limits — never staged.
- `apps/web` is not an npm workspace member; always run `npm` from `apps/web`.
- Baseline `npx tsc --noEmit` initially showed 67 `TS2307` errors under `public/images/**` — a transient artefact of the checkout/asset-restore still finishing at the moment of the very first run, not a real pre-existing defect. By the Phase 1 gate the tree had settled and `tsc` was fully clean; every phase gate from Phase 1 onward expected (and got) zero errors.

---

## Phase 1 — foundations (commit `feat(dept-links): data model, permission keys and batch permission helper`)

- [x] `types/department-link.d.ts` — `DepartmentLink` + `DepartmentLinkListItem` ambient globals, `export {}` + `declare global` pattern matching `types/department-role.d.ts`.
- [x] `types/logs.d.ts` — `'deptLinks'` added to `ActionCategory`, after `'reminder'`.
- [x] `lib/mongo.ts` — `departmentLinks: db.collection('department_links') as MongoCollection<DepartmentLink>` added after `boardCards`.
- [x] `lib/permissions.ts` — new `deptLinks` group (14 empty-array keys, JSDoc'd) after `meetings`, before `Quiz / Training`.
- [x] `lib/permissions-descriptions.ts` — 14 matching plain-English descriptions after `meetings.lockJ7`.
- [x] `lib/orbat/hasPermissions.ts` (new) — batch variant of `hasPermission`, same three grant sources, same `OVERRIDE`-only bypass. `hasPermission.ts` untouched.

Gate: `npx tsc --noEmit && npm run lint` clean.

## Phase 2 — undici decision, safe-fetch, favicon pipeline (commit `feat(dept-links): SSRF-guarded fetcher and favicon pipeline`)

**The undici decision.** `undici` was absent from `package.json`/lockfile/`node_modules` at the start of this phase.

```
npm install --save undici@^7   # succeeded
node -e "console.log(require.resolve('undici'))"   # succeeded
```

Both succeeded → **Variant A shipped**: an undici `Agent` with a connect-time guarded DNS `lookup` (`connect: { lookup: guardedLookup, timeout: 3000 }`). `undici` added to `serverExternalPackages` in `next.config.ts` and to `package.json`/`package-lock.json`. The lockfile diff (28 lines) is undici's own subtree plus one unrelated, pre-existing 18-line `yaml`-under-`tailwindcss` optional peer-dependency entry that this npm client re-adds on any install in this environment — noted in the commit body, not hand-edited.

`undici` v7 does not accept a `maxRedirections` request option on the plain `request()` call (that became an opt-in `interceptors.redirect()` composed dispatcher in v7) — the brief's illustrative snippet named this option, but a bare `Agent`/`request()` call with no interceptors composed already never auto-follows redirects, which is exactly the manual-redirect posture the feature needs. Omitted the option; behaviour matches the spec, `tsc` stays clean under v7's actual types.

- [x] `lib/safe-fetch.ts` (new) — `isPublicIpAddress`, `assertPublicHttpUrl`, `safeFetch`, `BlockedUrlError`, `FetchCapError`. Full IPv4 (14 reject ranges) + IPv6 (13 reject ranges, `::`-compression-aware `expandIpv6`) private/reserved/CGNAT/link-local/documentation/multicast/6to4/Teredo/NAT64/IPv4-mapped classification, fail-closed on any parse surprise. Connect-time validation via the guarded `Agent`; manual per-hop redirect handling with full re-validation; hard byte cap (`readCapped`, destroys the stream the instant the cap is exceeded); per-hop `AbortController` timeout covering the whole hop (headers + body), not just time-to-headers.
- [x] `lib/dept-links/keys.ts` (new) — `isDeptLinkDepartment`, `manageKey`, `viewRestrictedKey`, `leadKey`.
- [x] `lib/dept-links/validate-url.ts` (new) — pure `validateLinkUrl`, storage-side rules (any port storable).
- [x] `lib/dept-links/favicon.ts` (new) — `fetchSiteMeta`, 8s overall deadline shared across every hop, 500ms minimum-remaining-budget skip, magic-byte icon sniffing (`sniffImageContentType`) with a whitelisted-Content-Type fallback, never throws.
- [x] Optional pure-function spot check (§5.8 of the brief) — not attempted; the type-level and manual-trace verification during writing gave enough confidence, and the brief marks this step optional/bounded with a mandatory self-delete, which adds process risk for a check that wasn't load-bearing here.

Gate: `npx tsc --noEmit && npm run lint` clean.

## Phase 3 — API routes (commit `feat(dept-links): API routes`)

- [x] `app/api/admin/dept-links/route.ts` — `GET` (department-membership gate via `client.hasRoles`, one `hasPermissions` call for `canManage`/`canSeeRestricted`, restricted filter in the Mongo filter object), `POST` (manage gate, URL validation, 24-cap, order assignment, synchronous `fetchSiteMeta`, insert, `logAction('deptLinks.create')` with favicon bytes stripped).
- [x] `app/api/admin/dept-links/[id]/route.ts` — `PATCH` (load-then-404-then-403, per-field isolation — `url` refetches title+favicon and never writes `nameOverride`; `nameOverride` never writes `url`/`fetchedTitle`; `restricted`/`order` independently validated; reorder-only PATCHes get `action: 'deptLinks.reorder'`, everything else `'deptLinks.update'`), `DELETE` (hard delete, `logAction('deptLinks.delete')`).
- [x] `app/api/admin/dept-links/[id]/favicon/route.ts` — `GET` (the no-existence-leak route: every failure past the 401 is a 404, never a 403 or any other distinguishing response), `POST` (manual refresh — `fetchSiteMeta` + `$set` on title/favicon fields only, `logAction('deptLinks.favicon_refresh')`).

Gate: `npx tsc --noEmit && npm run lint` clean.

## Phase 4 — the rename (commit `refactor(dashboard): rename department Members view to Settings`)

Self-contained, revertable — no links functionality in this commit.

- [x] `app/dashboard/_components/useTabState.ts` — `View` union `'members'` → `'settings'`; `rawView === 'members'` legacy alias resolves to `'settings'`.
- [x] `app/dashboard/DeptSettingsView.tsx` (new, phase-4 shell) — renders only `<DeptMembersTab>`; gains the links manager card in Phase 5.
- [x] All seven panels (`j1/J1Panel.tsx`, `j2/J2Panel.tsx`, `j3/J3Panel.tsx`, `j4/J4AdminPanel.tsx`, `j5/J5Panel.tsx`, `j6/J6Panel.tsx`, `j7/J7Panel.tsx`) — icon import swap (`PeopleAlt` → `Settings`; J4 keeps its existing `Settings` import, drops only `PeopleAlt`), header pill (`view === 'settings'`, label "Settings"), branch renders `DeptSettingsView` instead of `DeptMembersTab`. J4's `canManage={true}` hardcode preserved exactly.
- [x] `app/dashboard/personnel/all/MemberDetailPanel.tsx` — "that department's Members page" → "Settings page".
- [x] Verified false-positive set left untouched: `StaffSidebar.tsx` (`Members Workspace` J2 tab label, `Members` → `/dashboard/personnel/all`), `j4/tabs/TeamspeakTab.tsx` (unrelated `'members'|'snapshots'` local state), J2's `Members Workspace` tab label.

Gate: `npx tsc --noEmit && npm run lint` clean.

## Phase 5 — links UI (commit `feat(dept-links): quick links rail and manager UI`)

- [x] `app/dashboard/_components/dept-links/DeptLinksRail.tsx` (new) — favicon tile rail, ghost `+ ADD` tile gated on the server's own `canManage` from its own fetch (not just the prop), members-with-no-links render nothing.
- [x] `app/dashboard/_components/dept-links/DeptLinksManagerCard.tsx` (new) — returns `null` for non-managers; dnd-kit vertical reorder with the `BoardTab.tsx` fractional-midpoint formula; edit/delete/refresh actions.
- [x] `app/dashboard/_components/dept-links/DeptLinkModal.tsx` (new) — modelled on `BoardCardModal.tsx`; client-side sends only changed fields on edit.
- [x] `app/dashboard/DeptSettingsView.tsx` — gains `canManageLinks` prop, renders `DeptLinksManagerCard` above `DeptMembersTab`.
- [x] All seven panels — `canManageLinks` prop threaded in, `DeptLinksRail` inserted as the first child of the `view === 'dept'` fragment (above the `{/* Tabs */}` comment where one exists — J1/J3/J4).
- [x] All seven `page.tsx` files — `hasPermission` import/call replaced with one `hasPermissions(me, ['departmentLeads.jN', 'deptLinks.manageJN'])` call, deriving `canManageMembers` and `canManageLinks`.

Gate: `npx tsc --noEmit && npm run lint` clean.

## Phase 6 — docs (commit `docs(dept-links): site map, TASKS entry and design-doc pair`)

- [x] `docs/map/a-admin-api.md` — new `#### /api/admin/dept-links` section.
- [x] `docs/map/e-dashboard-j1-j4.md` — header-toggle prose, J1-J4 page/panel entries.
- [x] `docs/map/f-dashboard-j5-j7-other.md` — J5-J7 page/panel entries, `useTabState.ts` entry, four new `_components/dept-links/**` entries.
- [x] `docs/map/h-lib-types-components.md` — collection/group-list additions, `hasPermissions.ts`/`safe-fetch.ts`/`dept-links/**` entries, `ActionCategory` union correction (also picked up the pre-existing `reminder`/`J3` omissions), `types/department-link.d.ts` entry, file counts.
- [x] `docs/map/README.md` — `hasPermissions.ts` keyword-table mention, new "Find it fast" row.
- [x] `TASKS.md` — one new `- [x]` entry appended to Outstanding Tasks.
- [x] This design/plan doc pair.

Gate: `npx tsc --noEmit && npm run lint` clean.

---

## Final verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` attempt — see Engineer's completion report for outcome; dummy root `.env` (copied from `.env.template`) deleted afterward regardless of outcome.
- `git status --porcelain` — clean except untracked `playwright-report/` (left exactly as found) and `.next/` build output.
- `git log --oneline -6` — the six phased commits above.
