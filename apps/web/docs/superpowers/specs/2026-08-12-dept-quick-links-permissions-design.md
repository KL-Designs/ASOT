# Department Quick Links: Permission Model Rework + Home Surfacing + Rename

**Date:** 2026-08-12
**Status:** Approved

## Problem

The just-built Department Quick Links feature (`2026-08-11-dept-quick-links-design.md`) gates management with 14 separate per-department keys (`deptLinks.manageJ1..J7`, `deptLinks.viewRestrictedJ1..J7`). That's not what was wanted: one generic permission, assignable to any department role, whose department scope comes from which role holds it — matching how every other department-scoped grant in this codebase already works via `DepartmentRole.department`. The restricted/public binary is also too coarse: links should be assignable to specific department sub-roles (e.g. J7's "Dedi Admin"), and visible links should also surface on `/dashboard` home, not just the department's own landing view.

## Permission model

Replace `deptLinks.manageJ1..J7` and `deptLinks.viewRestrictedJ1..J7` with one key: `deptLinks.manage`. `viewRestrictedJX` is removed outright — fully superseded by per-link sub-role assignment below.

New department-scoped check, since a single key has no department context on its own:

```ts
// lib/orbat/hasDepartmentPermission.ts
export async function hasDepartmentPermission(user: User, department: string, key: string): Promise<boolean>
```

Grant sources, in order: `OVERRIDE` env bypass; then `DepartmentRole` docs where `department` matches the requested department AND either `isBase: true` (only counts if the user is an actual member of that department, i.e. `department` is in `user.departments`) or `_id` is one of the user's held `departmentRoleIds`. ORBAT position roles are **not** consulted — they aren't department-scoped, and including them would defeat the point of this check. `departmentLeads.jX` stays as today's separate OR-fallback in the dept-links routes (unchanged).

A batch variant `hasDepartmentPermissions(user, department, keys[])` mirrors the existing `hasPermissions` shape for routes that need more than one key.

`lib/dept-links/keys.ts`'s `manageKey(dept)`/`viewRestrictedKey(dept)` functions are deleted; call sites use the literal `'deptLinks.manage'` key with `hasDepartmentPermission`/`hasDepartmentPermissions` instead.

This branch was never merged to `main`, so no production `DepartmentRole` can already reference the old keys — a clean rename, not a migration.

## Link visibility

`DepartmentLink.restricted: boolean` → `DepartmentLink.visibleToRoleIds: ObjectId[]`. Empty/absent = visible to every department member (today's public default). Non-empty = visible only to members holding at least one of those specific sub-roles, or anyone with `deptLinks.manage`/lead rights for that department (managers always see everything, as today).

`DeptLinkModal.tsx`'s restricted toggle is replaced with a multi-select of that department's sub-roles (the base role isn't offered as a choice — leaving the field empty already means "everyone").

`GET /api/admin/dept-links` keeps its existing server-side-only filtering pattern (never client-side), now filtering on `visibleToRoleIds` intersecting the caller's `departmentRoleIds` (or being empty) instead of the old `restricted` flag.

## Home page surfacing

New `GET /api/dashboard/quick-links` returns `{ department, links: DepartmentLinkListItem[] }[]` — one entry per department the caller belongs to, each pre-filtered to that caller's visible links (shared filtering helper with the existing per-department route, so the two can't drift). `DashboardOverview.tsx` renders one small tile section per department with links, grouped under that department's own header, styled like the existing rail. Members with nothing visible anywhere get no added section — no empty state on the home page.

## Rename

Department header pill: `Settings` → `Management`. Icon and the underlying `useTabState.ts` view value/legacy `'members'` alias are unchanged — label only, so existing links keep working.

## Out of scope

Everything from the original quick-links design not touched above: the favicon pipeline, the SSRF guard (`lib/safe-fetch.ts`), URL/title-override handling, the 24-link cap, and the general activity-logging mechanism (the logged payload swaps `restricted` for `visibleToRoleIds` but the logging call sites are otherwise unchanged).
