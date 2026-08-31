// Plain department-code list — deliberately dependency-free (no Db/Mongo
// imports) so client components can safely import it. Server code that also
// needs Discord role-name mappings per department should use DEPT_ROLES in
// dept-roles.ts instead (never import that file from a 'use client' module —
// it pulls in the full mongodb driver via Db, which breaks client bundling).
export const DEPT_CODES = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7'] as const

export type LeadershipSlot = 'leader' | '2ic' | '3ic'

// Leadership position labels per department: [Leader slot, 2IC slot, 3IC
// slot]. An empty string means that department has no such position (e.g.
// J4 has only a Department Leader, no 2IC/3IC). Shared by DeptMembersTab.tsx
// (renders the Leadership card + derives who holds each slot),
// DepartmentRolesTab.tsx (the "Linked Position" picker), and the
// department-roles PATCH route (server-side validation) — dependency-free
// so all three can import it safely. The standalone migration script
// (scripts/migrate-department-leadership.mjs) duplicates this table since
// it can't import TS/Next.js modules — keep both in sync if this changes.
export const DEPT_LEADERSHIP_POSITIONS: Record<string, [string, string, string]> = {
    j1: ['Department Leader', 'Head Recruiter',        'Recruiter Trainer'],
    j2: ['Department Leader', 'Team Leader',            'Creator Trainer'],
    j3: ['Department Leader', 'Head Trainer',           'Assistant Head Trainer'],
    j4: ['Department Leader', '',                       ''],
    j5: ['Department Leader', 'Team Leader',            'Lead Content Creator'],
    j6: ['Department Leader', 'Team Leader',            'Assistant Team Leader'],
    j7: ['Department Leader', 'Team Leader',            'Assistant Team Leader'],
}

export const LEADERSHIP_SLOT_INDEX: Record<LeadershipSlot, 0 | 1 | 2> = { leader: 0, '2ic': 1, '3ic': 2 }

/**
 * Pseudo-departments: entries that live in the department-roles catalog and
 * are edited through the same Departments tab, but are not real departments.
 * Deliberately NOT part of `DEPT_CODES` — that list drives department
 * membership sync, the ORBAT's DeptMembersTab, ticket routing and leadership
 * slots, none of which have any meaning here, and all of which would quietly
 * gain a phantom eighth department if this were folded in.
 *
 * `members` holds one permanent base role whose grants apply to everyone
 * currently in the ORBAT — callsign holders and reservists alike, active and
 * inactive. Nobody is ever *assigned* it (there are no sub-roles under it);
 * `hasPermission`/`hasPermissions` resolve it from the ORBAT position itself.
 */
export const MEMBERS_DEPT = 'members'

export const PSEUDO_DEPT_CODES = [MEMBERS_DEPT] as const

/** Display label for a pseudo-department's section in the Departments tab. */
export const PSEUDO_DEPT_LABELS: Record<string, string> = { [MEMBERS_DEPT]: 'MEMBERS' }
