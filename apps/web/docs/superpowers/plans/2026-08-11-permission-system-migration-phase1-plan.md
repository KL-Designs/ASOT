# Permission System Migration — Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `hasPermission()` the only real permission check for `pages.member` (the most foundational "can this user open the dashboard" gate), removing its dependence on raw Discord role names, and give reservists a real editable role so they have a grant vehicle like everyone else.

**Architecture:** `hasPermission(user, key)` in `lib/orbat/hasPermission.ts` drops its Discord-role fast path and gains an explicit `OVERRIDE` env check as the only hard bypass; everything else stays additive across ORBAT-Role holdings and Department-Role holdings (base + subs), unchanged. Reservist positions (`app/api/admin/orbat/reservists/route.ts`), which today hardcode `roleId: null`, get a seeded system `OrbatRole` named `"Reservist"` so they have a grant vehicle. All 35 real call sites of `PERMISSIONS.pages.member` (`client.hasRoles(me, PERMISSIONS.pages.member)`) convert to `await hasPermission(me, 'pages.member')`. Two one-off Mongo-only migration scripts (dry-run + `--apply`, matching this repo's `scripts/migrate-*.mjs` convention) backfill the Reservist role onto existing reservist positions and grant `pages.member` on all 7 departments' base roles plus the Reservist role, so no current member loses dashboard access on cutover.

**Tech Stack:** Next.js 15 App Router, MongoDB, TypeScript (4-space indent, single quotes, no semicolons — existing repo style).

## Global Constraints

- No test suite exists in this repo. Verification is `npx tsc --noEmit -p tsconfig.json` (run from `apps/web`) plus manual code tracing. Browser testing is not possible in this environment — a standing, accepted limitation.
- This plan converts **only** `pages.member` — every other `PERMISSIONS.*` key and every other `client.hasRoles()` call site is untouched, including the `J4-Administration` hardcoded bypass inside `hasRoles()` itself (`lib/discord/index.ts`) and the `PERMISSIONS` object (`lib/permissions.ts`). Both keep working exactly as today; removing them is a later phase's job, once nothing depends on them.
- `PERMISSION_CATALOG`/`PERMISSION_KEYS` (`lib/permissions-catalog.ts`) are **not** touched — `lib/permissions/tree.ts` (the Permissions Explorer) depends on `PERMISSION_CATALOG[key]`'s exact shape (key → Discord role names) to show admins real grant paths for every not-yet-migrated key. Do not modify this file in this plan.
- The only hard bypass in the new `hasPermission()` is the raw `OVERRIDE` env Discord-ID list — no role-name special-casing.
- Migration scripts are Mongo-only (no Discord/TeamSpeak calls) — the grants involved (`pages.member` on department base roles, the Reservist role's backfill) don't touch `discordRoleIds`/`tsGroupIds`. Dry-run by default, `--apply` flag required to write. Follow `scripts/migrate-orbat-roles.mjs`'s established structure (plain Node + `mongodb` driver, `--env-file=.env`, no app imports).
- Code style: 4-space indent, single quotes, no semicolons, matching every existing file touched.
- Whenever a task adds or meaningfully changes a route/page/lib/type file, update the relevant `docs/map/*.md` file(s) in the same task (per `apps/web/CLAUDE.md`'s "Site Map" section).

---

### Task 1: Rewrite `hasPermission()`

**Files:**
- Modify: `apps/web/lib/orbat/hasPermission.ts`
- Modify: `apps/web/docs/map/h-lib-types-components.md`

**Interfaces:**
- Produces: `hasPermission(user: User, key: string): Promise<boolean>` — same signature as today, new behavior (no Discord-role fast path; explicit `OVERRIDE` check added).

- [ ] **Step 1: Rewrite the function**

Replace the full contents of `apps/web/lib/orbat/hasPermission.ts` with:

```ts
import Db from '@/lib/mongo'
import { ObjectId } from 'mongodb'

/**
 * Additive permission check: true if the user's Discord ID is in the
 * OVERRIDE env list (the only hard bypass), OR any ORBAT position Role
 * they hold grants it, OR their base department role (implicit from
 * User.departments) or any assigned department sub-role grants it.
 * Deliberately does NOT fall back to checking raw Discord role names —
 * that pattern is what this function replaces, one permission key at a
 * time, across the site. See docs/superpowers/specs/2026-08-11-permission-system-migration-phase1-design.md.
 */
export async function hasPermission(user: User, key: string): Promise<boolean> {
    const override = process.env.OVERRIDE?.split(',') ?? []
    if (override.includes(user.id)) return true

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
    // Re-materialize through this file's own ObjectId import — the shared
    // types/user.d.ts (monorepo root) resolves ObjectId from a different
    // physical bson install than apps/web's, so TS treats them as distinct
    // nominal types even though they're runtime-identical (same 24-char hex).
    const subRoleIds = (user.departmentRoleIds ?? []).map(id => new ObjectId(String(id)))
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

The only real changes from the current file: the `PERMISSION_CATALOG` import and the Discord-role fast-path block (`const discordRoleNames = PERMISSION_CATALOG[key]; if (discordRoleNames && client.hasRoles(user, discordRoleNames)) return true`) are removed, and the `OVERRIDE` check is added at the top. The `client` import (`@/lib/discord`) is no longer needed either — this file's only imports now are `Db` and `ObjectId`. The ORBAT-role and department-role blocks are byte-identical to today.

- [ ] **Step 2: Update the doc map**

In `apps/web/docs/map/h-lib-types-components.md`, find the `hasPermission()` entry (search for `hasPermission(user, key)`). Replace its description to reflect the new behavior — no more Discord-role fast path, explicit `OVERRIDE` check is the only hard bypass, still additive across ORBAT-Role and Department-Role holdings.

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (`attendance.confirm`'s 4 existing call sites are unaffected — same function signature, same truthy/falsy contract, just no Discord-role fallback that those call sites never depended on anyway since they're J2/HQ-Staff-gated features not represented by any ORBAT/department role today — this is expected and matches the spec's Non-goals: only `pages.member` is being newly wired up in this plan, `attendance.confirm`'s behavior for its own gate is unchanged either way.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/orbat/hasPermission.ts apps/web/docs/map/h-lib-types-components.md
git commit -m "Remove Discord-role fallback from hasPermission(), add OVERRIDE bypass"
```

---

### Task 2: Reservists get a real role

**Files:**
- Modify: `apps/web/app/api/admin/orbat/reservists/route.ts`
- Create: `scripts/migrate-reservist-role.mjs`

**Interfaces:**
- Consumes: none from Task 1 (independent).
- Produces: every reservist `OrbatPosition` (`category` in `activeReservist`/`inactiveReservist`) has a non-null `roleId` pointing at a seeded `OrbatRole` named `"Reservist"`.

- [ ] **Step 1: Seed-and-reuse the Reservist role on new reservist creation**

In `apps/web/app/api/admin/orbat/reservists/route.ts`, find the import block:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { RESERVIST_CATEGORY_IDS } from '@/lib/orbat/constants'
import { syncOrbatDiscordRoles } from '@/lib/orbat/discord'


async function auth() {
```

Replace with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { RESERVIST_CATEGORY_IDS } from '@/lib/orbat/constants'
import { syncOrbatDiscordRoles } from '@/lib/orbat/discord'

const RESERVIST_ROLE_NAME = 'Reservist'

// Lazily finds or creates the seeded "Reservist" OrbatRole — every reservist
// position gets this role's id, giving reservists a real, editable grant
// vehicle (Discord roles / TeamSpeak groups / permissions) via the Roles
// Manager, same as any other position. Unscoped (categories: []) since
// activeReservist/inactiveReservist aren't part of PLATOON_CATEGORY_IDS,
// the taxonomy OrbatRole.categories scopes against.
async function ensureReservistRole(): Promise<ObjectId> {
    const existing = await Db.orbatRoles.findOne({ name: RESERVIST_ROLE_NAME })
    if (existing) return existing._id

    const role: OrbatRole = {
        _id: new ObjectId(),
        name: RESERVIST_ROLE_NAME,
        categories: [],
        tag: null,
        discordRoleIds: [],
        tsGroupIds: [],
        permissions: [],
        parentRoleId: null,
        parentGroupId: null,
        createdAt: new Date(),
        createdBy: 'system',
        createdByName: 'System',
    }
    await Db.orbatRoles.insertOne(role)
    return role._id
}


async function auth() {
```

- [ ] **Step 2: Set `roleId` when creating a new reservist position**

In the same file, find:

```ts
        const last = await Db.orbatPositions
            .find({ category })
            .sort({ positionOrder: -1 })
            .limit(1)
            .toArray()
        const positionOrder = (last[0]?.positionOrder ?? -1) + 1

        const newPosition: OrbatPosition = {
            _id: new ObjectId(),
            category,
            sectionTitle: '',
            role: category === 'activeReservist' ? 'Active Reservist' : 'Inactive Reservist',
            roleId: null,
            userId,
            sectionOrder: 0,
            positionOrder,
        }
```

Replace with:

```ts
        const [last, reservistRoleId] = await Promise.all([
            Db.orbatPositions.find({ category }).sort({ positionOrder: -1 }).limit(1).toArray(),
            ensureReservistRole(),
        ])
        const positionOrder = (last[0]?.positionOrder ?? -1) + 1

        const newPosition: OrbatPosition = {
            _id: new ObjectId(),
            category,
            sectionTitle: '',
            role: category === 'activeReservist' ? 'Active Reservist' : 'Inactive Reservist',
            roleId: reservistRoleId,
            userId,
            sectionOrder: 0,
            positionOrder,
        }
```

- [ ] **Step 3: Write the migration script**

Create `scripts/migrate-reservist-role.mjs`:

```js
// One-off migration: seeds a system OrbatRole named "Reservist" (if it
// doesn't already exist — apps/web/app/api/admin/orbat/reservists/route.ts's
// ensureReservistRole() also lazily seeds it on the next reservist created,
// so this script and that code path can't race into duplicates), then sets
// roleId on every existing reservist position (category activeReservist/
// inactiveReservist) that's still null.
//
// Usage:
//   node --env-file=.env scripts/migrate-reservist-role.mjs            (dry run — reports only)
//   node --env-file=.env scripts/migrate-reservist-role.mjs --apply    (writes changes)

import { MongoClient, ObjectId } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const RESERVIST_CATEGORIES = ['activeReservist', 'inactiveReservist']

async function main() {
    if (!process.env.MONGO_URI || !process.env.MONGO_DB) {
        console.error('MONGO_URI and MONGO_DB must be set (run with --env-file=.env)')
        process.exit(1)
    }

    const client = new MongoClient(process.env.MONGO_URI)
    await client.connect()
    const db = client.db(process.env.MONGO_DB)
    const roles = db.collection('orbat_roles')
    const positions = db.collection('orbat_positions')

    let roleId = null
    const existing = await roles.findOne({ name: 'Reservist' })
    if (existing) {
        roleId = existing._id
        console.log(`[skip] "Reservist" role already exists (${roleId})`)
    } else {
        roleId = new ObjectId()
        console.log(`[create] "Reservist" role (${roleId})`)
        if (APPLY) {
            await roles.insertOne({
                _id: roleId,
                name: 'Reservist',
                categories: [],
                tag: null,
                discordRoleIds: [],
                tsGroupIds: [],
                permissions: [],
                parentRoleId: null,
                parentGroupId: null,
                createdAt: new Date(),
                createdBy: 'migration-script',
                createdByName: 'Migration Script',
            })
        }
    }

    const unlinked = await positions.find({ category: { $in: RESERVIST_CATEGORIES }, roleId: null }).toArray()
    console.log(`Reservist positions with no roleId: ${unlinked.length}`)
    for (const pos of unlinked) {
        console.log(`[backfill] position ${pos._id} (${pos.category}, user ${pos.userId ?? 'vacant'}) -> roleId ${roleId}`)
    }
    if (APPLY && unlinked.length > 0) {
        await positions.updateMany(
            { category: { $in: RESERVIST_CATEGORIES }, roleId: null },
            { $set: { roleId } },
        )
    }

    console.log('')
    if (!APPLY) {
        console.log('DRY RUN — no changes written. Re-run with --apply to write them.')
    } else {
        console.log('Done.')
    }

    await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 4: Dry-run it and read the report**

Run: `node --env-file=.env scripts/migrate-reservist-role.mjs` (from the repo root)
Expected: reports whether the Reservist role already exists or would be created, and lists every reservist position that would get backfilled. No errors.

- [ ] **Step 5: Update the doc map**

In `apps/web/docs/map/a-admin-api.md`, find the `POST/DELETE /api/admin/orbat/reservists` entry and update it to note that new reservist positions now get `roleId` set to a seeded `"Reservist"` `OrbatRole` (via `ensureReservistRole()`) instead of always `null`.

- [ ] **Step 6: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/admin/orbat/reservists/route.ts apps/web/docs/map/a-admin-api.md scripts/migrate-reservist-role.mjs
git commit -m "Give reservists a real, editable OrbatRole instead of roleId: null"
```

Do not run `--apply` as part of this task — that's a live production-data write the human operator runs deliberately after reviewing the dry-run report, same as every other migration script in this repo.

---

### Task 3: Migrate `pages.member` to `hasPermission()`

**Files:**
- Modify (35 files, see Steps 1-2 below for the complete list): every real call site of `PERMISSIONS.pages.member`.
- Create: `scripts/migrate-pages-member-permission.mjs`
- Modify: `apps/web/docs/map/README.md` (if it references `pages.member`'s gating mechanism anywhere — check during Step 4)

**Interfaces:**
- Consumes: `hasPermission(user, key)` from Task 1 (`apps/web/lib/orbat/hasPermission.ts`).

- [ ] **Step 1: Convert the 5 non-trivial call sites**

These five don't follow the simple single-line `if (!client.hasRoles(...)) return/redirect(...)` pattern — convert each exactly as shown.

**`apps/web/app/api/me/route.ts`** — find:

```ts
import { NextRequest, NextResponse } from "next/server"
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
```

Replace with:

```ts
import { NextRequest, NextResponse } from "next/server"
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
```

Then find:

```ts
        const isStaff = client.hasRoles(me, PERMISSIONS.pages.admin)
        const isMember = client.hasRoles(me, PERMISSIONS.pages.member)
```

Replace with:

```ts
        const isStaff = client.hasRoles(me, PERMISSIONS.pages.admin)
        const isMember = await hasPermission(me, 'pages.member')
```

**`apps/web/app/api/auth/collab/route.ts`** — find:

```ts
import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
```

Replace with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
```

Then find:

```ts
        const authorized = doc.startsWith('sop-')
            ? client.hasRoles(me, PERMISSIONS.pages.member)
            : doc.startsWith('ws-')
```

Replace with:

```ts
        const authorized = doc.startsWith('sop-')
            ? await hasPermission(me, 'pages.member')
            : doc.startsWith('ws-')
```

**`apps/web/app/api/admin/tasks/lockout-status/route.ts`** — find:

```ts
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { DEFAULT_LOCKOUT_GROUPS, type LockoutGroup } from '@/lib/lockout'

export async function GET() {
    let me: User
    try { me = await client.fetchMe() }
    catch { return NextResponse.json({ locked: false }) }

    if (!client.hasRoles(me, PERMISSIONS.pages.member)) {
        return NextResponse.json({ locked: false })
    }
```

Replace with:

```ts
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { DEFAULT_LOCKOUT_GROUPS, type LockoutGroup } from '@/lib/lockout'
import { hasPermission } from '@/lib/orbat/hasPermission'

export async function GET() {
    let me: User
    try { me = await client.fetchMe() }
    catch { return NextResponse.json({ locked: false }) }

    if (!(await hasPermission(me, 'pages.member'))) {
        return NextResponse.json({ locked: false })
    }
```

(`PERMISSIONS` import removed entirely here — `pages.member` was its only use in this file.)

**`apps/web/app/api/operations/intel-package/[operationId]/route.ts`** — find:

```ts
import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
```

Replace with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
```

Then find:

```ts
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const pkg = await Db.intelPackages.findOne({ operationId })
```

Replace with:

```ts
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasPermission(me, 'pages.member'))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const pkg = await Db.intelPackages.findOne({ operationId })
```

(`PERMISSIONS` import stays — the `PUT` handler in this same file uses `PERMISSIONS.pages.operationsEdit`, untouched.)

**`apps/web/app/api/training-videos/[id]/progress/route.ts`** — this file has TWO occurrences. Find the import block:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotificationForRole } from '@/lib/notifications'
```

Replace with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotificationForRole } from '@/lib/notifications'
import { hasPermission } from '@/lib/orbat/hasPermission'
```

Then find (GET handler):

```ts
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const progress = await Db.trainingVideoProgress.findOne({ userId: me.id, videoId: id })
    return NextResponse.json({ progress: progress ?? null })
}

export async function PUT(req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

Replace with:

```ts
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasPermission(me, 'pages.member'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const progress = await Db.trainingVideoProgress.findOne({ userId: me.id, videoId: id })
    return NextResponse.json({ progress: progress ?? null })
}

export async function PUT(req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasPermission(me, 'pages.member'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

(`PERMISSIONS` import stays — the `PATCH` handler in this file uses `PERMISSIONS.departmentLeads.j3` twice, untouched.)

- [ ] **Step 2: Convert the remaining 30 simple call sites**

Every one of these follows the exact same single-line pattern: replace the substring

```ts
client.hasRoles(me, PERMISSIONS.pages.member)
```

with

```ts
(await hasPermission(me, 'pages.member'))
```

on the single named line (keeping the surrounding `if (!...)  <action>` structure — e.g. `if (!client.hasRoles(me, PERMISSIONS.pages.member)) redirect('/me')` becomes `if (!(await hasPermission(me, 'pages.member'))) redirect('/me')`), and add the import `import { hasPermission } from '@/lib/orbat/hasPermission'` to each file (placed after the existing `import PERMISSIONS from '@/lib/permissions'` line where that import survives — see the removal list below — or after the `import client from '@/lib/discord'` line where it doesn't).

Files where `pages.member` is the **only** use of `PERMISSIONS` in the file — remove the now-unused `import PERMISSIONS from '@/lib/permissions'` line entirely:

- `apps/web/app/peer-review/[roundId]/page.tsx:12`
- `apps/web/app/operations/[id]/staff/page.tsx:18`
- `apps/web/app/api/training-videos/[id]/review/route.ts:20`
- `apps/web/app/dashboard/unit/training-hub/video/[id]/watch/page.tsx:23`
- `apps/web/app/api/training-videos/all/route.ts:11`
- `apps/web/app/api/training-docs/images/[filename]/route.ts:12`
- `apps/web/app/api/training/requests/[id]/interest/route.ts:11`

Files where `PERMISSIONS` is used for other keys too — keep the `PERMISSIONS` import, just convert the one `pages.member` line:

- `apps/web/app/api/training-videos/[id]/route.ts:19`
- `apps/web/app/dashboard/unit/training-hub/page.tsx:12`
- `apps/web/app/dashboard/unit/training-hub/guide/[id]/page.tsx:23`
- `apps/web/app/api/training-guides/[id]/route.ts:27`
- `apps/web/app/api/training-guides/route.ts:11`
- `apps/web/app/api/training-docs/[id]/route.ts:14`
- `apps/web/app/api/training-docs/route.ts:12`
- `apps/web/app/dashboard/unit/training-docs/[id]/page.tsx:14`
- `apps/web/app/dashboard/unit/sops/page.tsx:12`
- `apps/web/app/api/training/types/[id]/videos/route.ts:19`
- `apps/web/app/dashboard/unit/calendar/page.tsx:12`
- `apps/web/app/api/sops/route.ts:9`
- `apps/web/app/api/training/requests/route.ts:12`
- `apps/web/app/api/training/requests/route.ts:28` (same file, second occurrence — its own `POST` handler)
- `apps/web/app/api/training/events/route.ts:12`
- `apps/web/app/api/training/requests/[id]/route.ts:11`
- `apps/web/app/api/training/types/[id]/docs/route.ts:11`
- `apps/web/app/dashboard/unit/allstaff-calendar/page.tsx:12`
- `apps/web/app/api/training/types/route.ts:11`
- `apps/web/app/dashboard/layout.tsx:12`
- `apps/web/app/api/training/events/[id]/attendance/route.ts:33`
- `apps/web/app/dashboard/page.tsx:12`

(23 files listed here; combined with the 7 import-removal files and the 5 non-trivial files from Step 1, that's 35 — matching the spec's count. `apps/web/app/api/training/requests/route.ts` appears once in this list with two line numbers since both its `GET` and `POST` handlers need the same conversion.)

Concrete example of the transformation (`apps/web/app/dashboard/layout.tsx`, a page-level redirect, `PERMISSIONS` import kept since this file also uses `PERMISSIONS.pages.members`/`PERMISSIONS.departments.*` elsewhere) — find:

```ts
    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) redirect('/me')
```

Replace with:

```ts
    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!(await hasPermission(me, 'pages.member'))) redirect('/me')
```

And add `import { hasPermission } from '@/lib/orbat/hasPermission'` to its import block.

Concrete example of an import-removal file (`apps/web/app/api/training-videos/all/route.ts`) — find:

```ts
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

Replace with:

```ts
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasPermission(me, 'pages.member'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

(Every file's exact surrounding imports/lines were verified via `Read` before this plan was written — apply the same substitution pattern to each file in the two lists above using its own actual import block, which will look like one of the two examples shown.)

- [ ] **Step 3: Verify every occurrence was converted**

Run: `grep -rn "PERMISSIONS.pages.member)" apps/web/app apps/web/lib` (from repo root; note the trailing `)` in the search pattern — this deliberately excludes `PERMISSIONS.pages.members` (plural), which is untouched)
Expected: **zero matches**. If any remain, that file was missed — convert it using the same pattern before continuing.

- [ ] **Step 4: Write the migration script**

Create `scripts/migrate-pages-member-permission.mjs`:

```js
// One-off migration: grants 'pages.member' on all 7 departments' base
// DepartmentRoles and on the seeded "Reservist" OrbatRole (see
// scripts/migrate-reservist-role.mjs, which should be run — and --applied —
// before this script), so every current department member and every
// current reservist keeps dashboard access once app/dashboard/layout.tsx
// (and every other pages.member call site) starts checking hasPermission()
// instead of a raw Discord role.
//
// Also reports (does not attempt to fix) any active, non-discharged,
// non-skeleton user who is in no department AND holds no ORBAT position
// with a roleId — those users have no grant path to pages.member under
// the new check and need manual review before --apply.
//
// Usage:
//   node --env-file=.env scripts/migrate-pages-member-permission.mjs            (dry run — reports only)
//   node --env-file=.env scripts/migrate-pages-member-permission.mjs --apply    (writes changes)

import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const KEY = 'pages.member'

async function main() {
    if (!process.env.MONGO_URI || !process.env.MONGO_DB) {
        console.error('MONGO_URI and MONGO_DB must be set (run with --env-file=.env)')
        process.exit(1)
    }

    const client = new MongoClient(process.env.MONGO_URI)
    await client.connect()
    const db = client.db(process.env.MONGO_DB)
    const deptRoles = db.collection('department_roles')
    const orbatRoles = db.collection('orbat_roles')
    const users = db.collection('users')
    const positions = db.collection('orbat_positions')

    const baseRoles = await deptRoles.find({ isBase: true }).toArray()
    console.log(`Found ${baseRoles.length} department base roles.`)
    for (const role of baseRoles) {
        const already = (role.permissions ?? []).includes(KEY)
        console.log(`[${already ? 'skip' : 'grant'}] ${role.department} base role "${role.name}"`)
        if (APPLY && !already) {
            await deptRoles.updateOne({ _id: role._id }, { $addToSet: { permissions: KEY } })
        }
    }

    const reservistRole = await orbatRoles.findOne({ name: 'Reservist' })
    if (!reservistRole) {
        console.warn('WARNING: no "Reservist" OrbatRole found — run scripts/migrate-reservist-role.mjs --apply first.')
    } else {
        const already = (reservistRole.permissions ?? []).includes(KEY)
        console.log(`[${already ? 'skip' : 'grant'}] Reservist role`)
        if (APPLY && !already) {
            await orbatRoles.updateOne({ _id: reservistRole._id }, { $addToSet: { permissions: KEY } })
        }
    }

    // Report (never auto-fix) users with no grant path
    const activeUsers = await users
        .find({ isSkeletonAccount: { $ne: true }, discharged: { $exists: false } })
        .project({ id: 1, username: 1, departments: 1 })
        .toArray()
    const usersWithOrbatRole = new Set(
        (await positions.find({ roleId: { $ne: null } }).project({ userId: 1 }).toArray())
            .map(p => p.userId)
            .filter(Boolean),
    )

    const atRisk = activeUsers.filter(u => (u.departments ?? []).length === 0 && !usersWithOrbatRole.has(u.id))
    console.log('')
    console.log(`Active users with NO grant path to '${KEY}': ${atRisk.length}`)
    for (const u of atRisk) {
        console.log(`  - ${u.username ?? u.id} (id ${u.id}) — no department, no ORBAT position with a role`)
    }
    if (atRisk.length > 0) {
        console.log('Review the above before --apply — these users will lose dashboard access once pages.member call sites switch to hasPermission().')
    }

    console.log('')
    if (!APPLY) {
        console.log('DRY RUN — no changes written. Re-run with --apply to write them.')
    } else {
        console.log('Done.')
    }

    await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 5: Dry-run it and read the report**

Run: `node --env-file=.env scripts/migrate-pages-member-permission.mjs` (from the repo root — run `scripts/migrate-reservist-role.mjs` first in the same dry-run mode if you haven't, so this script's "Reservist role" check has something to find; neither script writes anything without `--apply`, so running both dry-run in either order is safe)
Expected: lists all 7 base roles as `[grant]` (first run), the Reservist role status, and any at-risk users. Read the at-risk list carefully — if it's non-empty, that's real information for the human operator, not a bug in the script.

- [ ] **Step 6: Update the doc map**

Check `apps/web/docs/map/README.md` and any `docs/map/*.md` entries that describe `pages.member`'s gating mechanism (search for `pages.member` across `docs/map/`) — update any that describe it as a Discord-role check to describe it as `hasPermission()`-based instead.

- [ ] **Step 7: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Migrate pages.member to hasPermission() across all 35 call sites"
```

(Use `git status` first to confirm exactly the expected 35 app files + the new migration script + any doc-map files are staged — nothing else.)

Do not run either migration script with `--apply` as part of this task — both are live production-data writes reserved for a deliberate human operator decision, after reviewing the dry-run reports from Steps 5 (this task) and Task 2 Step 4.

---

## After this plan

Once Task 3 is complete, `pages.member` is fully migrated (mechanism, call sites, and dry-run-verified migration scripts) but **not yet applied** to the live database — running both scripts with `--apply` is a deliberate operator action outside this plan's scope, same as every other migration script in this repo this session. Proceed to the final whole-branch review per the subagent-driven-development skill. Phase 2 (the remaining ~65 permission keys, migrated category by category) and Phase 3 (removing `PERMISSIONS`/the `J4-Administration` hardcode) are separate future specs, not part of this plan.
