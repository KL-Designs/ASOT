# Department Roles as Source of Truth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Department Roles the single source of truth for department leadership positions (Leader/2IC/3IC), close the J4/J5 gap in department-membership sync, and rewrite the Discord/TeamSpeak sync button as a full push reconciliation instead of a Discord-discovery pull.

**Architecture:** `DepartmentRole` gains a `linkedSlot` field (`'leader'|'2ic'|'3ic'|null`) — at most one role per department holds a given slot. Leadership-slot assignment becomes ordinary `DepartmentRole` holding (stored in the existing `User.departmentRoleIds`), replacing the flat `teamLeadDepts`/`dept2icRoles`/`dept3icRoles` arrays as the write path (the fields stay in the type/DB, unused, for rollback safety). `User.departments` is untouched in shape and remains the membership record; this build only closes the gap that let it drift from "holds the base role" (the tickets route's department-membership handler stops excluding j4/j5) and adds a real full-reconcile sync to fix any live-state drift going forward. New helpers `assignLeadershipSlot`/`unassignLeadershipSlot` in `lib/discord/dept-roles.ts` encapsulate the single-holder grant/revoke logic; a one-off Mongo-only migration script links/creates the 21 slot roles (7 depts × 3 slots, minus empty labels) and backfills legacy holders.

**Tech Stack:** Next.js 15 App Router, MongoDB, MUI, TypeScript (4-space indent, single quotes, no semicolons — existing repo style).

## Global Constraints

- No test suite exists in this repo. Verification is `npx tsc --noEmit -p tsconfig.json` (run from `apps/web`) plus manual code tracing. Browser testing is not possible in this environment — a standing, accepted limitation.
- Code style: 4-space indent, single quotes, no semicolons, matching every existing file touched.
- `linkedSlot` values are exactly `'leader' | '2ic' | '3ic' | null` — never abbreviate or rename these three strings, they're used as literal Mongo field values and object keys across multiple files.
- Base roles (`isBase: true`) can never have a `linkedSlot` — leadership slots are always regular sub-roles. Reject with 400 if attempted.
- At most one role per department holds a given `linkedSlot` value — enforced in application code (not a DB index) by clearing it from whichever role held it before, every time it's set.
- `DEPT_LEADERSHIP_POSITIONS` (department → `[leaderLabel, 2icLabel, 3icLabel]`, empty string = department has no such slot) is the single source of truth for slot labels — lives in `lib/discord/dept-codes.ts` (dependency-free, client-safe) and is imported everywhere a label is needed, never hardcoded a second time except in the standalone migration script (which can't import TS/Next.js modules — see Task 6).
- `revokeDepartmentSubRoles()` (`lib/discord/dept-roles.ts`) already revokes every `DepartmentRole` a member holds via `User.departmentRoleIds` scoped to a department, regardless of whether it's a plain sub-role or a `linkedSlot` role — no code change needed there, only a doc-comment update, since slot roles are stored identically to sub-roles.
- Whenever a task adds or meaningfully changes a route/page/lib/type file, update the relevant `docs/map/*.md` file(s) in the same task (per `apps/web/CLAUDE.md`'s "Site Map" section) — folded into that task's steps below, not a separate task.
- The one-off migration script (Task 6) only touches MongoDB — it never calls Discord or TeamSpeak APIs (those require the running app's bot token / TS connection, not available to a standalone script). Real Discord/TeamSpeak grants for migrated roles are applied afterward by running the new "Sync Discord & TeamSpeak" button (Task 5) once per department.

---

### Task 1: Data model & shared helpers

**Files:**
- Modify: `apps/web/types/department-role.d.ts`
- Modify: `types/user.d.ts` (monorepo root — shared with `apps/bot`)
- Modify: `apps/web/lib/discord/dept-codes.ts`
- Modify: `apps/web/app/dashboard/DeptMembersTab.tsx`
- Modify: `apps/web/lib/teamspeak/groups.ts`
- Modify: `apps/web/app/api/admin/department-roles/route.ts`
- Modify: `apps/web/docs/map/h-lib-types-components.md`

**Interfaces:**
- Produces: `DepartmentRole.linkedSlot: 'leader' | '2ic' | '3ic' | null`; `User.dept2icRoles?: string[]`, `User.dept3icRoles?: string[]` (formalizing fields already read/written elsewhere but never declared); `DEPT_LEADERSHIP_POSITIONS: Record<string, [string,string,string]>`, `LeadershipSlot` type, `LEADERSHIP_SLOT_INDEX: Record<LeadershipSlot, 0|1|2>` (all from `lib/discord/dept-codes.ts`); `getClientServerGroupIds(cldbid: number): Promise<number[]>` (from `lib/teamspeak/groups.ts`).

- [ ] **Step 1: Add `linkedSlot` to the `DepartmentRole` type**

In `apps/web/types/department-role.d.ts`, find:

```ts
    interface DepartmentRole {
        _id: ObjectId
        department: string           // 'j1'..'j7' — see lib/discord/dept-roles.ts's DEPT_ROLES for the valid set
        name: string
        isBase: boolean              // true only for the 7 seeded base roles
        discordRoleIds: string[]     // same shape/handling as OrbatRole.discordRoleIds
        tsGroupIds: number[]         // same shape/handling as OrbatRole.tsGroupIds
        permissions: string[]        // granted permission keys — see lib/permissions-catalog.ts
        createdAt: Date
        createdBy: string            // Discord ID
        createdByName: string
    }
```

Replace with:

```ts
    interface DepartmentRole {
        _id: ObjectId
        department: string           // 'j1'..'j7' — see lib/discord/dept-roles.ts's DEPT_ROLES for the valid set
        name: string
        isBase: boolean              // true only for the 7 seeded base roles
        discordRoleIds: string[]     // same shape/handling as OrbatRole.discordRoleIds
        tsGroupIds: number[]         // same shape/handling as OrbatRole.tsGroupIds
        permissions: string[]        // granted permission keys — see lib/permissions-catalog.ts
        linkedSlot: 'leader' | '2ic' | '3ic' | null   // this role IS the department's Leader/2IC/3IC position when set — always null for base roles; at most one role per department holds a given value
        createdAt: Date
        createdBy: string            // Discord ID
        createdByName: string
    }
```

- [ ] **Step 2: Add `dept2icRoles`/`dept3icRoles` to `User`**

In `types/user.d.ts` (monorepo root, NOT `apps/web/types/`), find:

```ts
        departments?: string[]   // dept codes this user is a member of, e.g. ['j1', 'j3']
        teamLeadDepts?: string[] // dept codes this user is a team lead of, e.g. ['j3']
        departmentRoleIds?: ObjectId[]  // DepartmentRole sub-role ids this member holds (never base roles)
        isChaplain?: boolean
```

Replace with:

```ts
        departments?: string[]   // dept codes this user is a member of, e.g. ['j1', 'j3']
        teamLeadDepts?: string[] // legacy — no longer written; leadership is now a DepartmentRole holding, see departmentRoleIds
        dept2icRoles?: string[]  // legacy — no longer written, same reason
        dept3icRoles?: string[]  // legacy — no longer written, same reason
        departmentRoleIds?: ObjectId[]  // DepartmentRole ids this member holds (sub-roles AND leadership-slot roles; never base roles)
        isChaplain?: boolean
```

- [ ] **Step 3: Add `DEPT_LEADERSHIP_POSITIONS` to `dept-codes.ts`**

Replace the full contents of `apps/web/lib/discord/dept-codes.ts` with:

```ts
// Plain department-code list — deliberately dependency-free (no Db/Mongo
// imports) so client components can safely import it. Server code that also
// needs Discord role-name mappings per department should use DEPT_ROLES in
// dept-roles.ts instead (never import that file from a 'use client' module —
// it pulls in the full mongodb driver via Db, which breaks client bundling).
export const DEPT_CODES = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7'] as const

export type LeadershipSlot = 'leader' | '2ic' | '3ic'

// Leadership position labels per department: [Leader slot, 2IC slot, 3IC
// slot]. An empty string means that department has no such position (e.g.
// J4 has only a Department Leader, no 2IC/3IC). Shared by DeptMembersTab.tsx
// (renders the Leadership card + derives who holds each slot),
// DepartmentRolesTab.tsx (the "Linked Position" picker), and the
// department-roles PATCH route (server-side validation) — dependency-free
// so all three can import it safely. The standalone migration script
// (scripts/migrate-department-leadership.mjs) duplicates this table since
// it can't import TS/Next.js modules — keep both in sync if this changes.
export const DEPT_LEADERSHIP_POSITIONS: Record<string, [string, string, string]> = {
    j1: ['Department Leader', 'Head Recruiter',        'Recruiter Trainer'],
    j2: ['Department Leader', 'Team Leader',            'Creator Trainer'],
    j3: ['Department Leader', 'Head Trainer',           'Assistant Head Trainer'],
    j4: ['Department Leader', '',                       ''],
    j5: ['Department Leader', 'Team Leader',            'Lead Content Creator'],
    j6: ['Department Leader', 'Team Leader',            'Assistant Team Leader'],
    j7: ['Department Leader', 'Team Leader',            'Assistant Team Leader'],
}

export const LEADERSHIP_SLOT_INDEX: Record<LeadershipSlot, 0 | 1 | 2> = { leader: 0, '2ic': 1, '3ic': 2 }
```

- [ ] **Step 4: Point `DeptMembersTab.tsx` at the shared constant**

In `apps/web/app/dashboard/DeptMembersTab.tsx`, find:

```ts
import { Autocomplete, TextField, Typography } from '@mui/material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import { rankNameFromAbbr } from '@/lib/military/ranks'

type MemberOption = {
    id: string
    displayName: string
    currentRank: string | null
    teamLeadDepts: string[]
    dept2icRoles: string[]
    dept3icRoles: string[]
    departmentRoleIds: string[]
}

// Position names per department: [Department Leader, 2IC, 3IC]
const DEPT_LEADERSHIP_POSITIONS: Record<string, [string, string, string]> = {
    j1: ['Department Leader', 'Head Recruiter',        'Recruiter Trainer'],
    j2: ['Department Leader', 'Team Leader',            'Creator Trainer'],
    j3: ['Department Leader', 'Head Trainer',           'Assistant Head Trainer'],
    j4: ['Department Leader', '',                       ''],
    j5: ['Department Leader', 'Team Leader',            'Lead Content Creator'],
    j6: ['Department Leader', 'Team Leader',            'Assistant Team Leader'],
    j7: ['Department Leader', 'Team Leader',            'Assistant Team Leader'],
}
```

Replace with:

```ts
import { Autocomplete, TextField, Typography } from '@mui/material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import { rankNameFromAbbr } from '@/lib/military/ranks'
import { DEPT_LEADERSHIP_POSITIONS } from '@/lib/discord/dept-codes'

type MemberOption = {
    id: string
    displayName: string
    currentRank: string | null
    teamLeadDepts: string[]
    dept2icRoles: string[]
    dept3icRoles: string[]
    departmentRoleIds: string[]
}
```

(`MemberOption` keeps the legacy field names for now — Task 4 removes their remaining uses in this same file.)

- [ ] **Step 5: Add `getClientServerGroupIds` to `lib/teamspeak/groups.ts`**

In `apps/web/lib/teamspeak/groups.ts`, the file currently ends after `applyTsServerGroups`. Append:

```ts

/**
 * Returns the TeamSpeak server group IDs a client currently holds, resolved
 * by cldbid. Returns [] (never throws) if the TS server is unreachable —
 * callers doing a full add/remove reconcile (sync-dept) tolerate this
 * safely: on failure the "should have" set looks entirely missing, so the
 * only effect is a redundant grant attempt, which itself independently
 * no-ops via applyTsServerGroups's own connection-failure handling. Nothing
 * ever gets incorrectly revoked from this failure mode.
 */
export async function getClientServerGroupIds(cldbid: number): Promise<number[]> {
    try {
        const ts = await getConnection()
        const groups = await ts.serverGroupsByClientId(cldbid) as unknown as Array<{ sgid: string | number }>
        return groups.map(g => Number(g.sgid))
    } catch (err) {
        console.error('[TeamSpeak] getClientServerGroupIds failed:', err)
        return []
    }
}
```

- [ ] **Step 6: Set `linkedSlot: null` at the two existing `DepartmentRole` construction sites**

`linkedSlot` is a required field (matching every other field on `DepartmentRole` — none of them are optional), so the two places that already build `DepartmentRole` object literals need it added or they'll fail to compile.

In `apps/web/app/api/admin/department-roles/route.ts`, find:

```ts
    await Db.departmentRoles.insertMany(missing.map(department => ({
        _id: new ObjectId(),
        department,
        name: `${department.toUpperCase()} Base Role`,
        isBase: true,
        discordRoleIds: [],
        tsGroupIds: [],
        permissions: [],
        createdAt: now,
        createdBy: 'system',
        createdByName: 'System',
    })))
```

Replace with:

```ts
    await Db.departmentRoles.insertMany(missing.map(department => ({
        _id: new ObjectId(),
        department,
        name: `${department.toUpperCase()} Base Role`,
        isBase: true,
        discordRoleIds: [],
        tsGroupIds: [],
        permissions: [],
        linkedSlot: null,
        createdAt: now,
        createdBy: 'system',
        createdByName: 'System',
    })))
```

Then find:

```ts
    const newRole: DepartmentRole = {
        _id: new ObjectId(),
        department,
        name,
        isBase: false,
        discordRoleIds,
        tsGroupIds,
        permissions,
        createdAt: new Date(),
        createdBy: me.id,
        createdByName: performedByName,
    }
```

Replace with:

```ts
    const newRole: DepartmentRole = {
        _id: new ObjectId(),
        department,
        name,
        isBase: false,
        discordRoleIds,
        tsGroupIds,
        permissions,
        linkedSlot: null,
        createdAt: new Date(),
        createdBy: me.id,
        createdByName: performedByName,
    }
```

- [ ] **Step 7: Update the doc map**

In `apps/web/docs/map/h-lib-types-components.md`, find:

```
### lib/discord/dept-codes.ts
- `DEPT_CODES: readonly ['j1','j2',...,'j7']` — plain, dependency-free department-code list. Exists so client components can get the valid code set without importing `dept-roles.ts` (which pulls in `Db`/mongodb via its server-only exports and breaks client bundling if imported from a `'use client'` file — this bit `app/dashboard/orbat/DepartmentRolesTab.tsx` once already).
```

Replace with:

```
### lib/discord/dept-codes.ts
- `DEPT_CODES: readonly ['j1','j2',...,'j7']` — plain, dependency-free department-code list. Exists so client components can get the valid code set without importing `dept-roles.ts` (which pulls in `Db`/mongodb via its server-only exports and breaks client bundling if imported from a `'use client'` file — this bit `app/dashboard/orbat/DepartmentRolesTab.tsx` once already).
- `DEPT_LEADERSHIP_POSITIONS: Record<deptCode, [string,string,string]>` — per-department labels for the 3 leadership slots (`[Leader, 2IC, 3IC]`; empty string means that department has no such slot, e.g. J4 has no 2IC/3IC). `LeadershipSlot` type (`'leader'|'2ic'|'3ic'`) and `LEADERSHIP_SLOT_INDEX` (slot → array index). Shared by `DeptMembersTab.tsx`, `DepartmentRolesTab.tsx`, and the department-roles PATCH route.
```

Then find:

```
### lib/teamspeak/groups.ts
- `applyTsServerGroups(userId, action: 'add'|'remove', groupIds: number[]): Promise<{skipped, reason?}>` — shared low-level primitive: resolves the member's `teamspeak.cldbid`, checks `checkTsGate`, then runs `servergroupaddclient`/`servergroupdelclient` for each ID via `getConnection()` (the persistent connection from `lib/teamspeak/cache.ts`). Non-fatal — returns `skipped:true` (never throws) if the member has no linked TS account, is dev-mode-blocked, or the TS server is unreachable. Used by both `syncOrbatTeamspeakGroups` (section-level) and `swapRoleTsGroups` in `lib/orbat/move.ts` (Role-level).
```

Replace with:

```
### lib/teamspeak/groups.ts
- `applyTsServerGroups(userId, action: 'add'|'remove', groupIds: number[]): Promise<{skipped, reason?}>` — shared low-level primitive: resolves the member's `teamspeak.cldbid`, checks `checkTsGate`, then runs `servergroupaddclient`/`servergroupdelclient` for each ID via `getConnection()` (the persistent connection from `lib/teamspeak/cache.ts`). Non-fatal — returns `skipped:true` (never throws) if the member has no linked TS account, is dev-mode-blocked, or the TS server is unreachable. Used by both `syncOrbatTeamspeakGroups` (section-level) and `swapRoleTsGroups` in `lib/orbat/move.ts` (Role-level).
- `getClientServerGroupIds(cldbid): Promise<number[]>` — returns a client's actual current TS server group IDs via `serverGroupsByClientId()`. Returns `[]` (never throws) if TS is unreachable; used by `POST /api/admin/members/sync-dept` to read live state for its full reconcile.
```

- [ ] **Step 8: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/types/department-role.d.ts ../../types/user.d.ts apps/web/lib/discord/dept-codes.ts apps/web/app/dashboard/DeptMembersTab.tsx apps/web/lib/teamspeak/groups.ts apps/web/app/api/admin/department-roles/route.ts apps/web/docs/map/h-lib-types-components.md
git commit -m "Add linkedSlot data model and shared leadership-slot helpers"
```

(If your shell's cwd is `apps/web`, use `../../types/user.d.ts`; if it's the repo root, use `types/user.d.ts` — the important thing is both end up staged.)

---

### Task 2: Leadership slot linking — PATCH route + DepartmentRolesTab UI

**Files:**
- Modify: `apps/web/app/api/admin/department-roles/[roleId]/route.ts`
- Modify: `apps/web/app/dashboard/orbat/DepartmentRolesTab.tsx`
- Modify: `apps/web/docs/map/a-admin-api.md`
- Modify: `apps/web/docs/map/f-dashboard-j5-j7-other.md`

**Interfaces:**
- Consumes: `DEPT_LEADERSHIP_POSITIONS`, `LEADERSHIP_SLOT_INDEX`, `LeadershipSlot` (Task 1, `lib/discord/dept-codes.ts`).
- Produces: `PATCH /api/admin/department-roles/[roleId]` accepts `linkedSlot: 'leader'|'2ic'|'3ic'|null` in its body.

- [ ] **Step 1: Add `linkedSlot` handling to the PATCH route**

In `apps/web/app/api/admin/department-roles/[roleId]/route.ts`, find the import block:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'
import { removeGuildRole } from '@/lib/discord/bot'
import { applyTsServerGroups } from '@/lib/teamspeak/groups'
```

Replace with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'
import { removeGuildRole } from '@/lib/discord/bot'
import { applyTsServerGroups } from '@/lib/teamspeak/groups'
import { DEPT_LEADERSHIP_POSITIONS, LEADERSHIP_SLOT_INDEX, type LeadershipSlot } from '@/lib/discord/dept-codes'
```

Then find:

```ts
    if (Array.isArray(body.discordRoleIds)) updates.discordRoleIds = body.discordRoleIds
    if (Array.isArray(body.tsGroupIds)) updates.tsGroupIds = body.tsGroupIds.filter((id: unknown) => typeof id === 'number')
    if (Array.isArray(body.permissions)) {
        updates.permissions = body.permissions.filter((p: unknown) => typeof p === 'string' && PERMISSION_KEYS.includes(p))
    }

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    await Db.departmentRoles.updateOne({ _id: objectId }, { $set: updates })

    return NextResponse.json({ success: true })
}
```

Replace with:

```ts
    if (Array.isArray(body.discordRoleIds)) updates.discordRoleIds = body.discordRoleIds
    if (Array.isArray(body.tsGroupIds)) updates.tsGroupIds = body.tsGroupIds.filter((id: unknown) => typeof id === 'number')
    if (Array.isArray(body.permissions)) {
        updates.permissions = body.permissions.filter((p: unknown) => typeof p === 'string' && PERMISSION_KEYS.includes(p))
    }
    if ('linkedSlot' in body) {
        if (role.isBase) return NextResponse.json({ error: 'Base roles cannot be linked to a leadership position' }, { status: 400 })
        const slot = body.linkedSlot
        if (slot !== null && slot !== 'leader' && slot !== '2ic' && slot !== '3ic') {
            return NextResponse.json({ error: 'Invalid linkedSlot' }, { status: 400 })
        }
        if (slot !== null) {
            const label = DEPT_LEADERSHIP_POSITIONS[role.department]?.[LEADERSHIP_SLOT_INDEX[slot as LeadershipSlot]]
            if (!label) return NextResponse.json({ error: 'This department has no such leadership position' }, { status: 400 })
        }
        updates.linkedSlot = slot
    }

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    if (updates.linkedSlot) {
        // Only one role per department can hold a given slot — reassigning
        // it clears the slot from whoever held it before.
        await Db.departmentRoles.updateMany(
            { department: role.department, linkedSlot: updates.linkedSlot, _id: { $ne: objectId } },
            { $set: { linkedSlot: null } },
        )
    }

    await Db.departmentRoles.updateOne({ _id: objectId }, { $set: updates })

    return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Add the "Linked Position" picker to `DepartmentRolesTab.tsx`**

In `apps/web/app/dashboard/orbat/DepartmentRolesTab.tsx`, find:

```ts
import {
    TextField, Button, IconButton,
    Checkbox, FormControlLabel, CircularProgress, Alert, Typography, Box, InputAdornment, Tooltip,
} from '@mui/material'
import { ContentCopy, ContentPaste, Delete, Add, Search } from '@mui/icons-material'
import { DEPT_CODES } from '@/lib/discord/dept-codes'
```

Replace with:

```ts
import {
    TextField, Button, IconButton, MenuItem,
    Checkbox, FormControlLabel, CircularProgress, Alert, Typography, Box, InputAdornment, Tooltip,
} from '@mui/material'
import { ContentCopy, ContentPaste, Delete, Add, Search } from '@mui/icons-material'
import { DEPT_CODES, DEPT_LEADERSHIP_POSITIONS, LEADERSHIP_SLOT_INDEX, type LeadershipSlot } from '@/lib/discord/dept-codes'
```

Then find:

```ts
    const [formPermissions, setFormPermissions] = useState<string[]>([])
    const [confirmingDelete, setConfirmingDelete] = useState(false)
```

Replace with:

```ts
    const [formPermissions, setFormPermissions] = useState<string[]>([])
    const [formLinkedSlot, setFormLinkedSlot] = useState<LeadershipSlot | null>(null)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
```

Then find:

```ts
    function startCreate(department: string) {
        if (editingId === `__new__:${department}`) return
        if (!confirmDiscardIfDirty('You have unsaved changes. Discard them and create a new role?')) return
        setEditingId(`__new__:${department}`)
        setFormName('')
        setFormDiscordRoleIds([])
        setFormTsGroupIds([])
        setFormPermissions([])
        setDiscordSearch('')
        setTsSearch('')
        setPermSearch('')
        setError(null)
        setConfirmingDelete(false)
    }

    function startEdit(role: DepartmentRole) {
        if (editingId === String(role._id)) return
        if (!confirmDiscardIfDirty('You have unsaved changes. Discard them and switch role?')) return
        setEditingId(String(role._id))
        setFormName(role.name)
        setFormDiscordRoleIds(role.discordRoleIds)
        setFormTsGroupIds(role.tsGroupIds)
        setFormPermissions(role.permissions)
        setDiscordSearch('')
        setTsSearch('')
        setPermSearch('')
        setError(null)
        setConfirmingDelete(false)
    }
```

Replace with:

```ts
    function startCreate(department: string) {
        if (editingId === `__new__:${department}`) return
        if (!confirmDiscardIfDirty('You have unsaved changes. Discard them and create a new role?')) return
        setEditingId(`__new__:${department}`)
        setFormName('')
        setFormDiscordRoleIds([])
        setFormTsGroupIds([])
        setFormPermissions([])
        setFormLinkedSlot(null)
        setDiscordSearch('')
        setTsSearch('')
        setPermSearch('')
        setError(null)
        setConfirmingDelete(false)
    }

    function startEdit(role: DepartmentRole) {
        if (editingId === String(role._id)) return
        if (!confirmDiscardIfDirty('You have unsaved changes. Discard them and switch role?')) return
        setEditingId(String(role._id))
        setFormName(role.name)
        setFormDiscordRoleIds(role.discordRoleIds)
        setFormTsGroupIds(role.tsGroupIds)
        setFormPermissions(role.permissions)
        setFormLinkedSlot(role.linkedSlot ?? null)
        setDiscordSearch('')
        setTsSearch('')
        setPermSearch('')
        setError(null)
        setConfirmingDelete(false)
    }
```

Then find the `dirty` computation:

```ts
    const dirty = useMemo(() => {
        if (!editingId) return false
        if (newRoleDept) {
            return formName.trim() !== '' || formDiscordRoleIds.length > 0 || formTsGroupIds.length > 0 || formPermissions.length > 0
        }
        if (!editingRole) return false
        return formName.trim() !== editingRole.name
            || !sameMembers(formDiscordRoleIds, editingRole.discordRoleIds)
            || !sameMembers(formTsGroupIds, editingRole.tsGroupIds)
            || !sameMembers(formPermissions, editingRole.permissions)
    }, [editingId, newRoleDept, editingRole, formName, formDiscordRoleIds, formTsGroupIds, formPermissions])
```

Replace with:

```ts
    const dirty = useMemo(() => {
        if (!editingId) return false
        if (newRoleDept) {
            return formName.trim() !== '' || formDiscordRoleIds.length > 0 || formTsGroupIds.length > 0 || formPermissions.length > 0
        }
        if (!editingRole) return false
        return formName.trim() !== editingRole.name
            || !sameMembers(formDiscordRoleIds, editingRole.discordRoleIds)
            || !sameMembers(formTsGroupIds, editingRole.tsGroupIds)
            || !sameMembers(formPermissions, editingRole.permissions)
            || formLinkedSlot !== (editingRole.linkedSlot ?? null)
    }, [editingId, newRoleDept, editingRole, formName, formDiscordRoleIds, formTsGroupIds, formPermissions, formLinkedSlot])
```

Then find `save()`:

```ts
    async function save() {
        if (!formName.trim()) { setError('Name is required'); return }
        setError(null)
        const body: Record<string, unknown> = { discordRoleIds: formDiscordRoleIds, tsGroupIds: formTsGroupIds, permissions: formPermissions }

        let res: Response
        if (newRoleDept) {
            res = await fetch('/api/admin/department-roles', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...body, department: newRoleDept, name: formName.trim() }),
            })
        } else {
            body.name = formName.trim()
            res = await fetch(`/api/admin/department-roles/${editingId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            })
        }
```

Replace with:

```ts
    async function save() {
        if (!formName.trim()) { setError('Name is required'); return }
        setError(null)
        const body: Record<string, unknown> = { discordRoleIds: formDiscordRoleIds, tsGroupIds: formTsGroupIds, permissions: formPermissions }

        let res: Response
        if (newRoleDept) {
            res = await fetch('/api/admin/department-roles', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...body, department: newRoleDept, name: formName.trim() }),
            })
        } else {
            body.name = formName.trim()
            body.linkedSlot = formLinkedSlot
            res = await fetch(`/api/admin/department-roles/${editingId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            })
        }
```

Then find the list-row rendering (the "BASE" badge):

```tsx
                                            {role.isBase && (
                                                <span style={{ flexShrink: 0, fontSize: '0.52rem', fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(100,180,255,0.12)', color: 'rgba(100,180,255,0.85)' }}>
                                                    BASE
                                                </span>
                                            )}
```

Replace with:

```tsx
                                            {role.isBase && (
                                                <span style={{ flexShrink: 0, fontSize: '0.52rem', fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(100,180,255,0.12)', color: 'rgba(100,180,255,0.85)' }}>
                                                    BASE
                                                </span>
                                            )}
                                            {role.linkedSlot && (
                                                <span style={{ flexShrink: 0, fontSize: '0.52rem', fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(251,191,36,0.12)', color: 'rgba(251,191,36,0.85)' }}>
                                                    {DEPT_LEADERSHIP_POSITIONS[role.department]?.[LEADERSHIP_SLOT_INDEX[role.linkedSlot]] ?? role.linkedSlot}
                                                </span>
                                            )}
```

Then find the Name field / base-role note block:

```tsx
                                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', flexShrink: 0 }}>
                                            <TextField
                                                size='small' label='Name' value={formName}
                                                onChange={e => setFormName(e.target.value)}
                                                sx={{ ...inputSx, flex: '1 1 260px' }}
                                            />
                                            {isEditingBase && (
                                                <Typography sx={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', alignSelf: 'center' }}>
                                                    Base role — applies to every department member, can't be deleted.
                                                </Typography>
                                            )}
                                        </Box>
```

Replace with:

```tsx
                                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
                                            <TextField
                                                size='small' label='Name' value={formName}
                                                onChange={e => setFormName(e.target.value)}
                                                sx={{ ...inputSx, flex: '1 1 260px' }}
                                            />
                                            {isEditingBase && (
                                                <Typography sx={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', alignSelf: 'center' }}>
                                                    Base role — applies to every department member, can't be deleted.
                                                </Typography>
                                            )}
                                            {!newRoleDept && !isEditingBase && editingRole && (
                                                <TextField
                                                    select size='small' label='Linked Position' value={formLinkedSlot ?? ''}
                                                    onChange={e => setFormLinkedSlot((e.target.value || null) as LeadershipSlot | null)}
                                                    sx={{ ...inputSx, minWidth: 200 }}
                                                >
                                                    <MenuItem value=''>None</MenuItem>
                                                    {(['leader', '2ic', '3ic'] as const)
                                                        .filter(slot => DEPT_LEADERSHIP_POSITIONS[editingRole.department]?.[LEADERSHIP_SLOT_INDEX[slot]])
                                                        .map(slot => (
                                                            <MenuItem key={slot} value={slot}>
                                                                {DEPT_LEADERSHIP_POSITIONS[editingRole.department][LEADERSHIP_SLOT_INDEX[slot]]}
                                                            </MenuItem>
                                                        ))}
                                                </TextField>
                                            )}
                                        </Box>
```

- [ ] **Step 3: Update the doc map**

In `apps/web/docs/map/a-admin-api.md`, find:

```
- `PATCH/DELETE /api/admin/department-roles/[roleId]` — PATCH updates name/discordRoleIds/tsGroupIds/permissions for any role, base or sub-role alike (base roles are renameable — "base" only means undeletable + implicit department-wide grant, not a fixed name), 409 if the new name collides with another role in the same department. DELETE is rejected (400) for base roles; otherwise revokes the role's Discord/TeamSpeak grants from every member holding it, then cascades — clears the id from their `departmentRoleIds` — before deleting. Gate: `PERMISSIONS.admin.manageDepartmentRoles`. Collections: `Db.departmentRoles`, `Db.users`.
```

Replace with:

```
- `PATCH/DELETE /api/admin/department-roles/[roleId]` — PATCH updates name/discordRoleIds/tsGroupIds/permissions for any role, base or sub-role alike (base roles are renameable — "base" only means undeletable + implicit department-wide grant, not a fixed name), 409 if the new name collides with another role in the same department. Also accepts `linkedSlot: 'leader'|'2ic'|'3ic'|null` (400 on a base role, 400 if the target department has no such slot per `DEPT_LEADERSHIP_POSITIONS`) — setting it clears that slot from whichever other role in the same department held it before, since at most one role per department can hold a given slot. DELETE is rejected (400) for base roles; otherwise revokes the role's Discord/TeamSpeak grants from every member holding it, then cascades — clears the id from their `departmentRoleIds` — before deleting. Gate: `PERMISSIONS.admin.manageDepartmentRoles`. Collections: `Db.departmentRoles`, `Db.users`.
```

In `apps/web/docs/map/f-dashboard-j5-j7-other.md`, find the `DepartmentRolesTab.tsx` entry and its final sentence:

```
Otherwise identical UX to `OrbatRolesTab`: copy/paste per-section and "Copy Settings"/"Paste Settings" across all three, `dirty`-tracking with `window.confirm()`-guarded role-switch/tab-close (reported up via `onDirtyChange`, consumed by `RolesManagerPanel`'s shell guard the same way), Save/Discard pinned in a non-scrolling footer, and a two-stage-confirm Delete button in the footer — hidden both while creating a new role and while editing a base role (`!newRoleDept && !isEditingBase`). Calls: `GET/POST /api/admin/department-roles`, `PATCH/DELETE /api/admin/department-roles/{roleId}`, `GET /api/admin/orbat/discord-roles`, `GET /api/teamspeak/groups`, `GET /api/admin/orbat/permission-keys`.
```

Replace with:

```
Otherwise identical UX to `OrbatRolesTab`: copy/paste per-section and "Copy Settings"/"Paste Settings" across all three, `dirty`-tracking with `window.confirm()`-guarded role-switch/tab-close (reported up via `onDirtyChange`, consumed by `RolesManagerPanel`'s shell guard the same way), Save/Discard pinned in a non-scrolling footer, and a two-stage-confirm Delete button in the footer — hidden both while creating a new role and while editing a base role (`!newRoleDept && !isEditingBase`). Editing an existing non-base role also shows a "Linked Position" dropdown (None / whichever of the department's Leader/2IC/3IC labels are non-empty, per `DEPT_LEADERSHIP_POSITIONS`) — setting it makes this role the one whose holder shows as that leadership position on the department's Members page (`DeptMembersTab.tsx`); a small badge in the left list shows a role's linked position, next to the BASE badge. Calls: `GET/POST /api/admin/department-roles`, `PATCH/DELETE /api/admin/department-roles/{roleId}`, `GET /api/admin/orbat/discord-roles`, `GET /api/teamspeak/groups`, `GET /api/admin/orbat/permission-keys`.
```

- [ ] **Step 4: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/admin/department-roles/[roleId]/route.ts apps/web/app/dashboard/orbat/DepartmentRolesTab.tsx apps/web/docs/map/a-admin-api.md apps/web/docs/map/f-dashboard-j5-j7-other.md
git commit -m "Add leadership-slot linking to Department Roles editor"
```

---

### Task 3: Leadership-slot assignment + close the J4/J5 sync gap

**Files:**
- Modify: `apps/web/lib/discord/dept-roles.ts`
- Modify: `apps/web/app/api/admin/tickets/route.ts`
- Modify: `apps/web/lib/permissions.ts`
- Modify: `apps/web/docs/map/a-admin-api.md`
- Modify: `apps/web/docs/map/h-lib-types-components.md`

**Interfaces:**
- Consumes: `LeadershipSlot` (Task 1, `lib/discord/dept-codes.ts`).
- Produces: `assignLeadershipSlot(userId, deptCode, slot): Promise<void>` (throws `Error` if no role is linked to that slot); `unassignLeadershipSlot(userId, deptCode, slot): Promise<void>` (no-op if unlinked or not held) — both in `lib/discord/dept-roles.ts`. `syncDeptDiscordRole`'s `action` param narrows from `'add'|'remove'|'set-lead'|'remove-lead'` to `'add'|'remove'` (its `set-lead`/`remove-lead` branches are now dead code, since Task 3 stops calling them — see Step 2).

- [ ] **Step 1: Add `departmentLeads.j4` so `hasRoles()` doesn't receive `undefined`**

`PERMISSIONS.departmentLeads` currently has no `j4` entry (unlike j1/j2/j3/j5/j6/j7) because the department-membership ticket handler has always excluded j4 from `validDepts` — so `PERMISSIONS.departmentLeads['j4']` (which evaluates to `undefined`) was never actually passed to `hasRoles()`. Step 2 below removes that exclusion, so this must be fixed first or `hasRoles(me, undefined)` will throw (`check.includes` on `undefined`) the first time anyone submits a J4 department-membership ticket.

In `apps/web/lib/permissions.ts`, find the end of the `j3` entry inside `departmentLeads`:

```ts
        j3: ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer'],

        /**
         * J5 lead — can add/remove J5 members, manage department membership tickets,
```

Replace with:

```ts
        j3: ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer'],

        /**
         * J4 lead — can add/remove J4 members and manage department membership
         * tickets. In practice this is just J4-Administration itself (there's
         * no separate "J4 lead" sub-role) — declared explicitly so
         * `PERMISSIONS.departmentLeads.j4` exists and `hasRoles()` doesn't
         * receive `undefined` for J4's department-membership tickets, the
         * same way every other department already does.
         *
         * Used by:
         *  - `app/api/admin/tickets/route.ts` (department-membership ticket creation for J4)
         */
        j4: ['J4 - Administration'],

        /**
         * J5 lead — can add/remove J5 members, manage department membership tickets,
```

- [ ] **Step 2: Add `assignLeadershipSlot`/`unassignLeadershipSlot`, narrow `syncDeptDiscordRole`**

Replace the full contents of `apps/web/lib/discord/dept-roles.ts` with:

```ts
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { addGuildRole, removeGuildRole, setGuildNickname } from '@/lib/discord/bot'
import { applyTsServerGroups } from '@/lib/teamspeak/groups'
import { buildNickname } from '@/lib/buildNickname'
import type { LeadershipSlot } from '@/lib/discord/dept-codes'

// Maps dept code → Discord role names to grant/revoke on membership changes.
// member: role given when a user is added to the dept (revoked on removal)
// lead:   legacy hardcoded "team lead" Discord role — still revoked on full
//         dept removal (in case a pre-migration member still holds it), but
//         no longer granted directly. Leadership slots are DepartmentRole
//         holdings now (see assignLeadershipSlot below) — configure the
//         slot-linked role's own discordRoleIds instead of relying on this.
export const DEPT_ROLES: Record<string, { member: string; lead?: string }> = {
    j1: { member: 'J1-Recruitment', lead: 'J1-Staff' },
    j2: { member: 'J2-Mission Making', lead: 'J2-Team Lead' },
    j3: { member: 'J3-Training', lead: 'J3-Team Lead' },
    j4: { member: 'J4-Administration' },
    j5: { member: 'J5-Media', lead: 'J5-Team Lead' },
    j6: { member: 'J6 - Game Master', lead: 'J6-Department Lead' },
    j7: { member: 'J7 Community Development', lead: 'J7 Staff' },
}

async function resolveRole(name: string): Promise<string | null> {
    const role = await Db.roles.findOne({ name })
    return role?.id ?? null
}

export async function syncDeptDiscordRole(
    userId: string,
    deptCode: string,
    action: 'add' | 'remove',
): Promise<void> {
    const mapping = DEPT_ROLES[deptCode]
    if (!mapping) return

    if (action === 'add') {
        const id = await resolveRole(mapping.member)
        if (id) await addGuildRole(userId, id)
    } else if (action === 'remove') {
        // Remove member role and legacy lead role (in case they held it)
        const [memberId, leadId] = await Promise.all([
            resolveRole(mapping.member),
            mapping.lead ? resolveRole(mapping.lead) : Promise.resolve(null),
        ])
        await Promise.allSettled([
            memberId ? removeGuildRole(userId, memberId) : Promise.resolve(),
            leadId   ? removeGuildRole(userId, leadId)   : Promise.resolve(),
        ])
    }

    // Rebuild Discord nickname to reflect updated department tags
    const user = await Db.users.findOne({ id: userId })
    if (user) {
        const nick = buildNickname(
            user.milpac?.currentRank,
            user.name || user.username || userId,
            user.departments,
            user.isChaplain,
        )
        await setGuildNickname(userId, nick)
    }
}

/**
 * Grants or revokes a department's base DepartmentRole (Discord roles +
 * TeamSpeak groups) for a member. Every mutation path that adds/removes
 * someone from User.departments should call this alongside the existing
 * section-level syncDeptDiscordRole, since the base role's grants are a
 * separate, admin-configured layer on top of plain membership.
 */
export async function applyBaseDepartmentRoleSync(
    userId: string,
    deptCode: string,
    action: 'add' | 'remove',
): Promise<void> {
    const baseRole = await Db.departmentRoles.findOne({ department: deptCode, isBase: true })
    if (!baseRole) return
    const grantFn = action === 'add' ? addGuildRole : removeGuildRole
    await Promise.allSettled([
        ...baseRole.discordRoleIds.map(id => grantFn(userId, id)),
        applyTsServerGroups(userId, action, baseRole.tsGroupIds),
    ])
}

/**
 * Revokes every DepartmentRole a member holds THAT BELONGS TO the given
 * department (leaving roles from other departments alone), and removes
 * them from User.departmentRoleIds. Call this whenever someone is removed
 * from a department — grants are stored per-user and don't self-heal the
 * way the base role (derived live from User.departments) does, so without
 * this cleanup a removed member keeps every grant and permission their
 * department roles gave them indefinitely. Covers leadership-slot roles
 * (assignLeadershipSlot below) too — they're ordinary DepartmentRole
 * documents stored in this same departmentRoleIds array, just with a
 * non-null linkedSlot, so no separate cleanup path is needed for them.
 */
export async function revokeDepartmentSubRoles(userId: string, deptCode: string): Promise<void> {
    const user = await Db.users.findOne({ id: userId }, { projection: { departmentRoleIds: 1 } })
    // Re-materialize through this file's own ObjectId import — the shared
    // types/user.d.ts (monorepo root) resolves ObjectId from a different
    // physical bson install than apps/web's, so TS treats them as distinct
    // nominal types even though they're runtime-identical (same 24-char hex).
    const subRoleIds = (user?.departmentRoleIds ?? []).map(id => new ObjectId(String(id)))
    if (subRoleIds.length === 0) return

    const deptSubRoles = await Db.departmentRoles.find({ _id: { $in: subRoleIds }, department: deptCode }).toArray()
    if (deptSubRoles.length === 0) return

    await Promise.allSettled(deptSubRoles.flatMap(role => [
        ...role.discordRoleIds.map(id => removeGuildRole(userId, id)),
        applyTsServerGroups(userId, 'remove', role.tsGroupIds),
    ]))
    await Db.users.updateOne({ id: userId }, { $pullAll: { departmentRoleIds: deptSubRoles.map(r => new ObjectId(String(r._id))) } })
}

async function grantDepartmentRole(userId: string, role: DepartmentRole): Promise<void> {
    await Promise.allSettled([
        ...role.discordRoleIds.map(id => addGuildRole(userId, id)),
        applyTsServerGroups(userId, 'add', role.tsGroupIds),
    ])
}

async function revokeDepartmentRole(userId: string, role: DepartmentRole): Promise<void> {
    const roleObjectId = new ObjectId(String(role._id))
    await Db.users.updateOne({ id: userId }, { $pull: { departmentRoleIds: roleObjectId } })
    await Promise.allSettled([
        ...role.discordRoleIds.map(id => removeGuildRole(userId, id)),
        applyTsServerGroups(userId, 'remove', role.tsGroupIds),
    ])
}

/**
 * Assigns a member to a department's leadership slot (leader/2ic/3ic) by
 * granting them the DepartmentRole currently linked to that slot (see
 * DepartmentRole.linkedSlot, set from the Department Roles editor) —
 * revoking it from whoever held it before, since a slot has at most one
 * holder — and granting base department membership first if they don't
 * already have it (holding a leadership slot implies membership). Throws
 * if no role is linked to that slot yet; callers should surface the
 * message as a 400.
 */
export async function assignLeadershipSlot(
    userId: string,
    deptCode: string,
    slot: LeadershipSlot,
): Promise<void> {
    const role = await Db.departmentRoles.findOne({ department: deptCode, linkedSlot: slot })
    if (!role) throw new Error('No role is linked to this position yet — link one in Department Roles first.')

    const roleObjectId = new ObjectId(String(role._id))
    const previousHolder = await Db.users.findOne({ departmentRoleIds: roleObjectId }, { projection: { id: 1 } })
    if (previousHolder && previousHolder.id !== userId) {
        await revokeDepartmentRole(previousHolder.id, role)
    }

    const target = await Db.users.findOne({ id: userId }, { projection: { departments: 1 } })
    if (!target?.departments?.includes(deptCode)) {
        await Db.users.updateOne({ id: userId }, { $addToSet: { departments: deptCode } })
        await Promise.allSettled([
            syncDeptDiscordRole(userId, deptCode, 'add'),
            applyBaseDepartmentRoleSync(userId, deptCode, 'add'),
        ])
    }

    await Db.users.updateOne({ id: userId }, { $addToSet: { departmentRoleIds: roleObjectId } })
    await grantDepartmentRole(userId, role)
}

/**
 * Removes a specific member from a department's leadership slot. No-op
 * (does not throw) if the slot has no linked role, or the member doesn't
 * currently hold it — mirrors the idempotent $pull semantics the old
 * teamLeadDepts-array removal had.
 */
export async function unassignLeadershipSlot(
    userId: string,
    deptCode: string,
    slot: LeadershipSlot,
): Promise<void> {
    const role = await Db.departmentRoles.findOne({ department: deptCode, linkedSlot: slot })
    if (!role) return
    await revokeDepartmentRole(userId, role)
}
```

- [ ] **Step 3: Rewrite the `department-membership` ticket handler**

In `apps/web/app/api/admin/tickets/route.ts`, find the import block:

```ts
import { syncDeptDiscordRole, applyBaseDepartmentRoleSync, revokeDepartmentSubRoles } from '@/lib/discord/dept-roles'
```

Replace with:

```ts
import { syncDeptDiscordRole, applyBaseDepartmentRoleSync, revokeDepartmentSubRoles, assignLeadershipSlot, unassignLeadershipSlot, DEPT_ROLES } from '@/lib/discord/dept-roles'
import type { LeadershipSlot } from '@/lib/discord/dept-codes'
```

Then find the entire `department-membership` block:

```ts
    // ── Department Membership ─────────────────────────────────────────────────
    if (type === 'department-membership') {
        const { targetUserId, targetUserName, deptCode, memberAction } = body
        const validDepts = ['j1', 'j2', 'j3', 'j6', 'j7']
        const validActions = ['add', 'remove', 'set-lead', 'remove-lead', 'set-2ic', 'remove-2ic', 'set-3ic', 'remove-3ic']

        if (!targetUserId || !targetUserName || !validDepts.includes(deptCode) || !validActions.includes(memberAction)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const leadRoles = PERMISSIONS.departmentLeads[deptCode as keyof typeof PERMISSIONS.departmentLeads]
        if (!client.hasRoles(me, leadRoles)) {
            return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
        }

        const now = new Date()

        // Apply immediately
        if (memberAction === 'add') {
            await Db.users.updateOne({ id: targetUserId }, { $addToSet: { departments: deptCode } })
        } else if (memberAction === 'remove') {
            await Db.users.updateOne({ id: targetUserId }, { $pull: { departments: deptCode } })
        } else if (memberAction === 'set-lead') {
            await Db.users.updateOne({ id: targetUserId }, { $addToSet: { teamLeadDepts: deptCode } })
        } else if (memberAction === 'remove-lead') {
            await Db.users.updateOne({ id: targetUserId }, { $pull: { teamLeadDepts: deptCode } })
        } else if (memberAction === 'set-2ic') {
            await Db.users.updateOne({ id: targetUserId }, { $addToSet: { dept2icRoles: deptCode } })
        } else if (memberAction === 'remove-2ic') {
            await Db.users.updateOne({ id: targetUserId }, { $pull: { dept2icRoles: deptCode } })
        } else if (memberAction === 'set-3ic') {
            await Db.users.updateOne({ id: targetUserId }, { $addToSet: { dept3icRoles: deptCode } })
        } else if (memberAction === 'remove-3ic') {
            await Db.users.updateOne({ id: targetUserId }, { $pull: { dept3icRoles: deptCode } })
        }

        if (['add', 'remove', 'set-lead', 'remove-lead'].includes(memberAction)) {
            syncDeptDiscordRole(targetUserId, deptCode, memberAction as 'add' | 'remove' | 'set-lead' | 'remove-lead').catch(err =>
                console.error('[tickets] dept Discord role sync failed:', err)
            )
        }

        // Base department role — implicit for every member of this department,
        // never stored per-user. Stacks on top of the section-level Discord
        // sync above, same pattern as ORBAT's role-level grants.
        if (memberAction === 'add' || memberAction === 'remove') {
            applyBaseDepartmentRoleSync(targetUserId, deptCode, memberAction).catch(err =>
                console.error('[tickets] dept base-role sync failed:', err)
            )
        }
        if (memberAction === 'remove') {
            revokeDepartmentSubRoles(targetUserId, deptCode).catch(err =>
                console.error('[tickets] dept sub-role cleanup failed:', err)
            )
        }

        // Log as pre-actioned ticket
        const ticket: Omit<Ticket, '_id'> = {
            type: 'department-membership',
            department: deptCode as Ticket['department'],
            status: 'actioned',
            targetUserId,
            targetUserName,
            issuedById: me.id,
            issuedByName: displayName,
            issuedAt: now,
            actionedById: me.id,
            actionedByName: displayName,
            actionedAt: now,
            deptCode,
            memberAction,
        }
        const result = await Db.tickets.insertOne(ticket as Ticket)
        return NextResponse.json({ ok: true, id: result.insertedId.toString() })
    }
```

Replace with:

```ts
    // ── Department Membership ─────────────────────────────────────────────────
    if (type === 'department-membership') {
        const { targetUserId, targetUserName, deptCode, memberAction } = body
        const validDepts = Object.keys(DEPT_ROLES)
        const validActions = ['add', 'remove', 'set-lead', 'remove-lead', 'set-2ic', 'remove-2ic', 'set-3ic', 'remove-3ic']

        if (!targetUserId || !targetUserName || !validDepts.includes(deptCode) || !validActions.includes(memberAction)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const leadRoles = PERMISSIONS.departmentLeads[deptCode as keyof typeof PERMISSIONS.departmentLeads]
        if (!client.hasRoles(me, leadRoles)) {
            return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
        }

        const now = new Date()

        // Leadership slots (leader/2ic/3ic) are DepartmentRole holdings, not
        // flat arrays — see lib/discord/dept-roles.ts's assignLeadershipSlot/
        // unassignLeadershipSlot, which handle their own Discord/TeamSpeak
        // sync internally (including auto-granting base membership on
        // assign). Awaited directly, unlike the add/remove sync calls below,
        // since a "no role linked to this slot yet" failure needs to reach
        // the caller as a 400 rather than being silently logged.
        const slotForAction: Partial<Record<string, LeadershipSlot>> = {
            'set-lead': 'leader', 'remove-lead': 'leader',
            'set-2ic': '2ic', 'remove-2ic': '2ic',
            'set-3ic': '3ic', 'remove-3ic': '3ic',
        }
        const slot = slotForAction[memberAction]
        if (slot) {
            try {
                if (memberAction.startsWith('set-')) {
                    await assignLeadershipSlot(targetUserId, deptCode, slot)
                } else {
                    await unassignLeadershipSlot(targetUserId, deptCode, slot)
                }
            } catch (err) {
                return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update position' }, { status: 400 })
            }
        } else if (memberAction === 'add') {
            await Db.users.updateOne({ id: targetUserId }, { $addToSet: { departments: deptCode } })
        } else if (memberAction === 'remove') {
            await Db.users.updateOne({ id: targetUserId }, { $pull: { departments: deptCode } })
        }

        if (memberAction === 'add' || memberAction === 'remove') {
            syncDeptDiscordRole(targetUserId, deptCode, memberAction).catch(err =>
                console.error('[tickets] dept Discord role sync failed:', err)
            )
        }

        // Base department role — implicit for every member of this department,
        // never stored per-user. Stacks on top of the section-level Discord
        // sync above, same pattern as ORBAT's role-level grants.
        if (memberAction === 'add' || memberAction === 'remove') {
            applyBaseDepartmentRoleSync(targetUserId, deptCode, memberAction).catch(err =>
                console.error('[tickets] dept base-role sync failed:', err)
            )
        }
        if (memberAction === 'remove') {
            revokeDepartmentSubRoles(targetUserId, deptCode).catch(err =>
                console.error('[tickets] dept sub-role cleanup failed:', err)
            )
        }

        // Log as pre-actioned ticket
        const ticket: Omit<Ticket, '_id'> = {
            type: 'department-membership',
            department: deptCode as Ticket['department'],
            status: 'actioned',
            targetUserId,
            targetUserName,
            issuedById: me.id,
            issuedByName: displayName,
            issuedAt: now,
            actionedById: me.id,
            actionedByName: displayName,
            actionedAt: now,
            deptCode,
            memberAction,
        }
        const result = await Db.tickets.insertOne(ticket as Ticket)
        return NextResponse.json({ ok: true, id: result.insertedId.toString() })
    }
```

- [ ] **Step 4: Update the doc map**

In `apps/web/docs/map/a-admin-api.md`, find the `department-membership` clause inside the `POST /api/admin/tickets` entry:

```
`department-membership` (applies immediately, no approval — also calls `syncDeptDiscordRole()`; for `add`/`remove` specifically, the department's base `DepartmentRole` (`Db.departmentRoles`, `isBase: true`) also has its Discord roles/TeamSpeak groups granted or revoked via `applyBaseDepartmentRoleSync()`, stacking on top of the `syncDeptDiscordRole()` call, and on `remove` any dept-scoped sub-role grants are also revoked via `revokeDepartmentSubRoles()` — `set-lead`/`remove-lead`/2ic/3ic actions are untouched by this; note this route's `validDepts` list (`['j1','j2','j3','j6','j7']`) excludes `j4`/`j5`, so neither the `syncDeptDiscordRole()` call nor the base-role stacking ever runs for those two departments — a known, pre-existing gap out of scope for this feature — meaning `j4`/`j5`'s base `DepartmentRole` grants currently have no code path that applies them at all, despite being editable in the Department Roles management UI),
```

Replace with:

```
`department-membership` (applies immediately, no approval — valid for all 7 departments, `validDepts` is `Object.keys(DEPT_ROLES)`; for `add`/`remove`, calls `syncDeptDiscordRole()` plus grants/revokes the department's base `DepartmentRole`'s (`Db.departmentRoles`, `isBase: true`) Discord/TeamSpeak grants via `applyBaseDepartmentRoleSync()`, and on `remove` also revokes any dept-scoped sub-role/leadership-slot-role grants via `revokeDepartmentSubRoles()`; for `set-lead`/`remove-lead`/`set-2ic`/`remove-2ic`/`set-3ic`/`remove-3ic`, delegates to `assignLeadershipSlot()`/`unassignLeadershipSlot()` (`lib/discord/dept-roles.ts`) instead — the leadership slot is a single-holder `DepartmentRole` assignment (linked via `DepartmentRole.linkedSlot`, configured in the Department Roles editor), not a flat array, and `set-*` 400s if no role is linked to that slot yet),
```

In `apps/web/docs/map/h-lib-types-components.md`, find:

```
- `syncDeptDiscordRole(userId, deptCode, action: 'add'|'remove'|'set-lead'|'remove-lead')` — resolves role IDs via `Db.roles`, calls `addGuildRole`/`removeGuildRole` from `bot.ts`, then rebuilds and pushes the member's Discord nickname via `buildNickname` + `setGuildNickname`.
- `applyBaseDepartmentRoleSync(userId, deptCode, action: 'add'|'remove')` — grants/revokes a department's base `DepartmentRole`'s Discord roles + TeamSpeak groups for a member. Called alongside `syncDeptDiscordRole` from every path that mutates `User.departments` (the `department-membership` ticket handler, `PATCH /api/admin/members/[id]`, and `POST /api/admin/members/sync-dept`'s add-only backfill) — the base role's grants are a separate, admin-configured layer on top of plain membership, not derived from it.
- `revokeDepartmentSubRoles(userId, deptCode)` — revokes every `DepartmentRole` sub-role a member holds that belongs to `deptCode` specifically (sub-roles from other departments they're still in are untouched), and `$pullAll`s them from `User.departmentRoleIds`. Called whenever someone is removed from a department — sub-role grants are stored per-user and don't self-heal the way the base role (derived live from `User.departments`) does.
```

Replace with:

```
- `syncDeptDiscordRole(userId, deptCode, action: 'add'|'remove')` — resolves role IDs via `Db.roles`, calls `addGuildRole`/`removeGuildRole` from `bot.ts` (on `remove`, also revokes the legacy hardcoded lead-role name if `DEPT_ROLES[dept].lead` is set, in case a pre-migration member still holds it), then rebuilds and pushes the member's Discord nickname via `buildNickname` + `setGuildNickname`. `set-lead`/`remove-lead` actions were removed — leadership slots are `DepartmentRole` holdings now, see `assignLeadershipSlot`/`unassignLeadershipSlot` below.
- `applyBaseDepartmentRoleSync(userId, deptCode, action: 'add'|'remove')` — grants/revokes a department's base `DepartmentRole`'s Discord roles + TeamSpeak groups for a member. Called alongside `syncDeptDiscordRole` from every path that mutates `User.departments` (the `department-membership` ticket handler's `add`/`remove` actions, `PATCH /api/admin/members/[id]`, and `assignLeadershipSlot` when it auto-grants base membership to a new leadership-slot holder who wasn't already a member) — the base role's grants are a separate, admin-configured layer on top of plain membership, not derived from it.
- `revokeDepartmentSubRoles(userId, deptCode)` — revokes every `DepartmentRole` a member holds that belongs to `deptCode` specifically (roles from other departments they're still in are untouched), and `$pullAll`s them from `User.departmentRoleIds`. Called whenever someone is removed from a department — grants are stored per-user and don't self-heal the way the base role (derived live from `User.departments`) does. Covers leadership-slot roles too, since they're stored in the same field.
- `assignLeadershipSlot(userId, deptCode, slot: 'leader'|'2ic'|'3ic')` — grants the member the `DepartmentRole` whose `linkedSlot` matches, revoking it from whoever held it before (single holder per slot), and granting base department membership first if they don't already have it. Throws if no role is linked to that slot yet (callers surface as 400).
- `unassignLeadershipSlot(userId, deptCode, slot)` — revokes the slot-linked role from a specific member. No-op if unlinked or not held.
```

- [ ] **Step 5: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/discord/dept-roles.ts apps/web/app/api/admin/tickets/route.ts apps/web/lib/permissions.ts apps/web/docs/map/a-admin-api.md apps/web/docs/map/h-lib-types-components.md
git commit -m "Wire leadership-slot assignment through DepartmentRole holdings"
```

---

### Task 4: Derive Position/★ from role holding in `DeptMembersTab.tsx`

**Files:**
- Modify: `apps/web/app/dashboard/DeptMembersTab.tsx`
- Modify: `apps/web/docs/map/e-dashboard-j1-j4.md`

**Interfaces:**
- Consumes: `DepartmentRole.linkedSlot` (Task 1).

- [ ] **Step 1: Fetch the full role list and derive holders from it**

In `apps/web/app/dashboard/DeptMembersTab.tsx`, find:

```ts
    const [deptMembers, setDeptMembers] = useState<MemberOption[]>([])
    const [allMembers, setAllMembers] = useState<MemberOption[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingAll, setLoadingAll] = useState(false)
    const [deptRoles, setDeptRoles] = useState<DepartmentRole[]>([])
    const [roleActionId, setRoleActionId] = useState<string | null>(null)
```

Replace with:

```ts
    const [deptMembers, setDeptMembers] = useState<MemberOption[]>([])
    const [allMembers, setAllMembers] = useState<MemberOption[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingAll, setLoadingAll] = useState(false)
    const [allDeptRoles, setAllDeptRoles] = useState<DepartmentRole[]>([])
    const [roleActionId, setRoleActionId] = useState<string | null>(null)
```

Then find:

```ts
    useEffect(() => {
        fetchDeptMembers()
        fetch(`/api/admin/department-roles?department=${department}`)
            .then(r => r.json())
            .then(d => setDeptRoles((d.roles ?? []).filter((r: DepartmentRole) => !r.isBase)))
            .catch(() => setDeptRoles([]))
```

Replace with:

```ts
    useEffect(() => {
        fetchDeptMembers()
        fetch(`/api/admin/department-roles?department=${department}`)
            .then(r => r.json())
            .then(d => setAllDeptRoles(d.roles ?? []))
            .catch(() => setAllDeptRoles([]))
```

Then find the `posNames`/holder computation near the bottom of the component body:

```ts
    const posNames = DEPT_LEADERSHIP_POSITIONS[department] ?? ['Department Leader', '2IC', '3IC']

    const leaderHolder = deptMembers.find(m => m.teamLeadDepts?.includes(department)) ?? null
    const secondHolder = deptMembers.find(m => m.dept2icRoles?.includes(department)) ?? null
    const thirdHolder  = deptMembers.find(m => m.dept3icRoles?.includes(department)) ?? null

    const deptMemberIds = new Set(deptMembers.map(m => m.id))
    const addOptions = allMembers.filter(m => !deptMemberIds.has(m.id))
```

Replace with:

```ts
    const posNames = DEPT_LEADERSHIP_POSITIONS[department] ?? ['Department Leader', '2IC', '3IC']

    const toggleableRoles = allDeptRoles.filter(r => !r.isBase && !r.linkedSlot)
    const slotRoleMap: Partial<Record<'leader' | '2ic' | '3ic', DepartmentRole>> = {}
    for (const r of allDeptRoles) if (r.linkedSlot) slotRoleMap[r.linkedSlot] = r

    function holdsRole(member: MemberOption, role: DepartmentRole | undefined): boolean {
        return !!role && member.departmentRoleIds.includes(String(role._id))
    }

    const leaderHolder = deptMembers.find(m => holdsRole(m, slotRoleMap.leader)) ?? null
    const secondHolder = deptMembers.find(m => holdsRole(m, slotRoleMap['2ic'])) ?? null
    const thirdHolder  = deptMembers.find(m => holdsRole(m, slotRoleMap['3ic'])) ?? null

    const deptMemberIds = new Set(deptMembers.map(m => m.id))
    const addOptions = allMembers.filter(m => !deptMemberIds.has(m.id))
```

- [ ] **Step 2: Show "Not linked" instead of an Assign control for unlinked slots**

Find:

```tsx
                        {([
                            { slot: 'leader' as const, label: posNames[0], holder: leaderHolder, color: '#fbbf24' },
                            ...(posNames[1] ? [{ slot: '2ic' as const, label: posNames[1], holder: secondHolder, color: 'rgba(219,0,29,0.7)' }] : []),
                            ...(posNames[2] ? [{ slot: '3ic' as const, label: posNames[2], holder: thirdHolder,  color: 'rgba(237,237,237,0.5)' }] : []),
                        ]).map(({ slot, label, holder, color }) => (
```

Replace with:

```tsx
                        {([
                            { slot: 'leader' as const, label: posNames[0], holder: leaderHolder, linked: !!slotRoleMap.leader, color: '#fbbf24' },
                            ...(posNames[1] ? [{ slot: '2ic' as const, label: posNames[1], holder: secondHolder, linked: !!slotRoleMap['2ic'], color: 'rgba(219,0,29,0.7)' }] : []),
                            ...(posNames[2] ? [{ slot: '3ic' as const, label: posNames[2], holder: thirdHolder,  linked: !!slotRoleMap['3ic'], color: 'rgba(237,237,237,0.5)' }] : []),
                        ]).map(({ slot, label, holder, linked, color }) => (
```

Then find the "Display row" branch:

```tsx
                                ) : (
                                    /* Display row */
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color, minWidth: 150, flexShrink: 0 }}>{label}</span>
                                        {holder ? (
                                            <>
                                                <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)' }}>
                                                    {holder.displayName}
                                                </span>
                                                {canManage && (
                                                    <button
                                                        onClick={() => handleRemoveFromSlot(holder, slot)}
                                                        disabled={leadActionId === holder.id}
                                                        style={{ padding: '3px 10px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', cursor: 'pointer', flexShrink: 0 }}
                                                    >
                                                        {leadActionId === holder.id ? '…' : 'Remove'}
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <span style={{ flex: 1, fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>Not assigned</span>
                                                {canManage && (
                                                    <button
                                                        onClick={() => { setAssigningSlot(slot); setSelectedForSlot(null) }}
                                                        style={{ padding: '3px 10px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', background: `${color}18`, border: `1px solid ${color}44`, color, cursor: 'pointer', flexShrink: 0 }}
                                                    >
                                                        + Assign
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
```

Replace with:

```tsx
                                ) : (
                                    /* Display row */
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color, minWidth: 150, flexShrink: 0 }}>{label}</span>
                                        {holder ? (
                                            <>
                                                <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)' }}>
                                                    {holder.displayName}
                                                </span>
                                                {canManage && (
                                                    <button
                                                        onClick={() => handleRemoveFromSlot(holder, slot)}
                                                        disabled={leadActionId === holder.id}
                                                        style={{ padding: '3px 10px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', cursor: 'pointer', flexShrink: 0 }}
                                                    >
                                                        {leadActionId === holder.id ? '…' : 'Remove'}
                                                    </button>
                                                )}
                                            </>
                                        ) : linked ? (
                                            <>
                                                <span style={{ flex: 1, fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>Not assigned</span>
                                                {canManage && (
                                                    <button
                                                        onClick={() => { setAssigningSlot(slot); setSelectedForSlot(null) }}
                                                        style={{ padding: '3px 10px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', background: `${color}18`, border: `1px solid ${color}44`, color, cursor: 'pointer', flexShrink: 0 }}
                                                    >
                                                        + Assign
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <span style={{ flex: 1, fontSize: '0.72rem', color: 'rgba(255,180,80,0.6)', fontStyle: 'italic' }}>
                                                Not linked — configure in Department Roles
                                            </span>
                                        )}
                                    </div>
                                )}
```

- [ ] **Step 3: Update the member table's Position/★ derivation and Roles column**

Find:

```tsx
                            <tbody>
                                {deptMembers.map(m => {
                                    const isLeader = m.teamLeadDepts?.includes(department)
                                    const is2ic    = m.dept2icRoles?.includes(department)
                                    const is3ic    = m.dept3icRoles?.includes(department)
                                    const position = isLeader ? posNames[0] : is2ic ? posNames[1] : is3ic ? posNames[2] : null
```

Replace with:

```tsx
                            <tbody>
                                {deptMembers.map(m => {
                                    const isLeader = holdsRole(m, slotRoleMap.leader)
                                    const is2ic    = holdsRole(m, slotRoleMap['2ic'])
                                    const is3ic    = holdsRole(m, slotRoleMap['3ic'])
                                    const position = isLeader ? posNames[0] : is2ic ? posNames[1] : is3ic ? posNames[2] : null
```

Then find the two remaining uses of `deptRoles` (the column header and the toggle-chip map):

```tsx
                                    {deptRoles.length > 0 && <th style={thStyle}>Roles</th>}
```

Replace with:

```tsx
                                    {toggleableRoles.length > 0 && <th style={thStyle}>Roles</th>}
```

And:

```tsx
                                            {deptRoles.length > 0 && (
                                                <td style={tdStyle}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                        {deptRoles.map(role => {
```

Replace with:

```tsx
                                            {toggleableRoles.length > 0 && (
                                                <td style={tdStyle}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                        {toggleableRoles.map(role => {
```

- [ ] **Step 4: Update the doc map**

In `apps/web/docs/map/e-dashboard-j1-j4.md`, find:

```
`DeptMembersTab`'s member table also renders a "Roles" column — one toggleable chip per non-base sub-role defined for the department (fetched via `GET /api/admin/department-roles?department=X`; base roles excluded), hidden entirely when the department has none. Clicking a chip calls `POST /api/admin/department-roles/assign` to add/remove that member's holding of the sub-role. Read-only (chips render but aren't clickable, and roles the member doesn't hold aren't shown) for non-managers; clickable for department leads/J4 (`canManage`).
```

Replace with:

```
`DeptMembersTab`'s member table also renders a "Roles" column — one toggleable chip per department sub-role that isn't a base role or linked to a leadership slot (fetched via `GET /api/admin/department-roles?department=X`; base and slot-linked roles are excluded — slot-linked roles are single-holder and only assignable via the Leadership card, see below), hidden entirely when the department has none. Clicking a chip calls `POST /api/admin/department-roles/assign` to add/remove that member's holding of the sub-role. Read-only (chips render but aren't clickable, and roles the member doesn't hold aren't shown) for non-managers; clickable for department leads/J4 (`canManage`).

Above the member table, a "Department Leadership" card shows the department's 3 leadership slots (Leader/2IC/3IC — labels per `DEPT_LEADERSHIP_POSITIONS` in `lib/discord/dept-codes.ts`; some departments have fewer than 3, e.g. J4 has only a Leader). Each slot's holder is derived from who holds the `DepartmentRole` whose `linkedSlot` matches (configured per-role in `DepartmentRolesTab.tsx`, J4 only) — not a separate flag. A slot with no linked role shows "Not linked — configure in Department Roles" instead of an Assign control. Assigning/removing a holder goes through `POST /api/admin/tickets` (`type: 'department-membership'`, `memberAction: set-lead|remove-lead|set-2ic|remove-2ic|set-3ic|remove-3ic`), which resolves to `assignLeadershipSlot`/`unassignLeadershipSlot` (`lib/discord/dept-roles.ts`) server-side — single holder per slot, auto-replacing whoever held it before. A J4-only "Sync Discord & TeamSpeak" button (`POST /api/admin/members/sync-dept`) does a full push reconciliation of every current member's real Discord roles/TeamSpeak groups against what their held `DepartmentRole`s say they should have.
```

- [ ] **Step 5: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/dashboard/DeptMembersTab.tsx apps/web/docs/map/e-dashboard-j1-j4.md
git commit -m "Derive leadership Position/star from DepartmentRole holding"
```

---

### Task 5: Full push-reconciliation sync

**Files:**
- Modify: `apps/web/app/api/admin/members/sync-dept/route.ts`
- Modify: `apps/web/app/dashboard/DeptMembersTab.tsx`
- Modify: `apps/web/docs/map/a-admin-api.md`

**Interfaces:**
- Consumes: `getClientServerGroupIds` (Task 1, `lib/teamspeak/groups.ts`).
- Produces: `POST /api/admin/members/sync-dept` response shape changes from `{ok, membersAdded, leadsAdded, scanned}` to `{ok, membersChecked, discordGranted, discordRevoked, tsGranted, tsRevoked}`.

- [ ] **Step 1: Rewrite the sync-dept route**

Replace the full contents of `apps/web/app/api/admin/members/sync-dept/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { fetchAllGuildMembers, addGuildRole, removeGuildRole } from '@/lib/discord/bot'
import { applyTsServerGroups, getClientServerGroupIds } from '@/lib/teamspeak/groups'
import { logAction } from '@/lib/logs'
import { DEPT_ROLES } from '@/lib/discord/dept-roles'

// POST /api/admin/members/sync-dept — J4 only
// Full push reconciliation, NOT a Discord-discovery scan: for every current
// member of the department, computes the union of Discord role IDs /
// TeamSpeak group IDs their held DepartmentRoles (base + subs + leadership
// slot) say they should have, compares against their actual live Discord
// roles and TeamSpeak groups, and grants what's missing / revokes what's
// extra. Only ever touches an ID that appears as a grant on SOME
// DepartmentRole in this department's catalog, so unrelated Discord roles
// (rank, event roles, other departments' grants) are never touched. Never
// adds new members — membership changes only happen via the
// department-membership ticket flow.
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const department = (body?.department as string | undefined)?.toLowerCase()

    if (!department || !DEPT_ROLES[department]) {
        return NextResponse.json({ error: 'Invalid department.' }, { status: 400 })
    }

    const [members, deptRoles, guildMembers] = await Promise.all([
        Db.users.find({ departments: department }).project({ id: 1, departmentRoleIds: 1, teamspeak: 1 }).toArray(),
        Db.departmentRoles.find({ department }).toArray(),
        fetchAllGuildMembers(),
    ])

    const guildRoleMap = new Map(guildMembers.map(m => [m.userId, new Set(m.roleIds)]))
    const managedDiscordIds = new Set(deptRoles.flatMap(r => r.discordRoleIds))
    const managedTsGroupIds = new Set(deptRoles.flatMap(r => r.tsGroupIds))
    const baseRole = deptRoles.find(r => r.isBase)
    const rolesById = new Map(deptRoles.map(r => [String(r._id), r]))

    let discordGranted = 0, discordRevoked = 0, tsGranted = 0, tsRevoked = 0

    await Promise.all(members.map(async member => {
        const heldRoles = [
            ...(baseRole ? [baseRole] : []),
            ...(member.departmentRoleIds ?? [])
                .map(id => rolesById.get(String(id)))
                .filter((r): r is DepartmentRole => !!r),
        ]
        const shouldHaveDiscord = new Set(heldRoles.flatMap(r => r.discordRoleIds))
        const shouldHaveTs = new Set(heldRoles.flatMap(r => r.tsGroupIds))

        const actualDiscord = guildRoleMap.get(member.id) ?? new Set<string>()
        const discordToGrant = [...shouldHaveDiscord].filter(id => !actualDiscord.has(id))
        const discordToRevoke = [...actualDiscord].filter(id => managedDiscordIds.has(id) && !shouldHaveDiscord.has(id))

        const cldbid = member.teamspeak?.cldbid
        const actualTs = cldbid ? new Set(await getClientServerGroupIds(cldbid)) : new Set<number>()
        const tsToGrant = [...shouldHaveTs].filter(id => !actualTs.has(id))
        const tsToRevoke = [...actualTs].filter(id => managedTsGroupIds.has(id) && !shouldHaveTs.has(id))

        discordGranted += discordToGrant.length
        discordRevoked += discordToRevoke.length
        tsGranted += tsToGrant.length
        tsRevoked += tsToRevoke.length

        await Promise.allSettled([
            ...discordToGrant.map(id => addGuildRole(member.id, id)),
            ...discordToRevoke.map(id => removeGuildRole(member.id, id)),
            tsToGrant.length ? applyTsServerGroups(member.id, 'add', tsToGrant) : Promise.resolve(),
            tsToRevoke.length ? applyTsServerGroups(member.id, 'remove', tsToRevoke) : Promise.resolve(),
        ])
    }))

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'member.department.sync',
        category: 'member',
        performedBy: me.id,
        performedByName,
        target: department.toUpperCase(),
        details: { department, membersChecked: members.length, discordGranted, discordRevoked, tsGranted, tsRevoked },
    }).catch(() => {})

    return NextResponse.json({ ok: true, membersChecked: members.length, discordGranted, discordRevoked, tsGranted, tsRevoked })
}
```

- [ ] **Step 2: Update `DeptMembersTab.tsx`'s sync handler and button label**

In `apps/web/app/dashboard/DeptMembersTab.tsx`, find:

```ts
    async function handleSyncDiscord() {
        setSyncing(true)
        try {
            const res = await fetch('/api/admin/members/sync-dept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ department }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Sync failed')
            const msg = data.membersAdded === 0 && data.leadsAdded === 0
                ? `Sync complete — no new members found (${data.scanned} Discord members scanned).`
                : `Sync complete — added ${data.membersAdded} member(s), ${data.leadsAdded} lead(s) from Discord.`
            showFeedback('success', msg)
            if (data.membersAdded > 0 || data.leadsAdded > 0) fetchDeptMembers()
        } catch (e: unknown) {
            showFeedback('error', e instanceof Error ? e.message : 'Sync failed')
        } finally {
            setSyncing(false)
        }
    }
```

Replace with:

```ts
    async function handleSyncDiscord() {
        setSyncing(true)
        try {
            const res = await fetch('/api/admin/members/sync-dept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ department }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Sync failed')
            const totalChanges = data.discordGranted + data.discordRevoked + data.tsGranted + data.tsRevoked
            const msg = totalChanges === 0
                ? `Sync complete — ${data.membersChecked} member(s) checked, already up to date.`
                : `Sync complete — ${data.membersChecked} member(s) checked. Discord: +${data.discordGranted}/-${data.discordRevoked}. TeamSpeak: +${data.tsGranted}/-${data.tsRevoked}.`
            showFeedback('success', msg)
        } catch (e: unknown) {
            showFeedback('error', e instanceof Error ? e.message : 'Sync failed')
        } finally {
            setSyncing(false)
        }
    }
```

Then find:

```tsx
                            {syncing ? '⟳ Syncing…' : '⟳ Sync Discord'}
```

Replace with:

```tsx
                            {syncing ? '⟳ Syncing…' : '⟳ Sync Discord & TeamSpeak'}
```

- [ ] **Step 3: Update the doc map**

In `apps/web/docs/map/a-admin-api.md`, find:

```
- `POST /api/admin/members/sync-dept` — reconciles a department's member/lead lists against live Discord role holders (fetched via `fetchAllGuildMembers()`), `$addToSet`s missing `departments`/`teamLeadDepts`. Gate: `PERMISSIONS.departments.j4`. Collections: `Db.roles`, `Db.users`. Side effects: `logAction()`.
```

Replace with:

```
- `POST /api/admin/members/sync-dept` — full push reconciliation, not a Discord-discovery scan: for every current member of the department (`Db.users` where `departments` contains the code), computes the union of Discord role IDs / TeamSpeak group IDs their held `DepartmentRole`s (base + subs + leadership-slot role) say they should have, compares against their actual live Discord roles (`fetchAllGuildMembers()`) and TeamSpeak groups (`getClientServerGroupIds()`), and grants what's missing / revokes what's extra — but only ever touches an ID that appears as a grant on *some* `DepartmentRole` in this department's catalog, so unrelated Discord roles/TS groups are never touched. Never adds new members (no more Discord-discovery). Gate: `PERMISSIONS.departments.j4`. Collections: `Db.users`, `Db.departmentRoles`. Side effects: `logAction()`.
```

- [ ] **Step 4: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/admin/members/sync-dept/route.ts apps/web/app/dashboard/DeptMembersTab.tsx apps/web/docs/map/a-admin-api.md
git commit -m "Rewrite department sync as a full push reconciliation"
```

---

### Task 6: One-off migration script

**Files:**
- Create: `scripts/migrate-department-leadership.mjs`

**Interfaces:**
- Consumes: none (standalone script, Mongo driver only — no app imports, matching `scripts/migrate-orbat-roles.mjs`'s pattern).

- [ ] **Step 1: Write the migration script**

Create `scripts/migrate-department-leadership.mjs`:

```js
// One-off migration: links each department's 3 leadership slots (Leader/
// 2IC/3IC — see DEPT_LEADERSHIP_POSITIONS below) to a DepartmentRole,
// creating an empty-grant role for any slot with no existing name match,
// then backfills departmentRoleIds for every legacy teamLeadDepts/
// dept2icRoles/dept3icRoles holder onto their department's now-linked slot
// role.
//
// Mongo-only — does not call Discord or TeamSpeak (that needs the running
// app's bot token / TS connection, not available here). After running with
// --apply, use each department's "Sync Discord & TeamSpeak" button
// (POST /api/admin/members/sync-dept) to push the real grants for anyone
// migrated onto a slot role, same as any other role-membership change.
//
// Usage:
//   node --env-file=.env scripts/migrate-department-leadership.mjs            (dry run — reports only)
//   node --env-file=.env scripts/migrate-department-leadership.mjs --apply    (writes changes)

import { MongoClient, ObjectId } from 'mongodb'

const APPLY = process.argv.includes('--apply')

// Mirrors apps/web/lib/discord/dept-codes.ts's DEPT_LEADERSHIP_POSITIONS —
// duplicated here since this script runs standalone (no Next.js/TS import
// resolution available). Keep both in sync if the labels ever change.
const DEPT_LEADERSHIP_POSITIONS = {
    j1: ['Department Leader', 'Head Recruiter', 'Recruiter Trainer'],
    j2: ['Department Leader', 'Team Leader', 'Creator Trainer'],
    j3: ['Department Leader', 'Head Trainer', 'Assistant Head Trainer'],
    j4: ['Department Leader', '', ''],
    j5: ['Department Leader', 'Team Leader', 'Lead Content Creator'],
    j6: ['Department Leader', 'Team Leader', 'Assistant Team Leader'],
    j7: ['Department Leader', 'Team Leader', 'Assistant Team Leader'],
}

const SLOTS = ['leader', '2ic', '3ic']
const LEGACY_FIELD = { leader: 'teamLeadDepts', '2ic': 'dept2icRoles', '3ic': 'dept3icRoles' }

async function main() {
    if (!process.env.MONGO_URI || !process.env.MONGO_DB) {
        console.error('MONGO_URI and MONGO_DB must be set (run with --env-file=.env)')
        process.exit(1)
    }

    const client = new MongoClient(process.env.MONGO_URI)
    await client.connect()
    const db = client.db(process.env.MONGO_DB)
    const roles = db.collection('department_roles')
    const users = db.collection('users')

    let rolesLinked = 0
    let rolesCreated = 0
    let usersMigrated = 0

    for (const [dept, labels] of Object.entries(DEPT_LEADERSHIP_POSITIONS)) {
        for (let i = 0; i < SLOTS.length; i++) {
            const slot = SLOTS[i]
            const label = labels[i]
            if (!label) continue

            const alreadyLinked = await roles.findOne({ department: dept, linkedSlot: slot })
            let roleId = alreadyLinked?._id ?? null

            if (!roleId) {
                const nameMatch = await roles.findOne({ department: dept, isBase: false, name: label })
                if (nameMatch) {
                    roleId = nameMatch._id
                    console.log(`[link] ${dept} ${slot} -> existing role "${label}" (${roleId})`)
                    if (APPLY) await roles.updateOne({ _id: roleId }, { $set: { linkedSlot: slot } })
                    rolesLinked++
                } else {
                    roleId = new ObjectId()
                    console.log(`[create+link] ${dept} ${slot} -> new empty-grant role "${label}" (${roleId})`)
                    if (APPLY) {
                        await roles.insertOne({
                            _id: roleId,
                            department: dept,
                            name: label,
                            isBase: false,
                            linkedSlot: slot,
                            discordRoleIds: [],
                            tsGroupIds: [],
                            permissions: [],
                            createdAt: new Date(),
                            createdBy: 'migration-script',
                            createdByName: 'Migration Script',
                        })
                    }
                    rolesCreated++
                }
            } else {
                console.log(`[skip] ${dept} ${slot} already linked to "${alreadyLinked.name}"`)
            }

            const legacyField = LEGACY_FIELD[slot]
            const holders = await users.find({ [legacyField]: dept }).project({ id: 1, departmentRoleIds: 1 }).toArray()
            for (const holder of holders) {
                const alreadyHolds = (holder.departmentRoleIds ?? []).some(id => String(id) === String(roleId))
                if (alreadyHolds) continue
                console.log(`[backfill] ${holder.id} -> departmentRoleIds += ${dept} ${slot} role`)
                if (APPLY) {
                    await users.updateOne({ id: holder.id }, { $addToSet: { departmentRoleIds: roleId } })
                }
                usersMigrated++
            }
        }
    }

    console.log('')
    console.log(`Roles linked to existing name matches: ${rolesLinked}`)
    console.log(`New empty-grant roles created + linked: ${rolesCreated}`)
    console.log(`Users backfilled onto a slot role:       ${usersMigrated}`)
    if (!APPLY) {
        console.log('')
        console.log('DRY RUN — no changes written. Re-run with --apply to write them.')
    } else {
        console.log('')
        console.log('Done. Now run "Sync Discord & TeamSpeak" on each department\'s Members')
        console.log('page to push the real Discord/TeamSpeak grants for migrated roles.')
    }

    await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Dry-run it against the real database and read the report**

Run: `node --env-file=.env scripts/migrate-department-leadership.mjs` (from the repo root, where `.env` lives)
Expected: a report listing, per department/slot, whether it linked an existing role, created a new one, or skipped an already-linked one, followed by a per-user backfill list and summary counts. No errors. Read the output — if any department/slot's role-name match looks wrong (e.g. it's about to link to a role that clearly isn't the leadership role), stop and investigate before applying; this is exactly the kind of pre-existing-data surprise a dry run exists to catch.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-department-leadership.mjs
git commit -m "Add one-off migration script for leadership-slot role linking"
```

Do not run `--apply` as part of this task — that's a live production-data write the human operator runs deliberately, after reviewing the dry-run report from Step 2, same as `migrate-orbat-roles.mjs`'s established convention in this repo.

---

## After all tasks

Once Task 6 is complete, the branch has: leadership slots fully driven by `DepartmentRole` holdings, the J4/J5 department-membership sync gap closed, and a real full-reconciliation sync button. The migration script exists and has been dry-run (not applied) — applying it, and then running "Sync Discord & TeamSpeak" per department, is a deliberate operator action outside this plan's scope. Proceed to the final whole-branch review per the subagent-driven-development skill.
