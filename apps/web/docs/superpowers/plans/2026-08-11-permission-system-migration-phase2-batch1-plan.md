# Permission System Migration — Phase 2, Batch 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 6 permission keys in `uploads`, `auth`, `optionals`, `gallery`, `intel` (12 real call sites) from `client.hasRoles(me, PERMISSIONS.x.y)` to `await hasPermission(me, 'x.y')`, applying the rule that `HQ Staff`/`All Staff` never carry forward as a grant path.

**Architecture:** `hasPermission()` (already rewritten in Phase 1) needs no changes — this plan is purely call-site conversion plus a migration script. Each of the 12 call sites is converted in place; `PERMISSIONS` imports are removed from files where these keys were the only use. A single dry-run migration script grants each of the 6 keys on one department base role (per the mapping below), so current legitimate holders don't lose access once this ships and `--apply` is later run by a human operator.

**Tech Stack:** Next.js 15 App Router, MongoDB, TypeScript (4-space indent, single quotes, no semicolons — existing repo style).

## Global Constraints

- No test suite exists in this repo. Verification is `npx tsc --noEmit -p tsconfig.json` (run from `apps/web`) plus manual code tracing.
- `HQ Staff` and `All Staff` never carry forward as a grant path for any key — established in Phase 1 and reaffirmed for this batch. Only the other listed role(s) (which map to real departments) determine the new grant.
- Migration script is Mongo-only (no Discord/TeamSpeak calls — none of these 6 keys' migration touches `discordRoleIds`/`tsGroupIds`), dry-run by default, `--apply` flag required to write, following `scripts/migrate-pages-member-permission.mjs`'s established shape.
- `PERMISSIONS.ai.use` (a different key, not part of this batch) appears in `app/api/ai/images/route.ts` and `app/api/ai/images/[id]/file/route.ts` alongside `PERMISSIONS.intel.viewAllImages` — leave every `ai.use` reference completely untouched.
- This plan converts ONLY the 6 keys below — no other `PERMISSIONS.*` key, and not `PERMISSIONS`/`hasRoles()`/the `J4-Administration` hardcode themselves (still depended on by ~270+ other, not-yet-migrated call sites).
- Code style: 4-space indent, single quotes, no semicolons, matching every existing file touched.
- Whenever a task adds or meaningfully changes a route/lib file, update the relevant `docs/map/*.md` file(s) in the same task.

---

### Task 1: Convert all 12 call sites

**Files:**
- Modify: `apps/web/app/optionals/manage/route.ts`
- Modify: `apps/web/app/optionals/me/route.ts`
- Modify: `apps/web/app/api/gallery/admin/folder/route.ts`
- Modify: `apps/web/app/api/gallery/admin/featured/route.ts`
- Modify: `apps/web/app/api/gallery/admin/images/route.ts`
- Modify: `apps/web/app/api/gallery/admin/reorder/route.ts`
- Modify: `apps/web/app/api/auth/collab/route.ts`
- Modify: `apps/web/app/api/ai/intel/generate/route.ts`
- Modify: `apps/web/app/api/ai/images/save-crop/route.ts`
- Modify: `apps/web/app/api/ai/images/route.ts`
- Modify: `apps/web/app/api/ai/images/[id]/file/route.ts`
- Modify: `apps/web/app/api/uploads/bio/route.ts`
- Modify: `apps/web/docs/map/*.md` (wherever these routes are documented — see Step 2)

**Interfaces:**
- Consumes: `hasPermission(user: User, key: string): Promise<boolean>` from `apps/web/lib/orbat/hasPermission.ts` (unchanged since Phase 1).

- [ ] **Step 1: Convert each file**

**`apps/web/app/optionals/manage/route.ts`** — `PERMISSIONS.optionals.manage` is this file's only use of `PERMISSIONS`. Find:

```ts
import { NextRequest, NextResponse } from "next/server"

import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
```

Replace with:

```ts
import { NextRequest, NextResponse } from "next/server"

import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
```

Then find:

```ts
    if (!client.hasRoles(me, PERMISSIONS.optionals.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

Replace with:

```ts
    if (!(await hasPermission(me, 'optionals.manage'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

**`apps/web/app/optionals/me/route.ts`** — `PERMISSIONS.optionals.manage` is this file's only use of `PERMISSIONS`. Find:

```ts
import { NextRequest, NextResponse } from "next/server"

import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
```

Replace with:

```ts
import { NextRequest, NextResponse } from "next/server"

import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
```

Then find:

```ts
            const isAdmin = client.hasRoles(me, PERMISSIONS.optionals.manage)
```

Replace with:

```ts
            const isAdmin = await hasPermission(me, 'optionals.manage')
```

**`apps/web/app/api/gallery/admin/folder/route.ts`** — `PERMISSIONS.gallery.manage` is this file's only use of `PERMISSIONS`. Find:

```ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
```

Replace with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
```

Then find:

```ts
async function checkAuth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!client.hasRoles(me, PERMISSIONS.gallery.manage)) return null
    return me
}
```

Replace with:

```ts
async function checkAuth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!(await hasPermission(me, 'gallery.manage'))) return null
    return me
}
```

**`apps/web/app/api/gallery/admin/featured/route.ts`** — `PERMISSIONS.gallery.manage` is this file's only use of `PERMISSIONS`. Find:

```ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
```

Replace with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
```

Then find:

```ts
async function checkAuth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return false
    return client.hasRoles(me, PERMISSIONS.gallery.manage)
}
```

Replace with:

```ts
async function checkAuth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return false
    return await hasPermission(me, 'gallery.manage')
}
```

**`apps/web/app/api/gallery/admin/images/route.ts`** — `PERMISSIONS.gallery.manage` is this file's only use of `PERMISSIONS`. Find:

```ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
```

Replace with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
```

Then find:

```ts
async function checkAuth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return false
    return client.hasRoles(me, PERMISSIONS.gallery.manage)
}
```

Replace with:

```ts
async function checkAuth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return false
    return await hasPermission(me, 'gallery.manage')
}
```

**`apps/web/app/api/gallery/admin/reorder/route.ts`** — `PERMISSIONS.gallery.manage` is this file's only use of `PERMISSIONS`. Find:

```ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
```

Replace with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
```

Then find:

```ts
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.gallery.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
```

Replace with:

```ts
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasPermission(me, 'gallery.manage'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
```

**`apps/web/app/api/auth/collab/route.ts`** — `PERMISSIONS` is still used elsewhere in this file (`departments.j2`, `departmentLeads.j2`, `pages.admin`, `training.manage`) — keep the import. `hasPermission` is already imported (Phase 1 converted the `sop-*` branch in this same file). Find:

```ts
        const authorized = doc.startsWith('sop-')
            ? await hasPermission(me, 'pages.member')
            : doc.startsWith('ws-')
                ? client.hasRoles(me, PERMISSIONS.departments.j2) || client.hasRoles(me, PERMISSIONS.departmentLeads.j2) || client.hasRoles(me, PERMISSIONS.pages.admin)
                : doc.startsWith('cfb-')
                    ? client.hasRoles(me, PERMISSIONS.training.manage)
                    : client.hasRoles(me, PERMISSIONS.auth.collab)
```

Replace with:

```ts
        const authorized = doc.startsWith('sop-')
            ? await hasPermission(me, 'pages.member')
            : doc.startsWith('ws-')
                ? client.hasRoles(me, PERMISSIONS.departments.j2) || client.hasRoles(me, PERMISSIONS.departmentLeads.j2) || client.hasRoles(me, PERMISSIONS.pages.admin)
                : doc.startsWith('cfb-')
                    ? client.hasRoles(me, PERMISSIONS.training.manage)
                    : await hasPermission(me, 'auth.collab')
```

**`apps/web/app/api/ai/intel/generate/route.ts`** — `PERMISSIONS.intel.generateImages` is this file's only use of `PERMISSIONS`. Find:

```ts
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { callImageGenerate, callImageEdit } from '@/lib/ai/service'
```

Replace with:

```ts
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { callImageGenerate, callImageEdit } from '@/lib/ai/service'
```

Then find:

```ts
        if (!client.hasRoles(me, PERMISSIONS.intel.generateImages)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
```

Replace with:

```ts
        if (!(await hasPermission(me, 'intel.generateImages'))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
```

**`apps/web/app/api/ai/images/save-crop/route.ts`** — `PERMISSIONS.intel.generateImages` is this file's only use of `PERMISSIONS`. Find:

```ts
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
```

Replace with:

```ts
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import Db from '@/lib/mongo'
```

Then find:

```ts
        if (!client.hasRoles(me, PERMISSIONS.intel.generateImages)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
```

Replace with:

```ts
        if (!(await hasPermission(me, 'intel.generateImages'))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
```

**`apps/web/app/api/ai/images/route.ts`** — `PERMISSIONS` is also used here for `ai.use` (a different key, untouched) — keep the import. Find:

```ts
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
```

Replace with:

```ts
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
```

Then find:

```ts
        const canViewAll = client.hasRoles(me, PERMISSIONS.intel.viewAllImages)
```

Replace with:

```ts
        const canViewAll = await hasPermission(me, 'intel.viewAllImages')
```

(Leave `if (!client.hasRoles(me, PERMISSIONS.ai.use)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })` on the line above completely untouched — different key, not part of this batch.)

**`apps/web/app/api/ai/images/[id]/file/route.ts`** — `PERMISSIONS` is also used here for `ai.use` (a different key, untouched) — keep the import. Find:

```ts
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
```

Replace with:

```ts
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
```

Then find:

```ts
        // Only owner or J2/J4 can view
        const canViewAll = client.hasRoles(me, PERMISSIONS.intel.viewAllImages)
```

Replace with:

```ts
        // Only owner or J2/J4 can view
        const canViewAll = await hasPermission(me, 'intel.viewAllImages')
```

(Leave `if (!client.hasRoles(me, PERMISSIONS.ai.use)) return new Response('Forbidden', { status: 403 })` above this completely untouched — different key.)

**`apps/web/app/api/uploads/bio/route.ts`** — `PERMISSIONS.uploads.bio` is this file's only use of `PERMISSIONS`. Find:

```ts
import { NextRequest, NextResponse } from "next/server"
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

import fs from 'fs'
```

Replace with:

```ts
import { NextRequest, NextResponse } from "next/server"
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

import fs from 'fs'
```

Then find:

```ts
    if (!client.hasRoles(me, PERMISSIONS.uploads.bio)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

Replace with:

```ts
    if (!(await hasPermission(me, 'uploads.bio'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

- [ ] **Step 2: Verify every occurrence was converted**

Run: `grep -rln "PERMISSIONS.uploads.bio\|PERMISSIONS.auth.collab\|PERMISSIONS.optionals.manage\|PERMISSIONS.gallery.manage\|PERMISSIONS.intel.generateImages\|PERMISSIONS.intel.viewAllImages" apps/web/app apps/web/lib` (from repo root)
Expected: **zero matches**. If any file is listed, that occurrence was missed — convert it using the same pattern shown above before continuing. (`PERMISSIONS.ai.use` will still show up in searches for `PERMISSIONS.ai.` if you run a broader grep — that's expected and correct, it's a different key not part of this batch.)

- [ ] **Step 3: Update the doc map**

Search `apps/web/docs/map/*.md` for each of the 12 files touched (`app/optionals/manage/route.ts`, `app/optionals/me/route.ts`, `app/api/gallery/admin/*`, `app/api/auth/collab/route.ts`, `app/api/ai/intel/generate/route.ts`, `app/api/ai/images/*`, `app/api/uploads/bio/route.ts`) and update any entry that describes its gate as `PERMISSIONS.x.y`/`client.hasRoles()` for one of this batch's 6 keys to instead describe it as `hasPermission(user, 'x.y')`.

- [ ] **Step 4: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Migrate uploads/auth/optionals/gallery/intel permissions to hasPermission()"
```

(Use `git status` first to confirm exactly the 12 app files + doc-map edits are staged — nothing else.)

---

### Task 2: Migration script

**Files:**
- Create: `scripts/migrate-batch1-permissions.mjs`

**Interfaces:**
- Consumes: none (standalone script, Mongo driver only).

- [ ] **Step 1: Write the migration script**

Create `scripts/migrate-batch1-permissions.mjs`:

```js
// One-off migration: grants Phase 2 Batch 1's 6 permission keys on one
// department base DepartmentRole each, per the design spec's mapping
// (docs/superpowers/specs/2026-08-11-permission-system-migration-phase2-batch1-design.md).
// HQ Staff/All Staff never carry forward as a grant path — these are the
// replacement grants for the *other* role each key used to also accept
// (or, for uploads.bio, a fresh decision since HQ Staff was the only role
// listed).
//
// Usage:
//   node --env-file=.env scripts/migrate-batch1-permissions.mjs            (dry run — reports only)
//   node --env-file=.env scripts/migrate-batch1-permissions.mjs --apply    (writes changes)

import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')

// key -> department whose base DepartmentRole should be granted this key
const GRANTS = {
    'optionals.manage': 'j4',
    'gallery.manage': 'j5',
    'auth.collab': 'j2',
    'intel.generateImages': 'j2',
    'intel.viewAllImages': 'j2',
    'uploads.bio': 'j4',
}

async function main() {
    if (!process.env.MONGO_URI || !process.env.MONGO_DB) {
        console.error('MONGO_URI and MONGO_DB must be set (run with --env-file=.env)')
        process.exit(1)
    }

    const client = new MongoClient(process.env.MONGO_URI)
    await client.connect()
    const db = client.db(process.env.MONGO_DB)
    const deptRoles = db.collection('department_roles')

    for (const [key, department] of Object.entries(GRANTS)) {
        const role = await deptRoles.findOne({ department, isBase: true })
        if (!role) {
            console.warn(`WARNING: no base role found for department "${department}" (key "${key}") — skipping`)
            continue
        }
        const already = (role.permissions ?? []).includes(key)
        console.log(`[${already ? 'skip' : 'grant'}] ${key} -> ${department} base role ("${role.name}")`)
        if (APPLY && !already) {
            await deptRoles.updateOne({ _id: role._id }, { $addToSet: { permissions: key } })
        }
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

- [ ] **Step 2: Dry-run it and read the report**

Run: `node --env-file=.env scripts/migrate-batch1-permissions.mjs` (from the repo root)
Expected: reports `[grant]` for all 6 key→department pairs (none of these 6 keys exist on any base role's `permissions` array yet), no errors, no warnings (all 7 department base roles already exist from Phase 1's own migration work).

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-batch1-permissions.mjs
git commit -m "Add migration script for Phase 2 batch 1 permission grants"
```

Do not run `--apply` as part of this task — reserved for a deliberate human operator decision, same as every other migration script this session.

---

## After this plan

Once Task 2 is complete, all 6 keys in this batch are fully migrated (mechanism reused from Phase 1, 12 call sites converted, dry-run-verified migration script ready) but **not yet applied** to the live database. Proceed to the final whole-branch review per the subagent-driven-development skill. The next Phase 2 batch (category TBD) is a separate future plan.
