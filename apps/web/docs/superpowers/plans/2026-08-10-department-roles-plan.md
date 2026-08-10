# Department Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Department Roles" catalog (parallel to ORBAT Roles) — one fixed base role per department (J1–J7) plus admin-creatable sub-roles — with real Discord/TeamSpeak sync and `hasPermission()` integration, managed from a new tab in the existing Roles Manager and assigned to members from the existing department member-management UI.

**Architecture:** New `DepartmentRole` Mongo collection and CRUD API mirroring the existing `OrbatRole` catalog's shape (minus categories/tag). Base-role grants are implicit from `User.departments` membership and hook into the existing `department-membership` ticket-action handler; sub-role grants are explicit (`User.departmentRoleIds`) via a new assign route. Both reuse the Discord/TeamSpeak grant primitives already built for ORBAT roles. `RolesManagerPanel.tsx` is split into a thin tab shell plus two tab components (existing ORBAT content extracted as-is, new Department Roles tab added). `DeptMembersTab.tsx` (already shared across all 7 department pages) gets a sub-role picker.

**Tech Stack:** Next.js 15 App Router, MongoDB, MUI, TypeScript (4-space indent, single quotes, no semicolons — existing repo style).

## Global Constraints

- No categories, no `tag` field on `DepartmentRole` — sub-role names are unique within their department, so there's no duplicate-name case to disambiguate.
- No hierarchy between sub-roles — flat under their department, no parent/child links.
- No cross-department sub-roles — every `DepartmentRole` belongs to exactly one department.
- Base roles (`isBase: true`) are fixed identity: cannot be created via the API, cannot be renamed (400 on attempt), cannot be deleted (400 on attempt). Their `discordRoleIds`/`tsGroupIds`/`permissions` ARE freely editable.
- Base role grants are never stored per-user — they apply to every user whose `User.departments` array contains that department code, full stop. Only sub-role holdings are stored (`User.departmentRoleIds`).
- Both base-role and sub-role grant/revoke must be **real syncs** (actual `addGuildRole`/`removeGuildRole`/`applyTsServerGroups` calls), not just data storage — same guarantee ORBAT roles already have.
- `DepartmentRole.permissions` feeds into the existing additive `hasPermission()` check (`apps/web/lib/orbat/hasPermission.ts`) as a third source alongside Discord roles and ORBAT position roles — must only ever widen access, never narrow it.
- New permission gate: `PERMISSIONS.admin.manageDepartmentRoles` (`['J4 - Administration']`) — gates all Department Roles CRUD and the assign route (except the assign route's per-department-lead path, see Task 3).
- Valid department codes are the keys of `DEPT_ROLES` in `apps/web/lib/discord/dept-roles.ts` (`j1`..`j7`) — reuse that as the single source of truth, don't hardcode a second list.
- No test suite exists in this repo. Verification is `npx tsc --noEmit -p tsconfig.json` (run from `apps/web`) plus manual code tracing. Browser testing is not possible in this environment — a standing, accepted limitation.
- Code style: 4-space indent, single quotes, no semicolons, matching every existing file touched.
- Whenever a task adds or meaningfully changes a route/page/lib/type file, update the relevant `docs/map/*.md` file(s) in the same task (per `apps/web/CLAUDE.md`'s "Site Map" section) — folded into that task's steps below, not a separate task.

---

### Task 1: Data model, DB registration, permission key

**Files:**
- Create: `apps/web/types/department-role.d.ts`
- Modify: `types/user.d.ts` (monorepo root — shared with `apps/bot`)
- Modify: `apps/web/lib/mongo.ts`
- Modify: `apps/web/lib/permissions.ts`

**Interfaces:**
- Produces: `DepartmentRole` global type (`_id, department, name, isBase, discordRoleIds, tsGroupIds, permissions, createdAt, createdBy, createdByName`); `User.departmentRoleIds?: ObjectId[]`; `Db.departmentRoles: MongoCollection<DepartmentRole>`; `PERMISSIONS.admin.manageDepartmentRoles: string[]`.

- [ ] **Step 1: Create the DepartmentRole type**

Create `apps/web/types/department-role.d.ts`:

```ts
import type { ObjectId } from 'mongodb'


export { }

declare global {

    // A role within a department (J1-J7) catalog, parallel to OrbatRole but
    // scoped by department instead of ORBAT category. Exactly one "base" role
    // per department is seeded automatically (fixed identity — can't be
    // created, renamed, or deleted) and applies implicitly to every member of
    // that department via User.departments. Additional "sub" roles are
    // created freely by admins, scoped to one department, and explicitly
    // assigned to specific members via User.departmentRoleIds.
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

}
```

- [ ] **Step 2: Add `departmentRoleIds` to `User`**

In `types/user.d.ts` (monorepo root, NOT `apps/web/types/`), find:

```ts
        departments?: string[]   // dept codes this user is a member of, e.g. ['j1', 'j3']
        teamLeadDepts?: string[] // dept codes this user is a team lead of, e.g. ['j3']
        isChaplain?: boolean
```

Replace with:

```ts
        departments?: string[]   // dept codes this user is a member of, e.g. ['j1', 'j3']
        teamLeadDepts?: string[] // dept codes this user is a team lead of, e.g. ['j3']
        departmentRoleIds?: ObjectId[]  // DepartmentRole sub-role ids this member holds (never base roles)
        isChaplain?: boolean
```

`ObjectId` is already imported at the top of this file (`import type { ObjectId } from "mongodb"`) — no new import needed.

- [ ] **Step 3: Register the collection**

In `apps/web/lib/mongo.ts`, find:

```ts
    orbatRoleGroups: db.collection('orbat_role_groups') as MongoCollection<OrbatRoleGroup>,
```

Add immediately after it:

```ts
    orbatRoleGroups: db.collection('orbat_role_groups') as MongoCollection<OrbatRoleGroup>,
    departmentRoles: db.collection('department_roles') as MongoCollection<DepartmentRole>,
```

- [ ] **Step 4: Add the permission key**

In `apps/web/lib/permissions.ts`, inside the `admin: {` block, find the end of the `manageOrbatRoles` entry:

```ts
        manageOrbatRoles: ['J4 - Administration'],
```

Add immediately after it (before whatever key currently follows, e.g. `viewPermissionsTree`):

```ts
        manageOrbatRoles: ['J4 - Administration'],

        /**
         * Department Roles catalog — create, edit, and delete the department
         * (J1-J7) role definitions (Discord roles, TeamSpeak groups, granted
         * site permissions), and assign/unassign sub-roles to specific
         * members. Parallel to manageOrbatRoles but for department roles.
         * J4 only.
         *
         * Used by:
         *  - `app/dashboard/orbat/DepartmentRolesTab.tsx` (panel visibility)
         *  - `app/api/admin/department-roles/route.ts` (GET/POST)
         *  - `app/api/admin/department-roles/[roleId]/route.ts` (PATCH/DELETE)
         *  - `app/api/admin/department-roles/assign/route.ts`
         */
        manageDepartmentRoles: ['J4 - Administration'],
```

- [ ] **Step 5: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/types/department-role.d.ts ../../types/user.d.ts apps/web/lib/mongo.ts apps/web/lib/permissions.ts
git commit -m "Add DepartmentRole data model, collection, and permission key"
```

(If your shell's cwd is `apps/web`, use `../../types/user.d.ts`; if it's the repo root, use `types/user.d.ts`. Adjust the `git add` path to match your actual cwd — the important thing is both files end up staged.)

---

### Task 2: Department Roles CRUD API

**Files:**
- Create: `apps/web/app/api/admin/department-roles/route.ts`
- Create: `apps/web/app/api/admin/department-roles/[roleId]/route.ts`
- Modify: `apps/web/docs/map/a-admin-api.md`

**Interfaces:**
- Consumes: `DepartmentRole`, `Db.departmentRoles`, `PERMISSIONS.admin.manageDepartmentRoles` (Task 1); `DEPT_ROLES` from `apps/web/lib/discord/dept-roles.ts` (existing); `PERMISSION_KEYS` from `apps/web/lib/permissions-catalog.ts` (existing); `addGuildRole`/`removeGuildRole` from `apps/web/lib/discord/bot.ts` (existing); `applyTsServerGroups` from `apps/web/lib/teamspeak/groups.ts` (existing).
- Produces: `GET /api/admin/department-roles` (optional `?department=j1`) → `{ roles: DepartmentRole[] }`, seeding any missing base roles first. `POST /api/admin/department-roles` → `{ role: DepartmentRole }`. `PATCH /api/admin/department-roles/[roleId]` → `{ success: true }`. `DELETE /api/admin/department-roles/[roleId]` → `{ success: true }`. All consumed by Task 6's UI.

- [ ] **Step 1: Write the list/create route**

Create `apps/web/app/api/admin/department-roles/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'
import { DEPT_ROLES } from '@/lib/discord/dept-roles'

const VALID_DEPTS = Object.keys(DEPT_ROLES)

// Ensures all 7 base roles exist, creating any missing ones. Called at the
// top of GET so there's no separate migration step — the catalog is always
// complete by the time anything reads it.
async function ensureBaseRoles(): Promise<void> {
    const existing = await Db.departmentRoles.find({ isBase: true }).project({ department: 1 }).toArray()
    const existingDepts = new Set(existing.map(r => r.department))
    const missing = VALID_DEPTS.filter(d => !existingDepts.has(d))
    if (missing.length === 0) return

    const now = new Date()
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
}


// ── GET /api/admin/department-roles ────────────────────────────────────────
// Optional ?department=j1 filter. Seeds any missing base roles first.

export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageDepartmentRoles)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await ensureBaseRoles()

    const department = request.nextUrl.searchParams.get('department')
    const filter = department ? { department } : {}
    const roles = await Db.departmentRoles.find(filter).sort({ department: 1, isBase: -1, name: 1 }).toArray()
    return NextResponse.json({ roles: JSON.parse(JSON.stringify(roles)) })
}


// ── POST /api/admin/department-roles ───────────────────────────────────────
// Body: { department, name, discordRoleIds, tsGroupIds, permissions }
// Always creates a sub-role (isBase: false) — base roles only come from seeding.

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageDepartmentRoles)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const department: string = body.department
    if (!VALID_DEPTS.includes(department)) return NextResponse.json({ error: 'Invalid department' }, { status: 400 })

    const name: string = (body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const existing = await Db.departmentRoles.findOne({ department, name })
    if (existing) return NextResponse.json({ error: 'A role with that name already exists in this department' }, { status: 409 })

    const discordRoleIds: string[] = Array.isArray(body.discordRoleIds) ? body.discordRoleIds : []
    const tsGroupIds: number[] = Array.isArray(body.tsGroupIds)
        ? body.tsGroupIds.filter((id: unknown) => typeof id === 'number')
        : []
    const permissions: string[] = Array.isArray(body.permissions)
        ? body.permissions.filter((p: unknown) => typeof p === 'string' && PERMISSION_KEYS.includes(p))
        : []

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

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
    await Db.departmentRoles.insertOne(newRole)

    return NextResponse.json({ role: JSON.parse(JSON.stringify(newRole)) })
}
```

- [ ] **Step 2: Write the update/delete route**

Create `apps/web/app/api/admin/department-roles/[roleId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'
import { removeGuildRole } from '@/lib/discord/bot'
import { applyTsServerGroups } from '@/lib/teamspeak/groups'

function parseId(roleId: string): ObjectId | null {
    try { return new ObjectId(roleId) } catch { return null }
}

async function auth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!client.hasRoles(me, PERMISSIONS.admin.manageDepartmentRoles)) return null
    return me
}


// ── PATCH /api/admin/department-roles/[roleId] ─────────────────────────────
// Body: { name?, discordRoleIds?, tsGroupIds?, permissions? }
// name is rejected (400) for base roles — their identity is fixed.

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ roleId: string }> }
) {
    const me = await auth()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { roleId } = await params
    const objectId = parseId(roleId)
    if (!objectId) return NextResponse.json({ error: 'Invalid roleId' }, { status: 400 })

    const role = await Db.departmentRoles.findOne({ _id: objectId })
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })

    const body = await request.json()
    const updates: Partial<DepartmentRole> = {}

    if (typeof body.name === 'string' && body.name.trim() && body.name.trim() !== role.name) {
        if (role.isBase) return NextResponse.json({ error: 'Base department roles cannot be renamed' }, { status: 400 })
        const conflict = await Db.departmentRoles.findOne({ department: role.department, name: body.name.trim(), _id: { $ne: objectId } })
        if (conflict) return NextResponse.json({ error: 'A role with that name already exists in this department' }, { status: 409 })
        updates.name = body.name.trim()
    }
    if (Array.isArray(body.discordRoleIds)) updates.discordRoleIds = body.discordRoleIds
    if (Array.isArray(body.tsGroupIds)) updates.tsGroupIds = body.tsGroupIds.filter((id: unknown) => typeof id === 'number')
    if (Array.isArray(body.permissions)) {
        updates.permissions = body.permissions.filter((p: unknown) => typeof p === 'string' && PERMISSION_KEYS.includes(p))
    }

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    await Db.departmentRoles.updateOne({ _id: objectId }, { $set: updates })

    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/department-roles/[roleId] ────────────────────────────
// Rejected for base roles (400). Otherwise revokes the role's Discord/
// TeamSpeak grants from every member who currently holds it, then removes
// it from their departmentRoleIds and deletes the role document.

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ roleId: string }> }
) {
    const me = await auth()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { roleId } = await params
    const objectId = parseId(roleId)
    if (!objectId) return NextResponse.json({ error: 'Invalid roleId' }, { status: 400 })

    const role = await Db.departmentRoles.findOne({ _id: objectId })
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    if (role.isBase) return NextResponse.json({ error: 'Base department roles cannot be deleted' }, { status: 400 })

    const holders = await Db.users.find({ departmentRoleIds: objectId }).project({ id: 1 }).toArray()
    const revokePromises = holders.flatMap(u => [
        ...role.discordRoleIds.map(id => removeGuildRole(u.id, id)),
        applyTsServerGroups(u.id, 'remove', role.tsGroupIds),
    ])
    await Promise.allSettled(revokePromises)

    await Db.users.updateMany({ departmentRoleIds: objectId }, { $pull: { departmentRoleIds: objectId } })
    await Db.departmentRoles.deleteOne({ _id: objectId })

    return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Update the doc map**

In `apps/web/docs/map/a-admin-api.md`, find the line documenting `GET/POST /api/admin/orbat/roles` (Part A, ORBAT admin section) and add two new entries near it (anywhere in the file is fine, but grouping near the ORBAT roles entries keeps related catalogs together) — match the file's existing terse, dense style exactly:

```
- `GET/POST /api/admin/department-roles` — GET seeds any missing base roles (one per department, `isBase: true`, fixed name `"{DEPT} Base Role"`, empty grants) then lists all `DepartmentRole` docs, optionally filtered by `?department=j1`. POST creates a sub-role (`isBase: false`) — body `{department, name, discordRoleIds, tsGroupIds, permissions}`, 409 if the name already exists within that department. Gate: `PERMISSIONS.admin.manageDepartmentRoles`. Collections: `Db.departmentRoles`.
- `PATCH/DELETE /api/admin/department-roles/[roleId]` — PATCH updates discordRoleIds/tsGroupIds/permissions for any role; `name` only for non-base roles (400 for base roles). DELETE is rejected (400) for base roles; otherwise revokes the role's Discord/TeamSpeak grants from every member holding it, then cascades — clears the id from their `departmentRoleIds` — before deleting. Gate: `PERMISSIONS.admin.manageDepartmentRoles`. Collections: `Db.departmentRoles`, `Db.users`.
```

- [ ] **Step 4: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Trace through by hand: does `GET` correctly create exactly the missing base roles (not duplicate ones that already exist)? Does `POST` reject a department not in `VALID_DEPTS`? Does `PATCH` reject renaming a base role but still allow updating its grants? Does `DELETE` reject a base role with 400 before touching any data?

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/admin/department-roles apps/web/docs/map/a-admin-api.md
git commit -m "Add Department Roles CRUD API"
```

---

### Task 3: Sync wiring — base role on department add/remove, sub-role assign route

**Files:**
- Modify: `apps/web/app/api/admin/tickets/route.ts`
- Create: `apps/web/app/api/admin/department-roles/assign/route.ts`
- Modify: `apps/web/docs/map/a-admin-api.md`

**Interfaces:**
- Consumes: `Db.departmentRoles`, `DepartmentRole` (Task 1); `addGuildRole`/`removeGuildRole` from `apps/web/lib/discord/bot.ts` (existing); `applyTsServerGroups` from `apps/web/lib/teamspeak/groups.ts` (existing); `PERMISSIONS.departmentLeads`/`PERMISSIONS.admin.manageDepartmentRoles` (existing/Task 1); `logAction` from `apps/web/lib/logAction.ts` (existing).
- Produces: `POST /api/admin/department-roles/assign` → `{ success: true }`, body `{targetUserId, roleId, action: 'add'|'remove'}`. Consumed by Task 7's UI.

- [ ] **Step 1: Hook base-role sync into the department-membership handler**

In `apps/web/app/api/admin/tickets/route.ts`, add these two imports alongside the existing ones near the top of the file:

```ts
import { addGuildRole, removeGuildRole } from '@/lib/discord/bot'
import { applyTsServerGroups } from '@/lib/teamspeak/groups'
```

Find this block inside the `type === 'department-membership'` handler:

```ts
        if (['add', 'remove', 'set-lead', 'remove-lead'].includes(memberAction)) {
            syncDeptDiscordRole(targetUserId, deptCode, memberAction as 'add' | 'remove' | 'set-lead' | 'remove-lead').catch(err =>
                console.error('[tickets] dept Discord role sync failed:', err)
            )
        }
```

Add immediately after it (still inside the same `if (type === 'department-membership')` block, before the `// Log as pre-actioned ticket` comment):

```ts
        // Base department role — implicit for every member of this department,
        // never stored per-user. Stacks on top of the section-level Discord
        // sync above, same pattern as ORBAT's role-level grants.
        if (memberAction === 'add' || memberAction === 'remove') {
            Db.departmentRoles.findOne({ department: deptCode, isBase: true }).then(baseRole => {
                if (!baseRole) return
                const grantFn = memberAction === 'add' ? addGuildRole : removeGuildRole
                return Promise.allSettled([
                    ...baseRole.discordRoleIds.map(id => grantFn(targetUserId, id)),
                    applyTsServerGroups(targetUserId, memberAction, baseRole.tsGroupIds),
                ])
            }).catch(err => console.error('[tickets] dept base-role sync failed:', err))
        }
```

- [ ] **Step 2: Write the sub-role assign route**

Create `apps/web/app/api/admin/department-roles/assign/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { addGuildRole, removeGuildRole } from '@/lib/discord/bot'
import { applyTsServerGroups } from '@/lib/teamspeak/groups'
import { logAction } from '@/lib/logAction'

// ── POST /api/admin/department-roles/assign ────────────────────────────────
// Body: { targetUserId, roleId, action: 'add'|'remove' }
// Toggles a sub-role on a specific member and applies the real Discord/
// TeamSpeak grant or revoke. Never touches base roles (rejected 400).

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { targetUserId, roleId, action } = body
    if (!targetUserId || typeof roleId !== 'string' || (action !== 'add' && action !== 'remove')) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    let objectId: ObjectId
    try { objectId = new ObjectId(roleId) } catch { return NextResponse.json({ error: 'Invalid roleId' }, { status: 400 }) }

    const role = await Db.departmentRoles.findOne({ _id: objectId })
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    if (role.isBase) return NextResponse.json({ error: 'Base department roles are implicit and cannot be assigned directly' }, { status: 400 })

    const leadRoles = PERMISSIONS.departmentLeads[role.department as keyof typeof PERMISSIONS.departmentLeads]
    const isDeptLead = leadRoles ? client.hasRoles(me, leadRoles) : false
    const isManager = client.hasRoles(me, PERMISSIONS.admin.manageDepartmentRoles)
    if (!isDeptLead && !isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (action === 'add') {
        await Db.users.updateOne({ id: targetUserId }, { $addToSet: { departmentRoleIds: objectId } })
    } else {
        await Db.users.updateOne({ id: targetUserId }, { $pull: { departmentRoleIds: objectId } })
    }

    const grantFn = action === 'add' ? addGuildRole : removeGuildRole
    Promise.allSettled([
        ...role.discordRoleIds.map(id => grantFn(targetUserId, id)),
        applyTsServerGroups(targetUserId, action, role.tsGroupIds),
    ]).catch(err => console.error('[department-roles/assign] sync failed:', err))

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: action === 'add' ? 'orbat.assign_department_role' : 'orbat.unassign_department_role',
        category: 'orbat',
        performedBy: me.id,
        performedByName,
        target: `${role.name} (${role.department}) → ${targetUserId}`,
        details: { targetUserId, roleId: String(objectId), department: role.department, roleName: role.name },
    })

    return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Update the doc map**

In `apps/web/docs/map/a-admin-api.md`, add an entry near the two Department Roles entries from Task 2:

```
- `POST /api/admin/department-roles/assign` — toggles a sub-role (never a base role — 400 if attempted) on a specific member: `$addToSet`/`$pull` on `User.departmentRoleIds`, then grants/revokes the role's Discord roles and TeamSpeak groups for real. Gate: `PERMISSIONS.departmentLeads[role.department]` OR `PERMISSIONS.admin.manageDepartmentRoles` (J4 override). Collections: `Db.departmentRoles`, `Db.users`. Logs via `logAction()`.
```

Also update the existing `POST /api/admin/tickets` entry (find it in the same file) to mention the new base-role stacking, following whatever pattern that entry already uses to describe the `department-membership` ticket type's side effects (it should already mention `syncDeptDiscordRole` — add a clause noting the base `DepartmentRole`'s Discord/TeamSpeak grants now also stack on top for `add`/`remove` actions).

- [ ] **Step 4: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Trace through by hand: does adding someone to a department (existing `department-membership` ticket flow) now also grant the base role's Discord/TeamSpeak groups, without touching `set-lead`/`remove-lead`/2ic/3ic actions? Does the assign route correctly reject a base-role id? Does a department lead (not J4) successfully pass the gate for their own department but get 403 for a different department (verify `PERMISSIONS.departmentLeads[role.department]` is looked up by the ROLE's department, not any department the caller happens to be in)?

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/admin/tickets/route.ts apps/web/app/api/admin/department-roles/assign apps/web/docs/map/a-admin-api.md
git commit -m "Wire Discord/TeamSpeak sync into department base-role and sub-role assignment"
```

---

### Task 4: `hasPermission()` extension

**Files:**
- Modify: `apps/web/lib/orbat/hasPermission.ts`
- Modify: `apps/web/docs/map/h-lib-types-components.md`

**Interfaces:**
- Consumes: `Db.departmentRoles`, `DepartmentRole` (Task 1).
- Produces: no signature change to `hasPermission(user: User, key: string): Promise<boolean>` — same function, wider coverage. Nothing downstream depends on new exports.

- [ ] **Step 1: Add the department-role check**

Replace the full contents of `apps/web/lib/orbat/hasPermission.ts` with:

```ts
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { PERMISSION_CATALOG } from '@/lib/permissions-catalog'

/**
 * Additive permission check: true if the user's Discord roles satisfy the
 * existing PERMISSIONS entry for this key, OR any ORBAT position Role they
 * hold grants it, OR their base department role (implicit from
 * User.departments) or any assigned department sub-role grants it. Only
 * ever widens access relative to the existing PERMISSIONS check — never
 * narrows it, so it's safe to introduce without touching any existing gate.
 */
export async function hasPermission(user: User, key: string): Promise<boolean> {
    const discordRoleNames = PERMISSION_CATALOG[key]
    if (discordRoleNames && client.hasRoles(user, discordRoleNames)) return true

    const positions = await Db.orbatPositions
        .find({ userId: user.id, roleId: { $ne: null } }, { projection: { roleId: 1 } })
        .toArray()

    const roleIds = positions
        .map(p => p.roleId)
        .filter((id): id is NonNullable<typeof id> => id !== null && id !== undefined)
    if (roleIds.length > 0) {
        const roles = await Db.orbatRoles.find({ _id: { $in: roleIds } }).toArray()
        if (roles.some(role => role.permissions.includes(key))) return true
    }

    const deptCodes = user.departments ?? []
    const subRoleIds = user.departmentRoleIds ?? []
    if (deptCodes.length > 0 || subRoleIds.length > 0) {
        const deptRoles = await Db.departmentRoles.find({
            $or: [
                { department: { $in: deptCodes }, isBase: true },
                { _id: { $in: subRoleIds } },
            ],
        }).toArray()
        if (deptRoles.some(role => role.permissions.includes(key))) return true
    }

    return false
}
```

- [ ] **Step 2: Update the doc map**

In `apps/web/docs/map/h-lib-types-components.md`, find the entry for `lib/orbat/hasPermission.ts` and update its description to mention the new department-role source, matching the file's existing style (it currently describes the Discord-role and ORBAT-position-Role sources — add a clause for base department role + assigned sub-roles, same additive/never-narrows guarantee).

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Trace through by hand: for a user with `departments: ['j5']` and no `departmentRoleIds`, does the `$or` query correctly match J5's base role (and nothing else)? For a user with an assigned sub-role id but that department code NOT in their `departments` (shouldn't normally happen, but the query shouldn't crash) — confirm the `_id: { $in: subRoleIds }` clause matches independently of the `department`/`isBase` clause, since they're separate `$or` branches.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/orbat/hasPermission.ts apps/web/docs/map/h-lib-types-components.md
git commit -m "Extend hasPermission() with base and sub department-role grants"
```

---

### Task 5: Split RolesManagerPanel into a tab shell + extracted OrbatRolesTab

**Files:**
- Create: `apps/web/app/dashboard/orbat/OrbatRolesTab.tsx`
- Modify: `apps/web/app/dashboard/orbat/RolesManagerPanel.tsx` (full rewrite)
- Modify: `apps/web/docs/map/f-dashboard-j5-j7-other.md`

**Interfaces:**
- Produces: `export default function OrbatRolesTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }): JSX.Element`. `RolesManagerPanel.tsx` keeps its exact existing exported signature: `export default function RolesManagerPanel({ open, onClose }: Props)`. Task 6 produces `DepartmentRolesTab` with the same `{ onDirtyChange }` prop shape, rendered as `RolesManagerPanel`'s second tab.

This task is a pure extraction with one deliberate behavior addition — everything currently inside `RolesManagerPanel.tsx` that is NOT Dialog chrome (the `Dialog`/`DialogTitle`/`Divider`/`DialogContent` wrapper, the header title text, the "Chain of Command" button, the close button, the `ChainOfCommandPanel` render) moves into `OrbatRolesTab.tsx` unchanged, EXCEPT: the existing dirty-guard (`confirmDiscardIfDirty`, wired to `startCreate`/`startEdit`/`handleClose` inside the old single-file version) protected against losing unsaved edits when the whole dialog closed. Splitting into a shell + tab means the shell — not the tab — owns the Dialog's close button/Escape/backdrop handling, so it needs to know whether the active tab is dirty. `onDirtyChange` is how the tab reports that upward; the shell (Step 2) uses it to guard its own close and tab-switch actions. The tab's OWN internal guards (switching roles within itself, its own Discard button) are unaffected and stay exactly as they were.

- [ ] **Step 1: Create OrbatRolesTab.tsx with the extracted content**

Create `apps/web/app/dashboard/orbat/OrbatRolesTab.tsx` with this exact content (this is the current `RolesManagerPanel.tsx` body, restructured to be self-contained and always-rendering — the `open`/`onClose`/loading-spinner/Dialog-chrome responsibilities move to the new shell in Step 2, so this component always renders its list+editor content directly, no Dialog wrapper, no `open` prop, and its own `useEffect` fetches on mount instead of on an `open` prop change):

```tsx
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    TextField, Button, IconButton,
    Checkbox, FormControlLabel, CircularProgress, Alert, Typography, Box, InputAdornment, Tooltip,
} from '@mui/material'
import { ContentCopy, ContentPaste, Delete, Add, Search } from '@mui/icons-material'
import { PLATOON_CATEGORIES } from '@/lib/orbat/constants'

interface GuildRole { id: string; name: string; color: number }
interface TsGroup { id: number; name: string }

const inputSx = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem',
}

const searchFieldSx = {
    ...inputSx,
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
}

const closeButtonSx = { '&:hover': { background: 'rgba(255,255,255,0.08)' } }

const sectionHeaderSx = { fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' } as const

// Discord role colors are stored as decimal ints (0 = "no color" / default grey pill)
function discordColorHex(color: number): string | null {
    if (!color) return null
    return '#' + color.toString(16).padStart(6, '0')
}

// Order-independent — toggling checkboxes can append/remove without preserving
// the original array's order, so a strict equality check would false-positive as dirty.
function sameMembers<T>(a: T[], b: T[]): boolean {
    return a.length === b.length && a.every(x => b.includes(x))
}

function CopyPasteButtons({ onCopy, onPaste, canPaste, label }: { onCopy: () => void; onPaste: () => void; canPaste: boolean; label: string }) {
    return (
        <span style={{ display: 'inline-flex', gap: 2 }}>
            <Tooltip title={`Copy ${label}`}>
                <IconButton size='small' onClick={onCopy} sx={{ p: 0.4, ...closeButtonSx }}>
                    <ContentCopy sx={{ fontSize: 13, color: 'rgba(237,237,237,0.4)' }} />
                </IconButton>
            </Tooltip>
            <Tooltip title={canPaste ? `Paste ${label}` : `Copy ${label} from another role first`}>
                <span>
                    <IconButton size='small' onClick={onPaste} disabled={!canPaste} sx={{ p: 0.4, ...closeButtonSx }}>
                        <ContentPaste sx={{ fontSize: 13, color: canPaste ? 'rgba(100,180,255,0.75)' : 'rgba(237,237,237,0.15)' }} />
                    </IconButton>
                </span>
            </Tooltip>
        </span>
    )
}

export default function OrbatRolesTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const [roles, setRoles] = useState<OrbatRole[]>([])
    const [guildRoles, setGuildRoles] = useState<GuildRole[]>([])
    const [tsGroups, setTsGroups] = useState<TsGroup[]>([])
    const [permissionKeys, setPermissionKeys] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [editingId, setEditingId] = useState<string | null>(null)   // '__new__' for the create form
    const [formName, setFormName] = useState('')
    const [formCategories, setFormCategories] = useState<string[]>([])
    const [formDiscordRoleIds, setFormDiscordRoleIds] = useState<string[]>([])
    const [formTsGroupIds, setFormTsGroupIds] = useState<number[]>([])
    const [formPermissions, setFormPermissions] = useState<string[]>([])
    const [formTag, setFormTag] = useState('')
    const [confirmingDelete, setConfirmingDelete] = useState(false)

    const [roleSearch, setRoleSearch] = useState('')
    const [discordSearch, setDiscordSearch] = useState('')
    const [tsSearch, setTsSearch] = useState('')
    const [permSearch, setPermSearch] = useState('')

    const [categoriesClipboard, setCategoriesClipboard] = useState<string[] | null>(null)
    const [discordRoleIdsClipboard, setDiscordRoleIdsClipboard] = useState<string[] | null>(null)
    const [tsGroupIdsClipboard, setTsGroupIdsClipboard] = useState<number[] | null>(null)
    const [permissionsClipboard, setPermissionsClipboard] = useState<string[] | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const [rolesRes, guildRolesRes, tsGroupsRes, permKeysRes] = await Promise.all([
            fetch('/api/admin/orbat/roles').then(r => r.json()),
            fetch('/api/admin/orbat/discord-roles').then(r => r.json()),
            fetch('/api/teamspeak/groups').then(r => r.json()).catch(() => ({})),
            fetch('/api/admin/orbat/permission-keys').then(r => r.json()),
        ])
        setRoles(rolesRes.roles ?? [])
        setGuildRoles(guildRolesRes.roles ?? [])
        setTsGroups(tsGroupsRes.groups ?? [])
        setPermissionKeys(permKeysRes.keys ?? [])
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const dirty = useMemo(() => {
        if (!editingId) return false
        if (editingId === '__new__') {
            return formName.trim() !== '' || formTag.trim() !== '' || formCategories.length > 0 || formDiscordRoleIds.length > 0 || formTsGroupIds.length > 0 || formPermissions.length > 0
        }
        const original = roles.find(r => String(r._id) === editingId)
        if (!original) return false
        return formName.trim() !== original.name
            || formTag.trim() !== (original.tag ?? '')
            || !sameMembers(formCategories, original.categories)
            || !sameMembers(formDiscordRoleIds, original.discordRoleIds)
            || !sameMembers(formTsGroupIds, original.tsGroupIds ?? [])
            || !sameMembers(formPermissions, original.permissions)
    }, [editingId, formName, formTag, formCategories, formDiscordRoleIds, formTsGroupIds, formPermissions, roles])

    useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])

    function confirmDiscardIfDirty(message: string): boolean {
        return !dirty || window.confirm(message)
    }

    function startCreate() {
        if (editingId === '__new__') return
        if (!confirmDiscardIfDirty('You have unsaved changes. Discard them and create a new role?')) return
        setEditingId('__new__')
        setFormName('')
        setFormCategories([])
        setFormDiscordRoleIds([])
        setFormTsGroupIds([])
        setFormPermissions([])
        setFormTag('')
        setDiscordSearch('')
        setTsSearch('')
        setPermSearch('')
        setError(null)
        setConfirmingDelete(false)
    }

    function startEdit(role: OrbatRole) {
        if (editingId === String(role._id)) return
        if (!confirmDiscardIfDirty('You have unsaved changes. Discard them and switch role?')) return
        setEditingId(String(role._id))
        setFormName(role.name)
        setFormCategories(role.categories)
        setFormDiscordRoleIds(role.discordRoleIds)
        setFormTsGroupIds(role.tsGroupIds ?? [])
        setFormPermissions(role.permissions)
        setFormTag(role.tag ?? '')
        setDiscordSearch('')
        setTsSearch('')
        setPermSearch('')
        setError(null)
        setConfirmingDelete(false)
    }

    function discard() {
        setEditingId(null)
        setError(null)
        setConfirmingDelete(false)
    }

    function copyCategories() { setCategoriesClipboard(formCategories) }
    function pasteCategories() { if (categoriesClipboard) setFormCategories(categoriesClipboard) }
    function copyDiscordRoleIds() { setDiscordRoleIdsClipboard(formDiscordRoleIds) }
    function pasteDiscordRoleIds() { if (discordRoleIdsClipboard) setFormDiscordRoleIds(discordRoleIdsClipboard) }
    function copyTsGroupIds() { setTsGroupIdsClipboard(formTsGroupIds) }
    function pasteTsGroupIds() { if (tsGroupIdsClipboard) setFormTsGroupIds(tsGroupIdsClipboard) }
    function copyPermissions() { setPermissionsClipboard(formPermissions) }
    function pastePermissions() { if (permissionsClipboard) setFormPermissions(permissionsClipboard) }

    function copySettings() {
        copyCategories()
        copyDiscordRoleIds()
        copyTsGroupIds()
        copyPermissions()
    }
    function pasteSettings() {
        pasteCategories()
        pasteDiscordRoleIds()
        pasteTsGroupIds()
        pastePermissions()
    }
    const hasClipboard = categoriesClipboard !== null || discordRoleIdsClipboard !== null || tsGroupIdsClipboard !== null || permissionsClipboard !== null

    async function save() {
        if (!formName.trim()) { setError('Name is required'); return }
        setError(null)
        const body = { name: formName.trim(), categories: formCategories, discordRoleIds: formDiscordRoleIds, tsGroupIds: formTsGroupIds, permissions: formPermissions, tag: formTag }

        const res = editingId === '__new__'
            ? await fetch('/api/admin/orbat/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            : await fetch(`/api/admin/orbat/roles/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setError(data.error ?? 'Save failed')
            return
        }
        setEditingId(null)
        await load()
    }

    async function remove(role: OrbatRole) {
        setError(null)
        const res = await fetch(`/api/admin/orbat/roles/${role._id}`, { method: 'DELETE' })
        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setError(data.inUseCount ? `In use by ${data.inUseCount} position(s) — reassign them first` : (data.error ?? 'Delete failed'))
            return
        }
        if (editingId === String(role._id)) setEditingId(null)
        await load()
    }

    function toggleIn<T>(arr: T[], setArr: (v: T[]) => void, value: T) {
        setArr(arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value])
    }

    const filteredRoles = useMemo(
        () => roles.filter(r => r.name.toLowerCase().includes(roleSearch.trim().toLowerCase())),
        [roles, roleSearch],
    )
    const filteredGuildRoles = useMemo(
        () => guildRoles.filter(r => r.name.toLowerCase().includes(discordSearch.trim().toLowerCase())),
        [guildRoles, discordSearch],
    )
    const filteredTsGroups = useMemo(
        () => tsGroups.filter(g => g.name.toLowerCase().includes(tsSearch.trim().toLowerCase())),
        [tsGroups, tsSearch],
    )
    const filteredPermissionKeys = useMemo(
        () => permissionKeys.filter(k => k.toLowerCase().includes(permSearch.trim().toLowerCase())),
        [permissionKeys, permSearch],
    )
    const permissionRows = useMemo(() => {
        let lastGroup = ''
        return filteredPermissionKeys.map(key => {
            const group = key.split('.')[0]
            const showHeader = group !== lastGroup
            lastGroup = group
            return { key, group, showHeader }
        })
    }, [filteredPermissionKeys])

    return (
        <>
            {error && <Alert severity='error' sx={{ fontSize: '0.72rem', borderRadius: 0 }}>{error}</Alert>}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                    <CircularProgress size={26} />
                </Box>
            ) : (
                <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    {/* Left: role list */}
                    <Box sx={{ width: 300, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            <Button size='small' variant='outlined' startIcon={<Add sx={{ fontSize: 14 }} />} onClick={startCreate}
                                sx={{ fontSize: '0.7rem', letterSpacing: 1, borderColor: 'rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.85)' }}>
                                New Role
                            </Button>
                            <TextField
                                size='small' placeholder='Search roles…' value={roleSearch} onChange={e => setRoleSearch(e.target.value)}
                                InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                sx={searchFieldSx}
                            />
                        </Box>
                        <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 1 }}>
                            {filteredRoles.map(role => {
                                const selected = editingId === String(role._id)
                                return (
                                    <Box key={String(role._id)} onClick={() => startEdit(role)} sx={{
                                        display: 'flex', alignItems: 'center',
                                        padding: '8px 10px', mb: 0.5, cursor: 'pointer',
                                        background: selected ? 'rgba(219,0,29,0.12)' : 'transparent',
                                        border: selected ? '1px solid rgba(219,0,29,0.4)' : '1px solid transparent',
                                        '&:hover': { background: selected ? 'rgba(219,0,29,0.12)' : 'rgba(255,255,255,0.04)' },
                                    }}>
                                        <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.85)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role.name}</span>
                                            {role.tag && (
                                                <span style={{ flexShrink: 0, fontSize: '0.55rem', fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(219,0,29,0.14)', color: 'rgba(219,0,29,0.85)' }}>
                                                    {role.tag}
                                                </span>
                                            )}
                                        </span>
                                    </Box>
                                )
                            })}
                            {filteredRoles.length === 0 && (
                                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', padding: '8px 10px' }}>
                                    {roles.length === 0 ? 'No roles defined yet.' : 'No roles match your search.'}
                                </div>
                            )}
                        </Box>
                    </Box>

                    {/* Right: editor */}
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {!editingId ? (
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Typography sx={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic' }}>
                                    Select a role to edit, or create a new one.
                                </Typography>
                            </Box>
                        ) : (
                            <>
                                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 3 }}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 1400, flex: 1, minHeight: 0 }}>
                                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', flexShrink: 0 }}>
                                            <TextField size='small' label='Name' value={formName} onChange={e => setFormName(e.target.value)} sx={{ ...inputSx, flex: '1 1 260px' }} />
                                            <div>
                                                <TextField
                                                    size='small' label='Tag (optional)' value={formTag} onChange={e => setFormTag(e.target.value)}
                                                    inputProps={{ maxLength: 12 }} sx={{ ...inputSx, width: 200 }}
                                                />
                                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', marginTop: 4 }}>
                                                    Distinguishes roles sharing this name — never shown publicly.
                                                </div>
                                            </div>
                                        </Box>

                                        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                                            <Button size='small' variant='outlined' startIcon={<ContentCopy sx={{ fontSize: 14 }} />} onClick={copySettings}
                                                sx={{ fontSize: '0.65rem', letterSpacing: 0.5, borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.7)' }}>
                                                Copy Settings
                                            </Button>
                                            <Button size='small' variant='outlined' startIcon={<ContentPaste sx={{ fontSize: 14 }} />} onClick={pasteSettings} disabled={!hasClipboard}
                                                sx={{ fontSize: '0.65rem', letterSpacing: 0.5, borderColor: 'rgba(100,180,255,0.4)', color: 'rgba(100,180,255,0.85)' }}>
                                                Paste Settings
                                            </Button>
                                        </Box>

                                        <Box sx={{ display: 'flex', gap: 3, flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
                                            <div style={{ flex: '0 0 240px', minWidth: 240, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <div style={sectionHeaderSx}>Categories (none = all)</div>
                                                    <CopyPasteButtons onCopy={copyCategories} onPaste={pasteCategories} canPaste={categoriesClipboard !== null} label='categories' />
                                                </div>
                                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                    {PLATOON_CATEGORIES.map(c => (
                                                        <FormControlLabel key={c._id} sx={{ ml: 0, whiteSpace: 'nowrap' }}
                                                            control={<Checkbox size='small' checked={formCategories.includes(c._id)} onChange={() => toggleIn(formCategories, setFormCategories, c._id)} />}
                                                            label={<span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>{c.label}</span>}
                                                        />
                                                    ))}
                                                </Box>
                                            </div>

                                            <div style={{ flex: '1 0 260px', minWidth: 260, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <div style={sectionHeaderSx}>Discord roles granted {formDiscordRoleIds.length > 0 && `(${formDiscordRoleIds.length} selected)`}</div>
                                                    <CopyPasteButtons onCopy={copyDiscordRoleIds} onPaste={pasteDiscordRoleIds} canPaste={discordRoleIdsClipboard !== null} label='Discord roles' />
                                                </div>
                                                <TextField
                                                    size='small' fullWidth placeholder='Search discord roles…' value={discordSearch} onChange={e => setDiscordSearch(e.target.value)}
                                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                                    sx={{ ...searchFieldSx, mb: 1, flexShrink: 0 }}
                                                />
                                                <div style={{ flex: 1, minHeight: 120, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
                                                    {filteredGuildRoles.map(r => {
                                                        const hex = discordColorHex(r.color)
                                                        return (
                                                            <FormControlLabel key={r.id} sx={{ display: 'flex', ml: 0, px: 1 }}
                                                                control={<Checkbox size='small' checked={formDiscordRoleIds.includes(r.id)} onChange={() => toggleIn(formDiscordRoleIds, setFormDiscordRoleIds, r.id)} />}
                                                                label={
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>
                                                                        <span style={{
                                                                            width: 9, height: 9, borderRadius: '50%', marginRight: 7, flexShrink: 0,
                                                                            background: hex ?? 'rgba(255,255,255,0.2)',
                                                                            border: hex ? 'none' : '1px solid rgba(255,255,255,0.3)',
                                                                        }} />
                                                                        {r.name}
                                                                    </span>
                                                                }
                                                            />
                                                        )
                                                    })}
                                                    {filteredGuildRoles.length === 0 && (
                                                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', padding: '8px' }}>No matching Discord roles.</div>
                                                    )}
                                                </div>
                                            </div>

                                            <div style={{ flex: '1 0 260px', minWidth: 260, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <div style={sectionHeaderSx}>TeamSpeak roles granted {formTsGroupIds.length > 0 && `(${formTsGroupIds.length} selected)`}</div>
                                                    <CopyPasteButtons onCopy={copyTsGroupIds} onPaste={pasteTsGroupIds} canPaste={tsGroupIdsClipboard !== null} label='TeamSpeak roles' />
                                                </div>
                                                <TextField
                                                    size='small' fullWidth placeholder='Search TeamSpeak roles…' value={tsSearch} onChange={e => setTsSearch(e.target.value)}
                                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                                    sx={{ ...searchFieldSx, mb: 1, flexShrink: 0 }}
                                                />
                                                <div style={{ flex: 1, minHeight: 120, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
                                                    {filteredTsGroups.map(g => (
                                                        <FormControlLabel key={g.id} sx={{ display: 'flex', ml: 0, px: 1 }}
                                                            control={<Checkbox size='small' checked={formTsGroupIds.includes(g.id)} onChange={() => toggleIn(formTsGroupIds, setFormTsGroupIds, g.id)} />}
                                                            label={<span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>{g.name}</span>}
                                                        />
                                                    ))}
                                                    {filteredTsGroups.length === 0 && (
                                                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', padding: '8px' }}>No matching TeamSpeak roles.</div>
                                                    )}
                                                </div>
                                            </div>

                                            <div style={{ flex: '1 0 260px', minWidth: 260, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <div style={sectionHeaderSx}>Permissions granted {formPermissions.length > 0 && `(${formPermissions.length} selected)`}</div>
                                                    <CopyPasteButtons onCopy={copyPermissions} onPaste={pastePermissions} canPaste={permissionsClipboard !== null} label='permissions' />
                                                </div>
                                                <TextField
                                                    size='small' fullWidth placeholder='Search permissions…' value={permSearch} onChange={e => setPermSearch(e.target.value)}
                                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                                    sx={{ ...searchFieldSx, mb: 1, flexShrink: 0 }}
                                                />
                                                <div style={{ flex: 1, minHeight: 120, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
                                                    {permissionRows.map(({ key, group, showHeader }) => (
                                                        <div key={key}>
                                                            {showHeader && (
                                                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', padding: '6px 8px 2px' }}>
                                                                    {group}
                                                                </div>
                                                            )}
                                                            <FormControlLabel sx={{ display: 'block', ml: 0, px: 1 }}
                                                                control={<Checkbox size='small' checked={formPermissions.includes(key)} onChange={() => toggleIn(formPermissions, setFormPermissions, key)} />}
                                                                label={<span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.6)', fontFamily: 'monospace' }}>{key}</span>}
                                                            />
                                                        </div>
                                                    ))}
                                                    {permissionRows.length === 0 && (
                                                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', padding: '8px' }}>No matching permissions.</div>
                                                    )}
                                                </div>
                                            </div>
                                        </Box>
                                    </Box>
                                </Box>

                                <Box sx={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(15,15,15,0.98)', p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Button variant='contained' onClick={save}
                                        sx={{ background: 'var(--red)', fontWeight: 700, letterSpacing: 1, fontSize: '0.75rem', '&:hover': { background: 'rgba(219,0,29,0.85)' } }}>
                                        Save
                                    </Button>
                                    <Button variant='outlined' onClick={discard}
                                        sx={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.6)' }}>
                                        Discard
                                    </Button>
                                    {dirty && (
                                        <Typography sx={{ fontSize: '0.68rem', color: 'rgba(255,180,80,0.85)', fontStyle: 'italic' }}>
                                            Unsaved changes
                                        </Typography>
                                    )}

                                    {editingId !== '__new__' && (
                                        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {confirmingDelete ? (
                                                <>
                                                    <Typography sx={{ fontSize: '0.68rem', color: 'rgba(219,0,29,0.85)' }}>
                                                        Delete this role permanently?
                                                    </Typography>
                                                    <Button
                                                        size='small' variant='contained'
                                                        onClick={() => { const role = roles.find(r => String(r._id) === editingId); if (role) remove(role) }}
                                                        sx={{ background: 'var(--red)', fontSize: '0.68rem', '&:hover': { background: 'rgba(219,0,29,0.85)' } }}
                                                    >
                                                        Confirm Delete
                                                    </Button>
                                                    <Button size='small' onClick={() => setConfirmingDelete(false)} sx={{ color: 'rgba(237,237,237,0.5)' }}>
                                                        Cancel
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button
                                                    size='small' variant='outlined' startIcon={<Delete sx={{ fontSize: 14 }} />} onClick={() => setConfirmingDelete(true)}
                                                    sx={{ fontSize: '0.68rem', borderColor: 'rgba(219,0,29,0.35)', color: 'rgba(219,0,29,0.7)' }}
                                                >
                                                    Delete Role
                                                </Button>
                                            )}
                                        </Box>
                                    )}
                                </Box>
                            </>
                        )}
                    </Box>
                </Box>
            )}
        </>
    )
}
```

- [ ] **Step 2: Rewrite RolesManagerPanel.tsx as a thin tab shell**

Replace the full contents of `apps/web/app/dashboard/orbat/RolesManagerPanel.tsx` with:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogTitle, DialogContent, Divider, Button, IconButton, Typography } from '@mui/material'
import { AccountTree, Close } from '@mui/icons-material'
import ChainOfCommandPanel from './ChainOfCommandPanel'
import OrbatRolesTab from './OrbatRolesTab'
import DepartmentRolesTab from './DepartmentRolesTab'

interface Props {
    open: boolean
    onClose: () => void
}

const closeButtonSx = { '&:hover': { background: 'rgba(255,255,255,0.08)' } }

const tabButtonSx = (active: boolean) => ({
    fontSize: '0.68rem', letterSpacing: 1, borderRadius: 0,
    borderBottom: active ? '2px solid var(--red)' : '2px solid transparent',
    color: active ? 'rgba(237,237,237,0.95)' : 'rgba(237,237,237,0.4)',
    px: 2, py: 1, minWidth: 0,
    '&:hover': { background: 'rgba(255,255,255,0.04)', color: 'rgba(237,237,237,0.8)' },
})

export default function RolesManagerPanel({ open, onClose }: Props) {
    const [tab, setTab] = useState<'orbat' | 'department'>('orbat')
    const [chainOpen, setChainOpen] = useState(false)
    // Whichever tab is currently mounted reports its own dirty state up here —
    // the shell owns the Dialog's close button/Escape/backdrop, so it's the
    // one that needs to know whether closing would discard unsaved work.
    const [activeDirty, setActiveDirty] = useState(false)

    useEffect(() => { if (!open) { setTab('orbat'); setActiveDirty(false) } }, [open])

    function confirmDiscardIfDirty(message: string): boolean {
        return !activeDirty || window.confirm(message)
    }

    function handleClose() {
        if (!confirmDiscardIfDirty('You have unsaved changes. Discard them and close?')) return
        onClose()
    }

    function switchTab(next: 'orbat' | 'department') {
        if (tab === next) return
        if (!confirmDiscardIfDirty('You have unsaved changes. Discard them and switch tabs?')) return
        setActiveDirty(false)   // the current tab is about to unmount — its edit is gone either way
        setTab(next)
    }

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth={false}
            fullWidth
            PaperProps={{
                style: {
                    background: 'var(--background, #0a0a0a)',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    height: '85vh',
                    width: '90vw',
                    maxWidth: 1800,
                },
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                <div>
                    <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', mb: 0.5 }}>
                        ORBAT Administration
                    </Typography>
                    <Typography fontWeight={700} fontSize='0.95rem' letterSpacing={3} sx={{ textTransform: 'uppercase' }}>
                        Roles Manager
                    </Typography>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {tab === 'orbat' && (
                        <Button size='small' variant='outlined' startIcon={<AccountTree sx={{ fontSize: 15 }} />} onClick={() => setChainOpen(true)}
                            sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.85)' }}>
                            Chain of Command
                        </Button>
                    )}
                    <IconButton size='small' onClick={handleClose} sx={closeButtonSx}><Close sx={{ fontSize: 18, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
                </div>
            </DialogTitle>

            <div style={{ display: 'flex', borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
                <Button disableRipple onClick={() => switchTab('orbat')} sx={tabButtonSx(tab === 'orbat')}>ORBAT Roles</Button>
                <Button disableRipple onClick={() => switchTab('department')} sx={tabButtonSx(tab === 'department')}>Department Roles</Button>
            </div>

            <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                {tab === 'orbat' ? <OrbatRolesTab onDirtyChange={setActiveDirty} /> : <DepartmentRolesTab onDirtyChange={setActiveDirty} />}
            </DialogContent>

            <ChainOfCommandPanel open={chainOpen} onClose={() => setChainOpen(false)} />
        </Dialog>
    )
}
```

Note: this references `DepartmentRolesTab` from Task 6, which doesn't exist yet at the end of this task. That's expected and handled in Step 3 below — do not skip Step 3.

- [ ] **Step 3: Stub DepartmentRolesTab so the app compiles**

Create `apps/web/app/dashboard/orbat/DepartmentRolesTab.tsx` with a minimal placeholder (Task 6 replaces this file entirely with the real implementation):

```tsx
'use client'

import { Box, Typography } from '@mui/material'

export default function DepartmentRolesTab({ onDirtyChange: _onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    return (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic' }}>
                Coming soon.
            </Typography>
        </Box>
    )
}
```

- [ ] **Step 4: Update the doc map**

In `apps/web/docs/map/f-dashboard-j5-j7-other.md`, find the `RolesManagerPanel.tsx` entry and split it: update the `RolesManagerPanel.tsx` entry to describe it as the thin tab-shell (Dialog chrome, "ORBAT Roles"/"Department Roles" tab switcher, "Chain of Command" button only on the ORBAT tab), and add a new `OrbatRolesTab.tsx` entry directly beneath it carrying over everything the old `RolesManagerPanel.tsx` entry described (list/create/edit/delete, copy/paste clipboards, dirty-guard, sticky footer, two-stage delete, Calls list) — same content, just retitled to the new file. Leave a note that `DepartmentRolesTab.tsx` is documented fully in Task 6 (don't invent its description here).

- [ ] **Step 5: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Trace through by hand: does every piece of state/logic that existed in the old `RolesManagerPanel.tsx` now exist in `OrbatRolesTab.tsx` with no gaps? Does the ternary `{tab === 'orbat' ? <OrbatRolesTab onDirtyChange={setActiveDirty} /> : <DepartmentRolesTab onDirtyChange={setActiveDirty} />}` unmount the inactive tab when switching (yes — expected, switching tabs is a bigger context switch than switching roles within a tab, no requirement to preserve state across tabs, just confirm it doesn't crash)? Critically: with `formName` (say) edited but not saved inside `OrbatRolesTab`, does clicking the dialog's X button now correctly trigger the "unsaved changes" `window.confirm()` instead of silently closing (this is the regression this task's `onDirtyChange` prop exists to prevent — trace the chain: `OrbatRolesTab`'s `dirty` useMemo → its `useEffect(() => onDirtyChange(dirty), ...)` → the shell's `setActiveDirty` → the shell's `handleClose`'s `confirmDiscardIfDirty` check)? Does clicking the "Department Roles" tab button while dirty trigger the same confirm via `switchTab`, instead of silently discarding the edit?

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/dashboard/orbat/OrbatRolesTab.tsx apps/web/app/dashboard/orbat/RolesManagerPanel.tsx apps/web/app/dashboard/orbat/DepartmentRolesTab.tsx apps/web/docs/map/f-dashboard-j5-j7-other.md
git commit -m "Split RolesManagerPanel into a tab shell and extracted OrbatRolesTab"
```

---

### Task 6: DepartmentRolesTab — the real implementation

**Files:**
- Modify: `apps/web/app/dashboard/orbat/DepartmentRolesTab.tsx` (full rewrite, replacing Task 5's stub)
- Modify: `apps/web/docs/map/f-dashboard-j5-j7-other.md`

**Interfaces:**
- Consumes: `GET/POST /api/admin/department-roles`, `PATCH/DELETE /api/admin/department-roles/[roleId]` (Task 2); `GET /api/admin/orbat/discord-roles`, `GET /api/teamspeak/groups`, `GET /api/admin/orbat/permission-keys` (existing, same as `OrbatRolesTab`); `DEPT_ROLES` from `apps/web/lib/discord/dept-roles.ts` (existing, for department code → display label).
- Produces: `export default function DepartmentRolesTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void })`, matching `OrbatRolesTab`'s shape and reporting its own `dirty` state the same way (Task 5's shell already expects this prop — this task just replaces the stub's ignored version with a real one that actually calls it).

- [ ] **Step 1: Write the full component**

Replace the full contents of `apps/web/app/dashboard/orbat/DepartmentRolesTab.tsx` with:

```tsx
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    TextField, Button, IconButton,
    Checkbox, FormControlLabel, CircularProgress, Alert, Typography, Box, InputAdornment, Tooltip,
} from '@mui/material'
import { ContentCopy, ContentPaste, Delete, Add, Search } from '@mui/icons-material'
import { DEPT_ROLES } from '@/lib/discord/dept-roles'

interface GuildRole { id: string; name: string; color: number }
interface TsGroup { id: number; name: string }

const DEPT_CODES = Object.keys(DEPT_ROLES)
const DEPT_LABELS: Record<string, string> = Object.fromEntries(DEPT_CODES.map(c => [c, c.toUpperCase()]))

const inputSx = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem',
}

const searchFieldSx = {
    ...inputSx,
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
}

const closeButtonSx = { '&:hover': { background: 'rgba(255,255,255,0.08)' } }

const sectionHeaderSx = { fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' } as const

function discordColorHex(color: number): string | null {
    if (!color) return null
    return '#' + color.toString(16).padStart(6, '0')
}

function sameMembers<T>(a: T[], b: T[]): boolean {
    return a.length === b.length && a.every(x => b.includes(x))
}

function toggleIn<T>(arr: T[], setArr: (v: T[]) => void, value: T) {
    setArr(arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value])
}

function CopyPasteButtons({ onCopy, onPaste, canPaste, label }: { onCopy: () => void; onPaste: () => void; canPaste: boolean; label: string }) {
    return (
        <span style={{ display: 'inline-flex', gap: 2 }}>
            <Tooltip title={`Copy ${label}`}>
                <IconButton size='small' onClick={onCopy} sx={{ p: 0.4, ...closeButtonSx }}>
                    <ContentCopy sx={{ fontSize: 13, color: 'rgba(237,237,237,0.4)' }} />
                </IconButton>
            </Tooltip>
            <Tooltip title={canPaste ? `Paste ${label}` : `Copy ${label} from another role first`}>
                <span>
                    <IconButton size='small' onClick={onPaste} disabled={!canPaste} sx={{ p: 0.4, ...closeButtonSx }}>
                        <ContentPaste sx={{ fontSize: 13, color: canPaste ? 'rgba(100,180,255,0.75)' : 'rgba(237,237,237,0.15)' }} />
                    </IconButton>
                </span>
            </Tooltip>
        </span>
    )
}

export default function DepartmentRolesTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const [roles, setRoles] = useState<DepartmentRole[]>([])
    const [guildRoles, setGuildRoles] = useState<GuildRole[]>([])
    const [tsGroups, setTsGroups] = useState<TsGroup[]>([])
    const [permissionKeys, setPermissionKeys] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [editingId, setEditingId] = useState<string | null>(null)   // '__new__:jN' for the create form, scoped to department jN
    const [formName, setFormName] = useState('')
    const [formDiscordRoleIds, setFormDiscordRoleIds] = useState<string[]>([])
    const [formTsGroupIds, setFormTsGroupIds] = useState<number[]>([])
    const [formPermissions, setFormPermissions] = useState<string[]>([])
    const [confirmingDelete, setConfirmingDelete] = useState(false)

    const [discordSearch, setDiscordSearch] = useState('')
    const [tsSearch, setTsSearch] = useState('')
    const [permSearch, setPermSearch] = useState('')

    const [discordRoleIdsClipboard, setDiscordRoleIdsClipboard] = useState<string[] | null>(null)
    const [tsGroupIdsClipboard, setTsGroupIdsClipboard] = useState<number[] | null>(null)
    const [permissionsClipboard, setPermissionsClipboard] = useState<string[] | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const [rolesRes, guildRolesRes, tsGroupsRes, permKeysRes] = await Promise.all([
            fetch('/api/admin/department-roles').then(r => r.json()),
            fetch('/api/admin/orbat/discord-roles').then(r => r.json()),
            fetch('/api/teamspeak/groups').then(r => r.json()).catch(() => ({})),
            fetch('/api/admin/orbat/permission-keys').then(r => r.json()),
        ])
        setRoles(rolesRes.roles ?? [])
        setGuildRoles(guildRolesRes.roles ?? [])
        setTsGroups(tsGroupsRes.groups ?? [])
        setPermissionKeys(permKeysRes.keys ?? [])
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const editingRole = useMemo(
        () => (editingId && editingId !== '__new__' ? roles.find(r => String(r._id) === editingId) ?? null : null) as DepartmentRole | null,
        [editingId, roles],
    )
    const newRoleDept = editingId?.startsWith('__new__:') ? editingId.slice('__new__:'.length) : null

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

    useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])

    function confirmDiscardIfDirty(message: string): boolean {
        return !dirty || window.confirm(message)
    }

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

    function discard() {
        setEditingId(null)
        setError(null)
        setConfirmingDelete(false)
    }

    function copyDiscordRoleIds() { setDiscordRoleIdsClipboard(formDiscordRoleIds) }
    function pasteDiscordRoleIds() { if (discordRoleIdsClipboard) setFormDiscordRoleIds(discordRoleIdsClipboard) }
    function copyTsGroupIds() { setTsGroupIdsClipboard(formTsGroupIds) }
    function pasteTsGroupIds() { if (tsGroupIdsClipboard) setFormTsGroupIds(tsGroupIdsClipboard) }
    function copyPermissions() { setPermissionsClipboard(formPermissions) }
    function pastePermissions() { if (permissionsClipboard) setFormPermissions(permissionsClipboard) }

    function copySettings() {
        copyDiscordRoleIds()
        copyTsGroupIds()
        copyPermissions()
    }
    function pasteSettings() {
        pasteDiscordRoleIds()
        pasteTsGroupIds()
        pastePermissions()
    }
    const hasClipboard = discordRoleIdsClipboard !== null || tsGroupIdsClipboard !== null || permissionsClipboard !== null

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

        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setError(data.error ?? 'Save failed')
            return
        }
        setEditingId(null)
        await load()
    }

    async function remove(role: DepartmentRole) {
        setError(null)
        const res = await fetch(`/api/admin/department-roles/${role._id}`, { method: 'DELETE' })
        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setError(data.error ?? 'Delete failed')
            return
        }
        if (editingId === String(role._id)) setEditingId(null)
        await load()
    }

    const filteredGuildRoles = useMemo(
        () => guildRoles.filter(r => r.name.toLowerCase().includes(discordSearch.trim().toLowerCase())),
        [guildRoles, discordSearch],
    )
    const filteredTsGroups = useMemo(
        () => tsGroups.filter(g => g.name.toLowerCase().includes(tsSearch.trim().toLowerCase())),
        [tsGroups, tsSearch],
    )
    const filteredPermissionKeys = useMemo(
        () => permissionKeys.filter(k => k.toLowerCase().includes(permSearch.trim().toLowerCase())),
        [permissionKeys, permSearch],
    )
    const permissionRows = useMemo(() => {
        let lastGroup = ''
        return filteredPermissionKeys.map(key => {
            const group = key.split('.')[0]
            const showHeader = group !== lastGroup
            lastGroup = group
            return { key, group, showHeader }
        })
    }, [filteredPermissionKeys])

    const rolesByDept = useMemo(() => {
        const map: Record<string, DepartmentRole[]> = {}
        for (const code of DEPT_CODES) map[code] = []
        for (const role of roles) (map[role.department] ??= []).push(role)
        for (const code of DEPT_CODES) {
            map[code].sort((a, b) => a.isBase === b.isBase ? a.name.localeCompare(b.name) : a.isBase ? -1 : 1)
        }
        return map
    }, [roles])

    const editingName = newRoleDept ? '' : editingRole?.name
    const isEditingBase = !newRoleDept && !!editingRole?.isBase

    return (
        <>
            {error && <Alert severity='error' sx={{ fontSize: '0.72rem', borderRadius: 0 }}>{error}</Alert>}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                    <CircularProgress size={26} />
                </Box>
            ) : (
                <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    {/* Left: role list, grouped by department */}
                    <Box sx={{ width: 300, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto' }}>
                        {DEPT_CODES.map(code => (
                            <Box key={code} sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: '10px 12px 6px' }}>
                                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: 1, color: 'rgba(219,0,29,0.75)' }}>
                                        {DEPT_LABELS[code]}
                                    </Typography>
                                    <IconButton size='small' onClick={() => startCreate(code)} sx={closeButtonSx}>
                                        <Add sx={{ fontSize: 14, color: 'rgba(237,237,237,0.5)' }} />
                                    </IconButton>
                                </Box>
                                {rolesByDept[code].map(role => {
                                    const selected = editingId === String(role._id)
                                    return (
                                        <Box key={String(role._id)} onClick={() => startEdit(role)} sx={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '6px 12px', ml: 1, mr: 1, mb: 0.5, cursor: 'pointer',
                                            background: selected ? 'rgba(219,0,29,0.12)' : 'transparent',
                                            border: selected ? '1px solid rgba(219,0,29,0.4)' : '1px solid transparent',
                                            '&:hover': { background: selected ? 'rgba(219,0,29,0.12)' : 'rgba(255,255,255,0.04)' },
                                        }}>
                                            <span style={{ fontSize: '0.76rem', color: 'rgba(237,237,237,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {role.name}
                                            </span>
                                            {role.isBase && (
                                                <span style={{ flexShrink: 0, fontSize: '0.52rem', fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(100,180,255,0.12)', color: 'rgba(100,180,255,0.85)' }}>
                                                    BASE
                                                </span>
                                            )}
                                        </Box>
                                    )
                                })}
                            </Box>
                        ))}
                    </Box>

                    {/* Right: editor */}
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {!editingId ? (
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Typography sx={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic' }}>
                                    Select a role to edit, or create a new sub-role from a department above.
                                </Typography>
                            </Box>
                        ) : (
                            <>
                                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 3 }}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 1400, flex: 1, minHeight: 0 }}>
                                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', flexShrink: 0 }}>
                                            <TextField
                                                size='small' label='Name' value={newRoleDept ? formName : (editingName ?? formName)}
                                                onChange={e => setFormName(e.target.value)}
                                                disabled={isEditingBase}
                                                sx={{ ...inputSx, flex: '1 1 260px' }}
                                            />
                                            {isEditingBase && (
                                                <Typography sx={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', alignSelf: 'center' }}>
                                                    Base roles can't be renamed.
                                                </Typography>
                                            )}
                                        </Box>

                                        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                                            <Button size='small' variant='outlined' startIcon={<ContentCopy sx={{ fontSize: 14 }} />} onClick={copySettings}
                                                sx={{ fontSize: '0.65rem', letterSpacing: 0.5, borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.7)' }}>
                                                Copy Settings
                                            </Button>
                                            <Button size='small' variant='outlined' startIcon={<ContentPaste sx={{ fontSize: 14 }} />} onClick={pasteSettings} disabled={!hasClipboard}
                                                sx={{ fontSize: '0.65rem', letterSpacing: 0.5, borderColor: 'rgba(100,180,255,0.4)', color: 'rgba(100,180,255,0.85)' }}>
                                                Paste Settings
                                            </Button>
                                        </Box>

                                        <Box sx={{ display: 'flex', gap: 3, flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
                                            <div style={{ flex: '1 0 260px', minWidth: 260, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <div style={sectionHeaderSx}>Discord roles granted {formDiscordRoleIds.length > 0 && `(${formDiscordRoleIds.length} selected)`}</div>
                                                    <CopyPasteButtons onCopy={copyDiscordRoleIds} onPaste={pasteDiscordRoleIds} canPaste={discordRoleIdsClipboard !== null} label='Discord roles' />
                                                </div>
                                                <TextField
                                                    size='small' fullWidth placeholder='Search discord roles…' value={discordSearch} onChange={e => setDiscordSearch(e.target.value)}
                                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                                    sx={{ ...searchFieldSx, mb: 1, flexShrink: 0 }}
                                                />
                                                <div style={{ flex: 1, minHeight: 120, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
                                                    {filteredGuildRoles.map(r => {
                                                        const hex = discordColorHex(r.color)
                                                        return (
                                                            <FormControlLabel key={r.id} sx={{ display: 'flex', ml: 0, px: 1 }}
                                                                control={<Checkbox size='small' checked={formDiscordRoleIds.includes(r.id)} onChange={() => toggleIn(formDiscordRoleIds, setFormDiscordRoleIds, r.id)} />}
                                                                label={
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>
                                                                        <span style={{
                                                                            width: 9, height: 9, borderRadius: '50%', marginRight: 7, flexShrink: 0,
                                                                            background: hex ?? 'rgba(255,255,255,0.2)',
                                                                            border: hex ? 'none' : '1px solid rgba(255,255,255,0.3)',
                                                                        }} />
                                                                        {r.name}
                                                                    </span>
                                                                }
                                                            />
                                                        )
                                                    })}
                                                    {filteredGuildRoles.length === 0 && (
                                                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', padding: '8px' }}>No matching Discord roles.</div>
                                                    )}
                                                </div>
                                            </div>

                                            <div style={{ flex: '1 0 260px', minWidth: 260, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <div style={sectionHeaderSx}>TeamSpeak roles granted {formTsGroupIds.length > 0 && `(${formTsGroupIds.length} selected)`}</div>
                                                    <CopyPasteButtons onCopy={copyTsGroupIds} onPaste={pasteTsGroupIds} canPaste={tsGroupIdsClipboard !== null} label='TeamSpeak roles' />
                                                </div>
                                                <TextField
                                                    size='small' fullWidth placeholder='Search TeamSpeak roles…' value={tsSearch} onChange={e => setTsSearch(e.target.value)}
                                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                                    sx={{ ...searchFieldSx, mb: 1, flexShrink: 0 }}
                                                />
                                                <div style={{ flex: 1, minHeight: 120, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
                                                    {filteredTsGroups.map(g => (
                                                        <FormControlLabel key={g.id} sx={{ display: 'flex', ml: 0, px: 1 }}
                                                            control={<Checkbox size='small' checked={formTsGroupIds.includes(g.id)} onChange={() => toggleIn(formTsGroupIds, setFormTsGroupIds, g.id)} />}
                                                            label={<span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>{g.name}</span>}
                                                        />
                                                    ))}
                                                    {filteredTsGroups.length === 0 && (
                                                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', padding: '8px' }}>No matching TeamSpeak roles.</div>
                                                    )}
                                                </div>
                                            </div>

                                            <div style={{ flex: '1 0 260px', minWidth: 260, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <div style={sectionHeaderSx}>Permissions granted {formPermissions.length > 0 && `(${formPermissions.length} selected)`}</div>
                                                    <CopyPasteButtons onCopy={copyPermissions} onPaste={pastePermissions} canPaste={permissionsClipboard !== null} label='permissions' />
                                                </div>
                                                <TextField
                                                    size='small' fullWidth placeholder='Search permissions…' value={permSearch} onChange={e => setPermSearch(e.target.value)}
                                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                                    sx={{ ...searchFieldSx, mb: 1, flexShrink: 0 }}
                                                />
                                                <div style={{ flex: 1, minHeight: 120, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
                                                    {permissionRows.map(({ key, group, showHeader }) => (
                                                        <div key={key}>
                                                            {showHeader && (
                                                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', padding: '6px 8px 2px' }}>
                                                                    {group}
                                                                </div>
                                                            )}
                                                            <FormControlLabel sx={{ display: 'block', ml: 0, px: 1 }}
                                                                control={<Checkbox size='small' checked={formPermissions.includes(key)} onChange={() => toggleIn(formPermissions, setFormPermissions, key)} />}
                                                                label={<span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.6)', fontFamily: 'monospace' }}>{key}</span>}
                                                            />
                                                        </div>
                                                    ))}
                                                    {permissionRows.length === 0 && (
                                                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', padding: '8px' }}>No matching permissions.</div>
                                                    )}
                                                </div>
                                            </div>
                                        </Box>
                                    </Box>
                                </Box>

                                <Box sx={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(15,15,15,0.98)', p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Button variant='contained' onClick={save}
                                        sx={{ background: 'var(--red)', fontWeight: 700, letterSpacing: 1, fontSize: '0.75rem', '&:hover': { background: 'rgba(219,0,29,0.85)' } }}>
                                        Save
                                    </Button>
                                    <Button variant='outlined' onClick={discard}
                                        sx={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.6)' }}>
                                        Discard
                                    </Button>
                                    {dirty && (
                                        <Typography sx={{ fontSize: '0.68rem', color: 'rgba(255,180,80,0.85)', fontStyle: 'italic' }}>
                                            Unsaved changes
                                        </Typography>
                                    )}

                                    {!newRoleDept && !isEditingBase && (
                                        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {confirmingDelete ? (
                                                <>
                                                    <Typography sx={{ fontSize: '0.68rem', color: 'rgba(219,0,29,0.85)' }}>
                                                        Delete this role permanently?
                                                    </Typography>
                                                    <Button
                                                        size='small' variant='contained'
                                                        onClick={() => { if (editingRole) remove(editingRole) }}
                                                        sx={{ background: 'var(--red)', fontSize: '0.68rem', '&:hover': { background: 'rgba(219,0,29,0.85)' } }}
                                                    >
                                                        Confirm Delete
                                                    </Button>
                                                    <Button size='small' onClick={() => setConfirmingDelete(false)} sx={{ color: 'rgba(237,237,237,0.5)' }}>
                                                        Cancel
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button
                                                    size='small' variant='outlined' startIcon={<Delete sx={{ fontSize: 14 }} />} onClick={() => setConfirmingDelete(true)}
                                                    sx={{ fontSize: '0.68rem', borderColor: 'rgba(219,0,29,0.35)', color: 'rgba(219,0,29,0.7)' }}
                                                >
                                                    Delete Role
                                                </Button>
                                            )}
                                        </Box>
                                    )}
                                </Box>
                            </>
                        )}
                    </Box>
                </Box>
            )}
        </>
    )
}
```

- [ ] **Step 2: Update the doc map**

In `apps/web/docs/map/f-dashboard-j5-j7-other.md`, replace the placeholder note left by Task 5 with a real entry for `DepartmentRolesTab.tsx`, matching `OrbatRolesTab.tsx`'s entry style: describe the department-grouped list (base role pinned first per group with a "BASE" badge, "+" to create a sub-role), the 3-column editor (no Categories/Tag), the disabled Name field for base roles, the same copy/paste/dirty-guard/two-stage-delete pattern, and the Calls list (`GET/POST /api/admin/department-roles`, `PATCH/DELETE /api/admin/department-roles/{roleId}`, `GET /api/admin/orbat/discord-roles`, `GET /api/teamspeak/groups`, `GET /api/admin/orbat/permission-keys`).

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Trace through by hand: does clicking "+" under J5 correctly set `editingId` to `'__new__:j5'`, and does `save()` correctly POST with `department: 'j5'`? Does clicking an existing role correctly populate the form and disable the Name field only when `role.isBase` is true? Does the Delete button correctly stay hidden for both the new-role state AND base roles (`!newRoleDept && !isEditingBase`)? Does the `useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])` added in Step 1 actually fire the shell's unsaved-changes guard when this tab is dirty and the user tries to close the dialog or switch to the ORBAT Roles tab (same check as Task 5's Step 5, now against the real implementation instead of the stub)?

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/orbat/DepartmentRolesTab.tsx apps/web/docs/map/f-dashboard-j5-j7-other.md
git commit -m "Implement DepartmentRolesTab"
```

---

### Task 7: Sub-role picker in DeptMembersTab

**Files:**
- Modify: `apps/web/app/api/admin/members/route.ts`
- Modify: `apps/web/app/dashboard/DeptMembersTab.tsx`
- Modify: `apps/web/docs/map/a-admin-api.md`
- Modify: `apps/web/docs/map/e-dashboard-j1-j4.md` (or wherever `DeptMembersTab.tsx` is currently documented — search the map for its existing entry first; if it's in a different part file than `e-dashboard-j1-j4.md`, update that file instead)

**Interfaces:**
- Consumes: `GET /api/admin/department-roles?department=X` (Task 2); `POST /api/admin/department-roles/assign` (Task 3).
- Produces: `GET /api/admin/members` response gains `departmentRoleIds: string[]` (stringified ObjectIds) per member. No change to `DeptMembersTab`'s own exported props.

- [ ] **Step 1: Add `departmentRoleIds` to the members projection**

In `apps/web/app/api/admin/members/route.ts`, find:

```ts
    const projection = {
        id: 1, username: 1, name: 1, globalName: 1,
        'guild.nickname': 1, 'guild.displayName': 1,
        'milpac.currentRank': 1,
        teamLeadDepts: 1, dept2icRoles: 1, dept3icRoles: 1,
        avatar: 1, avatarDecoration: 1, hexAccentColor: 1,
    }
```

Replace with:

```ts
    const projection = {
        id: 1, username: 1, name: 1, globalName: 1,
        'guild.nickname': 1, 'guild.displayName': 1,
        'milpac.currentRank': 1,
        teamLeadDepts: 1, dept2icRoles: 1, dept3icRoles: 1, departmentRoleIds: 1,
        avatar: 1, avatarDecoration: 1, hexAccentColor: 1,
    }
```

Find:

```ts
            teamLeadDepts:  u.teamLeadDepts  ?? [],
            dept2icRoles:   u.dept2icRoles   ?? [],
            dept3icRoles:   u.dept3icRoles   ?? [],
```

Replace with:

```ts
            teamLeadDepts:  u.teamLeadDepts  ?? [],
            dept2icRoles:   u.dept2icRoles   ?? [],
            dept3icRoles:   u.dept3icRoles   ?? [],
            departmentRoleIds: (u.departmentRoleIds ?? []).map(String),
```

- [ ] **Step 2: Add the sub-role picker to DeptMembersTab**

In `apps/web/app/dashboard/DeptMembersTab.tsx`, add `departmentRoleIds: string[]` to the `MemberOption` type:

```ts
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

Update both places that normalize a fetched member object (the `.map()` calls in `fetchDeptMembers` and the `allMembers` fetch inside the `useEffect`) to also default this new field, matching the existing `dept2icRoles ?? []` pattern:

```ts
            setDeptMembers((data.members ?? []).map((m: MemberOption) => ({
                ...m,
                dept2icRoles: m.dept2icRoles ?? [],
                dept3icRoles: m.dept3icRoles ?? [],
                departmentRoleIds: m.departmentRoleIds ?? [],
            })))
```

and

```ts
                .then(d => setAllMembers((d.members ?? []).map((m: MemberOption) => ({
                    ...m,
                    dept2icRoles: m.dept2icRoles ?? [],
                    dept3icRoles: m.dept3icRoles ?? [],
                    departmentRoleIds: m.departmentRoleIds ?? [],
                }))))
```

Add a `DepartmentRole` fetch alongside the existing member fetches — add this state near the top of the component body:

```ts
    const [deptRoles, setDeptRoles] = useState<DepartmentRole[]>([])
    const [roleActionId, setRoleActionId] = useState<string | null>(null)
```

Add a fetch for this department's sub-roles (base roles excluded — they're never individually assignable) inside the existing `useEffect` that already runs `fetchDeptMembers()`:

```ts
    useEffect(() => {
        fetchDeptMembers()
        fetch(`/api/admin/department-roles?department=${department}`)
            .then(r => r.json())
            .then(d => setDeptRoles((d.roles ?? []).filter((r: DepartmentRole) => !r.isBase)))
            .catch(() => setDeptRoles([]))
        if (canManage) {
            setLoadingAll(true)
            fetch('/api/admin/members?limit=1000')
                .then(r => r.json())
                .then(d => setAllMembers((d.members ?? []).map((m: MemberOption) => ({
                    ...m,
                    dept2icRoles: m.dept2icRoles ?? [],
                    dept3icRoles: m.dept3icRoles ?? [],
                    departmentRoleIds: m.departmentRoleIds ?? [],
                }))))
                .finally(() => setLoadingAll(false))
        }
    }, [fetchDeptMembers, canManage, department])
```

Add a handler function alongside the existing `handleAssignSlot`/`handleRemoveFromSlot`:

```ts
    async function handleToggleRole(member: MemberOption, role: DepartmentRole) {
        const holds = member.departmentRoleIds.includes(String(role._id))
        setRoleActionId(member.id)
        try {
            const res = await fetch('/api/admin/department-roles/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUserId: member.id, roleId: String(role._id), action: holds ? 'remove' : 'add' }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Request failed')
            showFeedback('success', `${member.displayName} ${holds ? 'unassigned from' : 'assigned'} ${role.name}.`)
            fetchDeptMembers()
        } catch (e: unknown) {
            showFeedback('error', e instanceof Error ? e.message : 'Failed to update role')
        } finally {
            setRoleActionId(null)
        }
    }
```

In the Department Members table, add a "Roles" column between "Position" and the manage-actions column. Find:

```tsx
                                <tr style={{ borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
                                    <th style={thStyle}>Name</th>
                                    <th style={thStyle}>Rank</th>
                                    <th style={thStyle}>Position</th>
                                    {canManage && <th style={{ ...thStyle, textAlign: 'right' }} />}
                                </tr>
```

Replace with:

```tsx
                                <tr style={{ borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
                                    <th style={thStyle}>Name</th>
                                    <th style={thStyle}>Rank</th>
                                    <th style={thStyle}>Position</th>
                                    {deptRoles.length > 0 && <th style={thStyle}>Roles</th>}
                                    {canManage && <th style={{ ...thStyle, textAlign: 'right' }} />}
                                </tr>
```

Find the `<td>` for Position inside the `deptMembers.map(m => ...)` body:

```tsx
                                            <td style={{ ...tdStyle, fontSize: '0.68rem', color: isLeader ? '#fbbf24' : 'rgba(219,0,29,0.55)' }}>
                                                {position ?? '—'}
                                            </td>
```

Add immediately after it (only rendered when this department has any sub-roles defined, so departments with none don't show an empty column):

```tsx
                                            {deptRoles.length > 0 && (
                                                <td style={tdStyle}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                        {deptRoles.map(role => {
                                                            const holds = m.departmentRoleIds.includes(String(role._id))
                                                            if (!holds && !canManage) return null
                                                            return (
                                                                <button
                                                                    key={String(role._id)}
                                                                    onClick={canManage ? () => handleToggleRole(m, role) : undefined}
                                                                    disabled={roleActionId === m.id}
                                                                    style={{
                                                                        fontSize: '0.6rem', fontWeight: 600, padding: '2px 8px',
                                                                        background: holds ? 'rgba(100,180,255,0.14)' : 'rgba(255,255,255,0.04)',
                                                                        border: `1px solid ${holds ? 'rgba(100,180,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                                                        color: holds ? 'rgba(100,180,255,0.9)' : 'rgba(237,237,237,0.3)',
                                                                        cursor: canManage ? 'pointer' : 'default',
                                                                        opacity: roleActionId === m.id ? 0.5 : 1,
                                                                    }}
                                                                >
                                                                    {role.name}
                                                                </button>
                                                            )
                                                        })}
                                                    </div>
                                                </td>
                                            )}
```

- [ ] **Step 3: Update the doc map**

In `apps/web/docs/map/a-admin-api.md`, find the `GET /api/admin/members` entry and add a note that the response now includes `departmentRoleIds` (stringified) per member.

Find `DeptMembersTab.tsx`'s existing entry (search the map's part files for it — it's referenced from Part E per the file-header note quoted during research) and add a sentence describing the new "Roles" column: a toggleable chip per department sub-role (fetched from `GET /api/admin/department-roles?department=X`, base roles excluded), clicking a chip calls `POST /api/admin/department-roles/assign` to add/remove that member's holding — visible read-only to non-managers, clickable for department leads/J4.

- [ ] **Step 4: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Trace through by hand: for a department with zero sub-roles defined, does the "Roles" column correctly not render at all (not even an empty header)? For a non-managing viewer (`canManage: false`), do chips for roles the member doesn't hold correctly not render (avoiding a wall of unclickable empty chips), while chips for roles they DO hold still show read-only?

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/admin/members/route.ts apps/web/app/dashboard/DeptMembersTab.tsx apps/web/docs/map/a-admin-api.md apps/web/docs/map/e-dashboard-j1-j4.md
git commit -m "Add sub-role picker to DeptMembersTab"
```

(Adjust the last doc-map path in the `git add` if Task 7 Step 3 found `DeptMembersTab.tsx` documented in a different part file.)
