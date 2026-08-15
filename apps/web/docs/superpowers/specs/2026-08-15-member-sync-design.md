# Member Sync

**Date:** 2026-08-15
**Status:** Approved for planning

## Problem

Discord role / TeamSpeak group grants can drift out of sync with what a member's ORBAT position and department roles actually entitle them to — a role catalog edit doesn't retroactively re-grant/revoke for existing holders, manual Discord/TeamSpeak admin actions can silently diverge from the site's record, and the only existing reconciliation tool (`POST /api/admin/members/sync-dept`) is department-scoped, apply-only (no preview), covers department roles only (not ORBAT positions), and is buried inside each department's own member tab rather than visible from one place.

There's no way for J4 to see, at a glance, which members are out of sync and by how much, before anything gets changed.

## Goals

1. A new **Member Sync** tab in the Roles Manager (`RolesManagerPanel.tsx`), alongside ORBAT Roles / Department Roles / Permissions Explorer.
2. A read-only report, computed on demand, covering every member who holds an ORBAT position and/or department membership ("on roster"), plus a separate list for everyone else ("off roster") checked for stray leftover grants.
3. Per-member status: **red/urgent** if they're missing a grant they should have, **orange** (less urgent) if they hold a grant they shouldn't, computed independently so a member with both still shows the full picture once expanded.
4. Expanding a member's row shows the specific Discord roles / TeamSpeak groups missing or extra, with human-readable names, attributed to the department/ORBAT role each expectation came from.
5. Two ways to act, both gated behind a confirmation dialog that lists the exact grant/revoke diff before anything is written: a per-member "Sync" button, and a global "Sync All" that applies every out-of-sync member's diff in one action.

## Non-goals

- Not a live/polling view — computed once when the tab opens, with a manual refresh button. No websocket/SSE push.
- Not a permissions audit — this only covers Discord role / TeamSpeak group grants, not `hasPermission()` keys.
- Not touching the existing per-department `sync-dept` button in `DeptMembersTab.tsx` — it keeps working as-is; this tab is additive, not a replacement.
- No new database collections or schema changes — this is entirely computed from existing data (`users`, `orbat_positions`, `orbat_roles`, `orbat_section_meta`, `department_roles`) plus live Discord/TeamSpeak state.

## Roster classification

- **On roster**: `user.departments` is non-empty, OR an `orbat_positions` doc exists with `userId` = them (this includes reservist positions — `activeReservist`/`inactiveReservist` share the same collection).
- **Off roster**: everyone else. Still evaluated against the managed-ID universe (below) so a stray leftover grant is still caught.

## Expected-grants computation

For each on-roster member, the union of:

- **Department**: for every department in `user.departments`, that department's base `DepartmentRole` (`isBase: true`) plus any of the member's `departmentRoleIds` belonging to that department — same logic `sync-dept` already uses, generalized to loop every department the member is in rather than one passed-in department.
- **ORBAT position**: the `OrbatRole` referenced by their `orbat_positions.roleId`, plus — since `lib/orbat/orbat-sync.ts` already grants these on assignment — the `OrbatSectionMeta` category-level and (if set) section-level `discordRoleId`/`tsGroupId` for their position's `category`/`sectionTitle`. Omitting these would make the report flag false positives for anyone in a section carrying a platoon-level Discord role.

Each source's `discordRoleIds`/`tsGroupIds` (or singular `discordRoleId`/`tsGroupId` for section meta) are unioned into one expected set per member, tagged with which source(s) contributed each ID (for the expanded-row attribution).

**Managed-ID universe**: the union of every `discordRoleIds`/`tsGroupIds` value appearing anywhere across the `DepartmentRole` catalog, the `OrbatRole` catalog, and `OrbatSectionMeta`. Only IDs in this set are ever flagged as "extra" — an unrelated Discord role (rank, event, etc.) is never touched or reported on, matching `sync-dept`'s existing containment behavior.

## Live state

- Discord: one `fetchAllGuildMembers()` call, same as `sync-dept`.
- TeamSpeak: `getClientServerGroupIds(cldbid)` per member with a linked TeamSpeak account, run in parallel — same pattern `sync-dept` already uses, just across the full roster instead of one department. Members with no linked TeamSpeak account are reported as "TeamSpeak not linked" rather than treated as missing every TS group.

## Status computation

Per member, per grant type (Discord/TeamSpeak):

- `missing = expected − actual`
- `extra = (actual ∩ managedIds) − expected`

Overall status: **red** if `missing.length > 0` (regardless of `extra`), else **orange** if `extra.length > 0`, else **green** (in sync). The expanded row always lists both `missing` and `extra` separately, with IDs resolved to names (`client.roles`/`Db.roles` for Discord, `getGroupCache()` for TeamSpeak) and grouped by contributing source.

## API surface

New permission gate: none — reuses `PERMISSIONS.admin.manageOrbatRoles` (J4-Administration), the same key that already gates the whole Roles Manager panel's visibility.

- `lib/orbat/member-sync.ts` — new module, exports `computeMemberSyncReport(): Promise<MemberSyncReport>` (the shared computation described above) and `applyMemberSyncFixes(userIds?: string[]): Promise<MemberSyncApplyResult>` (re-fetches live state, re-diffs, then grants/revokes via the existing `addGuildRole`/`removeGuildRole`/`applyTsServerGroups` primitives — never trusts a diff computed earlier in the request lifecycle, since Discord/TeamSpeak state can move between report-open and confirm-click).
- `GET /api/admin/orbat/member-sync` — returns the full report: `{ onRoster: MemberSyncEntry[], offRoster: MemberSyncEntry[] }`.
- `POST /api/admin/orbat/member-sync/apply` — body `{ userIds?: string[] }` (omitted = every currently out-of-sync member). Used by both the per-member Sync button (`userIds: [id]`) and Sync All (omitted). Returns per-member applied counts; logs one `logAction()` entry per invocation (category `'member'`, action `'member.sync.apply'`), matching `sync-dept`'s logging shape.

```ts
interface MemberSyncEntry {
    userId: string
    name: string
    avatarURL: string
    status: 'red' | 'orange' | 'green'
    discord: { missing: GrantDetail[]; extra: GrantDetail[] }
    teamspeak: { missing: GrantDetail[]; extra: GrantDetail[]; linked: boolean }
}
interface GrantDetail {
    id: string | number
    name: string
    source: string   // e.g. "Department: J5 base role", "ORBAT: Platoon Lead", "ORBAT section: Alpha Company"
}
```

## UI

New `MemberSyncTab.tsx`, mounted as a 4th tab in `RolesManagerPanel.tsx`'s existing tab bar/switch (`orbat` | `department` | `permissions` | `member-sync`).

- Fetches the report on mount; a "Refresh" button re-fetches on demand (this can be a few seconds for a full roster — show a loading state, not a blocking spinner over the whole dialog).
- **On Roster** list: one row per member (avatar, name, status pill showing color + missing/extra counts), sorted red-then-orange-then-green. Clicking a row expands it inline to show the full `discord`/`teamspeak` breakdown grouped by source, plus a per-row "Sync" button.
- **Off Roster** list: same row/expand shape, collapsed by default (it's expected to mostly be empty), only members with non-green status are worth surfacing prominently — a small "N off-roster members with stray grants" summary line, expandable to the full list.
- "Sync All" button in the tab header — disabled when everyone is green. Clicking opens a confirmation dialog summarizing the aggregate diff (grouped by grant, not by member, to keep it scannable) before calling `POST .../apply` with no `userIds`.
- Per-member "Sync" button in the expanded row opens the same style of confirmation dialog, scoped to that member's diff, before calling `POST .../apply` with `userIds: [id]`.
- After a successful apply (either kind), re-run the report fetch so the list reflects the new state rather than trusting the apply response to patch local state.

## Risks / follow-ups (not blocking this build)

- A full-roster report does one TeamSpeak lookup per linked member sequentially-in-parallel (`Promise.all`) — fine at this unit's scale, not built for a much larger roster.
- `OrbatSectionMeta` section-level grants are keyed by `(category, sectionTitle)` string match, same as `orbat-sync.ts` already relies on — if a section is renamed without updating `OrbatSectionMeta`, both the live sync and this report silently stop applying that grant. Pre-existing fragility, not introduced by this feature.
- No bulk "off roster, clean everyone up" shortcut beyond the shared Sync All — acceptable since off-roster stray grants are expected to be rare.
