# Department Quick Links (J1-J7) + Members>Settings rename — Design

**Date:** 2026-08-11
**Status:** Implemented

## Problem

Each department (J1-J7) has no lightweight, member-visible way to surface a handful of frequently-used external links (a wiki, a shared drive, a Discord channel, a tool) on its landing view. Anything link-shaped today has to be embedded ad hoc in a tab or lives only in Discord pins. The department header's "Members" toggle is also the only place that shape of management UI exists, and doesn't reflect that it's about to gain a links manager alongside the members/leadership cards it already holds — renaming it to "Settings" better describes what the view now does.

## Goals

1. A favicon tile rail on every department's landing view (`view === 'dept'`), populated from data, visible to any department member for the links they're allowed to see.
2. A manager card (add/edit/delete/reorder/restrict) inside the department's Settings view, gated to department leads and a new dedicated `deptLinks.manageJX` permission key.
3. Per-department restricted tier — some links visible only to members holding `deptLinks.viewRestrictedJX` (or the manage gate).
4. Favicons fetched server-side and served from our own domain — no third-party favicon service, no client-side fetch of an external image URL that could leak referrer/IP to an arbitrary site on every page load.
5. Rename the department header's "Members" toggle to "Settings" (cog icon), reflecting that it now holds more than the members/leadership card.

## Non-goals

- Per-link dynamic permission keys — the locked model is a per-department restricted tier (one `viewRestrictedJX` key covers every restricted link in that department), not a bespoke key per link.
- Any change to `hasPermission.ts`, `DeptMembersTab.tsx` internals, `StaffSidebar.tsx`, `TeamspeakTab.tsx`, or the J4 members-card `canManage={true}` hardcode.
- Fixing the Permissions Explorer blind spot or the `?tab=` render-gate bypass on existing panels — both pre-existing, recorded as known gaps below.
- Any test framework, Playwright wiring, or committed test file — no test suite exists in this codebase (`apps/web/CLAUDE.md:36`) and this build doesn't introduce one.
- Merging the PR, or any deploy action.

## Data model

New collection `department_links`, one flat document per link, following the same flat-collection-plus-order-field pattern used by `board_columns`/`board_cards` (fractional-midpoint reorder) rather than nesting links inside a per-department document — a single drag-reorder becomes a one-document update, matching every other ordered list in this codebase.

```ts
interface DepartmentLink {
    _id: ObjectId
    department: string                  // 'j1'..'j7'
    url: string                         // normalised absolute http(s) href
    fetchedTitle: string                // page <title>, else the URL host
    nameOverride: string | null         // display-only; null = show fetchedTitle
    restricted: boolean                 // visible only to deptLinks.viewRestrictedJX holders (or managers)
    order: number
    faviconData: string | null          // base64, <=200KB raw, doc-embedded
    faviconContentType: string | null   // one of six canonical image types, magic-byte sniffed
    faviconFetchedAt: Date | null       // doubles as the ?v= cache buster
    faviconStatus: 'ok' | 'failed'
    createdAt: Date
    createdBy: string
    createdByName: string
    updatedAt?: Date
    updatedById?: string
    updatedByName?: string
}
```

`nameOverride` is display-only and deliberately isolated from the fetched fields: a URL change re-fetches `fetchedTitle`/favicon and never writes `nameOverride`; setting `nameOverride` never writes `url`/`fetchedTitle`. Clearing it (empty/whitespace, normalised to `null`) restores the site's own fetched title. Enforced field-by-field on the server (`PATCH /api/admin/dept-links/{id}`), not just in the client modal.

`GET` responses use `DepartmentLinkListItem` — the same shape minus `faviconData`, plus `hasFavicon`/`faviconVersion` — so favicon bytes never travel in a list response; they're served separately from `GET /api/admin/dept-links/{id}/favicon`.

Hard cap of 24 links per department, enforced on create with a 400 and a user-visible message. Delete is a hard delete (no soft-delete/recycle-bin for this feature).

## Permissions

14 new keys under a new `deptLinks` group in `lib/permissions.ts`, all new-system-only (empty Discord-role arrays — the real gate is always `hasPermission`/`hasPermissions`, never `client.hasRoles`):

- `deptLinks.viewRestrictedJ1`..`J7` — see a department's restricted links.
- `deptLinks.manageJ1`..`J7` — add/edit/delete/reorder/restrict a department's links.

Write access is `deptLinks.manageJX` **OR** `departmentLeads.jX`, so department leads have manage rights from day one without any role-manager configuration, and the right can additionally be delegated to non-leads through the role manager. Restricted-link visibility is `deptLinks.viewRestrictedJX` **OR** the manage gate (a manager always sees everything they manage). Read access to the list at all (restricted or not) is plain department membership (`PERMISSIONS.departments.jX` via `client.hasRoles`) — unchanged, pre-existing pattern.

New `lib/orbat/hasPermissions.ts` batch variant answers 2-3 keys in one query pass instead of repeating `hasPermission` 2-3 times per request (NFR-06) — same three grant sources (ORBAT position Role, base department role, department sub-roles), same `OVERRIDE`-only hard bypass, `hasPermission.ts` itself untouched.

No role-manager UI change needed — `lib/permissions-catalog.ts`'s recursive `flatten` picks the 14 new keys up automatically into the existing permission picker.

**Accepted asymmetry (J4-Administration):** `client.hasRoles` hard-bypasses for the `J4-Administration` Discord role, but `hasPermission`/`hasPermissions` bypass only on the `OVERRIDE` env list. Since the read gate (department membership) uses `hasRoles` and the write/restricted gates use `hasPermissions`, a J4-Administration holder can *read* any department's links but does **not** automatically get manage rights or restricted visibility — those still have to be granted through the role manager like any other member. This is a consequence of the locked gate design, not a defect; Jimmy will meet it in post-deploy QA.

## Activity logging

Every write calls the existing `logAction()` (`lib/logs.ts`), `category: 'deptLinks'` (added to the `ActionCategory` union in `types/logs.d.ts`), writing to the existing `Db.actionLogs` collection — no new collection or log UI. `before`/`after` payloads always omit `faviconData` and carry `hasFavicon: boolean` instead — dumping ~200KB of base64 into the audit log on every edit isn't acceptable.

| Action | `action` value |
|---|---|
| Create | `deptLinks.create` |
| Update (url/nameOverride/restricted) | `deptLinks.update` |
| Reorder (order only) | `deptLinks.reorder` |
| Delete | `deptLinks.delete` |
| Manual favicon refresh | `deptLinks.favicon_refresh` |

This automatically surfaces in every department's existing "Activity Logs" header toggle (`ActivityLogTab`) — no new component.

## UI

`DeptLinksRail.tsx` — inserted as the first child of each panel's `view === 'dept'` fragment, before the Tabs strip. Favicon tile row (`// QUICK LINKS` kicker, J4-Tools tile styling); links open in a new tab (`target='_blank' rel='noopener noreferrer'`); favicon via `<img src="/api/admin/dept-links/{id}/favicon?v={faviconVersion}">` falling back to an MUI `Link` icon on load error; restricted links carry a `Lock` badge. Managers see a ghost `+ ADD` tile navigating to Settings (`onManage` callback — see D2 below); members with no visible links see nothing rendered at all; managers with no links see the ghost tile plus `NO QUICK LINKS — CONFIGURE IN SETTINGS`.

`DeptLinksManagerCard.tsx` — rendered inside `DeptSettingsView.tsx` above the unmodified `DeptMembersTab`, returns `null` for non-managers. Rows: favicon, resolved display name (plus the greyed-out original fetched title when overridden), restricted lock chip, dnd-kit vertical reorder (`PointerSensor`, activation distance 6, fractional-order `PATCH` — same formula as `BoardTab.tsx`), edit/delete/refresh-favicon actions. Delete goes through `ConfirmDialog`. Inline MUI `<Alert>` for errors, no toasts.

`DeptLinkModal.tsx` — modelled on `BoardCardModal.tsx`. URL field; override field with helper text `Leave blank to use the site's own title — currently: {fetchedTitle}`; Restricted switch with caption; a stale-override hint when the URL is edited but the override isn't cleared; `Fetching site info…` saving state (the create/URL-edit path runs the synchronous favicon pipeline, worst case ~8s).

### Internal navigation without routing

The rail's ghost `+ ADD` tile navigates to Settings via a callback prop (`onManage?: () => void`, wired to `() => setView('settings')` from the already-in-scope `useTabState` hook in every panel) rather than a route (`router.push`/`<Link href>`). This sidesteps `typedRoutes: true` entirely — the smallest correct mechanism, no route cast needed. If `onManage` is undefined, the ghost tile simply doesn't render.

### Members>Settings rename

`useTabState.ts`'s `View` union member `'members'` became `'settings'`, with a legacy alias (`rawView === 'members'` resolves to `'settings'`) so existing bookmarks/pinned sidebar links keep working. All seven panels swap the header pill (icon `PeopleAlt` to `Settings`, label `Members` to `Settings`) and the branch renders the new `DeptSettingsView.tsx` wrapper (which stacks `DeptLinksManagerCard` above the unmodified `DeptMembersTab`) instead of rendering `DeptMembersTab` directly. `StaffSidebar.tsx` is unchanged — this build adds/removes zero Tabs-strip tabs and the header view pills have no sidebar representation.

## API surface

- `GET/POST /api/admin/dept-links?department=jN` — GET lists (restricted filter applied in the Mongo query, never JS-side), POST creates (24-cap, synchronous favicon pipeline).
- `PATCH/DELETE /api/admin/dept-links/{id}` — per-field isolation on PATCH (see Data model above), hard delete. Load-then-404-then-403 (house shape, matching `board/columns/[id]/route.ts`).
- `GET/POST /api/admin/dept-links/{id}/favicon` — GET serves the stored bytes (`Content-Security-Policy: default-src 'none'; sandbox` so a scripted SVG favicon can't execute in our origin); every failure past the 401 is a **404**, never a 403 or any other distinguishing response, so this route can't be used to probe link existence or visibility. POST re-runs the favicon pipeline only.

### SSRF guard

`lib/safe-fetch.ts` is the only outbound-fetch path this feature uses. `isPublicIpAddress`/`assertPublicHttpUrl`/`safeFetch` validate at **connect time** (after DNS resolution, on every socket opened through a guarded undici `Agent`), not just at URL-parse time — a DNS-rebinding second resolution can't slip past a connect-time check the way it could slip past a "resolve once, check, then fetch by hostname" pattern. Redirects are handled manually with full re-validation on every hop; response bytes are hard-capped; every hop is time-boxed against an 8s overall deadline (`lib/dept-links/favicon.ts`), not a flat per-hop timeout, so three hops of redirects can't blow out past what's acceptable for a synchronous request.

**Undici decision:** `undici` was genuinely absent from `package.json`/lockfile/`node_modules` going in. `npm install --save undici@^7` and `require.resolve('undici')` both succeeded, so **Variant A** shipped: an undici `Agent` with a connect-time guarded DNS `lookup` passed via `connect.lookup` — validates every resolved address, on every socket, before the connection is used. `undici` was added to `serverExternalPackages` (`next.config.ts`) and to `package.json`/`package-lock.json`.

## Risks and follow-ups (not blocking this build)

1. **Permissions Explorer blind spot** — `lib/permissions/tree.ts` ignores `DepartmentRole.permissions`, so the Explorer under-reports every migrated key including these 14. Pre-existing, not fixed here.
2. **The `?tab=` render-gate bypass on existing panels** — this feature avoids it by filtering server-side (the restricted-link Mongo filter, the favicon route's gates), but doesn't fix the panels' own pre-existing bypass.
3. **No request-level memoisation of `hasPermission`/`hasPermissions`** — each department page/route makes its own fresh query pass; acceptable at this traffic scale, flagged for whenever the permission system gets a broader look.
4. **J4-Administration read/manage asymmetry** — see Permissions section above; intentional, not a defect.
5. `safe-fetch.ts` ships without runtime exercise (no test framework in this codebase) — Reviewer scrutiny on this file should be proportionate to that.
