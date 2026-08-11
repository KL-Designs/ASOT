# Department Quick Links: Permissions Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No test framework exists in this codebase — "verify" steps mean `npx tsc --noEmit -p tsconfig.json` from `apps/web/` plus a manual read-through, not an automated test run.

**Goal:** Collapse the 14 per-department `deptLinks.*` permission keys into one `deptLinks.manage` key with department scope derived from the `DepartmentRole` holding it; replace the restricted/public binary with per-link sub-role assignment; surface visible links on `/dashboard` home; rename the "Settings" department view to "Management".

**Architecture:** New `hasDepartmentPermission`/`hasDepartmentPermissions` primitives in `lib/orbat/` (siblings of the existing `hasPermission`/`hasPermissions`) answer "does this user hold this key via a role scoped to this department." `DepartmentLink.restricted: boolean` becomes `visibleToRoleIds: ObjectId[]`, checked by one shared helper (`lib/dept-links/visibility.ts`) used by every route that reads links, so the Mongo filter and the in-process check can't drift.

**Tech Stack:** Next.js 15 App Router API routes, MongoDB, MUI v5, TypeScript.

## Global Constraints

- No test framework exists (`apps/web/CLAUDE.md`); verification is `npx tsc --noEmit -p tsconfig.json` (run from `apps/web/`) plus manual review.
- This branch (`dept-quick-links`) was never merged to `main` — no production data references the old keys/field, so this is a clean rename, not a migration.
- Follow the existing per-department file duplication convention (7 near-identical `JNPanel.tsx`/`page.tsx` files) — do not introduce a shared abstraction across them; that's not this codebase's pattern.
- Server-side-only visibility filtering for links (never filter client-side/in JS) — same rule the original design already locked in for `restricted`.

---

### Task 1: Department-scoped permission primitives + key collapse

**Files:**
- Create: `apps/web/lib/orbat/hasDepartmentPermission.ts`
- Create: `apps/web/lib/orbat/hasDepartmentPermissions.ts`
- Modify: `apps/web/lib/permissions.ts` (the `deptLinks` block, currently lines 696-743)
- Modify: `apps/web/lib/permissions-descriptions.ts` (lines 66-80)
- Modify: `apps/web/lib/dept-links/keys.ts`

**Interfaces:**
- Produces: `hasDepartmentPermission(user: User, department: string, key: string): Promise<boolean>`, `hasDepartmentPermissions(user: User, department: string, keys: string[]): Promise<Record<string, boolean>>`. Later tasks call these with `department` = a lowercase `'j1'..'j7'` string and `key` = `'deptLinks.manage'`.
- Consumes: `Db.departmentRoles` (`types/department-role.d.ts`'s `DepartmentRole`), `User.departments`/`User.departmentRoleIds` (`types/user.d.ts`).

- [ ] **Step 1: Create `hasDepartmentPermission.ts`**

```ts
import Db from '@/lib/mongo'
import { ObjectId } from 'mongodb'

/**
 * Department-scoped permission check: true if the user's Discord ID is in
 * the OVERRIDE env list (the only hard bypass), OR the user holds a
 * DepartmentRole scoped to `department` (their base role, if they're an
 * actual member of that department, or any sub-role they're explicitly
 * assigned) whose `permissions` includes `key`. Deliberately does NOT
 * consult ORBAT position roles (hasPermission.ts does) — those aren't
 * department-scoped, and including them would defeat the point of this
 * check: a key like 'deptLinks.manage' must only grant rights over the
 * one department whose role actually carries it.
 */
export async function hasDepartmentPermission(user: User, department: string, key: string): Promise<boolean> {
    const override = process.env.OVERRIDE?.split(',') ?? []
    if (override.includes(user.id)) return true

    const isMember = (user.departments ?? []).includes(department)
    // Re-materialize through this file's own ObjectId import — the shared
    // types/user.d.ts (monorepo root) resolves ObjectId from a different
    // physical bson install than apps/web's, so TS treats them as distinct
    // nominal types even though they're runtime-identical (same 24-char hex).
    const subRoleIds = (user.departmentRoleIds ?? []).map(id => new ObjectId(String(id)))
    if (!isMember && subRoleIds.length === 0) return false

    const deptRoles = await Db.departmentRoles.find({
        department,
        $or: [
            ...(isMember ? [{ isBase: true }] : []),
            { _id: { $in: subRoleIds } },
        ],
    }).toArray()

    return deptRoles.some(role => role.permissions.includes(key))
}
```

- [ ] **Step 2: Create `hasDepartmentPermissions.ts`**

```ts
import Db from '@/lib/mongo'
import { ObjectId } from 'mongodb'

/**
 * Batch variant of hasDepartmentPermission: answers several keys for one
 * department in a single query pass. Identical semantics/grant sources;
 * hasDepartmentPermission stays the single-key entry point.
 */
export async function hasDepartmentPermissions(user: User, department: string, keys: string[]): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {}
    for (const key of keys) result[key] = false
    if (keys.length === 0) return result

    const override = process.env.OVERRIDE?.split(',') ?? []
    if (override.includes(user.id)) {
        for (const key of keys) result[key] = true
        return result
    }

    const isMember = (user.departments ?? []).includes(department)
    const subRoleIds = (user.departmentRoleIds ?? []).map(id => new ObjectId(String(id)))
    if (!isMember && subRoleIds.length === 0) return result

    const deptRoles = await Db.departmentRoles.find({
        department,
        $or: [
            ...(isMember ? [{ isBase: true }] : []),
            { _id: { $in: subRoleIds } },
        ],
    }).toArray()

    const granted = new Set<string>()
    for (const role of deptRoles) for (const key of role.permissions) granted.add(key)
    for (const key of keys) result[key] = granted.has(key)
    return result
}
```

- [ ] **Step 3: Collapse the `deptLinks` block in `lib/permissions.ts`**

Replace the entire block (comment header at ~line 696 through the closing `},` at ~line 743) with:

```ts
    // ── Department quick links ────────────────────────────────────────────────
    //
    // Per-department managed quick links (the favicon tile rail on each J1-J7
    // landing view, managed from that department's Management view).
    //
    // A single new-system-only key (empty Discord-role array; the real gate is
    // always `await hasDepartmentPermission(user, department, 'deptLinks.manage')`
    // — see lib/orbat/hasDepartmentPermission.ts). Department scope comes from
    // which DepartmentRole the key is assigned to, not from the key name, so
    // one key covers all seven departments (unlike the old manageJ1..J7 keys).
    //
    // Per-link visibility (which specific sub-roles can see a given link) is
    // data on DepartmentLink.visibleToRoleIds, not a permission key — see
    // types/department-link.d.ts. Write access is `deptLinks.manage` OR
    // `departmentLeads.jX`, so leads work day one and the right can additionally
    // be delegated to any department role through the role manager.

    deptLinks: {
        /** Add, edit, delete, reorder and control the visible-to sub-roles of a department's quick links. Scope comes from which DepartmentRole holds this key. New-system-only key. */
        manage: [],
    },
```

- [ ] **Step 4: Replace the `deptLinks` entries in `lib/permissions-descriptions.ts`**

Delete lines 66-80 (the 14 `deptLinks.viewRestrictedJN`/`deptLinks.manageJN` entries) and replace with:

```ts
    'deptLinks.manage': "Add, edit, delete, reorder, and control who can see a department's quick links.",
```

- [ ] **Step 5: Update `lib/dept-links/keys.ts`**

```ts
import { DEPT_CODES } from '@/lib/discord/dept-codes'

export type DeptLinkDepartment = typeof DEPT_CODES[number]

export function isDeptLinkDepartment(value: unknown): value is DeptLinkDepartment {
    return typeof value === 'string' && (DEPT_CODES as readonly string[]).includes(value)
}

export const DEPT_LINKS_MANAGE_KEY = 'deptLinks.manage'

export function leadKey(dept: DeptLinkDepartment): string {
    return `departmentLeads.${dept}`
}
```

(`manageKey`/`viewRestrictedKey` are deleted — every call site is rewritten in Task 2/Task 5 to use `DEPT_LINKS_MANAGE_KEY` directly with the new department-scoped checks.)

- [ ] **Step 6: Typecheck**

Run (from `apps/web/`): `npx tsc --noEmit -p tsconfig.json`
Expected: errors only in files Task 2/3/5 haven't touched yet (the old `manageKey`/`viewRestrictedKey` call sites) — confirms the deletion is wired correctly and nothing in Task 1's own new files is broken. Note which files error; they're exactly this plan's remaining tasks.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/orbat/hasDepartmentPermission.ts apps/web/lib/orbat/hasDepartmentPermissions.ts apps/web/lib/permissions.ts apps/web/lib/permissions-descriptions.ts apps/web/lib/dept-links/keys.ts
git commit -m "feat(dept-links): collapse 14 permission keys into one department-scoped deptLinks.manage"
```

---

### Task 2: Data model + API routes (`restricted` → `visibleToRoleIds`)

**Files:**
- Modify: `apps/web/types/department-link.d.ts`
- Create: `apps/web/lib/dept-links/visibility.ts`
- Modify: `apps/web/app/api/admin/dept-links/route.ts`
- Modify: `apps/web/app/api/admin/dept-links/[id]/route.ts`
- Modify: `apps/web/app/api/admin/dept-links/[id]/favicon/route.ts`

**Interfaces:**
- Consumes: `hasDepartmentPermission`/`hasDepartmentPermissions` (Task 1), `DEPT_LINKS_MANAGE_KEY`/`leadKey`/`isDeptLinkDepartment` (Task 1's `lib/dept-links/keys.ts`).
- Produces: `DepartmentLink.visibleToRoleIds: ObjectId[]`, `DepartmentLinkListItem.visibleToRoleIds: string[]` (later tasks — the modal, the manager card, the rail, the home aggregate — all read this field). `lib/dept-links/visibility.ts` exports `visibilityFilter(user: User): Record<string, unknown>` (a Mongo filter fragment to `$and` into a links query) and `isLinkVisible(user: User, link: Pick<DepartmentLink, 'visibleToRoleIds'>): boolean` (in-process check for the favicon route, which loads one doc rather than querying a list).

- [ ] **Step 1: Update `types/department-link.d.ts`**

Replace `restricted: boolean` (line 18) with `visibleToRoleIds: ObjectId[]` in `DepartmentLink`, and replace `restricted: boolean` (line 40) with `visibleToRoleIds: string[]` in `DepartmentLinkListItem`. Update both fields' comments:

```ts
    interface DepartmentLink {
        _id: ObjectId
        department: string                  // 'j1'..'j7', see lib/discord/dept-codes.ts DEPT_CODES
        url: string                         // normalised absolute http(s) href
        fetchedTitle: string                // page <title>, else the URL host
        nameOverride: string | null         // display-only; null = show fetchedTitle
        visibleToRoleIds: ObjectId[]        // empty = visible to every department member; non-empty = only members holding one of these DepartmentRole ids (or managers)
        order: number                       // fractional-midpoint reorder, board precedent
        faviconData: string | null          // base64, <=200KB raw, doc-embedded (atomic, no orphan files)
        faviconContentType: string | null   // one of the six canonical image types, magic-byte sniffed
        faviconFetchedAt: Date | null       // doubles as the ?v= cache buster
        faviconStatus: 'ok' | 'failed'
        createdAt: Date
        createdBy: string                   // Discord ID
        createdByName: string
        updatedAt?: Date
        updatedById?: string
        updatedByName?: string
    }

    // Wire shape returned by GET /api/admin/dept-links. faviconData is never
    // included; the bytes are served separately from the favicon route.
    interface DepartmentLinkListItem {
        _id: string
        department: string
        url: string
        fetchedTitle: string
        nameOverride: string | null
        visibleToRoleIds: string[]           // DepartmentRole ids as strings; empty = everyone
        order: number
        hasFavicon: boolean
        faviconVersion: number | null       // faviconFetchedAt.getTime(), null when never fetched
    }
```

- [ ] **Step 2: Create `lib/dept-links/visibility.ts`**

```ts
import { ObjectId } from 'mongodb'

/**
 * Mongo filter fragment: matches links visible to `user` without a manage
 * gate — either unrestricted (empty/absent visibleToRoleIds) or restricted
 * to a sub-role the user holds. $and this into a { department } query.
 * Managers/leads bypass this filter entirely at the call site (they see
 * everything); this fragment is only for the "what can a plain member see"
 * case.
 */
export function visibilityFilter(user: User): Record<string, unknown> {
    const subRoleIds = (user.departmentRoleIds ?? []).map(id => new ObjectId(String(id)))
    return {
        $or: [
            { visibleToRoleIds: { $exists: false } },
            { visibleToRoleIds: { $size: 0 } },
            { visibleToRoleIds: { $in: subRoleIds } },
        ],
    }
}

/**
 * In-process equivalent of visibilityFilter, for routes that already loaded
 * one link doc (e.g. the favicon route) rather than running a list query.
 */
export function isLinkVisible(user: User, link: Pick<DepartmentLink, 'visibleToRoleIds'>): boolean {
    if (!link.visibleToRoleIds || link.visibleToRoleIds.length === 0) return true
    const held = new Set((user.departmentRoleIds ?? []).map(id => String(id)))
    return link.visibleToRoleIds.some(id => held.has(String(id)))
}
```

- [ ] **Step 3: Rewrite `app/api/admin/dept-links/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'
import { hasDepartmentPermissions } from '@/lib/orbat/hasDepartmentPermissions'
import { isDeptLinkDepartment, DEPT_LINKS_MANAGE_KEY, leadKey } from '@/lib/dept-links/keys'
import { validateLinkUrl } from '@/lib/dept-links/validate-url'
import { fetchSiteMeta } from '@/lib/dept-links/favicon'
import { visibilityFilter } from '@/lib/dept-links/visibility'

const MAX_LINKS_PER_DEPARTMENT = 24
const MAX_NAME_OVERRIDE_LENGTH = 80

function withoutFaviconData(doc: DepartmentLink): Record<string, unknown> {
    const copy: Record<string, unknown> = { ...doc }
    delete copy.faviconData
    copy.hasFavicon = doc.faviconStatus === 'ok'
    return copy
}


// ── GET /api/admin/dept-links?department=jN ─────────────────────────────────

export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const department = request.nextUrl.searchParams.get('department')
    if (!department || !isDeptLinkDepartment(department)) {
        return NextResponse.json({ error: 'department is required' }, { status: 400 })
    }

    const deptKey = department as keyof typeof PERMISSIONS.departments
    if (!PERMISSIONS.departments[deptKey] || !client.hasRoles(me, PERMISSIONS.departments[deptKey])) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const perms = await hasDepartmentPermissions(me, department, [DEPT_LINKS_MANAGE_KEY, leadKey(department)])
    const canManage = perms[DEPT_LINKS_MANAGE_KEY] || perms[leadKey(department)]

    const filter: Record<string, unknown> = canManage
        ? { department }
        : { department, ...visibilityFilter(me) }

    const docs = await Db.departmentLinks
        .find(filter, { projection: { department: 1, url: 1, fetchedTitle: 1, nameOverride: 1, visibleToRoleIds: 1, order: 1, faviconFetchedAt: 1, faviconStatus: 1 } })
        .sort({ order: 1 })
        .toArray()

    const links: DepartmentLinkListItem[] = docs.map(d => ({
        _id: String(d._id),
        department: d.department,
        url: d.url,
        fetchedTitle: d.fetchedTitle,
        nameOverride: d.nameOverride,
        visibleToRoleIds: (d.visibleToRoleIds ?? []).map(String),
        order: d.order,
        hasFavicon: d.faviconStatus === 'ok',
        faviconVersion: d.faviconFetchedAt ? new Date(d.faviconFetchedAt).getTime() : null,
    }))

    return NextResponse.json({ links: JSON.parse(JSON.stringify(links)), canManage })
}


// ── POST /api/admin/dept-links ───────────────────────────────────────────────
// Body: { department, url, nameOverride?, visibleToRoleIds? }. Manage gate only.

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const department = body?.department
    if (!isDeptLinkDepartment(department)) {
        return NextResponse.json({ error: 'department is required' }, { status: 400 })
    }

    const perms = await hasDepartmentPermissions(me, department, [DEPT_LINKS_MANAGE_KEY, leadKey(department)])
    if (!perms[DEPT_LINKS_MANAGE_KEY] && !perms[leadKey(department)]) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const v = validateLinkUrl(body?.url)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    let nameOverride: string | null = null
    if (body && 'nameOverride' in body && body.nameOverride !== undefined) {
        const raw = body.nameOverride
        if (typeof raw !== 'string' && raw !== null) {
            return NextResponse.json({ error: 'Display name override must be text or null' }, { status: 400 })
        }
        const trimmed = typeof raw === 'string' ? raw.trim() : ''
        if (trimmed.length > MAX_NAME_OVERRIDE_LENGTH) {
            return NextResponse.json({ error: 'Display name override must be 80 characters or fewer' }, { status: 400 })
        }
        nameOverride = trimmed === '' ? null : trimmed
    }

    let visibleToRoleIds: ObjectId[] = []
    if (body && 'visibleToRoleIds' in body && body.visibleToRoleIds !== undefined) {
        if (!Array.isArray(body.visibleToRoleIds) || !body.visibleToRoleIds.every((id: unknown) => typeof id === 'string')) {
            return NextResponse.json({ error: 'visibleToRoleIds must be an array of role ids' }, { status: 400 })
        }
        try {
            visibleToRoleIds = body.visibleToRoleIds.map((id: string) => new ObjectId(id))
        } catch {
            return NextResponse.json({ error: 'visibleToRoleIds contains an invalid id' }, { status: 400 })
        }
    }

    const count = await Db.departmentLinks.countDocuments({ department })
    if (count >= MAX_LINKS_PER_DEPARTMENT) {
        return NextResponse.json({ error: 'This department already has the maximum of 24 quick links. Delete one before adding another.' }, { status: 400 })
    }

    const last = await Db.departmentLinks.find({ department }).sort({ order: -1 }).limit(1).toArray()
    const order = (last[0]?.order ?? -1) + 1

    const meta = await fetchSiteMeta(v.href)

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const doc: DepartmentLink = {
        _id: new ObjectId(),
        department,
        url: v.href,
        fetchedTitle: meta.fetchedTitle,
        nameOverride,
        visibleToRoleIds,
        order,
        faviconData: meta.faviconData,
        faviconContentType: meta.faviconContentType,
        faviconFetchedAt: meta.faviconFetchedAt,
        faviconStatus: meta.faviconStatus,
        createdAt: new Date(),
        createdBy: me.id,
        createdByName: performedByName,
    }
    await Db.departmentLinks.insertOne(doc)

    const displayName = nameOverride ?? doc.fetchedTitle
    logAction({
        action: 'deptLinks.create',
        category: 'deptLinks',
        performedBy: me.id,
        performedByName,
        department,
        entityType: 'deptLink',
        entityId: String(doc._id),
        target: `Added quick link "${displayName}"`,
        after: withoutFaviconData(doc),
    })

    const listItem: DepartmentLinkListItem = {
        _id: String(doc._id),
        department: doc.department,
        url: doc.url,
        fetchedTitle: doc.fetchedTitle,
        nameOverride: doc.nameOverride,
        visibleToRoleIds: doc.visibleToRoleIds.map(String),
        order: doc.order,
        hasFavicon: doc.faviconStatus === 'ok',
        faviconVersion: doc.faviconFetchedAt ? doc.faviconFetchedAt.getTime() : null,
    }

    return NextResponse.json({ link: JSON.parse(JSON.stringify(listItem)) })
}
```

(`canSeeRestricted` is dropped from the GET response — nothing consumes it after Task 3's rewrite of the manager card/rail, which derive lock-icon display from `link.visibleToRoleIds.length > 0` on each item instead.)

- [ ] **Step 4: Update `app/api/admin/dept-links/[id]/route.ts`**

Replace the import line:
```ts
import { manageKey, leadKey, type DeptLinkDepartment } from '@/lib/dept-links/keys'
```
with:
```ts
import { DEPT_LINKS_MANAGE_KEY, leadKey, type DeptLinkDepartment } from '@/lib/dept-links/keys'
import { hasDepartmentPermissions } from '@/lib/orbat/hasDepartmentPermissions'
```
(drop the old `hasPermissions` import from `@/lib/orbat/hasPermissions`).

In `PATCH`, replace:
```ts
    const dept = link.department as DeptLinkDepartment
    const perms = await hasPermissions(me, [manageKey(dept), leadKey(dept)])
    if (!perms[manageKey(dept)] && !perms[leadKey(dept)]) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```
with:
```ts
    const dept = link.department as DeptLinkDepartment
    const perms = await hasDepartmentPermissions(me, dept, [DEPT_LINKS_MANAGE_KEY, leadKey(dept)])
    if (!perms[DEPT_LINKS_MANAGE_KEY] && !perms[leadKey(dept)]) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```

Replace the `restricted` field-handling block:
```ts
    if (body && 'restricted' in body && body.restricted !== undefined) {
        if (typeof body.restricted !== 'boolean') {
            return NextResponse.json({ error: 'restricted must be true or false' }, { status: 400 })
        }
        updates.restricted = body.restricted
    }
```
with:
```ts
    if (body && 'visibleToRoleIds' in body && body.visibleToRoleIds !== undefined) {
        if (!Array.isArray(body.visibleToRoleIds) || !body.visibleToRoleIds.every((id: unknown) => typeof id === 'string')) {
            return NextResponse.json({ error: 'visibleToRoleIds must be an array of role ids' }, { status: 400 })
        }
        try {
            updates.visibleToRoleIds = body.visibleToRoleIds.map((id: string) => new ObjectId(id))
        } catch {
            return NextResponse.json({ error: 'visibleToRoleIds contains an invalid id' }, { status: 400 })
        }
    }
```

In `DELETE`, apply the same `perms`/`DEPT_LINKS_MANAGE_KEY` replacement as in `PATCH` above.

- [ ] **Step 5: Update `app/api/admin/dept-links/[id]/favicon/route.ts`**

Replace the import line:
```ts
import { manageKey, viewRestrictedKey, leadKey, type DeptLinkDepartment } from '@/lib/dept-links/keys'
```
with:
```ts
import { DEPT_LINKS_MANAGE_KEY, leadKey, type DeptLinkDepartment } from '@/lib/dept-links/keys'
import { hasDepartmentPermissions } from '@/lib/orbat/hasDepartmentPermissions'
import { isLinkVisible } from '@/lib/dept-links/visibility'
```
(drop the old `hasPermissions` import).

In `GET`, replace the projection's `restricted: 1` with `visibleToRoleIds: 1`, and replace:
```ts
    if (link.restricted) {
        const dept = link.department as DeptLinkDepartment
        const perms = await hasPermissions(me, [viewRestrictedKey(dept), manageKey(dept), leadKey(dept)])
        if (!perms[viewRestrictedKey(dept)] && !perms[manageKey(dept)] && !perms[leadKey(dept)]) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
    }
```
with:
```ts
    if (!isLinkVisible(me, link)) {
        const dept = link.department as DeptLinkDepartment
        const perms = await hasDepartmentPermissions(me, dept, [DEPT_LINKS_MANAGE_KEY, leadKey(dept)])
        if (!perms[DEPT_LINKS_MANAGE_KEY] && !perms[leadKey(dept)]) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
    }
```

In `POST`, apply the same `perms`/`DEPT_LINKS_MANAGE_KEY` replacement used in Task 2 Step 4's `PATCH`.

- [ ] **Step 6: Typecheck**

Run (from `apps/web/`): `npx tsc --noEmit -p tsconfig.json`
Expected: errors remaining only in Task 3's and Task 5's files (`DeptLinkModal.tsx`, `DeptLinksManagerCard.tsx`, `DeptLinksRail.tsx` still reference `link.restricted`; the 7 `page.tsx` files still reference the deleted `manageKey`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/types/department-link.d.ts apps/web/lib/dept-links/visibility.ts apps/web/app/api/admin/dept-links/route.ts "apps/web/app/api/admin/dept-links/[id]/route.ts" "apps/web/app/api/admin/dept-links/[id]/favicon/route.ts"
git commit -m "feat(dept-links): restricted boolean -> visibleToRoleIds, wire new permission checks"
```

---

### Task 3: Manager UI — per-link sub-role assignment

**Files:**
- Modify: `apps/web/app/dashboard/_components/dept-links/DeptLinkModal.tsx`
- Modify: `apps/web/app/dashboard/_components/dept-links/DeptLinksManagerCard.tsx`
- Modify: `apps/web/app/dashboard/_components/dept-links/DeptLinksRail.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/department-roles?department=jN` (existing route — returns `{ roles: DepartmentRole[] }`, already gated to any department member/lead/manager), `DepartmentLinkListItem.visibleToRoleIds: string[]` (Task 2).

- [ ] **Step 1: Replace the restricted toggle in `DeptLinkModal.tsx`**

Replace the `Switch` import with `Autocomplete`:
```ts
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, IconButton, Alert, Autocomplete, Chip } from '@mui/material'
```

Replace state:
```ts
    const [restricted, setRestricted] = useState(false)
```
with:
```ts
    const [subRoles, setSubRoles] = useState<{ _id: string; name: string }[]>([])
    const [visibleToRoleIds, setVisibleToRoleIds] = useState<string[]>([])
```

In the `useEffect` that resets form state on open, replace:
```ts
        setRestricted(link?.restricted ?? false)
```
with:
```ts
        setVisibleToRoleIds(link?.visibleToRoleIds ?? [])
```
and add, in the same effect, a fetch of that department's sub-roles:
```ts
        fetch(`/api/admin/department-roles?department=${department}`)
            .then(r => r.json())
            .then(data => setSubRoles((data.roles ?? []).filter((r: DepartmentRole) => !r.isBase).map((r: DepartmentRole) => ({ _id: String(r._id), name: r.name }))))
            .catch(() => setSubRoles([]))
```

In `handleSave`, replace both occurrences of `restricted` in the request bodies:
```ts
                body: JSON.stringify({ department, url: urlInput, nameOverride: overrideInput, restricted }),
```
→
```ts
                body: JSON.stringify({ department, url: urlInput, nameOverride: overrideInput, visibleToRoleIds }),
```
and:
```ts
            if (restricted !== link.restricted) body.restricted = restricted
```
→
```ts
            const sameIds = visibleToRoleIds.length === link.visibleToRoleIds.length && visibleToRoleIds.every(id => link.visibleToRoleIds.includes(id))
            if (!sameIds) body.visibleToRoleIds = visibleToRoleIds
```

Replace the restricted-switch JSX block:
```tsx
                <div>
                    <FormControlLabel control={<Switch checked={restricted} onChange={e => setRestricted(e.target.checked)} />} label='Restricted' />
                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)' }}>
                        Only members granted this department's restricted-links permission will see it.
                    </div>
                </div>
```
with:
```tsx
                <Autocomplete
                    multiple
                    size='small'
                    options={subRoles.map(r => r._id)}
                    getOptionLabel={id => subRoles.find(r => r._id === id)?.name ?? id}
                    value={visibleToRoleIds}
                    onChange={(_e, ids) => setVisibleToRoleIds(ids)}
                    renderTags={(value, getTagProps) =>
                        value.map((id, index) => (
                            <Chip size='small' label={subRoles.find(r => r._id === id)?.name ?? id} {...getTagProps({ index })} key={id} />
                        ))
                    }
                    renderInput={params => (
                        <TextField {...params} label='Visible to' placeholder={visibleToRoleIds.length === 0 ? 'Everyone in the department' : undefined} />
                    )}
                />
                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)' }}>
                    Leave empty for every department member to see this link. Pick specific sub-roles to restrict it to them (and managers).
                </div>
```

Remove the now-unused `FormControlLabel`/`Switch` from the import line at the top of the file.

- [ ] **Step 2: Update the lock-icon condition in `DeptLinksManagerCard.tsx`**

Replace:
```tsx
                    {link.restricted && (
                        <Tooltip title='Restricted — visible to authorised members only'>
                            <Lock sx={{ fontSize: 13, color: 'rgb(255,179,0)' }} />
                        </Tooltip>
                    )}
```
with:
```tsx
                    {link.visibleToRoleIds.length > 0 && (
                        <Tooltip title='Restricted to specific sub-roles'>
                            <Lock sx={{ fontSize: 13, color: 'rgb(255,179,0)' }} />
                        </Tooltip>
                    )}
```

- [ ] **Step 3: Update the lock-badge condition in `DeptLinksRail.tsx`**

Replace:
```tsx
                            {link.restricted && (
                                <Tooltip title='Restricted — visible to authorised members only'>
                                    <Lock sx={{ position: 'absolute', top: -6, right: -6, fontSize: 11, color: 'rgb(255,179,0)' }} />
                                </Tooltip>
                            )}
```
with:
```tsx
                            {link.visibleToRoleIds.length > 0 && (
                                <Tooltip title='Restricted to specific sub-roles'>
                                    <Lock sx={{ position: 'absolute', top: -6, right: -6, fontSize: 11, color: 'rgb(255,179,0)' }} />
                                </Tooltip>
                            )}
```

- [ ] **Step 4: Typecheck**

Run (from `apps/web/`): `npx tsc --noEmit -p tsconfig.json`
Expected: errors remaining only in Task 5's 7 `page.tsx` files.

- [ ] **Step 5: Manual verification**

Start the dev server (`npm run dev` from `apps/web/`), open a department you manage, go to Management, add/edit a link, confirm the "Visible to" picker loads that department's sub-roles and saving round-trips correctly (reload the page, confirm the same roles are pre-selected on re-edit).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/dashboard/_components/dept-links/DeptLinkModal.tsx apps/web/app/dashboard/_components/dept-links/DeptLinksManagerCard.tsx apps/web/app/dashboard/_components/dept-links/DeptLinksRail.tsx
git commit -m "feat(dept-links): per-link sub-role visibility picker replaces restricted toggle"
```

---

### Task 4: Home page surfacing (`/dashboard`)

**Files:**
- Create: `apps/web/app/api/dashboard/quick-links/route.ts`
- Create: `apps/web/app/dashboard/_components/DashboardQuickLinks.tsx`
- Modify: `apps/web/app/dashboard/DashboardOverview.tsx`

**Interfaces:**
- Consumes: `visibilityFilter` (Task 2's `lib/dept-links/visibility.ts`), `DepartmentLinkListItem` (Task 2).
- Produces: `GET /api/dashboard/quick-links` → `{ groups: { department: string; links: DepartmentLinkListItem[] }[] }`.

- [ ] **Step 1: Create the aggregate route**

```ts
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { visibilityFilter } from '@/lib/dept-links/visibility'

// ── GET /api/dashboard/quick-links ───────────────────────────────────────────
// One entry per department the caller belongs to, each pre-filtered to that
// caller's visible links via the same visibilityFilter the per-department
// route uses (D: shared helper so the two can't drift). Managers see
// everything they manage too, same as the per-department route.

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const departments = me.departments ?? []
    if (departments.length === 0) return NextResponse.json({ groups: [] })

    const docs = await Db.departmentLinks
        .find({ department: { $in: departments }, ...visibilityFilter(me) }, {
            projection: { department: 1, url: 1, fetchedTitle: 1, nameOverride: 1, visibleToRoleIds: 1, order: 1, faviconFetchedAt: 1, faviconStatus: 1 },
        })
        .sort({ department: 1, order: 1 })
        .toArray()

    const groups: { department: string; links: DepartmentLinkListItem[] }[] = departments
        .map(department => ({
            department,
            links: docs
                .filter(d => d.department === department)
                .map(d => ({
                    _id: String(d._id),
                    department: d.department,
                    url: d.url,
                    fetchedTitle: d.fetchedTitle,
                    nameOverride: d.nameOverride,
                    visibleToRoleIds: (d.visibleToRoleIds ?? []).map(String),
                    order: d.order,
                    hasFavicon: d.faviconStatus === 'ok',
                    faviconVersion: d.faviconFetchedAt ? new Date(d.faviconFetchedAt).getTime() : null,
                })),
        }))
        .filter(g => g.links.length > 0)

    return NextResponse.json({ groups: JSON.parse(JSON.stringify(groups)) })
}
```

Note: managers see all their department's links today via the per-department route because that route branches on `canManage`. This aggregate route deliberately does **not** grant that bypass — it shows a member exactly what they'd see on the rail as a plain viewer, keeping the home page a "what am I allowed to see" summary rather than a management surface. This matches the spec's "no empty state on the home page" call — a manager with zero *visible* links still sees nothing added, same as any other member.

- [ ] **Step 2: Create `DashboardQuickLinks.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Link as LinkIcon, OpenInNew } from '@mui/icons-material'

interface Group {
    department: string
    links: DepartmentLinkListItem[]
}

// Grouped-by-department quick links section for /dashboard home. Tile
// styling mirrors DeptLinksRail.tsx's tiles; kept as its own small
// duplicate rather than a shared component, matching this codebase's
// existing per-surface duplication convention (see the JNPanel.tsx files).
export default function DashboardQuickLinks() {
    const [groups, setGroups] = useState<Group[]>([])
    const [failedIcons, setFailedIcons] = useState<Set<string>>(new Set())

    useEffect(() => {
        fetch('/api/dashboard/quick-links')
            .then(r => r.json())
            .then(data => setGroups(data.groups ?? []))
            .catch(() => setGroups([]))
    }, [])

    if (groups.length === 0) return null

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.55rem', color: 'rgba(219,0,29,0.4)', lineHeight: 1 }}>{'//'}</span>
                <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)' }}>
                    Quick Links
                </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {groups.map(group => (
                    <div key={group.department}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 6 }}>
                            {group.department.toUpperCase()}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {group.links.map(link => (
                                <a key={link._id} href={link.url} target='_blank' rel='noopener noreferrer' style={{ textDecoration: 'none' }}>
                                    <div
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '8px 14px',
                                            border: '1px solid rgba(219,0,29,0.42)', borderTop: '2px solid var(--red)',
                                            background: 'rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(219,0,29,0.08)' }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                                    >
                                        {link.hasFavicon && !failedIcons.has(link._id) ? (
                                            <img
                                                src={`/api/admin/dept-links/${link._id}/favicon?v=${link.faviconVersion}`}
                                                width={18} height={18}
                                                style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }}
                                                onError={() => setFailedIcons(prev => new Set(prev).add(link._id))}
                                            />
                                        ) : (
                                            <LinkIcon sx={{ fontSize: 18, color: 'rgba(237,237,237,0.35)' }} />
                                        )}
                                        <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.75)' }}>
                                            {link.nameOverride ?? link.fetchedTitle}
                                        </span>
                                        <OpenInNew sx={{ fontSize: 12, color: 'rgba(237,237,237,0.25)' }} />
                                    </div>
                                </a>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
```

- [ ] **Step 3: Wire it into `DashboardOverview.tsx`**

Add the import near the top:
```ts
import DashboardQuickLinks from './_components/DashboardQuickLinks'
```

Insert right after the `{/* ── Favourites (draggable) ─────... */}` block's closing `</div>` (i.e. between Favourites and the `{/* ── Tasks ──... */}` line):
```tsx
            {/* ── Quick links (per-department, member-visible) ──────────────── */}
            <DashboardQuickLinks />

```

- [ ] **Step 4: Typecheck**

Run (from `apps/web/`): `npx tsc --noEmit -p tsconfig.json`
Expected: errors remaining only in Task 5's 7 `page.tsx` files.

- [ ] **Step 5: Manual verification**

In the dev server, visit `/dashboard` as a member of at least one department with a visible quick link; confirm the new section renders grouped under that department's code with working tiles. Visit as a member with zero visible links; confirm no empty section renders.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/api/dashboard/quick-links/route.ts" apps/web/app/dashboard/_components/DashboardQuickLinks.tsx apps/web/app/dashboard/DashboardOverview.tsx
git commit -m "feat(dashboard): surface visible department quick links on /dashboard home"
```

---

### Task 5: Rename Settings → Management + wire the 7 department pages/panels

**Files:**
- Modify: `apps/web/app/dashboard/j1/page.tsx` through `j7/page.tsx` (7 files)
- Modify: `apps/web/app/dashboard/j1/J1Panel.tsx` through `J7Panel.tsx` (7 files)

**Interfaces:**
- Consumes: `hasPermission` (unchanged, existing), `hasDepartmentPermission` (Task 1), `DEPT_LINKS_MANAGE_KEY` (Task 1).

- [ ] **Step 1: Update each `jN/page.tsx`**

Each file currently computes `canManageLinks` with a line shaped like:
```ts
    const perms = await hasPermissions(me, ['departmentLeads.jN', 'deptLinks.manageJN'])
    const canManageLinks = canManageMembers || perms['deptLinks.manageJN']
```
(J4's page differs slightly — it has no `canManageMembers`; check that file's actual current line before editing.)

Replace the `hasPermissions` import:
```ts
import { hasPermissions } from '@/lib/orbat/hasPermissions'
```
with:
```ts
import { hasDepartmentPermission } from '@/lib/orbat/hasDepartmentPermission'
import { DEPT_LINKS_MANAGE_KEY } from '@/lib/dept-links/keys'
```
(keep this import only if the file doesn't already use `hasPermissions` for something else unrelated to deptLinks — check each file; if it does, keep that import alongside the new one instead of replacing it.)

Replace the two-line block above with, for department `jN` (substitute the literal department code, e.g. `'j1'`):
```ts
    const canManageLinks = canManageMembers || await hasDepartmentPermission(me, 'jN', DEPT_LINKS_MANAGE_KEY)
```
(For J4's page, which has no `canManageMembers`, use: `const canManageLinks = await hasDepartmentPermission(me, 'j4', DEPT_LINKS_MANAGE_KEY)`.)

Do this for all 7 files (`j1` through `j7`), substituting the correct department code literal in each.

- [ ] **Step 2: Update each `JNPanel.tsx`**

Each file has one line shaped like:
```tsx
                        <button style={{ ...btnSx(view === 'settings'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'settings' ? 'dept' : 'settings')}>
                            <Settings sx={{ fontSize: '0.85rem' }} />Settings
                        </button>
```
Change only the visible label text:
```tsx
                        <button style={{ ...btnSx(view === 'settings'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'settings' ? 'dept' : 'settings')}>
                            <Settings sx={{ fontSize: '0.85rem' }} />Management
                        </button>
```
Do this for all 7 files. The `view === 'settings'` value, the `setView('settings')` calls, and the `Settings` icon import all stay exactly as-is (per the design: only the label text changes, not the URL param or the icon).

- [ ] **Step 3: Typecheck**

Run (from `apps/web/`): `npx tsc --noEmit -p tsconfig.json`
Expected: **zero errors** — this is the last task touching source files.

- [ ] **Step 4: Manual verification**

In the dev server, open each of `/dashboard/j1` through `/dashboard/j7` you have access to; confirm the header pill now reads "Management" and clicking it still opens the same view (members/leadership card + quick links manager card, if you have manage rights there).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/j1/page.tsx apps/web/app/dashboard/j1/J1Panel.tsx apps/web/app/dashboard/j2/page.tsx apps/web/app/dashboard/j2/J2Panel.tsx apps/web/app/dashboard/j3/page.tsx apps/web/app/dashboard/j3/J3Panel.tsx apps/web/app/dashboard/j4/page.tsx apps/web/app/dashboard/j4/J4AdminPanel.tsx apps/web/app/dashboard/j5/page.tsx apps/web/app/dashboard/j5/J5Panel.tsx apps/web/app/dashboard/j6/page.tsx apps/web/app/dashboard/j6/J6Panel.tsx apps/web/app/dashboard/j7/page.tsx apps/web/app/dashboard/j7/J7Panel.tsx
git commit -m "feat(dept-links): wire deptLinks.manage into all 7 departments, rename Settings -> Management"
```

(Verify J4's panel file name before committing — check whether it's `J4Panel.tsx` or `J4AdminPanel.tsx`; the design earlier in this session referenced `J4AdminPanel.tsx` for an unrelated CPU-profile button, so it's likely that name, but confirm before running `git add`.)

---

### Task 6: Docs

**Files:**
- Modify: `apps/web/docs/map/README.md`
- Modify: `apps/web/docs/map/a-admin-api.md`
- Modify: `apps/web/docs/map/e-dashboard-j1-j4.md`
- Modify: `apps/web/docs/map/f-dashboard-j5-j7-other.md`
- Modify: `apps/web/docs/map/h-lib-types-components.md`
- Modify: `apps/web/TASKS.md`

- [ ] **Step 1: Update every stale reference**

Grep each file for `deptLinks.manageJ`, `deptLinks.viewRestricted`, `restricted` (in dept-links context), and `hasPermissions(me, ['departmentLeads.j`, and `Settings` (in dept-links/department-panel context). Update the prose to describe: one `deptLinks.manage` key checked via `hasDepartmentPermission`/`hasDepartmentPermissions` (not `hasPermission`/`hasPermissions`), `visibleToRoleIds` replacing `restricted`, and the "Management" label (was "Settings"). Keep each edit a minimal, accurate correction of the specific stale sentence — don't rewrite surrounding prose that's still accurate. Also add one line to `docs/map/README.md`'s "Find it fast" table or existing dept-links row pointing at this plan's design doc (`docs/superpowers/specs/2026-08-12-dept-quick-links-permissions-design.md`) alongside the existing one.

- [ ] **Step 2: Update `TASKS.md`**

Edit the existing `[x] Department quick links...` line (around line 27) to drop "14 new `deptLinks.*` permission keys" in favour of "one department-scoped `deptLinks.manage` permission key" and mention the sub-role visibility assignment and home-page surfacing as part of the same feature line, or add a second `[x]` line directly beneath it for this follow-up work — whichever reads more naturally once you're looking at the actual current line.

- [ ] **Step 3: Commit**

```bash
git add apps/web/docs/map/README.md apps/web/docs/map/a-admin-api.md apps/web/docs/map/e-dashboard-j1-j4.md apps/web/docs/map/f-dashboard-j5-j7-other.md apps/web/docs/map/h-lib-types-components.md apps/web/TASKS.md
git commit -m "docs(dept-links): reflect deptLinks.manage collapse, visibleToRoleIds, Management rename"
```
