# Part F — Dashboard: J5-J7 and other

Scope: `app/dashboard/j5/**`, `app/dashboard/j6/**`, `app/dashboard/j7/**`, `app/dashboard/personnel/**`, `app/dashboard/orbat/**`, `app/dashboard/quiz/**`, `app/dashboard/retired/**`, `app/dashboard/tasks/**`, `app/dashboard/unit/**`, `app/dashboard/meeting/**`, `app/dashboard/_components/**`, plus dashboard root `layout.tsx`/`page.tsx`.

---

## Dashboard Root

#### app/dashboard/layout.tsx
Server layout gating the entire staff/member portal. Redirects to `/login` if unauthenticated, to `/me` if not `hasPermission(user, 'pages.member')`. Computes a `permissions` object (`isStaff`, `canSeeJ1`–`canSeeJ7`, `canManageJ1`, `canSeeOrbat`, `canSeePersonnel`, `displayName`) from `PERMISSIONS.departments.*` / `PERMISSIONS.pages.*` and passes it to `StaffDashboardShell` (sidebar/shell component, outside this scope) wrapping `children`.

#### app/dashboard/page.tsx
Route: `/dashboard`. Same permission computation as layout (duplicated) and renders `DashboardOverview` — the portal landing page.

#### app/dashboard/DashboardOverview.tsx
The `/dashboard` landing page, built on `components/dashboard` (see part H). Leads with the next operation and its sign-on state (`NextOpPanel`, reusing `GET /api/nav/status` — the same feed the navbar polls, so the two can't disagree), then tasks, then operations; `ProgressionPanel` (`GET /api/me/promotion-progress`) and the favourites list sit in the right rail. Favourites was previously the first thing on the page and is now below the fold with a content-sized empty state. Sign-on shows a count rather than a fraction because nothing stores a total-slots figure.

Also here: drag-and-drop favourites reorder via `@dnd-kit` + `useFavourites`, a live `LocalClock`, and `ServiceStatusIcons` — small colored-dot indicators (Website/Database/Backups/Discord/TeamSpeak) polling `GET /api/dashboard/status` every 30s. Discord/TeamSpeak get a 4-state model (green online / red offline / blue dev-mode-connected / amber-with-warning-badge dev-mode-but-offline, since those two have an existing dev-mode toggle); Website/Database/Backups are plain green/red (no dev-mode concept for any of them). A failed/timed-out fetch to the status endpoint itself is treated client-side as all five services offline. Visible to every staff member who reaches `/dashboard`, not gated further.

---

## J5 — Media

#### app/dashboard/j5/page.tsx
Route: `/dashboard/j5`. Gate: `PERMISSIONS.departments.j5` (redirects `/dashboard` on failure). Computes `canManageMembers` via `hasPermission(me, 'departmentLeads.j5')` and `canManageLinks` as that OR `hasDepartmentPermission(me, 'j5', 'deptLinks.manage')`, and `isJ4`, renders `J5Panel`.

#### app/dashboard/j5/J5Panel.tsx
Client shell for the J5 dept page. Header with title "[J5] Media" + toggle buttons for Settings/Calendar/Activity Log views (via `useTabState`, URL-backed). Default "dept" view has 5 sub-tabs: Operations (`GalleryOperationsTab`), Featured Images (`GalleryFeaturedTab`), Screenshot of Month (`ScreenshotOfMonthTab`), Meetings (`MeetingsTab`), Tickets (`DeptTicketsTab`); opens with `DeptLinksRail` (department quick links, see H) as the first child before the Tabs strip. Reuses `DeptSettingsView` (which stacks the quick-links manager card above the unchanged `DeptMembersTab`) and `DeptCalendarTab` (outside this scope) for the Settings/Calendar toggle views. Same shape reused by J6Panel/J7Panel.

#### app/dashboard/j5/loading.tsx
`<TacticalLoader label='LOADING J5 // MEDIA' />`.

#### app/dashboard/j5/controls/ (`Field.tsx`, `Select.tsx`, `TagPicker.tsx`, `usePopup.ts`)
The J5 console's own input components, styled by `styles/j5-fields.module.css` (the companion to `styles/j5-controls.module.css`, which owns buttons/chips/segmented controls). `Field.tsx` exports `Field` (text/search/url/number, optional `prefix` affix and `clearable`) and `TextArea`; `Select.tsx` exports `Select` and the `SelectOption` type (`{ value, label, note?, muted? }` — `note` is the mono right-hand text used for tag counts and an operation's year, `muted` dims an option that exists but is not a real choice, e.g. the inspector's unlinked sentinel); `TagPicker.tsx` exports `TagPicker` (chips in the box, `labelFor` maps a stored tag slug to its display label); `usePopup.ts` is the shared open/close/outside-press/Escape/flip-upward behaviour behind `Select` and `TagPicker`. Client components, no data fetching of their own. They exist because MUI's outlined inputs notch their label through a rounded border — the notch is what forces the corner — and because MUI's portal-and-Paper menu tinted its popup over the gallery's photographs. Scoped to J5 deliberately; every other department stays MUI. Used by all the J5 tabs below and by `tabs/media/**`, `tabs/sotm/SotmTab.tsx`, `tabs/submissions/**`.

#### app/dashboard/j5/tabs/media/Viewer.tsx
Client component: the Media tab's fullscreen viewer. Opens from `MediaGrid` on double-click or Enter on a focused tile (Space still selects), shows the **full-size** `item.src` fitted to an opaque backdrop — the grid and table use `item.thumb`, not this — with the caption and operation label and nothing else. Escape closes; Left/Right step within the loaded page only (no fetch across a page boundary); focus is trapped while open and restored to the element it opened from. An uploaded video renders in `<video controls>`; a YouTube/Twitch item has no local bytes and falls back to its poster. Styles: `styles/media-console.module.css` (`.view*`), buttons from `styles/j5-controls.module.css`. Deliberately **not** the public gallery's `Lightbox.tsx` — see this file's own module comment for the three reasons.

#### app/dashboard/j5/tabs/media/LibraryRail.tsx
Client component: the Media tab's left rail — saved views on top (All / Not linked to an operation / No caption / Videos / Health), the archive tree below, every row carrying a live count from `GET /api/gallery/admin/facets`. The tree is **year → campaign → campaign mission → Saturday|Sunday**, with a year's campaign-less operations listed after its campaigns at the same indent (year → operation → mission, exactly as before) — `LibraryFacetsAPI` sends the two as separate buckets, so a legacy folder never gains a "no campaign" row to click through. One `opRows` renderer serves both places an operation row appears, because that is what keeps them agreeing about what a click sends. Selection travels as **two channels per level** (a string for a literal match, a `*Unset` boolean for "this field is absent") — never a sentinel string, because a real document can hold the literal value `Unknown`; see `lib/gallery/library-query.ts`. Styles: `styles/media-console.module.css` (`.row`, `.rowSub`/`.rowSubSub`/`.rowSubSubSub`).

#### app/dashboard/j5/tabs/GalleryOperationsTab.tsx
Client component: hierarchical gallery manager for operation screenshots — Year → Operation → Stage → images. Expand/collapse tree, add/delete year/operation/stage folders (with type-to-confirm delete), multi-select + bulk delete images, drag-and-drop reorder within a stage (persisted via reorder endpoint), hover image preview, file upload per stage. Calls `GET/POST/DELETE /api/gallery`, `/api/gallery/admin/folder`, `/api/gallery/admin/images`, `/api/gallery/admin/reorder`. Images served via `/api/gallery/fetch?year=&operation=&stage=&img=`. **Gallery uploads are the one image upload on the site stored exactly as sent** — every other route re-encodes through `lib/uploads/image.ts`, but the gallery's whole purpose is the picture itself, so it keeps the full-resolution original (`GALLERY_IS_EXEMPT`).

#### app/dashboard/j5/tabs/GalleryFeaturedTab.tsx
Client component: flat grid gallery for "featured" images (not tied to an operation). Multi-select, bulk delete (confirm dialog), paginated "Load More", multi-file upload, hover preview. Calls `GET /api/gallery`, `POST/DELETE /api/gallery/admin/featured`. Images served via `/api/gallery/featured?img=`.

#### app/dashboard/j5/tabs/ScreenshotOfMonthTab.tsx
Client component: view/set the current "Screenshot of the Month" (SOTM). Shows current SOTM (image, date taken, credit, linked operation) with a Clear button; `canManage` prop gates an upload form (file + date + credit + optional operation search-select) to replace it. Calls `GET/POST/DELETE /api/gallery/sotm`, image at `/api/gallery/sotm/image`, operation search via `GET /api/operations?search=`.

---

## J6 — Game Masters

#### app/dashboard/j6/page.tsx
Route: `/dashboard/j6`. Gate: `PERMISSIONS.departments.j6`. Renders `J6Panel` with `canManageMembers` via `hasPermission(me, 'departmentLeads.j6')` and `canManageLinks` as that OR `hasDepartmentPermission(me, 'j6', 'deptLinks.manage')`, `isJ4`.

#### app/dashboard/j6/J6Panel.tsx
Same shell pattern as J5Panel, header "[J6] Game Masters". Dept tabs: Zeus Notes (`ZeusNotesTab`), Meetings, Tickets (only 3 tabs, no gallery-style tab). Settings/Calendar/Activity Log header toggles and the `DeptLinksRail` quick-links rail follow the same shape as J5Panel above.

#### app/dashboard/j6/ZeusNotesTab.tsx
Client component: master-detail view for per-operation "Zeus notes" (Zeus/GM freeform notes attached to an operation). Left: searchable, paginated operation list (title, date, status, has-notes indicator dot). Right: view/edit notes textarea for the selected op with Save/Cancel. Calls `GET/POST /api/operations/zeus-notes` (list paginated via `?page=&search=`, save via `{ id, notes }`).

#### app/dashboard/j6/loading.tsx
`<TacticalLoader label='LOADING J6 // GAME MASTERS' />`.

---

## J7 — Development

#### app/dashboard/j7/page.tsx
Route: `/dashboard/j7`. Gate: `PERMISSIONS.departments.j7`. Renders `J7Panel` with `canManageMembers` via `hasPermission(me, 'departmentLeads.j7')` and `canManageLinks` as that OR `hasDepartmentPermission(me, 'j7', 'deptLinks.manage')`, `isJ4`.

#### app/dashboard/j7/J7Panel.tsx
Same shell pattern, header "[J7] Development". Dept tabs: **Board** (0, `BoardTab`, see below), Meetings (1), Tickets (2). `BoardTab` receives `department='j7'` and `canManageColumns={canManageMembers || isJ4}`. Settings/Calendar/Activity Log header toggles and the `DeptLinksRail` quick-links rail follow the same shape as J5Panel above.

#### app/dashboard/j7/tabs/BoardTab.tsx
Trello-style kanban board — the only department-specific feature tab J7 has. Customizable columns (create/rename/delete/drag-reorder, `canManageColumns`-gated — i.e. dept lead or J4 only) each holding freeform cards (title/description/optional assignee/optional linked `Db.tasks` item), draggable within and between columns. Any dept member (not just leads) can create/edit/move/delete cards. Drag-and-drop combines `@dnd-kit/sortable`'s `useSortable` (in-column card reorder, and column-itself reorder via a `` `col:{id}` `` id prefix to avoid colliding with the same column's card-drop-zone id) nested inside per-column `useDroppable` zones (cross-column card moves) — same combined pattern as the codebase's other multi-container drag UIs (`OrbatManager.tsx`, `AttendanceManageDialog.tsx`). Reorder drops use midpoint-order insertion (`(prevSibling.order + target.order) / 2`) rather than reusing the target's exact order value, avoiding order collisions. Opens `BoardCardModal` for card create/edit and `ConfirmDialog` for column delete. Calls `GET/POST /api/admin/board/columns`, `PATCH/DELETE /api/admin/board/columns/{id}`, `GET/POST /api/admin/board/cards`, `PATCH/DELETE /api/admin/board/cards/{id}`.

#### app/dashboard/j7/tabs/BoardCardModal.tsx
Card create/edit modal: title, description, assignee (reuses `_components/meetings/MemberPicker.tsx`), and an optional linked-task picker. The linked-task picker calls `GET /api/admin/tasks?view=mine` + `?view=created` (merged) — **not** `?view=all`, which is J4-only and would 403 for an ordinary department member. Every clearable field (`description`/`assigneeId`/`assigneeName`/`linkedTaskId`) is sent as an explicit `null` on save, never an omitted/`undefined` key — `JSON.stringify` drops `undefined`-valued keys entirely, which would silently no-op a clear against the PATCH API's `'field' in body` detection.

#### app/dashboard/j7/loading.tsx
`<TacticalLoader label='LOADING J7 // DEVELOPMENT' />`.

---

## Personnel

#### app/dashboard/personnel/all/page.tsx
Route: `/dashboard/personnel/all`. Gate: `PERMISSIONS.pages.members`. Computes `canEditRestricted` (`members.editRestricted`), `canEditStandard` (`members.editStandard`), `canImpersonate` (`admin.impersonate`), `isJ4`. Renders `AllMembersPanel`.

#### app/dashboard/personnel/all/AllMembersPanel.tsx
Master-detail member browser/editor. Left: paginated (25/page), debounced-search member list with avatar, rank, current ORBAT role; selecting a member warns on unsaved changes (`dirty` state) before switching. Right: `MemberDetailPanel` for the selected member (keyed by username to reset state). Calls `GET /api/admin/members?page=&limit=&search=`.

#### app/dashboard/personnel/all/MemberDetailPanel.tsx
Full milpac editor + J4 administration panel for one member — **shared** between the dashboard Members page (`AllMembersPanel`) and the ORBAT member popout (`OrbatManager.tsx`, imports this component directly rather than duplicating it) so both entry points show identical content, including the Danger Zone. Fetches its own data by `username` prop (`GET /api/members/{username}` + `/confirmed-ops`), so callers only need to pass the username and permission flags. Embeds `MilpacEditor` (from `app/members/[username]/MilpacEditor`, outside scope) for standard milpac editing (`canEditRestricted`/`canEditStandard`/`canImpersonate` props, `nameReadOnly` when viewer is J4). Below it, an `isJ4`-only admin panel: display-name override (with live preview of resulting Discord nickname `"{rank} {name}"`), chaplain toggle, department membership toggles (add/remove `j1`–`j7`, shows ★ when the member holds that department's `linkedSlot: 'leader'` `DepartmentRole` — leadership is now managed via the Department Leadership card on each department's Members page, not directly here; resolved by fetching `GET /api/admin/department-roles?department=X` per department code from `@/lib/discord/dept-codes`'s `DEPT_CODES`, since this panel's viewer isn't guaranteed to be J4), Discord role management (search/add/remove any guild role), and a "Danger Zone" `Panel tone='alert'` — the only card in the drawer that keeps a colour — holding discharge (files a J4 ticket) and type-to-confirm account deletion (`onMemberDeleted` callback lets the caller close its popout/refresh its list). The drawer is on the dashboard kit: departments and Discord roles are `Chip`s, chaplain is a `Switch`, and deletion goes through the kit's `ConfirmDialog`, which owns the typed username itself rather than this component keeping a second copy of it in state. Calls `GET /api/members/{username}`, `GET /api/members/{username}/confirmed-ops`, `GET /api/admin/members/{userId}/discord-roles`, `GET /api/admin/department-roles?department=X` (×7, for the ★ badge), `PATCH /api/admin/members/{id}` (body varies: `{name}`, `{chaplain}`, `{department, action}`), `PATCH /api/admin/members/{id}/discord-roles` (`{roleId, action}`), `DELETE /api/admin/members/{id}`.

#### app/dashboard/personnel/all/loading.tsx
`<TacticalLoader label='LOADING ALL MEMBERS' />`.

#### app/dashboard/personnel/all-staff/page.tsx
Route: `/dashboard/personnel/all-staff`. Gate: `PERMISSIONS.pages.admin`. Renders `AllStaffPanel`.

#### app/dashboard/personnel/all-staff/AllStaffPanel.tsx
Simple tab shell ("Move Requests" / "Discipline" / "Performance Reports") over the three staff-ticket tabs below. No fetches itself.

#### app/dashboard/personnel/all-staff/tabs/MoveRequestsTab.tsx
Submit/approve ORBAT move-request tickets. Form: autocomplete pick an occupied ORBAT position (member), pick destination (Active Reservist or a section with a vacant position, then a specific vacant role), optional notes; submits — auto-applies immediately if the requester has authority, else routes to the required approver. Also shows "Pending My Approval" table (Approve/Reject buttons) and "My Submitted Requests" table with status chips. Calls `GET /api/admin/orbat/for-move` (flat position list), `GET /api/admin/tickets?issuedById=`/`?requiredApproverUserId=&status=open` (filtered client-side to `type === 'move-request'`), `POST /api/admin/tickets` (`{type:'move-request', targetUserId, fromPositionId, toPositionId|toIsReservist, notes}`), `PATCH /api/admin/tickets/{id}` (`{decision: 'approve'|'reject'}`). Uses `PLATOON_CATEGORIES`/`RESERVIST_CATEGORY_IDS` from `lib/orbat/constants`.

#### app/dashboard/personnel/all-staff/tabs/DisciplineTab.tsx
Submit a discipline ticket against a member (member autocomplete + reason + notes) and view "My Submitted Tickets" table (status chip, points deducted). Calls `GET /api/admin/members`, `GET /api/admin/tickets?issuedById=` (filtered to `type==='discipline'`), `POST /api/admin/tickets` (`{type:'discipline', targetUserId, disciplineReason, notes}`).

#### app/dashboard/personnel/all-staff/tabs/PerformanceReportTab.tsx
Same shape as DisciplineTab but for performance reports (`type==='performance-report'`, field `performanceReason`). Calls `GET /api/admin/members`, `GET /api/admin/tickets?issuedById=`, `POST /api/admin/tickets`.

#### app/dashboard/personnel/all-staff/loading.tsx
`<TacticalLoader label='LOADING PERSONNEL' />`.

#### app/dashboard/personnel/hq-staff/page.tsx
Route: `/dashboard/personnel/hq-staff`. Gate: `PERMISSIONS.pages.members`. Static "Work in Progress" placeholder page — no client component, no data fetching.

#### app/dashboard/personnel/hq-staff/loading.tsx
`<TacticalLoader label='LOADING HQ STAFF' />`.

---

## ORBAT

#### app/dashboard/orbat/page.tsx
Route: `/dashboard/orbat`. Gate: `PERMISSIONS.admin.manageOrbat`. Also computes `canManageStructure` (`admin.manageOrbatStructure`), `canManageMembers` (`admin.manageOrbatMembers`), `canMilpacEditRestricted`/`canMilpacEditStandard` (`members.editRestricted`/`editStandard`), `isJ4` (`departments.j4`), `canImpersonate` (`admin.impersonate`) — the latter two feed the shared `MemberDetailPanel` popout (see below) so it renders identically to the dashboard Members page. Server-fetches **all** users directly via `Db.users.find({})` (not paginated) to build a picker list `{id, username, displayName, avatarURL}`, passed as `initialUsers` to `OrbatManager`.

#### app/dashboard/orbat/OrbatManager.tsx (~1670 lines — large)
The full ORBAT structure + member-assignment editor. Renders category tabs per `PLATOON_CATEGORIES`/`RESERVIST_CATEGORIES`/`SINGLE_SECTION_CATEGORIES` (`lib/orbat/constants`), each broken into sections (`buildSections()` groups positions by `sectionTitle`). Features: drag-and-drop position reordering within a section (`@dnd-kit/core` + `@dnd-kit/sortable`), inline section role selection via `RoleSelect` (searchable dropdown into the `OrbatRole` catalog, filtered to the position's category — **not** free text), add/delete sections and positions (position creation also goes through `RoleSelect`), member picker per position (search all users) with conflict resolution modal (swap/bump when assigning an already-placed member), reservist add (active/inactive — reservist slots stay outside the Roles catalog, fixed "Active/Inactive Reservist" label), section metadata (icon/patch image upload, Discord role linkage) via `/meta` endpoints, a Discord-role picker per section (`rolePickerTarget`), and a fixed-position "Manage Roles" button (`canManageStructure`-gated, bottom-right of the viewport, stays in place while scrolling) opening `RolesManagerPanel`. Clicking a filled position opens a popout `Dialog` embedding `MemberDetailPanel` (`app/dashboard/personnel/all/MemberDetailPanel.tsx` — the **same** component the dashboard Members page uses, not a separate view) keyed by `username` only — the panel fetches its own member data, so ORBAT no longer duplicates that fetch; deleting a member from its Danger Zone (`onMemberDeleted`) closes the popout and calls `load()` to refresh positions. Calls: `GET /api/admin/orbat`, `GET /api/admin/orbat/meta`, `GET /api/admin/orbat/discord-roles`, `POST/PATCH /api/admin/orbat/meta` + `POST /api/admin/orbat/meta/patch` (image upload), `PATCH/DELETE /api/admin/orbat/{positionId}` (role changes send `{roleId}`, not `{role}`), `POST /api/admin/orbat/positions` (body includes `roleId`), `POST/PATCH/DELETE /api/admin/orbat/sections`, `POST/PATCH/DELETE /api/admin/orbat/reservists`.

#### app/dashboard/orbat/RolesManagerPanel.tsx
J4-only (`manageOrbatRoles`) wide `Dialog` shell: header chrome (title, "Chain of Command" button — shown only on the ORBAT tab — Export/Import buttons, and close button) plus an "ORBAT Roles" / "Department Roles" / "Permissions Explorer" / "Member Sync" tab switcher. Owns the Dialog's close button/Escape/backdrop handling and tab-switch actions; the currently-mounted tab (`OrbatRolesTab` or `DepartmentRolesTab`) reports its unsaved-edit state up via an `onDirtyChange` callback into `activeDirty` state, and both `handleClose()` and `switchTab()` run a `window.confirm()`-guarded `confirmDiscardIfDirty()` check against it before closing the dialog or swapping tabs (switching tabs unmounts the outgoing tab — no cross-tab state preservation). Renders `ChainOfCommandPanel` (opened via the header button, ORBAT-tab only). Export button navigates a hidden `<a download>` at `GET /api/admin/orbat/roles-export` to trigger a browser download. Import button is `confirmDiscardIfDirty()`-guarded, opens a hidden file `<input>`, and on file selection shows a second destructive-action `window.confirm()` before POSTing the raw file text to `POST /api/admin/orbat/roles-import`; on success it bumps a `reloadKey` counter used as the `key` prop on `OrbatRolesTab`, `DepartmentRolesTab`, and `ChainOfCommandPanel` to force all three to remount and refetch post-replace (none of them expose an imperative reload method).

#### app/dashboard/orbat/OrbatRolesTab.tsx
Rendered as `RolesManagerPanel`'s "ORBAT Roles" tab. CRUD on the `OrbatRole` catalog: list/create/edit/delete, each Role's name, optional `tag`, category scope (`PLATOON_CATEGORIES` multi-select, empty = all), granted Discord roles (multi-select fetched from `/api/admin/orbat/discord-roles`), granted TeamSpeak server groups (multi-select fetched from `/api/teamspeak/groups`), and granted permission keys (multi-select fetched from `/api/admin/orbat/permission-keys`). Categories/Discord-roles/TeamSpeak-roles/Permissions lay out as a single-line flex row of independently-scrolling columns (Categories narrower and fixed-width, the other three growing to share remaining space; the row scrolls horizontally as a fallback if a narrow window can't fit all four) instead of a fixed-width vertical stack. Each section has copy/paste icon buttons pulling from/pushing to an in-memory clipboard (cleared when the component unmounts, i.e. dialog close or tab switch); "Copy Settings"/"Paste Settings" buttons operate on all four clipboard slots at once, letting an admin template one role's categories/Discord-roles/TeamSpeak-roles/permissions onto another without touching Name/Tag. The editor tracks unsaved changes (`dirty`) and blocks switching roles or starting a new role via `window.confirm()` until the pending edit is saved or explicitly discarded, and reports `dirty` up to the shell via `onDirtyChange` so the shell's own close/tab-switch guards can also block on it; Save is pinned in a non-scrolling footer alongside Discard. Delete lives only in the editor footer (not the list row) behind a two-stage confirm ("Delete Role" → "Confirm Delete"/"Cancel"), and shows the API's `inUseCount` error inline rather than silently failing. Calls: `GET/POST /api/admin/orbat/roles`, `PATCH/DELETE /api/admin/orbat/roles/{roleId}`, `GET /api/admin/orbat/discord-roles`, `GET /api/teamspeak/groups`, `GET /api/admin/orbat/permission-keys`.

#### app/dashboard/orbat/DepartmentRolesTab.tsx
Rendered as `RolesManagerPanel`'s "Department Roles" tab. CRUD on the `DepartmentRole` catalog (parallel to `OrbatRole` but scoped by department `j1`–`j7` instead of ORBAT category). The left list is grouped by department (codes from the dependency-free `DEPT_CODES` in `lib/discord/dept-codes.ts` — deliberately NOT `DEPT_ROLES` from `lib/discord/dept-roles.ts`, which pulls in `Db`/mongodb via server-only exports and would break client bundling if imported here) instead of flat: each department header has a "+" to create a new sub-role scoped to that department (`editingId` becomes `'__new__:jN'`), and its seeded "base" role (`isBase: true` — one per department, can't be created or deleted, but is renameable like any other role) sorts first within the group with a "BASE" badge. The editor drops Categories and Tag from `OrbatRolesTab`'s 4-column layout, leaving 3 columns (Discord roles / TeamSpeak roles / Permissions) since Department Roles aren't category-scoped and don't need a disambiguating tag. Editing a base role shows an explanatory note ("applies to every department member, can't be deleted") next to its (editable) Name field. Otherwise identical UX to `OrbatRolesTab`: copy/paste per-section and "Copy Settings"/"Paste Settings" across all three, `dirty`-tracking with `window.confirm()`-guarded role-switch/tab-close (reported up via `onDirtyChange`, consumed by `RolesManagerPanel`'s shell guard the same way), Save/Discard pinned in a non-scrolling footer, and a two-stage-confirm Delete button in the footer — hidden both while creating a new role and while editing a base role (`!newRoleDept && !isEditingBase`). Editing an existing non-base role also shows a "Linked Position" dropdown (None / whichever of the department's Leader/2IC/3IC labels are non-empty, per `DEPT_LEADERSHIP_POSITIONS`) — setting it makes this role the one whose holder shows as that leadership position on the department's Members page (`DeptMembersTab.tsx`); a small badge in the left list shows a role's linked position, next to the BASE badge. Calls: `GET/POST /api/admin/department-roles`, `PATCH/DELETE /api/admin/department-roles/{roleId}`, `GET /api/admin/orbat/discord-roles`, `GET /api/teamspeak/groups`, `GET /api/admin/orbat/permission-keys`.

#### app/dashboard/orbat/MemberSyncTab.tsx
Rendered as `RolesManagerPanel`'s "Member Sync" tab. Fetches a live drift report on mount (`GET .../member-sync`), renders On Roster / Off Roster member lists sorted red→orange→green with expandable rows showing the specific missing/extra Discord roles and TeamSpeak groups and which department/ORBAT role each expectation traces to, a TeamSpeak-unavailable warning banner when the backend couldn't reach TS, and per-member "Sync" plus header "Sync All" actions that open a confirmation dialog previewing the exact grant/revoke diff before calling `POST .../member-sync/apply` (which the tab then re-fetches the report after, rather than trusting the previous diff). Calls: `GET /api/admin/orbat/member-sync`, `POST /api/admin/orbat/member-sync/apply`.

#### app/dashboard/orbat/ChainOfCommandPanel.tsx
Dialog visualizing the ORBAT chain of command as a directed graph — `@xyflow/react` canvas with `dagre` auto-layout, nodes for every `OrbatRole` and `OrbatRoleGroup`. Dragging a connection between two nodes sets the dragged-from node's `parentRoleId`/`parentGroupId` to the dragged-to node. Clicking a Role node opens a read-only sidebar (permissions, granted Discord roles, "Detach from Parent"); clicking a Group node or the "New Group" button opens an editable sidebar (name, searchable Role member checklist, Save/Delete, "Detach from Parent"). A search box dims and re-centers non-matching nodes. A header back-arrow (not an X — this dialog returns to `RolesManagerPanel`, it doesn't close the admin flow) dismisses it. A `window.confirm()`-guarded "Reset Chain of Command" button, tucked in the canvas's bottom-right `Panel` away from the header controls to avoid misclicks, detaches every node from its parent in one shot. Calls: `GET /api/admin/orbat/roles`, `GET/POST /api/admin/orbat/groups`, `PATCH /api/admin/orbat/roles/{roleId}`, `PATCH/DELETE /api/admin/orbat/groups/{groupId}`, `POST /api/admin/orbat/chain-of-command/reset`.

#### app/dashboard/orbat/RoleSelect.tsx
Searchable single-select dropdown for choosing an `OrbatRole` (same open/filter/click-outside pattern as `_components/RolePicker.tsx`, but role-catalog-backed and category-filtered instead of name-based). Fetches `GET /api/admin/orbat/roles` once, filters to Roles whose `categories` includes the given `category` prop (or is unscoped). Displays `Name (Tag)` in the closed field and dropdown rows when a Role has a `tag` set, so same-named Roles distinguished only by tag are still pickable — but `onChange(roleId, roleName)` always passes the plain untagged `name`, so the denormalized `OrbatPosition.role` string never carries a tag. Used by `OrbatManager.tsx` for both the inline "Change Role" edit and the "Add Role" new-position flow.

#### app/dashboard/orbat/loading.tsx
`<TacticalLoader label='LOADING ORBAT' />`.

---

## Quiz (Review)

#### app/dashboard/quiz/review/[attemptId]/page.tsx
Route: `/dashboard/quiz/review/[attemptId]`. Gate: `await hasPermission(me, 'quiz.review')` (redirects `/dashboard/j3` on failure or invalid/missing attempt/quiz). Server-loads the `QuizAttempt` doc from `Db.quizAttempts` directly and the static quiz definition via `getQuizById()` (`lib/quiz-data`), serializes dates to ISO strings, computes `canEscalate` (`await hasPermission(me, 'quiz.reviewEscalated')`) and `isJ4`, renders `QuizReviewClient`.

#### app/dashboard/quiz/review/[attemptId]/quiz-review-client.tsx
Full quiz-attempt review/marking UI for J3 trainers. Left sidebar (`QuizSectionSidebar`, outside scope) for section nav with per-question tick state. Centre renders each question via `QuizQuestionCard` (outside scope) in read-only mode with reviewer marking controls per written/image question (or per-box for multi-box questions) — auto-grades multiple-choice, manual correct/incorrect for written. Right panel shows time taken, live score vs pass mark (with progress bar), status, and a decision panel (Pass / Fail / Send for Review with required notes on escalation). Calls `POST /api/admin/quiz/review/{attemptId}` (`{action, notes, questionDecisions, score, totalPoints}`), then redirects to `/dashboard/j3`.

---

## Retired Members

#### app/dashboard/retired/page.tsx
Route: `/dashboard/retired`. **No server component / no explicit permission gate in this file** — file starts directly with `'use client'`, so access control relies solely on the parent `app/dashboard/layout.tsx` gate (`hasPermission(user, 'pages.member')`), not a J4-specific check, despite the UI being J4-Administration tooling. CSV importer for the "HQ Leaving History" spreadsheet (discharge records) plus a raw JSON "patch" tool for fixing individual records. Upload/paste CSV → preview row count → Run Import (shows inserted/updated/skipped counts + skipped-row reasons table). Patch panel accepts a JSON array of `{find,set}` or `{upsert}` operations. Calls `POST /api/admin/retired/import` (CSV body, `text/plain`), `PATCH /api/admin/retired/import` (JSON patch array).

---

## Tasks

#### app/dashboard/tasks/page.tsx
Route: `/dashboard/tasks`. Gate: `PERMISSIONS.pages.admin` (redirects `/me`). Computes `isElevated` (`departments.j4`) and resolves the caller's Discord role names to determine `isAllBatStaff` (`HQ Staff`/`All Staff` roles) and `userDepts` (via a hardcoded `DEPT_ROLE_MAP` of dept → Discord role names). Computes `availableRoles` — the set of roles this user may assign tasks to (all roles if elevated/all-staff, else only their own department's roles) — and passes everything to `TasksPage`.

#### app/dashboard/tasks/TasksPage.tsx (978 lines — large)
Header is the kit's `PageHead`; New Task is the screen's one primary button and show-completed
stays subtle even when on, because it is a filter rather than an action. `typeBadge`/`statusColor`
and the shared `rawInput`/`fldLabel` constants are the whole screen's styling choke point — they
point at the unit tokens now, and `ActionBtn` mixes its hover with `color-mix` rather than
rewriting the alpha out of an rgba string, since the colours it is handed no longer have one. The
overdue lockout banner keeps its full red: it is the one thing here that has actually shut the
member out of the portal.
Full task management UI with 3 tabs: My Tasks, Created by Me, All Tasks (elevated/all-staff only). Each `TaskCard` supports: expand for details, mark complete (with notes), request/approve/deny/propose-alternative extension (`ExtDecisionForm`), request/approve/deny/redirect reassignment (with member search via `/api/admin/members`), direct or request-based deletion (with reason, approve/deny for requested deletes). `CreateTaskDialog` lets staff create a task assigned to a specific member (search) or a role/department, with due date + reminder. Calls `GET /api/admin/tasks?view=mine|created|all&includeCompleted=`, `POST /api/admin/tasks`, `PATCH/DELETE /api/admin/tasks/{id}` (many action-specific bodies for complete/extend/reassign/delete flows — see file for exact shapes), `GET /api/admin/members?search=&limit=`.

---

## Unit

#### app/dashboard/unit/allstaff-calendar/page.tsx
Route: `/dashboard/unit/allstaff-calendar`. Gate: `hasPermission(user, 'pages.member')` (redirect `/me`). Computes `isTrainer` (`training.create`), `isJ3Lead` (`training.manage`). Renders `AllStaffCalendarPanel`.

#### app/dashboard/unit/allstaff-calendar/AllStaffCalendarPanel.tsx
Wraps `DeptCalendarTab` (department `'unit'`) with a J3-trainer-only "Create Event" flow — either a blank event or pre-filled from a J3 training-type template (`GET /api/training/types`, active only) which auto-computes the end time from the type's `durationMinutes`. Modal has title/start/description/private toggle. Calls `POST /api/admin/calendar`.

#### app/dashboard/unit/calendar/page.tsx
Route: `/dashboard/unit/calendar`. Gate: `hasPermission(user, 'pages.member')`. Computes `isJ4`, `canWrite` (`pages.admin`). Renders `CalendarPanel`.

#### app/dashboard/unit/calendar/CalendarPanel.tsx
Unit-wide calendar (`react-big-calendar`, month/week/day/agenda views) showing **all** departments' events with a department-colour legend (click to filter to one/several depts) plus an "Ops Only" toggle. Clicking an event opens `EventModal` (view/edit); `canWrite` staff get an "Add Event" button. Calls `GET /api/admin/calendar`.

#### app/dashboard/unit/calendar/DeptCalendarTab.tsx
Reusable department-scoped calendar (used by every JX panel's "Calendar" view and by `AllStaffCalendarPanel`). Same `react-big-calendar` base as `CalendarPanel` but filtered to one `department`. Adds toggleable overlay layers for BCT availability, quiz availability, and (J2 only) unavailability blocks + mission-check-request events, each rendered with distinct dashed-border event styling. For `department==='j2'`: extra "Block Unavailability" (leads only, `isJ2Lead`) and "Request Mission Check" buttons opening `J2EventModal`. Calls `GET /api/admin/calendar?department={dept}`.

#### app/dashboard/unit/calendar/EventModal.tsx (761 lines — large)
Shared calendar event create/view/edit/delete dialog, exports `CalendarEventRow` type and `DEPT_COLORS` map (also imported by `CalendarPanel`/`DeptCalendarTab`/`AllStaffCalendarPanel`). View mode shows full event detail (title, time, department, description, linked operation/task) with edit/delete for authorised users (`isJ4` or creator via `canWrite`-style checks) and a reminder sub-panel (add/remove reminder offsets from `LEAD_UP_PRESETS`). Create/edit mode: title, department select, start/end (or all-day date), description, private toggle. Calls `GET/POST/PATCH/DELETE /api/admin/calendar` and `/api/admin/calendar/{id}`, `GET/POST/DELETE /api/admin/calendar/reminders?eventId=`.

#### app/dashboard/unit/calendar/J2EventModal.tsx
J2-specific modal used for two special event types: `mode='unavailability'` (J2 lead blocks a period unit-wide as unavailable for mission-making) and `mode='mission_check'` (any J2 member requests a mission check against an in-development/upcoming operation, searched via `GET /api/operations?status=In Development,Upcoming&limit=100`). Submits via `POST /api/admin/calendar` with mode-specific flags (`isJ2Unavailability` / `isMissionCheckRequest`, `relatedOperationId`).

#### app/dashboard/unit/calendar/loading.tsx
`<TacticalLoader label='LOADING UNIT CALENDAR' />`.

#### app/dashboard/unit/sops/page.tsx
Route: `/dashboard/unit/sops`. Gate: `hasPermission(user, 'pages.member')`. Computes `isJ4` from `PERMISSIONS.sops.manage`. Renders `SopsPanel`.

#### app/dashboard/unit/sops/SopsPanel.tsx
SOP (Standard Operating Procedure) library: list view grouped by category (`General`/`Operations`/`Training`/`Administration`/`Communications`) with search, and a document view. J4 (`isJ4`) can create new SOPs (title/category/description), edit an existing SOP's metadata inline, or delete (with confirm). Document body is a `CollabEditor` (Y.js/TipTap collaborative editor) with `documentId={'sop-' + sop._id}`, read-only for non-J4. Calls `GET/POST /api/sops`, `PATCH/DELETE /api/sops/{id}`.

#### app/dashboard/unit/sops/loading.tsx
`<TacticalLoader label='LOADING UNIT SOPs' />`.

#### app/dashboard/unit/tickets/page.tsx
Route: `/dashboard/unit/tickets`. Gate: `PERMISSIONS.pages.admin` (redirect `/me`). Computes a large set of per-department `canActionJ1`–`canActionJ7`, `canActionMoveRequest`, `canActionDiscipline` (from `PERMISSIONS.tickets.*`) plus `canSeeJ1`–`canSeeJ7` (action perm OR plain dept membership) and passes all to `TicketsPanel`. This is the **staff admin ticket queue** (distinct from the `feedback`/`CommunityTicket` system used by `DeptTicketsTab`) — operates on `Db.tickets` (`Ticket` type: move-request, discipline, performance-report, department-membership, etc.).

#### app/dashboard/unit/tickets/TicketsPanel.tsx (792 lines — large)
Cross-department admin ticket queue/action console. Filterable/searchable/paginated table of all `Ticket` docs the viewer is permitted to see, with a detail/view modal and an `ActionModal` for resolving tickets (approve/reject with type-specific fields — e.g. points deducted for discipline, transfer target). `department-membership` tickets are treated as global audit records visible to all admins. Calls `GET /api/admin/tickets`, `PATCH /api/admin/tickets/{id}` (resolution body varies by ticket type).

#### app/dashboard/unit/tickets/loading.tsx
`<TacticalLoader label='LOADING TICKETS' />`.

#### app/dashboard/unit/training-docs/page.tsx
Route: `/dashboard/unit/training-docs`. Gate: `hasPermission(user, 'pages.member')`. Computes `isJ3Lead` (`training.manage`), `isTrainer` (`training.create`), `isJ3Trainer` (`training.trainer`). Renders `TrainingHub` — the top-level J3 training hub with 3 tabs (Courses/Types, Events, Requests).

#### app/dashboard/unit/training-docs/TrainingHub.tsx (1002 lines — large)
Tab `'courses'`: manages `TrainingType` definitions (course catalogue) — create/edit (name, category, billet field/points, description, status, duration, server, required mods, prerequisites, min trainers/trainees, trainer/info doc URLs, cover image, linked media), drag-reorder via `@dnd-kit`, seed defaults, and per-type expandable **training docs** list with add/approve/reject/delete (a document-request/approval workflow distinct from the standalone `TrainingDocsPanel` explorer below — these are docs attached directly to a training type). Tab `'events'` renders `EventsTab`; tab `'requests'` renders `RequestsTab`. Calls `GET/POST /api/training/types`, `PATCH/DELETE /api/training/types/{id}`, `POST /api/training/types/seed`, `GET/POST /api/training/types/{id}/docs`, `DELETE /api/training/types/{typeId}/docs/{docId}`, `POST /api/training/types/{typeId}/docs/{docId}/approve|reject`.

#### app/dashboard/unit/training-docs/EventsTab.tsx (959 lines — large)
Training-session event calendar/list: create/edit/cancel/complete training events tied to a `TrainingType`, RSVP (trainer/trainee slots) with slot-count pills, attendance view/mark, award-qualifications action on completion, and an approve/reject flow for trainer-submitted events (`isJ3Lead`). Calls `GET /api/training/events`, `GET /api/training/types`, `POST /api/training/events`, `PATCH /api/training/events/{id}`, `POST /api/training/events/{id}/approve|reject|cancel|complete|award-qualifications`, `GET/POST/DELETE /api/training/events/{id}/attendance`.

#### app/dashboard/unit/training-docs/RequestsTab.tsx
"Training requests" — members request a training session for a type they want scheduled; others can register interest; J3 leads approve/reject or promote a request to a scheduled event. Calls `GET /api/training/requests`, `GET /api/training/types`, `POST /api/training/requests`, `POST /api/training/requests/{id}/interest`, `PATCH /api/training/requests/{id}`, `POST /api/training/requests/{id}/approve|reject`.

#### app/dashboard/unit/training-docs/TrainingDocsPanel.tsx (1127 lines — large)
Standalone file-explorer-style document library ("Training Docs") — folders and documents with custom icon/colour (`ICON_OPTIONS`/`COLOR_PRESETS`), drag-and-drop move between folders (`@dnd-kit`), breadcrumb navigation, search, create/rename/delete folders and docs, and a rich-text document view/editor using `SimpleEditor` (non-collaborative editor, distinct from `CollabEditor` used by SOPs). Supports linking a doc via URL open (`initialDocId` deep-link from `[id]/page.tsx`) with heading-based table of contents (`extractHeadings`/`DocToc`). `isJ3` gates create/edit/delete. Calls `GET/POST/PATCH/DELETE /api/training-docs` and `/api/training-docs/{id}` (multipart `POST` for doc content/attachments).

#### app/dashboard/unit/training-docs/[id]/page.tsx
Route: `/dashboard/unit/training-docs/[id]`. Gate: `hasPermission(user, 'pages.member')`. Computes `isJ3` (`trainingDocs.manage`). Renders `TrainingDocsPanel` (imported from parent dir) with `initialDocId` set — deep-links straight to a specific document.

#### app/dashboard/unit/training-docs/loading.tsx
`<TacticalLoader label='LOADING TRAINING DOCS' />`.

---

## Meeting (standalone view)

#### app/dashboard/meeting/[id]/page.tsx
Route: `/dashboard/meeting/[id]`. **Client component**, no server-side permission gate in this file — fetches the meeting client-side and relies on the API route's own 403/404 handling (shows an in-page error if `meetingRes.status === 403/404`). Renders a read-only-ish standalone meeting view (title, date, department, notes, `MeetingAttendance` panel for RSVP) — used for linking a specific meeting outside the dept panel's tabbed `MeetingsTab` context (e.g. from notifications/action logs). Calls `GET /api/admin/meetings/{id}`, `GET /api/me`.

---

## `_components` (shared dashboard building blocks)

#### app/dashboard/_components/ActivityLogTab.tsx
Reusable activity/audit log viewer embedded as the "Activity Logs" view in every department panel (J1–J7) and (for J4/`isJ4`) globally across all departments. Filter bar: department (J4 only, when `department` prop unset), category (`meeting|ticket|task|calendar|member|orbat|operation|discord|training|award|system|board`), entity type (incl. `card`/`column` for board), free-text search (performer name), date range. Paginated table (50/rows) with category-coloured action badges; clicking a row with an `actionUrl` navigates there, otherwise opens a raw before/after + details JSON modal. Calls `GET /api/admin/activity?page=&limit=&department=&category=&entityType=&search=&startDate=&endDate=`. New feature areas that want to show up here just need to write via `logAction()` with a registered `category` — no new log UI needed (this is how the J7 board's activity trail works, see `BoardTab.tsx`/`board/columns`/`board/cards` API entries).

#### app/dashboard/_components/CornerBrackets.tsx
Presentational-only: renders 4 absolutely-positioned corner-bracket decorations (tactical HUD styling) inside a `position: relative` parent. Props: `color`, `size`. Used in every dept panel header (J5Panel, J6Panel, J7Panel, etc.) and `AllStaffCalendarPanel`.

#### app/dashboard/_components/NotificationBell.tsx
Global notification bell dropdown + toast system (lives in the dashboard shell header, likely `StaffSidebar`/`StaffDashboardShell` outside this scope but the component itself is here). Wraps `useNotifications()` hook (`hooks/useNotifications.ts`, outside scope) for SSE-driven live notifications; plays a Web-Audio chime + shows an auto-dismissing toast on new arrivals, dropdown panel with mark-read/mark-all-read/dismiss/dismiss-all, type-specific colour/label map, links to `actionUrl` on click, footer link to `/dashboard/tasks`. No direct fetch calls (delegates to the hook).

#### app/dashboard/_components/PinTabLabel.tsx
Small wrapper rendering a tab label plus a pin/star toggle (favourites) using `useFavourites()` hook (outside scope). Used inside every dept panel's `<Tab label={...}>` to let users pin a specific tab to their favourites sidebar. Props: `label`, `pinLabel` (stored favourite text), `href`, `tabIndex`.

#### app/dashboard/_components/RolePicker.tsx
Generic searchable Discord-role autocomplete input (single value, with clear button). Lazy-loads the guild role list once on first open. Calls `GET /api/admin/guild-roles`.

#### app/dashboard/_components/TacticalSkeleton.tsx
Presentational shimmer-loading placeholder (animated CSS gradient rows) used throughout dashboard panels while data loads (e.g. gallery tabs, move-requests tab, calendars). Props: `rows`, `className`. No fetches.

#### app/dashboard/_components/useTabState.ts
Hook: URL-search-param-backed `{tab, setTab, view, setView}` state for department panels, so the sidebar's deep-links (`?tab=&view=`) drive the active tab reactively and links stay shareable/bookmarkable. `View` union: `'dept'|'settings'|'calendar'|'meetings'|'logs'|'activity'|'tickets'`; `'settings'` replaced `'members'` in the department-quick-links build; `rawView === 'members'` is aliased to `'settings'` so pre-existing `?view=members` bookmarks/pinned links keep resolving. Used by J5Panel/J6Panel/J7Panel (and J1–J4 panels, see E).

### `_components/dept-links/` (department quick links, J1-J7 favicon tile rail, managed from each department's Management view)

#### app/dashboard/_components/dept-links/DeptLinksRail.tsx
Favicon tile rail rendered as the first child of every JX panel's `view === 'dept'` fragment, before the Tabs strip. Props `{ department, canManage, onManage? }`; `onManage` is a callback (`() => setView('settings')`), never a route, so it sidesteps `typedRoutes`. Loads `GET /api/admin/dept-links?department=` on mount; renders `null` while loading or when there are no visible links and the caller can't manage; the "+ ADD" ghost tile is gated on the server's own `canManage` from that response, not just the prop. Tiles open the link's URL in a new tab (`target='_blank' rel='noopener noreferrer'`), favicon via `<img src="/api/admin/dept-links/{id}/favicon?v={faviconVersion}">` falling back to an MUI `Link` icon on load error, links with a non-empty `visibleToRoleIds` get a `Lock` badge/tooltip.

#### app/dashboard/_components/dept-links/DeptLinksManagerCard.tsx
Manager UI for a department's quick links, rendered inside `DeptSettingsView` above `DeptMembersTab`. Props `{ department, canManage }`; returns `null` when `!canManage` (non-managers never see this card; they get their links via the rail instead). Loads/reloads via `GET /api/admin/dept-links?department=`; row-per-link with favicon, resolved display name (`nameOverride ?? fetchedTitle`, plus the original fetched title greyed out underneath when overridden), a lock chip when `visibleToRoleIds.length > 0`, and `Refresh`/`Edit`/`Delete` actions. Reorder via `@dnd-kit` (`PointerSensor`, activation distance 6, same fractional-midpoint formula as `BoardTab.tsx`); `PATCH /api/admin/dept-links/{id}` with `{order}` on drop. Delete goes through `ConfirmDialog`. Inline MUI `<Alert>` for load errors, no toasts. Calls `GET /api/admin/dept-links`, `DELETE /api/admin/dept-links/{id}`, `POST /api/admin/dept-links/{id}/favicon` (manual refresh), and opens `DeptLinkModal` for create/edit.

#### app/dashboard/_components/dept-links/DeptLinkModal.tsx
Create/edit modal for a single quick link, modelled on `j7/tabs/BoardCardModal.tsx`. Props `{ open, onClose, department, link, onSaved }` (`link: null` = create mode). Fields: URL, display-name override (helper text `Leave blank to use the site's own title — currently: {fetchedTitle}`, shows a stale-override hint when the URL has changed but the override hasn't been cleared), a "Visible to" multi-select `Autocomplete` of that department's sub-roles (fetched from `GET /api/admin/department-roles?department=`, base role excluded — empty selection means everyone in the department). On edit, only the fields that actually changed are sent in the PATCH body; the client half of the FR-03 url/nameOverride isolation contract, the server enforces the other half independently. Confirm button reads "Fetching site info…" and is disabled while saving. Calls `POST /api/admin/dept-links` (create) or `PATCH /api/admin/dept-links/{id}` (edit, changed fields only).

#### app/dashboard/DeptSettingsView.tsx
Wrapper rendered by every JX panel's Management header pill (replacing the old direct `DeptMembersTab` render; label was "Settings", the `view` URL param is still `'settings'`). Props `{ department, displayName, userId, canManage, canManageLinks, isJ4? }`. Stacks `DeptLinksManagerCard` (manager-only, `canManageLinks`) above the unmodified `DeptMembersTab` (`canManage`); the members/leadership card set is untouched by this build.

#### app/dashboard/_components/DashboardQuickLinks.tsx
Grouped-by-department quick links section on `/dashboard` home (`DashboardOverview.tsx`, rendered between Favourites and Tasks). Self-fetches `GET /api/dashboard/quick-links` on mount; renders one tile row per department the caller belongs to that has at least one visible link (no department header when there are none anywhere — no empty state on the home page). Tile styling duplicates `DeptLinksRail.tsx`'s tiles rather than sharing a component.

### `_components/meetings/` (department meeting sub-system, used by `MeetingsTab` inside every JX panel)

#### app/dashboard/_components/meetings/MeetingsTab.tsx
Top-level meetings view for a department: toolbar (All/Own/Imported filter — "Imported" = meetings transferred in from another department, `isTransferred`), "New Meeting" button opening `CreateMeetingModal`, master list (`MeetingListItem`) + detail pane (`MeetingDetail`). Calls `GET /api/admin/meetings?department=`.

#### app/dashboard/_components/meetings/MeetingListItem.tsx
Presentational list row for a meeting: title, date, completed/locked/imported-transfer icons, task/attachment counts, "imported from {dept}" byline. No fetches.

#### app/dashboard/_components/meetings/MeetingDetail.tsx
Meeting detail/edit pane: notes editor, lock/unlock, complete, delete, transfer-to-another-department action, embeds `MeetingTaskList`, `MeetingAttachments`, `MeetingAttendance`. Calls `PATCH /api/admin/meetings/{id}` (notes save), `POST /api/admin/meetings/{id}/lock`, `DELETE /api/admin/meetings/{id}`, `POST /api/admin/meetings/{id}/complete`, `POST /api/admin/meetings/{id}/transfer`.

#### app/dashboard/_components/meetings/MeetingTaskList.tsx
Task list embedded in a meeting (distinct from the global `Db.tasks` system in `app/dashboard/tasks/`) — add/cycle-status/delete tasks scoped to the meeting, with expand for details. Calls `POST /api/admin/meetings/{meetingId}/tasks`, `PATCH/DELETE /api/admin/meetings/{meetingId}/tasks/{taskId}`.

#### app/dashboard/_components/meetings/MeetingAttachments.tsx
File/YouTube/external-link attachments for a meeting: drag-and-drop or click-to-upload (images/video/PDF, 50MB cap), or add a YouTube/external link inline. Calls `POST /api/admin/meetings/{meetingId}/attachments` (multipart for files, JSON `{youtubeUrl}`/`{linkUrl}` for links), `DELETE /api/admin/meetings/{meetingId}/attachments/{id}`.

#### app/dashboard/_components/meetings/MeetingAttendance.tsx
RSVP + attendance-confirmation widget for a meeting, grouped by `j4`/`dept_lead`/`dept_member`/`invited`. Member RSVP (Attending/Not Attending/LOA); after the meeting is `completed`, leads confirm actual attendance (attending→confirmed_attended, not_attending→confirmed_absent). "Sync members" button re-initialises attendee list from current dept roster. Calls `PATCH /api/admin/meetings/{meetingId}/attendance` (`{userId, status}`), `POST /api/admin/meetings/{meetingId}/attendance` (`{department}` to sync).

#### app/dashboard/_components/meetings/MemberPicker.tsx
Searchable member autocomplete for meeting notification/invite targets. Modes: department + J4 members (default, split into two labelled sections), or `allMembers` (all ASOT community members). Calls `GET /api/admin/members?department=&limit=` (+ separate `department=j4` call) or `GET /api/community/members?limit=500`.

### `_components/tickets/`

#### app/dashboard/_components/tickets/DeptTicketsTab.tsx
Department-scoped view of **community feedback tickets** (`CommunityTicket`/`Db` collection surfaced via `/api/feedback` — categories: request/bug/mission/campaign/unit-feedback/complaint/award; distinct from the `Db.tickets` admin ticket system used by `unit/tickets/TicketsPanel.tsx` and the all-staff move-request/discipline/performance tabs). Filterable by category/status, status-change actions and cross-department transfer for `canManage` users. Calls `GET /api/feedback?...`, `PATCH /api/tickets/{id}` (status change), `POST /api/tickets/{id}/transfer`.

---

## Notable cross-cutting observations

- **Two separate "ticket" systems** exist and are easy to conflate: (1) `Db.tickets` / `/api/admin/tickets` — internal staff process tickets (move-request, discipline, performance-report, department-membership), surfaced in `unit/tickets/TicketsPanel.tsx` and the `personnel/all-staff/tabs/*` forms; (2) `CommunityTicket` / `/api/feedback` + `/api/tickets/{id}` — member-facing feedback/bug/mission-request tickets, surfaced per-department via `_components/tickets/DeptTicketsTab.tsx` (used inside J5Panel/J6Panel/J7Panel and presumably J1–J4).
- **Two separate document-editing systems**: `CollabEditor` (Y.js/Hocuspocus real-time collaborative, used by `unit/sops/SopsPanel.tsx`) vs `SimpleEditor` (non-collaborative, used by `unit/training-docs/TrainingDocsPanel.tsx`).
- **`app/dashboard/retired/page.tsx`** and **`app/dashboard/meeting/[id]/page.tsx`** are the only two files in this scope with no explicit per-page permission gate of their own — both rely on parent layout (`hasPermission(user, 'pages.member')`) or API-level enforcement only, despite one being J4-administration tooling.
- Every JX department panel (`J5Panel`, `J6Panel`, `J7Panel`, and by inference J1–J4 outside this scope) shares an identical shell structure: header with `CornerBrackets` + Members/Calendar/Activity toggle buttons (via `useTabState`), reusing `DeptMembersTab`, `DeptCalendarTab`, `ActivityLogTab`, `MeetingsTab`, `DeptTicketsTab` as common building blocks — only the department-specific feature tab(s) differ (J5: gallery/SOTM; J6: Zeus Notes; J7: Board — `BoardTab`, a Trello-style kanban board, see J7 section above).
- Training has **two distinct doc concepts**: per-`TrainingType` attached docs (approval workflow inside `TrainingHub.tsx`'s Courses tab) vs the standalone `TrainingDocsPanel.tsx` folder/document explorer — do not confuse when asked to "add a training document."
