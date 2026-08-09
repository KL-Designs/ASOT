# ORBAT Role Groups & Category-Scoped Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the same role name exist as multiple category-scoped catalog entries (e.g. "Section Commander" reporting differently per platoon), and add Role Groups — named collections of roles that themselves participate in the chain-of-command hierarchy as a single node.

**Architecture:** Two independent-but-related additions to the existing Chain of Command feature. Category-scoped names relax an existing uniqueness check with no new data. Role Groups add one new collection (`orbat_role_groups`) and one new field on `OrbatRole` (`parentGroupId`, mutually exclusive with the existing `parentRoleId`), a shared cycle-detection helper that walks a mixed Role/Group graph, new CRUD routes for groups, and canvas changes so the existing `ChainOfCommandPanel.tsx` renders and edits both node kinds.

**Tech Stack:** Next.js 15 App Router, MongoDB via `Db` (`lib/mongo.ts`), MUI, `@xyflow/react` (React Flow) + `dagre` (both already dependencies from the base Chain of Command build), TypeScript.

## Global Constraints

- Groups grant no permissions and have zero effect on `hasPermission()`/`lib/permissions/tree.ts` — same non-inheritance rule as the base Chain of Command feature.
- Group membership (`memberRoleIds`) is metadata only — never rendered as a graph edge, never consulted for cycle detection. Only actual parent/child hierarchy links are edges.
- No nested groups — a Group's `memberRoleIds` are Roles only, never other Groups. A Group can still have a parent that is another Group (a hierarchy link, not membership).
- A Role's or Group's parent is `parentRoleId` XOR `parentGroupId` XOR neither — never both set on the same document. Setting one to a real value clears the other.
- Category-scoped name conflicts: two roles with the same name only conflict if their `categories` scopes overlap (either being empty/unscoped counts as overlapping everything).
- The category badge (for same-named roles) must never alter the actual `OrbatRole.name` field — every existing consumer of that field (public ORBAT board, milpac profiles, CSV export, the denormalized `OrbatPosition.role` string) must keep working unmodified.
- Follow existing code style exactly: 4-space indent, single quotes, no semicolons, dark-theme inline `sx`/`style` matching the already-established patterns in `RolesManagerPanel.tsx` and `ChainOfCommandPanel.tsx`.
- No automated test suite exists in this repo. Verification is `npx tsc --noEmit -p tsconfig.json` for every task, plus targeted manual checks where noted. Browser click-through verification is not available in this environment (no Discord OAuth, no browser automation tool) — a known, accepted limitation for every UI task in this plan.

---

## File Structure

- **Create:** `apps/web/lib/orbat/categoriesOverlap.ts` — shared overlap-check helper.
- **Modify:** `apps/web/app/api/admin/orbat/roles/route.ts` — relaxed uniqueness on create; later, `parentGroupId: null` on new roles.
- **Modify:** `apps/web/app/api/admin/orbat/roles/[roleId]/route.ts` — relaxed uniqueness on update; later, `parentGroupId` handling + shared cycle helper.
- **Modify:** `apps/web/types/orbat-role.d.ts` — add `parentGroupId`.
- **Create:** `apps/web/types/orbat-role-group.d.ts` — new `OrbatRoleGroup` type.
- **Modify:** `apps/web/lib/mongo.ts` — register `Db.orbatRoleGroups`.
- **Create:** `apps/web/lib/orbat/chainOfCommand.ts` — shared `wouldCreateCycle` helper.
- **Create:** `apps/web/app/api/admin/orbat/groups/route.ts` — list/create groups.
- **Create:** `apps/web/app/api/admin/orbat/groups/[groupId]/route.ts` — update/delete a group.
- **Modify:** `apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx` — canvas support for groups, then group management UI, then category badges.
- **Modify:** `apps/web/app/dashboard/orbat/RolesManagerPanel.tsx` — category badge in the role list.

---

### Task 1: Category-scoped duplicate role names

**Files:**
- Create: `apps/web/lib/orbat/categoriesOverlap.ts`
- Modify: `apps/web/app/api/admin/orbat/roles/route.ts`
- Modify: `apps/web/app/api/admin/orbat/roles/[roleId]/route.ts`

**Interfaces:**
- Produces: `categoriesOverlap(a: string[], b: string[]): boolean`, exported from `lib/orbat/categoriesOverlap.ts` — used by both routes in this task, and available to any future route with the same concern.

- [ ] **Step 1: Write the helper**

Create `apps/web/lib/orbat/categoriesOverlap.ts`:

```ts
// Two roles with the same name only conflict if they could ever appear
// together in the same category-filtered role picker. categories: []
// means "usable in every category" (unscoped), so it overlaps everything.
export function categoriesOverlap(a: string[], b: string[]): boolean {
    if (a.length === 0 || b.length === 0) return true
    return a.some(c => b.includes(c))
}
```

- [ ] **Step 2: Relax uniqueness on create**

In `apps/web/app/api/admin/orbat/roles/route.ts`, add the import alongside the existing ones:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'
import { categoriesOverlap } from '@/lib/orbat/categoriesOverlap'
```

Replace this block in `POST`:

```ts
    const existing = await Db.orbatRoles.findOne({ name })
    if (existing) return NextResponse.json({ error: 'A Role with that name already exists' }, { status: 409 })
```

with:

```ts
    const sameName = await Db.orbatRoles.find({ name }).toArray()
    const conflict = sameName.find(r => categoriesOverlap(r.categories, categories))
    if (conflict) return NextResponse.json({ error: 'A Role with that name already exists in an overlapping category' }, { status: 409 })
```

(`categories` here is the `const categories: string[] = ...` already defined a few lines above this block — no other change needed in `POST`.)

- [ ] **Step 3: Relax uniqueness on update**

In `apps/web/app/api/admin/orbat/roles/[roleId]/route.ts`, add the same import:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'
import { categoriesOverlap } from '@/lib/orbat/categoriesOverlap'
```

In the `PATCH` handler, replace this block:

```ts
    if (typeof body.name === 'string' && body.name.trim() && body.name.trim() !== role.name) {
        const conflict = await Db.orbatRoles.findOne({ name: body.name.trim(), _id: { $ne: objectId } })
        if (conflict) return NextResponse.json({ error: 'A Role with that name already exists' }, { status: 409 })
        updates.name = body.name.trim()
    }
    if (Array.isArray(body.categories)) updates.categories = body.categories
```

with:

```ts
    const proposedName: string = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : role.name
    const proposedCategories: string[] = Array.isArray(body.categories) ? body.categories : role.categories
    const nameChanging = proposedName !== role.name
    const categoriesChanging = Array.isArray(body.categories)

    if (nameChanging || categoriesChanging) {
        const sameName = await Db.orbatRoles.find({ name: proposedName, _id: { $ne: objectId } }).toArray()
        const conflict = sameName.find(r => categoriesOverlap(r.categories, proposedCategories))
        if (conflict) return NextResponse.json({ error: 'A Role with that name already exists in an overlapping category' }, { status: 409 })
    }
    if (nameChanging) updates.name = proposedName
    if (categoriesChanging) updates.categories = body.categories
```

This checks for a conflict whenever *either* the name or the categories are changing (not just on rename) — recategorizing a role can create a new overlap with an existing same-named role just as much as renaming can, so both paths need the same guard.

Nothing else in `PATCH` changes for this task.

- [ ] **Step 4: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Then, with `npm run dev` running (start it in the background if needed, stop it afterward if you started it), confirm the routes are still correctly gated:
`curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/api/admin/orbat/roles` — expect `401` (unauthenticated). Full authenticated behavior (real overlap-vs-no-overlap conflict resolution) can't be verified in this environment (no Discord OAuth available) — expected, not a blocker; verified by careful reading against the Global Constraints above.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/orbat/categoriesOverlap.ts apps/web/app/api/admin/orbat/roles/route.ts "apps/web/app/api/admin/orbat/roles/[roleId]/route.ts"
git commit -m "Allow same-named ORBAT roles when their categories don't overlap"
```

---

### Task 2: Data model for Role Groups and shared cycle-detection helper

**Files:**
- Modify: `apps/web/types/orbat-role.d.ts`
- Create: `apps/web/types/orbat-role-group.d.ts`
- Modify: `apps/web/lib/mongo.ts`
- Create: `apps/web/lib/orbat/chainOfCommand.ts`
- Modify: `apps/web/app/api/admin/orbat/roles/[roleId]/route.ts`
- Modify: `apps/web/app/api/admin/orbat/roles/route.ts`

**Interfaces:**
- Produces: `OrbatRole.parentGroupId: ObjectId | null` (new field, global type).
- Produces: `OrbatRoleGroup` (new global type): `{ _id, name, memberRoleIds: ObjectId[], parentRoleId: ObjectId | null, parentGroupId: ObjectId | null, createdAt, createdBy, createdByName }`.
- Produces: `Db.orbatRoleGroups: MongoCollection<OrbatRoleGroup>` — consumed by Task 3's routes and this task's own `PATCH` update.
- Produces: `wouldCreateCycle(child: ChainNodeRef, proposedParent: ChainNodeRef): Promise<boolean>` and `type ChainNodeRef = { id: ObjectId; kind: 'role' | 'group' }`, exported from `lib/orbat/chainOfCommand.ts` — consumed by Task 3's group routes.

- [ ] **Step 1: Add `parentGroupId` to `OrbatRole`**

In `apps/web/types/orbat-role.d.ts`, the current interface is:

```ts
    interface OrbatRole {
        _id: ObjectId
        name: string
        categories: string[]        // subset of PLATOON_CATEGORY_IDS; [] = usable in every category
        discordRoleIds: string[]    // Discord role IDs granted to whoever holds a position of this Role
        permissions: string[]       // granted permission keys — see lib/permissions-catalog.ts
        parentRoleId: ObjectId | null   // chain-of-command parent Role; null = top of chain / unset.
                                         // Routing/escalation metadata only — never consulted for
                                         // permission checks, and never implies permission inheritance.
        createdAt: Date
        createdBy: string           // Discord ID
        createdByName: string
    }
```

Add `parentGroupId` immediately after `parentRoleId`:

```ts
        parentRoleId: ObjectId | null   // chain-of-command parent Role; null = top of chain / unset.
                                         // Routing/escalation metadata only — never consulted for
                                         // permission checks, and never implies permission inheritance.
        parentGroupId: ObjectId | null  // chain-of-command parent Group instead of a Role. Mutually
                                         // exclusive with parentRoleId — at most one of the two is set.
```

- [ ] **Step 2: Create the `OrbatRoleGroup` type**

Create `apps/web/types/orbat-role-group.d.ts`:

```ts
import type { ObjectId } from 'mongodb'


export { }

declare global {

    // A named collection of OrbatRoles that itself participates in the chain
    // of command as a single node — e.g. four HQ command roles grouped so
    // other roles can target "the group" as their parent instead of picking
    // one specific role within it. Grants no permissions of its own and has
    // no effect on hasPermission() — routing/escalation metadata only, same
    // as OrbatRole.parentRoleId/parentGroupId.
    interface OrbatRoleGroup {
        _id: ObjectId
        name: string
        memberRoleIds: ObjectId[]        // member Roles — display/reference only, never a hierarchy edge
        parentRoleId: ObjectId | null    // this group's own chain-of-command parent, if it escalates further
        parentGroupId: ObjectId | null   // mutually exclusive with parentRoleId
        createdAt: Date
        createdBy: string                // Discord ID
        createdByName: string
    }

}
```

- [ ] **Step 3: Register the collection**

In `apps/web/lib/mongo.ts`, the current line is:

```ts
    orbatRoles: db.collection('orbat_roles') as MongoCollection<OrbatRole>,
```

Add immediately after it:

```ts
    orbatRoles: db.collection('orbat_roles') as MongoCollection<OrbatRole>,
    orbatRoleGroups: db.collection('orbat_role_groups') as MongoCollection<OrbatRoleGroup>,
```

- [ ] **Step 4: Write the shared cycle-detection helper**

Create `apps/web/lib/orbat/chainOfCommand.ts`:

```ts
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'

export type ChainNodeRef = { id: ObjectId; kind: 'role' | 'group' }

async function getParent(ref: ChainNodeRef): Promise<ChainNodeRef | null> {
    if (ref.kind === 'role') {
        const doc = await Db.orbatRoles.findOne({ _id: ref.id })
        if (!doc) return null
        if (doc.parentRoleId) return { id: doc.parentRoleId, kind: 'role' }
        if (doc.parentGroupId) return { id: doc.parentGroupId, kind: 'group' }
        return null
    }
    const doc = await Db.orbatRoleGroups.findOne({ _id: ref.id })
    if (!doc) return null
    if (doc.parentRoleId) return { id: doc.parentRoleId, kind: 'role' }
    if (doc.parentGroupId) return { id: doc.parentGroupId, kind: 'group' }
    return null
}

// Would setting `child`'s parent to `proposedParent` create a cycle? Walks
// proposedParent's ancestor chain — following parentRoleId/parentGroupId
// upward, hopping between the roles and groups collections as needed —
// looking for child. The depth bound is a corruption guard, not a real
// limit: no real hierarchy should ever be anywhere close to 50 levels deep.
export async function wouldCreateCycle(child: ChainNodeRef, proposedParent: ChainNodeRef): Promise<boolean> {
    let cursor: ChainNodeRef | null = proposedParent
    let depth = 0
    while (cursor && depth < 50) {
        if (cursor.id.equals(child.id) && cursor.kind === child.kind) return true
        cursor = await getParent(cursor)
        depth++
    }
    return false
}
```

- [ ] **Step 5: Wire `parentGroupId` into the roles `PATCH` route, using the shared helper**

In `apps/web/app/api/admin/orbat/roles/[roleId]/route.ts`, add the import:

```ts
import { categoriesOverlap } from '@/lib/orbat/categoriesOverlap'
import { wouldCreateCycle } from '@/lib/orbat/chainOfCommand'
```

Replace the entire existing `parentRoleId` block:

```ts
    if ('parentRoleId' in body) {
        const raw = body.parentRoleId
        if (raw === null) {
            updates.parentRoleId = null
        } else if (typeof raw === 'string') {
            const parentObjectId = parseId(raw)
            if (!parentObjectId) return NextResponse.json({ error: 'Invalid parentRoleId' }, { status: 400 })
            if (parentObjectId.equals(objectId)) {
                return NextResponse.json({ error: 'A role cannot be its own parent' }, { status: 400 })
            }
            const parentRole = await Db.orbatRoles.findOne({ _id: parentObjectId })
            if (!parentRole) return NextResponse.json({ error: 'Parent role not found' }, { status: 400 })

            // Cycle check: walk the proposed parent's ancestor chain. If this
            // role appears anywhere in it, setting this parent would create a
            // cycle. The depth bound is just a corruption guard — no real
            // hierarchy should ever be anywhere close to 50 levels deep.
            let cursor: ObjectId | null = parentRole.parentRoleId
            let depth = 0
            while (cursor && depth < 50) {
                if (cursor.equals(objectId)) {
                    return NextResponse.json({ error: 'This would create a cycle in the chain of command' }, { status: 409 })
                }
                const ancestor: OrbatRole | null = await Db.orbatRoles.findOne({ _id: cursor })
                cursor = ancestor?.parentRoleId ?? null
                depth++
            }

            updates.parentRoleId = parentObjectId
        } else {
            return NextResponse.json({ error: 'Invalid parentRoleId' }, { status: 400 })
        }
    }
```

with this generalized version, handling both `parentRoleId` and the new `parentGroupId`:

```ts
    if (body.parentRoleId != null && body.parentGroupId != null) {
        return NextResponse.json({ error: 'A role cannot have both a parent role and a parent group' }, { status: 400 })
    }
    if ('parentRoleId' in body) {
        const raw = body.parentRoleId
        if (raw === null) {
            updates.parentRoleId = null
        } else if (typeof raw === 'string') {
            const parentObjectId = parseId(raw)
            if (!parentObjectId) return NextResponse.json({ error: 'Invalid parentRoleId' }, { status: 400 })
            if (parentObjectId.equals(objectId)) {
                return NextResponse.json({ error: 'A role cannot be its own parent' }, { status: 400 })
            }
            const parentRole = await Db.orbatRoles.findOne({ _id: parentObjectId })
            if (!parentRole) return NextResponse.json({ error: 'Parent role not found' }, { status: 400 })
            if (await wouldCreateCycle({ id: objectId, kind: 'role' }, { id: parentObjectId, kind: 'role' })) {
                return NextResponse.json({ error: 'This would create a cycle in the chain of command' }, { status: 409 })
            }
            updates.parentRoleId = parentObjectId
            updates.parentGroupId = null
        } else {
            return NextResponse.json({ error: 'Invalid parentRoleId' }, { status: 400 })
        }
    }
    if ('parentGroupId' in body) {
        const raw = body.parentGroupId
        if (raw === null) {
            updates.parentGroupId = null
        } else if (typeof raw === 'string') {
            const parentObjectId = parseId(raw)
            if (!parentObjectId) return NextResponse.json({ error: 'Invalid parentGroupId' }, { status: 400 })
            const parentGroup = await Db.orbatRoleGroups.findOne({ _id: parentObjectId })
            if (!parentGroup) return NextResponse.json({ error: 'Parent group not found' }, { status: 400 })
            if (await wouldCreateCycle({ id: objectId, kind: 'role' }, { id: parentObjectId, kind: 'group' })) {
                return NextResponse.json({ error: 'This would create a cycle in the chain of command' }, { status: 409 })
            }
            updates.parentGroupId = parentObjectId
            updates.parentRoleId = null
        } else {
            return NextResponse.json({ error: 'Invalid parentGroupId' }, { status: 400 })
        }
    }
```

Each block clears the *other* field whenever it sets a real value, so the mutual-exclusivity invariant holds after every write, not just within a single request — sending only `{ parentRoleId: 'X' }` on a role that currently has a `parentGroupId` set correctly clears the old group parent too.

- [ ] **Step 6: Add `parentGroupId: null` to newly-created roles**

In `apps/web/app/api/admin/orbat/roles/route.ts`, the `POST` handler currently builds:

```ts
    const newRole: OrbatRole = {
        _id: new ObjectId(),
        name,
        categories,
        discordRoleIds,
        permissions,
        parentRoleId: null,
        createdAt: new Date(),
        createdBy: me.id,
        createdByName: performedByName,
    }
```

Add `parentGroupId: null` immediately after `parentRoleId: null`:

```ts
        parentRoleId: null,
        parentGroupId: null,
```

(`OrbatRole` is now a required, non-optional field on the type — this object literal won't compile without it.)

- [ ] **Step 7: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/types/orbat-role.d.ts apps/web/types/orbat-role-group.d.ts apps/web/lib/mongo.ts apps/web/lib/orbat/chainOfCommand.ts "apps/web/app/api/admin/orbat/roles/[roleId]/route.ts" apps/web/app/api/admin/orbat/roles/route.ts
git commit -m "Add parentGroupId, OrbatRoleGroup type, and shared cycle-detection helper"
```

---

### Task 3: Role Groups CRUD API

**Files:**
- Create: `apps/web/app/api/admin/orbat/groups/route.ts`
- Create: `apps/web/app/api/admin/orbat/groups/[groupId]/route.ts`

**Interfaces:**
- Consumes: `Db.orbatRoleGroups`, `OrbatRoleGroup` (Task 2); `wouldCreateCycle`, `ChainNodeRef` (Task 2, `lib/orbat/chainOfCommand.ts`).
- Produces: `GET /api/admin/orbat/groups` → `{ groups: OrbatRoleGroup[] }`. `POST /api/admin/orbat/groups` → `{ group: OrbatRoleGroup }`. `PATCH /api/admin/orbat/groups/[groupId]` → `{ success: true }`. `DELETE /api/admin/orbat/groups/[groupId]` → `{ success: true }`. All consumed by Task 4/5's frontend code.

- [ ] **Step 1: Write the list/create route**

Create `apps/web/app/api/admin/orbat/groups/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'


// ── GET /api/admin/orbat/groups ────────────────────────────────────────────
// Same read gate as the roles catalog.

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbat)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const groups = await Db.orbatRoleGroups.find({}).sort({ name: 1 }).toArray()
    return NextResponse.json({ groups: JSON.parse(JSON.stringify(groups)) })
}


// ── POST /api/admin/orbat/groups ───────────────────────────────────────────
// Body: { name, memberRoleIds }

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const name: string = (body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const existing = await Db.orbatRoleGroups.findOne({ name })
    if (existing) return NextResponse.json({ error: 'A Group with that name already exists' }, { status: 409 })

    const memberRoleIds: ObjectId[] = Array.isArray(body.memberRoleIds)
        ? body.memberRoleIds
            .filter((id: unknown) => typeof id === 'string')
            .map((id: string) => { try { return new ObjectId(id) } catch { return null } })
            .filter((id: ObjectId | null): id is ObjectId => id !== null)
        : []

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const newGroup: OrbatRoleGroup = {
        _id: new ObjectId(),
        name,
        memberRoleIds,
        parentRoleId: null,
        parentGroupId: null,
        createdAt: new Date(),
        createdBy: me.id,
        createdByName: performedByName,
    }
    await Db.orbatRoleGroups.insertOne(newGroup)

    return NextResponse.json({ group: JSON.parse(JSON.stringify(newGroup)) })
}
```

- [ ] **Step 2: Write the update/delete route**

Create `apps/web/app/api/admin/orbat/groups/[groupId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { wouldCreateCycle } from '@/lib/orbat/chainOfCommand'

function parseId(id: string): ObjectId | null {
    try { return new ObjectId(id) } catch { return null }
}

async function auth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)) return null
    return me
}


// ── PATCH /api/admin/orbat/groups/[groupId] ────────────────────────────────
// Body: { name?, memberRoleIds?, parentRoleId?, parentGroupId? }

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    const me = await auth()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { groupId } = await params
    const objectId = parseId(groupId)
    if (!objectId) return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 })

    const group = await Db.orbatRoleGroups.findOne({ _id: objectId })
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    const body = await request.json()
    const updates: Partial<OrbatRoleGroup> = {}

    if (typeof body.name === 'string' && body.name.trim() && body.name.trim() !== group.name) {
        const conflict = await Db.orbatRoleGroups.findOne({ name: body.name.trim(), _id: { $ne: objectId } })
        if (conflict) return NextResponse.json({ error: 'A Group with that name already exists' }, { status: 409 })
        updates.name = body.name.trim()
    }

    if (Array.isArray(body.memberRoleIds)) {
        const memberRoleIds: ObjectId[] = body.memberRoleIds
            .filter((id: unknown) => typeof id === 'string')
            .map((id: string) => { try { return new ObjectId(id) } catch { return null } })
            .filter((id: ObjectId | null): id is ObjectId => id !== null)
        updates.memberRoleIds = memberRoleIds
    }

    if (body.parentRoleId != null && body.parentGroupId != null) {
        return NextResponse.json({ error: 'A group cannot have both a parent role and a parent group' }, { status: 400 })
    }
    if ('parentRoleId' in body) {
        const raw = body.parentRoleId
        if (raw === null) {
            updates.parentRoleId = null
        } else if (typeof raw === 'string') {
            const parentObjectId = parseId(raw)
            if (!parentObjectId) return NextResponse.json({ error: 'Invalid parentRoleId' }, { status: 400 })
            const parentRole = await Db.orbatRoles.findOne({ _id: parentObjectId })
            if (!parentRole) return NextResponse.json({ error: 'Parent role not found' }, { status: 400 })
            if (await wouldCreateCycle({ id: objectId, kind: 'group' }, { id: parentObjectId, kind: 'role' })) {
                return NextResponse.json({ error: 'This would create a cycle in the chain of command' }, { status: 409 })
            }
            updates.parentRoleId = parentObjectId
            updates.parentGroupId = null
        } else {
            return NextResponse.json({ error: 'Invalid parentRoleId' }, { status: 400 })
        }
    }
    if ('parentGroupId' in body) {
        const raw = body.parentGroupId
        if (raw === null) {
            updates.parentGroupId = null
        } else if (typeof raw === 'string') {
            const parentObjectId = parseId(raw)
            if (!parentObjectId) return NextResponse.json({ error: 'Invalid parentGroupId' }, { status: 400 })
            if (parentObjectId.equals(objectId)) {
                return NextResponse.json({ error: 'A group cannot be its own parent' }, { status: 400 })
            }
            const parentGroup = await Db.orbatRoleGroups.findOne({ _id: parentObjectId })
            if (!parentGroup) return NextResponse.json({ error: 'Parent group not found' }, { status: 400 })
            if (await wouldCreateCycle({ id: objectId, kind: 'group' }, { id: parentObjectId, kind: 'group' })) {
                return NextResponse.json({ error: 'This would create a cycle in the chain of command' }, { status: 409 })
            }
            updates.parentGroupId = parentObjectId
            updates.parentRoleId = null
        } else {
            return NextResponse.json({ error: 'Invalid parentGroupId' }, { status: 400 })
        }
    }

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    await Db.orbatRoleGroups.updateOne({ _id: objectId }, { $set: updates })

    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/orbat/groups/[groupId] ───────────────────────────────
// Never blocked by membership — cascades parent links on anything that had
// this group as its own chain-of-command parent.

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
) {
    const me = await auth()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { groupId } = await params
    const objectId = parseId(groupId)
    if (!objectId) return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 })

    await Db.orbatRoles.updateMany({ parentGroupId: objectId }, { $set: { parentGroupId: null } })
    await Db.orbatRoleGroups.updateMany({ parentGroupId: objectId }, { $set: { parentGroupId: null } })
    await Db.orbatRoleGroups.deleteOne({ _id: objectId })

    return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

With `npm run dev` running, confirm gating: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/admin/orbat/groups` — expect `401`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/admin/orbat/groups/route.ts "apps/web/app/api/admin/orbat/groups/[groupId]/route.ts"
git commit -m "Add Role Groups CRUD API"
```

---

### Task 4: Canvas support for Group nodes

**Files:**
- Modify: `apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx` (full rewrite)

**Interfaces:**
- Consumes: `GET /api/admin/orbat/groups` (Task 3); `OrbatRoleGroup` (Task 2); `PATCH /api/admin/orbat/roles/[roleId]` and `PATCH /api/admin/orbat/groups/[groupId]` (both now accept `parentRoleId`/`parentGroupId`, Task 2/3).
- Produces: same exported signature as before, `export default function ChainOfCommandPanel({ open, onClose }: Props)` — Task 5 continues editing this same file.

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx` with:

```tsx
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position, MarkerType, useReactFlow,
    type Node, type Edge, type NodeProps, type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import {
    Dialog, DialogTitle, DialogContent, Divider, TextField, IconButton,
    Typography, Box, InputAdornment, CircularProgress, Alert, Button,
} from '@mui/material'
import { Close, Search } from '@mui/icons-material'

interface Props {
    open: boolean
    onClose: () => void
}

const NODE_WIDTH = 220
const NODE_HEIGHT = 64

const searchFieldSx = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
}

type NodeKind = 'role' | 'group'

function nodeIdFor(kind: NodeKind, id: string): string {
    return `${kind}:${id}`
}

function parseNodeId(nodeId: string): { kind: NodeKind; id: string } {
    const sep = nodeId.indexOf(':')
    return { kind: nodeId.slice(0, sep) as NodeKind, id: nodeId.slice(sep + 1) }
}

interface RoleNodeData extends Record<string, unknown> {
    kind: 'role'
    role: OrbatRole
    dimmed: boolean
}

interface GroupNodeData extends Record<string, unknown> {
    kind: 'group'
    group: OrbatRoleGroup
    dimmed: boolean
}

type RoleFlowNode = Node<RoleNodeData, 'roleNode'>
type GroupFlowNode = Node<GroupNodeData, 'groupNode'>
type ChainFlowNode = RoleFlowNode | GroupFlowNode

function RoleNode({ data }: NodeProps<RoleFlowNode>) {
    const { role, dimmed } = data
    return (
        <div style={{
            width: NODE_WIDTH, minHeight: NODE_HEIGHT, padding: '8px 12px',
            background: 'rgba(20,20,20,0.95)', border: '1px solid rgba(219,0,29,0.4)', borderTop: '2px solid var(--red)',
            opacity: dimmed ? 0.3 : 1, transition: 'opacity 0.15s',
        }}>
            <Handle type='target' position={Position.Top} style={{ background: 'rgba(219,0,29,0.6)' }} />
            <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.9)', fontWeight: 600, marginBottom: 6, wordBreak: 'break-word' }}>
                {role.name}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'rgba(237,237,237,0.5)' }}>
                    {role.permissions.length} perm{role.permissions.length === 1 ? '' : 's'}
                </span>
                <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'rgba(237,237,237,0.5)' }}>
                    {role.discordRoleIds.length} discord role{role.discordRoleIds.length === 1 ? '' : 's'}
                </span>
            </div>
            <Handle type='source' position={Position.Bottom} style={{ background: 'rgba(219,0,29,0.6)' }} />
        </div>
    )
}

function GroupNode({ data }: NodeProps<GroupFlowNode>) {
    const { group, dimmed } = data
    return (
        <div style={{
            width: NODE_WIDTH, minHeight: NODE_HEIGHT, padding: '8px 12px',
            background: 'rgba(20,20,20,0.95)', border: '1px dashed rgba(100,180,255,0.6)', borderTop: '2px dashed rgba(100,180,255,0.8)',
            opacity: dimmed ? 0.3 : 1, transition: 'opacity 0.15s',
        }}>
            <Handle type='target' position={Position.Top} style={{ background: 'rgba(100,180,255,0.7)' }} />
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(100,180,255,0.85)', marginBottom: 3 }}>
                Group
            </div>
            <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.9)', fontWeight: 600, marginBottom: 6, wordBreak: 'break-word' }}>
                {group.name}
            </div>
            <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(100,180,255,0.12)', color: 'rgba(100,180,255,0.85)' }}>
                {group.memberRoleIds.length} member{group.memberRoleIds.length === 1 ? '' : 's'}
            </span>
            <Handle type='source' position={Position.Bottom} style={{ background: 'rgba(100,180,255,0.7)' }} />
        </div>
    )
}

const nodeTypes = { roleNode: RoleNode, groupNode: GroupNode }

function edgeFor(sourceId: string, targetId: string): Edge {
    return {
        id: `${sourceId}->${targetId}`,
        source: sourceId,
        target: targetId,
        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(219,0,29,0.6)' },
        style: { stroke: 'rgba(219,0,29,0.5)' },
    }
}

function layoutChainOfCommand(roles: OrbatRole[], groups: OrbatRoleGroup[], search: string): { nodes: ChainFlowNode[]; edges: Edge[] } {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 90 })
    g.setDefaultEdgeLabel(() => ({}))

    for (const role of roles) {
        g.setNode(nodeIdFor('role', String(role._id)), { width: NODE_WIDTH, height: NODE_HEIGHT })
    }
    for (const group of groups) {
        g.setNode(nodeIdFor('group', String(group._id)), { width: NODE_WIDTH, height: NODE_HEIGHT })
    }

    const edges: Edge[] = []
    for (const role of roles) {
        const id = nodeIdFor('role', String(role._id))
        if (role.parentRoleId) {
            const parentId = nodeIdFor('role', String(role.parentRoleId))
            g.setEdge(parentId, id)
            edges.push(edgeFor(parentId, id))
        } else if (role.parentGroupId) {
            const parentId = nodeIdFor('group', String(role.parentGroupId))
            g.setEdge(parentId, id)
            edges.push(edgeFor(parentId, id))
        }
    }
    for (const group of groups) {
        const id = nodeIdFor('group', String(group._id))
        if (group.parentRoleId) {
            const parentId = nodeIdFor('role', String(group.parentRoleId))
            g.setEdge(parentId, id)
            edges.push(edgeFor(parentId, id))
        } else if (group.parentGroupId) {
            const parentId = nodeIdFor('group', String(group.parentGroupId))
            g.setEdge(parentId, id)
            edges.push(edgeFor(parentId, id))
        }
    }

    dagre.layout(g)

    const term = search.trim().toLowerCase()
    const roleNodes: RoleFlowNode[] = roles.map(role => {
        const id = nodeIdFor('role', String(role._id))
        const pos = g.node(id)
        const dimmed = term.length > 0 && !role.name.toLowerCase().includes(term)
        return {
            id,
            type: 'roleNode',
            position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
            data: { kind: 'role', role, dimmed },
        }
    })
    const groupNodes: GroupFlowNode[] = groups.map(group => {
        const id = nodeIdFor('group', String(group._id))
        const pos = g.node(id)
        const dimmed = term.length > 0 && !group.name.toLowerCase().includes(term)
        return {
            id,
            type: 'groupNode',
            position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
            data: { kind: 'group', group, dimmed },
        }
    })

    return { nodes: [...roleNodes, ...groupNodes], edges }
}

function Canvas({ roles, groups, search, error, onConnectNodes, onSelectRole, onSelectGroup }: {
    roles: OrbatRole[]
    groups: OrbatRoleGroup[]
    search: string
    error: string | null
    onConnectNodes: (childKind: NodeKind, childId: string, parentKind: NodeKind, parentId: string) => void
    onSelectRole: (role: OrbatRole) => void
    onSelectGroup: (group: OrbatRoleGroup) => void
}) {
    const { nodes, edges } = useMemo(() => layoutChainOfCommand(roles, groups, search), [roles, groups, search])
    const { setCenter, getZoom } = useReactFlow()

    useEffect(() => {
        const term = search.trim().toLowerCase()
        if (!term) return
        const match = nodes.find(n => !n.data.dimmed)
        if (match) setCenter(match.position.x + NODE_WIDTH / 2, match.position.y + NODE_HEIGHT / 2, { zoom: getZoom(), duration: 300 })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search])

    function handleConnect(connection: Connection) {
        if (!connection.source || !connection.target) return
        const parent = parseNodeId(connection.source)
        const child = parseNodeId(connection.target)
        onConnectNodes(child.kind, child.id, parent.kind, parent.id)
    }

    function handleNodeClick(_event: React.MouseEvent, node: ChainFlowNode) {
        if (node.data.kind === 'role') onSelectRole(node.data.role)
        else onSelectGroup(node.data.group)
    }

    return (
        <Box sx={{ flex: 1, position: 'relative' }}>
            {error && (
                <Alert severity='error' sx={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 10, fontSize: '0.72rem' }}>
                    {error}
                </Alert>
            )}
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                nodesDraggable={false}
                fitView
                onConnect={handleConnect}
                onNodeClick={handleNodeClick}
                colorMode='dark'
            >
                <Background color='rgba(255,255,255,0.08)' />
                <Controls showInteractive={false} />
            </ReactFlow>
        </Box>
    )
}

export default function ChainOfCommandPanel({ open, onClose }: Props) {
    const [roles, setRoles] = useState<OrbatRole[]>([])
    const [groups, setGroups] = useState<OrbatRoleGroup[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [selectedRole, setSelectedRole] = useState<OrbatRole | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const [rolesRes, groupsRes] = await Promise.all([
            fetch('/api/admin/orbat/roles').then(r => r.json()).catch(() => ({})),
            fetch('/api/admin/orbat/groups').then(r => r.json()).catch(() => ({})),
        ])
        setRoles(rolesRes.roles ?? [])
        setGroups(groupsRes.groups ?? [])
        setLoading(false)
    }, [])

    useEffect(() => { if (open) load() }, [open, load])
    useEffect(() => { if (!open) { setSearch(''); setSelectedRole(null); setError(null) } }, [open])

    async function patchParent(childKind: NodeKind, childId: string, parentKind: NodeKind | null, parentId: string | null) {
        setError(null)
        const body = parentKind === 'role' ? { parentRoleId: parentId }
            : parentKind === 'group' ? { parentGroupId: parentId }
            : { parentRoleId: null, parentGroupId: null }
        const url = childKind === 'role' ? `/api/admin/orbat/roles/${childId}` : `/api/admin/orbat/groups/${childId}`
        try {
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                setError(data.error ?? 'Failed to update chain of command')
            }
        } catch {
            setError('Network error — could not update chain of command')
        } finally {
            await load()
        }
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth={false}
            fullWidth
            PaperProps={{
                style: {
                    background: 'var(--background, #0a0a0a)',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    height: '85vh',
                    width: '90vw',
                    maxWidth: 2000,
                },
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                <div>
                    <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', mb: 0.5 }}>
                        ORBAT Administration
                    </Typography>
                    <Typography fontWeight={700} fontSize='0.95rem' letterSpacing={3} sx={{ textTransform: 'uppercase' }}>
                        Chain of Command
                    </Typography>
                </div>
                <IconButton size='small' onClick={onClose}><Close sx={{ fontSize: 18, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
            </DialogTitle>

            <Divider sx={{ borderColor: 'rgba(219,0,29,0.42)' }} />

            <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden', flex: 1 }}>
                {loading && roles.length === 0 && groups.length === 0 ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                        <CircularProgress size={26} />
                    </Box>
                ) : (
                    <>
                        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <Box sx={{ p: 1.5 }}>
                                <TextField
                                    size='small' placeholder='Search roles and groups…' value={search} onChange={e => setSearch(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                    sx={searchFieldSx}
                                />
                            </Box>
                            <ReactFlowProvider>
                                <Canvas
                                    roles={roles}
                                    groups={groups}
                                    search={search}
                                    error={error}
                                    onConnectNodes={(childKind, childId, parentKind, parentId) => patchParent(childKind, childId, parentKind, parentId)}
                                    onSelectRole={setSelectedRole}
                                    onSelectGroup={() => {}}
                                />
                            </ReactFlowProvider>
                        </Box>

                        {selectedRole && (
                            <Box sx={{ width: 280, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)', p: 2, overflowY: 'auto' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)' }}>{selectedRole.name}</Typography>
                                    <IconButton size='small' onClick={() => setSelectedRole(null)}>
                                        <Close sx={{ fontSize: 14, color: 'rgba(237,237,237,0.4)' }} />
                                    </IconButton>
                                </div>
                                {(selectedRole.parentRoleId || selectedRole.parentGroupId) && (
                                    <Button
                                        size='small' variant='outlined' fullWidth
                                        onClick={() => { patchParent('role', String(selectedRole._id), null, null); setSelectedRole(null) }}
                                        sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.85)', mb: 2 }}
                                    >
                                        Detach from Parent
                                    </Button>
                                )}
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>
                                    Permissions ({selectedRole.permissions.length})
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    {selectedRole.permissions.length === 0
                                        ? <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>None granted</span>
                                        : selectedRole.permissions.map(p => (
                                            <div key={p} style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.6)', marginBottom: 2 }}>{p}</div>
                                        ))}
                                </div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>
                                    Discord roles ({selectedRole.discordRoleIds.length})
                                </div>
                                <div>
                                    {selectedRole.discordRoleIds.length === 0
                                        ? <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>None granted</span>
                                        : <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.6)' }}>{selectedRole.discordRoleIds.length} role(s) — edit in Roles Manager to see names</span>}
                                </div>
                            </Box>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
```

This is a straight generalization of the file from role-only to role-and-group: the canvas now fetches and lays out both collections, group nodes render distinctly (dashed border, member count instead of permission/Discord-role badges), and connecting/detaching works for roles exactly as before. **Clicking a Group node currently does nothing** (`onSelectGroup={() => {}}`) — Task 5 replaces that no-op with the actual group management sidebar. This is an intentional, complete intermediate state (matches the same pattern the original Chain of Command build used across its own Task 3/Task 4 split), not a stub — everything this task claims (role interactions, both node kinds rendering and laying out correctly, connecting either kind to either kind) is fully implemented and correct as written.

- [ ] **Step 2: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Trace through by hand as your substitute for browser verification (not possible in this environment):
- `layoutChainOfCommand`: does every role AND every group get a node (including ones with no parent and no children), and are edges only created for documents that actually have `parentRoleId`/`parentGroupId` set?
- `handleConnect`: dragging from a Group's bottom handle to a Role's top handle — does `parseNodeId` correctly split `group:<id>` and `role:<id>`, and does `onConnectNodes` get called with `(child='role', childId, parent='group', parentId)`, i.e. the Role becomes the child of the Group?
- `patchParent`: when `parentKind` is `'group'`, does it PATCH the child's own endpoint (`/roles/{id}` or `/groups/{id}` depending on the CHILD's kind, not the parent's) with `{ parentGroupId: parentId }`?

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx
git commit -m "Render and connect Group nodes in the Chain of Command canvas"
```

---

### Task 5: Group management UI

**Files:**
- Modify: `apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx` (full rewrite, building on Task 4)

**Interfaces:**
- Consumes: `POST /api/admin/orbat/groups`, `PATCH /api/admin/orbat/groups/[groupId]`, `DELETE /api/admin/orbat/groups/[groupId]` (Task 3).
- No exported-signature changes — `ChainOfCommandPanel`'s props stay `{ open, onClose }`.

- [ ] **Step 1: Rewrite the file to add group creation/editing**

Replace the entire contents of `apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx` with the Task 4 version, applying these changes:

1. Add `Checkbox` and `FormControlLabel` to the existing `@mui/material` import:

```ts
import {
    Dialog, DialogTitle, DialogContent, Divider, TextField, IconButton,
    Typography, Box, InputAdornment, CircularProgress, Alert, Button,
    Checkbox, FormControlLabel,
} from '@mui/material'
```

2. In `ChainOfCommandPanel`, add new state alongside the existing state declarations:

```ts
    const [selectedRole, setSelectedRole] = useState<OrbatRole | null>(null)
    const [groupEditor, setGroupEditor] = useState<{ id: string | null; name: string; memberRoleIds: string[] } | null>(null)
    const [groupMemberSearch, setGroupMemberSearch] = useState('')
    const [groupError, setGroupError] = useState<string | null>(null)
```

3. Reset the new state in the existing close effect:

```ts
    useEffect(() => { if (!open) { setSearch(''); setSelectedRole(null); setError(null) } }, [open])
```

becomes:

```ts
    useEffect(() => {
        if (!open) {
            setSearch('')
            setSelectedRole(null)
            setError(null)
            setGroupEditor(null)
            setGroupMemberSearch('')
            setGroupError(null)
        }
    }, [open])
```

4. Add group CRUD functions alongside `patchParent`:

```ts
    function toggleGroupMember(roleId: string) {
        setGroupEditor(prev => prev && {
            ...prev,
            memberRoleIds: prev.memberRoleIds.includes(roleId)
                ? prev.memberRoleIds.filter(id => id !== roleId)
                : [...prev.memberRoleIds, roleId],
        })
    }

    async function saveGroup() {
        if (!groupEditor) return
        if (!groupEditor.name.trim()) { setGroupError('Name is required'); return }
        setGroupError(null)
        const body = { name: groupEditor.name.trim(), memberRoleIds: groupEditor.memberRoleIds }
        const res = groupEditor.id === null
            ? await fetch('/api/admin/orbat/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            : await fetch(`/api/admin/orbat/groups/${groupEditor.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setGroupError(data.error ?? 'Save failed')
            return
        }
        setGroupEditor(null)
        await load()
    }

    async function deleteGroup(groupId: string) {
        setGroupError(null)
        const res = await fetch(`/api/admin/orbat/groups/${groupId}`, { method: 'DELETE' })
        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setGroupError(data.error ?? 'Delete failed')
            return
        }
        setGroupEditor(null)
        await load()
    }
```

5. Wire real selection/creation handlers. Where `<Canvas ... onSelectRole={setSelectedRole} onSelectGroup={() => {}} />` currently is, change to:

```tsx
                                <Canvas
                                    roles={roles}
                                    groups={groups}
                                    search={search}
                                    error={error}
                                    onConnectNodes={(childKind, childId, parentKind, parentId) => patchParent(childKind, childId, parentKind, parentId)}
                                    onSelectRole={role => { setSelectedRole(role); setGroupEditor(null) }}
                                    onSelectGroup={group => {
                                        setSelectedRole(null)
                                        setGroupError(null)
                                        setGroupMemberSearch('')
                                        setGroupEditor({ id: String(group._id), name: group.name, memberRoleIds: group.memberRoleIds.map(String) })
                                    }}
                                />
```

6. Add a "New Group" button next to the search box. Where the search `Box` currently is:

```tsx
                            <Box sx={{ p: 1.5 }}>
                                <TextField
                                    size='small' placeholder='Search roles and groups…' value={search} onChange={e => setSearch(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                    sx={searchFieldSx}
                                />
                            </Box>
```

becomes:

```tsx
                            <Box sx={{ p: 1.5, display: 'flex', gap: 1 }}>
                                <TextField
                                    size='small' placeholder='Search roles and groups…' value={search} onChange={e => setSearch(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                    sx={{ ...searchFieldSx, flex: 1 }}
                                />
                                <Button
                                    size='small' variant='outlined'
                                    onClick={() => { setSelectedRole(null); setGroupError(null); setGroupMemberSearch(''); setGroupEditor({ id: null, name: '', memberRoleIds: [] }) }}
                                    sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(100,180,255,0.4)', color: 'rgba(237,237,237,0.85)', whiteSpace: 'nowrap' }}
                                >
                                    New Group
                                </Button>
                            </Box>
```

7. Add the group editor sidebar, rendered alongside the existing `{selectedRole && (...)}` block (as a sibling, inside the same fragment):

```tsx
                        {groupEditor && (
                            <Box sx={{ width: 280, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)', p: 2, overflowY: 'auto' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(100,180,255,0.9)' }}>
                                        {groupEditor.id === null ? 'New Group' : 'Edit Group'}
                                    </Typography>
                                    <IconButton size='small' onClick={() => setGroupEditor(null)}>
                                        <Close sx={{ fontSize: 14, color: 'rgba(237,237,237,0.4)' }} />
                                    </IconButton>
                                </div>

                                {groupError && <Alert severity='error' sx={{ fontSize: '0.68rem', mb: 1.5 }}>{groupError}</Alert>}

                                <TextField
                                    size='small' fullWidth label='Name' value={groupEditor.name}
                                    onChange={e => setGroupEditor(prev => prev && { ...prev, name: e.target.value })}
                                    sx={{ mb: 2, ...searchFieldSx }}
                                />

                                {groupEditor.id !== null && (() => {
                                    const liveGroup = groups.find(g => String(g._id) === groupEditor.id)
                                    return liveGroup && (liveGroup.parentRoleId || liveGroup.parentGroupId) ? (
                                        <Button
                                            size='small' variant='outlined' fullWidth
                                            onClick={() => { patchParent('group', groupEditor.id as string, null, null); setGroupEditor(null) }}
                                            sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.85)', mb: 2 }}
                                        >
                                            Detach from Parent
                                        </Button>
                                    ) : null
                                })()}

                                <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>
                                    Members ({groupEditor.memberRoleIds.length})
                                </div>
                                <TextField
                                    size='small' fullWidth placeholder='Search roles…' value={groupMemberSearch}
                                    onChange={e => setGroupMemberSearch(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                    sx={{ ...searchFieldSx, mb: 1 }}
                                />
                                <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
                                    {roles
                                        .filter(r => r.name.toLowerCase().includes(groupMemberSearch.trim().toLowerCase()))
                                        .map(r => (
                                            <FormControlLabel key={String(r._id)} sx={{ display: 'flex', ml: 0, px: 1 }}
                                                control={
                                                    <Checkbox size='small' checked={groupEditor.memberRoleIds.includes(String(r._id))}
                                                        onChange={() => toggleGroupMember(String(r._id))} />
                                                }
                                                label={<span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>{r.name}</span>}
                                            />
                                        ))}
                                    {roles.length === 0 && (
                                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', padding: '8px' }}>No roles in the catalog yet.</div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <Button size='small' variant='outlined' onClick={saveGroup}
                                        sx={{ borderColor: 'rgba(100,180,255,0.5)', color: 'rgba(237,237,237,0.9)' }}>
                                        Save
                                    </Button>
                                    {groupEditor.id !== null && (
                                        <Button size='small' onClick={() => deleteGroup(groupEditor.id as string)} sx={{ color: 'rgba(219,0,29,0.7)' }}>
                                            Delete Group
                                        </Button>
                                    )}
                                </div>
                            </Box>
                        )}
```

The role sidebar and the group editor sidebar are mutually exclusive by construction — every path that opens one (`onSelectRole`, `onSelectGroup`, the "New Group" button) explicitly clears the other's state first.

- [ ] **Step 2: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Trace through by hand: clicking "New Group" then checking two roles then clicking Save — does `saveGroup()` `POST` with the right `memberRoleIds`, then `load()` to refresh, showing the new Group node on the canvas? Clicking an existing Group node — does the sidebar pre-fill with its current name and members? Does `deleteGroup` correctly get called with the right id, and does the confirmed-in-Task-3 cascade (any Role/Group whose parent was this group becomes a root) match what the UI would then show after `load()` re-fetches?

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx
git commit -m "Add Group creation, editing, and deletion to the Chain of Command panel"
```

---

### Task 6: Category badge for same-named roles

**Files:**
- Modify: `apps/web/app/dashboard/orbat/RolesManagerPanel.tsx`
- Modify: `apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx`

**Interfaces:**
- No new exports or props — purely additive rendering in both files, driven entirely by data already being fetched (`roles`).

- [ ] **Step 1: Add the badge to the Roles Manager list**

In `apps/web/app/dashboard/orbat/RolesManagerPanel.tsx`, add the import:

```ts
import { PLATOON_CATEGORIES } from '@/lib/orbat/constants'
```

(This import already exists in the file — skip adding it again if so; just confirm it's present.)

Add a duplicate-name lookup alongside the other `useMemo` calls:

```ts
    const duplicateNames = useMemo(() => {
        const counts = new Map<string, number>()
        for (const r of roles) counts.set(r.name, (counts.get(r.name) ?? 0) + 1)
        return new Set([...counts.entries()].filter(([, c]) => c > 1).map(([name]) => name))
    }, [roles])
```

Add a small label helper near the top of the file, alongside `discordColorHex`:

```ts
function categoryLabel(categories: string[]): string {
    if (categories.length === 0) return 'All categories'
    return categories.map(id => PLATOON_CATEGORIES.find(c => c._id === id)?.label ?? id).join(', ')
}
```

In the role list row, the current rendering is:

```tsx
                                            <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.85)' }}>{role.name}</span>
```

Replace with:

```tsx
                                            <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.85)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role.name}</span>
                                                {duplicateNames.has(role.name) && (
                                                    <span style={{ flexShrink: 0, fontSize: '0.55rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(100,180,255,0.12)', color: 'rgba(100,180,255,0.85)' }}>
                                                        {categoryLabel(role.categories)}
                                                    </span>
                                                )}
                                            </span>
```

- [ ] **Step 2: Add the badge to Chain of Command role nodes**

In `apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx`, add the import:

```ts
import { PLATOON_CATEGORIES } from '@/lib/orbat/constants'
```

Add the same label helper (this file doesn't share module scope with `RolesManagerPanel.tsx`, so it needs its own copy — two small, independent one-line-body helpers is fine here, not worth extracting a shared util for this):

```ts
function categoryLabel(categories: string[]): string {
    if (categories.length === 0) return 'All categories'
    return categories.map(id => PLATOON_CATEGORIES.find(c => c._id === id)?.label ?? id).join(', ')
}
```

Extend `RoleNodeData` with a new field:

```ts
interface RoleNodeData extends Record<string, unknown> {
    kind: 'role'
    role: OrbatRole
    dimmed: boolean
    duplicateNameLabel: string | null
}
```

In `layoutChainOfCommand`, compute name-duplicate counts once before building nodes (immediately after the `const term = search.trim().toLowerCase()` line):

```ts
    const nameCounts = new Map<string, number>()
    for (const role of roles) nameCounts.set(role.name, (nameCounts.get(role.name) ?? 0) + 1)
```

Update the `roleNodes` mapping's `data` to include the new field:

```ts
            data: {
                kind: 'role',
                role,
                dimmed,
                duplicateNameLabel: (nameCounts.get(role.name) ?? 0) > 1 ? categoryLabel(role.categories) : null,
            },
```

In the `RoleNode` component, render the badge when set — the current name block is:

```tsx
            <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.9)', fontWeight: 600, marginBottom: 6, wordBreak: 'break-word' }}>
                {role.name}
            </div>
```

Replace with:

```tsx
            <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.9)', fontWeight: 600, marginBottom: 6, wordBreak: 'break-word' }}>
                {role.name}
            </div>
            {data.duplicateNameLabel && (
                <div style={{ fontSize: '0.55rem', color: 'rgba(100,180,255,0.85)', marginBottom: 6 }}>
                    {data.duplicateNameLabel}
                </div>
            )}
```

(`RoleNode`'s function signature is `function RoleNode({ data }: NodeProps<RoleFlowNode>)` — `data` is already destructured as `{ role, dimmed }` at the top; keep that destructure and additionally reference `data.duplicateNameLabel` directly as shown, or extend the destructure to `const { role, dimmed, duplicateNameLabel } = data` and use `duplicateNameLabel` directly — either is fine, just be consistent with whichever you pick.)

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Trace through by hand: with two roles both named "Section Commander" (different categories), does `duplicateNames`/`nameCounts` correctly flag both of them (count > 1), while a uniquely-named role's badge stays hidden? Does a role with `categories: []` show "All categories" rather than an empty string?

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/orbat/RolesManagerPanel.tsx apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx
git commit -m "Show a category-scope badge for same-named ORBAT roles"
```
