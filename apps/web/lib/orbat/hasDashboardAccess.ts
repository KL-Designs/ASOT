import Db from '@/lib/mongo'

/**
 * Dashboard access gate ("can this user open /dashboard at all"). Unlike
 * hasPermission(), this isn't a per-role granted permission key — it's
 * implicit for anyone with any real ORBAT/department standing at all, so no
 * one has to remember to add it to every role's permissions array. True if
 * the user's Discord ID is in the OVERRIDE env list, OR they belong to any
 * department, OR they hold any department sub-role, OR they hold any ORBAT
 * position with a role assigned (this already covers Reservists, whose
 * positions carry the seeded "Reservist" OrbatRole since the permission
 * system migration). Only someone with none of the above — no department,
 * no position, no reservist slot — is denied.
 */
export async function hasDashboardAccess(user: User): Promise<boolean> {
    const override = process.env.OVERRIDE?.split(',') ?? []
    if (override.includes(user.id)) return true

    if ((user.departments ?? []).length > 0) return true
    if ((user.departmentRoleIds ?? []).length > 0) return true

    const position = await Db.orbatPositions.findOne(
        { userId: user.id, roleId: { $ne: null } },
        { projection: { _id: 1 } }
    )
    return position !== null
}
