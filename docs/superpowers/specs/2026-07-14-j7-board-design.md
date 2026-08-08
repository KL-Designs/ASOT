# J7 Trello-Style Board — Design

**Date:** 2026-07-14
**Status:** Approved for planning

## Problem

J7 (Community Development) has no lightweight way to track initiatives/ideas/work-in-progress as a visual board. `J7Panel.tsx` currently has only Meetings and Tickets tabs (no unique feature tab — unlike J5's Gallery or J6's Zeus Notes). The site-wide `Db.tasks` system exists but is assignment/due-date driven, not a freeform kanban board, and isn't the right shape for "an idea we're kicking around" that may never become a formal task.

## Goals

1. A single, customizable-column kanban board as a new tab in `J7Panel.tsx`.
2. Cards are freeform (title/description/assignee) with an optional link to an existing `Db.tasks` item.
3. Full audit trail — who created/edited/moved/deleted every card and column — surfaced through the site's existing Activity Log system, not a bespoke log UI.

## Non-goals

- Multiple boards / board switching — one single board for J7.
- Rewiring the `Db.tasks` system itself — cards optionally *reference* a task, they are never task-identical.
- Wiring this into any department other than J7 in this build (see "Component shape" below for why it's still built generically).
- Card comments, attachments, or color labels — trimmed for v1 per YAGNI; description + assignee + linked task covers the stated need.

## Data model

Two new collections, following the same flat-collection-plus-order-field pattern already used for `orbat_positions` (`sectionOrder`/`positionOrder`) and `training_types` (`sortOrder`) — chosen over nesting cards inside a column document or columns inside one board document, because a single drag-reorder becomes a one-document update instead of rewriting a nested array, and it matches how every other ordered list in this codebase is modeled.

```ts
interface BoardColumn {
    _id: ObjectId
    department: string      // 'j7' for this build
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
    assigneeId?: string       // Discord ID of a department member
    linkedTaskId?: ObjectId   // optional reference into Db.tasks — resolved live on read, never duplicated
    order: number             // position within its column
    createdAt: Date
    createdBy: string
    createdByName: string
}
```

A card's linked task is resolved live from `Db.tasks` when the board loads (status/due date shown as a small read-only chip, click-through to the Tasks page) — never copied onto the card, so it can't go stale.

## Permissions

- **Cards** (create/edit/move/delete): any member of the department (`PERMISSIONS.departments.j7`).
- **Columns** (create/rename/delete/reorder): department lead (`canManageMembers`) or J4 — the same prop `J7Panel` already receives and passes into `MeetingsTab`/`DeptTicketsTab`.

## Activity logging

Every mutation calls the existing `logAction()` (`lib/logs.ts`), writing to the existing `Db.actionLogs` collection — no new collection or log UI:

| Action | `action` value | `entityType` |
|---|---|---|
| Create column | `board.column.create` | `column` |
| Rename column | `board.column.rename` | `column` |
| Reorder column | `board.column.reorder` | `column` |
| Delete column | `board.column.delete` | `column` |
| Create card | `board.card.create` | `card` |
| Edit card | `board.card.edit` | `card` |
| Move card | `board.card.move` | `card` |
| Delete card | `board.card.delete` | `card` |

Each entry sets `category: 'board'`, `department: 'j7'`, `performedBy`/`performedByName`, and a human-readable `target` (e.g. `Moved "Fix login bug" from To Do → In Progress`). This automatically surfaces in J7's existing "Activity Logs" header toggle (`ActivityLogTab`, already wired in `J7Panel.tsx`) — requires adding `'board'` to the `ActionCategory` union (`types/logs.d.ts`) and to `ActivityLogTab.tsx`'s `CATEGORY_COLORS`/`CATEGORIES`/`ENTITY_TYPES` maps (a handful of lines), not a new component.

## UI

New tab in `J7Panel.tsx`, placed first (index 0) — matching how J5's Gallery and J6's Zeus Notes each occupy their department's lead feature-tab slot — pushing Meetings/Tickets to indices 1/2.

`BoardTab` component: horizontal-scrolling columns using `@dnd-kit/core` + `@dnd-kit/sortable` (already a dependency, already used exactly this way in `OrbatManager.tsx` and `TrainingHub.tsx` — no new library). Drag cards within/between columns; drag columns to reorder (lead/J4 only — regular members still see drag handles disabled on columns, active on cards). "+ Add card" button per column. "+ Add column" button at the end of the row, hidden for non-leads. Clicking a card opens a modal to edit description/assignee/linked-task; deleting requires a confirm step (matching `ConfirmDialog` used elsewhere in admin UIs).

Linked-task picker searches `GET /api/admin/tasks?view=all` (existing route, no new task-search endpoint).

### Component shape: department-parameterized, J7-only wiring

`BoardTab` takes a `department` prop and stores/queries by it, following the exact convention every other dept-tab component in this codebase already uses (`DeptMembersTab`, `DeptCalendarTab`, `DeptTicketsTab`, `MeetingsTab`) — this costs nothing extra to build and avoids a rename/refactor if another department wants a board later. It is only rendered from `J7Panel.tsx` in this build; no other department gets a "Board" tab or button pointing at it.

## Notifications

Assigning a card to a member fires `createNotification()` + a Discord DM, consistent with every other assignment-shaped feature in this codebase (tasks, tickets, meetings) — approved in the brainstorming discussion.

## API surface

- `GET/POST /api/admin/board/columns?department=j7` — list / create. POST gated to lead/J4.
- `PATCH /api/admin/board/columns/[id]` — rename and/or reorder (`{title?, order?}`). Lead/J4 gated.
- `DELETE /api/admin/board/columns/[id]` — delete a column and all its cards. Lead/J4 gated. Confirm-gated in the UI given it cascades.
- `GET /api/admin/board/cards?department=j7` — list all cards for the department (client groups by `columnId`).
- `POST /api/admin/board/cards` — create (`{department, columnId, title, description?, assigneeId?, linkedTaskId?}`). Dept-membership gated.
- `PATCH /api/admin/board/cards/[id]` — edit fields and/or move (`{columnId?, order?, title?, description?, assigneeId?, linkedTaskId?}`). Dept-membership gated.
- `DELETE /api/admin/board/cards/[id]` — delete. Dept-membership gated.

## Risks / follow-ups (not blocking this build)

- Card drag-and-drop reordering across simultaneous editors (two people dragging at once) isn't conflict-resolved beyond last-write-wins on `order` — acceptable for a small department team, not designed for high-concurrency editing.
- No card comments/attachments/labels in v1, per Non-goals — straightforward to add later as additional `BoardCard` fields if J7 asks for them.
