# ORBAT Position Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-typed ORBAT position role names with a managed `OrbatRole` catalog (name, category scope, Discord roles, site permissions), editable through a new J4-only Roles Manager panel, with an additive permission-grant mechanism layered on top of the existing Discord-role-based `PERMISSIONS` system.

**Architecture:** New `orbat_roles` collection referenced from `OrbatPosition.roleId`, while `OrbatPosition.role` stays as a denormalized display string kept in sync by the write paths (so every existing consumer of `.role` as plain text keeps working unmodified). A new `hasPermission()` helper adds an OR-branch to permission checks without touching any existing gate. Tasks are ordered so the app stays fully working after every commit — the free-text role UI isn't removed until the catalog and migration are already in place.

**Tech Stack:** Next.js 15 App Router, MongoDB (native driver, no ORM), React 19 + MUI, TypeScript. No test framework exists in this repo (confirmed in `CLAUDE.md`) — verification below uses `npx tsc --noEmit` for type-level checks, and manual browser/DevTools-console + direct DB inspection for behavior checks, matching this project's existing practice.

## Global Constraints

- Path alias `@/` maps to the project root — use it for all imports, per `CLAUDE.md`.
- All permission logic lives in `lib/permissions.ts`; never hardcode a Discord role name outside it.
- Every mutating admin route must check auth via `client.fetchMe()` + `client.hasRoles()` before touching the DB, matching the pattern in every existing `app/api/admin/orbat/**` route.
- `Db` from `lib/mongo.ts` is the only way to touch MongoDB — never instantiate a new `MongoClient`.
- MongoDB documents containing an `ObjectId` or `Date` must be round-tripped through `JSON.parse(JSON.stringify(x))` before `NextResponse.json(...)` — this is the existing convention (see `app/api/admin/orbat/discord-roles/route.ts:15`).
- No test suite exists — do not add one as part of this plan. Verify via `npx tsc --noEmit`, the dev server (`npm run dev`), and direct MongoDB inspection (mongosh/Compass or equivalent).

---

### Task 1: `OrbatRole` type, `orbat_roles` collection, `OrbatPosition.roleId` field

**Files:**
- Create: `types/orbat-role.d.ts`
- Modify: `types/orbat.d.ts`
- Modify: `lib/mongo.ts`

**Interfaces:**
- Produces: global `OrbatRole` interface (`_id, name, categories, discordRoleIds, permissions, createdAt, createdBy, createdByName`), `OrbatPosition.roleId: import('mongodb').ObjectId | null`, `Db.orbatRoles: MongoCollection<OrbatRole>`.

- [ ] **Step 1: Add the `OrbatRole` global type**

Create `types/orbat-role.d.ts`:

```ts
import type { ObjectId } from 'mongodb'


export { }

declare global {

    // A predefined ORBAT position job-title. Positions reference one via
    // OrbatPosition.roleId; OrbatPosition.role stays a denormalized copy of
    // OrbatRole.name so every existing display/matching consumer of the
    // plain-string field keeps working unmodified.
    interface OrbatRole {
        _id: ObjectId
        name: string
        categories: string[]        // subset of PLATOON_CATEGORY_IDS; [] = usable in every category
        discordRoleIds: string[]    // Discord role IDs granted to whoever holds a position of this Role
        permissions: string[]       // granted permission keys — see lib/permissions-catalog.ts
        createdAt: Date
        createdBy: string           // Discord ID
        createdByName: string
    }

}
```

- [ ] **Step 2: Add `roleId` to `OrbatPosition`**

In `types/orbat.d.ts`, the `OrbatPosition` interface currently reads:

```ts
    interface OrbatPosition {
        _id: ObjectId
        category: string
        sectionTitle: string
        role: string
        userId: string | null
        sectionOrder: number
        positionOrder: number
        isSenior?: boolean
        subTitle?: string
    }
```

Change it to:

```ts
    interface OrbatPosition {
        _id: ObjectId
        category: string
        sectionTitle: string
        role: string
        roleId: ObjectId | null
        userId: string | null
        sectionOrder: number
        positionOrder: number
        isSenior?: boolean
        subTitle?: string
    }
```

- [ ] **Step 3: Register the `orbat_roles` collection**

In `lib/mongo.ts`, immediately after the existing `orbatSectionMeta` line (`orbatSectionMeta: db.collection('orbat_section_meta') as MongoCollection<OrbatSectionMeta>,`), add:

```ts
    orbatRoles: db.collection('orbat_roles') as MongoCollection<OrbatRole>,
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors mentioning `orbat-role.d.ts`, `orbat.d.ts`, or `mongo.ts`. (Existing unrelated errors, if any, are not this task's concern — only check for new ones introduced by this change.)

- [ ] **Step 5: Commit**

```bash
git add types/orbat-role.d.ts types/orbat.d.ts lib/mongo.ts
git commit -m "feat(orbat-roles): add OrbatRole type and orbat_roles collection"
```

---

### Task 2: `manageOrbatRoles` permission key

**Files:**
- Modify: `lib/permissions.ts`

**Interfaces:**
- Produces: `PERMISSIONS.admin.manageOrbatRoles: string[]`.

- [ ] **Step 1: Add the permission key**

In `lib/permissions.ts`, immediately after the `manageOrbatMembers` block (ends at line 327 with `manageOrbatMembers: ['J4 - Administration'],`), insert:

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

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/permissions.ts
git commit -m "feat(orbat-roles): add manageOrbatRoles permission key"
```

---

### Task 3: Permission-key catalog and additive `hasPermission()` check

**Files:**
- Create: `lib/permissions-catalog.ts`
- Create: `lib/orbat/hasPermission.ts`

**Interfaces:**
- Consumes: `PERMISSIONS` (default export, `lib/permissions.ts`), `Db.orbatPositions`, `Db.orbatRoles` (Task 1), `client.hasRoles(user, string[])` (`lib/discord/index.ts`).
- Produces: `PERMISSION_CATALOG: Record<string, string[]>`, `PERMISSION_KEYS: string[]` (both from `lib/permissions-catalog.ts`); `hasPermission(user: User, key: string): Promise<boolean>` (from `lib/orbat/hasPermission.ts`).

- [ ] **Step 1: Write the permission-key flattener**

Create `lib/permissions-catalog.ts`:

```ts
import PERMISSIONS from './permissions'

// Recursively flattens the nested PERMISSIONS object into dot-path keys,
// e.g. PERMISSIONS.attendance.confirm -> "attendance.confirm".
// This flattened key space is what OrbatRole.permissions and the Roles
// Manager's permission picker draw from — one flat catalog reused from the
// already-namespaced PERMISSIONS structure rather than a parallel taxonomy.
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string[]> {
    const out: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (Array.isArray(value)) {
            out[path] = value as string[]
        } else if (value && typeof value === 'object') {
            Object.assign(out, flatten(value as Record<string, unknown>, path))
        }
    }
    return out
}

export const PERMISSION_CATALOG: Record<string, string[]> = flatten(PERMISSIONS as unknown as Record<string, unknown>)

export const PERMISSION_KEYS: string[] = Object.keys(PERMISSION_CATALOG).sort()
```

- [ ] **Step 2: Verify the catalog flattens correctly**

Run: `npx tsc --noEmit`
Expected: no new errors.

Then run a quick manual check with Node directly (this repo has no test runner, so this is the verification method):

```bash
node --env-file=.env -e "
require('ts-node/register') || true
" 2>/dev/null
node --env-file=.env --experimental-strip-types -e "
import('./lib/permissions-catalog.ts').then(m => {
  console.log('key count:', m.PERMISSION_KEYS.length)
  console.log('sample:', m.PERMISSION_KEYS.slice(0, 5))
  console.log('has attendance.confirm:', m.PERMISSION_KEYS.includes('attendance.confirm'))
})
"
```

Expected output: a key count greater than 20, a sample of dot-path strings like `admin.impersonate`, and `has attendance.confirm: true`. (If `--experimental-strip-types` isn't available in the installed Node version, instead temporarily add a throwaway `console.log(PERMISSION_KEYS)` at the bottom of a page/route you're already loading in the dev server and check the terminal output, then remove it.)

- [ ] **Step 3: Write the additive permission check**

Create `lib/orbat/hasPermission.ts`:

```ts
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { PERMISSION_CATALOG } from '@/lib/permissions-catalog'

/**
 * Additive permission check: true if the user's Discord roles satisfy the
 * existing PERMISSIONS entry for this key, OR their currently assigned
 * ORBAT position's Role explicitly grants this key. This only ever widens
 * access relative to the existing PERMISSIONS check — never narrows it, so
 * it's safe to introduce without touching any existing gate.
 */
export async function hasPermission(user: User, key: string): Promise<boolean> {
    const discordRoleNames = PERMISSION_CATALOG[key]
    if (discordRoleNames && client.hasRoles(user, discordRoleNames)) return true

    const position = await Db.orbatPositions.findOne({ userId: user.id })
    if (!position?.roleId) return false

    const role = await Db.orbatRoles.findOne({ _id: position.roleId })
    return !!role?.permissions.includes(key)
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add lib/permissions-catalog.ts lib/orbat/hasPermission.ts
git commit -m "feat(orbat-roles): add flattened permission catalog and additive hasPermission() check"
```

---

### Task 4: Roles CRUD API

**Files:**
- Create: `app/api/admin/orbat/roles/route.ts`
- Create: `app/api/admin/orbat/roles/[roleId]/route.ts`

**Interfaces:**
- Consumes: `Db.orbatRoles`, `Db.orbatPositions` (Task 1), `PERMISSIONS.admin.manageOrbat` / `manageOrbatRoles` (Task 2), `PERMISSION_KEYS` (Task 3, for validating submitted permission keys).
- Produces: `GET /api/admin/orbat/roles` → `{ roles: OrbatRole[] }`; `POST /api/admin/orbat/roles` body `{ name: string, categories: string[], discordRoleIds: string[], permissions: string[] }` → `{ role: OrbatRole }`; `PATCH /api/admin/orbat/roles/[roleId]` body `{ name?, categories?, discordRoleIds?, permissions? }` → `{ success: true }`; `DELETE /api/admin/orbat/roles/[roleId]` → `{ success: true }` or `409 { error, inUseCount }`.

- [ ] **Step 1: Write the list + create route**

Create `app/api/admin/orbat/roles/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'


// ── GET /api/admin/orbat/roles ─────────────────────────────────────────────
// Same read gate as the rest of the ORBAT admin surface.

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbat)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const roles = await Db.orbatRoles.find({}).sort({ name: 1 }).toArray()
    return NextResponse.json({ roles: JSON.parse(JSON.stringify(roles)) })
}


// ── POST /api/admin/orbat/roles ────────────────────────────────────────────
// Body: { name, categories, discordRoleIds, permissions }

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const name: string = (body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const categories: string[] = Array.isArray(body.categories) ? body.categories : []
    const discordRoleIds: string[] = Array.isArray(body.discordRoleIds) ? body.discordRoleIds : []
    const permissions: string[] = Array.isArray(body.permissions)
        ? body.permissions.filter((p: unknown) => typeof p === 'string' && PERMISSION_KEYS.includes(p))
        : []

    const existing = await Db.orbatRoles.findOne({ name })
    if (existing) return NextResponse.json({ error: 'A Role with that name already exists' }, { status: 409 })

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const newRole: OrbatRole = {
        _id: new ObjectId(),
        name,
        categories,
        discordRoleIds,
        permissions,
        createdAt: new Date(),
        createdBy: me.id,
        createdByName: performedByName,
    }
    await Db.orbatRoles.insertOne(newRole)

    return NextResponse.json({ role: JSON.parse(JSON.stringify(newRole)) })
}
```

- [ ] **Step 2: Write the update + delete route**

Create `app/api/admin/orbat/roles/[roleId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'


function parseId(roleId: string): ObjectId | null {
    try { return new ObjectId(roleId) } catch { return null }
}

async function auth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)) return null
    return me
}


// ── PATCH /api/admin/orbat/roles/[roleId] ──────────────────────────────────
// Body: { name?, categories?, discordRoleIds?, permissions? }
// Renaming cascades to every OrbatPosition.role denormalized copy.

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ roleId: string }> }
) {
    const me = await auth()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { roleId } = await params
    const objectId = parseId(roleId)
    if (!objectId) return NextResponse.json({ error: 'Invalid roleId' }, { status: 400 })

    const role = await Db.orbatRoles.findOne({ _id: objectId })
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })

    const body = await request.json()
    const updates: Partial<OrbatRole> = {}

    if (typeof body.name === 'string' && body.name.trim() && body.name.trim() !== role.name) {
        const conflict = await Db.orbatRoles.findOne({ name: body.name.trim(), _id: { $ne: objectId } })
        if (conflict) return NextResponse.json({ error: 'A Role with that name already exists' }, { status: 409 })
        updates.name = body.name.trim()
    }
    if (Array.isArray(body.categories)) updates.categories = body.categories
    if (Array.isArray(body.discordRoleIds)) updates.discordRoleIds = body.discordRoleIds
    if (Array.isArray(body.permissions)) {
        updates.permissions = body.permissions.filter((p: unknown) => typeof p === 'string' && PERMISSION_KEYS.includes(p))
    }

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    await Db.orbatRoles.updateOne({ _id: objectId }, { $set: updates })

    if (updates.name) {
        await Db.orbatPositions.updateMany({ roleId: objectId }, { $set: { role: updates.name } })
    }

    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/orbat/roles/[roleId] ─────────────────────────────────
// Blocked if any position still references this Role.

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ roleId: string }> }
) {
    const me = await auth()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { roleId } = await params
    const objectId = parseId(roleId)
    if (!objectId) return NextResponse.json({ error: 'Invalid roleId' }, { status: 400 })

    const inUseCount = await Db.orbatPositions.countDocuments({ roleId: objectId })
    if (inUseCount > 0) {
        return NextResponse.json({ error: 'Role is in use by existing positions', inUseCount }, { status: 409 })
    }

    await Db.orbatRoles.deleteOne({ _id: objectId })
    return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Verify against the running dev server**

Run: `npm run dev` (in a separate terminal, leave running)

Log into the dashboard as a J4 (`J4 - Administration`) member in your browser, then open DevTools console on any dashboard page and run:

```js
fetch('/api/admin/orbat/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: '__TEST_ROLE__', categories: [], discordRoleIds: [], permissions: [] }) })
  .then(r => r.json()).then(console.log)
```
Expected: an object like `{ role: { _id: "...", name: "__TEST_ROLE__", categories: [], discordRoleIds: [], permissions: [], ... } }`.

```js
fetch('/api/admin/orbat/roles').then(r => r.json()).then(console.log)
```
Expected: `{ roles: [...] }` containing the `__TEST_ROLE__` entry.

```js
fetch('/api/admin/orbat/roles/' + '<the _id from above>', { method: 'DELETE' }).then(r => r.json()).then(console.log)
```
Expected: `{ success: true }`. Confirm via a repeat `GET` that `__TEST_ROLE__` is gone.

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/orbat/roles/route.ts" "app/api/admin/orbat/roles/[roleId]/route.ts"
git commit -m "feat(orbat-roles): add Roles CRUD API"
```

---

### Task 5: Roles Manager slide-out panel

**Files:**
- Create: `app/dashboard/orbat/RolesManagerPanel.tsx`
- Modify: `app/dashboard/orbat/OrbatManager.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/admin/orbat/roles`, `PATCH/DELETE /api/admin/orbat/roles/[roleId]` (Task 4), `GET /api/admin/orbat/discord-roles` (existing), `PERMISSION_KEYS` is not fetchable client-side directly — the panel fetches permission keys from a small new endpoint (added in this task) instead of importing server-only code into a client component.
- Produces: `<RolesManagerPanel open: boolean, onClose: () => void, canManageRoles: boolean>` default export, rendered from `OrbatManager.tsx`.

- [ ] **Step 1: Expose the permission-key catalog to the client**

`lib/permissions-catalog.ts` is server-only (imports `lib/permissions.ts`, fine in API routes, but a client component can't import it directly). Add a tiny route: create `app/api/admin/orbat/permission-keys/route.ts`:

```ts
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'

// GET /api/admin/orbat/permission-keys — flat list of permission keys the
// Roles Manager's permission picker offers. Same gate as viewing Roles.
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbat)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ keys: PERMISSION_KEYS })
}
```

- [ ] **Step 2: Write the Roles Manager panel component**

Create `app/dashboard/orbat/RolesManagerPanel.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Drawer, TextField, Button, IconButton, Checkbox, FormControlLabel, CircularProgress, Alert } from '@mui/material'
import { Close, Delete, Add } from '@mui/icons-material'
import { PLATOON_CATEGORIES } from '@/lib/orbat/constants'

interface GuildRole { id: string; name: string }

interface Props {
    open: boolean
    onClose: () => void
}

const inputSx = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem',
}

export default function RolesManagerPanel({ open, onClose }: Props) {
    const [roles, setRoles] = useState<OrbatRole[]>([])
    const [guildRoles, setGuildRoles] = useState<GuildRole[]>([])
    const [permissionKeys, setPermissionKeys] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [editingId, setEditingId] = useState<string | null>(null)   // '__new__' for the create form
    const [formName, setFormName] = useState('')
    const [formCategories, setFormCategories] = useState<string[]>([])
    const [formDiscordRoleIds, setFormDiscordRoleIds] = useState<string[]>([])
    const [formPermissions, setFormPermissions] = useState<string[]>([])

    const load = useCallback(async () => {
        setLoading(true)
        const [rolesRes, guildRolesRes, permKeysRes] = await Promise.all([
            fetch('/api/admin/orbat/roles').then(r => r.json()),
            fetch('/api/admin/orbat/discord-roles').then(r => r.json()),
            fetch('/api/admin/orbat/permission-keys').then(r => r.json()),
        ])
        setRoles(rolesRes.roles ?? [])
        setGuildRoles(guildRolesRes.roles ?? [])
        setPermissionKeys(permKeysRes.keys ?? [])
        setLoading(false)
    }, [])

    useEffect(() => { if (open) load() }, [open, load])

    function startCreate() {
        setEditingId('__new__')
        setFormName('')
        setFormCategories([])
        setFormDiscordRoleIds([])
        setFormPermissions([])
        setError(null)
    }

    function startEdit(role: OrbatRole) {
        setEditingId(String(role._id))
        setFormName(role.name)
        setFormCategories(role.categories)
        setFormDiscordRoleIds(role.discordRoleIds)
        setFormPermissions(role.permissions)
        setError(null)
    }

    async function save() {
        if (!formName.trim()) { setError('Name is required'); return }
        setError(null)
        const body = { name: formName.trim(), categories: formCategories, discordRoleIds: formDiscordRoleIds, permissions: formPermissions }

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
        await load()
    }

    function toggleIn(arr: string[], setArr: (v: string[]) => void, value: string) {
        setArr(arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value])
    }

    return (
        <Drawer anchor='right' open={open} onClose={onClose} PaperProps={{ sx: { width: 420, background: '#0c0c0c', borderLeft: '1px solid rgba(219,0,29,0.3)' } }}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, height: '100%', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                        ORBAT Roles
                    </span>
                    <IconButton size='small' onClick={onClose}><Close sx={{ fontSize: 16, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
                </div>

                {error && <Alert severity='error' sx={{ fontSize: '0.72rem' }}>{error}</Alert>}

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><CircularProgress size={22} /></div>
                ) : editingId ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <TextField size='small' label='Name' value={formName} onChange={e => setFormName(e.target.value)} sx={inputSx} />

                        <div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>Categories (none = all)</div>
                            {PLATOON_CATEGORIES.map(c => (
                                <FormControlLabel key={c._id} sx={{ display: 'block', ml: 0 }}
                                    control={<Checkbox size='small' checked={formCategories.includes(c._id)} onChange={() => toggleIn(formCategories, setFormCategories, c._id)} />}
                                    label={<span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>{c.label}</span>}
                                />
                            ))}
                        </div>

                        <div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>Discord roles granted</div>
                            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
                                {guildRoles.map(r => (
                                    <FormControlLabel key={r.id} sx={{ display: 'block', ml: 0, px: 1 }}
                                        control={<Checkbox size='small' checked={formDiscordRoleIds.includes(r.id)} onChange={() => toggleIn(formDiscordRoleIds, setFormDiscordRoleIds, r.id)} />}
                                        label={<span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>{r.name}</span>}
                                    />
                                ))}
                            </div>
                        </div>

                        <div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>Permissions granted</div>
                            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
                                {permissionKeys.map(k => (
                                    <FormControlLabel key={k} sx={{ display: 'block', ml: 0, px: 1 }}
                                        control={<Checkbox size='small' checked={formPermissions.includes(k)} onChange={() => toggleIn(formPermissions, setFormPermissions, k)} />}
                                        label={<span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.6)', fontFamily: 'monospace' }}>{k}</span>}
                                    />
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <Button size='small' variant='outlined' onClick={save}>Save</Button>
                            <Button size='small' onClick={() => setEditingId(null)} sx={{ color: 'rgba(237,237,237,0.4)' }}>Cancel</Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <Button size='small' startIcon={<Add sx={{ fontSize: 14 }} />} onClick={startCreate} sx={{ alignSelf: 'flex-start', fontSize: '0.7rem' }}>
                            New Role
                        </Button>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {roles.map(role => (
                                <div key={String(role._id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <button onClick={() => startEdit(role)} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.75rem', color: 'rgba(237,237,237,0.85)' }}>
                                        {role.name}
                                    </button>
                                    <IconButton size='small' onClick={() => remove(role)}>
                                        <Delete sx={{ fontSize: 14, color: 'rgba(219,0,29,0.6)' }} />
                                    </IconButton>
                                </div>
                            ))}
                            {roles.length === 0 && <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>No Roles defined yet.</div>}
                        </div>
                    </>
                )}
            </div>
        </Drawer>
    )
}
```

- [ ] **Step 3: Wire the panel into `OrbatManager.tsx`**

In `app/dashboard/orbat/OrbatManager.tsx`, add the import near the other local imports (after the `TacticalSkeleton` import, line 16):

```tsx
import RolesManagerPanel from './RolesManagerPanel'
```

Add state for panel visibility near the other `useState` declarations at the top of the component (alongside `editRoleId`/`editRoleVal`, around line 118-127):

```tsx
    const [rolesManagerOpen, setRolesManagerOpen] = useState(false)
```

Add a trigger button and the panel itself. Find the component's toolbar/header area (search for where `canManageStructure` is first used to gate a top-level action button) and add, gated the same way:

```tsx
{canManageStructure && (
    <Button size='small' onClick={() => setRolesManagerOpen(true)} sx={ghostBtn}>
        Manage Roles
    </Button>
)}
<RolesManagerPanel open={rolesManagerOpen} onClose={() => setRolesManagerOpen(false)} />
```

(`ghostBtn` is an existing style constant already defined near the top of this file.)

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Verify in the browser**

With `npm run dev` running, log in as a J4 member, go to `/dashboard/orbat`, click "Manage Roles". Confirm the drawer opens, "New Role" creates a role with a category, a Discord role, and a permission checked, and it appears in the list after saving. Confirm clicking it re-opens the edit form with the same values. Confirm delete works. Confirm a non-J4 member does not see the "Manage Roles" button (check `canManageStructure` is false for their session, or temporarily test with `PERMISSIONS.admin.manageOrbatStructure` role removed from a test account).

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/orbat/permission-keys/route.ts app/dashboard/orbat/RolesManagerPanel.tsx app/dashboard/orbat/OrbatManager.tsx
git commit -m "feat(orbat-roles): add Roles Manager slide-out panel"
```

---

### Task 6: Migration script — seed Roles from existing data, backfill `roleId`

**Files:**
- Create: `scripts/migrate-orbat-roles.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MONGO_URI`, `MONGO_DB` env vars (same as `lib/mongo.ts`); reads/writes `orbat_positions` and `orbat_roles` collections directly via the `mongodb` driver (this is a standalone Node script, not a Next.js route, so it can't import `lib/mongo.ts`'s Next-specific global-caching wrapper — it opens its own short-lived connection).
- Produces: populated `orbat_roles` collection; `roleId` set on every non-reservist `OrbatPosition`.

- [ ] **Step 1: Write the migration script**

Create `scripts/migrate-orbat-roles.mjs`:

```js
// One-off migration: seed orbat_roles from the distinct `role` strings
// currently in orbat_positions, then backfill roleId on every non-reservist
// position by exact-name match. Reservist positions (activeReservist /
// inactiveReservist) are intentionally skipped — they stay fixed labels.
//
// Usage:
//   node --env-file=.env scripts/migrate-orbat-roles.mjs            (dry run — reports only)
//   node --env-file=.env scripts/migrate-orbat-roles.mjs --apply    (writes changes)

import { MongoClient } from 'mongodb'

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
    const positions = db.collection('orbat_positions')
    const roles = db.collection('orbat_roles')

    const distinctNames = await positions.distinct('role', { category: { $nin: RESERVIST_CATEGORIES } })
    console.log(`Found ${distinctNames.length} distinct role names to seed.`)

    if (!APPLY) {
        console.log('DRY RUN — no changes written. Names that would be seeded:')
        console.log(distinctNames.sort())
        await client.close()
        return
    }

    let created = 0
    const nameToId = new Map()
    for (const name of distinctNames) {
        const existing = await roles.findOne({ name })
        if (existing) {
            nameToId.set(name, existing._id)
            continue
        }
        const result = await roles.insertOne({
            name,
            categories: [],
            discordRoleIds: [],
            permissions: [],
            createdAt: new Date(),
            createdBy: 'migration-script',
            createdByName: 'Migration Script',
        })
        nameToId.set(name, result.insertedId)
        created++
    }
    console.log(`Created ${created} new OrbatRole documents (${distinctNames.length - created} already existed).`)

    let backfilled = 0
    for (const [name, roleId] of nameToId) {
        const result = await positions.updateMany(
            { role: name, category: { $nin: RESERVIST_CATEGORIES }, roleId: { $exists: false } },
            { $set: { roleId } }
        )
        backfilled += result.modifiedCount
    }
    console.log(`Backfilled roleId on ${backfilled} positions.`)

    const remaining = await positions.countDocuments({ category: { $nin: RESERVIST_CATEGORIES }, roleId: { $exists: false } })
    if (remaining > 0) {
        console.warn(`WARNING: ${remaining} non-reservist positions still have no roleId — investigate before relying on the new catalog for them.`)
    }

    await client.close()
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Add the npm script**

In `package.json`, in the `"scripts"` block, add after `"init-db": "node scripts/init-db.mjs"`:

```json
    "migrate-orbat-roles": "node --env-file=.env scripts/migrate-orbat-roles.mjs"
```

- [ ] **Step 3: Dry-run against the real database and inspect the output**

Run: `npm run migrate-orbat-roles`
Expected: `DRY RUN — no changes written.` followed by a sorted list of role name strings (e.g. `Adjutant`, `Commanding Officer`, `Fireteam Leader`, `Rifleman`, ... — roughly three dozen entries). **Confirm this list looks like real position job-titles before proceeding — do not run `--apply` if anything looks wrong.**

- [ ] **Step 4: Apply the migration**

This writes to the live database. Get explicit confirmation from whoever owns the ASOT deployment before running this, even in a dev/staging copy first if one exists.

Run: `npm run migrate-orbat-roles -- --apply`
Expected: `Created N new OrbatRole documents (0 already existed).` then `Backfilled roleId on M positions.` with no `WARNING` line.

- [ ] **Step 5: Verify directly in MongoDB**

Using mongosh, Compass, or equivalent, against the `ASOT` database:

```js
db.orbat_roles.countDocuments()               // should match N from Step 4's output
db.orbat_positions.find({ category: { $nin: ['activeReservist','inactiveReservist'] }, roleId: { $exists: false } }).count()   // should be 0
db.orbat_positions.findOne({ role: 'Rifleman' })   // should now show a roleId field pointing at a valid orbat_roles _id
```

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-orbat-roles.mjs package.json
git commit -m "feat(orbat-roles): add migration script to seed Roles catalog from existing data"
```

---

### Task 7: Cut over position role assignment (`[positionId]` route) to `roleId`, with Discord role stacking

**Files:**
- Modify: `app/api/admin/orbat/[positionId]/route.ts`

**Interfaces:**
- Consumes: `Db.orbatRoles` (Task 1), `addGuildRole`/`removeGuildRole` (`lib/discord/bot.ts`, already imported transitively via `syncOrbatDiscordRoles`).
- Produces: `PATCH /api/admin/orbat/[positionId]` field-update branch now accepts `{ roleId: string | null }` instead of `{ role: string }`.

- [ ] **Step 1: Replace the role-rename branch with a roleId-select branch**

In `app/api/admin/orbat/[positionId]/route.ts`, the field-updates section currently reads (lines 135-156):

```ts
    // Field updates (role rename, reorder) — structure permission required
    const me = await authStructure()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const updates: Partial<OrbatPosition> = {}
    if (typeof body.role === 'string') updates.role = body.role
    if (typeof body.positionOrder === 'number') updates.positionOrder = body.positionOrder
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    await Db.orbatPositions.updateOne({ _id: objectId }, { $set: updates })

    if (typeof body.role === 'string') {
        logAction({
            action: 'orbat.rename_role',
            category: 'orbat',
            performedBy: me.id,
            performedByName,
            target: `${position.sectionTitle}: "${position.role}" → "${body.role}"`,
            details: { positionId, category: position.category, sectionTitle: position.sectionTitle, oldRole: position.role, newRole: body.role },
        })
    }

    return NextResponse.json({ success: true })
}
```

Replace it with:

```ts
    // Field updates (role select, reorder) — structure permission required
    const me = await authStructure()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const updates: Partial<OrbatPosition> = {}
    let newRoleDoc: OrbatRole | null = null

    if ('roleId' in body) {
        if (body.roleId === null) {
            updates.roleId = null
            updates.role = ''
        } else {
            let roleObjectId: ObjectId
            try { roleObjectId = new ObjectId(body.roleId) } catch { return NextResponse.json({ error: 'Invalid roleId' }, { status: 400 }) }
            newRoleDoc = await Db.orbatRoles.findOne({ _id: roleObjectId })
            if (!newRoleDoc) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
            updates.roleId = roleObjectId
            updates.role = newRoleDoc.name
        }
    }
    if (typeof body.positionOrder === 'number') updates.positionOrder = body.positionOrder
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    await Db.orbatPositions.updateOne({ _id: objectId }, { $set: updates })

    // If the position is currently occupied and its Role changed, swap the
    // occupant's Role-level Discord roles (stacks on top of the unaffected
    // section/category-level sync — see lib/orbat/discord.ts).
    if ('roleId' in body && position.userId) {
        const oldRoleDoc = position.roleId ? await Db.orbatRoles.findOne({ _id: position.roleId }) : null
        const revokeIds = oldRoleDoc?.discordRoleIds ?? []
        const grantIds = newRoleDoc?.discordRoleIds ?? []
        Promise.allSettled([
            ...revokeIds.map(id => removeGuildRole(position.userId!, id)),
            ...grantIds.map(id => addGuildRole(position.userId!, id)),
        ]).catch(err => console.error('[orbat] Role-level Discord sync failed:', err))
    }

    if ('roleId' in body) {
        logAction({
            action: 'orbat.change_role',
            category: 'orbat',
            performedBy: me.id,
            performedByName,
            target: `${position.sectionTitle}: "${position.role}" → "${updates.role}"`,
            details: { positionId, category: position.category, sectionTitle: position.sectionTitle, oldRole: position.role, newRole: updates.role },
        })
    }

    return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Add the new imports**

At the top of the same file, the import block currently reads:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { RESERVIST_CATEGORY_IDS } from '@/lib/orbat/constants'
import { logAction } from '@/lib/logs'
import { syncOrbatDiscordRoles } from '@/lib/orbat/discord'
```

Add `addGuildRole, removeGuildRole` to it:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { RESERVIST_CATEGORY_IDS } from '@/lib/orbat/constants'
import { logAction } from '@/lib/logs'
import { syncOrbatDiscordRoles } from '@/lib/orbat/discord'
import { addGuildRole, removeGuildRole } from '@/lib/discord/bot'
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Verify against the running dev server**

With `npm run dev` running and logged in as J4, in the browser console:

```js
// Replace <positionId> with a real _id from a currently-unoccupied position,
// and <roleId> with a real OrbatRole _id from the Roles Manager panel.
fetch('/api/admin/orbat/<positionId>', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ roleId: '<roleId>' }) }).then(r => r.json()).then(console.log)
```
Expected: `{ success: true }`. Then `GET /api/admin/orbat` (existing route) and confirm that position's `role` field now shows the Role's name and `roleId` matches.

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/orbat/[positionId]/route.ts"
git commit -m "feat(orbat-roles): cut over position role assignment to roleId with Discord role stacking"
```

---

### Task 8: Cut over new-position creation (`positions` route) to `roleId`

**Files:**
- Modify: `app/api/admin/orbat/positions/route.ts`

**Interfaces:**
- Consumes: `Db.orbatRoles` (Task 1).
- Produces: `POST /api/admin/orbat/positions` body changes from `{ category, sectionTitle, role }` to `{ category, sectionTitle, roleId }`.

- [ ] **Step 1: Replace the body handling**

In `app/api/admin/orbat/positions/route.ts`, replace the whole file body from the `POST` export downward:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'


// ── POST /api/admin/orbat/positions ───────────────────────────────────────────
// Body: { category, sectionTitle, roleId }
// Creates a new vacant position at the end of the section.

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatStructure)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { category, sectionTitle, roleId } = await request.json()
    if (!category || typeof roleId !== 'string' || !roleId) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    let roleObjectId: ObjectId
    try { roleObjectId = new ObjectId(roleId) } catch { return NextResponse.json({ error: 'Invalid roleId' }, { status: 400 }) }

    const roleDoc = await Db.orbatRoles.findOne({ _id: roleObjectId })
    if (!roleDoc) return NextResponse.json({ error: 'Role not found' }, { status: 404 })

    // Get sectionOrder and next positionOrder from existing docs in this section
    const existing = await Db.orbatPositions
        .find({ category, sectionTitle: sectionTitle ?? '' })
        .sort({ positionOrder: -1 })
        .limit(1)
        .toArray()

    const sectionOrder = existing[0]?.sectionOrder ?? 0
    const positionOrder = (existing[0]?.positionOrder ?? -1) + 1

    const newPosition: OrbatPosition = {
        _id: new ObjectId(),
        category,
        sectionTitle: sectionTitle ?? '',
        role: roleDoc.name,
        roleId: roleObjectId,
        userId: null,
        sectionOrder,
        positionOrder,
    }
    await Db.orbatPositions.insertOne(newPosition)

    return NextResponse.json({ position: JSON.parse(JSON.stringify(newPosition)) })
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Verify against the running dev server**

In the browser console, logged in as J4:

```js
fetch('/api/admin/orbat/positions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ category: 'platoon11', sectionTitle: '__TEST_SECTION__', roleId: '<a real OrbatRole _id>' }) })
  .then(r => r.json()).then(console.log)
```
Expected: `{ position: { ..., role: "<the role's name>", roleId: "<the id you passed>", ... } }`. Clean up afterward by deleting that position via `DELETE /api/admin/orbat/<positionId>`.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/orbat/positions/route.ts
git commit -m "feat(orbat-roles): cut over new-position creation to roleId"
```

---

### Task 9: Discord role stacking in the move-request flow

**Files:**
- Modify: `lib/orbat/move.ts`

**Interfaces:**
- Consumes: `Db.orbatRoles` (Task 1), `addGuildRole`/`removeGuildRole` (`lib/discord/bot.ts`).
- Produces: `applyOrbatMove()` (same signature as today) also stacks Role-level Discord roles based on `fromPos.roleId`/`toPos.roleId`.

- [ ] **Step 1: Add a shared helper and call it from all three branches**

Replace the full contents of `lib/orbat/move.ts` with:

```ts
import Db from '../mongo'
import { RESERVIST_CATEGORY_IDS } from './constants'
import { syncOrbatDiscordRoles } from './discord'
import { addGuildRole, removeGuildRole } from '../discord/bot'

async function swapRoleDiscordRoles(userId: string, fromRoleId: OrbatPosition['roleId'], toRoleId: OrbatPosition['roleId'] | undefined) {
    const [fromRole, toRole] = await Promise.all([
        fromRoleId ? Db.orbatRoles.findOne({ _id: fromRoleId }) : Promise.resolve(null),
        toRoleId ? Db.orbatRoles.findOne({ _id: toRoleId }) : Promise.resolve(null),
    ])
    const revokeIds = fromRole?.discordRoleIds ?? []
    const grantIds = toRole?.discordRoleIds ?? []
    await Promise.allSettled([
        ...revokeIds.map(id => removeGuildRole(userId, id)),
        ...grantIds.map(id => addGuildRole(userId, id)),
    ])
}

/**
 * Applies an ORBAT position swap when a move request is approved.
 * Handles all three cases: reservist→section, section→reservist, section→section.
 */
export async function applyOrbatMove({
    fromPos,
    toPos,
    toIsReservist,
    targetUserId,
}: {
    fromPos: OrbatPosition
    toPos: OrbatPosition | null
    toIsReservist: boolean
    targetUserId: string
}) {
    if (RESERVIST_CATEGORY_IDS.includes(fromPos.category)) {
        // FROM reservist → TO section: clear reservist slot, assign destination
        await Db.orbatPositions.updateOne({ _id: fromPos._id }, { $set: { userId: null } })
        await Db.orbatPositions.updateOne({ _id: toPos!._id }, { $set: { userId: targetUserId } })
        Promise.allSettled([
            syncOrbatDiscordRoles(targetUserId, 'remove', fromPos.category, fromPos.sectionTitle),
            syncOrbatDiscordRoles(targetUserId, 'add', toPos!.category, toPos!.sectionTitle),
            swapRoleDiscordRoles(targetUserId, fromPos.roleId, toPos!.roleId),
        ]).catch(err => console.error('[orbat-move] Role sync failed:', err))
    } else if (toIsReservist) {
        // FROM section → TO reservist: clear source, find/create activeReservist slot
        await Db.orbatPositions.updateOne({ _id: fromPos._id }, { $set: { userId: null } })
        const vacantSlot = await Db.orbatPositions.findOne({ category: 'activeReservist', userId: null })
        if (vacantSlot) {
            await Db.orbatPositions.updateOne({ _id: vacantSlot._id }, { $set: { userId: targetUserId } })
        } else {
            const count = await Db.orbatPositions.countDocuments({ category: 'activeReservist' })
            await Db.orbatPositions.insertOne({
                category: 'activeReservist',
                sectionTitle: '',
                role: 'Active Reservist',
                roleId: null,
                userId: targetUserId,
                sectionOrder: 0,
                positionOrder: count,
            } as OrbatPosition)
        }
        Promise.allSettled([
            syncOrbatDiscordRoles(targetUserId, 'remove', fromPos.category, fromPos.sectionTitle),
            syncOrbatDiscordRoles(targetUserId, 'add', 'activeReservist', ''),
            swapRoleDiscordRoles(targetUserId, fromPos.roleId, null),
        ]).catch(err => console.error('[orbat-move] Role sync failed:', err))
    } else {
        // Section → section: remove old roles, add new roles
        await Db.orbatPositions.updateOne({ _id: fromPos._id }, { $set: { userId: null } })
        await Db.orbatPositions.updateOne({ _id: toPos!._id }, { $set: { userId: targetUserId } })
        Promise.allSettled([
            syncOrbatDiscordRoles(targetUserId, 'remove', fromPos.category, fromPos.sectionTitle),
            syncOrbatDiscordRoles(targetUserId, 'add', toPos!.category, toPos!.sectionTitle),
            swapRoleDiscordRoles(targetUserId, fromPos.roleId, toPos!.roleId),
        ]).catch(err => console.error('[orbat-move] Role sync failed:', err))
    }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Verify via the Move Requests UI**

With `npm run dev` running, as a staff member with move-request authority, go to `/dashboard/personnel/all-staff` → Move Requests tab, submit a move for a test member from one occupied, Role-linked position to another, and confirm the request either auto-applies or can be approved. After it applies, confirm in Discord (or via `GET /api/admin/members/<id>/discord-roles`) that the member's old position-Role Discord role was removed and the new one added, alongside the unchanged section-level role.

- [ ] **Step 4: Commit**

```bash
git add lib/orbat/move.ts
git commit -m "feat(orbat-roles): stack Role-level Discord roles in the move-request flow"
```

---

### Task 10: Replace free-text role UI in `OrbatManager.tsx` with a searchable Role dropdown

**Files:**
- Create: `app/dashboard/orbat/RoleSelect.tsx`
- Modify: `app/dashboard/orbat/OrbatManager.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/orbat/roles` (Task 4).
- Produces: `<RoleSelect category: string, value: string | null, onChange: (roleId: string) => void, placeholder?: string>` default export.

- [ ] **Step 1: Write the searchable Role dropdown**

Create `app/dashboard/orbat/RoleSelect.tsx`:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
    category: string
    value: string | null              // currently selected OrbatRole _id, or null
    onChange: (roleId: string) => void
    placeholder?: string
}

export default function RoleSelect({ category, value, onChange, placeholder = 'Select a role…' }: Props) {
    const [roles, setRoles] = useState<OrbatRole[]>([])
    const [loaded, setLoaded] = useState(false)
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (loaded) return
        fetch('/api/admin/orbat/roles')
            .then(r => r.json())
            .then(d => { setRoles(Array.isArray(d.roles) ? d.roles : []); setLoaded(true) })
            .catch(() => setLoaded(true))
    }, [loaded])

    useEffect(() => {
        function handler(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const relevant = roles.filter(r => r.categories.length === 0 || r.categories.includes(category))
    const filtered = query.trim()
        ? relevant.filter(r => r.name.toLowerCase().includes(query.toLowerCase()))
        : relevant

    const selected = roles.find(r => String(r._id) === value)

    return (
        <div ref={ref} style={{ position: 'relative', width: '100%' }}>
            <input
                value={open ? query : (selected?.name ?? '')}
                onChange={e => { setQuery(e.target.value); setOpen(true) }}
                onFocus={() => { setOpen(true); setQuery('') }}
                placeholder={placeholder}
                style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(237,237,237,0.85)', fontSize: '0.73rem', padding: '2px 6px',
                    outline: 'none', width: '100%', boxSizing: 'border-box', height: 24,
                }}
            />
            {open && (
                <div
                    style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#111', border: '1px solid rgba(255,255,255,0.14)', maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}
                    onWheel={e => e.stopPropagation()}
                >
                    {!loaded && <div style={{ padding: '6px 10px', fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)' }}>Loading roles…</div>}
                    {loaded && filtered.length === 0 && <div style={{ padding: '6px 10px', fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)' }}>No roles found</div>}
                    {filtered.map(r => (
                        <button
                            key={String(r._id)}
                            type='button'
                            onClick={() => { onChange(String(r._id)); setOpen(false); setQuery('') }}
                            style={{ display: 'block', width: '100%', padding: '6px 10px', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(237,237,237,0.75)', fontSize: '0.7rem', cursor: 'pointer', textAlign: 'left' }}
                        >
                            {r.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 2: Swap the inline role-rename `TextField` for `RoleSelect`**

In `app/dashboard/orbat/OrbatManager.tsx`, add the import next to `RolesManagerPanel`:

```tsx
import RoleSelect from './RoleSelect'
```

Change `saveRole` (lines 409-418) from:

```ts
    async function saveRole(positionId: string, role: string) {
        if (!role.trim()) { setEditRoleId(null); return }
        setEditRoleId(null)
        applyPatch(positionId, { role: role.trim() })
        await fetch(`/api/admin/orbat/${positionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: role.trim() }),
        })
    }
```

to:

```ts
    async function saveRole(positionId: string, roleId: string, roleName: string) {
        setEditRoleId(null)
        applyPatch(positionId, { role: roleName, roleId: new ObjectId(roleId) })
        await fetch(`/api/admin/orbat/${positionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId }),
        })
    }
```

This introduces a client-side use of `ObjectId` purely for the optimistic local-state shape — check the top of the file for an existing `import { ObjectId } from 'mongodb'`; if absent, add it alongside the other top-of-file imports (`mongodb`'s `ObjectId` is safe to use client-side for typing/construction, it's already done this way in this codebase's admin panels).

Change the inline editing block (lines 606-620) from:

```tsx
                        {isEditing && !opts.isDragOverlay ? (
                            <TextField
                                size='small'
                                value={editRoleVal}
                                onChange={e => setEditRoleVal(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') saveRole(posId, editRoleVal)
                                    if (e.key === 'Escape') setEditRoleId(null)
                                }}
                                onBlur={() => saveRole(posId, editRoleVal)}
                                autoFocus
                                fullWidth
                                inputProps={{ style: { fontSize: '0.73rem', padding: '2px 6px' } }}
                                sx={{ '& .MuiOutlinedInput-root': { height: 24 } }}
                            />
                        ) : (
```

to:

```tsx
                        {isEditing && !opts.isDragOverlay ? (
                            <RoleSelect
                                category={pos.category}
                                value={pos.roleId ? String(pos.roleId) : null}
                                onChange={(roleId) => {
                                    // roleName is resolved inside RoleSelect's own fetched list; the
                                    // PATCH response is the source of truth, so pass a placeholder here
                                    // and let the next GET/poll refresh the display name.
                                    saveRole(posId, roleId, pos.role)
                                }}
                            />
                        ) : (
```

- [ ] **Step 3: Swap the "Add Role" free-text input for `RoleSelect`**

The `addRole` function (lines 426-439) changes from:

```ts
    async function addRole(cat: string, sectionTitle: string, role: string) {
        if (!role.trim()) return
        setAddRoleKey(null)
        setAddRoleVal('')
        const res = await fetch('/api/admin/orbat/positions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, sectionTitle, role: role.trim() }),
        })
        if (res.ok) {
            const data = await res.json()
            applyAppend(data.position, null)
        }
    }
```

to:

```ts
    async function addRole(cat: string, sectionTitle: string, roleId: string) {
        if (!roleId) return
        setAddRoleKey(null)
        setAddRoleVal('')
        const res = await fetch('/api/admin/orbat/positions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, sectionTitle, roleId }),
        })
        if (res.ok) {
            const data = await res.json()
            applyAppend(data.position, null)
        }
    }
```

The "Add Role" UI block (lines 913-948) changes from:

```tsx
                {/* Add Role — structure managers only */}
                {canManageStructure && (
                    addRoleKey === sectionKey ? (
                        <div className='flex gap-1 px-1 py-1'>
                            <TextField
                                size='small'
                                placeholder='Role name...'
                                value={addRoleVal}
                                onChange={e => setAddRoleVal(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') addRole(cat, sec.title, addRoleVal)
                                    if (e.key === 'Escape') { setAddRoleKey(null); setAddRoleVal('') }
                                }}
                                autoFocus
                                fullWidth
                                inputProps={{ style: { fontSize: '0.72rem', padding: '3px 8px' } }}
                                sx={{ '& .MuiOutlinedInput-root': { height: 26 } }}
                            />
                            <IconButton size='small' onClick={() => addRole(cat, sec.title, addRoleVal)} disabled={!addRoleVal.trim() || busy} sx={{ ...ghostBtn, padding: '2px' }}>
                                <Add sx={{ fontSize: 14 }} />
                            </IconButton>
                            <IconButton size='small' onClick={() => { setAddRoleKey(null); setAddRoleVal('') }} sx={{ ...ghostBtn, padding: '2px' }}>
                                <Close sx={{ fontSize: 14 }} />
                            </IconButton>
                        </div>
                    ) : (
```

to:

```tsx
                {/* Add Role — structure managers only */}
                {canManageStructure && (
                    addRoleKey === sectionKey ? (
                        <div className='flex gap-1 px-1 py-1'>
                            <RoleSelect
                                category={cat}
                                value={null}
                                onChange={(roleId) => addRole(cat, sec.title, roleId)}
                                placeholder='Select a role…'
                            />
                            <IconButton size='small' onClick={() => { setAddRoleKey(null); setAddRoleVal('') }} sx={{ ...ghostBtn, padding: '2px' }}>
                                <Close sx={{ fontSize: 14 }} />
                            </IconButton>
                        </div>
                    ) : (
```

(The rest of that block — the closing `Button` for "Add Role" when not currently adding — is unchanged.)

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors. If `ObjectId` client-side import causes a bundling issue (Next.js sometimes warns about Node-only packages in client components), replace the `new ObjectId(roleId)` in `saveRole`'s optimistic update with a plain string cast instead — check the `applyPatch` helper's type signature (search for `function applyPatch` earlier in the file) and match whatever type `roleId` needs to satisfy there; if it's typed as `ObjectId | null` in the shared `OrbatPosition` type, a raw string will fail type-check and you do need the real `ObjectId` (it's fine in client components — only `mongodb`'s server-only APIs like `MongoClient` are unsafe client-side, not `ObjectId` construction, which is just ID-string wrapping).

- [ ] **Step 5: Verify in the browser**

With `npm run dev` running, on `/dashboard/orbat` as a J4 member: click an existing position's name to edit it, confirm the free-text box is gone and a searchable dropdown filtered to that position's category appears, select a different Role, confirm it saves and displays the new name. Click "Add Role" on a section, confirm the same dropdown appears instead of a text box, select a Role, confirm a new position is created with that Role's name.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/orbat/RoleSelect.tsx app/dashboard/orbat/OrbatManager.tsx
git commit -m "feat(orbat-roles): replace free-text role entry with searchable Role dropdown"
```

---

### Task 11: Mass-import resolves `roleId` by name match

**Files:**
- Modify: `app/api/admin/mass-import/route.ts`

**Interfaces:**
- Consumes: `Db.orbatRoles` (Task 1).
- Produces: mass-import's rebuilt `orbat_positions` documents each get `roleId` set when the CSV's role string exactly matches an existing `OrbatRole.name`; response includes an `unmatchedRoles` count.

- [ ] **Step 1: Locate the ORBAT rebuild block**

In `app/api/admin/mass-import/route.ts`, find the section around line 397-443 that does:

```ts
    await Db.orbatPositions.dropIndexes()
    await Db.orbatPositions.deleteMany({})
    // ... builds an array of position objects and calls insertMany ...
    await Db.orbatPositions.createIndex(...)
    await Db.orbatPositions.createIndex(...)
```

Before the `dropIndexes()` call, fetch the current Roles catalog once:

```ts
    const allRoles = await Db.orbatRoles.find({}).toArray()
    const roleByName = new Map(allRoles.map(r => [r.name, r._id]))
    let unmatchedRoleCount = 0
```

- [ ] **Step 2: Set `roleId` on each built position object**

Find where each position object is constructed for the `insertMany` call (it will have a `role: someString` field being set from the parsed CSV data). Immediately after that field is set, add:

```ts
    const matchedRoleId = roleByName.get(role) ?? null
    if (!matchedRoleId) unmatchedRoleCount++
```

and add `roleId: matchedRoleId` alongside the existing `role` field in that position object literal. (The exact variable name for the role string depends on the surrounding parser code — match whatever local variable currently feeds the `role:` field in that object literal.)

- [ ] **Step 3: Surface the unmatched count in the response**

Find the final `NextResponse.json({...})` at the end of the mass-import handler and add `unmatchedRoleCount` to the returned object, e.g. `return NextResponse.json({ success: true, ...existingFields, unmatchedRoleCount })`.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Verify manually**

This route wipes and rebuilds all ORBAT + milpac data from CSV uploads — **do not run it against the live database as a test**. Instead, read through the modified section once more and confirm: `roleByName` is built before the `deleteMany`, every constructed position object includes `roleId`, and `unmatchedRoleCount` appears in the JSON response. If a safe test CSV and a non-production database are available, run the import there and confirm `db.orbat_positions.find({ roleId: null })` afterward roughly matches the reported `unmatchedRoleCount` (reservist rows, if the CSV creates them without a role match, are expected to show `roleId: null` regardless per Task 6's design).

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/mass-import/route.ts
git commit -m "feat(orbat-roles): resolve roleId by name match during mass-import"
```

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1), permission model (Tasks 2-3), Roles Manager UI (Task 5), ORBAT Manager dropdown cutover (Task 10), Discord role stacking (Tasks 7, 9), migration (Task 6), mass-import behavior (Task 11) — all spec sections have a corresponding task. The spec's "Risks/follow-ups" section (wiring `hasPermission()` into real routes, e.g. `attendance.confirm`) is explicitly out of scope per the spec's own Non-goals and is not a task here.
- **Ordering:** the app stays functional after every task — free-text role entry isn't removed until Task 10, by which point the catalog (Tasks 1-5) and data migration (Task 6) are already in place.
- **Type consistency:** `roleId: ObjectId | null` (Task 1) is used consistently as `ObjectId` server-side and `string | null` over the wire (JSON), matching the existing codebase convention for every other `_id`-typed field in this app.
