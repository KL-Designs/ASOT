# Permission System Migration — Phase 2, Batch 2: Department Leadership

**Date:** 2026-08-11
**Status:** Approved for planning

## Problem

Batch 1 ([[2026-08-11-permission-system-migration-phase2-batch1-design]]) migrated 6 small, single-purpose keys. This batch tackles the next natural cluster: **`departmentLeads`** (`j1`–`j7`, 52 call sites across ~45 files) plus **`quiz`** (`assign`/`review`/`reviewEscalated`, 5 call sites in 5 files) and **`meetings`** (`lockJ1`–`lockJ7`, all inside a single file). All three categories are gated by the *same* three Discord role names per department — e.g. `departmentLeads.j1`, and every J1 sub-key of `quiz`/`meetings`, all list `['J1 - Department Leader', 'J1 - Head Recruiter', 'J1 - Recruiter Trainer']` (or that department's equivalent 3-role set). They're all really one check — "is this person department leadership" — asked from different places.

That check now has a direct, already-built home: this session's earlier work gave every department's Leader/2IC/3IC positions a real `DepartmentRole` via `linkedSlot` (`'leader'|'2ic'|'3ic'`), assignable and editable through the Department Roles editor. Live-data check confirms this is largely already in place (18 of 30 `department_roles` documents currently have `linkedSlot` set).

## Goals

1. Convert all 52 `departmentLeads.j1`–`j7` call sites, all 5 `quiz.*` call sites, and the single `meetings.lockJ1`–`lockJ7` file (7 keys, 1 file with an internal per-department branch) to `hasPermission()`.
2. Migration script grants each key on **all three** of that department's slot-linked `DepartmentRole`s (leader + 2ic + 3ic) — matching the OR semantics of the old 3-role array exactly: holding *any* of the three leadership positions qualifies, same as today.
3. **J4 also gets every one of these keys granted on its own base `DepartmentRole`**, preserving J4's current cross-department reach (today implicit via `hasRoles()`'s hardcoded `J4-Administration` global bypass; `hasPermission()` has no such bypass, only `OVERRIDE`, so this must become an explicit grant or J4 admins silently lose the ability to act as department-lead-equivalent everywhere these keys gate — approving tickets, locking meetings, reviewing quizzes — for every department but their own).
4. `meetings.lockJ4` and `quiz.reviewEscalated`'s existing `J4 - Administration`/`J4-Administration` entries are already covered by Goal 3's blanket J4 grant — no separate handling needed.

## Non-goals

- `departments.j1`–`j7` (plain membership, not leadership) — a much larger, separate future batch (135 call sites).
- Any other category — `training` (112), `admin` (55), `pages.admin`/`pages.members`/`pages.operationsEdit` (53), `operations`, `masterSheet`, `tickets`, `communityTickets`, `trainingGuides`, `members`, `ai`, `trainingDocs`, `sops` — separate future batches.
- Introducing any new role type. Every grant in this batch lands on `DepartmentRole`s that already exist (slot-linked roles, base roles) — no new catalog entries beyond what the migration script creates as a fallback (see Migration below).
- Removing `PERMISSIONS`, `hasRoles()`, or the `J4-Administration` hardcode — still Phase 3.

## Migration

One-off script (Mongo-only, dry-run + `--apply`, same shape as every prior migration script this session):

For each department `d` in `{j1, j2, j3, j5, j6, j7}`:
- Look up `d`'s three slot-linked roles (`Db.departmentRoles.findOne({department: d, linkedSlot: 'leader'|'2ic'|'3ic'})` — some departments have fewer than 3 configured slots, e.g. any department where the earlier leadership-slot migration hasn't been run or a slot was never linked).
- For each slot role found, `$addToSet` the corresponding key (`departmentLeads.d`, and for `d === 'j3'` also all 3 `quiz.*` keys, and for every `d` also `meetings.lockD`) onto its `permissions` array.
- If a slot isn't linked yet, print a warning and skip it (matching `migrate-pages-member-permission.mjs`'s established pattern for a missing dependency) — this is surfaced to the human operator for review before `--apply`, not silently worked around.

Separately, grant every one of these keys (`departmentLeads.j1`–`j7`, all 3 `quiz.*`, `meetings.lockJ1`–`lockJ7`) on J4's base `DepartmentRole`.

## Call sites (high-level; exact file-by-file detail is plan-writing work, not design)

- `departmentLeads.j1`: 8 files (J1 admin routes, dashboard J1/layout/root pages).
- `departmentLeads.j2`: 23 files (the largest single key — J2 workspace/dev-checks/operations routes are extensive).
- `departmentLeads.j3`: 5 files.
- `departmentLeads.j5`: 2 files.
- `departmentLeads.j6`: 1 file.
- `departmentLeads.j7`: 1 file.
- `quiz.*`: 5 files.
- `meetings.lockJ1`–`lockJ7`: 1 file (`app/api/admin/meetings/[id]/lock/route.ts`), internally branching per department — verify during plan-writing whether this is a lookup table or a long if/else chain, since that shapes the conversion.

All call-site patterns seen so far are variants already handled in Batches 1/Phase 1: simple `if`-guards, boolean-assignment (`const canManageMembers = client.hasRoles(...)`), and multi-line blocks — no new pattern shape expected, but each file still needs individual verification during plan-writing (per this session's established discipline of reading every file before writing its exact diff).

## Risks / follow-ups (not blocking this batch)

- `departmentLeads.j2`'s 23 files make this the largest single-key conversion so far (larger than any of Phase 1's `pages.member` sub-groupings) — likely warrants its own implementation task within the plan rather than being lumped with the smaller department keys, for reviewability.
- Departments whose leadership slots aren't fully linked yet (2ic/3ic slots specifically, per the 18/30 live-data check) will have those specific slot-roles skipped by the migration script until an admin links them via the Department Roles editor — a real, visible gap the dry-run report surfaces, not silently masked.
