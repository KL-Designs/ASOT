# Permission System Migration — Phase 1: Foundation

**Date:** 2026-08-11
**Status:** Approved for planning

## Problem

Every permission check on the site (`client.hasRoles(user, PERMISSIONS.x.y)`) is a
hardcoded array of literal Discord role name strings, defined in
`lib/permissions.ts` and only changeable by editing code and deploying. A
parallel, database-backed system already exists — `OrbatRole.permissions` /
`DepartmentRole.permissions`, checked additively via `hasPermission(user, key)`
in `lib/orbat/hasPermission.ts` — but it has exactly one real call site
(`attendance.confirm`, 4 files) out of 71 permission keys across 23
categories, referenced by roughly 320 files. Everywhere else, "does this
user have access" still means "does this user hold this specific Discord
role," including a hardcoded global bypass for anyone holding
`J4-Administration`.

The goal, across this and future phases, is to make `hasPermission()` the
only real permission check on the site, with database-editable role-based
grants as the sole source of truth, and the raw `OVERRIDE` env Discord-ID
list as the only remaining hard bypass. This is far too large to design or
build as one project (320 files, 71 keys) — this spec covers **Phase 1
only**: the foundation. Phase 2 (migrating the remaining ~65 keys/300+
files, category by category) and Phase 3 (deleting the old `PERMISSIONS`
object and the `J4-Administration` hardcode once nothing depends on them)
are separate, later specs.

## Goals

1. Rewrite `hasPermission()` so it never falls back to a raw Discord-role
   check — only `OVERRIDE`, ORBAT-Role holdings, and Department-Role
   holdings (base + subs) grant access.
2. Give reservists a real, editable role (today their positions are
   hardcoded `roleId: null`, explicitly excluded from the ORBAT Roles
   catalog) so they have a grant vehicle like everyone else.
3. Convert every real call site of `pages.member` — the single most
   foundational check, "can this user open the dashboard at all" — from
   `client.hasRoles(me, PERMISSIONS.pages.member)` to
   `await hasPermission(me, 'pages.member')`, and make sure every current
   member keeps access on cutover.
4. Establish the pattern (mechanism change → migration script → call-site
   conversion → verification) that Phase 2 repeats for every other
   category.

## Non-goals

- Converting any permission key other than `pages.member` — everything
  else stays on `client.hasRoles()`/`PERMISSIONS` exactly as it works
  today, untouched, until its own Phase 2 batch.
- Removing the `J4-Administration` hardcoded bypass from `hasRoles()`, or
  deleting/deprecating the `PERMISSIONS` object — both stay fully
  functional, because not-yet-migrated call sites still depend on them.
  Removal is Phase 3, only once nothing calls `hasRoles()` for permissions
  anymore.
- Any new "role type" beyond what already exists (ORBAT Roles, Department
  Roles). Org-wide non-departmental tiers like the current `HQ Staff`/
  `All Staff` Discord roles are not modeled as anything new — when their
  gated permissions get migrated (Phase 2), those permissions get granted
  directly on whatever real ORBAT Role or Department Role the people who
  actually need them already hold.
- A UI to distinguish "live" vs "not yet wired" permission keys in the
  Roles Manager's picker. Out of scope for Phase 1; worth reconsidering
  once more of the catalog is real (Phase 2+).

## `hasPermission()` rewrite

Current implementation's first step is a raw Discord-role fast path:

```ts
const discordRoleNames = PERMISSION_CATALOG[key]
if (discordRoleNames && client.hasRoles(user, discordRoleNames)) return true
```

This is exactly the pattern being removed. New implementation:

```ts
export async function hasPermission(user: User, key: string): Promise<boolean> {
    const override = process.env.OVERRIDE?.split(',') ?? []
    if (override.includes(user.id)) return true

    const positions = await Db.orbatPositions
        .find({ userId: user.id, roleId: { $ne: null } }, { projection: { roleId: 1 } })
        .toArray()
    const roleIds = positions.map(p => p.roleId).filter((id): id is NonNullable<typeof id> => id != null)
    if (roleIds.length > 0) {
        const roles = await Db.orbatRoles.find({ _id: { $in: roleIds } }).toArray()
        if (roles.some(role => role.permissions.includes(key))) return true
    }

    const deptCodes = user.departments ?? []
    const subRoleIds = (user.departmentRoleIds ?? []).map(id => new ObjectId(String(id)))
    if (deptCodes.length > 0 || subRoleIds.length > 0) {
        const deptRoles = await Db.departmentRoles.find({
            $or: [
                { department: { $in: deptCodes }, isBase: true },
                { _id: { $in: subRoleIds } },
            ],
        }).toArray()
        if (deptRoles.some(role => role.permissions.includes(key))) return true
    }

    return false
}
```

The ORBAT-role and department-role blocks are unchanged from today — only
the Discord-role fast path is removed and the `OVERRIDE` check is added
(this is the exact same override list `hasRoles()` already checks; both
independently consult `process.env.OVERRIDE`, no shared state, no risk of
divergence since it's read fresh from the env each call, same as today).

This function's signature and behavior for every key it's *not* yet used
for don't matter — nothing calls it for those keys until Phase 2 converts
them. Callers that do call it (today: `attendance.confirm`; after this
spec: also `pages.member`) get strictly correct new-system behavior.

## Permission catalog: unchanged in Phase 1

`lib/permissions-catalog.ts`'s `PERMISSION_CATALOG`/`PERMISSION_KEYS` stay
exactly as they are — still derived by flattening `PERMISSIONS` — and are
**not** touched by this phase. This was originally scoped as a Phase 1 goal
(decoupling the catalog so new, Discord-role-free keys could be added) but
research turned up a real dependency that makes doing it now actively
harmful: `lib/permissions/tree.ts` (the Permissions Explorer, an existing
admin tool) reads `PERMISSION_CATALOG[key]` directly as "which Discord
role names currently grant this key," to show admins their real grant
paths per user/permission. For every key besides `pages.member` and
`attendance.confirm`, that Discord-role list is still the actual,
live mechanism (`PERMISSIONS`/`hasRoles()` haven't moved) — hollowing out
or restructuring the catalog now would make the Explorer wrong for the
other 69 keys throughout the whole Phase 1-2 transition.

Net effect: "add permissions if needed" and "categorize well" are
deferred to whichever phase first needs a permission key with no
Discord-role equivalent, or to a dedicated Explorer update that can
distinguish "still legacy-gated" from "migrated" per key. Neither is
required for `pages.member`, which already exists in `PERMISSIONS` today.

## Reservists get a real role

`app/api/admin/orbat/reservists/route.ts` hardcodes `roleId: null` when
creating a reservist position (`RESERVIST_CATEGORIES`: `activeReservist`,
`inactiveReservist`). This build:

1. Seeds one system `OrbatRole` named `"Reservist"` (`categories: []` —
   unscoped, since `activeReservist`/`inactiveReservist` aren't part of
   `PLATOON_CATEGORY_IDS`, the taxonomy `OrbatRole.categories` scopes
   against), with empty grants initially.
2. A one-off migration script (Mongo-only, dry-run + `--apply`, matching
   this repo's established `scripts/migrate-*.mjs` pattern) sets `roleId`
   to that seeded role's `_id` on every existing reservist position.
3. `app/api/admin/orbat/reservists/route.ts`'s POST handler stops hardcoding
   `roleId: null` and instead looks up (or lazily seeds, same
   `ensureBaseRoles()`-style pattern `department-roles/route.ts` already
   uses) the `"Reservist"` role and sets it on newly-created reservist
   positions too — so this isn't a one-time fix that regresses on the next
   reservist added.

One shared role for both active and inactive reservists, not two — their
permission needs are identical today (`pages.member`); splitting them can
happen later if a real need for different grants ever shows up (YAGNI).
`hasPermission()` needs no changes to support this — its existing
ORBAT-position → ORBAT-Role lookup already works for any role, seeded or
admin-created.

## `pages.member` migration

Real call sites (verified via repo-wide grep, all `client.hasRoles(me,
PERMISSIONS.pages.member)`): 35 files — 24 API routes, 11 pages/layouts.
Every one converts to `await hasPermission(me, 'pages.member')` (the
surrounding functions are already `async`; call sites already have `me`
in scope). No behavior change to any *other* check in these files (several
files, e.g. `app/dashboard/layout.tsx`, also check `PERMISSIONS.pages.members`
— plural, a different key gating the Personnel pages — which is
untouched, stays on `hasRoles()`).

Migration (one-off script, dry-run + `--apply`, same pattern as the
reservist migration above): grant `pages.member` on:
- All 7 departments' base `DepartmentRole`s (covers every current
  department member — `user.departments` non-empty).
- The seeded `"Reservist"` `OrbatRole` (covers reservists).

This is a `$addToSet`-style permission-array update on 8 existing role
documents, not a per-user change — nobody's `departmentRoleIds`/ORBAT
position assignment changes, only the roles' own `permissions` arrays
gain `'pages.member'`.

**Known gap, accepted for Phase 1:** a member who is neither in any
department (`user.departments` empty) nor holds a reservist position (no
ORBAT position, or one with a different, non-Reservist role) has no grant
path to `pages.member` under the new check. In practice this should be
rare (department membership happens at onboarding), but it's a real edge
case worth a manual audit after the migration script's dry-run — the
script's report should flag any active, non-discharged, non-skeleton user
who wouldn't gain `pages.member` from either grant, so it can be reviewed
before `--apply`, not discovered after someone gets locked out.

## Risks / follow-ups (not blocking this build)

- The Roles Manager's permission picker will, after this ships, contain
  one key (`pages.member`) alongside `attendance.confirm` that are
  genuinely enforced, and ~69 that aren't yet (still `PERMISSIONS`-gated
  in their real routes). No UI distinction between the two — an admin
  could grant a role `admin.manageOrbat` today and it would do nothing.
  This was already true before this build (just for 70 keys instead of
  69) — flagged as a Phase 2+ consideration, not fixed here.
- The migration scripts in this phase only write to Mongo (role
  `permissions` arrays, position `roleId`s) — no Discord/TeamSpeak calls
  needed, since `pages.member` and the Reservist role's initial grants
  don't touch `discordRoleIds`/`tsGroupIds`.
- Once `pages.member` is migrated, the Permissions Explorer
  (`lib/permissions/tree.ts`) will still show `PERMISSION_CATALOG['pages.member']`
  (`['ASOT Member']`) as a "via Discord role" grant path for it, even
  though the real `hasPermission()` check no longer consults Discord roles
  for that key at all — the Explorer becomes slightly misleading for
  exactly the key(s) each phase migrates, until the Explorer itself is
  updated to know which keys are migrated (not required for this phase;
  the underlying access-control behavior is correct either way, this is
  purely a display accuracy gap in an admin diagnostic tool).
