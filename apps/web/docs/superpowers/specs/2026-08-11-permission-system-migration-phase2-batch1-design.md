# Permission System Migration — Phase 2, Batch 1: Small Categories

**Date:** 2026-08-11
**Status:** Approved for planning

## Problem

Phase 1 ([[2026-08-11-permission-system-migration-phase1-design]]) migrated `pages.member` — the single foundational "can you open the dashboard" check — from the Discord-role-name `PERMISSIONS` object to the database-backed `hasPermission()`. That leaves roughly 70 permission keys still gated by `client.hasRoles(me, PERMISSIONS.x.y)`, spread across 22 categories and ~285 remaining call sites, ranging from `departments` (135 call sites) down to single-call-site categories.

Phase 2 migrates the rest, category by category, each batch its own design → plan → implementation cycle (too large for one pass, same reasoning as Phase 1's own scoping). This spec covers **Batch 1 only**: the five smallest categories — `uploads`, `auth`, `optionals`, `gallery`, `intel` — 6 permission keys, 12 real call sites total. Chosen deliberately as the smallest, lowest-risk slice, to prove out a pattern this batch introduces that Phase 1 never had to deal with: **multi-role keys** (a key qualified by more than one Discord role name, OR'd together) and, within that, keys partly or wholly gated by `HQ Staff` — an org-wide Discord tier with no department/ORBAT mapping.

## The `HQ Staff`/`All Staff` rule (applies to this and every future batch)

Investigating this batch's keys surfaced a recurring problem: `HQ Staff` currently qualifies for `uploads.bio`, `auth.collab`, `intel.generateImages`, and `intel.viewAllImages`. Its 20 current holders span six different departments (and 6 of the 20 are in no department at all) — there is no single department/ORBAT role that represents "is HQ Staff" without either over-granting (handing the permission to an entire department that doesn't actually all deserve it) or having no vehicle at all for the 6 with no department.

Per direction: **`HQ Staff` and `All Staff` never carry forward as a grant path, for any key, in this batch or any future one.** They're Discord-only artifacts of the old system. A key's new grant is determined solely by whichever *other* listed role(s) map to a real department/ORBAT concept. If a key was gated *only* by `HQ Staff`/`All Staff` with nothing else listed, there's no automatic fallback — that key needs a fresh, explicit decision on which real role should own it going forward (see `uploads.bio` below).

This rule is now established for the whole Phase 2 effort, not just this batch — later batches (`departments`, `training`, `admin`, etc.) that also reference these two roles apply it the same way without re-litigating it each time.

## Goals

1. Convert all 12 real call sites of these 6 keys from `client.hasRoles(me, PERMISSIONS.x.y)` to `await hasPermission(me, 'x.y')`.
2. Apply the `HQ Staff`/`All Staff` rule: drop it from every key's grant path, keep whatever other role(s) were listed.
3. Migration script grants each key on the department base role(s) below, so current legitimate holders (by the *new* rule, not literal 1:1 Discord-role preservation) don't lose access on cutover:

| Key | Old `PERMISSIONS` value | New grant path |
|---|---|---|
| `optionals.manage` | `['J4 - Administration']` | J4 base role |
| `gallery.manage` | `['J5 - Media']` | J5 base role |
| `auth.collab` | `['HQ Staff', 'J2 - Mission Making']` | J2 base role (`HQ Staff` dropped) |
| `intel.generateImages` | `['J2 - Mission Making', 'HQ Staff']` | J2 base role (`HQ Staff` dropped) |
| `intel.viewAllImages` | `['J2 - Mission Making', 'HQ Staff']` | J2 base role (`HQ Staff` dropped) |
| `uploads.bio` | `['HQ Staff']` (only role listed) | J4 base role (fresh decision — no other precedent existed) |

## Non-goals

- Any other category (`departments`, `training`, `admin`, `pages.admin`/`pages.members`/`pages.operationsEdit`, `departmentLeads`, etc.) — separate future batches.
- Removing `PERMISSIONS`, `hasRoles()`, or the `J4-Administration` hardcode — still Phase 3, still depended on by every not-yet-migrated call site (all ~276 remaining call sites after this batch).
- `PERMISSIONS.ai.use` — appears alongside `intel.viewAllImages` in two of this batch's files (`app/api/ai/images/route.ts`, `app/api/ai/images/[id]/file/route.ts`) but belongs to the separate `ai` category (10 call sites, not in this batch) — left untouched.
- Any change to `lib/permissions-catalog.ts`/`lib/permissions/tree.ts` — same reasoning as Phase 1 (the Permissions Explorer still needs the Discord-role list for every not-yet-migrated key, including these 6 until this batch ships, and for the surviving `HQ Staff`/`All Staff`-adjacent history on already-migrated keys — the Explorer's display gap for migrated keys is an accepted, existing risk from Phase 1, not something this batch fixes).

## Call sites (all 12, verified by reading each file)

- `optionals.manage`: `app/optionals/manage/route.ts:15`, `app/optionals/me/route.ts:30` (a boolean assignment — `const isAdmin = client.hasRoles(...)` — not an `if` guard).
- `gallery.manage`: `app/api/gallery/admin/folder/route.ts:28`, `app/api/gallery/admin/featured/route.ts:14`, `app/api/gallery/admin/images/route.ts:25` (all three inside a local `checkAuth()` helper that returns the boolean/user directly, not an inline `if`), `app/api/gallery/admin/reorder/route.ts:24` (inline `if` guard, no helper).
- `auth.collab`: `app/api/auth/collab/route.ts:21` — the final (`else`) branch of a nested ternary chain; the `sop-*` branch (`pages.member`) was already converted in Phase 1 and stays untouched.
- `intel.generateImages`: `app/api/ai/intel/generate/route.ts:23`, `app/api/ai/images/save-crop/route.ts:20`.
- `intel.viewAllImages`: `app/api/ai/images/route.ts:23`, `app/api/ai/images/[id]/file/route.ts:25`.
- `uploads.bio`: `app/api/uploads/bio/route.ts:42`.

## Migration

One-off script (Mongo-only, dry-run + `--apply`, same convention as every prior migration script this session): grants each of the 6 keys on the one department base role named in the Goals table (`$addToSet` on `Db.departmentRoles`' `permissions` array, matching Phase 1's `pages.member` migration script's shape exactly — same 7-base-roles lookup, just a different, smaller set of `{role, key}` pairs to apply).

## Risks / follow-ups (not blocking this batch)

- The 6 people who hold `HQ Staff` but are in no department at all (confirmed via live-data check during brainstorming) lose all 4 `HQ Staff`-gated abilities in this batch once it ships, with no automatic replacement — consistent with the established rule and the Phase 1 precedent (only real department/ORBAT holders get permissions going forward), not a bug.
- `optionals/me/route.ts:30`'s `isAdmin` boolean and `ai/images/[id]/file/route.ts:25`'s `canViewAll` boolean are both non-`if`-guard call sites (mirrors Phase 1's `api/me/route.ts` pattern) — same conversion shape, just assigned to a variable instead of gating a `return`.
