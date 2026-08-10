# Department Roles

**Date:** 2026-08-10
**Status:** Approved for planning

## Problem

The ORBAT Roles catalog (`OrbatRole`) already lets J4 define reusable job-titles that grant Discord roles, TeamSpeak server groups, and website permissions to whoever holds an ORBAT position. Departments (J1–J7) have no equivalent — department membership today is a flat `User.departments`/`teamLeadDepts` roster with no way to express finer-grained roles within a department (e.g. "Website Development" inside J5) or to grant them a distinct set of Discord roles, TeamSpeak groups, or website permissions on top of plain membership.

## Goals

1. A new **Department Roles** catalog, parallel to ORBAT Roles, managed from the same Roles Manager dialog behind a new tab.
2. Each of the 7 departments (J1–J7) has exactly one **base role** — fixed identity (can't be created, renamed, or deleted), but its Discord/TeamSpeak/permission grants are fully editable. Every member of that department implicitly holds its base role, purely by virtue of being in `User.departments` — no separate assignment step.
3. J4 can create, edit, and delete **sub-roles** scoped to a single department (e.g. "Department Lead", "Team Lead", "Website Development"). Department leads can assign/unassign sub-roles to specific members from the department's existing member-management UI.
4. Both base-role and sub-role grants are **fully synced**, not just recorded: assigning a sub-role (or adding/removing someone from a department) actually grants/revokes the configured Discord role(s) and TeamSpeak server group(s), reusing the primitives already built for ORBAT roles.
5. Sub-role `permissions` feed into the same additive `hasPermission()` check ORBAT roles already use — never narrows access, only ever widens it, and only affects the routes that already opt into calling `hasPermission()`.

## Non-goals

- No category concept (department roles aren't ORBAT-scoped) and no `tag` field (sub-role names are already unique within their department, so there's no duplicate-name case to disambiguate).
- No chain-of-command / hierarchy between sub-roles — they're flat under their department, no sub-sub-roles, no parent/child links.
- No cross-department sub-roles — every sub-role belongs to exactly one department.
- Not fixing pre-existing gaps noticed during research (the `department-membership` ticket route's `validDepts` excluding j4/j5; `dept2icRoles`/`dept3icRoles` missing from `types/user.d.ts`) — out of scope, don't block this feature, and are the current owner's call to fix separately.

## Data model

New collection `department_roles`, exposed as `Db.departmentRoles`:

```ts
interface DepartmentRole {
    _id: ObjectId
    department: string           // 'j1'..'j7'
    name: string
    isBase: boolean              // true only for the 7 seeded base roles; false for admin-created sub-roles
    discordRoleIds: string[]     // same shape/handling as OrbatRole.discordRoleIds
    tsGroupIds: number[]         // same shape/handling as OrbatRole.tsGroupIds
    permissions: string[]        // granted permission keys, same catalog as OrbatRole.permissions
    createdAt: Date
    createdBy: string
    createdByName: string
}
```

`User` (monorepo-root `types/user.d.ts`, shared with `apps/bot`) gains one field, alongside the existing `departments`/`teamLeadDepts`:

```ts
        departmentRoleIds?: ObjectId[]   // DepartmentRole sub-role ids this member holds (never base roles)
```

Sub-role names must be unique **within** a department (not globally — "Team Lead" can exist in both J3 and J5). Base roles are lazy-seeded: `GET /api/admin/department-roles` ensures all 7 exist (creating any missing ones) before returning the list, so there's no separate migration step.

## API surface

New permission key in `lib/permissions.ts`: `admin.manageDepartmentRoles: ['J4 - Administration']` — gates all of the below (read and write both, unlike the ORBAT roles split, since there's no separate read-only audience here).

- `GET/POST /api/admin/department-roles` — GET seeds-then-lists all `DepartmentRole` docs (optional `?department=j1` filter). POST creates a new sub-role (`isBase` always `false`) — body `{department, name, discordRoleIds, tsGroupIds, permissions}`, 400 if `department` isn't one of the 7 valid codes (`j1`..`j7` — reuse whatever constant already enumerates them, e.g. the keys of `lib/discord/dept-roles.ts`'s `DEPT_ROLES`), 409 if the name already exists within that department.
- `PATCH/DELETE /api/admin/department-roles/[roleId]` — PATCH updates `discordRoleIds`/`tsGroupIds`/`permissions` for any role; `name` only for non-base roles (400 if attempting to rename a base role). DELETE rejects with 400 if `isBase` is true; otherwise cascades — `$pull`s the role id from every `User.departmentRoleIds` that holds it, revoking that member's Discord/TeamSpeak grants for it first (same non-fatal, best-effort pattern as the rest of this sync work).
- `POST /api/admin/department-roles/assign` — body `{targetUserId, roleId, action: 'add'|'remove'}`. Gate: `PERMISSIONS.departmentLeads[role.department]` (resolved from the target role's own `department` field), with the existing J4 global bypass. Updates `User.departmentRoleIds` (`$addToSet`/`$pull`) and calls the Discord/TeamSpeak grant or revoke for that role's `discordRoleIds`/`tsGroupIds`. Logs via `logAction()` (category `'orbat'` — reusing the existing category rather than adding a new one, since this is the same class of role-grant action).

## Sync wiring

Two integration points, both reusing primitives already built for ORBAT roles (`addGuildRole`/`removeGuildRole` from `lib/discord/bot.ts`, `applyTsServerGroups` from `lib/teamspeak/groups.ts`):

1. **Base role, on department add/remove** — the existing `department-membership` ticket handler in `app/api/admin/tickets/route.ts` (the `add`/`remove` branches) gains a call that looks up the department's base `DepartmentRole` and grants/revokes its `discordRoleIds`/`tsGroupIds`, stacking on top of the Discord role sync (`syncDeptDiscordRole`) that already runs there today.
2. **Sub-role, on explicit assignment** — the new `POST /api/admin/department-roles/assign` route does the grant/revoke directly, exactly like `swapRoleDiscordRoles`/`swapRoleTsGroups` do for an ORBAT position's role change.

## Permissions integration

`lib/orbat/hasPermission.ts` gains a third source, alongside the existing Discord-role and ORBAT-position-Role checks:

```ts
// After the existing ORBAT position check, still purely additive:
const deptCodes = user.departments ?? []
const subRoleIds = user.departmentRoleIds ?? []
if (deptCodes.length || subRoleIds.length) {
    const deptRoles = await Db.departmentRoles.find({
        $or: [
            { department: { $in: deptCodes }, isBase: true },
            { _id: { $in: subRoleIds } },
        ],
    }).toArray()
    if (deptRoles.some(r => r.permissions.includes(key))) return true
}
```

This file stays where it is (`lib/orbat/hasPermission.ts`) despite no longer being purely ORBAT-specific — moving it would touch every existing call site for no functional benefit. Its doc comment is updated to describe both sources.

## UI

### Roles Manager tab split

`RolesManagerPanel.tsx` (currently ~550 lines, entirely ORBAT-roles content) is split:
- `RolesManagerPanel.tsx` becomes a thin shell: Dialog chrome, the "ORBAT Roles" / "Department Roles" tab switcher, and renders whichever tab's component is active. The "Chain of Command" header button only shows on the ORBAT Roles tab.
- `OrbatRolesTab.tsx` — the current list+editor content, extracted as-is (no behavior change).
- `DepartmentRolesTab.tsx` — new, same visual language (list on the left, editor on the right, sticky footer, dirty-guard, copy/paste clipboards) but:
  - Left list is grouped by department (J1 through J7), each group showing its base role (visually pinned/marked, e.g. a small "BASE" badge) followed by its sub-roles; each group header has a "+ New Sub-Role" affordance.
  - Right editor has 3 columns instead of 4 — Discord roles / TeamSpeak roles / Permissions — no Categories, no Tag.
  - Base role's Name field is disabled/read-only; sub-roles' Name field is editable.
  - Base role has no Delete button; sub-roles get the same two-stage Delete confirm already built for ORBAT roles.

### DeptMembersTab.tsx

Gains a per-member sub-role picker (chips for currently-held sub-roles + a way to add/remove them), scoped to only that department's sub-roles. `GET /api/admin/members?department=X` needs to also return each member's `departmentRoleIds` for this to render. Since this component is already shared across all 7 department pages, the change applies everywhere at once.

## Risks / follow-ups (not blocking this build)

- `DepartmentRole.permissions` only affects the small set of routes that already call `hasPermission()` — same narrow scope ORBAT role permissions already have. Broadening `hasPermission()` adoption across more gates is a separate, future effort.
- Deleting a sub-role that many members hold means many sequential Discord/TeamSpeak revoke calls in one request — acceptable at this app's scale (small unit roster), not optimized for bulk operations.
