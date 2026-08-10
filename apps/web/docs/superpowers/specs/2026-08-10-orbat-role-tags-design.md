# ORBAT Role Tags

**Date:** 2026-08-10
**Status:** Approved for planning

## Problem

Two roles can already share a name today, but only if their `categories` scopes don't overlap (e.g. "Section Commander" scoped to Platoon 1-1 vs. one scoped to Support). That's not flexible enough: an admin may want two same-named roles that *do* apply to overlapping categories — e.g. two "Section Commander" entries both usable across the same platoons, distinguished only by a short label like "MED" or "VIC" so each can sit at a different point in the chain of command. There's currently no way to express that, and no admin-facing way to tell same-named roles apart at a glance beyond the category badge added for the non-overlapping case.

## Goals

1. An optional short **tag** on `OrbatRole` that further distinguishes same-named roles, independent of category scope.
2. The duplicate-name uniqueness check gains tag as an **additional** condition, on top of (not instead of) the existing category-overlap check: two same-named roles conflict only if their categories overlap **and** their tags match. Untagged still behaves exactly as today.
3. The tag is visible everywhere an admin manages or picks roles — Roles Manager (list + editor), Chain of Command canvas, and the role picker used when assigning ORBAT positions.
4. The tag is **never** visible anywhere public — the ORBAT board, milpac profiles, CSV exports, or any other consumer of `OrbatRole.name` / the denormalized `OrbatPosition.role` string.

## Non-goals

- No change to the category-overlap rule itself — it still governs which categories a role can be assigned in.
- No retrofitting of CSV mass-import to resolve tagged duplicates. Mass-import already resolves roles by (name, category) with no way to know which tag a CSV row means (no tag column in the source data); if an admin creates two same-named, same-category roles distinguished only by tag, mass-import will pick one of them arbitrarily for matching CSV rows. Confirmed acceptable — roles can be corrected by hand after import if this ever comes up.
- No tag-based filtering/search — the tag is a disambiguation label, not a new query dimension.
- No uniqueness constraint on the tag itself — two *different-named* roles can happily share a tag, and there's no catalog-wide tag registry.

## Data model

`OrbatRole` gains one field, alongside the existing `categories`:

```ts
        tag: string | null          // optional short label distinguishing same-named roles
                                      // sharing an overlapping category scope. Admin-only —
                                      // never shown on any public page. null = unset.
```

## Uniqueness rule

New helper in `lib/orbat/categoriesOverlap.ts`, alongside the existing `categoriesOverlap()`:

```ts
function sameTag(a: string | null, b: string | null): boolean {
    return (a ?? '').trim() === (b ?? '').trim()
}

export function rolesConflict(a: { categories: string[]; tag: string | null }, b: { categories: string[]; tag: string | null }): boolean {
    return categoriesOverlap(a.categories, b.categories) && sameTag(a.tag, b.tag)
}
```

Both `POST /api/admin/orbat/roles` and `PATCH /api/admin/orbat/roles/[roleId]` swap their `categoriesOverlap()`-only conflict check for `rolesConflict()`. The PATCH route's existing `nameChanging || categoriesChanging` trigger for re-running the check gains a third condition, `tagChanging`, so changing only the tag (name/categories untouched) still re-validates.

## UI

### Roles Manager editor (`RolesManagerPanel.tsx`)

A new optional "Tag" text field next to the category multi-select, with a short hint ("Distinguishes same-named roles — never shown publicly"). Empty input saves as `null`.

### Roles Manager list (`RolesManagerPanel.tsx`)

A small tag chip next to the role name whenever `role.tag` is set — visually distinct (different color) from the existing category-scope badge that only shows for duplicate names. The tag chip shows regardless of whether the name happens to be duplicated, since it's a general per-role label.

### Chain of Command canvas (`ChainOfCommandPanel.tsx`)

Same small tag chip under the role name in `RoleNode`, alongside the existing category-duplicate badge. No new field needed on `RoleNodeData` — the full `OrbatRole` is already embedded, so `RoleNode` reads `role.tag` directly.

### Position role picker (`RoleSelect.tsx`)

This one needs the fix regardless of how rarely it's hit: today it filters by category and renders only the bare `name`, so two same-named/same-category roles are indistinguishable once picked. Both the closed field's displayed value and each dropdown row show `name (tag)` when a tag is set, falling back to plain `name` when not. The `onChange(roleId, roleName)` callback keeps passing the untagged `name` — the value written to `OrbatPosition.role` is unaffected.

### Public surfaces

No changes anywhere — the public ORBAT board, milpac profiles, CSV export, and every other consumer read only `OrbatRole.name` / `OrbatPosition.role`, neither of which the tag touches.

## Risks / follow-ups (not blocking this build)

- Mass-import can't disambiguate tagged same-category duplicates from CSV data alone — accepted, see Non-goals.
- If tag-based disambiguation turns out to be commonly needed, a future "duplicate detection" pass in the Roles Manager (warn on save if two roles are functionally identical) could be worth adding — out of scope here.
