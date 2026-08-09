# ORBAT Role Chain of Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chain-of-command hierarchy to the ORBAT Role catalog (`OrbatRole.parentRoleId`, a single-parent tree) with a drag-and-drop node-canvas editor for viewing and setting it, reachable from the existing Roles Manager.

**Architecture:** One new field on the existing `OrbatRole` type, extended validation on the existing role-update/delete API routes, and a new client component (`ChainOfCommandPanel.tsx`) that fetches the full role catalog, lays it out top-down with `dagre`, and renders it as an interactive graph with `@xyflow/react` (React Flow). No permission-system changes — this is purely additive metadata for future routing/escalation features to consume later.

**Tech Stack:** Next.js 15 App Router, MongoDB via `Db` (`lib/mongo.ts`), MUI, `@xyflow/react` (React Flow, new dependency), `dagre` (new dependency, layout algorithm), TypeScript.

## Global Constraints

- No permission inheritance of any kind — `parentRoleId` must never be read by `hasPermission()`, `lib/permissions/tree.ts`, or any existing permission check. This build only adds the field and the editor.
- Single-parent tree only — no multi-parent/DAG support.
- Node positions are always auto-computed by `dagre` on load; never persisted, never manually draggable.
- Cycle prevention is mandatory and server-side: a role must never be able to become its own ancestor at any depth.
- Deleting a role whose `parentRoleId` other roles point to must cascade those children's `parentRoleId` to `null`, not block the delete. This is separate from (and doesn't change) the existing block on deleting a Role still referenced by a live `OrbatPosition`.
- Follow existing code style exactly: 4-space indent, single quotes, no semicolons, dark-theme inline `sx`/`style` matching the visual pattern already established by `RolesManagerPanel.tsx` (wide MUI Dialog, red accent border, `85vh` height, search-box pattern).
- No automated test suite exists in this repo. Verification is `npx tsc --noEmit -p tsconfig.json` for every task, plus targeted manual checks where noted. Browser click-through verification is not available in this environment (no Discord OAuth, no browser automation tool) — this is a known, accepted limitation for every UI task in this plan, not something to flag as blocking.

---

## File Structure

- **Modify:** `apps/web/types/orbat-role.d.ts` — add `parentRoleId` field.
- **Modify:** `apps/web/app/api/admin/orbat/roles/[roleId]/route.ts` — `PATCH` gains `parentRoleId` handling + cycle check; `DELETE` gains cascade.
- **Modify:** `apps/web/package.json` — add `@xyflow/react`, `dagre`, `@types/dagre`.
- **Create:** `apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx` — the canvas editor.
- **Modify:** `apps/web/app/dashboard/orbat/RolesManagerPanel.tsx` — add the entry-point button.

---

### Task 1: Add `parentRoleId` to the data model and API

**Files:**
- Modify: `apps/web/types/orbat-role.d.ts`
- Modify: `apps/web/app/api/admin/orbat/roles/[roleId]/route.ts`

**Interfaces:**
- Produces: `OrbatRole.parentRoleId: ObjectId | null` — consumed by Task 3 and Task 4's frontend code (received over JSON as a string or `null`, since MongoDB's `ObjectId` serializes to its hex string via `JSON.stringify`).
- Produces: `PATCH /api/admin/orbat/roles/[roleId]` now accepts an optional `parentRoleId: string | null` in its request body, alongside the existing `name`/`categories`/`discordRoleIds`/`permissions` fields (all still work exactly as before — this is purely additive).

- [ ] **Step 1: Add the field to the type**

In `apps/web/types/orbat-role.d.ts`, the current content is:

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

Add `parentRoleId` to the interface, immediately after `permissions`:

```ts
        permissions: string[]       // granted permission keys — see lib/permissions-catalog.ts
        parentRoleId: ObjectId | null   // chain-of-command parent Role; null = top of chain / unset.
                                         // Routing/escalation metadata only — never consulted for
                                         // permission checks, and never implies permission inheritance.
```

- [ ] **Step 2: Add `parentRoleId` handling and cycle prevention to PATCH**

In `apps/web/app/api/admin/orbat/roles/[roleId]/route.ts`, the current `PATCH` handler is:

```ts
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
```

Insert `parentRoleId` handling between the `permissions` block and the `Object.keys(updates).length === 0` check:

```ts
    if (Array.isArray(body.permissions)) {
        updates.permissions = body.permissions.filter((p: unknown) => typeof p === 'string' && PERMISSION_KEYS.includes(p))
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

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
```

Nothing else in `PATCH` changes.

- [ ] **Step 3: Add cascade to DELETE**

The current `DELETE` handler is:

```ts
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

Add the cascade immediately before the final delete — **only after** the in-use check has passed, so children are never orphaned by a delete that ends up blocked:

```ts
    const inUseCount = await Db.orbatPositions.countDocuments({ roleId: objectId })
    if (inUseCount > 0) {
        return NextResponse.json({ error: 'Role is in use by existing positions', inUseCount }, { status: 409 })
    }

    // Cascade: any role that had this one as its chain-of-command parent
    // becomes a root instead of the delete being blocked — this is routing
    // metadata, not structural/permission-critical, so a hard block here
    // would just be friction.
    await Db.orbatRoles.updateMany({ parentRoleId: objectId }, { $set: { parentRoleId: null } })
    await Db.orbatRoles.deleteOne({ _id: objectId })
    return NextResponse.json({ success: true })
```

- [ ] **Step 4: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Then, with `npm run dev` running (start it in the background if not already running, and stop it afterward if you started it), confirm the route is still correctly gated:
`curl -s -o /dev/null -w '%{http_code}' -X PATCH http://localhost:3000/api/admin/orbat/roles/000000000000000000000000` — expect `401` (unauthenticated). Full authenticated behavior (real cycle rejection, real cascade) can't be verified in this environment (no Discord OAuth available) — that's expected, not a blocker; the logic is verified by careful reading against the Global Constraints above.

- [ ] **Step 5: Commit**

```bash
git add apps/web/types/orbat-role.d.ts "apps/web/app/api/admin/orbat/roles/[roleId]/route.ts"
git commit -m "Add parentRoleId chain-of-command field with cycle prevention and delete cascade"
```

---

### Task 2: Add the `@xyflow/react` and `dagre` dependencies

**Files:**
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `@xyflow/react` (React Flow) and `dagre` become available as imports for Task 3. Verified working versions: `@xyflow/react@^12.11.2` (peer deps: `react`/`react-dom` `>=17` — this app is on React 19, compatible), `dagre@^0.8.5`, `@types/dagre@^0.7.54`.

- [ ] **Step 1: Add the dependencies**

In `apps/web/package.json`, in the `dependencies` block, insert `@types/dagre` alphabetically between `@types/busboy` and `@types/glob`:

```json
    "@types/busboy": "^1.5.4",
    "@types/dagre": "^0.7.54",
    "@types/glob": "^8.1.0",
```

Insert `@xyflow/react` alphabetically between `@types/three` and `archiver`:

```json
    "@types/three": "^0.183.1",
    "@xyflow/react": "^12.11.2",
    "archiver": "^7.0.1",
```

Insert `dagre` alphabetically between `busboy` and `date-fns`:

```json
    "busboy": "^1.6.0",
    "dagre": "^0.8.5",
    "date-fns": "^4.1.0",
```

- [ ] **Step 2: Install and verify**

Run: `cd apps/web && npm install`
Expected: installs cleanly (these exact versions have already been verified to install and resolve correctly against this project's React 19 in prior investigation for this plan).

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors (nothing imports these packages yet, so this just confirms the install didn't break anything existing).

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json
git commit -m "Add @xyflow/react and dagre for the chain-of-command editor"
```

---

### Task 3: Build the Chain of Command canvas panel

**Files:**
- Create: `apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/orbat/roles` (existing route, returns `{ roles: OrbatRole[] }`, each role now including `parentRoleId: string | null` per Task 1); `PATCH /api/admin/orbat/roles/[roleId]` (existing route, now accepting `{ parentRoleId: string | null }` per Task 1).
- Produces: `export default function ChainOfCommandPanel({ open, onClose }: { open: boolean; onClose: () => void })` — consumed by Task 4.

- [ ] **Step 1: Write the component**

Create `apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx`:

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
    Typography, Box, InputAdornment, CircularProgress, Alert,
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

interface RoleNodeData extends Record<string, unknown> {
    role: OrbatRole
    dimmed: boolean
}

type RoleFlowNode = Node<RoleNodeData, 'roleNode'>

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

const nodeTypes = { roleNode: RoleNode }

function layoutRoles(roles: OrbatRole[], search: string): { nodes: RoleFlowNode[]; edges: Edge[] } {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 90 })
    g.setDefaultEdgeLabel(() => ({}))

    for (const role of roles) {
        g.setNode(String(role._id), { width: NODE_WIDTH, height: NODE_HEIGHT })
    }
    for (const role of roles) {
        if (role.parentRoleId) g.setEdge(String(role.parentRoleId), String(role._id))
    }

    dagre.layout(g)

    const term = search.trim().toLowerCase()
    const nodes: RoleFlowNode[] = roles.map(role => {
        const pos = g.node(String(role._id))
        const dimmed = term.length > 0 && !role.name.toLowerCase().includes(term)
        return {
            id: String(role._id),
            type: 'roleNode',
            position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
            data: { role, dimmed },
        }
    })

    const edges: Edge[] = roles
        .filter(role => role.parentRoleId)
        .map(role => ({
            id: `${role.parentRoleId}-${role._id}`,
            source: String(role.parentRoleId),
            target: String(role._id),
            markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(219,0,29,0.6)' },
            style: { stroke: 'rgba(219,0,29,0.5)' },
        }))

    return { nodes, edges }
}

function Canvas({ roles, search, error, onConnectRoles, onDisconnectRole, onSelectRole }: {
    roles: OrbatRole[]
    search: string
    error: string | null
    onConnectRoles: (childId: string, parentId: string) => void
    onDisconnectRole: (childId: string) => void
    onSelectRole: (role: OrbatRole) => void
}) {
    const { nodes, edges } = useMemo(() => layoutRoles(roles, search), [roles, search])
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
        onConnectRoles(connection.target, connection.source)
    }

    function handleEdgesDelete(deleted: Edge[]) {
        for (const edge of deleted) onDisconnectRole(edge.target)
    }

    function handleNodeClick(_event: React.MouseEvent, node: RoleFlowNode) {
        onSelectRole(node.data.role)
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
                onEdgesDelete={handleEdgesDelete}
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
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [selectedRole, setSelectedRole] = useState<OrbatRole | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const res = await fetch('/api/admin/orbat/roles')
        const data = await res.json().catch(() => ({}))
        setRoles(data.roles ?? [])
        setLoading(false)
    }, [])

    useEffect(() => { if (open) load() }, [open, load])
    useEffect(() => { if (!open) { setSearch(''); setSelectedRole(null); setError(null) } }, [open])

    async function patchParent(childId: string, parentRoleId: string | null) {
        setError(null)
        const res = await fetch(`/api/admin/orbat/roles/${childId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parentRoleId }),
        })
        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setError(data.error ?? 'Failed to update chain of command')
        }
        await load()
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth='lg'
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
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                        <CircularProgress size={26} />
                    </Box>
                ) : (
                    <>
                        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <Box sx={{ p: 1.5 }}>
                                <TextField
                                    size='small' placeholder='Search roles…' value={search} onChange={e => setSearch(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                    sx={searchFieldSx}
                                />
                            </Box>
                            <ReactFlowProvider>
                                <Canvas
                                    roles={roles}
                                    search={search}
                                    error={error}
                                    onConnectRoles={(childId, parentId) => patchParent(childId, parentId)}
                                    onDisconnectRole={childId => patchParent(childId, null)}
                                    onSelectRole={setSelectedRole}
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

- [ ] **Step 2: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. This is the primary verification for this task — the `@xyflow/react` and `dagre` API surface used here (`ReactFlow`, `ReactFlowProvider`, `Background`, `Controls`, `Handle`, `Position`, `MarkerType`, `useReactFlow`, `Node`/`Edge`/`NodeProps`/`Connection` types, and `dagre.graphlib.Graph`/`setGraph`/`setDefaultEdgeLabel`/`setNode`/`setEdge`/`layout`/`.node()`) was individually confirmed against the installed package's actual type declarations while writing this plan — if `tsc` disagrees with any of it, stop and report rather than guessing a fix, since it means the installed version differs from what was verified.

Trace through the logic by hand as your substitute for browser verification (not possible in this environment — no Discord OAuth, no browser tool):
- `layoutRoles`: does it correctly build a dagre graph from `roles`, position every role (including ones with no parent/children) as a node, and only create edges for roles that have a `parentRoleId`?
- `handleConnect`: does dragging from role A's bottom handle to role B's top handle correctly call `onConnectRoles(B's id, A's id)` (i.e. B becomes the child, A becomes the parent)?
- The search effect: does typing in the search box dim non-matching nodes and pan to the first match, without crashing when there are zero roles?

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/dashboard/orbat/ChainOfCommandPanel.tsx
git commit -m "Add Chain of Command node-canvas editor"
```

---

### Task 4: Wire the entry-point button into the Roles Manager

**Files:**
- Modify: `apps/web/app/dashboard/orbat/RolesManagerPanel.tsx`

**Interfaces:**
- Consumes: `ChainOfCommandPanel` default export from Task 3, `{ open: boolean; onClose: () => void }`.

- [ ] **Step 1: Add the import, state, button, and render call**

In `apps/web/app/dashboard/orbat/RolesManagerPanel.tsx`, add the import alongside the existing icon imports:

```ts
import { Close, Delete, Add, Search } from '@mui/icons-material'
import { PLATOON_CATEGORIES } from '@/lib/orbat/constants'
import ChainOfCommandPanel from './ChainOfCommandPanel'
```

Add state inside the `RolesManagerPanel` component, alongside the other `useState` calls near the top:

```ts
    const [permSearch, setPermSearch] = useState('')
    const [chainOpen, setChainOpen] = useState(false)
```

Add a button in the `DialogTitle`, between the title block and the close `IconButton`:

```tsx
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
                    <Button size='small' variant='outlined' onClick={() => setChainOpen(true)}
                        sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.85)' }}>
                        Chain of Command
                    </Button>
                    <IconButton size='small' onClick={onClose}><Close sx={{ fontSize: 18, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
                </div>
            </DialogTitle>
```

(This replaces the existing `<DialogTitle>` block, which previously had only the `IconButton` after the title `<div>` — wrap both the new `Button` and the existing `IconButton` in the new `<div style={{ display: 'flex', ... }}>` shown above.)

Render the panel at the end of the component, alongside the closing `</Dialog>`:

```tsx
            </DialogContent>
        </Dialog>
    )
```

becomes:

```tsx
            </DialogContent>

            <ChainOfCommandPanel open={chainOpen} onClose={() => setChainOpen(false)} />
        </Dialog>
    )
```

- [ ] **Step 2: Verify**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Trace through by hand: does `chainOpen` starting `false` mean the Chain of Command dialog doesn't render/fetch anything until the new button is clicked? Does closing it (`onClose`) correctly reset `chainOpen` to `false` without affecting the parent Roles Manager dialog's own state (`editingId`, `roleSearch`, etc.)?

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/dashboard/orbat/RolesManagerPanel.tsx
git commit -m "Add Chain of Command entry point to the Roles Manager"
```
