import type { ObjectId } from 'mongodb'


export { }

declare global {

    // A named collection of OrbatRoles that itself participates in the chain
    // of command as a single node — e.g. four HQ command roles grouped so
    // other roles can target "the group" as their parent instead of picking
    // one specific role within it. Grants no permissions of its own and has
    // no effect on hasPermission() — routing/escalation metadata only, same
    // as OrbatRole.parentRoleId/parentGroupId.
    interface OrbatRoleGroup {
        _id: ObjectId
        name: string
        memberRoleIds: ObjectId[]        // member Roles — display/reference only, never a hierarchy edge
        parentRoleId: ObjectId | null    // this group's own chain-of-command parent, if it escalates further
        parentGroupId: ObjectId | null   // mutually exclusive with parentRoleId
        createdAt: Date
        createdBy: string                // Discord ID
        createdByName: string
    }

}
