# Permissions Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a J4-only "Permissions Explorer" panel on the J4 dashboard that visualizes the entire `PERMISSIONS` access-control map as a searchable tree (with live member counts) and lets J4 look up any individual member to see exactly what they can access and why.

**Architecture:** A pure server-side computation module (`lib/permissions/tree.ts`) resolves Discord roles, `Db.users`, `Db.orbatPositions`, and `Db.orbatRoles` into two shapes — a full category tree with counts, and a per-member grant breakdown — reusing the same additive logic as the existing `hasPermission()` helper. Two thin API routes expose these. A single client component (`PermissionsExplorerPanel.tsx`) renders both views, following the visual and interaction patterns already established by `RolesManagerPanel.tsx`.

**Tech Stack:** Next.js 15 App Router, MongoDB driver via `Db` (`lib/mongo.ts`), MUI components, TypeScript. No test runner exists in this repo (confirmed: no jest/vitest/playwright-for-units in `package.json`) — verification is `npx tsc --noEmit` for every code task, plus manual browser verification via the `run` skill for UI tasks.

## Global Constraints

- Read-only feature — no task in this plan may add editing/mutation capability. All new routes are `GET` only.
- Gate everything behind the new key `PERMISSIONS.admin.viewPermissionsTree = ['J4 - Administration']` — do not reuse a broader gate.
- All data is computed live per-request from current DB state — no caching layer, no snapshotting.
- No new MongoDB collections — only reads against `Db.users`, `Db.roles`, `Db.orbatPositions`, `Db.orbatRoles`.
- Follow existing code style exactly: 4-space indent, single quotes, no semicolons, dark-theme inline `style`/`sx` matching `RolesManagerPanel.tsx` and `J4AdminPanel.tsx`.
- No automated test suite exists in this repo. Every task's verification step is `npx tsc --noEmit -p tsconfig.json` (run from `apps/web`) plus, where noted, a manual check via the `run` skill or direct browser navigation.

---

## File Structure

- **Modify:** `apps/web/lib/permissions.ts` — add the new gating key.
- **Create:** `apps/web/lib/permissions/tree.ts` — shared resolution pass + `buildPermissionsTree()` + `buildMemberGrants()`.
- **Create:** `apps/web/app/api/admin/permissions/tree/route.ts` — `GET`, full tree.
- **Create:** `apps/web/app/api/admin/permissions/member/[id]/route.ts` — `GET`, one member's grants.
- **Create:** `apps/web/app/dashboard/j4/PermissionsExplorerPanel.tsx` — the Dialog UI (both modes).
- **Modify:** `apps/web/app/dashboard/j4/J4AdminPanel.tsx` — add the entry-point tile.

---

### Task 1: Add the `admin.viewPermissionsTree` permission key

**Files:**
- Modify: `apps/web/lib/permissions.ts:339` (immediately after the `manageOrbatRoles` block, before `massImport`)

**Interfaces:**
- Produces: `PERMISSIONS.admin.viewPermissionsTree: string[]` — consumed by Task 3 and Task 4's route gates.

- [ ] **Step 1: Add the key**

In `apps/web/lib/permissions.ts`, find this existing block:

```ts
        /**
         * ORBAT Roles catalog — create, edit, and delete the predefined
         * position-role definitions (name, category scope, Discord roles,
         * granted site permissions) used by the ORBAT Roles Manager panel.
         *
         * Used by:
         *  - `app/dashboard/orbat/RolesManagerPanel.tsx` (panel visibility)
         *  - `app/api/admin/orbat/roles/route.ts` (POST)
         *  - `app/api/admin/orbat/roles/[roleId]/route.ts` (PATCH/DELETE)
         */
        manageOrbatRoles: ['J4 - Administration'],
```

Insert immediately after it (still inside `admin: { ... }`, before the `massImport` block):

```ts

        /**
         * Permissions Explorer — read-only visualization of the entire
         * PERMISSIONS catalog (which Discord roles / ORBAT Roles grant each
         * key, and live member counts), plus per-member lookup. J4 only,
         * since it exposes the full access-control map of the site.
         *
         * Used by:
         *  - `app/dashboard/j4/PermissionsExplorerPanel.tsx` (panel visibility)
         *  - `app/api/admin/permissions/tree/route.ts`
         *  - `app/api/admin/permissions/member/[id]/route.ts`
         */
        viewPermissionsTree: ['J4 - Administration'],
```

- [ ] **Step 2: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors (this is a pure data addition, `satisfies Record<string, Record<string, string[]>>` at the bottom of the file will catch any typo in shape).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/permissions.ts
git commit -m "Add admin.viewPermissionsTree permission key"
```

---

### Task 2: Build the permissions-tree computation module

**Files:**
- Create: `apps/web/lib/permissions/tree.ts`

**Interfaces:**
- Consumes: `Db` from `@/lib/mongo` (`Db.users`, `Db.roles`, `Db.orbatPositions`, `Db.orbatRoles`); `PERMISSION_CATALOG: Record<string,string[]>` and `PERMISSION_KEYS: string[]` from `@/lib/permissions-catalog`.
- Produces (consumed by Task 3 and Task 4):
  - `interface PermissionDiscordRole { id: string; name: string; color: number; resolved: boolean }`
  - `interface PermissionOrbatRole { id: string; name: string }`
  - `interface PermissionNodeStatic { key: string; discordRoles: PermissionDiscordRole[]; orbatRoles: PermissionOrbatRole[]; memberCount: number }`
  - `interface PermissionCategory { key: string; label: string; permissions: PermissionNodeStatic[] }`
  - `interface PermissionGrant { granted: boolean; viaDiscordRoles: string[]; viaOrbatRole: string | null; viaGlobalOverride: boolean }`
  - `async function buildPermissionsTree(): Promise<PermissionCategory[]>`
  - `async function buildMemberGrants(userId: string): Promise<Record<string, PermissionGrant> | null>` — `null` means the user doesn't exist or is discharged/skeleton.

- [ ] **Step 1: Write the module**

Create `apps/web/lib/permissions/tree.ts`:

```ts
import Db from '@/lib/mongo'
import { PERMISSION_CATALOG, PERMISSION_KEYS } from '@/lib/permissions-catalog'

export interface PermissionDiscordRole {
    id: string
    name: string
    color: number
    resolved: boolean
}

export interface PermissionOrbatRole {
    id: string
    name: string
}

export interface PermissionNodeStatic {
    key: string
    discordRoles: PermissionDiscordRole[]
    orbatRoles: PermissionOrbatRole[]
    memberCount: number
}

export interface PermissionCategory {
    key: string
    label: string
    permissions: PermissionNodeStatic[]
}

export interface PermissionGrant {
    granted: boolean
    viaDiscordRoles: string[]
    viaOrbatRole: string | null
    viaGlobalOverride: boolean
}

interface ResolvedState {
    userIds: string[]
    userIdToRoleNames: Map<string, Set<string>>
    userIdToOrbatRoleId: Map<string, string>
    orbatRoleIdToDoc: Map<string, { name: string; permissions: string[] }>
    roleNameToDoc: Map<string, { id: string; name: string; color: number }>
    overrideUserIds: Set<string>
}

// Shared by buildPermissionsTree() and buildMemberGrants() so both compute
// grants with identical logic to hasPermission() — additive: a global
// Discord-role bypass, OR a qualifying Discord role, OR an ORBAT position
// whose Role grants the key.
async function resolveState(): Promise<ResolvedState> {
    const [users, discordRoles, positions, orbatRoles] = await Promise.all([
        Db.users.find(
            { discharged: { $exists: false }, isSkeletonAccount: { $ne: true } },
            { projection: { id: 1, 'guild.roles': 1 } }
        ).toArray(),
        Db.roles.find({}).toArray(),
        Db.orbatPositions.find(
            { roleId: { $ne: null }, userId: { $ne: null } },
            { projection: { userId: 1, roleId: 1 } }
        ).toArray(),
        Db.orbatRoles.find({}, { projection: { name: 1, permissions: 1 } }).toArray(),
    ])

    const roleIdToDoc = new Map(discordRoles.map(r => [r.id, r]))
    const roleNameToDoc = new Map(discordRoles.map(r => [r.name, { id: r.id, name: r.name, color: r.color }]))

    const userIdToRoleNames = new Map<string, Set<string>>()
    for (const u of users) {
        const names = new Set<string>()
        for (const roleId of u.guild?.roles ?? []) {
            const doc = roleIdToDoc.get(roleId)
            if (doc) names.add(doc.name)
        }
        userIdToRoleNames.set(u.id, names)
    }

    const orbatRoleIdToDoc = new Map(orbatRoles.map(r => [String(r._id), { name: r.name, permissions: r.permissions }]))

    const userIdToOrbatRoleId = new Map<string, string>()
    for (const pos of positions) {
        if (pos.userId && pos.roleId) userIdToOrbatRoleId.set(pos.userId, String(pos.roleId))
    }

    const overrideUserIds = new Set(
        (process.env.OVERRIDE?.split(',') ?? []).map(id => id.trim()).filter(Boolean)
    )

    return {
        userIds: users.map(u => u.id),
        userIdToRoleNames,
        userIdToOrbatRoleId,
        orbatRoleIdToDoc,
        roleNameToDoc,
        overrideUserIds,
    }
}

function resolveGrant(state: ResolvedState, userId: string, key: string): PermissionGrant {
    const roleNames = state.userIdToRoleNames.get(userId) ?? new Set<string>()
    const viaGlobalOverride = roleNames.has('J4-Administration') || state.overrideUserIds.has(userId)

    const qualifyingNames = PERMISSION_CATALOG[key] ?? []
    const viaDiscordRoles = qualifyingNames.filter(name => roleNames.has(name))

    const orbatRoleId = state.userIdToOrbatRoleId.get(userId)
    const orbatRoleDoc = orbatRoleId ? state.orbatRoleIdToDoc.get(orbatRoleId) : undefined
    const viaOrbatRole = orbatRoleDoc?.permissions.includes(key) ? orbatRoleDoc.name : null

    const granted = viaGlobalOverride || viaDiscordRoles.length > 0 || viaOrbatRole !== null

    return { granted, viaDiscordRoles, viaOrbatRole, viaGlobalOverride }
}

function categoryLabel(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
}

export async function buildPermissionsTree(): Promise<PermissionCategory[]> {
    const state = await resolveState()

    const orbatRolesByKey = new Map<string, PermissionOrbatRole[]>()
    for (const [id, doc] of state.orbatRoleIdToDoc) {
        for (const key of doc.permissions) {
            const list = orbatRolesByKey.get(key) ?? []
            list.push({ id, name: doc.name })
            orbatRolesByKey.set(key, list)
        }
    }

    const categoriesMap = new Map<string, PermissionNodeStatic[]>()
    for (const key of PERMISSION_KEYS) {
        const categoryKey = key.split('.')[0]
        const qualifyingNames = PERMISSION_CATALOG[key] ?? []

        const discordRoles: PermissionDiscordRole[] = qualifyingNames.map(name => {
            const doc = state.roleNameToDoc.get(name)
            return doc
                ? { id: doc.id, name: doc.name, color: doc.color, resolved: true }
                : { id: name, name, color: 0, resolved: false }
        })

        let memberCount = 0
        for (const userId of state.userIds) {
            if (resolveGrant(state, userId, key).granted) memberCount++
        }

        const node: PermissionNodeStatic = {
            key,
            discordRoles,
            orbatRoles: orbatRolesByKey.get(key) ?? [],
            memberCount,
        }

        const list = categoriesMap.get(categoryKey) ?? []
        list.push(node)
        categoriesMap.set(categoryKey, list)
    }

    return [...categoriesMap.entries()].map(([key, permissions]) => ({
        key,
        label: categoryLabel(key),
        permissions,
    }))
}

export async function buildMemberGrants(userId: string): Promise<Record<string, PermissionGrant> | null> {
    const exists = await Db.users.findOne(
        { id: userId, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } },
        { projection: { id: 1 } }
    )
    if (!exists) return null

    const state = await resolveState()
    const grants: Record<string, PermissionGrant> = {}
    for (const key of PERMISSION_KEYS) {
        grants[key] = resolveGrant(state, userId, key)
    }
    return grants
}
```

- [ ] **Step 2: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (Functional correctness is verified end-to-end in Task 3 and Task 4, since this module only does anything useful against a live database — there's no test runner in this repo to unit-test it in isolation.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/permissions/tree.ts
git commit -m "Add permissions tree computation module"
```

---

### Task 3: Build the tree API route

**Files:**
- Create: `apps/web/app/api/admin/permissions/tree/route.ts`

**Interfaces:**
- Consumes: `buildPermissionsTree()` from Task 2; `client` from `@/lib/discord`; `PERMISSIONS` from `@/lib/permissions`.
- Produces: `GET /api/admin/permissions/tree` → `{ categories: PermissionCategory[] }` (200), `{ error }` (401/403).

- [ ] **Step 1: Write the route**

Create `apps/web/app/api/admin/permissions/tree/route.ts`:

```ts
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { buildPermissionsTree } from '@/lib/permissions/tree'

// GET /api/admin/permissions/tree — full PERMISSIONS catalog as a category
// tree, with resolved Discord role chips, granting ORBAT Roles, and live
// member counts. J4-Administration only.
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.admin.viewPermissionsTree)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const categories = await buildPermissionsTree()
    return NextResponse.json({ categories })
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Manual verification against the live dev DB**

Run: `cd apps/web && npm run dev` (leave running), then in a browser where you're already logged into the site as a J4-Administration member, navigate to:

`http://localhost:3000/api/admin/permissions/tree`

Expected: a JSON body shaped `{ "categories": [ { "key": "pages", "label": "Pages", "permissions": [ { "key": "pages.member", "discordRoles": [...], "orbatRoles": [...], "memberCount": <number> }, ... ] }, ... ] }`. Spot-check the `attendance` category — it should contain `attendance.confirm` with `discordRoles` including `All Staff` and `HQ Staff`, and (if any ORBAT Role in the catalog has been granted `attendance.confirm` via the Roles Manager) a non-empty `orbatRoles` array. `memberCount` should be a plausible number (not 0 for a key like `pages.member`, which every ASOT Member qualifies for).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/admin/permissions/tree/route.ts
git commit -m "Add GET /api/admin/permissions/tree route"
```

---

### Task 4: Build the per-member grants API route

**Files:**
- Create: `apps/web/app/api/admin/permissions/member/[id]/route.ts`

**Interfaces:**
- Consumes: `buildMemberGrants(userId)` from Task 2; `Db` from `@/lib/mongo`.
- Produces: `GET /api/admin/permissions/member/[id]` → `{ user: { id: string; name: string }, grants: Record<string, PermissionGrant> }` (200), `{ error }` (401/403/404).

- [ ] **Step 1: Write the route**

Create `apps/web/app/api/admin/permissions/member/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { buildMemberGrants } from '@/lib/permissions/tree'

// GET /api/admin/permissions/member/[id] — one member's full permission-key
// breakdown (granted/denied + why). J4-Administration only.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.admin.viewPermissionsTree)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const target = await Db.users.findOne(
        { id, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } },
        { projection: { id: 1, name: 1, globalName: 1, username: 1, 'guild.nickname': 1, 'guild.displayName': 1 } }
    )
    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    const grants = await buildMemberGrants(id)
    if (!grants) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    const targetName =
        target.guild?.nickname || target.guild?.displayName || target.globalName || target.username || 'Unknown'

    return NextResponse.json({ user: { id: target.id, name: targetName }, grants })
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With `npm run dev` still running, open `http://localhost:3000/api/admin/members?limit=1` in the browser (while logged in as J4) to get a real member `id` from the `members[0].id` field of the response. Then navigate to:

`http://localhost:3000/api/admin/permissions/member/<that id>`

Expected: `{ "user": { "id": "...", "name": "..." }, "grants": { "pages.member": { "granted": true/false, "viaDiscordRoles": [...], "viaOrbatRole": null, "viaGlobalOverride": false }, ... } }` with one entry per key from Task 3's tree response. Also try a garbage id (e.g. `/api/admin/permissions/member/not-a-real-id`) and confirm it returns `{"error":"Member not found"}` with a 404 status.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api/admin/permissions/member/[id]/route.ts"
git commit -m "Add GET /api/admin/permissions/member/[id] route"
```

---

### Task 5: Build the Permissions Explorer panel — System Map mode, and wire the entry point

**Files:**
- Create: `apps/web/app/dashboard/j4/PermissionsExplorerPanel.tsx`
- Modify: `apps/web/app/dashboard/j4/J4AdminPanel.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/permissions/tree` (Task 3); `convertColorToHex` default export from `@/lib/discord/color`.
- Produces: `export default function PermissionsExplorerPanel({ open, onClose }: { open: boolean; onClose: () => void })` — consumed by Task 6 (extended in place) and by `J4AdminPanel.tsx`.

- [ ] **Step 1: Write the panel component (System Map mode)**

Create `apps/web/app/dashboard/j4/PermissionsExplorerPanel.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import {
    Dialog, DialogTitle, DialogContent, Divider, TextField, IconButton,
    Typography, Box, InputAdornment, CircularProgress,
} from '@mui/material'
import { Close, Search, ExpandMore, ChevronRight } from '@mui/icons-material'
import convertColorToHex from '@/lib/discord/color'

interface DiscordRoleChip { id: string; name: string; color: number; resolved: boolean }
interface OrbatRoleChip { id: string; name: string }
interface PermissionNode { key: string; discordRoles: DiscordRoleChip[]; orbatRoles: OrbatRoleChip[]; memberCount: number }
interface PermissionCategory { key: string; label: string; permissions: PermissionNode[] }

interface Props {
    open: boolean
    onClose: () => void
}

const searchFieldSx = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
}

function roleDotColor(chip: DiscordRoleChip): string {
    if (!chip.resolved) return 'rgba(255,255,255,0.15)'
    if (!chip.color) return 'rgba(255,255,255,0.3)'
    return convertColorToHex(chip.color)
}

function matchesSearch(node: PermissionNode, term: string): boolean {
    if (!term) return true
    const t = term.toLowerCase()
    if (node.key.toLowerCase().includes(t)) return true
    if (node.discordRoles.some(r => r.name.toLowerCase().includes(t))) return true
    if (node.orbatRoles.some(r => r.name.toLowerCase().includes(t))) return true
    return false
}

function DiscordChip({ chip }: { chip: DiscordRoleChip }) {
    return (
        <span
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: '0.66rem', padding: '2px 8px', borderRadius: 999,
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${chip.resolved ? 'rgba(255,255,255,0.12)' : 'rgba(255,180,0,0.35)'}`,
                color: chip.resolved ? 'rgba(237,237,237,0.75)' : 'rgba(255,180,0,0.75)',
            }}
            title={chip.resolved ? undefined : 'Role no longer found in the guild — stale reference in permissions.ts'}
        >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: roleDotColor(chip), flexShrink: 0 }} />
            {chip.name}
        </span>
    )
}

function OrbatChip({ chip }: { chip: OrbatRoleChip }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', fontSize: '0.66rem', padding: '2px 8px', borderRadius: 999,
            background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.35)', color: 'rgba(255,150,160,0.85)',
        }}>
            {chip.name}
        </span>
    )
}

function PermissionLeaf({ node }: { node: PermissionNode }) {
    const shortLabel = node.key.split('.').slice(1).join('.')
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.85)' }}>{shortLabel}</div>
                <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.35)', marginBottom: 4 }}>{node.key}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {node.discordRoles.map(r => <DiscordChip key={r.id} chip={r} />)}
                    {node.orbatRoles.map(r => <OrbatChip key={r.id} chip={r} />)}
                    {node.discordRoles.length === 0 && node.orbatRoles.length === 0 && (
                        <span style={{ fontSize: '0.66rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No roles granted</span>
                    )}
                </div>
            </div>
            <div style={{
                flexShrink: 0, fontSize: '0.72rem', fontWeight: 700, color: 'rgba(237,237,237,0.6)',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 999, padding: '3px 10px', minWidth: 28, textAlign: 'center',
            }}>
                {node.memberCount}
            </div>
        </div>
    )
}

function CategorySection({ category, search, collapsed, onToggle }: {
    category: PermissionCategory
    search: string
    collapsed: boolean
    onToggle: () => void
}) {
    const visibleNodes = category.permissions.filter(n => matchesSearch(n, search))
    if (search && visibleNodes.length === 0) return null
    const expanded = search ? true : !collapsed

    return (
        <div style={{ marginBottom: 4 }}>
            <button
                onClick={onToggle}
                style={{
                    all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    padding: '8px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                }}
            >
                {expanded
                    ? <ExpandMore sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} />
                    : <ChevronRight sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} />}
                <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.7)' }}>
                    {category.label}
                </span>
                <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)' }}>({visibleNodes.length})</span>
            </button>
            {expanded && (
                <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderTop: 'none' }}>
                    {visibleNodes.map(node => <PermissionLeaf key={node.key} node={node} />)}
                </div>
            )}
        </div>
    )
}

export default function PermissionsExplorerPanel({ open, onClose }: Props) {
    const [categories, setCategories] = useState<PermissionCategory[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

    useEffect(() => {
        if (!open) return
        setLoading(true)
        setError(null)
        fetch('/api/admin/permissions/tree')
            .then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json() })
            .then(data => {
                const cats: PermissionCategory[] = data.categories ?? []
                setCategories(cats)
                setCollapsedCategories(new Set(cats.map(c => c.key)))
            })
            .catch(() => setError('Failed to load permissions tree'))
            .finally(() => setLoading(false))
    }, [open])

    function toggleCategory(key: string) {
        setCollapsedCategories(prev => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
        })
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth='md'
            fullWidth
            PaperProps={{
                style: {
                    background: 'var(--background, #0a0a0a)',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    height: '85vh',
                },
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                <div>
                    <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', mb: 0.5 }}>
                        J4 Administration
                    </Typography>
                    <Typography fontWeight={700} fontSize='0.95rem' letterSpacing={3} sx={{ textTransform: 'uppercase' }}>
                        Permissions Explorer
                    </Typography>
                </div>
                <IconButton size='small' onClick={onClose}><Close sx={{ fontSize: 18, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
            </DialogTitle>

            <Divider sx={{ borderColor: 'rgba(219,0,29,0.42)' }} />

            <DialogContent sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>
                <TextField
                    size='small'
                    placeholder='Search permission keys or role names…'
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                    sx={searchFieldSx}
                />

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    {loading && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>
                    )}
                    {error && <Typography sx={{ fontSize: '0.78rem', color: 'rgba(219,0,29,0.8)', p: 2 }}>{error}</Typography>}
                    {!loading && !error && categories.map(cat => (
                        <CategorySection
                            key={cat.key}
                            category={cat}
                            search={search}
                            collapsed={collapsedCategories.has(cat.key)}
                            onToggle={() => toggleCategory(cat.key)}
                        />
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}
```

- [ ] **Step 2: Wire the entry point into the J4 dashboard**

In `apps/web/app/dashboard/j4/J4AdminPanel.tsx`, add the import alongside the existing tab imports:

```ts
import AIAdminTab from './tabs/AIAdminTab'
import PermissionsExplorerPanel from './PermissionsExplorerPanel'
```

Add state alongside the other panel-open flags (near `const [rolesManagerOpen, setRolesManagerOpen] = useState(false)` — this state was added when the ORBAT Manage Roles tile was wired in):

```ts
    const [permissionsExplorerOpen, setPermissionsExplorerOpen] = useState(false)
```

Add a tile in the Tools grid, immediately after the "ORBAT Manage Roles" tile:

```tsx
                                <button
                                    onClick={() => setPermissionsExplorerOpen(true)}
                                    className='flex-1 min-w-[160px]'
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                                >
                                    <div
                                        className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] transition-colors duration-200 bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(219,0,29,0.08)]'
                                        style={{ border: '1px solid rgba(219,0,29,0.42)', borderTop: '2px solid var(--red)' }}
                                    >
                                        <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase' }}>
                                            Permissions<br />Explorer
                                        </Typography>
                                    </div>
                                </button>
```

Render the panel next to the other modals at the bottom of the component:

```tsx
            <RolesManagerPanel open={rolesManagerOpen} onClose={() => setRolesManagerOpen(false)} />
            <PermissionsExplorerPanel open={permissionsExplorerOpen} onClose={() => setPermissionsExplorerOpen(false)} />
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual verification in the browser**

Use the `run` skill (or `npm run dev` if already running) to launch the app. As a J4-Administration member:
1. Navigate to `/dashboard/j4`, open the Tools tab.
2. Click the new "Permissions Explorer" tile — the Dialog should open showing a loading spinner, then the full category list (Pages, Departments, Operations, Admin, etc.), all collapsed by default.
3. Click a category header (e.g. "Attendance") — it expands to show `attendance.confirm` with its Discord role chips (`All Staff`, `HQ Staff`) and a member-count badge.
4. Type into the search box (e.g. "confirm") — only matching leaves (and their parent categories, auto-expanded) remain visible; clear the search and confirm everything collapses back to the prior state.
5. Close the dialog and reopen it — confirm it reloads cleanly (no stale state, no console errors).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/j4/PermissionsExplorerPanel.tsx apps/web/app/dashboard/j4/J4AdminPanel.tsx
git commit -m "Add Permissions Explorer panel (System Map mode) to J4 dashboard"
```

---

### Task 6: Add "Look Up Member" mode

**Files:**
- Modify: `apps/web/app/dashboard/j4/PermissionsExplorerPanel.tsx` (full rewrite of the file from Task 5)

**Interfaces:**
- Consumes: `GET /api/admin/members?search=&limit=` (existing route); `GET /api/admin/permissions/member/[id]` (Task 4).
- No new exports — `PermissionsExplorerPanel`'s props stay `{ open, onClose }`.

- [ ] **Step 1: Rewrite the component to add the mode toggle and member lookup**

Replace the entire contents of `apps/web/app/dashboard/j4/PermissionsExplorerPanel.tsx` with:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import {
    Dialog, DialogTitle, DialogContent, Divider, TextField, IconButton,
    Typography, Box, InputAdornment, CircularProgress, Autocomplete,
} from '@mui/material'
import { Close, Search, ExpandMore, ChevronRight } from '@mui/icons-material'
import convertColorToHex from '@/lib/discord/color'

interface DiscordRoleChip { id: string; name: string; color: number; resolved: boolean }
interface OrbatRoleChip { id: string; name: string }
interface PermissionNode { key: string; discordRoles: DiscordRoleChip[]; orbatRoles: OrbatRoleChip[]; memberCount: number }
interface PermissionCategory { key: string; label: string; permissions: PermissionNode[] }
interface PermissionGrant { granted: boolean; viaDiscordRoles: string[]; viaOrbatRole: string | null; viaGlobalOverride: boolean }
interface MemberOption { id: string; displayName: string }

interface Props {
    open: boolean
    onClose: () => void
}

type Mode = 'system' | 'member'

const searchFieldSx = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
}

const modeBtnSx = (active: boolean): React.CSSProperties => ({
    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    padding: '5px 14px', background: active ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(219,0,29,0.25)', color: active ? '#ededed' : 'rgba(237,237,237,0.55)',
    cursor: 'pointer', borderRadius: 999,
})

function roleDotColor(chip: DiscordRoleChip): string {
    if (!chip.resolved) return 'rgba(255,255,255,0.15)'
    if (!chip.color) return 'rgba(255,255,255,0.3)'
    return convertColorToHex(chip.color)
}

function matchesSearch(node: PermissionNode, term: string): boolean {
    if (!term) return true
    const t = term.toLowerCase()
    if (node.key.toLowerCase().includes(t)) return true
    if (node.discordRoles.some(r => r.name.toLowerCase().includes(t))) return true
    if (node.orbatRoles.some(r => r.name.toLowerCase().includes(t))) return true
    return false
}

function DiscordChip({ chip, matched }: { chip: DiscordRoleChip; matched?: boolean }) {
    return (
        <span
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: '0.66rem', padding: '2px 8px', borderRadius: 999,
                background: matched ? 'rgba(0,195,100,0.12)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${matched ? 'rgb(0,195,100)' : chip.resolved ? 'rgba(255,255,255,0.12)' : 'rgba(255,180,0,0.35)'}`,
                color: matched ? 'rgb(0,195,100)' : chip.resolved ? 'rgba(237,237,237,0.75)' : 'rgba(255,180,0,0.75)',
            }}
            title={chip.resolved ? undefined : 'Role no longer found in the guild — stale reference in permissions.ts'}
        >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: roleDotColor(chip), flexShrink: 0 }} />
            {chip.name}
        </span>
    )
}

function OrbatChip({ chip, matched }: { chip: OrbatRoleChip; matched?: boolean }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', fontSize: '0.66rem', padding: '2px 8px', borderRadius: 999,
            background: matched ? 'rgba(0,195,100,0.12)' : 'rgba(219,0,29,0.08)',
            border: `1px solid ${matched ? 'rgb(0,195,100)' : 'rgba(219,0,29,0.35)'}`,
            color: matched ? 'rgb(0,195,100)' : 'rgba(255,150,160,0.85)',
        }}>
            {chip.name}
        </span>
    )
}

function PermissionLeaf({ node, grant }: { node: PermissionNode; grant?: PermissionGrant }) {
    const shortLabel = node.key.split('.').slice(1).join('.')
    const granted = grant?.granted ?? false
    const dimmed = grant ? !grant.granted : false

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)',
            background: granted ? 'rgba(0,195,100,0.05)' : 'transparent',
            opacity: dimmed ? 0.35 : 1,
        }}>
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.85)' }}>{shortLabel}</div>
                <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.35)', marginBottom: 4 }}>{node.key}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                    {node.discordRoles.map(r => (
                        <DiscordChip key={r.id} chip={r} matched={grant?.viaDiscordRoles.includes(r.name) ?? false} />
                    ))}
                    {node.orbatRoles.map(r => (
                        <OrbatChip key={r.id} chip={r} matched={grant?.viaOrbatRole === r.name} />
                    ))}
                    {node.discordRoles.length === 0 && node.orbatRoles.length === 0 && (
                        <span style={{ fontSize: '0.66rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No roles granted</span>
                    )}
                    {grant?.viaGlobalOverride && (
                        <span style={{
                            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                            padding: '2px 7px', borderRadius: 999, background: 'rgba(0,195,100,0.15)',
                            border: '1px solid rgba(0,195,100,0.4)', color: 'rgb(0,195,100)',
                        }}>
                            Override
                        </span>
                    )}
                </div>
            </div>
            <div style={{
                flexShrink: 0, fontSize: '0.72rem', fontWeight: 700, color: 'rgba(237,237,237,0.6)',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 999, padding: '3px 10px', minWidth: 28, textAlign: 'center',
            }}>
                {node.memberCount}
            </div>
        </div>
    )
}

function CategorySection({ category, search, collapsed, onToggle, grants }: {
    category: PermissionCategory
    search: string
    collapsed: boolean
    onToggle: () => void
    grants?: Record<string, PermissionGrant>
}) {
    const visibleNodes = category.permissions.filter(n => matchesSearch(n, search))
    if (search && visibleNodes.length === 0) return null
    const expanded = search ? true : !collapsed

    return (
        <div style={{ marginBottom: 4 }}>
            <button
                onClick={onToggle}
                style={{
                    all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    padding: '8px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                }}
            >
                {expanded
                    ? <ExpandMore sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} />
                    : <ChevronRight sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} />}
                <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.7)' }}>
                    {category.label}
                </span>
                <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)' }}>({visibleNodes.length})</span>
            </button>
            {expanded && (
                <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderTop: 'none' }}>
                    {visibleNodes.map(node => <PermissionLeaf key={node.key} node={node} grant={grants?.[node.key]} />)}
                </div>
            )}
        </div>
    )
}

export default function PermissionsExplorerPanel({ open, onClose }: Props) {
    const [mode, setMode] = useState<Mode>('system')

    const [categories, setCategories] = useState<PermissionCategory[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

    const [memberQuery, setMemberQuery] = useState('')
    const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
    const [memberOptionsLoading, setMemberOptionsLoading] = useState(false)
    const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
    const [memberGrants, setMemberGrants] = useState<Record<string, PermissionGrant> | null>(null)
    const [memberGrantsLoading, setMemberGrantsLoading] = useState(false)
    const [memberError, setMemberError] = useState<string | null>(null)
    const memberSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!open) return
        setLoading(true)
        setError(null)
        fetch('/api/admin/permissions/tree')
            .then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json() })
            .then(data => {
                const cats: PermissionCategory[] = data.categories ?? []
                setCategories(cats)
                setCollapsedCategories(new Set(cats.map(c => c.key)))
            })
            .catch(() => setError('Failed to load permissions tree'))
            .finally(() => setLoading(false))
    }, [open])

    useEffect(() => {
        if (!open) {
            setMode('system')
            setSelectedMember(null)
            setMemberGrants(null)
            setMemberError(null)
            setMemberQuery('')
        }
    }, [open])

    useEffect(() => {
        if (mode !== 'member') return
        if (memberSearchTimer.current) clearTimeout(memberSearchTimer.current)
        memberSearchTimer.current = setTimeout(() => {
            setMemberOptionsLoading(true)
            fetch(`/api/admin/members?search=${encodeURIComponent(memberQuery)}&limit=15`)
                .then(r => r.json())
                .then(data => {
                    const members = (data.members ?? []) as { id: string; displayName: string }[]
                    setMemberOptions(members.map(m => ({ id: m.id, displayName: m.displayName })))
                })
                .catch(() => setMemberOptions([]))
                .finally(() => setMemberOptionsLoading(false))
        }, 300)
        return () => { if (memberSearchTimer.current) clearTimeout(memberSearchTimer.current) }
    }, [memberQuery, mode])

    function toggleCategory(key: string) {
        setCollapsedCategories(prev => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
        })
    }

    function selectMember(m: MemberOption | null) {
        setSelectedMember(m)
        setMemberGrants(null)
        setMemberError(null)
        if (!m) return
        setMemberGrantsLoading(true)
        fetch(`/api/admin/permissions/member/${m.id}`)
            .then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json() })
            .then(data => {
                setMemberGrants(data.grants ?? null)
                setCollapsedCategories(new Set())   // expand everything so highlights are immediately visible
            })
            .catch(() => setMemberError("Failed to load this member's access"))
            .finally(() => setMemberGrantsLoading(false))
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth='md'
            fullWidth
            PaperProps={{
                style: {
                    background: 'var(--background, #0a0a0a)',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    height: '85vh',
                },
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                <div>
                    <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', mb: 0.5 }}>
                        J4 Administration
                    </Typography>
                    <Typography fontWeight={700} fontSize='0.95rem' letterSpacing={3} sx={{ textTransform: 'uppercase' }}>
                        Permissions Explorer
                    </Typography>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button style={modeBtnSx(mode === 'system')} onClick={() => setMode('system')}>System Map</button>
                    <button style={modeBtnSx(mode === 'member')} onClick={() => setMode('member')}>Look Up Member</button>
                    <IconButton size='small' onClick={onClose}><Close sx={{ fontSize: 18, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
                </div>
            </DialogTitle>

            <Divider sx={{ borderColor: 'rgba(219,0,29,0.42)' }} />

            <DialogContent sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>
                {mode === 'member' && (
                    <Autocomplete
                        options={memberOptions}
                        getOptionLabel={o => o.displayName}
                        value={selectedMember}
                        onChange={(_, v) => selectMember(v)}
                        onInputChange={(_, v) => setMemberQuery(v)}
                        loading={memberOptionsLoading}
                        filterOptions={x => x}
                        noOptionsText={memberQuery ? 'No members found' : 'Type to search…'}
                        renderInput={params => (
                            <TextField
                                {...params}
                                size='small'
                                placeholder='Search for a member…'
                                sx={searchFieldSx}
                                InputProps={{
                                    ...params.InputProps,
                                    startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment>,
                                    endAdornment: (
                                        <>
                                            {memberOptionsLoading && <CircularProgress size={14} style={{ color: 'var(--red)' }} />}
                                            {params.InputProps.endAdornment}
                                        </>
                                    ),
                                }}
                            />
                        )}
                        ListboxProps={{ style: { background: '#1a1a1a', color: '#ededed' } }}
                    />
                )}

                <TextField
                    size='small'
                    placeholder='Search permission keys or role names…'
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                    sx={searchFieldSx}
                />

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    {mode === 'member' && !selectedMember && (
                        <Typography sx={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic', p: 2 }}>
                            Select a member above to see what they can access.
                        </Typography>
                    )}
                    {mode === 'member' && selectedMember && memberGrantsLoading && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>
                    )}
                    {mode === 'member' && memberError && (
                        <Typography sx={{ fontSize: '0.78rem', color: 'rgba(219,0,29,0.8)', p: 2 }}>{memberError}</Typography>
                    )}

                    {loading && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>
                    )}
                    {error && <Typography sx={{ fontSize: '0.78rem', color: 'rgba(219,0,29,0.8)', p: 2 }}>{error}</Typography>}

                    {!loading && !error && (mode === 'system' || (mode === 'member' && selectedMember && !memberGrantsLoading && !memberError)) &&
                        categories.map(cat => (
                            <CategorySection
                                key={cat.key}
                                category={cat}
                                search={search}
                                collapsed={collapsedCategories.has(cat.key)}
                                onToggle={() => toggleCategory(cat.key)}
                                grants={mode === 'member' ? (memberGrants ?? undefined) : undefined}
                            />
                        ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Manual verification in the browser**

With the dev server running (via the `run` skill or `npm run dev`), as a J4-Administration member:
1. Open the Permissions Explorer from the J4 Tools tab.
2. Click "Look Up Member" — the tree area should show "Select a member above to see what they can access." and a member search box should appear above the permission-key search box.
3. Type a few letters of a real member's name — options should appear after the debounce (≈300ms). Select one.
4. Confirm all categories auto-expand and the tree re-renders with highlights: leaves that member has access to show a green-tinted row and (for Discord-role-based grants) the matching role chip outlined in green; leaves they don't have are dimmed. If that member holds `J4-Administration`, every leaf should be granted and show the "Override" badge.
5. Switch back to "System Map" — confirm it returns to the unhighlighted view with categories collapsed (not still showing the member's expanded/highlighted state).
6. Close and reopen the dialog — confirm mode resets to "System Map" and the member selection is cleared (per the reset effect in Step 1).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/j4/PermissionsExplorerPanel.tsx
git commit -m "Add member lookup mode to Permissions Explorer"
```
