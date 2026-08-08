# J7 Trello-Style Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a customizable-column kanban board as a new J7 dashboard tab — freeform cards (title/description/assignee/optional linked task) draggable within and between columns, full audit trail via the existing Activity Log system.

**Architecture:** Two new flat MongoDB collections (`board_columns`, `board_cards`) following the existing `sectionOrder`/`positionOrder`-style ordering convention. A `department`-parameterized API + `BoardTab` component (mirroring `DeptTicketsTab`/`MeetingsTab`), wired into `J7Panel.tsx` only. Drag-and-drop combines the two dnd-kit patterns already proven in this codebase: `@dnd-kit/sortable`'s `useSortable` (per-card, for in-column reordering — used today in `OrbatManager.tsx`/`TrainingHub.tsx`) nested inside per-column `useDroppable` zones (for cross-column moves — used today in `AttendanceManageDialog.tsx`). Every mutation logs via the existing `logAction()`/`Db.actionLogs` system with a new `board` category, surfacing automatically in J7's existing "Activity Logs" toggle — no new log UI.

**Tech Stack:** Next.js 15 App Router, MongoDB (native driver), React 19 + MUI, `@dnd-kit/core` + `@dnd-kit/sortable` (already a dependency, no new packages), TypeScript.

## Global Constraints

- Path alias `@/` maps to the project root.
- All permission logic lives in `lib/permissions.ts` — reuse `PERMISSIONS.departments[dept]` (card actions) and `PERMISSIONS.departmentLeads[dept]` (column actions); no new permission keys needed, both already exist for every department including j7.
- Every mutating admin route checks auth via `client.fetchMe()` + `client.hasRoles()` before touching the DB.
- `Db` from `lib/mongo.ts` is the only way to touch MongoDB.
- MongoDB documents containing `ObjectId`/`Date` are round-tripped through `JSON.parse(JSON.stringify(x))` before `NextResponse.json(...)`, matching existing routes.
- No test suite exists in this repo. Verify via `npx tsc --noEmit`, `npx eslint <files>`, the dev server + curl for route-level auth checks, and manual browser verification for UI/drag behavior (call out explicitly in each task since drag-and-drop can't be curl-verified).
- **Corrected from the design spec:** the spec said the linked-task picker would call `GET /api/admin/tasks?view=all` — that endpoint is actually gated to J4 only (`app/api/admin/tasks/route.ts:49-52`), which would 403 for ordinary J7 members. Task 5 below instead merges `?view=mine` + `?view=created` (both available to any staff member per `PERMISSIONS.pages.admin`, which includes every department), matching the same two-source pattern `TasksPage.tsx` itself already uses for "My Tasks"/"Created by Me".

---

### Task 1: Data model — types, collections, activity-log category

**Files:**
- Create: `types/board.d.ts`
- Modify: `lib/mongo.ts`
- Modify: `types/logs.d.ts`
- Modify: `app/dashboard/_components/ActivityLogTab.tsx`

**Interfaces:**
- Produces: global `BoardColumn` (`_id, department, title, order, createdAt, createdBy, createdByName`), global `BoardCard` (`_id, department, columnId, title, description?, assigneeId?, assigneeName?, linkedTaskId?, order, createdAt, createdBy, createdByName`), `Db.boardColumns: MongoCollection<BoardColumn>`, `Db.boardCards: MongoCollection<BoardCard>`, `ActionCategory` gains `'board'`.

- [ ] **Step 1: Add the `BoardColumn`/`BoardCard` global types**

Create `types/board.d.ts`:

```ts
import type { ObjectId } from 'mongodb'


export { }

declare global {

    interface BoardColumn {
        _id: ObjectId
        department: string     // 'j7' for this build; department-scoped like every other dept tab
        title: string
        order: number
        createdAt: Date
        createdBy: string
        createdByName: string
    }

    interface BoardCard {
        _id: ObjectId
        department: string
        columnId: ObjectId
        title: string
        description?: string
        assigneeId?: string       // Discord ID
        assigneeName?: string     // denormalized display name, set alongside assigneeId
        linkedTaskId?: ObjectId   // optional reference into Db.tasks — resolved live on read, never duplicated
        order: number
        createdAt: Date
        createdBy: string
        createdByName: string
    }

}
```

- [ ] **Step 2: Register the two new collections**

In `lib/mongo.ts`, immediately after the `orbatRoles` line (`orbatRoles: db.collection('orbat_roles') as MongoCollection<OrbatRole>,`), add:

```ts
    boardColumns: db.collection('board_columns') as MongoCollection<BoardColumn>,
    boardCards: db.collection('board_cards') as MongoCollection<BoardCard>,
```

- [ ] **Step 3: Add the `board` action-log category**

In `types/logs.d.ts`, the `ActionCategory` union currently reads:

```ts
    type ActionCategory =
        | 'orbat'
        | 'calendar'
        | 'member'
        | 'operation'
        | 'system'
        | 'discord'
        | 'meeting'
        | 'ticket'
        | 'task'
        | 'training'
        | 'award'
        | 'teamspeak'
```

Add `'board'`:

```ts
    type ActionCategory =
        | 'orbat'
        | 'calendar'
        | 'member'
        | 'operation'
        | 'system'
        | 'discord'
        | 'meeting'
        | 'ticket'
        | 'task'
        | 'training'
        | 'award'
        | 'teamspeak'
        | 'board'
```

- [ ] **Step 4: Register the category in the Activity Log viewer**

In `app/dashboard/_components/ActivityLogTab.tsx`, the `CATEGORY_COLORS` map currently reads:

```ts
const CATEGORY_COLORS: Record<string, string> = {
    meeting:   'rgba(0,195,255,0.7)',
    ticket:    'rgba(219,0,29,0.7)',
    task:      'rgba(255,160,0,0.7)',
    calendar:  'rgba(74,222,128,0.7)',
    member:    'rgba(167,139,250,0.7)',
    orbat:     'rgba(237,237,237,0.5)',
    operation: 'rgba(255,120,0,0.7)',
    discord:   'rgba(88,101,242,0.7)',
    training:  'rgba(0,220,140,0.7)',
    award:     'rgba(255,200,0,0.7)',
    system:    'rgba(237,237,237,0.25)',
}

const ENTITY_TYPES = ['meeting','task','ticket','calendar','member','training','award','role']
const CATEGORIES   = ['meeting','ticket','task','calendar','member','orbat','operation','discord','training','award','system']
```

Change to:

```ts
const CATEGORY_COLORS: Record<string, string> = {
    meeting:   'rgba(0,195,255,0.7)',
    ticket:    'rgba(219,0,29,0.7)',
    task:      'rgba(255,160,0,0.7)',
    calendar:  'rgba(74,222,128,0.7)',
    member:    'rgba(167,139,250,0.7)',
    orbat:     'rgba(237,237,237,0.5)',
    operation: 'rgba(255,120,0,0.7)',
    discord:   'rgba(88,101,242,0.7)',
    training:  'rgba(0,220,140,0.7)',
    award:     'rgba(255,200,0,0.7)',
    system:    'rgba(237,237,237,0.25)',
    board:     'rgba(0,229,255,0.7)',
}

const ENTITY_TYPES = ['meeting','task','ticket','calendar','member','training','award','role','card','column']
const CATEGORIES   = ['meeting','ticket','task','calendar','member','orbat','operation','discord','training','award','system','board']
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors mentioning `board.d.ts`, `mongo.ts`, `logs.d.ts`, or `ActivityLogTab.tsx`.

- [ ] **Step 6: Commit**

```bash
git add types/board.d.ts lib/mongo.ts types/logs.d.ts app/dashboard/_components/ActivityLogTab.tsx
git commit -m "feat(j7-board): add BoardColumn/BoardCard types, collections, and board activity-log category"
```

---

### Task 2: Notification and DM plumbing for card assignment

**Files:**
- Modify: `types/notification.d.ts`
- Modify: `lib/notifications/types.ts`
- Modify: `lib/discord/bot.ts`

**Interfaces:**
- Consumes: `sendDM(userId, payload, messageType)` (existing, `lib/discord/bot.ts`), `DiscordEmbed` type (existing).
- Produces: `NotificationType` gains `'board_card_assigned'`; `sendBoardCardAssignedDM(userId: string, cardTitle: string, columnTitle: string, actionUrl?: string): Promise<void>`.

- [ ] **Step 1: Add the notification type**

In `types/notification.d.ts`, the `NotificationType` union ends with:

```ts
    | 'mission_check_requested'         // J2 leads: mission maker has submitted a check request
    | 'mission_check_confirmed'         // Mission maker: J2 confirmed the check will be handled
    | 'system'
```

Change to:

```ts
    | 'mission_check_requested'         // J2 leads: mission maker has submitted a check request
    | 'mission_check_confirmed'         // Mission maker: J2 confirmed the check will be handled
    | 'board_card_assigned'             // Member: a board card was assigned to you
    | 'system'
```

- [ ] **Step 2: Register it in the preferences metadata catalogue**

In `lib/notifications/types.ts`, insert a new section right before the existing `// ── General ──` block (i.e. right before the `system` entry):

```ts
    // ── Board ─────────────────────────────────────────────────────────────────
    {
        type: 'board_card_assigned',
        label: 'Board card assigned to you',
        description: 'When a department board card is assigned to you.',
        category: 'Board',
    },

    // ── General ───────────────────────────────────────────────────────────────
```

- [ ] **Step 3: Add the DM helper**

In `lib/discord/bot.ts`, add this function immediately after `sendTaskAssignedDM` (which ends with `await sendDM(userId, { embeds: [embed] }, 'task')` followed by a blank line and the next function's doc comment):

```ts
/**
 * Send a board-card-assigned DM.
 * Produces a consistently styled embed matching the site's branding.
 */
export async function sendBoardCardAssignedDM(
    userId: string,
    cardTitle: string,
    columnTitle: string,
    actionUrl?: string,
): Promise<void> {
    const embed: DiscordEmbed = {
        title: '🗂️ Board Card Assigned',
        description: `**${cardTitle}**\nColumn: ${columnTitle}`,
        color: 0xdb001d,
        footer: { text: 'ASOT Dashboard' },
        timestamp: new Date().toISOString(),
    }

    if (actionUrl) {
        const base = process.env.NEXT_PUBLIC_BASEURL ?? ''
        embed.fields = [{ name: '\u200b', value: `[View Board](${base}${actionUrl})`, inline: false }]
    }

    await sendDM(userId, { embeds: [embed] }, 'board')
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add types/notification.d.ts lib/notifications/types.ts lib/discord/bot.ts
git commit -m "feat(j7-board): add board_card_assigned notification type and DM helper"
```

---

### Task 3: Columns API

**Files:**
- Create: `app/api/admin/board/columns/route.ts`
- Create: `app/api/admin/board/columns/[id]/route.ts`

**Interfaces:**
- Consumes: `Db.boardColumns`, `Db.boardCards` (Task 1), `PERMISSIONS.departments`/`departmentLeads` (existing), `logAction` (`lib/logs.ts`, existing).
- Produces: `GET /api/admin/board/columns?department=j7` → `{ columns: BoardColumn[] }`; `POST` body `{ department, title }` → `{ column: BoardColumn }`; `PATCH /api/admin/board/columns/[id]` body `{ title?, order? }` → `{ success: true }`; `DELETE /api/admin/board/columns/[id]` → `{ success: true }` (cascades card deletion).

- [ ] **Step 1: Write the list + create route**

Create `app/api/admin/board/columns/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'


// ── GET /api/admin/board/columns?department=j7 ─────────────────────────────
// Any member of the department may view.

export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const department = request.nextUrl.searchParams.get('department')
    if (!department) return NextResponse.json({ error: 'department is required' }, { status: 400 })

    const deptKey = department as keyof typeof PERMISSIONS.departments
    if (!PERMISSIONS.departments[deptKey] || !client.hasRoles(me, PERMISSIONS.departments[deptKey])) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const columns = await Db.boardColumns.find({ department }).sort({ order: 1 }).toArray()
    return NextResponse.json({ columns: JSON.parse(JSON.stringify(columns)) })
}


// ── POST /api/admin/board/columns ───────────────────────────────────────────
// Body: { department, title }. Dept-lead or J4 only.

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { department, title } = await request.json()
    if (!department || typeof title !== 'string' || !title.trim()) {
        return NextResponse.json({ error: 'department and title are required' }, { status: 400 })
    }

    const leadKey = department as keyof typeof PERMISSIONS.departmentLeads
    if (!PERMISSIONS.departmentLeads[leadKey] || !client.hasRoles(me, PERMISSIONS.departmentLeads[leadKey])) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const last = await Db.boardColumns.find({ department }).sort({ order: -1 }).limit(1).toArray()
    const order = (last[0]?.order ?? -1) + 1

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const newColumn: BoardColumn = {
        _id: new ObjectId(),
        department,
        title: title.trim(),
        order,
        createdAt: new Date(),
        createdBy: me.id,
        createdByName: performedByName,
    }
    await Db.boardColumns.insertOne(newColumn)

    logAction({
        action: 'board.column.create',
        category: 'board',
        performedBy: me.id,
        performedByName,
        department,
        entityType: 'column',
        entityId: String(newColumn._id),
        target: `Created column "${newColumn.title}"`,
    })

    return NextResponse.json({ column: JSON.parse(JSON.stringify(newColumn)) })
}
```

- [ ] **Step 2: Write the rename/reorder/delete route**

Create `app/api/admin/board/columns/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'


function parseId(id: string): ObjectId | null {
    try { return new ObjectId(id) } catch { return null }
}

async function authLead(department: string) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    const leadKey = department as keyof typeof PERMISSIONS.departmentLeads
    if (!PERMISSIONS.departmentLeads[leadKey] || !client.hasRoles(me, PERMISSIONS.departmentLeads[leadKey])) return null
    return me
}


// ── PATCH /api/admin/board/columns/[id] ─────────────────────────────────────
// Body: { title?, order? }

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const objectId = parseId(id)
    if (!objectId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const column = await Db.boardColumns.findOne({ _id: objectId })
    if (!column) return NextResponse.json({ error: 'Column not found' }, { status: 404 })

    const me = await authLead(column.department)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const updates: Partial<BoardColumn> = {}
    if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim()
    if (typeof body.order === 'number') updates.order = body.order
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    await Db.boardColumns.updateOne({ _id: objectId }, { $set: updates })

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: updates.title ? 'board.column.rename' : 'board.column.reorder',
        category: 'board',
        performedBy: me.id,
        performedByName,
        department: column.department,
        entityType: 'column',
        entityId: id,
        target: updates.title ? `Renamed column "${column.title}" → "${updates.title}"` : `Reordered column "${column.title}"`,
    })

    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/board/columns/[id] ────────────────────────────────────
// Cascades: deletes every card in the column too.

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const objectId = parseId(id)
    if (!objectId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const column = await Db.boardColumns.findOne({ _id: objectId })
    if (!column) return NextResponse.json({ error: 'Column not found' }, { status: 404 })

    const me = await authLead(column.department)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await Db.boardCards.deleteMany({ columnId: objectId })
    await Db.boardColumns.deleteOne({ _id: objectId })

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'board.column.delete',
        category: 'board',
        performedBy: me.id,
        performedByName,
        department: column.department,
        entityType: 'column',
        entityId: id,
        target: `Deleted column "${column.title}"`,
    })

    return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Verify against the running dev server**

Start the dev server if not already running: `npm run dev` (check first whether one is already running on port 3000 — reuse it rather than starting a second one, since two `next dev`/`server.mjs` processes writing to the same `.next` cache directory corrupts it).

```bash
curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/api/admin/board/columns?department=j7
curl -s -w "\nHTTP %{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"department":"j7","title":"To Do"}' http://localhost:3000/api/admin/board/columns
```

Expected: both return `{"error":"Unauthorized"}` with `HTTP 401` (unauthenticated) — confirms the routes compile and load under Next.js and enforce auth before touching the DB.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/board/columns/route.ts "app/api/admin/board/columns/[id]/route.ts"
git commit -m "feat(j7-board): add board columns API"
```

---

### Task 4: Cards API

**Files:**
- Create: `app/api/admin/board/cards/route.ts`
- Create: `app/api/admin/board/cards/[id]/route.ts`

**Interfaces:**
- Consumes: `Db.boardColumns`, `Db.boardCards` (Task 1), `createNotification` (`lib/notifications`, existing), `sendBoardCardAssignedDM` (Task 2), `logAction`.
- Produces: `GET /api/admin/board/cards?department=j7` → `{ cards: BoardCard[] }` (all cards for the department; client groups by `columnId`); `POST` body `{ department, columnId, title, description?, assigneeId?, assigneeName?, linkedTaskId? }` → `{ card: BoardCard }`; `PATCH /api/admin/board/cards/[id]` body `{ columnId?, order?, title?, description?, assigneeId?, assigneeName?, linkedTaskId? }` → `{ success: true }`; `DELETE /api/admin/board/cards/[id]` → `{ success: true }`.

- [ ] **Step 1: Write the list + create route**

Create `app/api/admin/board/cards/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'
import { createNotification } from '@/lib/notifications'
import { sendBoardCardAssignedDM } from '@/lib/discord/bot'


function authMember(department: string, me: User) {
    const deptKey = department as keyof typeof PERMISSIONS.departments
    return !!PERMISSIONS.departments[deptKey] && client.hasRoles(me, PERMISSIONS.departments[deptKey])
}


// ── GET /api/admin/board/cards?department=j7 ────────────────────────────────

export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const department = request.nextUrl.searchParams.get('department')
    if (!department) return NextResponse.json({ error: 'department is required' }, { status: 400 })
    if (!authMember(department, me)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const cards = await Db.boardCards.find({ department }).sort({ order: 1 }).toArray()
    return NextResponse.json({ cards: JSON.parse(JSON.stringify(cards)) })
}


// ── POST /api/admin/board/cards ──────────────────────────────────────────────
// Body: { department, columnId, title, description?, assigneeId?, assigneeName?, linkedTaskId? }

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { department, columnId, title } = body
    if (!department || !columnId || typeof title !== 'string' || !title.trim()) {
        return NextResponse.json({ error: 'department, columnId, and title are required' }, { status: 400 })
    }
    if (!authMember(department, me)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let columnObjectId: ObjectId
    try { columnObjectId = new ObjectId(columnId) } catch { return NextResponse.json({ error: 'Invalid columnId' }, { status: 400 }) }

    const column = await Db.boardColumns.findOne({ _id: columnObjectId, department })
    if (!column) return NextResponse.json({ error: 'Column not found' }, { status: 404 })

    let linkedTaskObjectId: ObjectId | undefined
    if (typeof body.linkedTaskId === 'string' && body.linkedTaskId) {
        try { linkedTaskObjectId = new ObjectId(body.linkedTaskId) } catch { return NextResponse.json({ error: 'Invalid linkedTaskId' }, { status: 400 }) }
    }

    const last = await Db.boardCards.find({ columnId: columnObjectId }).sort({ order: -1 }).limit(1).toArray()
    const order = (last[0]?.order ?? -1) + 1

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const newCard: BoardCard = {
        _id: new ObjectId(),
        department,
        columnId: columnObjectId,
        title: title.trim(),
        description: typeof body.description === 'string' ? body.description.trim() || undefined : undefined,
        assigneeId: typeof body.assigneeId === 'string' ? body.assigneeId : undefined,
        assigneeName: typeof body.assigneeName === 'string' ? body.assigneeName : undefined,
        linkedTaskId: linkedTaskObjectId,
        order,
        createdAt: new Date(),
        createdBy: me.id,
        createdByName: performedByName,
    }
    await Db.boardCards.insertOne(newCard)

    logAction({
        action: 'board.card.create',
        category: 'board',
        performedBy: me.id,
        performedByName,
        department,
        entityType: 'card',
        entityId: String(newCard._id),
        target: `Created card "${newCard.title}" in "${column.title}"`,
    })

    if (newCard.assigneeId && newCard.assigneeId !== me.id) {
        const actionUrl = `/dashboard/${department}?tab=0`
        createNotification({
            userId: newCard.assigneeId,
            type: 'board_card_assigned',
            title: 'Board card assigned to you',
            body: `${performedByName} assigned you "${newCard.title}"`,
            actionUrl,
            relatedId: String(newCard._id),
        })
        sendBoardCardAssignedDM(newCard.assigneeId, newCard.title, column.title, actionUrl)
    }

    return NextResponse.json({ card: JSON.parse(JSON.stringify(newCard)) })
}
```

- [ ] **Step 2: Write the edit/move/delete route**

Create `app/api/admin/board/cards/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'
import { createNotification } from '@/lib/notifications'
import { sendBoardCardAssignedDM } from '@/lib/discord/bot'


function parseId(id: string): ObjectId | null {
    try { return new ObjectId(id) } catch { return null }
}

async function authMember(department: string) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    const deptKey = department as keyof typeof PERMISSIONS.departments
    if (!PERMISSIONS.departments[deptKey] || !client.hasRoles(me, PERMISSIONS.departments[deptKey])) return null
    return me
}


// ── PATCH /api/admin/board/cards/[id] ────────────────────────────────────────
// Body: { columnId?, order?, title?, description?, assigneeId?, assigneeName?, linkedTaskId? }
// columnId+order together = a move; other fields = an edit. Both may be sent at once.

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const objectId = parseId(id)
    if (!objectId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const card = await Db.boardCards.findOne({ _id: objectId })
    if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

    const me = await authMember(card.department)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const updates: Partial<BoardCard> = {}
    let targetColumn: BoardColumn | null = null

    if (typeof body.columnId === 'string') {
        let columnObjectId: ObjectId
        try { columnObjectId = new ObjectId(body.columnId) } catch { return NextResponse.json({ error: 'Invalid columnId' }, { status: 400 }) }
        targetColumn = await Db.boardColumns.findOne({ _id: columnObjectId, department: card.department })
        if (!targetColumn) return NextResponse.json({ error: 'Column not found' }, { status: 404 })
        updates.columnId = columnObjectId
    }
    if (typeof body.order === 'number') updates.order = body.order
    if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim()
    if ('description' in body) updates.description = typeof body.description === 'string' ? body.description.trim() || undefined : undefined
    if ('linkedTaskId' in body) {
        if (body.linkedTaskId === null) {
            updates.linkedTaskId = undefined
        } else if (typeof body.linkedTaskId === 'string') {
            try { updates.linkedTaskId = new ObjectId(body.linkedTaskId) } catch { return NextResponse.json({ error: 'Invalid linkedTaskId' }, { status: 400 }) }
        }
    }

    const wasReassigned = 'assigneeId' in body && body.assigneeId !== card.assigneeId
    if ('assigneeId' in body) {
        updates.assigneeId = typeof body.assigneeId === 'string' ? body.assigneeId : undefined
        updates.assigneeName = typeof body.assigneeName === 'string' ? body.assigneeName : undefined
    }

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    // Mongo rejects $set with an explicit `undefined` value — strip keys that were cleared.
    const setDoc: Record<string, unknown> = {}
    const unsetDoc: Record<string, ''> = {}
    for (const [k, v] of Object.entries(updates)) {
        if (v === undefined) unsetDoc[k] = ''
        else setDoc[k] = v
    }
    await Db.boardCards.updateOne(
        { _id: objectId },
        { ...(Object.keys(setDoc).length ? { $set: setDoc } : {}), ...(Object.keys(unsetDoc).length ? { $unset: unsetDoc } : {}) },
    )

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const isMove = !!targetColumn
    logAction({
        action: isMove ? 'board.card.move' : 'board.card.edit',
        category: 'board',
        performedBy: me.id,
        performedByName,
        department: card.department,
        entityType: 'card',
        entityId: id,
        target: isMove ? `Moved "${card.title}" to "${targetColumn!.title}"` : `Edited card "${card.title}"`,
    })

    if (wasReassigned && updates.assigneeId && updates.assigneeId !== me.id) {
        const columnTitle = targetColumn?.title ?? (await Db.boardColumns.findOne({ _id: card.columnId }))?.title ?? ''
        const actionUrl = `/dashboard/${card.department}?tab=0`
        createNotification({
            userId: updates.assigneeId,
            type: 'board_card_assigned',
            title: 'Board card assigned to you',
            body: `${performedByName} assigned you "${card.title}"`,
            actionUrl,
            relatedId: id,
        })
        sendBoardCardAssignedDM(updates.assigneeId, card.title, columnTitle, actionUrl)
    }

    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/board/cards/[id] ───────────────────────────────────────

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const objectId = parseId(id)
    if (!objectId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const card = await Db.boardCards.findOne({ _id: objectId })
    if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

    const me = await authMember(card.department)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await Db.boardCards.deleteOne({ _id: objectId })

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'board.card.delete',
        category: 'board',
        performedBy: me.id,
        performedByName,
        department: card.department,
        entityType: 'card',
        entityId: id,
        target: `Deleted card "${card.title}"`,
    })

    return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Verify against the running dev server**

```bash
curl -s -w "\nHTTP %{http_code}\n" "http://localhost:3000/api/admin/board/cards?department=j7"
curl -s -w "\nHTTP %{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"department":"j7","columnId":"000000000000000000000000","title":"Test"}' http://localhost:3000/api/admin/board/cards
```

Expected: both `{"error":"Unauthorized"}` / `HTTP 401` — confirms compile + auth enforcement.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/board/cards/route.ts "app/api/admin/board/cards/[id]/route.ts"
git commit -m "feat(j7-board): add board cards API"
```

---

### Task 5: Card detail/edit modal

**Files:**
- Create: `app/dashboard/j7/tabs/BoardCardModal.tsx`

**Interfaces:**
- Consumes: `MemberPicker` (`app/dashboard/_components/meetings/MemberPicker.tsx`, existing — `{value: {id,name}|null, onChange, department, placeholder?}`), `GET /api/admin/tasks?view=mine`/`?view=created` (existing, corrected per Global Constraints), `POST/PATCH /api/admin/board/cards` (Task 4).
- Produces: `<BoardCardModal open, onClose, department, columnId, card, onSaved>` default export — `card: BoardCard | null` (`null` = create mode, otherwise edit mode).

- [ ] **Step 1: Write the modal component**

Create `app/dashboard/j7/tabs/BoardCardModal.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, IconButton, CircularProgress, Alert } from '@mui/material'
import { Close } from '@mui/icons-material'
import MemberPicker from '@/app/dashboard/_components/meetings/MemberPicker'

interface TaskOption {
    _id: string
    title: string
    dueDate: string | null
    completedAt: string | null
}

interface Props {
    open: boolean
    onClose: () => void
    department: string
    columnId: string
    card: BoardCard | null   // null = create mode
    onSaved: () => void | Promise<void>
}

export default function BoardCardModal({ open, onClose, department, columnId, card, onSaved }: Props) {
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [assignee, setAssignee] = useState<{ id: string; name: string } | null>(null)
    const [linkedTask, setLinkedTask] = useState<TaskOption | null>(null)
    const [taskOptions, setTaskOptions] = useState<TaskOption[]>([])
    const [taskQuery, setTaskQuery] = useState('')
    const [taskPickerOpen, setTaskPickerOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        setTitle(card?.title ?? '')
        setDescription(card?.description ?? '')
        setAssignee(card?.assigneeId ? { id: card.assigneeId, name: card.assigneeName ?? card.assigneeId } : null)
        setLinkedTask(null)   // resolved below if card.linkedTaskId is set
        setError(null)

        if (card?.linkedTaskId) {
            fetch('/api/admin/tasks?view=mine').then(r => r.json()).then(d => {
                const found = (d.tasks ?? []).find((t: TaskOption) => t._id === String(card.linkedTaskId))
                if (found) setLinkedTask(found)
            }).catch(() => {})
        }
    }, [open, card])

    const loadTaskOptions = useCallback(() => {
        if (taskOptions.length > 0) return
        Promise.all([
            fetch('/api/admin/tasks?view=mine').then(r => r.json()),
            fetch('/api/admin/tasks?view=created').then(r => r.json()),
        ]).then(([mine, created]) => {
            const merged = new Map<string, TaskOption>()
            for (const t of [...(mine.tasks ?? []), ...(created.tasks ?? [])]) merged.set(t._id, t)
            setTaskOptions([...merged.values()])
        }).catch(() => {})
    }, [taskOptions.length])

    async function handleSave() {
        if (!title.trim()) { setError('Title is required'); return }
        setSaving(true)
        setError(null)

        const body = {
            department,
            columnId,
            title: title.trim(),
            description: description.trim() || undefined,
            assigneeId: assignee?.id,
            assigneeName: assignee?.name,
            linkedTaskId: linkedTask?._id ?? null,
        }

        const res = card
            ? await fetch(`/api/admin/board/cards/${card._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            : await fetch('/api/admin/board/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

        setSaving(false)
        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setError(data.error ?? 'Save failed')
            return
        }
        await onSaved()
        onClose()
    }

    const filteredTasks = taskQuery.trim()
        ? taskOptions.filter(t => t.title.toLowerCase().includes(taskQuery.toLowerCase()))
        : taskOptions

    return (
        <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth
            PaperProps={{ sx: { background: 'rgba(12,12,16,0.98)', border: '1px solid rgba(219,0,29,0.25)', borderTop: '3px solid var(--red)' } }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                    {card ? 'Edit Card' : 'New Card'}
                </span>
                <IconButton size='small' onClick={onClose}><Close sx={{ fontSize: 16, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
            </DialogTitle>

            <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {error && <Alert severity='error' sx={{ fontSize: '0.72rem' }}>{error}</Alert>}

                <TextField size='small' label='Title' value={title} onChange={e => setTitle(e.target.value)} autoFocus fullWidth sx={{ mt: 1 }} />
                <TextField size='small' label='Description' value={description} onChange={e => setDescription(e.target.value)} multiline minRows={3} fullWidth />

                <div>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>Assignee</div>
                    <MemberPicker value={assignee} onChange={setAssignee} department={department as any} placeholder='Assign to…' />
                </div>

                <div style={{ position: 'relative' }}>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>Linked task (optional)</div>
                    {linkedTask ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'rgba(219,0,29,0.07)', border: '1px solid rgba(219,0,29,0.25)' }}>
                            <span style={{ flex: 1, fontSize: '0.73rem', color: 'rgba(237,237,237,0.8)' }}>
                                {linkedTask.title}{linkedTask.completedAt ? ' ✓' : ''}
                            </span>
                            <button type='button' onClick={() => setLinkedTask(null)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.35)' }}>
                                <Close sx={{ fontSize: 11 }} />
                            </button>
                        </div>
                    ) : (
                        <input
                            value={taskQuery}
                            onChange={e => setTaskQuery(e.target.value)}
                            onFocus={() => { setTaskPickerOpen(true); loadTaskOptions() }}
                            onBlur={() => setTimeout(() => setTaskPickerOpen(false), 150)}
                            placeholder='Search your tasks…'
                            style={{ all: 'unset', display: 'block', width: '100%', fontSize: '0.75rem', color: 'var(--foreground)', background: 'rgba(255,255,255,0.04)', padding: '5px 8px', border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box' }}
                        />
                    )}
                    {taskPickerOpen && !linkedTask && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'rgb(13,13,13)', border: '1px solid rgba(255,255,255,0.12)', maxHeight: 200, overflowY: 'auto' }}>
                            {filteredTasks.length === 0 && <div style={{ padding: '8px 10px', fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)' }}>No matching tasks</div>}
                            {filteredTasks.slice(0, 20).map(t => (
                                <button key={t._id} type='button'
                                    onMouseDown={() => { setLinkedTask(t); setTaskQuery('') }}
                                    style={{ all: 'unset', display: 'block', width: '100%', padding: '7px 10px', cursor: 'pointer', fontSize: '0.73rem', color: 'rgba(237,237,237,0.75)', boxSizing: 'border-box' }}
                                >
                                    {t.title}{t.completedAt ? ' ✓' : ''}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <Button size='small' onClick={onClose} sx={{ color: 'rgba(237,237,237,0.4)' }}>Cancel</Button>
                <Button size='small' variant='contained' disabled={saving} onClick={handleSave}>
                    {saving ? <CircularProgress size={14} sx={{ color: 'white' }} /> : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors. Note: `department={department as any}` is used because `MemberPicker`'s `department` prop is typed `MeetingDepartment` (`'j1'|...|'j7'`) while `BoardCardModal` takes a plain `string` (to stay consistent with the department-parameterized API) — this is a narrow, deliberate cast at one call site, not a broader type-safety compromise.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/j7/tabs/BoardCardModal.tsx
git commit -m "feat(j7-board): add card detail/edit modal"
```

---

### Task 6: Board UI with drag-and-drop

**Files:**
- Create: `app/dashboard/j7/tabs/BoardTab.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/admin/board/columns`, `PATCH/DELETE /api/admin/board/columns/[id]` (Task 3), `GET/POST /api/admin/board/cards`, `PATCH/DELETE /api/admin/board/cards/[id]` (Task 4), `BoardCardModal` (Task 5), `ConfirmDialog` (`components/confirm-dialog.tsx`, existing — `{open, title, message?, confirmLabel?, danger?, onConfirm, onCancel}`).
- Produces: `<BoardTab department: string, canManageColumns: boolean>` default export.

- [ ] **Step 1: Write the board component**

Create `app/dashboard/j7/tabs/BoardTab.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { IconButton, TextField, CircularProgress } from '@mui/material'
import { Add, Close, DragIndicator, Delete } from '@mui/icons-material'
import {
    DndContext, PointerSensor, useSensor, useSensors, useDroppable,
    type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ConfirmDialog from '@/components/confirm-dialog'
import BoardCardModal from './BoardCardModal'

interface Props {
    department: string
    canManageColumns: boolean
}

// ── Draggable + sortable card ────────────────────────────────────────────────

function SortableCard({ card, onClick }: { card: BoardCard; onClick: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(card._id) })

    return (
        <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            onClick={onClick}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                padding: '8px 10px',
                marginBottom: 6,
                background: isDragging ? 'rgba(20,20,24,0.97)' : 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderLeft: '2px solid var(--red)',
                cursor: 'grab',
                touchAction: 'none',
                opacity: isDragging ? 0.5 : 1,
            }}
        >
            <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.85)', marginBottom: card.assigneeName || card.linkedTaskId ? 4 : 0 }}>
                {card.title}
            </div>
            {card.assigneeName && (
                <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)' }}>👤 {card.assigneeName}</div>
            )}
            {card.linkedTaskId && (
                <div style={{ fontSize: '0.62rem', color: 'rgba(0,229,255,0.6)' }}>🔗 Linked task</div>
            )}
        </div>
    )
}

// ── Droppable column ──────────────────────────────────────────────────────────

function Column({
    column, cards, canManageColumns, onAddCard, onEditCard, onRename, onDelete,
}: {
    column: BoardColumn
    cards: BoardCard[]
    canManageColumns: boolean
    onAddCard: (columnId: string) => void
    onEditCard: (card: BoardCard) => void
    onRename: (columnId: string, title: string) => void
    onDelete: (columnId: string) => void
}) {
    const { setNodeRef, isOver } = useDroppable({ id: String(column._id) })
    const [editing, setEditing] = useState(false)
    const [titleVal, setTitleVal] = useState(column.title)

    const cardIds = useMemo(() => cards.map(c => String(c._id)), [cards])

    return (
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px', marginBottom: 4 }}>
                {editing ? (
                    <TextField
                        size='small' value={titleVal} autoFocus
                        onChange={e => setTitleVal(e.target.value)}
                        onBlur={() => { setEditing(false); if (titleVal.trim() && titleVal !== column.title) onRename(String(column._id), titleVal.trim()) }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        inputProps={{ style: { fontSize: '0.72rem', padding: '2px 6px' } }}
                        sx={{ flex: 1 }}
                    />
                ) : (
                    <span
                        onClick={() => canManageColumns && setEditing(true)}
                        style={{ flex: 1, fontSize: '0.68rem', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(237,237,237,0.6)', cursor: canManageColumns ? 'text' : 'default' }}
                    >
                        {column.title}
                    </span>
                )}
                <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.25)' }}>{cards.length}</span>
                {canManageColumns && (
                    <IconButton size='small' onClick={() => onDelete(String(column._id))} sx={{ p: 0.25 }}>
                        <Delete sx={{ fontSize: 13, color: 'rgba(219,0,29,0.4)' }} />
                    </IconButton>
                )}
            </div>

            <div
                ref={setNodeRef}
                style={{
                    flex: 1, minHeight: 80, padding: 6,
                    background: isOver ? 'rgba(219,0,29,0.05)' : 'rgba(255,255,255,0.015)',
                    border: `1px solid ${isOver ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.06)'}`,
                    borderTop: `2px solid ${isOver ? 'var(--red)' : 'rgba(255,255,255,0.1)'}`,
                    transition: 'background 0.15s, border-color 0.15s',
                }}
            >
                <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
                    {cards.map(card => (
                        <SortableCard key={String(card._id)} card={card} onClick={() => onEditCard(card)} />
                    ))}
                </SortableContext>
                <button
                    onClick={() => onAddCard(String(column._id))}
                    style={{ all: 'unset', display: 'flex', alignItems: 'center', gap: 4, width: '100%', padding: '6px 4px', cursor: 'pointer', fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)' }}
                >
                    <Add sx={{ fontSize: 13 }} /> Add card
                </button>
            </div>
        </div>
    )
}

// ── Main tab ───────────────────────────────────────────────────────────────────

export default function BoardTab({ department, canManageColumns }: Props) {
    const [columns, setColumns] = useState<BoardColumn[]>([])
    const [cards, setCards] = useState<BoardCard[]>([])
    const [loading, setLoading] = useState(true)
    const [addingColumn, setAddingColumn] = useState(false)
    const [newColumnTitle, setNewColumnTitle] = useState('')
    const [modalState, setModalState] = useState<{ columnId: string; card: BoardCard | null } | null>(null)
    const [confirmDeleteColumn, setConfirmDeleteColumn] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const [colRes, cardRes] = await Promise.all([
            fetch(`/api/admin/board/columns?department=${department}`).then(r => r.json()),
            fetch(`/api/admin/board/cards?department=${department}`).then(r => r.json()),
        ])
        setColumns(colRes.columns ?? [])
        setCards(cardRes.cards ?? [])
        setLoading(false)
    }, [department])

    useEffect(() => { load() }, [load])

    const cardsByColumn = useMemo(() => {
        const map = new Map<string, BoardCard[]>()
        for (const col of columns) map.set(String(col._id), [])
        for (const card of cards) {
            const key = String(card.columnId)
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(card)
        }
        for (const list of map.values()) list.sort((a, b) => a.order - b.order)
        return map
    }, [columns, cards])

    // ── DnD ─────────────────────────────────────────────────────────────────────

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

    function findColumnOf(cardId: string): string | null {
        for (const [colId, list] of cardsByColumn) {
            if (list.some(c => String(c._id) === cardId)) return colId
        }
        return null
    }

    async function onDragEnd({ active, over }: DragEndEvent) {
        if (!over) return
        const activeId = String(active.id)
        const overId = String(over.id)
        if (activeId === overId) return

        const fromColId = findColumnOf(activeId)
        if (!fromColId) return

        // Dropped over a column's empty area (over.id is a column id) or over another card
        const toColId = columns.some(c => String(c._id) === overId) ? overId : findColumnOf(overId)
        if (!toColId) return

        const toList = cardsByColumn.get(toColId) ?? []
        const overIndex = toList.findIndex(c => String(c._id) === overId)
        const newOrder = overIndex >= 0 ? toList[overIndex].order : (toList[toList.length - 1]?.order ?? -1) + 1

        // Optimistic local update
        setCards(prev => prev.map(c => String(c._id) === activeId ? { ...c, columnId: new (c.columnId.constructor as any)(toColId), order: newOrder } : c))

        await fetch(`/api/admin/board/cards/${activeId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ columnId: toColId, order: newOrder }),
        })
        load()
    }

    // ── Column CRUD ──────────────────────────────────────────────────────────────

    async function handleAddColumn() {
        if (!newColumnTitle.trim()) return
        setAddingColumn(false)
        await fetch('/api/admin/board/columns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ department, title: newColumnTitle.trim() }),
        })
        setNewColumnTitle('')
        load()
    }

    async function handleRenameColumn(columnId: string, title: string) {
        await fetch(`/api/admin/board/columns/${columnId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
        })
        load()
    }

    async function handleDeleteColumn() {
        if (!confirmDeleteColumn) return
        await fetch(`/api/admin/board/columns/${confirmDeleteColumn}`, { method: 'DELETE' })
        setConfirmDeleteColumn(null)
        load()
    }

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><CircularProgress size={22} /></div>
    }

    return (
        <div style={{ padding: '16px 24px', overflowX: 'auto' }}>
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    {columns.map(col => (
                        <Column
                            key={String(col._id)}
                            column={col}
                            cards={cardsByColumn.get(String(col._id)) ?? []}
                            canManageColumns={canManageColumns}
                            onAddCard={columnId => setModalState({ columnId, card: null })}
                            onEditCard={card => setModalState({ columnId: String(card.columnId), card })}
                            onRename={handleRenameColumn}
                            onDelete={columnId => setConfirmDeleteColumn(columnId)}
                        />
                    ))}

                    {canManageColumns && (
                        <div style={{ width: 220, flexShrink: 0 }}>
                            {addingColumn ? (
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <TextField
                                        size='small' autoFocus value={newColumnTitle}
                                        onChange={e => setNewColumnTitle(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') setAddingColumn(false) }}
                                        placeholder='Column name…'
                                        inputProps={{ style: { fontSize: '0.72rem' } }}
                                        sx={{ flex: 1 }}
                                    />
                                    <IconButton size='small' onClick={() => setAddingColumn(false)}><Close sx={{ fontSize: 14 }} /></IconButton>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setAddingColumn(true)}
                                    style={{ all: 'unset', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', padding: '6px 4px' }}
                                >
                                    <Add sx={{ fontSize: 14 }} /> Add column
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </DndContext>

            {modalState && (
                <BoardCardModal
                    open
                    onClose={() => setModalState(null)}
                    department={department}
                    columnId={modalState.columnId}
                    card={modalState.card}
                    onSaved={load}
                />
            )}

            <ConfirmDialog
                open={!!confirmDeleteColumn}
                title='Delete column?'
                message='This deletes the column and every card in it. This cannot be undone.'
                confirmLabel='Delete'
                danger
                onConfirm={handleDeleteColumn}
                onCancel={() => setConfirmDeleteColumn(null)}
            />
        </div>
    )
}
```

**Note on `onDragEnd`'s optimistic update:** `new (c.columnId.constructor as any)(toColId)` reconstructs an `ObjectId`-shaped value client-side purely for the optimistic UI patch before `load()` refetches real data — the same client/server `ObjectId`-vs-string looseness already present in `OrbatManager.tsx`'s optimistic-update helpers (see the ORBAT Roles work). If this reads awkwardly during implementation, simplify to `columnId: toColId as unknown as BoardCard['columnId']` — both are just satisfying TypeScript for a value that gets overwritten by the very next `load()` call regardless.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Verify in the browser**

With the dev server running, log in as a J7 department-lead member, navigate to wherever `BoardTab` is rendered (this task doesn't wire it into `J7Panel.tsx` yet — Task 7 does; for now, temporarily render `<BoardTab department='j7' canManageColumns={true} />` from any existing dashboard page you can reach, or wait and do this verification as part of Task 7's browser check instead). Confirm: "Add column" creates a column; clicking a column title renames it; "Add card" opens the modal and creates a card; dragging a card to another column moves it; dragging a card within a column reorders it; delete column shows the confirm dialog and removes its cards.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/j7/tabs/BoardTab.tsx
git commit -m "feat(j7-board): add board UI with drag-and-drop columns and cards"
```

---

### Task 7: Wire the Board tab into J7Panel

**Files:**
- Modify: `app/dashboard/j7/J7Panel.tsx`

**Interfaces:**
- Consumes: `BoardTab` (Task 6).

- [ ] **Step 1: Add the import**

In `app/dashboard/j7/J7Panel.tsx`, add after the existing `DeptTicketsTab` import:

```tsx
import BoardTab from './tabs/BoardTab'
```

- [ ] **Step 2: Add the Board tab, shifting Meetings/Tickets to indices 1/2**

The current `Tabs` block reads:

```tsx
                        <Tabs
                            value={tab}
                            onChange={(_, v) => setTab(v)}
                            TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                            sx={{ minHeight: 40 }}
                        >
                            <Tab label={<PinTabLabel label='Meetings' pinLabel='J7 — Meetings' href='/dashboard/j7' tabIndex={0} />} sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', minHeight: 40, padding: '8px 16px', color: 'rgba(237,237,237,0.5)', '&.Mui-selected': { color: 'var(--foreground)' } }} />
                            <Tab label={<PinTabLabel label='Tickets'  pinLabel='J7 — Tickets'  href='/dashboard/j7' tabIndex={1} />} sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', minHeight: 40, padding: '8px 16px', color: 'rgba(237,237,237,0.5)', '&.Mui-selected': { color: 'var(--foreground)' } }} />
                        </Tabs>
                    </div>

                    <div className='flex-1 min-h-0 mt-0'>
                        {tab === 0 && <MeetingsTab department='j7' userId={userId} isLead={canManageMembers || isJ4} />}
                        {tab === 1 && <DeptTicketsTab department='j7' canManage={canManageMembers || isJ4} isJ4={isJ4} />}
                    </div>
```

Replace with:

```tsx
                        <Tabs
                            value={tab}
                            onChange={(_, v) => setTab(v)}
                            TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                            sx={{ minHeight: 40 }}
                        >
                            <Tab label={<PinTabLabel label='Board'    pinLabel='J7 — Board'    href='/dashboard/j7' tabIndex={0} />} sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', minHeight: 40, padding: '8px 16px', color: 'rgba(237,237,237,0.5)', '&.Mui-selected': { color: 'var(--foreground)' } }} />
                            <Tab label={<PinTabLabel label='Meetings' pinLabel='J7 — Meetings' href='/dashboard/j7' tabIndex={1} />} sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', minHeight: 40, padding: '8px 16px', color: 'rgba(237,237,237,0.5)', '&.Mui-selected': { color: 'var(--foreground)' } }} />
                            <Tab label={<PinTabLabel label='Tickets'  pinLabel='J7 — Tickets'  href='/dashboard/j7' tabIndex={2} />} sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', minHeight: 40, padding: '8px 16px', color: 'rgba(237,237,237,0.5)', '&.Mui-selected': { color: 'var(--foreground)' } }} />
                        </Tabs>
                    </div>

                    <div className='flex-1 min-h-0 mt-0'>
                        {tab === 0 && <BoardTab department='j7' canManageColumns={canManageMembers || isJ4} />}
                        {tab === 1 && <MeetingsTab department='j7' userId={userId} isLead={canManageMembers || isJ4} />}
                        {tab === 2 && <DeptTicketsTab department='j7' canManage={canManageMembers || isJ4} isJ4={isJ4} />}
                    </div>
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Verify in the browser end-to-end**

With the dev server running (reuse whatever's already running — don't start a second one), log in as a J7 lead or J4 member, go to `/dashboard/j7`. Confirm the "Board" tab is first and loads. Run through the full flow: add a column, add a card (with an assignee and a linked task), drag it to a second column, drag-reorder it within a column, edit its description, delete it, delete the column (confirm dialog appears). Then switch to the "Activity Logs" header toggle and confirm every one of those actions appears with correct `target` text and the cyan `board` category badge. Log in as a plain (non-lead) J7 member and confirm the "Add column"/column-delete/column-rename affordances are hidden but card creation/editing/dragging still works.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/j7/J7Panel.tsx
git commit -m "feat(j7-board): wire Board tab into J7Panel"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1), permissions (Tasks 3/4, reusing existing `PERMISSIONS.departments`/`departmentLeads` — no new keys per spec), activity logging (Task 1 category + every mutation in Tasks 3/4), UI/drag-and-drop (Task 6), linked-task picker (Task 5, with the `view=all`→`view=mine`+`view=created` correction noted in Global Constraints), notifications (Task 2 + wired into Task 4's card routes), J7Panel wiring (Task 7). All spec sections have a corresponding task.
- **Ordering:** Tasks 1–2 are pure additive plumbing (new types/collections/notification-type, nothing references them yet — zero risk of breaking the running app). Tasks 3–4 add new API routes nothing calls yet. Tasks 5–6 build UI that isn't reachable from anywhere. Task 7 is the single wiring step that makes it all live — the app is buildable and deployable after every single task.
- **Type consistency:** `BoardColumn`/`BoardCard` field names introduced in Task 1 (`department`, `columnId`, `order`, `assigneeId`/`assigneeName`, `linkedTaskId`) are used identically across Tasks 3, 4, 5, and 6 — checked every call site against the Task 1 interface.
- **Corrected mid-plan:** the design spec's assumption that `GET /api/admin/tasks?view=all` was usable by any J7 member was wrong (it's J4-gated) — verified against the actual route source before writing Task 5, and used `?view=mine` + `?view=created` instead (both open to any staff department per `PERMISSIONS.pages.admin`).
