import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { addGuildRole, removeGuildRole } from '@/lib/discord/bot'
import { applyTsServerGroups } from '@/lib/teamspeak/groups'
import { logAction } from '@/lib/logAction'

// ── POST /api/admin/department-roles/assign ────────────────────────────────
// Body: { targetUserId, roleId, action: 'add'|'remove' }
// Toggles a sub-role on a specific member and applies the real Discord/
// TeamSpeak grant or revoke. Never touches base roles (rejected 400).

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { targetUserId, roleId, action } = body
    if (!targetUserId || typeof roleId !== 'string' || (action !== 'add' && action !== 'remove')) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    let objectId: ObjectId
    try { objectId = new ObjectId(roleId) } catch { return NextResponse.json({ error: 'Invalid roleId' }, { status: 400 }) }

    const role = await Db.departmentRoles.findOne({ _id: objectId })
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    if (role.isBase) return NextResponse.json({ error: 'Base department roles are implicit and cannot be assigned directly' }, { status: 400 })

    const leadRoles = PERMISSIONS.departmentLeads[role.department as keyof typeof PERMISSIONS.departmentLeads]
    const isDeptLead = leadRoles ? client.hasRoles(me, leadRoles) : false
    const isManager = client.hasRoles(me, PERMISSIONS.admin.manageDepartmentRoles)
    if (!isDeptLead && !isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (action === 'add') {
        await Db.users.updateOne({ id: targetUserId }, { $addToSet: { departmentRoleIds: objectId } })
    } else {
        await Db.users.updateOne({ id: targetUserId }, { $pull: { departmentRoleIds: objectId } })
    }

    const grantFn = action === 'add' ? addGuildRole : removeGuildRole
    Promise.allSettled([
        ...role.discordRoleIds.map(id => grantFn(targetUserId, id)),
        applyTsServerGroups(targetUserId, action, role.tsGroupIds),
    ]).catch(err => console.error('[department-roles/assign] sync failed:', err))

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: action === 'add' ? 'orbat.assign_department_role' : 'orbat.unassign_department_role',
        category: 'orbat',
        performedBy: me.id,
        performedByName,
        target: `${role.name} (${role.department}) → ${targetUserId}`,
        details: { targetUserId, roleId: String(objectId), department: role.department, roleName: role.name },
    })

    return NextResponse.json({ success: true })
}
