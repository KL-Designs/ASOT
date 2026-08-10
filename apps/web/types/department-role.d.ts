import type { ObjectId } from 'mongodb'


export { }

declare global {

    // A role within a department (J1-J7) catalog, parallel to OrbatRole but
    // scoped by department instead of ORBAT category. Exactly one "base" role
    // per department is seeded automatically (fixed identity — can't be
    // created, renamed, or deleted) and applies implicitly to every member of
    // that department via User.departments. Additional "sub" roles are
    // created freely by admins, scoped to one department, and explicitly
    // assigned to specific members via User.departmentRoleIds.
    interface DepartmentRole {
        _id: ObjectId
        department: string           // 'j1'..'j7' — see lib/discord/dept-roles.ts's DEPT_ROLES for the valid set
        name: string
        isBase: boolean              // true only for the 7 seeded base roles
        discordRoleIds: string[]     // same shape/handling as OrbatRole.discordRoleIds
        tsGroupIds: number[]         // same shape/handling as OrbatRole.tsGroupIds
        permissions: string[]        // granted permission keys — see lib/permissions-catalog.ts
        createdAt: Date
        createdBy: string            // Discord ID
        createdByName: string
    }

}
