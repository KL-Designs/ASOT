# ORBAT Position Roles — Predefined Role Catalog & Permission Grants

**Date:** 2026-07-13
**Status:** Approved for planning

## Problem

ORBAT position "roles" (the job-title field on each slot — "Rifleman", "Squad Leader", "Pilot", etc.) are currently free-typed per position in `OrbatManager.tsx`. This means:
- No canonical list — typos and near-duplicates ("Rifleman" vs "Rifleman ") are possible.
- No way to attach behaviour to a job title. Discord roles are only granted per-*section* (`OrbatSectionMeta.discordRoleId`), never per-*position-type* — a Squad Leader and a Rifleman in the same section get identical Discord roles.
- No way to grant site permissions based on someone's position/job title at all.

## Goals

1. Replace free-text position roles with a managed catalog (`OrbatRole` documents), edited through a new J4-only "Roles Manager" slide-out on `/dashboard/orbat`.
2. Each `OrbatRole` can grant Discord role(s) (stacking on top of the existing section-level grant) and site permission(s) to whoever holds a position of that Role.
3. Introduce a additive, granular permission-key mechanism that supplements (never replaces) the existing Discord-role-based `PERMISSIONS` system in `lib/permissions.ts`.
4. Migrate existing position data into the new catalog with no manual re-entry.

## Non-goals (explicitly out of scope for this build)

- Department (J1–J7) roles, department-lead roles, and ticket-approval roles are **untouched** — this project only covers the ORBAT position `role` field.
- Reservist positions (`Active Reservist` / `Inactive Reservist`) stay as fixed hardcoded labels, not part of the Roles catalog.
- Rewiring every existing `PERMISSIONS.*` check in the codebase to also check ORBAT-Role-granted permissions is **not** part of this build. This build adds the mechanism (`hasPermission()`) and the permission-key catalog; wiring individual routes to use it is deliberate follow-up work, done incrementally where it makes sense (e.g. `attendance.confirm` is a natural first candidate since section/position leadership already semantically drives it).

## Data model

New collection `orbat_roles`, exposed as `Db.orbatRoles`:

```ts
interface OrbatRole {
    _id: ObjectId
    name: string                    // "Squad Leader", "Rifleman", "Pilot", ...
    categories: string[]            // subset of PLATOON_CATEGORY_IDS/RESERVIST n/a; [] = usable in every category
    discordRoleIds: string[]        // Discord role IDs granted to whoever holds a position of this Role
    permissions: string[]           // granted permission keys (see "Permission model")
    createdAt: Date
    createdBy: string               // Discord ID
    createdByName: string
}
```

`OrbatPosition` (existing type, `types/orbat.d.ts`) gains one field:

```ts
interface OrbatPosition {
    // ...existing fields unchanged...
    roleId: ObjectId | null   // new — reference into orbat_roles; null for reservist positions and any
                               // position whose role hasn't been matched/assigned to a catalog Role yet
}
```

`role: string` is **kept**, not removed. It becomes a denormalized display copy of the linked `OrbatRole.name`, kept in sync by the API layer:
- Assigning a Role to a position (via the new dropdown) sets both `roleId` and copies `name` → `role`.
- Renaming an `OrbatRole` cascades a bulk update: `Db.orbatPositions.updateMany({ roleId }, { $set: { role: newName } })`.

This is deliberate, not a half-measure: `pos.role` is read as a plain string by `fetchORBAT()`, `getOrbatEntryByUserId()`, `getOrbatEntriesForUsers()`, `getSectionLeaders(categories, rolePattern)` (regex-matches directly on the string — e.g. `/medic/i` to find medics for task routing), the public ORBAT board, the personnel list's "current role" column, milpac profile resolution, and CSV/SQF export. Rewriting all of those to join against `orbat_roles` is a much larger, riskier change than keeping one denormalized string field current. New code (the Roles Manager, the new dropdown, permission resolution) uses `roleId` as the source of truth; everything else keeps working unmodified.

## Permission model

New permission-key catalog: the full flattened set of existing `PERMISSIONS.*` leaf paths from `lib/permissions.ts` (e.g. `attendance.confirm`, `communityTickets.manage`, `quiz.assign`, `admin.manageOrbatMembers`, …) — reusing the already-namespaced taxonomy rather than inventing a parallel one. This is the "new standard" you asked for: one flat catalog of dot-path keys, satisfiable either by holding a qualifying Discord role (existing mechanism) **or** by holding an ORBAT position whose Role grants that key (new mechanism).

New helper, `lib/orbat/hasPermission.ts` (or added to `lib/permissions.ts`):

```ts
async function hasPermission(user: User, key: string): Promise<boolean> {
    if (client.hasRoles(user, resolvePermissionArray(key))) return true   // existing check, untouched
    return userOrbatRoleGrants(user, key)                                  // new: resolve user's position -> Role -> permissions
}
```

`userOrbatRoleGrants` looks up the user's current `OrbatPosition` (`Db.orbatPositions.findOne({ userId })`), resolves `roleId` → `OrbatRole.permissions`, checks membership. A user with no ORBAT position (discharged, not yet placed) simply gets `false` from this branch and falls back to the existing Discord-role check — no regression for anyone.

Wiring specific routes to call `hasPermission()` instead of a raw `hasRoles()` check is out of scope for this build (see Non-goals) — the plan below only builds the mechanism, the catalog, and the Roles Manager UI to assign permission keys to Roles.

## Roles Manager UI

New component, slide-out panel on `app/dashboard/orbat/page.tsx` (or a sibling route), trigger button gated by a new `PERMISSIONS.admin.manageOrbatRoles` key (added to `lib/permissions.ts` alongside the existing `manageOrbat`/`manageOrbatStructure`/`manageOrbatMembers` trio — maps to `['J4 - Administration']` today, same as the others, keeping the door open for future delegation).

CRUD table:
- **Name** — text.
- **Categories** — multi-select from `PLATOON_CATEGORIES`/`RESERVIST_CATEGORIES` (empty = all categories).
- **Discord roles** — searchable multi-select (reuse the existing guild-roles fetch pattern from `RolePicker.tsx` / `/api/admin/guild-roles`).
- **Permissions** — multi-select from the flattened `PERMISSIONS.*` key catalog.

Delete is blocked with a clear error if any `OrbatPosition.roleId` still references the Role — the admin must reassign those positions to a different Role first (consistent with how the rest of the app avoids silent orphaning, e.g. mastersheet recycle-bin patterns).

## ORBAT Manager UI changes

`app/dashboard/orbat/OrbatManager.tsx`: the position role field changes from a free-text input to a searchable autocomplete dropdown, sourced from `GET /api/admin/orbat/roles`, filtered to Roles whose `categories` includes the position's category (or is unscoped). No free-text entry path remains — a new/blank position must have a Role selected to be meaningful.

## Discord role sync changes

`syncOrbatDiscordRoles` stays as-is for section/category-level roles (confirmed: stacks, not replaced). New behaviour needed at the call sites that change a position's Role while it's occupied:
- `PATCH /api/admin/orbat/[positionId]` (role field, when it becomes `roleId`) — if the position has an assigned `userId`, revoke the old Role's `discordRoleIds` and grant the new Role's `discordRoleIds`, in addition to the existing section-level sync which is unaffected.
- Assign/unassign flows (`[positionId]` PATCH userId branch, `reservists` routes, `applyOrbatMove()`) — grant/revoke the position's Role-level Discord roles alongside the existing section-level grant/revoke.

## Migration

One-off script (run once, not a standing API route):
1. `Db.orbatPositions.distinct('role', { category: { $nin: ['activeReservist','inactiveReservist'] } })` → currently ~37 distinct strings (confirmed via direct query against the `ASOT` database on 2026-07-13).
2. Insert one `OrbatRole` per distinct string, `categories: []` (unscoped — an admin tightens scoping afterward via the UI; inferring category restriction from historical data isn't reliable enough to automate).
3. Backfill: for every `OrbatPosition` not in a reservist category, set `roleId` to the matching new `OrbatRole._id` by exact name match.
4. Reservist positions keep `roleId: null` permanently (per Non-goals).

**Mass-import** (`app/api/admin/mass-import/route.ts`) currently free-types the CSV's role column straight into new `OrbatPosition` docs during its wipe-and-rebuild. After this change, it should best-effort match each CSV role string to an existing `OrbatRole` by exact name and set `roleId` when found. Unmatched strings still populate the denormalized `role` field (import must not fail on this), but get surfaced in the import result as "N positions imported without a matched Role — assign manually," rather than silently minting new Role catalog entries from CSV noise.

## API surface (new/changed)

- `GET /api/admin/orbat/roles` — list all `OrbatRole`s. Gate: `PERMISSIONS.admin.manageOrbat` (read access matches existing ORBAT view gate).
- `POST /api/admin/orbat/roles` — create. Gate: `PERMISSIONS.admin.manageOrbatRoles`.
- `PATCH /api/admin/orbat/roles/[roleId]` — update name/categories/discordRoleIds/permissions; cascades `role` string update to positions on name change. Gate: `PERMISSIONS.admin.manageOrbatRoles`.
- `DELETE /api/admin/orbat/roles/[roleId]` — blocked (409) if any position references it. Gate: `PERMISSIONS.admin.manageOrbatRoles`.
- `PATCH /api/admin/orbat/[positionId]` — existing route, body shape for role assignment changes from `{ role: string }` to `{ roleId: string | null }`; response/side-effects extended per "Discord role sync changes" above.
- `app/api/admin/mass-import/route.ts` — extended per "Migration" above; no new route.

## Risks / follow-ups (not blocking this build)

- Denormalized `role` string can drift from `OrbatRole.name` only if the cascade update on rename is missed in some future code path — worth a lint-style comment at both write sites pointing at each other.
- `hasPermission()` mechanism ships unused by any route in this build; it needs at least one real call site to prove it out before relying on it elsewhere — recommend `attendance.confirm` as the first candidate in a later pass, not this one.
- The Roles Manager UI is new surface area (slide-out panel, autocomplete dropdown, multi-selects) on top of `OrbatManager.tsx`, which is already a very large (1671-line) client component — worth keeping the new panel as a separate component file rather than growing that file further.
