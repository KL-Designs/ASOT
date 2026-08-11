import Db from '@/lib/mongo'
import { ObjectId } from 'mongodb'

/**
 * Department-scoped permission check: true if the user's Discord ID is in
 * the OVERRIDE env list (the only hard bypass), OR the user holds a
 * DepartmentRole scoped to `department` (their base role, if they're an
 * actual member of that department, or any sub-role they're explicitly
 * assigned) whose `permissions` includes `key`. Deliberately does NOT
 * consult ORBAT position roles (hasPermission.ts does) — those aren't
 * department-scoped, and including them would defeat the point of this
 * check: a key like 'deptLinks.manage' must only grant rights over the
 * one department whose role actually carries it.
 */
export async function hasDepartmentPermission(user: User, department: string, key: string): Promise<boolean> {
    const override = process.env.OVERRIDE?.split(',') ?? []
    if (override.includes(user.id)) return true

    const isMember = (user.departments ?? []).includes(department)
    // Re-materialize through this file's own ObjectId import — the shared
    // types/user.d.ts (monorepo root) resolves ObjectId from a different
    // physical bson install than apps/web's, so TS treats them as distinct
    // nominal types even though they're runtime-identical (same 24-char hex).
    const subRoleIds = (user.departmentRoleIds ?? []).map(id => new ObjectId(String(id)))
    if (!isMember && subRoleIds.length === 0) return false

    const deptRoles = await Db.departmentRoles.find({
        department,
        $or: [
            ...(isMember ? [{ isBase: true }] : []),
            { _id: { $in: subRoleIds } },
        ],
    }).toArray()

    return deptRoles.some(role => role.permissions.includes(key))
}
