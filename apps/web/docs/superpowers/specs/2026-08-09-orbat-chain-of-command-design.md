# ORBAT Role Chain of Command

**Date:** 2026-08-09
**Status:** Approved for planning

## Problem

`OrbatRole` (the job-title catalog introduced for ORBAT positions — see `2026-07-13-orbat-roles-design.md`) has no relationship between roles. There's no way to express "if this role can't handle something, it escalates to that role" — the closest thing today is ad-hoc hardcoded escalation lists scattered through `lib/permissions.ts` (e.g. `quiz.reviewEscalated` hardcodes "J3 leads, then J4"). This project adds a formal chain-of-command hierarchy to the ORBAT Role catalog, purely as routing/escalation metadata for future features to consume — not as a permission mechanism.

This is the first of three related but independently-shippable pieces identified in this planning session: ORBAT chain of command (this spec), a department-role catalog closing the Discord-role round-trip for `departments.*`/`departmentLeads.*` permission checks, and the eventual large migration of Discord-role-based permission checks onto website-managed roles entirely. Only the first is in scope here.

## Goals

1. `OrbatRole` gains a `parentRoleId` — a single parent reference forming a multi-level tree (a role's parent can itself have a parent, arbitrarily deep — e.g. Rifleman → Section Commander → Platoon Commander → Company Commander → Commanding Officer).
2. A visual node-canvas editor (drag-and-drop, `@xyflow/react` + `dagre` for auto top-down layout) to view and edit the hierarchy, reachable from the existing Roles Manager.
3. Each node shows the role name plus small badges (permission count, Discord-role count) so the canvas conveys structure *and* access at a glance, reusing the chip/badge styling already established in the Roles Manager and Permissions Explorer.
4. Server-side cycle prevention: a role can never end up as its own ancestor, at any depth.
5. Deleting a role with children cascades their `parentRoleId` to `null` rather than blocking the delete — this is routing metadata, not structural/permission-critical.

## Non-goals

- **No permission inheritance.** A parent role's granted permissions/Discord-roles are exactly what's explicitly set on it — the hierarchy has zero effect on `hasPermission()`, `lib/permissions/tree.ts`, or any existing permission check. Confirmed explicitly: this is routing-only.
- **No department-role hierarchy.** The chain of command applies to `OrbatRole` only. Department roles (J1–J7, leads, HQ tiers) are a separate future sub-project with their own hierarchy question, if any.
- **No consumers wired up yet.** This ships the data model and the editor only. No task/ticket/escalation feature reads `parentRoleId` in this build — that's explicitly future work this unblocks, not part of it.
- **No persisted/draggable node positions.** Canvas layout is always auto-computed by `dagre` from the current parent relationships; there is no per-role stored (x, y).
- **No multi-parent/DAG support.** Strictly a single-parent tree, matching real chain-of-command semantics.
- **No in-canvas role editing.** Clicking a node shows a small read-only detail popover (name, permission count, Discord roles). Editing a role's name/permissions/Discord-roles/category still happens in the existing Roles Manager, reached separately — no cross-panel "jump to edit" handoff in this build.

## Data model

`OrbatRole` (existing type, `types/orbat-role.d.ts`) gains one field:

```ts
interface OrbatRole {
    // ...existing fields unchanged...
    parentRoleId: ObjectId | null   // this role's chain-of-command parent; null = top of chain / unset
}
```

No changes to `OrbatPosition` or any other type. Existing roles default to `parentRoleId: null` (all roots) until an admin sets relationships via the new editor — no migration/backfill needed since `null` is a valid, meaningful default (matches how `roleId` itself defaulted to unset on `OrbatPosition` in the original Roles catalog build).

## API surface

No new routes. Two existing routes under `app/api/admin/orbat/roles/` change:

- **`PATCH /api/admin/orbat/roles/[roleId]`** — body gains an optional `parentRoleId: string | null`. Validation, in order:
  1. `parentRoleId !== roleId` (a role can't be its own parent) — reject with 400.
  2. The proposed parent must exist in `Db.orbatRoles` — reject with 400 if not found.
  3. **Cycle check:** walk the proposed parent's ancestor chain (follow `parentRoleId` upward via repeated lookups) up to a sane depth bound (e.g. 50 — well beyond any real hierarchy, just a guard against a data-corruption infinite loop). If the role being edited appears anywhere in that chain, reject with 409 and a clear message ("This would create a cycle in the chain of command").
- **`DELETE /api/admin/orbat/roles/[roleId]`** — the existing delete-blocked-if-positions-reference-it check runs first, unchanged; only once that check passes does the cascade run: `Db.orbatRoles.updateMany({ parentRoleId: roleId }, { $set: { parentRoleId: null } })`, so any children become roots. Running the cascade before that check would orphan children on a delete that then gets rejected, so the ordering is deliberate, not incidental.

`GET /api/admin/orbat/roles` is unchanged — it already returns full `OrbatRole` documents, which will now include `parentRoleId`.

## UI

New component: `apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx`, opened via a new "Chain of Command" button in `RolesManagerPanel.tsx`'s header (alongside "New Role") — reachable from both of `RolesManagerPanel`'s existing mount points (`/dashboard/orbat` and the J4 dashboard Tools tab), since it's the same shared component. A wide/full `Dialog` matching the established dark-theme visual pattern (red accent border, `85vh` height), but the content area is a `@xyflow/react` canvas instead of list/form panes.

- **Layout:** `dagre` computes a top-down tree layout from the current `parentRoleId` relationships every time the panel opens (or the underlying role list changes) — parent above, children below, connected by edges. Roles with no parent and no children still render as standalone nodes (never hidden) — a big part of the value here is seeing at a glance what hasn't been slotted into the hierarchy yet.
- **Node content:** role name (primary), a small badge row showing permission count (`role.permissions.length`) and Discord-role count (`role.discordRoleIds.length`), styled consistently with the chips already used in `RolesManagerPanel`/`PermissionsExplorerPanel`.
- **Search:** a text box (same pattern as the rest of the Roles Manager) that dims non-matching nodes and pans/zooms to the first match, since a ~37-role graph can get visually busy.
- **Setting a parent:** drag a connection from a child node's bottom handle to a parent node's top handle (standard React Flow edge-creation gesture, matching the top-down parent-above-child layout convention). On drop, `PATCH` the child's `parentRoleId`; a cycle-rejection response shows an inline error and the edge is not applied (canvas reverts to the last known-good state).
- **Removing a parent link:** select an edge and delete it (standard React Flow interaction) — this sets that role's `parentRoleId` back to `null` via the same `PATCH` endpoint.
- **Node click:** shows a small read-only popover with the role's name, permission count/list, and Discord roles. No edit affordance in this build (see Non-goals).

**New dependency:** `@xyflow/react` (React Flow) and `dagre` (layout algorithm) — the first canvas-style UI in this app; everything else so far is forms/lists/dialogs. This is a deliberate, scoped departure the user chose explicitly over the two no-new-dependency alternatives (static tree + dropdown, or drag-to-reparent indented list).

## Risks / follow-ups (not blocking this build)

- This is the first canvas/graph UI in the codebase — `@xyflow/react` + `dagre` bundle weight and any SSR/hydration quirks (React Flow needs a client-only render) should be sanity-checked during implementation; wrap in `'use client'` with no server-rendered canvas content.
- No consumer reads `parentRoleId` yet — the value of this build is fully realized only once a future task/ticket-routing feature uses it. That's expected and intentional per Non-goals, not a gap in this build.
- If department-role hierarchy is built later and turns out to need to interoperate with the ORBAT hierarchy (e.g. an ORBAT position escalating to a department lead), that's a data-model question for that future sub-project, not this one — today `parentRoleId` only ever points to another `OrbatRole`.
