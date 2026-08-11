import Db from '@/lib/mongo'
import { ObjectId } from 'mongodb'

/**
 * Batch variant of hasDepartmentPermission: answers several keys for one
 * department in a single query pass. Identical semantics/grant sources;
 * hasDepartmentPermission stays the single-key entry point.
 */
export async function hasDepartmentPermissions(user: User, department: string, keys: string[]): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {}
    for (const key of keys) result[key] = false
    if (keys.length === 0) return result

    const override = process.env.OVERRIDE?.split(',') ?? []
    if (override.includes(user.id)) {
        for (const key of keys) result[key] = true
        return result
    }

    const isMember = (user.departments ?? []).includes(department)
    const subRoleIds = (user.departmentRoleIds ?? []).map(id => new ObjectId(String(id)))
    if (!isMember && subRoleIds.length === 0) return result

    const deptRoles = await Db.departmentRoles.find({
        department,
        $or: [
            ...(isMember ? [{ isBase: true }] : []),
            { _id: { $in: subRoleIds } },
        ],
    }).toArray()

    const granted = new Set<string>()
    for (const role of deptRoles) for (const key of role.permissions) granted.add(key)
    for (const key of keys) result[key] = granted.has(key)
    return result
}
