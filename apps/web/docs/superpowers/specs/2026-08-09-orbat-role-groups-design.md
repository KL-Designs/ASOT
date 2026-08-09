# ORBAT Chain of Command — Role Groups & Category-Scoped Names

**Date:** 2026-08-09
**Status:** Approved for planning

## Problem

Two real gaps surfaced using the Chain of Command feature (`2026-08-09-orbat-chain-of-command-design.md`) against the real ORBAT:

1. Several roles at the top of the unit (e.g. Commanding Officer, Adjutant, Company Sergeant Major, Officer Commanding) function as a single command authority — anything escalating to "HQ" should be able to target all of them as one unit, not be forced to pick one specific role or chain them artificially one-by-one as if they were each other's superiors.
2. The same role title can mean a different position in the hierarchy depending on context — "Section Commander" reports up through the Platoon Commander in Infantry platoons (1-1, 1-2) but through the Squadron CO in the Support platoon (1-3). The single-parent-per-role model can't express two different superiors for one role.

## Goals

1. **Role Groups**: a new, lightweight entity — a named collection of member Roles that itself participates in the chain-of-command hierarchy as a node. Other Roles or Groups can set a Group as their parent; a Group can itself have a parent (Role or Group).
2. **Category-scoped duplicate names**: allow two Roles to share a name if their `categories` scopes don't overlap, so "Section Commander" can exist as two catalog entries (different parent, different category scope) while always displaying as just "Section Commander" everywhere positions and milpacs read `OrbatRole.name`/the denormalized `OrbatPosition.role` string.

## Non-goals

- Groups are not a permission-granting entity — no `permissions`, `discordRoleIds`, or `categories` fields, and (matching the existing Chain of Command non-goal) groups have zero effect on `hasPermission()` or any permission check.
- Group membership is metadata only, not a graph edge — a member Role's own `parentRoleId`/`parentGroupId` is completely independent of which Group(s) it belongs to. The canvas never draws a line from a member to its group.
- No nested groups — a Group's members are Roles only, never other Groups. (A Group can still have a *parent* that happens to be another Group — that's a hierarchy link, not membership.)
- No "true" multi-parent-with-disambiguation for a single Role. Category-scoped duplicate names is the chosen resolution for the "Section Commander differs by platoon" case — two distinct catalog entries, not one entry with two parents.
- No changes to `OrbatPosition` — positions still reference a single `OrbatRole` via `roleId`, unaffected by any of this.
- No group management surface outside the Chain of Command panel — Groups have no other home (unlike Roles, which are also manageable in the Roles Manager), so all Group CRUD lives in `ChainOfCommandPanel.tsx`.

## Data model

New collection `orbat_role_groups`, exposed as `Db.orbatRoleGroups`:

```ts
interface OrbatRoleGroup {
    _id: ObjectId
    name: string
    memberRoleIds: ObjectId[]        // OrbatRole ids that are members — display/reference only, not a hierarchy edge
    parentRoleId: ObjectId | null    // this group's own chain-of-command parent, if it escalates further
    parentGroupId: ObjectId | null   // mutually exclusive with parentRoleId — at most one of the two is set
    createdAt: Date
    createdBy: string                // Discord ID
    createdByName: string
}
```

`OrbatRole` (existing type) gains one field, alongside the existing `parentRoleId`:

```ts
        parentRoleId: ObjectId | null    // unchanged
        parentGroupId: ObjectId | null   // new — mutually exclusive with parentRoleId
```

A Role or Group's parent is therefore always resolvable as one of: no parent, a Role (`parentRoleId` set), or a Group (`parentGroupId` set) — never both set at once on the same document.

## API surface

### Category-scoped duplicate names

`POST /api/admin/orbat/roles` and `PATCH /api/admin/orbat/roles/[roleId]` currently reject any name that already exists anywhere in the collection. Both change to: reject only if an existing role with that name has a `categories` scope that **overlaps** the role being saved — where "overlaps" means either scope is empty (`[]`, meaning "every category") or the two non-empty arrays share at least one category id. A new shared helper, `categoriesOverlap(a: string[], b: string[]): boolean`, implements this and is used by both routes.

### Role Groups CRUD

New route file `app/api/admin/orbat/groups/route.ts`:
- `GET` — list all groups. Gate: `PERMISSIONS.admin.manageOrbat` (matches the read gate on `GET /api/admin/orbat/roles`).
- `POST` — create. Body: `{ name, memberRoleIds }`. Gate: `PERMISSIONS.admin.manageOrbatRoles` (matches the write gate on roles). Name must be unique among groups (simple global uniqueness — groups aren't category-scoped, so no overlap logic needed here).

New route file `app/api/admin/orbat/groups/[groupId]/route.ts`:
- `PATCH` — update `name` / `memberRoleIds` / `parentRoleId` / `parentGroupId`. Same gate. Setting a parent runs the shared cycle check (below). Setting both `parentRoleId` and `parentGroupId` in the same request is rejected with 400 — at most one may be non-null after the update.
- `DELETE` — same gate. Cascades: any Role with `parentGroupId` equal to this group, and any other Group with `parentGroupId` equal to this group, get that field set to `null` (become roots), exactly mirroring how deleting a Role already cascades `parentRoleId` on its children. Deletion is never blocked by membership — a Group ceasing to exist just means its former members are no longer grouped, nothing structural depends on membership.

### Shared cycle-detection helper

The existing cycle-check in `PATCH /api/admin/orbat/roles/[roleId]` (added for the original Chain of Command build) only walks Role→Role parent chains. It's extracted into a shared helper, `lib/orbat/chainOfCommand.ts`, generalized to walk a mixed Role/Group graph:

```ts
type NodeRef = { id: ObjectId; kind: 'role' | 'group' }

async function getParent(ref: NodeRef): Promise<NodeRef | null> {
    const doc = ref.kind === 'role'
        ? await Db.orbatRoles.findOne({ _id: ref.id })
        : await Db.orbatRoleGroups.findOne({ _id: ref.id })
    if (!doc) return null
    if (doc.parentRoleId) return { id: doc.parentRoleId, kind: 'role' }
    if (doc.parentGroupId) return { id: doc.parentGroupId, kind: 'group' }
    return null
}

// Returns true if setting child's parent to proposedParent would create a cycle
// (proposedParent's ancestor chain, followed upward, contains child).
export async function wouldCreateCycle(child: NodeRef, proposedParent: NodeRef): Promise<boolean> {
    let cursor: NodeRef | null = proposedParent
    let depth = 0
    while (cursor && depth < 50) {
        if (cursor.id.equals(child.id) && cursor.kind === child.kind) return true
        cursor = await getParent(cursor)
        depth++
    }
    return false
}
```

`PATCH /api/admin/orbat/roles/[roleId]` is updated to call this shared helper (for both the existing `parentRoleId` case and the new `parentGroupId` case) instead of its current inline walk, and the new `PATCH /api/admin/orbat/groups/[groupId]` uses the same helper. This removes the duplicated cycle-walk logic that would otherwise exist in two places.

`GET /api/admin/orbat/roles` is unchanged.

## UI

### Category badge (Roles Manager + Chain of Command)

In `RolesManagerPanel.tsx`'s role list and in `ChainOfCommandPanel.tsx`'s role nodes, when another role shares the same name (now possible), show a small category-scope badge next to the name — e.g. the category labels from `PLATOON_CATEGORIES` the role is scoped to, or "All categories" if unscoped. This is purely so two same-named roles are distinguishable when both happen to be visible in the same list/canvas; it does not touch the `name` field, so every existing consumer that displays `OrbatRole.name`/`OrbatPosition.role` (the public ORBAT board, milpac profiles, CSV export, etc.) is unaffected.

### Group nodes in the canvas

`ChainOfCommandPanel.tsx`'s `layoutRoles` becomes `layoutChainOfCommand(roles, groups, search)`, building one combined `dagre` graph from both collections. React Flow node `id`s are prefixed by kind (`role:<id>` / `group:<id>`) so the connect/click handlers can tell nodes apart without a separate lookup table. A new `nodeTypes` entry, `groupNode`, renders Group nodes with a visually distinct style (dashed border instead of solid, a "GROUP" label, and a member-count badge instead of the permission/Discord-role badges Role nodes show) so they're never mistaken for a Role at a glance. Edges are built from *every* document's `parentRoleId`/`parentGroupId` (Role or Group, pointing at a Role or Group) — membership (`memberRoleIds`) is never rendered as an edge.

### Group management (new, Chain-of-Command-only)

A new "New Group" button appears next to the existing search box. Clicking it opens the right-side detail sidebar in create mode: a Name field and a searchable member-role checklist (same interaction pattern as the Discord-role/permission pickers already in `RolesManagerPanel.tsx` — a search box filtering a scrollable checkbox list), with Save/Cancel.

Clicking an existing Group node opens the same sidebar, pre-filled and always editable (Groups have no other management surface, so — unlike clicking a Role, which stays read-only with just a "Detach from Parent" button — the Group sidebar is a full inline editor): Name field, member checklist, a "Detach from Parent" button (shown when `parentRoleId`/`parentGroupId` is set, clearing whichever is set), Save, and a "Delete Group" button.

### Connecting across kinds

The canvas's `onConnect` handler now resolves the kind of both the drag's source and target from their prefixed node ids, and calls the appropriate endpoint on whichever side is the "child": `PATCH /api/admin/orbat/roles/{id}` with `{ parentRoleId, parentGroupId: null }` or `{ parentRoleId: null, parentGroupId }` depending on the parent's kind, or the equivalent on `PATCH /api/admin/orbat/groups/{id}` when the child is a Group. This works identically for all four combinations (Role→Role, Role→Group, Group→Role, Group→Group) since both endpoints accept both parent fields.

## Risks / follow-ups (not blocking this build)

- Category-scoped duplicate names means the Roles Manager's flat alphabetical role list can now show two adjacent "Section Commander" entries — the category badge is the only differentiator. If this proves confusing in practice, grouping the list visually by name-then-category is a cheap follow-up, not needed for this build.
- No consumer yet reads `OrbatRoleGroup` for anything beyond the canvas — same as the base Chain of Command build, this is intentionally infrastructure-first; a future task/escalation-routing feature is what makes groups and the hierarchy actually load-bearing.
- `memberRoleIds` isn't validated against roles actually existing at write time beyond a basic id-parse check — a member role could later be deleted, leaving a dangling id in `memberRoleIds`. Low risk (nothing structural depends on membership) and consistent with how loosely this repo already treats similar denormalized references elsewhere; worth a cheap defensive filter in the read path if it ever causes a rendering issue, not worth a hard foreign-key-style guard now.
