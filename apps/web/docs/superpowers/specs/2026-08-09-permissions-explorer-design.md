# Permissions Explorer — J4 Dashboard Access-Control Visualizer

**Date:** 2026-08-09
**Status:** Approved for planning

## Problem

The site's access-control model now has two layers: the long-standing Discord-role-based `PERMISSIONS` map in `lib/permissions.ts`, and the newer ORBAT-Role-based grants (`OrbatRole.permissions`, resolved additively via `lib/orbat/hasPermission.ts`, see `docs/superpowers/specs/2026-07-13-orbat-roles-design.md`). There is no way to see, in one place:

- For a given permission key, which Discord roles and which ORBAT position Roles grant it, and how many current members that resolves to.
- For a given member, the full set of permission keys they hold and why (which Discord role or ORBAT position matched).

J4-Administration currently has to read `permissions.ts` source and cross-reference the Roles Manager catalog by hand to answer either question.

## Goals

1. A J4-only panel on the J4 dashboard that renders the entire `PERMISSIONS` catalog as a collapsible, searchable tree, with each leaf showing its qualifying Discord roles (with live guild role color), its qualifying ORBAT Roles (from the catalog built in the Roles Manager), and a deduplicated live count of members who currently qualify.
2. A "look up a member" mode on the same panel: search/select a user, and the identical tree re-renders with every leaf marked granted/denied for that user, plus which specific role(s) matched.
3. Both views are computed live from current DB state (guild roles, `Db.users`, `Db.orbatPositions`, `Db.orbatRoles`) — never a static snapshot of `permissions.ts`.

## Non-goals

- No changes to any existing permission check, gate, or the `hasPermission()` mechanism itself — this is a read-only visualization layer on top of what already exists.
- No editing capability from this panel (renaming roles, changing grants, etc.) — that stays in the Roles Manager and in `permissions.ts` source edits.
- No historical/audit view ("who had access last month") — current state only.
- No coverage of ORBAT-Role Discord-role grants (`OrbatRole.discordRoleIds` — Discord roles a position *grants to its holder*) as a tree dimension; this tool visualizes *permission* access, not Discord role provisioning. (The Roles Manager already shows that mapping per-Role.)

## Data model & computation

No new collections. A new server-only module, `lib/permissions/tree.ts`, exports two functions built on one shared in-memory resolution pass:

```ts
interface PermissionNodeStatic {
    key: string                                    // e.g. "attendance.confirm"
    discordRoles: { id: string; name: string; color: number; resolved: boolean }[]
    orbatRoles: { id: string; name: string }[]
    memberCount: number
}

interface PermissionCategory {
    key: string                                     // e.g. "attendance"
    label: string                                   // derived: camelCase -> Title Case
    permissions: PermissionNodeStatic[]
}

async function buildPermissionsTree(): Promise<PermissionCategory[]>

interface PermissionGrant {
    granted: boolean
    viaDiscordRoles: string[]                       // matched role names, [] if none
    viaOrbatRole: string | null                      // matched ORBAT Role name, or null
    viaGlobalOverride: boolean                       // true if granted via J4-Administration bypass or OVERRIDE env
}

async function buildMemberGrants(userId: string): Promise<Record<string, PermissionGrant>>
```

**Resolution pass** (shared by both functions, run once per request):
1. Load `Db.users` filtered to `{ discharged: { $exists: false }, isSkeletonAccount: { $ne: true } }`, projecting `id`, `guild.roles`, and display-name fields.
2. Load all guild roles (`client`'s cached role list — same source `hasRoles()` uses) for ID↔name↔color resolution.
3. Load `Db.orbatPositions` where `roleId` is set, projecting `userId`, `roleId`.
4. Load `Db.orbatRoles`, projecting `_id`, `name`, `permissions`.
5. Build lookup maps: `roleIdToDoc`, `userIdToRoleNameSet`, `userIdToOrbatRoleId`, `orbatRoleIdToDoc`.
6. For each key in `PERMISSION_CATALOG` (existing flattened catalog from `lib/permissions-catalog.ts`):
   - `discordRoles`: each name in `PERMISSION_CATALOG[key]` resolved against the guild role list. A name with no matching guild role still appears, flagged `resolved: false`, so stale/renamed role references in `permissions.ts` surface instead of silently vanishing.
   - `orbatRoles`: every `OrbatRole` whose `permissions` array includes `key`.
   - Per-user grant: `granted = userHasJ4Admin || userRoleNames.some(n => PERMISSION_CATALOG[key].includes(n)) || (orbatRoleIdToDoc.get(userIdToOrbatRoleId.get(userId))?.permissions.includes(key))` — this is the same OR logic as `hasPermission()`, evaluated in bulk instead of per-call. `OVERRIDE` env IDs count as `viaGlobalOverride` only if that ID has a matching `Db.users` doc in the loaded set.
   - `memberCount` (tree mode only) = count of users where the per-user grant is true.

This is O(users × keys) in memory (roughly 200 members × ~90 keys ≈ 18k boolean checks) — trivial for a request handled only by J4-Administration on demand; no caching needed.

## API surface

New permission key in `lib/permissions.ts`, `admin.viewPermissionsTree: ['J4 - Administration']` — same tier as `manageOrbatRoles`, `massImport`, `impersonate`.

- `GET /api/admin/permissions/tree` — returns `PermissionCategory[]` from `buildPermissionsTree()`. Gate: `PERMISSIONS.admin.viewPermissionsTree`.
- `GET /api/admin/permissions/member/[id]` — returns `{ user: { id, name }, grants: Record<string, PermissionGrant> }` from `buildMemberGrants(id)`. Gate: same. 404 if `id` doesn't resolve to a `Db.users` doc.

## UI

New component `app/dashboard/j4/PermissionsExplorerPanel.tsx`, a wide MUI `Dialog` matching the visual pattern already established by `RolesManagerPanel.tsx` (dark theme, red accent border, two-pane-capable layout, search boxes). Structure:

- **Header toggle**: `System Map` (default) / `Look Up Member`.
- **System Map**: categories rendered as collapsible sections (label = `PERMISSIONS` top-level key, Title-Cased), each containing its leaf permission keys. A search box filters by key text or role name — matching leaves stay visible with their parent category auto-expanded, non-matching collapse/hide. Each leaf row: short key label + full dot-path in monospace (consistent with the Roles Manager's permission picker), Discord role chips (color dot matching the Roles Manager's swatch treatment; unresolved roles shown in gray with a "stale" tooltip), ORBAT Role chips in a visually distinct style (different border/accent) so the two grant sources are never confused at a glance, and a member-count badge.
- **Look Up Member**: an `Autocomplete` backed by `/api/admin/members?search=` (existing endpoint, debounced as the user types — same integration pattern already used for the discharge/reinstate/test-notification member pickers in `J4AdminPanel.tsx`). On selection, fetch `/api/admin/permissions/member/[id]` and re-render the identical tree: granted leaves get a green highlight and the matched-role chip(s) visually emphasized (e.g. bold border) or a small "via ORBAT: <Role name>" caption when the match came from an ORBAT position rather than a Discord role; denied leaves dim to the same "no results" treatment already used elsewhere in the app. Global-override grants (J4-Administration bypass) are called out with a distinct badge so it's clear the member isn't matching individual keys but bypassing entirely.

**Entry point**: a new tile in the J4 dashboard's Tools grid (`J4AdminPanel.tsx`, alongside the "ORBAT Manage Roles" tile added earlier), labeled "Permissions Explorer", opening this Dialog via the same `open`/`onClose` state pattern already used for the other panels on that page.

## Risks / follow-ups (not blocking this build)

- If `permissions.ts` grows significantly (currently ~90 leaf keys), the flat member-count computation stays cheap, but the tree UI may want default-collapsed categories (already planned) to stay usable — no further action needed at current scale.
- Stale Discord role references (renamed/deleted roles still listed in `permissions.ts`) are surfaced, not fixed, by this tool — cleaning those up is separate follow-up work the panel makes visible but doesn't automate.
