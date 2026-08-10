# Department Roles as Source of Truth for Leadership, Membership Sync & UI Polish

**Date:** 2026-08-10
**Status:** Approved for planning

## Problem

Department Roles ([[2026-08-10-department-roles-design]]) shipped a catalog of
base + sub-roles per department that grant real Discord roles, TeamSpeak
groups, and permissions. Two things it deliberately left alone are now a
source of confusion and drift:

1. **Leadership positions are a separate, disconnected system.** Each
   department's Department Leader / 2IC / 3IC ("Team Leader"/"Assistant Team
   Leader" etc, per department — see `DEPT_LEADERSHIP_POSITIONS` in
   `DeptMembersTab.tsx`) are tracked by three flat arrays on `User`
   (`teamLeadDepts`, `dept2icRoles`, `dept3icRoles`), set via ticket actions
   (`set-lead`/`set-2ic`/`set-3ic`). Separately, admins have been creating
   `DepartmentRole` catalog entries with the *same names* ("Department
   Leader", "Team Leader", "Assistant Team Leader") so they can grant
   Discord/TS/permissions to the position — but toggling that role button
   doesn't make someone the position holder, and being the position holder
   doesn't grant the role. The J7 Members page visibly shows both: a ★
   badge + Position column driven by the arrays, and an unrelated
   "Department Leader" toggle button in the Roles column.
2. **The Discord sync button pulls the wrong direction.** `Sync Discord` on
   each department's Members page (`POST /api/admin/members/sync-dept`)
   scans real Discord role holders and *adds* any it finds onto the website
   (`user.departments`/`teamLeadDepts`) — a Discord→website discovery flow,
   additive only, Discord-only (no TeamSpeak), and only covers the plain
   member + lead Discord roles (not sub-roles, not 2IC/3IC, not TS groups).
   It does nothing to fix drift where a member's *actual* Discord roles or
   TS groups no longer match what their held Department Roles say they
   should have.

Also, a known gap from the previous build: `app/api/admin/tickets/route.ts`'s
`department-membership` handler excludes `j4`/`j5` from its `validDepts`
list, so neither `syncDeptDiscordRole()` nor base-role Discord/TS sync ever
runs for those two departments today.

## Goals

1. Each leadership slot (Leader/2IC/3IC) can be linked, per department, to a
   specific `DepartmentRole`. Once linked, "who holds the position" and "who
   holds the role" become the same question — assigning a member to the slot
   *is* assigning them that role (single holder, auto-replacing whoever held
   it before), and the ★ badge / Position column are derived from role
   holding instead of the old arrays.
2. Department membership stays represented by `User.departments` (unchanged
   storage — no new field), but this build makes it a strict, reliable
   mirror of "holds that department's base `DepartmentRole`" by closing the
   J4/J5 gap and routing every membership-affecting action through the same
   base-role grant/revoke path.
3. The Members page sync button becomes a full push reconciliation: for
   every current department member, force their actual Discord roles and
   TeamSpeak groups to exactly match the union of grants from every
   `DepartmentRole` they hold in that department (base + sub-roles + linked
   slot role) — adding what's missing, removing what shouldn't be there.
   Discord-discovery (scanning for new members) goes away.
4. Row hover highlight and non-layout-shifting toast feedback on the
   Department Members table — **already shipped** in this branch
   (`DeptMembersTab.tsx`), included here for completeness, not part of the
   implementation plan.

## Non-goals

- No change to `PERMISSIONS.departments.*` / `PERMISSIONS.departmentLeads.*`
  gates — those check live Discord roles directly via `hasRoles()` and are
  unaffected by this build (they already benefit transitively once Discord
  role grants are correct).
- No UI for bulk-editing multiple departments' slot links at once — one
  department's Department Roles tab at a time, same granularity as
  everything else in that editor.
- Not touching `hasPermission()`'s existing base-role/sub-role permission
  check (`lib/orbat/hasPermission.ts`) — it already reads `user.departments`
  for the base-role grant and `user.departmentRoleIds` for sub-roles; slot
  roles are just regular sub-roles from its point of view, no change needed.
- Sub-role/base-role catalog CRUD, permission picker, etc. — unchanged from
  the previous build.

## Data model

`DepartmentRole` (`types/department-role.d.ts`) gains one field:

```ts
    linkedSlot: 'leader' | '2ic' | '3ic' | null   // null for base roles and unlinked sub-roles
```

Uniqueness is enforced in application code, not a DB index: setting
`linkedSlot` on a role clears it from whichever other role in the same
`department` previously held that value (single write path — see API
surface below).

`User.teamLeadDepts` / `dept2icRoles` / `dept3icRoles` stop being written by
any code path this build touches (ticket route's `set-lead`/`set-2ic`/
`set-3ic`/`remove-lead`/`remove-2ic`/`remove-3ic` actions are re-implemented
against `linkedSlot` role holding instead). The fields themselves stay in
`types/user.d.ts` and in the database, unused, rather than being deleted —
cheap to keep, avoids a destructive migration, and leaves a rollback path.

`User.departments` is unchanged in shape and remains the membership record.
No new "membership" field is introduced.

## Leadership slot linking & assignment

### Configuring the link (J4 only — `PERMISSIONS.admin.manageDepartmentRoles`)

`DepartmentRolesTab.tsx`'s role editor gains a "Linked Position" dropdown,
shown only for non-base roles, with options `None` / the department's
slot-1 label / slot-2 label / slot-3 label (pulled from
`DEPT_LEADERSHIP_POSITIONS`, moved to a shared location — see below —
so both this tab and `DeptMembersTab.tsx` reference the same constant).
Selecting a slot for role A that's currently linked to role B clears B's
`linkedSlot` in the same request (two sequential `updateOne` calls, not
wrapped in a transaction — this is a J4-only admin screen with no
concurrent-editor scenario in practice, same assumption the rest of the
Roles Manager already makes).

`DEPT_LEADERSHIP_POSITIONS` moves from `DeptMembersTab.tsx` to
`lib/discord/dept-codes.ts` (already the dependency-free, client-safe home
for `DEPT_CODES`) so `DepartmentRolesTab.tsx` can import it too without
pulling in server-only code.

### Assigning a member to a slot (department leads or J4, as today)

The Leadership card on `DeptMembersTab.tsx` keeps its existing "+ Assign" /
"Remove" UI and still goes through `POST /api/admin/tickets` with
`type: 'department-membership'` and `memberAction` one of
`set-lead`/`set-2ic`/`set-3ic`/`remove-lead`/`remove-2ic`/`remove-3ic` (no
frontend contract change — only the server-side handling changes):

- `set-*`: look up the department's role with the matching `linkedSlot`. If
  none is linked, 400 with a clear error ("Link a role to this position in
  Department Roles first") — the frontend shows this as the existing error
  toast, and the Assign button is additionally disabled client-side (row
  shows "Not linked — configure in Department Roles" in place of the
  Autocomplete) once `DeptMembersTab` knows the slot has no linked role.
  Otherwise: if the role currently has a holder, revoke their grants and
  `$pull` the role id from their `departmentRoleIds` — this does not touch
  their base department membership, they keep it; ensure the new holder
  has base department membership first
  (grant base role if they don't — occupying a leadership slot implies
  membership), then `$addToSet` the role id onto their `departmentRoleIds`
  and apply its Discord/TS grants.
- `remove-*`: revoke the current slot holder's grants for that role and
  `$pull` it from their `departmentRoleIds`. Does not remove base
  membership — removing someone from a leadership slot doesn't remove them
  from the department.

Slot-linked roles are excluded from the generic per-member "Roles" toggle
column in `DeptMembersTab.tsx`'s member table (`deptRoles` filter also
excludes `r.linkedSlot !== null`, not just `!r.isBase`) — that UI has no
single-holder guarantee, so slot assignment stays exclusively in the
Leadership card.

The ★ badge and Position column in the member table are computed the same
way as today conceptually, but from role holding: for each member, look up
whether their `departmentRoleIds` includes the department's `leader`-linked
role id (★, Position = slot-1 label), else the `2ic`-linked role id
(Position = slot-2 label), else `3ic`-linked (Position = slot-3 label).

## Department membership integrity

No schema or storage change. `user.departments` continues to be the
membership record, set/cleared by the `department-membership` ticket's
`add`/`remove` actions exactly as today. This build:

- Removes the `validDepts` restriction in `app/api/admin/tickets/route.ts`'s
  `department-membership` handler so `syncDeptDiscordRole()` and base-role
  Discord/TS sync (`applyBaseDepartmentRoleSync`/`revokeDepartmentSubRoles`)
  run for all 7 departments, not just the current 5 — closing the
  acknowledged J4/J5 gap from the previous build.
- Extends the `remove` action to also revoke any slot-linked role the
  member holds in that department (on top of the sub-roles it already
  revokes via `revokeDepartmentSubRoles`), so removing someone from a
  department also vacates any leadership position they held in it.
- Relies on the new full-reconcile sync (below) to correct any historical
  drift — members who were marked in `user.departments` before the base-role
  grant mechanism existed, or whose real Discord/TS state has drifted since.

## Sync button → full push reconciliation

`POST /api/admin/members/sync-dept` is rewritten (same route, same
`{department}` request body, same J4-only gate):

1. Load every current member of the department (`user.departments` contains
   `department`).
2. Load every `DepartmentRole` in that department (base + subs, including
   slot-linked ones) to build the department's full "managed" grant set —
   every Discord role ID and TS group ID that appears on *any* role in this
   department's catalog.
3. For each member, compute the union of Discord role IDs / TS group IDs
   from the specific roles they hold (base role always; plus any
   `departmentRoleIds` entries scoped to this department, which now
   includes slot roles).
4. Compare against their actual current Discord roles (already fetched via
   `fetchAllGuildMembers()`, as today) and actual TS group membership
   (`lib/teamspeak/groups.ts`). Grant what's missing, revoke what's present
   but shouldn't be — **but only ever touch a role/group ID that's part of
   this department's managed set from step 2**, so grants from other
   departments, rank roles, event roles, etc. are never touched.
5. Response shape changes from `{membersAdded, leadsAdded, scanned}` to
   `{membersChecked, discordGranted, discordRevoked, tsGranted, tsRevoked}`;
   the frontend's success message and button label update to match
   ("⟳ Sync Discord & TeamSpeak").

No more Discord-discovery: members are only ever added to a department via
the existing `department-membership` ticket `add` action (or the leadership
slot assignment auto-add-membership behavior above), never by this sync.

## UI summary (delta from what's already shipped)

- `DeptMembersTab.tsx`: Leadership card rows read/write via the redesigned
  ticket actions above (no visible change to the Assign/Remove flow itself,
  except the "not linked yet" state); member table's Roles column excludes
  slot-linked roles; ★/Position derived from role holding; sync button
  renamed and its success message updated for the new response shape.
- `DepartmentRolesTab.tsx`: new "Linked Position" dropdown in the role
  editor (non-base roles only).
- `lib/discord/dept-codes.ts`: gains the `DEPT_LEADERSHIP_POSITIONS`
  constant (moved from `DeptMembersTab.tsx`).

## Migration (one-off script, dry-run + `--apply`, following
`scripts/migrate-orbat-roles.mjs`'s pattern)

`scripts/migrate-department-leadership.mjs`:

1. For each department and each of its 3 configured slots (skipping empty
   labels, e.g. J4 has no slot 2/3): if a non-base `DepartmentRole` in that
   department exactly matches the slot's label text, set its `linkedSlot`.
   Otherwise, create a new empty-grant `DepartmentRole` named after the
   label and set its `linkedSlot` — so no department loses a visibly
   distinct position mid-migration.
2. For each department, for each legacy `teamLeadDepts`/`dept2icRoles`/
   `dept3icRoles` holder, `$addToSet` the now-linked role's id onto their
   `departmentRoleIds` and apply its Discord/TS grants for real (idempotent
   — safe to re-run).
3. Report counts (roles linked/created, users migrated) in dry-run mode
   before `--apply` writes anything, exactly like the ORBAT roles migration
   script does.

This script is a one-time operational step run manually after deploy, not
part of the request-time code path.

## Risks / follow-ups (not blocking this build)

- Steps 2–4 of the sync reconciliation call Discord/TeamSpeak once per
  member per department; acceptable at this unit's roster scale (same
  reasoning as the previous build's sub-role deletion cascade), not
  optimized for bulk operations.
- If two departments' catalogs happen to grant the *same* Discord role ID
  (e.g. a shared "Staff" role appears on both J3's and J7's base role), the
  "only touch this department's managed set" scoping in step 4 is correctly
  conservative per-department, but a member in both departments still gets
  that shared role correctly granted by either sync — no double-revoke risk
  since revocation only happens when the role isn't in *that department's*
  computed should-have set, not a global one. Worth a manual sanity check
  after this ships if any such overlaps exist in the live catalog, but nothing
  in the design needs to change for it.
