# Member Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Member Sync" tab to the ORBAT Roles Manager that reports Discord role / TeamSpeak group drift for every member (on-roster and off-roster), and lets J4 apply fixes — per-member or all at once — behind a confirmation dialog that shows the exact diff first.

**Architecture:** One new server-only module (`lib/orbat/member-sync.ts`) computes the report by comparing what each member's department/ORBAT roles say they should hold against live Discord + cached/live TeamSpeak state, reusing the existing grant/revoke primitives (`addGuildRole`/`removeGuildRole`/`applyTsServerGroups`). Two thin API routes (GET report, POST apply) wrap it with the same J4 permission gate the rest of the Roles Manager already uses. A new client tab component renders the report as two expandable, color-coded lists and drives the confirm-then-apply flow.

**Tech Stack:** Next.js 15 App Router route handlers, MongoDB driver, MUI components, Playwright E2E (this repo has no unit-test runner — see Global Constraints).

**Spec:** `apps/web/docs/superpowers/specs/2026-08-15-member-sync-design.md`

## Global Constraints

- No new DB collections or schema changes — everything is computed on demand from `users`, `department_roles`, `orbat_roles`, `orbat_positions`, `orbat_section_meta`, plus live Discord/TeamSpeak state.
- Permission gate for both new routes and the tab's visibility: `PERMISSIONS.admin.manageOrbatRoles` (same key already gating the whole Roles Manager panel) — no new permission key.
- This repo has **no unit-test runner** (no jest/vitest) — only Playwright E2E against a real dev server + seeded in-memory Mongo (`apps/web/tests/`). All tests in this plan are Playwright specs, following the patterns in `apps/web/tests/README.md`.
- `DISCORD_BOT_TOKEN` is deliberately `''` in the E2E environment, so `fetchAllGuildMembers()` (and therefore the report/apply routes' happy path) always throws → 500 downstream of the auth check, exactly like the existing `grant-all-roles` route. E2E coverage for these two routes is therefore the permission gate only (401/403/passes-gate), matching `hidden-functions.spec.ts`'s established pattern for bot-token-dependent routes — do not attempt to mock Discord/TeamSpeak at the server-call level; there is no seam for it (see `tests/README.md`'s "Why there is a database" section).
- `getClientServerGroupIds()` and `applyTsServerGroups()` never throw — they degrade to `[]` / `{skipped: true}` on TeamSpeak connection failure (already true of the existing code, not something to change here).
- Follow existing file conventions: MUI `sx` inline styling matching `DepartmentRolesTab.tsx`'s visual language (dark theme, `var(--red)` accent, `rgba(237,237,237,...)` text), route handlers matching `app/api/admin/members/sync-dept/route.ts`'s auth/error shape (`{error}` JSON, 401/403).

---

### Task 1: Member sync report — computation module + GET route

**Files:**
- Create: `apps/web/lib/orbat/member-sync.ts`
- Create: `apps/web/app/api/admin/orbat/member-sync/route.ts`
- Test: `apps/web/tests/member-sync.spec.ts`

**Interfaces:**
- Produces (consumed by Task 2, Task 4, Task 5):
  - `interface GrantDetail { id: string | number; name: string; source: string }`
  - `interface MemberSyncEntry { userId: string; name: string; avatarURL: string; onRoster: boolean; status: 'red' | 'orange' | 'green'; discord: { missing: GrantDetail[]; extra: GrantDetail[] }; teamspeak: { missing: GrantDetail[]; extra: GrantDetail[]; linked: boolean } }`
  - `interface MemberSyncReport { onRoster: MemberSyncEntry[]; offRoster: MemberSyncEntry[] }`
  - `async function computeMemberSyncReport(): Promise<MemberSyncReport>`

- [ ] **Step 1: Write `lib/orbat/member-sync.ts`**

```ts
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { DEPT_CODES } from '@/lib/discord/dept-codes'
import { fetchAllGuildMembers } from '@/lib/discord/bot'
import { getClientServerGroupIds } from '@/lib/teamspeak/groups'
import { getGroupCache } from '@/lib/teamspeak/cache'

export interface GrantDetail {
    id: string | number
    name: string
    source: string
}

export interface MemberSyncEntry {
    userId: string
    name: string
    avatarURL: string
    onRoster: boolean
    status: 'red' | 'orange' | 'green'
    discord: { missing: GrantDetail[]; extra: GrantDetail[] }
    teamspeak: { missing: GrantDetail[]; extra: GrantDetail[]; linked: boolean }
}

export interface MemberSyncReport {
    onRoster: MemberSyncEntry[]
    offRoster: MemberSyncEntry[]
}

interface GrantBundle {
    discordRoleIds: string[]
    tsGroupIds: number[]
    source: string
}

/** Merges every contributing bundle into one expected-ID set per grant type,
 *  keeping a list of every source that contributed each ID (a Discord role
 *  or TS group can legitimately be granted by more than one source at once —
 *  e.g. a department base role AND an ORBAT role both listing it). */
function mergeBundles(bundles: GrantBundle[]) {
    const discordIds = new Set<string>()
    const tsIds = new Set<number>()
    const discordSource = new Map<string, string[]>()
    const tsSource = new Map<number, string[]>()

    for (const b of bundles) {
        for (const id of b.discordRoleIds) {
            discordIds.add(id)
            discordSource.set(id, [...(discordSource.get(id) ?? []), b.source])
        }
        for (const id of b.tsGroupIds) {
            tsIds.add(id)
            tsSource.set(id, [...(tsSource.get(id) ?? []), b.source])
        }
    }
    return { discordIds, tsIds, discordSource, tsSource }
}

/** `missing` = expected but not actually held. `extra` = actually held, part
 *  of the managed-ID universe (so we know some Role/Group catalog cares about
 *  it), but not currently expected from anything. IDs outside the managed
 *  universe (unrelated Discord roles, rank roles, etc.) are never reported. */
function diffIds<T extends string | number>(
    expected: Set<T>,
    managed: Set<T>,
    actual: Set<T>,
    sourceById: Map<T, string[]>,
    nameById: Map<T, string>,
): { missing: GrantDetail[]; extra: GrantDetail[] } {
    const missing: GrantDetail[] = [...expected]
        .filter(id => !actual.has(id))
        .map(id => ({ id, name: nameById.get(id) ?? String(id), source: (sourceById.get(id) ?? []).join('; ') }))

    const extra: GrantDetail[] = [...actual]
        .filter(id => managed.has(id) && !expected.has(id))
        .map(id => ({ id, name: nameById.get(id) ?? String(id), source: 'Not expected from any current department or ORBAT role' }))

    return { missing, extra }
}

function statusFor(discord: MemberSyncEntry['discord'], teamspeak: MemberSyncEntry['teamspeak']): MemberSyncEntry['status'] {
    if (discord.missing.length || teamspeak.missing.length) return 'red'
    if (discord.extra.length || teamspeak.extra.length) return 'orange'
    return 'green'
}

/** Preconditions: caller has already resolved `client.fetchMe()` (so
 *  `client.roles` is populated — see `lib/discord/index.ts`'s `rolesReady`).
 *  Throws if `fetchAllGuildMembers()` fails (e.g. no `DISCORD_BOT_TOKEN`) —
 *  same fail-hard behaviour as the existing `sync-dept` route; callers
 *  should let it propagate to a 500, not swallow it. */
export async function computeMemberSyncReport(): Promise<MemberSyncReport> {
    const [users, departmentRoles, orbatRoles, orbatPositions, orbatSectionMeta, guildMembers] = await Promise.all([
        Db.users.find({ discharged: { $exists: false } })
            .project<Pick<User, 'id' | 'name' | 'globalName' | 'username' | 'avatarURL' | 'guild' | 'departments' | 'departmentRoleIds' | 'teamspeak'>>(
                { id: 1, name: 1, globalName: 1, username: 1, avatarURL: 1, guild: 1, departments: 1, departmentRoleIds: 1, teamspeak: 1 },
            )
            .toArray(),
        Db.departmentRoles.find({}).toArray(),
        Db.orbatRoles.find({}).toArray(),
        Db.orbatPositions.find({ userId: { $ne: null } }).toArray(),
        Db.orbatSectionMeta.find({}).toArray(),
        fetchAllGuildMembers(),
    ])

    const managedDiscordIds = new Set<string>([
        ...departmentRoles.flatMap(r => r.discordRoleIds),
        ...orbatRoles.flatMap(r => r.discordRoleIds),
        ...orbatSectionMeta.map(m => m.discordRoleId).filter((id): id is string => !!id),
    ])
    const managedTsGroupIds = new Set<number>([
        ...departmentRoles.flatMap(r => r.tsGroupIds),
        ...orbatRoles.flatMap(r => r.tsGroupIds),
        ...orbatSectionMeta.map(m => m.tsGroupId).filter((id): id is number => typeof id === 'number'),
    ])

    const guildRoleMap = new Map(guildMembers.map(m => [m.userId, new Set(m.roleIds)]))
    const roleNameById = new Map(client.roles.map(r => [r.id, r.name]))
    const tsGroupCache = getGroupCache()
    const tsGroupNameById = new Map((tsGroupCache?.groups ?? []).map(g => [g.id, g.name]))

    const positionByUserId = new Map(orbatPositions.filter(p => p.userId).map(p => [p.userId as string, p]))
    const orbatRoleById = new Map(orbatRoles.map(r => [String(r._id), r]))
    const deptRoleById = new Map(departmentRoles.map(r => [String(r._id), r]))
    const deptBaseByDept = new Map(departmentRoles.filter(r => r.isBase).map(r => [r.department, r]))
    const sectionMetaByKey = new Map(orbatSectionMeta.map(m => [`${m.category}:${m.sectionTitle ?? ''}`, m]))

    function bundlesFor(user: typeof users[number]): GrantBundle[] {
        const bundles: GrantBundle[] = []

        for (const dept of user.departments ?? []) {
            const base = deptBaseByDept.get(dept)
            if (base) bundles.push({ discordRoleIds: base.discordRoleIds, tsGroupIds: base.tsGroupIds, source: `Department: ${dept.toUpperCase()} base role` })
        }
        for (const id of user.departmentRoleIds ?? []) {
            const role = deptRoleById.get(String(id))
            if (role && (user.departments ?? []).includes(role.department)) {
                bundles.push({ discordRoleIds: role.discordRoleIds, tsGroupIds: role.tsGroupIds, source: `Department: ${role.name}` })
            }
        }

        const position = positionByUserId.get(user.id)
        if (position) {
            if (position.roleId) {
                const role = orbatRoleById.get(String(position.roleId))
                if (role) bundles.push({ discordRoleIds: role.discordRoleIds, tsGroupIds: role.tsGroupIds, source: `ORBAT: ${role.name}` })
            }
            const categoryMeta = sectionMetaByKey.get(`${position.category}:`)
            if (categoryMeta) {
                bundles.push({
                    discordRoleIds: categoryMeta.discordRoleId ? [categoryMeta.discordRoleId] : [],
                    tsGroupIds: typeof categoryMeta.tsGroupId === 'number' ? [categoryMeta.tsGroupId] : [],
                    source: `ORBAT category: ${position.category}`,
                })
            }
            if (position.sectionTitle) {
                const sectionMeta = sectionMetaByKey.get(`${position.category}:${position.sectionTitle}`)
                if (sectionMeta) {
                    bundles.push({
                        discordRoleIds: sectionMeta.discordRoleId ? [sectionMeta.discordRoleId] : [],
                        tsGroupIds: typeof sectionMeta.tsGroupId === 'number' ? [sectionMeta.tsGroupId] : [],
                        source: `ORBAT section: ${position.sectionTitle}`,
                    })
                }
            }
        }

        return bundles
    }

    async function buildEntry(user: typeof users[number]): Promise<MemberSyncEntry> {
        const { discordIds, tsIds, discordSource, tsSource } = mergeBundles(bundlesFor(user))

        const actualDiscord = guildRoleMap.get(user.id) ?? new Set<string>()
        const cldbid = user.teamspeak?.cldbid
        const actualTs = cldbid ? new Set(await getClientServerGroupIds(cldbid)) : new Set<number>()

        const discordDiff = diffIds(discordIds, managedDiscordIds, actualDiscord, discordSource, roleNameById)
        const teamspeakDiff = cldbid
            ? diffIds(tsIds, managedTsGroupIds, actualTs, tsSource, tsGroupNameById)
            : { missing: [], extra: [] }

        const onRoster = (user.departments?.length ?? 0) > 0 || positionByUserId.has(user.id)
        const teamspeak = { ...teamspeakDiff, linked: !!cldbid }

        return {
            userId: user.id,
            name: user.guild?.nickname || user.guild?.displayName || user.globalName || user.username || user.id,
            avatarURL: user.avatarURL,
            onRoster,
            status: statusFor(discordDiff, teamspeak),
            discord: discordDiff,
            teamspeak,
        }
    }

    const entries = await Promise.all(users.map(buildEntry))

    return {
        onRoster: entries.filter(e => e.onRoster),
        offRoster: entries.filter(e => !e.onRoster),
    }
}
```

- [ ] **Step 2: Write `app/api/admin/orbat/member-sync/route.ts`**

```ts
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { computeMemberSyncReport } from '@/lib/orbat/member-sync'

// GET /api/admin/orbat/member-sync — same read gate as the rest of the
// ORBAT admin surface (this route lives inside the Roles Manager panel).
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const report = await computeMemberSyncReport()
    return NextResponse.json(report)
}
```

- [ ] **Step 3: Verify it builds and the route is reachable**

Run: `npm run dev` (from `apps/web`), then in another terminal:
```bash
curl -i http://localhost:3000/api/admin/orbat/member-sync
```
Expected: `HTTP/1.1 401` with `{"error":"Unauthorized"}` (no session cookie sent). Stop the dev server after confirming.

- [ ] **Step 4: Write the permission-gate Playwright test**

Create `apps/web/tests/member-sync.spec.ts`:

```ts
/**
 * Member Sync tab — report + apply routes.
 *
 * DISCORD_BOT_TOKEN is deliberately '' in this test environment (see
 * tests/README.md), so `fetchAllGuildMembers()` inside
 * computeMemberSyncReport() always throws once past the auth check — same
 * situation as the existing `/api/dev/grant-all-roles` route. These specs
 * therefore cover the permission gate only: anonymous/forbidden/authorized.
 * UI behaviour (which needs real report data) is covered separately in this
 * file using page.route() to stub the client-side fetch — see the "Member
 * Sync tab UI" describe block added in later tasks.
 */
import { test, expect } from './fixtures/asot'

test.describe('GET /api/admin/orbat/member-sync', () => {
    test('rejects an anonymous caller', async ({ request }) => {
        expect((await request.get('/api/admin/orbat/member-sync')).status()).toBe(401)
    })

    test('rejects an ordinary department member', async ({ memberPage }) => {
        expect((await memberPage.request.get('/api/admin/orbat/member-sync')).status()).toBe(403)
    })

    test('passes the gate for an authorized caller', async ({ adminPage }) => {
        // It will fail downstream (no DISCORD_BOT_TOKEN in the test env), but
        // the authorisation decision has already been made by then — the
        // point of this test is that it is not a 403.
        const res = await adminPage.request.get('/api/admin/orbat/member-sync')
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })
})
```

- [ ] **Step 5: Run the new spec**

Run: `npx playwright test member-sync.spec.ts`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/orbat/member-sync.ts apps/web/app/api/admin/orbat/member-sync/route.ts apps/web/tests/member-sync.spec.ts
git commit -m "feat(orbat): add member sync report computation + GET route"
```

---

### Task 2: Member sync apply — computation + POST route

**Files:**
- Modify: `apps/web/lib/orbat/member-sync.ts`
- Create: `apps/web/app/api/admin/orbat/member-sync/apply/route.ts`
- Test: `apps/web/tests/member-sync.spec.ts`

**Interfaces:**
- Consumes: `computeMemberSyncReport()`, `MemberSyncEntry` (Task 1)
- Produces (consumed by Task 5): `interface MemberSyncApplyResult { membersChecked: number; discordGranted: number; discordRevoked: number; tsGranted: number; tsRevoked: number }`, `async function applyMemberSyncFixes(userIds?: string[]): Promise<MemberSyncApplyResult>`

- [ ] **Step 1: Append `applyMemberSyncFixes` to `lib/orbat/member-sync.ts`**

Add these imports to the top of the file (alongside the existing ones):

```ts
import { addGuildRole, removeGuildRole } from '@/lib/discord/bot'
import { applyTsServerGroups } from '@/lib/teamspeak/groups'
```

Append to the end of the file:

```ts
export interface MemberSyncApplyResult {
    membersChecked: number
    discordGranted: number
    discordRevoked: number
    tsGranted: number
    tsRevoked: number
}

/** Re-runs computeMemberSyncReport() (fresh live Discord/TeamSpeak state,
 *  never trusts a diff computed earlier in the request lifecycle) and grants
 *  / revokes whatever each target member's fresh diff says. `userIds`
 *  omitted = every currently out-of-sync member; provided = only those
 *  (used for both the per-member Sync button and Sync All). */
export async function applyMemberSyncFixes(userIds?: string[]): Promise<MemberSyncApplyResult> {
    const report = await computeMemberSyncReport()
    const allEntries = [...report.onRoster, ...report.offRoster]
    const targets = userIds
        ? allEntries.filter(e => userIds.includes(e.userId))
        : allEntries.filter(e => e.status !== 'green')

    let discordGranted = 0, discordRevoked = 0, tsGranted = 0, tsRevoked = 0

    await Promise.all(targets.map(async entry => {
        const discordToGrant = entry.discord.missing.map(g => String(g.id))
        const discordToRevoke = entry.discord.extra.map(g => String(g.id))
        const tsToGrant = entry.teamspeak.missing.map(g => Number(g.id))
        const tsToRevoke = entry.teamspeak.extra.map(g => Number(g.id))

        discordGranted += discordToGrant.length
        discordRevoked += discordToRevoke.length
        tsGranted += tsToGrant.length
        tsRevoked += tsToRevoke.length

        await Promise.allSettled([
            ...discordToGrant.map(id => addGuildRole(entry.userId, id)),
            ...discordToRevoke.map(id => removeGuildRole(entry.userId, id)),
            tsToGrant.length ? applyTsServerGroups(entry.userId, 'add', tsToGrant) : Promise.resolve(),
            tsToRevoke.length ? applyTsServerGroups(entry.userId, 'remove', tsToRevoke) : Promise.resolve(),
        ])
    }))

    return { membersChecked: targets.length, discordGranted, discordRevoked, tsGranted, tsRevoked }
}
```

- [ ] **Step 2: Write `app/api/admin/orbat/member-sync/apply/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { applyMemberSyncFixes } from '@/lib/orbat/member-sync'
import { logAction } from '@/lib/logs'

// POST /api/admin/orbat/member-sync/apply — body: { userIds?: string[] }
// Omitted userIds = every currently out-of-sync member (Sync All). Present =
// just those (per-member Sync button sends a single-element array).
export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const userIds: string[] | undefined = Array.isArray(body?.userIds)
        ? body.userIds.filter((id: unknown): id is string => typeof id === 'string')
        : undefined

    const result = await applyMemberSyncFixes(userIds)

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'member.sync.apply',
        category: 'member',
        performedBy: me.id,
        performedByName,
        target: userIds ? userIds.join(',') : 'ALL',
        details: result,
    }).catch(() => {})

    return NextResponse.json(result)
}
```

- [ ] **Step 3: Add the permission-gate tests**

Append to `apps/web/tests/member-sync.spec.ts`:

```ts
test.describe('POST /api/admin/orbat/member-sync/apply', () => {
    test('rejects an anonymous caller', async ({ request }) => {
        expect((await request.post('/api/admin/orbat/member-sync/apply')).status()).toBe(401)
    })

    test('rejects an ordinary department member', async ({ memberPage }) => {
        expect((await memberPage.request.post('/api/admin/orbat/member-sync/apply')).status()).toBe(403)
    })

    test('passes the gate for an authorized caller', async ({ adminPage }) => {
        const res = await adminPage.request.post('/api/admin/orbat/member-sync/apply', { data: {} })
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })
})
```

- [ ] **Step 4: Run the spec**

Run: `npx playwright test member-sync.spec.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/orbat/member-sync.ts apps/web/app/api/admin/orbat/member-sync/apply/route.ts apps/web/tests/member-sync.spec.ts
git commit -m "feat(orbat): add member sync apply computation + POST route"
```

---

### Task 3: Wire the "Member Sync" tab into Roles Manager

**Files:**
- Modify: `apps/web/app/dashboard/orbat/RolesManagerPanel.tsx`

**Interfaces:**
- Consumes: none yet (renders a placeholder; Task 4 replaces it with the real component)

- [ ] **Step 1: Add the tab to the union type and tab bar**

In `RolesManagerPanel.tsx`, change:

```ts
    const [tab, setTab] = useState<'orbat' | 'department' | 'permissions'>('orbat')
```
to:
```ts
    const [tab, setTab] = useState<'orbat' | 'department' | 'permissions' | 'member-sync'>('orbat')
```

And change `switchTab`'s parameter type the same way:
```ts
    function switchTab(next: 'orbat' | 'department' | 'permissions' | 'member-sync') {
```

Add a fourth tab button after the "Permissions Explorer" one:
```tsx
                <Button disableRipple onClick={() => switchTab('permissions')} sx={tabButtonSx(tab === 'permissions')}>Permissions Explorer</Button>
                <Button disableRipple onClick={() => switchTab('member-sync')} sx={tabButtonSx(tab === 'member-sync')}>Member Sync</Button>
```

- [ ] **Step 2: Render a placeholder for the new tab**

Add below the existing `{tab === 'permissions' && ...}` line inside `DialogContent`:
```tsx
                {tab === 'member-sync' && <div style={{ padding: 24, color: 'rgba(237,237,237,0.4)', fontSize: '0.8rem' }}>Loading…</div>}
```

- [ ] **Step 3: Verify the tab switches without errors**

Run: `npm run dev` (from `apps/web`), sign in as a J4 user in a browser, open ORBAT → Roles Manager, click "Member Sync".
Expected: tab switches, placeholder text shows, no console errors. Stop the dev server after confirming.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/orbat/RolesManagerPanel.tsx
git commit -m "feat(orbat): add Member Sync tab placeholder to Roles Manager"
```

---

### Task 4: Member Sync tab — report display

**Files:**
- Create: `apps/web/app/dashboard/orbat/MemberSyncTab.tsx`
- Modify: `apps/web/app/dashboard/orbat/RolesManagerPanel.tsx`
- Test: `apps/web/tests/member-sync.spec.ts`

**Interfaces:**
- Consumes: `MemberSyncEntry`, `MemberSyncReport`, `GrantDetail` (type-only, from Task 1's `lib/orbat/member-sync.ts`)
- Produces (consumed by Task 5): the `MemberSyncTab` component itself, plus its internal `STATUS_STYLE`, `MemberRow` — Task 5 edits this same file to add sync buttons/dialogs, so keep these easy to extend (don't inline `MemberRow` anonymously).

- [ ] **Step 1: Write `MemberSyncTab.tsx`**

```tsx
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Box, Typography, Button, CircularProgress, Alert, Collapse, IconButton } from '@mui/material'
import { ExpandMore, ExpandLess, Refresh } from '@mui/icons-material'
import type { MemberSyncEntry, MemberSyncReport, GrantDetail } from '@/lib/orbat/member-sync'

const STATUS_STYLE: Record<MemberSyncEntry['status'], { label: string; color: string; bg: string; border: string }> = {
    red: { label: 'Missing', color: 'rgba(239,68,68,0.95)', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)' },
    orange: { label: 'Extra', color: 'rgba(251,146,60,0.95)', bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.4)' },
    green: { label: 'In sync', color: 'rgba(74,222,128,0.95)', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.35)' },
}

const STATUS_ORDER: Record<MemberSyncEntry['status'], number> = { red: 0, orange: 1, green: 2 }

function sortEntries(entries: MemberSyncEntry[]): MemberSyncEntry[] {
    return [...entries].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name))
}

function issueCount(entry: MemberSyncEntry): number {
    return entry.discord.missing.length + entry.discord.extra.length + entry.teamspeak.missing.length + entry.teamspeak.extra.length
}

function GrantDetailList({ title, items, tone }: { title: string; items: GrantDetail[]; tone: 'red' | 'orange' }) {
    if (!items.length) return null
    const color = tone === 'red' ? 'rgba(239,68,68,0.9)' : 'rgba(251,146,60,0.9)'
    return (
        <Box sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color }}>
                {title}
            </Typography>
            {items.map((item, i) => (
                <Typography key={`${item.id}-${i}`} sx={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.75)', pl: 1 }}>
                    {item.name} <span style={{ color: 'rgba(237,237,237,0.4)' }}>— {item.source}</span>
                </Typography>
            ))}
        </Box>
    )
}

function MemberRow({ entry, expanded, onToggle }: { entry: MemberSyncEntry; expanded: boolean; onToggle: () => void }) {
    const style = STATUS_STYLE[entry.status]
    const count = issueCount(entry)

    return (
        <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <Box
                onClick={onToggle}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, cursor: 'pointer',
                    '&:hover': { background: 'rgba(255,255,255,0.03)' },
                }}
            >
                <IconButton size='small' sx={{ p: 0.2 }}>
                    {expanded ? <ExpandLess sx={{ fontSize: 16, color: 'rgba(237,237,237,0.5)' }} /> : <ExpandMore sx={{ fontSize: 16, color: 'rgba(237,237,237,0.5)' }} />}
                </IconButton>
                <Typography sx={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.85)', flex: 1 }}>{entry.name}</Typography>
                {!entry.teamspeak.linked && (
                    <Typography sx={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic' }}>TeamSpeak not linked</Typography>
                )}
                <Box sx={{
                    fontSize: '0.62rem', fontWeight: 700, letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999,
                    color: style.color, background: style.bg, border: `1px solid ${style.border}`,
                }}>
                    {style.label}{entry.status !== 'green' && ` (${count})`}
                </Box>
            </Box>
            <Collapse in={expanded}>
                <Box sx={{ px: 2, pb: 1.5, pl: 5.5 }}>
                    {entry.status === 'green' ? (
                        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', fontStyle: 'italic' }}>No issues.</Typography>
                    ) : (
                        <>
                            <GrantDetailList title='Missing Discord roles' items={entry.discord.missing} tone='red' />
                            <GrantDetailList title='Extra Discord roles' items={entry.discord.extra} tone='orange' />
                            <GrantDetailList title='Missing TeamSpeak groups' items={entry.teamspeak.missing} tone='red' />
                            <GrantDetailList title='Extra TeamSpeak groups' items={entry.teamspeak.extra} tone='orange' />
                        </>
                    )}
                </Box>
            </Collapse>
        </Box>
    )
}

export default function MemberSyncTab() {
    const [report, setReport] = useState<MemberSyncReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [offRosterExpanded, setOffRosterExpanded] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/admin/orbat/member-sync')
            const data = await res.json().catch(() => ({}))
            if (!res.ok) { setError(data.error ?? 'Failed to load member sync report'); setReport(null); return }
            setReport(data as MemberSyncReport)
        } catch {
            setError('Failed to load member sync report')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    function toggleExpand(userId: string) {
        setExpandedIds(prev => {
            const next = new Set(prev)
            next.has(userId) ? next.delete(userId) : next.add(userId)
            return next
        })
    }

    const onRosterSorted = useMemo(() => report ? sortEntries(report.onRoster) : [], [report])
    const offRosterFlagged = useMemo(() => report ? report.offRoster.filter(e => e.status !== 'green') : [], [report])
    const offRosterSorted = useMemo(() => sortEntries(offRosterFlagged), [offRosterFlagged])

    return (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: 1, color: 'rgba(237,237,237,0.5)', flex: 1 }}>
                    Discord / TeamSpeak grant drift across every member
                </Typography>
                <Button size='small' variant='outlined' startIcon={<Refresh sx={{ fontSize: 15 }} />} onClick={load} disabled={loading}
                    sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.7)' }}>
                    Refresh
                </Button>
            </Box>

            {error && <Alert severity='error' sx={{ fontSize: '0.72rem', borderRadius: 0 }}>{error}</Alert>}

            {loading ? (
                <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <CircularProgress size={26} />
                </Box>
            ) : report && (
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, color: 'rgba(219,0,29,0.75)', px: 2, pt: 1.5, pb: 0.5, textTransform: 'uppercase' }}>
                        On Roster ({onRosterSorted.length})
                    </Typography>
                    {onRosterSorted.map(entry => (
                        <MemberRow key={entry.userId} entry={entry} expanded={expandedIds.has(entry.userId)} onToggle={() => toggleExpand(entry.userId)} />
                    ))}
                    {onRosterSorted.length === 0 && (
                        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic', px: 2, py: 1 }}>No on-roster members.</Typography>
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 2, pb: 0.5 }}>
                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, color: 'rgba(219,0,29,0.75)', textTransform: 'uppercase' }}>
                            Off Roster
                        </Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.45)' }}>
                            {offRosterFlagged.length} member(s) with stray grants
                        </Typography>
                        {offRosterFlagged.length > 0 && (
                            <Button size='small' onClick={() => setOffRosterExpanded(v => !v)} sx={{ fontSize: '0.65rem', color: 'rgba(100,180,255,0.85)' }}>
                                {offRosterExpanded ? 'Hide' : 'Show'}
                            </Button>
                        )}
                    </Box>
                    <Collapse in={offRosterExpanded}>
                        {offRosterSorted.map(entry => (
                            <MemberRow key={entry.userId} entry={entry} expanded={expandedIds.has(entry.userId)} onToggle={() => toggleExpand(entry.userId)} />
                        ))}
                    </Collapse>
                </Box>
            )}
        </Box>
    )
}
```

- [ ] **Step 2: Wire it into `RolesManagerPanel.tsx`**

Add the import near the other tab imports:
```ts
import MemberSyncTab from './MemberSyncTab'
```

Replace the placeholder from Task 3 with:
```tsx
                {tab === 'member-sync' && <MemberSyncTab />}
```

- [ ] **Step 3: Write the UI test — mock the report, verify rendering**

Append to `apps/web/tests/member-sync.spec.ts`:

```ts
test.describe('Member Sync tab UI', () => {
    const SAMPLE_REPORT = {
        onRoster: [
            {
                userId: 'u1', name: 'Red Member', avatarURL: '', onRoster: true, status: 'red',
                discord: { missing: [{ id: 'd1', name: 'J4 - Administration', source: 'Department: J4 base role' }], extra: [] },
                teamspeak: { missing: [], extra: [], linked: true },
            },
            {
                userId: 'u2', name: 'Orange Member', avatarURL: '', onRoster: true, status: 'orange',
                discord: { missing: [], extra: [{ id: 'd2', name: 'Old Role', source: 'Not expected from any current department or ORBAT role' }] },
                teamspeak: { missing: [], extra: [], linked: true },
            },
            {
                userId: 'u3', name: 'Green Member', avatarURL: '', onRoster: true, status: 'green',
                discord: { missing: [], extra: [] },
                teamspeak: { missing: [], extra: [], linked: false },
            },
        ],
        offRoster: [
            {
                userId: 'u4', name: 'Stray Member', avatarURL: '', onRoster: false, status: 'orange',
                discord: { missing: [], extra: [{ id: 'd3', name: 'Leftover Role', source: 'Not expected from any current department or ORBAT role' }] },
                teamspeak: { missing: [], extra: [], linked: true },
            },
        ],
    }

    test('renders status pills and expands to show missing/extra details', async ({ adminPage }) => {
        await adminPage.route('**/api/admin/orbat/member-sync', route => route.fulfill({ json: SAMPLE_REPORT }))

        await adminPage.goto('/dashboard/orbat')
        await adminPage.getByRole('button', { name: /roles manager/i }).click()
        await adminPage.getByRole('button', { name: 'Member Sync' }).click()

        await expect(adminPage.getByText('Red Member')).toBeVisible()
        await expect(adminPage.getByText('Missing (1)')).toBeVisible()
        await expect(adminPage.getByText('Orange Member')).toBeVisible()
        await expect(adminPage.getByText('Extra (1)')).toBeVisible()
        await expect(adminPage.getByText('Green Member')).toBeVisible()
        await expect(adminPage.getByText('TeamSpeak not linked')).toBeVisible()

        // On-roster count and off-roster summary
        await expect(adminPage.getByText('On Roster (3)')).toBeVisible()
        await expect(adminPage.getByText('1 member(s) with stray grants')).toBeVisible()
        await expect(adminPage.getByText('Stray Member')).not.toBeVisible()

        // Expand the red member's row
        await adminPage.getByText('Red Member').click()
        await expect(adminPage.getByText('J4 - Administration', { exact: false })).toBeVisible()
        await expect(adminPage.getByText('Department: J4 base role', { exact: false })).toBeVisible()

        // Expand off-roster
        await adminPage.getByRole('button', { name: 'Show' }).click()
        await expect(adminPage.getByText('Stray Member')).toBeVisible()
    })
})
```

- [ ] **Step 4: Run the spec**

Run: `npx playwright test member-sync.spec.ts`
Expected: 7 passed. If the "Roles Manager" or tab button names don't match what's actually rendered (check `OrbatManager.tsx` for the exact button that opens `RolesManagerPanel`), adjust the `getByRole` selector to match — don't change the component just to satisfy the test.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/orbat/MemberSyncTab.tsx apps/web/app/dashboard/orbat/RolesManagerPanel.tsx apps/web/tests/member-sync.spec.ts
git commit -m "feat(orbat): render Member Sync report as expandable status lists"
```

---

### Task 5: Member Sync tab — confirm-then-apply actions

**Files:**
- Modify: `apps/web/app/dashboard/orbat/MemberSyncTab.tsx`
- Test: `apps/web/tests/member-sync.spec.ts`

**Interfaces:**
- Consumes: `MemberSyncApplyResult` (type-only, from Task 2), `MemberSyncEntry`/`MemberSyncReport` (Task 1), `MemberRow`/`STATUS_STYLE` (Task 4, same file)

- [ ] **Step 1: Add a confirmation dialog and sync actions to `MemberSyncTab.tsx`**

Add these imports to the top of the file, alongside the existing MUI imports:
```ts
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
```

Add a `onSync` prop to `MemberRow` and a Sync button in its header row. Replace the `MemberRow` function with:

```tsx
function MemberRow({ entry, expanded, onToggle, onSync }: { entry: MemberSyncEntry; expanded: boolean; onToggle: () => void; onSync: (entry: MemberSyncEntry) => void }) {
    const style = STATUS_STYLE[entry.status]
    const count = issueCount(entry)

    return (
        <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <Box
                onClick={onToggle}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, cursor: 'pointer',
                    '&:hover': { background: 'rgba(255,255,255,0.03)' },
                }}
            >
                <IconButton size='small' sx={{ p: 0.2 }}>
                    {expanded ? <ExpandLess sx={{ fontSize: 16, color: 'rgba(237,237,237,0.5)' }} /> : <ExpandMore sx={{ fontSize: 16, color: 'rgba(237,237,237,0.5)' }} />}
                </IconButton>
                <Typography sx={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.85)', flex: 1 }}>{entry.name}</Typography>
                {!entry.teamspeak.linked && (
                    <Typography sx={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic' }}>TeamSpeak not linked</Typography>
                )}
                <Box sx={{
                    fontSize: '0.62rem', fontWeight: 700, letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999,
                    color: style.color, background: style.bg, border: `1px solid ${style.border}`,
                }}>
                    {style.label}{entry.status !== 'green' && ` (${count})`}
                </Box>
                {entry.status !== 'green' && (
                    <Button size='small' variant='outlined' onClick={e => { e.stopPropagation(); onSync(entry) }}
                        sx={{ fontSize: '0.62rem', letterSpacing: 0.5, borderColor: 'rgba(100,180,255,0.4)', color: 'rgba(100,180,255,0.85)' }}>
                        Sync
                    </Button>
                )}
            </Box>
            <Collapse in={expanded}>
                <Box sx={{ px: 2, pb: 1.5, pl: 5.5 }}>
                    {entry.status === 'green' ? (
                        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', fontStyle: 'italic' }}>No issues.</Typography>
                    ) : (
                        <>
                            <GrantDetailList title='Missing Discord roles' items={entry.discord.missing} tone='red' />
                            <GrantDetailList title='Extra Discord roles' items={entry.discord.extra} tone='orange' />
                            <GrantDetailList title='Missing TeamSpeak groups' items={entry.teamspeak.missing} tone='red' />
                            <GrantDetailList title='Extra TeamSpeak groups' items={entry.teamspeak.extra} tone='orange' />
                        </>
                    )}
                </Box>
            </Collapse>
        </Box>
    )
}
```

Add a shared diff-preview renderer (place above the `MemberSyncTab` function, below `MemberRow`):

```tsx
function DiffPreview({ entries }: { entries: MemberSyncEntry[] }) {
    return (
        <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
            {entries.map(entry => (
                <Box key={entry.userId} sx={{ mb: 1.5 }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)' }}>{entry.name}</Typography>
                    <GrantDetailList title='Grant (Discord)' items={entry.discord.missing} tone='red' />
                    <GrantDetailList title='Revoke (Discord)' items={entry.discord.extra} tone='orange' />
                    <GrantDetailList title='Grant (TeamSpeak)' items={entry.teamspeak.missing} tone='red' />
                    <GrantDetailList title='Revoke (TeamSpeak)' items={entry.teamspeak.extra} tone='orange' />
                </Box>
            ))}
        </Box>
    )
}
```

Replace the body of `MemberSyncTab` to add state, the apply call, and the confirmation dialog. Full replacement:

```tsx
export default function MemberSyncTab() {
    const [report, setReport] = useState<MemberSyncReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [offRosterExpanded, setOffRosterExpanded] = useState(false)
    const [confirmTarget, setConfirmTarget] = useState<{ kind: 'all'; entries: MemberSyncEntry[] } | { kind: 'member'; entries: MemberSyncEntry[] } | null>(null)
    const [applying, setApplying] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/admin/orbat/member-sync')
            const data = await res.json().catch(() => ({}))
            if (!res.ok) { setError(data.error ?? 'Failed to load member sync report'); setReport(null); return }
            setReport(data as MemberSyncReport)
        } catch {
            setError('Failed to load member sync report')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    function toggleExpand(userId: string) {
        setExpandedIds(prev => {
            const next = new Set(prev)
            next.has(userId) ? next.delete(userId) : next.add(userId)
            return next
        })
    }

    const allEntries = useMemo(() => report ? [...report.onRoster, ...report.offRoster] : [], [report])
    const outOfSync = useMemo(() => allEntries.filter(e => e.status !== 'green'), [allEntries])
    const onRosterSorted = useMemo(() => report ? sortEntries(report.onRoster) : [], [report])
    const offRosterFlagged = useMemo(() => report ? report.offRoster.filter(e => e.status !== 'green') : [], [report])
    const offRosterSorted = useMemo(() => sortEntries(offRosterFlagged), [offRosterFlagged])

    async function applyConfirmed() {
        if (!confirmTarget) return
        setApplying(true)
        setError(null)
        try {
            const userIds = confirmTarget.kind === 'member' ? confirmTarget.entries.map(e => e.userId) : undefined
            const res = await fetch('/api/admin/orbat/member-sync/apply', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) { setError(data.error ?? 'Sync failed'); return }
            setConfirmTarget(null)
            await load()
        } catch {
            setError('Sync failed')
        } finally {
            setApplying(false)
        }
    }

    return (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: 1, color: 'rgba(237,237,237,0.5)', flex: 1 }}>
                    Discord / TeamSpeak grant drift across every member
                </Typography>
                <Button size='small' variant='contained' disabled={loading || outOfSync.length === 0}
                    onClick={() => setConfirmTarget({ kind: 'all', entries: outOfSync })}
                    sx={{ background: 'var(--red)', fontWeight: 700, letterSpacing: 1, fontSize: '0.65rem', '&:hover': { background: 'rgba(219,0,29,0.85)' } }}>
                    Sync All ({outOfSync.length})
                </Button>
                <Button size='small' variant='outlined' startIcon={<Refresh sx={{ fontSize: 15 }} />} onClick={load} disabled={loading}
                    sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.7)' }}>
                    Refresh
                </Button>
            </Box>

            {error && <Alert severity='error' sx={{ fontSize: '0.72rem', borderRadius: 0 }}>{error}</Alert>}

            {loading ? (
                <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <CircularProgress size={26} />
                </Box>
            ) : report && (
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, color: 'rgba(219,0,29,0.75)', px: 2, pt: 1.5, pb: 0.5, textTransform: 'uppercase' }}>
                        On Roster ({onRosterSorted.length})
                    </Typography>
                    {onRosterSorted.map(entry => (
                        <MemberRow key={entry.userId} entry={entry} expanded={expandedIds.has(entry.userId)}
                            onToggle={() => toggleExpand(entry.userId)}
                            onSync={e => setConfirmTarget({ kind: 'member', entries: [e] })} />
                    ))}
                    {onRosterSorted.length === 0 && (
                        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic', px: 2, py: 1 }}>No on-roster members.</Typography>
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 2, pb: 0.5 }}>
                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, color: 'rgba(219,0,29,0.75)', textTransform: 'uppercase' }}>
                            Off Roster
                        </Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.45)' }}>
                            {offRosterFlagged.length} member(s) with stray grants
                        </Typography>
                        {offRosterFlagged.length > 0 && (
                            <Button size='small' onClick={() => setOffRosterExpanded(v => !v)} sx={{ fontSize: '0.65rem', color: 'rgba(100,180,255,0.85)' }}>
                                {offRosterExpanded ? 'Hide' : 'Show'}
                            </Button>
                        )}
                    </Box>
                    <Collapse in={offRosterExpanded}>
                        {offRosterSorted.map(entry => (
                            <MemberRow key={entry.userId} entry={entry} expanded={expandedIds.has(entry.userId)}
                                onToggle={() => toggleExpand(entry.userId)}
                                onSync={e => setConfirmTarget({ kind: 'member', entries: [e] })} />
                        ))}
                    </Collapse>
                </Box>
            )}

            <Dialog open={!!confirmTarget} onClose={() => !applying && setConfirmTarget(null)} maxWidth='sm' fullWidth
                PaperProps={{ style: { background: 'var(--background, #0a0a0a)', border: '1px solid rgba(219,0,29,0.32)' } }}>
                <DialogTitle sx={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    {confirmTarget?.kind === 'all' ? `Sync ${confirmTarget.entries.length} member(s)?` : `Sync ${confirmTarget?.entries[0]?.name}?`}
                </DialogTitle>
                <DialogContent>
                    {confirmTarget && <DiffPreview entries={confirmTarget.entries} />}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmTarget(null)} disabled={applying} sx={{ color: 'rgba(237,237,237,0.6)' }}>Cancel</Button>
                    <Button onClick={applyConfirmed} disabled={applying} variant='contained'
                        sx={{ background: 'var(--red)', fontWeight: 700, '&:hover': { background: 'rgba(219,0,29,0.85)' } }}>
                        {applying ? 'Syncing…' : 'Confirm Sync'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
```

- [ ] **Step 2: Write the sync-action UI test**

Append to `apps/web/tests/member-sync.spec.ts`, inside the `'Member Sync tab UI'` describe block:

```ts
    test('per-member Sync opens a confirmation dialog showing the diff, then applies and reloads', async ({ adminPage }) => {
        let getCalls = 0
        await adminPage.route('**/api/admin/orbat/member-sync', route => {
            getCalls++
            route.fulfill({ json: SAMPLE_REPORT })
        })
        let applyBody: unknown = null
        await adminPage.route('**/api/admin/orbat/member-sync/apply', async route => {
            applyBody = route.request().postDataJSON()
            await route.fulfill({ json: { membersChecked: 1, discordGranted: 1, discordRevoked: 0, tsGranted: 0, tsRevoked: 0 } })
        })

        await adminPage.goto('/dashboard/orbat')
        await adminPage.getByRole('button', { name: /roles manager/i }).click()
        await adminPage.getByRole('button', { name: 'Member Sync' }).click()

        // Rows aren't semantic <tr>s. Multiple ancestor divs contain "Red Member"
        // (the row wrapper, the header row, the list container...) — .last() picks
        // the innermost one (the row's own flex header), which is the only div that
        // contains Red Member's Sync button but not Orange Member's.
        const redRow = adminPage.locator('div', { hasText: 'Red Member' }).last()
        await redRow.getByRole('button', { name: 'Sync' }).click()

        await expect(adminPage.getByText('Sync Red Member?')).toBeVisible()
        await expect(adminPage.getByText('Grant (Discord)')).toBeVisible()
        await expect(adminPage.getByText('J4 - Administration', { exact: false })).toBeVisible()

        await adminPage.getByRole('button', { name: 'Confirm Sync' }).click()
        await expect(adminPage.getByText('Sync Red Member?')).not.toBeVisible()

        expect(applyBody).toEqual({ userIds: ['u1'] })
        expect(getCalls).toBeGreaterThanOrEqual(2) // initial load + reload after apply
    })

    test('Sync All is disabled when nothing is out of sync', async ({ adminPage }) => {
        const ALL_GREEN = { onRoster: [SAMPLE_REPORT.onRoster[2]], offRoster: [] }
        await adminPage.route('**/api/admin/orbat/member-sync', route => route.fulfill({ json: ALL_GREEN }))

        await adminPage.goto('/dashboard/orbat')
        await adminPage.getByRole('button', { name: /roles manager/i }).click()
        await adminPage.getByRole('button', { name: 'Member Sync' }).click()

        await expect(adminPage.getByRole('button', { name: /Sync All/ })).toBeDisabled()
    })
```

- [ ] **Step 3: Run the full spec file**

Run: `npx playwright test member-sync.spec.ts`
Expected: 9 passed. If a locator doesn't match (e.g. the "Roles Manager" open-button's accessible name, or the row structure for finding "Red Member"'s Sync button), inspect the actual rendered DOM with `npx playwright test member-sync.spec.ts --headed --debug` and fix the *test's* selector — don't change component structure just to satisfy a test unless the structure is genuinely wrong.

- [ ] **Step 4: Run the entire E2E suite once to check for regressions**

Run: `npx playwright test`
Expected: all previously-passing specs still pass (this task only added new files/routes and a new tab — it shouldn't affect `dashboard.spec.ts`, `dashboard.permissions.spec.ts`, `devmode.spec.ts`, or `hidden-functions.spec.ts`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/orbat/MemberSyncTab.tsx apps/web/tests/member-sync.spec.ts
git commit -m "feat(orbat): add confirm-then-apply Sync/Sync All actions to Member Sync tab"
```
