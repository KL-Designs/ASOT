/**
 * @file permissions.ts
 * @description Central permissions map for the ASOT staff portal.
 *
 * Every feature that requires authorisation references a key from this file.
 * To change who can access something, update the roles array here — no need
 * to hunt through pages or API routes.
 *
 * ── How it works ────────────────────────────────────────────────────────────
 *  - Each key maps to an array of Discord role names that are permitted.
 *  - Checks are performed via `client.hasRoles(me, PERMISSIONS.x.y)`.
 *  - Role names must match the Discord guild role names exactly (case-sensitive).
 *
 * ── Special overrides ───────────────────────────────────────────────────────
 *  - `J4-Administration` always bypasses every check (hardcoded in hasRoles).
 *  - The `OVERRIDE` env var accepts a comma-separated list of Discord user IDs
 *    that also bypass all checks — for emergency/developer access.
 *
 * ── Editing guidelines ──────────────────────────────────────────────────────
 *  - Add a role to a key's array to grant access; remove it to revoke access.
 *  - Department member roles live under `departments.*`.
 *  - Department lead roles live under `departmentLeads.*`.
 *  - Ticket action roles live under `tickets.*` and must stay in sync with
 *    `departmentLeads.*` — leads action tickets for their own department.
 */
const PERMISSIONS = {

    // ── Page access guards ────────────────────────────────────────────────────
    //
    // These guard top-level page/layout entry points. Failing a check redirects
    // the user rather than returning an HTTP error.

    pages: {
        /**
         * Member dashboard — `/dashboard` layout gate.
         * Any ASOT member can enter the dashboard; they see only Calendar,
         * Training Docs, and SOPs. J-department and staff-only sections are
         * hidden in the sidebar and page-gated individually.
         *
         * The real gate for this key is `await hasDashboardAccess(user)`
         * (`lib/orbat/hasDashboardAccess.ts`) — implicitly granted to anyone
         * with any department membership, department sub-role, or ORBAT
         * position role (including Reservists) — NOT this Discord-role
         * array. This array is now dead code for that specific check; it's
         * kept only because `lib/permissions/tree.ts` (the Permissions
         * Explorer) still reads it for display purposes.
         *
         * Used by:
         *  - `app/dashboard/layout.tsx`
         *  - `app/dashboard/page.tsx`
         *  - `app/dashboard/unit/calendar/page.tsx`
         *  - `app/dashboard/unit/sops/page.tsx`
         *  - `app/dashboard/unit/training-docs/page.tsx`
         */
        dashboard: ['ASOT Member'],

        /**
         * Staff dashboard — full access to staff-only sections.
         *
         * Used by:
         *  - `app/dashboard/unit/tickets/page.tsx`
         *  - `app/dashboard/tasks/page.tsx`
         *  - `app/dashboard/personnel/all-staff/page.tsx`
         *  - `app/api/admin/tickets/route.ts` (GET + POST)
         *  - `app/api/admin/calendar/route.ts` (POST — write)
         *  - `app/api/admin/members/route.ts`
         *  - `app/api/admin/orbat/for-move/route.ts`
         *  - `app/api/me/route.ts` (sets `isStaff` flag)
         */
        admin: [
            'J1 - Recruitment',
            'J2 - Mission Making',
            'J3 - Training',
            'J5 - Media',
            'J6 - Game Master',
            'J7 - Community Development',
            'HQ Staff',
            'All Staff',
        ],

        /**
         * Public member list — `/members` and `/admin/personnel/*`.
         *
         * Used by:
         *  - `app/members/page.tsx`
         *  - `app/admin/personnel/all/page.tsx`
         *  - `app/admin/personnel/hq-staff/page.tsx`
         *  - `app/admin/page.tsx` + `layout.tsx` (controls `canSeePersonnel` sidebar flag)
         */
        members: [
            'J1 - Recruitment',
            'J2 - Mission Making',
            'J3 - Training',
            'J5 - Media',
            'J6 - Game Master',
            'J7 - Community Development',
            'HQ Staff',
            'All Staff',
        ],

        /**
         * Mission/operations editor — `/operations/edit`.
         *
         * Used by:
         *  - `app/operations/edit/layout.tsx` (redirect gate)
         *  - `app/operations/page.tsx` (sets `editAccess` flag for edit button)
         *  - `app/operations/[id]/page.tsx` (sets `isHQ` flag)
         *  - `app/operations/edit/page.tsx` (sets `isHQ` flag for editor features)
         */
        operationsEdit: ['HQ Staff', 'J2 - Mission Making'],
    },

    // ── Department access ─────────────────────────────────────────────────────
    //
    // Controls access to each department's staff dashboard (`/admin/jX`) and
    // their associated API routes. Also used by the sidebar to show/hide
    // department tiles and by the tickets system for member-level visibility
    // (members can see their dept's tickets but not action them).

    departments: {
        /**
         * J1 — Recruitment.
         *
         * Used by:
         *  - `app/admin/j1/page.tsx` (page gate)
         *  - `app/admin/page.tsx` + `layout.tsx` (sidebar `canSeeJ1` flag)
         *  - `app/admin/unit/tickets/page.tsx` (`canSeeJ1` — read-only ticket visibility)
         *  - `app/api/admin/j1/applications/route.ts` + `[id]/route.ts` (DELETE requires J4)
         *  - `app/api/admin/j1/members/route.ts`
         *  - `app/api/admin/j1/import/route.ts`
         */
        j1: ['J1 - Recruitment'],

        /**
         * J2 — Mission Making.
         *
         * Used by:
         *  - `app/admin/j2/page.tsx` (page gate)
         *  - `app/admin/page.tsx` + `layout.tsx` (sidebar `canSeeJ2` flag)
         *  - `app/admin/unit/tickets/page.tsx` (`canSeeJ2` — read-only ticket visibility)
         *  - `app/api/admin/tickets/route.ts` (qualification + promotion ticket creation)
         */
        j2: ['J2 - Mission Making'],

        /**
         * J3 — Training.
         *
         * Used by:
         *  - `app/admin/j3/page.tsx` (page gate)
         *  - `app/admin/page.tsx` + `layout.tsx` (sidebar `canSeeJ3` flag)
         *  - `app/admin/unit/tickets/page.tsx` (`canSeeJ3` — read-only ticket visibility)
         *  - `app/api/admin/tickets/route.ts` (qualification + promotion ticket creation)
         */
        j3: ['J3 - Training'],

        /**
         * J4 — Administration.
         *
         * Note: `J4-Administration` already bypasses all permission checks globally,
         * so this key is used specifically where an explicit J4 membership check is
         * needed (e.g. discharge tickets, permanent operation deletion).
         *
         * Used by:
         *  - `app/admin/j4/page.tsx` (page gate)
         *  - `app/admin/page.tsx` + `layout.tsx` (sidebar `canSeeJ4` flag)
         *  - `app/admin/unit/calendar/page.tsx` + `app/api/admin/calendar/[id]/route.ts` (`isJ4` — can delete any calendar event)
         *  - `app/admin/unit/tickets/page.tsx` (`canSeeJ4` / `canActionJ4`)
         *  - `app/api/operations/purge/route.ts` (permanent deletion of operations from recycle bin)
         *  - `app/api/admin/tickets/route.ts` (discharge ticket creation)
         *  - `app/api/admin/members/discharged/route.ts`
         */
        j4: ['J4 - Administration'],

        /**
         * J5 — Media.
         *
         * Used by:
         *  - `app/admin/j5/page.tsx` (page gate)
         *  - `app/admin/page.tsx` + `layout.tsx` (sidebar `canSeeJ5` flag)
         */
        j5: ['J5 - Media'],

        /**
         * J6 — Game Masters.
         *
         * Used by:
         *  - `app/admin/j6/page.tsx` (page gate)
         *  - `app/admin/page.tsx` + `layout.tsx` (sidebar `canSeeJ6` flag)
         *  - `app/admin/unit/tickets/page.tsx` (`canSeeJ6` — read-only ticket visibility)
         */
        j6: ['J6 - Game Master'],

        /**
         * J7 — Community Development.
         *
         * Used by:
         *  - `app/admin/j7/page.tsx` (page gate)
         *  - `app/admin/page.tsx` + `layout.tsx` (sidebar `canSeeJ7` flag)
         *  - `app/admin/unit/tickets/page.tsx` (`canSeeJ7` — read-only ticket visibility)
         */
        j7: ['J7 - Community Development'],
    },

    // ── Operations (mission making) ───────────────────────────────────────────

    operations: {
        /**
         * Full write access to operations — create, update, delete, duplicate,
         * restore from bin, upload cover image, edit content, manage campaigns,
         * manage templates, and edit internal J2 notes.
         *
         * Used by:
         *  - `app/api/operations/new/route.ts`
         *  - `app/api/operations/update/route.ts`
         *  - `app/api/operations/delete/route.ts`
         *  - `app/api/operations/duplicate/route.ts`
         *  - `app/api/operations/restore/route.ts`
         *  - `app/api/operations/bin/route.ts`
         *  - `app/api/operations/content/route.ts`
         *  - `app/api/operations/upload/route.ts`
         *  - `app/api/operations/notes/route.ts`
         *  - `app/api/operations/campaigns/route.ts` + `campaigns/assign/route.ts`
         *  - `app/api/operations/templates/route.ts` + `templates/apply/route.ts`
         */
        write: ['HQ Staff', 'J2 - Mission Making'],

        /**
         * Allows viewing operations with status "In Development" on the
         * public-facing operations board (`/operations`).
         *
         * Used by:
         *  - `app/api/operations/route.ts` (sets `isHQ` flag to include in-dev ops)
         */
        viewInDevelopment: ['HQ Staff', 'J2 - Mission Making'],

        /**
         * Setting an operation's lifecycle status by hand — the override on the
         * Schedule tab that can move an operation to any of In Development /
         * Upcoming / Active / Completed regardless of where its schedule says
         * it should be.
         *
         * Separate from `operations.write` because it is not an edit, it is an
         * override: "In Development" suspends every automation (RSVP will not
         * open or close, the operation will not activate), and "Completed"
         * opens attendance confirmation and issues squad-leader tasks. Both are
         * things a mission maker can legitimately need and neither should be a
         * side effect of ordinary editing.
         *
         * Normal progression does not need this. The stage machine writes the
         * stage, and the server derives the status from it — see
         * `statusForStage` in `lib/operations/stage.ts`.
         *
         * Used by:
         *  - `app/api/operations/update/route.ts` (the `status` parameter)
         *  - `app/operations/[id]/edit/tabs/schedule/LifecycleOverride.tsx`
         */
        overrideLifecycle: ['HQ Staff', 'J2 - Department Leader'],

        /**
         * Reading and writing an operation's Zeus Notes pages.
         *
         * A Zeus Notes page is an ordinary document in every respect — sections,
         * collaborative editing, the same schema as the orders themselves. The
         * only thing that separates it is this key: without it the page is not
         * listed and not reachable, in the editor or on the public page.
         *
         * A permission rather than the `departments.j6` role array because who
         * gamemasters an operation is not the same question as who is on J6 —
         * the array stays as the legacy arm of the check while the migration
         * finishes.
         *
         * Used by:
         *  - `app/operations/[id]/page.tsx` (`canZeus`, passed to every theme)
         *  - `app/operations/[id]/edit/EditorPage.tsx` (hides the pages in the editor)
         */
        zeus: ['J6 - Game Master'],

        /**
         * Reading an operation's page beyond what a visitor sees.
         *
         * The public page stays public: anybody, signed in or not, reads the
         * sections marked `isPublic`. This key is the layer above that — the
         * sections that are not public, and operations that are not on the
         * board yet. It is what a role is granted so an operation *appears* for
         * somebody, rather than a gate that takes the page away from anyone.
         *
         * Legacy arm: being signed in at all, which is what gated non-public
         * sections before this key existed.
         *
         * Used by:
         *  - `lib/operations/permissions.ts` (`'view'`)
         */
        view: ['ASOT Member'],

        orders: {
            /**
             * Opening the orders editor at all — the shell, the document rail,
             * and the read-only view of what is written.
             *
             * Separate from `orders.write` because reviewing an operation and
             * authoring one are different jobs: a department lead who checks
             * orders before they publish needs the editor and should not need
             * the ability to change them.
             *
             * Legacy arm: `pages.operationsEdit`, the single Discord-role check
             * the whole editor used to hang from.
             *
             * Used by:
             *  - `app/operations/[id]/edit/layout.tsx`
             *  - `lib/operations/permissions.ts` (`'orders.view'`)
             */
            view: ['HQ Staff', 'J2 - Mission Making'],

            /**
             * Writing an operation's orders — the document body, its sections
             * and pages, and publishing them.
             *
             * Legacy arms: `operations.write` and `pages.operationsEdit`.
             *
             * Used by:
             *  - `app/api/operations/content/route.ts`
             *  - `app/api/operations/[id]/publish/route.ts`
             *  - `app/api/auth/collab/route.ts` (write access to the Y.Doc)
             *  - `lib/operations/permissions.ts` (`'orders.write'`)
             */
            write: ['HQ Staff', 'J2 - Mission Making'],

            /**
             * Changing the operation's own particulars — the mission deck down
             * the right of the editor: title, department, dates, map, theme,
             * cover image, campaign linkage.
             *
             * Separate from `orders.write` because the two are different kinds
             * of authority. Writing paragraph three of the Execution is a
             * mission-maker's job; changing which night the operation runs on,
             * or which campaign it belongs to, is a scheduling one — and the
             * people who should do each are not the same people.
             *
             * Legacy arm: `operations.write`.
             *
             * Used by:
             *  - `app/api/operations/update/route.ts`
             *  - `app/api/operations/upload/route.ts` + `image/route.ts`
             *  - `app/operations/[id]/edit/deck/DetailsCard.tsx`
             *  - `lib/operations/permissions.ts` (`'orders.details'`)
             */
            details: ['HQ Staff', 'J2 - Mission Making'],
        },

        map: {
            /**
             * The Map tab, and the fullscreen map viewer.
             *
             * Public, like the orders page: `/operations/{id}/map` serves the
             * read-only viewer to everybody, because the link people paste to
             * each other has to work for all of them. The key is the grant
             * vehicle for seeing the map on an operation that is not otherwise
             * visible.
             *
             * Used by:
             *  - `app/operations/[id]/map/page.tsx`
             *  - `lib/operations/permissions.ts` (`'map.view'`)
             */
            view: ['ASOT Member'],

            /**
             * Editing the map: the drawing tools, markers, measurements and
             * anything else that writes to the operation's map layer.
             *
             * Legacy arm: `pages.operationsEdit`.
             *
             * Used by:
             *  - `app/operations/[id]/edit/tabs/MapTab.tsx`
             *  - `lib/operations/permissions.ts` (`'map.edit'`)
             */
            edit: ['HQ Staff', 'J2 - Mission Making'],
        },

        schedule: {
            /**
             * Reading the Schedule tab — the automation timeline, what is due
             * when, and what has already fired.
             *
             * Not public: the page redirects a viewer without it back to the
             * operation. Legacy arm: `pages.operationsEdit`.
             *
             * Used by:
             *  - `app/operations/[id]/schedule/page.tsx`
             *  - `lib/operations/permissions.ts` (`'schedule.view'`)
             */
            view: ['HQ Staff', 'J2 - Mission Making'],

            /**
             * Changing the schedule: RSVP open and close offsets, reminder
             * timings, the development check, and firing a reminder by hand.
             *
             * Legacy arm: `operations.write`.
             *
             * Used by:
             *  - `app/api/operations/[id]/remind/route.ts`
             *  - `app/api/operations/[id]/mission-development/route.ts`
             *  - `lib/operations/permissions.ts` (`'schedule.manage'`)
             */
            manage: ['HQ Staff', 'J2 - Mission Making'],

            /**
             * The lifecycle override — setting an operation's status by hand to
             * any of In Development / Upcoming / Active / Completed regardless
             * of where its schedule says it should be.
             *
             * Deliberately apart from `schedule.manage`: it is not an edit, it
             * is an override. "In Development" suspends every automation, and
             * "Completed" opens attendance confirmation and issues squad-leader
             * tasks — both things that should be chosen rather than arrived at.
             *
             * Legacy arm: `operations.overrideLifecycle`, the key this replaces.
             * That key stays declared and its holders keep working.
             *
             * Used by:
             *  - `app/api/operations/update/route.ts` (the `status` parameter)
             *  - `app/operations/[id]/edit/tabs/schedule/LifecycleOverride.tsx`
             *  - `lib/operations/permissions.ts` (`'schedule.override'`)
             */
            override: ['HQ Staff', 'J2 - Department Leader'],
        },

        aar: {
            /**
             * Reading an operation's After Action Report tab.
             *
             * The tab only exists once the operation has finished — see
             * `aarOpen()` in `lib/operations/aar.ts` — so this is about who may
             * read it, not when. Legacy arm: being signed in, the same baseline
             * the attendance board has, since the two are the same audience.
             *
             * Used by:
             *  - `app/operations/[id]/aar/page.tsx`
             *  - `lib/operations/permissions.ts` (`'aar.view'`)
             */
            view: ['ASOT Member'],

            /**
             * Writing your own Fix / Sustain / Improve, and leaving feedback on
             * the operation.
             *
             * Held by any member, and gated further by whether they were
             * actually *on* the operation — a permission cannot answer that,
             * only the roster can, so `didAttend()` does it per member.
             *
             * Used by:
             *  - `app/api/operations/[id]/aar/route.ts`
             *  - `lib/operations/permissions.ts` (`'aar.write'`)
             */
            write: ['ASOT Member'],

            /**
             * Writing up *other* people — confirming a section's attendance,
             * setting statuses, and writing or editing its members' AARs.
             *
             * The unusual one. A section's 1IC gets this **positionally**: they
             * led the section on the night, which is a fact about the roster
             * rather than a grant, and `sectionLead()` in
             * `lib/operations/aar.ts` is what resolves it. This key is the
             * *other* way in — staff who need to close an operation out when a
             * 1IC never filled theirs in, and who are not scoped to one
             * section.
             *
             * Legacy arm: `attendance.manage`, which carried the roster-wide
             * confirmation this replaces.
             *
             * Used by:
             *  - `app/api/operations/[id]/aar/attendance/route.ts`
             *  - `lib/operations/permissions.ts` (`'aar.manage'`)
             */
            manage: ['HQ Staff', 'All Staff'],
        },

        ocap: {
            /**
             * Watching an operation's OCAP replay and reading its statistics.
             *
             * Legacy arm: being signed in, on an operation that actually has a
             * recording linked — which is what gated it before.
             *
             * Used by:
             *  - `app/operations/[id]/themes/*` (the OCAP document)
             *  - `lib/operations/permissions.ts` (`'ocap.view'`)
             */
            view: ['ASOT Member'],

            /**
             * Linking, re-syncing and unlinking an operation's OCAP recording.
             *
             * Legacy arm: `pages.operationsEdit`.
             *
             * Used by:
             *  - `app/api/operations/ocap/sync/route.ts` + `inspect` + `recordings`
             *  - `app/operations/[id]/OcapLinkPanel.tsx`
             *  - `lib/operations/permissions.ts` (`'ocap.manage'`)
             */
            manage: ['HQ Staff', 'J2 - Mission Making'],
        },
    },

    // ── Uploads ───────────────────────────────────────────────────────────────

    uploads: {
        /**
         * Upload member bio/profile images.
         *
         * As of the permission-system migration, the real gate for this key
         * is `await hasPermission(user, 'uploads.bio')` (`lib/orbat/hasPermission.ts`)
         * — granted via department/ORBAT-role holding — NOT this Discord-role array.
         * This array is now dead code for that specific check; it's kept only
         * because `lib/permissions/tree.ts` (the Permissions Explorer) still reads
         * it for display purposes.
         *
         * Used by:
         *  - `app/api/uploads/bio/route.ts`
         */
        bio: ['HQ Staff'],
    },

    // ── Member / milpac management ────────────────────────────────────────────

    members: {
        /**
         * View a member's confirmed operations history.
         *
         * Used by:
         *  - `app/api/members/[username]/confirmed-ops/route.ts`
         */
        edit: ['J4 - Administration'],

        /**
         * Edit restricted milpac fields — billet points, rank, enlistment date.
         * These fields have significant administrative impact and are gated separately.
         *
         * Used by:
         *  - `app/members/[username]/page.tsx` (`canEditRestricted` flag)
         *  - `app/admin/orbat/page.tsx` (`canMilpacEditRestricted` flag)
         *  - `app/admin/personnel/all/page.tsx` (`canEditRestricted` flag)
         *  - `app/api/members/[username]/route.ts` (field-level guard on PUT)
         */
        editRestricted: ['J4 - Administration'],

        /**
         * Edit standard milpac fields — promotions, qualifications, awards,
         * display name, and milpac image uploads.
         *
         * Used by:
         *  - `app/members/[username]/page.tsx` (page gate for edit mode)
         *  - `app/admin/orbat/page.tsx` (`canMilpacEditStandard` flag)
         *  - `app/admin/personnel/all/page.tsx` (`canEditStandard` flag)
         *  - `app/api/milpacs/[name]/route.ts` (milpac image upload)
         *  - `app/api/members/[username]/route.ts` (GET + PUT guards)
         */
        editStandard: ['J4 - Administration'],
    },

    // ── Admin panel features ──────────────────────────────────────────────────

    admin: {
        /**
         * Impersonate another user — temporarily assumes their session for
         * testing or support purposes.
         *
         * Used by:
         *  - `app/members/page.tsx` (`isAdmin` flag — shows impersonate button)
         *  - `app/admin/personnel/all/page.tsx` (`canImpersonate` flag)
         *  - `app/api/admin/impersonate/route.ts`
         */
        impersonate: ['J4 - Administration'],

        /**
         * Full ORBAT access — view and navigate the order of battle.
         * Required before either structural or member-assignment sub-permissions apply.
         *
         * Used by:
         *  - `app/admin/orbat/page.tsx` (page gate)
         *  - `app/admin/page.tsx` + `layout.tsx` (sidebar `canSeeOrbat` flag)
         *  - `app/(landing)/milpacs/page.tsx` + `community/orbat/page.tsx` (`canManageOrbat` flag)
         *  - `app/api/admin/orbat/route.ts`
         *  - `app/api/operations/[id]/attendance/platoons/route.ts`
         *  - `app/api/operations/[id]/attendance/manage/route.ts`
         */
        manageOrbat: ['J4 - Administration'],

        /**
         * ORBAT structural edits — create, rename, delete, and reorder
         * sections and role positions. Changes the shape of the ORBAT tree.
         *
         * Used by:
         *  - `app/api/admin/orbat/[positionId]/route.ts` (structural DELETE/PATCH)
         *  - `app/api/admin/orbat/positions/route.ts` (create positions)
         *  - `app/api/admin/orbat/sections/route.ts`
         *  - `app/api/admin/orbat/meta/route.ts` + `meta/patch/route.ts`
         */
        manageOrbatStructure: ['J4 - Administration'],

        /**
         * ORBAT member assignment — assign or remove users from positions,
         * and manage the reservist list.
         *
         * Used by:
         *  - `app/admin/orbat/page.tsx` (`canManageMembers` flag)
         *  - `app/api/admin/orbat/[positionId]/route.ts` (member assign/unassign)
         *  - `app/api/admin/orbat/reservists/route.ts`
         */
        manageOrbatMembers: ['J4 - Administration'],

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

        /**
         * Department Roles catalog — create, edit, and delete the department
         * (J1-J7) role definitions (Discord roles, TeamSpeak groups, granted
         * site permissions), and assign/unassign sub-roles to specific
         * members. Parallel to manageOrbatRoles but for department roles.
         * J4 only.
         *
         * Used by:
         *  - `app/dashboard/orbat/DepartmentRolesTab.tsx`
         *  - `app/api/admin/department-roles/route.ts` (GET/POST)
         *  - `app/api/admin/department-roles/[roleId]/route.ts` (PATCH/DELETE)
         *  - `app/api/admin/department-roles/assign/route.ts`
         */
        manageDepartmentRoles: ['J4 - Administration'],

        /**
         * Permissions Explorer — read-only visualization of the entire
         * PERMISSIONS catalog (which Discord roles / ORBAT Roles grant each
         * key, and live member counts), plus per-member lookup. J4 only,
         * since it exposes the full access-control map of the site.
         *
         * Used by:
         *  - `app/dashboard/j4/J4AdminPanel.tsx` (Roles Manager tile visibility)
         *  - `app/api/admin/permissions/tree/route.ts`
         *  - `app/api/admin/permissions/member/[id]/route.ts`
         */
        viewPermissionsTree: ['J4 - Administration'],

        /**
         * Mass import — wipe and replace all milpac and ORBAT data from CSV files.
         * Also used to import historical attendance records.
         * Destructive operation; restricted to J4.
         *
         * Used by:
         *  - `app/api/members/route.ts` (bulk member import)
         *  - `app/api/admin/mass-import/route.ts`
         *  - `app/api/admin/attendance-import/route.ts` + `attendance-import/resolve/route.ts`
         */
        massImport: ['J4 - Administration'],
    },

    // ── Optionals (mod list management) ──────────────────────────────────────

    optionals: {
        /**
         * Add or remove mods from the unit's optional mod master lists.
         *
         * As of the permission-system migration, the real gate for this key
         * is `await hasPermission(user, 'optionals.manage')` (`lib/orbat/hasPermission.ts`)
         * — granted via department/ORBAT-role holding — NOT this Discord-role array.
         * This array is now dead code for that specific check; it's kept only
         * because `lib/permissions/tree.ts` (the Permissions Explorer) still reads
         * it for display purposes.
         *
         * Used by:
         *  - `app/optionals/manage/route.ts`
         *  - `app/optionals/me/route.ts` (sets `isAdmin` flag)
         */
        manage: ['J4 - Administration'],
    },

    // ── Feedback (bug reports & feature requests) ─────────────────────────────

    feedback: {
        /**
         * Set the status on a feedback submission (open, in_progress, priority,
         * fixed, implemented, wont_fix). J4-Administration bypasses all checks
         * globally, so this is effectively J4-only.
         *
         * Used by:
         *  - `app/api/feedback/[id]/status/route.ts` (PATCH)
         */
        manageStatus: ['J4 - Administration'],
    },

    // ── Community Tickets ─────────────────────────────────────────────────────

    communityTickets: {
        /**
         * J4-only: manage all community tickets including private ones
         * (unit-feedback, complaints, awards) and soft-deleted tickets.
         * Also controls status changes, reassignments, and activity log access.
         *
         * Used by:
         *  - `app/api/feedback/route.ts`
         *  - `app/api/feedback/[id]/route.ts`
         */
        manage: ['J4 - Administration'],
    },

    // ── Gallery ───────────────────────────────────────────────────────────────

    gallery: {
        /**
         * Manage the media gallery — create/delete folders, upload and remove
         * images, and set featured/Shot of the Month images.
         *
         * As of the permission-system migration, the real gate for this key
         * is `await hasPermission(user, 'gallery.manage')` (`lib/orbat/hasPermission.ts`)
         * — granted via department/ORBAT-role holding — NOT this Discord-role array.
         * This array is now dead code for that specific check; it's kept only
         * because `lib/permissions/tree.ts` (the Permissions Explorer) still reads
         * it for display purposes.
         *
         * Used by:
         *  - `app/admin/gallery/page.tsx` (page gate)
         *  - `app/api/gallery/admin/folder/route.ts`
         *  - `app/api/gallery/admin/images/route.ts`
         *  - `app/api/gallery/admin/featured/route.ts`
         *  - `app/api/gallery/sotm/route.ts` (Shot of the Month — uses departmentLeads.j5)
         */
        manage: ['J5 - Media'],

        /**
         * Submit media to the gallery — the Submit button, `/gallery/submit`,
         * and the submission API routes.
         *
         * Gated with `await hasPermission(user, 'gallery.submit')` and nothing
         * else. Deliberately no Discord-role fallback and no legacy arm, which
         * means this is false for everybody — staff included — until it is
         * granted in the Roles Manager. Grant it on whichever role every member
         * holds.
         *
         * Used by:
         *  - `app/(landing)/gallery/submit/page.tsx` (page gate)
         *  - `app/(landing)/gallery/page.tsx` (shows or hides the Submit button)
         *  - `app/api/gallery/submissions/route.ts`
         */
        submit: [],

        /**
         * Review submitted media — accept, reject, or correct its caption,
         * tags and operation before publishing.
         *
         * Same story as `submit`: no legacy arm, so grant it on the J5 base
         * department role before this feature is any use.
         *
         * Used by:
         *  - `app/dashboard/j5/tabs/GallerySubmissionsTab.tsx`
         *  - `app/api/gallery/submissions/[id]/route.ts`
         *  - `app/api/gallery/media/[id]/route.ts` (seeing pending media)
         */
        review: [],

        /**
         * Manage the gallery's tag vocabulary — add, rename, reorder, retire.
         *
         * Used by:
         *  - `app/dashboard/j5/tabs/GalleryTagsTab.tsx`
         *  - `app/api/gallery/tags/route.ts` (POST/PATCH. GET is public, but
         *    branches on this key: retired tags, and the usage counts a
         *    caller opts into with `?counts=1`, are returned only to a
         *    holder.)
         */
        tags: [],
    },

    // ── Attendance ────────────────────────────────────────────────────────────

    attendance: {
        /**
         * Confirm member attendance after an operation has run.
         * Section leaders and All Staff use this to mark who attended.
         *
         * NOTE: this key can ALSO be granted via an ORBAT Role's `permissions`
         * array (see the Roles Manager, `app/dashboard/orbat/RolesManagerPanel.tsx`).
         * Anyone granted it that way gets the SAME roster-wide confirm and
         * billet-count-editing power as `All Staff`/`HQ Staff` — it is NOT scoped
         * to any particular section, since the confirm route only narrows to a
         * section for users whose ORBAT position has `isSenior: true`.
         *
         * Used by:
         *  - `app/operations/[id]/page.tsx` (`isAllStaff` flag — shows confirm UI)
         *  - `app/api/operations/[id]/attendance/confirm/route.ts`
         *  - `app/api/operations/[id]/attendance/type/route.ts` (`isAllStaff` flag)
         */
        confirm: ['All Staff', 'HQ Staff'],

        /**
         * Manage an operation's roster on the live attendance board: place
         * members into positions, move and swap them between sections, add or
         * remove positions, and auto-fill from the reservist pool.
         *
         * This is the permission the board's manage mode is gated on, and the
         * one the write routes re-check server-side. Members can always move
         * *themselves* while RSVP is open without holding it; once RSVP closes
         * every member-originated move is rejected and only a holder of this
         * key can change the board.
         *
         * Previously this power sat behind `admin.manageOrbat`, which is
         * J4-Administration only — the ORBAT-*editing* permission borrowed for
         * an attendance job. That is why nobody outside J4 could manage an
         * operation's roster, and separating them is the point of this key.
         *
         * Checked two-armed — `await hasPermission(user, 'attendance.manage')`
         * OR `client.hasRoles(user, PERMISSIONS.attendance.manage)` — because
         * `hasPermission` has no Discord-role fallback and does not honour the
         * J4-Administration bypass, so a brand-new key checked only the dynamic
         * way is false for everybody, admins included.
         *
         * Used by:
         *  - `app/api/operations/[id]/attendance/roster/route.ts`
         *  - `app/api/operations/[id]/attendance/platoons/route.ts`
         *  - `app/api/operations/[id]/attendance/manage/route.ts`
         *  - `components/operations/board/AttendanceBoard.tsx` (`canManage` flag)
         */
        manage: ['HQ Staff', 'All Staff'],

        /**
         * Reading an operation's attendance board.
         *
         * Legacy arm: being signed in, which is exactly what the tab required
         * before — `visibleTabs(canEdit, signedIn)` opens Attendance to any
         * member because the board is how they RSVP and claim a position.
         *
         * Used by:
         *  - `app/operations/[id]/attendance/page.tsx`
         *  - `app/operations/[id]/tabs.ts` (`visibleTabs`)
         *  - `lib/operations/permissions.ts` (`'attendance.view'`)
         */
        view: ['ASOT Member'],

        /**
         * Claiming a position on the board for yourself, and giving it up.
         *
         * A member acting on their own slot, which is a different power from
         * `attendance.manage` — that one moves *other* people. Members can
         * always move themselves while RSVP is open; once it closes, only a
         * holder of `attendance.manage` can change the board at all.
         *
         * Legacy arm: being signed in.
         *
         * Used by:
         *  - `app/api/operations/[id]/attendance/roster/route.ts` (self moves)
         *  - `app/api/operations/[id]/attendance/rsvp/route.ts`
         *  - `lib/operations/permissions.ts` (`'attendance.claim'`)
         */
        claim: ['ASOT Member'],

        /**
         * Changing what positions *exist* on the board — adding roles to a
         * section, creating custom units, editing platoon structure, setting
         * billet counts.
         *
         * Apart from `attendance.manage` because they answer different
         * questions: manage is "who sits where", this is "what seats there
         * are". Cutting a new section onto an operation's ORBAT is a mission
         * design decision; moving a rifleman into it on the night is not.
         *
         * Legacy arm: `attendance.manage`, which carried both before.
         *
         * Used by:
         *  - `app/api/operations/[id]/attendance/roles/route.ts`
         *  - `app/api/operations/[id]/attendance/custom-units/route.ts`
         *  - `app/api/operations/[id]/attendance/platoons/route.ts`
         *  - `lib/operations/permissions.ts` (`'attendance.roles'`)
         */
        roles: ['HQ Staff', 'All Staff'],
    },

    // ── Auth / integrations ───────────────────────────────────────────────────

    auth: {
        /**
         * Authorise access to the real-time collaborative operation editor
         * (Hocuspocus/Y.js WebSocket). Prevents non-J2 staff from connecting.
         *
         * As of the permission-system migration, the real gate for this key
         * is `await hasPermission(user, 'auth.collab')` (`lib/orbat/hasPermission.ts`)
         * — granted via department/ORBAT-role holding — NOT this Discord-role array.
         * This array is now dead code for that specific check; it's kept only
         * because `lib/permissions/tree.ts` (the Permissions Explorer) still reads
         * it for display purposes.
         *
         * Used by:
         *  - `app/api/auth/collab/route.ts`
         */
        collab: ['HQ Staff', 'J2 - Mission Making'],
    },

    // ── Department leads ──────────────────────────────────────────────────────
    //
    // Controls which roles can add/remove members from their department and
    // set/remove the department lead designation. Also used to gate features
    // that only department leads should access (e.g. Shot of the Month for J5).
    //
    // Note: these roles intentionally differ from `departments.*` — a lead may
    // hold a separate Discord role from regular department members.

    departmentLeads: {
        /**
         * J1 lead — can add/remove J1 members and manage department membership tickets.
         *
         * As of the permission-system migration, call sites that referenced this
         * key via static dot-notation (`PERMISSIONS.departmentLeads.j1`) now gate
         * through `await hasPermission(user, 'departmentLeads.j1')`
         * (`lib/orbat/hasPermission.ts`) instead — granted via department/ORBAT-role
         * holding. Call sites that read this array via dynamic indexing
         * (`PERMISSIONS.departmentLeads[dept]` / `Object.entries(...)`) — e.g. the
         * meetings complete/attendance/delete/transfer routes, admin tickets, board
         * columns, department-roles admin routes, and admin activity — were NOT
         * part of this migration batch and still depend on this array; deferred.
         *
         * Used by:
         *  - `app/admin/j1/page.tsx` (`canManageMembers` flag)
         *  - `app/api/admin/tickets/route.ts` (department-membership ticket creation for J1)
         */
        j1: ['J1 - Department Leader', 'J1 - Head Recruiter', 'J1 - Recruiter Trainer'],

        /**
         * J2 lead — can add/remove J2 members and manage department membership tickets.
         *
         * As of the permission-system migration, call sites that referenced this
         * key via static dot-notation (`PERMISSIONS.departmentLeads.j2`) now gate
         * through `await hasPermission(user, 'departmentLeads.j2')`
         * (`lib/orbat/hasPermission.ts`) instead — granted via department/ORBAT-role
         * holding. Call sites that read this array via dynamic indexing
         * (`PERMISSIONS.departmentLeads[dept]` / `Object.entries(...)`) — e.g. the
         * meetings complete/attendance/delete/transfer routes, admin tickets, board
         * columns, department-roles admin routes, and admin activity — were NOT
         * part of this migration batch and still depend on this array; deferred.
         *
         * Used by:
         *  - `app/admin/j2/page.tsx` (`canManageMembers` flag)
         *  - `app/api/admin/tickets/route.ts` (department-membership ticket creation for J2)
         */
        j2: ['J2 - Department Leader', 'J2 - Team Leader', 'J2 - Creator Trainer'],

        /**
         * J3 lead — can add/remove J3 members and manage department membership tickets.
         *
         * As of the permission-system migration, call sites that referenced this
         * key via static dot-notation (`PERMISSIONS.departmentLeads.j3`) now gate
         * through `await hasPermission(user, 'departmentLeads.j3')`
         * (`lib/orbat/hasPermission.ts`) instead — granted via department/ORBAT-role
         * holding. Call sites that read this array via dynamic indexing
         * (`PERMISSIONS.departmentLeads[dept]` / `Object.entries(...)`) — e.g. the
         * meetings complete/attendance/delete/transfer routes, admin tickets, board
         * columns, department-roles admin routes, and admin activity — were NOT
         * part of this migration batch and still depend on this array; deferred.
         *
         * Used by:
         *  - `app/admin/j3/page.tsx` (`canManageMembers` flag)
         *  - `app/api/admin/tickets/route.ts` (department-membership ticket creation for J3)
         */
        j3: ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer'],

        /**
         * J4 lead — can add/remove J4 members and manage department membership
         * tickets. In practice this is just J4-Administration itself (there's
         * no separate "J4 lead" sub-role) — declared explicitly so
         * `PERMISSIONS.departmentLeads.j4` exists and `hasRoles()` doesn't
         * receive `undefined` for J4's department-membership tickets, the
         * same way every other department already does.
         *
         * As of the permission-system migration, call sites that referenced this
         * key via static dot-notation (`PERMISSIONS.departmentLeads.j4`) now gate
         * through `await hasPermission(user, 'departmentLeads.j4')`
         * (`lib/orbat/hasPermission.ts`) instead — granted via department/ORBAT-role
         * holding. Call sites that read this array via dynamic indexing
         * (`PERMISSIONS.departmentLeads[dept]` / `Object.entries(...)`) — e.g. the
         * meetings complete/attendance/delete/transfer routes, admin tickets, board
         * columns, department-roles admin routes, and admin activity — were NOT
         * part of this migration batch and still depend on this array; deferred.
         *
         * Used by:
         *  - `app/api/admin/tickets/route.ts` (department-membership ticket creation for J4)
         */
        j4: ['J4 - Administration'],

        /**
         * J5 lead — can add/remove J5 members, manage department membership tickets,
         * and manage the Shot of the Month gallery feature.
         *
         * As of the permission-system migration, call sites that referenced this
         * key via static dot-notation (`PERMISSIONS.departmentLeads.j5`) now gate
         * through `await hasPermission(user, 'departmentLeads.j5')`
         * (`lib/orbat/hasPermission.ts`) instead — granted via department/ORBAT-role
         * holding. Call sites that read this array via dynamic indexing
         * (`PERMISSIONS.departmentLeads[dept]` / `Object.entries(...)`) — e.g. the
         * meetings complete/attendance/delete/transfer routes, admin tickets, board
         * columns, department-roles admin routes, and admin activity — were NOT
         * part of this migration batch and still depend on this array; deferred.
         *
         * Used by:
         *  - `app/admin/j5/page.tsx` (`canManageMembers` flag)
         *  - `app/api/admin/tickets/route.ts` (department-membership ticket creation for J5)
         *  - `app/api/gallery/sotm/route.ts`
         */
        j5: ['J5 - Department Leader', 'J5 - Team Leader', 'J5 - Lead Content Creator'],

        /**
         * J6 lead — can add/remove J6 members and manage department membership tickets.
         *
         * As of the permission-system migration, call sites that referenced this
         * key via static dot-notation (`PERMISSIONS.departmentLeads.j6`) now gate
         * through `await hasPermission(user, 'departmentLeads.j6')`
         * (`lib/orbat/hasPermission.ts`) instead — granted via department/ORBAT-role
         * holding. Call sites that read this array via dynamic indexing
         * (`PERMISSIONS.departmentLeads[dept]` / `Object.entries(...)`) — e.g. the
         * meetings complete/attendance/delete/transfer routes, admin tickets, board
         * columns, department-roles admin routes, and admin activity — were NOT
         * part of this migration batch and still depend on this array; deferred.
         *
         * Used by:
         *  - `app/admin/j6/page.tsx` (`canManageMembers` flag)
         *  - `app/api/admin/tickets/route.ts` (department-membership ticket creation for J6)
         */
        j6: ['J6 - Department Lead', 'J6 - Team Leader', 'J6 - Assistant Team Leader'],

        /**
         * J7 lead — can add/remove J7 members and manage department membership tickets.
         *
         * As of the permission-system migration, call sites that referenced this
         * key via static dot-notation (`PERMISSIONS.departmentLeads.j7`) now gate
         * through `await hasPermission(user, 'departmentLeads.j7')`
         * (`lib/orbat/hasPermission.ts`) instead — granted via department/ORBAT-role
         * holding. Call sites that read this array via dynamic indexing
         * (`PERMISSIONS.departmentLeads[dept]` / `Object.entries(...)`) — e.g. the
         * meetings complete/attendance/delete/transfer routes, admin tickets, board
         * columns, department-roles admin routes, and admin activity — were NOT
         * part of this migration batch and still depend on this array; deferred.
         *
         * Used by:
         *  - `app/admin/j7/page.tsx` (`canManageMembers` flag)
         *  - `app/api/admin/tickets/route.ts` (department-membership ticket creation for J7)
         */
        j7: ['J7 - Department Leader', 'J7 - Team Leader', 'J7 - Assistant Team Leader'],
    },

    // ── Tickets ───────────────────────────────────────────────────────────────
    //
    // Two-tier access model for the unit tickets panel (`/admin/unit/tickets`):
    //
    //   Visibility  → `departments.*` (members) OR `tickets.actionJX` (leads)
    //   Actionable  → `tickets.actionJX` (leads only)
    //
    // The `tickets.actionJX` roles should always match their corresponding
    // `departmentLeads.jX` roles so that leads can both see and action tickets.
    //
    // All Staff tickets (move requests, discipline) are handled separately and
    // are not controlled by these keys.

    // ── Meetings ──────────────────────────────────────────────────────────────
    //
    // Controls who can lock/unlock individual meeting records for each department.
    // Regular department members can create and edit meetings; only leads can lock.

    /**
     * As of the permission-system migration, the real gate for every lockJX
     * key below is `await hasPermission(user, 'meetings.lockJX')`
     * (`lib/orbat/hasPermission.ts`) — granted via department/ORBAT-role
     * holding — NOT these Discord-role arrays.
     */
    meetings: {
        lockJ1: ['J1 - Department Leader', 'J1 - Head Recruiter', 'J1 - Recruiter Trainer'],
        lockJ2: ['J2 - Department Leader', 'J2 - Team Leader', 'J2 - Creator Trainer'],
        lockJ3: ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer'],
        lockJ4: ['J4-Administration'],
        lockJ5: ['J5 - Department Leader', 'J5 - Team Leader', 'J5 - Lead Content Creator'],
        lockJ6: ['J6 - Department Lead', 'J6 - Team Leader', 'J6 - Assistant Team Leader'],
        lockJ7: ['J7 - Department Leader', 'J7 - Team Leader', 'J7 - Assistant Team Leader'],
    },

    // ── Department quick links ────────────────────────────────────────────────
    //
    // Per-department managed quick links (the favicon tile rail on each J1-J7
    // landing view, managed from that department's Management view).
    //
    // A single new-system-only key (empty Discord-role array; the real gate is
    // always `await hasDepartmentPermission(user, department, 'deptLinks.manage')`
    // — see lib/orbat/hasDepartmentPermission.ts). Department scope comes from
    // which DepartmentRole the key is assigned to, not from the key name, so
    // one key covers all seven departments (unlike the old manageJ1..J7 keys).
    //
    // Per-link visibility (which specific sub-roles can see a given link) is
    // data on DepartmentLink.visibleToRoleIds, not a permission key — see
    // types/department-link.d.ts. Write access is `deptLinks.manage` OR
    // `departmentLeads.jX`, so leads work day one and the right can additionally
    // be delegated to any department role through the role manager.

    deptLinks: {
        /** Add, edit, delete, reorder and control the visible-to sub-roles of a department's quick links. Scope comes from which DepartmentRole holds this key. New-system-only key. */
        manage: [],
    },

    // ── Backups ───────────────────────────────────────────────────────────────
    //
    // Two new-system-only keys (empty arrays; the real gate is always
    // `await hasPermission(user, 'backups.x')` — lib/orbat/hasPermission.ts).
    // Split so everyday visibility and the destructive actions can be granted
    // separately: restoring overwrites the live database and media tree
    // wholesale. See docs/superpowers/specs/2026-08-17-backup-hardening-design.md.
    //
    // Moving these routes onto hasPermission() removes the hardcoded
    // `J4-Administration` bypass that client.hasRoles() grants — that is the
    // point (issue #55 requirement 4), but it means the grant migration
    // (scripts/migrate-backups-permissions.mjs) must be applied before this
    // deploys or J4 locks itself out.

    backups: {
        /** View the backup timeline and storage usage, trigger a backup on demand, download a backup point, extend retention. New-system-only key. */
        manage: [],

        /** Revert to a backup point, or upload a ZIP and restore from it. Destructive — always takes a safety backup first. New-system-only key. */
        restore: [],
    },

    // ── Quiz / Training ───────────────────────────────────────────────────────

    quiz: {
        /**
         * Assign a BCT quiz to a recruit and view training records.
         * All J3 trainers can assign; J3 leads and J4 can also review escalations.
         *
         * As of the permission-system migration, the real gate for this key
         * is `await hasPermission(user, 'quiz.assign')` (`lib/orbat/hasPermission.ts`)
         * — granted via department/ORBAT-role holding — NOT this Discord-role array.
         */
        assign: ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer'],

        /**
         * Review a submitted quiz attempt and issue a Pass, Fail, or escalation.
         *
         * As of the permission-system migration, the real gate for this key
         * is `await hasPermission(user, 'quiz.review')` (`lib/orbat/hasPermission.ts`)
         * — granted via department/ORBAT-role holding — NOT this Discord-role array.
         */
        review: ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer'],

        /**
         * Escalated review — available to J3 leads when a trainer sends for review,
         * and to J4 when a J3 lead escalates further.
         *
         * As of the permission-system migration, the real gate for this key
         * is `await hasPermission(user, 'quiz.reviewEscalated')` (`lib/orbat/hasPermission.ts`)
         * — granted via department/ORBAT-role holding — NOT this Discord-role array.
         */
        reviewEscalated: ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer', 'J4 - Administration'],
    },

    // ── Training Docs ─────────────────────────────────────────────────────────

    trainingDocs: {
        /**
         * Create folders, upload documents, rename, and delete training docs.
         * All ASOT Members can view; J3 can manage.
         *
         * Used by:
         *  - `app/api/training-docs/route.ts` (POST)
         *  - `app/api/training-docs/[id]/route.ts` (PATCH + DELETE)
         *  - `app/dashboard/unit/training-docs/page.tsx` (isJ3 flag)
         */
        manage: ['J3 - Training'],
    },

    // ── Training Guides ───────────────────────────────────────────────────────

    trainingGuides: {
        /**
         * Create and edit structured training session guides.
         * All J3 department members (trainers and leads) can create and edit.
         *
         * Used by:
         *  - `app/api/training-guides/route.ts` (POST)
         *  - `app/api/training-guides/[id]/route.ts` (PUT)
         *  - `app/dashboard/j3/tabs/TrainingGuidesTab.tsx` (canEdit flag)
         */
        write: ['J3 - Training'],

        /**
         * Approve a training guide (promote from draft → approved).
         * J3 leads only.
         *
         * Used by:
         *  - `app/api/training-guides/[id]/approve/route.ts`
         *  - `app/dashboard/j3/tabs/TrainingGuidesTab.tsx` (canApprove flag)
         */
        approve: ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer'],

        /**
         * Soft-delete a training guide (sets deletedAt).
         * J3 leads only.
         *
         * Used by:
         *  - `app/api/training-guides/[id]/route.ts` (DELETE)
         */
        delete: ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer'],
    },

    // ── SOPs ──────────────────────────────────────────────────────────────────

    sops: {
        /**
         * Create, update metadata, and delete SOP documents.
         * All ASOT Members can view SOPs; only J4 can manage them.
         *
         * Used by:
         *  - `app/api/sops/route.ts` (POST)
         *  - `app/api/sops/[id]/route.ts` (PATCH + DELETE)
         *  - `app/dashboard/unit/sops/page.tsx` (isJ4 flag)
         */
        manage: ['J4 - Administration'],
    },

    // ── Training ──────────────────────────────────────────────────────────────

    training: {
        /**
         * Submit a training event request for J3 approval.
         * J3 trainers and All Staff (non-J3 cross-department trainers) may request
         * to run a session. All requests go through J3 lead approval regardless.
         *
         * Used by:
         *  - `app/api/training/events/route.ts` (POST — create request)
         *  - `app/dashboard/unit/training-docs/page.tsx` (isTrainer flag)
         */
        create: ['J3 - Training', 'All Staff'],

        /**
         * Fill a Trainer slot on a training event (J3 staff only, not All Staff).
         * Used to gate trainer-slot RSVP in the event sign-up flow.
         *
         * Used by:
         *  - `app/api/training/events/[id]/rsvp/route.ts` (slotType === 'trainer')
         */
        trainer: ['J3 - Training', 'J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer'],

        /**
         * Approve or reject training event requests, mark sessions complete,
         * and manage training type definitions.
         * J3 department leads only.
         *
         * Used by:
         *  - `app/api/training/events/[id]/approve/route.ts`
         *  - `app/api/training/events/[id]/complete/route.ts`
         *  - `app/api/training/types/route.ts` (POST/PATCH/DELETE)
         *  - `app/dashboard/unit/training-docs/page.tsx` (isJ3Lead flag)
         */
        manage: ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer'],
    },

    // ── Master Sheet ─────────────────────────────────────────────────────────
    //
    // Governs access to the J4 HQ Master Sheet personnel data.
    // Discipline records are gated separately and are never shown to regular staff.

    masterSheet: {
        /**
         * View non-sensitive master sheet data (leaving history, denied applications).
         * J4 bypasses this check globally.
         *
         * Used by:
         *  - `app/api/admin/j4/mastersheet/leaving-history/route.ts`
         *  - `app/api/admin/j4/mastersheet/denied-applications/route.ts`
         */
        view: ['J4 - Administration', 'HQ Staff'],

        /**
         * View discipline records. J4 + CHQ only — no indication this data
         * exists to anyone outside this permission group.
         *
         * Used by:
         *  - `app/api/admin/j4/mastersheet/discipline/route.ts`
         */
        viewDiscipline: ['HQ Staff'],

        /**
         * Import/replace master sheet data from CSV. J4 only.
         *
         * Used by:
         *  - all POST routes under `/api/admin/j4/mastersheet/import/`
         */
        import: ['J4 - Administration'],
    },

    tickets: {
        /**
         * Approve or reject J1 department tickets.
         * Department members (`departments.j1`) can view J1 tickets read-only.
         *
         * Used by:
         *  - `app/admin/unit/tickets/page.tsx` (`canActionJ1` + `canSeeJ1`)
         *  - `app/api/admin/tickets/[id]/route.ts` (PATCH auth check)
         */
        actionJ1: ['J1 - Department Leader', 'J1 - Head Recruiter', 'J1 - Recruiter Trainer'],

        /**
         * Approve or reject J2 department tickets.
         * Department members (`departments.j2`) can view J2 tickets read-only.
         *
         * Used by:
         *  - `app/admin/unit/tickets/page.tsx` (`canActionJ2` + `canSeeJ2`)
         *  - `app/api/admin/tickets/[id]/route.ts` (PATCH auth check)
         */
        actionJ2: ['J2 - Department Leader', 'J2 - Team Leader', 'J2 - Creator Trainer'],

        /**
         * Approve or reject J3 qualification and promotion tickets.
         * Department members (`departments.j3`) can view J3 tickets read-only.
         *
         * Used by:
         *  - `app/admin/unit/tickets/page.tsx` (`canActionJ3` + `canSeeJ3`)
         *  - `app/api/admin/tickets/[id]/route.ts` (PATCH auth check)
         */
        actionJ3: ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer'],

        /**
         * Approve or reject J4 tickets — awards, discharges, and performance reports.
         * Note: J4-Administration bypasses all checks globally, so this is largely
         * redundant but kept for explicit clarity and consistency with other depts.
         *
         * Used by:
         *  - `app/admin/unit/tickets/page.tsx` (`canActionJ4` + `canSeeJ4`)
         *  - `app/api/admin/tickets/[id]/route.ts` (PATCH auth check)
         */
        actionJ4: ['J4 - Administration'],

        /**
         * Approve or reject J6 department tickets.
         * Department members (`departments.j6`) can view J6 tickets read-only.
         *
         * Used by:
         *  - `app/admin/unit/tickets/page.tsx` (`canActionJ6` + `canSeeJ6`)
         *  - `app/api/admin/tickets/[id]/route.ts` (PATCH auth check)
         */
        actionJ6: ['J6 - Department Lead', 'J6 - Team Leader', 'J6 - Assistant Team Leader'],

        /**
         * Approve or reject J7 department tickets.
         * Department members (`departments.j7`) can view J7 tickets read-only.
         *
         * Used by:
         *  - `app/admin/unit/tickets/page.tsx` (`canActionJ7` + `canSeeJ7`)
         *  - `app/api/admin/tickets/[id]/route.ts` (PATCH auth check)
         */
        actionJ7: ['J7 - Department Leader', 'J7 - Team Leader', 'J7 - Assistant Team Leader'],

        /**
         * Override-action move request tickets — bypasses the specific-approver
         * routing so HQ can unblock stuck requests. The primary approval path
         * is the assigned section leader check (`me.id === ticket.requiredApproverUserId`),
         * handled separately in the PATCH route.
         *
         * Used by:
         *  - `app/admin/unit/tickets/page.tsx` (`canActionMoveRequest`)
         *  - `app/api/admin/tickets/[id]/route.ts` (PATCH auth check — allstaff dept)
         */
        actionMoveRequest: ['HQ Staff'],

        /**
         * Approve or reject discipline tickets, which deduct discipline points
         * from a member's milpac and record the infraction in their history.
         *
         * Used by:
         *  - `app/admin/unit/tickets/page.tsx` (`canActionDiscipline`)
         *  - `app/api/admin/tickets/[id]/route.ts` (PATCH auth check — allstaff dept)
         */
        actionDiscipline: ['J4 - Administration'],
    },

    // ── AI service ────────────────────────────────────────────────────────────

    // ── Intel Image Creator ───────────────────────────────────────────────────

    intel: {
        /**
         * Generate intel images via the AI image creator.
         * Primarily J2 mission makers; J4 bypasses globally.
         *
         * As of the permission-system migration, the real gate for this key
         * is `await hasPermission(user, 'intel.generateImages')` (`lib/orbat/hasPermission.ts`)
         * — granted via department/ORBAT-role holding — NOT this Discord-role array.
         * This array is now dead code for that specific check; it's kept only
         * because `lib/permissions/tree.ts` (the Permissions Explorer) still reads
         * it for display purposes.
         *
         * Used by:
         *  - `app/api/ai/intel/generate/route.ts`
         *  - `app/dashboard/j2/tabs/IntelImagesTab.tsx`
         */
        generateImages: ['J2 - Mission Making', 'HQ Staff'],

        /**
         * View all members' generated intel images (the "All Images" library).
         * Own images are always visible to the generating member.
         *
         * As of the permission-system migration, the real gate for this key
         * is `await hasPermission(user, 'intel.viewAllImages')` (`lib/orbat/hasPermission.ts`)
         * — granted via department/ORBAT-role holding — NOT this Discord-role array.
         * This array is now dead code for that specific check; it's kept only
         * because `lib/permissions/tree.ts` (the Permissions Explorer) still reads
         * it for display purposes.
         *
         * Used by:
         *  - `app/api/ai/images/route.ts` (GET with ?scope=all)
         */
        viewAllImages: ['J2 - Mission Making', 'HQ Staff'],
    },

    ai: {
        /**
         * Manage AI configuration — budgets, caps, provider settings,
         * and view full usage/cost analytics.
         *
         * J4-Administration bypasses all checks globally, so this is
         * effectively J4-only. Listed explicitly for use in the AI admin
         * API routes that need a named permission check.
         *
         * Used by:
         *  - `app/api/ai/config/route.ts`
         *  - `app/api/ai/budgets/route.ts`
         *  - `app/api/ai/usage/route.ts` (full access)
         *  - `app/dashboard/j4/tabs/AIAdminTab.tsx`
         */
        manage: ['J4 - Administration'],

        /**
         * Use AI features — controls which members can make AI requests.
         * Members outside this list cannot consume AI credits.
         *
         * Used by:
         *  - `app/api/ai/estimate/route.ts`
         *  - Feature-specific AI routes (image creator, answer review, etc.)
         */
        use: ['ASOT Member'],
    },

} satisfies PermissionTree

/**
 * The shape of the map above: groups of keys, where a group may itself hold
 * groups.
 *
 * Recursive rather than two levels deep because the operations area is grouped
 * by surface — `operations.orders.write`, `operations.map.edit`,
 * `operations.schedule.override` — and a flat `operations.ordersWrite` would
 * have put the namespacing into the key *names* rather than into the
 * structure, where the Roles Manager's picker can see it.
 *
 * Nothing downstream needed changing for this: `lib/permissions-catalog.ts`
 * already flattened recursively, and the Permissions Explorer groups on the
 * first segment of the dot path. The depth was expressible at runtime long
 * before the type allowed it.
 */
type PermissionTree = { [key: string]: string[] | PermissionTree }

export default PERMISSIONS
