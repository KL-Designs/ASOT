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
         * Staff dashboard — `/admin` and all sub-routes under it.
         *
         * Used by:
         *  - `app/admin/layout.tsx` (layout-level redirect gate)
         *  - `app/admin/page.tsx` (sidebar visibility flags)
         *  - `app/admin/unit/tickets/page.tsx`, `calendar/page.tsx`, `sops/page.tsx`, `training-docs/page.tsx`
         *  - `app/admin/personnel/all-staff/page.tsx`
         *  - `app/api/admin/tickets/route.ts` (GET + POST)
         *  - `app/api/admin/calendar/route.ts` (GET + POST)
         *  - `app/api/admin/members/route.ts`
         *  - `app/api/admin/orbat/for-move/route.ts`
         *  - `app/api/me/route.ts` (sets `isStaff` flag)
         */
        admin: [
            'J1-Recruiting', 'J1-Staff',
            'J2-Mission Making',
            'J3-Training',
            'J5-Media',
            'J6-Game Master',
            'J7 Community Development',
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
            'J1-Recruiting', 'J1-Staff',
            'J2-Mission Making',
            'J3-Training',
            'J5-Media',
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
        operationsEdit: ['HQ Staff', 'J2-Mission Making'],
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
        j1: ['J1-Recruiting', 'J1-Staff'],

        /**
         * J2 — Mission Making.
         *
         * Used by:
         *  - `app/admin/j2/page.tsx` (page gate)
         *  - `app/admin/page.tsx` + `layout.tsx` (sidebar `canSeeJ2` flag)
         *  - `app/admin/unit/tickets/page.tsx` (`canSeeJ2` — read-only ticket visibility)
         *  - `app/api/admin/tickets/route.ts` (qualification + promotion ticket creation)
         */
        j2: ['J2-Mission Making'],

        /**
         * J3 — Training.
         *
         * Used by:
         *  - `app/admin/j3/page.tsx` (page gate)
         *  - `app/admin/page.tsx` + `layout.tsx` (sidebar `canSeeJ3` flag)
         *  - `app/admin/unit/tickets/page.tsx` (`canSeeJ3` — read-only ticket visibility)
         *  - `app/api/admin/tickets/route.ts` (qualification + promotion ticket creation)
         */
        j3: ['J3-Training'],

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
        j4: ['J4-Administration'],

        /**
         * J5 — Media.
         *
         * Used by:
         *  - `app/admin/j5/page.tsx` (page gate)
         *  - `app/admin/page.tsx` + `layout.tsx` (sidebar `canSeeJ5` flag)
         */
        j5: ['J5-Media'],

        /**
         * J6 — Game Masters.
         *
         * Used by:
         *  - `app/admin/j6/page.tsx` (page gate)
         *  - `app/admin/page.tsx` + `layout.tsx` (sidebar `canSeeJ6` flag)
         *  - `app/admin/unit/tickets/page.tsx` (`canSeeJ6` — read-only ticket visibility)
         */
        j6: ['J6-Game Master'],

        /**
         * J7 — Community Development.
         *
         * Used by:
         *  - `app/admin/j7/page.tsx` (page gate)
         *  - `app/admin/page.tsx` + `layout.tsx` (sidebar `canSeeJ7` flag)
         *  - `app/admin/unit/tickets/page.tsx` (`canSeeJ7` — read-only ticket visibility)
         */
        j7: ['J7 Community Development'],
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
        write: ['HQ Staff', 'J2-Mission Making'],

        /**
         * Allows viewing operations with status "In Development" on the
         * public-facing operations board (`/operations`).
         *
         * Used by:
         *  - `app/api/operations/route.ts` (sets `isHQ` flag to include in-dev ops)
         */
        viewInDevelopment: ['HQ Staff', 'J2-Mission Making'],
    },

    // ── Uploads ───────────────────────────────────────────────────────────────

    uploads: {
        /**
         * Upload member bio/profile images.
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
        edit: ['J4-Administration'],

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
        editRestricted: ['J4-Administration'],

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
        editStandard: ['J4-Administration'],
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
        impersonate: ['J4-Administration'],

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
        manageOrbat: ['J4-Administration'],

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
        manageOrbatStructure: ['J4-Administration'],

        /**
         * ORBAT member assignment — assign or remove users from positions,
         * and manage the reservist list.
         *
         * Used by:
         *  - `app/admin/orbat/page.tsx` (`canManageMembers` flag)
         *  - `app/api/admin/orbat/[positionId]/route.ts` (member assign/unassign)
         *  - `app/api/admin/orbat/reservists/route.ts`
         */
        manageOrbatMembers: ['J4-Administration'],

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
        massImport: ['J4-Administration'],
    },

    // ── Optionals (mod list management) ──────────────────────────────────────

    optionals: {
        /**
         * Add or remove mods from the unit's optional mod master lists.
         *
         * Used by:
         *  - `app/optionals/manage/route.ts`
         *  - `app/optionals/me/route.ts` (sets `isAdmin` flag)
         */
        manage: ['J4-Administration'],
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
        manageStatus: ['J4-Administration'],
    },

    // ── Gallery ───────────────────────────────────────────────────────────────

    gallery: {
        /**
         * Manage the media gallery — create/delete folders, upload and remove
         * images, and set featured/Shot of the Month images.
         *
         * Used by:
         *  - `app/admin/gallery/page.tsx` (page gate)
         *  - `app/api/gallery/admin/folder/route.ts`
         *  - `app/api/gallery/admin/images/route.ts`
         *  - `app/api/gallery/admin/featured/route.ts`
         *  - `app/api/gallery/sotm/route.ts` (Shot of the Month — uses departmentLeads.j5)
         */
        manage: ['J5-Media'],
    },

    // ── Attendance ────────────────────────────────────────────────────────────

    attendance: {
        /**
         * Confirm member attendance after an operation has run.
         * Section leaders and All Staff use this to mark who attended.
         *
         * Used by:
         *  - `app/operations/[id]/page.tsx` (`isAllStaff` flag — shows confirm UI)
         *  - `app/api/operations/[id]/attendance/confirm/route.ts`
         *  - `app/api/operations/[id]/attendance/type/route.ts` (`isAllStaff` flag)
         */
        confirm: ['All Staff', 'HQ Staff'],
    },

    // ── Auth / integrations ───────────────────────────────────────────────────

    auth: {
        /**
         * Authorise access to the real-time collaborative operation editor
         * (Hocuspocus/Y.js WebSocket). Prevents non-J2 staff from connecting.
         *
         * Used by:
         *  - `app/api/auth/collab/route.ts`
         */
        collab: ['HQ Staff', 'J2-Mission Making'],
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
         * Used by:
         *  - `app/admin/j1/page.tsx` (`canManageMembers` flag)
         *  - `app/api/admin/tickets/route.ts` (department-membership ticket creation for J1)
         */
        j1: ['J1-Staff'],

        /**
         * J2 lead — can add/remove J2 members and manage department membership tickets.
         *
         * Used by:
         *  - `app/admin/j2/page.tsx` (`canManageMembers` flag)
         *  - `app/api/admin/tickets/route.ts` (department-membership ticket creation for J2)
         */
        j2: ['J2-Team Lead'],

        /**
         * J3 lead — can add/remove J3 members and manage department membership tickets.
         *
         * Used by:
         *  - `app/admin/j3/page.tsx` (`canManageMembers` flag)
         *  - `app/api/admin/tickets/route.ts` (department-membership ticket creation for J3)
         */
        j3: ['J3-Team Lead'],

        /**
         * J5 lead — can add/remove J5 members, manage department membership tickets,
         * and manage the Shot of the Month gallery feature.
         *
         * Used by:
         *  - `app/admin/j5/page.tsx` (`canManageMembers` flag)
         *  - `app/api/admin/tickets/route.ts` (department-membership ticket creation for J5)
         *  - `app/api/gallery/sotm/route.ts`
         */
        j5: ['J5-Media'],

        /**
         * J6 lead — can add/remove J6 members and manage department membership tickets.
         *
         * Used by:
         *  - `app/admin/j6/page.tsx` (`canManageMembers` flag)
         *  - `app/api/admin/tickets/route.ts` (department-membership ticket creation for J6)
         */
        j6: ['J6-Department Lead'],

        /**
         * J7 lead — can add/remove J7 members and manage department membership tickets.
         *
         * Used by:
         *  - `app/admin/j7/page.tsx` (`canManageMembers` flag)
         *  - `app/api/admin/tickets/route.ts` (department-membership ticket creation for J7)
         */
        j7: ['J7 Staff'],
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

    meetings: {
        lockJ1: ['J1-Staff'],
        lockJ2: ['J2-Team Lead'],
        lockJ3: ['J3-Team Lead'],
        lockJ4: ['J4-Administration'],
        lockJ5: ['J5-Media'],
        lockJ6: ['J6-Department Lead'],
        lockJ7: ['J7 Staff'],
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
        actionJ1: ['J1-Staff'],

        /**
         * Approve or reject J2 department tickets.
         * Department members (`departments.j2`) can view J2 tickets read-only.
         *
         * Used by:
         *  - `app/admin/unit/tickets/page.tsx` (`canActionJ2` + `canSeeJ2`)
         *  - `app/api/admin/tickets/[id]/route.ts` (PATCH auth check)
         */
        actionJ2: ['J2-Team Lead'],

        /**
         * Approve or reject J3 qualification and promotion tickets.
         * Department members (`departments.j3`) can view J3 tickets read-only.
         *
         * Used by:
         *  - `app/admin/unit/tickets/page.tsx` (`canActionJ3` + `canSeeJ3`)
         *  - `app/api/admin/tickets/[id]/route.ts` (PATCH auth check)
         */
        actionJ3: ['J3-Team Lead'],

        /**
         * Approve or reject J4 tickets — awards, discharges, and performance reports.
         * Note: J4-Administration bypasses all checks globally, so this is largely
         * redundant but kept for explicit clarity and consistency with other depts.
         *
         * Used by:
         *  - `app/admin/unit/tickets/page.tsx` (`canActionJ4` + `canSeeJ4`)
         *  - `app/api/admin/tickets/[id]/route.ts` (PATCH auth check)
         */
        actionJ4: ['J4-Administration'],

        /**
         * Approve or reject J6 department tickets.
         * Department members (`departments.j6`) can view J6 tickets read-only.
         *
         * Used by:
         *  - `app/admin/unit/tickets/page.tsx` (`canActionJ6` + `canSeeJ6`)
         *  - `app/api/admin/tickets/[id]/route.ts` (PATCH auth check)
         */
        actionJ6: ['J6-Department Lead'],

        /**
         * Approve or reject J7 department tickets.
         * Department members (`departments.j7`) can view J7 tickets read-only.
         *
         * Used by:
         *  - `app/admin/unit/tickets/page.tsx` (`canActionJ7` + `canSeeJ7`)
         *  - `app/api/admin/tickets/[id]/route.ts` (PATCH auth check)
         */
        actionJ7: ['J7 Staff'],

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
        actionDiscipline: ['J4-Administration'],
    },

} satisfies Record<string, Record<string, string[]>>

export default PERMISSIONS
