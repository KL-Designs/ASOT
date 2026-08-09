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
        parentRoleId: ObjectId | null   // chain-of-command parent Role; null = top of chain / unset.
                                         // Routing/escalation metadata only — never consulted for
                                         // permission checks, and never implies permission inheritance.
        createdAt: Date
        createdBy: string           // Discord ID
        createdByName: string
    }

}
