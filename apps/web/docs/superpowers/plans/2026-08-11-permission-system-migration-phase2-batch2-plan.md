# Permission System Migration — Phase 2, Batch 2: Department Leadership — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every `departmentLeads.j1`–`j7`, `quiz.*`, and `meetings.lockJ1`–`lockJ7` call site from `client.hasRoles(me, PERMISSIONS.x.y)` to `await hasPermission(me, 'x.y')`, and migrate the underlying grants onto each department's leadership-slot `DepartmentRole`s (plus a J4 blanket grant), per the approved design at `docs/superpowers/specs/2026-08-11-permission-system-migration-phase2-batch2-design.md`.

**Architecture:** No new architecture — `hasPermission()` (`lib/orbat/hasPermission.ts`) and the `DepartmentRole.linkedSlot` mechanism already exist from earlier session work. This plan is a mechanical, file-by-file conversion of call sites, plus a migration script that grants the batch's keys on each department's `leader`/`2ic`/`3ic` slot-linked roles (all three, matching the old 3-Discord-role OR semantics) and on J4's base role (blanket grant, since `hasPermission()` has no hardcoded J4 bypass).

**Tech Stack:** Next.js 15 App Router (TypeScript), MongoDB via `Db` singleton, no test suite — verification is `npx tsc --noEmit -p tsconfig.json` (run from `apps/web`) plus `npm run build`.

## Global Constraints

- Never touch `PERMISSIONS`, `hasRoles()`, or the `J4-Administration` hardcode — Phase 3 territory.
- Every call site that is a genuine permission **gate** (an authorization check) converts. Every call site that merely reads `PERMISSIONS.departmentLeads.jX` as a **raw array of Discord role names** (fed into `createNotificationForRole()`, a `Db.users.find({'guild.roles': {$in: ...}})` query, or a `Task.assignedRole` string field) stays untouched — these are notification/lookup mechanics, not authorization, and `hasPermission()` has no equivalent "give me role names" API.
- When a file's only use of `PERMISSIONS` was the migrated key, remove the `import PERMISSIONS from '@/lib/permissions'` line. When other keys in the same file still need it, keep the import.
- Add `import { hasPermission } from '@/lib/orbat/hasPermission'` to every file gaining a `hasPermission()` call (skip if already imported).
- After every task, update `lib/permissions.ts`'s JSDoc for the key(s) touched in that task, following the exact pattern already used for `pages.member`/Batch 1's six keys (see Task 1, Step 2, for the pattern to copy).
- No test suite exists. Verify each task with `npx tsc --noEmit -p tsconfig.json` (from `apps/web`) after every file change, and a full `npm run build` at the end of the plan.

---

### Task 1: Migration Script + JSDoc Updates

**Files:**
- Create: `scripts/migrate-batch2-permissions.mjs` (repo root, sibling to `scripts/migrate-batch1-permissions.mjs`)
- Modify: `apps/web/lib/permissions.ts:521-590` (`departmentLeads`), `apps/web/lib/permissions.ts:610-618` (`meetings`), `apps/web/lib/permissions.ts:622-639` (`quiz`)

**Interfaces:**
- Consumes: `Db.departmentRoles` (fields: `department`, `isBase`, `linkedSlot`, `permissions`), same shape used by `scripts/migrate-pages-member-permission.mjs` and `scripts/migrate-batch1-permissions.mjs`.
- Produces: nothing consumed by later tasks — later tasks convert call sites independent of whether the migration has been `--apply`'d (dry-run is the norm this session; conversions are correct either way since `hasPermission()` just returns `false` until grants exist).

- [ ] **Step 1: Write the migration script**

Follow `scripts/migrate-batch1-permissions.mjs`'s exact shape (Mongo connection via `MONGO_URI`/`MONGO_DB` env vars, dry-run by default, `--apply` flag, summary printout). Read that file first to match its connection boilerplate exactly — do not reinvent it.

```js
#!/usr/bin/env node
// One-off migration: grant departmentLeads.j1-j7, quiz.assign/review/reviewEscalated,
// and meetings.lockJ1-lockJ7 on each department's leadership-slot DepartmentRoles,
// plus a J4 blanket grant on all of them.
//
// Dry-run by default. Pass --apply to write changes.

import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const MONGO_URI = process.env.MONGO_URI
const MONGO_DB = process.env.MONGO_DB

if (!MONGO_URI || !MONGO_DB) {
    console.error('MONGO_URI and MONGO_DB env vars are required.')
    process.exit(1)
}

const DEPARTMENTS = ['j1', 'j2', 'j3', 'j5', 'j6', 'j7']

/** Keys granted on every department's leadership slots (leader/2ic/3ic). */
function keysForDept(dept) {
    const keys = [`departmentLeads.${dept}`, `meetings.lockJ${dept.slice(1)}`]
    if (dept === 'j3') keys.push('quiz.assign', 'quiz.review', 'quiz.reviewEscalated')
    return keys
}

/** Every key this batch touches, for the J4 blanket grant. */
const ALL_KEYS = [
    ...DEPARTMENTS.flatMap(keysForDept),
    'departmentLeads.j4', 'meetings.lockJ4',
]

async function main() {
    const client = new MongoClient(MONGO_URI)
    await client.connect()
    const db = client.db(MONGO_DB)
    const departmentRoles = db.collection('department_roles')

    console.log(APPLY ? 'APPLY MODE — writing changes' : 'DRY RUN — no changes will be written (pass --apply to write)')
    console.log('')

    const updates = [] // { roleId, roleName, department, slot, keys }

    for (const dept of DEPARTMENTS) {
        const keys = keysForDept(dept)
        for (const slot of ['leader', '2ic', '3ic']) {
            const role = await departmentRoles.findOne({ department: dept, linkedSlot: slot })
            if (!role) {
                console.warn(`  [WARN] ${dept}/${slot}: no DepartmentRole has this slot linked yet — skipped. Link it via the Department Roles editor, then re-run this script.`)
                continue
            }
            updates.push({ roleId: role._id, roleName: role.name, department: dept, slot, keys })
        }
    }

    const j4Base = await departmentRoles.findOne({ department: 'j4', isBase: true })
    if (!j4Base) {
        console.error('  [ERROR] No J4 base DepartmentRole found — cannot apply the J4 blanket grant. Aborting.')
        await client.close()
        process.exit(1)
    }
    updates.push({ roleId: j4Base._id, roleName: j4Base.name, department: 'j4', slot: 'base', keys: ALL_KEYS })

    console.log(`Found ${updates.length} role(s) to update:`)
    for (const u of updates) {
        console.log(`  - ${u.department}/${u.slot} ("${u.roleName}"): +[${u.keys.join(', ')}]`)
    }
    console.log('')

    if (!APPLY) {
        console.log('Dry run complete. Re-run with --apply to write these changes.')
        await client.close()
        return
    }

    for (const u of updates) {
        await departmentRoles.updateOne(
            { _id: u.roleId },
            { $addToSet: { permissions: { $each: u.keys } } }
        )
    }
    console.log(`Applied ${updates.length} update(s).`)
    await client.close()
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
```

- [ ] **Step 2: Run the dry-run to verify output**

Run: `node scripts/migrate-batch2-permissions.mjs` (from repo root, with `MONGO_URI`/`MONGO_DB` set — check `.env` or `apps/web/.env` for values, same as every prior migration script this session).
Expected: prints a list of role updates (or `[WARN]` lines for unlinked slots) and "Dry run complete." Do **not** pass `--apply` — every migration script this session has stayed dry-run-only; leave the `--apply` decision to the human operator.

- [ ] **Step 3: Update `lib/permissions.ts` JSDoc for every key this batch touches**

Follow the exact pattern already used for `pages.member` (`lib/permissions.ts:40-42`) and Batch 1's six keys (e.g. `lib/permissions.ts:453-455` for `gallery.manage`): insert a paragraph right after the key's existing description, before its closing `*/`, of the form:

```
         * As of the permission-system migration, the real gate for this key
         * is `await hasPermission(user, 'KEY')` (`lib/orbat/hasPermission.ts`)
         * — granted via department/ORBAT-role holding — NOT this Discord-role array.
```

Apply this to all 11 keys in this batch: `departmentLeads.j1`, `departmentLeads.j2`, `departmentLeads.j3`, `departmentLeads.j4`, `departmentLeads.j5`, `departmentLeads.j6`, `departmentLeads.j7`, `quiz.assign`, `quiz.review`, `quiz.reviewEscalated`. `meetings.lockJ1`–`lockJ7` have no JSDoc comments today (`lib/permissions.ts:610-618` is a flat object with no per-key doc blocks) — add a single block comment above the `meetings: {` line instead:

```ts
    /**
     * As of the permission-system migration, the real gate for every lockJX
     * key below is `await hasPermission(user, 'meetings.lockJX')`
     * (`lib/orbat/hasPermission.ts`) — granted via department/ORBAT-role
     * holding — NOT these Discord-role arrays.
     */
    meetings: {
```

For `departmentLeads.j4` specifically (currently a one-line comment block explaining why the key exists at all, `lib/permissions.ts:549-559`), append the same three-line note before its closing `*/`, after the existing explanation.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json` (from `apps/web`)
Expected: no new errors (JSDoc-only changes; the script lives outside `apps/web`'s TS project and isn't type-checked by this command).

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-batch2-permissions.mjs apps/web/lib/permissions.ts
git commit -m "Add Batch 2 permission migration script and JSDoc notes"
```

---

### Task 2: `departmentLeads.j1` (8 files)

**Files:**
- Modify: `apps/web/app/api/admin/j1/applications/[id]/route.ts:177`
- Modify: `apps/web/app/api/admin/j1/recruit-video/route.ts:48`
- Modify: `apps/web/app/api/admin/j1/recruit-video/upload/route.ts:24-26`
- Modify: `apps/web/app/api/admin/j1/tfar-plugin/route.ts`
- Modify: `apps/web/app/api/admin/retired/import/route.ts:134,187`
- Modify: `apps/web/app/dashboard/j1/page.tsx:15`
- Modify: `apps/web/app/dashboard/layout.tsx:21`
- Modify: `apps/web/app/dashboard/page.tsx` (same line/shape as `layout.tsx:21`)

**Interfaces:**
- Consumes: `hasPermission(user: User, key: string): Promise<boolean>` from `@/lib/orbat/hasPermission`.

- [ ] **Step 1: `app/api/admin/j1/applications/[id]/route.ts`**

Line 177 is a boolean assignment feeding many downstream branches (lines 256, 309, 370, 375, 382, 388, 413, 637) — only this one line changes; the file's other `PERMISSIONS.departments.j1`/`.j4` uses stay untouched, so the `PERMISSIONS` import stays.

Before:
```ts
    const isJ1Lead = client.hasRoles(me, PERMISSIONS.departmentLeads.j1)
```
After:
```ts
    const isJ1Lead = await hasPermission(me, 'departmentLeads.j1')
```
Add `import { hasPermission } from '@/lib/orbat/hasPermission'` near the top with the other imports.

- [ ] **Step 2: `app/api/admin/j1/recruit-video/route.ts`**

PUT handler, line 48. GET handler's `departments.j1`/`departments.j4` uses stay untouched; `PERMISSIONS` import stays.

Before:
```ts
    if (!me || !client.hasRoles(me, PERMISSIONS.departmentLeads.j1)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```
After:
```ts
    if (!me || !(await hasPermission(me, 'departmentLeads.j1'))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```
Add the `hasPermission` import.

- [ ] **Step 3: `app/api/admin/j1/recruit-video/upload/route.ts`**

Lines 24-26, the file's only `PERMISSIONS` use — remove the `PERMISSIONS` import entirely.

Before:
```ts
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
```
```ts
export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.departmentLeads.j1)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```
After:
```ts
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
```
```ts
export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !(await hasPermission(me, 'departmentLeads.j1'))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```

- [ ] **Step 4: `app/api/admin/j1/tfar-plugin/route.ts`**

Read the file first to find its `requireLead()` helper (or equivalent name) containing:
```ts
        const isLead = client.hasRoles(me, PERMISSIONS.departmentLeads.j1)
        const isJ4 = client.hasRoles(me, PERMISSIONS.pages.admin)
        if (!isLead && !isJ4) return null
```
Convert only the `isLead` line:
```ts
        const isLead = await hasPermission(me, 'departmentLeads.j1')
        const isJ4 = client.hasRoles(me, PERMISSIONS.pages.admin)
        if (!isLead && !isJ4) return null
```
`pages.admin` stays untouched (different category) — `PERMISSIONS` import stays. Add `hasPermission` import.

- [ ] **Step 5: `app/api/admin/retired/import/route.ts`**

Two occurrences — PATCH handler (line 134) and POST handler (line 187) — both identical:
```ts
    const isJ1Lead = client.hasRoles(me, PERMISSIONS.departmentLeads.j1)
```
Convert both to:
```ts
    const isJ1Lead = await hasPermission(me, 'departmentLeads.j1')
```
`departments.j4` is used in both places too — stays untouched, `PERMISSIONS` import stays. Add `hasPermission` import.

- [ ] **Step 6: `app/dashboard/j1/page.tsx`**

Line 15:
```ts
    const canManageMembers = client.hasRoles(me, PERMISSIONS.departmentLeads.j1)
```
After:
```ts
    const canManageMembers = await hasPermission(me, 'departmentLeads.j1')
```
`departments.j1`/`departments.j4` stay untouched, `PERMISSIONS` import stays. Add `hasPermission` import. This is a server component (`async function Page()`), so `await` is valid directly.

- [ ] **Step 7: `app/dashboard/layout.tsx`**

`hasPermission` is already imported here (Phase 1's `pages.member` conversion). Line 21, inside a larger object literal — only the `departmentLeads.j1` half of this line converts, the `pages.admin` half and every other sibling field (`canSeeJ1`–`J7`, `canSeeOrbat`, `canSeePersonnel`, etc.) stay untouched:

Before:
```ts
        canManageJ1: client.hasRoles(me, PERMISSIONS.departmentLeads.j1) || client.hasRoles(me, PERMISSIONS.pages.admin),
```
After:
```ts
        canManageJ1: (await hasPermission(me, 'departmentLeads.j1')) || client.hasRoles(me, PERMISSIONS.pages.admin),
```

- [ ] **Step 8: `app/dashboard/page.tsx`**

Identical structure and line to `dashboard/layout.tsx` — read the file first to confirm the exact surrounding object literal (it duplicates `layout.tsx`'s `canManageJ1` field), then apply the same conversion. `hasPermission` is already imported here too (same Phase 1 precedent).

- [ ] **Step 9: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json` (from `apps/web`)
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/api/admin/j1 apps/web/app/api/admin/retired/import/route.ts apps/web/app/dashboard/j1/page.tsx apps/web/app/dashboard/layout.tsx apps/web/app/dashboard/page.tsx
git commit -m "Migrate departmentLeads.j1 call sites to hasPermission()"
```

---

### Task 3: `departmentLeads.j2` — Workspace & Admin cluster (11 files)

**Files:**
- Modify: `apps/web/app/api/j2/workspace/members/route.ts:15-17`
- Modify: `apps/web/app/api/j2/workspace/files/route.ts:20-22,113`
- Modify: `apps/web/app/api/j2/workspace/files/[id]/download/route.ts:17-19`
- Modify: `apps/web/app/api/j2/workspace/docs/route.ts:10-12`
- Modify: `apps/web/app/api/j2/workspace/docs/[id]/route.ts:11-13,70`
- Modify: `apps/web/app/api/j2/workspace/docs/[id]/versions/route.ts:13-15`
- Modify: `apps/web/app/api/j2/workspace/docs/[id]/versions/[versionId]/restore/route.ts:11-13`
- Modify: `apps/web/app/api/j2/workspace/activity/route.ts:20-22`
- Modify: `apps/web/app/api/j2/dev-checks/route.ts:53-65`
- Modify: `apps/web/app/api/j2/dev-checks/[opId]/[checkId]/route.ts:15-18`
- Modify: `apps/web/app/api/admin/era-options/route.ts:34,55,72`

**Interfaces:**
- Consumes: `hasPermission(user: User, key: string): Promise<boolean>` from `@/lib/orbat/hasPermission`.

All eight `j2/workspace/*` files share one of two near-identical helper shapes — a `requireJ2()` function returning `User | null`, or an inline `const ok = ...` block — both OR-ing `departments.j2`, `departmentLeads.j2`, and `pages.admin`. Only the `departmentLeads.j2` term converts in each; `departments.j2` and `pages.admin` are different, not-yet-migrated categories and stay untouched. `PERMISSIONS` import stays in every one of these files (still needed for the other two terms).

- [ ] **Step 1: `app/api/j2/workspace/members/route.ts`**

Before:
```ts
    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || client.hasRoles(me, PERMISSIONS.departmentLeads.j2)
        || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
After:
```ts
    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || (await hasPermission(me, 'departmentLeads.j2'))
        || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
Add `import { hasPermission } from '@/lib/orbat/hasPermission'`.

- [ ] **Step 2: `app/api/j2/workspace/files/route.ts`**

Two sites. The `requireJ2()` helper (lines 17-25):
```ts
async function requireJ2() {
    let me: User
    try { me = await client.fetchMe() } catch { return null }
    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || client.hasRoles(me, PERMISSIONS.departmentLeads.j2)
        || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!ok) return null
    return me
}
```
becomes:
```ts
async function requireJ2() {
    let me: User
    try { me = await client.fetchMe() } catch { return null }
    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || (await hasPermission(me, 'departmentLeads.j2'))
        || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!ok) return null
    return me
}
```
And in the DELETE handler (line 113):
```ts
    const isLead = client.hasRoles(me, PERMISSIONS.departmentLeads.j2) || client.hasRoles(me, PERMISSIONS.pages.admin)
```
becomes:
```ts
    const isLead = (await hasPermission(me, 'departmentLeads.j2')) || client.hasRoles(me, PERMISSIONS.pages.admin)
```
Add the `hasPermission` import.

- [ ] **Step 3: `app/api/j2/workspace/files/[id]/download/route.ts`**

Before:
```ts
    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || client.hasRoles(me, PERMISSIONS.departmentLeads.j2)
        || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
After (same substitution as Step 1). Add the `hasPermission` import.

- [ ] **Step 4: `app/api/j2/workspace/docs/route.ts`**

`requireJ2()` helper, same shape as Step 2's — apply the same substitution. Add the `hasPermission` import.

- [ ] **Step 5: `app/api/j2/workspace/docs/[id]/route.ts`**

Two sites: `requireJ2()` helper (same substitution as Step 2), and the DELETE handler's `isLead` line (line 70, same substitution as Step 2's second site):
```ts
    const isLead = client.hasRoles(me, PERMISSIONS.departmentLeads.j2) || client.hasRoles(me, PERMISSIONS.pages.admin)
```
→
```ts
    const isLead = (await hasPermission(me, 'departmentLeads.j2')) || client.hasRoles(me, PERMISSIONS.pages.admin)
```
Add the `hasPermission` import.

- [ ] **Step 6: `app/api/j2/workspace/docs/[id]/versions/route.ts`**

`requireJ2()` helper, same shape/substitution as Step 2. Add the `hasPermission` import.

- [ ] **Step 7: `app/api/j2/workspace/docs/[id]/versions/[versionId]/restore/route.ts`**

`requireJ2()` helper, same shape/substitution as Step 2. Add the `hasPermission` import.

- [ ] **Step 8: `app/api/j2/workspace/activity/route.ts`**

Before:
```ts
    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || client.hasRoles(me, PERMISSIONS.departmentLeads.j2)
        || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
Same substitution as Step 1. Add the `hasPermission` import.

- [ ] **Step 9: `app/api/j2/dev-checks/route.ts`**

This file's gate has extra, effectively-redundant logic (checking `departmentLeads.j2` twice — once directly, once as `[PERMISSIONS.departmentLeads.j2[0]]`, a single-element array that can never be true when the first check is already false). Simplify while converting — the resulting behavior ("J2 lead OR J2 member may view") is unchanged:

Before:
```ts
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j2) &&
            !client.hasRoles(me, [PERMISSIONS.departmentLeads.j2[0]])) {
            // Also allow J2 members to view
            if (!client.hasRoles(me, PERMISSIONS.departments.j2)) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }
        }
```
After:
```ts
        const me = await client.fetchMe()
        if (!(await hasPermission(me, 'departmentLeads.j2')) && !client.hasRoles(me, PERMISSIONS.departments.j2)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
```
Add the `hasPermission` import.

- [ ] **Step 10: `app/api/j2/dev-checks/[opId]/[checkId]/route.ts`**

`authJ2Lead()` helper:
```ts
async function authJ2Lead() {
    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j2)) return null
        return me
    } catch { return null }
}
```
becomes:
```ts
async function authJ2Lead() {
    try {
        const me = await client.fetchMe()
        if (!(await hasPermission(me, 'departmentLeads.j2'))) return null
        return me
    } catch { return null }
}
```
This file's only `PERMISSIONS` use — remove the `PERMISSIONS` import, add the `hasPermission` import.

- [ ] **Step 11: `app/api/admin/era-options/route.ts`**

Three identical sites (POST, PATCH, DELETE), each:
```ts
    if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j2)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
becomes:
```ts
    if (!(await hasPermission(me, 'departmentLeads.j2'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
This file's only `PERMISSIONS` use — remove the `PERMISSIONS` import, add the `hasPermission` import. (GET is public/unauthenticated and unaffected.)

- [ ] **Step 12: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json` (from `apps/web`)
Expected: no errors.

- [ ] **Step 13: Commit**

```bash
git add apps/web/app/api/j2 apps/web/app/api/admin/era-options/route.ts
git commit -m "Migrate departmentLeads.j2 workspace/admin call sites to hasPermission()"
```

---

### Task 4: `departmentLeads.j2` — Operations & Misc cluster (12 files, including a new client-permission endpoint)

**Files:**
- Create: `apps/web/app/api/me/permission/route.ts`
- Modify: `apps/web/app/operations/[id]/edit/page.tsx:242`
- Modify: `apps/web/app/dashboard/j2/page.tsx:15`
- Modify: `apps/web/app/api/auth/collab/route.ts:18`
- Modify: `apps/web/app/api/operations/update/route.ts:34`
- Modify: `apps/web/app/api/operations/[id]/remind/route.ts:15-16`
- Modify: `apps/web/app/api/operations/[id]/mission-development/route.ts:9-12`
- Modify: `apps/web/app/api/operations/[id]/orders-check/route.ts:178,251`
- Modify: `apps/web/app/api/admin/calendar/route.ts:120`
- No change (verify only): `apps/web/app/api/operations/campaigns/route.ts`, `apps/web/app/api/operations/campaign-missions/[id]/route.ts`, `apps/web/app/api/operations/[id]/publish/route.ts`, `apps/web/app/api/cron/dev-check-escalation/route.ts`

**Interfaces:**
- Produces: `GET /api/me/permission?key=<key>` → `{ access: boolean }`, mirroring `GET /api/me/roles?has=<role1,role2>` (`apps/web/app/api/me/roles/route.ts`) but backed by `hasPermission()` for a single permission key instead of a raw Discord-role-name list. This is the general client-side pattern for any future migrated key that a client component needs to check — not just this one call site.
- Consumes: `hasPermission(user: User, key: string): Promise<boolean>` from `@/lib/orbat/hasPermission`.

**Context — the four "no change" files:** `operations/campaigns/route.ts:10`, `operations/campaign-missions/[id]/route.ts:10`, `operations/[id]/publish/route.ts:51`, and `cron/dev-check-escalation/route.ts:100` all read `PERMISSIONS.departmentLeads.j2` as a **raw array/element of Discord role names** — fed into `Db.users.find({'guild.roles': {$in: J2_LEAD_ROLES}})` (notification-recipient lookup) or `createNotificationForRole(PERMISSIONS.departmentLeads.j2[0], ...)` (notification fan-out). None of these are authorization gates, so none convert — this step is verification only: confirm (by re-reading each file) that the only `PERMISSIONS.departmentLeads.j2` reference in each is one of these two shapes before moving on, and leave them untouched.

- [ ] **Step 1: Create `app/api/me/permission/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

export async function GET(request: NextRequest) {

    const { searchParams } = new URL(request.url)

    const key = searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'Key Missing' }, { status: 401 })

    try {
        const me = await client.fetchMe()
        const access = await hasPermission(me, key)
        return NextResponse.json({ access }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}
```

This deliberately mirrors `app/api/me/roles/route.ts`'s shape (same response envelope `{ access: boolean }`, same try/catch/401 pattern) so call sites need only swap the URL, not their `.then()` handling.

- [ ] **Step 2: `app/operations/[id]/edit/page.tsx`**

Line 242 is a client-side `fetch()` — this component cannot call `hasPermission()` directly (it's a server-only async function backed by MongoDB), so it now calls the new endpoint from Step 1 instead. The two sibling fetches on lines 238 and 246 (`pages.operationsEdit`, `members.editRestricted`) are different, not-yet-migrated categories and stay untouched — `PERMISSIONS` import stays for those.

Before:
```ts
        fetch(`/api/me/roles?has=${PERMISSIONS.departmentLeads.j2.join(',')}`)
            .then(r => r.json())
            .then(json => { if (!json.error) setIsJ2Lead(json.access) })
```
After:
```ts
        fetch('/api/me/permission?key=departmentLeads.j2')
            .then(r => r.json())
            .then(json => { if (!json.error) setIsJ2Lead(json.access) })
```

- [ ] **Step 3: `app/dashboard/j2/page.tsx`**

Line 15, same shape as every other `dashboard/jX/page.tsx` file converted in Tasks 2 and 6:
```ts
    const canManageMembers = client.hasRoles(me, PERMISSIONS.departmentLeads.j2)
```
After:
```ts
    const canManageMembers = await hasPermission(me, 'departmentLeads.j2')
```
`departments.j2`/`departments.j4` stay untouched, `PERMISSIONS` import stays. Add the `hasPermission` import.

- [ ] **Step 4: `app/api/auth/collab/route.ts`**

Line 18, the `ws-*` branch of the nested ternary (the `sop-*` branch was already converted in Phase 1; the `cfb-*` and final-`else` branches belong to `training.manage`/`auth.collab` — different, not-yet-migrated categories):
```ts
            : doc.startsWith('ws-')
                ? client.hasRoles(me, PERMISSIONS.departments.j2) || client.hasRoles(me, PERMISSIONS.departmentLeads.j2) || client.hasRoles(me, PERMISSIONS.pages.admin)
                : doc.startsWith('cfb-')
```
After:
```ts
            : doc.startsWith('ws-')
                ? client.hasRoles(me, PERMISSIONS.departments.j2) || (await hasPermission(me, 'departmentLeads.j2')) || client.hasRoles(me, PERMISSIONS.pages.admin)
                : doc.startsWith('cfb-')
```
`hasPermission` is already imported in this file (used for `pages.member` and `auth.collab` on the other two ternary branches).

- [ ] **Step 5: `app/api/operations/update/route.ts`**

Line 34:
```ts
        const isJ2LeadOrJ4 = client.hasRoles(me, PERMISSIONS.departmentLeads.j2)
            || client.hasRoles(me, PERMISSIONS.members.editRestricted)
```
After:
```ts
        const isJ2LeadOrJ4 = (await hasPermission(me, 'departmentLeads.j2'))
            || client.hasRoles(me, PERMISSIONS.members.editRestricted)
```
`operations.write` (line 32) and `members.editRestricted` stay untouched — `PERMISSIONS` import stays. Add the `hasPermission` import.

- [ ] **Step 6: `app/api/operations/[id]/remind/route.ts`**

Lines 15-16:
```ts
        if (!client.hasRoles(me, PERMISSIONS.operations.write) &&
            !client.hasRoles(me, PERMISSIONS.departmentLeads.j2)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
```
After:
```ts
        if (!client.hasRoles(me, PERMISSIONS.operations.write) &&
            !(await hasPermission(me, 'departmentLeads.j2'))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
```
`operations.write` stays untouched — `PERMISSIONS` import stays. Add the `hasPermission` import.

- [ ] **Step 7: `app/api/operations/[id]/mission-development/route.ts`**

This file's only `PERMISSIONS` use — remove the `PERMISSIONS` import.
```ts
async function authJ2Lead() {
    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j2)) return null
        return me
    } catch { return null }
}
```
After:
```ts
async function authJ2Lead() {
    try {
        const me = await client.fetchMe()
        if (!(await hasPermission(me, 'departmentLeads.j2'))) return null
        return me
    } catch { return null }
}
```
Add the `hasPermission` import.

- [ ] **Step 8: `app/api/operations/[id]/orders-check/route.ts`**

Two sites convert; two stay untouched. `PERMISSIONS.departments.j2` (GET/POST/DELETE/PATCH's outer gates) is a different, not-yet-migrated category and stays untouched — `PERMISSIONS` import stays.

Line 103 and line 191 (`const j2LeadRole = PERMISSIONS.departmentLeads.j2[0]`) are raw role-name reads for `createNotificationForRole()`/DB lookups — **stay untouched**.

Line 178, inside DELETE (cancel-request ownership check):
```ts
    const isLead = client.hasRoles(me, PERMISSIONS.departmentLeads.j2)
```
After:
```ts
    const isLead = await hasPermission(me, 'departmentLeads.j2')
```

Line 251, inside PATCH ("confirm"/"propose" gate):
```ts
    if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j2)) {
        return NextResponse.json({ error: 'Forbidden: J2 Lead required' }, { status: 403 })
    }
```
After:
```ts
    if (!(await hasPermission(me, 'departmentLeads.j2'))) {
        return NextResponse.json({ error: 'Forbidden: J2 Lead required' }, { status: 403 })
    }
```
Add the `hasPermission` import.

- [ ] **Step 9: `app/api/admin/calendar/route.ts`**

Line 120, the `isJ2Unavailability` gate inside POST. Line 160 (`assignedRole: PERMISSIONS.departmentLeads.j2[0]`, a `Task` field) and line 181 (`const J2_LEAD_ROLES = PERMISSIONS.departmentLeads.j2`, a notification-recipient lookup) are raw role-name reads — **stay untouched**. `pages.admin` (lines 20, 87) and `isMissionCheckRequest`'s `departments.j2` gate (line 123) also stay untouched — `PERMISSIONS` import stays.

Before:
```ts
    if (isJ2Unavailability && !client.hasRoles(me, PERMISSIONS.departmentLeads.j2)) {
        return NextResponse.json({ error: 'Forbidden — J2 Lead role required' }, { status: 403 })
    }
```
After:
```ts
    if (isJ2Unavailability && !(await hasPermission(me, 'departmentLeads.j2'))) {
        return NextResponse.json({ error: 'Forbidden — J2 Lead role required' }, { status: 403 })
    }
```
Add the `hasPermission` import.

- [ ] **Step 10: Verify the four no-change files**

Read `app/api/operations/campaigns/route.ts`, `app/api/operations/campaign-missions/[id]/route.ts`, `app/api/operations/[id]/publish/route.ts`, and `app/api/cron/dev-check-escalation/route.ts`. Confirm each one's only `PERMISSIONS.departmentLeads.j2` reference is a raw role-name read (notification fan-out or `Db.users` lookup), not a boolean authorization gate. If any file has drifted since this plan was written and now also contains a genuine gate, convert that gate using the same substitution pattern as the other steps in this task, and note the deviation in your task report.

- [ ] **Step 11: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json` (from `apps/web`)
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add apps/web/app/api/me/permission apps/web/app/operations/[id]/edit/page.tsx apps/web/app/dashboard/j2/page.tsx apps/web/app/api/auth/collab/route.ts apps/web/app/api/operations/update/route.ts "apps/web/app/api/operations/[id]/remind/route.ts" "apps/web/app/api/operations/[id]/mission-development/route.ts" "apps/web/app/api/operations/[id]/orders-check/route.ts" apps/web/app/api/admin/calendar/route.ts
git commit -m "Migrate remaining departmentLeads.j2 call sites; add /api/me/permission endpoint"
```

---

### Task 5: `departmentLeads.j3` + `quiz.*` cluster (9 files)

**Files:**
- Modify: `apps/web/app/dashboard/j3/page.tsx:15`
- Modify: `apps/web/app/dashboard/unit/training-hub/course/[id]/page.tsx:24`
- Modify: `apps/web/app/api/training-videos/[id]/progress/route.ts:131`
- Modify: `apps/web/app/api/j3/course-instances/[id]/activity/restore/route.ts:13`
- Modify: `apps/web/app/api/admin/quiz/review/[attemptId]/route.ts:22,62,195`
- Modify: `apps/web/app/dashboard/quiz/review/[attemptId]/page.tsx:20,35`
- Modify: `apps/web/app/api/admin/quiz/recruits/route.ts:16`
- Modify: `apps/web/app/api/admin/quiz/attempts/route.ts:20`
- Modify: `apps/web/app/api/admin/quiz/assign/route.ts:20`

**Interfaces:**
- Consumes: `hasPermission(user: User, key: string): Promise<boolean>` from `@/lib/orbat/hasPermission`.

- [ ] **Step 1: `app/dashboard/j3/page.tsx`**

Line 15, same shape as the other `dashboard/jX/page.tsx` files:
```ts
    const canManageMembers = client.hasRoles(me, PERMISSIONS.departmentLeads.j3)
```
After:
```ts
    const canManageMembers = await hasPermission(me, 'departmentLeads.j3')
```
`departments.j3`/`departments.j4` stay untouched, `PERMISSIONS` import stays. Add the `hasPermission` import.

- [ ] **Step 2: `app/dashboard/unit/training-hub/course/[id]/page.tsx`**

Line 24, this file's only `PERMISSIONS` use besides `training.manage` (line 15, stays untouched — different category):
```ts
    const canManage = client.hasRoles(me, PERMISSIONS.departmentLeads.j3)
```
After:
```ts
    const canManage = await hasPermission(me, 'departmentLeads.j3')
```
`PERMISSIONS` import stays (still needed for `training.manage`). Add the `hasPermission` import.

- [ ] **Step 3: `app/api/training-videos/[id]/progress/route.ts`**

Two sites: line 112 is out of scope, line 131 converts.

Line 112, inside the checkpoint-fail notification loop — **stays untouched** (raw role-name iteration for `createNotificationForRole()`):
```ts
        for (const leadRole of PERMISSIONS.departmentLeads.j3) {
            await createNotificationForRole(leadRole, {
```

Line 131, the PATCH handler's trainer-allocation gate:
```ts
    if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j3)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
After:
```ts
    if (!(await hasPermission(me, 'departmentLeads.j3'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
`hasPermission` is already imported in this file (used for `pages.member` on GET/PUT). `PERMISSIONS` import stays (still needed for the notification loop).

- [ ] **Step 4: `app/api/j3/course-instances/[id]/activity/restore/route.ts`**

Line 13, this file's only `PERMISSIONS` use — remove the `PERMISSIONS` import:
```ts
    if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j3)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
After:
```ts
    if (!(await hasPermission(me, 'departmentLeads.j3'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
Add the `hasPermission` import.

- [ ] **Step 5: `app/api/admin/quiz/review/[attemptId]/route.ts`**

Three sites. `hasPermission` is already imported in this file (used at line 25 for... actually check: this file imports `createNotificationForRole` but not yet `hasPermission` — add it).

GET handler, lines 22-24:
```ts
    if (!client.hasRoles(me, PERMISSIONS.quiz.review)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```
After:
```ts
    if (!(await hasPermission(me, 'quiz.review'))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```

POST handler, lines 62-64 (identical shape):
```ts
    if (!client.hasRoles(me, PERMISSIONS.quiz.review)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```
After: same substitution as above.

Inside the `send_for_review` branch, lines 195-205 — the `isJ3Lead` boolean converts (same authorization question as the `departmentLeads.j3` gates elsewhere); `isJ4` stays as-is (different, not-yet-migrated category); the resulting `nextRoleName` string and the `createNotificationForRole(nextRoleName, ...)` call two lines later stay untouched (notification routing, not a gate):
```ts
        const isJ3Lead = client.hasRoles(me, PERMISSIONS.departmentLeads.j3)
        const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)

        let nextRoleName: string
        if (isJ4) {
            return NextResponse.json({ error: 'J4 cannot escalate further. Please Pass or Fail.' }, { status: 400 })
        } else if (isJ3Lead) {
            nextRoleName = 'J4-Administration'
        } else {
            nextRoleName = 'J3-Team Lead'
        }
```
After:
```ts
        const isJ3Lead = await hasPermission(me, 'departmentLeads.j3')
        const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)

        let nextRoleName: string
        if (isJ4) {
            return NextResponse.json({ error: 'J4 cannot escalate further. Please Pass or Fail.' }, { status: 400 })
        } else if (isJ3Lead) {
            nextRoleName = 'J4-Administration'
        } else {
            nextRoleName = 'J3-Team Lead'
        }
```
Add `import { hasPermission } from '@/lib/orbat/hasPermission'`. `PERMISSIONS` import stays (still needed for `departments.j4`).

- [ ] **Step 6: `app/dashboard/quiz/review/[attemptId]/page.tsx`**

Two sites. Line 20 — the page-level gate:
```ts
    if (!client.hasRoles(me, PERMISSIONS.quiz.review)) redirect('/dashboard')
```
After:
```ts
    if (!(await hasPermission(me, 'quiz.review'))) redirect('/dashboard')
```

Line 35 — `canEscalate` boolean assignment:
```ts
    const canEscalate = client.hasRoles(me, PERMISSIONS.quiz.reviewEscalated)
```
After:
```ts
    const canEscalate = await hasPermission(me, 'quiz.reviewEscalated')
```
`departments.j4` (line 36) stays untouched — `PERMISSIONS` import stays. Add the `hasPermission` import. This is a server component (`async function Page()`), so `await` is valid directly.

- [ ] **Step 7: `app/api/admin/quiz/recruits/route.ts`**

Line 16, this file's only `PERMISSIONS` use — remove the `PERMISSIONS` import:
```ts
    if (!client.hasRoles(me, PERMISSIONS.quiz.assign)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```
After:
```ts
    if (!(await hasPermission(me, 'quiz.assign'))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
```
Add the `hasPermission` import.

- [ ] **Step 8: `app/api/admin/quiz/attempts/route.ts`**

Line 20, this file's only `PERMISSIONS` use — remove the `PERMISSIONS` import. Same substitution as Step 7 (`quiz.assign`). Add the `hasPermission` import.

- [ ] **Step 9: `app/api/admin/quiz/assign/route.ts`**

Line 20, this file's only `PERMISSIONS` use — remove the `PERMISSIONS` import. Same substitution as Step 7 (`quiz.assign`). Add the `hasPermission` import.

- [ ] **Step 10: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json` (from `apps/web`)
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/dashboard/j3 "apps/web/app/dashboard/unit/training-hub/course/[id]/page.tsx" "apps/web/app/api/training-videos/[id]/progress/route.ts" apps/web/app/api/j3 apps/web/app/api/admin/quiz apps/web/app/dashboard/quiz
git commit -m "Migrate departmentLeads.j3 and quiz.* call sites to hasPermission()"
```

---

### Task 6: `departmentLeads.j5`/`j6`/`j7` cluster (4 files)

**Files:**
- Modify: `apps/web/app/dashboard/j5/page.tsx:15`
- Modify: `apps/web/app/dashboard/j6/page.tsx:15`
- Modify: `apps/web/app/dashboard/j7/page.tsx:15`
- Modify: `apps/web/app/api/gallery/sotm/route.ts:15`

**Interfaces:**
- Consumes: `hasPermission(user: User, key: string): Promise<boolean>` from `@/lib/orbat/hasPermission`.

- [ ] **Step 1: `app/dashboard/j5/page.tsx`**

Line 15:
```ts
    const canManageMembers = client.hasRoles(me, PERMISSIONS.departmentLeads.j5)
```
After:
```ts
    const canManageMembers = await hasPermission(me, 'departmentLeads.j5')
```
`departments.j5`/`departments.j4` stay untouched, `PERMISSIONS` import stays. Add the `hasPermission` import.

- [ ] **Step 2: `app/dashboard/j6/page.tsx`**

Line 15, same shape as Step 1 with `departmentLeads.j6`. Add the `hasPermission` import.

- [ ] **Step 3: `app/dashboard/j7/page.tsx`**

Line 15, same shape as Step 1 with `departmentLeads.j7`. Add the `hasPermission` import.

- [ ] **Step 4: `app/api/gallery/sotm/route.ts`**

`checkAuth()` helper, lines 12-17, this file's only `PERMISSIONS` use — remove the `PERMISSIONS` import:
```ts
async function checkAuth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j5)) return null
    return me
}
```
After:
```ts
async function checkAuth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!(await hasPermission(me, 'departmentLeads.j5'))) return null
    return me
}
```
Add the `hasPermission` import.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json` (from `apps/web`)
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/dashboard/j5 apps/web/app/dashboard/j6 apps/web/app/dashboard/j7 apps/web/app/api/gallery/sotm
git commit -m "Migrate departmentLeads.j5/j6/j7 call sites to hasPermission()"
```

---

### Task 7: `meetings.lockJ1`–`lockJ7` (1 file)

**Files:**
- Modify: `apps/web/app/api/admin/meetings/[id]/lock/route.ts` (48 lines, entire file shown below for context)

**Interfaces:**
- Consumes: `hasPermission(user: User, key: string): Promise<boolean>` from `@/lib/orbat/hasPermission`.

This file builds a per-department **role-array** lookup table (`Record<MeetingDepartment, string[]>`) and calls `client.hasRoles()` against the looked-up array. Since `hasPermission()` takes a single permission-key string rather than an array, the lookup table restructures to `Record<MeetingDepartment, string>` mapping department → permission key, and the check becomes `await hasPermission(me, LOCK_KEYS[meeting.department])`. This is the file's only `PERMISSIONS` use — the import is removed entirely.

- [ ] **Step 1: Restructure the lookup table and gate**

Before:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

const LOCK_PERMISSIONS: Record<MeetingDepartment, string[]> = {
    j1: PERMISSIONS.meetings.lockJ1,
    j2: PERMISSIONS.meetings.lockJ2,
    j3: PERMISSIONS.meetings.lockJ3,
    j4: PERMISSIONS.meetings.lockJ4,
    j5: PERMISSIONS.meetings.lockJ5,
    j6: PERMISSIONS.meetings.lockJ6,
    j7: PERMISSIONS.meetings.lockJ7,
}

// POST /api/admin/meetings/[id]/lock  { locked: boolean }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!client.hasRoles(me, LOCK_PERMISSIONS[meeting.department])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
After:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

const LOCK_KEYS: Record<MeetingDepartment, string> = {
    j1: 'meetings.lockJ1',
    j2: 'meetings.lockJ2',
    j3: 'meetings.lockJ3',
    j4: 'meetings.lockJ4',
    j5: 'meetings.lockJ5',
    j6: 'meetings.lockJ6',
    j7: 'meetings.lockJ7',
}

// POST /api/admin/meetings/[id]/lock  { locked: boolean }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!(await hasPermission(me, LOCK_KEYS[meeting.department]))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
The rest of the file (the `body.locked` branch and below) is unaffected — leave it as-is.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json` (from `apps/web`)
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/api/admin/meetings/[id]/lock/route.ts"
git commit -m "Migrate meetings.lockJ1-lockJ7 call site to hasPermission()"
```

---

### Task 8: Doc-map updates

**Files:**
- Modify: `apps/web/docs/map/b-operations-j2-api.md` (lines around 131-144, 183, 186, 216, 219-220 — J2 workspace/dev-checks/operations route gate descriptions)
- Modify: `apps/web/docs/map/a-admin-api.md` (line 13, `era-options` mutation gate description)
- Modify: `apps/web/docs/map/f-dashboard-j5-j7-other.md` (quiz-related gate description, ~line 148)
- Modify: `apps/web/docs/map/d-misc-api.md` (lines ~156-157, gallery/sotm gate description)

**Interfaces:** None — documentation only, no code interfaces.

Per `CLAUDE.md`'s standing rule ("whenever you add, remove, rename, or meaningfully change a route... update its entry in the relevant `docs/map/*.md` file... as part of the same change"), every route whose gate description says `Gate: PERMISSIONS.departmentLeads.jX` (or `quiz.review`/`quiz.assign`/`quiz.reviewEscalated`/`meetings.lockJX`) needs that phrase updated to reflect the real runtime check. Use this substitution throughout: `PERMISSIONS.departmentLeads.jX` → `` `await hasPermission(me, 'departmentLeads.jX')` ``, and equivalently for the `quiz.*`/`meetings.lockJX` keys. Do **not** touch gate descriptions for keys this batch didn't convert (e.g. `PERMISSIONS.departments.j2`, `PERMISSIONS.pages.admin`) even on the same line.

- [ ] **Step 1: Read and update `docs/map/b-operations-j2-api.md`**

Read the file (it's large — search within it, per `CLAUDE.md`'s site-map discipline, rather than reading end-to-end). Update every gate line whose description references `PERMISSIONS.departmentLeads.j2`, including (but not limited to, since exact line numbers may have shifted since this plan was researched — search for the string):
- `/api/operations/[id]/mission-development` POST/DELETE
- `/api/operations/[id]/orders-check` PATCH (the `confirm`/`propose` half only — its `set_reminder` half stays `PERMISSIONS.departments.j2`)
- `/api/operations/[id]/remind` POST
- `/api/j2/workspace/activity` GET
- `/api/j2/workspace/members`, `/api/j2/workspace/docs`, `/api/j2/dev-checks/[opId]/[checkId]` DELETE (wherever "J2 member/lead/admin" prose references the lead role)

For each, replace the `departmentLeads.j2` portion of the gate description with `await hasPermission(me, 'departmentLeads.j2')`, leaving any accompanying `departments.j2`/`pages.admin` references as-is.

- [ ] **Step 2: Read and update `docs/map/a-admin-api.md`**

Find the `era-options` entry (around line 13: "`GET/POST/PATCH/DELETE /api/admin/era-options` — ... Gate: `PERMISSIONS.departmentLeads.j2` for mutations."). Replace with "Gate: `await hasPermission(me, 'departmentLeads.j2')` for mutations."

- [ ] **Step 3: Read and update `docs/map/f-dashboard-j5-j7-other.md`**

Search for the quiz-related entry referencing `PERMISSIONS.departmentLeads.j3` or `PERMISSIONS.quiz.*` (around line 148) and apply the same substitution.

- [ ] **Step 4: Read and update `docs/map/d-misc-api.md`**

Search for the `/api/gallery/sotm` entry (around lines 156-157) referencing `PERMISSIONS.departmentLeads.j5`. Apply the same substitution.

- [ ] **Step 5: Sweep for any remaining references**

Grep `apps/web/docs/map/` for `departmentLeads\.(j1|j2|j3|j5|j6|j7)`, `quiz\.(assign|review|reviewEscalated)`, and `meetings\.lockJ` to confirm no gate description in this batch's scope was missed. Any hit found is a doc-map entry to update the same way; any hit inside prose that isn't a `Gate:` line (e.g. general explanatory text) use judgment — update it if it asserts the Discord-role-array mechanism is still authoritative, leave it if it's just naming the key.

- [ ] **Step 6: Commit**

```bash
git add apps/web/docs/map
git commit -m "Update doc-map gate descriptions for Batch 2 migrated permission keys"
```

---

### Final Verification

- [ ] Run `npx tsc --noEmit -p tsconfig.json` from `apps/web` — expect zero errors.
- [ ] Run `npm run build` from `apps/web` — expect a clean production build (per this session's hard-learned lesson: `tsc` alone misses webpack-level issues).
